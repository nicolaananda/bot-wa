// Buynow function replacement - exact copy from original
async buynow(ronzz, m, context) {
  const { q, sender, from, reply, prefix, command, isGroup, jamwib } = context;
  
  if (db.data.order[sender] !== undefined) return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *${prefix}batal* untuk membatalkan pembayaran.`)
  let data = q.split(" ")
  if (!data[1]) return reply(`Contoh: ${prefix + command} idproduk jumlah`)
  if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada`)

  const jumlah = Number(data[1])
  if (!Number.isFinite(jumlah) || jumlah <= 0) return reply("Jumlah harus berupa angka lebih dari 0")

  let stok = db.data.produk[data[0]].stok
  if (stok.length <= 0) return reply("Stok habis, silahkan hubungi Owner untuk restok")
  if (stok.length < jumlah) return reply(`Stok tersedia ${stok.length}, jadi harap jumlah tidak melebihi stok`)

  const reffId = crypto.randomBytes(5).toString("hex").toUpperCase()
  db.data.order[sender] = { status: 'processing', reffId, idProduk: data[0], jumlah, metode: 'QRIS', startedAt: Date.now() }

  try {
    // Hitung harga (sama seperti case 'buy')
    let totalHarga = Number(hargaProduk(db, data[0], db.data.users[sender].role)) * jumlah
    const uniqueCode = Math.floor(1 + Math.random() * 99);
    const totalAmount = totalHarga + uniqueCode;

    reply("Sedang membuat QR Code...");
    
    const orderId = `TRX-${reffId}-${Date.now()}`;
    const qrImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg");

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
        `*Kode Unik:* ${uniqueCode}\n` +
        `*Total:* Rp${toRupiah(totalAmount)}\n` +
        `*Waktu:* ${timeLeft} menit\n\n` +
        `Silakan scan QRIS di atas sebelum ${formattedTime} untuk melakukan pembayaran.\n\n` +
        `Jika ingin membatalkan, ketik *${prefix}batal*`;

    const message = await ronzz.sendMessage(from, {
        image: fs.readFileSync(qrImagePath),
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
        uniqueCode
    };

      while (db.data.order[sender]) {
          await sleep(10000);

          if (Date.now() >= expirationTime) {
              await ronzz.sendMessage(from, { delete: message.key });
              reply("Pembayaran dibatalkan karena melewati batas waktu 30 menit.");
              delete db.data.order[sender];
              break;
          }

          try {
              const url = `${listener.baseUrl}/notifications?limit=50`;
              const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {};
              const resp = await axios.get(url, { headers });
              const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : []);

              const paid = notifs.find(n => (n.package_name === 'id.bmri.livinmerchant' || (n.app_name||'').toUpperCase().includes('DANA')) && Number((n.amount_detected || '').toString().replace(/[^0-9]/g, '')) === Number(totalAmount));

              if (paid) {
                  await ronzz.sendMessage(from, { delete: message.key });
                  reply("Pembayaran berhasil, data akun akan segera diproses.");

                  // Proses pembelian langsung (sama seperti case 'buy')
                  db.data.produk[data[0]].terjual += jumlah
                  let dataStok = []
                  for (let i = 0; i < jumlah; i++) {
                    dataStok.push(db.data.produk[data[0]].stok.shift())
                  }
                  
                  await db.save();

                  // Buat detail akun untuk customer (gabungan akun + SNK)
                  let detailAkunCustomer = `*📦 Produk:* ${db.data.produk[data[0]].name}\n`
                  detailAkunCustomer += `*📅 Tanggal:* ${tanggal}\n`
                  detailAkunCustomer += `*⏰ Jam:* ${jamwib} WIB\n`
                  detailAkunCustomer += `*Refid:* ${reffId}\n\n`
                  dataStok.forEach((i, index) => {
                    let dataAkun = i.split("|")
                    detailAkunCustomer += `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`
                    detailAkunCustomer += `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`
                    detailAkunCustomer += `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}\n`
                    detailAkunCustomer += `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}\n`
                    detailAkunCustomer += `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}\n\n`
                  })
                  
                  // Tambahkan SNK ke pesan customer
                  detailAkunCustomer += `*╭────「 SYARAT & KETENTUAN 」────╮*\n\n`
                  detailAkunCustomer += `*📋 SNK PRODUK: ${db.data.produk[data[0]].name}*\n\n`
                  detailAkunCustomer += `${db.data.produk[data[0]].snk}\n\n`
                  detailAkunCustomer += `*⚠️ PENTING:*\n`
                  detailAkunCustomer += `• Baca dan pahami SNK sebelum menggunakan akun\n`
                  detailAkunCustomer += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`
                  detailAkunCustomer += `• Hubungi admin jika ada masalah dengan akun\n\n`
                  detailAkunCustomer += `*╰────「 END SNK 」────╯*`

                  // Buat detail akun untuk owner (hanya informasi akun)
                  let detailAkunOwner = `*📦 Produk:* ${db.data.produk[data[0]].name}\n`
                  detailAkunOwner += `*📅 Tanggal:* ${tanggal}\n`
                  detailAkunOwner += `*⏰ Jam:* ${jamwib} WIB\n`
                  detailAkunOwner += `*Refid:* ${reffId}\n\n`
                  dataStok.forEach((i, index) => {
                    let dataAkun = i.split("|")
                    detailAkunOwner += `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`
                    detailAkunOwner += `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`
                    detailAkunOwner += `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}\n`
                    detailAkunOwner += `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}\n`
                    detailAkunOwner += `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}\n\n`
                  })

                  // Kirim ke customer (1 pesan gabungan akun + SNK) - PRIORITAS UTAMA
                  console.log('🚀 STARTING CUSTOMER MESSAGE SEND PROCESS');
                  console.log('Customer ID:', sender);
                  console.log('Message length:', detailAkunCustomer.length);
                  console.log('First 100 chars of message:', detailAkunCustomer.substring(0, 100));
                  
                  let customerMessageSent = false;
                  
                  // Attempt 1: Send with basic format
                  try {
                    console.log('📤 Attempt 1: Sending account details to customer...');
                    console.log('📞 Customer WhatsApp ID:', sender);
                    console.log('📏 Message length:', detailAkunCustomer.length);
                    
                    // Add delay before sending to avoid rate limits
                    await sleep(1000);
                    
                    const messageResult = await ronzz.sendMessage(sender, { text: detailAkunCustomer });
                    console.log('📨 Message result:', messageResult ? 'Message object returned' : 'No result returned');
                    console.log('✅ SUCCESS: Account details sent to customer!');
                    
                    // Wait a bit and try to send a confirmation
                    await sleep(2000);
                    try {
                      await ronzz.sendMessage(sender, { text: "✅ Detail akun telah dikirim di pesan sebelumnya. Jika tidak terlihat, silahkan hubungi admin." });
                      console.log('✅ Confirmation message sent');
                    } catch (confirmError) {
                      console.error('❌ Confirmation message failed:', confirmError.message);
                    }
                    
                    customerMessageSent = true;
                    
                  } catch (error) {
                    console.error('❌ ATTEMPT 1 FAILED:', error.message);
                    console.error('❌ Full error:', error);
                    
                    // Attempt 2: Send in multiple smaller messages
                    try {
                      console.log('📤 Attempt 2: Sending account details in multiple messages...');
                      
                      // Send header first
                      let headerMessage = `*📦 DETAIL AKUN PEMBELIAN*\n\n`;
                      headerMessage += `*Produk:* ${db.data.produk[data[0]].name}\n`;
                      headerMessage += `*Tanggal:* ${tanggal}\n`;
                      headerMessage += `*Jam:* ${jamwib} WIB\n`;
                      headerMessage += `*Jumlah Akun:* ${dataStok.length}\n\n`;
                      headerMessage += `📋 Detail akun akan dikirim dalam pesan terpisah...`;
                      
                      await sleep(1000);
                      await ronzz.sendMessage(sender, { text: headerMessage });
                      console.log('✅ Header message sent');
                      
                      // Send each account separately
                      for (let index = 0; index < dataStok.length; index++) {
                        await sleep(2000); // Delay between messages
                        let dataAkun = dataStok[index].split("|");
                        let accountMessage = `*═══ AKUN ${index + 1} ═══*\n`;
                        accountMessage += `📧 Email: ${dataAkun[0] || 'Tidak ada'}\n`;
                        accountMessage += `🔐 Password: ${dataAkun[1] || 'Tidak ada'}\n`;
                        if (dataAkun[2]) accountMessage += `👤 Profil: ${dataAkun[2]}\n`;
                        if (dataAkun[3]) accountMessage += `🔢 Pin: ${dataAkun[3]}\n`;
                        if (dataAkun[4]) accountMessage += `🔒 2FA: ${dataAkun[4]}\n`;
                        
                        await ronzz.sendMessage(sender, { text: accountMessage });
                        console.log(`✅ Account ${index + 1} details sent`);
                      }
                      
                      // Send SNK separately if it exists
                      if (db.data.produk[data[0]].snk) {
                        await sleep(2000);
                        let snkMessage = `*╭────「 SYARAT & KETENTUAN 」────╮*\n\n`;
                        snkMessage += `${db.data.produk[data[0]].snk}\n\n`;
                        snkMessage += `*⚠️ PENTING:*\n`;
                        snkMessage += `• Baca dan pahami SNK sebelum menggunakan akun\n`;
                        snkMessage += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`;
                        snkMessage += `• Hubungi admin jika ada masalah dengan akun\n\n`;
                        snkMessage += `*╰────「 END SNK 」────╯*`;
                        
                        await ronzz.sendMessage(sender, { text: snkMessage });
                        console.log('✅ SNK message sent');
                      }
                      
                      console.log('✅ SUCCESS: All account details sent in separate messages!');
                      customerMessageSent = true;
                      
                    } catch (fallbackError) {
                      console.error('❌ ATTEMPT 2 ALSO FAILED:', fallbackError.message);
                      
                      // Attempt 3: Send basic text only
                      try {
                        console.log('📤 Attempt 3: Sending basic notification...');
                        const basicMessage = `Akun berhasil dibeli!\n\nProduk: ${db.data.produk[data[0]].name}\nJumlah: ${jumlah} akun\n\nSilahkan hubungi admin untuk mendapatkan detail akun.`;
                        await ronzz.sendMessage(sender, { text: basicMessage })
                        console.log('✅ SUCCESS: Basic notification sent to customer!');
                        customerMessageSent = true;
                        
                      } catch (finalError) {
                        console.error('❌ ALL ATTEMPTS FAILED:', finalError.message);
                        console.error('❌ CUSTOMER WILL NOT RECEIVE ACCOUNT DETAILS!');
                      }
                    }
                  }
                  
                  console.log('🏁 CUSTOMER MESSAGE SEND RESULT:', customerMessageSent ? 'SUCCESS' : 'FAILED');

                  // Send single comprehensive success message
                  if (customerMessageSent) {
                    if (isGroup) {
                      reply("🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim ke chat pribadi Anda. Terima kasih!");
                    } else {
                      reply("🎉 Pembayaran QRIS berhasil! Detail akun telah dikirim di atas. Terima kasih!");
                    }
                  } else {
                    reply("⚠️ Pembayaran QRIS berhasil, tetapi terjadi masalah saat mengirim detail akun. Admin akan segera mengirim detail akun secara manual.");
                    
                  // Skip sending alert to admin about failed delivery
                  }

                  // Simpan receipt ke file txt (sama dengan detailAkunCustomer)
                  try {
                    const receiptContent = detailAkunCustomer;
                    const receiptPath = `./options/receipts/${reffId}.txt`;
                    
                    // Pastikan folder receipts ada
                    if (!fs.existsSync('./options/receipts')) {
                      fs.mkdirSync('./options/receipts', { recursive: true });
                    }
                    
                    fs.writeFileSync(receiptPath, receiptContent, 'utf8');
                    console.log(`✅ Receipt saved: ${receiptPath}`);
                  } catch (receiptError) {
                    console.error('❌ Error saving receipt:', receiptError.message);
                  }

                  // Tambah ke database transaksi (sama seperti case 'buy')
                  db.data.transaksi.push({
                    id: data[0],
                    name: db.data.produk[data[0]].name,
                    price: hargaProduk(db, data[0], db.data.users[sender].role),
                    date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                    profit: db.data.produk[data[0]].profit,
                    jumlah: jumlah,
                    user: sender.split("@")[0],
                    userRole: db.data.users[sender].role,
                    reffId: reffId,
                    metodeBayar: "QRIS",
                    totalBayar: totalAmount
                  });
                  await db.save();

                  // Skip stock-empty admin notifications

                  delete db.data.order[sender];
                  await db.save();
                  console.log(`✅ Transaction completed: ${orderId} - ${reffId}`);
                  break;
              }
          } catch (error) {
              console.error(`Error checking listener for ${orderId}:`, error);
          }
      }
  } catch (error) {
      console.error(`Error processing QRIS for ${data[0]}:`, error);
      reply("Gagal membuat QR Code pembayaran. Silakan coba lagi.");
  }
}




