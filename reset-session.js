const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🔄 Resetting WhatsApp Bot Session...');

// Path to session directory
const sessionPath = path.join(__dirname, 'session');

// Function to clear session directory
function clearSession() {
  try {
    if (fs.existsSync(sessionPath)) {
      const files = fs.readdirSync(sessionPath);
      files.forEach(file => {
        const filePath = path.join(sessionPath, file);
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      });
      console.log('✅ Session directory cleared');
    } else {
      console.log('ℹ️  Session directory does not exist, creating...');
      fs.mkdirSync(sessionPath, { recursive: true });
    }
  } catch (error) {
    console.log('❌ Error clearing session:', error.message);
  }
}

// Function to restart the bot
function restartBot() {
  console.log('🚀 Restarting bot...');
  
  // Kill existing node processes (be careful with this in production)
  exec('taskkill /f /im node.exe', (error) => {
    if (error) {
      console.log('ℹ️  No existing node processes to kill');
    } else {
      console.log('✅ Killed existing node processes');
    }
    
    // Wait a bit then start the bot
    setTimeout(() => {
      console.log('🎯 Starting bot with fresh session...');
      exec('npm start', (error, stdout, stderr) => {
        if (error) {
          console.log('❌ Error starting bot:', error.message);
          return;
        }
        if (stderr) {
          console.log('⚠️  Bot stderr:', stderr);
        }
        console.log('✅ Bot started successfully!');
        console.log('📱 Please scan the QR code or use pairing code to authenticate');
      });
    }, 2000);
  });
}

// Main execution
async function main() {
  console.log('='.repeat(50));
  console.log('🔧 WhatsApp Bot Session Reset Tool');
  console.log('='.repeat(50));
  
  clearSession();
  
  console.log('\n⏳ Waiting 3 seconds before restart...');
  setTimeout(() => {
    restartBot();
  }, 3000);
}

// Run the script
main().catch(console.error); 