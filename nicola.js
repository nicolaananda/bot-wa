const { spawn } = require('child_process');
const path = require('path')

let restartCount = 0
let lastRestartTime = 0
const MAX_RESTARTS = 5
const RESTART_WINDOW_MS = 60000

function start() {
  let args = [path.join(__dirname, 'main.js'), ...process.argv.slice(2)]
  console.log([process.argv[0], ...args].join('\n'))
  let p = spawn(process.argv[0], args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  }).on('message', data => {
    if (data == 'reset') {
      console.log('Restarting Bot...')
      restartCount = 0
      p.kill()
      start()
      delete p
    }
  }).on('exit', code => {
    console.error('Exited with code:', code)
    if (code == '.' || code == 1) {
      const now = Date.now()
      if (now - lastRestartTime > RESTART_WINDOW_MS) {
        restartCount = 0
      }
      restartCount++
      lastRestartTime = now

      if (restartCount > MAX_RESTARTS) {
        console.error(`[LAUNCHER] Too many restarts (${MAX_RESTARTS}) within ${RESTART_WINDOW_MS / 1000}s. Stopping.`)
        process.exit(1)
      }

      const backoff = Math.min(restartCount * 2000, 30000)
      console.log(`[LAUNCHER] Restarting in ${backoff / 1000}s (attempt ${restartCount}/${MAX_RESTARTS})...`)
      setTimeout(() => start(), backoff)
    }
  })
}

start()