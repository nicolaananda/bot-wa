# 📱 Tracking QRIS Statis Midtrans via API

## ✅ Jawaban Singkat

**Ya, QRIS statis Midtrans BISA ditrack via API!** 

Setiap transaksi yang masuk ke QRIS statis akan tercatat di sistem Midtrans dan bisa diakses via API.

## 🔧 Cara Tracking

### 1. **Via Webhook (Recommended - Real-time)**
Midtrans akan mengirim notifikasi otomatis saat ada transaksi masuk.

**Endpoint webhook sudah ada di:** `options/dashboard-api.js`
- URL: `/webhook/midtrans`
- Midtrans akan kirim POST request ke endpoint ini saat ada transaksi

**Setup di Midtrans Dashboard:**
1. Login ke Midtrans Dashboard
2. Settings → Configuration → Notification URL
3. Masukkan URL webhook:
   ```
   https://api-botwa.nicola.id/webhook/midtrans
   ```
4. Klik **Save**

### 2. **Via API Polling (Manual Check)**

Fungsi baru yang sudah ditambahkan:

```javascript
const { checkStaticQRISPayment } = require('./config/midtrans');

// Contoh penggunaan
const result = await checkStaticQRISPayment(
  totalAmount,        // Nominal dengan kode unik (contoh: 50000 + 12 = 50012)
  createdAtTimestamp  // Timestamp saat order dibuat (Date.now())
);

if (result.found && result.paid) {
  console.log('✅ Pembayaran ditemukan!');
  console.log('Transaction ID:', result.transaction_id);
  console.log('Status:', result.status);
  console.log('Amount:', result.gross_amount);
} else {
  console.log('⏳ Belum ada pembayaran');
}
```

### 3. **Via Transaction Status API**

Jika Anda punya `order_id` atau `transaction_id` dari webhook:

```javascript
const { getTransactionStatusByOrderId, getTransactionStatusByTransactionId } = require('./config/midtrans');

// Check by Order ID
const status = await getTransactionStatusByOrderId('ORDER-12345');

// Check by Transaction ID
const status2 = await getTransactionStatusByTransactionId('TRANSACTION-12345');
```

## 📋 Status Transaksi Midtrans

- `settlement` / `capture` = ✅ Pembayaran berhasil
- `pending` = ⏳ Menunggu pembayaran
- `expire` = ❌ Transaksi expired
- `cancel` = ❌ Transaksi dibatalkan

## ⚠️ Catatan Penting

1. **Transaction List API** mungkin tidak tersedia di semua plan Midtrans
   - Jika tidak tersedia, fungsi akan return `null` dan fallback ke webhook
   - Webhook adalah cara yang paling reliable

2. **Untuk QRIS Statis:**
   - Setiap transaksi akan punya `order_id` yang di-generate oleh Midtrans
   - `order_id` ini akan dikirim via webhook
   - Gunakan webhook untuk mendapatkan `order_id`, lalu track via API

3. **Kode Unik:**
   - Pastikan customer transfer dengan nominal yang sesuai (termasuk kode unik)
   - Sistem akan search transaksi berdasarkan nominal exact match

## 🚀 Contoh Implementasi di Code

Untuk menggabungkan tracking API dengan sistem yang ada, Anda bisa modifikasi polling di `index.js`:

```javascript
// Di case 'deposit' atau 'buynow', tambahkan opsi tracking via Midtrans API
const { checkStaticQRISPayment } = require('./config/midtrans');

// Dalam polling loop
const midtransResult = await checkStaticQRISPayment(totalAmount, createdAtTs);
if (midtransResult.found && midtransResult.paid) {
  // Pembayaran ditemukan via Midtrans API!
  console.log('✅ Payment confirmed via Midtrans API');
  // Process payment...
}
```

## 📚 Referensi

- [Midtrans QRIS Static Documentation](https://docs.midtrans.com/docs/pengenalan-qris-statis)
- [Midtrans API Reference](https://docs.midtrans.com/reference)
- [Midtrans Webhook Documentation](https://docs.midtrans.com/docs/webhook)

