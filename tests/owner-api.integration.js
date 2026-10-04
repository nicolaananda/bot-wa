const assert = require('assert')
const express = require('express')
const http = require('http')
const mount = require('../options/owner-api')

process.env.OWNER_API_OWNERS = '628123456789'
process.env.OWNER_API_SECRET = 'test-secret'
process.env.OWNER_SESSION_SECRET = 'session-secret-at-least-for-tests'
process.env.OWNER_API_ORIGINS = 'https://owner.test'

function mockPg() {
  const state = { saldo: 100, ledger: new Map(), queries: [], rollbacks: 0 }
  const query = async (sql, params = []) => {
    state.queries.push({ sql, params })
    if (/SELECT before_balance/.test(sql)) { const x = state.ledger.get(params[0]); return { rowCount: x ? 1 : 0, rows: x ? [x] : [] } }
    if (/SELECT saldo FROM users/.test(sql)) return { rowCount: 1, rows: [{ saldo: state.saldo }] }
    if (/UPDATE users SET saldo/.test(sql)) { state.saldo = params[1]; return { rowCount: 1, rows: [] } }
    if (/INSERT INTO saldo_history/.test(sql)) { state.ledger.set(params[0], { action: params[2], amount: params[3], before_balance: params[4], after_balance: params[5] }); return { rowCount: 1, rows: [] } }
    if (/SELECT user_id,saldo/.test(sql)) return { rowCount: 1, rows: [{ user_id: params[0], saldo: state.saldo, role: 'bronze', data: { pin: 'secret' } }] }
    if (/otp_orders/.test(sql)) return { rows: [] }
    return { rowCount: 1, rows: [] }
  }
  return { state, query, getClient: async () => ({ query: async (sql, params) => { if (sql === 'ROLLBACK') state.rollbacks++; return query(sql, params) }, release() {} }) }
}

async function run() {
  const pg = mockPg(); const audits = []
  const db = { data: { users: { '628000000001@s.whatsapp.net': { saldo: 10, role: 'bronze', pin: '9876' } }, produk: {}, transaksi: [{ ref_id: 'TX1', user_id: '628000000001', status: 'paid', meta: { totalBayar: '10', token: 'SECRET', otp: '123456' } }, { ref_id: 'TX2', user_id: '628000000001', meta: { price: '20', jumlah: '2' } }, { ref_id: 'TX3', user_id: '628000000001', status: 'completed', meta: { totalBayar: '30' } }, { ref_id: 'TX4', user_id: '628000000001', status: 'failed', meta: { totalBayar: '5' } }] }, async load() {} }
  const zoom = { VALID_TIERS: [100], isValidTier: n => n === 100, loadPool: () => [], listBookings: async () => ({ meetings: [], errors: [], source: 'mock' }) }
  const app = express(); app.use(express.json({ limit: '64kb', verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer) } })); mount(app, { pg, usePg: true, getDbInstance: async () => db, zoom, collectHealth: async () => ({ ok: true }), anomalyReport: async () => [], audit: async x => audits.push(x), listAudit: async () => audits }); app.use((err, req, res, next) => res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }))
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, options = {}) { const r = await fetch(base + path, options); return { status: r.status, headers: r.headers, body: await r.json() } }
  try {
    assert.equal((await request('/api/owner/v1/users', { headers: { origin: 'https://owner.test' } })).status, 401)
    assert.equal((await request('/api/owner/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' }, body: JSON.stringify({ owner: '628123456789', secret: 'test-secret' }) })).status, 403)
    assert.equal((await request('/api/owner/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://owner.test' }, body: '{"owner":"628123456789","secret":"wrong"}' })).status, 401)
    const login = await request('/api/owner/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://owner.test' }, body: JSON.stringify({ owner: '628123456789', secret: 'test-secret' }) }); assert.equal(login.status, 200)
    const cookies = login.headers.getSetCookie().map(x => x.split(';')[0]).join('; '); const csrf = login.body.data.csrfToken
    assert.equal((await request('/api/owner/v1/users', { headers: { cookie: 'botwa_owner=%ZZ', origin: 'https://owner.test' } })).status, 401)
    assert.equal((await request('/api/owner/v1/users/628000000001/balance-adjustments', { method: 'POST', headers: { cookie: cookies, origin: 'https://owner.test', 'content-type': 'application/json' }, body: '{}' })).status, 403)
    const me = await request('/api/owner/v1/auth/me', { headers: { cookie: cookies, origin: 'https://owner.test' } }); assert.equal(me.body.data.csrfToken, csrf); assert.equal(me.headers.get('cache-control'), 'no-store')
    assert.equal((await request('/api/owner/v1/users', { headers: { cookie: cookies } })).status, 403)
    const mutationBase = { cookie: cookies, origin: 'https://owner.test', 'x-csrf-token': csrf, 'content-type': 'application/json' }
    const blockedBalance = await request('/api/owner/v1/users/628000000001/balance-adjustments', { method: 'POST', headers: { ...mutationBase, 'idempotency-key': 'blocked' }, body: JSON.stringify({ operation: 'credit', amount: 1, confirmation: 'ADJUST', reason: 'x' }) }); assert.equal(blockedBalance.status, 503); assert.equal(pg.state.queries.length, 0)
    const blockedProduct = await request('/api/owner/v1/products', { method: 'POST', headers: { ...mutationBase, 'idempotency-key': 'blocked-product' }, body: JSON.stringify({ id: 'X', name: 'X', prices: { bronze: 1, silver: 1, gold: 1 }, confirmation: 'CREATE', reason: 'x' }) }); assert.equal(blockedProduct.status, 503); assert.equal(pg.state.queries.length, 0)
    const badIdBefore = pg.state.queries.length; assert.equal((await request('/api/owner/v1/users/628000000001abc', { headers: { cookie: cookies, origin: 'https://owner.test' } })).status, 400); assert.equal(pg.state.queries.length, badIdBefore)
    const longPinBefore = pg.state.queries.length; const longPin = await request('/api/owner/v1/users/628000000001/pin', { method: 'POST', headers: { ...mutationBase, 'idempotency-key': 'pin-long' }, body: JSON.stringify({ pin: '123456789', confirmation: 'RESET', reason: 'test' }) }); assert.equal(longPin.status, 503); assert.equal(pg.state.queries.length, longPinBefore)
    const overview = await request('/api/owner/v1/overview', { headers: { cookie: cookies, origin: 'https://owner.test' } }); assert.equal(overview.body.data.revenue, 85); assert.equal(overview.body.data.confirmedAmount, 30); assert.equal(overview.body.data.revenuePeriod, 'all_time')
    const finance = await request('/api/owner/v1/finance', { headers: { cookie: cookies, origin: 'https://owner.test' } }); assert.equal(finance.body.data.gross, 85); assert.equal(finance.body.data.legacyFinanceTotal, 45); assert.equal(finance.body.data.confirmedAmount, 30); assert.equal(finance.body.data.period, 'all_time')
    const tx = await request('/api/owner/v1/transactions/TX1', { headers: { cookie: cookies, origin: 'https://owner.test' } }); assert.equal(tx.status, 200); assert.ok(!JSON.stringify(tx.body).includes('SECRET')); assert.ok(!JSON.stringify(tx.body).includes('123456')); assert.equal(tx.body.data.userId, '••••0001')
    const logout = await request('/api/owner/v1/auth/logout', { method: 'POST', headers: { cookie: cookies, origin: 'https://owner.test', 'x-csrf-token': csrf } }); assert.equal(logout.status, 200); assert.equal((await request('/api/owner/v1/users', { headers: { cookie: cookies, origin: 'https://owner.test' } })).status, 401)
    console.log('owner-api mocked HTTP integration: PASS')
  } finally { await new Promise(resolve => server.close(resolve)) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
