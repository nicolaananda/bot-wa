# Implementasi Midtrans Payment Gateway

## Overview
Bot telah berhasil diubah dari menggunakan Xendit menjadi Midtrans sebagai payment gateway untuk pembayaran QRIS.

## Perubahan yang Dilakukan

### 1. File Konfigurasi Baru
- **config/midtrans.js** - Service Midtrans dengan API yang sudah disesuaikan
- **config/.env** - Environment variables untuk konfigurasi Midtrans

### 2. Kredensial Midtrans
- **Merchant ID**: G636278165
- **Server Key**: Mid-server-gKkldwQbOCiluq1JardRR_bk
- **Client Key**: Mid-client-nAhxrcVaalVHQMkv
- **Environment**: Sandbox (untuk testing)

### 3. Perubahan di index.js
- Case command berubah dari `xendit` menjadi `midtrans`
- Import service berubah dari `./config/xendit` menjadi `./config/midtrans`
- Variable `externalId` berubah menjadi `orderId`
- Response field `invoice_url` berubah menjadi `snap_url`
- Notifikasi berubah dari "QRIS-XENDIT" menjadi "QRIS-MIDTRANS"

### 4. API Endpoint
- Base URL: https://api.sandbox.midtrans.com
- Create Transaction: POST /snap/v1/transactions
- Check Status: GET /v2/{order_id}/status

## Cara Penggunaan

### Command Bot
```
midtrans <product_id> <quantity>
```

### Contoh:
```
midtrans PROD001 2
```

## Flow Pembayaran

1. **User Request**: User mengetik command `midtrans` dengan ID produk dan jumlah
2. **Validasi**: Bot memvalidasi stok, produk, dan input
3. **Create Payment**: Bot memanggil Midtrans Snap API untuk membuat transaksi
4. **Generate QR**: QR code dibuat dari Snap URL yang diterima
5. **Send QR**: Bot mengirim QR code dan detail pembayaran
6. **Monitor**: Bot melakukan polling status pembayaran setiap 15 detik
7. **Complete**: Jika pembayaran berhasil, produk dikirim ke user

## Status Pembayaran

### Midtrans Transaction Status:
- **pending** - Transaksi menunggu pembayaran
- **settlement** - Pembayaran berhasil (untuk credit card, gopay, dll)
- **capture** - Pembayaran berhasil (untuk credit card)
- **expire** - Transaksi kedaluwarsa
- **cancel** - Transaksi dibatalkan
- **deny** - Transaksi ditolak
- **failure** - Transaksi gagal

## Testing

File test sudah tersedia: `test-midtrans.js`

```bash
node test-midtrans.js
```

## Keunggulan Midtrans

1. **Support QRIS**: Native support untuk QRIS payment
2. **Snap Integration**: Easy integration dengan Snap API
3. **Real-time Status**: Real-time payment status checking
4. **Sandbox Environment**: Testing environment tersedia
5. **Multiple Payment Methods**: Support berbagai metode pembayaran
6. **Dashboard**: Management console untuk monitoring transaksi

## Environment Variables

```env
MIDTRANS_SERVER_KEY=Mid-server-gKkldwQbOCiluq1JardRR_bk
MIDTRANS_CLIENT_KEY=Mid-client-nAhxrcVaalVHQMkv
MIDTRANS_MERCHANT_ID=G636278165
MIDTRANS_BASE_URL=https://api.sandbox.midtrans.com
MIDTRANS_IS_PRODUCTION=false
```

## Production Setup

Untuk production:
1. Ganti `MIDTRANS_BASE_URL` menjadi `https://api.midtrans.com`
2. Set `MIDTRANS_IS_PRODUCTION=true`
3. Gunakan production server key dari Midtrans Dashboard

## Error Handling

- Try-catch untuk semua API calls
- Automatic retry dengan timeout
- Detailed error logging
- Graceful degradation jika API error

## Cache System

- Local payment cache untuk mengurangi API calls
- 5 menit cache TTL
- Automatic cache cleanup
- Persistent cache storage dalam JSON file

Migration dari Xendit ke Midtrans telah selesai dan siap digunakan!
