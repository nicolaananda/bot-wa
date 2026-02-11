module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Coverage configuration
    collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/coverage/**',
        '!**/options/sticker/**',
        '!eslint.config.js',
        '!jest.config.js',
    ],

    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 30,
            functions: 30,
            lines: 30,
            statements: 30,
        },
    },

    // Test match patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js',
    ],

    // Setup files
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

    // Module paths
    modulePaths: ['<rootDir>'],

    // Timeout
    testTimeout: 10000,

    // Verbose output
    verbose: true,
};
