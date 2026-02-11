const logger = require('../config/logger');

/**
 * Product Service
 * Handles product-related operations
 */
class ProductService {
    constructor() {
        this.logger = logger;
    }

    /**
     * Get product by ID
     * @param {string} productId - Product ID
     * @param {Object} db - Database instance
     * @returns {Object|null} Product or null
     */
    getProduct(productId, db) {
        return db.data.produk[productId] || null;
    }

    /**
     * Get all products
     * @param {Object} db - Database instance
     * @returns {Array} Products array
     */
    getAllProducts(db) {
        return Object.entries(db.data.produk).map(([id, product]) => ({
            id,
            ...product,
        }));
    }

    /**
     * Check product stock availability
     * @param {string} productId - Product ID
     * @param {number} quantity - Required quantity
     * @param {Object} db - Database instance
     * @returns {Object} Stock check result
     */
    checkStock(productId, quantity, db) {
        const product = this.getProduct(productId, db);

        if (!product) {
            return {
                available: false,
                reason: 'Product not found',
            };
        }

        const currentStock = product.stok?.length || 0;

        if (currentStock === 0) {
            return {
                available: false,
                reason: 'Out of stock',
                currentStock: 0,
            };
        }

        if (currentStock < quantity) {
            return {
                available: false,
                reason: 'Insufficient stock',
                currentStock,
                requested: quantity,
            };
        }

        return {
            available: true,
            currentStock,
            requested: quantity,
        };
    }

    /**
     * Format product list for display
     * @param {Object} db - Database instance
     * @param {string} userRole - User role for pricing
     * @returns {string} Formatted product list
     */
    formatProductList(db, userRole = 'bronze') {
        const products = this.getAllProducts(db);

        if (products.length === 0) {
            return '📦 Tidak ada produk tersedia saat ini.';
        }

        let message = '📦 *DAFTAR PRODUK*\n\n';

        products.forEach((product) => {
            const stock = product.stok?.length || 0;
            const price = this.getPrice(product, userRole);
            const status = stock > 0 ? '✅ Tersedia' : '❌ Habis';

            message += `*${product.name}*\n`;
            message += `ID: \`${product.id}\`\n`;
            message += `Harga: Rp${this.formatRupiah(price)}\n`;
            message += `Stok: ${stock}\n`;
            message += `Status: ${status}\n`;
            if (product.desc) {
                message += `Deskripsi: ${product.desc}\n`;
            }
            message += '\n';
        });

        return message;
    }

    /**
     * Get product price based on user role
     * @param {Object} product - Product object
     * @param {string} role - User role
     * @returns {number} Price
     */
    getPrice(product, role) {
        const prices = {
            bronze: product.price,
            silver: product.price_silver || product.price,
            gold: product.price_gold || product.price,
        };
        return prices[role] || product.price;
    }

    /**
     * Format number to Rupiah
     * @param {number} amount - Amount
     * @returns {string} Formatted amount
     */
    formatRupiah(amount) {
        return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
}

module.exports = new ProductService();
