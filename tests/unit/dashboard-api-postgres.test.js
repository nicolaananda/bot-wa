process.env.USE_PG = 'true'
process.env.MIDTRANS_SERVER_KEY = 'test'

const mockQuery = jest.fn()
jest.mock('../../config/postgres', () => ({ query: mockQuery }))
jest.mock('../../config/env-validator', () => ({ validateOrExit: jest.fn() }))
jest.mock('../../config/redis', () => ({ getRedis: jest.fn() }))
jest.mock('../../config/midtrans', () => ({ clearCachedPaymentData: jest.fn() }))
jest.mock('../../config/r2-storage', () => ({
  getReceipt: jest.fn(), receiptExists: jest.fn(), deleteReceipt: jest.fn(),
}))
jest.mock('../../options/midtrans-webhook', () => ({
  createWebhookHandler: jest.fn(() => jest.fn()), startWebhookWorker: jest.fn(),
}), { virtual: true })

const http = require('http')
const app = require('../../options/dashboard-api')

function request(path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path }, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, body: JSON.parse(body) })))
      })
      req.on('error', (error) => server.close(() => reject(error)))
    })
  })
}

describe('dashboard PostgreSQL endpoints', () => {
  beforeEach(() => mockQuery.mockReset())

  test.each([
    ['/api/dashboard/overview', 1],
    ['/api/dashboard/chart/daily', 1],
    ['/api/dashboard/chart/monthly', 1],
  ])('%s uses one bounded aggregate query', async (path, queryCount) => {
    mockQuery.mockResolvedValue({ rows: path.endsWith('overview') ? [{}] : [] })
    await expect(request(path)).resolves.toMatchObject({ status: 200 })
    expect(mockQuery).toHaveBeenCalledTimes(queryCount)
  })

  test('overview preserves payment and top-user keys with UTC today boundary', async () => {
    mockQuery.mockResolvedValue({ rows: [{ totalTransaksi: 2, totalPendapatan: 50, transaksiHariIni: 1, pendapatanHariIni: 30, metodeBayar: { saldo: 1, qris: 1, unknown: 0 }, topUsers: [] }] })

    const response = await request('/api/dashboard/overview')
    const sql = mockQuery.mock.calls[0][0]

    expect(response.body.data).toEqual(expect.objectContaining({
      totalTransaksi: 2, totalPendapatan: 50, transaksiHariIni: 1, pendapatanHariIni: 30,
      metodeBayar: { saldo: 1, qris: 1, unknown: 0 }, topUsers: [],
    }))
    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    expect(sql).toContain("AT TIME ZONE 'UTC'")
  })

  test.each([
    ['/api/dashboard/chart/daily', "INTERVAL '6 days'", 'AS transaksi', 'AS pendapatan'],
    ['/api/dashboard/chart/monthly', "INTERVAL '11 months'", 'AS transaksi', 'AS pendapatan'],
  ])('%s uses UTC labels, expected range, and response keys', async (path, range, transactionKey, revenueKey) => {
    mockQuery.mockResolvedValue({ rows: [] })

    await request(path)
    const sql = mockQuery.mock.calls[0][0]

    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    expect(sql).toContain(range)
    expect(sql).toContain(transactionKey)
    expect(sql).toContain(revenueKey)
    expect(sql).toContain("AT TIME ZONE 'UTC'")
  })

  test('activity uses grouped bounded SQL without loading snapshots', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ activeUsers: 3, newUsers: 1 }] })
      .mockResolvedValueOnce({ rows: [{ user: '6281', totalTransaksi: 2, metodeBayar: { saldo: 1, qris: 1, unknown: 0 } }] })

    const response = await request('/api/dashboard/users/activity')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(expect.objectContaining({
      activeUsers: 3, newUsers: 1, userActivity: expect.any(Array), activityTrends: expect.any(Object),
    }))
    expect(mockQuery).toHaveBeenCalledTimes(2)
    const activitySql = mockQuery.mock.calls[1][0]
    expect(activitySql).toContain('GROUP BY')
    expect(activitySql).toContain('LIMIT 20')
    expect(activitySql).toContain('json_build_object')
    expect(mockQuery.mock.calls.flat().join(' ')).not.toMatch(/SELECT\s+\*\s+FROM\s+(users|transaksi)/i)
  })

  test('all-users parameterizes search/filter, retains users, and paginates after sorting', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '6281', transaction_count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })

    const response = await request('/api/dashboard/all-users?search=Ali&role=gold&sort=spent&order=desc&page=3&limit=10')

    expect(response.status).toBe(200)
    expect(response.body.data[0].transaction_count).toBe(0)
    expect(mockQuery).toHaveBeenCalledTimes(2)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('LEFT JOIN transaksi')
    expect(sql).toMatch(/ILIKE \$1/)
    expect(sql).toMatch(/u\.role = \$2/)
    expect(sql).toMatch(/ORDER BY total_spent DESC[\s\S]*LIMIT \$3 OFFSET \$4/)
    expect(params).toEqual(['%Ali%', 'gold', 10, 20])
    expect(sql).not.toContain('Ali')
  })

  test('user transactions normalizes legacy ID and applies status/sort before bounded pagination', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ ref_id: 'x' }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })

    const response = await request('/api/dashboard/user-transactions/6281@s.whatsapp.net?status=success&sort=amount&order=asc&page=2&limit=5')

    expect(response.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledTimes(2)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain("regexp_replace(COALESCE(t.user_id, '')")
    expect(sql).toMatch(/t\.status = \$2/)
    expect(sql).toMatch(/ORDER BY amount ASC[\s\S]*LIMIT \$3 OFFSET \$4/)
    expect(params).toEqual(['6281', 'success', 5, 5])
  })
})
