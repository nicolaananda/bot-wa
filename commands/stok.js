const productService = require('../services/product-service');
const logger = require('../config/logger');

/**
 * Stok Command
 * Display all available products with stock information
 */
async function stokCommand({ nicola, m, db, from, sender, prefix, reply, scheduleAutoDelete }) {
    try {
        logger.info('Stok command started', { sender });

        // Check database structure
        if (!db?.data?.produk) {
            logger.error('Database not available', { command: 'stok', sender });
            return reply("❌ Database tidak tersedia atau rusak");
        }

        const products = Object.keys(db.data.produk);
        if (products.length === 0) {
            return reply("📦 Belum ada produk di database");
        }

        // Get owner number for mentions
        const ownerNomer = process.env.OWNER_NUMBER?.replace(/[^0-9]/g, '') || '';

        // Build header
        let teks = `*╭────〔 PRODUCT LIST📦 〕─*\n`;
        teks += `*┊・* Cara membeli:\n`;
        teks += `*┊・* 1. Buynow (QRIS Otomatis): ${prefix}buynow kodeproduk jumlah\n`;
        teks += `*┊・*    Contoh: ${prefix}buynow netflix 2\n`;
        teks += `*┊・* 2. Buy (Saldo): ${prefix}buy kodeproduk jumlah\n`;
        teks += `*┊・*    Contoh: ${prefix}buy netflix 2\n`;
        teks += `*┊・* Kontak Admin: @${ownerNomer}\n`;
        teks += `*┊・* _⏰ Pesan ini akan terhapus otomatis dalam 5 menit_\n`;
        teks += `*╰┈┈┈┈┈┈┈┈*\n\n`;

        // Get all products and sort by sales
        const productsArray = productService.getAllProducts(db)
            .sort((a, b) => (b.terjual || 0) - (a.terjual || 0));

        // Get user role for pricing
        const userRole = db.data.users?.[sender]?.role || 'bronze';

        // Process each product
        for (const produk of productsArray) {
            try {
                const name = produk.name || 'Unknown';
                const desc = produk.desc || 'Tidak ada deskripsi';
                const stokLength = produk.stok?.length || 0;
                const terjual = produk.terjual || 0;

                // Get price using ProductService
                let harga = 'Harga tidak tersedia';
                try {
                    const hargaValue = productService.getPrice(produk, userRole);
                    if (hargaValue && !isNaN(hargaValue)) {
                        harga = `Rp${productService.formatRupiah(hargaValue)}`;
                    }
                } catch (error) {
                    logger.warn('Error getting price', { productId: produk.id, error: error.message });
                }

                // Build product info
                teks += `*╭──〔 ${name} 〕─*\n`;
                teks += `*┊・ 🔐| Kode:* ${produk.id}\n`;
                teks += `*┊・ 🏷️| Harga:* ${harga}\n`;
                teks += `*┊・ 📦| Stok:* ${stokLength}\n`;
                teks += `*┊・ 🧾| Terjual:* ${terjual}\n`;
                teks += `*┊・ 📝| Desk:* ${desc}\n`;
                teks += `*┊・ ✍️| Beli:* ${prefix}buy ${produk.id} 1\n`;
                teks += `*╰┈┈┈┈┈┈┈┈*\n\n`;

            } catch (error) {
                logger.warn('Error processing product', { productId: produk.id, error: error.message });
            }
        }

        // Send the message
        const sentMessage = await nicola.sendMessage(from, {
            text: teks,
            mentions: [ownerNomer + "@s.whatsapp.net"]
        }, { quoted: m });

        // Schedule auto-delete
        if (typeof scheduleAutoDelete === 'function') {
            scheduleAutoDelete(sentMessage.key, from, 300000, 'stok list message');
        }

        logger.info('Stok command completed', { sender, productCount: productsArray.length });

    } catch (error) {
        logger.error('Error in stok command', { error: error.message, stack: error.stack, sender });
        reply(`❌ Terjadi kesalahan pada command stok: ${error.message}`);
    }
}

module.exports = stokCommand;
