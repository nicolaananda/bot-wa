#!/usr/bin/env node
/**
 * Test script untuk Telegram notification
 * Mengirim test notification ke grup
 */

require('dotenv').config();
const { sendPaymentNotification } = require('./lib/telegram-notifier');

console.log('🧪 Testing Telegram Payment Notification\n');

// Test data
const testPayment = {
    amount: 50123,
    phoneNumber: '628123456789',
    orderId: 'TEST-' + Date.now(),
    type: 'deposit'
};

console.log('📤 Sending test notification...');
console.log('   Amount:', testPayment.amount);
console.log('   Phone:', testPayment.phoneNumber);
console.log('   Order ID:', testPayment.orderId);
console.log('   Type:', testPayment.type);
console.log('');

sendPaymentNotification(testPayment)
    .then((success) => {
        if (success) {
            console.log('✅ Test notification sent successfully!');
            console.log('   Check your Telegram group "Payment Listener"');
        } else {
            console.log('⚠️  Notification failed (check logs above)');
        }
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
