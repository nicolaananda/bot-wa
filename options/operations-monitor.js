#!/usr/bin/env node
'use strict'

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { collect } = require('../lib/operations-monitor')
const { sendOperationalAlert } = require('../lib/telegram-notifier')
const pg = require('../config/postgres')
const redisModule = require('../config/redis')

const statePath = process.env.BOT_WA_OPS_STATE || '/var/lib/bot-wa-ops/monitor-state.json'
let state = {}
try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')) } catch {}

collect({ pg, redis: redisModule.getRedis(), state }).then(async report => {
  const previous = new Set(state.activeAlerts || [])
  const fresh = report.alerts.filter(alert => !previous.has(alert))
  if (fresh.length) await sendOperationalAlert(`bot-wa: ${fresh.join(', ')}`)
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 })
  const temp = `${statePath}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(report.nextState), { mode: 0o600 })
  fs.renameSync(temp, statePath)
  const { nextState, ...safeReport } = report
  console.log(JSON.stringify(safeReport))
  process.exitCode = 0
}).catch(error => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) }))
  process.exitCode = 2
}).finally(() => Promise.allSettled([pg.closePool(), redisModule.closeRedis()]))
