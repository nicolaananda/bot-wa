// Session Fix for WhatsApp Bot
// Prevents "No sessions" errors from crashing the bot

const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor() {
    this.sessionPath = path.join(__dirname, 'session');
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  // Check if session directory exists and has files
  checkSession() {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        console.log('⚠️  Session directory not found, creating...');
        fs.mkdirSync(this.sessionPath, { recursive: true });
        return false;
      }

      const files = fs.readdirSync(this.sessionPath);
      const hasSessionFiles = files.some(file => 
        file.endsWith('.json') || 
        file.endsWith('.txt') || 
        file.includes('creds')
      );

      if (!hasSessionFiles) {
        console.log('⚠️  No session files found');
        return false;
      }

      console.log('✅ Session files found');
      return true;
    } catch (error) {
      console.log('❌ Error checking session:', error.message);
      return false;
    }
  }

  // Clear session directory
  clearSession() {
    try {
      if (fs.existsSync(this.sessionPath)) {
        const files = fs.readdirSync(this.sessionPath);
        files.forEach(file => {
          const filePath = path.join(this.sessionPath, file);
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
        console.log('✅ Session cleared successfully');
      }
    } catch (error) {
      console.log('❌ Error clearing session:', error.message);
    }
  }

  // Create minimal session structure
  createMinimalSession() {
    try {
      const minimalCreds = {
        noiseKey: { private: Buffer.alloc(32), public: Buffer.alloc(32) },
        signedIdentityKey: { private: Buffer.alloc(32), public: Buffer.alloc(32) },
        signedPreKey: { private: Buffer.alloc(32), public: Buffer.alloc(32) },
        registrationId: 0,
        advSignedIdentityKey: { private: Buffer.alloc(32), public: Buffer.alloc(32) },
        processedHistoryMessages: [],
        nextPreKeyId: 0,
        firstUnuploadedPreKeyId: 0,
        account: { unregistered: true }
      };

      const credsPath = path.join(this.sessionPath, 'creds.json');
      fs.writeFileSync(credsPath, JSON.stringify(minimalCreds, null, 2));
      
      console.log('✅ Minimal session created');
      return true;
    } catch (error) {
      console.log('❌ Error creating minimal session:', error.message);
      return false;
    }
  }

  // Main fix function
  async fixSession() {
    console.log('🔧 Starting session fix...');
    
    if (this.checkSession()) {
      console.log('✅ Session appears to be valid');
      return true;
    }

    console.log('⚠️  Session invalid, attempting to fix...');
    
    // Clear existing session
    this.clearSession();
    
    // Create minimal session
    if (this.createMinimalSession()) {
      console.log('✅ Session fix completed');
      return true;
    } else {
      console.log('❌ Session fix failed');
      return false;
    }
  }

  // Monitor and auto-fix session issues
  startMonitoring() {
    console.log('🔍 Starting session monitoring...');
    
    setInterval(() => {
      if (!this.checkSession()) {
        console.log('⚠️  Session check failed, attempting auto-fix...');
        this.fixSession();
      }
    }, 30000); // Check every 30 seconds
  }
}

// Export for use in main.js
module.exports = SessionManager;

// Run if called directly
if (require.main === module) {
  const sessionManager = new SessionManager();
  sessionManager.fixSession().then(success => {
    if (success) {
      console.log('🎯 Session fix completed successfully!');
      console.log('📱 Please restart your bot now');
    } else {
      console.log('💥 Session fix failed, manual intervention required');
    }
  });
} 