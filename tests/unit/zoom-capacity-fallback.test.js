'use strict'

const fs = require('fs')
jest.mock('fs')
jest.mock('../../lib/zoom-client', () => ({
  getUser: jest.fn(async () => ({ host_key: '123456' })),
  createMeeting: jest.fn(async () => ({ id: 'meeting-2' })),
}))
jest.mock('../../lib/zoom-license', () => ({
  checkHostForTier: jest.fn(async () => ({ ok: true, plan: 'Licensed', capacity: 100 })),
  reasonText: jest.fn(() => 'ok'),
}))

const pool = require('../../lib/zoom-pool')

beforeEach(() => {
  process.env.ZOOM_BACKDATE_TIERS = '100'
  global.db = { data: { zoomBookings: [] } }
  pool.clearCache()
  fs.statSync.mockReturnValue({ mtimeMs: Date.now() })
  fs.readFileSync.mockReturnValue(JSON.stringify([
    { accountId: 'busy', clientId: 'c1', clientSecret: 's1', label: 'busy', exp: '01/01/2099' },
    { accountId: 'free', clientId: 'c2', clientSecret: 's2', label: 'free', exp: '01/01/2099' },
  ]))
})

test('SQL capacity conflict skips host and claims the next active host', async () => {
  const claimCreate = jest.fn(async ({ host }) => {
    if (host.accountId === 'busy') throw new Error('zoom host capacity exceeded')
    return { status: 'creating', claim_token: 'token' }
  })
  const result = await pool.createMeetingOnFirstAvailable({
    tier: 100, topic: 'manual fallback', startTimeIso: '2030-01-01T00:00:00',
    durationMinutes: 60, timezone: 'Asia/Jakarta', startAtUtcMs: Date.parse('2030-01-01T00:00:00Z'),
    claimCreate, finishCreate: jest.fn(async () => {}),
  })
  expect(result.ok).toBe(true)
  expect(result.host.accountId).toBe('free')
  expect(claimCreate).toHaveBeenCalledTimes(2)
})
