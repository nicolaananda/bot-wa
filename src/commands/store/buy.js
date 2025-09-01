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
            return reply(\Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik *\batal* untuk membatalkan pembayaran.\);
        }
        
        // Validate input
        if (!args[1]) {
            return reply(\Contoh: \buy idproduk jumlah\);
        }
        
        const productId = args[0];
        const quantity = Number(args[1]);
        
        if (!global.db.data.produk[productId]) {
            return reply(\Produk dengan ID *\* tidak ada\);
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
            return reply(\Stok tersedia \, jadi harap jumlah tidak melebihi stok\);
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
                return reply(\Saldo tidak cukup! Saldo kamu: Rp\\\nTotal harga: Rp\\\n\\nSilahkan topup saldo terlebih dahulu dengan ketik *\payment*\);
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
            
            // Create account details text
            let accountDetails = \*📦 Produk:* \\\n\;
            accountDetails += \*📅 Tanggal:* \\\n\;
            accountDetails += \*⏰ Jam:* \ WIB\\n\\n\;
            
            soldItems.forEach((item, index) => {
                let accountData = item.split('|');
                accountDetails += \│ 📧 Email: \\\n\;
                accountDetails += \│ 🔐 Password: \\\n\;
                accountDetails += \│ 👤 Profil: \\\n\;
                accountDetails += \│ 🔢 Pin: \\\n\;
                accountDetails += \│ 🔒 2FA: \\\n\\n\;
            });
            
            // Send account details to user's private chat
            await ctx.ronzz.sendMessage(sender, { text: accountDetails }, { quoted: ctx.m });
            await ctx.ronzz.sendMessage('6281389592985@s.whatsapp.net', { text: accountDetails }, { quoted: ctx.m });
            
            // Create product terms and conditions text
            let termsText = \*╭────「 SYARAT & KETENTUAN 」────╮*\\n\\n\;
            termsText += \*📋 SNK PRODUK: \*\\n\\n\;
            termsText += \\\\n\\n\;
            termsText += \*⚠️ PENTING:*\\n\;
            termsText += \• Baca dan pahami SNK sebelum menggunakan akun\\n\;
            termsText += \• Akun yang sudah dibeli tidak dapat dikembalikan\\n\;
            termsText += \• Hubungi admin jika ada masalah dengan akun\\n\\n\;
            termsText += \*╰────「 END SNK 」────╯*\;
            
            await ctx.ronzz.sendMessage(sender, { text: termsText }, { quoted: ctx.m });
            
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
