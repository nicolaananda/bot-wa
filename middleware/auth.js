const logger = require('../config/logger');

/**
 * Authentication middleware
 * Checks if user is authorized to execute command
 */
class AuthMiddleware {
    /**
     * Check if user is owner
     * @returns {Function} Middleware function
     */
    static isOwner() {
        return async (context, next) => {
            const { sender } = context;
            const ownerNumber = process.env.OWNER_NUMBER;

            if (!ownerNumber) {
                logger.error('OWNER_NUMBER not configured');
                return context.reply('❌ Konfigurasi owner tidak ditemukan');
            }

            // Normalize phone numbers for comparison
            const normalizedSender = sender.replace(/[^0-9]/g, '');
            const normalizedOwner = ownerNumber.replace(/[^0-9]/g, '');

            if (normalizedSender !== normalizedOwner) {
                logger.warn('Unauthorized access attempt', {
                    sender,
                    command: context.command,
                });

                return context.reply('❌ *Akses Ditolak*\n\nPerintah ini hanya untuk owner.');
            }

            await next();
        };
    }

    /**
     * Check if user has minimum role
     * @param {string} minRole - Minimum required role
     * @returns {Function} Middleware function
     */
    static hasRole(minRole = 'bronze') {
        const roleHierarchy = {
            bronze: 0,
            silver: 1,
            gold: 2,
        };

        return async (context, next) => {
            const { sender, db } = context;
            const userRole = db.data.users[sender]?.role || 'bronze';

            const userLevel = roleHierarchy[userRole] || 0;
            const requiredLevel = roleHierarchy[minRole] || 0;

            if (userLevel < requiredLevel) {
                logger.warn('Insufficient role', {
                    sender,
                    userRole,
                    requiredRole: minRole,
                });

                return context.reply(
                    `❌ *Akses Ditolak*\n\n` +
                    `Role Anda: ${userRole.toUpperCase()}\n` +
                    `Role Minimum: ${minRole.toUpperCase()}`
                );
            }

            await next();
        };
    }

    /**
     * Check if user is in group
     * @returns {Function} Middleware function
     */
    static isGroup() {
        return async (context, next) => {
            const { isGroup } = context;

            if (!isGroup) {
                return context.reply('❌ Perintah ini hanya bisa digunakan di group');
            }

            await next();
        };
    }

    /**
     * Check if user is in private chat
     * @returns {Function} Middleware function
     */
    static isPrivate() {
        return async (context, next) => {
            const { isGroup } = context;

            if (isGroup) {
                return context.reply('❌ Perintah ini hanya bisa digunakan di private chat');
            }

            await next();
        };
    }

    /**
     * Check if user is group admin
     * @returns {Function} Middleware function
     */
    static isGroupAdmin() {
        return async (context, next) => {
            const { isGroup, sender, groupMetadata } = context;

            if (!isGroup) {
                return context.reply('❌ Perintah ini hanya bisa digunakan di group');
            }

            const groupAdmins = groupMetadata?.participants
                ?.filter((p) => p.admin !== null)
                ?.map((p) => p.id) || [];

            if (!groupAdmins.includes(sender)) {
                logger.warn('Non-admin tried to use admin command', {
                    sender,
                    group: groupMetadata?.subject,
                });

                return context.reply('❌ Perintah ini hanya untuk admin group');
            }

            await next();
        };
    }
}

module.exports = AuthMiddleware;
