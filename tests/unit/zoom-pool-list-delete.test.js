'use strict'

const fs = require('fs')

jest.mock('../../lib/zoom-client', () => ({
  deleteMeeting: jest.fn(),
  listUpcomingMeetings: jest.fn(),
}))
jest.mock('../../lib/zoom-license', () => ({ checkHostForTier: jest.fn() }))

const client = require('../../lib/zoom-client')
const license = require('../../lib/zoom-license')
const pool = require('../../lib/zoom-pool')

beforeEach(() => {
  jest.restoreAllMocks()
  process.env.ZOOM_BACKDATE_TIERS = '300,500,1000'
  pool.clearCache()
  jest.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: Date.now() })
  jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
    { accountId: 'a', clientId: 'ca', clientSecret: 'sa', label: 'active', exp: '01/01/2099' },
    { accountId: 'b', clientId: 'cb', clientSecret: 'sb', label: 'expired', exp: '01/01/2020' },
  ]))
  license.checkHostForTier.mockResolvedValue({ ok: true, plan: 'Licensed', capacity: 100 })
  client.listUpcomingMeetings.mockResolvedValue([])
})

test('list counts and queries only active hosts', async () => {
  const result = await pool.listAllUpcoming(100)
  expect(result).toMatchObject({ configuredHostCount: 2, activeHostCount: 1 })
  expect(client.listUpcomingMeetings).toHaveBeenCalledTimes(1)
  expect(client.listUpcomingMeetings.mock.calls[0][0].creds.label).toBe('active')
})

test('delete 404 is idempotent success', async () => {
  client.deleteMeeting.mockRejectedValue(new Error('HTTP 404: Meeting does not exist'))
  await expect(pool.deleteMeetingOn({ tier: 100, hostAccountId: 'a', meetingId: '94560265814' }))
    .resolves.toEqual({ ok: true, alreadyMissing: true })
})
