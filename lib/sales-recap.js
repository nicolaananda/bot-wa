'use strict'
const { saleFinancials } = require('./profit-basis')

function summarizeProducts(transactions) {
  const products = new Map()
  for (const transaction of transactions) {
    const id = transaction.id || 'unknown'
    const isZoom = /^zoom\d+$/i.test(id)
    const name = transaction.name || (isZoom ? id.replace(/^zoom/i, 'Zoom ') + 'p' : id)
    const key = isZoom ? `${id}\0${name}` : id
    const product = products.get(key) || { name, omzet: 0, profit: 0, unknownProfitTransactions: 0, terjual: 0 }
    product.omzet += Number(transaction.totalBayar || transaction.price || 0)
    const financials = saleFinancials(transaction)
    if (financials.known) product.profit += financials.profit
    else product.unknownProfitTransactions += 1
    product.terjual += Number(transaction.qty || transaction.jumlah || 1)
    products.set(key, product)
  }
  return [...products.values()]
}

module.exports = { summarizeProducts }
