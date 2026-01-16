#!/usr/bin/env node
/**
 * Get Telegram Chat ID without polling (no conflict)
 * Just use the Telegram API directly
 */

require('dotenv').config();
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '5150179603:AAEhyyNdaXxtmLQR8WDY1OAEYmfuctBZNuA';

console.log('🤖 Telegram Chat ID Getter (No Polling)\n');
console.log('📝 Instructions:');
console.log('1. Send a message to your Telegram group that mentions the bot');
console.log('   Example: @ghzmku_bot test');
console.log('   Or send a command: /start@ghzmku_bot');
console.log('2. Then run this script\n');
console.log('─'.repeat(50));
console.log('🔍 Fetching recent messages...\n');

const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=100`;

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const response = JSON.parse(data);

            if (!response.ok) {
                console.error('❌ Error:', response.description);
                return;
            }

            const updates = response.result;

            if (updates.length === 0) {
                console.log('⚠️  No messages found.');
                console.log('\n💡 Make sure you have sent a message that mentions the bot:');
                console.log('   @ghzmku_bot test');
                console.log('   or: /start@ghzmku_bot');
                return;
            }

            console.log(`✅ Found ${updates.length} recent messages\n`);

            // Find group chats
            const groups = new Map();

            updates.forEach((update) => {
                if (update.message && update.message.chat) {
                    const chat = update.message.chat;
                    if (chat.type === 'group' || chat.type === 'supergroup') {
                        groups.set(chat.id, {
                            id: chat.id,
                            title: chat.title,
                            type: chat.type
                        });
                    }
                }
            });

            if (groups.size === 0) {
                console.log('⚠️  No group chats found in recent messages.');
                console.log('\n💡 Send a message to the group that mentions the bot:');
                console.log('   @ghzmku_bot test');
                return;
            }

            console.log('📱 Group Chats Found:\n');

            groups.forEach((group) => {
                console.log(`   Title: ${group.title}`);
                console.log(`   Chat ID: ${group.id}`);
                console.log(`   Type: ${group.type}`);
                console.log('');
            });

            // If only one group, show the env variable
            if (groups.size === 1) {
                const group = Array.from(groups.values())[0];
                console.log('─'.repeat(50));
                console.log('\n💡 Add this to your .env file:\n');
                console.log(`TELEGRAM_CHAT_ID=${group.id}`);
                console.log('');
            }

        } catch (error) {
            console.error('❌ Error parsing response:', error.message);
        }
    });
}).on('error', (error) => {
    console.error('❌ Network error:', error.message);
});
