#!/usr/bin/env node

// VPS Fix for WhatsApp Bot SessionError
// Specifically designed for VPS environments

const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

console.log('🚀 VPS WhatsApp Bot Session Fix');
console.log('='.repeat(50));

class VPSFixer {
  constructor() {
    this.projectPath = __dirname;
    this.sessionPath = path.join(this.projectPath, 'session');
    this.nodeModulesPath = path.join(this.projectPath, 'node_modules');
  }

  // Check if running on VPS/Linux
  isVPS() {
    return process.platform === 'linux' || process.platform === 'darwin';
  }

  // Get system info
  getSystemInfo() {
    try {
      if (this.isVPS()) {
        const nodeVersion = execSync('node --version').toString().trim();
        const npmVersion = execSync('npm --version').toString().trim();
        const osInfo = execSync('uname -a').toString().trim();
        
        console.log(`🖥️  OS: ${osInfo}`);
        console.log(`📦 Node.js: ${nodeVersion}`);
        console.log(`📦 NPM: ${npmVersion}`);
        
        return { nodeVersion, npmVersion, osInfo };
      } else {
        console.log('🖥️  Running on Windows');
        return null;
      }
    } catch (error) {
      console.log('⚠️  Could not get system info:', error.message);
      return null;
    }
  }

  // Kill all node processes
  killNodeProcesses() {
    try {
      if (this.isVPS()) {
        console.log('🔄 Killing existing node processes...');
        execSync('pkill -f "node.*bot-wa" || true');
        execSync('pkill -f "node.*main.js" || true');
        console.log('✅ Node processes killed');
      } else {
        console.log('🔄 Killing existing node processes on Windows...');
        execSync('taskkill /f /im node.exe || true');
        console.log('✅ Node processes killed');
      }
    } catch (error) {
      console.log('⚠️  Error killing processes:', error.message);
    }
  }

  // Clear session completely
  clearSession() {
    try {
      console.log('🗑️  Clearing session directory...');
      
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
            console.log(`  🗑️  Deleted: ${file}`);
          } catch (err) {
            console.log(`  ⚠️  Could not delete: ${file}`);
          }
        });
      }
      
      // Create fresh session directory
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
      }
      
      console.log('✅ Session directory cleared and recreated');
    } catch (error) {
      console.log('❌ Error clearing session:', error.message);
    }
  }

  // Fix libsignal issues
  fixLibsignal() {
    try {
      console.log('🔧 Fixing libsignal issues...');
      
      const libsignalPath = path.join(this.nodeModulesPath, 'libsignal');
      if (!fs.existsSync(libsignalPath)) {
        console.log('⚠️  Libsignal not found in node_modules');
        return false;
      }

      // Backup original libsignal
      const backupPath = libsignalPath + '.backup';
      if (!fs.existsSync(backupPath)) {
        execSync(`cp -r "${libsignalPath}" "${backupPath}"`);
        console.log('✅ Libsignal backed up');
      }

      // Try to reinstall libsignal
      console.log('🔄 Reinstalling libsignal...');
      execSync('npm uninstall libsignal', { stdio: 'pipe' });
      execSync('npm install libsignal', { stdio: 'pipe' });
      
      console.log('✅ Libsignal reinstalled');
      return true;
    } catch (error) {
      console.log('❌ Error fixing libsignal:', error.message);
      return false;
    }
  }

  // Clean npm cache and reinstall
  cleanAndReinstall() {
    try {
      console.log('🧹 Cleaning npm cache...');
      execSync('npm cache clean --force', { stdio: 'pipe' });
      
      console.log('🗑️  Removing node_modules...');
      if (fs.existsSync(this.nodeModulesPath)) {
        fs.rmSync(this.nodeModulesPath, { recursive: true, force: true });
      }
      
      console.log('📦 Reinstalling dependencies...');
      execSync('npm install', { stdio: 'pipe' });
      
      console.log('✅ Dependencies reinstalled');
      return true;
    } catch (error) {
      console.log('❌ Error reinstalling dependencies:', error.message);
      return false;
    }
  }

  // Create emergency session
  createEmergencySession() {
    try {
      console.log('🚨 Creating emergency session...');
      
      const emergencyCreds = {
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
      fs.writeFileSync(credsPath, JSON.stringify(emergencyCreds, null, 2));
      
      console.log('✅ Emergency session created');
      return true;
    } catch (error) {
      console.log('❌ Error creating emergency session:', error.message);
      return false;
    }
  }

  // Main fix function
  async runFix() {
    console.log('\n🔧 Starting VPS fix process...\n');
    
    // Get system info
    this.getSystemInfo();
    
    // Kill existing processes
    this.killNodeProcesses();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Clear session
    this.clearSession();
    
    // Try to fix libsignal
    if (!this.fixLibsignal()) {
      console.log('⚠️  Libsignal fix failed, trying clean reinstall...');
      this.cleanAndReinstall();
    }
    
    // Create emergency session
    this.createEmergencySession();
    
    console.log('\n🎯 VPS fix completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Start your bot: npm start');
    console.log('2. Scan QR code or use pairing code');
    console.log('3. Test with a group message');
    
    return true;
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new VPSFixer();
  fixer.runFix().catch(error => {
    console.log('💥 Fix failed:', error.message);
    process.exit(1);
  });
}

module.exports = VPSFixer; 