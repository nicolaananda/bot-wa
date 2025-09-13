const fs = require('fs')
const path = require('path')
const moment = require('moment-timezone')

// Auto backup system
const backupInterval = (global.jamBackup || 12) * 60 * 60 * 1000; // Convert hours to milliseconds

function createBackup() {
  try {
    const backupDir = path.join(__dirname, '../backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const timestamp = moment().tz('Asia/Jakarta').format('YYYY-MM-DD_HH-mm-ss')
    const backupFile = path.join(backupDir, `database_backup_${timestamp}.json`)
    
    const dbPath = path.join(__dirname, '../../options/database.json')
    if (fs.existsSync(dbPath)) {
      const dbData = fs.readFileSync(dbPath)
      fs.writeFileSync(backupFile, dbData)
      console.log(`✅ Backup created: ${backupFile}`)
      
      // Keep only last 10 backups
      cleanOldBackups(backupDir)
    }
  } catch (error) {
    console.error('❌ Backup failed:', error.message)
  }
}

function cleanOldBackups(backupDir) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('database_backup_'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time)
    
    // Keep only the 10 most recent backups
    if (files.length > 10) {
      const filesToDelete = files.slice(10)
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path)
        console.log(`🗑️ Deleted old backup: ${file.name}`)
      })
    }
  } catch (error) {
    console.error('❌ Failed to clean old backups:', error.message)
  }
}

// Start auto backup
setInterval(createBackup, backupInterval)
console.log(`🔄 Auto backup scheduled every ${global.jamBackup || 12} hours`)

module.exports = { createBackup, cleanOldBackups } 