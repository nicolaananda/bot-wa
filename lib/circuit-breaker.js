const CircuitBreaker = require('opossum');
const logger = require('../config/logger');

/**
 * Circuit Breaker for GOWA API
 * Prevents cascading failures when GOWA API is down
 */

// Circuit breaker options
const options = {
    timeout: 5000, // 5 seconds
    errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
    resetTimeout: 30000, // Try again after 30 seconds
    rollingCountTimeout: 10000, // 10 second rolling window
    rollingCountBuckets: 10,
    name: 'gowaApiBreaker',
};

/**
 * Create circuit breaker for a function
 * @param {Function} fn - Function to wrap
 * @param {string} name - Breaker name
 * @returns {CircuitBreaker} Circuit breaker instance
 */
function createBreaker(fn, name = 'default') {
    const breaker = new CircuitBreaker(fn, {
        ...options,
        name,
    });

    // Event listeners
    breaker.on('open', () => {
        logger.error(`Circuit breaker opened: ${name}`);
    });

    breaker.on('halfOpen', () => {
        logger.warn(`Circuit breaker half-open: ${name}`);
    });

    breaker.on('close', () => {
        logger.info(`Circuit breaker closed: ${name}`);
    });

    breaker.on('fallback', (result) => {
        logger.warn(`Circuit breaker fallback executed: ${name}`, { result });
    });

    // Fallback function
    breaker.fallback(() => {
        return {
            success: false,
            error: 'Service temporarily unavailable. Please try again later.',
            circuitOpen: true,
        };
    });

    return breaker;
}

/**
 * Get circuit breaker stats
 * @param {CircuitBreaker} breaker - Breaker instance
 * @returns {Object} Stats
 */
function getStats(breaker) {
    const stats = breaker.stats;
    return {
        name: breaker.name,
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        failures: stats.failures,
        successes: stats.successes,
        rejects: stats.rejects,
        timeouts: stats.timeouts,
        fallbacks: stats.fallbacks,
        fires: stats.fires,
    };
}

module.exports = {
    createBreaker,
    getStats,
    options,
};
