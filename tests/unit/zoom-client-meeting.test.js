'use strict'

jest.mock('../../function/redis-helper', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
}))

const zoomClient = require('../../lib/zoom-client')

test.each(['abcd#12345', 'abcd 12345'])(
  'rejects unsupported Zoom meeting password %p before the API call',
  async (password) => {
    await expect(
      zoomClient.createMeeting({
        topic: 'Test',
        startTime: '2026-08-28T10:00:00',
        durationMinutes: 60,
        password,
      })
    ).rejects.toThrow('password must be at most 10 characters')
  }
)

test('accepts Zoom-supported meeting password characters', async () => {
  await expect(
    zoomClient.createMeeting({
      topic: 'Test',
      startTime: '2026-08-28T10:00:00',
      durationMinutes: 60,
      password: 'Ab12@-_*',
      creds: {},
    })
  ).rejects.not.toThrow('password must be at most 10 characters')
})
