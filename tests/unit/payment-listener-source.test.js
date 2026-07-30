'use strict'

const fs = require('fs')

test('uses the durable worker without per-order listeners or transaction-list polling', () => {
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8')
  expect(source).not.toMatch(/process\.on\('payment-completed'/)
  expect(source).toMatch(/global\.stopMidtransDurableWorker = startWebhookWorker/)
  expect(source).toMatch(/global\.stopMidtransDurableWorker\(\)/)
  expect(source).toMatch(/const USE_POLLING = false/)
})
