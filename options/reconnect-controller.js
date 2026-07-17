'use strict'

function createReconnectController(connect, delayMs = 5000, timers = global) {
  let reconnecting = false
  let timer = null

  function schedule() {
    if (reconnecting) return false
    reconnecting = true
    timer = timers.setTimeout(async () => {
      timer = null
      try {
        await connect()
      } finally {
        reconnecting = false
      }
    }, delayMs)
    return true
  }

  function cleanup() {
    if (timer) timers.clearTimeout(timer)
    timer = null
    reconnecting = false
  }

  return { schedule, cleanup, isReconnecting: () => reconnecting }
}

module.exports = { createReconnectController }
