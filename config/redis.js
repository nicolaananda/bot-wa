const Redis = require('ioredis');
require('dotenv').config();

/**
 * Redis Client Configuration
 * 
 * Supports:
 * - Upstash Redis (recommended for production)
 * - Local Redis (for development)
 * - Redis Cloud
 * 
 * Environment Variables:
 * - REDIS_URL: Full Redis connection URL (priority)
 * - REDIS_HOST: Redis host (default: localhost)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (optional)
 * - REDIS_TLS: Enable TLS (true/false, default: false)
 */

let redis = null;

function createRedisClient() {
  try {
    // Option 1: Use REDIS_URL (for Upstash, Redis Cloud, etc)
    if (process.env.REDIS_URL) {
      console.log('📡 [REDIS] Connecting using REDIS_URL...');
      redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 5,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
        retryStrategy: (times) => {
          const delay = Math.min(times * 100, 5000);
          console.log(`🔄 [REDIS] Retry attempt ${times}, delay: ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          console.log(`🔄 [REDIS] Reconnecting on error: ${err.message}`);
          return err.message.includes('READONLY') || err.message.includes('ECONNRESET');
        }
      });
    }
    // Option 2: Use individual config (for local Redis)
    else {
      const config = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      };

      // Add TLS if enabled
      if (process.env.REDIS_TLS === 'true') {
        config.tls = {};
      }

      console.log(`📡 [REDIS] Connecting to ${config.host}:${config.port}...`);
      redis = new Redis(config);
    }

    // Connection event handlers
    redis.on('connect', () => {
      console.log('✅ [REDIS] Connected successfully');
    });

    redis.on('ready', () => {
      console.log('🚀 [REDIS] Ready to accept commands');
    });

    redis.on('error', (err) => {
      console.error('❌ [REDIS] Connection error:', err.message);
    });

    redis.on('close', () => {
      console.log('⚠️ [REDIS] Connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('🔄 [REDIS] Reconnecting...');
    });

    return redis;
  } catch (error) {
    console.error('❌ [REDIS] Failed to create client:', error);
    return null;
  }
}

// Initialize Redis client
redis = createRedisClient();

/**
 * Get Redis client instance
 * @returns {Redis|null} Redis client or null if not connected
 */
function getRedis() {
  return redis;
}

/**
 * Check if Redis is available
 * @returns {boolean} True if Redis is connected and ready
 */
async function isRedisAvailable() {
  if (!redis) {
    console.log('⚠️ [REDIS] Client not initialized');
    return false;
  }
  
  try {
    const result = await redis.ping();
    if (result === 'PONG') {
      console.log('✅ [REDIS] Health check passed');
      return true;
    }
    return false;
  } catch (error) {
    console.log(`❌ [REDIS] Health check failed: ${error.message}`);
    return false;
  }
}

/**
 * Graceful shutdown
 */
async function closeRedis() {
  if (redis) {
    console.log('🔌 [REDIS] Closing connection...');
    await redis.quit();
    console.log('✅ [REDIS] Connection closed gracefully');
  }
}

// Export functions
module.exports = {
  redis,
  getRedis,
  isRedisAvailable,
  closeRedis
};

