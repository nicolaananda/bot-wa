# Format Order ID TRX untuk Midtrans

## Format Order ID yang Digunakan

### Format:
```
TRX-[HEX]-[TIMESTAMP]
```

### Contoh:
```
TRX-BC68215624-1756745893738
TRX-98557370BA-1756745933765
```

## Komponen Order ID:

### 1. **Prefix "TRX"**
- Menandakan ini adalah transaksi
- Mudah dikenali dan diingat
- Konsisten dengan format yang sudah ada

### 2. **HEX Code (10 karakter)**
- `crypto.randomBytes(5).toString("hex").toUpperCase()`
- Menghasilkan 10 karakter hex yang unik
- Contoh: `BC68215624`, `98557370BA`

### 3. **Timestamp**
- `Date.now()` - timestamp saat transaksi dibuat
- Memastikan keunikan order ID
- Contoh: `1756745893738`, `1756745933765`

## Implementasi di Code:

### index.js:
```javascript
// Generate unique external ID
const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
const orderId = `TRX-${reffId}-${Date.now()}`;
```

### Hasil:
```
Order ID: TRX-BC68215624-1756745893738
```

## URL Payment Link:

### Format URL:
```
https://app.sandbox.midtrans.com/payment-links/TRX-BC68215624-1756745893738
```

### Contoh Lengkap:
```
https://app.sandbox.midtrans.com/payment-links/TRX-98557370BA-1756745933765
```

## Keunggulan Format TRX:

### 1. **Short & Clean**
- ✅ Lebih pendek dari format sebelumnya
- ✅ Mudah dibaca dan diingat
- ✅ Tidak terlalu panjang untuk URL

### 2. **Unique & Secure**
- ✅ Kombinasi HEX + timestamp memastikan keunikan
- ✅ Sulit ditebak oleh user lain
- ✅ Aman dari collision

### 3. **Professional**
- ✅ Format yang konsisten dan rapi
- ✅ Mudah dikenali sebagai transaksi
- ✅ Cocok untuk business use

### 4. **User-Friendly**
- ✅ URL yang tidak terlalu panjang
- ✅ Mudah di-copy paste
- ✅ Tidak mengandung karakter aneh

## Bot Message Format:

```
🧾 MENUNGGU PEMBAYARAN 🧾

Produk ID: viu1t
Nama Produk: VIU 1 TAHUN
Harga: Rp10,000
Jumlah: 1
Biaya Admin: Rp10
Total: Rp10,010
Waktu: 10 menit

Silakan scan QRIS di atas untuk melakukan pembayaran.

🔗 Link Invoice: https://app.sandbox.midtrans.com/payment-links/TRX-98557370BA-1756745933765

Jika ingin membatalkan, ketik batal
```

## Testing Results:

✅ **Order ID Generation**: Berhasil dengan format TRX
✅ **Payment Creation**: Transaksi berhasil dibuat
✅ **URL Generation**: Payment Link URL berhasil dibuat
✅ **QR Code**: QR string valid untuk scan
✅ **Status Checking**: Status bisa di-check dengan Order ID

## Production vs Sandbox:

### Sandbox:
```
https://app.sandbox.midtrans.com/payment-links/TRX-BC68215624-1756745893738
```

### Production:
```
https://app.midtrans.com/payment-links/TRX-BC68215624-1756745893738
```

## Kesimpulan:

Format Order ID `TRX-BC68215624-1756745893738` sudah sempurna:
- ✅ **Short & Clean**: Format yang pendek dan mudah dibaca
- ✅ **Unique**: Kombinasi HEX + timestamp memastikan keunikan
- ✅ **Professional**: Format yang konsisten dan rapi
- ✅ **User-Friendly**: URL yang tidak terlalu panjang
- ✅ **Working**: Semua fungsi bekerja dengan sempurna

**Bot sekarang menggunakan format Order ID TRX yang optimal!** 🎉
