'use strict'

jest.mock('fs')
jest.mock('../../lib/zoom-client', () => ({
  createMeeting: jest.fn(),
  findMeetingConflicts: jest.fn(async () => []),
  getUser: jest.fn(async () => ({ host_key: '123456' })),
}))
jest.mock('../../lib/zoom-license', () => ({ checkHostForTier: jest.fn(async () => ({ ok: true })) }))
jest.mock('../../lib/zoom-backdate', () => ({ isBackdateTier: () => false, applyBackdate: (opts) => opts, recordBooking: jest.fn() }))

const fs = require('fs')
const zoomClient = require('../../lib/zoom-client')
const pool = require('../../lib/zoom-pool')
const { getHostExpiryStatus } = pool

const host = { exp: '08/10/2026' }
const minute = 60_000
const request = { tier: 100, topic: 'Coverage check', startTimeIso: '2026-10-05T07:00:00', startAtUtcMs: Date.parse('2026-10-05T00:00:00.000Z'), durationMinutes: 7 * 24 * 60 }

beforeEach(() => {
  jest.clearAllMocks()
  pool.clearCache()
  fs.statSync.mockReturnValue({ mtimeMs: 1 })
  fs.readFileSync.mockReturnValue(JSON.stringify([{ ...host, accountId: 'expired-host', clientId: 'id', clientSecret: 'secret', userId: 'host@example.com' }]))
})

test('rejects a weekly booking when the account expires before booking end', () => {
  const start = Date.parse('2026-10-05T00:00:00.000Z')
  expect(getHostExpiryStatus(host, start, 7 * 24 * 60)).toMatchObject({
    ok: false,
    reason: 'ACCOUNT_EXPIRES_DURING_BOOKING',
  })
})

test('accepts complete coverage and the inclusive expiry boundary', () => {
  const expiry = Date.parse('2026-10-08T16:59:59.999Z')
  expect(getHostExpiryStatus(host, expiry - minute, 1).ok).toBe(true)
  expect(getHostExpiryStatus(host, expiry - minute + 1, 1).ok).toBe(false)
})

test('interprets a date-only expiry as end of day Asia/Jakarta', () => {
  expect(getHostExpiryStatus(host, Date.parse('2026-10-08T16:59:59.999Z'), 0).ok).toBe(true)
  expect(getHostExpiryStatus(host, Date.parse('2026-10-08T17:00:00.000Z'), 0).ok).toBe(false)
})

test.each([NaN, Infinity, -1, 'bad'])('rejects unsafe booking duration %p', (duration) => {
  expect(getHostExpiryStatus(host, Date.parse('2026-10-05T00:00:00.000Z'), duration)).toMatchObject({
    ok: false,
    reason: 'BOOKING_DURATION_INVALID',
  })
})

test('keeps status-only license refresh compatible', () => {
  expect(getHostExpiryStatus(host, Date.parse('2026-10-05T00:00:00.000Z')).ok).toBe(true)
})

test('uses provider-rounded duration at the expiry boundary', async () => {
  const expiry = Date.parse('2026-10-08T16:59:59.999Z')
  expect((await pool.findFirstAvailableHost({ tier: 100, startAtUtcMs: expiry - minute, durationMinutes: 1.6 })).ok).toBe(false)
})

test.each([
  ['preflight', () => pool.findFirstAvailableHost(request)],
  ['creation', () => pool.createMeetingOnFirstAvailable(request)],
  ['earmarked payment', () => pool.createMeetingOnHost({ ...request, host: pool.loadPool(100)[0] })],
  ['fallback', () => pool.createMeetingOnHost({ ...request, host: pool.loadPool(100)[0], allowFallback: true })],
])('rejects an expired-during-week host at %s without provider creation', async (_name, call) => {
  expect((await call()).ok).toBe(false)
  expect(zoomClient.createMeeting).not.toHaveBeenCalled()
})
