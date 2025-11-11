# 🚀 Migrasi PostgreSQL ke Neon.tech

## Kenapa Neon?
- ✅ 100% PostgreSQL compatible (zero code changes)
- ✅ Scale to zero = hemat biaya
- ✅ Branching untuk testing
- ✅ Auto backups & point-in-time recovery
- ✅ Built-in connection pooling
- ✅ Free tier generous (0.5GB storage, 100 hours compute)

## 📋 Checklist Persiapan

### 1. Backup Data Existing
```bash
# Backup current Postgres database
pg_dump -U bot_wa -h localhost -d bot_wa -F c -f backup_before_neon.dump

# Atau pakai script backup yang ada
npm run backup
```

### 2. Sign Up Neon (FREE)
1. Go to: https://neon.tech
2. Sign up dengan GitHub (instant approval)
3. Create new project: `bot-wa-production`

### 3. Get Neon Connection Strings
Setelah create project, Neon kasih 2 connection strings:

**Connection String (Direct):**
```
postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

**Connection String (Pooled):** ⭐ **Use this for bot**
```
postgresql://username:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

## 🔄 Migration Steps

### Step 1: Update Environment Variables

Edit `.env` file Anda:

```bash
# ===== NEON POSTGRESQL CONFIGURATION =====
USE_PG=true

# Ganti dengan Neon pooled connection string
PG_HOST=ep-xxx-pooler.region.aws.neon.tech
PG_PORT=5432
PG_DATABASE=neondb
PG_USER=your_neon_username
PG_PASSWORD=your_neon_password

# ATAU pakai connection string langsung (lebih mudah):
# DATABASE_URL=postgresql://username:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Pool settings (Neon sudah handle pooling, tapi ini untuk local client)
PG_POOL_MAX=10
PG_IDLE_TIMEOUT_MS=30000
PG_CONN_TIMEOUT_MS=15000
PG_STATEMENT_TIMEOUT_MS=60000
PG_KEEPALIVE=true
PG_WARMUP_CONNECTIONS=3
PG_QUERY_RETRIES=2
PG_UPSERT_CHUNK=100
```

### Step 2: Apply Schema ke Neon

```bash
# Deploy schema.sql ke Neon
npm run pg:schema
```

Output yang diharapkan:
```
[PG] warmup completed
Schema applied
```

### Step 3: Migrate Data

**Opsi A: Dari JSON backup** (kalau pakai database-fs.js sebelumnya)
```bash
# Migrate dari JSON ke Neon
npm run pg:migrate
```

**Opsi B: Dari PostgreSQL existing** (kalau sudah pakai Postgres)
```bash
# Restore dari dump
pg_restore -U neon_user -h ep-xxx.region.aws.neon.tech -d neondb backup_before_neon.dump

# Atau pakai psql
psql "postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require" -f backup.sql
```

**Opsi C: Manual via Neon Console**
1. Go to Neon dashboard
2. Click "SQL Editor"
3. Paste & run migration SQL

### Step 4: Verify Migration

```bash
# Test koneksi ke Neon
node -e "
require('dotenv').config();
const { query } = require('./config/postgres');
(async () => {
  try {
    // Test query
    const result = await query('SELECT COUNT(*) as total_users FROM users');
    console.log('✅ Connected to Neon!');
    console.log('Total users:', result.rows[0].total_users);
    
    const result2 = await query('SELECT COUNT(*) as total_transaksi FROM transaksi');
    console.log('Total transaksi:', result2.rows[0].total_transaksi);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
})();
"
```

### Step 5: Start Bot dengan Neon

```bash
# Start bot (otomatis connect ke Neon)
npm start
```

## 🎯 Post-Migration Optimization

### 1. Enable Connection Pooling di Neon
Neon dashboard → Settings → Connection Pooling:
- Mode: **Transaction** (recommended untuk bot)
- Pool size: **10-20**

### 2. Setup Autoscaling
Neon dashboard → Compute:
- Min compute: **0.25 vCPU** (scale to zero)
- Max compute: **1 vCPU** (burst saat traffic tinggi)

### 3. Setup Branching untuk Development

```bash
# Install Neon CLI
npm install -g neonctl

# Login
neonctl auth

# Create dev branch dari production
neonctl branches create --name development --parent main

# Get dev connection string
neonctl connection-string development

# Update .env.development
DATABASE_URL_DEV=postgresql://...development-pooler...
```

## 🔍 Monitoring & Troubleshooting

### Check Neon Metrics
Neon Dashboard → Monitoring:
- Query performance
- Connection count
- Storage usage
- Auto-scaling events

### Common Issues

**Issue 1: Connection timeout**
```bash
# Pastikan SSL required
PG_SSL=true

# Atau tambahkan di connection string
?sslmode=require
```

**Issue 2: Too many connections**
```bash
# Pakai pooled endpoint, bukan direct
# ✅ ep-xxx-pooler.region.aws.neon.tech
# ❌ ep-xxx.region.aws.neon.tech
```

**Issue 3: Slow queries**
```bash
# Enable query logging
PG_SLOW_MS=300

# Check di Neon dashboard → Query tab
```

## 💡 Pro Tips

### 1. Use Neon for Different Environments

```bash
# Production
DATABASE_URL=postgresql://...@ep-prod-pooler.neon.tech/neondb

# Staging (branch dari production)
DATABASE_URL_STAGING=postgresql://...@ep-staging-pooler.neon.tech/neondb

# Development (local atau branch)
DATABASE_URL_DEV=postgresql://...@ep-dev-pooler.neon.tech/neondb
```

### 2. Auto Backup Script

```javascript
// neon-backup.js
require('dotenv').config();
const { execSync } = require('child_process');

const NEON_URL = process.env.DATABASE_URL;
const BACKUP_FILE = `neon-backup-${Date.now()}.sql`;

execSync(`pg_dump "${NEON_URL}" > ./backups/${BACKUP_FILE}`, { stdio: 'inherit' });
console.log(`✅ Backup created: ${BACKUP_FILE}`);
```

Add to package.json:
```json
{
  "scripts": {
    "backup:neon": "node neon-backup.js"
  }
}
```

### 3. Health Check Endpoint

```javascript
// Add to your Express app
app.get('/health/db', async (req, res) => {
  try {
    const result = await query('SELECT 1 as health_check');
    res.json({ 
      status: 'healthy', 
      database: 'neon',
      connection: 'ok',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: err.message 
    });
  }
});
```

## 📊 Cost Optimization

### Neon Free Tier Limits
- ✅ 0.5 GB storage
- ✅ 100 hours compute/month
- ✅ Unlimited projects
- ✅ 7 days point-in-time recovery

### When to Upgrade ($19/month Pro)
- Storage > 0.5GB
- Need > 100 hours compute
- Need 30 days backup retention
- Need read replicas

### Estimasi untuk Bot WA
- Bot aktif ~12 jam/hari = ~360 hours/month
- Dengan scale-to-zero: **~100 hours active compute**
- Storage: ~200MB (users + transaksi + produk)
- **Result: FREE tier is enough!** 🎉

## 🚀 Advanced: Read Replicas (Optional)

Kalau dashboard WA Anda heavy reads:

```javascript
// config/neon.js
const { Pool } = require('pg');

// Primary (writes)
const primaryPool = new Pool({
  connectionString: process.env.DATABASE_URL, // main branch
});

// Replica (reads - dashboard)
const replicaPool = new Pool({
  connectionString: process.env.DATABASE_REPLICA_URL, // read replica
});

module.exports = {
  write: primaryPool,
  read: replicaPool,
};
```

## 🎓 Next Steps

1. ✅ Migrate to Neon
2. ✅ Test bot thoroughly (payments, transaksi, saldo)
3. ✅ Monitor performance for 1 week
4. ✅ Setup branching workflow for new features
5. ✅ Enable auto-backups
6. ✅ Setup alerting (Neon → email when issues)

## 🆘 Rollback Plan

Kalau ada masalah, rollback mudah:

```bash
# 1. Stop bot
pm2 stop bot-wa

# 2. Restore .env ke old Postgres
PG_HOST=localhost
PG_DATABASE=bot_wa

# 3. Restore dari backup
pg_restore -U bot_wa -d bot_wa backup_before_neon.dump

# 4. Restart bot
pm2 start bot-wa
```

## 📞 Support

- Neon Docs: https://neon.tech/docs
- Neon Discord: https://discord.gg/neon
- GitHub Issues: https://github.com/neondatabase/neon

