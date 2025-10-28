require("./setting.js");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@dappaoffc/baileys");
const pino = require('pino');

/**
 * Script untuk unblock user secara langsung
 * Usage: node fix-unblock-user.js 6281234567890
 */

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.log("❌ Mohon masukkan nomor WhatsApp!");
  console.log("📝 Contoh: node fix-unblock-user.js 6281234567890");
  process.exit(1);
}

const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
const jid = cleanNumber + '@s.whatsapp.net';

console.log(`\n🔓 Memulai proses unblock untuk: ${cleanNumber}\n`);

async function unblockUser() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'open') {
        console.log('✅ Terhubung ke WhatsApp');
        console.log(`🔓 Melakukan unblock untuk ${cleanNumber}...`);
        
        try {
          await sock.updateBlockStatus(jid, 'unblock');
          console.log(`✅ Berhasil unblock ${cleanNumber}`);
          console.log(`\n💡 Silakan coba chat bot lagi dari nomor: ${cleanNumber}`);
          console.log(`   Contoh command: .ping atau .menu\n`);
        } catch (err) {
          console.error(`❌ Error saat unblock:`, err.message);
          console.log(`\n⚠️  Kemungkinan user tidak di-block atau sudah unblocked sebelumnya\n`);
        }
        
        process.exit(0);
      }
      
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('❌ Koneksi terputus:', lastDisconnect?.error, '\nReconnecting:', shouldReconnect);
        if (!shouldReconnect) {
          console.log('\n⚠️  Session tidak valid. Silakan scan QR code lagi di bot utama.\n');
          process.exit(1);
        }
      }
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Set timeout untuk otomatis exit jika tidak connect dalam 30 detik
setTimeout(() => {
  console.log('\n⚠️  Timeout: Tidak dapat terhubung ke WhatsApp dalam 30 detik');
  console.log('   Pastikan bot utama sedang berjalan atau coba restart bot\n');
  process.exit(1);
}, 30000);

unblockUser();

