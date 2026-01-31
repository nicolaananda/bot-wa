// BACKUP: Case 'buynow' Original (sebelum implementasi PostgreSQL webhook)
// Tanggal backup: 2025-11-22
// File asal: index.js line 2126-2320

case 'buynow': {
  // 🛡️ RATE LIMIT: Prevent spam (max 3 buynow per minute for non-owners)
  if (!isOwner) {
    const rateLimit = await checkRateLimit(sender, 'buynow', 3, 60)
    if (!rateLimit.allowed) {
      return reply(`⚠️ *Terlalu banyak request!*\n\nAnda sudah melakukan ${rateLimit.current} pembelian dalam 1 menit.\nSilakan tunggu ${rateLimit.resetIn} detik lagi.`)
    }
  }
  
  // 🔒 REDIS LOCK: Prevent race condition (double purchase)
  const lockAcquired = await acquireLock(sender, 'buynow', 30)
  if (!lockAcquired) {
    return reply(`⚠️ *Transaksi sedang diproses*\n\nAnda sedang melakukan transaksi lain. Harap tunggu sampai selesai atau ketik *${prefix}batal* untuk membatalkan.`)
  }
  
  try {
    if (db.data.order[sender] !== undefined) {
      await releaseLock(sender, 'buynow')
      return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *${prefix}batal* untuk membatalkan pembayaran.`)
    }
    let data = q.split(" ")
  if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk jumlah`)
  if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada`)

  const jumlah = Number(data[1])
  if (!Number.isFinite(jumlah) || jumlah <= 0) return reply("Jumlah harus berupa angka lebih dari 0")

  let stok = db.data.produk[data[0]].stok
  if (stok.length <= 0) return reply("Stok habis, silahkan hubungi Owner untuk restok")
  if (stok.length < jumlah) return reply(`Stok tersedia ${stok.length}, jadi harap jumlah tidak melebihi stok`)

  const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
  // Catat waktu pembuatan order untuk menghindari match notifikasi lama
  const createdAtTs = Date.now()
  db.data.order[sender] = { status: 'processing', reffId, idProduk: data[0], jumlah, metode: 'QRIS', startedAt: createdAtTs }

  try {
    // Hitung harga (sama seperti case 'buy')
    let totalHarga = Number(hargaProduk(data[0], db.data.users[sender].role)) * jumlah
    const uniqueCode = Math.floor(1 + Math.random() * 99);
    const totalAmount = totalHarga + uniqueCode;

    reply("Sedang membuat QR Code...");
    
    const orderId = `TRX-${reffId}-${Date.now()}`;
    const qrImagePath = await qrisStatis("./options/sticker/qris.jpg");

    const expirationTime = Date.now() + toMs("30m");
    const expireDate = new Date(expirationTime);
    const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000));
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000);
    const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`;

    const caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n` +
        `*Produk ID:* ${data[0]}\n` +
        `*Nama Produk:* ${db.data.produk[data[0]].name}\n` +
        `*Harga:* Rp${toRupiah(totalHarga / jumlah)}\n` +
        `*Jumlah:* ${jumlah}\n` +
        `*Subtotal:* Rp${toRupiah(totalHarga)}\n` +
        `*Kode Unik:* *${uniqueCode}*\n` +
        `*Total:* *Rp${toRupiah(totalAmount)}*\n` +
        `*Waktu:* ${timeLeft} menit\n\n` +
        `📱 *Cara Bayar:*\n` +
        `1. Scan QRIS di atas\n` +
        `2. *⚠️ PENTING: Input nominal HARUS sesuai*\n` +
        `   *Nominal: Rp${toRupiah(totalAmount)}*\n` +
        `   (Rp${toRupiah(totalHarga)} + *kode unik ${uniqueCode}*)\n` +
        `3. *Pembayaran akan terdeteksi otomatis jika nominal sesuai*\n\n` +
        `*⚠️ PERINGATAN:*\n` +
        `• Jika nominal tidak sesuai, pembayaran TIDAK akan terdeteksi\n` +
        `• Pastikan total pembayaran: *Rp${toRupiah(totalAmount)}*\n` +
        `• Kode unik: *${uniqueCode}* (WAJIB ditambahkan)\n\n` +
        `⏰ Batas waktu: sebelum ${formattedTime}\n` +
        `Jika ingin membatalkan, ketik *${prefix}batal*`;

    // Improvement #3: Async file read
    const qrImage = await fs.promises.readFile(qrImagePath);
    const message = await nicola.sendMessage(from, {
        image: qrImage,
        caption: caption
    }, { quoted: m });

    db.data.order[sender] = {
        id: data[0],
        jumlah: jumlah,
        from,
        key: message.key,
        orderId,
        reffId,
        totalAmount,
        uniqueCode,
        // Simpan timestamp utk validasi notifikasi pembayaran
        createdAt: createdAtTs
    };

        // Improvement #1: Exponential backoff polling
        let pollInterval = 3000;  // Mulai dari 3 detik
        const maxInterval = 15000; // Maksimal 15 detik
        let pollCount = 0;

        while (db.data.order[sender]) {
            await sleep(pollInterval);

            // Tingkatkan interval secara bertahap
            if (pollCount < 10) {
                pollInterval = Math.min(Math.floor(pollInterval * 1.2), maxInterval);
            }
            pollCount++;

            if (Date.now() >= expirationTime) {
                await nicola.sendMessage(from, { delete: message.key });
                reply("Pembayaran dibatalkan karena melewati batas waktu 30 menit.");
                delete db.data.order[sender];
                break;
            }

            try {
                const url = `${listener.baseUrl}/notifications?limit=50`;
                const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {};
                const resp = await axios.get(url, { headers, timeout: 5000 });
                const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : []);

                // Hanya terima notifikasi setelah order dibuat dan jumlah harus sama persis
                const paid = notifs.find(n => {
                  try {
                    const pkgOk = (n.package_name === 'com.gojek.gopaymerchant') || (String(n.app_name||'').toUpperCase().includes('GOPAY')) || (String(n.app_name||'').toUpperCase().includes('GOJEK'))
                    const amt = Number(String(n.amount_detected || '').replace(/[^0-9]/g, ''))
                    const postedAt = n.posted_at ? new Date(n.posted_at).getTime() : 0
                    return pkgOk && amt === Number(totalAmount) && postedAt >= createdAtTs
                  } catch {
                    return false
                  }
                });

                if (paid) {
                    await nicola.sendMessage(from, { delete: message.key });
                    reply("Pembayaran berhasil, data akun akan segera diproses.");

                    // Proses pembelian langsung (sama seperti case 'buy')
                    db.data.produk[data[0]].terjual += jumlah
                    let dataStok = []
                    for (let i = 0; i < jumlah; i++) {
                      dataStok.push(db.data.produk[data[0]].stok.shift())
                    }

                    // Improvement #4: Optimize string building dengan array.join()
                    const detailParts = [
                      `*📦 Produk:* ${db.data.produk[data[0]].name}`,
                      `*📅 Tanggal:* ${tanggal}`,
                      `*⏰ Jam:* ${jamwib} WIB`,
                      `*Refid:* ${reffId}`,
                      ''
                    ];

                    dataStok.forEach((i) => {
                      const dataAkun = i.split("|");
                      detailParts.push(
                        `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
                        `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}`,
                        `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}`,
                        `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}`,
                        `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}`,
                        ''
                      );
                    });

                    if (db.data.produk[data[0]].snk) {
                      detailParts.push(
                        `*╭────「 SYARAT & KETENTUAN 」────╮*`,
                        '',
                        `*📋 SNK PRODUK: ${db.data.produk[data[0]].name}*`,
                        '',
                        db.data.produk[data[0]].snk,
                        '',
                        `*⚠️ PENTING:*`,
                        `• Baca dan pahami SNK sebelum menggunakan akun`,
                        `• Akun yang sudah dibeli tidak dapat dikembalikan`,
                        `• Hubungi admin jika ada masalah dengan akun`,
                        '',
                        `*╰────「 END SNK 」────╯*`
                      );
                    }

                    const detailAkunCustomer = detailParts.join('\n');

                    await sleep(1000);
                    await nicola.sendMessage(sender, { text: detailAkunCustomer });

                    // Save receipt
                    try {
                      const { saveReceipt } = require('./config/r2-storage');
                      const result = await saveReceipt(reffId, detailAkunCustomer);
                      if (result.success) {
                        console.log(`✅ Receipt saved: ${result.url || result.path || reffId}`);
                      }
                    } catch (receiptError) {
                      console.error(`Error saving receipt:`, receiptError.message);
                    }

                    // Add to transaction database
                    db.data.transaksi.push({
                      id: data[0],
                      name: db.data.produk[data[0]].name,
                      price: hargaProduk(data[0], db.data.users[sender].role),
                      date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                      profit: db.data.produk[data[0]].profit || 0,
                      jumlah: jumlah,
                      user: sender.split("@")[0],
                      userRole: db.data.users[sender].role,
                      reffId: reffId,
                      metodeBayar: "QRIS",
                      totalBayar: totalAmount
                    });
                    
                    if (typeof global.scheduleSave === 'function') {
                      global.scheduleSave();
                    }

                    delete db.data.order[sender];
                    await db.save();
                    console.log(`✅ Transaction completed via buynow: ${orderId} - ${reffId}`);
                    break;
                }
            } catch (err) {
                if (err.message?.includes("timeout")) continue;

                await nicola.sendMessage(from, { delete: message.key });
                reply("Pembayaran dibatalkan karena error sistem.");
                delete db.data.order[sender];
                break;
            }
        }
  } catch (error) {
    console.error(`Error creating QRIS for ${sender}:`, error)
    reply("Gagal membuat QR Code. Silakan coba lagi.")
    delete db.data.order[sender]
  } finally {
    await releaseLock(sender, 'buynow')
  }
}
break;

