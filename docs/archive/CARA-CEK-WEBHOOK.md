# 🔍 Cara Cek Webhook Midtrans

## ✅ Metode 1: Test Endpoint (Paling Cepat)

Endpoint test sudah ditambahkan untuk cek apakah webhook bisa diakses:

```bash
# Buka di browser atau gunakan curl
https://api.nicola.id/webhook/midtrans/test
```

**Jika berhasil**, akan muncul response:
```json
{
  "status": "ok",
  "message": "Webhook endpoint is accessible",
  "timestamp": "2025-01-XX...",
  "url": "/webhook/midtrans"
}
```

**Jika gagal**, berarti:
- Server tidak running
- Domain tidak terhubung ke server
- Port tidak bisa diakses

---

## ✅ Metode 2: Cek Log Server

Monitor log server untuk melihat apakah ada request masuk dari Midtrans:

```bash
# Jika menggunakan PM2
pm2 logs dashboard-api

# Atau cek log file langsung
tail -f /path/to/log/file
```

**Yang dicari di log:**
- `🔔 [Webhook] Midtrans notification:` - Berarti webhook menerima request
- `✅ [Webhook] Payment successful` - Berarti pembayaran berhasil
- `❌ [Webhook] Invalid signature` - Berarti signature tidak valid

---

## ✅ Metode 3: Test dengan Transaksi Kecil

**Cara paling akurat untuk test webhook:**

1. **Buat order dengan QRIS statis** (via bot atau web POS)
2. **Lakukan pembayaran** dengan nominal kecil (misal: Rp 1.000)
3. **Monitor log server** - harus muncul notifikasi webhook
4. **Cek di Midtrans Dashboard** → Transactions → Lihat status transaksi

**Yang harus muncul di log:**
```
🔔 [Webhook] Midtrans notification: {...}
📋 [Webhook] Order: ORDER-XXX, Status: settlement, Payment: qris
✅ [Webhook] Payment successful for ORDER-XXX
```

---

## ✅ Metode 4: Cek di Midtrans Dashboard

1. Login ke [Midtrans Dashboard](https://dashboard.midtrans.com)
2. Pilih **Transactions** → **Transaction List**
3. Cari transaksi terbaru
4. Klik transaksi → Lihat detail
5. Scroll ke bagian **Webhook Notifications**
6. Lihat status webhook:
   - ✅ **Success** = Webhook terkirim dan diterima
   - ❌ **Failed** = Webhook gagal terkirim (cek URL atau server)
   - ⏳ **Pending** = Belum ada notifikasi

---

## ✅ Metode 5: Test Manual dengan curl

Test manual mengirim request ke webhook (tanpa signature, hanya untuk test endpoint):

```bash
curl -X POST https://api.nicola.id/webhook/midtrans \
  -H "Content-Type: application/json" \
  -d '{"test": "manual"}'
```

**Response yang diharapkan:**
- `400` dengan message "Invalid signature" = Endpoint berfungsi, tapi signature tidak valid (normal untuk test manual)
- `200` dengan `{"status":"ok"}` = Endpoint berfungsi

---

## 🐛 Troubleshooting

### ❌ Webhook tidak menerima request

**Cek:**
1. ✅ Server `dashboard-api.js` sedang running?
   ```bash
   pm2 list
   # atau
   ps aux | grep dashboard-api
   ```

2. ✅ Domain `api.nicola.id` terhubung ke server?
   ```bash
   ping api.nicola.id
   curl https://api.nicola.id/webhook/midtrans/test
   ```

3. ✅ Port 3002 (atau port yang digunakan) bisa diakses?
   ```bash
   netstat -tulpn | grep 3002
   ```

4. ✅ Firewall tidak memblokir port?
   ```bash
   sudo ufw status
   ```

### ❌ Webhook menerima request tapi signature invalid

**Cek:**
1. ✅ `MIDTRANS_SERVER_KEY` di `.env` sudah benar?
2. ✅ Server key yang digunakan sesuai dengan environment (sandbox/production)?
3. ✅ Signature verification function bekerja dengan benar?

### ❌ Webhook tidak trigger event

**Cek:**
1. ✅ Status transaksi adalah `settlement` atau `capture`?
2. ✅ Listener untuk event `payment-completed` sudah terpasang?
3. ✅ Log menunjukkan `✅ [Webhook] Payment successful`?

---

## 📊 Checklist Webhook

Gunakan checklist ini untuk memastikan webhook berfungsi:

- [ ] Endpoint test bisa diakses: `https://api.nicola.id/webhook/midtrans/test`
- [ ] URL webhook sudah di-set di Midtrans Dashboard
- [ ] Server `dashboard-api.js` sedang running
- [ ] Log server menunjukkan request masuk saat ada transaksi
- [ ] Signature verification berfungsi (tidak ada error "Invalid signature")
- [ ] Event `payment-completed` ter-trigger saat pembayaran berhasil
- [ ] Transaksi di Midtrans Dashboard menunjukkan webhook status "Success"

---

## 🚀 Quick Test

**Test cepat dalam 30 detik:**

1. Buka: `https://api.nicola.id/webhook/midtrans/test`
2. Jika muncul JSON response = ✅ Webhook endpoint accessible
3. Lakukan transaksi kecil via QRIS statis
4. Cek log server = Harus muncul `🔔 [Webhook] Midtrans notification`

**Jika semua ✅ = Webhook berfungsi dengan baik!**

