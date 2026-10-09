const { planLegacyRows, backfillLegacyPending, assertBackfillReady } = require('../../options/backfill-legacy-pending')

function fixture() {
  return {
    order: {
      '628111111111@s.whatsapp.net': { orderId: 'QRIS-A', reffId: 'REF-A', totalAmount: 10001, status: 'paid', fulfillmentReservation: ['secret'] },
    },
    orderDeposit: {
      '628222222222@s.whatsapp.net': { orderId: 'DEP-B', reffId: 'REF-B', totalAmount: 50023, status: 'processing' },
    },
  }
}

function quarantineFixture() {
  const clean = fixture()
  clean.order.missing = { status: 'processing', totalAmount: 9 }
  return clean
}

function fakeDb({ conflict = false, pgNumeric = false } = {}) {
  const state = { orders: new Map(), correlations: new Map(), checkpoints: new Map(), writes: 0, rollbacks: 0 }
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql === 'ROLLBACK') { state.rollbacks++; return { rows: [] } }
      if (sql.includes('FROM business_orders') && sql.includes('FOR UPDATE')) {
        const row = state.orders.get(params[0]); return { rows: row ? [{ ...row, amount:pgNumeric ? Number(row.amount).toFixed(2) : row.amount }] : [] }
      }
      if (sql.includes('FROM payment_correlations') && sql.includes('FOR UPDATE')) {
        const row = state.correlations.get(params[0]); return { rows: row ? [{ ...row, amount:pgNumeric ? Number(row.amount).toFixed(2) : row.amount }] : [] }
      }
      if (sql.startsWith('INSERT INTO business_orders')) { state.writes++; state.orders.set(params[0], { order_id:params[0], kind:params[1], user_id:params[2], amount:params[3], status:params[4], provider_order_id:params[5] }); return { rowCount:1, rows:[] } }
      if (sql.startsWith('INSERT INTO payment_correlations')) { state.writes++; state.correlations.set(params[0], { provider_order_id:params[0], kind:params[1], subject_id:params[2], user_id:params[3], amount:params[4] }); return { rowCount:1, rows:[] } }
      if (sql.startsWith('INSERT INTO legacy_pending_backfill_runs')) { state.writes++; state.checkpoints.set(params[0], params[1]); return { rowCount:1, rows:[] } }
      if (sql.startsWith('INSERT INTO legacy_pending_backfill')) { state.writes++; state.checkpoints.set(`${params[0]}:${params[1]}`, params[3]); return { rowCount:1, rows:[] } }
      if (sql.includes('information_schema')) return { rows: [{ ok: true }] }
      throw new Error(`unexpected SQL ${sql.slice(0, 30)}`)
    }, release() {},
  }
  if (conflict) state.orders.set('QRIS-A', { order_id:'QRIS-A', kind:'deposit', user_id:'other', amount:'1', status:'processing', provider_order_id:'QRIS-A' })
  return { state, connect: async () => client }
}

test('real legacy formats plan exact IDs and quarantine missing identity', () => {
  const plan = planLegacyRows(quarantineFixture())
  expect(plan.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ legacyKind:'order', providerOrderId:'QRIS-A', subjectId:'QRIS-A', userId:'628111111111@s.whatsapp.net', amount:10001, status:'processing' }),
    expect.objectContaining({ legacyKind:'orderDeposit', providerOrderId:'DEP-B', subjectId:'DEP-B', kind:'deposit', amount:50023 }),
  ]))
  expect(plan.quarantined).toHaveLength(1)
})

test('dry run is default and does not mutate', async () => {
  const db = fakeDb(); const result = await backfillLegacyPending({ db, legacy:quarantineFixture() })
  expect(result).toMatchObject({ dryRun:true, eligible:2, quarantined:1 })
  expect(db.state.writes).toBe(0)
})

test('apply rejects unknown rows without writes', async () => {
  const db = fakeDb()
  await expect(backfillLegacyPending({ db, legacy:quarantineFixture(), apply:true })).rejects.toThrow('unknown')
  expect(db.state.writes).toBe(0)
})

test('apply is idempotent and preserves paid order correlation', async () => {
  const db = fakeDb()
  const first = await backfillLegacyPending({ db, legacy:fixture(), apply:true })
  const second = await backfillLegacyPending({ db, legacy:fixture(), apply:true })
  expect(first.imported).toBe(2); expect(second.existing).toBe(2)
  expect(db.state.orders.get('QRIS-A').status).toBe('processing')
  expect(db.state.correlations.get('QRIS-A').subject_id).toBe('QRIS-A')
})

test('apply restart is idempotent with PostgreSQL numeric strings', async () => {
  const db = fakeDb({ pgNumeric:true })
  await backfillLegacyPending({ db, legacy:fixture(), apply:true })
  const restarted = await backfillLegacyPending({ db, legacy:fixture(), apply:true })
  expect(restarted).toMatchObject({ imported:0, existing:2 })
})

test('identity conflict rolls back its batch without overwrite', async () => {
  const db = fakeDb({ conflict:true })
  await expect(backfillLegacyPending({ db, legacy:fixture(), apply:true, batchSize:2 })).rejects.toThrow('identity conflict')
  expect(db.state.rollbacks).toBe(1)
  expect(db.state.orders.get('QRIS-A').user_id).toBe('other')
  expect(db.state.correlations.size).toBe(0)
})

test('readiness blocks missing structure', async () => {
  const db = { query: jest.fn().mockResolvedValueOnce({ rows:[{ ready:false }] }) }
  await expect(assertBackfillReady({ db, legacy:{} })).rejects.toThrow('schema structure')
})

test('empty legacy is safe without a checkpoint', async () => {
  const db = { query: jest.fn().mockResolvedValueOnce({ rows:[{ ready:true }] }) }
  await expect(assertBackfillReady({ db, legacy:{ order:{}, orderDeposit:{} } })).resolves.toBe(true)
})

test('unrepresented legacy row blocks', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rows:[{ ready:true }] })
    .mockResolvedValueOnce({ rows:[] }) }
  await expect(assertBackfillReady({ db, legacy:{ order:{ u:{ orderId:'A', totalAmount:1 } } } })).rejects.toThrow('not represented')
})

test('represented new legacy order permits restart without obsolete fingerprint', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rows:[{ ready:true }] })
    .mockResolvedValueOnce({ rows:[{ ok:true }] }) }
  await expect(assertBackfillReady({ db, legacy:{ order:{ u:{ orderId:'A', totalAmount:1 } } } })).resolves.toBe(true)
})


test('static QR rows with no provider identity do not enter legacy provider backfill', () => {
  const { rows, quarantined } = planLegacyRows({ order:{ u:{ orderId:'MID-static', totalAmount:10001, staticPaymentMarker:'00000000-0000-4000-8000-000000000001' } } })
  expect(rows).toEqual([])
  expect(quarantined).toEqual([])
})
