const crypto = require('crypto')

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`)
  const actual = Buffer.from(String(signature))
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

module.exports = { verifyWebhookSignature }