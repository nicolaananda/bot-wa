const { createPerfMetrics } = require('../../lib/perf-metrics')

test('records successful and failed tasks without leaving active handlers', async () => {
  const metrics = createPerfMetrics({ name: 'test', intervalMs: 600000, log: () => {} })
  try {
    expect(await metrics.measure('message', () => 42)).toBe(42)
    await expect(metrics.measure('message', () => { throw new Error('failed') })).rejects.toThrow('failed')
    const snapshot = metrics.snapshot()
    expect(snapshot.timings.message.count).toBe(2)
    expect(snapshot.active).toBe(0)
    expect(snapshot.errors).toBe(1)
    expect(snapshot.maxActive).toBe(1)
    expect(metrics.snapshot().timings).toEqual({})
  } finally { metrics.close() }
})
