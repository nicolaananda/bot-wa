/**
 * Zoom Backdate + Local Booking Store
 *
 * Untuk tier tertentu (default 300/500/1000), meeting dibuat dengan
 * `start_time` yang dimundurkan ke masa lalu (backdate) supaya di dashboard
 * Zoom meeting tersebut masuk ke "Previous Meetings", bukan "Upcoming".
 *
 * Konsekuensi: deteksi bentrok bawaan Zoom (`findMeetingConflicts`, yang baca
 * `upcoming_meetings`) jadi buta terhadap meeting backdated. Karena itu modul
 * ini juga menyimpan booking di DB lokal pakai JAM ASLI customer, lalu deteksi
 * bentrok dihitung dari catatan lokal — anti-oversell tetap jalan.
 *
 * Link join Zoom tetap hidup meski `start_time` sudah lewat; `start_time` hanya
 * label/reminder. Supaya meeting LANGSUNG masuk "Previous" (bukan baru besok
 * untuk durasi panjang/full-day), start_time dimundurkan sebesar durasi meeting
 * + lead kecil, sehingga END meeting jatuh di masa lalu. Mundur dibatasi
 * `backdateMaxMinutes()` agar tidak memakan jatah auto-expire Zoom (~30 hari
 * dari start_time).
 */

const moment = require('moment-timezone')

// Tier yang meeting-nya dibuat sebagai "Previous" (backdated).
// Bisa di-override via env ZOOM_BACKDATE_TIERS="300,500,1000".
function backdateTiers() {
  const raw = String(process.env.ZOOM_BACKDATE_TIERS || '300,500,1000').trim()
  return new Set(
    raw
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  )
}

// Fallback mundur (menit) kalau durasi tidak diketahui. Default 60 (1 jam).
function backdateMinutes() {
  const n = Number(process.env.ZOOM_BACKDATE_MINUTES)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60
}

// Seberapa jauh END meeting diletakkan di MASA LALU relatif "sekarang" (menit).
// Semakin besar, semakin aman meeting langsung masuk "Previous". Default 2 menit.
function backdateEndLeadMinutes() {
  const n = Number(process.env.ZOOM_BACKDATE_END_LEAD_MINUTES)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2
}

// Batas maksimum mundur start_time (menit) supaya meeting durasi sangat panjang
// tidak langsung kena auto-expire Zoom (~30 hari dari start_time). Default 7 hari.
function backdateMaxMinutes() {
  const n = Number(process.env.ZOOM_BACKDATE_MAX_MINUTES)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7 * 24 * 60
}

function isBackdateTier(tier) {
  return backdateTiers().has(Number(tier))
}

/**
 * Hasilkan start_time ISO lokal (tanpa offset) yang sudah dibackdate supaya
 * END meeting (start + durasi) jatuh di masa lalu — jadi meeting langsung
 * masuk "Previous", bukan "Upcoming", berapapun durasinya.
 *
 * Rumus: start = sekarang - durasi - endLead.
 *   => end = start + durasi = sekarang - endLead  (sudah lewat → Previous)
 *
 * Mundur start dibatasi `backdateMaxMinutes()` supaya meeting durasi sangat
 * panjang tidak kena auto-expire Zoom (~30 hari dari start_time).
 *
 * @param {string} timezone IANA tz, contoh "Asia/Jakarta"
 * @param {number} [durationMinutes] durasi meeting (menit)
 * @returns {string} "YYYY-MM-DDTHH:mm:ss"
 */
function backdatedStartIso(timezone, durationMinutes) {
  const tz = timezone || process.env.ZOOM_DEFAULT_TIMEZONE || 'Asia/Jakarta'
  const dur = Number(durationMinutes)
  let back
  if (Number.isFinite(dur) && dur > 0) {
    back = dur + backdateEndLeadMinutes()
  } else {
    back = backdateMinutes()
  }
  back = Math.min(back, backdateMaxMinutes())
  return moment.tz(tz).subtract(back, 'minutes').format('YYYY-MM-DDTHH:mm:ss')
}

/**
 * Untuk tier backdate: kembalikan start_time yang sudah dimundurkan supaya
 * meeting langsung masuk "Previous". Untuk tier normal: start_time asli.
 *
 * @returns {{ startTimeIso: string, backdated: boolean }}
 */
function applyBackdate({ tier, startTimeIso, timezone, durationMinutes }) {
  if (isBackdateTier(tier)) {
    return { startTimeIso: backdatedStartIso(timezone, durationMinutes), backdated: true }
  }
  return { startTimeIso, backdated: false }
}

// ---- Local booking store -------------------------------------------------

function bookingStore() {
  const db = global.db
  if (!db || !db.data) return null
  if (!Array.isArray(db.data.zoomBookings)) db.data.zoomBookings = []
  return db.data.zoomBookings
}

function persist() {
  try {
    if (typeof global.scheduleSave === 'function') {
      global.scheduleSave()
    } else if (global.db && typeof global.db.save === 'function') {
      global.db.save().catch(() => {})
    }
  } catch {
    /* ignore */
  }
}

/**
 * Buang booking yang window jam aslinya sudah lewat, supaya tidak menumpuk.
 */
function cleanupExpired(store) {
  const now = Date.now()
  for (let i = store.length - 1; i >= 0; i--) {
    const b = store[i]
    if (!b || !Number.isFinite(Number(b.realEndUtcMs)) || Number(b.realEndUtcMs) <= now) {
      store.splice(i, 1)
    }
  }
}

/**
 * Catat satu booking dengan JAM ASLI customer (bukan yang dibackdate).
 */
function recordBooking({
  tier,
  hostAccountId,
  hostLabel,
  meetingId,
  realStartUtcMs,
  durationMinutes,
  topic,
}) {
  const store = bookingStore()
  if (!store) return false
  cleanupExpired(store)
  const start = Number(realStartUtcMs)
  const dur = Number(durationMinutes)
  if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return false
  store.push({
    tier: Number(tier),
    hostAccountId: String(hostAccountId || ''),
    hostLabel: String(hostLabel || ''),
    meetingId: String(meetingId || ''),
    realStartUtcMs: start,
    durationMinutes: dur,
    realEndUtcMs: start + dur * 60 * 1000,
    topic: String(topic || ''),
    createdAt: Date.now(),
  })
  persist()
  return true
}

/**
 * Hitung bentrok lokal untuk satu host pada window jam ASLI yang diminta.
 * Overlap: newStart < exEnd && exStart < newEnd (sama dengan Zoom client).
 *
 * @returns {Array<{meetingId, topic, realStartUtcMs, durationMinutes}>}
 */
function findLocalConflicts({
  tier,
  hostAccountId,
  startAtUtcMs,
  durationMinutes,
  excludeMeetingId,
}) {
  const store = bookingStore()
  if (!store) return []
  cleanupExpired(store)
  const newStart = Number(startAtUtcMs)
  const dur = Number(durationMinutes)
  if (!Number.isFinite(newStart) || !Number.isFinite(dur) || dur <= 0) return []
  const newEnd = newStart + dur * 60 * 1000
  const acct = String(hostAccountId || '')
  const tierNum = Number(tier)

  const conflicts = []
  for (const b of store) {
    if (!b) continue
    if (Number(b.tier) !== tierNum) continue
    if (String(b.hostAccountId) !== acct) continue
    if (excludeMeetingId && String(b.meetingId) === String(excludeMeetingId)) continue
    const exStart = Number(b.realStartUtcMs)
    const exEnd = Number(b.realEndUtcMs)
    if (!Number.isFinite(exStart) || !Number.isFinite(exEnd)) continue
    if (newStart < exEnd && exStart < newEnd) {
      conflicts.push({
        meetingId: b.meetingId,
        topic: b.topic,
        realStartUtcMs: exStart,
        durationMinutes: b.durationMinutes,
      })
    }
  }
  return conflicts
}

/**
 * Hapus booking lokal berdasarkan meetingId (mis. saat meeting dibatalkan).
 */
function removeBooking(meetingId) {
  const store = bookingStore()
  if (!store) return false
  const before = store.length
  for (let i = store.length - 1; i >= 0; i--) {
    if (store[i] && String(store[i].meetingId) === String(meetingId)) {
      store.splice(i, 1)
    }
  }
  if (store.length !== before) {
    persist()
    return true
  }
  return false
}

module.exports = {
  isBackdateTier,
  backdateTiers,
  backdateMinutes,
  backdateEndLeadMinutes,
  backdateMaxMinutes,
  backdatedStartIso,
  applyBackdate,
  recordBooking,
  findLocalConflicts,
  removeBooking,
}
