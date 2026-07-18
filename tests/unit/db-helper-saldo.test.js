process.env.USE_PG = 'true'

const mockQuery = jest.fn()

jest.mock('../../config/postgres', () => ({ query: mockQuery }))

const { getUserSaldoAsync } = require('../../options/db-helper')

const canonical = '628123@s.whatsapp.net'
const bare = '628123'

function setCache(canonicalSaldo = 0, bareSaldo = 0) {
  global.db = {
    data: {
      users: {
        [canonical]: { saldo: canonicalSaldo, role: 'silver' },
        [bare]: { saldo: bareSaldo, role: 'bronze' },
      },
    },
  }
}

describe('getUserSaldoAsync PostgreSQL aliases', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    setCache()
  })

  test.each([
    ['canonical only', [{ user_id: canonical, saldo: '11' }], 11],
    ['bare only', [{ user_id: bare, saldo: '12' }], 12],
    ['equal aliases', [
      { user_id: bare, saldo: '13' },
      { user_id: canonical, saldo: '13' },
    ], 13],
    ['conflicting aliases preserve max', [
      { user_id: bare, saldo: '14' },
      { user_id: canonical, saldo: '21' },
    ], 21],
    ['no row', [], 0],
  ])('%s', async (_name, rows, expected) => {
    mockQuery.mockResolvedValue({ rows })

    await expect(getUserSaldoAsync(bare)).resolves.toBe(expected)
    expect(global.db.data.users[bare].saldo).toBe(expected)
    expect(global.db.data.users[canonical].saldo).toBe(expected)
  })

  test('query error falls back to in-memory balance', async () => {
    setCache(31, 7)
    mockQuery.mockRejectedValue(new Error('database unavailable'))

    await expect(getUserSaldoAsync(bare)).resolves.toBe(31)
  })

  test('executes exactly one parameterized alias query', async () => {
    mockQuery.mockResolvedValue({ rows: [] })

    await getUserSaldoAsync(bare)

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT user_id, saldo FROM users WHERE user_id = ANY($1::text[])',
      [[bare, canonical]]
    )
  })
})
