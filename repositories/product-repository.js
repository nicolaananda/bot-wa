const logger = require('../config/logger');

/**
 * Product Repository
 * Data access layer for product operations
 */
class ProductRepository {
    constructor(db) {
        this.db = db;
    }

    /**
     * Find product by ID
     * @param {string} productId - Product ID
     * @returns {Object|null} Product or null
     */
    findById(productId) {
        return this.db.data.produk[productId] || null;
    }

    /**
     * Create new product
     * @param {string} productId - Product ID
     * @param {Object} productData - Product data
     * @returns {Object} Created product
     */
    create(productId, productData) {
        const product = {
            id: productId,
            stok: [],
            createdAt: Date.now(),
            ...productData,
        };

        this.db.data.produk[productId] = product;

        logger.info('Product created', { productId });

        return product;
    }

    /**
     * Update product
     * @param {string} productId - Product ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Updated product
     */
    update(productId, updates) {
        const product = this.findById(productId);

        if (!product) {
            throw new Error(`Product ${productId} not found`);
        }

        Object.assign(product, updates);

        logger.info('Product updated', { productId, updates });

        return product;
    }

    /**
     * Delete product
     * @param {string} productId - Product ID
     * @returns {boolean} Success
     */
    delete(productId) {
        if (!this.db.data.produk[productId]) {
            return false;
        }

        delete this.db.data.produk[productId];

        logger.info('Product deleted', { productId });

        return true;
    }

    /**
     * Find all products
     * @returns {Array} Products array
     */
    findAll() {
        return Object.entries(this.db.data.produk).map(([id, product]) => ({
            id,
            ...product,
        }));
    }

    /**
     * Add stock to product
     * @param {string} productId - Product ID
     * @param {Array} items - Stock items to add
     * @returns {Object} Updated product
     */
    addStock(productId, items) {
        const product = this.findById(productId);

        if (!product) {
            throw new Error(`Product ${productId} not found`);
        }

        product.stok = product.stok || [];
        product.stok.push(...items);

        logger.info('Stock added', {
            productId,
            count: items.length,
            newTotal: product.stok.length,
        });

        return product;
    }

    /**
     * Remove stock from product
     * @param {string} productId - Product ID
     * @param {number} quantity - Quantity to remove
     * @returns {Array} Removed items
     */
    removeStock(productId, quantity) {
        const product = this.findById(productId);

        if (!product) {
            throw new Error(`Product ${productId} not found`);
        }

        if (!product.stok || product.stok.length < quantity) {
            throw new Error(`Insufficient stock for product ${productId}`);
        }

        const removed = product.stok.splice(0, quantity);

        logger.info('Stock removed', {
            productId,
            count: removed.length,
            remaining: product.stok.length,
        });

        return removed;
    }

    /**
     * Get stock count
     * @param {string} productId - Product ID
     * @returns {number} Stock count
     */
    getStockCount(productId) {
        const product = this.findById(productId);
        return product?.stok?.length || 0;
    }
}

module.exports = ProductRepository;
