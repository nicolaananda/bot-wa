# 🛡️ Database Protection Guide - WhatsApp Bot

## 🚨 **Masalah: Database Reset Saat npm run start**

### **Penyebab:**
Database.json Anda ter-reset saat `npm run start` karena ada kode di `main.js` yang auto-initialize database dengan data kosong saat startup.

### **Lokasi Masalah:**
File: `main.js` (Line 40-55)
```javascript
// Kode bermasalah yang menyebabkan database reset
if (!db.data.list) db.data.list = []
if (!db.data.users) db.data.users = {}
if (!db.data.transaksi) db.data.transaksi = []
// ... dan seterusnya
```

## ✅ **Solusi yang Sudah Diimplementasikan**

### **1. Fix Auto-Initialization di main.js**
- ✅ Menambahkan komentar untuk mencegah overwrite data
- ✅ Menambahkan logging database status
- ✅ Database structure hanya di-initialize jika kosong

### **2. Auto Backup Script (auto-backup.js)**
- ✅ Backup otomatis sebelum aplikasi start
- ✅ Restore dari backup jika database kosong
- ✅ Health check database
- ✅ Cleanup backup lama (max 10 files)

### **3. Safe Startup Scripts**
- ✅ `start-safe.sh` - Script bash untuk startup aman
- ✅ `npm run start-safe` - NPM script untuk startup aman
- ✅ Auto-backup sebelum start aplikasi

## 🚀 **Cara Menggunakan Solusi**

### **1. Start Aplikasi dengan Safe Mode**
```bash
# Cara paling aman
npm run start-safe

# Atau gunakan script bash
chmod +x start-safe.sh
./start-safe.sh
```

### **2. Manual Backup dan Restore**
```bash
# Backup database
npm run backup

# Restore dari backup
npm run restore

# List semua backup
npm run backup-list

# Check database health
npm run backup-health
```

### **3. Backup Otomatis**
```bash
# Script akan auto-backup sebelum start
npm run start-safe
```

## 📋 **Workflow Aman untuk Edit Database**

### **Step 1: Stop Aplikasi**
```bash
# Stop semua aplikasi
pm2 stop all
# atau
pkill -f "node"
```

### **Step 2: Backup Manual**
```bash
# Backup sebelum edit
npm run backup

# Atau backup manual
cp options/database.json backups/database_manual_backup_$(date +%Y%m%d_%H%M%S).json
```

### **Step 3: Edit Database**
```bash
# Edit dengan editor yang aman
nano options/database.json
# atau
vim options/database.json
```

### **Step 4: Test dan Start**
```bash
# Check database health
npm run backup-health

# Start dengan safe mode
npm run start-safe
```

## 🔧 **Troubleshooting**

### **Database Ter-reset Lagi:**
```bash
# 1. Check apakah ada backup
npm run backup-list

# 2. Restore dari backup terbaru
npm run restore

# 3. Check database health
npm run backup-health

# 4. Start dengan safe mode
npm run start-safe
```

### **Backup Gagal:**
```bash
# 1. Check permission
ls -la options/database.json
ls -la backups/

# 2. Check disk space
df -h

# 3. Check file corruption
npm run backup-health
```

### **Restore Gagal:**
```bash
# 1. Check backup files
ls -la backups/

# 2. Check backup validity
cat backups/database_backup_*.json | head -5

# 3. Manual restore
cp backups/database_backup_*.json options/database.json
```

## 📊 **Monitoring Database**

### **Check Database Status:**
```bash
# Check size dan content
ls -la options/database.json
wc -l options/database.json

# Check JSON validity
node -e "console.log(JSON.parse(require('fs').readFileSync('options/database.json', 'utf8')).users ? 'Valid' : 'Invalid')"
```

### **Check Backup Status:**
```bash
# List semua backup
npm run backup-list

# Check backup directory
ls -la backups/
du -sh backups/
```

## 🚨 **Yang TIDAK BOLEH Dilakukan**

- ❌ Edit database saat aplikasi running
- ❌ Hapus file database.json
- ❌ Rename file database
- ❌ Restart aplikasi tanpa backup
- ❌ Ignore warning backup gagal

## ✅ **Yang BOLEH Dilakukan**

- ✅ Backup sebelum edit manual
- ✅ Stop aplikasi sebelum edit
- ✅ Gunakan safe startup script
- ✅ Monitor database health
- ✅ Restore dari backup jika ada masalah

## 🔄 **Auto-Backup Schedule**

### **Backup Otomatis:**
- ✅ **Before Start**: Setiap kali aplikasi start
- ✅ **Manual**: Setiap kali edit database
- ✅ **Recovery**: Jika database kosong/corrupt

### **Backup Retention:**
- ✅ **Latest 10**: Keep 10 backup terbaru
- ✅ **Auto Cleanup**: Hapus backup lama otomatis
- ✅ **Size Check**: Skip backup jika database kosong

## 📞 **Emergency Recovery**

### **Jika Semua Backup Gagal:**
```bash
# 1. Stop aplikasi
pm2 stop all

# 2. Check git history
git log --follow -- options/database.json

# 3. Recover dari git
git show <commit-hash>:options/database.json > options/database.json

# 4. Start dengan safe mode
npm run start-safe
```

### **Jika Database Corrupt:**
```bash
# 1. Check corruption
npm run backup-health

# 2. Restore dari backup
npm run restore

# 3. Validate restore
npm run backup-health

# 4. Start aplikasi
npm run start-safe
```

## 🎯 **Keuntungan Solusi Ini**

1. **🛡️ Database Protection**: Tidak akan ter-reset lagi
2. **💾 Auto Backup**: Backup otomatis sebelum start
3. **🔄 Auto Recovery**: Restore otomatis jika ada masalah
4. **📊 Health Monitoring**: Check database status
5. **🚀 Safe Startup**: Start aplikasi dengan aman
6. **🗑️ Cleanup**: Auto cleanup backup lama

## 📋 **Checklist Implementasi**

- [ ] ✅ Fix auto-initialization di main.js
- [ ] ✅ Install auto-backup script
- [ ] ✅ Update package.json scripts
- [ ] ✅ Test backup functionality
- [ ] ✅ Test restore functionality
- [ ] ✅ Test safe startup
- [ ] ✅ Monitor database health

---

**Status:** ✅ IMPLEMENTED  
**Last Updated:** $(date)  
**Maintainer:** System Administrator  
**Next Review:** 2024-02-15 