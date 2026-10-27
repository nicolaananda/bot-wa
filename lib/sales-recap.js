'use strict'

function summarizeProducts(transactions) {
  const products = new Map()
  for (const transaction of transactions) {
    const id = transaction.id || 'unknown'
    const isZoom = /^zoom\d+$/i.test(id)
    const name = transaction.name || (isZoom ? id.replace(/^zoom/i, 'Zoom ') + 'p' : id)
    const key = isZoom ? `${id}\0${name}` : id
    const product = products.get(key) || { name, omzet: 0, profit: 0, terjual: 0 }
    product.omzet += Number(transaction.totalBayar || transaction.price || 0)
    product.profit += Number(transaction.profit || 0)
    product.terjual += Number(transaction.qty || transaction.jumlah || 1)
    products.set(key, product)
  }
  return [...products.values()]
}

module.exports = { summarizeProducts }
