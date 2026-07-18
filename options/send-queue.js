'use strict'

function createSendQueue({ minIntervalMs, maxRetries, snapshotIntervalMs = 60000, logger = console }) {
  let queue = Promise.resolve()
  let lastSendAt = 0
  const metrics = {
    depth: 0,
    enqueued: 0,
    success: 0,
    failure: 0,
    retries: 0,
    rateLimited: 0,
    queueWaitMs: 0,
    processingMs: 0,
    sendMs: 0,
    totalLatencyMs: 0,
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const snapshot = () => ({ ...metrics })
  const timer = snapshotIntervalMs > 0
    ? setInterval(() => logger.info('[WA] send queue metrics', snapshot()), snapshotIntervalMs)
    : null
  timer?.unref?.()

  function wrap(nicola) {
    if (nicola.__sendWrapped) return
    const originalSend = nicola.sendMessage.bind(nicola)

    nicola.sendMessage = function (jid, content, options) {
      const enqueuedAt = Date.now()
      metrics.depth += 1
      metrics.enqueued += 1

      const sendTask = async () => {
        const startedAt = Date.now()
        metrics.queueWaitMs += startedAt - enqueuedAt
        const throttleWait = Math.max(0, minIntervalMs - (Date.now() - lastSendAt))
        if (throttleWait > 0) await delay(throttleWait)

        let attempt = 0
        try {
          while (true) {
            const sendStartedAt = Date.now()
            try {
              const result = await originalSend(jid, content, options)
              metrics.sendMs += Date.now() - sendStartedAt
              lastSendAt = Date.now()
              metrics.success += 1
              return result
            } catch (error) {
              metrics.sendMs += Date.now() - sendStartedAt
              const code = error && (error.status || error.statusCode || error.code)
              const message = String(error && error.message ? error.message : '')
              const transient =
                code === 429 ||
                code === 'ECONNRESET' ||
                code === 'ETIMEDOUT' ||
                code === 'ENOTFOUND' ||
                /rate|too many|retry|temporarily unavailable|timeout|timed out|flood|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message)
              if (code === 429) metrics.rateLimited += 1
              attempt += 1
              if (!transient || attempt > maxRetries) throw error
              metrics.retries += 1
              const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000)
              logger.warn('[WA] send retry', { attempt, backoff, code })
              await delay(backoff)
            }
          }
        } catch (error) {
          metrics.failure += 1
          throw error
        } finally {
          const finishedAt = Date.now()
          metrics.processingMs += finishedAt - startedAt
          metrics.totalLatencyMs += finishedAt - enqueuedAt
          metrics.depth -= 1
        }
      }

      const result = queue.then(sendTask, sendTask)
      queue = result.catch((error) => {
        logger.error('[WA] send failed', {
          code: error && (error.status || error.statusCode || error.code),
        })
      })
      return result
    }

    Object.defineProperty(nicola, '__sendWrapped', { value: true, enumerable: false })
  }

  return {
    wrap,
    snapshot,
    close() {
      if (timer) clearInterval(timer)
    },
  }
}

module.exports = { createSendQueue }
