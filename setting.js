// Load environment variables
require('dotenv').config();

//Pairing Code
global.pairingCode = String(process.env.BOT_PAIRING_CODE || 'true').toLowerCase() === 'true' //true = gausah scan qr cukup 1 hp || false = harus scan qr dan 2 hp

//Backup otomatis 
global.jamBackup = Number(process.env.BOT_BACKUP_HOURS || 12) //Contoh: 12, berarti setiap 12 jam otomatis backup script

//Setting order kuota
global.memberId = process.env.ORDER_KUOTA_MEMBER_ID || "" //Untuk cara mendapatkannya cek di file panduan.txt
global.pin = process.env.ORDER_KUOTA_PIN || "" //Pin order kuota
global.pw = process.env.ORDER_KUOTA_PASSWORD || "" //Password order kuota
global.codeqr = process.env.MIDTRANS_STATIC_QRIS || "" //Code QR lu (GoPay Merchant) - Ganti dengan QRIS GoPay Anda
// Force app to use this static QR string for dynamic generation and display
if (global.codeqr) {
  process.env.MIDTRANS_STATIC_QRIS = global.codeqr
  process.env.MIDTRANS_USE_STATIC_ONLY = process.env.MIDTRANS_USE_STATIC_ONLY || 'true'
}

//Persentase fee deposit
global.feeDepo = Number(process.env.FEE_DEPO || 2)

//Type profit
global.type = process.env.PROFIT_TYPE || "persen" //persen = profit menggunakan persentase || nominal = profit menggunakan nominal

//Persentase default || Jika type profit menggunakan persentase
global.bronze = Number(process.env.PROFIT_BRONZE_PERCENT || 2) //Persentase keuntungan Bronze
global.silver = Number(process.env.PROFIT_SILVER_PERCENT || 1.5) //Persentase keuntungan Silver
global.gold = Number(process.env.PROFIT_GOLD_PERCENT || 1) //Persentase keuntungan Gold

//Profit nominal default || Jika type profit menggunakan nominal
global.nBronze = Number(process.env.PROFIT_BRONZE_NOMINAL || 1000) //Nominal keuntungan Bronze
global.nSilver = Number(process.env.PROFIT_SILVER_NOMINAL || 500) //Nominal keuntungan Silver
global.nGold = Number(process.env.PROFIT_GOLD_NOMINAL || 200) //Nominal keuntungan Gold

//Harga upgrade role
global.uSilver = Number(process.env.UPGRADE_SILVER_PRICE || 100000)
global.uGold = Number(process.env.UPGRADE_GOLD_PRICE || 200000)

//Other
global.botName = process.env.BOT_NAME || "GiHa Smart Bot" //Nama bot
// Owner numbers - parse from comma-separated string
const ownerNumbersStr = process.env.OWNER_NUMBERS || "6287777657944,6281389592985,6287887842985"
global.owner = ownerNumbersStr.split(',').map(num => num.trim()).filter(num => num) //Ganti agar fitur owner bisa digunakan
global.ownerNomer = process.env.OWNER_NUMBER || "6287777657944" //Nomor lu
global.ownerName = process.env.OWNER_NAME || "Owner" //Nama lu
global.packname = process.env.BOT_PACKNAME || "" //Seterah
global.author = process.env.BOT_AUTHOR || "Owner" //Seterah
global.sessionName = process.env.BOT_SESSION_NAME || "session" //Ngga usah di ganti
// Group links - parse from comma-separated string
const groupLinksStr = process.env.BOT_GROUP_LINKS || "https://chat.whatsapp.com/L0LR1HBOFKJAiQv5Busd9t?mode=ems_copy_t,https://chat.whatsapp.com/KwBA0yxcwl0JGpL6uN7L9i?mode=ems_copy_t,https://chat.whatsapp.com/GO2a2ty2n5JAz5b6E9HpEs?mode=ems_copy_c"
global.linkGroup = groupLinksStr.split(',').map(link => link.trim()).filter(link => link) //Link gc lu

// Group names - parse from comma-separated string (alternatif untuk whitelist berdasarkan nama)
const groupNamesStr = process.env.BOT_GROUP_NAMES || ""
global.groupNames = groupNamesStr.split(',').map(name => name.trim().toLowerCase().replace(/\s+/g, ' ')).filter(name => name) //Nama group yang diizinkan (normalized: lowercase, trim, single space)

// Admin group untuk notifikasi zoom - kosongkan atau tambahkan ID grup (e.g., "120363419470324991@g.us")
global.adminGroupId = process.env.ADMIN_GROUP_ID || "" // ID grup admin untuk notifikasi zoom
global.adminGroupName = process.env.ADMIN_GROUP_NAME || "GH bot BARU" // Nama grup admin (fallback jika ID tidak di-set)

//Image
global.thumbnail = "./options/image/payment.jpg"

//Message
global.mess = {
  sukses: "Done🤗",
  admin: "Command ini hanya bisa digunakan oleh Admin Grup",
  botAdmin: "Bot Harus menjadi admin",
  owner: "Command ini hanya dapat digunakan oleh owner bot",
  prem: "Command ini khusus member premium",
  group: "Command ini hanya bisa digunakan di grup",
  private: "Command ini hanya bisa digunakan di Private Chat",
  wait: "⏳ Mohon tunggu sebentar...",
  error: {
    lv: "Link yang kamu berikan tidak valid",
    api: "Maaf terjadi kesalahan"
  }
}

//Payment
global.payment = {
  qris: {
    an: process.env.PAYMENT_QRIS_NAME || "GIGIHADIOD" //Atas nama qris
  },
  dana: {
    nope: process.env.PAYMENT_DANA_NUMBER || "085235540944",
    an: process.env.PAYMENT_DANA_NAME || "BRI****"
  },
  gopay: {
    nope: process.env.PAYMENT_GOPAY_NUMBER || "085235540944",
    an: process.env.PAYMENT_GOPAY_NAME || "BRI****"
  },
  ovo: {
    nope: process.env.PAYMENT_OVO_NUMBER || "085235540944",
    an: process.env.PAYMENT_OVO_NAME || "BRI****"
  }
}

// Listener backend for notification-based payment detection
global.listener = {
  baseUrl: process.env.LISTENER_BASE_URL || "https://api-pg.nicola.id",
  apiKey: process.env.LISTENER_API_KEY || "kodeku"
}

// Gowa WhatsApp Service Configuration
global.gowaConfig = {
  apiUrl: process.env.GOWA_API_URL || 'https://gowa2.nicola.id',
  apiKey: process.env.GOWA_API_KEY || 'apiku',
  deviceId: process.env.GOWA_DEVICE_ID || 'default',
  webhookSecret: process.env.GOWA_WEBHOOK_SECRET || ''
}

//Function buat menu
const fs = require("fs");
const chalk = require('chalk');
const moment = require("moment-timezone");
const { runtime } = require("./function/myfunc");

const d = new Date(Date.now() + 3600000)
const dateIslam = Intl.DateTimeFormat('id' + '-TN-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)

//Tampilan menu
global.menu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*
• ${ownerName} (Owner)
• All pengguna bot`
}

// #ALL MENU
global.allmenu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *GROUP MENU* 」
│☛ ${prefix}ceksewa
│☛ ${prefix}kick
│☛ ${prefix}open
│☛ ${prefix}close
│☛ ${prefix}tagall
│☛ ${prefix}hidetag
│☛ ${prefix}delete
│☛ ${prefix}revoke
│☛ ${prefix}antilink
│☛ ${prefix}antilinkv2
│☛ ${prefix}welcome
│☛ ${prefix}promote
│☛ ${prefix}demote
│☛ ${prefix}setdesc
│☛ ${prefix}linkgc
│☛ ${prefix}setppgc
╰─────╼

╭─────╼「 *INFO BOT* 」
│☛ ${prefix}creator
│☛ ${prefix}owner
│☛ ${prefix}ping
│☛ ${prefix}runtime
│☛ ${prefix}script
╰─────╼

╭─────╼「 *ORDER MENU* 」
│☛ ${prefix}stok
│☛ ${prefix}buy
│☛ ${prefix}buynow
│☛ ${prefix}kirimulang (Kirim ulang akun)
╰─────╼

╭─────╼「 *OWNER MENU* 」
│☛ ${prefix}cekip
│☛ ${prefix}ceksaldo
│☛ ${prefix}loginorkut 
│☛ ${prefix}verifotp
│☛ ${prefix}settype (Type profit)
│☛ ${prefix}setprofittop
│☛ ${prefix}customprofit
│☛ ${prefix}delcustomprofit
│☛ ${prefix}setrole
│☛ ${prefix}ubahrole
│☛ ${prefix}addproduk
│☛ ${prefix}delproduk
│☛ ${prefix}setkode
│☛ ${prefix}setharga
│☛ ${prefix}setjudul
│☛ ${prefix}setdesk
│☛ ${prefix}setsnk
│☛ ${prefix}setprofit
│☛ ${prefix}rekap
│☛ ${prefix}addstok
│☛ ${prefix}delstok
│☛ ${prefix}addsaldo
│☛ ${prefix}minsaldo
│☛ ${prefix}addsewa
│☛ ${prefix}delsewa
│☛ ${prefix}listsewa
│☛ ${prefix}block
│☛ ${prefix}unblock
│☛ ${prefix}checkuser (Cek status user)
│☛ ${prefix}backup
│☛ ${prefix}reloaddb
│☛ ${prefix}buy <kode> <jumlah> <nomor> (Owner buy)
╰─────╼

╭─────╼「 *STALKER MENU* 」
│☛ ${prefix}cekml
│☛ ${prefix}cekff
│☛ ${prefix}cekpubg
│☛ ${prefix}cekgi
│☛ ${prefix}cekhok
│☛ ${prefix}cekhsr
│☛ ${prefix}cekhi
│☛ ${prefix}cekvalo
│☛ ${prefix}cekaov
│☛ ${prefix}cekcodm
│☛ ${prefix}cekzzz
│☛ ${prefix}ceksus
│☛ ${prefix}ceksm
│☛ ${prefix}cekpb
│☛ ${prefix}cekpgr
╰─────╼

╭─────╼「 *STORE MENU* 」
│☛ ${prefix}list
│☛ ${prefix}addlist
│☛ ${prefix}dellist
│☛ ${prefix}setlist
│☛ ${prefix}testi
│☛ ${prefix}addtesti
│☛ ${prefix}deltesti
│☛ ${prefix}settesti
│☛ ${prefix}kalkulator
│☛ ${prefix}done
│☛ ${prefix}setdone
│☛ ${prefix}deldone
│☛ ${prefix}changedone
│☛ ${prefix}proses
│☛ ${prefix}setproses
│☛ ${prefix}delproses
│☛ ${prefix}changeproses
╰─────╼

╭─────╼「 *TOPUP MENU* 」
│☛ ${prefix}deposit
│☛ ${prefix}saldo
│☛ ${prefix}listharga
│☛ ${prefix}upgrade
│☛ ${prefix}kirimulang (Kirim ulang akun)
╰─────╼

╭─────╼「 *TRACKING MENU* 」
│☛ ${prefix}riwayat <nomor>
│☛ ${prefix}cari <reff_id>
│☛ ${prefix}statistik
│☛ ${prefix}export <format>
│☛ ${prefix}ubahrole
│☛ ${prefix}dashboard
╰─────╼

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*
• ${ownerName} (Owner)
• All pengguna bot`
}

// GROUP MENU
global.groupmenu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *GROUP MENU* 」
│☛ ${prefix}ceksewa
│☛ ${prefix}kick
│☛ ${prefix}open
│☛ ${prefix}close
│☛ ${prefix}tagall
│☛ ${prefix}hidetag
│☛ ${prefix}delete
│☛ ${prefix}revoke
│☛ ${prefix}antilink
│☛ ${prefix}antilinkv2
│☛ ${prefix}welcome
│☛ ${prefix}promote
│☛ ${prefix}demote
│☛ ${prefix}setdesc
│☛ ${prefix}linkgc
│☛ ${prefix}setppgc
│☛ ${prefix}setnamegc
╰─────╼

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*

• ${ownerName} (Owner)
• All pengguna bot`
}

global.infobot = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *INFO BOT* 」
│☛ ${prefix}creator
│☛ ${prefix}owner
│☛ ${prefix}ping
│☛ ${prefix}runtime
│☛ ${prefix}script
╰─────╼

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*

• ${ownerName} (Owner)
• All pengguna bot`
}

global.ownermenu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *OWNER MENU* 」
│☛ ${prefix}cekip
│☛ ${prefix}ceksaldo
│☛ ${prefix}loginorkut 
│☛ ${prefix}verifotp
│☛ ${prefix}settype (Type profit)
│☛ ${prefix}setprofittop
│☛ ${prefix}customprofit
│☛ ${prefix}delcustomprofit
│☛ ${prefix}setrole
│☛ ${prefix}ubahrole
│☛ ${prefix}addproduk
│☛ ${prefix}delproduk
│☛ ${prefix}setkode
│☛ ${prefix}setharga
│☛ ${prefix}setjudul
│☛ ${prefix}setdesk
│☛ ${prefix}setsnk
│☛ ${prefix}setprofit
│☛ ${prefix}rekap
│☛ ${prefix}addstok
│☛ ${prefix}delstok
│☛ ${prefix}addsaldo
│☛ ${prefix}minsaldo
│☛ ${prefix}addsewa
│☛ ${prefix}delsewa
│☛ ${prefix}listsewa
│☛ ${prefix}block
│☛ ${prefix}unblock
│☛ ${prefix}checkuser (Cek status user)
│☛ ${prefix}backup
│☛ ${prefix}reloaddb
│☛ ${prefix}buy <kode> <jumlah> <nomor> (Owner buy)
╰─────╼

*💡 OWNER BUY FEATURE:*
• Format: ${prefix}buy kodeproduk jumlah nomorcust
• Contoh: ${prefix}buy net2u 1 6281389592981
• Akun akan dikirim ke nomor tujuan
• Saldo dikurangi dari owner/admin

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*

• ${ownerName} (Owner)
• All pengguna bot`
}

global.stalkermenu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *STALKER MENU* 」
│☛ ${prefix}cekml
│☛ ${prefix}cekff
│☛ ${prefix}cekpubg
│☛ ${prefix}cekgi
│☛ ${prefix}cekhok
│☛ ${prefix}cekhsr
│☛ ${prefix}cekhi
│☛ ${prefix}cekvalo
│☛ ${prefix}cekaov
│☛ ${prefix}cekcodm
│☛ ${prefix}cekzzz
│☛ ${prefix}ceksus
│☛ ${prefix}ceksm
│☛ ${prefix}cekpb
│☛ ${prefix}cekpgr
╰─────╼

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*

• ${ownerName} (Owner)
• All pengguna bot`
}

global.storemenu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *STORE MENU* 」
│☛ ${prefix}list
│☛ ${prefix}addlist
│☛ ${prefix}dellist
│☛ ${prefix}setlist
│☛ ${prefix}testi
│☛ ${prefix}addtesti
│☛ ${prefix}deltesti
│☛ ${prefix}settesti
│☛ ${prefix}kalkulator
│☛ ${prefix}done
│☛ ${prefix}setdone
│☛ ${prefix}deldone
│☛ ${prefix}changedone
│☛ ${prefix}proses
│☛ ${prefix}setproses
│☛ ${prefix}delproses
│☛ ${prefix}changeproses
╰─────╼

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*

• ${ownerName} (Owner)
• All pengguna bot`
}

global.topupmenu = (prefix, sender, pushname) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *TOPUP MENU* 」
│☛ ${prefix}deposit
│☛ ${prefix}saldo
│☛ ${prefix}listharga
│☛ ${prefix}upgrade
│☛ ${prefix}kirimulang (Kirim ulang akun)
╰─────╼

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*
• ${ownerName} (Owner)
• All pengguna bot`
}

global.ordermenu = (prefix, sender, pushname, bio) => {
  let more = String.fromCharCode(8206)
  let readmore = more.repeat(4001)
  return `*🤖 BOT INFO 🤖*
• Bot Name: ${botName}
• Runtime: ${runtime(process.uptime())}
• Owner: @${ownerNomer}

*👤 USER INFO 👤*
• Tag: @${sender.split("@")[0]}
• Name: ${pushname}
• Bio: ${bio ? bio : "-"}

*📆 DATE INFO 📆*
• Masehi: ${moment.tz("Asia/Jakarta").format("DD MMMM YYYY")}
• Hijriah: ${dateIslam}

*⏰ TIME INFO ⏰*
• WIB: ${moment.tz('Asia/Jakarta').format('HH:mm:ss')}
• WITA: ${moment.tz('Asia/Makassar').format('HH:mm:ss')}
• WIT: ${moment.tz('Asia/Jayapura').format('HH:mm:ss')}
${readmore}
╭─────╼「 *ORDER MENU* 」
│☛ ${prefix}stok
│☛ ${prefix}buy
│☛ ${prefix}buynow
│☛ ${prefix}kirimulang
╰─────╼

*💡 CARA PEMBELIAN:*
• *Buy (Saldo):* ${prefix}buy kodeproduk jumlah
• *Buynow (QRIS):* ${prefix}buynow kodeproduk jumlah
• *Owner Buy:* ${prefix}buy kodeproduk jumlah nomor (Owner only)
• *Kirim Ulang:* ${prefix}kirimulang (kirim ulang akun terakhir)

*☘ ᴛʜᴀɴᴋs ᴛᴏ ☘*
• ${ownerName} (Owner)
• All pengguna bot`
}

let time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY')
let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log(chalk.greenBright(`[ ${botName} ]  `) + time + chalk.cyanBright(` "${file}" Telah diupdate!`))
  delete require.cache[file]
  require(file)
})
