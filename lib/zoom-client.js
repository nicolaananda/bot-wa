/**
 * Zoom API Client (Server-to-Server OAuth)
 *
 * Docs:
 *   - https://developers.zoom.us/docs/internal-apps/s2s-oauth/
 *   - https://developers.zoom.us/docs/api/meetings/#tag/meetings/POST/users/{userId}/meetings
 *
 * Two auth modes:
 * 1. Env-based (default): uses ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
 *    -- used by the main #zoomlarge command.
 * 2. Per-call creds override: pass `{ accountId, clientId, clientSecret, userId, label }`
 *    as a `creds` option on any function. Used by the host-pool feature to talk to
 *    multiple Zoom accounts (each client has their own S2S app).
 *
 * Tokens are cached per-account so the pool doesn't trample the primary cache.
 */

const axios = require('axios')
const { getCache, setCache, deleteCache } = require('../function/redis-helper')

const OAUTH_URL = 'https://zoom.us/oauth/token'
const API_BASE = 'https://api.zoom.us/v2'
// Zoom issues 1h tokens. Cache slightly shorter to avoid edge cases.
const TOKEN_CACHE_TTL = 55 * 60

// Per-account in-process fallback cache { [accountId]: { token, expiresAt } }
const memTokenByAccount = new Map()

function tokenCacheKey(accountId) {
    return `zoom:oauth:token:${accountId}`
}

function requireField(creds, key, envKey) {
    const val = creds && creds[key]
    if (val && String(val).trim()) return String(val).trim()
    const envVal = process.env[envKey]
    if (envVal && String(envVal).trim()) return String(envVal).trim()
    throw new Error(`Zoom credential missing: ${envKey} (or creds.${key})`)
}

/**
 * Resolve credentials: if creds object passed, use it; else fall back to env.
 * Always returns a concrete { accountId, clientId, clientSecret, userId, label }.
 */
function resolveCreds(creds) {
    const accountId = requireField(creds, 'accountId', 'ZOOM_ACCOUNT_ID')
    const clientId = requireField(creds, 'clientId', 'ZOOM_CLIENT_ID')
    const clientSecret = requireField(creds, 'clientSecret', 'ZOOM_CLIENT_SECRET')
    const userId = (creds && creds.userId) || process.env.ZOOM_USER_ID || 'me'
    const label = (creds && creds.label) || accountId
    return { accountId, clientId, clientSecret, userId, label }
}

async function loadCachedToken(accountId) {
    const key = tokenCacheKey(accountId)
    try {
        const cached = await getCache(key)
        if (cached && cached.token && cached.expiresAt > Date.now() + 5000) {
            return cached.token
        }
    } catch {
        // ignore Redis errors, fall back to mem
    }
    const mem = memTokenByAccount.get(accountId)
    if (mem && mem.expiresAt > Date.now() + 5000) return mem.token
    return null
}

async function saveToken(accountId, token, expiresInSec) {
    const expiresAt = Date.now() + expiresInSec * 1000
    memTokenByAccount.set(accountId, { token, expiresAt })
    try {
        await setCache(
            tokenCacheKey(accountId),
            { token, expiresAt },
            Math.min(expiresInSec - 60, TOKEN_CACHE_TTL)
        )
    } catch {
        // ignore
    }
}

async function clearToken(accountId) {
    memTokenByAccount.delete(accountId)
    try {
        await deleteCache(tokenCacheKey(accountId))
    } catch {
        // ignore
    }
}

/**
 * Fetch a fresh access token via Server-to-Server OAuth.
 * https://developers.zoom.us/docs/internal-apps/s2s-oauth/#use-account-credentials-to-get-an-access-token
 */
async function fetchAccessToken(resolved) {
    const auth = Buffer.from(`${resolved.clientId}:${resolved.clientSecret}`).toString('base64')
    const res = await axios.post(OAUTH_URL, null, {
        params: {
            grant_type: 'account_credentials',
            account_id: resolved.accountId,
        },
        headers: { Authorization: `Basic ${auth}` },
        timeout: 15000,
        validateStatus: () => true,
    })

    if (res.status !== 200 || !res.data || !res.data.access_token) {
        const reason = res.data && (res.data.reason || res.data.message || JSON.stringify(res.data))
        const err = new Error(
            `Zoom OAuth failed for ${resolved.label} (HTTP ${res.status}): ${reason || 'unknown error'}`
        )
        err.status = res.status
        err.response = res.data
        throw err
    }

    const { access_token, expires_in } = res.data
    await saveToken(resolved.accountId, access_token, Number(expires_in) || 3600)
    return access_token
}

async function getAccessToken(creds) {
    const resolved = resolveCreds(creds)
    const cached = await loadCachedToken(resolved.accountId)
    if (cached) return cached
    return fetchAccessToken(resolved)
}

/**
 * @param {string} method
 * @param {string} path
 * @param {object} [opts]
 * @param {object} [opts.params]
 * @param {object} [opts.data]
 * @param {object} [opts.creds]  per-call credentials override
 * @param {boolean} [opts.retry]
 */
async function zoomRequest(method, path, { params, data, creds, retry = true } = {}) {
    const resolved = resolveCreds(creds)
    const token = await getAccessToken(resolved)

    const res = await axios({
        method,
        url: `${API_BASE}${path}`,
        params,
        data,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        timeout: 20000,
        validateStatus: () => true,
    })

    // Token expired / invalidated — refresh once and retry
    if (res.status === 401 && retry) {
        await clearToken(resolved.accountId)
        return zoomRequest(method, path, { params, data, creds, retry: false })
    }

    if (res.status >= 400) {
        const msg = res.data && (res.data.message || JSON.stringify(res.data))
        const err = new Error(
            `Zoom API ${method} ${path} failed for ${resolved.label} (HTTP ${res.status}): ${msg}`
        )
        err.status = res.status
        err.response = res.data
        throw err
    }

    return res.data
}

/**
 * Create a scheduled Zoom meeting.
 *
 * @param {object} opts
 * @param {string} opts.topic
 * @param {string} opts.startTime       Local ISO (no offset), "2026-05-20T14:00:00"
 * @param {number} opts.durationMinutes
 * @param {string} [opts.password]
 * @param {string} [opts.timezone]      IANA tz
 * @param {string} [opts.userId]        overrides creds.userId
 * @param {string} [opts.agenda]
 * @param {object} [opts.creds]         per-call credentials override
 */
async function createMeeting({
    topic,
    startTime,
    durationMinutes,
    password,
    timezone,
    userId,
    agenda,
    creds,
} = {}) {
    if (!topic || !String(topic).trim()) throw new Error('topic is required')
    if (!startTime) throw new Error('startTime is required (ISO 8601)')
    if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

    const resolved = resolveCreds(creds)
    const host = userId || resolved.userId
    const tz = timezone || process.env.ZOOM_DEFAULT_TIMEZONE || 'Asia/Jakarta'

    const body = {
        topic: String(topic).slice(0, 200),
        type: 2, // scheduled meeting
        start_time: startTime,
        duration: Math.min(Math.max(1, Math.round(durationMinutes)), 43200),
        timezone: tz,
    }
    if (password) body.password = String(password).slice(0, 10)
    if (agenda) body.agenda = String(agenda).slice(0, 2000)

    return zoomRequest('POST', `/users/${encodeURIComponent(host)}/meetings`, {
        data: body,
        creds,
    })
}

/**
 * List meetings for a user.
 * Docs: GET /users/{userId}/meetings
 */
async function listUpcomingMeetings({
    userId,
    type = 'upcoming_meetings',
    pageSize = 100,
    creds,
} = {}) {
    const resolved = resolveCreds(creds)
    const host = userId || resolved.userId
    const all = []
    let nextPageToken = ''
    // Hard cap pages to avoid infinite loop on unexpected API response
    for (let i = 0; i < 10; i++) {
        const data = await zoomRequest('GET', `/users/${encodeURIComponent(host)}/meetings`, {
            params: {
                type,
                page_size: pageSize,
                ...(nextPageToken ? { next_page_token: nextPageToken } : {}),
            },
            creds,
        })
        if (Array.isArray(data && data.meetings)) all.push(...data.meetings)
        nextPageToken = data && data.next_page_token
        if (!nextPageToken) break
    }
    return all
}

/**
 * Compute overlap between proposed window and existing meetings.
 * A new meeting [newStart, newEnd) conflicts with an existing [exStart, exEnd)
 * iff newStart < exEnd AND exStart < newEnd.
 */
async function findMeetingConflicts({
    startAt,
    durationMinutes,
    userId,
    excludeMeetingId,
    creds,
} = {}) {
    if (!startAt) throw new Error('startAt is required')
    if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

    const newStart = new Date(startAt).getTime()
    if (!Number.isFinite(newStart)) throw new Error('startAt is invalid')
    const newEnd = newStart + durationMinutes * 60 * 1000

    const meetings = await listUpcomingMeetings({ userId, creds })
    const conflicts = []
    for (const mt of meetings) {
        if (!mt || !mt.start_time) continue
        if (excludeMeetingId && String(mt.id) === String(excludeMeetingId)) continue
        // Skip instant/PMI meetings (type 1) — no fixed schedule
        if (mt.type === 1) continue

        const exStart = new Date(mt.start_time).getTime()
        if (!Number.isFinite(exStart)) continue
        const exDur = Number(mt.duration || 0)
        const exEnd = exStart + exDur * 60 * 1000

        if (newStart < exEnd && exStart < newEnd) {
            conflicts.push({
                id: mt.id,
                topic: mt.topic || '(tanpa topik)',
                start_time: mt.start_time,
                duration: exDur,
                timezone: mt.timezone,
                join_url: mt.join_url,
            })
        }
    }
    return conflicts
}

/**
 * Fetch Zoom user profile.
 * Requires scope: user:read:user:admin (or user:read:admin)
 */
async function getUser({ userId, creds } = {}) {
    const resolved = resolveCreds(creds)
    const host = userId || resolved.userId
    return zoomRequest('GET', `/users/${encodeURIComponent(host)}`, { creds })
}

/**
 * Delete a Zoom meeting.
 * Docs: DELETE /meetings/{meetingId}
 */
async function deleteMeeting({ meetingId, notifyHosts = true, creds } = {}) {
    if (!meetingId) throw new Error('meetingId is required')
    return zoomRequest('DELETE', `/meetings/${encodeURIComponent(meetingId)}`, {
        params: {
            schedule_for_reminder: false,
            cancel_meeting_reminder: notifyHosts ? 'true' : 'false',
        },
        creds,
    })
}

module.exports = {
    getAccessToken,
    fetchAccessToken,
    createMeeting,
    listUpcomingMeetings,
    findMeetingConflicts,
    getUser,
    deleteMeeting,
    zoomRequest,
}
