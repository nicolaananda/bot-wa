const crypto = require('crypto');
const { getRedis } = require('../config/redis');

/**
 * Redis Helper Functions for Bot WA
 * 
 * Features:
 * 1. Transaction Locking (prevent race condition)
 * 2. Rate Limiting (prevent spam)
 * 3. Caching (faster response)
 */

// ============================================
// 1. TRANSACTION LOCKING
// ============================================

function isRedisReady(redis) {
  return Boolean(redis && redis.status === 'ready');
}

/**
 * Acquire lock for a user transaction
 * @param {string} sender - User JID
 * @param {string} operation - Operation name (e.g., 'buy', 'buynow')
 * @param {number} ttlSeconds - Lock expiry time (default: 30s)
 * @returns {Promise<string|null>} Opaque ownership token, or null if already locked
 */
async function acquireLock(sender, operation = 'transaction', ttlSeconds = 30) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    console.warn('⚠️ [LOCK] Redis not available, proceeding without lock');
    return crypto.randomBytes(32).toString('hex');
  }

  try {
    const lockKey = `lock:${operation}:${sender}`;
    const token = crypto.randomBytes(32).toString('hex');
    const result = await redis.set(lockKey, token, 'NX', 'EX', ttlSeconds);

    if (result === 'OK') {
      console.log(`🔒 [LOCK] Acquired lock for ${sender} on ${operation}`);
      return token;
    } else {
      console.log(`⚠️ [LOCK] Lock already exists for ${sender} on ${operation}`);
      return null;
    }
  } catch (error) {
    console.error('❌ [LOCK] Error acquiring lock:', error);
    return crypto.randomBytes(32).toString('hex'); // Fail open
  }
}

/**
 * Release lock for a user transaction
 * @param {string} sender - User JID
 * @param {string} operation - Operation name
 * @param {string} token - Opaque ownership token returned by acquireLock
 * @returns {Promise<boolean>} True if this owner released the lock
 */
async function releaseLock(sender, operation = 'transaction', token) {
  const redis = getRedis();
  if (!isRedisReady(redis) || !token) {
    return false;
  }

  try {
    const lockKey = `lock:${operation}:${sender}`;
    const result = await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      token
    );
    return result === 1;
  } catch (error) {
    console.error('❌ [LOCK] Error releasing lock:', error);
    return false;
  }
}

/**
 * Check if lock exists
 * @param {string} sender - User JID
 * @param {string} operation - Operation name
 * @returns {Promise<boolean>} True if locked
 */
async function isLocked(sender, operation = 'transaction') {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    return false;
  }

  try {
    const lockKey = `lock:${operation}:${sender}`;
    const exists = await redis.exists(lockKey);
    return exists === 1;
  } catch (error) {
    console.error('❌ [LOCK] Error checking lock:', error);
    return false;
  }
}

// ============================================
// 2. RATE LIMITING
// ============================================

/**
 * Check and increment rate limit for user
 * @param {string} sender - User JID
 * @param {string} command - Command name
 * @param {number} maxRequests - Max requests allowed (default: 5)
 * @param {number} windowSeconds - Time window in seconds (default: 60)
 * @returns {Promise<{allowed: boolean, remaining: number, resetIn: number}>}
 */
async function checkRateLimit(sender, command, maxRequests = 5, windowSeconds = 60) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    // Redis not available, allow all requests
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }

  try {
    const rateLimitKey = `ratelimit:${sender}:${command}`;
    const current = await redis.incr(rateLimitKey);
    
    if (current === 1) {
      // First request, set expiry
      await redis.expire(rateLimitKey, windowSeconds);
    }
    
    const ttl = await redis.ttl(rateLimitKey);
    const remaining = Math.max(0, maxRequests - current);
    const allowed = current <= maxRequests;
    
    if (!allowed) {
      console.log(`🚫 [RATELIMIT] User ${sender} exceeded limit for ${command} (${current}/${maxRequests})`);
    }
    
    return {
      allowed,
      remaining,
      resetIn: ttl > 0 ? ttl : 0,
      current
    };
  } catch (error) {
    console.error('❌ [RATELIMIT] Error checking rate limit:', error);
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }
}

/**
 * Reset rate limit for user (admin use)
 * @param {string} sender - User JID
 * @param {string} command - Command name
 * @returns {Promise<boolean>}
 */
async function resetRateLimit(sender, command) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    return true;
  }

  try {
    const rateLimitKey = `ratelimit:${sender}:${command}`;
    await redis.del(rateLimitKey);
    console.log(`🔄 [RATELIMIT] Reset rate limit for ${sender} on ${command}`);
    return true;
  } catch (error) {
    console.error('❌ [RATELIMIT] Error resetting rate limit:', error);
    return false;
  }
}

// ============================================
// 3. CACHING
// ============================================

/**
 * Get cached data
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached data or null
 */
async function getCache(key) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    return null;
  }

  try {
    const data = await redis.get(key);
    if (data) {
      console.log(`✅ [CACHE] Cache HIT for key: ${key}`);
      return JSON.parse(data);
    } else {
      console.log(`❌ [CACHE] Cache MISS for key: ${key}`);
      return null;
    }
  } catch (error) {
    console.error('❌ [CACHE] Error getting cache:', error);
    return null;
  }
}

/**
 * Set cached data
 * @param {string} key - Cache key
 * @param {any} value - Data to cache
 * @param {number} ttlSeconds - TTL in seconds (default: 300 = 5 minutes)
 * @returns {Promise<boolean>}
 */
async function setCache(key, value, ttlSeconds = 300) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttlSeconds, serialized);
    console.log(`💾 [CACHE] Cached key: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error('❌ [CACHE] Error setting cache:', error);
    return false;
  }
}

/**
 * Delete cached data
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
async function deleteCache(key) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    return true;
  }

  try {
    await redis.del(key);
    console.log(`🗑️ [CACHE] Deleted cache key: ${key}`);
    return true;
  } catch (error) {
    console.error('❌ [CACHE] Error deleting cache:', error);
    return false;
  }
}

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Cache key pattern (e.g., 'produk:*')
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateCachePattern(pattern) {
  const redis = getRedis();
  if (!isRedisReady(redis)) {
    return 0;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️ [CACHE] Invalidated ${keys.length} keys matching: ${pattern}`);
      return keys.length;
    }
    return 0;
  } catch (error) {
    console.error('❌ [CACHE] Error invalidating cache pattern:', error);
    return 0;
  }
}

// ============================================
// 4. HELPER FUNCTIONS
// ============================================

/**
 * Get or set cache (cache-aside pattern)
 * @param {string} key - Cache key
 * @param {Function} loader - Function to load data if cache miss
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<any>}
 */
async function cacheAside(key, loader, ttlSeconds = 300) {
  const cached = await getCache(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss, load from source
  const data = await loader();
  await setCache(key, data, ttlSeconds);
  return data;
}

// Export all functions
module.exports = {
  // Locking
  acquireLock,
  releaseLock,
  isLocked,
  
  // Rate Limiting
  checkRateLimit,
  resetRateLimit,
  
  // Caching
  getCache,
  setCache,
  deleteCache,
  invalidateCachePattern,
  cacheAside
};

