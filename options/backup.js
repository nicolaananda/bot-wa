const fs = require('fs');
const path = require('path');

// Fungsi untuk backup database
function backupDatabase() {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    const dbTrashPath = path.join(__dirname, 'db_trash');
    
    // Buat folder db_trash jika belum ada
    if (!fs.existsSync(dbTrashPath)) {
      fs.mkdirSync(dbTrashPath, { recursive: true });
    }
    
    const backupPath = path.join(dbTrashPath, `database_backup_${Date.now()}.json`);
    
    if (fs.existsSync(dbPath)) {
      const dbContent = fs.readFileSync(dbPath, 'utf8');
      fs.writeFileSync(backupPath, dbContent, 'utf8');
      console.log(`Database backup created: ${backupPath}`);
      
      // Hapus backup lama (lebih dari 7 hari) dari folder db_trash
      const files = fs.readdirSync(dbTrashPath);
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      files.forEach(file => {
        if (file.startsWith('database_backup_') && file.endsWith('.json')) {
          const filePath = path.join(dbTrashPath, file);
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