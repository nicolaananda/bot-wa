'use strict'

const { createSendQueue } = require('../../options/send-queue')

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('send queue metrics', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test('measures three queued sends, retry/429, and cleans depth on success and failure', async () => {
    const error429 = Object.assign(new Error('limited'), { status: 429 })
    const fatal = Object.assign(new Error('bad request'), { status: 400 })
    const sendMessage = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve('one'), 100)))
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce('two')
      .mockRejectedValueOnce(fatal)
    const nicola = { sendMessage }
    const queue = createSendQueue({
      minIntervalMs: 0,
      maxRetries: 1,
      snapshotIntervalMs: 0,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    })
    queue.wrap(nicola)

    const first = nicola.sendMessage('hidden-1', { text: 'secret-1' })
    const second = nicola.sendMessage('hidden-2', { text: 'secret-2' })
    const third = nicola.sendMessage('hidden-3', { text: 'secret-3' })
    expect(queue.snapshot().depth).toBe(3)

    await jest.advanceTimersByTimeAsync(100)
    await expect(first).resolves.toBe('one')
    await flush()
    await jest.advanceTimersByTimeAsync(1000)
    await expect(second).resolves.toBe('two')
    await expect(third).rejects.toBe(fatal)

    const metrics = queue.snapshot()
    expect(metrics).toMatchObject({
      depth: 0,
      enqueued: 3,
      success: 2,
      failure: 1,
      retries: 1,
      rateLimited: 1,
    })
    expect(metrics.queueWaitMs).toBeGreaterThanOrEqual(200)
    expect(metrics.processingMs).toBeGreaterThanOrEqual(1100)
    expect(metrics.sendMs).toBeGreaterThanOrEqual(100)
    expect(metrics.totalLatencyMs).toBeGreaterThanOrEqual(metrics.processingMs)
    expect(sendMessage).toHaveBeenCalledTimes(4)
    queue.close()
  })

  test('periodic snapshot timer is unrefed and can be cleaned', () => {
    const handle = { unref: jest.fn() }
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(handle)
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {})
    const queue = createSendQueue({ minIntervalMs: 800, maxRetries: 3, snapshotIntervalMs: 1000 })
    expect(handle.unref).toHaveBeenCalled()
    queue.close()
    expect(clearIntervalSpy).toHaveBeenCalledWith(handle)
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })
})
