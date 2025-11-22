# 🗄️ Setup PostgreSQL untuk Webhook Midtrans

## ✅ Yang Sudah Dibuat

1. **Table `midtrans_webhooks`** di PostgreSQL
2. **Dashboard-api.js** menyimpan webhook ke PostgreSQL
3. **Bot-wa (index.js)** polling dari PostgreSQL

## 📋 Setup Database

### 1. Buat Table di PostgreSQL

Jalankan SQL berikut di database `bot_wa`:

```sql
-- Table untuk menyimpan webhook notifications
CREATE TABLE IF NOT EXISTS midtrans_webhooks (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  transaction_id TEXT,
  transaction_status TEXT NOT NULL,
  payment_type TEXT,
  gross_amount NUMERIC(18,2) NOT NULL,
  settlement_time TIMESTAMPTZ,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  webhook_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index untuk query yang cepat
CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_processed ON midtrans_webhooks(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_order_id ON midtrans_webhooks(order_id);
CREATE INDEX IF NOT EXISTS idx_midtrans_webhooks_gross_amount ON midtrans_webhooks(gross_amount);
```

Atau jalankan file schema:
```bash
psql -U bot_wa -d bot_wa -f options/schema.sql
```

## 🔧 Cara Kerja

### 1. Webhook Masuk (dashboard-api.js)
- Midtrans kirim webhook → `dashboard-api.js` terima
- Simpan ke PostgreSQL table `midtrans_webhooks`
- Mark `processed = false`

### 2. Bot-wa Polling (index.js)
- Setiap ~9-15 detik, bot-wa query PostgreSQL
- Cari webhook dengan:
  - `processed = false`
  - `transaction_status IN ('settlement', 'capture')`
  - `ABS(gross_amount - orderAmount) < 1` (tolerance 1 rupiah)
- Jika match → process pembayaran
- Update `processed = true`

## 🎯 Keuntungan PostgreSQL

1. **Multi-process safe** - dashboard-api dan bot-wa bisa akses bersamaan
2. **Reliable** - tidak ada race condition
3. **Queryable** - bisa query dengan SQL yang powerful
4. **Scalable** - bisa handle banyak webhook
5. **Persistent** - data tidak hilang saat restart

## 📊 Monitoring

Cek webhook di database:
```sql
-- Lihat semua webhook
SELECT * FROM midtrans_webhooks ORDER BY created_at DESC LIMIT 10;

-- Lihat webhook yang belum processed
SELECT * FROM midtrans_webhooks WHERE processed = false ORDER BY created_at DESC;

-- Lihat webhook dengan amount tertentu
SELECT * FROM midtrans_webhooks WHERE gross_amount = 2027.00;
```

## 🐛 Troubleshooting

### Webhook tidak terdeteksi

1. **Cek apakah webhook tersimpan:**
   ```sql
   SELECT * FROM midtrans_webhooks WHERE order_id LIKE 'QRIS-%' ORDER BY created_at DESC LIMIT 5;
   ```

2. **Cek apakah amount match:**
   ```sql
   SELECT id, order_id, gross_amount, processed, created_at 
   FROM midtrans_webhooks 
   WHERE processed = false 
   ORDER BY created_at DESC;
   ```

3. **Cek log bot-wa:**
   ```bash
   pm2 logs 0 | grep -E "MID\]|webhook|PostgreSQL"
   ```

### Amount tidak match

- Webhook: `"2027.00"` (string dengan decimal)
- Order: `2027` (integer)
- **Solusi:** Matching pakai tolerance `< 1` rupiah (sudah di-handle)

## ✅ Checklist

- [ ] Table `midtrans_webhooks` sudah dibuat
- [ ] Index sudah dibuat
- [ ] `USE_PG=true` di `.env`
- [ ] PostgreSQL connection OK
- [ ] Test dengan transaksi kecil
- [ ] Monitor log untuk melihat matching

