'use strict'

const fs = require('fs')
const { reserveOrderStock } = require('../../lib/qris-fulfillment')

const indexSource = fs.readFileSync(require.resolve('../../index'), 'utf8')

test('persists delivery proof and skips duplicate send on retry', () => {
  expect(indexSource).toMatch(/order\.deliveryStatus !== 'sent'/)
  expect(indexSource).toMatch(/order\.deliveryMessageId = delivery\?\.id \|\| delivery\?\.key\?\.id \|\| null/)
  expect(indexSource).toMatch(/Failed to persist QRIS delivery receipt/)
})

test('persists one reservation and reuses it on delivery retry', async () => {
  const db = {
    data: {
      order: { user: {} },
      produk: { product: { stok: ['first', 'second'], terjual: 0, stock: 2 } },
    },
    save: jest.fn().mockResolvedValue(true),
  }

  await expect(reserveOrderStock(db, 'user', 'product', 1)).resolves.toEqual(['first'])
  await expect(reserveOrderStock(db, 'user', 'product', 1)).resolves.toEqual(['first'])
  expect(db.data.produk.product.stok).toEqual(['second'])
  expect(db.data.produk.product.terjual).toBe(1)
  expect(db.data.order.user.fulfillmentReservation).toEqual(['first'])
  expect(db.save).toHaveBeenCalledTimes(1)
})

test('does not mutate stock when reservation cannot be filled', async () => {
  const db = {
    data: { order: { user: {} }, produk: { product: { stok: [], terjual: 0 } } },
    save: jest.fn(),
  }

  await expect(reserveOrderStock(db, 'user', 'product', 1)).resolves.toBeNull()
  expect(db.save).not.toHaveBeenCalled()
})
