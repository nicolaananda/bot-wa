const crypto = require('crypto')
const { verifyWebhookSignature } = require('../../lib/gowa-webhook-auth')

test('verifies GOWA signature against exact request bytes', () => {
  const secret = 'test-secret'
  const raw = Buffer.from('{ "event": "message", "data": {"id":1} }')
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`

  expect(verifyWebhookSignature(raw, signature, secret)).toBe(true)
  expect(verifyWebhookSignature(Buffer.from(JSON.stringify(JSON.parse(raw))), signature, secret)).toBe(false)
  expect(verifyWebhookSignature(raw, 'sha256=bad', secret)).toBe(false)
})