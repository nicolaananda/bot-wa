'use strict'

jest.mock('../../lib/gowa-client', () =>
  jest.fn().mockImplementation(() => ({ baseUrl: 'http://gowa', deviceId: 'test' }))
)
const GowaAdapter = require('../../lib/gowa-adapter')

function event(message = {}) {
  return { event: 'message', device_id: 'test', payload: {
    id: 'sanitized-message-1', chat_id: '123456@g.us',
    from: '628000000000@s.whatsapp.net', is_from_me: false, ...message,
  } }
}

test.each([
  { body: 'rekap 15/10/2026' },
  { message: { conversation: 'rekap 15/10/2026' } },
  { message: { extendedTextMessage: { text: 'rekap 15/10/2026' } } },
  { message: { message: { conversation: 'rekap 15/10/2026' } } },
  { message: { message: { extendedTextMessage: { text: 'rekap 15/10/2026' } } } },
])('supported text shape dispatches on first delivery: %j', content => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', e => received.push(e.messages[0]))
  adapter.handleWebhook(event(content))
  adapter.handleWebhook(event(content))
  expect(received.map(m => m.message.conversation)).toEqual(['rekap 15/10/2026'])
})

test('unsupported non-text does not emit, and fromMe is preserved', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', e => received.push(e.messages[0]))
  adapter.handleWebhook(event({ message: { reactionMessage: { text: '👍' } } }))
  expect(received).toEqual([])
  adapter.handleWebhook(event({ body: 'rekap', is_from_me: true }))
  expect(received).toHaveLength(1)
  expect(received[0].key.fromMe).toBe(true)
  adapter.handleWebhook(event({ body: 'buy product', is_from_me: true }))
  expect(received).toHaveLength(1)
})

test('non-message event cannot reserve a command ID', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', e => received.push(e.messages[0]))
  adapter.handleWebhook({ ...event({ body: 'rekap' }), event: 'message.edited' })
  expect(received).toEqual([])
  adapter.handleWebhook(event({ body: 'rekap' }))
  expect(received).toHaveLength(1)
})

test('empty first delivery does not consume the ID of a later command', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', e => received.push(e.messages[0]))
  adapter.handleWebhook(event())
  adapter.handleWebhook(event({ body: 'rekap 15/10/2026' }))
  adapter.handleWebhook(event({ body: 'rekap 15/10/2026' }))
  expect(received.map(m => m.message)).toEqual([{ conversation: 'rekap 15/10/2026' }])
  expect(received[0].key).toEqual({ id: 'sanitized-message-1', remoteJid: '123456@g.us',
    participant: '628000000000@s.whatsapp.net', fromMe: false })
})
