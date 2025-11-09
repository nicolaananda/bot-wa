require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const moment = require('moment-timezone');

// Import database
const DatabaseClass = require('./function/database');
const dbHelper = require('./options/db-helper');

const app = express();
const PORT = process.env.WEB_POS_PORT || 3001;

// Initialize database
let db;
async function initDatabase() {
  try {
    const dbPath = './options/database.json';
    const DBClass = DatabaseClass;
    db = global.db || new DBClass(dbPath, null, 2);
    
    if (typeof db.load === 'function') {
      await db.load();
    } else if (typeof db._load === 'function') {
      db._load();
    }
    
    global.db = db;
    
    // Initialize data structures if needed
    if (!db.data) db.data = {};
    if (!db.data.users) db.data.users = {};
    if (!db.data.produk) db.data.produk = {};
    if (!db.data.transaksi) db.data.transaksi = [];
    if (!db.data.userPins) db.data.userPins = {}; // Store user PINs
    
    console.log('[Web POS] Database initialized successfully');
    return true;
  } catch (error) {
    console.error('[Web POS] Failed to initialize database:', error);
    return false;
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web-pos-public')));

// Session configuration
app.use(session({
  secret: process.env.WEB_POS_SECRET || 'giha-web-pos-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Helper functions
function normalizePhoneNumber(phone) {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Add country code if missing
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  
  return cleaned;
}

function formatPhoneForDb(phone) {
  return normalizePhoneNumber(phone) + '@s.whatsapp.net';
}

// Admin/Owner phone numbers
const ADMIN_NUMBERS = ['6281389592985', '6285235540944', '6287887842985', '62877776579444'];

function isAdmin(phone) {
  const normalized = normalizePhoneNumber(phone);
  return ADMIN_NUMBERS.includes(normalized);
}

async function getUserPin(userId) {
  const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
  
  if (usePg) {
    try {
      const pg = require('./config/postgres');
      const result = await pg.query('SELECT web_pos_pin FROM users WHERE user_id = $1', [userId]);
      if (result.rows.length > 0 && result.rows[0].web_pos_pin) {
        return result.rows[0].web_pos_pin;
      }
    } catch (error) {
      console.error('[Web POS] Error getting PIN from PostgreSQL:', error.message);
    }
  } else {
    // File-based database
    if (!db.data.userPins) db.data.userPins = {};
    if (db.data.userPins[userId]) {
      return db.data.userPins[userId];
    }
  }
  
  return '1234'; // Default PIN
}

async function setUserPin(userId, newPin) {
  const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
  
  if (usePg) {
    try {
      const pg = require('./config/postgres');
      await pg.query('UPDATE users SET web_pos_pin = $1 WHERE user_id = $2', [newPin, userId]);
      console.log(`✅ [Web POS] PIN updated in PostgreSQL for user: ${userId}`);
    } catch (error) {
      console.error('[Web POS] Error saving PIN to PostgreSQL:', error.message);
      throw error;
    }
  } else {
    // File-based database
    if (!db.data.userPins) db.data.userPins = {};
    db.data.userPins[userId] = newPin;
    await db.save();
  }
}

function generateRefId() {
  // Same format as WhatsApp bot: crypto.randomBytes(5).toString("hex").toUpperCase()
  // This generates 10 hex characters (5 bytes = 10 chars)
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function toRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

function hargaProduk(productId, role = 'bronze') {
  const product = db.data.produk[productId];
  if (!product) return 0;
  
  // Use pre-calculated prices from database (same as bot)
  if (role === 'bronze') return Number(product.priceB || 0);
  else if (role === 'silver') return Number(product.priceS || 0);
  else if (role === 'gold') return Number(product.priceG || 0);
  
  return Number(product.priceB || 0); // Default to bronze
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized. Please login first.' 
    });
  }
  next();
}

// ===== API ROUTES =====

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { phone, pin } = req.body;
    
    if (!phone || !pin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nomor WhatsApp dan PIN harus diisi' 
      });
    }
    
    const userId = formatPhoneForDb(phone);
    const cleanPhone = normalizePhoneNumber(phone);
    
    // Check if user exists
    if (!db.data.users[userId] && !db.data.users[cleanPhone]) {
      return res.status(404).json({ 
        success: false, 
        message: 'Nomor WhatsApp tidak terdaftar' 
      });
    }
    
    // Verify PIN
    const storedPin = await getUserPin(userId);
    if (pin !== storedPin) {
      return res.status(401).json({ 
        success: false, 
        message: 'PIN salah' 
      });
    }
    
    // Create session
    req.session.userId = userId;
    req.session.cleanPhone = cleanPhone;
    
    res.json({ 
      success: true, 
      message: 'Login berhasil',
      user: {
        phone: cleanPhone,
        saldo: db.data.users[userId]?.saldo || db.data.users[cleanPhone]?.saldo || 0,
        role: db.data.users[userId]?.role || db.data.users[cleanPhone]?.role || 'bronze'
      }
    });
  } catch (error) {
    console.error('[Web POS] Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan saat login' 
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logout berhasil' });
});

// Get current user info
app.get('/api/user', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const cleanPhone = req.session.cleanPhone;
    
    const user = db.data.users[userId] || db.data.users[cleanPhone] || {};
    
    res.json({
      success: true,
      user: {
        phone: cleanPhone,
        saldo: user.saldo || 0,
        role: user.role || 'bronze',
        isAdmin: isAdmin(cleanPhone)
      }
    });
  } catch (error) {
    console.error('[Web POS] Get user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil data user' 
    });
  }
});

// Get products
app.get('/api/products', requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const cleanPhone = req.session.cleanPhone;
    const user = db.data.users[userId] || db.data.users[cleanPhone] || {};
    const userRole = user.role || 'bronze';
    
    const products = Object.entries(db.data.produk || {})
      .map(([id, product]) => {
        const price = hargaProduk(id, userRole);
        return {
          id,
          name: product.name || product.nama,
          description: product.deskripsi || product.description || '',
          stock: Array.isArray(product.stok) ? product.stok.length : 0,
          basePrice: Number(product.harga || product.price || product.priceB || 0),
          price: price,
          category: product.kategori || product.category || 'Lainnya'
        };
      })
      .filter(p => p.stock > 0); // Only show products with stock
    
    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('[Web POS] Get products error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil data produk' 
    });
  }
});

// Purchase product
app.post('/api/purchase', requireAuth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session.userId;
    const cleanPhone = req.session.cleanPhone;
    
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Data tidak valid' 
      });
    }
    
    // Check if product exists
    const product = db.data.produk[productId];
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Produk tidak ditemukan' 
      });
    }
    
    // Check stock
    if (!Array.isArray(product.stok) || product.stok.length < quantity) {
      return res.status(400).json({ 
        success: false, 
        message: 'Stok tidak mencukupi' 
      });
    }
    
    // Get user data
    const user = db.data.users[userId] || db.data.users[cleanPhone];
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User tidak ditemukan' 
      });
    }
    
    const userRole = user.role || 'bronze';
    const pricePerItem = hargaProduk(productId, userRole);
    const totalPrice = pricePerItem * quantity;
    
    // Check balance
    const currentSaldo = Number(user.saldo || 0);
    if (currentSaldo < totalPrice) {
      return res.status(400).json({ 
        success: false, 
        message: `Saldo tidak cukup! Saldo Anda: ${toRupiah(currentSaldo)}, Total harga: ${toRupiah(totalPrice)}` 
      });
    }
    
    // Process purchase (same as bot flow)
    const reffId = generateRefId();
    
    // Deduct balance
    await dbHelper.updateUserSaldo(userId, totalPrice, 'subtract');
    
    // Get stock items
    const purchasedItems = [];
    for (let i = 0; i < quantity; i++) {
      purchasedItems.push(product.stok.shift());
    }
    
    // Update sold count
    product.terjual = (product.terjual || 0) + quantity;
    
    // Get current date/time in Jakarta timezone
    const tanggal = moment.tz('Asia/Jakarta').format('DD MMMM YYYY');
    const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss');
    
    // Save transaction to database (exact same format as bot)
    const transaction = {
      id: productId,
      name: product.name || product.nama,
      price: String(pricePerItem), // String format like bot
      date: moment.tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
      profit: product.profit || 0,
      jumlah: quantity,
      user: cleanPhone,
      userRole: userRole,
      reffId: reffId,
      metodeBayar: 'Saldo',
      totalBayar: totalPrice
    };
    
    db.data.transaksi.push(transaction);
    console.log(`✅ [Web POS] Transaction added to array. Total transactions: ${db.data.transaksi.length}`);
    
    // For PostgreSQL: Insert transaction directly to avoid looping all transactions
    const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
    if (usePg) {
      try {
        const pg = require('./config/postgres');
        // Check if transaction already exists
        const existing = await pg.query('SELECT id FROM transaksi WHERE ref_id = $1 LIMIT 1', [reffId]);
        if (existing.rows.length === 0) {
          // Insert only if not exists
          await pg.query(
            'INSERT INTO transaksi(ref_id, user_id, amount, status, meta) VALUES ($1,$2,$3,$4,$5)',
            [reffId, userId, totalPrice, 'completed', JSON.stringify(transaction)]
          );
          console.log(`✅ [Web POS] Transaction saved to PostgreSQL directly. RefId: ${reffId}`);
        } else {
          console.log(`⚠️ [Web POS] Transaction already exists in PostgreSQL. RefId: ${reffId}`);
        }
      } catch (pgError) {
        console.error(`⚠️ [Web POS] Failed to save transaction to PostgreSQL:`, pgError.message);
        // Don't throw, will be saved on next db.save() batch
      }
    }
    
    // Build detail message (same format as WhatsApp bot)
    const detailParts = [
      `*📦 Produk:* ${product.name || product.nama}`,
      `*📅 Tanggal:* ${tanggal}`,
      `*⏰ Jam:* ${jamwib} WIB`,
      `*Refid:* ${reffId}`,
      ''
    ];
    
    purchasedItems.forEach((item) => {
      const dataAkun = item.split('|');
      detailParts.push(
        `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
        `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}`,
        `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}`,
        `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}`,
        `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}`,
        ''
      );
    });
    
    // Add SNK if exists
    if (product.snk) {
      detailParts.push(
        `*╭────「 SYARAT & KETENTUAN 」────╮*`,
        '',
        `*📋 SNK PRODUK: ${product.name || product.nama}*`,
        '',
        product.snk,
        '',
        `*╰────「 END SNK 」────╯*`
      );
    }
    
    const detailAkunCustomer = detailParts.join('\n');
    
    // Save receipt file (same as bot)
    try {
      const receiptPath = path.join(__dirname, 'options', 'receipts', `${reffId}.txt`);
      
      // Ensure receipts directory exists
      const receiptsDir = path.join(__dirname, 'options', 'receipts');
      if (!fs.existsSync(receiptsDir)) {
        fs.mkdirSync(receiptsDir, { recursive: true });
      }
      
      await fs.promises.writeFile(receiptPath, detailAkunCustomer, 'utf8');
      console.log(`✅ [Web POS] Receipt saved: ${receiptPath}`);
    } catch (receiptError) {
      console.error('❌ [Web POS] Error saving receipt:', receiptError.message);
    }
    
    // Save database
    try {
      // Call save and wait a bit for queue to process
      db.save();
      
      // For file-based DB, directly call _save to ensure immediate write
      if (typeof db._save === 'function') {
        await db._save();
        console.log(`✅ [Web POS] Database saved successfully (direct _save). RefId: ${reffId}`);
      } else {
        await db.save();
        console.log(`✅ [Web POS] Database saved successfully (PG). RefId: ${reffId}`);
      }
    } catch (saveError) {
      console.error(`❌ [Web POS] Error saving database:`, saveError);
      throw new Error('Failed to save database: ' + saveError.message);
    }
    
    // Format purchased items for display (detailed format)
    const formattedItems = purchasedItems.map((item, index) => {
      const parts = item.split('|');
      return {
        index: index + 1,
        email: parts[0] || 'Tidak ada',
        password: parts[1] || 'Tidak ada',
        profile: parts[2] || 'Tidak ada',
        pin: parts[3] || 'Tidak ada',
        twofa: parts[4] || 'Tidak ada'
      };
    });
    
    console.log(`✅ [Web POS] Purchase successful - RefID: ${reffId}, User: ${cleanPhone}, Product: ${productId}, Qty: ${quantity}`);
    
    res.json({
      success: true,
      message: 'Pembelian berhasil!',
      transaction: {
        refId: reffId,
        productName: product.name || product.nama,
        quantity: quantity,
        totalPrice: totalPrice,
        items: formattedItems,
        newBalance: currentSaldo - totalPrice,
        date: tanggal,
        time: jamwib,
        snk: product.snk || null,
        receiptContent: detailAkunCustomer // Add receipt text for copy
      }
    });
  } catch (error) {
    console.error('[Web POS] Purchase error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan saat memproses pembelian' 
    });
  }
});

// Get transaction history
app.get('/api/transactions', requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const cleanPhone = req.session.cleanPhone;
    
    const transactions = (db.data.transaksi || [])
      .filter(t => {
        const tUser = t.userId || t.user_id || t.user || '';
        return tUser.includes(cleanPhone) || tUser === cleanPhone || tUser.includes(userId);
      })
      .slice(-50) // Last 50 transactions
      .reverse()
      .map(t => ({
        refId: t.reffId || t.ref_id,
        productId: t.id,
        productName: t.name || t.productName || t.nama_produk || 'Unknown Product',
        quantity: t.jumlah || t.quantity || 1,
        price: t.price || 0,
        totalPrice: t.totalBayar || t.amount || 0,
        status: t.status || 'completed',
        date: t.date || t.timestamp,
        metode: t.metodeBayar || t.metode || t.payment_method || 'Unknown',
        hasReceipt: true // Assume receipt exists for web POS transactions
      }));
    
    res.json({
      success: true,
      transactions,
      total: transactions.length
    });
  } catch (error) {
    console.error('[Web POS] Get transactions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil riwayat transaksi' 
    });
  }
});

// Get transaction detail with account info
app.get('/api/transactions/:reffId', requireAuth, (req, res) => {
  try {
    const { reffId } = req.params;
    const userId = req.session.userId;
    const cleanPhone = req.session.cleanPhone;
    
    // Find transaction
    const transaction = (db.data.transaksi || []).find(t => 
      (t.reffId === reffId || t.ref_id === reffId) &&
      (t.user === cleanPhone || t.userId === cleanPhone || t.user === userId)
    );
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan'
      });
    }
    
    // Try to get receipt content
    let receiptContent = null;
    let accountDetails = [];
    
    try {
      const receiptPath = path.join(__dirname, 'options', 'receipts', `${reffId}.txt`);
      if (fs.existsSync(receiptPath)) {
        receiptContent = fs.readFileSync(receiptPath, 'utf8');
        
        // Parse account details from receipt
        const lines = receiptContent.split('\n');
        let currentAccount = null;
        
        lines.forEach(line => {
          const trimmed = line.trim();
          
          // Check for account details markers
          if (trimmed.includes('📧 Email:')) {
            if (currentAccount) accountDetails.push(currentAccount);
            currentAccount = {
              email: trimmed.split('Email:')[1]?.trim() || 'Tidak ada',
              password: '',
              profile: '',
              pin: '',
              twofa: ''
            };
          } else if (currentAccount) {
            if (trimmed.includes('🔐 Password:')) {
              currentAccount.password = trimmed.split('Password:')[1]?.trim() || 'Tidak ada';
            } else if (trimmed.includes('👤 Profil:')) {
              currentAccount.profile = trimmed.split('Profil:')[1]?.trim() || 'Tidak ada';
            } else if (trimmed.includes('🔢 Pin:')) {
              currentAccount.pin = trimmed.split('Pin:')[1]?.trim() || 'Tidak ada';
            } else if (trimmed.includes('🔒 2FA:')) {
              currentAccount.twofa = trimmed.split('2FA:')[1]?.trim() || 'Tidak ada';
            }
          }
        });
        
        // Add last account if exists
        if (currentAccount) accountDetails.push(currentAccount);
      }
    } catch (error) {
      console.error('[Web POS] Error reading receipt:', error);
    }
    
    res.json({
      success: true,
      transaction: {
        refId: reffId,
        productId: transaction.id,
        productName: transaction.name || transaction.productName || 'Unknown Product',
        quantity: transaction.jumlah || transaction.quantity || 1,
        price: transaction.price || 0,
        totalPrice: transaction.totalBayar || transaction.amount || 0,
        date: transaction.date || transaction.timestamp,
        metode: transaction.metodeBayar || transaction.metode || 'Unknown',
        status: transaction.status || 'completed'
      },
      accountDetails: accountDetails,
      receiptContent: receiptContent
    });
  } catch (error) {
    console.error('[Web POS] Get transaction detail error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil detail transaksi' 
    });
  }
});

// Change PIN
app.post('/api/change-pin', requireAuth, async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;
    const userId = req.session.userId;
    
    if (!oldPin || !newPin) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN lama dan PIN baru harus diisi' 
      });
    }
    
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN baru harus 4-6 digit angka' 
      });
    }
    
    // Verify old PIN
    const storedPin = await getUserPin(userId);
    if (oldPin !== storedPin) {
      return res.status(401).json({ 
        success: false, 
        message: 'PIN lama salah' 
      });
    }
    
    // Set new PIN
    await setUserPin(userId, newPin);
    
    res.json({
      success: true,
      message: 'PIN berhasil diubah'
    });
  } catch (error) {
    console.error('[Web POS] Change PIN error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengubah PIN' 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Web POS API is running',
    database: db ? 'connected' : 'disconnected'
  });
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-pos-public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-pos-public', 'dashboard.html'));
});

app.get('/products', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-pos-public', 'products.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-pos-public', 'settings.html'));
});

// Start server
async function startServer() {
  const dbInitialized = await initDatabase();
  
  if (!dbInitialized) {
    console.error('[Web POS] Cannot start server without database');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`[Web POS] Server running on http://localhost:${PORT}`);
    console.log('[Web POS] Default PIN for all users: 1234');
    console.log('[Web POS] Users can change PIN in settings');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Web POS] Shutting down gracefully...');
  if (db && typeof db.save === 'function') {
    await db.save();
  }
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  console.error('[Web POS] Failed to start server:', error);
  process.exit(1);
});

