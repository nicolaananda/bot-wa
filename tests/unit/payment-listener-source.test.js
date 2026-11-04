'use strict'

const fs = require('fs')

test('uses the durable worker without per-order listeners or transaction-list polling', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(source).not.toMatch(/process\.on\('payment-completed'/)
  expect(source).toMatch(/global\.stopMidtransDurableWorker = startWebhookWorker/)
  expect(source).toMatch(/global\.stopMidtransDurableWorker\(\)/)
  expect(source).toMatch(/const USE_POLLING = false/)
})

test('persists completed buynow transactions directly to PostgreSQL', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  const buynowPersistence = source.match(/await db\.appendTransaction\(\{[\s\S]*?metodeBayar: 'QRIS'[\s\S]*?\}\)/)
  expect(buynowPersistence).not.toBeNull()
  expect(buynowPersistence[0]).not.toMatch(/persist:\s*false/)
})

test('persists successful wallet purchases as completed', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  const walletTransactions = [...source.matchAll(/await db\.appendTransaction\(\{[\s\S]*?metodeBayar: 'Saldo'[\s\S]*?\}\)/g)]
  expect(walletTransactions.length).toBeGreaterThanOrEqual(2)
  walletTransactions.forEach(([transaction]) => expect(transaction).toMatch(/status: 'completed'/))
})
