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
