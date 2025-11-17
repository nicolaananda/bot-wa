# 🌐 Web POS - GiHa Smart Bot

Web POS alternatif untuk bot WhatsApp GiHa Smart Bot. Sistem ini dapat digunakan saat bot sedang maintenance atau sebagai opsi pembelian tambahan untuk pelanggan.

## ✨ Fitur

- ✅ Login dengan nomor WhatsApp + PIN
- ✅ Sinkronisasi saldo dengan database bot
- ✅ Lihat dan beli produk yang tersedia
- ✅ Pengurangan saldo otomatis setelah pembelian
- ✅ Pengurangan stok otomatis dari database
- ✅ Tampilan detail akun setelah pembelian
- ✅ Riwayat transaksi
- ✅ Ubah PIN di pengaturan
- ✅ UI modern dan responsive

## 🚀 Cara Menjalankan

### 1. Install Dependencies

Pastikan Anda sudah menginstall semua dependencies termasuk yang baru:

```bash
npm install
```

### 2. Jalankan Web POS

```bash
npm run webpos
```

Atau dengan auto-reload saat development:

```bash
npm run webpos:dev
```

Server akan berjalan di: **http://localhost:3001**

### 3. Konfigurasi Port (Opsional)

Secara default, Web POS berjalan di port **3001**. Anda dapat mengubahnya dengan menambahkan environment variable di file `.env`:

```env
WEB_POS_PORT=3001
WEB_POS_SECRET=your-secret-key-here
```

## 🔐 Sistem Autentikasi

### PIN Default
- **PIN default untuk semua user: `1234`**
- User dapat mengubah PIN di menu Pengaturan setelah login
- PIN disimpan dalam database dan persisten

### Format Login
- **Nomor WhatsApp**: Bisa dengan atau tanpa kode negara (62)
  - Contoh: `081234567890` atau `6281234567890`
- **PIN**: 4 digit angka

## 📱 Halaman yang Tersedia

### 1. Login (`/`)
- Halaman login dengan nomor WhatsApp dan PIN
- Validasi user dari database bot
- Session management

### 2. Dashboard (`/dashboard`)
- Informasi saldo, role, dan nomor WhatsApp
- Tombol quick access ke fitur lain
- Riwayat transaksi terakhir

### 3. Produk (`/products`)
- Daftar semua produk yang tersedia
- Filter/search produk
- Informasi stok real-time
- Modal konfirmasi pembelian
- Tampilan detail akun setelah pembelian

### 4. Pengaturan (`/settings`)
- Informasi akun
- Ubah PIN
- Informasi sistem

## 💾 Integrasi Database

Web POS terintegrasi langsung dengan database bot WhatsApp melalui PostgreSQL.

### Data yang Disinkronisasi:
- ✅ Saldo user
- ✅ Role user (Bronze, Silver, Gold)
- ✅ Stok produk
- ✅ Harga produk (dengan profit sesuai role)
- ✅ Transaksi
- ✅ PIN user

## 🔄 Alur Pembelian

1. User login dengan nomor WhatsApp + PIN
2. User memilih produk dari halaman Produk
3. User memasukkan jumlah yang ingin dibeli
4. Sistem mengecek:
   - Ketersediaan stok
   - Kecukupan saldo
5. Jika valid, sistem akan:
   - Mengurangi saldo user
   - Mengurangi stok produk (shift dari array)
   - Menyimpan transaksi
   - Menampilkan detail akun yang dibeli
6. User mendapat detail akun berisi:
   - Email
   - Password
   - Profile
   - PIN
   - 2FA (jika ada)

## 📊 Format Data Stok

Stok produk disimpan dalam format:
```
email|password|profile|pin|2fa
```

Contoh:
```
user@example.com|pass123|ProfileName|1234|ABCD1234
```

## 🛡️ Keamanan

- Session-based authentication
- PIN hashing dapat ditambahkan (currently plain text untuk kompatibilitas)
- Validasi input di frontend dan backend
- CORS protection
- Session timeout (24 jam)

## 🎨 Customisasi

### Mengubah Tema/Warna
Edit file `/web-pos-public/css/style.css` untuk mengubah warna dan styling.

Gradient utama saat ini:
```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Mengubah Nama Bot
Edit variabel `nav-brand` di setiap HTML file atau ubah di `setting.js`:
```javascript
global.botName = "GiHa Smart Bot"
```

## 🐛 Troubleshooting

### Port sudah digunakan
Ubah port di `.env`:
```env
WEB_POS_PORT=3002
```

### Database tidak terbaca
Pastikan PostgreSQL sudah dikonfigurasi dengan benar dan kredensial pada `.env` sesuai dengan instance Anda.

### User tidak bisa login
- Pastikan nomor WhatsApp sudah terdaftar di bot
- PIN default adalah `1234`
- Coba format nomor tanpa simbol (+, -, spasi)

### Stok tidak berkurang
Periksa format stok di database harus menggunakan array dengan format:
```json
{
  "stok": [
    "email|password|profile|pin|2fa",
    "email2|password2|profile2|pin2|2fa2"
  ]
}
```

## 📝 API Endpoints

### Authentication
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `GET /api/user` - Get current user info

### Products
- `GET /api/products` - Get all products with stock

### Transactions
- `POST /api/purchase` - Purchase product
- `GET /api/transactions` - Get transaction history

### Settings
- `POST /api/change-pin` - Change user PIN

### Health
- `GET /api/health` - Check API status

## 🔧 Development

Untuk development dengan auto-reload:

```bash
npm run webpos:dev
```

Pastikan `nodemon` sudah terinstall:
```bash
npm install -g nodemon
```

## 📞 Support

Jika ada pertanyaan atau masalah, hubungi owner bot atau buka issue di repository.

## 📜 License

Mengikuti lisensi dari bot WhatsApp utama (ISC).

---

**Dibuat dengan ❤️ untuk GiHa Smart Bot**

