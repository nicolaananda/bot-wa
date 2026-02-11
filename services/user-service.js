const logger = require('../config/logger');

/**
 * User Service
 * Handles user-related operations
 */
class UserService {
    constructor() {
        this.logger = logger;
    }

    /**
     * Get user by ID
     * @param {string} userId - User ID
     * @param {Object} db - Database instance
     * @returns {Object} User object
     */
    getUser(userId, db) {
        if (!db.data.users[userId]) {
            // Create new user with default values
            db.data.users[userId] = {
                saldo: 0,
                role: 'bronze',
                createdAt: Date.now(),
            };
        }
        return db.data.users[userId];
    }

    /**
     * Get user balance
     * @param {string} userId - User ID
     * @param {Object} db - Database instance
     * @returns {number} Balance
     */
    getBalance(userId, db) {
        const user = this.getUser(userId, db);
        return user.saldo || 0;
    }

    /**
     * Add balance to user
     * @param {string} userId - User ID
     * @param {number} amount - Amount to add
     * @param {Object} db - Database instance
     * @returns {Object} Updated user
     */
    addBalance(userId, amount, db) {
        const user = this.getUser(userId, db);
        user.saldo = (user.saldo || 0) + amount;

        this.logger.info('Balance added', {
            userId,
            amount,
            newBalance: user.saldo,
        });

        return user;
    }

    /**
     * Deduct balance from user
     * @param {string} userId - User ID
     * @param {number} amount - Amount to deduct
     * @param {Object} db - Database instance
     * @returns {Object} Updated user
     */
    deductBalance(userId, amount, db) {
        const user = this.getUser(userId, db);
        const currentBalance = user.saldo || 0;

        if (currentBalance < amount) {
            throw new Error(`Insufficient balance. Required: ${amount}, Available: ${currentBalance}`);
        }

        user.saldo = currentBalance - amount;

        this.logger.info('Balance deducted', {
            userId,
            amount,
            newBalance: user.saldo,
        });

        return user;
    }

    /**
     * Get user role
     * @param {string} userId - User ID
     * @param {Object} db - Database instance
     * @returns {string} User role
     */
    getRole(userId, db) {
        const user = this.getUser(userId, db);
        return user.role || 'bronze';
    }

    /**
     * Set user role
     * @param {string} userId - User ID
     * @param {string} role - New role
     * @param {Object} db - Database instance
     * @returns {Object} Updated user
     */
    setRole(userId, role, db) {
        const validRoles = ['bronze', 'silver', 'gold'];

        if (!validRoles.includes(role)) {
            throw new Error(`Invalid role: ${role}. Valid roles: ${validRoles.join(', ')}`);
        }

        const user = this.getUser(userId, db);
        user.role = role;

        this.logger.info('User role updated', {
            userId,
            newRole: role,
        });

        return user;
    }

    /**
     * Format user info for display
     * @param {string} userId - User ID
     * @param {Object} db - Database instance
     * @returns {string} Formatted user info
     */
    formatUserInfo(userId, db) {
        const user = this.getUser(userId, db);
        const balance = user.saldo || 0;
        const role = user.role || 'bronze';

        const roleEmoji = {
            bronze: '🥉',
            silver: '🥈',
            gold: '🥇',
        };

        return `👤 *INFORMASI AKUN*\n\n` +
            `User ID: ${userId}\n` +
            `Role: ${roleEmoji[role]} ${role.toUpperCase()}\n` +
            `Saldo: Rp${this.formatRupiah(balance)}`;
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

module.exports = new UserService();
