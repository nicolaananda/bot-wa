const { acquireLock, releaseLock } = require('../function/redis-helper');
const logger = require('../config/logger');

/**
 * Transaction locking middleware
 * Prevents concurrent transactions for the same user
 * @param {string} lockKey - Lock key (default: command name)
 * @param {number} ttl - Lock TTL in seconds
 * @returns {Function} Middleware function
 */
function transactionLock(lockKey = null, ttl = 30) {
    return async (context, next) => {
        const { sender, command } = context;
        const key = lockKey || command;

        try {
            const lockAcquired = await acquireLock(sender, key, ttl);

            if (!lockAcquired) {
                logger.warn('Transaction lock failed', {
                    sender,
                    key,
                });

                return context.reply(
                    `⚠️ *Transaksi sedang diproses*\n\n` +
                    `Anda sedang melakukan transaksi lain.\n` +
                    `Harap tunggu sampai selesai atau ketik *batal* untuk membatalkan.`
                );
            }

            // Store lock info in context for cleanup
            context.lock = {
                key,
                acquired: true,
            };

            try {
                await next();
            } finally {
                // Always release lock after command execution
                await releaseLock(sender, key);
                logger.debug('Transaction lock released', { sender, key });
            }
        } catch (error) {
            logger.error('Transaction lock error', {
                error: error.message,
                sender,
                key,
            });
            throw error;
        }
    };
}

module.exports = transactionLock;
