'use strict'

const http = require('http')
const https = require('https')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

async function checkUrl(url, timeout = 3000) {
  return new Promise((resolve) => {
    const request = (url.startsWith('https:') ? https : http).get(url, { timeout }, (res) => {
      res.resume()
      resolve({ ok: res.statusCode < 500, status: res.statusCode })
    })
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', () => resolve({ ok: false }))
  })
}

async function collectHealth({ pg, redis, gowaUrl = process.env.GOWA_API_URL, pm2 = true } = {}) {
  const checks = await Promise.allSettled([
    redis ? redis.ping().then((value) => ({ ok: value === 'PONG' })) : Promise.resolve({ ok: false, disabled: true }),
    pg ? pg.query('SELECT 1').then(() => ({ ok: true })) : Promise.resolve({ ok: false, disabled: true }),
    gowaUrl ? checkUrl(gowaUrl) : Promise.resolve({ ok: false, disabled: true }),
    pg ? pg.query(`SELECT
      count(*) FILTER (WHERE status='completed')::integer completed,
      count(*) FILTER (WHERE status='pending')::integer pending,
      count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::integer last_24h
      FROM transaksi`).then((result) => result.rows[0]) : Promise.resolve({ completed: 0, pending: 0, last_24h: 0 }),
    pm2 ? execFileAsync('pm2', ['jlist']).then(({ stdout }) => {
      const item = JSON.parse(stdout).find((entry) => entry.name === 'bot-wa')
      return { ok: item?.pm2_env?.status === 'online', status: item?.pm2_env?.status || 'missing', restarts: item?.pm2_env?.restart_time || 0 }
    }) : Promise.resolve({ ok: true, status: 'test', restarts: 0 }),
  ])
  const value = (index, fallback) => checks[index].status === 'fulfilled' ? checks[index].value : fallback
  const memory = process.memoryUsage()
  return {
    generatedAt: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()),
    memory: { rssMiB: Math.round(memory.rss / 1048576), heapUsedMiB: Math.round(memory.heapUsed / 1048576) },
    dependencies: { redis: value(0, { ok: false }), postgres: value(1, { ok: false }), gowa: value(2, { ok: false }), pm2: value(4, { ok: false }) },
    orders: value(3, { completed: 0, pending: 0, last_24h: 0 }),
  }
}

function canUseAdminCommand({ isOwner, isGroup, isGroupAdmin }) {
  return Boolean(isOwner || (isGroup && isGroupAdmin))
}

function formatHealth(data) {
  const state = (item) => item.ok ? 'OK' : item.disabled ? 'OFF' : 'GAGAL'
  return `*Status Bot*\nPM2: ${state(data.dependencies.pm2)}\nRedis: ${state(data.dependencies.redis)}\nPostgreSQL: ${state(data.dependencies.postgres)}\nGoWA: ${state(data.dependencies.gowa)}\nMemori: ${data.memory.rssMiB} MiB\nUptime: ${data.uptimeSeconds}s\nOrder 24j: ${data.orders.last_24h}\nPending: ${data.orders.pending}`
}

module.exports = { canUseAdminCommand, checkUrl, collectHealth, formatHealth }
