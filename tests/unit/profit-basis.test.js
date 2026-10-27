'use strict'
const { saleFinancials, withSaleTimeCost } = require('../../lib/profit-basis')

test('sale-time cost produces historical profit independent of current product', () => {
  const sale = withSaleTimeCost({ id: 'p', price: 150, jumlah: 2, totalBayar: 300 }, { profit: 50 })
  expect(sale).toMatchObject({ unitCost: 100, profitBasis: 'sale_time_unit_cost' })
  expect(saleFinancials(sale)).toEqual({ revenue: 300, cost: 200, profit: 100, known: true })
})

test('legacy missing cost is unknown and excluded rather than assumed zero', () => {
  expect(saleFinancials({ id: 'p', jumlah: 1, totalBayar: 300, profit: 999 }))
    .toEqual({ revenue: 300, cost: null, profit: null, known: false })
})
