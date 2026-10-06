process.env.USE_PG = 'true'

const mockQuery = jest.fn()

jest.mock('../../config/postgres', () => ({ query: mockQuery, getClient: jest.fn() }))
jest.mock('dotenv', () => ({ config() {} }))
jest.mock('../../lib/otp-wallet', () => ({ walletQuery: jest.fn() }))

const Database = require('../../function/database')

beforeEach(() => mockQuery.mockReset())

test('adds stock atomically and refreshes the local product snapshot', async () => {
  const saved = { name: 'Netflix', stok: ['existing', 'new'], terjual: 0 }
  mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ data: saved, stock: 2 }] })
  const db = new Database()
  db.data = { users: {}, produk: { net: { name: 'Netflix', stok: ['existing'] } }, order: {} }
  db._resetPersistedState()

  await expect(db.addProductStock('net', ['new'])).resolves.toBe(2)
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("COALESCE(data->'stok','[]'::jsonb) || to_jsonb($2::text[])"), ['net', ['new']])
  expect(db.data.produk.net).toEqual(saved)
  expect(db._persisted.produk.get('net')).toBe(JSON.stringify(saved))
})

test('rejects empty stock without writing', async () => {
  const db = new Database()
  db.data = { users: {}, produk: {}, order: {} }
  await expect(db.addProductStock('net', [])).rejects.toThrow('Stock items are required')
  expect(mockQuery).not.toHaveBeenCalled()
})
