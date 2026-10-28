'use strict'

const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { checkUrl } = require('./health')
const execFileAsync = promisify(execFile)

function ageHours(path, now = Date.now()) {
  try { return (now - fs.statSync(path).mtimeMs) / 3600000 } catch { return null }
}

async function pm2Status(state = {}) {
  const { stdout } = await execFileAsync('pm2', ['jlist'], { timeout: 5000 })
  const wanted = new Set(['bot-wa', 'api'])
  return JSON.parse(stdout).filter(item => wanted.has(item.name)).map(item => {
    const restarts = Number(item.pm2_env?.restart_time || 0)
    const baseline = state.pm2?.[item.name]
    return { name: item.name, ok: item.pm2_env?.status === 'online', status: item.pm2_env?.status || 'missing',
      restarts, restartDelta: baseline == null ? 0 : Math.max(0, restarts - Number(baseline)) }
  })
}

async function reconciliation(pg) {
  const result = await pg.query(`WITH recent_transactions AS MATERIALIZED (
      SELECT ref_id,status,meta FROM transaksi WHERE created_at >= now()-interval '14 days'
    ), anomalies AS (
    SELECT o.order_id,'paid_without_ledger' reason FROM business_orders o
      WHERE o.status IN ('processing','delivery_pending','completed') AND o.kind='qris'
        AND o.created_at >= now()-interval '14 days'
        AND NOT EXISTS (SELECT 1 FROM recent_transactions t WHERE t.meta->>'orderId'=o.order_id)
    UNION ALL SELECT o.order_id,'ledger_without_paid_order' FROM recent_transactions t
      JOIN business_orders o ON o.order_id=t.meta->>'orderId'
      WHERE t.status='completed' AND o.status IN ('awaiting_payment','cancelled','expired')
    UNION ALL SELECT o.order_id,'fulfillment_without_outbox' FROM business_orders o
      JOIN order_fulfillments f ON f.order_id=o.order_id
      WHERE f.status='delivery_pending' AND NOT EXISTS (SELECT 1 FROM delivery_outbox d WHERE d.order_id=o.order_id)
    UNION ALL SELECT o.order_id,'completed_with_unsent_delivery' FROM business_orders o
      WHERE o.status='completed' AND EXISTS (SELECT 1 FROM delivery_outbox d WHERE d.order_id=o.order_id AND d.status<>'sent')
    UNION ALL SELECT w.order_id,'paid_webhook_without_order' FROM midtrans_webhooks w
      WHERE w.created_at >= now()-interval '14 days' AND w.transaction_status IN ('settlement','capture')
        AND w.lifecycle_status='completed' AND w.order_id ~ '^(MID|ZOOM)-'
        AND NOT EXISTS (SELECT 1 FROM business_orders o WHERE o.order_id=w.order_id OR o.provider_order_id=w.order_id)
        AND NOT EXISTS (SELECT 1 FROM recent_transactions t WHERE t.meta->>'orderId'=w.order_id OR t.meta->>'midtransOrderId'=w.order_id OR t.ref_id='DEP-MIDTRANS-'||w.order_id)
  ) SELECT reason,count(*)::integer count,(array_agg(order_id ORDER BY order_id))[1:20] identifiers
    FROM anomalies GROUP BY reason ORDER BY reason`)
  return result.rows
}

async function collect({ pg, redis, gowaUrl = process.env.GOWA_API_URL, state = {}, now = Date.now(),
  backupPaths = (process.env.BOT_WA_BACKUP_MARKERS || '/var/lib/bot-wa-ops/local-backup-success,/var/lib/bot-wa-ops/r2-backup-success').split(',') } = {}) {
  const [postgres, redisResult, gowa, pm2, outbox, webhooks, reconcile, archiver] = await Promise.allSettled([
    pg.query('SELECT 1').then(() => ({ ok: true })), redis.ping().then(value => ({ ok: value === 'PONG' })),
    gowaUrl ? checkUrl(gowaUrl, 5000) : Promise.resolve({ ok: false, disabled: true }), pm2Status(state),
    pg.query(`SELECT d.status,count(*)::integer count,min(d.created_at) oldest FROM delivery_outbox d
      WHERE NOT EXISTS (SELECT 1 FROM operational_anomaly_resolutions r
        WHERE r.anomaly_type='delivery_outbox' AND r.anomaly_id=d.id)
      GROUP BY d.status ORDER BY d.status`),
    pg.query(`SELECT w.lifecycle_status,count(*)::integer count,min(w.created_at) oldest FROM midtrans_webhooks w
      WHERE w.lifecycle_status<>'completed' AND w.created_at >= now()-interval '14 days'
        AND NOT EXISTS (SELECT 1 FROM operational_anomaly_resolutions r
          WHERE r.anomaly_type='midtrans_webhook' AND r.anomaly_id=w.id)
      GROUP BY w.lifecycle_status ORDER BY w.lifecycle_status`), reconciliation(pg),
    pg.query(`SELECT archived_count::integer,failed_count::integer,last_archived_wal,last_archived_time,
      last_failed_wal,last_failed_time FROM pg_stat_archiver`).then(result => result.rows[0]),
  ])
  const value = (entry, fallback) => entry.status === 'fulfilled' ? entry.value : fallback
  const backups = backupPaths.filter(Boolean).map(path => {
    const hours = ageHours(path, now)
    const failedHours = ageHours(`${path}.failed`, now)
    const maxHours = path.endsWith('pitr-base-success') ? 8 * 24 : 30
    return { name: path.split('/').pop(), ok: hours != null && hours <= maxHours && (failedHours == null || failedHours > hours),
      ageHours: hours == null ? null : Math.round(hours * 10) / 10, failed: failedHours != null && (hours == null || failedHours < hours) }
  })
  const disk = fs.statfsSync('/')
  const diskUsedPercent = Math.round((1 - disk.bavail / disk.blocks) * 1000) / 10
  const availableMemoryPercent = Math.round(os.freemem() / os.totalmem() * 1000) / 10
  const processes = value(pm2, [])
  if (!processes.some(item => item.name === 'bot-wa')) processes.push({ name: 'bot-wa', ok: false, status: 'missing', restarts: 0, restartDelta: 0 })
  if (!processes.some(item => item.name === 'api')) processes.push({ name: 'api', ok: false, status: 'missing', restarts: 0, restartDelta: 0 })
  const report = { generatedAt: new Date(now).toISOString(), backups, processes,
    dependencies: { postgres: value(postgres, { ok: false }), redis: value(redisResult, { ok: false }), gowa: value(gowa, { ok: false }) },
    resources: { diskUsedPercent, availableMemoryPercent },
    outbox: value(outbox, { rows: [] }).rows || [], webhooks: value(webhooks, { rows: [] }).rows || [],
    reconciliation: value(reconcile, [{ reason: 'reconciliation_check_failed', count: 1, identifiers: [] }]),
    walArchive: value(archiver, { archived_count: 0, failed_count: 1 }) }
  report.alerts = [
    ...backups.filter(x => !x.ok).map(x => `backup:${x.name}`), ...processes.filter(x => !x.ok).map(x => `process:${x.name}:${x.status}`),
    ...processes.filter(x => x.restartDelta >= 3).map(x => `restart_loop:${x.name}:${x.restartDelta}`),
    ...Object.entries(report.dependencies).filter(([, x]) => !x.ok).map(([name]) => `dependency:${name}`),
    ...(diskUsedPercent >= 85 ? [`disk:${diskUsedPercent}`] : []), ...(availableMemoryPercent <= 10 ? [`memory:${availableMemoryPercent}`] : []),
    ...report.outbox.filter(x => ['manual_review', 'failed'].includes(x.status) && Number(x.count) > 0).map(x => `outbox:${x.status}:${x.count}`),
    ...report.webhooks.filter(x => Number(x.count) > 0).map(x => `webhook:${x.lifecycle_status}:${x.count}`),
    ...report.reconciliation.filter(x => Number(x.count) > 0).map(x => `reconcile:${x.reason}:${x.count}`),
    ...(Number(report.walArchive.failed_count) > 0 ? [`wal_archive_failed:${report.walArchive.failed_count}`] : []),
    ...(!report.walArchive.last_archived_time || now - new Date(report.walArchive.last_archived_time).getTime() > 15 * 60 * 1000 ? ['wal_archive_stale'] : []),
  ]
  report.ok = report.alerts.length === 0
  report.nextState = { pm2: Object.fromEntries(processes.map(x => [x.name, x.restarts])), activeAlerts: report.alerts }
  return report
}

module.exports = { ageHours, collect, pm2Status, reconciliation }
