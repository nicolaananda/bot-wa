require("./setting.js");
const fs = require("fs");

/**
 * Script untuk cek status user dan unblock jika perlu
 * Usage: node check-user-status.js 6281234567890
 */

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.log("❌ Mohon masukkan nomor WhatsApp!");
  console.log("📝 Contoh: node check-user-status.js 6281234567890");
  process.exit(1);
}

// Clean phone number (remove non-numeric characters)
const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
const jid = cleanNumber + '@s.whatsapp.net';

console.log(`\n🔍 Checking status untuk: ${cleanNumber}\n`);

// Check if user is in owner list
const isOwnerNumber = owner.includes(cleanNumber);
console.log(`👑 Owner Status: ${isOwnerNumber ? '✅ YA (Owner)' : '❌ Bukan owner'}`);

// Load database
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';

if (!usePg) {
  // JSON mode
  const dbPath = './options/database.json';
  if (!fs.existsSync(dbPath)) {
    console.log("❌ Database file tidak ditemukan!");
    process.exit(1);
  }

  try {
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log('\n📊 Database Status:');
    
    // Check users data
    if (dbData.users && dbData.users[jid]) {
      const userData = dbData.users[jid];
      console.log(`✅ User ditemukan di database`);
      console.log(`   - Saldo: Rp${userData.saldo || 0}`);
      console.log(`   - Role: ${userData.role || 'Bronze'}`);
      console.log(`   - Limit: ${userData.limit || 0}`);
      console.log(`   - Status: ${userData.status || 'normal'}`);
    } else {
      console.log(`⚠️  User TIDAK ditemukan di database (akan dibuat otomatis saat pertama kali interaksi)`);
    }

    // Check transaksi history
    if (dbData.transaksi && Array.isArray(dbData.transaksi)) {
      const userTransaksi = dbData.transaksi.filter(t => 
        t.user === cleanNumber || 
        t.buyer === cleanNumber ||
        (t.targetNumber && t.targetNumber === cleanNumber)
      );
      console.log(`\n📦 Riwayat Transaksi: ${userTransaksi.length} transaksi`);
      if (userTransaksi.length > 0) {
        console.log(`   - Transaksi terakhir: ${userTransaksi[userTransaksi.length - 1].date || 'N/A'}`);
      }
    }

    console.log('\n');
    
  } catch (err) {
    console.error("❌ Error membaca database:", err.message);
    process.exit(1);
  }
} else {
  console.log('\n⚠️  Database menggunakan PostgreSQL mode');
  console.log('   Gunakan script lain untuk cek PG database\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n💡 SOLUSI JIKA BOT TIDAK MERESPON:\n');
console.log('1. Unblock user dengan command:');
console.log(`   .unblock ${cleanNumber}\n`);
console.log('2. Restart bot:');
console.log(`   pm2 restart <app-name>\n`);
console.log('3. Test dengan command sederhana:');
console.log(`   .ping atau .menu\n`);
console.log('4. Cek apakah user memang terblokir di WhatsApp:');
console.log(`   - Buka chat dengan user`);
console.log(`   - Lihat apakah ada notifikasi "blocked"`);
console.log(`   - Gunakan command .unblock jika perlu\n`);
console.log('5. Jika masih tidak bisa, coba hapus session dan re-login:\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Selesai!');

