'use strict'
const { summarizeProducts } = require('../../lib/sales-recap')

test('recap uses persisted sale-time costs and reports legacy unknowns', () => {
  expect(summarizeProducts([
    { id: 'zoom100', name: 'Zoom 100p — A', jumlah: 1, totalBayar: 7001, unitCost: 0 },
    { id: 'zoom100', name: 'Zoom 100p — B', jumlah: 1, totalBayar: 8001, unitCost: 0 },
    { id: 'net1u', name: 'Netflix 1U', jumlah: 1, totalBayar: 10000, unitCost: 9000 },
    { id: 'net1u', name: 'Renamed', jumlah: 2, totalBayar: 20000 },
  ])).toEqual([
    { name: 'Zoom 100p — A', omzet: 7001, profit: 7001, unknownProfitTransactions: 0, terjual: 1 },
    { name: 'Zoom 100p — B', omzet: 8001, profit: 8001, unknownProfitTransactions: 0, terjual: 1 },
    { name: 'Netflix 1U', omzet: 30000, profit: 1000, unknownProfitTransactions: 1, terjual: 3 },
  ])
})
