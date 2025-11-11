# 🔄 Migrasi dari QRIS Dana ke Livin Merchant

## 📋 Ringkasan Perubahan

Dokumen ini menjelaskan perubahan yang dilakukan untuk mengubah listener pembayaran QRIS dari **Dana** menjadi **Livin Merchant** (Bank Mandiri).

## ✅ Perubahan yang Dilakukan

### 1. **File: `index.js`**

#### a. Case `buynow` (Beli dengan QRIS - Baris 2575)
**Sebelum:**
```javascript
const pkgOk = (n.package_name === 'id.dana') || (String(n.app_name||'').toUpperCase().includes('DANA'))
```

**Sesudah:**
```javascript
const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('LIVIN'))
```

#### b. Case `deposit` (Deposit Saldo - Baris 2405)
**Sebelum:**
```javascript
const pkgOk = (n.package_name === 'id.dana') || (String(n.app_name||'').toUpperCase().includes('DANA'))
```

**Sesudah:**
```javascript
const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('LIVIN'))
```

#### c. Function `checkPaymentViaPG` (Case qris - Baris 2117)
**Sebelum:**
```javascript
const appOk = (n.packageName === "id.dana") || (String(n.appName || "").toUpperCase().includes("DANA"));
```

**Sesudah:**
```javascript
const appOk = (n.packageName === "id.bmri.livinmerchant") || (String(n.appName || "").toUpperCase().includes("LIVIN"));
```

#### d. Metadata Transaksi (Baris 2280)
**Sebelum:**
```javascript
metodeBayar: "QRIS-DANA"
```

**Sesudah:**
```javascript
metodeBayar: "QRIS-LIVIN"
```

#### e. Komentar dan Log (Berbagai baris)
- Baris 2025: Komentar `// QRIS statis Dana` → `// QRIS statis Livin Merchant`
- Baris 2101: Komentar package_name Dana → Livin
- Baris 2305: Error log "QRIS DANA" → "QRIS LIVIN"

### 2. **File: `setting.js`**

#### Komentar QRIS Code (Baris 11)
**Sebelum:**
```javascript
global.codeqr = "..." //Code QR lu (DANA)
```

**Sesudah:**
```javascript
global.codeqr = "..." //Code QR lu (Livin Merchant) - Ganti dengan QRIS Livin Anda
```

### 3. **File: `FITUR-BOT.md`**

Update dokumentasi fitur untuk menggambarkan penggunaan Livin Merchant listener.

### 4. **File: `README.md`**

Update dokumentasi payment monitoring untuk menyebutkan Livin Merchant listener.

### 5. **File: `IMPROVEMENTS.md`**

Update contoh kode untuk mencantumkan bahwa QRIS bisa dari Dana atau Livin Merchant.

## 🔧 Yang Perlu Anda Lakukan

### 1. **Update QRIS Code di `setting.js`**

Ganti `global.codeqr` dengan QRIS statis dari akun **Livin Merchant** Anda:

```javascript
global.codeqr = "QRIS_CODE_LIVIN_MERCHANT_ANDA_DISINI"
```

Untuk mendapatkan QRIS code Livin Merchant:
1. Buka aplikasi Livin by Mandiri
2. Pilih menu "Terima Uang" atau "QRIS"
3. Screenshot QR Code
4. Gunakan QR decoder untuk mendapatkan string QRIS
5. Copy string tersebut ke `global.codeqr`

### 2. **Setup Payment Gateway Listener**

Pastikan listener backend Anda (`https://api-pg.nicola.id`) sudah dikonfigurasi untuk mendeteksi notifikasi dari aplikasi **Livin Merchant**:

- Package name: `id.bmri.livinmerchant`
- App name: Mengandung kata "LIVIN"

### 3. **Testing**

Setelah update, lakukan testing untuk memastikan:

#### Test Case 1: Buynow (Pembelian QRIS)
```
1. Jalankan command: .buynow [idproduk] [jumlah]
2. Bot akan generate QRIS
3. Bayar menggunakan aplikasi Livin Merchant
4. Verifikasi pembayaran terdeteksi otomatis
5. Verifikasi produk dikirim ke customer
```

#### Test Case 2: Deposit (Top-up Saldo)
```
1. Jalankan command: .deposit [nominal]
2. Bot akan generate QRIS
3. Bayar menggunakan aplikasi Livin Merchant
4. Verifikasi saldo bertambah otomatis
```

#### Test Case 3: QRIS Dinamis
```
1. Jalankan command: .qris [idproduk] [jumlah]
2. Bot akan generate QRIS dinamis
3. Bayar menggunakan aplikasi Livin Merchant
4. Verifikasi pembayaran terdeteksi
```

## 📱 Package Name Livin Merchant

Sistem sekarang mendeteksi pembayaran dari:
- Package: `id.bmri.livinmerchant` ✅ (Package name yang benar)
- App Name: Mengandung "LIVIN" (fallback)

## ⚠️ Catatan Penting

1. **QRIS Code**: Pastikan Anda mengganti QRIS code di `setting.js` dengan QRIS dari Livin Merchant
2. **Listener Backend**: Pastikan listener backend Anda bisa membaca notifikasi dari Livin Merchant
3. **Testing**: Lakukan testing menyeluruh sebelum digunakan di production
4. **Backward Compatibility**: Jika masih ada transaksi lama dengan "QRIS-DANA", data tersebut tetap tersimpan

## 🔍 Troubleshooting

### Masalah: Pembayaran tidak terdeteksi

**Solusi:**
1. Cek apakah listener backend berjalan dengan benar
2. Cek apakah package name Livin Merchant di perangkat Anda sama dengan yang di kode
3. Cek log di console untuk melihat struktur notifikasi yang diterima
4. Pastikan notification permission sudah diberikan ke listener app

### Masalah: Error saat generate QRIS

**Solusi:**
1. Pastikan `global.codeqr` sudah diisi dengan QRIS Livin Merchant yang valid
2. Cek apakah format QRIS sesuai standar Indonesia
3. Cek log error untuk detail lebih lanjut

## 📞 Support

Jika ada masalah, hubungi developer atau cek log di:
- Console log: `console.log` dan `console.error`
- Database transaksi: `options/database-transaksi.json`
- Receipt files: `options/receipts/`

## 📅 Change Log

- **2024-XX-XX**: Migrasi dari Dana listener ke Livin Merchant listener
  - Updated payment detection logic
  - Updated documentation
  - Updated transaction metadata

---

**Status**: ✅ Selesai - Siap untuk testing
**Last Updated**: $(date)

