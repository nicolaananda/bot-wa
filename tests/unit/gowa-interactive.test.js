'use strict'

jest.mock('../../lib/gowa-client', () =>
  jest.fn().mockImplementation(() => ({
    baseUrl: 'http://gowa',
    deviceId: 'test',
    sendInteractive: jest.fn(async () => ({ key: { id: 'sent' } })),
  }))
)

const GowaClient = jest.requireActual('../../lib/gowa-client')
const GowaAdapter = require('../../lib/gowa-adapter')

test('posts interactive messages to the v9.9 endpoint with device scope', async () => {
  const client = new GowaClient({ deviceId: 'device-1' })
  client.axios = { post: jest.fn(async () => ({ data: { results: { message_id: 'm1' } } })) }

  await client.sendInteractive('628123@s.whatsapp.net', {
    body: 'Choose',
    buttons: [{ name: 'quick_reply', params: { display_text: 'Products', id: 'stok' } }],
  })

  expect(client.axios.post).toHaveBeenCalledWith(
    '/send/interactive',
    expect.objectContaining({ phone: '628123', body: 'Choose' }),
    { headers: { 'X-Device-Id': 'device-1' } }
  )
})

test('dispatches an interactive selection id as a command', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', event => received.push(event.messages[0]))

  adapter.handleWebhook({
    event: 'message',
    payload: {
      id: 'reply-1',
      chat_id: '628123@s.whatsapp.net',
      selection: { kind: 'interactive', selected_id: 'stok', text: 'Daftar Produk' },
    },
  })

  expect(received[0].message.conversation).toBe('stok')
})

test('dispatches the v9.9 interactive_reply id as a command', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', event => received.push(event.messages[0]))

  adapter.handleWebhook({
    event: 'message',
    payload: {
      id: 'reply-2',
      chat_id: '628123@s.whatsapp.net',
      interactive_reply: { id: 'riwayat', text: 'Riwayat Transaksi' },
    },
  })

  expect(received[0].message.conversation).toBe('riwayat')
})

test('rejects malformed interactive payloads before sending', async () => {
  const client = new GowaClient({ deviceId: 'device-1' })
  client.axios = { post: jest.fn() }

  await expect(client.sendInteractive('628123@s.whatsapp.net', { body: '', buttons: [] }))
    .rejects.toThrow('Interactive body is required')
  expect(client.axios.post).not.toHaveBeenCalled()
})

test('adapter sends native interactive content without text fallback', async () => {
  const adapter = new GowaAdapter()
  const content = { interactive: { body: 'Choose', buttons: [] } }

  await adapter.sendMessage('628123@s.whatsapp.net', content)

  expect(adapter.client.sendInteractive).toHaveBeenCalledWith('628123@s.whatsapp.net', content.interactive)
})