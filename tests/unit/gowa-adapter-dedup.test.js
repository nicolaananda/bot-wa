'use strict'

jest.mock('../../lib/gowa-client', () =>
  jest.fn().mockImplementation(() => ({ baseUrl: 'http://gowa', deviceId: 'test' }))
)

const GowaAdapter = require('../../lib/gowa-adapter')

function webhook(id) {
  return {
    id,
    chat_id: '120363419470324991@g.us',
    from: '628123456789@s.whatsapp.net',
    message: { text: 'addstok net2u' },
  }
}

test('processes the same message ID only once', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', (event) => received.push(event))

  adapter.handleWebhook(webhook('message-1'))
  adapter.handleWebhook(webhook('message-1'))

  expect(received).toHaveLength(1)
})

test('processes equal commands with different message IDs separately', () => {
  const adapter = new GowaAdapter()
  const received = []
  adapter.on('messages.upsert', (event) => received.push(event))

  adapter.handleWebhook(webhook('message-1'))
  adapter.handleWebhook(webhook('message-2'))

  expect(received).toHaveLength(2)
})
