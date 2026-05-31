/**
 * Zoom License / Capacity Validator
 *
 * Verifies that a Zoom host (Server-to-Server OAuth account) actually has the
 * licence + Large Meeting capacity required by a given tier (100/300/500/1000)
 * BEFORE we promise the user a meeting.
 *
 * Why this matters:
 *   - Basic (free, type=1) accounts auto-cut at 40 minutes. We must never use
 *     them for any paid tier.
 *   - Licensed (paid, type=2) accounts default to 100p. To host 300/500/1000
 *     they MUST also have the Large Meeting add-on with sufficient capacity.
 *   - Suspended / pending accounts will fail at create time AFTER we already
 *     took payment — too late.
 *
 * Caching: in-memory per host accountId, default TTL 1 hour. The cache key is
 * (accountId + tier-snapshot) so different tier checks share the underlying
 * Zoom API result. Use `clearCache()` on suspected drift, or call any helper
 * with `{ forceRefresh: true }`.
 *
 * Returns:
 *   { ok: true, capacity, plan, source } when the host meets the tier
 *   { ok: false, reason, capacity, plan, source } otherwise
 *
 * `reason` enum:
 *   - 'BASIC_PLAN'           type === 1 (free)
 *   - 'INACTIVE'             status not 'active'
 *   - 'NO_LARGE_MEETING'     tier > 100 but addon disabled
 *   - 'CAPACITY_TOO_LOW'     addon enabled but capacity < tier
 *   - 'API_ERROR'            could not fetch user/settings
 */

const zoomClient = require('./zoom-client')

const VALID_TIERS = [100, 300, 500, 1000]
const DEFAULT_TTL_MS = Number(process.env.ZOOM_LICENSE_CACHE_TTL_MS) || 60 * 60 * 1000

// Map: accountId -> { fetchedAt, info }
const cache = new Map()

// In-flight de-dup: accountId -> Promise (avoids stampede when many users buy
// the same tier at the same time)
const inflight = new Map()

function isValidTier(tier) {
  return VALID_TIERS.includes(Number(tier))
}

function clearCache(accountId) {
  if (accountId == null) {
    cache.clear()
    return
  }
  cache.delete(String(accountId))
}

function _now() {
  return Date.now()
}

/**
 * Read the relevant fields off the user + user/settings responses and shape
 * them into a normalised license info object we can evaluate.
 *
 * Zoom field reference:
 *   user.type:           1 = Basic, 2 = Licensed, 3 = On-prem
 *   user.status:         active | inactive | pending
 *   user.plan_type:      legacy field, sometimes absent
 *   settings.feature.meeting_capacity:        base capacity (usually 100)
 *   settings.feature.large_meeting:           addon enabled? (bool)
 *   settings.feature.large_meeting_capacity:  300 | 500 | 1000
 */
function _normaliseInfo(user, settings) {
  const u = user || {}
  const f = (settings && settings.feature) || {}
  const baseCapacity = Number(f.meeting_capacity) || 100
  const hasLargeAddon = Boolean(f.large_meeting)
  const largeCapacity = Number(f.large_meeting_capacity) || 0
  // Effective capacity: the largest of base, large addon, or 0 if disabled.
  const effectiveCapacity = hasLargeAddon ? Math.max(baseCapacity, largeCapacity) : baseCapacity

  return {
    accountId: u.account_id || null,
    userId: u.id || null,
    email: u.email || null,
    type: Number(u.type) || 0, // 1=Basic, 2=Licensed, 3=On-prem
    status: u.status || 'unknown',
    planType: u.plan_type || null,
    baseCapacity,
    hasLargeAddon,
    largeCapacity,
    effectiveCapacity,
    // Keep raw refs for diagnostics; the cache holds tiny objects either way.
    _rawFeature: f,
  }
}

/**
 * Fetch (and cache) license info for one host. Use `forceRefresh: true` to
 * bypass cache and re-fetch from Zoom.
 *
 * @returns {Promise<{ok:true, info, source:'cache'|'api'} | {ok:false, reason:'API_ERROR', error}>}
 */
async function getHostLicense(host, { forceRefresh = false, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!host || !host.accountId) {
    return { ok: false, reason: 'API_ERROR', error: new Error('host.accountId required') }
  }
  const key = String(host.accountId)

  if (!forceRefresh) {
    const cached = cache.get(key)
    if (cached && _now() - cached.fetchedAt < ttlMs) {
      return { ok: true, info: cached.info, source: 'cache' }
    }
  }

  // De-dup concurrent requests
  if (inflight.has(key)) {
    const result = await inflight.get(key)
    return result
  }

  const promise = (async () => {
    try {
      // Run user + settings in parallel; both are cheap GETs.
      const [user, settings] = await Promise.all([
        zoomClient.getUser({ creds: host }),
        zoomClient.getUserSettings({ creds: host }),
      ])
      const info = _normaliseInfo(user, settings)
      cache.set(key, { fetchedAt: _now(), info })
      return { ok: true, info, source: 'api' }
    } catch (err) {
      // Don't poison cache on transient errors. Caller decides what to do.
      return {
        ok: false,
        reason: 'API_ERROR',
        error: err && err.message ? err.message : String(err),
      }
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, promise)
  return promise
}

/**
 * Evaluate a license info object against a tier.
 * Pure function — no side effects, no API calls.
 *
 * @returns {{ok:true,capacity:number,plan:string} | {ok:false,reason:string,capacity:number,plan:string}}
 */
function evaluate(info, tier) {
  const t = Number(tier)
  const planLabel =
    info.type === 1
      ? 'Basic'
      : info.type === 2
        ? 'Licensed'
        : info.type === 3
          ? 'On-Prem'
          : `type=${info.type}`

  if (info.status && info.status !== 'active') {
    return {
      ok: false,
      reason: 'INACTIVE',
      capacity: info.effectiveCapacity,
      plan: planLabel,
      status: info.status,
    }
  }
  if (info.type === 1) {
    return {
      ok: false,
      reason: 'BASIC_PLAN',
      capacity: info.effectiveCapacity,
      plan: planLabel,
    }
  }
  if (t > 100) {
    // What actually matters is effective capacity >= tier. Zoom Business plans
    // ship 300p in the BASE plan (meeting_capacity: 300, large_meeting: false),
    // so we must NOT require the large_meeting add-on flag outright. The add-on
    // is only needed when the base capacity is below the tier (e.g. 500/1000).
    if (info.effectiveCapacity < t) {
      return {
        ok: false,
        // If there's no add-on and base is too small, the host needs the Large
        // Meeting add-on; if the add-on is present but still short, capacity is
        // simply too low for this tier.
        reason: info.hasLargeAddon ? 'CAPACITY_TOO_LOW' : 'NO_LARGE_MEETING',
        capacity: info.effectiveCapacity,
        plan: planLabel,
      }
    }
  }
  return {
    ok: true,
    capacity: info.effectiveCapacity,
    plan: planLabel,
  }
}

/**
 * Convenience: fetch + evaluate in one call.
 *
 * @returns {Promise<{ok:true, capacity, plan, source} | {ok:false, reason, capacity, plan, source, error?}>}
 */
async function checkHostForTier(host, tier, opts = {}) {
  if (!isValidTier(tier)) {
    return { ok: false, reason: 'API_ERROR', error: `Invalid tier: ${tier}` }
  }
  const fetched = await getHostLicense(host, opts)
  if (!fetched.ok) {
    return {
      ok: false,
      reason: fetched.reason,
      error: fetched.error,
      source: 'api',
    }
  }
  const verdict = evaluate(fetched.info, tier)
  return { ...verdict, source: fetched.source, info: fetched.info }
}

/**
 * Build a human-friendly reason string for chat replies / logs.
 */
function reasonText(verdict, tier) {
  if (verdict.ok) return `OK (${verdict.plan}, ${verdict.capacity}p)`
  switch (verdict.reason) {
    case 'BASIC_PLAN':
      return `akun Basic (free) — tidak boleh dipakai untuk tier ${tier}p`
    case 'INACTIVE':
      return `status akun: ${verdict.status || 'inactive'}`
    case 'NO_LARGE_MEETING':
      return `tidak punya Large Meeting add-on (butuh untuk ${tier}p)`
    case 'CAPACITY_TOO_LOW':
      return `kapasitas Large Meeting hanya ${verdict.capacity}p (butuh ${tier}p)`
    case 'API_ERROR':
      return `gagal cek lisensi: ${verdict.error || 'unknown error'}`
    default:
      return `tidak memenuhi syarat tier ${tier}p`
  }
}

module.exports = {
  VALID_TIERS,
  isValidTier,
  getHostLicense,
  evaluate,
  checkHostForTier,
  reasonText,
  clearCache,
}
