'use strict'

const zoomBackdate = require('../../lib/zoom-backdate')

beforeEach(() => {
  global.db = { data: { zoomBookings: [] } }
  global.scheduleSave = jest.fn()
})

afterEach(() => {
  delete global.db
  delete global.scheduleSave
})

test('keeps completed booking history for recording account lookup', () => {
  const now = Date.now()
  global.db.data.zoomBookings.push({
    tier: 300,
    hostAccountId: 'account-300',
    hostLabel: 'host-300',
    meetingId: '84137438962',
    realStartUtcMs: now - 2 * 60 * 60 * 1000,
    durationMinutes: 60,
    realEndUtcMs: now - 60 * 60 * 1000,
    createdAt: now - 2 * 60 * 60 * 1000,
  })

  expect(zoomBackdate.findBookingByMeetingId('841 3743 8962')).toMatchObject({
    hostAccountId: 'account-300',
    hostLabel: 'host-300',
  })
  expect(zoomBackdate.listLocalBookings(300)).toEqual([])
})

test('removes recording lookup history after 30 days', () => {
  const old = Date.now() - 31 * 24 * 60 * 60 * 1000
  global.db.data.zoomBookings.push({
    meetingId: '84137438962',
    realEndUtcMs: old,
    createdAt: old,
  })

  expect(zoomBackdate.findBookingByMeetingId('84137438962')).toBeNull()
})

test('counts daily bookings per host account', () => {
  const startAtUtcMs = Date.parse('2026-08-21T03:00:00.000Z')
  for (const [hostAccountId, hour] of [
    ['account-a', 3],
    ['account-a', 5],
    ['account-b', 7],
  ]) {
    zoomBackdate.recordBooking({
      tier: 300,
      hostAccountId,
      meetingId: `${hostAccountId}-${hour}`,
      realStartUtcMs: Date.parse(`2026-08-21T${String(hour).padStart(2, '0')}:00:00.000Z`),
      durationMinutes: 60,
    })
  }

  expect(
    zoomBackdate.countBookingsForDay({
      tier: 300,
      hostAccountId: 'account-a',
      startAtUtcMs,
      timezone: 'Asia/Jakarta',
    })
  ).toBe(2)
  expect(
    zoomBackdate.countBookingsForDay({
      tier: 300,
      hostAccountId: 'account-b',
      startAtUtcMs,
      timezone: 'Asia/Jakarta',
    })
  ).toBe(1)
})
