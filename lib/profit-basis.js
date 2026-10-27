'use strict'

function saleFinancials(transaction) {
  const quantity = Number(transaction.jumlah || transaction.qty || 1)
  const revenue = Number(transaction.totalBayar ?? (Number(transaction.price) * quantity))
  const unitCost = transaction.unitCost == null ? null : Number(transaction.unitCost)
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(revenue)) return { revenue: null, cost: null, profit: null, known: false }
  if (!Number.isFinite(unitCost) || unitCost < 0) return { revenue, cost: null, profit: null, known: false }
  const cost = unitCost * quantity
  return { revenue, cost, profit: revenue - cost, known: true }
}

function withSaleTimeCost(transaction, product) {
  const unitPrice = Number(transaction?.price)
  const unitProfit = Number(product?.profit)
  const unitCost = unitPrice - unitProfit
  return Number.isFinite(unitPrice) && Number.isFinite(unitProfit) && unitCost >= 0
    ? { ...transaction, unitCost, profitBasis: 'sale_time_unit_cost' }
    : { ...transaction, unitCost: null, profitBasis: 'unknown' }
}

module.exports = { saleFinancials, withSaleTimeCost }
