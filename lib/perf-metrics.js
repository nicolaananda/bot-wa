const { monitorEventLoopDelay, performance } = require('node:perf_hooks')

function createPerfMetrics({ name, log = console.log, intervalMs = 60000 }) {
  const loop = monitorEventLoopDelay({ resolution: 20 })
  const samples = new Map()
  let active = 0
  let maxActive = 0
  let errors = 0
  loop.enable()

  function measure(label, task) {
    const started = performance.now()
    active++
    maxActive = Math.max(maxActive, active)
    return Promise.resolve().then(task).then(
      (value) => { record(label, started); return value },
      (error) => { errors++; record(label, started); throw error }
    ).finally(() => { active-- })
  }

  function record(label, started) {
    const values = samples.get(label) || []
    values.push(performance.now() - started)
    samples.set(label, values)
  }

  function snapshot() {
    const timings = {}
    for (const [label, values] of samples) {
      values.sort((a, b) => a - b)
      const at = (p) => Number(values[Math.ceil(p * values.length) - 1].toFixed(2))
      timings[label] = { count: values.length, p50_ms: at(.5), p95_ms: at(.95), p99_ms: at(.99) }
    }
    const result = { name, pid: process.pid, rss_mb: Number((process.memoryUsage().rss / 1048576).toFixed(1)), active, maxActive, errors, loop_p95_ms: Number((loop.percentile(95) / 1e6).toFixed(2)), timings }
    samples.clear()
    maxActive = active
    errors = 0
    loop.reset()
    return result
  }

  const timer = setInterval(() => log('[PERF] ' + JSON.stringify(snapshot())), intervalMs)
  timer.unref()
  return { measure, snapshot, close() { clearInterval(timer); loop.disable() } }
}

module.exports = { createPerfMetrics }
