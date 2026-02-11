const logger = require('../config/logger');

/**
 * Error handling middleware
 * Catches and handles errors from command execution
 * @returns {Function} Middleware function
 */
function errorHandler() {
    return async (context, next) => {
        try {
            await next();
        } catch (error) {
            const { sender, command, from } = context;

            // Log error with context
            logger.error('Command execution failed', {
                error: error.message,
                stack: error.stack,
                sender,
                command,
                from,
            });

            // Send user-friendly error message
            let errorMessage = '❌ *Terjadi kesalahan*\n\n';

            // Handle specific error types
            if (error.message.includes('Insufficient balance')) {
                errorMessage += '💰 Saldo Anda tidak mencukupi.\n';
                errorMessage += 'Silakan top up terlebih dahulu.';
            } else if (error.message.includes('Insufficient stock')) {
                errorMessage += '📦 Stok produk tidak mencukupi.\n';
                errorMessage += 'Silakan coba lagi nanti.';
            } else if (error.message.includes('Product') && error.message.includes('not found')) {
                errorMessage += '🔍 Produk tidak ditemukan.\n';
                errorMessage += 'Silakan cek daftar produk dengan *stok*.';
            } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                errorMessage += '🌐 Koneksi terputus.\n';
                errorMessage += 'Silakan coba lagi dalam beberapa saat.';
            } else {
                errorMessage += 'Silakan coba lagi atau hubungi admin jika masalah berlanjut.';
            }

            return context.reply(errorMessage);
        }
    };
}

module.exports = errorHandler;
