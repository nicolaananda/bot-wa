'use strict'

const { calculatePrice } = require('../../lib/zoom-pricing')

test('prices week and month durations as full days', () => {
  expect(calculatePrice(7 * 24 * 60, true, 100)).toMatchObject({
    billedUnit: 'day',
    billedQty: 7,
    price: 56000,
  })
  expect(calculatePrice(30 * 24 * 60, true, 100)).toMatchObject({
    billedUnit: 'day',
    billedQty: 30,
    price: 240000,
  })
})
