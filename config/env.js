const Joi = require('joi');

// Define environment variable schema
const envSchema = Joi.object({
    // Node Environment
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),

    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'http', 'debug')
        .default('info'),

    // Database Configuration
    USE_PG: Joi.string()
        .valid('true', 'false')
        .default('false'),

    PG_HOST: Joi.string()
        .when('USE_PG', { is: 'true', then: Joi.required() }),

    PG_PORT: Joi.number()
        .default(5432),

    PG_DATABASE: Joi.string()
        .when('USE_PG', { is: 'true', then: Joi.required() }),

    PG_USER: Joi.string()
        .when('USE_PG', { is: 'true', then: Joi.required() }),

    PG_PASSWORD: Joi.string()
        .when('USE_PG', { is: 'true', then: Joi.required() }),

    // Redis Configuration
    REDIS_URL: Joi.string()
        .uri()
        .default('redis://localhost:6379'),

    // WhatsApp API (GOWA)
    GOWA_API_URL: Joi.string()
        .uri()
        .required(),

    GOWA_USERNAME: Joi.string()
        .required(),

    GOWA_PASSWORD: Joi.string()
        .required(),

    // Midtrans
    MIDTRANS_SERVER_KEY: Joi.string()
        .optional(),

    MIDTRANS_CLIENT_KEY: Joi.string()
        .optional(),

    MIDTRANS_IS_PRODUCTION: Joi.string()
        .valid('true', 'false')
        .default('false'),

    // Cloudflare R2
    R2_ACCOUNT_ID: Joi.string()
        .optional(),

    R2_ACCESS_KEY_ID: Joi.string()
        .optional(),

    R2_SECRET_ACCESS_KEY: Joi.string()
        .optional(),

    // Telegram
    TELEGRAM_BOT_TOKEN: Joi.string()
        .optional(),

    TELEGRAM_CHAT_ID: Joi.string()
        .optional(),

    // Bot Configuration
    OWNER_NUMBER: Joi.string()
        .required(),

    // Rate Limiting
    WA_SEND_MIN_INTERVAL_MS: Joi.number()
        .default(800),

    WA_SEND_RETRIES: Joi.number()
        .default(3),

    // Application
    PORT: Joi.number()
        .default(3000),
})
    .unknown(true); // Allow other env vars

// Validate environment variables
const { error, value: validatedEnv } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false,
});

if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join('\n');
    throw new Error(`❌ Environment validation failed:\n${errorMessages}`);
}

// Export validated environment
module.exports = validatedEnv;
