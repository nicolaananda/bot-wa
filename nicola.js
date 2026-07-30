const { spawn } = require('child_process');
const path = require('path')

let restartCount = 0
const MAX_RESTARTS = 5
const RESTART_WINDOW_MS = 60000
const COOLDOWN_MS = 60000

function start() {
  const startedAt = Date.now()
  const args = [path.join(__dirname, 'main.js'), ...process.argv.slice(2)]
  console.log([process.argv[0], ...args].join('\n'))
  let p = spawn(process.argv[0], args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  }).on('message', data => {
    if (data == 'reset') {
      console.log('Restarting Bot...')
      restartCount = 0
      p.kill()
      start()
      p = undefined
    }
  }).on('exit', code => {
    console.error('Exited with code:', code)
    if (code == '.' || code == 1) {
      if (Date.now() - startedAt >= RESTART_WINDOW_MS) restartCount = 0
      restartCount++
      const attempt = restartCount
      const coolingDown = attempt >= MAX_RESTARTS
      const backoff = coolingDown ? COOLDOWN_MS : Math.min(attempt * 2000, 30000)
      // ponytail: fixed cooldown is capped at 60s; add exponential outage backoff if upstream outages become longer.
      if (coolingDown) {
        console.error(`[LAUNCHER] ${MAX_RESTARTS} rapid failures; cooling down for ${COOLDOWN_MS / 1000}s before retrying.`)
        restartCount = 0
      }
      console.log(`[LAUNCHER] Restarting in ${backoff / 1000}s (attempt ${attempt}/${MAX_RESTARTS})...`)
      setTimeout(start, backoff)
    }
  })
}

if (require.main === module) start()

module.exports = { start, MAX_RESTARTS, RESTART_WINDOW_MS, COOLDOWN_MS }
