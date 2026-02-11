// Global test setup
// This file runs before all tests

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.PG_HOST = 'localhost';
process.env.PG_DATABASE = 'bot_wa_test';

// Global test timeout
jest.setTimeout(10000);

// Suppress console output during tests (optional)
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
