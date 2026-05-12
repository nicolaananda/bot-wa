/**
 * Zoom Host Pool — manage a list of Zoom Server-to-Server OAuth accounts
 * (each potentially from a different Zoom org / client) and find the first
 * host that is free at a requested time window.
 *
 * Pool file: config/zoom-pool.json
 * Format: array of { label, accountId, clientId, clientSecret, userId?, timezone?, notes? }
 */

const fs = require('fs')
const path = require('path')
const zoomClient = require('./zoom-client')

const POOL_FILE = path.join(__dirname, '..', 'config', 'zoom-pool.json')

let cachedPool = null
let cachedMtimeMs = 0

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

/**
 * Load the pool from disk. Caches based on file mtime so edits are picked up
 * without restart.
 *
 * @returns {Array<object>} array of sanitized host entries (may be empty)
 */
function loadPool() {
    try {
        const stat = fs.statSync(POOL_FILE)
        if (cachedPool && stat.mtimeMs === cachedMtimeMs) return cachedPool

        const raw = fs.readFileSync(POOL_FILE, 'utf8')
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
            throw new Error('zoom-pool.json must contain a JSON array at the top level')
        }
        const cleaned = parsed
            .map((entry, i) => sanitize(entry, i))
            .filter(Boolean)
        cachedPool = cleaned
        cachedMtimeMs = stat.mtimeMs
        return cleaned
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            cachedPool = []
            cachedMtimeMs = 0
            return []
        }
        throw err
    }
}

function clearCache() {
    cachedPool = null
    cachedMtimeMs = 0
}

/**
 * Iterate the pool sequentially (failover). For each host:
 *   1. Check if it has conflicting meetings in the requested window.
 *   2. If free, create the meeting via createMeeting() and return the result.
 *   3. If bentrok, collect the conflicts and move to next host.
 *
 * @param {object} opts
 * @param {string} opts.topic
 * @param {string} opts.startTimeIso      local ISO like "2026-05-14T00:00:00"
 * @param {number} opts.durationMinutes
 * @param {string} [opts.password]
 * @param {string} [opts.timezone]        IANA tz
 * @param {number} [opts.startAtUtcMs]    epoch ms (UTC) for conflict comparison
 * @param {string} [opts.agenda]
 *
 * @returns {Promise<{ok: true, host, meeting} | {ok: false, reasons}>}
 *   - ok:true  -> meeting created successfully, includes picked host info.
 *   - ok:false -> no host available; `reasons` lists each host's status.
 */
async function createMeetingOnFirstAvailable({
    topic,
    startTimeIso,
    durationMinutes,
    password,
    timezone,
    startAtUtcMs,
    agenda,
}) {
    const pool = loadPool()
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

            // Host is free — try creating.
            const meeting = await zoomClient.createMeeting({
                topic,
                startTime: startTimeIso,
                durationMinutes,
                password,
                timezone: timezone || host.timezone,
                agenda,
                creds: host,
            })

            // Optionally grab host info (non-fatal if scope missing)
            let hostInfo = null
            try {
                hostInfo = await zoomClient.getUser({ creds: host })
            } catch {
                /* skipped */
            }

            return { ok: true, host, meeting, hostInfo, triedReasons: reasons }
        } catch (err) {
            hostReason.status = 'error'
            hostReason.detail = err && err.message ? err.message : String(err)
            reasons.push(hostReason)
            // keep trying next host — one broken credential shouldn't stop the loop
            continue
        }
    }

    return { ok: false, reasons, error: 'ALL_BUSY_OR_FAILED' }
}

/**
 * List upcoming meetings across all hosts in the pool.
 * Returns a flat array with each item annotated with the host label.
 */
async function listAllUpcoming() {
    const pool = loadPool()
    const result = []
    const errors = []
    for (const host of pool) {
        try {
            const meetings = await zoomClient.listUpcomingMeetings({ creds: host })
            for (const mt of meetings) {
                result.push({
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
            errors.push({ label: host.label, error: err && err.message ? err.message : String(err) })
        }
    }
    return { meetings: result, errors }
}

/**
 * Delete a meeting given its host label + meeting id.
 */
async function deleteMeetingOn({ hostLabel, hostAccountId, meetingId }) {
    const pool = loadPool()
    const host = pool.find(
        (h) =>
            (hostAccountId && h.accountId === hostAccountId) ||
            (hostLabel && h.label === hostLabel)
    )
    if (!host) throw new Error(`Host "${hostLabel || hostAccountId}" not found in pool`)
    return zoomClient.deleteMeeting({ meetingId, creds: host })
}

module.exports = {
    loadPool,
    clearCache,
    createMeetingOnFirstAvailable,
    listAllUpcoming,
    deleteMeetingOn,
}
