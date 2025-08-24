/**
 * Auto Backup Script - WhatsApp Bot
 * Script ini akan backup database otomatis sebelum aplikasi start
 */

const fs = require('fs');
const path = require('path');

class AutoBackup {
  constructor() {
    this.dbPath = path.join(__dirname, 'options', 'database.json');
    this.backupDir = path.join(__dirname, 'backups');
    this.maxBackups = 10; // Keep only 10 latest backups
  }

  // Create backup directory if not exists
  createBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`📁 Created backup directory: ${this.backupDir}`);
    }
  }

  // Check if database exists
  databaseExists() {
    return fs.existsSync(this.dbPath);
  }

  // Get database size
  getDatabaseSize() {
    try {
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  // Check if database is valid JSON
  isDatabaseValid() {
    try {
      const content = fs.readFileSync(this.dbPath, 'utf8');
      JSON.parse(content);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Create backup
  createBackup() {
    try {
      if (!this.databaseExists()) {
        console.log('⚠️  Database file not found, skipping backup');
        return null;
      }

      // Check if database is valid
      if (!this.isDatabaseValid()) {
        console.log('⚠️  Database file is corrupted, skipping backup');
        return null;
      }

      // Check database size
      const dbSize = this.getDatabaseSize();
      if (dbSize === 0) {
        console.log('⚠️  Database file is empty, skipping backup');
        return null;
      }

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `database_backup_${timestamp}.json`);
      
      // Read database content
      const dbContent = fs.readFileSync(this.dbPath, 'utf8');
      
      // Create backup
      fs.writeFileSync(backupFile, dbContent, 'utf8');
      
      // Verify backup
      const backupContent = fs.readFileSync(backupFile, 'utf8');
      if (backupContent !== dbContent) {
        throw new Error('Backup verification failed');
      }

      console.log(`✅ Database backed up: ${backupFile} (${(dbSize / 1024).toFixed(2)} KB)`);
      
      // Clean old backups
      this.cleanOldBackups();
      
      return backupFile;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      return null;
    }
  }

  // Clean old backups (keep only latest 10)
  cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('database_backup_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          time: fs.statSync(path.join(this.backupDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Sort by time, newest first

      // Remove old backups if more than maxBackups
      if (files.length > this.maxBackups) {
        const filesToRemove = files.slice(this.maxBackups);
        filesToRemove.forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`🗑️  Removed old backup: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('❌ Clean old backups failed:', error.message);
    }
  }

  // Restore from latest backup
  restoreFromBackup() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        console.log('❌ No backup directory found');
        return false;
      }

      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('database_backup_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          time: fs.statSync(path.join(this.backupDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Sort by time, newest first

      if (files.length === 0) {
        console.log('❌ No backup files found');
        return false;
      }

      const latestBackup = files[0];
      console.log(`📥 Restoring from backup: ${latestBackup.name}`);

      // Read backup content
      const backupContent = fs.readFileSync(latestBackup.path, 'utf8');
      
      // Verify backup is valid JSON
      try {
        JSON.parse(backupContent);
      } catch (error) {
        console.error('❌ Backup file is corrupted');
        return false;
      }

      // Create current database backup before restore
      if (this.databaseExists()) {
        const currentBackup = path.join(this.backupDir, `database_before_restore_${Date.now()}.json`);
        fs.writeFileSync(currentBackup, fs.readFileSync(this.dbPath, 'utf8'), 'utf8');
        console.log(`📁 Current database backed up before restore: ${currentBackup}`);
      }

      // Restore database
      fs.writeFileSync(this.dbPath, backupContent, 'utf8');
      console.log(`✅ Database restored successfully from: ${latestBackup.name}`);

      return true;
    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      return false;
    }
  }

  // List all backups
  listBackups() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        console.log('❌ No backup directory found');
        return [];
      }

      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('database_backup_') && file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: (stats.size / 1024).toFixed(2),
            date: stats.mtime.toISOString(),
            path: filePath
          };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      console.log(`📊 Found ${files.length} backup files:`);
      files.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name} (${file.size} KB) - ${file.date}`);
      });

      return files;
    } catch (error) {
      console.error('❌ List backups failed:', error.message);
      return [];
    }
  }

  // Check database health
  checkDatabaseHealth() {
    try {
      if (!this.databaseExists()) {
        console.log('❌ Database file not found');
        return false;
      }

      const dbSize = this.getDatabaseSize();
      if (dbSize === 0) {
        console.log('❌ Database file is empty');
        return false;
      }

      if (!this.isDatabaseValid()) {
        console.log('❌ Database file is corrupted');
        return false;
      }

      // Try to parse database content
      const content = fs.readFileSync(this.dbPath, 'utf8');
      const data = JSON.parse(content);

      // Check basic structure
      const hasUsers = data.users && typeof data.users === 'object';
      const hasTransaksi = data.transaksi && Array.isArray(data.transaksi);
      const hasProduk = data.produk && typeof data.produk === 'object';

      console.log(`📊 Database health check:`);
      console.log(`  ✅ File exists: ${this.dbPath}`);
      console.log(`  ✅ File size: ${(dbSize / 1024).toFixed(2)} KB`);
      console.log(`  ✅ Valid JSON: Yes`);
      console.log(`  ✅ Has users: ${hasUsers ? 'Yes' : 'No'}`);
      console.log(`  ✅ Has transaksi: ${hasTransaksi ? 'Yes' : 'No'}`);
      console.log(`  ✅ Has produk: ${hasProduk ? 'Yes' : 'No'}`);

      if (hasUsers) {
        console.log(`  📊 Users count: ${Object.keys(data.users).length}`);
      }
      if (hasTransaksi) {
        console.log(`  📊 Transactions count: ${data.transaksi.length}`);
      }

      return hasUsers && hasTransaksi && hasProduk;
    } catch (error) {
      console.error('❌ Database health check failed:', error.message);
      return false;
    }
  }
}

// CLI Interface
function showHelp() {
  console.log(`
🔧 Auto Backup Script - WhatsApp Bot

Usage: node auto-backup.js [command]

Commands:
  backup                    - Create backup before starting app
  restore                   - Restore from latest backup
  list                      - List all backups
  health                    - Check database health
  help                      - Show this help

Examples:
  node auto-backup.js backup
  node auto-backup.js restore
  node auto-backup.js list
  node auto-backup.js health
`);
}

// Main execution
async function main() {
  const backup = new AutoBackup();
  const args = process.argv.slice(2);
  const command = args[0] || 'backup';

  try {
    switch (command) {
      case 'backup':
        backup.createBackupDir();
        backup.createBackup();
        break;
      
      case 'restore':
        backup.restoreFromBackup();
        break;
      
      case 'list':
        backup.listBackups();
        break;
      
      case 'health':
        backup.checkDatabaseHealth();
        break;
      
      case 'help':
        showHelp();
        break;
      
      default:
        console.log(`❌ Unknown command: ${command}`);
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ Command execution failed:', error.message);
  }
}

// Export for use as module
module.exports = AutoBackup;

// Run if called directly
if (require.main === module) {
  main();
} 