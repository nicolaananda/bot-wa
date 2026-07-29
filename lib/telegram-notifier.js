const TelegramBot = require('node-telegram-bot-api');

// Initialize bot
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

let bot = null;

// Initialize bot if token is available
if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: false });
        console.log('✅ [TELEGRAM] Bot initialized successfully');
    } catch (error) {
        console.error('❌ [TELEGRAM] Failed to initialize bot:', error.message);
    }
} else {
    // Optional integration: stay silent when credentials are incomplete.
}

/**
 * Send payment notification to Telegram group
 * @param {Object} paymentData - Payment information
 * @param {number} paymentData.amount - Total payment amount
 * @param {string} paymentData.phoneNumber - Customer phone number
 * @param {string} paymentData.orderId - Order ID (optional)
 * @param {string} paymentData.type - Transaction type (deposit/buy-now)
 * @returns {Promise<boolean>} Success status
 */
async function sendPaymentNotification(paymentData) {
    if (!bot || !CHAT_ID) {
        return false;
    }

    try {
        const { amount, phoneNumber, orderId, type = 'payment' } = paymentData;

        // Format amount dengan thousand separator
        const formattedAmount = new Intl.NumberFormat('id-ID').format(amount);

        // Format phone number (remove @s.whatsapp.net if exists)
        const formattedPhone = phoneNumber.replace('@s.whatsapp.net', '');

        // Build message
        const emoji = type === 'deposit' ? '💰' : '🛒';
        const typeLabel = type === 'deposit' ? 'DEPOSIT' : 'PEMBELIAN';

        let message = `${emoji} *PEMBAYARAN BERHASIL*\n\n`;
        message += `📊 *Jenis:* ${typeLabel}\n`;
        message += `💵 *Total:* Rp ${formattedAmount}\n`;
        message += `📱 *No HP:* ${formattedPhone}\n`;

        if (orderId) {
            message += `🔖 *Order ID:* ${orderId}\n`;
        }

        message += `\n⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

        // Send message
        await bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
        console.log(`✅ [TELEGRAM] Payment notification sent: Rp${formattedAmount} - ${formattedPhone}`);

        return true;
    } catch (error) {
        console.error('❌ [TELEGRAM] Failed to send notification:', error.message);
        return false;
    }
}

/**
 * Get chat ID from group (helper function for setup)
 * This function will log the chat ID when bot receives any message
 */
function getChatId() {
    if (!bot) {
        console.error('❌ [TELEGRAM] Bot not initialized');
        return;
    }

    console.log('🔍 [TELEGRAM] Listening for messages to get chat ID...');
    console.log('   Send any message to the group where you added the bot');

    bot.on('message', (msg) => {
        console.log(`\n📩 [TELEGRAM] Message received!`);
        console.log(`   Chat ID: ${msg.chat.id}`);
        console.log(`   Chat Type: ${msg.chat.type}`);
        console.log(`   Chat Title: ${msg.chat.title || 'N/A'}`);
        console.log(`\n💡 Add this to your environment variables:`);
        console.log(`   TELEGRAM_CHAT_ID=${msg.chat.id}\n`);
    });
}

module.exports = {
    sendPaymentNotification,
    getChatId
};
