'use strict'

const axios = require('axios')
const GowaClient = require('../../lib/gowa-client')

jest.mock('axios', () => ({ create: jest.fn() }))

const jid = '120363419470324991@g.us'

function clientWith(post) {
  axios.create.mockReturnValue({
    post,
    interceptors: { response: { use: jest.fn() } },
  })
  return new GowaClient()
}

test('revokes a message with its full chat JID', async () => {
  const post = jest.fn().mockResolvedValue({ data: { success: true } })
  const client = clientWith(post)

  await expect(client.deleteMessage(jid, 'message-1')).resolves.toEqual({ success: true })
  expect(post).toHaveBeenCalledWith('/message/message-1/revoke', { phone: jid })
})

test('falls back to delete-for-me when revoke fails', async () => {
  const post = jest
    .fn()
    .mockRejectedValueOnce(new Error('revoke failed'))
    .mockResolvedValueOnce({ data: { success: true } })
  const client = clientWith(post)

  await expect(client.deleteMessage(jid, 'message-1')).resolves.toEqual({ success: true })
  expect(post).toHaveBeenNthCalledWith(2, '/message/message-1/delete', { phone: jid })
})

test('returns a failure result when revoke and delete both fail', async () => {
  const post = jest.fn().mockRejectedValue(new Error('GOWA unavailable'))
  const client = clientWith(post)
  jest.spyOn(console, 'warn').mockImplementation(() => {})

  await expect(client.deleteMessage(jid, 'message-1')).resolves.toEqual({
    success: false,
    error: 'GOWA unavailable',
  })
})
