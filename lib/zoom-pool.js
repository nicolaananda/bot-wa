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
        Number.isFinite(rawConcurrent) && rawConcurrent >= 1
            ? Math.floor(rawConcurrent)
            : tierDefault

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
        throw new Error(
            `Invalid tier: ${tier}. Allowed: ${VALID_TIERS.join(', ')}`
        )
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
            const conflicts = await zoomClient.findMeetingConflicts({
                startAt: startAtUtcMs,
                durationMinutes,
                creds: host,
            })
            const allowed = host.concurrentMeetings || 1
            if (conflicts.length >= allowed) {
                hostReason.status = 'busy'
                hostReason.allowed = allowed
                hostReason.detail = conflicts.map((c) => ({
                    id: c.id,
                    topic: c.topic,
                    start_time: c.start_time,
                    duration: c.duration,
                }))
                reasons.push(hostReason)
                continue
            }

            const meeting = await zoomClient.createMeeting({
                topic,
                startTime: startTimeIso,
                durationMinutes,
                password,
                timezone: timezone || host.timezone,
                agenda,
                creds: host,
            })

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
                concurrentUsed: conflicts.length + 1,
                concurrentLimit: allowed,
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
async function findFirstAvailableHost({
    tier = 100,
    durationMinutes,
    startAtUtcMs,
}) {
    const pool = loadPool(tier)
    if (!pool.length) return { ok: false, reasons: [], error: 'POOL_EMPTY' }
    if (!startAtUtcMs) throw new Error('startAtUtcMs is required')
    if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

    const reasons = []
    for (const host of pool) {
        const hostReason = { label: host.label, status: 'unknown', detail: null }
        try {
            const conflicts = await zoomClient.findMeetingConflicts({
                startAt: startAtUtcMs,
                durationMinutes,
                creds: host,
            })
            const allowed = host.concurrentMeetings || 1
            if (conflicts.length >= allowed) {
                hostReason.status = 'busy'
                hostReason.allowed = allowed
                hostReason.detail = conflicts.map((c) => ({
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
                conflictsCount: conflicts.length,
                allowed,
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
    const conflicts = await zoomClient.findMeetingConflicts({
        startAt: startAtUtcMs,
        durationMinutes,
        creds: host,
    })
    const allowed = host.concurrentMeetings || 1
    if (conflicts.length < allowed) {
        const meeting = await zoomClient.createMeeting({
            topic,
            startTime: startTimeIso,
            durationMinutes,
            password,
            timezone: timezone || host.timezone,
            agenda,
            creds: host,
        })
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
            concurrentUsed: conflicts.length + 1,
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
                detail: conflicts.map((c) => ({
                    id: c.id,
                    topic: c.topic,
                    start_time: c.start_time,
                    duration: c.duration,
                })),
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
 * Delete a meeting in the given tier given host label/accountId + meeting id.
 */
async function deleteMeetingOn({ tier = 100, hostLabel, hostAccountId, meetingId }) {
    const pool = loadPool(tier)
    const host = pool.find(
        (h) =>
            (hostAccountId && h.accountId === hostAccountId) ||
            (hostLabel && h.label === hostLabel)
    )
    if (!host) throw new Error(`Host "${hostLabel || hostAccountId}" not found in pool tier ${tier}`)
    return zoomClient.deleteMeeting({ meetingId, creds: host })
}

module.exports = {
    VALID_TIERS,
    TIER_DEFAULT_CONCURRENT,
    isValidTier,
    loadPool,
    clearCache,
    createMeetingOnFirstAvailable,
    findFirstAvailableHost,
    createMeetingOnHost,
    listAllUpcoming,
    deleteMeetingOn,
}
