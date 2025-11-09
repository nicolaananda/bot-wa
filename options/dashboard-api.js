require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const { getDashboardData, getDailyChartData, getMonthlyChartData, getUserActivityData } = require('./dashboard-helper');
// Midtrans webhook integration
const crypto = require('crypto');
const envValidator = require('../config/env-validator');
envValidator.validateOrExit();
const { clearCachedPaymentData } = require('../config/midtrans');
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

// Import stock helper functions
const stockHelper = require('./stock-helper');

// Contoh API endpoint untuk dashboard web
// Pastikan install: npm install express cors

const app = express();
const PORT = process.env.PORT || 3002;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Middleware
app.use(cors({
  origin: [
    'http://dash.nicola.id',
    'https://dash.nicola.id',
    'http://localhost:8080',
    'http://localhost:3002',
    'http://localhost:5173',
    'https://pos.nicola.id',
    'https://api-botwa.nicola.id'
  ],
  credentials: true
}));
app.use(express.json({ limit: '2mb' })); // ganti yang sebelumnya app.use(express.json())
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
let pg; if (usePg) { pg = require('../config/postgres'); }

// Function untuk membaca database (JSON file atau Postgres)
async function loadDatabaseAsync() {
  if (usePg) {
    const result = { users: {}, transaksi: [], produk: {}, setting: {}, profit: {}, persentase: {} };
    // users (merge saldo & role columns into data for POS Web consistency)
    const users = await pg.query('SELECT user_id, saldo, role, data FROM users');
    for (const row of users.rows) {
      const payload = Object.assign({}, row.data || {});
      payload.saldo = typeof row.saldo === 'number' ? row.saldo : (payload.saldo || 0);
      if (row.role) payload.role = row.role;
      result.users[row.user_id] = payload;
    }
    // transaksi
    const trx = await pg.query('SELECT meta FROM transaksi ORDER BY id ASC');
    result.transaksi = trx.rows.map(r => r.meta);
    // produk
    const pr = await pg.query('SELECT id, data FROM produk');
    for (const row of pr.rows) result.produk[row.id] = row.data || {};
    // settings
    const st = await pg.query('SELECT key, value FROM settings');
    for (const row of st.rows) result.setting[row.key] = row.value;
    // optional keys if exist in kv tables created by migration
    try { const prf = await pg.query('SELECT v FROM "profit"'); if (prf.rows.length) result.profit = Object.fromEntries(prf.rows.map((r,i)=>[String(i), r.v])); } catch {}
    try { const per = await pg.query('SELECT v FROM "persentase"'); if (per.rows.length) result.persentase = Object.fromEntries(per.rows.map((r,i)=>[String(i), r.v])); } catch {}
    return result;
  }
  try {
    const dbPath = path.join(__dirname, 'database.json');
    console.log('Loading database from:', dbPath);
    console.log('Current directory:', __dirname);
    console.log('File exists:', fs.existsSync(dbPath));
    
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found at:', dbPath);
      return null;
    }
    
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    console.log('File size:', dbContent.length, 'characters');
    
    const parsed = JSON.parse(dbContent);
    console.log('Database loaded successfully with keys:', Object.keys(parsed));
    return parsed;
  } catch (error) {
    console.error('Error loading database:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

// Function untuk mendapatkan data dengan format yang sesuai
async function getFormattedDataAsync() {
  const db = await loadDatabaseAsync();
  if (!db) {
    return null;
  }
  
  // Format data sesuai dengan yang diharapkan dashboard-helper
  return {
    data: {
      transaksi: db.transaksi || [],
      users: db.users || {},
      profit: db.profit || {},
      persentase: db.persentase || {}
    }
  };
}

// Helper untuk load map produk {id: data} dari sumber sesuai mode
async function loadProdukMapAsync() {
  if (usePg) {
    const pr = await pg.query('SELECT id, data FROM produk');
    const map = {};
    for (const row of pr.rows) map[row.id] = row.data || {};
    return map;
  }
  const raw = await loadDatabaseAsync();
  return (raw && raw.produk) ? raw.produk : {};
}

// ===== Midtrans Webhook (merged) =====
function verifyMidtransSignature(notification) {
  const { order_id, status_code, gross_amount, signature_key } = notification || {};
  const input = String(order_id || '') + String(status_code || '') + String(gross_amount || '') + String(MIDTRANS_SERVER_KEY || '');
  const hash = crypto.createHash('sha512').update(input).digest('hex');
  return hash === signature_key;
}

app.post('/webhook/midtrans', (req, res) => {
  try {
    const notification = req.body || {};
    console.log('🔔 [Webhook] Midtrans notification:', JSON.stringify(notification));

    if (!verifyMidtransSignature(notification)) {
      console.error('❌ [Webhook] Invalid signature for', notification.order_id);
      return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    const { order_id, transaction_status, payment_type, settlement_time } = notification;
    console.log(`📋 [Webhook] Order: ${order_id}, Status: ${transaction_status}, Payment: ${payment_type}`);

    // Clear any cached status to avoid stale reads
    try { clearCachedPaymentData(order_id); } catch {}

    if (/(settlement|capture)/i.test(String(transaction_status))) {
      console.log(`✅ [Webhook] Payment successful for ${order_id}`);
      process.emit('payment-completed', {
        orderId: order_id,
        transactionStatus: transaction_status,
        paymentType: payment_type,
        settlementTime: settlement_time
      });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    console.error('❌ [Webhook] Error:', e);
    return res.status(500).json({ status: 'error', message: e.message });
  }
});

// Helper untuk mengambil satu produk by id (PG/file)
async function loadSingleProdukAsync(productId) {
  if (usePg) {
    const pr = await pg.query('SELECT id, data FROM produk WHERE id=$1', [productId]);
    return pr.rows[0] ? pr.rows[0].data || null : null;
  }
  const raw = await loadDatabaseAsync();
  return (raw && raw.produk && raw.produk[productId]) ? raw.produk[productId] : null;
}

// Helper untuk update stok di PG
async function updateProdukStockPg(productId, updater) {
  const row = await pg.query('SELECT data FROM produk WHERE id=$1', [productId]);
  if (!row.rows[0]) return { ok: false, error: 'Product not found' };
  const data = row.rows[0].data || {};
  const beforeCount = Array.isArray(data.stok) ? data.stok.length : 0;
  const updated = await updater({ ...data });
  if (!updated || typeof updated !== 'object') return { ok: false, error: 'Invalid update' };
  const newCount = Array.isArray(updated.stok) ? updated.stok.length : 0;
  await pg.query('UPDATE produk SET data=$2, stock=$3 WHERE id=$1', [productId, JSON.stringify(updated), newCount]);
  return { ok: true, beforeCount, newCount, data: updated };
}

// Helper: Parse delivered account from TRX file if available
function parseDeliveredAccountFromFile(reffId) {
  try {
    const filePath = path.join(__dirname, `TRX-${reffId}.txt`);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    // Attempt to extract the first account block
    const lines = content.split(/\r?\n/).map(l => l.trim());
    const acc = {};
    for (const line of lines) {
      if (line.toLowerCase().startsWith('â€¢ email:')) acc.email = line.split(':').slice(1).join(':').trim();
      else if (line.toLowerCase().startsWith('â€¢ password:')) acc.password = line.split(':').slice(1).join(':').trim();
      else if (line.toLowerCase().startsWith('â€¢ profil:')) acc.profile = line.split(':').slice(1).join(':').trim();
      else if (line.toLowerCase().startsWith('â€¢ pin:')) acc.pin = line.split(':').slice(1).join(':').trim();
      else if (line.toLowerCase().startsWith('â€¢ 2fa:')) acc.twofa = line.split(':').slice(1).join(':').trim();
    }

    if (Object.keys(acc).length === 0) return null;

    return {
      email: acc.email || null,
      akun: null,
      username: null,
      password: acc.password || null,
      pin: acc.pin || null,
      profile: acc.profile || null,
      notes: acc.twofa ? `2FA: ${acc.twofa}` : null
    };
  } catch (e) {
    return null;
  }
}

// Role Management Functions
function saveDatabase(db) {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}
    // ===== POS WEB INTEGRATION ENDPOINTS (BEGIN) =====

// Token opsional untuk write-protect endpoint POS
const POS_TOKEN = process.env.DB_TOKEN || process.env.VITE_DB_TOKEN;

// Helper auth sederhana
function posAuth(req, res) {
  if (!POS_TOKEN) return true; // tanpa token = allow
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${POS_TOKEN}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Cache-control helper
function posNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

/**
 * GET /api/pos/database
 * Bacakan langsung options/database.json agar POS Web bisa read tanpa Nginx alias.
 * Menggunakan loadDatabase() yang sudah ada di file ini.
 */
app.get('/api/pos/database', async (req, res) => {
  posNoStore(res);
  const db = await loadDatabaseAsync();
  if (!db) {
    return res.status(500).json({ success: false, error: 'Failed to load database' });
  }
  return res.json(db);
});

/**
 * POST /api/pos/transactions
 * Body: { transactions: array }
 * Simpan riwayat transaksi dari POS Web ke database
 */
app.post('/api/pos/transactions', async (req, res) => {
  if (!posAuth(req, res)) return;
  try {
    const { transactions } = req.body || {};
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ success: false, error: 'transactions must be array' });
    }

    if (usePg) {
      // Save to Postgres
      let saved = 0;
      for (const t of transactions) {
        try {
          const refId = t && (t.ref_id || t.reffId || t.order_id) || null;
          const uid = t && (t.user_id || t.userId || t.user) || null;
          const amt = parseInt(t && (t.totalBayar || t.amount || (t.price * t.jumlah)) || 0);
          const status = t && (t.status || 'completed') || 'completed';
          
          await pg.query(
            'INSERT INTO transaksi(ref_id, user_id, amount, status, meta) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
            [refId, uid, amt, status, JSON.stringify(t)]
          );
          saved++;
        } catch (e) {
          console.error('[POS] Failed to save transaction:', e.message);
        }
      }
      return res.json({ success: true, saved, mode: 'postgres' });
    } else {
      // Save to JSON
      const db = await loadDatabaseAsync();
      if (!db) {
        return res.status(500).json({ success: false, error: 'Database not available' });
      }
      
      if (!db.transaksi) db.transaksi = [];
      db.transaksi.push(...transactions);
      
      if (saveDatabase(db)) {
        return res.json({ success: true, saved: transactions.length, mode: 'json' });
      }
      return res.status(500).json({ success: false, error: 'Failed to save database' });
    }
  } catch (e) {
    console.error('[POS] Transaction save error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/pos/save-database
 * Body: { database: <obj db penuh> }
 * Simpan perubahan dari POS Web (saldo, stok, terjual, dll) ke options/database.json
 * Menggunakan saveDatabase() yang sudah ada di file ini.
 */
app.post('/api/pos/save-database', async (req, res) => {
  if (!posAuth(req, res)) return;
  try {
    const { database } = req.body || {};
    if (!database || typeof database !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid payload: { database } required' });
    }
    if (!database.users || !database.produk) {
      return res.status(400).json({ success: false, error: 'Database must include users and produk' });
    }

    // PG mode: apply incoming snapshot into relational tables
    if (usePg) {
      try {
        // Upsert users (saldo, role, data)
        const userEntries = Object.entries(database.users || {});
        for (const [userId, u] of userEntries) {
          const saldo = parseInt(u && u.saldo) || 0;
          const role = (u && u.role) || 'bronze';
          await pg.query(
            "INSERT INTO users(user_id, saldo, role, data) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET saldo=EXCLUDED.saldo, role=EXCLUDED.role, data=EXCLUDED.data",
            [userId, saldo, role, JSON.stringify(u || {})]
          );
        }

        // Upsert produk (name, price, stock, data)
        const produkEntries = Object.entries(database.produk || {});
        for (const [id, p] of produkEntries) {
          const stock = Array.isArray(p && p.stok) ? p.stok.length : (parseInt(p && p.stock) || 0);
          const price = parseInt(p && (p.price || p.priceB || p.harga)) || 0;
          const name = p && (p.name || p.nama) || null;
          await pg.query(
            'INSERT INTO produk(id, name, price, stock, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock=EXCLUDED.stock, data=EXCLUDED.data',
            [id, name, price, stock, JSON.stringify(p || {})]
          );
        }

        // Optionally persist settings (best-effort)
        if (database.setting && typeof database.setting === 'object') {
          const settingEntries = Object.entries(database.setting);
          for (const [k, v] of settingEntries) {
            await pg.query('INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, JSON.stringify(v)]);
          }
        }

        // Save transaksi (append-only)
        if (database.transaksi && Array.isArray(database.transaksi)) {
          for (const t of database.transaksi) {
            try {
              const refId = t && (t.ref_id || t.reffId || t.order_id) || null;
              const uid = t && (t.user_id || t.userId || t.user) || null;
              const amt = parseInt(t && (t.totalBayar || t.amount || (t.price * (t.jumlah || 1)))) || 0;
              const status = t && t.status || null;
              await pg.query(
                'INSERT INTO transaksi(ref_id, user_id, amount, status, meta) VALUES ($1,$2,$3,$4,$5)',
                [refId, uid, amt, status, JSON.stringify(t)]
              );
            } catch (e) {
              // best-effort; continue with others
              try { console.error('[POS save-database PG] insert transaksi failed:', e.message) } catch {}
            }
          }
        }

        return res.json({ success: true, mode: 'postgres', updatedAt: new Date().toISOString() });
      } catch (e) {
        console.error('[POS save-database PG] Error:', e);
        return res.status(500).json({ success: false, error: 'Failed to apply to Postgres: ' + e.message });
      }
    }

    // File mode
    if (saveDatabase(database)) {
      return res.json({ success: true, updatedAt: new Date().toISOString() });
    }
    return res.status(500).json({ success: false, error: 'Failed to save database' });
  } catch (e) {
    console.error('[POS save-database] Error:', e);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/pos/update-pin
 * Body: { phone: '628xxx@s.whatsapp.net', pin: '1234' }
 * Update PIN user tanpa kirim seluruh database.
 */
app.get('/api/pos/debug', async (req, res) => {
  if (usePg) {
    try {
      const counters = await Promise.all([
        pg.query('SELECT COUNT(*)::int AS c FROM users'),
        pg.query('SELECT COUNT(*)::int AS c FROM transaksi'),
        pg.query('SELECT COUNT(*)::int AS c FROM produk')
      ]);
      return res.json({ mode: 'postgres', users: counters[0].rows[0].c, transaksi: counters[1].rows[0].c, produk: counters[2].rows[0].c });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
  const filePath = path.join(__dirname, 'database.json');
  res.json({ mode: 'file', __dirname, filePath, exists: fs.existsSync(filePath) });
});

app.post('/api/pos/update-pin', async (req, res) => {
  if (!posAuth(req, res)) return;
  try {
    const { phone, pin } = req.body || {};
    if (!phone || !pin) {
      return res.status(400).json({ success: false, error: 'phone and pin required' });
    }

    if (usePg) {
      await pg.query(
        'UPDATE users SET data = jsonb_set(COALESCE(data, \'{}\'::jsonb), $3::text[], to_jsonb($2::text), true) WHERE user_id=$1',
        [phone, pin, '{pin}']
      );
      return res.json({ success: true, phone, updatedAt: new Date().toISOString() });
    }
    const db = await loadDatabaseAsync();
    if (!db || !db.users) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }
    if (!db.users[phone]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    db.users[phone].pin = pin;

    if (saveDatabase(db)) {
      return res.json({ success: true, phone, updatedAt: new Date().toISOString() });
    }
    return res.status(500).json({ success: false, error: 'Failed to save database' });
  } catch (e) {
    console.error('[POS update-pin] Error:', e);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// ===== POS WEB RECEIPT ENDPOINTS (BEGIN) =====

/**
 * POST /api/pos/save-receipt
 * Body: { reffId: string, receipt: string }
 * Simpan struk transaksi ke file TRX-{reffId}.txt
 */
app.post('/api/pos/save-receipt', (req, res) => {
  if (!posAuth(req, res)) return;
  try {
    const { reffId, receipt } = req.body || {};
    if (!reffId || typeof reffId !== 'string' || !receipt || typeof receipt !== 'string') {
      return res.status(400).json({ success: false, error: 'reffId and receipt are required' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(reffId)) {
      return res.status(400).json({ success: false, error: 'Invalid reffId format' });
    }

    const filePath = path.join(__dirname, `TRX-${reffId}.txt`);
    fs.writeFileSync(filePath, receipt, 'utf8');

    return res.json({ success: true, reffId, savedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[POS save-receipt] Error:', e);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/pos/receipt/:reffId
 * Return struk transaksi (text/plain) dari file TRX-{reffId}.txt
 */
app.get('/api/pos/receipt/:reffId', (req, res) => {
  posNoStore(res);
  try {
    const { reffId } = req.params || {};
    if (!reffId || !/^[a-zA-Z0-9_-]+$/.test(reffId)) {
      return res.status(400).json({ success: false, error: 'Invalid reffId' });
    }

    const filePath = path.join(__dirname, `TRX-${reffId}.txt`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }

    const text = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(text);
  } catch (e) {
    console.error('[POS get-receipt] Error:', e);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ===== POS WEB RECEIPT ENDPOINTS (END) =====
// ===== POS WEB INTEGRATION ENDPOINTS (END) =====

// ===== ADMIN USER MANAGEMENT (BEGIN) =====
const ADMIN_OWNERS = new Set(['6281389592985', '6285235540944']);
const IDEMP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const idempotencyCache = new Map(); // key -> { at: number }

function cleanUpIdempotencyCache() {
  const now = Date.now();
  for (const [key, info] of idempotencyCache.entries()) {
    if (now - info.at > IDEMP_TTL_MS) idempotencyCache.delete(key);
  }
}
setInterval(cleanUpIdempotencyCache, 60 * 1000);

function posAdminAuth(req, res) {
  // Reuse Bearer auth
  if (!posAuth(req, res)) return false;
  const adminUser = (req.headers['x-admin-user'] || '').toString().replace(/[^0-9]/g, '');
  if (!ADMIN_OWNERS.has(adminUser)) {
    res.status(403).json({ success: false, error: 'Forbidden: admin not allowed' });
    return false;
  }
  req.adminUser = adminUser;
  return true;
}

function findUserRecord(db, userId) {
  // Accept both formats
  const idNoSuffix = userId.replace(/[^0-9]/g, '');
  const idWithSuffix = idNoSuffix + '@s.whatsapp.net';
  const users = db.users || {};
  if (users[idNoSuffix]) return { key: idNoSuffix, record: users[idNoSuffix] };
  if (users[idWithSuffix]) return { key: idWithSuffix, record: users[idWithSuffix] };
  return null;
}

function writeAudit(entry) {
  try {
    const filePath = path.join(__dirname, 'audit-admin.log');
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  } catch {}
}

function generateAuditId() {
  const ts = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AUD-${ts}-${rnd}`;
}

function paginate(array, page, limit) {
  const total = array.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * limit;
  const items = array.slice(start, start + limit);
  return { items, currentPage, totalPages, total };
}

// 1) List users for admin
app.get('/api/admin/users', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { search = '', role = 'all', minSaldo, maxSaldo, page = 1, limit = 20 } = req.query;
    const lim = Math.min(parseInt(limit) || 20, 100);
    const pg = parseInt(page) || 1;

    const formatted = await getFormattedDataAsync();
    if (!formatted) return res.status(500).json({ success: false, error: 'Failed to load database' });
    const users = formatted.data.users || {};
    const transaksi = formatted.data.transaksi || [];

    let list = Object.keys(users).map(userId => {
      const u = users[userId] || {};
      const idNoSuffix = userId.replace('@s.whatsapp.net', '');
      const txs = transaksi.filter(t => t.user === idNoSuffix || t.user === `${idNoSuffix}@s.whatsapp.net`);      return {
        userId,
        username: u.username || `User ${userId.slice(-4)}`,
        saldo: parseInt(u.saldo) || 0,
        role: u.role || 'bronze',
        isActive: u.isActive !== false,
        lastActivity: u.lastActivity || u.createdAt || null,
        createdAt: u.createdAt || null,
        transactionCount: txs.length,
        totalSpent: txs.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0)
      };
    });

    const s = search.toString().toLowerCase().trim();
    if (s) {
      list = list.filter(u => u.userId.toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s));
    }
    if (role && role !== 'all') {
      list = list.filter(u => (u.role || 'bronze') === role);
    }
    if (minSaldo !== undefined) {
      const min = parseInt(minSaldo) || 0;
      list = list.filter(u => (u.saldo || 0) >= min);
    }
    if (maxSaldo !== undefined) {
      const max = parseInt(maxSaldo) || 0;
      list = list.filter(u => (u.saldo || 0) <= max);
    }

    // Sort by createdAt desc as default
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const { items, currentPage, totalPages, total } = paginate(list, pg, lim);
    return res.json({
      success: true,
      data: {
        users: items,
        pagination: {
          currentPage,
          totalPages,
          totalUsers: total,
          usersPerPage: lim,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 2) Adjust saldo
app.patch('/api/admin/users/:userId/saldo', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { userId } = req.params;
    const { amount, reason = '', idempotencyKey } = req.body || {};
    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: amount must be number' });
    }

    if (idempotencyKey) {
      const key = `${req.adminUser}|${userId}|${idempotencyKey}`;
      const hit = idempotencyCache.get(key);
      if (hit && Date.now() - hit.at <= IDEMP_TTL_MS) {
        return res.status(409).json({ success: false, error: 'Idempotency conflict' });
      }
      idempotencyCache.set(key, { at: Date.now() });
    }

    if (usePg) {
      const beforeRes = await pg.query('SELECT saldo FROM users WHERE user_id=$1', [userId]);
      const before = beforeRes.rows[0] ? parseInt(beforeRes.rows[0].saldo) : 0;
      const after = before + amount;
      if (after < 0) return res.status(400).json({ success: false, error: 'Invalid payload: resulting saldo would be negative' });
      await pg.query('INSERT INTO users(user_id, saldo, role, data) VALUES ($1,$2,' + "'bronze'" + ', ' + "'{}'" + '::jsonb) ON CONFLICT (user_id) DO UPDATE SET saldo=$2', [userId, after]);
      const auditId = generateAuditId();
      writeAudit({ id: auditId, admin: req.adminUser, userId, action: 'saldo.adjust', delta: amount, reason: reason || null, before, after, timestamp: new Date().toISOString(), ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null });
      return res.json({ success: true, data: { userId, before, after, delta: amount, auditId } });
    }
    const db = await loadDatabaseAsync();
    if (!db || !db.users) return res.status(500).json({ success: false, error: 'Database not available' });
    const found = findUserRecord(db, userId);
    if (!found) return res.status(404).json({ success: false, error: 'User not found' });

    const before = parseInt(found.record.saldo) || 0;
    const after = before + amount;
    if (after < 0) {
      return res.status(400).json({ success: false, error: 'Invalid payload: resulting saldo would be negative' });
    }

    found.record.saldo = after;
    const saved = saveDatabase(db);
    if (!saved) return res.status(500).json({ success: false, error: 'Failed to save database' });

    const auditId = generateAuditId();
    writeAudit({
      id: auditId,
      admin: req.adminUser,
      userId: found.key,
      action: 'saldo.adjust',
      delta: amount,
      reason: reason || null,
      before,
      after,
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
    });

    return res.json({ success: true, data: { userId: found.key, before, after, delta: amount, auditId } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3) Set PIN
app.post('/api/admin/users/:userId/pin', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { userId } = req.params;
    const { pin } = req.body || {};
    if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: pin must be 4-6 numeric digits' });
    }

    if (usePg) {
      await pg.query(
        'UPDATE users SET data = jsonb_set(COALESCE(data, \'{}\'::jsonb), $3::text[], to_jsonb($2::text), true) WHERE user_id=$1',
        [userId, pin, '{pin}']
      );
      const auditId = generateAuditId();
      writeAudit({ id: auditId, admin: req.adminUser, userId, action: 'pin.update', masked: '******', timestamp: new Date().toISOString(), ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null });
      return res.json({ success: true, data: { userId, updatedAt: new Date().toISOString() } });
    }
    const db = await loadDatabaseAsync();
    if (!db || !db.users) return res.status(500).json({ success: false, error: 'Database not available' });
    const found = findUserRecord(db, userId);
    if (!found) return res.status(404).json({ success: false, error: 'User not found' });

    found.record.pin = pin;
    const saved = saveDatabase(db);
    if (!saved) return res.status(500).json({ success: false, error: 'Failed to save database' });

    const auditId = generateAuditId();
    writeAudit({
      id: auditId,
      admin: req.adminUser,
      userId: found.key,
      action: 'pin.update',
      masked: '******',
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
    });

    return res.json({ success: true, data: { userId: found.key, updatedAt: new Date().toISOString() } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 4) Update role
app.patch('/api/admin/users/:userId/role', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { userId } = req.params;
    const { role } = req.body || {};
    const allowed = new Set(['bronze', 'silver', 'gold', 'admin']);
    if (!allowed.has(role)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: role must be one of bronze|silver|gold|admin' });
    }
    // Only owners may set to admin (already enforced by posAdminAuth), keep explicit check
    if (role === 'admin' && !ADMIN_OWNERS.has(req.adminUser)) {
      return res.status(403).json({ success: false, error: 'Forbidden: admin not allowed' });
    }

    if (usePg) {
      const beforeRes = await pg.query('SELECT data FROM users WHERE user_id=$1', [userId]);
      const oldRole = (beforeRes.rows[0] && beforeRes.rows[0].data && beforeRes.rows[0].data.role) || 'bronze';
      await pg.query(
        "UPDATE users SET data = jsonb_set(COALESCE(data, '{}'::jsonb), $3::text[], to_jsonb($2::text), true) WHERE user_id=$1".replace("'{}'", "''{}''"),
        [userId, role, '{role}']
      );
      const auditId = generateAuditId();
      writeAudit({ id: auditId, admin: req.adminUser, userId, action: 'role.update', oldRole, newRole: role, timestamp: new Date().toISOString(), ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null });
      return res.json({ success: true, data: { userId, oldRole, newRole: role } });
    }
    const db = await loadDatabaseAsync();
    if (!db || !db.users) return res.status(500).json({ success: false, error: 'Database not available' });
    const found = findUserRecord(db, userId);
    if (!found) return res.status(404).json({ success: false, error: 'User not found' });

    const oldRole = found.record.role || 'bronze';
    found.record.role = role;
    const saved = saveDatabase(db);
    if (!saved) return res.status(500).json({ success: false, error: 'Failed to save database' });

    const auditId = generateAuditId();
    writeAudit({
      id: auditId,
      admin: req.adminUser,
      userId: found.key,
      action: 'role.update',
      oldRole,
      newRole: role,
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
    });

    return res.json({ success: true, data: { userId: found.key, oldRole, newRole: role } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 5) Audit log query
app.get('/api/admin/audit', (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { admin, userId, action, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const pg = parseInt(page) || 1;

    const filePath = path.join(__dirname, 'audit-admin.log');
    let logs = [];
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      logs = content.split(/\r?\n/).filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    }

    let filtered = logs;
    if (admin) filtered = filtered.filter(l => (l.admin || '').includes(admin));
    if (userId) filtered = filtered.filter(l => (l.userId || '').includes(userId));
    if (action) filtered = filtered.filter(l => (l.action || '') === action);

    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    if (from || to) {
      filtered = filtered.filter(l => {
        const t = new Date(l.timestamp);
        if (from && t < from) return false;
        if (to && t > to) return false;
        return true;
      });
    }

    // Newest first
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const { items, currentPage, totalPages, total } = paginate(filtered, pg, lim);
    return res.json({ success: true, data: { logs: items, pagination: { currentPage, totalPages, total } } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// ===== ADMIN USER MANAGEMENT (END) =====

function validateRole(role) {
  const validRoles = ['user', 'admin', 'moderator', 'superadmin'];
  return validRoles.includes(role);
}

function hasPermission(userRole, requiredRole) {
  const roleHierarchy = {
    'user': 1,
    'moderator': 2,
    'admin': 3,
    'superadmin': 4
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// API Endpoints

// 1. Dashboard Overview
app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const dashboardData = getDashboardData(db);
    if (dashboardData) {
      res.json({
        success: true,
        data: dashboardData
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to process dashboard data'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 2. Chart Data Harian
app.get('/api/dashboard/chart/daily', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const dailyData = getDailyChartData(db);
    res.json({
      success: true,
      data: dailyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. Chart Data Bulanan
app.get('/api/dashboard/chart/monthly', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const monthlyData = getMonthlyChartData(db);
    res.json({
      success: true,
      data: monthlyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. User Activity
app.get('/api/dashboard/users/activity', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Get user activity data
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // Calculate active users
    const activeUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      return user && user.isActive !== false;
    }).length;
    
    // Calculate new users this month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const newUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || !user.createdAt) return false;
      const userMonth = user.createdAt.toString().slice(0, 7);
      return userMonth === currentMonth;
    }).length;
    
    // Get user activity details with saldo, username, and role
    const userActivity = Object.keys(users).map(userId => {
      const user = users[userId];
      if (!user) return null;
      
      // Get user transactions
      const userTransactions = transaksi.filter(t => t.user === userId);
      const totalTransaksi = userTransactions.length;
      const totalSpent = userTransactions.reduce((sum, t) => {
        return sum + (parseInt(t.totalBayar) || (parseInt(t.price) * (t.jumlah || 1)));
      }, 0);
      
      // Calculate payment method breakdown
      const metodeBayar = {
        saldo: 0,
        qris: 0,
        unknown: 0
      };
      
      userTransactions.forEach(t => {
        const paymentMethod = (t.payment_method || t.metodeBayar || '').toLowerCase();
        if (paymentMethod.includes('saldo')) {
          metodeBayar.saldo++;
        } else if (paymentMethod.includes('qris')) {
          metodeBayar.qris++;
        } else {
          metodeBayar.unknown++;
        }
      });
      
      // Auto-generate username if not exists
      const username = user.username || `User ${userId.slice(-4)}`;
      
      // Auto-calculate role based on total spending
      let role = user.role || 'bronze';
      if (totalSpent >= 1000000) {
        role = 'gold';
      } else if (totalSpent >= 500000) {
        role = 'silver';
      } else {
        role = 'bronze';
      }
      
      return {
        user: userId,
        username: username,
        totalTransaksi: totalTransaksi,
        totalSpent: totalSpent,
        saldo: parseInt(user.saldo) || 0,
        lastActivity: user.lastActivity || user.createdAt || new Date().toISOString(),
        role: role,
        metodeBayar: metodeBayar
      };
    }).filter(Boolean).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    
    // Calculate activity trends (mock data for now)
    const activityTrends = {
      dailyActive: [120, 135, 142, 128, 156, 149, 138],
      weeklyActive: [890, 920, 945, 912, 978, 934, 956],
      monthlyActive: [2800, 2950, 3100, 3020, 3180, 3050, 3120]
    };
    
    res.json({
      success: true,
      data: {
        activeUsers: activeUsers,
        newUsers: newUsers,
        userActivity: userActivity.slice(0, 20), // Limit to 20 most recent
        activityTrends: activityTrends
      },
      message: "User activity data retrieved successfully"
    });
    
  } catch (error) {
    console.error('Error in user activity endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. Get All Users with Pagination
app.get('/api/dashboard/users/all', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = 'all' } = req.query;
    const db = await getFormattedDataAsync();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // Parse pagination parameters
    const currentPage = parseInt(page);
    const usersPerPage = Math.min(parseInt(limit), 50); // Max 50 users per page
    const offset = (currentPage - 1) * usersPerPage;
    
    // Filter users based on search and role
    let filteredUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || user.isActive === false) return false;
      
      // Role filter
      if (role !== 'all' && user.role !== role) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const username = (user.username || `User ${userId.slice(-4)}`).toLowerCase();
        const userIdLower = userId.toLowerCase();
        if (!username.includes(searchLower) && !userIdLower.includes(searchLower)) {
          return false;
        }
      }
      
      return true;
    });

    // Get total count for pagination
    const totalUsers = filteredUsers.length;
    const totalPages = Math.ceil(totalUsers / usersPerPage);
    
    // Apply pagination
    const paginatedUsers = filteredUsers.slice(offset, offset + usersPerPage);
    
    // Transform user data
    const transformedUsers = paginatedUsers.map(userId => {
      const user = users[userId];
      
      // Get user transactions
      const userTransactions = transaksi.filter(t => t.user === userId);
      const transactionCount = userTransactions.length;
      const totalSpent = userTransactions.reduce((sum, t) => {
        return sum + (parseInt(t.totalBayar) || (parseInt(t.price) * (t.jumlah || 1)));
      }, 0);
      
      // Auto-generate username if not exists
      const username = user.username || `User ${userId.slice(-4)}`;
      
      // Auto-calculate role based on total spending
      let calculatedRole = user.role || 'bronze';
      if (totalSpent >= 1000000) {
        calculatedRole = 'gold';
      } else if (totalSpent >= 500000) {
        calculatedRole = 'silver';
      } else {
        calculatedRole = 'bronze';
      }
      
      return {
        userId: userId,
        username: username,
        phone: userId, // Using userId as phone for now
        email: user.email || `user${userId.slice(-4)}@example.com`,
        saldo: parseInt(user.saldo) || 0,
        role: calculatedRole,
        isActive: user.isActive !== false,
        lastActivity: user.lastActivity || user.createdAt || null,
        createdAt: user.createdAt || new Date().toISOString(),
        transactionCount: transactionCount,
        totalSpent: totalSpent,
        hasTransactions: transactionCount > 0
      };
    });
    
    // Sort by creation date (newest first)
    transformedUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Pagination info
    const pagination = {
      currentPage: currentPage,
      totalPages: totalPages,
      totalUsers: totalUsers,
      usersPerPage: usersPerPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    };
    
    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: pagination
      },
      message: "All users retrieved successfully"
    });
    
  } catch (error) {
    console.error('Error in get all users endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 6. Transaksi by User
app.get('/api/dashboard/users/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getFormattedDataAsync();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Get user info - search with and without @s.whatsapp.net
    const userWithDomain = `${userId}@s.whatsapp.net`;
    const user = db.data.users[userId] || db.data.users[userWithDomain];
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Filter transaksi berdasarkan userId (both formats)
    const userTransactions = db.data.transaksi.filter(t => 
      t.user === userId || t.user === userWithDomain
    );
    
    const totalTransaksi = userTransactions.length;
    const totalSpent = userTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    
    // Transform data sesuai dengan kontrak API
    const transformedTransactions = userTransactions.map(t => ({
      id: t.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      referenceId: t.reffId || `REF-${userId}-${Date.now()}`,
      reffId: t.reffId || `REF-${userId}-${Date.now()}`,
      order_id: t.order_id || t.reffId || `ORD-${Date.now()}`,
      name: t.name || 'Unknown Product',
      jumlah: parseInt(t.jumlah) || 1,
      price: parseInt(t.price) || 0,
      totalBayar: parseInt(t.totalBayar) || 0,
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      payment_method: t.metodeBayar || 'Not specified',
      metodeBayar: t.metodeBayar || 'Not specified',
      status: t.status || 'completed'
    }));
    
    // Sort transactions by date (newest first)
    transformedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({
      success: true,
      data: {
        user: `User ${userId}@s.whatsapp.net`,
        userId: userId,
        totalTransaksi: totalTransaksi,
        totalSpent: totalSpent,
        currentSaldo: parseInt(user.saldo) || 0,
        transaksi: transformedTransactions
      }
    });
    
  } catch (error) {
    console.error('Error in user transactions endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 6. Search Transaksi by Reff ID
app.get('/api/dashboard/transactions/search/:reffId', async (req, res) => {
  try {
    const { reffId } = req.params;
    const db = await getFormattedDataAsync();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Cari transaksi berdasarkan reff ID
    const transaction = db.data.transaksi.find(t => t.reffId === reffId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    // Hitung profit berdasarkan persentase
    const userRole = db.data.users[transaction.user]?.role || "bronze";
    const profitPercentage = db.data.persentase[userRole] || 2;
    const profit = Math.floor((parseInt(transaction.price) * transaction.jumlah) * (profitPercentage / 100));
    
    // Parse delivered account if exists
    const deliveredAccount = parseDeliveredAccountFromFile(reffId);
    
    // Get receipt content if exists
    let receiptContent = null;
    let receiptExists = false;
    try {
      const receiptPath = path.join(__dirname, 'receipts', `${reffId}.txt`);
      if (fs.existsSync(receiptPath)) {
        receiptContent = fs.readFileSync(receiptPath, 'utf8');
        receiptExists = true;
      }
    } catch (error) {
      console.error('Error reading receipt:', error);
    }
    
    // Transform data sebelum kirim ke frontend
    const transformedTransaction = {
      reffId: reffId,
      // Map field baru ke field yang diharapkan frontend
      user: transaction.user_name || transaction.user || 'Anonymous User',
      metodeBayar: transaction.payment_method || transaction.metodeBayar || 'Not specified',
      userRole: userRole,
      produk: transaction.name,
      idProduk: transaction.id,
      harga: parseInt(transaction.price),
      jumlah: transaction.jumlah,
      totalBayar: transaction.totalBayar || (parseInt(transaction.price) * transaction.jumlah),
      tanggal: transaction.date,
      profit: profit,
      deliveredAccount: deliveredAccount || null,
      // Receipt data
      receiptExists: receiptExists,
      receiptContent: receiptContent,
      // Keep original fields for reference
      user_name: transaction.user_name || transaction.user,
      payment_method: transaction.payment_method || transaction.metodeBayar,
      user_id: transaction.user_id || transaction.user,
      order_id: transaction.order_id || transaction.reffId
    };
    
    res.json({
      success: true,
      data: transformedTransaction
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 7. Export Data
app.get('/api/dashboard/export/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const db = await getFormattedDataAsync();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Export data berdasarkan format
    const filename = `dashboard_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
    
    res.json({
      success: true,
      message: `Data berhasil diexport ke format ${format}`,
      filename: filename
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 8. User Statistics
app.get('/api/dashboard/users/stats', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // Calculate total users
    const totalUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      return user && user.isActive !== false;
    }).length;
    
    // Calculate total balance
    const totalSaldo = Object.keys(users).reduce((sum, userId) => {
      const user = users[userId];
      if (user && user.isActive !== false) {
        return sum + (parseInt(user.saldo) || 0);
      }
      return sum;
    }, 0);
    
    // Calculate average balance
    const averageSaldo = totalUsers > 0 ? Math.round(totalSaldo / totalUsers) : 0;
    
    // Calculate user growth
    const currentMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
    
    const thisMonthUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || !user.createdAt) return false;
      const userMonth = user.createdAt.toString().slice(0, 7);
      return userMonth === currentMonth;
    }).length;
    
    const lastMonthUsers = Object.keys(users).filter(userId => {
      const user = users[userId];
      if (!user || !user.createdAt) return false;
      const userMonth = user.createdAt.toString().slice(0, 7);
      return userMonth === lastMonth;
    }).length;
    
    const growthRate = lastMonthUsers > 0 ? 
      Math.round(((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100 * 10) / 10 : 0;
    
    // Calculate role distribution
    const roleDistribution = {};
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      if (user && user.isActive !== false) {
        const role = user.role || 'bronze';
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      }
    });
    
    // Ensure all roles are present
    if (!roleDistribution.bronze) roleDistribution.bronze = 0;
    if (!roleDistribution.silver) roleDistribution.silver = 0;
    if (!roleDistribution.gold) roleDistribution.gold = 0;
    
    // Calculate balance distribution
    const balanceDistribution = {
      high: 0,
      medium: 0,
      low: 0
    };
    
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      if (user && user.isActive !== false) {
        const saldo = parseInt(user.saldo) || 0;
        if (saldo >= 100000) {
          balanceDistribution.high++;
        } else if (saldo >= 50000) {
          balanceDistribution.medium++;
        } else {
          balanceDistribution.low++;
        }
      }
    });
    
    res.json({
      success: true,
      data: {
        totalUsers: totalUsers,
        totalSaldo: totalSaldo,
        averageSaldo: averageSaldo,
        userGrowth: {
          thisMonth: thisMonthUsers,
          lastMonth: lastMonthUsers,
          growthRate: growthRate
        },
        roleDistribution: roleDistribution,
        balanceDistribution: balanceDistribution
      },
      message: "User statistics retrieved successfully"
    });
    
  } catch (error) {
    console.error('Error in user stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 9. Product Statistics
app.get('/api/dashboard/products/stats', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const productStats = {};
    let totalProducts = 0;
    let totalSold = 0;
    
    // Process transaksi data to get product statistics
    db.data.transaksi.forEach(t => {
      const productId = t.id;
      const productName = t.name;
      const price = parseInt(t.price) || 0;
      const jumlah = parseInt(t.jumlah) || 1;
      const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
      
      if (!productStats[productId]) {
        productStats[productId] = {
          id: productId,
          name: productName,
          totalSold: 0,
          totalRevenue: 0,
          averagePrice: price,
          transactionCount: 0
        };
      }
      
      productStats[productId].totalSold += jumlah;
      productStats[productId].totalRevenue += totalBayar;
      productStats[productId].transactionCount += 1;
      productStats[productId].averagePrice = Math.round(productStats[productId].totalRevenue / productStats[productId].totalSold);
      
      totalProducts++;
      totalSold += jumlah;
    });
    
    // Convert to array and sort by revenue
    const productStatsArray = Object.values(productStats).sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    res.json({
      success: true,
      data: {
        totalProducts: totalProducts,
        totalSold: totalSold,
        products: productStatsArray,
        topProducts: productStatsArray.slice(0, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 10. Recent Transactions
app.get('/api/dashboard/transactions/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const db = await getFormattedDataAsync();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Sort transactions by date (most recent first) and limit results
    const recentTransactions = db.data.transaksi
      .filter(t => t.date) // Only transactions with dates
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(limit))
      .map(t => ({
        id: t.id,
        name: t.name,
        price: parseInt(t.price) || 0,
        date: t.date,
        jumlah: t.jumlah || 1,
        // Map field baru ke field yang diharapkan frontend
        user: t.user_name || t.user || 'Anonymous User',
        metodeBayar: t.payment_method || t.metodeBayar || 'Not specified',
        totalBayar: t.totalBayar || (parseInt(t.price) * (t.jumlah || 1)),
        reffId: t.order_id || t.reffId || 'N/A',
        // Keep original fields for reference
        user_name: t.user_name || t.user,
        payment_method: t.payment_method || t.metodeBayar,
        user_id: t.user_id || t.user,
        order_id: t.order_id || t.reffId
      }));
    
    res.json({
      success: true,
      data: {
        transactions: recentTransactions,
        count: recentTransactions.length,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stock Management API Endpoints

// Use stock helper functions instead of local duplicates
const { getStockStatus, getProductCategory, parseStockItem, calculateStockMetrics } = stockHelper;

// Calculate stock utilization percentage
function calculateUtilization(terjual, stockCount) {
  if (stockCount <= 0) return 0;
  return Math.min(100, Math.round((terjual / (terjual + stockCount)) * 100));
}

// 1. Get Product Stock Data
app.get('/api/dashboard/products/stock', async (req, res) => {
  try {
    const produkMap = await loadProdukMapAsync();
    if (!produkMap || Object.keys(produkMap).length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    const products = [];
    let totalSold = 0;

    for (const [productId, product] of Object.entries(produkMap)) {
      const stockCount = product.stok ? product.stok.length : 0;
      totalSold += product.terjual || 0;

      // Calculate stock metrics using helper functions
      const stockMetrics = calculateStockMetrics(product);
      const minStock = product.minStock || 5; // Default minimum stock
      const utilization = calculateUtilization(product.terjual || 0, stockCount);
      
      const formattedProduct = {
        id: product.id,
        name: product.name,
        desc: product.desc,
        priceB: product.priceB,
        priceS: product.priceS,
        priceG: product.priceG,
        terjual: product.terjual || 0,
        stockCount: stockCount,
        stok: product.stok || [],
        stockStatus: stockMetrics.stockStatus,
        category: stockMetrics.category,
        minStock: minStock,
        lastRestock: product.lastRestock || null,
        utilization: utilization
      };

      products.push(formattedProduct);
    }

    // Sort products by stock count (ascending) to show low stock first
    products.sort((a, b) => a.stockCount - b.stockCount);

    // Get top products by sales
    const topProducts = products
      .filter(p => p.terjual > 0)
      .sort((a, b) => b.terjual - a.terjual)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalProducts: products.length,
        totalSold: totalSold,
        products: products,
        topProducts: topProducts
      }
    });
  } catch (error) {
    console.error('Error getting product stock data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 2. Get Stock Summary
app.get('/api/dashboard/products/stock/summary', async (req, res) => {
  try {
    const produkMap = await loadProdukMapAsync();
    if (!produkMap || Object.keys(produkMap).length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    let totalStockItems = 0;
    let lowStockProducts = 0;
    let outOfStockProducts = 0;
    const categories = new Set();
    const stockByCategory = {};

    for (const [productId, product] of Object.entries(produkMap)) {
      const stockCount = product.stok ? product.stok.length : 0;
      const category = getProductCategory(productId, product.name);
      
      totalStockItems += stockCount;
      categories.add(category);
      
      if (stockCount === 0) {
        outOfStockProducts++;
      } else if (stockCount <= 3) {
        lowStockProducts++;
      }

      // Count stock by category
      if (!stockByCategory[category]) {
        stockByCategory[category] = 0;
      }
      stockByCategory[category] += stockCount;
    }

    res.json({
      success: true,
      data: {
        totalProducts: Object.keys(produkMap).length,
        totalStockItems: totalStockItems,
        lowStockProducts: lowStockProducts,
        outOfStockProducts: outOfStockProducts,
        categories: Array.from(categories),
        stockByCategory: stockByCategory
      }
    });
  } catch (error) {
    console.error('Error getting stock summary:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ===== PRODUCT CRUD (BEGIN) =====
// Create product
app.post('/api/dashboard/products', async (req, res) => {
  try {
    const { id, name, desc, priceB = 0, priceS = 0, priceG = 0, snk = '', minStock = 5 } = req.body || {};
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ success: false, message: 'Invalid or missing id' });
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    if (usePg) {
      const existing = await pg.query('SELECT id FROM produk WHERE id=$1', [id]);
      if (existing.rows[0]) return res.status(409).json({ success: false, message: 'Product already exists' });
      const data = { id, name, desc, priceB, priceS, priceG, snk, minStock, stok: [], terjual: 0 };
      await pg.query('INSERT INTO produk(id, name, price, stock, data) VALUES ($1,$2,$3,$4,$5)', [id, name, parseInt(priceB)||0, 0, JSON.stringify(data)]);
      return res.json({ success: true, data });
    }

    const db = await loadDatabaseAsync();
    if (!db) return res.status(500).json({ success: false, message: 'Database not available' });
    if (!db.produk) db.produk = {};
    if (db.produk[id]) return res.status(409).json({ success: false, message: 'Product already exists' });
    db.produk[id] = { id, name, desc, priceB, priceS, priceG, snk, minStock, stok: [], terjual: 0 };
    if (!saveDatabase(db)) return res.status(500).json({ success: false, message: 'Failed to save database' });
    return res.json({ success: true, data: db.produk[id] });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Read product
app.get('/api/dashboard/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const product = usePg ? await loadSingleProdukAsync(productId) : (await loadDatabaseAsync())?.produk?.[productId];
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Update product fields
app.patch('/api/dashboard/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const payload = req.body || {};

    if (usePg) {
      const row = await pg.query('SELECT data FROM produk WHERE id=$1', [productId]);
      if (!row.rows[0]) return res.status(404).json({ success: false, message: 'Product not found' });
      const data = row.rows[0].data || {};
      const updated = { ...data, ...payload };
      const stockCount = Array.isArray(updated.stok) ? updated.stok.length : 0;
      const price = parseInt(updated.priceB || updated.price || 0) || 0;
      await pg.query('UPDATE produk SET name=$2, price=$3, stock=$4, data=$5 WHERE id=$1', [productId, updated.name || data.name || null, price, stockCount, JSON.stringify(updated)]);
      return res.json({ success: true, data: updated });
    }

    const db = await loadDatabaseAsync();
    if (!db || !db.produk || !db.produk[productId]) return res.status(404).json({ success: false, message: 'Product not found' });
    db.produk[productId] = { ...(db.produk[productId] || {}), ...payload };
    if (!saveDatabase(db)) return res.status(500).json({ success: false, message: 'Failed to save database' });
    return res.json({ success: true, data: db.produk[productId] });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Delete product
app.delete('/api/dashboard/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (usePg) {
      const row = await pg.query('SELECT id FROM produk WHERE id=$1', [productId]);
      if (!row.rows[0]) return res.status(404).json({ success: false, message: 'Product not found' });
      await pg.query('DELETE FROM produk WHERE id=$1', [productId]);
      return res.json({ success: true });
    }
    const db = await loadDatabaseAsync();
    if (!db || !db.produk || !db.produk[productId]) return res.status(404).json({ success: false, message: 'Product not found' });
    delete db.produk[productId];
    if (!saveDatabase(db)) return res.status(500).json({ success: false, message: 'Failed to save database' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});
// ===== PRODUCT CRUD (END) =====

// 3. Update Product Stock
app.put('/api/dashboard/products/:productId/stock', async (req, res) => {
  try {
    const { productId } = req.params;
    const { action, stockItems, notes } = req.body;

    if (!action || !stockItems || !Array.isArray(stockItems)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Required: action, stockItems array'
      });
    }

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "add" or "remove"'
      });
    }

    if (usePg) {
      // PG mode
      const result = await updateProdukStockPg(productId, async (prod) => {
        const previousStockCount = Array.isArray(prod.stok) ? prod.stok.length : 0;
        let newStockCount = previousStockCount;
        if (action === 'add') {
          if (!Array.isArray(prod.stok)) prod.stok = [];
          const validStockItems = (stockItems || []).filter(item => typeof item === 'string' && item.includes('|') && item.split('|').length >= 4);
          if (validStockItems.length === 0) throw new Error('Invalid stock item format. Expected: "email|password|profile|pin|notes"');
          prod.stok.push(...validStockItems);
          newStockCount = prod.stok.length;
          prod.lastRestock = new Date().toISOString();
        } else if (action === 'remove') {
          if (!Array.isArray(prod.stok) || prod.stok.length === 0) throw new Error('No stock available to remove');
          const itemsToRemove = Math.min(stockItems.length, prod.stok.length);
          prod.stok.splice(0, itemsToRemove);
          newStockCount = prod.stok.length;
        }
        if (notes) prod.notes = notes;
        return prod;
      }).catch(e => ({ ok: false, error: e.message }));
      if (!result.ok) {
        if (result.error === 'Product not found') return res.status(404).json({ success: false, message: 'Product not found' });
        return res.status(400).json({ success: false, message: result.error });
      }
      return res.json({
        success: true,
        data: {
          productId: productId,
          previousStockCount: result.beforeCount,
          newStockCount: result.newCount,
          addedItems: action === 'add' ? stockItems.length : 0,
          removedItems: action === 'remove' ? Math.min(stockItems.length, result.beforeCount) : 0,
          updatedAt: new Date().toISOString(),
          notes: notes || null
        }
      });
    }
    const db = loadDatabaseAsync ? await loadDatabaseAsync() : null;
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    if (!db.produk[productId]) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = db.produk[productId];
    const previousStockCount = product.stok ? product.stok.length : 0;
    let newStockCount = previousStockCount;

    if (action === 'add') {
      // Add new stock items
      if (!product.stok) {
        product.stok = [];
      }
      
      // Validate stock items format
      const validStockItems = stockItems.filter(item => {
        if (typeof item === 'string') {
          return item.includes('|') && item.split('|').length >= 4;
        }
        return false;
      });

      if (validStockItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid stock item format. Expected: "email|password|profile|pin|notes"'
        });
      }

      product.stok.push(...validStockItems);
      newStockCount = product.stok.length;
      
      // Update last restock timestamp
      product.lastRestock = new Date().toISOString();

    } else if (action === 'remove') {
      // Remove stock items
      if (!product.stok || product.stok.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No stock available to remove'
        });
      }

      // Remove items from the beginning of the array (FIFO)
      const itemsToRemove = Math.min(stockItems.length, product.stok.length);
      product.stok.splice(0, itemsToRemove);
      newStockCount = product.stok.length;
    }

    // Save updated database
    if (saveDatabase(db)) {
      res.json({
        success: true,
        data: {
          productId: productId,
          previousStockCount: previousStockCount,
          newStockCount: newStockCount,
          addedItems: action === 'add' ? stockItems.length : 0,
          removedItems: action === 'remove' ? Math.min(stockItems.length, previousStockCount) : 0,
          updatedAt: new Date().toISOString(),
          notes: notes || null
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to save database'
      });
    }

  } catch (error) {
    console.error('Error updating product stock:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 3a. Add single stock item (optional position)
app.post('/api/dashboard/products/:productId/stock/item', async (req, res) => {
  try {
    const { productId } = req.params;
    const { value, position } = req.body || {};
    if (typeof value !== 'string') return res.status(400).json({ success: false, message: 'value must be string' });
    if (stockHelper.validateStockItem && !stockHelper.validateStockItem(value)) return res.status(400).json({ success: false, message: 'Invalid stock item format. Expected: "email|password|profile|pin|notes"' });

    if (usePg) {
      const r = await updateProdukStockPg(productId, async (prod) => {
        if (!Array.isArray(prod.stok)) prod.stok = [];
        const idx = Number.isInteger(position) ? Math.max(0, Math.min(position, prod.stok.length)) : prod.stok.length;
        prod.stok.splice(idx, 0, value);
        prod.lastRestock = new Date().toISOString();
        return prod;
      });
      if (!r.ok) return res.status(400).json({ success: false, message: r.error || 'Failed to update' });
      return res.json({ success: true, data: { newStockCount: r.newCount } });
    }

    const db = await loadDatabaseAsync();
    if (!db || !db.produk || !db.produk[productId]) return res.status(404).json({ success: false, message: 'Product not found' });
    const prod = db.produk[productId];
    if (!Array.isArray(prod.stok)) prod.stok = [];
    const idx = Number.isInteger(position) ? Math.max(0, Math.min(position, prod.stok.length)) : prod.stok.length;
    prod.stok.splice(idx, 0, value);
    prod.lastRestock = new Date().toISOString();
    if (!saveDatabase(db)) return res.status(500).json({ success: false, message: 'Failed to save database' });
    return res.json({ success: true, data: { newStockCount: prod.stok.length } });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 3b. Edit stock item by index or exact match
app.patch('/api/dashboard/products/:productId/stock/item', async (req, res) => {
  try {
    const { productId } = req.params;
    const { index, match, value } = req.body || {};
    if (typeof value !== 'string') return res.status(400).json({ success: false, message: 'value must be string' });
    if (stockHelper.validateStockItem && !stockHelper.validateStockItem(value)) return res.status(400).json({ success: false, message: 'Invalid stock item format' });

    const mutate = async (prod) => {
      if (!Array.isArray(prod.stok)) prod.stok = [];
      let idx = Number.isInteger(index) ? index : -1;
      if (idx < 0 && typeof match === 'string') idx = prod.stok.findIndex(i => i === match);
      if (idx < 0 || idx >= prod.stok.length) throw new Error('Stock item not found');
      prod.stok[idx] = value;
      return prod;
    };

    if (usePg) {
      const r = await updateProdukStockPg(productId, mutate).catch(e => ({ ok: false, error: e.message }));
      if (!r.ok) return res.status(400).json({ success: false, message: r.error || 'Failed to update' });
      return res.json({ success: true });
    }

    const db = await loadDatabaseAsync();
    if (!db || !db.produk || !db.produk[productId]) return res.status(404).json({ success: false, message: 'Product not found' });
    try { mutate(db.produk[productId]); } catch (e) { return res.status(404).json({ success: false, message: e.message }); }
    if (!saveDatabase(db)) return res.status(500).json({ success: false, message: 'Failed to save database' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 3c. Delete stock item by index or exact match
app.delete('/api/dashboard/products/:productId/stock/item', async (req, res) => {
  try {
    const { productId } = req.params;
    const { index, match } = req.body || {};

    const removeOne = async (prod) => {
      if (!Array.isArray(prod.stok) || prod.stok.length === 0) throw new Error('No stock available to remove');
      let idx = Number.isInteger(index) ? index : -1;
      if (idx < 0 && typeof match === 'string') idx = prod.stok.findIndex(i => i === match);
      if (idx < 0 || idx >= prod.stok.length) throw new Error('Stock item not found');
      prod.stok.splice(idx, 1);
      return prod;
    };

    if (usePg) {
      const r = await updateProdukStockPg(productId, removeOne).catch(e => ({ ok: false, error: e.message }));
      if (!r.ok) return res.status(400).json({ success: false, message: r.error || 'Failed to update' });
      return res.json({ success: true });
    }

    const db = await loadDatabaseAsync();
    if (!db || !db.produk || !db.produk[productId]) return res.status(404).json({ success: false, message: 'Product not found' });
    try { removeOne(db.produk[productId]); } catch (e) { return res.status(404).json({ success: false, message: e.message }); }
    if (!saveDatabase(db)) return res.status(500).json({ success: false, message: 'Failed to save database' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 4. Get Low Stock Alerts
app.get('/api/dashboard/products/stock/alerts', async (req, res) => {
  try {
    const produkMap = await loadProdukMapAsync();
    if (!produkMap || Object.keys(produkMap).length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    const alerts = [];
    const threshold = 5; // Low stock threshold

    for (const [productId, product] of Object.entries(produkMap)) {
      const stockCount = product.stok ? product.stok.length : 0;
      
      if (stockCount <= threshold) {
        alerts.push({
          productId: product.id,
          productName: product.name,
          currentStock: stockCount,
          threshold: threshold,
          status: stockCount === 0 ? 'out' : 'low',
          category: getProductCategory(productId, product.name),
          lastRestock: product.lastRestock || null,
          urgency: stockCount === 0 ? 'critical' : stockCount <= 2 ? 'high' : 'medium'
        });
      }
    }

    // Sort by urgency (critical first, then by stock count)
    alerts.sort((a, b) => {
      if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
      if (b.urgency === 'critical' && a.urgency !== 'critical') return 1;
      return a.currentStock - b.currentStock;
    });

    res.json({
      success: true,
      data: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.urgency === 'critical').length,
        highAlerts: alerts.filter(a => a.urgency === 'high').length,
        mediumAlerts: alerts.filter(a => a.urgency === 'medium').length,
        alerts: alerts
      }
    });

  } catch (error) {
    console.error('Error getting stock alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 5. Get Product Stock History (Basic implementation)
app.get('/api/dashboard/products/:productId/stock/history', async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await loadSingleProdukAsync(productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Basic history - in a real implementation, you'd want to track this separately
    const history = [];
    
    if (product.lastRestock) {
      history.push({
        type: 'restock',
        timestamp: product.lastRestock,
        description: 'Stock added to product',
        quantity: product.stok ? product.stok.length : 0
      });
    }

    res.json({
      success: true,
      data: {
        productId: productId,
        productName: product.name,
        currentStock: product.stok ? product.stok.length : 0,
        history: history,
        message: 'Note: Detailed history tracking requires additional database fields'
      }
    });

  } catch (error) {
    console.error('Error getting product stock history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 6. Get Advanced Stock Analytics
app.get('/api/dashboard/products/stock/analytics', async (req, res) => {
  try {
    const analytics = stockHelper.getStockAnalytics && !usePg ? stockHelper.getStockAnalytics() : null;
    
    if (!analytics) {
      return res.status(404).json({
        success: false,
        message: 'Failed to generate stock analytics'
      });
    }

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting stock analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 7. Generate Stock Report
app.get('/api/dashboard/products/stock/report', async (req, res) => {
  try {
    const report = stockHelper.generateStockReport && !usePg ? stockHelper.generateStockReport() : null;
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Failed to generate stock report'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating stock report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 8. Export Stock Data to CSV
app.get('/api/dashboard/products/stock/export', async (req, res) => {
  try {
    const csv = stockHelper.exportStockToCSV && !usePg ? stockHelper.exportStockToCSV() : null;
    
    if (!csv) {
      return res.status(404).json({
        success: false,
        message: 'Failed to export stock data'
      });
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="stock_report_${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csv);
  } catch (error) {
    console.error('Error exporting stock data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 9. Bulk Stock Update
app.post('/api/dashboard/products/stock/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Required: updates array'
      });
    }

    if (usePg) {
      if (!updates.length) return res.json({ success: true, data: { totalUpdates: 0, successfulUpdates: 0, failedUpdates: 0, results: [] } });
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      for (const update of updates) {
        const { productId, action, stockItems, notes } = update;
        try {
          const r = await updateProdukStockPg(productId, async (prod) => {
            const previousStockCount = Array.isArray(prod.stok) ? prod.stok.length : 0;
            if (action === 'add') {
              if (!Array.isArray(prod.stok)) prod.stok = [];
              const validItems = (stockItems || []).filter(item => stockHelper.validateStockItem ? stockHelper.validateStockItem(item) : (typeof item === 'string'));
              prod.stok.push(...validItems);
              prod.lastRestock = new Date().toISOString();
            } else if (action === 'remove') {
              if (Array.isArray(prod.stok) && prod.stok.length > 0) {
                const itemsToRemove = Math.min((stockItems || []).length, prod.stok.length);
                prod.stok.splice(0, itemsToRemove);
              }
            }
            if (notes) prod.notes = notes;
            return prod;
          });
          if (!r.ok) throw new Error(r.error || 'Update failed');
          results.push({ productId, success: true });
          successCount++;
        } catch (error) {
          results.push({ productId, success: false, error: error.message });
          errorCount++;
        }
      }
      return res.json({ success: true, data: { totalUpdates: updates.length, successfulUpdates: successCount, failedUpdates: errorCount, results } });
    }
    const db = stockHelper.loadDatabase ? stockHelper.loadDatabase() : null;
    if (!db || !db.produk) {
      return res.status(404).json({
        success: false,
        message: 'Database or products not found'
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      const { productId, action, stockItems, notes } = update;
      
      try {
        if (!db.produk[productId]) {
          results.push({
            productId,
            success: false,
            error: 'Product not found'
          });
          errorCount++;
          continue;
        }

        const product = db.produk[productId];
        const previousStockCount = product.stok ? product.stok.length : 0;
        let newStockCount = previousStockCount;

        if (action === 'add') {
          if (!product.stok) product.stok = [];
          
          const validItems = stockItems.filter(item => stockHelper.validateStockItem(item));
          product.stok.push(...validItems);
          newStockCount = product.stok.length;
          product.lastRestock = new Date().toISOString();
          
        } else if (action === 'remove') {
          if (product.stok && product.stok.length > 0) {
            const itemsToRemove = Math.min(stockItems.length, product.stok.length);
            product.stok.splice(0, itemsToRemove);
            newStockCount = product.stok.length;
          }
        }

        results.push({
          productId,
          success: true,
          previousStockCount,
          newStockCount,
          action,
          itemsProcessed: stockItems.length
        });
        successCount++;

      } catch (error) {
        results.push({
          productId,
          success: false,
          error: error.message
        });
        errorCount++;
      }
    }

    // Save database if any updates were successful
    if (successCount > 0) {
      stockHelper.saveDatabase(db);
    }

    res.json({
      success: true,
      data: {
        totalUpdates: updates.length,
        successfulUpdates: successCount,
        failedUpdates: errorCount,
        results: results
      }
    });

  } catch (error) {
    console.error('Error in bulk stock update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 10. Get Product Stock Details
app.get('/api/dashboard/products/:productId/stock/details', async (req, res) => {
  try {
    const { productId } = req.params;

    // Load product data supporting both Postgres and JSON file modes
    let product = null;
    if (usePg) {
      product = await loadSingleProdukAsync(productId);
    } else {
      const db = await loadDatabaseAsync();
      product = db && db.produk ? db.produk[productId] : null;
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const metrics = stockHelper.calculateStockMetrics(product);

    // Parse stock items for detailed view
    const stockItems = (product.stok || []).map(item => {
      const parsed = stockHelper.parseStockItem(item);
      return {
        raw: item,
        parsed: parsed,
        isValid: stockHelper.validateStockItem(item)
      };
    });

    const response = {
      productId: product.id || productId,
      productName: product.name,
      description: product.desc,
      prices: {
        bronze: product.priceB,
        silver: product.priceS,
        gold: product.priceG
      },
      sales: {
        total: product.terjual || 0
      },
      stock: {
        count: metrics.stockCount,
        status: metrics.stockStatus,
        items: stockItems,
        metrics: metrics
      },
      category: metrics.category,
      lastRestock: product.lastRestock || null,
      terms: product.snk || null
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error getting product stock details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ===== ADVANCED DASHBOARD API ENDPOINTS =====

// 11. Advanced Analytics Dashboard
app.get('/api/dashboard/analytics/advanced', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    const profit = db.data.profit || {};
    const persentase = db.data.persentase || {};
    
    // Calculate comprehensive metrics
    const totalUsers = Object.keys(users).length;
    const totalTransactions = transaksi.length;
    const totalRevenue = transaksi.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    const totalProfit = transaksi.reduce((sum, t) => {
      const userRole = t.userRole || 'bronze';
      const profitPercent = persentase[userRole] || 2;
      return sum + Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
    }, 0);
    
    // User role distribution
    const roleDistribution = {};
    Object.values(users).forEach(user => {
      const role = user.role || 'bronze';
      roleDistribution[role] = (roleDistribution[role] || 0) + 1;
    });
    
    // Payment method distribution
    const paymentMethods = {};
    transaksi.forEach(t => {
      const method = t.metodeBayar || 'Unknown';
      paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });
    
    // Monthly growth analysis
    const monthlyData = {};
    transaksi.forEach(t => {
      if (t.date) {
        const month = t.date.slice(0, 7); // YYYY-MM
        if (!monthlyData[month]) {
          monthlyData[month] = {
            transactions: 0,
            revenue: 0,
            profit: 0,
            users: new Set()
          };
        }
        monthlyData[month].transactions++;
        monthlyData[month].revenue += parseInt(t.totalBayar) || 0;
        monthlyData[month].users.add(t.user);
        
        const userRole = t.userRole || 'bronze';
        const profitPercent = persentase[userRole] || 2;
        monthlyData[month].profit += Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
      }
    });
    
    // Convert monthly data for chart
    const monthlyChart = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        transactions: data.transactions,
        revenue: data.revenue,
        profit: data.profit,
        uniqueUsers: data.users.size
      }));
    
    // Top products by revenue
    const productRevenue = {};
    transaksi.forEach(t => {
      const productId = t.id;
      if (!productRevenue[productId]) {
        productRevenue[productId] = {
          id: productId,
          name: t.name,
          totalRevenue: 0,
          totalSold: 0,
          transactionCount: 0
        };
      }
      productRevenue[productId].totalRevenue += parseInt(t.totalBayar) || 0;
      productRevenue[productId].totalSold += t.jumlah || 1;
      productRevenue[productId].transactionCount++;
    });
    
    const topProducts = Object.values(productRevenue)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);
    
    // User activity heatmap (by hour)
    const hourlyActivity = Array(24).fill(0);
    transaksi.forEach(t => {
      if (t.date) {
        try {
          const hour = new Date(t.date).getHours();
          if (!isNaN(hour)) {
            hourlyActivity[hour]++;
          }
        } catch (e) {
          // Handle invalid date format
          const timeMatch = t.date.match(/(\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            if (hour >= 0 && hour < 24) {
              hourlyActivity[hour]++;
            }
          }
        }
      }
    });
    
    // Customer lifetime value
    const userLTV = {};
    transaksi.forEach(t => {
      if (!userLTV[t.user]) {
        userLTV[t.user] = {
          totalSpent: 0,
          transactionCount: 0,
          firstPurchase: t.date,
          lastPurchase: t.date
        };
      }
      userLTV[t.user].totalSpent += parseInt(t.totalBayar) || 0;
      userLTV[t.user].transactionCount++;
      if (t.date < userLTV[t.user].firstPurchase) userLTV[t.user].firstPurchase = t.date;
      if (t.date > userLTV[t.user].lastPurchase) userLTV[t.user].lastPurchase = t.date;
    });
    
    const avgLTV = Object.values(userLTV).reduce((sum, user) => sum + user.totalSpent, 0) / Object.keys(userLTV).length;
    
    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalTransactions,
          totalRevenue,
          totalProfit,
          avgLTV: Math.round(avgLTV)
        },
        distributions: {
          roles: roleDistribution,
          paymentMethods: paymentMethods
        },
        trends: {
          monthly: monthlyChart,
          hourlyActivity: hourlyActivity.map((count, hour) => ({ hour, transactions: count }))
        },
        topProducts: topProducts,
        userMetrics: {
          totalCustomers: Object.keys(userLTV).length,
          averageOrderValue: Math.round(totalRevenue / totalTransactions),
          repeatCustomers: Object.values(userLTV).filter(u => u.transactionCount > 1).length
        }
      }
    });
    
  } catch (error) {
    console.error('Error in advanced analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 12. Product Performance Analytics
app.get('/api/dashboard/products/performance', async (req, res) => {
  try {
    const rawDb = await loadDatabaseAsync();
    const db = await getFormattedDataAsync();
    
    if (!rawDb || !rawDb.produk || !db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const products = rawDb.produk;
    const transaksi = db.data.transaksi || [];
    const persentase = db.data.persentase || {};
    
    // Calculate performance metrics for each product
    const productPerformance = Object.entries(products).map(([productId, product]) => {
      // Get transactions for this product
      const productTransactions = transaksi.filter(t => t.id === productId);
      const totalSold = productTransactions.reduce((sum, t) => sum + (t.jumlah || 1), 0);
      const totalRevenue = productTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
      
      // Calculate profit
      const totalProfit = productTransactions.reduce((sum, t) => {
        const userRole = t.userRole || 'bronze';
        const profitPercent = persentase[userRole] || 2;
        return sum + Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
      }, 0);
      
      // Stock analysis
      const currentStock = product.stok ? product.stok.length : 0;
      const stockStatus = currentStock === 0 ? 'out_of_stock' : 
                         currentStock <= 5 ? 'low_stock' : 'in_stock';
      
      // Performance metrics
      const conversionRate = currentStock > 0 ? (totalSold / (totalSold + currentStock)) * 100 : 0;
      const avgOrderValue = productTransactions.length > 0 ? totalRevenue / productTransactions.length : 0;
      
      // Category detection
      let category = 'Other';
      const name = product.name.toLowerCase();
      if (name.includes('netflix')) category = 'Streaming';
      else if (name.includes('capcut') || name.includes('canva')) category = 'Design';
      else if (name.includes('spotify') || name.includes('youtube')) category = 'Music';
      else if (name.includes('zoom') || name.includes('meet')) category = 'Meeting';
      else if (name.includes('office') || name.includes('word')) category = 'Productivity';
      
      // Price analysis
      const priceRange = {
        bronze: parseInt(product.priceB) || 0,
        silver: parseInt(product.priceS) || parseInt(product.priceB) || 0,
        gold: parseInt(product.priceG) || parseInt(product.priceB) || 0
      };
      
      return {
        id: productId,
        name: product.name,
        description: product.desc,
        category: category,
        prices: priceRange,
        stock: {
          current: currentStock,
          status: stockStatus,
          items: product.stok || []
        },
        sales: {
          totalSold: totalSold,
          totalTransactions: productTransactions.length,
          totalRevenue: totalRevenue,
          totalProfit: totalProfit,
          avgOrderValue: Math.round(avgOrderValue)
        },
        metrics: {
          conversionRate: Math.round(conversionRate * 100) / 100,
          profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0,
          stockTurnover: currentStock > 0 ? Math.round((totalSold / currentStock) * 100) / 100 : 0
        },
        lastSale: productTransactions.length > 0 ? 
          productTransactions.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : null
      };
    });
    
    // Sort by total revenue
    productPerformance.sort((a, b) => b.sales.totalRevenue - a.sales.totalRevenue);
    
    // Category performance summary
    const categoryPerformance = {};
    productPerformance.forEach(product => {
      if (!categoryPerformance[product.category]) {
        categoryPerformance[product.category] = {
          totalProducts: 0,
          totalRevenue: 0,
          totalSold: 0,
          totalProfit: 0,
          avgConversionRate: 0
        };
      }
      
      const cat = categoryPerformance[product.category];
      cat.totalProducts++;
      cat.totalRevenue += product.sales.totalRevenue;
      cat.totalSold += product.sales.totalSold;
      cat.totalProfit += product.sales.totalProfit;
      cat.avgConversionRate += product.metrics.conversionRate;
    });
    
    // Calculate averages for categories
    Object.keys(categoryPerformance).forEach(category => {
      const cat = categoryPerformance[category];
      cat.avgConversionRate = Math.round((cat.avgConversionRate / cat.totalProducts) * 100) / 100;
    });
    
    res.json({
      success: true,
      data: {
        products: productPerformance,
        summary: {
          totalProducts: productPerformance.length,
          totalRevenue: productPerformance.reduce((sum, p) => sum + p.sales.totalRevenue, 0),
          totalProfit: productPerformance.reduce((sum, p) => sum + p.sales.totalProfit, 0),
          bestPerformer: productPerformance[0] || null,
          categories: categoryPerformance
        },
        insights: {
          topByRevenue: productPerformance.slice(0, 5),
          topByProfit: [...productPerformance].sort((a, b) => b.sales.totalProfit - a.sales.totalProfit).slice(0, 5),
          topByConversion: [...productPerformance].sort((a, b) => b.metrics.conversionRate - a.metrics.conversionRate).slice(0, 5),
          lowStock: productPerformance.filter(p => p.stock.status === 'low_stock' || p.stock.status === 'out_of_stock')
        }
      }
    });
    
  } catch (error) {
    console.error('Error in product performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 13. User Behavior Analytics
app.get('/api/dashboard/users/behavior', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const users = db.data.users || {};
    const transaksi = db.data.transaksi || [];
    
    // User segmentation analysis
    const userSegments = {
      new: [], // 0-1 transactions
      regular: [], // 2-5 transactions
      loyal: [], // 6-10 transactions
      vip: [] // 11+ transactions
    };
    
    const userBehavior = {};
    
    // Analyze each user's behavior
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      const userTransactions = transaksi.filter(t => t.user === userId || t.user === `${userId}@s.whatsapp.net`);
      
      const totalTransactions = userTransactions.length;
      const totalSpent = userTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
      const avgOrderValue = totalTransactions > 0 ? totalSpent / totalTransactions : 0;
      
      // Calculate purchase frequency
      let daysBetweenPurchases = 0;
      if (userTransactions.length > 1) {
        const sortedTransactions = userTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstPurchase = new Date(sortedTransactions[0].date);
        const lastPurchase = new Date(sortedTransactions[sortedTransactions.length - 1].date);
        const totalDays = (lastPurchase - firstPurchase) / (1000 * 60 * 60 * 24);
        daysBetweenPurchases = totalDays / (totalTransactions - 1);
      }
      
      // Preferred payment method
      const paymentMethods = {};
      userTransactions.forEach(t => {
        const method = t.metodeBayar || 'Unknown';
        paymentMethods[method] = (paymentMethods[method] || 0) + 1;
      });
      const preferredPayment = Object.entries(paymentMethods)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None';
      
      // Product preferences
      const productPreferences = {};
      userTransactions.forEach(t => {
        const productId = t.id;
        productPreferences[productId] = (productPreferences[productId] || 0) + 1;
      });
      const favoriteProduct = Object.entries(productPreferences)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None';
      
      // Shopping time analysis
      const hourlyPurchases = Array(24).fill(0);
      userTransactions.forEach(t => {
        if (t.date) {
          try {
            const hour = new Date(t.date).getHours();
            if (!isNaN(hour)) {
              hourlyPurchases[hour]++;
            }
          } catch (e) {
            const timeMatch = t.date.match(/(\d{2}):(\d{2}):(\d{2})/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              if (hour >= 0 && hour < 24) {
                hourlyPurchases[hour]++;
              }
            }
          }
        }
      });
      const preferredHour = hourlyPurchases.indexOf(Math.max(...hourlyPurchases));
      
      const userAnalysis = {
        userId: userId,
        username: user.username || `User ${userId.slice(-4)}`,
        saldo: parseInt(user.saldo) || 0,
        role: user.role || 'bronze',
        totalTransactions: totalTransactions,
        totalSpent: totalSpent,
        avgOrderValue: Math.round(avgOrderValue),
        daysBetweenPurchases: Math.round(daysBetweenPurchases),
        preferredPayment: preferredPayment,
        favoriteProduct: favoriteProduct,
        preferredHour: preferredHour,
        lastActivity: user.lastActivity || user.createdAt || null,
        createdAt: user.createdAt || null
      };
      
      userBehavior[userId] = userAnalysis;
      
      // Segment users
      if (totalTransactions <= 1) {
        userSegments.new.push(userAnalysis);
      } else if (totalTransactions <= 5) {
        userSegments.regular.push(userAnalysis);
      } else if (totalTransactions <= 10) {
        userSegments.loyal.push(userAnalysis);
      } else {
        userSegments.vip.push(userAnalysis);
      }
    });
    
    // Calculate segment statistics
    const segmentStats = {};
    Object.entries(userSegments).forEach(([segment, users]) => {
      const totalSpent = users.reduce((sum, user) => sum + user.totalSpent, 0);
      const avgSpent = users.length > 0 ? totalSpent / users.length : 0;
      const avgTransactions = users.length > 0 ? 
        users.reduce((sum, user) => sum + user.totalTransactions, 0) / users.length : 0;
      
      segmentStats[segment] = {
        count: users.length,
        totalSpent: totalSpent,
        avgSpent: Math.round(avgSpent),
        avgTransactions: Math.round(avgTransactions * 10) / 10,
        percentage: users.length > 0 ? Math.round((users.length / Object.keys(users).length) * 100 * 10) / 10 : 0
      };
    });
    
    // Churn analysis (users who haven't purchased in 30+ days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const churnedUsers = Object.values(userBehavior).filter(user => {
      if (!user.lastActivity) return true;
      return new Date(user.lastActivity) < thirtyDaysAgo;
    });
    
    // Payment method preferences by segment
    const paymentBySegment = {};
    Object.entries(userSegments).forEach(([segment, users]) => {
      paymentBySegment[segment] = {};
      users.forEach(user => {
        const method = user.preferredPayment;
        paymentBySegment[segment][method] = (paymentBySegment[segment][method] || 0) + 1;
      });
    });
    
    res.json({
      success: true,
      data: {
        segments: userSegments,
        segmentStats: segmentStats,
        churnAnalysis: {
          churnedUsers: churnedUsers.length,
          churnRate: Math.round((churnedUsers.length / Object.keys(userBehavior).length) * 100 * 10) / 10,
          recentlyActive: Object.values(userBehavior).filter(user => {
            if (!user.lastActivity) return false;
            return new Date(user.lastActivity) >= thirtyDaysAgo;
          }).length
        },
        insights: {
          paymentPreferences: paymentBySegment,
          mostActiveHour: transaksi.reduce((hourCounts, t) => {
            if (t.date) {
              try {
                const hour = new Date(t.date).getHours();
                if (!isNaN(hour)) {
                  hourCounts[hour] = (hourCounts[hour] || 0) + 1;
                }
              } catch (e) {
                const timeMatch = t.date.match(/(\d{2}):(\d{2}):(\d{2})/);
                if (timeMatch) {
                  const hour = parseInt(timeMatch[1]);
                  if (hour >= 0 && hour < 24) {
                    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
                  }
                }
              }
            }
            return hourCounts;
          }, {}),
          topSpenders: Object.values(userBehavior)
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10),
          mostFrequentBuyers: Object.values(userBehavior)
            .sort((a, b) => b.totalTransactions - a.totalTransactions)
            .slice(0, 10)
        }
      }
    });
    
  } catch (error) {
    console.error('Error in user behavior analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 14. Financial Analytics & Insights
app.get('/api/dashboard/finance/analytics', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const transaksi = db.data.transaksi || [];
    const users = db.data.users || {};
    const persentase = db.data.persentase || {};
    
    // Calculate comprehensive financial metrics
    const totalRevenue = transaksi.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    const totalProfit = transaksi.reduce((sum, t) => {
      const userRole = t.userRole || 'bronze';
      const profitPercent = persentase[userRole] || 2;
      return sum + Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
    }, 0);
    
    // Revenue by payment method
    const revenueByPayment = {};
    transaksi.forEach(t => {
      const method = t.metodeBayar || 'Unknown';
      revenueByPayment[method] = (revenueByPayment[method] || 0) + (parseInt(t.totalBayar) || 0);
    });
    
    // Revenue by user role
    const revenueByRole = {};
    const profitByRole = {};
    transaksi.forEach(t => {
      const role = t.userRole || 'bronze';
      revenueByRole[role] = (revenueByRole[role] || 0) + (parseInt(t.totalBayar) || 0);
      
      const profitPercent = persentase[role] || 2;
      const profit = Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
      profitByRole[role] = (profitByRole[role] || 0) + profit;
    });
    
    // Daily revenue analysis (last 30 days)
    const dailyRevenue = {};
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    transaksi.forEach(t => {
      if (t.date) {
        const date = t.date.split(' ')[0]; // Get date part
        const transactionDate = new Date(date);
        
        if (transactionDate >= thirtyDaysAgo) {
          if (!dailyRevenue[date]) {
            dailyRevenue[date] = {
              revenue: 0,
              profit: 0,
              transactions: 0
            };
          }
          
          dailyRevenue[date].revenue += parseInt(t.totalBayar) || 0;
          dailyRevenue[date].transactions++;
          
          const userRole = t.userRole || 'bronze';
          const profitPercent = persentase[userRole] || 2;
          const profit = Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
          dailyRevenue[date].profit += profit;
        }
      }
    });
    
    // Convert to chart data
    const dailyChart = Object.entries(dailyRevenue)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        profit: data.profit,
        transactions: data.transactions,
        avgOrderValue: Math.round(data.revenue / data.transactions)
      }));
    
    // Calculate growth rates
    const currentMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
    
    const currentMonthRevenue = transaksi
      .filter(t => t.date && t.date.startsWith(currentMonth))
      .reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    
    const lastMonthRevenue = transaksi
      .filter(t => t.date && t.date.startsWith(lastMonth))
      .reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    
    const revenueGrowthRate = lastMonthRevenue > 0 ? 
      Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 * 10) / 10 : 0;
    
    // User balance analysis
    const totalUserBalance = Object.values(users).reduce((sum, user) => sum + (parseInt(user.saldo) || 0), 0);
    const avgUserBalance = Object.keys(users).length > 0 ? totalUserBalance / Object.keys(users).length : 0;
    
    // Top revenue generating products
    const productRevenue = {};
    transaksi.forEach(t => {
      if (!productRevenue[t.id]) {
        productRevenue[t.id] = {
          id: t.id,
          name: t.name,
          revenue: 0,
          profit: 0,
          transactions: 0
        };
      }
      
      productRevenue[t.id].revenue += parseInt(t.totalBayar) || 0;
      productRevenue[t.id].transactions++;
      
      const userRole = t.userRole || 'bronze';
      const profitPercent = persentase[userRole] || 2;
      const profit = Math.floor((parseInt(t.price) * (t.jumlah || 1)) * (profitPercent / 100));
      productRevenue[t.id].profit += profit;
    });
    
    const topRevenueProducts = Object.values(productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    // Financial health indicators
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgOrderValue = transaksi.length > 0 ? totalRevenue / transaksi.length : 0;
    
    res.json({
      success: true,
      data: {
        overview: {
          totalRevenue: totalRevenue,
          totalProfit: totalProfit,
          profitMargin: Math.round(profitMargin * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue),
          totalTransactions: transaksi.length,
          revenueGrowthRate: revenueGrowthRate
        },
        distributions: {
          byPaymentMethod: revenueByPayment,
          byUserRole: revenueByRole,
          profitByRole: profitByRole
        },
        trends: {
          daily: dailyChart,
          monthly: {
            current: currentMonthRevenue,
            previous: lastMonthRevenue,
            growthRate: revenueGrowthRate
          }
        },
        userFinances: {
          totalBalance: totalUserBalance,
          avgBalance: Math.round(avgUserBalance),
          balanceDistribution: {
            high: Object.values(users).filter(u => (parseInt(u.saldo) || 0) >= 100000).length,
            medium: Object.values(users).filter(u => {
              const saldo = parseInt(u.saldo) || 0;
              return saldo >= 50000 && saldo < 100000;
            }).length,
            low: Object.values(users).filter(u => (parseInt(u.saldo) || 0) < 50000).length
          }
        },
        topProducts: topRevenueProducts,
        insights: {
          healthScore: Math.round((profitMargin + (revenueGrowthRate > 0 ? 10 : 0) + 
            (avgOrderValue > 10000 ? 10 : 5)) * 10) / 10,
          recommendations: [
            profitMargin < 10 ? "Consider optimizing profit margins" : null,
            revenueGrowthRate < 0 ? "Focus on customer acquisition" : null,
            avgOrderValue < 15000 ? "Implement upselling strategies" : null
          ].filter(Boolean)
        }
      }
    });
    
  } catch (error) {
    console.error('Error in financial analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 15. Real-time Dashboard Data
app.get('/api/dashboard/realtime', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const transaksi = db.data.transaksi || [];
    const users = db.data.users || {};
    
    // Get today's data
    const today = new Date().toISOString().slice(0, 10);
    const todayTransactions = transaksi.filter(t => t.date && t.date.startsWith(today));
    
    // Get last 24 hours data
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent24hTransactions = transaksi.filter(t => {
      if (!t.date) return false;
      try {
        return new Date(t.date) >= last24Hours;
      } catch (e) {
        return t.date.startsWith(today);
      }
    });
    
    // Real-time metrics
    const todayRevenue = todayTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    const last24hRevenue = recent24hTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0);
    
    // Hourly breakdown for today
    const hourlyData = Array(24).fill(0).map((_, hour) => ({
      hour: hour,
      transactions: 0,
      revenue: 0
    }));
    
    todayTransactions.forEach(t => {
      try {
        const hour = new Date(t.date).getHours();
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hourlyData[hour].transactions++;
          hourlyData[hour].revenue += parseInt(t.totalBayar) || 0;
        }
      } catch (e) {
        const timeMatch = t.date.match(/(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          if (hour >= 0 && hour < 24) {
            hourlyData[hour].transactions++;
            hourlyData[hour].revenue += parseInt(t.totalBayar) || 0;
          }
        }
      }
    });
    
    // Active users (users with transactions in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = new Set();
    transaksi.forEach(t => {
      if (t.date) {
        try {
          if (new Date(t.date) >= sevenDaysAgo) {
            activeUsers.add(t.user);
          }
        } catch (e) {
          // Handle date parsing error
        }
      }
    });
    
    // Top products today
    const todayProducts = {};
    todayTransactions.forEach(t => {
      if (!todayProducts[t.id]) {
        todayProducts[t.id] = {
          id: t.id,
          name: t.name,
          sold: 0,
          revenue: 0
        };
      }
      todayProducts[t.id].sold += t.jumlah || 1;
      todayProducts[t.id].revenue += parseInt(t.totalBayar) || 0;
    });
    
    const topTodayProducts = Object.values(todayProducts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    
    // Recent transactions (last 10)
    const recentTransactions = transaksi
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10)
      .map(t => ({
        id: t.reffId || t.id,
        product: t.name,
        user: t.user,
        amount: parseInt(t.totalBayar) || 0,
        method: t.metodeBayar,
        time: t.date
      }));
    
    // Performance indicators
    const avgOrderValue = todayTransactions.length > 0 ? todayRevenue / todayTransactions.length : 0;
    const conversionRate = Object.keys(users).length > 0 ? 
      (activeUsers.size / Object.keys(users).length) * 100 : 0;
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        today: {
          transactions: todayTransactions.length,
          revenue: todayRevenue,
          avgOrderValue: Math.round(avgOrderValue),
          topProducts: topTodayProducts
        },
        last24h: {
          transactions: recent24hTransactions.length,
          revenue: last24hRevenue
        },
        realtime: {
          activeUsers: activeUsers.size,
          totalUsers: Object.keys(users).length,
          conversionRate: Math.round(conversionRate * 100) / 100,
          hourlyData: hourlyData
        },
        recent: {
          transactions: recentTransactions
        },
        alerts: [
          todayRevenue < 50000 ? { type: 'warning', message: 'Low daily revenue' } : null,
          activeUsers.size < 10 ? { type: 'info', message: 'Low user activity' } : null
        ].filter(Boolean)
      }
    });
    
  } catch (error) {
    console.error('Error in realtime dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// === LOGS API ===
// Endpoint: GET /logs (static last 100 lines)
app.get("/logs", (req, res) => {
  // udah bisa diapakai kan ?
  try {
    exec("journalctl -u bot-wa -n 100 --no-pager -r", (error, stdout, stderr) => {
      if (error) {
        // Jika terjadi error, kirim status 500 dan pesan error
        return res.status(500).send(`Error: ${stderr || error.message}`);
      }
      res.type("text/plain").send(stdout);
    });
  } catch (e) {
    res.status(500).send(`Exception: ${e.message}`);
  }
});

// Endpoint: GET /logs/stream (realtime)
app.get("/logs/stream", (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const journal = spawn("journalctl", ["-u", "bot-wa", "-f", "--no-pager"]);

    journal.stdout.on("data", (data) => {
      res.write(data.toString());
    });

    journal.stderr.on("data", (data) => {
      res.write(`ERR: ${data.toString()}`);
    });

    journal.on("error", (err) => {
      res.write(`Process error: ${err.message}\n`);
    });
    const keepAlive = setInterval(() => { try { res.write("\n"); } catch {} }, 15000);
    req.on("close", () => {
      clearInterval(keepAlive);
      try { journal.kill(); } catch {}
    });
  } catch (e) {
    res.status(500).send(`Exception: ${e.message}`);
  }
});

// Realtime via Server-Sent Events (better compatibility, auto-reconnect on client)
app.get("/logs/sse", (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no' // avoid buffering in some proxies
    });
    if (res.flushHeaders) try { res.flushHeaders(); } catch {}
    res.write('retry: 2000\n\n');

    const journal = spawn("journalctl", ["-u", "bot-wa", "-f", "--no-pager"]);

    const send = (line) => {
      res.write(`data: ${line.replace(/\n/g, ' ')}\n\n`);
    };

    journal.stdout.on("data", (data) => {
      const text = data.toString();
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length) send(line);
      }
    });
    journal.stderr.on("data", (data) => {
      const text = data.toString();
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length) send(`ERR: ${line}`);
      }
    });
    journal.on("error", (err) => {
      send(`Process error: ${err.message}`);
    });

    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
    const cleanup = () => {
      clearInterval(keepAlive);
      try { journal.kill(); } catch {}
    };
    req.on("close", cleanup);
  } catch (e) {
    res.status(500).send(`Exception: ${e.message}`);
  }
});

// Simple HTML viewer with auto-prepend (newest at top) and auto-scroll to top
app.get("/logs/view", (req, res) => {
  res.type("text/html").send(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>bot-wa logs</title>
    <style>
      body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #0b0e14; color: #e6e1cf; }
      #bar { position: sticky; top: 0; background: #11151c; padding: 8px 12px; border-bottom: 1px solid #232936; display: flex; gap: 8px; align-items: center; }
      #logs { padding: 8px 12px; white-space: pre-wrap; word-break: break-word; }
      .line { border-bottom: 1px dashed #232936; padding: 4px 0; }
      button { background: #1f2430; color: #e6e1cf; border: 1px solid #2b3245; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
      button:hover { background: #2b3245; }
    </style>
  </head>
  <body>
    <div id="bar">
      <button id="pauseBtn">Pause</button>
      <button id="clearBtn">Clear</button>
      <span id="status">Connecting…</span>
    </div>
    <div id="logs"></div>
    <script>
      const logsEl = document.getElementById('logs');
      const statusEl = document.getElementById('status');
      const pauseBtn = document.getElementById('pauseBtn');
      const clearBtn = document.getElementById('clearBtn');
      let paused = false;

      pauseBtn.onclick = () => {
        paused = !paused;
        pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      };
      clearBtn.onclick = () => { logsEl.innerHTML = ''; };

      function prependLine(text) {
        const div = document.createElement('div');
        div.className = 'line';
        div.textContent = text;
        logsEl.prepend(div);
        // Keep view focused on the newest entries at the top
        window.scrollTo(0, 0);
      }

      async function connectStream() {
        statusEl.textContent = 'Connecting…';
        try {
          const resp = await fetch('/logs/stream');
          statusEl.textContent = 'Live';
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (!paused && line.trim().length) prependLine(line);
            }
          }
          statusEl.textContent = 'Disconnected';
        } catch (e) {
          statusEl.textContent = 'Error: ' + e.message;
          setTimeout(connectStream, 2000);
        }
      }
      connectStream();
    </script>
  </body>
</html>`
  );
});

// 16. Predictive Analytics
app.get('/api/dashboard/predictions', async (req, res) => {
  try {
    const db = await getFormattedDataAsync();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const transaksi = db.data.transaksi || [];
    const users = db.data.users || {};
    
    // Monthly revenue prediction based on historical data
    const monthlyRevenue = {};
    transaksi.forEach(t => {
      if (t.date) {
        const month = t.date.slice(0, 7);
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (parseInt(t.totalBayar) || 0);
      }
    });
    
    const monthlyData = Object.entries(monthlyRevenue)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));
    
    // Simple linear regression for revenue prediction
    let predictedRevenue = 0;
    if (monthlyData.length >= 3) {
      const recentMonths = monthlyData.slice(-3);
      const avgGrowth = recentMonths.reduce((sum, curr, idx) => {
        if (idx === 0) return 0;
        const prev = recentMonths[idx - 1];
        const growth = (curr.revenue - prev.revenue) / prev.revenue;
        return sum + growth;
      }, 0) / (recentMonths.length - 1);
      
      const lastMonthRevenue = recentMonths[recentMonths.length - 1].revenue;
      predictedRevenue = Math.round(lastMonthRevenue * (1 + avgGrowth));
    }
    
    // User growth prediction
    const monthlyUsers = {};
    Object.values(users).forEach(user => {
      if (user.createdAt) {
        const month = user.createdAt.slice(0, 7);
        monthlyUsers[month] = (monthlyUsers[month] || 0) + 1;
      }
    });
    
    const userGrowthData = Object.entries(monthlyUsers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, users: count }));
    
    let predictedUsers = 0;
    if (userGrowthData.length >= 3) {
      const recentUserGrowth = userGrowthData.slice(-3);
      const avgUserGrowth = recentUserGrowth.reduce((sum, curr, idx) => {
        if (idx === 0) return 0;
        const prev = recentUserGrowth[idx - 1];
        const growth = curr.users - prev.users;
        return sum + growth;
      }, 0) / (recentUserGrowth.length - 1);
      
      predictedUsers = Math.round(Math.max(0, avgUserGrowth));
    }
    
    // Product demand prediction
    const productDemand = {};
    transaksi.forEach(t => {
      const week = new Date(t.date).toISOString().slice(0, 10);
      if (!productDemand[t.id]) {
        productDemand[t.id] = {
          name: t.name,
          weeklyData: {}
        };
      }
      productDemand[t.id].weeklyData[week] = (productDemand[t.id].weeklyData[week] || 0) + (t.jumlah || 1);
    });
    
    // Predict stock needs for top products
    const stockPredictions = Object.entries(productDemand)
      .map(([productId, data]) => {
        const weeklyValues = Object.values(data.weeklyData);
        if (weeklyValues.length < 2) return null;
        
        const avgWeeklySales = weeklyValues.reduce((sum, val) => sum + val, 0) / weeklyValues.length;
        const predictedMonthlySales = Math.round(avgWeeklySales * 4.33); // Average weeks per month
        
        return {
          productId,
          name: data.name,
          avgWeeklySales: Math.round(avgWeeklySales),
          predictedMonthlySales,
          recommendedStock: Math.round(predictedMonthlySales * 1.2) // 20% buffer
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.predictedMonthlySales - a.predictedMonthlySales)
      .slice(0, 10);
    
    // Churn risk analysis
    const churnRisk = Object.keys(users).map(userId => {
      const userTransactions = transaksi.filter(t => t.user === userId);
      if (userTransactions.length === 0) return null;
      
      const lastTransaction = userTransactions.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const daysSinceLastPurchase = Math.floor((Date.now() - new Date(lastTransaction.date)) / (1000 * 60 * 60 * 24));
      
      let riskLevel = 'low';
      if (daysSinceLastPurchase > 60) riskLevel = 'high';
      else if (daysSinceLastPurchase > 30) riskLevel = 'medium';
      
      return {
        userId,
        username: users[userId]?.username || `User ${userId.slice(-4)}`,
        daysSinceLastPurchase,
        riskLevel,
        totalSpent: userTransactions.reduce((sum, t) => sum + (parseInt(t.totalBayar) || 0), 0),
        transactionCount: userTransactions.length
      };
    })
    .filter(Boolean)
    .filter(user => user.riskLevel !== 'low')
    .sort((a, b) => b.totalSpent - a.totalSpent);
    
    // Market trends analysis
    const categoryTrends = {};
    transaksi.forEach(t => {
      let category = 'Other';
      const name = t.name.toLowerCase();
      if (name.includes('netflix')) category = 'Streaming';
      else if (name.includes('capcut') || name.includes('canva')) category = 'Design';
      else if (name.includes('spotify') || name.includes('youtube')) category = 'Music';
      
      const month = t.date.slice(0, 7);
      if (!categoryTrends[category]) categoryTrends[category] = {};
      categoryTrends[category][month] = (categoryTrends[category][month] || 0) + (t.jumlah || 1);
    });
    
    res.json({
      success: true,
      data: {
        revenue: {
          historical: monthlyData,
          predicted: {
            nextMonth: predictedRevenue,
            confidence: monthlyData.length >= 6 ? 'high' : 'medium'
          }
        },
        users: {
          historical: userGrowthData,
          predicted: {
            nextMonthNewUsers: predictedUsers,
            totalPredicted: Object.keys(users).length + predictedUsers
          }
        },
        inventory: {
          stockPredictions: stockPredictions,
          totalRecommendedStock: stockPredictions.reduce((sum, p) => sum + p.recommendedStock, 0)
        },
        churnRisk: {
          highRisk: churnRisk.filter(u => u.riskLevel === 'high').length,
          mediumRisk: churnRisk.filter(u => u.riskLevel === 'medium').length,
          usersAtRisk: churnRisk.slice(0, 10)
        },
        trends: {
          categories: categoryTrends,
          insights: [
            'Streaming services show consistent demand',
            'Design tools gaining popularity',
            'Consider seasonal promotions'
          ]
        },
        recommendations: [
          predictedRevenue < monthlyData[monthlyData.length - 1]?.revenue ? 
            'Revenue decline predicted - implement retention strategies' : null,
          churnRisk.length > Object.keys(users).length * 0.2 ? 
            'High churn risk detected - focus on customer engagement' : null,
          stockPredictions.some(p => p.recommendedStock > 50) ? 
            'High demand products identified - ensure adequate stock' : null
        ].filter(Boolean)
      }
    });
    
  } catch (error) {
    console.error('Error in predictive analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
if (require.main === module) {
  // HTTP Server
  try {
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, () => {
      console.log(`ðŸš€ Dashboard API HTTP server running on port ${PORT}`);
      console.log(`ðŸ“± Access via: http://localhost:${PORT} or http://dash.nicola.id:${PORT}`);
    });
    
    httpServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`âŒ Port ${PORT} is already in use. Please use a different port.`);
      } else {
        console.error(`âŒ HTTP server error:`, error);
      }
    });
  } catch (error) {
    console.error(`âŒ Failed to start HTTP server:`, error);
  }

  // HTTPS Server (if SSL certificates exist - Linux/Unix only)
  if (process.platform !== 'win32') {
    try {
      const privateKey = fs.readFileSync('/etc/letsencrypt/live/dash.nicola.id/privkey.pem', 'utf8');
      const certificate = fs.readFileSync('/etc/letsencrypt/live/dash.nicola.id/cert.pem', 'utf8');
      const ca = fs.readFileSync('/etc/letsencrypt/live/dash.nicola.id/chain.pem', 'utf8');

      const credentials = {
        key: privateKey,
        cert: certificate,
        ca: ca
      };

      const httpsServer = https.createServer(credentials, app);
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`ðŸ”’ Dashboard API HTTPS server running on port ${HTTPS_PORT}`);
        console.log(`ðŸŒ Access via: https://dash.nicola.id:${HTTPS_PORT}`);
      });
    } catch (error) {
      console.log(`âš ï¸  HTTPS server not started: SSL certificates not found`);
      console.log(`ðŸ’¡ To enable HTTPS, ensure SSL certificates are available at /etc/letsencrypt/live/dash.nicola.id/`);
    }
  } else {
    console.log(`âš ï¸  HTTPS server not started: Windows platform detected`);
    console.log(`ðŸ’¡ HTTPS is not supported on Windows in this configuration`);
  }

  console.log(`\nðŸ“š API Documentation:`);
  console.log(`\nðŸ”§ Basic Endpoints:`);
  console.log(`- GET /api/dashboard/overview`);
  console.log(`- GET /api/dashboard/chart/daily`);
  console.log(`- GET /api/dashboard/chart/monthly`);
  console.log(`- GET /api/dashboard/users/activity`);
  console.log(`- GET /api/dashboard/users/all?page=1&limit=10&search=&role=all`);
  console.log(`- GET /api/dashboard/users/:userId/transactions`);
  console.log(`- GET /api/dashboard/transactions/search/:reffId`);
  console.log(`- GET /api/dashboard/transactions/recent?limit=20`);
  console.log(`- GET /api/dashboard/export/:format`);
  
  console.log(`\nðŸ“Š Statistics & Analytics:`);
  console.log(`- GET /api/dashboard/users/stats`);
  console.log(`- GET /api/dashboard/products/stats`);
  console.log(`- GET /api/dashboard/analytics/advanced`);
  console.log(`- GET /api/dashboard/products/performance`);
  console.log(`- GET /api/dashboard/users/behavior`);
  console.log(`- GET /api/dashboard/finance/analytics`);
  console.log(`- GET /api/dashboard/realtime`);
  console.log(`- GET /api/dashboard/predictions`);
  
  console.log(`\nðŸ“¦ Stock Management:`);
  console.log(`- GET /api/dashboard/products/stock`);
  console.log(`- GET /api/dashboard/products/stock/summary`);
  console.log(`- PUT /api/dashboard/products/:productId/stock`);
  console.log(`- GET /api/dashboard/products/stock/alerts`);
  console.log(`- GET /api/dashboard/products/:productId/stock/history`);
  console.log(`- GET /api/dashboard/products/stock/analytics`);
  console.log(`- GET /api/dashboard/products/stock/report`);
  console.log(`- GET /api/dashboard/products/stock/export`);
  console.log(`- POST /api/dashboard/products/stock/bulk-update`);
  console.log(`- GET /api/dashboard/products/:productId/stock/details`);
  
  console.log(`\n🧾 Receipt Management:`);
  console.log(`- GET /api/dashboard/receipts`);
  console.log(`- GET /api/dashboard/receipts/:reffId`);
  console.log(`- GET /api/dashboard/receipts/:reffId/download`);
  console.log(`- GET /api/dashboard/transactions/:reffId/with-receipt`);
  console.log(`- DELETE /api/dashboard/receipts/:reffId`);
}

// ===== RECEIPT MANAGEMENT API ENDPOINTS =====

// 1. Get all receipts list
app.get('/api/dashboard/receipts', async (req, res) => {
  try {
    const receiptsDir = path.join(__dirname, 'receipts');
    
    if (!fs.existsSync(receiptsDir)) {
      return res.json({
        success: true,
        data: {
          receipts: [],
          total: 0,
          message: 'No receipts found'
        }
      });
    }

    const files = fs.readdirSync(receiptsDir);
    const receiptFiles = files.filter(file => file.endsWith('.txt'));
    
    const receipts = receiptFiles.map(file => {
      const reffId = file.replace('.txt', '');
      const filePath = path.join(receiptsDir, file);
      const stats = fs.statSync(filePath);
      
      return {
        reffId: reffId,
        filename: file,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size)
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: {
        receipts: receipts,
        total: receipts.length
      }
    });

  } catch (error) {
    console.error('Error getting receipts list:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 2. Get specific receipt content
app.get('/api/dashboard/receipts/:reffId', async (req, res) => {
  try {
    const { reffId } = req.params;
    const receiptPath = path.join(__dirname, 'receipts', `${reffId}.txt`);
    
    if (!fs.existsSync(receiptPath)) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    const content = fs.readFileSync(receiptPath, 'utf8');
    const stats = fs.statSync(receiptPath);
    
    res.json({
      success: true,
      data: {
        reffId: reffId,
        content: content,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size)
      }
    });

  } catch (error) {
    console.error('Error getting receipt content:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 3. Download receipt file
app.get('/api/dashboard/receipts/:reffId/download', async (req, res) => {
  try {
    const { reffId } = req.params;
    const receiptPath = path.join(__dirname, 'receipts', `${reffId}.txt`);
    
    if (!fs.existsSync(receiptPath)) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    res.download(receiptPath, `${reffId}.txt`, (err) => {
      if (err) {
        console.error('Error downloading receipt:', err);
        res.status(500).json({
          success: false,
          message: 'Error downloading file',
          error: err.message
        });
      }
    });

  } catch (error) {
    console.error('Error downloading receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

app.get('/api/dashboard/transactions/:reffId/with-receipt', async (req, res) => {
  try {
    const { reffId } = req.params;
    
    const db = await loadDatabaseAsync();
    if (!db || !db.transaksi) {
      return res.status(404).json({
        success: false,
        message: 'Transaction database not found'
      });
    }

    const transaction = db.transaksi.find(t => t.reffId === reffId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Get receipt content
    const receiptPath = path.join(__dirname, 'receipts', `${reffId}.txt`);
    let receiptContent = null;
    let receiptExists = false;
    
    if (fs.existsSync(receiptPath)) {
      receiptContent = fs.readFileSync(receiptPath, 'utf8');
      receiptExists = true;
    }

    res.json({
      success: true,
      data: {
        transaction: transaction,
        receipt: {
          exists: receiptExists,
          content: receiptContent,
          reffId: reffId
        }
      }
    });

  } catch (error) {
    console.error('Error getting transaction with receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 5. Delete receipt
app.delete('/api/dashboard/receipts/:reffId', async (req, res) => {
  try {
    const { reffId } = req.params;
    const receiptPath = path.join(__dirname, 'receipts', `${reffId}.txt`);
    
    if (!fs.existsSync(receiptPath)) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    fs.unlinkSync(receiptPath);
    
    res.json({
      success: true,
      message: 'Receipt deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = app; 