# Bot Telegram Topup

Bot Telegram untuk layanan topup game, pulsa, dan paket data dengan sistem pembayaran otomatis.

## 🚀 Fitur

- ✅ Sistem deposit otomatis (QRIS & E-Wallet)
- ✅ Topup game dan pulsa
- ✅ Database JSON dengan auto backup
- ✅ Command system dengan prefix /
- ✅ Inline keyboard support
- ✅ Owner management system
- ✅ Broadcast message
- ✅ Transaction history
- ✅ Role-based access (Bronze, Silver, Gold)

## 📋 Requirements

- Node.js v14 atau lebih baru
- NPM atau Yarn
- Bot Telegram Token dari @BotFather

## 🛠️ Installation

1. Clone atau download project ini
```bash
git clone <repository-url>
cd bot-telegram
```

2. Install dependencies
```bash
npm install
```

3. Konfigurasi bot
   - Edit file `setting.js`
   - Masukkan token bot Telegram Anda
   - Konfigurasi payment gateway
   - Set owner ID

4. Jalankan bot
```bash
npm start
```

Atau untuk development:
```bash
npm run dev
```

## ⚙️ Konfigurasi

### Token Bot Telegram
1. Chat @BotFather di Telegram
2. Ketik `/newbot`
3. Ikuti instruksi untuk membuat bot
4. Copy token yang diberikan
5. Paste ke `setting.js` pada variabel `telegramToken`

### Owner ID
1. Chat @userinfobot di Telegram
2. Bot akan memberikan user ID Anda
3. Masukkan ID tersebut ke array `owner` di `setting.js`

### Payment Configuration
Edit bagian payment di `setting.js`:
```javascript
global.payment = {
  qris: {
    an: "NAMA_ANDA" // Atas nama QRIS
  },
  dana: {
    nope: "08xxxxxxxxxx",
    an: "NAMA_ANDA"
  }
  // dst...
}
```

## 🎮 Command List

### User Commands
- `/start` atau `/menu` - Tampilkan menu utama
- `/saldo` - Cek saldo
- `/deposit` - Deposit saldo
- `/payqris` - Deposit via QRIS
- `/paywallet` - Deposit via E-Wallet
- `/topup` - Topup game/pulsa
- `/list` - Daftar harga produk
- `/owner` - Info owner
- `/help` - Bantuan

### Owner Commands
- `/addproduk` - Tambah produk
- `/delproduk` - Hapus produk
- `/editproduk` - Edit produk
- `/addsaldo <userid>|<amount>` - Tambah saldo user
- `/minsaldo <userid>|<amount>` - Kurangi saldo user
- `/broadcast <pesan>` - Broadcast ke semua user
- `/stats` - Statistik bot
- `/backup` - Backup database manual

## 📁 Struktur Project

```
bot-telegram/
├── main.js              # File utama bot
├── index.js             # Handler pesan
├── setting.js           # Konfigurasi bot
├── package.json         # Dependencies
├── function/
│   ├── database.js      # Database handler
│   ├── console.js       # Console utilities
│   └── chache.js        # Module caching
├── options/
│   ├── backup.js        # Auto backup system
│   ├── graceful-shutdown.js # Graceful shutdown
│   ├── db-helper.js     # Database helpers
│   ├── database.json    # Database file
│   └── image/           # Image assets
└── backups/             # Auto backup folder
```

## 🔧 Customization

### Menambah Command Baru
1. Buka file `index.js`
2. Tambahkan case baru di switch statement:
```javascript
case 'commandbaru':
  // Logic command Anda
  reply('Response command baru')
  break
```

### Menambah Produk
Gunakan command `/addproduk` sebagai owner, atau edit langsung di database.

### Mengubah Tampilan Menu
Edit function `menu()` di file `setting.js`

## 💾 Database

Bot menggunakan database JSON sederhana dengan struktur:
```json
{
  "users": {
    "user_id": {
      "saldo": 0,
      "role": "bronze"
    }
  },
  "transaksi": [],
  "produk": {},
  "deposit": {},
  "topup": {}
}
```

Auto backup berjalan setiap 12 jam (dapat diubah di `setting.js`).

## 🚨 Troubleshooting

### Bot tidak merespon
- Pastikan token bot benar
- Cek koneksi internet
- Lihat log error di console

### Database error
- Pastikan folder `options` ada dan writable
- Cek backup di folder `backups`
- Restart bot

### Payment tidak berfungsi
- Cek konfigurasi payment gateway
- Pastikan API key valid
- Cek log transaksi

## 📞 Support

Jika ada pertanyaan atau butuh bantuan:
1. Buat issue di repository ini
2. Hubungi developer

## 📄 License

MIT License - Lihat file LICENSE untuk detail lengkap.

---

**⚠️ Disclaimer:** Bot ini dibuat untuk tujuan edukasi. Pastikan Anda mematuhi semua regulasi yang berlaku terkait layanan pembayaran digital. 