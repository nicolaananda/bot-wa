'use strict'

async function reserveOrderStock(db, sender, productId, quantity) {
  const order = db.data.order[sender]
  if (Array.isArray(order.fulfillmentReservation)) return order.fulfillmentReservation

  const stock = db.data.produk[productId].stok
  if (stock.length < quantity) return null

  order.fulfillmentReservation = stock.splice(0, quantity)
  db.data.produk[productId].terjual = Number(db.data.produk[productId].terjual || 0) + quantity
  delete db.data.produk[productId].stock
  if (!(await db.save())) throw new Error('Failed to persist QRIS stock reservation')
  return order.fulfillmentReservation
}

module.exports = { reserveOrderStock }
