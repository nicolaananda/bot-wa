# Hasil Audit & Perbaikan bot-wa

**Tanggal**: 28 April 2026
**Files changed**: 9 files, +199 -113 lines

---

## CRITICAL (3 fixes)

### 1. `.env` tracked di git — SECRETS EXPOSED
- **Problem**: `.env` berisi Midtrans keys, Telegram token, R2 keys, DB password — semua ter-commit ke git history
- **Fix**: `git rm --cached .env` — file tetap ada di disk tapi tidak lagi di-track git
- **File**: `.env` (untracked)
- **Action needed**: Rotate semua secrets karena sudah ada di git history

### 2. Webhook `/webhook/gowa` tanpa auth
- **Problem**: Siapa saja bisa POST ke endpoint ini. `GOWA_WEBHOOK_SECRET` ada di `.env` tapi tidak dipakai
- **Fix**: Tambah validasi `X-Webhook-Secret` header. Return 401 kalau tidak match
- **File**: `options/dashboard-api.js`

### 3. Redis subscriber tanpa retryStrategy
- **Problem**: Redis subscriber di `main.js` tidak punya `retryStrategy`. Kalau Redis restart, subscriber mati diam-diam dan bot tidak terima webhook messages lagi
- **Fix**: Tambah `retryStrategy: (times) => Math.min(times * 500, 30000)` — retry selamanya dengan backoff max 30s
- **File**: `main.js`

---

## HIGH (4 fixes)

### 4. 3 Redis clients terpisah → 1 shared instance
- **Problem**: `config/redis.js`, `dashboard-api.js`, dan `main.js` masing-masing buat Redis client sendiri dengan config berbeda. Bisa connect ke Redis yang berbeda
- **Fix**: `dashboard-api.js` sekarang pakai `getRedis()` dari `config/redis.js`. Tidak lagi buat client sendiri
- **Files**: `options/dashboard-api.js`, `config/redis.js`

### 5. `config/redis.js` export stale reference
- **Problem**: `module.exports = { redis }` export value, bukan reference. Kalau Redis reconnect, consumer pegang reference lama
- **Fix**: Ganti ke getter: `get redis() { return redis; }`
- **File**: `config/redis.js`

### 6. `nicola.js` auto-restart tanpa batas
- **Problem**: Kalau bot crash loop, `nicola.js` restart tanpa batas tanpa backoff. CPU 100%
- **Fix**: Tambah backoff (2s-30s) dan max 5 restarts per 60 detik. Kalau melebihi, stop
- **File**: `nicola.js`

### 7. `main.js` CB:call handler crash-prone
- **Problem**: `db.data.setting[nicola.user?.["id"]["split"](":")[0]...].anticall` — kalau setting undefined, crash
- **Fix**: Tambah optional chaining (`settingData?.anticall`) dan wrap dalam try/catch
- **File**: `main.js`

---

## MEDIUM (5 fixes)

### 8. Webhook error logging tanpa stack trace
- **Problem**: `console.error('[GOWA-WEBHOOK] Error:', error.message)` — cuma log message, bukan stack trace
- **Fix**: Ganti ke `console.error('[GOWA-WEBHOOK] Error:', error)` — log full error object
- **File**: `options/dashboard-api.js`

### 9. PG pool cold start lambat
- **Problem**: Pool `min` connections = 0 (default). Setiap startup semua koneksi cold (~800ms via Tailscale). `PG_SLOW_MS=500` terlalu rendah
- **Fix**: Set `min: PG_WARMUP_CONNECTIONS` di pool config. Naikkan `PG_SLOW_MS` ke 1500ms di `.env`
- **Files**: `config/postgres.js`, `.env`

### 10. `setting.js` broken date calculation
- **Problem**: `new Date(new Date + 3600000)` — `new Date` tanpa `()` jadi string, `+` jadi string concatenation
- **Fix**: `new Date(Date.now() + 3600000)`
- **File**: `setting.js`

### 11. Dead code — `readline` undefined
- **Problem**: `main.js` punya function `question()` yang pakai `readline` tapi `readline` tidak pernah di-import. Crash kalau dipanggil
- **Fix**: Hapus dead code
- **File**: `main.js`

### 12. `gowa-adapter.js` memory leak
- **Problem**: `processedMessages` pakai `Set` yang grow tanpa batas. Cleanup hanya hapus 100 oldest tapi tidak TTL-based
- **Fix**: Ganti ke `Map` dengan timestamp. Cleanup hapus entries > 5 menit
- **File**: `lib/gowa-adapter.js`

---

## LOW (2 fixes)

### 13. `config/redis.js` retryStrategy terlalu agresif
- **Problem**: Local Redis retry max delay cuma 2s — spam reconnect
- **Fix**: Naikkan ke max 30s, sama dengan yang lain
- **File**: `config/redis.js`

### 14. ESLint errors di `dashboard-api.js`
- **Problem**: 34 ESLint errors (no-unused-vars, no-empty, no-redeclare)
- **Fix**: Semua 34 errors fixed. 0 errors remaining (1678 warnings — mostly prettier formatting)
- **File**: `options/dashboard-api.js`

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | ✅ Fixed |
| HIGH | 4 | ✅ Fixed |
| MEDIUM | 5 | ✅ Fixed |
| LOW | 2 | ✅ Fixed |
| **Total** | **14** | **All done** |

## Files Changed

```
config/postgres.js       |   1 +   (min pool connections)
config/redis.js          |   5 +-  (getter export, retryStrategy)
lib/gowa-adapter.js      |  12 +-- (Map + TTL dedup)
main.js                  |  23 +-- (retryStrategy, null check, dead code)
nicola.js                |  24 ++  (backoff + max restart)
options/dashboard-api.js | 155 +-- (webhook auth, Redis consolidation, ESLint)
setting.js               |   2 +- (date fix)
.env                     |       (untracked from git, PG_SLOW_MS)
```

## Post-deploy Checklist

- [ ] Deploy ke server dan restart PM2
- [ ] Rotate secrets (Midtrans, Telegram, R2) karena `.env` ada di git history
- [ ] Pastikan gowa-bot kirim header `X-Webhook-Secret: apiku` saat POST ke webhook
- [ ] Monitor log untuk memastikan Redis reconnect bekerja
- [ ] Cek PG slow query log — harusnya tidak ada lagi `SELECT 1` yang muncul
