'use strict'

const zoomLicense = require('./zoom-license')
const zoomPool = require('./zoom-pool')

async function refreshAllLicenses({ license = zoomLicense, pool = zoomPool } = {}) {
  const fetchedByAccount = new Map()
  const tiers = []

  for (const tier of pool.VALID_TIERS) {
    const hosts = pool.loadPool(tier)
    const results = []

    for (const host of hosts) {
      let fetched = fetchedByAccount.get(host.accountId)
      if (!fetched) {
        fetched = await license.getHostLicense(host, { forceRefresh: true })
        fetchedByAccount.set(host.accountId, fetched)
      }

      const verdict = fetched.ok
        ? { ...license.evaluate(fetched.info, tier), info: fetched.info }
        : { ok: false, reason: fetched.reason, error: fetched.error }
      const ready = verdict.ok && !host.disabledAt
      results.push({
        label: host.label,
        accountId: host.accountId,
        ok: ready,
        capacity: verdict.capacity || (verdict.info && verdict.info.effectiveCapacity) || 0,
        reason: ready
          ? null
          : host.disabledAt
            ? `disabled: ${host.disabledDetail || host.disabledReason || 'manual'}`
            : license.reasonText(verdict, tier),
      })
    }

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
  const lines = ['📊 *REFRESH LISENSI ZOOM 03:00 WIB*', '']
  for (const item of snapshot.tiers) {
    lines.push(`*${item.tier}p:* ${item.ready}/${item.total} akun siap pakai`)
    for (const failed of item.results.filter((result) => !result.ok)) {
      lines.push(`❌ ${failed.label}: ${failed.reason}`)
    }
  }
  return lines.join('\n')
}

module.exports = { refreshAllLicenses, formatLicenseSummary }
