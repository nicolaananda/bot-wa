'use strict'

jest.mock('fs')
jest.mock('../../lib/zoom-client', () => ({
  createMeeting: jest.fn(),
  findMeetingConflicts: jest.fn(),
  getUser: jest.fn(),
}))
jest.mock('../../lib/zoom-license', () => ({ checkHostLicense: jest.fn() }))

const { getHostExpiryStatus } = require('../../lib/zoom-pool')

const host = { exp: '08/10/2026' }
const minute = 60_000

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
