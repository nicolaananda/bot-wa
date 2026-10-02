'use strict'

const { canUseAdminCommand, collectHealth } = require('../../lib/health')
const { classify } = require('../../lib/anomalies')
const { correlationId, safeError } = require('../../lib/observability')

test('health collector sanitizes aggregate data', async () => {
  const pg = { query: jest.fn((sql) => Promise.resolve({ rows: sql.includes('count') ? [{ completed: 2, pending: 1, last_24h: 3 }] : [{ '?column?': 1 }] })) }
  const data = await collectHealth({ pg, redis: { ping: () => Promise.resolve('PONG') }, pm2: false })
  expect(data.orders).toEqual({ completed: 2, pending: 1, last_24h: 3 })
  expect(JSON.stringify(data)).not.toMatch(/user|ref_id|password/i)
})

test('anomaly classifier is read-only and separates candidates', () => {
  const now = Date.now()
  const result = classify({ transactions: [{ ref_id: 'done', status: 'completed', created_at: new Date() }, { ref_id: 'old', status: 'pending', created_at: new Date(now - 3600000) }], webhooks: [{ order_id: 'missing', transaction_status: 'settlement', lifecycle_status: 'completed', attempts: 1 }, { order_id: 'x', transaction_status: 'deny', lifecycle_status: 'failed', attempts: 3 }] }, now)
  expect(Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.length]))).toEqual({ paidWithoutCompletion: 1, stalePending: 1, repeatedProviderErrors: 1 })
})

test('admin command authorization uses owner or group admin', () => {
  expect(canUseAdminCommand({ isOwner: true })).toBe(true)
  expect(canUseAdminCommand({ isGroup: true, isGroupAdmin: true })).toBe(true)
  expect(canUseAdminCommand({ isGroup: false, isGroupAdmin: true })).toBe(false)
})

test('correlation sanitizer rejects injection and safe log excludes extra fields', () => {
  expect(correlationId('ab\n c$-1')).toBe('abc-1')
  const log = safeError(new Error('failed\nnext'), { correlationId: 'x', phone: 'secret', event: 'payment.fail' })
  expect(log.error).toBe('failed next')
  expect(log.phone).toBeUndefined()
})
