process.env.USE_PG = 'true'
const fs = require('node:fs')
const vm = require('node:vm')
const mockQuery = jest.fn()
jest.mock('../../config/postgres', () => ({ query: mockQuery }))
jest.mock('dotenv', () => ({ config() {} }))
jest.mock('../../lib/otp-wallet', () => ({ walletQuery: (...args) => mockQuery(...args) }))
const Database = require('../../function/database')

test('refresh preserves pending edits and changes made while SQL read is in flight', async () => {
  const db = new Database()
  db.data = { produk: { p: { stok: ['a'], name: 'P' } } }
  db._resetPersistedState()
  mockQuery.mockReset()
  db.data.produk.p.name = 'owner edit'
  expect(await db.refreshProductSnapshot('p')).toBe(false)
  expect(mockQuery).not.toHaveBeenCalled()
  db._resetPersistedState()
  let release
  mockQuery.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const pending = db.refreshProductSnapshot('p')
  db.data.produk.p.name = 'newer edit'
  release({ rows: [{ data: { stok: [], name: 'old' } }] })
  expect(await pending).toBe(false)
  expect(db.data.produk.p.name).toBe('newer edit')
})

test('missing SQL product does not erase receipt context after committed purchase', async () => {
  const db = new Database()
  db.data = { produk: { p: { name: 'Receipt name', stok: ['a'] } } }
  db._resetPersistedState()
  mockQuery.mockReset().mockResolvedValue({ rows: [] })
  expect(await db.refreshProductSnapshot('p')).toBe(false)
  expect(db.data.produk.p.name).toBe('Receipt name')
  await db.save()
  expect(mockQuery).toHaveBeenCalledTimes(1)
})

test('committed purchase cache refresh never replays wallet or stock writes', async () => {
  const db = new Database()
  db.data = { users: { user: { saldo: 100 } }, produk: { p: { stok: ['a', 'b'], terjual: 0 } } }
  db._resetPersistedState()
  const authoritative = { stok: ['newer'], terjual: 2, profit: 17 }
  mockQuery.mockReset().mockResolvedValue({ rows: [{ data: authoritative }], rowCount: 1 })
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  const start = source.indexOf('              if (atomicPurchase) {', source.indexOf('// The PG function is authoritative'))
  const end = source.indexOf('// Low stock alert', start)
  const run = () => vm.runInNewContext(`(async()=>{${source.slice(start, end)}})()`, {
    db, sender: 'user', data: ['p'], jumlah: 1,
    atomicPurchase: { new_saldo: 40, new_stock: 1 }, saldoCache: new Map(),
  })
  await run()
  await db.save()
  expect(mockQuery.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true)
  expect(db.data.users.user.saldo).toBe(100) // SQL helper is the authoritative balance reader.
  expect(db.data.produk.p).toEqual(authoritative)
  mockQuery.mockRejectedValueOnce(new Error('read unavailable'))
  await expect(run()).resolves.toBeUndefined() // committed order must still reach delivery
  expect(db.data.produk.p).toEqual(authoritative)
  await run() // idempotent purchase result cannot slice inventory a second time
  await db.save()
  expect(db.data.produk.p).toEqual(authoritative)
  expect(mockQuery.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true)
})
