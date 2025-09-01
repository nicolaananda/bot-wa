// Stock/Stok command
module.exports = {
    name: ['stok', 'stock'],
    description: 'Display available products',
    category: 'store',
    usage: 'stok',
    
    async execute(ctx) {
        const { reply, sender } = ctx;
        const { toRupiah, hargaProduk } = require('../../../function/myfunc');
        
        try {
            if (!global.db?.data?.produk) {
                return reply('❌ Database tidak tersedia atau rusak');
            }
            
            const products = global.db.data.produk;
            if (Object.keys(products).length === 0) {
                return reply('📦 Belum ada produk di database');
            }

            let teks = '*╭────〔 PRODUCT LIST📦 〕─*\n';
            teks += '*┊・* Cara membeli: ' + ctx.prefix + 'buy kodeproduk jumlah\n';
            teks += '*┊・* Contoh: ' + ctx.prefix + 'buy netflix 2\n';
            teks += '*┊・* Kontak Admin: @' + global.ownerNomer + '\n';
            teks += '*╰┈┈┈┈┈┈┈┈*\n\n';

            for (const productId of Object.keys(products)) {
                try {
                    const produk = products[productId];
                    if (!produk) continue;
                    
                    const name = produk.name || 'Unknown';
                    const desc = produk.desc || 'Tidak ada deskripsi';
                    const stokLength = Array.isArray(produk.stok) ? produk.stok.length : 0;
                    const terjual = produk.terjual || 0;
                    
                    let harga = 'Harga tidak tersedia';
                    try {
                        const userRole = global.db.data.users?.[sender]?.role || 'bronze';
                        const hargaValue = hargaProduk(productId, userRole);
                        if (hargaValue && !isNaN(hargaValue)) {
                            harga = 'Rp' + toRupiah(hargaValue);
                        }
                    } catch (error) {
                        console.log('Error getting price for product', productId + ':', error.message);
                    }
                    
                    teks += '*╭──〔 ' + name + ' 〕─*\n';
                    teks += '*┊・ 🔐| Kode:* ' + productId + '\n';
                    teks += '*┊・ 🏷️| Harga:* ' + harga + '\n';
                    teks += '*┊・ 📦| Stok:* ' + stokLength + '\n';
                    teks += '*┊・ 🧾| Terjual:* ' + terjual + '\n';
                    teks += '*┊・ 📝| Desk:* ' + desc + '\n';
                    teks += '*┊・ ✍️| Beli:* ' + ctx.prefix + 'buy ' + productId + ' 1\n';
                    teks += '*╰┈┈┈┈┈┈┈┈*\n\n';
                    
                } catch (error) {
                    console.log('Error processing product', productId + ':', error.message);
                }
            }

            await ctx.ronzz.sendMessage(ctx.from, { 
                text: teks, 
                mentions: [global.ownerNomer + '@s.whatsapp.net'] 
            }, { quoted: ctx.m });
            
        } catch (error) {
            console.error('❌ Error in stok command:', error);
            reply('❌ Terjadi kesalahan pada command stok: ' + error.message);
        }
    }
};
