const Joi = require('joi');
const logger = require('../config/logger');

/**
 * Validation middleware
 * Validates command arguments using Joi schemas
 */
class ValidationMiddleware {
    /**
     * Validate command arguments
     * @param {Object} schema - Joi schema
     * @returns {Function} Middleware function
     */
    static validate(schema) {
        return async (context, next) => {
            const { args, q } = context;

            try {
                const { error, value } = schema.validate(
                    { args, q },
                    { abortEarly: false }
                );

                if (error) {
                    const errors = error.details.map((detail) => detail.message).join('\n');

                    logger.warn('Validation failed', {
                        command: context.command,
                        errors,
                    });

                    return context.reply(`❌ *Validasi Gagal*\n\n${errors}`);
                }

                // Attach validated data to context
                context.validated = value;

                await next();
            } catch (err) {
                logger.error('Validation error', {
                    error: err.message,
                    command: context.command,
                });

                return context.reply('❌ Terjadi kesalahan saat validasi input');
            }
        };
    }

    /**
     * Common validation schemas
     */
    static schemas = {
        // Product ID validation
        productId: Joi.object({
            args: Joi.array().min(1).required(),
            q: Joi.string().required(),
        }),

        // Product ID + Quantity validation
        productWithQuantity: Joi.object({
            args: Joi.array().min(2).required(),
            q: Joi.string()
                .pattern(/^[a-zA-Z0-9]+\s+\d+$/)
                .required()
                .messages({
                    'string.pattern.base': 'Format: <produk> <jumlah>',
                }),
        }),

        // User ID + Amount validation
        userWithAmount: Joi.object({
            args: Joi.array().min(2).required(),
            q: Joi.string()
                .pattern(/^@?\d+\s+\d+$/)
                .required()
                .messages({
                    'string.pattern.base': 'Format: <nomor> <jumlah>',
                }),
        }),

        // Text message validation
        textMessage: Joi.object({
            q: Joi.string().min(1).required().messages({
                'string.empty': 'Pesan tidak boleh kosong',
                'string.min': 'Pesan terlalu pendek',
            }),
        }),
    };
}

module.exports = ValidationMiddleware;
