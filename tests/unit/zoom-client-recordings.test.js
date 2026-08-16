'use strict'

const axios = require('axios')

jest.mock('axios')
jest.mock('../../function/redis-helper', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCache: jest.fn().mockResolvedValue(undefined),
}))

const zoomClient = require('../../lib/zoom-client')

const creds = {
  accountId: 'account-1',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  userId: 'me',
  label: 'test-host',
}

test('gets cloud recordings using a normalized meeting ID', async () => {
  axios.post.mockResolvedValue({
    status: 200,
    data: { access_token: 'token-1', expires_in: 3600 },
  })
  axios.mockResolvedValue({
    status: 200,
    data: { topic: 'Study Center', recording_files: [{ file_type: 'MP4' }] },
  })

  await expect(
    zoomClient.getMeetingRecordings({ meetingId: '841 3743 8962', creds })
  ).resolves.toMatchObject({ topic: 'Study Center' })
  expect(axios).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'https://api.zoom.us/v2/meetings/84137438962/recordings',
    })
  )
})

test('rejects an invalid meeting ID before calling Zoom', async () => {
  await expect(
    zoomClient.getMeetingRecordings({ meetingId: 'not-a-meeting', creds })
  ).rejects.toThrow('meetingId must contain 9-11 digits')
})
