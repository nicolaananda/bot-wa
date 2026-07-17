process.env.USE_PG = 'true'

const mockQuery = jest.fn()

jest.mock('../../config/postgres', () => ({ query: mockQuery }))

const Database = require('../../function/database')

describe('Database dirty persistence', () => {
  beforeEach(() => mockQuery.mockReset().mockResolvedValue({ rows: [] }))

  test('one changed user writes one row and unchanged save writes nothing', async () => {
    const db = new Database()
    db.data = {
      users: {
        unchanged: { saldo: 1, role: 'bronze' },
        changed: { saldo: 2, role: 'silver' },
      },
      produk: { product: { name: 'Product', price: 10, stock: 1 } },
      order: {},
      zoomFlow: {},
      zoomBookings: [],
      promo: {},
    }
    db._resetPersistedState()
    db.data.users.changed.saldo = 3

    await expect(db.save()).resolves.toBe(true)

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO users')
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'changed',
      3,
      'silver',
      JSON.stringify(db.data.users.changed),
    ])

    mockQuery.mockClear()
    await expect(db.save()).resolves.toBe(true)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  test('mutation during save remains dirty for the next save', async () => {
    let releaseQuery
    mockQuery.mockImplementationOnce(() => new Promise((resolve) => { releaseQuery = resolve }))

    const db = new Database()
    db.data = {
      users: { changed: { saldo: 1, role: 'bronze' } },
      produk: {},
      order: {},
      zoomFlow: {},
      zoomBookings: [],
      promo: {},
    }
    db._resetPersistedState()
    db.data.users.changed.saldo = 2

    const firstSave = db.save()
    await new Promise(setImmediate)
    db.data.users.changed.saldo = 3
    releaseQuery({ rows: [] })
    await expect(firstSave).resolves.toBe(true)

    mockQuery.mockClear().mockResolvedValue({ rows: [] })
    await expect(db.save()).resolves.toBe(true)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][1][1]).toBe(3)
  })
})
