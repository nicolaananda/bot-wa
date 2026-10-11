// Run with node tests/zoom-static-qris.check.js; no app boot, network or database.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.js'), 'utf8')
const start = source.indexOf('const priceInfo = zoomPricing.calculatePrice(', source.indexOf('// ====== QRIS PATH ======'))
const end = source.indexOf('// ====== SALDO PATH (existing) ======', start)
const body = source.slice(start, end).replace(/\}\s*$/, '')
async function run(options = {}) {
  const calls = [], saved = [], polls = []
  const db = { data: { order: {}, zoomFlow: { user: {} } }, saveOrders: async () => {
    calls.push('save'); saved.push(JSON.parse(JSON.stringify(db.data.order)))
    if (options.saveThrows) throw Error('save failed')
    return !options.saveFails
  } }
  class Clock extends Date { static now() { return Date.now() + (options.advance || 0) } }
  const sandbox = {
    Date: Clock,
    db, sender: 'user', from: 'chat', prefix: '#', m: {}, tier: 100,
    parsed: { durationMinutes: 60, timezone: 'Asia/Jakarta', topic: 'fixture' }, startUtcMs: 0,
    zoomPricing: { calculatePrice: () => ({ price: 6000, breakdown: '1 hour' }) },
    zoomPool: { findFirstAvailableHost: async () => ({ ok: true, host: {} }) },
    acquireLock: async () => true, releaseLock: async () => calls.push('unlock'),
    clearDeliveredPending: async () => false, crypto: { randomBytes: () => Buffer.from('abcde') },
    reply: async () => {}, toMs: () => 1800000, pg: {},
    p0Store: options.noStore ? null : {
      allocateStaticPayment: async (input) => {
        calls.push('allocate'); assert.equal(input.baseAmount, 6000)
        if (options.allocateFails) throw Error('allocation failed')
        return { amount: 6042, marker: 'fixture-marker', expires_at: new Date(Date.now() + 1800000).toISOString() }
      },
      persistPaymentCorrelation: async () => calls.push('wrong-correlation'),
      cancelOrder: async (id, state) => {
        calls.push(`cancel:${state}`)
        if (options.duringCancel) options.duringCancel(db)
        return options.cancelFails ? false : true
      },
    },
    qrisDinamis: async amount => { calls.push('qr'); assert.equal(amount, '6042'); if (options.qrFails) throw Error('QR failed'); return 'qr' },
    createQrisCard: async () => 'image',
    nicola: { sendMessage: async (to, payload) => {
      if (payload.image) {
        calls.push('send')
        assert.equal(saved[0].user.staticPaymentMarker, 'fixture-marker')
        if (options.duringSend) options.duringSend(db)
        if (options.sendFails) throw Error('send failed')
      }
      return { key: 'message-key' }
    } },
    requestPendingOrderSave: () => calls.push('request-save'),
    sleep: () => new Promise(resolve => polls.push(resolve)),
    console: { log() {}, error() {} },
  }
  let error
  try { await vm.runInNewContext(`(async () => { ${body} })()`, sandbox) } catch (e) { error = e }
  return { db, calls, saved, polls, error }
}
;(async () => {
  const result = await run()
  assert.ifError(result.error)
  assert.equal(result.db.data.order.user.staticPaymentMarker, 'fixture-marker')
  assert.equal(result.db.data.order.user.totalAmount, 6042)
  assert.deepEqual(result.calls.slice(0, 4), ['allocate', 'save', 'qr', 'send'])
  assert(!result.calls.includes('wrong-correlation'))
  console.log('PASS Zoom caller: durable allocation and marker before QR, preserved after send')
  for (const option of ['saveFails', 'saveThrows', 'qrFails']) {
    const failed = await run({ [option]: true })
    assert(failed.calls.includes('cancel:cancelled'), `${option}: cancel allocation`)
    assert(!failed.calls.includes('send'), `${option}: no QR exposure`)
    assert.equal(failed.db.data.order.user, undefined)
  }
  for (const option of ['noStore', 'allocateFails']) {
    const failed = await run({ [option]: true })
    assert(failed.error)
    assert(!failed.calls.includes('qr'))
  }
  const uncertain = await run({ sendFails: true })
  assert(uncertain.error)
  assert.equal(uncertain.db.data.order.user.staticPaymentMarker, 'fixture-marker')
  assert(!uncertain.calls.includes('cancel:cancelled'), 'ambiguous send must remain payable')
  const racing = await run({ duringSend: db => { delete db.data.order.user } })
  assert.equal(racing.db.data.order.user, undefined, 'do not resurrect settled order')
  const changed = await run({ duringSend: db => { db.data.order.user.status = 'processing' } })
  assert.equal(changed.db.data.order.user.status, 'processing')
  const failedCancel = await run({ qrFails: true, cancelFails: true })
  assert(failedCancel.db.data.order.user, 'retain context if cancellation refused')
  result.db.data.order.user = { orderId: 'replacement', status: 'awaiting_payment' }
  result.polls[0]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(result.polls.length, 1, 'old timer must stop on replacement')
  assert(!result.calls.includes('cancel:expired'))
  const raceClock = { duringCancel: db => { db.data.order.user = { orderId: 'new-order' } } }
  const cancelRace = await run(raceClock)
  raceClock.advance = 1800001
  cancelRace.polls[0]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cancelRace.db.data.order.user?.orderId, 'new-order', 'expiry must preserve replacement during cancellation')
  for (const cancelFails of [false, true]) {
    const clock = { cancelFails }
    const timed = await run(clock)
    clock.advance = 1800001
    timed.polls[0]()
    await new Promise(resolve => setImmediate(resolve))
    assert(timed.calls.includes('cancel:expired'))
    assert.equal(!!timed.db.data.order.user, cancelFails)
  }
  console.log('PASS failure cleanup, unavailable store, uncertain send, settlement race, replacement timer, expiry and refused expiry')
})().catch(error => { console.error(error); process.exitCode = 1 })
