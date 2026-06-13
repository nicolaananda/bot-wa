/**
 * Zoom Host Pool — manage Zoom Server-to-Server OAuth account pools per
 * meeting tier (100p, 300p, 500p, 1000p), and find the first host that
 * is free at a requested time window.
 *
 * Pool files (per tier):
 *   config/zoom-pool-100.json   (100 participants)
 *   config/zoom-pool-300.json   (300 participants)
 *   config/zoom-pool-500.json   (500 participants)
 *   config/zoom-pool-1000.json  (1000 participants)
 *
 * Backwards compat: if config/zoom-pool-100.json doesn't exist but
 * config/zoom-pool.json does, the legacy file is used for tier 100.
 *
 * Per-pool entry format:
 *   { label, accountId, clientId, clientSecret, userId?, timezone?,
 *     hostKey?, concurrentMeetings?, notes? }
 *
 * concurrentMeetings (optional) — how many concurrent meetings the host
 * licence allows. Default: see TIER_DEFAULT_CONCURRENT below. Zoom 300p
 * licences ship with 2 concurrent slots; 100p/500p/1000p with 1.
 */

const fs = require('fs')
const path = require('path')
const zoomClient = require('./zoom-client')
const zoomLicense = require('./zoom-license')
const zoomBackdate = require('./zoom-backdate')

const VALID_TIERS = [100, 300, 500, 1000]

// How many concurrent meetings each tier's licence usually supports.
// Zoom 300p licence: 2 concurrent. Others: 1.
const TIER_DEFAULT_CONCURRENT = {
  100: 1,
  300: 2,
  500: 1,
  1000: 1,
}

const CONFIG_DIR = path.join(__dirname, '..', 'config')
const LEGACY_POOL_FILE = path.join(CONFIG_DIR, 'zoom-pool.json')

function poolFileForTier(tier) {
  return path.join(CONFIG_DIR, `zoom-pool-${tier}.json`)
}

function isValidTier(tier) {
  return VALID_TIERS.includes(Number(tier))
}

// Per-tier cache
const cacheByTier = new Map() // tier -> { pool, mtimeMs, file }

function sanitize(entry, index, tier) {
  if (!entry || typeof entry !== 'object') return null
  const accountId = String(entry.accountId || '').trim()
  const clientId = String(entry.clientId || '').trim()
  const clientSecret = String(entry.clientSecret || '').trim()
  if (!accountId || !clientId || !clientSecret) return null

  const userId = String(entry.userId || 'me').trim() || 'me'
  const label = String(entry.label || `Host #${index + 1}`).trim() || `Host #${index + 1}`
  const timezone = entry.timezone ? String(entry.timezone).trim() : null
  const notes = entry.notes ? String(entry.notes) : ''
  const hostKey = entry.hostKey ? String(entry.hostKey).trim() : ''

  // concurrentMeetings: allow per-host override, else fall back to tier default,
  // else 1. Clamped to >= 1.
  const tierDefault = TIER_DEFAULT_CONCURRENT[Number(tier)] || 1
  const rawConcurrent = Number(entry.concurrentMeetings)
  const concurrentMeetings =
    Number.isFinite(rawConcurrent) && rawConcurrent >= 1 ? Math.floor(rawConcurrent) : tierDefault

  // Health flags. Persisted across restarts so a sick host stays skipped
  // until owner enables it again or auto-recovery runs.
  const disabledAt = entry.disabledAt ? String(entry.disabledAt) : null
  const disabledReason = entry.disabledReason ? String(entry.disabledReason) : null
  const disabledDetail = entry.disabledDetail ? String(entry.disabledDetail) : null

  return {
    label,
    accountId,
    clientId,
    clientSecret,
    userId,
    timezone,
    notes,
    hostKey,
    concurrentMeetings,
    disabledAt,
    disabledReason,
    disabledDetail,
  }
}

function loadFile(file) {
  const stat = fs.statSync(file) // throws ENOENT if missing
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON array at the top level`)
  }
  return { stat, parsed }
}

/**
 * Load the pool for a given tier.
 * Caches by mtime so edits in-place are picked up without restart.
 *
 * @param {number} tier
 * @returns {Array<object>} entries (may be empty)
 */
function loadPool(tier = 100) {
  if (!isValidTier(tier)) {
    throw new Error(`Invalid tier: ${tier}. Allowed: ${VALID_TIERS.join(', ')}`)
  }
  const tierKey = Number(tier)
  const tierFile = poolFileForTier(tierKey)

  // Try the tier-specific file first
  let resolvedFile = tierFile
  let stat
  let parsed
  try {
    const r = loadFile(tierFile)
    stat = r.stat
    parsed = r.parsed
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      // Fallback: only tier 100 maps to legacy zoom-pool.json
      if (tierKey === 100) {
        try {
          const r = loadFile(LEGACY_POOL_FILE)
          stat = r.stat
          parsed = r.parsed
          resolvedFile = LEGACY_POOL_FILE
        } catch (e2) {
          if (e2 && e2.code === 'ENOENT') {
            cacheByTier.set(tierKey, { pool: [], mtimeMs: 0, file: tierFile })
            return []
          }
          throw e2
        }
      } else {
        cacheByTier.set(tierKey, { pool: [], mtimeMs: 0, file: tierFile })
        return []
      }
    } else {
      throw e
    }
  }

  // mtime cache
  const cached = cacheByTier.get(tierKey)
  if (cached && cached.file === resolvedFile && cached.mtimeMs === stat.mtimeMs) {
    return cached.pool
  }

  const cleaned = parsed.map((entry, i) => sanitize(entry, i, tierKey)).filter(Boolean)
  cacheByTier.set(tierKey, { pool: cleaned, mtimeMs: stat.mtimeMs, file: resolvedFile })
  return cleaned
}

function clearCache(tier) {
  if (tier == null) {
    cacheByTier.clear()
    return
  }
  cacheByTier.delete(Number(tier))
}

// Reasons that justify auto-marking a host as disabled in the pool file.
// API_ERROR is intentionally excluded — it's transient (scope/network).
const PERSISTENT_LICENSE_FAIL_REASONS = new Set([
  'BASIC_PLAN',
  'INACTIVE',
  'NO_LARGE_MEETING',
  'CAPACITY_TOO_LOW',
])

/**
 * Internal: evaluate one host for tier readiness with auto health-flag
 * management.
 *
 * Behavior:
 *   - If host has `disabledAt`, skip immediately. But once per call, attempt
 *     a force-refresh license check; if the host is now healthy, clear the
 *     flag and proceed (auto-recovery).
 *   - On healthy result: ensure `disabledAt` is cleared (idempotent).
 *   - On persistent failure (BASIC_PLAN/INACTIVE/NO_LARGE_MEETING/
 *     CAPACITY_TOO_LOW): mark disabled (idempotent → only fires listener
 *     once per transition).
 *   - On API_ERROR: do NOT mark, just skip this round.
 *
 * @returns {{healthy:true, verdict} | {healthy:false, hostReason}}
 */
async function _evaluateLicenseGate(host, tier) {
  // Pre-disabled host: try recovery once via forced refresh.
  if (host.disabledAt) {
    try {
      const recheck = await zoomLicense.checkHostForTier(host, tier, {
        forceRefresh: true,
      })
      if (recheck.ok) {
        enableHost(tier, { accountId: host.accountId })
        return { healthy: true, verdict: recheck }
      }
      return {
        healthy: false,
        hostReason: {
          label: host.label,
          status: 'disabled',
          reason: host.disabledReason || recheck.reason,
          detail: host.disabledDetail || zoomLicense.reasonText(recheck, tier),
          plan: recheck.plan || null,
          capacity: recheck.capacity || null,
          disabledAt: host.disabledAt,
        },
      }
    } catch {
      return {
        healthy: false,
        hostReason: {
          label: host.label,
          status: 'disabled',
          reason: host.disabledReason || 'UNKNOWN',
          detail: host.disabledDetail || 'host previously marked disabled',
          disabledAt: host.disabledAt,
        },
      }
    }
  }

  const verdict = await zoomLicense.checkHostForTier(host, tier)
  if (verdict.ok) {
    return { healthy: true, verdict }
  }
  if (PERSISTENT_LICENSE_FAIL_REASONS.has(verdict.reason)) {
    markHostDisabled(
      tier,
      { accountId: host.accountId },
      {
        reason: verdict.reason,
        detail: zoomLicense.reasonText(verdict, tier),
      }
    )
  }
  return {
    healthy: false,
    hostReason: {
      label: host.label,
      status: verdict.reason === 'API_ERROR' ? 'error' : 'unlicensed',
      reason: verdict.reason,
      detail: zoomLicense.reasonText(verdict, tier),
      plan: verdict.plan || null,
      capacity: verdict.capacity || null,
    },
  }
}

async function findFirstLicensedHost(tier = 100) {
  const pool = loadPool(tier)
  if (!pool.length) return { ok: false, error: 'POOL_EMPTY', reasons: [] }

  const reasons = []
  for (const host of pool) {
    try {
      const gate = await _evaluateLicenseGate(host, tier)
      if (gate.healthy) {
        return {
          ok: true,
          host,
          license: {
            plan: gate.verdict.plan,
            capacity: gate.verdict.capacity,
            source: gate.verdict.source,
          },
        }
      }
      reasons.push(gate.hostReason)
    } catch (err) {
      reasons.push({
        label: host.label,
        status: 'error',
        detail: err && err.message ? err.message : String(err),
      })
    }
  }

  return { ok: false, error: 'NO_LICENSED_HOST', reasons }
}

/**
 * Iterate the tier's pool sequentially (failover). For each host:
 *   1. Count conflicting meetings in the requested window.
 *   2. If conflicts >= host.concurrentMeetings, skip as 'busy'.
 *   3. Otherwise, create the meeting via createMeeting() and return.
 *
 * @param {object} opts
 * @param {number} opts.tier              100|300|500|1000
 * @param {string} opts.topic
 * @param {string} opts.startTimeIso      local ISO like "2026-05-14T00:00:00"
 * @param {number} opts.durationMinutes
 * @param {string} [opts.password]
 * @param {string} [opts.timezone]
 * @param {number} opts.startAtUtcMs
 * @param {string} [opts.agenda]
 */
async function createMeetingOnFirstAvailable({
  tier = 100,
  topic,
  startTimeIso,
  durationMinutes,
  password,
  timezone,
  startAtUtcMs,
  agenda,
}) {
  const pool = loadPool(tier)
  if (!pool.length) {
    return { ok: false, reasons: [], error: 'POOL_EMPTY' }
  }
  if (!startTimeIso) throw new Error('startTimeIso is required')
  if (!startAtUtcMs) throw new Error('startAtUtcMs is required')
  if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

  const reasons = []

  for (const host of pool) {
    const hostReason = { label: host.label, status: 'unknown', detail: null }
    try {
      // 1. License + capacity gate (with auto-mark / auto-recovery).
      const gate = await _evaluateLicenseGate(host, tier)
      if (!gate.healthy) {
        reasons.push(gate.hostReason)
        continue
      }

      // 2. Concurrent slot gate.
      //    Untuk tier backdate, meeting tidak muncul di upcoming Zoom, jadi
      //    pakai catatan booking lokal (jam asli) untuk deteksi bentrok.
      const allowed = host.concurrentMeetings || 1
      let busyDetail
      if (zoomBackdate.isBackdateTier(tier)) {
        const local = zoomBackdate.findLocalConflicts({
          tier,
          hostAccountId: host.accountId,
          startAtUtcMs,
          durationMinutes,
        })
        if (local.length >= allowed) {
          busyDetail = local.map((c) => ({
            id: c.meetingId,
            topic: c.topic,
            start_time: new Date(c.realStartUtcMs).toISOString(),
            duration: c.durationMinutes,
          }))
        }
      } else {
        const conflicts = await zoomClient.findMeetingConflicts({
          startAt: startAtUtcMs,
          durationMinutes,
          creds: host,
        })
        if (conflicts.length >= allowed) {
          busyDetail = conflicts.map((c) => ({
            id: c.id,
            topic: c.topic,
            start_time: c.start_time,
            duration: c.duration,
          }))
        }
      }
      if (busyDetail) {
        hostReason.status = 'busy'
        hostReason.allowed = allowed
        hostReason.detail = busyDetail
        reasons.push(hostReason)
        continue
      }

      // Backdate start_time untuk tier tertentu supaya masuk "Previous".
      const bd = zoomBackdate.applyBackdate({
        tier,
        startTimeIso,
        timezone: timezone || host.timezone,
        durationMinutes,
      })

      const meeting = await zoomClient.createMeeting({
        topic,
        startTime: bd.startTimeIso,
        // Untuk tier backdate, durasi yang dikirim ke Zoom = window kecil tetap
        // (bd.durationMinutes), BUKAN durasi asli customer. Durasi asli disimpan
        // di booking lokal di bawah.
        durationMinutes: bd.durationMinutes,
        password,
        timezone: timezone || host.timezone,
        agenda,
        creds: host,
      })

      // Catat booking lokal dengan JAM ASLI customer (anti-oversell).
      if (bd.backdated) {
        zoomBackdate.recordBooking({
          tier,
          hostAccountId: host.accountId,
          hostLabel: host.label,
          meetingId: meeting.id,
          realStartUtcMs: startAtUtcMs,
          durationMinutes,
          topic,
        })
      }

      let hostInfo = null
      try {
        hostInfo = await zoomClient.getUser({ creds: host })
      } catch {
        /* skipped if scope missing */
      }

      return {
        ok: true,
        tier,
        host,
        meeting,
        hostInfo,
        backdated: bd.backdated,
        concurrentUsed: (busyDetail ? busyDetail.length : 0) + 1,
        concurrentLimit: allowed,
        license: {
          plan: gate.verdict.plan,
          capacity: gate.verdict.capacity,
          source: gate.verdict.source,
        },
        triedReasons: reasons,
      }
    } catch (err) {
      hostReason.status = 'error'
      hostReason.detail = err && err.message ? err.message : String(err)
      reasons.push(hostReason)
      continue
    }
  }

  return { ok: false, reasons, error: 'ALL_BUSY_OR_FAILED' }
}

/**
 * Pre-flight pool scan that picks the first host that has free
 * concurrent capacity, WITHOUT creating a meeting. Used for QRIS flow:
 * we need to confirm a meeting can be created BEFORE asking the user
 * to pay; otherwise we'd risk taking payment then failing to deliver.
 *
 * @returns {Promise<{ok: true, host, conflictsCount, allowed} | {ok:false, reasons, error}>}
 */
async function findFirstAvailableHost({ tier = 100, durationMinutes, startAtUtcMs }) {
  const pool = loadPool(tier)
  if (!pool.length) return { ok: false, reasons: [], error: 'POOL_EMPTY' }
  if (!startAtUtcMs) throw new Error('startAtUtcMs is required')
  if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

  const reasons = []
  for (const host of pool) {
    const hostReason = { label: host.label, status: 'unknown', detail: null }
    try {
      const gate = await _evaluateLicenseGate(host, tier)
      if (!gate.healthy) {
        reasons.push(gate.hostReason)
        continue
      }

      const conflicts = await zoomClient.findMeetingConflicts({
        startAt: startAtUtcMs,
        durationMinutes,
        creds: host,
      })
      const allowed = host.concurrentMeetings || 1
      // Untuk tier backdate, gabungkan dengan booking lokal (jam asli) karena
      // meeting backdated tidak muncul di upcoming Zoom.
      let conflictsCount = conflicts.length
      let busyDetail = conflicts
      if (zoomBackdate.isBackdateTier(tier)) {
        const local = zoomBackdate.findLocalConflicts({
          tier,
          hostAccountId: host.accountId,
          startAtUtcMs,
          durationMinutes,
        })
        conflictsCount = local.length
        busyDetail = local.map((c) => ({
          id: c.meetingId,
          topic: c.topic,
          start_time: new Date(c.realStartUtcMs).toISOString(),
          duration: c.durationMinutes,
        }))
      }
      if (conflictsCount >= allowed) {
        hostReason.status = 'busy'
        hostReason.allowed = allowed
        hostReason.detail = busyDetail.map((c) => ({
          id: c.id,
          topic: c.topic,
          start_time: c.start_time,
          duration: c.duration,
        }))
        reasons.push(hostReason)
        continue
      }
      return {
        ok: true,
        tier,
        host,
        conflictsCount,
        allowed,
        license: {
          plan: gate.verdict.plan,
          capacity: gate.verdict.capacity,
          source: gate.verdict.source,
        },
        triedReasons: reasons,
      }
    } catch (err) {
      hostReason.status = 'error'
      hostReason.detail = err && err.message ? err.message : String(err)
      reasons.push(hostReason)
      continue
    }
  }
  return { ok: false, reasons, error: 'ALL_BUSY_OR_FAILED' }
}

/**
 * Create a meeting on a SPECIFIC host (no failover). Used in the QRIS
 * flow after we've already pre-checked and earmarked a host: when the
 * payment webhook fires, we re-validate that host has capacity and
 * create. (Re-validation is important because someone else may have
 * filled the slot between pre-check and payment confirmation.)
 *
 * If the earmarked host is now busy, we DO NOT silently fall back to
 * another host — instead we return a busy result so the caller can
 * decide whether to refund or try again. Configurable via opts.allowFallback.
 */
async function createMeetingOnHost({
  host,
  topic,
  startTimeIso,
  durationMinutes,
  password,
  timezone,
  startAtUtcMs,
  agenda,
  allowFallback = false,
  tier,
}) {
  if (!host) throw new Error('host is required')

  // Re-validate license at payment-confirmation time. Cheap due to cache.
  if (tier) {
    const gate = await _evaluateLicenseGate(host, tier)
    if (!gate.healthy) {
      if (allowFallback) {
        return createMeetingOnFirstAvailable({
          tier,
          topic,
          startTimeIso,
          durationMinutes,
          password,
          timezone,
          startAtUtcMs,
          agenda,
        })
      }
      return {
        ok: false,
        error:
          gate.hostReason.status === 'disabled'
            ? 'EARMARKED_HOST_DISABLED'
            : 'EARMARKED_HOST_UNLICENSED',
        reasons: [gate.hostReason],
      }
    }
  }

  const allowed = host.concurrentMeetings || 1
  // Untuk tier backdate, pakai booking lokal (jam asli) untuk re-validasi slot,
  // karena meeting backdated tidak muncul di upcoming Zoom.
  let conflictsCount
  let busyDetail
  if (zoomBackdate.isBackdateTier(tier)) {
    const local = zoomBackdate.findLocalConflicts({
      tier,
      hostAccountId: host.accountId,
      startAtUtcMs,
      durationMinutes,
    })
    conflictsCount = local.length
    busyDetail = local.map((c) => ({
      id: c.meetingId,
      topic: c.topic,
      start_time: new Date(c.realStartUtcMs).toISOString(),
      duration: c.durationMinutes,
    }))
  } else {
    const conflicts = await zoomClient.findMeetingConflicts({
      startAt: startAtUtcMs,
      durationMinutes,
      creds: host,
    })
    conflictsCount = conflicts.length
    busyDetail = conflicts.map((c) => ({
      id: c.id,
      topic: c.topic,
      start_time: c.start_time,
      duration: c.duration,
    }))
  }
  if (conflictsCount < allowed) {
    // Backdate start_time untuk tier tertentu supaya masuk "Previous".
    const bd = zoomBackdate.applyBackdate({
      tier,
      startTimeIso,
      timezone: timezone || host.timezone,
      durationMinutes,
    })
    const meeting = await zoomClient.createMeeting({
      topic,
      startTime: bd.startTimeIso,
      // Tier backdate: kirim window kecil tetap ke Zoom, bukan durasi asli.
      durationMinutes: bd.durationMinutes,
      password,
      timezone: timezone || host.timezone,
      agenda,
      creds: host,
    })
    // Catat booking lokal dengan JAM ASLI customer (anti-oversell).
    if (bd.backdated) {
      zoomBackdate.recordBooking({
        tier,
        hostAccountId: host.accountId,
        hostLabel: host.label,
        meetingId: meeting.id,
        realStartUtcMs: startAtUtcMs,
        durationMinutes,
        topic,
      })
    }
    let hostInfo = null
    try {
      hostInfo = await zoomClient.getUser({ creds: host })
    } catch {
      /* ignore scope */
    }
    return {
      ok: true,
      tier,
      host,
      meeting,
      hostInfo,
      backdated: bd.backdated,
      concurrentUsed: conflictsCount + 1,
      concurrentLimit: allowed,
    }
  }

  // Earmarked host now busy — try fallback if caller allows
  if (allowFallback && tier) {
    return createMeetingOnFirstAvailable({
      tier,
      topic,
      startTimeIso,
      durationMinutes,
      password,
      timezone,
      startAtUtcMs,
      agenda,
    })
  }

  return {
    ok: false,
    error: 'EARMARKED_HOST_BUSY',
    reasons: [
      {
        label: host.label,
        status: 'busy',
        allowed,
        detail: busyDetail,
      },
    ],
  }
}

/**
 * List upcoming meetings across all hosts in the given tier.
 */
async function listAllUpcoming(tier = 100) {
  const pool = loadPool(tier)
  const result = []
  const errors = []
  for (const host of pool) {
    try {
      const meetings = await zoomClient.listUpcomingMeetings({ creds: host })
      for (const mt of meetings) {
        result.push({
          tier,
          hostLabel: host.label,
          hostAccountId: host.accountId,
          hostUserId: host.userId,
          id: mt.id,
          topic: mt.topic,
          start_time: mt.start_time,
          duration: mt.duration,
          timezone: mt.timezone,
          join_url: mt.join_url,
        })
      }
    } catch (err) {
      errors.push({
        label: host.label,
        error: err && err.message ? err.message : String(err),
      })
    }
  }
  return { meetings: result, errors }
}

/**
 * List meeting untuk command pool list.
 *
 * - Tier backdate (300/500/1000 default): baca dari catatan LOKAL (booking yang
 *   dibuat lewat bot). Meeting backdated tidak muncul di "Upcoming" Zoom, dan
 *   yang lebih penting: meeting pribadi milik pemilik akun (yang TIDAK lewat
 *   bot) tidak akan ikut tampil — pool cuma menampilkan jualan bot.
 * - Tier normal: baca dari Zoom API seperti biasa.
 *
 * Bentuk balikan sama dengan `listAllUpcoming`: { meetings, errors } dengan
 * field { tier, hostLabel, hostAccountId, id, topic, start_time, duration }.
 * `start_time` di sini = JAM ASLI customer (ISO), bukan window backdated Zoom.
 */
async function listBookings(tier = 100) {
  if (zoomBackdate.isBackdateTier(tier)) {
    const local = zoomBackdate.listLocalBookings(tier)
    const meetings = local.map((b) => ({
      tier,
      hostLabel: b.hostLabel,
      hostAccountId: b.hostAccountId,
      id: b.meetingId,
      topic: b.topic,
      start_time: new Date(b.realStartUtcMs).toISOString(),
      duration: b.durationMinutes,
    }))
    return { meetings, errors: [], source: 'local' }
  }
  const res = await listAllUpcoming(tier)
  return { ...res, source: 'zoom' }
}

/**
 * Delete a meeting in the given tier given host label/accountId + meeting id.
 */
async function deleteMeetingOn({ tier = 100, hostLabel, hostAccountId, meetingId }) {
  const pool = loadPool(tier)
  const host = pool.find(
    (h) => (hostAccountId && h.accountId === hostAccountId) || (hostLabel && h.label === hostLabel)
  )
  if (!host) throw new Error(`Host "${hostLabel || hostAccountId}" not found in pool tier ${tier}`)

  // Untuk tier backdate: meeting di Zoom mungkin sudah lewat/expired, jadi
  // delete API bisa gagal (404). Itu tidak masalah — yang penting catatan lokal
  // bersih supaya list pool akurat. Jadi kita best-effort delete di Zoom dan
  // tetap buang booking lokal.
  if (zoomBackdate.isBackdateTier(tier)) {
    let res = null
    let zoomError = null
    try {
      res = await zoomClient.deleteMeeting({ meetingId, creds: host })
    } catch (e) {
      zoomError = e && e.message ? e.message : String(e)
    }
    let removedLocal = false
    try {
      removedLocal = zoomBackdate.removeBooking(meetingId)
    } catch {
      /* ignore */
    }
    // Kalau Zoom gagal TAPI booking lokal tidak ada juga, anggap error nyata.
    if (zoomError && !removedLocal) {
      throw new Error(zoomError)
    }
    return res || { ok: true, removedLocal, zoomError }
  }

  const res = await zoomClient.deleteMeeting({ meetingId, creds: host })
  // Bersihkan booking lokal kalau ada.
  try {
    zoomBackdate.removeBooking(meetingId)
  } catch {
    /* ignore */
  }
  return res
}

/**
 * Persist the given pool array to its tier file. Creates the file if missing.
 * Caller is responsible for sanitising entries — `sanitize` is enforced by
 * `loadPool` next time, but we also re-sanitise here to keep the file clean.
 */
function _writePool(tier, entries) {
  const tierKey = Number(tier)
  if (!isValidTier(tierKey)) {
    throw new Error(`Invalid tier: ${tier}. Allowed: ${VALID_TIERS.join(', ')}`)
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  const cleaned = (entries || []).map((entry, i) => sanitize(entry, i, tierKey)).filter(Boolean)
  const file = poolFileForTier(tierKey)
  fs.writeFileSync(file, JSON.stringify(cleaned, null, 2) + '\n', 'utf8')
  clearCache(tierKey)
  return cleaned
}

/**
 * Add a new host entry to the tier's pool file.
 *
 * Required: accountId, clientId, clientSecret
 * Optional: label, userId (default 'me'), timezone, hostKey, concurrentMeetings, notes
 *
 * Rejects duplicates by accountId. Returns the cleaned, full pool after add.
 *
 * @returns {{ok:true, host, pool:object[]} | {ok:false, error:string}}
 */
function addHostToPool(tier, entry) {
  const tierKey = Number(tier)
  if (!isValidTier(tierKey)) {
    return { ok: false, error: `Invalid tier: ${tier}` }
  }
  if (!entry || typeof entry !== 'object') {
    return { ok: false, error: 'entry must be an object' }
  }
  const cleaned = sanitize(entry, 0, tierKey)
  if (!cleaned) {
    return {
      ok: false,
      error: 'Missing required fields. Need: accountId, clientId, clientSecret.',
    }
  }
  let current = []
  try {
    current = loadPool(tierKey)
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e
  }
  if (current.some((h) => h.accountId === cleaned.accountId)) {
    return {
      ok: false,
      error: `Host with accountId "${cleaned.accountId}" already exists in tier ${tierKey} pool.`,
    }
  }
  const next = [...current, cleaned]
  const written = _writePool(tierKey, next)
  return { ok: true, host: cleaned, pool: written }
}

/**
 * Remove a host from the pool by accountId or by label.
 * @returns {{ok:true, removed, pool} | {ok:false, error:string}}
 */
function removeHostFromPool(tier, { accountId, label } = {}) {
  const tierKey = Number(tier)
  if (!isValidTier(tierKey)) return { ok: false, error: `Invalid tier: ${tier}` }
  if (!accountId && !label) return { ok: false, error: 'accountId or label is required' }
  let current = []
  try {
    current = loadPool(tierKey)
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e
  }
  const idx = current.findIndex(
    (h) => (accountId && h.accountId === accountId) || (label && h.label === label)
  )
  if (idx < 0) {
    return {
      ok: false,
      error: `Host not found in tier ${tierKey} pool (accountId=${accountId || '-'}, label=${label || '-'})`,
    }
  }
  const removed = current[idx]
  const next = current.slice(0, idx).concat(current.slice(idx + 1))
  const written = _writePool(tierKey, next)
  return { ok: true, removed, pool: written }
}

// ---- Health flag listeners (subscribed by index.js to send WA notifications)
const healthListeners = new Set()

/**
 * Subscribe to host health transitions. Listener receives:
 *   { tier, host, type: 'disabled' | 'enabled', reason, detail, source }
 *
 * Returns an unsubscribe function.
 */
function onHealthChange(fn) {
  if (typeof fn !== 'function') throw new Error('listener must be a function')
  healthListeners.add(fn)
  return () => healthListeners.delete(fn)
}

function _emitHealth(payload) {
  for (const fn of healthListeners) {
    try {
      fn(payload)
    } catch (err) {
      // never let a listener crash the pool flow
      console.error('[zoom-pool] health listener threw:', err && err.message ? err.message : err)
    }
  }
}

/**
 * Auto-mark a host as disabled in the persisted pool file. Idempotent: if the
 * host is already disabled with the same reason, no write happens — and no
 * listener fires. The first time a healthy host turns sick, listeners are
 * notified once.
 *
 * Reasons that warrant auto-mark (passed by callers): 'BASIC_PLAN',
 * 'INACTIVE', 'NO_LARGE_MEETING', 'CAPACITY_TOO_LOW'.
 *
 * Transient errors (API_ERROR) MUST NOT be passed here — they're handled
 * via in-memory skip only, so a flaky network doesn't disable a healthy host.
 *
 * @returns {{ok:true, host, transitioned:boolean} | {ok:false, error}}
 */
function markHostDisabled(tier, { accountId, label } = {}, { reason, detail } = {}) {
  const tierKey = Number(tier)
  if (!isValidTier(tierKey)) return { ok: false, error: `Invalid tier: ${tier}` }
  if (!accountId && !label) return { ok: false, error: 'accountId or label is required' }
  if (!reason) return { ok: false, error: 'reason is required' }

  let current = []
  try {
    current = loadPool(tierKey)
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e
  }

  const idx = current.findIndex(
    (h) => (accountId && h.accountId === accountId) || (label && h.label === label)
  )
  if (idx < 0) {
    return {
      ok: false,
      error: `Host not found in tier ${tierKey} pool (accountId=${accountId || '-'}, label=${label || '-'})`,
    }
  }

  const existing = current[idx]
  // Already disabled with same reason? No-op, no event.
  if (existing.disabledAt && existing.disabledReason === reason) {
    return { ok: true, host: existing, transitioned: false }
  }

  const updated = {
    ...existing,
    disabledAt: new Date().toISOString(),
    disabledReason: String(reason),
    disabledDetail: detail ? String(detail) : null,
  }
  const next = current.slice()
  next[idx] = updated
  _writePool(tierKey, next)

  _emitHealth({
    tier: tierKey,
    host: updated,
    type: 'disabled',
    reason: updated.disabledReason,
    detail: updated.disabledDetail,
    previousReason: existing.disabledReason || null,
  })

  return { ok: true, host: updated, transitioned: true }
}

/**
 * Re-enable a host. Clears all disabled* flags and busts the license cache so
 * the next pool loop will re-check from scratch.
 */
function enableHost(tier, { accountId, label } = {}, { silent = false } = {}) {
  const tierKey = Number(tier)
  if (!isValidTier(tierKey)) return { ok: false, error: `Invalid tier: ${tier}` }
  if (!accountId && !label) return { ok: false, error: 'accountId or label is required' }

  let current = []
  try {
    current = loadPool(tierKey)
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e
  }

  const idx = current.findIndex(
    (h) => (accountId && h.accountId === accountId) || (label && h.label === label)
  )
  if (idx < 0) {
    return {
      ok: false,
      error: `Host not found in tier ${tierKey} pool (accountId=${accountId || '-'}, label=${label || '-'})`,
    }
  }

  const existing = current[idx]
  if (!existing.disabledAt) {
    return { ok: true, host: existing, transitioned: false }
  }

  const updated = {
    ...existing,
    disabledAt: null,
    disabledReason: null,
    disabledDetail: null,
  }
  const next = current.slice()
  next[idx] = updated
  _writePool(tierKey, next)

  if (!silent) {
    _emitHealth({
      tier: tierKey,
      host: updated,
      type: 'enabled',
      previousReason: existing.disabledReason || null,
    })
  }

  return { ok: true, host: updated, transitioned: true }
}

module.exports = {
  VALID_TIERS,
  TIER_DEFAULT_CONCURRENT,
  isValidTier,
  loadPool,
  clearCache,
  findFirstLicensedHost,
  createMeetingOnFirstAvailable,
  findFirstAvailableHost,
  createMeetingOnHost,
  listAllUpcoming,
  listBookings,
  deleteMeetingOn,
  addHostToPool,
  removeHostFromPool,
  markHostDisabled,
  enableHost,
  onHealthChange,
}
