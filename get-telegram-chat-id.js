#!/usr/bin/env node
/**
 * Script to join Telegram group and get chat ID
 * Usage: TELEGRAM_BOT_TOKEN="your_token" TELEGRAM_GROUP_LINK="https://t.me/+..." node join-telegram-group.js
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '5150179603:AAEhyyNdaXxtmLQR8WDY1OAEYmfuctBZNuA';
const GROUP_LINK = process.env.TELEGRAM_GROUP_LINK || 'https://t.me/+EyxW2mCWK_5iNDQ1';

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Telegram Group Chat ID Finder\n');
console.log('Bot Token:', BOT_TOKEN.substring(0, 20) + '...');
console.log('Group Link:', GROUP_LINK);
console.log('\n📝 Instructions:');
console.log('1. Make sure the bot is added to the group');
console.log('2. Send any message to the group (e.g., /start or just "test")');
console.log('3. The chat ID will be displayed below\n');
console.log('─'.repeat(50));
console.log('🔍 Listening for messages...\n');

bot.on('message', (msg) => {
    console.log(`\n📩 Message received!`);
    console.log(`   Chat ID: ${msg.chat.id}`);
    console.log(`   Chat Type: ${msg.chat.type}`);
    console.log(`   Chat Title: ${msg.chat.title || 'N/A'}`);
    console.log(`   From: ${msg.from.first_name} (@${msg.from.username || 'N/A'})`);
    console.log(`   Message: ${msg.text || 'N/A'}`);
    console.log(`\n💡 Add this to your .env file:`);
    console.log(`   TELEGRAM_CHAT_ID=${msg.chat.id}`);
    console.log(`\n✅ You can now press Ctrl+C to exit\n`);
});

bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.message);
});

console.log('Press Ctrl+C to exit');
