const fs = require('fs');
const path = require('path');

console.log('🔄 WhatsApp Bot Session Reset Tool');
console.log('='.repeat(40));

const sessionPath = path.join(__dirname, 'session');

try {
  // Clear session directory
  if (fs.existsSync(sessionPath)) {
    const files = fs.readdirSync(sessionPath);
    if (files.length === 0) {
      console.log('ℹ️  Session directory is already empty');
    } else {
      files.forEach(file => {
        const filePath = path.join(sessionPath, file);
        try {
          if (fs.lstatSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          console.log(`🗑️  Deleted: ${file}`);
        } catch (err) {
          console.log(`⚠️  Could not delete: ${file}`);
        }
      });
      console.log('✅ Session directory cleared successfully');
    }
  } else {
    console.log('ℹ️  Session directory does not exist');
  }
  
  console.log('\n📋 Next Steps:');
  console.log('1. Stop the bot (Ctrl+C) if it\'s running');
  console.log('2. Run: npm start');
  console.log('3. Scan QR code or use pairing code');
  console.log('4. Bot should now work with groups!');
  
} catch (error) {
  console.log('❌ Error:', error.message);
} 