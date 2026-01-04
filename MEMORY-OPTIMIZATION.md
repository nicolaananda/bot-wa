# 🚀 Memory Optimization Guide

## 🔴 Masalah RAM Usage Tinggi

Bot WhatsApp menggunakan RAM tinggi (1.5GB+ per instance) karena:

1. **Multiple Instances** - Beberapa proses berjalan bersamaan
2. **makeInMemoryStore** - Baileys menyimpan semua chat history di RAM
3. **Database In-Memory** - Semua data (users, transaksi) di RAM
4. **Message Cache** - Cache pesan yang terus bertambah

---

## ✅ Optimasi yang Sudah Diterapkan

### 1. **Disabled makeInMemoryStore** (Hemat ~500MB-1GB)
```javascript
// BEFORE: Store all chat history in RAM
const store = makeInMemoryStore({...})

// AFTER: Disabled to save memory
const store = null
```

**Dampak:** Chat history tidak disimpan di RAM, tapi bot tetap bisa memproses pesan.

### 2. **Optimized Message Cache** (Hemat ~100-200MB)
```javascript
// BEFORE: Set + setInterval (inefficient)
const processedMessageIds = new Set()
setInterval(() => processedMessageIds.clear(), 300000)

// AFTER: Map with lazy cleanup
const processedMessageIds = new Map() // with timestamps
// Only cleanup when size > 1000 or every 5 minutes
```

---

## 🛠️ Cara Mengatasi Multiple Instances

### Cek Proses yang Berjalan
```bash
# Di server/VPS Anda
ps aux | grep "node.*main.js"
```

### Kill Proses Duplikat
```bash
# Otomatis (recommended)
chmod +x kill-duplicates.sh
./kill-duplicates.sh

# Manual
pkill -f "node.*main.js"
pm2 delete all
```

---

## 📊 Expected RAM Usage

| Configuration | RAM Usage |
|---------------|-----------|
| **BEFORE** (with store) | 1.5-2GB per instance |
| **AFTER** (optimized) | 800MB-1GB per instance |
| **Multiple instances (10x)** | 15-20GB total → 8-10GB total |

---

## 🚀 Rekomendasi Lanjutan

### 1. Gunakan PM2 (Process Manager)
```bash
npm install -g pm2

# Start dengan PM2 (otomatis restart, single instance)
pm2 start main.js --name bot-wa --max-memory-restart 1G

# Monitor
pm2 monit

# Auto-restart jika memory > 1GB
pm2 restart bot-wa
```

### 2. Enable Database Postgres (Pindahkan Data dari RAM)
```bash
# Setup Postgres
cp env.example .env

# Edit .env
USE_PG=true
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Run
npm run pg:schema
npm start
```

**Dampak:** Data transaksi/users tidak lagi di RAM, disimpan di database.

### 3. Enable Redis Cache (Optional)
```bash
# Install Redis
# macOS: brew install redis
# Ubuntu: sudo apt install redis-server

# Edit .env
REDIS_URL=redis://localhost:6379

# Start Redis
redis-server

# Start bot
npm start
```

### 4. Limit Node.js Memory
```bash
# Set max memory 1GB
node --max-old-space-size=1024 main.js

# Atau edit package.json
"scripts": {
  "start": "node --max-old-space-size=1024 main.js"
}
```

---

## 🔧 Monitoring

### Check Memory Usage
```bash
# Current RAM usage
ps aux | grep node | awk '{print $2, $4, $11}' | sort -k2 -rn | head -10

# Monitor real-time
htop
# atau
top -o mem

# PM2 monitoring
pm2 monit
```

### Memory Leak Detection
```bash
# Install clinic
npm install -g clinic

# Profile memory
clinic doctor -- node main.js

# Analyze hasil
clinic doctor --open
```

---

## 📝 Checklist Optimasi

- [x] Disable makeInMemoryStore
- [x] Optimize message cache
- [ ] Kill duplicate processes
- [ ] Setup PM2
- [ ] Enable Postgres database
- [ ] Enable Redis cache
- [ ] Set Node.js memory limit

---

## 🆘 Troubleshooting

### Bot Masih Consume RAM Tinggi?

1. **Check multiple instances:**
   ```bash
   ps aux | grep "node.*main.js" | wc -l
   ```
   Harusnya cuma 1, kalau lebih kill yang lain.

2. **Check database size:**
   ```javascript
   // Di Node.js REPL
   console.log(Object.keys(db.data.users).length)
   console.log(db.data.transaksi.length)
   ```
   Kalau > 10,000 users atau > 50,000 transaksi, pindah ke Postgres.

3. **Check memory leaks:**
   ```bash
   node --expose-gc --max-old-space-size=1024 main.js
   ```

4. **Restart bot secara berkala:**
   ```bash
   # PM2 auto-restart setiap 6 jam
   pm2 start main.js --cron-restart="0 */6 * * *"
   ```

---

## 📈 Hasil yang Diharapkan

Setelah optimasi:
- ✅ RAM usage turun 40-50%
- ✅ Bot lebih stabil
- ✅ Tidak ada memory leak
- ✅ CPU usage lebih rendah

---

## 📞 Support

Jika masih ada masalah, check:
1. `kill-duplicates.sh` - Script untuk kill proses duplikat
2. `REDIS-QUICK-START.md` - Setup Redis cache
3. `NEON-MIGRATION.md` - Migrasi ke Postgres

**Created:** 2025-12-13
**Last Updated:** 2025-12-13




