'use strict'

const fs = require('fs')
const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8')

test('sales recap hides legacy wording without inventing missing profit', () => {
  expect(source).not.toMatch(/Profit unknown|legacy unknown/)
  expect(source).toMatch(/Profit\$\{unknownProfit \? ' tercatat' : ''\}/)
  expect(source).toMatch(/unknownProfitTransactions \? 'profit -'/)
})
