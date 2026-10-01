'use strict'

const fs = require('fs')
const path = require('path')
const zoomLicense = require('./zoom-license')
const zoomPool = require('./zoom-pool')

const CONFIG_DIR = path.join(__dirname, '..', 'config')

function read(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(value)) throw new Error(`${file} must contain an array`)
    return value
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temp, file)
}

async function refreshAllLicenses({ license = zoomLicense, pool = zoomPool, configDir = CONFIG_DIR } = {}) {
  const fetchedByAccount = new Map()
  const tiers = []

  for (const tier of pool.VALID_TIERS) {
    const activeFile = path.join(configDir, `zoom-pool-${tier}.json`)
    const archiveFile = path.join(configDir, `zoom-pool-${tier}.archive.json`)
    const active = read(activeFile)
    const archive = read(archiveFile)
    const activeIds = new Set(active.map((host) => String(host.accountId)))
    const hosts = [...active, ...archive.filter((host) => !activeIds.has(String(host.accountId)))]
    const results = []
    const nextActive = []
    const nextArchive = []

    for (const host of hosts) {
      let fetched = fetchedByAccount.get(host.accountId)
      if (!fetched) {
        fetched = await license.getHostLicense(host, { forceRefresh: true })
        fetchedByAccount.set(host.accountId, fetched)
      }

      const expiry = pool.getHostExpiryStatus ? pool.getHostExpiryStatus(host) : { ok: true }
      const verdict = !expiry.ok
        ? { ok: false, reason: expiry.reason, error: expiry.detail }
        : fetched.ok
          ? { ...license.evaluate(fetched.info, tier), info: fetched.info }
          : { ok: false, reason: fetched.reason, error: fetched.error }
      const ready = verdict.ok
      const wasActive = activeIds.has(String(host.accountId))
      const destination = verdict.reason === 'API_ERROR'
        ? (wasActive ? nextActive : nextArchive)
        : ready ? nextActive : nextArchive
      destination.push(host)
      results.push({
        label: host.label,
        accountId: host.accountId,
        ok: ready,
        capacity: verdict.capacity || (verdict.info && verdict.info.effectiveCapacity) || 0,
        reason: ready ? null : license.reasonText(verdict, tier),
      })
    }

    atomicWrite(activeFile, nextActive)
    atomicWrite(archiveFile, nextArchive)
    if (pool.clearCache) pool.clearCache(tier)

    tiers.push({
      tier,
      total: results.length,
      ready: results.filter((result) => result.ok).length,
      results,
    })
  }

  return { refreshedAt: Date.now(), tiers }
}

function formatLicenseSummary(snapshot) {
  const lines = ['📊 *REFRESH LISENSI ZOOM 01:00 WIB*', '']
  for (const item of snapshot.tiers) {
    lines.push(`*${item.tier}p:* ${item.ready}/${item.total} akun siap pakai`)
    for (const failed of item.results.filter((result) => !result.ok)) {
      lines.push(`❌ ${failed.label}: ${failed.reason}`)
    }
  }
  return lines.join('\n')
}

module.exports = { refreshAllLicenses, formatLicenseSummary }
