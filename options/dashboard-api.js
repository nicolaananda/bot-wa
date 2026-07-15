require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const { getDashboardData, getDailyChartData, getMonthlyChartData } = require('./dashboard-helper');
// Midtrans webhook integration
const crypto = require('crypto');
const axios = require('axios');
const envValidator = require('../config/env-validator');
envValidator.validateOrExit();
const { clearCachedPaymentData } = require('../config/midtrans');
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

// Use shared Redis client from config/redis.js
const { getRedis } = require('../config/redis');

// Import stock helper functions
const stockHelper = require('./stock-helper');
const DatabaseClass = require('../function/database');

let dbInstance = null;
async function getDbInstance() {
  if (dbInstance) return dbInstance;
  dbInstance = global.db || new DatabaseClass();
  if (typeof dbInstance.load === 'function') {
    await dbInstance.load();
  }
  if (!global.db) {
    global.db = dbInstance;
  }
  return dbInstance;
}
const { getReceipt, receiptExists, deleteReceipt } = require('../config/r2-storage');
const dbHelper = require('./db-helper');

// Contoh API endpoint untuk dashboard web
// Pastikan install: npm install express cors

const app = express();
const PORT = process.env.PORT || 3002;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// CORS
const allowedOrigins = [
  'http://dash.nicola.id',
  'https://dash.nicola.id',
  'http://localhost:8080',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://pos.nicola.id',
  'https://api.nicola.id',
  'https://mid.nicola.id',
  'https://dash.ghzm.us',
  'http://mid.nicola.id',
];

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server or curl requests with no origin
    if (!origin) return callback(null, true);

    // Some proxies append duplicate origins separated by commas; take the first
    const originValue = String(origin || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)[0];

    try {
      const hostname = new URL(originValue).hostname;
      if (allowedOrigins.includes(originValue) || hostname.endsWith('.nicola.id')) {
        return callback(null, true);
      }
    } catch (err) {
      // Fall through to rejection if origin is malformed
      console.error('[CORS] Invalid origin format:', originValue, err?.message);
    }

    console.warn('[CORS] Blocked origin:', originValue);
    return callback(new Error(`Origin ${originValue} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' })); // ganti yang sebelumnya app.use(express.json())
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
let pg; if (usePg) { pg = require('../config/postgres'); }

// Function untuk membaca database snapshot dari Postgres
async function loadDatabaseAsync() {
  try {
    const instance = await getDbInstance();
    if (typeof instance.load === 'function') {
      await instance.load();
    }
    return instance.data || {};
  } catch (error) {
    console.error('Error loading database snapshot:', error);
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

// Test endpoint untuk cek webhook accessible (harus sebelum catch-all route)
app.get('/webhook/midtrans/test', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    url: '/webhook/midtrans',
    server: 'dashboard-api'
  });
});

app.post('/webhook/midtrans', async (req, res) => {
  try {
    const notification = req.body;
    console.log('🔔 [Webhook] Midtrans notification:', JSON.stringify(notification));

    if (!verifyMidtransSignature(notification)) {
      console.error('❌ [Webhook] Invalid signature for', notification.order_id);
      return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    const { order_id, transaction_status, payment_type, settlement_time, gross_amount } = notification;
    console.log(`📋 [Webhook] Order: ${order_id}, Status: ${transaction_status}, Payment: ${payment_type}, Amount: ${gross_amount}`);

    // Clear any cached status to avoid stale reads
      try { clearCachedPaymentData(order_id); } catch { /* ignored */ }

    if (/(settlement|capture)/i.test(String(transaction_status))) {
      console.log(`✅ [Webhook] Payment successful for ${order_id}`);

      const webhookData = {
        orderId: order_id,
        transactionStatus: transaction_status,
        paymentType: payment_type,
        settlementTime: settlement_time,
        gross_amount: gross_amount || notification.gross_amount || 0
      };

      // Emit event untuk process yang sama
      process.emit('payment-completed', webhookData);

      const midtransRedis = getRedis();
      if (midtransRedis) {
        try {
          midtransRedis.publish('midtrans:events', JSON.stringify({
            event: 'payment-completed',
            data: webhookData
          }));
          console.log(`📡 [Webhook] Published to Redis midtrans:events: ${order_id}`);
        } catch (publishError) {
          console.error(`❌ [Webhook] Failed to publish to Redis:`, publishError.message);
        }
      }

      // Simpan ke PostgreSQL database untuk bot-wa process (lebih reliable untuk multi-process)
      try {
        if (usePg && pg) {
          // Simpan ke PostgreSQL
          await pg.query(
            `INSERT INTO midtrans_webhooks 
             (order_id, transaction_id, transaction_status, payment_type, gross_amount, settlement_time, processed, webhook_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT DO NOTHING`,
            [
              order_id,
              notification.transaction_id || null,
              transaction_status,
              payment_type,
              Number(gross_amount || 0),
              settlement_time ? new Date(settlement_time) : null,
              false,
              JSON.stringify(notification)
            ]
          );
          console.log(`💾 [Webhook] Saved webhook to PostgreSQL: OrderID ${order_id}, Amount Rp${gross_amount}`);
        } else {
          // Fallback ke JSON database jika PostgreSQL tidak tersedia
          const db = await getDbInstance();
          if (db && db.data) {
            if (!db.data.midtransWebhooks) db.data.midtransWebhooks = [];

            // Hapus webhook lama (lebih dari 1 jam)
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            db.data.midtransWebhooks = db.data.midtransWebhooks.filter(w => w.timestamp > oneHourAgo);

            // Tambah webhook baru
            db.data.midtransWebhooks.push({
              ...webhookData,
              timestamp: Date.now(),
              processed: false
            });

            if (typeof db.save === 'function') {
              await db.save();
            }

            console.log(`💾 [Webhook] Saved webhook to JSON database: OrderID ${order_id}`);
          }
        }
      } catch (dbError) {
        console.error(`❌ [Webhook] Error saving to database:`, dbError.message);
      }
    }

    // Forward ke server Nala jika order_id untuk Nala
    const orderId = notification.order_id || '';
    const NALA_PREFIXES = ['BOOK-', 'BELAJAR-', 'SKET-', 'BAJU-', 'G60-', 'GG-', 'GRASP-', 'CLASS-'];
    const isNalaTransaction = NALA_PREFIXES.some(prefix => orderId.startsWith(prefix));

    if (isNalaTransaction) {
      try {
        await axios.post('https://api.artstudionala.com/api/midtrans/notification', notification, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        });
        console.log(`✅ [Webhook] Forwarded to nala: ${orderId}`);
      } catch (error) {
        console.error(`❌ [Webhook] Failed to forward to nala: ${error.message}`);
        if (error.response) {
          console.error(`   Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data));
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('❌ [Webhook] Error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ===== Gowa WhatsApp Webhook =====
// Webhook endpoint for incoming WhatsApp messages from Gowa service
app.post('/webhook/gowa', async (req, res) => {
  try {
    const secret = process.env.GOWA_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers['x-hub-signature-256'];
      if (!signature) {
        return res.status(401).json({ success: false, error: 'Missing signature' });
      }
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
      if (signature !== expected) {
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
    }

    const webhookData = req.body;
    console.log('[GOWA-WEBHOOK] Received:', JSON.stringify(webhookData).substring(0, 200));

    // Publish to Redis for bot to consume
    // Check if redisClient exists and is ready (ioredis uses .status, but we can check existence too)
    const redisClient = getRedis();
    if (redisClient) {
      await redisClient.publish('gowa:messages', JSON.stringify(webhookData));
      console.log('[GOWA-WEBHOOK] Published to Redis');
    } else {
      console.warn('[GOWA-WEBHOOK] Redis not available, message dropped');
    }

    return res.status(200).json({ success: true, status: 'ok' });
  } catch (error) {
    console.error('[GOWA-WEBHOOK] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint for Gowa webhook
app.get('/webhook/gowa/test', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: 'Gowa webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    url: '/webhook/gowa',
    adapterReady: !!global.gowaAdapter
  });
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
async function parseDeliveredAccountFromFile(reffId) {
  try {
    const filePath = path.join(__dirname, `TRX-${reffId}.txt`);
    try {
      await fsPromises.access(filePath);
    } catch {
      return null;
    }

    const content = await fsPromises.readFile(filePath, 'utf8');
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
  } catch {
    return null;
  }
}

const POS_TOKEN = process.env.DB_TOKEN || process.env.VITE_DB_TOKEN;

function posAuth(req, res) {
  if (!POS_TOKEN) return true;
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${POS_TOKEN}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}



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

function _findUserRecord(db, userId) {
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
  } catch { /* ignored */ }
}

function generateAuditId() {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
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
      const txs = transaksi.filter(t => t.user === idNoSuffix || t.user === `${idNoSuffix}@s.whatsapp.net`); return {
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
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 2) Adjust saldo
app.patch('/api/admin/users/:userId/saldo', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { userId } = req.params;
    const { amount, reason = '', idempotencyKey } = req.body;
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
      // No limit - allow negative saldo (admin can set any value)
      await pg.query('INSERT INTO users(user_id, saldo, role, data) VALUES ($1,$2,' + "'bronze'" + ', ' + "'{}'" + '::jsonb) ON CONFLICT (user_id) DO UPDATE SET saldo=$2', [userId, after]);
      const auditId = generateAuditId();
      writeAudit({ id: auditId, admin: req.adminUser, userId, action: 'saldo.adjust', delta: amount, reason: reason || null, before, after, timestamp: new Date().toISOString(), ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null });
      return res.json({ success: true, data: { userId, before, after, delta: amount, auditId } });
    }
    return res.status(500).json({ success: false, error: 'PostgreSQL mode is required' });
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3) Set PIN
app.post('/api/admin/users/:userId/pin', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { userId } = req.params;
    const { pin } = req.body;
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
    return res.status(500).json({ success: false, error: 'PostgreSQL mode is required' });
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 4) Update role
app.patch('/api/admin/users/:userId/role', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { userId } = req.params;
    const { role } = req.body;
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
    return res.status(500).json({ success: false, error: 'PostgreSQL mode is required' });
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 5) Audit log query
app.get('/api/admin/audit', async (req, res) => {
  if (!posAdminAuth(req, res)) return;
  try {
    const { admin, userId, action, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const pg = parseInt(page) || 1;

    const filePath = path.join(__dirname, 'audit-admin.log');
    let logs = [];
    try {
      await fsPromises.access(filePath);
      const content = await fsPromises.readFile(filePath, 'utf8');
      logs = content.split(/\r?\n/).filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } catch {
      // File doesn't exist, logs remains empty array
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
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// ===== ADMIN USER MANAGEMENT (END) =====

function _validateRole(role) {
  const validRoles = ['user', 'admin', 'moderator', 'superadmin'];
  return validRoles.includes(role);
}

function _hasPermission(userRole, requiredRole) {
  const roleHierarchy = {
    'user': 1,
    'moderator': 2,
    'admin': 3,
    'superadmin': 4
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

function _generateUserId() {
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

// Saldo history per user
app.get('/api/dashboard/users/:userId/saldo/history', async (req, res) => {
  try {
    if (!dbHelper || typeof dbHelper.getSaldoHistory !== 'function') {
      return res.status(500).json({ success: false, error: 'Saldo history helper unavailable' });
    }

    const { limit = 50, offset = 0, action, method, source, search } = req.query;
    const historyResult = await dbHelper.getSaldoHistory(req.params.userId, {
      limit,
      offset,
      action,
      method,
      source,
      search
    });

    return res.json({
      success: true,
      data: {
        userId: req.params.userId,
        total: historyResult.total,
        limit: historyResult.limit,
        offset: historyResult.offset,
        entries: historyResult.entries
      }
    });
  } catch (error) {
    console.error('Error fetching saldo history:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Global saldo history feed (optional user filter)
app.get('/api/dashboard/saldo/history', async (req, res) => {
  try {
    if (!dbHelper || typeof dbHelper.getSaldoHistory !== 'function') {
      return res.status(500).json({ success: false, error: 'Saldo history helper unavailable' });
    }

    const { userId = null, limit = 50, offset = 0, action, method, source, search } = req.query;
    const historyResult = await dbHelper.getSaldoHistory(userId, {
      limit,
      offset,
      action,
      method,
      source,
      search
    });

    return res.json({
      success: true,
      data: {
        total: historyResult.total,
        limit: historyResult.limit,
        offset: historyResult.offset,
        userId,
        entries: historyResult.entries
      }
    });
  } catch (error) {
    console.error('Error fetching saldo history feed:', error);
    return res.status(500).json({ success: false, error: error.message });
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
    const deliveredAccount = await parseDeliveredAccountFromFile(reffId);

    // Get receipt content if exists (from R2 or local)
    let receiptContent = null;
    let receiptExistsFlag = false;
    try {
      const receiptResult = await getReceipt(reffId);
      if (receiptResult.success) {
        receiptContent = receiptResult.content;
        receiptExistsFlag = true;
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
      receiptExists: receiptExistsFlag,
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
const { getProductCategory, calculateStockMetrics } = stockHelper;

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

    for (const [_productId, product] of Object.entries(produkMap)) {
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
    const { id, name, desc, priceB = 0, priceS = 0, priceG = 0, snk = '', minStock = 5 } = req.body;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ success: false, message: 'Invalid or missing id' });
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    if (usePg) {
      const existing = await pg.query('SELECT id FROM produk WHERE id=$1', [id]);
      if (existing.rows[0]) return res.status(409).json({ success: false, message: 'Product already exists' });
      const data = { id, name, desc, priceB, priceS, priceG, snk, minStock, stok: [], terjual: 0 };
      await pg.query('INSERT INTO produk(id, name, price, stock, data) VALUES ($1,$2,$3,$4,$5)', [id, name, parseInt(priceB) || 0, 0, JSON.stringify(data)]);
      return res.json({ success: true, data });
    }
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });
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
    const payload = req.body;

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
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });
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
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });
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
        if (action === 'add') {
          if (!Array.isArray(prod.stok)) prod.stok = [];
          const validStockItems = (stockItems || []).filter(item => typeof item === 'string' && item.includes('|') && item.split('|').length >= 4);
          if (validStockItems.length === 0) throw new Error('Invalid stock item format. Expected: "email|password|profile|pin|notes"');
          prod.stok.push(...validStockItems);
          // stock count updated for this operation (not used beyond this scope)
          prod.lastRestock = new Date().toISOString();
        } else if (action === 'remove') {
          if (!Array.isArray(prod.stok) || prod.stok.length === 0) throw new Error('No stock available to remove');
          const itemsToRemove = Math.min(stockItems.length, prod.stok.length);
          prod.stok.splice(0, itemsToRemove);
          // newStockCount is not used here; stockCount will be derived from result in the response
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
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });

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
    const { value, position } = req.body;
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
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 3b. Edit stock item by index or exact match
app.patch('/api/dashboard/products/:productId/stock/item', async (req, res) => {
  try {
    const { productId } = req.params;
    const { index, match, value } = req.body;
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
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 3c. Delete stock item by index or exact match
app.delete('/api/dashboard/products/:productId/stock/item', async (req, res) => {
  try {
    const { productId } = req.params;
    const { index, match } = req.body;

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
    return res.status(500).json({ success: false, message: 'PostgreSQL mode is required' });
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
        } catch {
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
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'None';

      // Product preferences
      const productPreferences = {};
      userTransactions.forEach(t => {
        const productId = t.id;
        productPreferences[productId] = (productPreferences[productId] || 0) + 1;
      });
      const favoriteProduct = Object.entries(productPreferences)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'None';

      // Shopping time analysis
      const hourlyPurchases = Array(24).fill(0);
      userTransactions.forEach(t => {
        if (t.date) {
          try {
            const hour = new Date(t.date).getHours();
            if (!isNaN(hour)) {
              hourlyPurchases[hour]++;
            }
          } catch {
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
              } catch {
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
      } catch {
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
      } catch {
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
        } catch {
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
  } catch {
    res.status(500).send(`Exception: /dashboard-api`);
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
    const keepAlive = setInterval(() => { try { res.write("\n"); } catch { /* ignored */ } }, 15000);
      req.on("close", () => {
      clearInterval(keepAlive);
      try { journal.kill(); } catch { /* ignored */ }
      });
  } catch (err) {
    res.status(500).send(`Exception: ${err.message}`);
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
    if (res.flushHeaders) try { res.flushHeaders(); } catch { /* ignored */ }
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

    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignored */ } }, 15000);
    const cleanup = () => {
      clearInterval(keepAlive);
      try { journal.kill(); } catch { /* ignored */ }
    };
    req.on("close", cleanup);
  } catch {
    res.status(500).send(`Exception: dashboard-api`);
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

function renderDashboardPage() {
  return String.raw`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nicola Command Bridge</title>
  <style>
    :root {
      --bg: #07110d;
      --panel: rgba(12, 27, 21, .82);
      --panel-strong: rgba(18, 43, 32, .94);
      --ink: #f4fff8;
      --muted: #9ab5a5;
      --line: rgba(171, 255, 206, .16);
      --wa: #25d366;
      --lime: #b8ff6a;
      --cyan: #6ee7ff;
      --amber: #ffbd5a;
      --danger: #ff756c;
      --shadow: 0 28px 90px rgba(0, 0, 0, .34);
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 14% 8%, rgba(37, 211, 102, .25), transparent 25rem),
        radial-gradient(circle at 86% 16%, rgba(110, 231, 255, .18), transparent 28rem),
        linear-gradient(135deg, #07110d 0%, #0b1912 45%, #0e2419 100%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button, input, select { font: inherit; }
    button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
      outline: 3px solid rgba(29,169,108,.35);
      outline-offset: 3px;
    }

    .shell { display: grid; grid-template-columns: 17rem 1fr; min-height: 100vh; }
    .rail {
      position: sticky; top: 0; height: 100vh; padding: 1.25rem;
      background: rgba(5,14,10,.72); backdrop-filter: blur(22px);
      border-right: 1px solid var(--line);
    }
    .brand { display: flex; gap: .85rem; align-items: center; margin-bottom: 2rem; }
    .mark {
      width: 3rem; height: 3rem; border-radius: 1.05rem; color: #06120d;
      display: grid; place-items: center; font-weight: 950; letter-spacing: -.08em;
      background: linear-gradient(145deg, var(--wa), var(--lime)); box-shadow: 0 0 42px rgba(37,211,102,.24);
    }
    .brand b { display: block; font-size: 1.05rem; letter-spacing: -.03em; }
    .brand span, .eyebrow, .label, .status-line { color: var(--muted); font-size: .78rem; }

    nav { display: grid; gap: .45rem; }
    nav a {
      color: var(--muted); text-decoration: none; border-radius: .95rem; padding: .78rem .9rem;
      display: flex; justify-content: space-between; align-items: center; border: 1px solid transparent;
    }
    nav a:hover, nav a.active { color: var(--ink); background: rgba(37,211,102,.10); border-color: var(--line); }
    .rail-card { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--line); border-radius: 1.25rem; background: linear-gradient(145deg, rgba(37,211,102,.12), rgba(110,231,255,.06)); color: white; }
    .rail-card span { color: var(--muted); font-size: .8rem; }

    main { padding: 1.25rem; }
    .topbar { display: flex; gap: 1rem; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .topbar h1 { margin: 0; font-size: clamp(2.4rem, 6vw, 6rem); letter-spacing: -.09em; line-height: .82; }
    .toolbar { display: flex; gap: .7rem; align-items: center; flex-wrap: wrap; }
    .field, .btn {
      min-height: 2.75rem; border: 1px solid var(--line); border-radius: 999px; background: rgba(10,24,18,.76);
      color: var(--ink); padding: 0 1rem;
    }
    .field::placeholder { color: #789484; }
    .btn { cursor: pointer; font-weight: 850; }
    .btn.primary { background: linear-gradient(135deg, var(--wa), var(--lime)); color: #06120d; border-color: transparent; }
    .btn:hover { transform: translateY(-1px); }

    .hero {
      display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(18rem, .75fr); gap: 1rem; margin-bottom: 1rem;
    }
    .panel {
      background: var(--panel); border: 1px solid var(--line); border-radius: 1.7rem;
      padding: 1.15rem; box-shadow: var(--shadow); backdrop-filter: blur(20px);
    }
    .signal {
      min-height: 19rem; display: grid; grid-template-columns: 3.2rem 1fr; gap: 1rem; overflow: hidden;
      background: linear-gradient(145deg, rgba(37,211,102,.14), rgba(12,27,21,.86));
    }
    .signal-strip {
      border-radius: 1.2rem; background: rgba(3,10,7,.7); padding: .65rem; display: grid; align-content: end; gap: .35rem;
    }
    .signal-strip i { display: block; border-radius: 999px; background: var(--wa); min-height: 12px; opacity: .35; }
    .signal-strip i:nth-child(2n) { background: var(--cyan); }
    .signal-strip i.live { opacity: 1; box-shadow: 0 0 22px currentColor; }
    .hero-copy { display: flex; flex-direction: column; justify-content: space-between; gap: 2rem; }
    .hero-copy h2 { margin: 0; font-size: clamp(1.9rem, 3.4vw, 3.8rem); line-height: .9; letter-spacing: -.07em; max-width: 12ch; }
    .hero-copy p { color: var(--muted); max-width: 60ch; line-height: 1.7; }
    .status-pill { display: inline-flex; gap: .5rem; align-items: center; width: fit-content; border: 1px solid rgba(37,211,102,.28); background: rgba(37,211,102,.12); color: #b7ffd2; border-radius: 999px; padding: .45rem .75rem; font-weight: 850; }
    .dot { width: .58rem; height: .58rem; border-radius: 99px; background: currentColor; box-shadow: 0 0 0 .35rem rgba(37,211,102,.13); }

    .scorecard { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
    .metric { padding: 1rem; border: 1px solid var(--line); border-radius: 1.15rem; background: var(--panel-strong); }
    .metric strong { display: block; font-size: clamp(1.45rem, 3vw, 2.35rem); letter-spacing: -.06em; margin-top: .25rem; color: var(--lime); }
    .metric small { color: var(--muted); }

    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, .55fr); gap: 1rem; align-items: start; }
    .section-head { display: flex; justify-content: space-between; gap: 1rem; align-items: end; margin-bottom: .9rem; }
    .section-head h3 { margin: 0; font-size: 1.2rem; letter-spacing: -.03em; }
    .bars { display: grid; gap: .7rem; }
    .bar-row { display: grid; grid-template-columns: 6.6rem 1fr 5.5rem; gap: .75rem; align-items: center; color: var(--muted); font-size: .9rem; }
    .track { height: .75rem; background: rgba(255,255,255,.07); border-radius: 99px; overflow: hidden; }
    .fill { height: 100%; width: var(--w, 0%); background: linear-gradient(90deg, var(--wa), var(--cyan)); border-radius: inherit; box-shadow: 0 0 18px rgba(37,211,102,.24); }

    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: .85rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-size: .76rem; text-transform: uppercase; letter-spacing: .08em; }
    td { font-size: .92rem; color: #dff7e8; }
    .money, .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .tag { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: .25rem .55rem; background: rgba(37,211,102,.10); color: #b7ffd2; font-size: .75rem; font-weight: 850; }
    .tag.warn { background: rgba(255,189,90,.14); color: #ffdca3; }
    .tag.bad { background: rgba(255,117,108,.14); color: #ffc0bc; }

    .cards { display: grid; gap: .75rem; }
    .product { display: grid; grid-template-columns: 1fr auto; gap: .8rem; padding: .85rem; border: 1px solid var(--line); border-radius: 1rem; background: rgba(255,255,255,.04); }
    .product b { display: block; letter-spacing: -.02em; }
    .product span { color: var(--muted); font-size: .83rem; }

    .toast { position: fixed; right: 1rem; bottom: 1rem; max-width: 24rem; padding: .9rem 1rem; border: 1px solid var(--line); border-radius: 1rem; background: #07110d; color: white; box-shadow: var(--shadow); transform: translateY(140%); transition: transform .2s ease; z-index: 5; }
    .toast.show { transform: translateY(0); }
    .skeleton { color: transparent; background: linear-gradient(90deg, rgba(255,255,255,.06), rgba(37,211,102,.16), rgba(255,255,255,.06)); background-size: 220% 100%; animation: shimmer 1.2s infinite; border-radius: .45rem; }
    @keyframes shimmer { to { background-position: -220% 0; } }

    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
      .rail { position: static; height: auto; }
      nav { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .hero, .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      main, .rail { padding: .8rem; }
      nav { display: none; }
      .topbar, .section-head { align-items: stretch; flex-direction: column; }
      .scorecard { grid-template-columns: 1fr; }
      .signal { grid-template-columns: 1fr; }
      .signal-strip { grid-template-columns: repeat(12, 1fr); min-height: 3rem; align-content: stretch; }
      .bar-row { grid-template-columns: 1fr; gap: .35rem; }
      table { display: block; overflow-x: auto; white-space: nowrap; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="rail" aria-label="Navigasi dashboard">
      <div class="brand"><div class="mark">WA</div><div><b>Nicola Ops</b><span>WhatsApp commerce control</span></div></div>
      <nav>
        <a class="active" href="#overview">Overview <span>live</span></a>
        <a href="#revenue">Revenue <span>trend</span></a>
        <a href="#stock">Stock <span>risk</span></a>
        <a href="#transactions">Transaksi <span>feed</span></a>
      </nav>
      <div class="rail-card"><b>Ops cockpit</b><br><span>Kas, stok, dan transaksi masuk dalam satu layar gelap, cepat, responsif.</span></div>
    </aside>

    <main>
      <div class="topbar">
        <div><div class="eyebrow">Dashboard API · port ${PORT}</div><h1>WA Ops<br>Cockpit</h1></div>
        <div class="toolbar" role="search">
          <input id="search" class="field" type="search" placeholder="Cari transaksi / produk" autocomplete="off">
          <select id="range" class="field" aria-label="Rentang data"><option value="daily">7 hari</option><option value="monthly">12 bulan</option></select>
          <button id="refresh" class="btn primary" type="button">Refresh</button>
        </div>
      </div>

      <section id="overview" class="hero">
        <article class="panel signal">
          <div class="signal-strip" aria-hidden="true"><i></i><i class="live"></i><i></i><i class="live"></i><i></i><i class="live"></i><i></i><i></i><i class="live"></i><i></i><i class="live"></i><i></i></div>
          <div class="hero-copy">
            <div><span id="health" class="status-pill"><span class="dot"></span>Sinkronisasi data</span><h2>Monitor kas, stok, dan chat masuk.</h2><p>Dashboard operator baca endpoint lokal: overview, grafik, transaksi terbaru, stok, dan user. Satu endpoint gagal, panel lain tetap tampil.</p></div>
            <div class="status-line" id="lastUpdated">Belum dimuat</div>
          </div>
        </article>
        <aside class="scorecard" aria-label="Ringkasan metrik">
          <div class="metric"><small>Pendapatan total</small><strong id="totalRevenue" class="skeleton">000000</strong><span id="todayRevenue" class="label">Hari ini</span></div>
          <div class="metric"><small>Transaksi total</small><strong id="totalTransactions" class="skeleton">0000</strong><span id="todayTransactions" class="label">Hari ini</span></div>
          <div class="metric"><small>User aktif</small><strong id="activeUsers" class="skeleton">0000</strong><span id="newUsers" class="label">User baru</span></div>
          <div class="metric"><small>Alert stok</small><strong id="stockAlerts" class="skeleton">00</strong><span id="criticalAlerts" class="label">Kritis</span></div>
        </aside>
      </section>

      <section class="grid">
        <div class="panel" id="revenue">
          <div class="section-head"><div><div class="eyebrow">Ritme penjualan</div><h3 id="chartTitle">Pendapatan 7 hari</h3></div><span id="chartTotal" class="tag">Memuat</span></div>
          <div id="chart" class="bars" aria-live="polite"></div>
        </div>
        <div class="panel" id="stock">
          <div class="section-head"><div><div class="eyebrow">Prioritas restock</div><h3>Produk menipis</h3></div><span id="stockSummary" class="tag warn">Memuat</span></div>
          <div id="stockList" class="cards" aria-live="polite"></div>
        </div>
      </section>

      <section class="panel" id="transactions" style="margin-top:1rem">
        <div class="section-head"><div><div class="eyebrow">Feed operasi</div><h3>Transaksi terbaru</h3></div><span id="txCount" class="tag">Memuat</span></div>
        <table>
          <thead><tr><th>Referensi</th><th>Produk</th><th>User</th><th>Bayar</th><th>Total</th><th>Waktu</th></tr></thead>
          <tbody id="transactionsBody"><tr><td colspan="6">Memuat transaksi…</td></tr></tbody>
        </table>
      </section>
    </main>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
    const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
    const number = new Intl.NumberFormat('id-ID');
    const state = { overview: null, daily: [], monthly: [], transactions: [], stock: [] };

    const $ = (id) => document.getElementById(id);
    function setText(id, value) { $(id).textContent = value; $(id).classList.remove('skeleton'); }
    function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
    async function api(path) {
      const response = await fetch(path, { headers: { Accept: 'application/json' } });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.success === false) throw new Error(json.error || json.message || path + ' gagal');
      return json.data || json;
    }

    function dateLabel(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function normalizeStock(data) {
      if (Array.isArray(data.products)) return data.products;
      if (Array.isArray(data.alerts)) return data.alerts.map(item => ({ name: item.productName, stockCount: item.currentStock, stockStatus: item.status, category: item.category }));
      return [];
    }

    function renderOverview() {
      const overview = state.overview || {};
      setText('totalRevenue', rupiah.format(overview.totalPendapatan || 0));
      setText('totalTransactions', number.format(overview.totalTransaksi || 0));
      $('todayRevenue').textContent = 'Hari ini ' + rupiah.format(overview.pendapatanHariIni || 0);
      $('todayTransactions').textContent = 'Hari ini ' + number.format(overview.transaksiHariIni || 0) + ' transaksi';
      $('lastUpdated').textContent = 'Terakhir dimuat ' + new Date().toLocaleString('id-ID', { timeStyle: 'medium', dateStyle: 'medium' });
    }

    function renderUsers(data) {
      setText('activeUsers', number.format(data.activeUsers || 0));
      $('newUsers').textContent = number.format(data.newUsers || 0) + ' user baru bulan ini';
    }

    function text(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function renderStock() {
      const items = state.stock.slice().sort((a, b) => (a.stockCount || 0) - (b.stockCount || 0)).slice(0, 6);
      const critical = items.filter(item => (item.stockCount || 0) === 0).length;
      setText('stockAlerts', number.format(items.length));
      $('criticalAlerts').textContent = number.format(critical) + ' kosong';
      $('stockSummary').textContent = items.length ? items.length + ' perlu dicek' : 'Aman';
      $('stockList').innerHTML = items.length ? items.map(item => {
        const count = item.stockCount || item.currentStock || 0;
        const cls = count === 0 ? 'bad' : count <= 5 ? 'warn' : '';
        return '<div class="product"><div><b>' + text(item.name || item.productName || 'Produk') + '</b><span>' + text(item.category || item.stockStatus || 'Stock') + '</span></div><span class="tag ' + cls + '">' + text(count) + ' item</span></div>';
      }).join('') : '<p class="label">Tidak ada produk menipis.</p>';
    }

    function renderChart() {
      const mode = $('range').value;
      const data = mode === 'monthly' ? state.monthly : state.daily;
      const key = mode === 'monthly' ? 'pendapatan' : 'pendapatan';
      const label = mode === 'monthly' ? 'month' : 'date';
      const max = Math.max(1, ...data.map(item => item[key] || 0));
      const total = data.reduce((sum, item) => sum + (item[key] || 0), 0);
      $('chartTitle').textContent = mode === 'monthly' ? 'Pendapatan 12 bulan' : 'Pendapatan 7 hari';
      $('chartTotal').textContent = rupiah.format(total);
      $('chart').innerHTML = data.length ? data.map(item => {
        const width = Math.max(3, Math.round(((item[key] || 0) / max) * 100));
        return '<div class="bar-row"><span class="mono">' + text(item[label]) + '</span><div class="track"><div class="fill" style="--w:' + width + '%"></div></div><b class="money">' + rupiah.format(item[key] || 0) + '</b></div>';
      }).join('') : '<p class="label">Belum ada data grafik.</p>';
    }

    function renderTransactions() {
      const q = $('search').value.trim().toLowerCase();
      const rows = state.transactions.filter(tx => !q || [tx.reffId, tx.name, tx.user, tx.metodeBayar].join(' ').toLowerCase().includes(q));
      $('txCount').textContent = rows.length + ' tampil';
      $('transactionsBody').innerHTML = rows.length ? rows.slice(0, 12).map(tx => '<tr><td class="mono">' + text(tx.reffId || '-') + '</td><td>' + text(tx.name || '-') + '</td><td>' + text(tx.user || '-') + '</td><td><span class="tag">' + text(tx.metodeBayar || '-') + '</span></td><td class="money">' + rupiah.format(tx.totalBayar || 0) + '</td><td>' + text(dateLabel(tx.date)) + '</td></tr>').join('') : '<tr><td colspan="6">Tidak ada transaksi cocok.</td></tr>';
    }

    async function load() {
      $('health').innerHTML = '<span class="dot"></span>Memuat data';
      try {
        const results = await Promise.allSettled([
          api('/api/dashboard/overview'),
          api('/api/dashboard/chart/daily'),
          api('/api/dashboard/chart/monthly'),
          api('/api/dashboard/transactions/recent?limit=30'),
          api('/api/dashboard/products/stock'),
          api('/api/dashboard/users/activity')
        ]);
        if (results[0].status === 'fulfilled') state.overview = results[0].value;
        if (results[1].status === 'fulfilled') state.daily = results[1].value;
        if (results[2].status === 'fulfilled') state.monthly = results[2].value;
        if (results[3].status === 'fulfilled') state.transactions = results[3].value.transactions || [];
        if (results[4].status === 'fulfilled') state.stock = normalizeStock(results[4].value);
        if (results[5].status === 'fulfilled') renderUsers(results[5].value);
        renderOverview(); renderChart(); renderTransactions(); renderStock();
        const failed = results.filter(r => r.status === 'rejected').length;
        $('health').innerHTML = '<span class="dot"></span>' + (failed ? 'Sebagian data gagal' : 'Live dan tersambung');
        if (failed) toast(failed + ' panel gagal dimuat. API lain tetap tampil.');
      } catch (error) {
        $('health').innerHTML = '<span class="dot"></span>Data gagal dimuat';
        toast(error.message);
      }
    }

    $('refresh').addEventListener('click', load);
    $('range').addEventListener('change', renderChart);
    $('search').addEventListener('input', renderTransactions);
    load();
  </script>
</body>
</html>`;
}

app.get(['/', '/dashboard'], (_req, res) => {
  res.type('html').send(renderDashboardPage());
});

// Error handling middleware
app.use((err, req, res, _next) => {
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
    } catch {
      console.log(`HTTPS server not started: SSL certificates not found`);
      console.log(`To enable HTTPS, ensure SSL certificates are available at /etc/letsencrypt/live/dash.nicola.id/`);
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

    const receiptResult = await getReceipt(reffId);
    if (!receiptResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    const content = receiptResult.content;
    const size = Buffer.byteLength(content, 'utf8');

    res.json({
      success: true,
      data: {
        reffId: reffId,
        content: content,
        createdAt: new Date().toISOString(), // R2 doesn't provide creation time easily
        modifiedAt: new Date().toISOString(),
        size: size,
        sizeFormatted: formatBytes(size),
        storage: receiptResult.storage || 'unknown'
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

    const receiptResult = await getReceipt(reffId);
    if (!receiptResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    // Set headers untuk download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reffId}.txt"`);
    res.send(receiptResult.content);

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

    // Get receipt content (from R2 or local)
    let receiptContent = null;
    let receiptExistsFlag = false;

    const receiptResult = await getReceipt(reffId);
    if (receiptResult.success) {
      receiptContent = receiptResult.content;
      receiptExistsFlag = true;
    }

    res.json({
      success: true,
      data: {
        transaction: transaction,
        receipt: {
          exists: receiptExistsFlag,
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

    const existsResult = await receiptExists(reffId);
    if (!existsResult.exists) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    const deleteResult = await deleteReceipt(reffId);
    if (!deleteResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete receipt',
        error: deleteResult.error
      });
    }

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
