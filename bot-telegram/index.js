require("./setting.js")
const { color } = require('./function/console')
const moment = require('moment-timezone')
const fs = require('fs')
const qrcode = require('qrcode')

module.exports = async (bot, m, msg) => {
  try {
    const from = m.chat
    const sender = m.sender.toString()
    const pushname = m.pushName || 'User'
    const body = m.text || ''
    const args = body.trim().split(/ +/).slice(1)
    const command = body.toLowerCase().split(' ')[0]
    const text = args.join(' ')

    // Initialize user if not exists
    if (!db.data.users[sender]) {
      db.data.users[sender] = {
        saldo: 0,
        role: 'bronze',
        linkedPhone: null
      }
    }

    // Initialize other data structures if not exists
    if (!db.data.deposit) db.data.deposit = {}
    if (!db.data.produk) db.data.produk = {}
    if (!db.data.phoneMapping) db.data.phoneMapping = {}

    const reply = (text) => {
      // Send as plain text to avoid parsing errors
      return bot.sendMessage(from, text)
    }

    const tanggal = moment.tz('Asia/Jakarta').format('DD/MM/YYYY')
    const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss')

    // Middleware: Cek link status untuk semua commands kecuali /start, /confirm, /cancel, dan input nomor
    if (command !== '/start' && command !== '/confirm' && command !== '/cancel') {
      if (!db.data.users[sender].linkedPhone && !(db.data.waitingPhoneInput && db.data.waitingPhoneInput[sender])) {
        return reply(`❌ AKUN BELUM TERHUBUNG!

Anda harus menghubungkan akun Telegram dengan WhatsApp terlebih dahulu.

📱 Ketik /start untuk memulai proses linking

⚠️ Semua fitur bot memerlukan akun yang terhubung untuk keamanan dan sinkronisasi data.`)
      }
    }

    switch (command) {
      case '/start':
        // Cek apakah user sudah pernah link atau belum
        if (!db.data.users[sender].linkedPhone) {
          // Set status bahwa user sedang dalam proses input nomor
          if (!db.data.waitingPhoneInput) db.data.waitingPhoneInput = {}
          db.data.waitingPhoneInput[sender] = true

          return reply(`🤖 SELAMAT DATANG DI BOT TELEGRAM TOPUP!

👋 Halo ${pushname}!

Untuk menggunakan bot ini, Anda perlu menghubungkan akun Telegram dengan nomor WhatsApp Anda.

📱 Silakan masukkan nomor WhatsApp Anda (awali dengan 62):

Contoh: 6281234567890

⚠️ PENTING:
• Nomor harus sudah terdaftar di bot WhatsApp
• Nomor akan digunakan untuk sinkronisasi saldo
• Pastikan nomor yang Anda masukkan benar

Ketik /cancel untuk membatalkan`)
        }
        // Jika sudah link, tampilkan menu biasa
        // Fall through ke case /menu

      case '/menu':
        const menuText = `🤖 BOT TELEGRAM TOPUP 🤖

👤 Halo ${pushname}!
📱 Platform: Telegram
⏰ ${jamwib} WIB
📅 ${tanggal}

📋 MENU UTAMA
• /status - Cek status akun
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

🔗 LINK AKUN (Status: ${db.data.users[sender].linkedPhone ? '✅ Terhubung' : '❌ Belum terhubung'})
• /link - Hubungkan dengan WhatsApp
• /confirm - Konfirmasi kepemilikan nomor
• /unlink - Putuskan hubungan akun
• /cancel - Batalkan proses

Bot otomatis 24/7 ⚡`

        // Kirim menu tanpa inline keyboard
        return reply(menuText)

      case '/ceksaldo':
      case '/saldo':
        // Wajib mapping dulu sebelum bisa cek saldo
        const linkedPhone = db.data.users[sender].linkedPhone
        if (!linkedPhone) {
          return reply('❌ Anda harus menghubungkan akun dengan WhatsApp terlebih dahulu!\n\nKetik /link <nomor_hp> untuk menghubungkan\nContoh: /link 6281234567890\n\n💡 Setelah terhubung, saldo Anda akan tersinkron dengan akun WhatsApp.')
        }

        // Check if linked WhatsApp account exists
        if (!db.data.users[linkedPhone]) {
          return reply(`❌ Akun WhatsApp yang terhubung tidak ditemukan!\n\nSilakan hubungkan ulang dengan /link <nomor_hp>`)
        }

        // Use WhatsApp account data
        let actualUser = db.data.users[linkedPhone]
        let currentSaldo = (actualUser && actualUser.saldo) ? actualUser.saldo : 0
        let userRole = (actualUser && actualUser.role) ? actualUser.role : "bronze"
        const whatsappNum = linkedPhone.replace('@s.whatsapp.net', '')
        
        let saldoText = `💰 INFORMASI SALDO

👤 User: ${pushname}
📞 WhatsApp: ${whatsappNum}
💳 Saldo: Rp${toRupiah(currentSaldo)}
🏆 Role: ${userRole.toUpperCase()}
📱 Platform: Telegram (Linked)
📅 Tanggal: ${tanggal}
⏰ Waktu: ${jamwib} WIB

✅ Akun terhubung dengan WhatsApp
Saldo tersinkron dengan bot WhatsApp

Untuk deposit saldo gunakan /deposit <nominal>`

        return reply(saldoText)

      case '/deposit':
        if (!text) {
          return reply('❌ Format salah!\n\nGunakan: /deposit <nominal>\nContoh: /deposit 50000')
        }

        const nominal = parseInt(text.replace(/[^0-9]/g, ''))
        if (!nominal || nominal < 5000) {
          return reply('❌ Nominal minimal deposit Rp5.000')
        }

        if (db.data.deposit[sender]) {
          return reply('❌ Anda masih memiliki proses deposit yang belum selesai!\nKetik /cancel untuk membatalkan proses sebelumnya.')
        }

        // Generate unique ID
        const depositId = 'DEP' + Date.now()
        
        // Store deposit data
        db.data.deposit[sender] = {
          ID: depositId,
          nominal: nominal,
          status: 'pending',
          created: Date.now()
        }

        const depositText = `💰 DEPOSIT SALDO

🆔 ID Deposit: ${depositId}
💵 Nominal: Rp${toRupiah(nominal)}
👤 User: ${pushname}
📅 Tanggal: ${tanggal}
⏰ Waktu: ${jamwib} WIB

📋 PILIH METODE PEMBAYARAN:
• /qris - QRIS (Semua Bank & E-Wallet)
• /cancel - Batalkan deposit

Deposit akan otomatis dikonfirmasi setelah pembayaran`

        return reply(depositText)

      case '/qris':
        if (!db.data.deposit[sender]) {
          return reply('❌ Tidak ada proses deposit aktif!\nKetik /deposit <nominal> untuk memulai.')
        }

        const depositData = db.data.deposit[sender]
        const qrisText = `*💳 PEMBAYARAN QRIS*

*🆔 ID:* ${depositData.ID}
*💵 Nominal:* Rp${toRupiah(depositData.nominal)}

Silakan scan QR code di bawah ini untuk melakukan pembayaran:`

        // Generate QR Code
        const qrisData = `00020101021126360014ID.CO.QRIS.WWW0118ID93600009150000270214${depositData.ID}5303360540${depositData.nominal}5802ID6014Jakarta Selatan61051234062070703A0163041D7D`
        
        try {
          const qrBuffer = await qrcode.toBuffer(qrisData)
          
          // Send QR code image
          await bot.sendPhoto(from, qrBuffer, {
            caption: qrisText,
            parse_mode: 'Markdown'
          })

          // Set auto-cancel after 10 minutes
          setTimeout(() => {
            if (db.data.deposit[sender] && db.data.deposit[sender].ID === depositData.ID) {
              delete db.data.deposit[sender]
              bot.sendMessage(from, `⏰ *Deposit Expired*\n\nID: ${depositData.ID}\nDeposit telah dibatalkan otomatis karena tidak ada pembayaran dalam 10 menit.\n\nSilakan buat deposit baru dengan /deposit <nominal>`, {
                parse_mode: 'Markdown'
              }).catch(console.error)
            }
          }, 10 * 60 * 1000) // 10 minutes

          return reply(`\n⏰ *Batas waktu pembayaran: 10 menit*\n\nSetelah transfer, saldo akan otomatis masuk ke akun Anda.\n\nKetik /cancel untuk membatalkan.`)
        } catch (error) {
          console.error('Error generating QR code:', error)
          return reply('❌ Gagal generate QR code. Silakan coba lagi.')
        }

      case '/stok':
        if (!text) {
          let stokText = `📦 CEK STOK PRODUK\n\n`
          for (let [code, product] of Object.entries(db.data.produk)) {
            if (product && typeof product === 'object') {
              const stokCount = product.stok ? product.stok.length : 0
              const status = stokCount > 0 ? '✅ Tersedia' : '❌ Habis'
              stokText += `${product.name || product.keterangan || 'Produk'}\n`
              stokText += `• Kode: ${code}\n`
              stokText += `• Stok: ${stokCount}\n`
              stokText += `• Status: ${status}\n\n`
            }
          }
          stokText += `Ketik /stok <kode> untuk detail produk`
          
          return reply(stokText)
        }

        const productCode = text.toLowerCase()
        const product = db.data.produk[productCode]
        
        if (!product) {
          return reply(`❌ Produk dengan kode "${productCode}" tidak ditemukan!`)
        }

        const stokCount = product.stok ? product.stok.length : 0
        const harga = product.priceB || product.harga || 0
        
        const detailText = `📦 DETAIL PRODUK

📱 Produk: ${product.name || product.keterangan}
🔖 Kode: ${productCode}
💰 Harga: Rp${toRupiah(harga)}
📦 Stok: ${stokCount}
📋 Deskripsi: ${product.desc || product.description || '-'}

${stokCount > 0 ? '✅ Produk Tersedia' : '❌ Produk Habis'}

Ketik /buy ${productCode} 1 untuk membeli`

        // Keyboard untuk detail produk
        return reply(detailText)

      case '/buy':
        if (!text) {
          return reply('❌ Format salah!\n\nGunakan: /buy <kode_produk> <jumlah>\nContoh: /buy net2u 1\n\nKetik /stok untuk melihat daftar produk.')
        }

        // Wajib mapping dulu sebelum bisa buy
        const buyLinkedPhone = db.data.users[sender].linkedPhone
        if (!buyLinkedPhone) {
          return reply('❌ Anda harus menghubungkan akun dengan WhatsApp terlebih dahulu!\n\nKetik /link <nomor_hp> untuk menghubungkan\nContoh: /link 6281234567890')
        }

        // Check if linked WhatsApp account exists
        if (!db.data.users[buyLinkedPhone]) {
          return reply(`❌ Akun WhatsApp yang terhubung tidak ditemukan!\n\nSilakan hubungkan ulang dengan /link <nomor_hp>`)
        }

        const buyArgs = text.split(' ')
        const buyProductCode = buyArgs[0].toLowerCase()
        const buyQuantity = parseInt(buyArgs[1]) || 1

        const buyProduct = db.data.produk[buyProductCode]
        
        if (!buyProduct) {
          return reply(`❌ Produk dengan kode "${buyProductCode}" tidak ditemukan!\n\nKetik /stok untuk melihat daftar produk.`)
        }

        if (!buyProduct.stok || buyProduct.stok.length === 0) {
          return reply(`❌ Produk "${buyProduct.name || buyProduct.keterangan}" sedang habis!\n\nKetik /stok untuk melihat produk lain.`)
        }

        if (buyQuantity > buyProduct.stok.length) {
          return reply(`❌ Stok tidak mencukupi!\n\nStok tersedia: ${buyProduct.stok.length}\nYang diminta: ${buyQuantity}`)
        }

        // Use WhatsApp account data (wajib sudah mapping)
        let buyActualUser = db.data.users[buyLinkedPhone]

        // Check saldo
        const buySaldo = (buyActualUser && buyActualUser.saldo) ? buyActualUser.saldo : 0
        const productPrice = (buyProduct && (buyProduct.priceB || buyProduct.harga)) ? (buyProduct.priceB || buyProduct.harga) : 0
        const totalPrice = productPrice * buyQuantity
        
        if (buySaldo < totalPrice) {
          return reply(`❌ Saldo tidak mencukupi!\n\nSaldo Anda: Rp${toRupiah(buySaldo)}\nTotal harga: Rp${toRupiah(totalPrice)}\n\nSilakan deposit terlebih dahulu dengan /deposit <nominal>`)
        }

        // Process purchase langsung tanpa konfirmasi
        let purchasedItems = []
        for (let i = 0; i < buyQuantity; i++) {
          if (buyProduct.stok.length > 0) {
            purchasedItems.push(buyProduct.stok.shift())
          }
        }

        // Deduct saldo
        buyActualUser.saldo -= totalPrice

        // Update terjual count
        if (!buyProduct.terjual) buyProduct.terjual = 0
        buyProduct.terjual += buyQuantity

        // Generate transaction ID
        const buyTrxId = 'TRX' + Date.now()

        // Generate reffId seperti di WhatsApp bot
        const reffId = Math.random().toString(36).substring(2, 15).toUpperCase()

        // Save transaction ke db.data.transaksi seperti WhatsApp bot
        // User menggunakan nomor WhatsApp (tanpa @s.whatsapp.net)
        const whatsappNumber = buyLinkedPhone.replace('@s.whatsapp.net', '')
        
        if (!db.data.transaksi) db.data.transaksi = []
        db.data.transaksi.push({
          id: buyProductCode,
          name: buyProduct.name || buyProduct.keterangan,
          price: productPrice,
          date: require('moment-timezone').tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
          jumlah: buyQuantity,
          user: whatsappNumber,
          userRole: buyActualUser.role || 'bronze',
          reffId: reffId,
          metodeBayar: 'Saldo',
          totalBayar: totalPrice
        })

        // Format pengiriman akun + SNK dalam 1 pesan seperti WhatsApp bot
        let detailAkun = `📦 Produk: ${buyProduct.name || buyProduct.keterangan}\n`
        detailAkun += `📅 Tanggal: ${tanggal}\n`
        detailAkun += `⏰ Jam: ${jamwib} WIB\n\n`

        purchasedItems.forEach((item, index) => {
          const dataAkun = item.split("|")
          detailAkun += `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`
          detailAkun += `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`
          detailAkun += `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}\n`
          detailAkun += `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}\n`
          detailAkun += `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}\n\n`
        })

        // Tambahkan SNK ke dalam pesan yang sama seperti WhatsApp bot
        if (buyProduct.snk) {
          detailAkun += `╭────「 SYARAT & KETENTUAN 」────╮\n\n`
          detailAkun += `📋 SNK PRODUK: ${buyProduct.name || buyProduct.keterangan}\n\n`
          detailAkun += `${buyProduct.snk}\n\n`
          detailAkun += `⚠️ PENTING:\n`
          detailAkun += `• Baca dan pahami SNK sebelum menggunakan akun\n`
          detailAkun += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`
          detailAkun += `• Hubungi admin jika ada masalah dengan akun\n\n`
          detailAkun += `╰────「 END SNK 」────╯`
        }

        // Kirim detail akun + SNK dalam 1 pesan
        await bot.sendMessage(from, detailAkun)

        // Notifikasi ke owner seperti WhatsApp bot
        const ownerNotification = `Hai Owner,
Ada transaksi Telegram yang telah selesai!

╭────「 TRANSAKSI DETAIL 」───
┊・ 🧾| Reff Id: ${reffId}
┊・ 📮| Nomor: ${whatsappNumber}
┊・ 📱| Platform: Telegram
┊・ 📦| Nama Barang: ${buyProduct.name || buyProduct.keterangan}
┊・ 🏷️| Harga Barang: Rp${toRupiah(productPrice)}
┊・ 🛍️| Jumlah Order: ${buyQuantity}
┊・ 💰| Total Bayar: Rp${toRupiah(totalPrice)}
┊・ 💳| Metode Bayar: Saldo
┊・ 📅| Tanggal: ${tanggal}
┊・ ⏰| Jam: ${jamwib} WIB
╰┈┈┈┈┈┈┈┈`

        // Kirim notifikasi ke owner (ganti dengan Telegram ID owner)
        try {
          await bot.sendMessage(global.owner[0], ownerNotification)
        } catch (err) {
          console.log('Failed to send owner notification:', err.message)
        }

        return reply(`✅ Pembelian berhasil! Detail akun telah dikirim.

💳 Sisa Saldo: Rp${toRupiah(buyActualUser.saldo)}
🆔 Reff ID: ${reffId}

Terima kasih telah berbelanja! 🙏`)



      case '/link':
        if (!text) {
          return reply('❌ Format salah!\n\nGunakan: /link <nomor_hp>\nContoh: /link 6281234567890')
        }

        const phoneNumber = text.replace(/[^0-9]/g, '')
        if (!phoneNumber) {
          return reply('❌ Nomor HP tidak valid!')
        }

        const fullPhone = phoneNumber + '@s.whatsapp.net'
        
        // Check if phone exists in WhatsApp users
        if (!db.data.users[fullPhone]) {
          return reply(`❌ Nomor ${phoneNumber} tidak terdaftar di sistem WhatsApp!\n\nPastikan nomor sudah pernah menggunakan bot WhatsApp.`)
        }

        // Check if already linked to another Telegram user
        if (db.data.phoneMapping && db.data.phoneMapping[phoneNumber] && db.data.phoneMapping[phoneNumber] !== sender) {
          return reply(`❌ Nomor ${phoneNumber} sudah terhubung dengan akun Telegram lain!\n\nSatu nomor WhatsApp hanya bisa terhubung dengan satu akun Telegram.`)
        }

        // Store pending verification
        if (!db.data.pendingVerification) db.data.pendingVerification = {}
        db.data.pendingVerification[sender] = {
          phoneNumber: phoneNumber,
          fullPhone: fullPhone,
          timestamp: Date.now(),
          expires: Date.now() + (10 * 60 * 1000) // 10 minutes
        }

        return reply(`🔐 KONFIRMASI KEPEMILIKAN NOMOR

📱 Nomor yang akan dihubungkan: ${phoneNumber}
💰 Saldo akun: Rp${toRupiah(db.data.users[fullPhone].saldo || 0)}
🎯 Role: ${db.data.users[fullPhone].role || 'bronze'}

⚠️ PENTING:
• Pastikan nomor ${phoneNumber} benar-benar milik Anda
• Nomor ini sudah terdaftar di bot WhatsApp
• Setelah terhubung, saldo akan tersinkron

✅ Ketik: /confirm untuk konfirmasi
❌ Ketik: /cancel untuk batalkan

⏰ Konfirmasi berlaku 10 menit`)

            case '/confirm':
        if (!db.data.pendingVerification || !db.data.pendingVerification[sender]) {
          return reply('❌ Tidak ada proses konfirmasi aktif!\n\nKetik /link <nomor_hp> terlebih dahulu.')
        }

        const verification = db.data.pendingVerification[sender]
        
        // Check if confirmation expired
        if (Date.now() > verification.expires) {
          delete db.data.pendingVerification[sender]
          return reply('❌ Waktu konfirmasi sudah habis!\n\nSilakan ketik /link <nomor_hp> untuk memulai lagi.')
        }

        // Link accounts
        db.data.users[sender].linkedPhone = verification.fullPhone
        db.data.phoneMapping[verification.phoneNumber] = sender
        
        // Clean up pending verification
        delete db.data.pendingVerification[sender]

        return reply(`✅ AKUN BERHASIL TERHUBUNG!

🔗 Koneksi berhasil:
• Telegram ID: ${sender}
• WhatsApp: ${verification.phoneNumber}

💰 Saldo tersinkron: Rp${toRupiah(db.data.users[verification.fullPhone].saldo || 0)}

Sekarang Anda bisa:
• /ceksaldo - Cek saldo detail
• /buy - Beli produk
• /deposit - Isi saldo

Selamat berbelanja! 🛒`)

      case '/unlink':
        const currentLinkedPhone = db.data.users[sender].linkedPhone
        if (!currentLinkedPhone) {
          return reply('❌ Akun Anda belum terhubung dengan WhatsApp!\n\nKetik /link <nomor_hp> untuk menghubungkan akun.')
        }

        const currentPhoneNumber = currentLinkedPhone.replace('@s.whatsapp.net', '')
        
        // Remove link
        delete db.data.users[sender].linkedPhone
        if (db.data.phoneMapping && db.data.phoneMapping[currentPhoneNumber]) {
          delete db.data.phoneMapping[currentPhoneNumber]
        }

        return reply(`✅ AKUN BERHASIL DIPUTUS!

🔗 Koneksi yang diputus:
• Telegram ID: ${sender}
• WhatsApp: ${currentPhoneNumber}

⚠️ PERHATIAN:
• Anda tidak bisa cek saldo atau beli produk
• Untuk menggunakan bot lagi, ketik /link <nomor_hp>
• Data WhatsApp Anda tetap aman

Ketik /link jika ingin menghubungkan lagi.`)

      case '/status':
        let statusText = `📊 STATUS AKUN TELEGRAM\n\n`
        statusText += `👤 Telegram ID: ${sender}\n`
        statusText += `👤 Nama: ${pushname}\n\n`

        // Check linked account
        const statusLinkedPhone = db.data.users[sender].linkedPhone
        if (statusLinkedPhone) {
          const phoneNumber = statusLinkedPhone.replace('@s.whatsapp.net', '')
          const whatsappUser = db.data.users[statusLinkedPhone]
          const saldo = (whatsappUser && whatsappUser.saldo) ? whatsappUser.saldo : 0
          
          statusText += `🔗 STATUS KONEKSI: ✅ Terhubung\n`
          statusText += `📱 WhatsApp: ${phoneNumber}\n`
          statusText += `💰 Saldo: Rp${toRupiah(saldo)}\n`
          statusText += `🎯 Role: ${whatsappUser?.role || 'bronze'}\n\n`
          statusText += `✅ Anda bisa melakukan transaksi\n`
          statusText += `• /ceksaldo - Cek saldo detail\n`
          statusText += `• /buy - Beli produk\n`
          statusText += `• /unlink - Putus koneksi\n`
        } else {
          statusText += `🔗 STATUS KONEKSI: ❌ Tidak terhubung\n\n`
          statusText += `⚠️ Anda belum bisa melakukan transaksi\n`
          statusText += `• /link <nomor> - Hubungkan akun\n`
        }

        // Check active processes
        const activeProcesses = []
        if (db.data.deposit && db.data.deposit[sender]) {
          activeProcesses.push(`💰 Deposit (ID: ${db.data.deposit[sender].ID})`)
        }
        if (db.data.pendingVerification && db.data.pendingVerification[sender]) {
          const pendingData = db.data.pendingVerification[sender]
          const timeLeft = Math.max(0, Math.ceil((pendingData.expires - Date.now()) / 1000 / 60))
          activeProcesses.push(`🔐 Konfirmasi Link ${pendingData.phoneNumber} (${timeLeft} menit tersisa)`)
        }

        if (activeProcesses.length > 0) {
          statusText += `\n🔄 PROSES AKTIF:\n`
          activeProcesses.forEach((process, index) => {
            statusText += `${index + 1}. ${process}\n`
          })
          statusText += `\n• /cancel - Batalkan semua proses`
        }

        return reply(statusText)

      // OWNER COMMANDS
      case '/addproduk':
        if (!global.owner.includes(sender)) {
          return reply('❌ Perintah ini hanya untuk owner!')
        }

        if (!text) {
          return reply(`❌ Format salah!

Format WhatsApp bot: /addproduk id|namaproduk|deskripsi|snk|harga bronze|harga silver|harga gold|profit

Contoh:
/addproduk net1m|Netflix 1 Bulan|Akun Netflix Premium|Syarat: jangan ganti password|25000|30000|35000|5000`)
        }

        const produkData = text.split('|')
        if (produkData.length < 8) {
          return reply(`❌ Format salah! Perlu 8 parameter:
id|namaproduk|deskripsi|snk|harga bronze|harga silver|harga gold|profit`)
        }

        const produkId = produkData[0].toLowerCase().trim()
        
        if (!db.data.produk) db.data.produk = {}
        if (db.data.produk[produkId]) {
          return reply(`❌ Produk dengan ID ${produkId} sudah ada di database`)
        }

        db.data.produk[produkId] = {
          id: produkId,
          name: produkData[1],
          desc: produkData[2],
          snk: produkData[3],
          priceB: parseInt(produkData[4]),
          priceS: parseInt(produkData[5]),
          priceG: parseInt(produkData[6]),
          profit: parseInt(produkData[7]),
          terjual: 0,
          stok: []
        }

        return reply(`✅ Berhasil menambahkan produk *${produkData[1]}*

📦 ID: ${produkId}
🏷️ Nama: ${produkData[1]}
💰 Harga Bronze: Rp${toRupiah(produkData[4])}
💰 Harga Silver: Rp${toRupiah(produkData[5])}
💰 Harga Gold: Rp${toRupiah(produkData[6])}
💸 Profit: Rp${toRupiah(produkData[7])}
📊 Stok: 0 (belum ada)

Gunakan /addstok untuk menambah stok produk ini.`)

      case '/addstok':
        if (!global.owner.includes(sender)) {
          return reply('❌ Perintah ini hanya untuk owner!')
        }

        if (!text) {
          return reply(`❌ Format salah!

Format WhatsApp bot: /addstok idproduk,akun1|akun2|akun3

Contoh:
/addstok net1m,user1@gmail.com|pass123|Profile1|1234|backup1@gmail.com
user2@gmail.com|pass456|Profile2|5678|backup2@gmail.com

NOTE:
Jika tidak ada Profil, Pin, 2FA, kosongkan saja atau dikasih tanda strip (-)`)
        }

        const stokData = text.split(',')
        if (!stokData[1]) {
          return reply(`❌ Format salah!

Contoh: /addstok idproduk,email1@gmail.com|password1|profil1|pin1|2fa1
email2@gmail.com|password2|profil2|pin2|2fa2

NOTE: Jika tidak ada Profil, Pin, 2FA, kosongkan saja atau dikasih tanda strip (-)`)
        }

        const stokProductId = stokData[0].toLowerCase().trim()
        
        if (!db.data.produk) db.data.produk = {}
        if (!db.data.produk[stokProductId]) {
          return reply(`❌ Produk dengan ID *${stokProductId}* tidak ada`)
        }

        const dataStok = stokData[1].split('\n').map(i => i.trim()).filter(i => i.length > 0)
        
        if (!db.data.produk[stokProductId].stok) {
          db.data.produk[stokProductId].stok = []
        }
        
        db.data.produk[stokProductId].stok.push(...dataStok)

        return reply(`✅ Berhasil menambahkan stok sebanyak ${dataStok.length}

📦 Produk: ${db.data.produk[stokProductId].name}
🆔 ID: ${stokProductId}
📊 Total Stok: ${db.data.produk[stokProductId].stok.length}

Stok berhasil ditambahkan!`)

      case '/liststok':
        if (!global.owner.includes(sender)) {
          return reply('❌ Perintah ini hanya untuk owner!')
        }

        if (!db.data.produk || Object.keys(db.data.produk).length === 0) {
          return reply('❌ Belum ada produk yang terdaftar!')
        }

        let stokList = `📊 DAFTAR STOK PRODUK\n\n`
        let totalProduk = 0
        let totalStok = 0

        Object.keys(db.data.produk).forEach(kode => {
          const produk = db.data.produk[kode]
          const stokCount = produk.stok ? produk.stok.length : 0
          const terjual = produk.terjual || 0
          
          stokList += `📦 ${produk.name || produk.keterangan}\n`
          stokList += `   🆔 Kode: ${kode}\n`
          stokList += `   💰 Harga: Rp${toRupiah(produk.harga || produk.priceB)}\n`
          stokList += `   📊 Stok: ${stokCount}\n`
          stokList += `   🛒 Terjual: ${terjual}\n\n`
          
          totalProduk++
          totalStok += stokCount
        })

        stokList += `📈 RINGKASAN:\n`
        stokList += `• Total Produk: ${totalProduk}\n`
        stokList += `• Total Stok: ${totalStok}\n\n`
        stokList += `Gunakan /addstok <kode> untuk menambah stok`

        return reply(stokList)

      case '/cancel':
        let cancelledProcesses = []
        
        // Cancel deposit process
        if (db.data.deposit[sender]) {
          cancelledProcesses.push(`💰 Deposit (ID: ${db.data.deposit[sender].ID})`)
          delete db.data.deposit[sender]
        }
        
        // Cancel pending verification
        if (db.data.pendingVerification && db.data.pendingVerification[sender]) {
          cancelledProcesses.push(`🔐 Konfirmasi Link (${db.data.pendingVerification[sender].phoneNumber})`)
          delete db.data.pendingVerification[sender]
        }
        
        // Cancel waiting phone input
        if (db.data.waitingPhoneInput && db.data.waitingPhoneInput[sender]) {
          cancelledProcesses.push(`📱 Input Nomor WhatsApp`)
          delete db.data.waitingPhoneInput[sender]
        }
        
        if (cancelledProcesses.length === 0) {
          return reply('ℹ️ Tidak ada proses yang sedang berjalan untuk dibatalkan.')
        }
        
        let cancelText = `✅ PROSES DIBATALKAN\n\n`
        cancelText += `Proses yang dibatalkan:\n`
        cancelledProcesses.forEach((process, index) => {
          cancelText += `${index + 1}. ${process}\n`
        })
        cancelText += `\nAnda dapat memulai proses baru kapan saja.`
        
        return reply(cancelText)

      default:
        // Handle phone number input for auto-link (prioritas tertinggi)
        if (db.data.waitingPhoneInput && db.data.waitingPhoneInput[sender]) {
          const phoneNumber = text.replace(/[^0-9]/g, '')
          
          // Validasi format nomor
          if (!phoneNumber.startsWith('62') || phoneNumber.length < 10) {
            return reply('❌ Format nomor salah!\n\nGunakan format: 62xxxxxxxxxx\nContoh: 6281234567890\n\nSilakan masukkan ulang atau ketik /cancel untuk membatalkan')
          }
          
          const fullPhone = phoneNumber + '@s.whatsapp.net'
          
          // Check if phone exists in WhatsApp users
          if (!db.data.users[fullPhone]) {
            return reply(`❌ Nomor ${phoneNumber} tidak terdaftar di sistem WhatsApp!

Pastikan nomor sudah pernah menggunakan bot WhatsApp terlebih dahulu.

Silakan masukkan nomor lain atau ketik /cancel untuk membatalkan`)
          }

          // Check if already linked to another Telegram user
          if (db.data.phoneMapping && db.data.phoneMapping[phoneNumber] && db.data.phoneMapping[phoneNumber] !== sender) {
            return reply(`❌ Nomor ${phoneNumber} sudah terhubung dengan akun Telegram lain!

Satu nomor WhatsApp hanya bisa terhubung dengan satu akun Telegram.

Silakan masukkan nomor lain atau ketik /cancel untuk membatalkan`)
          }

          // Store pending verification
          if (!db.data.pendingVerification) db.data.pendingVerification = {}
          db.data.pendingVerification[sender] = {
            phoneNumber: phoneNumber,
            fullPhone: fullPhone,
            timestamp: Date.now(),
            expires: Date.now() + (10 * 60 * 1000) // 10 minutes
          }

          // Clear waiting status
          delete db.data.waitingPhoneInput[sender]

          const whatsappUser = db.data.users[fullPhone]
          return reply(`🔐 KONFIRMASI KEPEMILIKAN NOMOR

📱 Nomor yang akan dihubungkan: ${phoneNumber}
💰 Saldo akun: Rp${toRupiah(whatsappUser.saldo || 0)}
🎯 Role: ${whatsappUser.role || 'bronze'}

⚠️ PENTING:
• Pastikan nomor ${phoneNumber} benar-benar milik Anda
• Nomor ini sudah terdaftar di bot WhatsApp
• Setelah terhubung, saldo akan tersinkron

✅ Ketik /confirm untuk konfirmasi
❌ Ketik /cancel untuk batalkan

⏰ Konfirmasi berlaku 10 menit`)
        }

        // Search produk berdasarkan nama seperti di WhatsApp bot
        if (command && !command.startsWith('/')) {
          const searchTerm = command.toLowerCase()
          let foundProducts = []
          
          // Cari produk yang mengandung kata kunci
          for (let [code, product] of Object.entries(db.data.produk)) {
            if (product && typeof product === 'object') {
              const productName = (product.name || product.keterangan || '').toLowerCase()
              if (productName.includes(searchTerm)) {
                const stokCount = product.stok ? product.stok.length : 0
                const harga = product.priceB || product.harga || 0
                const status = stokCount > 0 ? '✅ Tersedia' : '❌ Habis'
                
                foundProducts.push({
                  code: code,
                  name: product.name || product.keterangan,
                  price: harga,
                  stock: stokCount,
                  status: status
                })
              }
            }
          }
          
          if (foundProducts.length > 0) {
            let searchResult = `🔍 HASIL PENCARIAN: "${command}"\n\n`
            
            foundProducts.forEach((prod, index) => {
              searchResult += `${index + 1}. ${prod.name}\n`
              searchResult += `   • Kode: ${prod.code}\n`
              searchResult += `   • Harga: Rp${toRupiah(prod.price)}\n`
              searchResult += `   • Stok: ${prod.stock}\n`
              searchResult += `   • Status: ${prod.status}\n\n`
            })
            
            searchResult += `💡 Untuk membeli ketik: /buy <kode> <jumlah>\n`
            searchResult += `📋 Untuk detail ketik: /stok <kode>`
            
            return reply(searchResult)
          }
        }
        
        // Jika user belum link dan tidak sedang input nomor, arahkan ke /start
        if (!db.data.users[sender].linkedPhone) {
          return reply(`❌ AKUN BELUM TERHUBUNG!

Anda harus menghubungkan akun Telegram dengan WhatsApp terlebih dahulu.

📱 Ketik /start untuk memulai proses linking

⚠️ Semua fitur bot memerlukan akun yang terhubung untuk keamanan dan sinkronisasi data.`)
        }
        
        return reply('❌ Command tidak dikenal. Ketik /menu untuk melihat daftar command yang tersedia.')
    }

  } catch (err) {
    console.log('Error in message handler:', err)
    try {
      // Try to send error message if reply function exists
      if (typeof reply === 'function') {
        reply('❌ Terjadi kesalahan dalam memproses pesan Anda.')
      } else {
        // Fallback to direct bot.sendMessage
        bot.sendMessage(from, '❌ Terjadi kesalahan dalam memproses pesan Anda.', {
          parse_mode: 'Markdown'
        }).catch(console.error)
      }
    } catch (replyErr) {
      console.log('Error sending error message:', replyErr)
    }
  }
}

// Callback handler dihapus - tidak menggunakan inline keyboard lagi

function digit() {
  let unik = (Math.floor(Math.random() * 200)).toFixed()
  while (db.data.unik && db.data.unik.includes(unik) || unik == undefined) {
    unik = (Math.floor(Math.random() * 200)).toFixed()
  }
  if (!db.data.unik) db.data.unik = ['0']
  db.data.unik.push(unik)
  return Number(unik)
} 