//SETTING
global.owner = ["1222156616", "2131595063"] // Ganti dengan Telegram ID Anda
global.botName = 'BOT TELEGRAM TOPUP'
global.ownerName = 'Nicola'
global.packName = 'Sticker By '
global.authorName = global.ownerName
global.linkGroup = 'https://chat.whatsapp.com/your-group-link'
global.thumbnail = './options/image/thumb.jpg'

// Telegram Settings
global.telegramToken = "7948953003:AAGQpW04M918xeGnYbBfWey9U6A2DiWkZkQ"
global.telegramAdmins = [] // Telegram admin IDs

// Payment Gateway Configuration
global.payment = {
  qris: {
    type: "url",
    data: "https://example.com/qris-payment"
  }
}

//Function toRupiah
global.toRupiah = (angka) => {
  // Handle null, undefined, or invalid input
  if (angka === null || angka === undefined || isNaN(angka)) {
    return '0';
  }
  
  var saldo = '';
  var angkarev = angka.toString().split('').reverse().join('');
  for (var i = 0; i < angkarev.length; i++)
    if (i % 3 == 0) saldo += angkarev.substr(i, 3) + '.';
  return '' + saldo.split('', saldo.length - 1).reverse().join('');
}

//Function menu
global.menu = (prefix, sender, pushname) => {
  return `🤖 BOT TELEGRAM TOPUP 🤖

👤 Halo ${pushname}!
📱 Platform: Telegram
⏰ ${moment.tz('Asia/Jakarta').format('HH:mm:ss')} WIB
📅 ${moment.tz('Asia/Jakarta').format('DD MMM YYYY')}

📋 MENU UTAMA
• /ceksaldo - Cek saldo
• /deposit - Deposit saldo
• /stok - Cek stok produk  
• /buy - Beli produk langsung

💰 DEPOSIT
Format: /deposit <nominal>
Contoh: /deposit 50000

🛒 PEMBELIAN LANGSUNG
Format: /buy <kode_produk> <jumlah>
Contoh: /buy net2u 1

🔍 PENCARIAN PRODUK
Ketik nama produk untuk mencari:
• netflix - Cari produk Netflix
• canva - Cari produk Canva
• capcut - Cari produk CapCut

🔗 LINK AKUN
• /link - Hubungkan dengan WhatsApp
• /cancel - Batalkan proses

Bot otomatis 24/7 ⚡`
}

//Function menu owner
global.menuOwner = (prefix, sender, pushname) => {
  return `*👑 MENU OWNER*

*📋 COMMAND OWNER:*
• /addproduk - Tambah produk
• /delproduk - Hapus produk
• /addstok - Tambah stok
• /broadcast - Broadcast pesan

_Khusus owner bot_`
}

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file)
  console.log(require('chalk').redBright("Update 'setting.js'"))
  delete require.cache[file]
  require(file)
}) 