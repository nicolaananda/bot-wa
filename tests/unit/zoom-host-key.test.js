'use strict'

jest.mock('axios')
jest.mock('fs')
jest.mock('../../function/redis-helper', () => ({
  getCache: jest.fn(async () => ({ token: 'test-token', expiresAt: Date.now() + 60000 })),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
}))
jest.mock('../../lib/zoom-license', () => ({
  checkHostForTier: jest.fn(async () => ({ ok: true })),
}))
jest.mock('../../lib/zoom-backdate', () => ({
  isBackdateTier: () => false,
  applyBackdate: (opts) => opts,
  recordBooking: jest.fn(),
}))

const axios = require('axios')
const fs = require('fs')
const client = require('../../lib/zoom-client')
const pool = require('../../lib/zoom-pool')
const bookings = require('../../lib/zoom-backdate')
const host = {
  accountId: 'test-account',
  clientId: 'test-client',
  clientSecret: 'test-secret',
  userId: 'host@example.com',
  hostKey: '999999',
}
const opts = {
  tier: 1000,
  host,
  topic: 'Test',
  startTimeIso: '2026-10-01T10:00:00',
  startAtUtcMs: Date.parse('2026-10-01T10:00:00Z'),
  durationMinutes: 60,
}
let profile

beforeEach(() => {
  jest.clearAllMocks()
  pool.clearCache()
  profile = { host_key: '001234' }
  fs.statSync.mockReturnValue({ mtimeMs: 1 })
  fs.readFileSync.mockReturnValue(JSON.stringify([host]))
  axios.mockImplementation(async (request) => {
    if (request.method === 'POST') return { status: 201, data: { id: '123456789' } }
    if (request.url.endsWith('/meetings')) return { status: 200, data: { meetings: [] } }
    expect(request.url).toBe('https://api.zoom.us/v2/users/host%40example.com')
    expect(request.params).toEqual({ include_fields: 'host_key' })
    if (profile instanceof Error) throw profile
    return { status: 200, data: profile }
  })
})

test('requests the API host key and preserves leading zeros', async () => {
  await expect(client.getUser({ creds: host, requireHostKey: true })).resolves.toEqual({
    host_key: '001234',
  })
  expect(pool.loadPool(1000)[0]).not.toHaveProperty('hostKey')
})

test.each([undefined, null, '', '12345', '1234567', 'abcdef', ' 123456', 123456])(
  'rejects invalid API key %p without using the manual key',
  async (host_key) => {
    profile = { host_key }
    await expect(client.getUser({ creds: host, requireHostKey: true })).rejects.toThrow(
      'host_key missing or invalid'
    )
  }
)

test.each(['createMeetingOnFirstAvailable', 'createMeetingOnHost'])(
  '%s returns only the API key after validation and records the meeting',
  async (method) => {
    const result = await pool[method](opts)
    expect(result.ok).toBe(true)
    expect(result.hostInfo.host_key).toBe('001234')
    const requests = axios.mock.calls.map(([request]) => request)
    expect(requests.findIndex((r) => r.params?.include_fields === 'host_key')).toBeLessThan(
      requests.findIndex((r) => r.method === 'POST')
    )
    expect(bookings.recordBooking).toHaveBeenCalledTimes(1)
  }
)

test.each([{}, { host_key: 'invalid' }, new Error('Zoom permission denied')])(
  'key lookup failure %p prevents creation and booking across rental paths',
  async (response) => {
    profile = response
    expect((await pool.findFirstAvailableHost(opts)).ok).toBe(false)
    expect((await pool.createMeetingOnFirstAvailable(opts)).ok).toBe(false)
    await expect(pool.createMeetingOnHost({ ...opts, allowFallback: true })).rejects.toThrow()
    expect(axios.mock.calls.some(([request]) => request.method === 'POST')).toBe(false)
    expect(bookings.recordBooking).not.toHaveBeenCalled()
    // A failed lookup must release the host lock so payment retries can succeed.
    profile = { host_key: '001234' }
    expect((await pool.createMeetingOnHost(opts)).ok).toBe(true)
  }
)
