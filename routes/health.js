const express = require('express');
const logger = require('../config/logger');

const router = express.Router();

/**
 * Health check endpoint
 * Returns system health status
 */
router.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        checks: {},
    };

    try {
        // Check Redis
        health.checks.redis = await checkRedis();

        // Check PostgreSQL
        health.checks.postgres = await checkPostgres();

        // Check GOWA API
        health.checks.gowa = await checkGowa();

        // Determine overall status
        const allHealthy = Object.values(health.checks).every(
            (check) => check.status === 'ok'
        );

        health.status = allHealthy ? 'ok' : 'degraded';

        const statusCode = allHealthy ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        logger.error('Health check failed', { error: error.message });

        health.status = 'error';
        health.error = error.message;

        res.status(503).json(health);
    }
});

/**
 * Check Redis connection
 */
async function checkRedis() {
    try {
        const redis = require('../config/redis');
        await redis.ping();

        return {
            status: 'ok',
            message: 'Redis connection healthy',
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message,
        };
    }
}

/**
 * Check PostgreSQL connection
 */
async function checkPostgres() {
    try {
        const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';

        if (!usePg) {
            return {
                status: 'disabled',
                message: 'PostgreSQL not enabled',
            };
        }

        const pg = require('../config/postgres');
        await pg.query('SELECT 1');

        return {
            status: 'ok',
            message: 'PostgreSQL connection healthy',
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message,
        };
    }
}

/**
 * Check GOWA API
 */
async function checkGowa() {
    try {
        // Simple check - just verify env vars are set
        if (!process.env.GOWA_API_URL) {
            return {
                status: 'error',
                message: 'GOWA_API_URL not configured',
            };
        }

        return {
            status: 'ok',
            message: 'GOWA API configured',
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message,
        };
    }
}

/**
 * Metrics endpoint
 * Returns system metrics
 */
router.get('/metrics', (req, res) => {
    const metrics = {
        timestamp: new Date().toISOString(),
        process: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
        },
        system: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
        },
    };

    res.json(metrics);
});

module.exports = router;
