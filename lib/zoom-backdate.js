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
 * label/reminder. Trik supaya meeting LANGSUNG masuk "Previous" (bukan baru
 * besok untuk durasi panjang/full-day): apa pun durasi yang dibeli customer,
 * ke Zoom kita SELALU kirim window kecil tetap — `start = sekarang - (durasiZoom
 * + lead)` dan `duration = durasiZoom` (default 60 menit). Jadi END meeting =
 * `sekarang - lead` (sudah lewat) → langsung Previous.
 *
 * PENTING: durasi & jam ASLI customer TIDAK ikut dikirim ke Zoom — itu hanya
 * disimpan di DB lokal (`zoomBookings`) untuk deteksi bentrok & ditampilkan di
 * invite WA. Yang "dikorbankan" cuma label start_time/duration di dashboard
 * Zoom, yang memang sengaja kita pakai buat ngumpetin meeting ke Previous.
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

// Durasi (menit) yang DIKIRIM ke Zoom untuk meeting backdated — TETAP, tidak
// peduli durasi asli yang dibeli customer. Default 60 (1 jam). Kecil supaya
// meeting cepat keluar dari "Upcoming".
function backdateZoomDurationMinutes() {
  const n = Number(process.env.ZOOM_BACKDATE_ZOOM_DURATION_MINUTES)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60
}

// Seberapa jauh END meeting diletakkan di MASA LALU relatif "sekarang" (menit).
// Semakin besar, semakin aman meeting langsung masuk "Previous". Default 1 menit.
function backdateEndLeadMinutes() {
  const n = Number(process.env.ZOOM_BACKDATE_END_LEAD_MINUTES)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1
}

function isBackdateTier(tier) {
  return backdateTiers().has(Number(tier))
}

/**
 * Hasilkan start_time ISO lokal (tanpa offset) untuk meeting backdated.
 *
 * Window yang dikirim ke Zoom TETAP kecil & tidak tergantung durasi asli:
 *   duration = backdateZoomDurationMinutes()   (default 60)
 *   start    = sekarang - (duration + endLead)
 *   => end   = start + duration = sekarang - endLead  (sudah lewat → Previous)
 *
 * Contoh (sekarang 00:08, default): start 23:07 kemarin, durasi 60m,
 * end 00:07 → lewat 00:08 → langsung Previous.
 *
 * @param {string} timezone IANA tz, contoh "Asia/Jakarta"
 * @returns {string} "YYYY-MM-DDTHH:mm:ss"
 */
function backdatedStartIso(timezone) {
  const tz = timezone || process.env.ZOOM_DEFAULT_TIMEZONE || 'Asia/Jakarta'
  const back = backdateZoomDurationMinutes() + backdateEndLeadMinutes()
  return moment.tz(tz).subtract(back, 'minutes').format('YYYY-MM-DDTHH:mm:ss')
}

/**
 * Untuk tier backdate: kembalikan window Zoom yang sudah dimundurkan supaya
 * meeting langsung masuk "Previous". start_time & durasi yang DIKIRIM ke Zoom
 * dipisah dari jam/durasi ASLI customer (yang disimpan di DB lokal).
 *
 * Untuk tier normal: pakai start_time & durasi asli apa adanya.
 *
 * @returns {{ startTimeIso: string, durationMinutes: number, backdated: boolean }}
 */
function applyBackdate({ tier, startTimeIso, timezone, durationMinutes }) {
  if (isBackdateTier(tier)) {
    return {
      startTimeIso: backdatedStartIso(timezone),
      durationMinutes: backdateZoomDurationMinutes(),
      backdated: true,
    }
  }
  return { startTimeIso, durationMinutes, backdated: false }
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

/**
 * Daftar booking lokal (jam ASLI customer) untuk satu tier. Dipakai oleh
 * command pool list supaya yang muncul HANYA meeting yang dibuat lewat bot —
 * meeting pribadi milik pemilik akun Zoom (yang tidak lewat bot) TIDAK ikut,
 * karena tidak ada catatannya di sini.
 *
 * @param {number} tier
 * @returns {Array<{meetingId, topic, hostLabel, hostAccountId, realStartUtcMs, durationMinutes, realEndUtcMs}>}
 *          tersortir berdasarkan jam mulai (ascending).
 */
function listLocalBookings(tier) {
  const store = bookingStore()
  if (!store) return []
  cleanupExpired(store)
  const tierNum = Number(tier)
  return store
    .filter((b) => b && Number(b.tier) === tierNum)
    .map((b) => ({
      meetingId: String(b.meetingId || ''),
      topic: String(b.topic || ''),
      hostLabel: String(b.hostLabel || ''),
      hostAccountId: String(b.hostAccountId || ''),
      realStartUtcMs: Number(b.realStartUtcMs),
      durationMinutes: Number(b.durationMinutes),
      realEndUtcMs: Number(b.realEndUtcMs),
    }))
    .sort((a, b) => a.realStartUtcMs - b.realStartUtcMs)
}

module.exports = {
  isBackdateTier,
  backdateTiers,
  backdateZoomDurationMinutes,
  backdateEndLeadMinutes,
  backdatedStartIso,
  applyBackdate,
  recordBooking,
  findLocalConflicts,
  removeBooking,
  listLocalBookings,
}
