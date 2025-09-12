const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');

async function testMessageDelivery() {
    console.log('🧪 Testing WhatsApp Message Delivery...\n');
    
    try {
        // Initialize WhatsApp connection (same as main bot)
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const ronzz = makeWASocket({
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ["Bot WhatsApp", "Safari", "1.0.0"],
            auth: state
        });

        ronzz.ev.on('creds.update', saveCreds);

        // Wait for connection
        await new Promise((resolve, reject) => {
            ronzz.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    if (!shouldReconnect) {
                        reject(new Error('Logged out'));
                    }
                } else if (connection === 'open') {
                    console.log('✅ WhatsApp connected successfully');
                    resolve();
                }
            });
        });

        // Test message to customer (replace with actual customer number from logs)
        const testCustomerNumber = '6281234567890@s.whatsapp.net'; // Replace this with actual customer number
        
        console.log('📤 Sending test message to customer...');
        console.log('📞 Customer number:', testCustomerNumber);
        
        // Test 1: Simple message
        try {
            const result1 = await ronzz.sendMessage(testCustomerNumber, { 
                text: '🧪 Test Message 1: Simple text - Apakah pesan ini sampai?' 
            });
            console.log('✅ Test 1 sent - Result:', result1 ? 'Success' : 'No result');
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Test 2: Formatted message (similar to account details)
            const testMessage = `*📦 TEST AKUN PEMBELIAN*

*Produk:* VIDIO SHARING 3USER  
*Tanggal:* 12 September 2025
*Jam:* 18:19:49 WIB

*═══ AKUN 1 ═══*
📧 Email: test@example.com
🔐 Password: testpassword123
👤 Profil: TestProfile
🔢 Pin: 1234
🔒 2FA: ABCD1234

*⚠️ PENTING:*
• Ini adalah pesan test
• Jika Anda menerima pesan ini, sistem berfungsi normal
• Hubungi admin jika ada masalah`;

            const result2 = await ronzz.sendMessage(testCustomerNumber, { text: testMessage });
            console.log('✅ Test 2 sent - Result:', result2 ? 'Success' : 'No result');
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Test 3: Check if number is valid
            try {
                const numberInfo = await ronzz.onWhatsApp(testCustomerNumber.replace('@s.whatsapp.net', ''));
                console.log('📱 Number validation:', numberInfo.length > 0 ? 'Valid WhatsApp number' : 'Invalid number');
                if (numberInfo.length > 0) {
                    console.log('📱 Number details:', numberInfo[0]);
                }
            } catch (validationError) {
                console.error('❌ Number validation failed:', validationError.message);
            }
            
        } catch (error) {
            console.error('❌ Test message failed:', error.message);
            console.error('❌ Full error:', error);
        }

        // Test message to owner (should work)
        console.log('\n📤 Sending test message to owner...');
        try {
            const ownerResult = await ronzz.sendMessage('6281389592985@s.whatsapp.net', { 
                text: '🧪 Test Message: Owner test - sistem message delivery check' 
            });
            console.log('✅ Owner test sent - Result:', ownerResult ? 'Success' : 'No result');
        } catch (ownerError) {
            console.error('❌ Owner test failed:', ownerError.message);
        }

        console.log('\n🏁 Test completed. Check WhatsApp messages to verify delivery.');
        
        // Close connection
        await ronzz.end();
        
    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
        console.error('❌ Full error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    testMessageDelivery();
}

module.exports = testMessageDelivery; 