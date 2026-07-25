const logger = require('../config/logger');

const ROLE_DISCOUNTS = Object.freeze({
    bronze: 0,
    silver: 0.05,
    gold: 0.10,
});

/**
 * Payment Service
 * Handles all payment-related business logic
 */
class PaymentService {
    constructor() {
        this.logger = logger;
    }

    /**
     * Calculate total price with unique code
     * @param {number} basePrice - Base price of product
     * @param {number} quantity - Quantity to purchase
     * @param {string} userRole - User role (bronze/silver/gold)
     * @returns {Object} Payment details
     */
    calculateTotal(basePrice, quantity, userRole = 'bronze') {
        const discount = ROLE_DISCOUNTS[userRole] || 0;
        const subtotal = basePrice * quantity;
        const discountAmount = subtotal * discount;
        const afterDiscount = subtotal - discountAmount;
        const uniqueCode = Math.floor(1 + Math.random() * 99);
        const total = afterDiscount + uniqueCode;

        return {
            subtotal,
            discount: discountAmount,
            afterDiscount,
            uniqueCode,
            total: Math.round(total),
        };
    }

    /**
     * Process saldo payment
     * @param {string} userId - User ID
     * @param {string} productId - Product ID
     * @param {number} quantity - Quantity
     * @param {Object} db - Database instance
     * @returns {Promise<Object>} Payment result
     */
    async processSaldoPayment(userId, productId, quantity, db) {
        try {
            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new Error('Quantity must be a positive integer');
            }

            const user = db.data.users[userId];
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }

            // Check user balance
            const userBalance = user.saldo || 0;
            const userRole = user.role || 'bronze';
            const product = db.data.produk[productId];

            if (!product) {
                throw new Error(`Product ${productId} not found`);
            }

            if (!Array.isArray(product.stok)) {
                throw new Error(`Product ${productId} has invalid stock data`);
            }

            const basePrice = this.getProductPrice(product, userRole);
            const payment = this.calculateTotal(basePrice, quantity, userRole);

            if (userBalance < payment.total) {
                throw new Error(`Insufficient balance. Required: ${payment.total}, Available: ${userBalance}`);
            }

            // Check stock
            if (product.stok.length < quantity) {
                throw new Error(`Insufficient stock. Available: ${product.stok.length}`);
            }

            // Deduct balance
            user.saldo -= payment.total;

            // Get products from stock
            const items = product.stok.splice(0, quantity);

            // Create transaction record
            const orderId = this.generateOrderId('SALDO');
            const transaction = {
                orderId,
                userId,
                productId,
                quantity,
                items,
                payment,
                method: 'saldo',
                status: 'completed',
                createdAt: Date.now(),
            };

            this.logger.info('Saldo payment processed', {
                orderId,
                userId,
                productId,
                amount: payment.total,
            });

            return {
                success: true,
                transaction,
            };
        } catch (error) {
            this.logger.error('Saldo payment failed', {
                error: error.message,
                userId,
                productId,
            });
            throw error;
        }
    }

    /**
     * Get product price based on user role
     * @param {Object} product - Product object
     * @param {string} role - User role
     * @returns {number} Price
     */
    getProductPrice(product, role) {
        const prices = {
            bronze: product.price,
            silver: product.price_silver || product.price,
            gold: product.price_gold || product.price,
        };
        return prices[role] || product.price;
    }

    /**
     * Generate unique order ID
     * @param {string} method - Payment method
     * @returns {string} Order ID
     */
    generateOrderId(method) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${method}-${random}-${timestamp}`;
    }
}

module.exports = new PaymentService();
