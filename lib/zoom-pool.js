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
 *   { label, accountId, clientId, clientSecret, userId?, timezone?, hostKey?, notes? }
 */

const fs = require('fs')
const path = require('path')
const zoomClient = require('./zoom-client')

const VALID_TIERS = [100, 300, 500, 1000]

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

function sanitize(entry, index) {
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

    return { label, accountId, clientId, clientSecret, userId, timezone, notes, hostKey }
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

    const cleaned = parsed.map((entry, i) => sanitize(entry, i)).filter(Boolean)
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
 *   1. Check if it has conflicting meetings in the requested window.
 *   2. If free, create the meeting via createMeeting() and return.
 *   3. If bentrok, collect the conflicts and move to next host.
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
            if (conflicts.length) {
                hostReason.status = 'busy'
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

            return { ok: true, tier, host, meeting, hostInfo, triedReasons: reasons }
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
    isValidTier,
    loadPool,
    clearCache,
    createMeetingOnFirstAvailable,
    listAllUpcoming,
    deleteMeetingOn,
}
