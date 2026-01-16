# Telegram Payment Notification Integration

## Setup Guide

### 1. Dapatkan Chat ID Grup Telegram

Jalankan script berikut untuk mendapatkan Chat ID grup Telegram Anda:

```bash
node get-telegram-chat-id.js
```

Script akan menunggu pesan. **Kirim pesan apa saja ke grup Telegram** (contoh: ketik "test" atau "/start"), dan Chat ID akan ditampilkan.

### 2. Tambahkan Environment Variables

Tambahkan konfigurasi berikut ke file `.env` Anda:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=5150179603:AAEhyyNdaXxtmLQR8WDY1OAEYmfuctBZNuA
TELEGRAM_CHAT_ID=<chat_id_dari_step_1>
```

**Catatan:** Ganti `<chat_id_dari_step_1>` dengan Chat ID yang didapat dari step 1.

### 3. Restart Bot

Setelah menambahkan environment variables, restart bot Anda:

```bash
npm start
# atau jika menggunakan PM2:
pm2 restart bot-wa
```

## Cara Kerja

Ketika ada pembayaran yang berhasil melalui Midtrans (baik deposit maupun pembelian produk), bot akan otomatis mengirim notifikasi ke grup Telegram dengan format:

```
💰 PEMBAYARAN BERHASIL

📊 Jenis: DEPOSIT / PEMBELIAN
💵 Total: Rp 50.123
📱 No HP: 628123456789
🔖 Order ID: DEP-ABC123-1234567890

⏰ 16/01/2026, 13:00:00
```

## Troubleshooting

### Bot tidak mengirim notifikasi

1. **Cek environment variables:**
   ```bash
   echo $TELEGRAM_BOT_TOKEN
   echo $TELEGRAM_CHAT_ID
   ```

2. **Cek log bot:**
   - Jika muncul `⚠️ [TELEGRAM] TELEGRAM_BOT_TOKEN not set`, berarti env variable belum di-set
   - Jika muncul `⚠️ [TELEGRAM] Bot or Chat ID not configured`, berarti TELEGRAM_CHAT_ID belum di-set

3. **Pastikan bot sudah ditambahkan ke grup:**
   - Buka grup Telegram
   - Klik nama grup → Add Members
   - Cari bot Anda dan tambahkan

### Chat ID tidak muncul saat menjalankan script

1. Pastikan bot sudah ditambahkan ke grup
2. Kirim pesan **baru** ke grup (bukan pesan lama)
3. Cek apakah bot token benar

## File-file Terkait

- **`lib/telegram-notifier.js`** - Module untuk mengirim notifikasi Telegram
- **`get-telegram-chat-id.js`** - Script helper untuk mendapatkan Chat ID
- **`index.js`** - Main bot file (sudah terintegrasi dengan notifikasi)

## Fitur

✅ Notifikasi otomatis untuk semua transaksi (deposit & pembelian)  
✅ Format pesan yang jelas dan informatif  
✅ Menampilkan total nominal dan nomor HP customer  
✅ Error handling yang baik (tidak akan crash bot jika Telegram gagal)  
✅ Support untuk emoji dan formatting Markdown
