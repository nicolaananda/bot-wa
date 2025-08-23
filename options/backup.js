const fs = require('fs');
const path = require('path');

// Fungsi untuk backup database
function backupDatabase() {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    const backupPath = path.join(__dirname, `database_backup_${Date.now()}.json`);
    
    if (fs.existsSync(dbPath)) {
      const dbContent = fs.readFileSync(dbPath, 'utf8');
      fs.writeFileSync(backupPath, dbContent, 'utf8');
      console.log(`Database backup created: ${backupPath}`);
      
      // Hapus backup lama (lebih dari 7 hari)
      const files = fs.readdirSync(__dirname);
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      files.forEach(file => {
        if (file.startsWith('database_backup_') && file.endsWith('.json')) {
          const filePath = path.join(__dirname, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtime.getTime() > sevenDays) {
            fs.unlinkSync(filePath);
            console.log(`Old backup removed: ${file}`);
          }
        }
      });
    }
  } catch (error) {
    console.error('Error creating backup:', error);
  }
}

// Backup setiap 1 jam
setInterval(backupDatabase, 60 * 60 * 1000);

// Backup saat startup
backupDatabase();

module.exports = { backupDatabase }; 