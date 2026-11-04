'use strict'

const fs = require('fs')
const { suppressFulfillmentForManualSale } = require('../../lib/p0-store')

test('late payment is quarantined when a matching owner sale exists', async () => {
  const db = {
    query: jest.fn().mockResolvedValue({ rows: [{ order_id: 'MID-1' }] }),
  }

  await expect(suppressFulfillmentForManualSale({
    orderId: 'MID-1',
    userId: '628123@s.whatsapp.net',
    productId: 'net1u',
    quantity: 1,
    createdAt: 1700000000000,
  }, db)).resolves.toBe(true)

  const [sql, params] = db.query.mock.calls[0]
  expect(sql).toMatch(/status='manual_review'/)
  expect(sql).toMatch(/isOwnerBuy/)
  expect(sql).toMatch(/targetNumber/)
  expect(params).toEqual(['MID-1', '628123@s.whatsapp.net', 'net1u', 1, 1700000000000, '628123'])
})

test('ordinary late payment remains eligible for automatic fulfillment', async () => {
  const db = { query: jest.fn().mockResolvedValue({ rows: [] }) }
  await expect(suppressFulfillmentForManualSale({
    orderId: 'MID-2', userId: '628456@s.whatsapp.net', productId: 'net1u', quantity: 1,
    createdAt: 1700000000000,
  }, db)).resolves.toBe(false)
})

test('manual-sale guard runs before strict late-payment correlation', () => {
  const index = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(index.indexOf('suppressFulfillmentForManualSale')).toBeLessThan(index.indexOf('Paid order correlation requires manual review'))
})

test('QR expiry deletion survives restart through the PostgreSQL KV queue', () => {
  const database = fs.readFileSync(require.resolve('../../function/database'), 'utf8')
  const index = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(database).toMatch(/KV_SYNC_KEYS = \[[^\]]*'autoDeleteQueue'/)
  expect(database).toMatch(/autoDeleteQueue: \[\]/)
  expect(index).toMatch(/scheduleAutoDelete\(message\.key, from, Math\.max\(0, expirationTime - Date\.now\(\)\), 'expired QRIS'\)/)
  expect(index).toMatch(/scheduleAutoDelete\(message\.key, from, Math\.max\(0, expirationTime - Date\.now\(\)\), 'expired Zoom QRIS'\)/)
  expect(index).toMatch(/function startDeliveryOutboxWorker\(client\)[\s\S]*initializeAutoDeleteManager\(client\)/)
})

test('failed QR deletion is retried and retained after the retry ceiling', () => {
  const index = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(index).toMatch(/queued\.attempts < 5/)
  expect(index).toMatch(/queued\.status = 'failed'/)
  expect(index).not.toMatch(/finally \{\s*removeAutoDeleteEntry\(entry\.id\)/)
})
