'use strict'

const { createReconnectController } = require('../../options/reconnect-controller')

test('deduplicates reconnect requests across 20 disconnect cycles', async () => {
  const callbacks = []
  const timers = {
    setTimeout(callback) {
      callbacks.push(callback)
      return callbacks.length
    },
    clearTimeout() {}
  }
  let connects = 0
  const controller = createReconnectController(async () => { connects++ }, 0, timers)

  for (let cycle = 0; cycle < 20; cycle++) {
    expect(controller.schedule()).toBe(true)
    expect(controller.schedule()).toBe(false)
    await callbacks.shift()()
  }

  expect(connects).toBe(20)
  expect(callbacks).toHaveLength(0)
  expect(controller.isReconnecting()).toBe(false)
})
