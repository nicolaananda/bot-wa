/**
 * Zoom API Client (Server-to-Server OAuth)
 *
 * Docs:
 *   - https://developers.zoom.us/docs/internal-apps/s2s-oauth/
 *   - https://developers.zoom.us/docs/api/meetings/#tag/meetings/POST/users/{userId}/meetings
 *
 * Required env:
 *   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 *
 * Optional env:
 *   ZOOM_USER_ID           default: "me"          (email host atau "me" untuk user app owner)
 *   ZOOM_DEFAULT_TIMEZONE  default: "Asia/Jakarta"
 */

const axios = require('axios')
const { getCache, setCache } = require('../function/redis-helper')

const OAUTH_URL = 'https://zoom.us/oauth/token'
const API_BASE = 'https://api.zoom.us/v2'
const TOKEN_CACHE_KEY = 'zoom:oauth:token'
// Zoom issues 1h tokens. Cache slightly shorter to avoid edge cases.
const TOKEN_CACHE_TTL = 55 * 60

// In-process fallback cache when Redis is not available
let memToken = null // { token, expiresAt }

function requireEnv(key) {
    const val = process.env[key]
    if (!val || !String(val).trim()) {
        throw new Error(`Zoom env ${key} is not set. Please fill it in .env`)
    }
    return String(val).trim()
}

async function loadCachedToken() {
    try {
        const cached = await getCache(TOKEN_CACHE_KEY)
        if (cached && cached.token && cached.expiresAt > Date.now() + 5000) {
            return cached.token
        }
    } catch {
        // ignore Redis errors, fall back to mem
    }
    if (memToken && memToken.expiresAt > Date.now() + 5000) {
        return memToken.token
    }
    return null
}

async function saveToken(token, expiresInSec) {
    const expiresAt = Date.now() + expiresInSec * 1000
    memToken = { token, expiresAt }
    try {
        await setCache(TOKEN_CACHE_KEY, { token, expiresAt }, Math.min(expiresInSec - 60, TOKEN_CACHE_TTL))
    } catch {
        // ignore
    }
}

/**
 * Fetch a fresh access token via Server-to-Server OAuth.
 * https://developers.zoom.us/docs/internal-apps/s2s-oauth/#use-account-credentials-to-get-an-access-token
 */
async function fetchAccessToken() {
    const accountId = requireEnv('ZOOM_ACCOUNT_ID')
    const clientId = requireEnv('ZOOM_CLIENT_ID')
    const clientSecret = requireEnv('ZOOM_CLIENT_SECRET')

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const res = await axios.post(
        OAUTH_URL,
        null,
        {
            params: {
                grant_type: 'account_credentials',
                account_id: accountId,
            },
            headers: {
                Authorization: `Basic ${auth}`,
            },
            timeout: 15000,
            validateStatus: () => true,
        }
    )

    if (res.status !== 200 || !res.data || !res.data.access_token) {
        const reason = res.data && (res.data.reason || res.data.message || JSON.stringify(res.data))
        throw new Error(`Zoom OAuth failed (HTTP ${res.status}): ${reason || 'unknown error'}`)
    }

    const { access_token, expires_in } = res.data
    await saveToken(access_token, Number(expires_in) || 3600)
    return access_token
}

async function getAccessToken() {
    const cached = await loadCachedToken()
    if (cached) return cached
    return fetchAccessToken()
}

async function zoomRequest(method, path, { params, data, retry = true } = {}) {
    const token = await getAccessToken()
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
        memToken = null
        try {
            const { deleteCache } = require('../function/redis-helper')
            await deleteCache(TOKEN_CACHE_KEY)
        } catch {
            // ignore
        }
        return zoomRequest(method, path, { params, data, retry: false })
    }

    if (res.status >= 400) {
        const msg = res.data && (res.data.message || JSON.stringify(res.data))
        const err = new Error(`Zoom API ${method} ${path} failed (HTTP ${res.status}): ${msg}`)
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
 * @param {string} opts.topic            Meeting name / topic
 * @param {string} opts.startTime        Local ISO (no offset), e.g. "2026-05-20T14:00:00"
 * @param {number} opts.durationMinutes  Duration in minutes (Zoom's native unit)
 * @param {string} [opts.password]       Meeting passcode
 * @param {string} [opts.timezone]       IANA tz, default ZOOM_DEFAULT_TIMEZONE
 * @param {string} [opts.userId]         Host user id/email, default ZOOM_USER_ID
 * @param {string} [opts.agenda]         Optional agenda
 *
 * Docs: POST /users/{userId}/meetings
 */
async function createMeeting({ topic, startTime, durationMinutes, password, timezone, userId, agenda } = {}) {
    if (!topic || !String(topic).trim()) throw new Error('topic is required')
    if (!startTime) throw new Error('startTime is required (ISO 8601)')
    if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

    const host = userId || process.env.ZOOM_USER_ID || 'me'
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

    return zoomRequest('POST', `/users/${encodeURIComponent(host)}/meetings`, { data: body })
}

/**
 * List meetings belonging to a user.
 *
 * Zoom uses `type=scheduled` to list upcoming non-recurring meetings, and
 * `type=upcoming_meetings` includes previous instances of recurring meetings
 * whose next occurrence is upcoming. We use "upcoming_meetings" so that
 * recurring meetings are caught.
 *
 * Docs: GET /users/{userId}/meetings
 * https://developers.zoom.us/docs/api/meetings/#tag/meetings/GET/users/{userId}/meetings
 *
 * @param {object} [opts]
 * @param {string} [opts.userId]
 * @param {string} [opts.type='upcoming_meetings']
 * @param {number} [opts.pageSize=100]
 * @returns {Promise<Array<object>>}
 */
async function listUpcomingMeetings({ userId, type = 'upcoming_meetings', pageSize = 100 } = {}) {
    const host = userId || process.env.ZOOM_USER_ID || 'me'
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
 *
 * @param {object} opts
 * @param {Date|string|number} opts.startAt    Start of proposed meeting (anything moment/Date can parse, UTC)
 * @param {number} opts.durationMinutes        Duration of proposed meeting
 * @param {string} [opts.userId]
 * @param {string|number} [opts.excludeMeetingId]  Ignore a meeting with this id (useful for reschedule)
 * @returns {Promise<Array<{id: string, topic: string, start_time: string, duration: number}>>} conflicting meetings
 */
async function findMeetingConflicts({ startAt, durationMinutes, userId, excludeMeetingId } = {}) {
    if (!startAt) throw new Error('startAt is required')
    if (!durationMinutes || durationMinutes <= 0) throw new Error('durationMinutes must be > 0')

    const newStart = new Date(startAt).getTime()
    if (!Number.isFinite(newStart)) throw new Error('startAt is invalid')
    const newEnd = newStart + durationMinutes * 60 * 1000

    const meetings = await listUpcomingMeetings({ userId })
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

module.exports = {
    getAccessToken,
    fetchAccessToken,
    createMeeting,
    listUpcomingMeetings,
    findMeetingConflicts,
    zoomRequest,
}
