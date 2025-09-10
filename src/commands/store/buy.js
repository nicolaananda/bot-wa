/**
 * Buy Product Command
 */

const crypto = require('crypto');
const moment = require('moment-timezone');

module.exports = {
    name: ['buy'],
    description: 'Buy product using saldo',
    category: 'store',
    usage: 'buy <productId> <quantity>',
    
    async execute(ctx) {
        const { args, sender, reply, isGroup } = ctx;
        const { sleep, toRupiah, hargaProduk } = require('../../../function/myfunc');
        
        // Check if user has pending order
        if (global.db.data.order[sender] !== undefined) {
            return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *batal* untuk membatalkan pembayaran.`);
        }
        
        // Validate input
        if (!args[1]) {
            return reply(`Contoh: buy idproduk jumlah`);
        }
        
        const productId = args[0];
        const quantity = Number(args[1]);
        
        if (!global.db.data.produk[productId]) {
            return reply(`Produk dengan ID *${productId}* tidak ada`);
        }
        
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return reply('Jumlah harus berupa angka lebih dari 0');
        }
        
        const product = global.db.data.produk[productId];
        let stock = product.stok;
        
        if (stock.length <= 0) {
            return reply('Stok habis, silahkan hubungi Owner untuk restok');
        }
        
        if (stock.length < quantity) {
            return reply(`Stok tersedia ${stock.length}, jadi harap jumlah tidak melebihi stok`);
        }
        
        const reffId = crypto.randomBytes(5).toString('hex').toUpperCase();
        global.db.data.order[sender] = { 
            status: 'processing', 
            reffId, 
            idProduk: productId, 
            jumlah: quantity, 
            metode: 'Saldo', 
            startedAt: Date.now() 
        };
        
        try {
            // Check user balance
            const userData = ctx.getUserData();
            const totalPrice = Number(hargaProduk(productId, userData.role)) * quantity;
            
            if (userData.saldo < totalPrice) {
                delete global.db.data.order[sender];
                return reply(`Saldo tidak cukup! Saldo kamu: Rp${toRupiah(userData.saldo)}\nTotal harga: Rp${toRupiah(totalPrice)}\n\nSilahkan topup saldo terlebih dahulu dengan ketik *payment*`);
            }
            
            await reply('Sedang memproses pembelian dengan saldo...');
            
            // Deduct user balance
            userData.saldo -= totalPrice;
            
            // Force save database after balance change
            await global.db.save();
            
            await sleep(1000);
            
            // Process purchase directly
            product.terjual += quantity;
            let soldItems = [];
            for (let i = 0; i < quantity; i++) {
                soldItems.push(stock.shift());
            }
            
            const tanggal = moment.tz('Asia/Jakarta').format('DD MMMM YYYY');
            const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss');
            
            // Create complete account details with SNK (1 message)
            let completeDetails = `*📦 Produk:* ${product.name}\n`;
            completeDetails += `*📅 Tanggal:* ${tanggal}\n`;
            completeDetails += `*⏰ Jam:* ${jamwib} WIB\n\n`;
            
            soldItems.forEach((item, index) => {
                let accountData = item.split('|');
                completeDetails += `│ 📧 Email: ${accountData[0] || 'Tidak ada'}\n`;
                completeDetails += `│ 🔐 Password: ${accountData[1] || 'Tidak ada'}\n`;
                completeDetails += `│ 👤 Profil: ${accountData[2] || 'Tidak ada'}\n`;
                completeDetails += `│ 🔢 Pin: ${accountData[3] || 'Tidak ada'}\n`;
                completeDetails += `│ 🔒 2FA: ${accountData[4] || 'Tidak ada'}\n\n`;
            });
            
            // Add SNK to the same message
            completeDetails += `*╭────「 SYARAT & KETENTUAN 」────╮*\n\n`;
            completeDetails += `*📋 SNK PRODUK: ${product.name}*\n\n`;
            completeDetails += `${product.snk}\n\n`;
            completeDetails += `*⚠️ PENTING:*\n`;
            completeDetails += `• Baca dan pahami SNK sebelum menggunakan akun\n`;
            completeDetails += `• Akun yang sudah dibeli tidak dapat dikembalikan\n`;
            completeDetails += `• Hubungi admin jika ada masalah dengan akun\n\n`;
            completeDetails += `*╰────「 END SNK 」────╯*`;
            
            // Send complete details (account + SNK) to user and owner
            try {
                console.log('Sending complete account details to customer:', sender);
                console.log('Message length:', completeDetails.length);
                
                await ctx.ronzz.sendMessage(sender, { text: completeDetails }, { quoted: ctx.m });
                await ctx.ronzz.sendMessage('6281389592985@s.whatsapp.net', { text: completeDetails }, { quoted: ctx.m });
                console.log('✅ Complete account details sent successfully');
                
            } catch (error) {
                console.error('❌ Error sending account details:', error);
                
                // Fallback: send simple account info
                let simpleAccount = `*📦 AKUN PEMBELIAN*\n\n`;
                simpleAccount += `*Produk:* ${product.name}\n`;
                simpleAccount += `*Tanggal:* ${tanggal}\n\n`;
                soldItems.forEach((item, index) => {
                    let accountData = item.split('|');
                    simpleAccount += `*Akun ${index + 1}:*\n`;
                    simpleAccount += `Email: ${accountData[0] || 'Tidak ada'}\n`;
                    simpleAccount += `Password: ${accountData[1] || 'Tidak ada'}\n\n`;
                });
                
                try {
                    await ctx.ronzz.sendMessage(sender, { text: simpleAccount });
                    console.log('✅ Fallback account details sent successfully');
                } catch (fallbackError) {
                    console.error('❌ Fallback also failed:', fallbackError);
                }
            }
            
            // Send notification to owner
            const ownerNotification = \Hai Owner,
Ada transaksi dengan saldo yang telah selesai!

*╭────「 TRANSAKSI DETAIL 」───*
*┊・ 🧾| Reff Id:* \
*┊・ 📮| Nomor:* @\
*┊・ 📦| Nama Barang:* \
*┊・ 🏷️️| Harga Barang:* Rp\
*┊・ 🛍️| Jumlah Order:* \
*┊・ 💰| Total Bayar:* Rp\
*┊・ 💳| Metode Bayar:* Saldo
*┊・ 📅| Tanggal:* \
*┊・ ⏰| Jam:* \ WIB
*╰┈┈┈┈┈┈┈┈*\;
            
            await ctx.ronzz.sendMessage(global.ownerNomer + '@s.whatsapp.net', { 
                text: ownerNotification, 
                mentions: [sender] 
            });
            
            // Add to transaction database
            global.db.data.transaksi.push({
                id: productId,
                name: product.name,
                price: hargaProduk(productId, userData.role),
                date: moment.tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
                profit: product.profit,
                jumlah: quantity,
                user: sender.split('@')[0],
                userRole: userData.role,
                reffId: reffId,
                metodeBayar: 'Saldo',
                totalBayar: totalPrice
            });
            
            await global.db.save();
            
            // Check if stock is empty and send notification to admin
            if (stock.length === 0) {
                const stockEmptyMessage = \🚨 *STOK HABIS ALERT!* 🚨\\n\\n\ +
                    \*📦 Produk:* \\\n\ +
                    \*🆔 ID Produk:* \\\n\ +
                    \*📊 Stok Sebelumnya:* \\\n\ +
                    \*📉 Stok Sekarang:* 0 (HABIS)\\n\ +
                    \*🛒 Terjual Terakhir:* \ akun\\n\ +
                    \*👤 Pembeli:* @\\\n\ +
                    \*💰 Total Transaksi:* Rp\\\n\ +
                    \*📅 Tanggal:* \\\n\ +
                    \*⏰ Jam:* \ WIB\\n\\n\ +
                    \*⚠️ TINDAKAN YANG DIPERLUKAN:*\\n\ +
                    \• Segera restok produk ini\\n\ +
                    \• Update harga jika diperlukan\\n\ +
                    \• Cek profit margin\\n\\n\ +
                    \*💡 Tips:* Gunakan command *\addstok \ jumlah* untuk menambah stok\;
                
                // Send notifications to admin
                await ctx.ronzz.sendMessage('6281389592985@s.whatsapp.net', { 
                    text: stockEmptyMessage, 
                    mentions: [sender] 
                });
                await ctx.ronzz.sendMessage('6285235540944@s.whatsapp.net', { 
                    text: stockEmptyMessage, 
                    mentions: [sender] 
                });
            }
            
            // Notify successful purchase only if in group
            if (isGroup) {
                await reply('Pembelian berhasil! Detail akun telah dikirim ke chat.');
            }
            
        } catch (error) {
            console.log('Error processing buy:', error);
            await reply('Terjadi kesalahan saat memproses pembelian. Silakan coba lagi atau hubungi admin.');
        } finally {
            delete global.db.data.order[sender];
            await global.db.save();
        }
    }
};
