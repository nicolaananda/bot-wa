# Implementasi Xendit QRIS Gateway

## Overview
Implementasi ini menggantikan OrderKuota dengan Xendit sebagai gateway pembayaran QRIS untuk fitur `buynow`.

## Fitur yang Diimplementasikan

### 1. Konfigurasi Xendit
- File: `config/xendit.js`
- Secret Key: `xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K`
- Environment: Development

### 2. Fungsi Utama
- `createQRISPayment()` - Membuat pembayaran QRIS
- `getQRISStatus()` - Mengecek status pembayaran
- `isPaymentCompleted()` - Verifikasi pembayaran selesai

### 3. Perubahan pada Case `buynow`
- Menggunakan Xendit untuk membuat QRIS
- Generate unique external ID untuk tracking
- Monitoring status pembayaran via Xendit API
- Update metode pembayaran menjadi "QRIS-XENDIT"

## Cara Kerja

1. **User Input**: `buynow idproduk jumlah`
2. **Validasi**: Stok, produk, dan user
3. **Create Payment**: Xendit membuat QRIS dengan external ID unik
4. **Generate QR**: QR code dibuat dari response Xendit
5. **Monitoring**: Loop pengecekan status pembayaran setiap 10 detik
6. **Completion**: Jika pembayaran berhasil, proses delivery akun

## Dependencies

```json
{
  "xendit-node": "^7.0.0"
}
```

## Struktur Data Order

```javascript
db.data.order[sender] = {
  id: data[0],           // ID Produk
  jumlah: data[1],       // Jumlah Order
  from: from,            // Chat ID
  key: mess.key,         // Message Key
  externalId: externalId, // Xendit External ID
  reffId: reffId         // Reference ID
}
```

## Error Handling

- Try-catch untuk pembuatan QRIS
- Try-catch untuk monitoring status
- Fallback jika Xendit API error
- Logging error untuk debugging

## Keuntungan Xendit

1. **Reliability**: API yang stabil dan terpercaya
2. **Security**: Secret key yang aman
3. **Monitoring**: Real-time status pembayaran
4. **Scalability**: Mendukung volume transaksi tinggi
5. **Support**: Dokumentasi dan support yang lengkap

## Testing

Untuk testing, gunakan environment development Xendit:
- Secret Key: `xnd_development_*`
- Base URL: `https://api.xendit.co`
- QRIS akan expired dalam 5 menit

## Production

Untuk production, ganti dengan:
- Secret Key: `xnd_production_*`
- Base URL: `https://api.xendit.co` (sama)
- Update timeout sesuai kebutuhan bisnis 