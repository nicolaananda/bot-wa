const { checkRateLimit } = require('../function/redis-helper');
const logger = require('../config/logger');

/**
 * Rate limiting middleware
 * @param {number} limit - Max requests
 * @param {number} window - Time window in seconds
 * @param {string} key - Rate limit key (default: command name)
 * @returns {Function} Middleware function
 */
function rateLimit(limit = 3, window = 60, key = null) {
    return async (context, next) => {
        const { sender, command } = context;
        const rateLimitKey = key || command;

        try {
            const rateCheck = await checkRateLimit(sender, rateLimitKey, limit, window);

            if (!rateCheck.allowed) {
                logger.warn('Rate limit exceeded', {
                    sender,
                    command: rateLimitKey,
                    current: rateCheck.current,
                    limit,
                });

                return context.reply(
                    `⚠️ *Terlalu banyak request!*\n\n` +
                    `Anda sudah melakukan ${rateCheck.current} request dalam ${window} detik.\n` +
                    `Silakan tunggu ${rateCheck.resetIn} detik lagi.`
                );
            }

            await next();
        } catch (error) {
            logger.error('Rate limit check failed', { error: error.message, sender });
            // Allow request to proceed if rate limit check fails
            await next();
        }
    };
}

module.exports = rateLimit;
