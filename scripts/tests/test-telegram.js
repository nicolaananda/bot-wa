#!/usr/bin/env node
/**
 * Simple test to verify Telegram bot is working
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

console.log('🧪 Testing Telegram Bot Connection\n');
console.log('Bot Token:', BOT_TOKEN ? BOT_TOKEN.substring(0, 20) + '...' : 'NOT SET');

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('\n✅ Bot initialized');
console.log('📡 Listening for messages...');
console.log('\nSend any message to the bot or group, and it will be displayed here.\n');
console.log('─'.repeat(50));

bot.on('message', (msg) => {
    console.log('\n📩 Message received!');
    console.log('   Chat ID:', msg.chat.id);
    console.log('   Chat Type:', msg.chat.type);
    console.log('   Chat Title:', msg.chat.title || 'N/A');
    console.log('   From:', msg.from.first_name, `(@${msg.from.username || 'N/A'})`);
    console.log('   Text:', msg.text || '[non-text message]');

    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        console.log('\n💡 This is a group chat! Add this to your .env:');
        console.log(`   TELEGRAM_CHAT_ID=${msg.chat.id}`);
    }

    console.log('\n' + '─'.repeat(50));
});

bot.on('polling_error', (error) => {
    console.error('\n❌ Polling error:', error.code || error.message);
    if (error.code === 'EFATAL') {
        console.error('   This usually means the bot token is invalid or there\'s a network issue.');
        console.error('   Please check your TELEGRAM_BOT_TOKEN in .env file.');
    }
});

console.log('\nPress Ctrl+C to exit');
