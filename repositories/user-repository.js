const logger = require('../config/logger');

/**
 * User Repository
 * Data access layer for user operations
 */
class UserRepository {
    constructor(db) {
        this.db = db;
    }

    /**
     * Find user by ID
     * @param {string} userId - User ID
     * @returns {Object|null} User or null
     */
    findById(userId) {
        return this.db.data.users[userId] || null;
    }

    /**
     * Create new user
     * @param {string} userId - User ID
     * @param {Object} userData - User data
     * @returns {Object} Created user
     */
    create(userId, userData = {}) {
        const user = {
            saldo: 0,
            role: 'bronze',
            createdAt: Date.now(),
            ...userData,
        };

        this.db.data.users[userId] = user;

        logger.info('User created', { userId });

        return user;
    }

    /**
     * Update user
     * @param {string} userId - User ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Updated user
     */
    update(userId, updates) {
        const user = this.findById(userId);

        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        Object.assign(user, updates);

        logger.info('User updated', { userId, updates });

        return user;
    }

    /**
     * Delete user
     * @param {string} userId - User ID
     * @returns {boolean} Success
     */
    delete(userId) {
        if (!this.db.data.users[userId]) {
            return false;
        }

        delete this.db.data.users[userId];

        logger.info('User deleted', { userId });

        return true;
    }

    /**
     * Find all users
     * @returns {Array} Users array
     */
    findAll() {
        return Object.entries(this.db.data.users).map(([id, user]) => ({
            id,
            ...user,
        }));
    }

    /**
     * Find users by role
     * @param {string} role - User role
     * @returns {Array} Users array
     */
    findByRole(role) {
        return this.findAll().filter((user) => user.role === role);
    }
}

module.exports = UserRepository;
