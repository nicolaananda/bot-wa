jest.mock('../../config/postgres', () => ({ pool: {} }));
const fs = require('fs');
const { migrate, LOCK_KEY } = require('../../options/migrate');
const {
  transaction, createQrisAfterPersist, debitSaldoReserveStock, runDeliveryOutboxOnce,
  cancelOrder, queueFulfillmentDeliveries, assertSchemaReady, claimFulfillment,
  claimZoomCreate, finishZoomCreate, confirmPaidOrder,
} = require('../../lib/p0-store');

function fakeDb(responses = []) {
  const calls = [];
  const client = { query: jest.fn(async (sql, params) => {
    calls.push([sql, params]);
    return responses.shift() || { rows: [] };
  }), release: jest.fn() };
  return { connect: jest.fn(async () => client), client, calls };
}

test('transaction rolls back and releases on failure', async () => {
  const db = fakeDb();
  await expect(transaction(async () => { throw new Error('stop'); }, db)).rejects.toThrow('stop');
  expect(db.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
  expect(db.client.release).toHaveBeenCalled();
});

test('payment correlation commits before QR creation', async () => {
  const db = fakeDb([{ rows: [] }, { rows: [{ order_id: 'o1' }] }, { rows: [{ provider_order_id: 'p1' }] }, { rows: [] }]);
  const createQris = jest.fn(async () => 'qr');
  await expect(createQrisAfterPersist({ providerOrderId:'p1', kind:'order', subjectId:'o1', userId:'u1', amount:1 }, createQris, db)).resolves.toBe('qr');
  expect(db.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
  expect(createQris).toHaveBeenCalledTimes(1);
});

test('verified exact payment transitions awaiting order and rejects mismatch', async () => {
  const ok = fakeDb([{rows:[]}, {rows:[{order_id:'o1'}]}, {rows:[]}]);
  await expect(confirmPaidOrder({providerOrderId:'p1',orderId:'o1',userId:'u1',amount:100}, ok)).resolves.toEqual({order_id:'o1'});
  expect(ok.calls[1][0]).toMatch(/payment_correlations[\s\S]*status='awaiting_payment'/);
  const bad = fakeDb([{rows:[]}, {rows:[]}, {rows:[]}, {rows:[]}]);
  await expect(confirmPaidOrder({providerOrderId:'p2',orderId:'o1',userId:'u1',amount:100}, bad)).resolves.toBeNull();
});

test('saldo debit and stock reservation use one transaction', async () => {
  const db = fakeDb([{ rows: [] }, { rows: [{ new_saldo: '9', new_stock: 1 }] }]);
  await debitSaldoReserveStock({ orderId:'o1', userId:'u', productId:'p', quantity:1, amount:1 }, db);
  expect(db.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(['BEGIN', 'SELECT', 'COMMIT']);
});

test('delivery outbox atomically claims, sends and completes', async () => {
  const delivery = { id: 7, order_id: 'o1', destination: 'u1', payload: { text: 'secret' }, claim_token: 't1' };
  const db = fakeDb([
    { rows: [] }, { rows: [delivery] }, { rows: [] },
    { rows: [] }, { rows: [{ order_id: 'o1' }] }, { rows: [] }, { rows: [] },
  ]);
  const send = jest.fn(async () => {});
  await expect(runDeliveryOutboxOnce(send, db)).resolves.toBe(true);
  expect(send).toHaveBeenCalledWith('u1', { text: 'secret' });
  expect(db.calls.some(([sql]) => sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
  expect(db.calls.some(([sql]) => sql.includes("status='completed'"))).toBe(true);
});

test('ambiguous delivery failure requires reconciliation without logging payload', async () => {
  const delivery = { id: 7, destination: 'u1', payload: { text: 'secret' }, claim_token: 't1' };
  const db = fakeDb([{ rows: [] }, { rows: [delivery] }, { rows: [] }, { rows: [] }, { rows: [] }]);
  await expect(runDeliveryOutboxOnce(async () => { throw new Error('temporary'); }, db)).resolves.toBe(true);
  const retry = db.calls.find(([sql]) => sql.includes('WHERE id=$1 AND claim_token=$2'));
  expect(retry[1]).toEqual([7, 't1', 'manual_review', 'ambiguous']);
  expect(retry[0]).toContain('error_class=$4');
  expect(JSON.stringify(db.calls)).not.toContain('secret');
});

test('cancellation is one transactional status transition', async () => {
  const db = fakeDb([{rows:[]}, { rowCount: 1, rows: [{order_id:'o1'}] }, {rows:[]}]);
  await expect(cancelOrder('o1', 'cancelled', db)).resolves.toBe(true);
  expect(db.calls.find(([sql]) => sql.includes('UPDATE business_orders'))[0]).toMatch(/status IN \('awaiting_payment','pending','cancelled','expired'\)/);
  const sql = db.calls.find(([sql]) => sql.includes('UPDATE business_orders'))[0];
  expect(sql).toContain("THEN status ELSE $2 END");
  expect(sql).not.toMatch(/'processing'|'completed'|'delivery_pending'/);
});

test('fulfillment claim shares business-order lock and permits processing recovery', async () => {
  const db = fakeDb([{rows:[]}, {rows:[{status:'processing'}]}, {rows:[{order_id:'o1'}]}, {rows:[]}]);
  await expect(claimFulfillment('o1', db)).resolves.toMatchObject({order_id:'o1'});
  expect(db.calls[1][0]).toMatch(/business_orders.*FOR UPDATE/s);
  expect(db.calls.filter(([sql]) => sql.includes('UPDATE business_orders'))).toHaveLength(0);
});

test('fulfillment claim accepts saldo delivery_pending from atomic reservation', async () => {
  const db = fakeDb([{rows:[]}, {rows:[{status:'delivery_pending'}]}, {rows:[{order_id:'o1'}]}, {rows:[]}]);
  await expect(claimFulfillment('o1', db)).resolves.toMatchObject({order_id:'o1'});
  expect(db.calls[1][0]).toMatch(/business_orders.*FOR UPDATE/s);
  expect(db.calls.filter(([sql]) => sql.includes('UPDATE business_orders'))).toHaveLength(0);
});

test('startup schema gate rejects missing migration', async () => {
  const db = { query: jest.fn(async () => ({ rows: [] })) };
  await expect(assertSchemaReady(db)).rejects.toThrow('001_p0_durability.sql');
});

test('saldo delivery queues one deduplicated outbox item', async () => {
  const db = fakeDb([{ rows: [] }, { rows: [{ id: 1 }] }, { rows: [] }, { rows: [] }]);
  await queueFulfillmentDeliveries('SALDO-r1', [{ destination: 'u1', payload: { text: 'credential' }, dedupeKey: 'SALDO-r1:account' }], db);
  const insert = db.calls.find(([sql]) => sql.includes('INSERT INTO delivery_outbox'));
  expect(insert[0]).toMatch(/ON CONFLICT \(dedupe_key\) DO NOTHING/);
  expect(insert[1][3]).toBe('SALDO-r1:account');
});

test('Zoom create claim durably owns order and actual host before POST', async () => {
  const row = { order_id: 'z1', claim_token: 'token', status: 'creating', host_id: 'host-b' };
  const db = { query: jest.fn(async () => ({ rows: [row] })) };
  await expect(claimZoomCreate({ orderId:'z1', userId:'u1', hostId:'host-b', startsAt:new Date(), endsAt:new Date(Date.now()+60000), capacity:1, amount:1000 }, db)).resolves.toEqual(row);
  expect(db.query.mock.calls[0][0]).toContain('claim_zoom_create');
  expect(db.query.mock.calls[0][1].slice(0, 3)).toEqual(['z1', 'u1', 'host-b']);
  expect(db.query.mock.calls[0][1][7]).toBe(1000);
});

test('Zoom completion is token guarded and replay returns stored meeting', async () => {
  const existing = { order_id:'z1', status:'created', meeting:{ id:'m1' } };
  const db = fakeDb([{rows:[]}, {rows:[existing]}, {rows:[]}, {rows:[]}]);
  await expect(finishZoomCreate('z1', 'token', { id:'m1' }, db)).resolves.toEqual(existing);
  expect(db.calls[1][0]).toMatch(/claim_token=\$2.*status='creating'/s);
});

test('ambiguous Zoom POST moves claim to manual review', async () => {
  const db = fakeDb([{rows:[]}, {rows:[{ order_id:'z1', status:'manual_review' }]}, {rows:[]}, {rows:[]}]);
  await finishZoomCreate('z1', 'token', null, db, { ambiguous:true, error:new Error('timeout') });
  const [sql, params] = db.calls[1];
  expect(sql).toContain("status='manual_review'");
  expect(params[3]).toBe('timeout');
});

test('processed Zoom retry uses outbox contract rather than fulfillment creation', () => {
  const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8');
  const start = source.indexOf('if (order.processed)');
  const retry = source.slice(start, source.indexOf("require('./lib/zoom-pool')", start));
  expect(retry).toMatch(/queueFulfillmentDeliveries/);
  expect(retry).not.toMatch(/createMeetingOnHost/);
});

test('PG delivery paths return after queueing and do not direct-send', () => {
  const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8');
  expect(source).toMatch(/queueFulfillmentDeliveries\(\s*orderId,[\s\S]*?zoom-invite[\s\S]*?return\n\s*}\n\s*const deliveryClient/);
  expect(source).toMatch(/dedupeKey: `\$\{orderId}:account`[\s\S]*?return\n\s*}\n\s*const deliveryClient/);
});

test('migration runner locks, records version, unlocks and releases', async () => {
  const db = fakeDb([{ rows:[] }, { rows:[] }, { rows:[] }]);
  const dir = fs.mkdtempSync('/tmp/p0-migrations-');
  fs.writeFileSync(`${dir}/001.sql`, 'SELECT 1');
  await expect(migrate(db, dir)).resolves.toEqual(['001.sql']);
  expect(db.calls[0]).toEqual(['SELECT pg_advisory_lock($1)', [LOCK_KEY]]);
  expect(db.calls.some(([sql]) => sql.startsWith('INSERT INTO schema_migrations'))).toBe(true);
  expect(db.calls.at(-1)).toEqual(['SELECT pg_advisory_unlock($1)', [LOCK_KEY]]);
  expect(db.client.release).toHaveBeenCalled();
});

test('migration defines durable constraints without stock payload logging', () => {
  const sql = fs.readFileSync(require.resolve('../../migrations/001_p0_durability.sql'), 'utf8');
  expect(sql).toMatch(/order_fulfillments/);
  expect(sql).toMatch(/delivery_outbox/);
  expect(sql).toMatch(/reserve_zoom_booking/);
  expect(sql).toMatch(/protect_fulfillment_terminal_state/);
  expect(sql).toMatch(/debit_saldo_reserve_stock/);
  expect(sql).not.toMatch(/RAISE NOTICE/);
});


test('static settlement rejects unsigned and non-integer events before DB access', async () => {
  const { claimStaticSettlement } = require('../../lib/p0-store');
  const db={connect:jest.fn()};
  expect(await claimStaticSettlement({eventKey:'e',amount:100,authenticated:false},db)).toBeNull();
  expect(await claimStaticSettlement({eventKey:'e',amount:100.5,authenticated:true},db)).toBeNull();
  expect(db.connect).not.toHaveBeenCalled();
});

test('static payment SQL guards collisions, marker, bounds, and unique event binding', () => {
  const fs=require('fs'), path=require('path');
  const store=fs.readFileSync(path.join(__dirname,'../../lib/p0-store.js'),'utf8');
  const migration=fs.readFileSync(path.join(__dirname,'../../migrations/006_static_qris_matching.sql'),'utf8');
  expect(store).toMatch(/UNION ALL SELECT 1 FROM static_payment_orders/);
  expect(store).toMatch(/candidates\.rows\.length !== 1/);
  expect(store).toMatch(/expires_at>=now\(\)/);
  expect(store).toMatch(/created_at AS received_at/);
  expect(store).toMatch(/event\.received_at/);
  expect(migration).toMatch(/marker UUID NOT NULL UNIQUE/);
  expect(migration).toMatch(/settlement_event_key TEXT UNIQUE/);
  expect(migration).toMatch(/static_payment_active_amount_unique/);
});
