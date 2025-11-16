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
const { saveReceipt } = require('./config/r2-storage');

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
    
    // Migrate PINs to PostgreSQL if enabled
    await migratePinsToPostgres();
    
    return true;
  } catch (error) {
    console.error('[Web POS] Failed to initialize database:', error);
    return false;
  }
}

// Migrate existing PINs from JSON to PostgreSQL
async function migratePinsToPostgres() {
  const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
  
  if (!usePg) {
    return; // Skip if PostgreSQL is not enabled
  }
  
  try {
    const userPins = db.data.userPins || {};
    const pinCount = Object.keys(userPins).length;
    
    if (pinCount === 0) {
      console.log('[Web POS] No PINs to migrate');
      return;
    }
    
    console.log(`[Web POS] Migrating ${pinCount} PINs to PostgreSQL...`);
    
    const pg = require('./config/postgres');
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const [userId, pin] of Object.entries(userPins)) {
      try {
        // Check if PIN already exists in PostgreSQL
        const existing = await pg.query(
          'SELECT user_id FROM web_pos_pin WHERE user_id = $1',
          [userId]
        );
        
        if (existing.rows.length > 0) {
          skippedCount++;
          continue; // Skip if already migrated
        }
        
        // Insert PIN to PostgreSQL
        await pg.query(
          'INSERT INTO web_pos_pin (user_id, pin) VALUES ($1, $2)',
          [userId, pin]
        );
        
        migratedCount++;
      } catch (error) {
        console.error(`[Web POS] Error migrating PIN for user ${userId}:`, error.message);
      }
    }
    
    console.log(`✅ [Web POS] PIN migration complete: ${migratedCount} migrated, ${skippedCount} skipped`);
  } catch (error) {
    console.error('[Web POS] Error during PIN migration:', error.message);
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

function isOwner(phone) {
  const cleanPhone = normalizePhoneNumber(phone);
  
  // Load setting.js to ensure global variables are set
  require('./setting.js');
  const ownerNumbers = global.owner || [];
  
  const isAdmin = ownerNumbers.some(owner => {
    const cleanOwner = normalizePhoneNumber(owner);
    return cleanOwner === cleanPhone;
  });
  
  return isAdmin;
}

async function getUserPin(userId) {
  const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
  
  if (usePg) {
    try {
      const pg = require('./config/postgres');
      const result = await pg.query(
        'SELECT pin FROM web_pos_pin WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length > 0) {
        return result.rows[0].pin;
      }
      
      // If no PIN found in PostgreSQL, return default
      return '1234';
    } catch (error) {
      console.error('[Web POS] Error getting PIN from PostgreSQL:', error.message);
      // Fallback to JSON file
      if (!db.data.userPins) db.data.userPins = {};
      return db.data.userPins[userId] || '1234';
    }
  } else {
    // Use JSON file
    if (!db.data.userPins) db.data.userPins = {};
    return db.data.userPins[userId] || '1234';
  }
}

async function setUserPin(userId, newPin) {
  const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
  
  if (usePg) {
    try {
      const pg = require('./config/postgres');
      
      // Insert or update PIN in PostgreSQL
      await pg.query(
        `INSERT INTO web_pos_pin (user_id, pin) 
         VALUES ($1, $2) 
         ON CONFLICT (user_id) 
         DO UPDATE SET pin = $2, updated_at = now()`,
        [userId, newPin]
      );
      
      console.log(`✅ [Web POS] PIN updated in PostgreSQL for user: ${userId}`);
    } catch (error) {
      console.error('[Web POS] Error setting PIN in PostgreSQL:', error.message);
      // Fallback to JSON file
      if (!db.data.userPins) db.data.userPins = {};
      db.data.userPins[userId] = newPin;
      db.save();
    }
  } else {
    // Use JSON file
    if (!db.data.userPins) db.data.userPins = {};
    db.data.userPins[userId] = newPin;
    db.save();
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
    const isAdmin = isOwner(cleanPhone);
    
    res.json({
      success: true,
      user: {
        phone: cleanPhone,
        saldo: user.saldo || 0,
        role: user.role || 'bronze',
        isAdmin: isAdmin
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

// Get products (accessible without auth for guest mode)
app.get('/api/products', (req, res) => {
  try {
    // Check if user is logged in
    let userRole = 'bronze'; // Default role for guests
    if (req.session.userId) {
      const userId = req.session.userId;
      const cleanPhone = req.session.cleanPhone;
      const user = db.data.users[userId] || db.data.users[cleanPhone] || {};
      userRole = user.role || 'bronze';
    }
    
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
      products,
      isGuest: !req.session.userId
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
    
    // Check if user already has pending order
    if (!db.data.order) db.data.order = {};
    if (db.data.order[userId]) {
      return res.status(400).json({
        success: false,
        message: 'Anda sedang memiliki order yang belum selesai. Silakan selesaikan atau batalkan terlebih dahulu.'
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
    console.log(`✅ [Web POS] Transaction details:`, JSON.stringify(transaction, null, 2));
    
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
    
    // Save receipt file (R2 atau local)
    try {
      const result = await saveReceipt(reffId, detailAkunCustomer);
      if (result.success) {
        if (result.url) {
          console.log(`✅ [Web POS] Receipt saved to ${result.storage}: ${result.url}`);
        } else {
          console.log(`✅ [Web POS] Receipt saved to ${result.storage}: ${result.path || reffId}`);
        }
      } else {
        console.error('❌ [Web POS] Error saving receipt:', result.error);
      }
    } catch (receiptError) {
      console.error('❌ [Web POS] Error saving receipt:', receiptError.message);
    }
    
    // Save database
    try {
      console.log(`[Web POS] Saving database... Total transactions in memory: ${db.data.transaksi.length}`);
      
      // Call save and wait a bit for queue to process
      db.save();
      
      // For file-based DB, directly call _save to ensure immediate write
      if (typeof db._save === 'function') {
        await db._save();
        console.log(`✅ [Web POS] Database saved successfully (direct _save). RefId: ${reffId}`);
        console.log(`✅ [Web POS] Database path: ${db.file || 'unknown'}`);
      } else {
        await db.save();
        console.log(`✅ [Web POS] Database saved successfully (PG). RefId: ${reffId}`);
      }
      
      // Verify save by reading back
      if (typeof db.load === 'function') {
        await db.load();
        const savedTransaction = db.data.transaksi.find(t => t.reffId === reffId);
        if (savedTransaction) {
          console.log(`✅ [Web POS] Transaction verified in database after save`);
        } else {
          console.error(`❌ [Web POS] WARNING: Transaction NOT found after save!`);
        }
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

// Buynow - Purchase with Payment Gateway (QRIS/Transfer)
// Sesuai dengan case 'buynow' di index.js (WhatsApp bot)
app.post('/api/buynow', requireAuth, async (req, res) => {
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
    
    // Check if user already has pending order
    if (!db.data.order) db.data.order = {};
    if (db.data.order[userId]) {
      return res.status(400).json({
        success: false,
        message: 'Anda sedang memiliki order yang belum selesai. Silakan selesaikan atau batalkan terlebih dahulu.'
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
    
    if (product.stok.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Stok habis, silahkan hubungi Owner untuk restok'
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
    const totalHarga = pricePerItem * quantity;
    
    // Generate unique code (sama seperti di index.js)
    const uniqueCode = Math.floor(1 + Math.random() * 99);
    const totalAmount = totalHarga + uniqueCode;
    
    // Generate reffId (sama seperti di index.js)
    const crypto = require('crypto');
    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
    
    // Generate orderId (sama format dengan index.js)
    const orderId = `TRX-${reffId}-${Date.now()}`;
    
    // Get current date/time in Jakarta timezone
    const tanggal = moment.tz('Asia/Jakarta').format('DD MMMM YYYY');
    const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss');
    const createdAtTs = Date.now();
    
    // Create order in database (sama structure dengan index.js)
    db.data.order[userId] = {
      id: productId,
      jumlah: quantity,
      orderId: orderId,
      reffId: reffId,
      totalAmount: totalAmount,
      totalHarga: totalHarga,
      uniqueCode: uniqueCode,
      createdAt: createdAtTs,
      status: 'pending_payment',
      metode: 'QRIS',
      userId: userId,
      cleanPhone: cleanPhone,
      productName: product.name || product.nama,
      userRole: userRole,
      qrisImagePath: null // Will be set after QRIS generation
    };
    
    // Save database
    try {
      if (typeof db._save === 'function') {
        await db._save();
      } else {
        await db.save();
      }
      console.log(`✅ [Web POS] Buynow order created - OrderID: ${orderId}, RefID: ${reffId}`);
    } catch (saveError) {
      console.error(`❌ [Web POS] Error saving order:`, saveError);
    }
    
    // Generate QRIS image (sama seperti di index.js)
    let qrisImagePath = null;
    let qrisImageBase64 = null;
    try {
      const { qrisDinamis } = require('./function/dinamis');
      qrisImagePath = await qrisDinamis(`${totalAmount}`, "./options/sticker/qris.jpg");
      console.log(`✅ [Web POS] QRIS generated: ${qrisImagePath}`);
      
      // Update order with qrisImagePath
      if (db.data.order[userId]) {
        db.data.order[userId].qrisImagePath = qrisImagePath;
      }
      
      // Read QR image as base64 for frontend
      try {
        const qrImageBuffer = fs.readFileSync(qrisImagePath);
        qrisImageBase64 = qrImageBuffer.toString('base64');
      } catch (readError) {
        console.error(`❌ [Web POS] Error reading QRIS image:`, readError);
      }
    } catch (qrisError) {
      console.error(`❌ [Web POS] Error generating QRIS:`, qrisError);
    }
    
    // Calculate expiration (30 minutes, sama seperti index.js)
    const toMs = require('ms');
    const expirationTime = Date.now() + toMs("30m");
    const expireDate = new Date(expirationTime);
    const timeLeft = Math.max(0, Math.floor((expireDate - Date.now()) / 60000));
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const expireTimeJakarta = new Date(new Date(currentTime).getTime() + timeLeft * 60000);
    const formattedTime = `${expireTimeJakarta.getHours().toString().padStart(2, '0')}:${expireTimeJakarta.getMinutes().toString().padStart(2, '0')}`;
    
    const paymentData = {
      orderId: orderId,
      reffId: reffId,
      amount: totalAmount,
      totalHarga: totalHarga,
      uniqueCode: uniqueCode,
      productName: product.name || product.nama,
      quantity: quantity,
      qrisImageBase64: qrisImageBase64, // Base64 image for frontend
      qrisImagePath: qrisImagePath,
      qrisUrl: qrisImagePath ? `/qris/${path.basename(qrisImagePath)}` : null,
      paymentUrl: `/payment/${orderId}`,
      expiresAt: moment.tz('Asia/Jakarta').add(30, 'minutes').format('YYYY-MM-DD HH:mm:ss'),
      expirationTime: expirationTime,
      formattedExpireTime: formattedTime,
      timeLeft: timeLeft,
      instructions: `Silakan scan QRIS di atas sebelum ${formattedTime} untuk melakukan pembayaran.`
    };
    
    console.log(`✅ [Web POS] Buynow order created - OrderID: ${orderId}, User: ${cleanPhone}, Product: ${productId}, Amount: ${toRupiah(totalAmount)}`);
    
    res.json({
      success: true,
      message: 'Order berhasil dibuat! Silakan lakukan pembayaran.',
      order: db.data.order[userId],
      payment: paymentData,
      paymentUrl: `/payment/${orderId}`
    });
    
    // Start polling for payment in background (sama seperti di index.js)
    setImmediate(async () => {
      try {
        const { sleep } = require('./function/myfunc');
        
        // Define listener config
        const listener = {
          baseUrl: process.env.LISTENER_URL || 'http://localhost:3001',
          apiKey: process.env.LISTENER_API_KEY || ''
        };
        
        let pollInterval = 3000; // Mulai dari 3 detik
        const maxInterval = 15000; // Maksimal 15 detik
        let pollCount = 0;
        let paymentCompleted = false;
        
        console.log(`🔍 [Web POS] Starting payment polling for order ${orderId}`);
        
        while (!paymentCompleted && db.data.order[userId] && Date.now() < expirationTime) {
          await sleep(pollInterval);
          
          // Tingkatkan interval secara bertahap (exponential backoff)
          if (pollCount < 10) {
            pollInterval = Math.min(Math.floor(pollInterval * 1.2), maxInterval);
          }
          pollCount++;
          
          try {
            const axios = require('axios');
            const url = `${listener.baseUrl}/notifications?limit=50`;
            const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {};
            const resp = await axios.get(url, { headers, timeout: 5000 });
            const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : []);
            
            // Hanya terima notifikasi setelah order dibuat dan jumlah harus sama persis
            const paid = notifs.find(n => {
              try {
                const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('LIVIN'));
                const amt = Number(String(n.amount_detected || '').replace(/[^0-9]/g, ''));
                const postedAt = n.posted_at ? new Date(n.posted_at).getTime() : 0;
                return pkgOk && amt === Number(totalAmount) && postedAt >= createdAtTs;
              } catch {
                return false;
              }
            });
            
            if (paid) {
              paymentCompleted = true;
              console.log(`✅ [Web POS] Payment detected for order ${orderId}, reffId: ${reffId}`);
              
              // Process purchase (sama seperti di index.js)
              db.data.produk[productId].terjual += quantity;
              let dataStok = [];
              for (let i = 0; i < quantity; i++) {
                dataStok.push(db.data.produk[productId].stok.shift());
              }
              
              // Build account details
              const detailParts = [
                `*📦 Produk:* ${product.name || product.nama}`,
                `*📅 Tanggal:* ${tanggal}`,
                `*⏰ Jam:* ${jamwib} WIB`,
                `*Refid:* ${reffId}`,
                ''
              ];
              
              dataStok.forEach((i, index) => {
                const dataAkun = i.split("|");
                detailParts.push(
                  `*═══ AKUN ${index + 1} ═══*`,
                  `📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
                  `🔐 Password: ${dataAkun[1] || 'Tidak ada'}`
                );
                if (dataAkun[2]) detailParts.push(`👤 Profil: ${dataAkun[2]}`);
                if (dataAkun[3]) detailParts.push(`🔢 Pin: ${dataAkun[3]}`);
                if (dataAkun[4]) detailParts.push(`🔒 2FA: ${dataAkun[4]}`);
                detailParts.push('');
              });
              
              // Tambahkan SNK
              detailParts.push(
                `*╭────「 SYARAT & KETENTUAN 」────╮*`,
                '',
                `*📋 SNK PRODUK: ${product.name || product.nama}*`,
                '',
                product.snk || 'Tidak ada SNK',
                '',
                `*⚠️ PENTING:*`,
                `• Baca dan pahami SNK sebelum menggunakan akun`,
                `• Akun yang sudah dibeli tidak dapat dikembalikan`,
                `• Hubungi admin jika ada masalah dengan akun`,
                '',
                `*╰────「 END SNK 」────╯*`
              );
              
              const detailAkunCustomer = detailParts.join('\n');
              
              // Parse account data for frontend
              const accountArray = dataStok.map(item => {
                const dataAkun = item.split("|");
                return {
                  email: dataAkun[0] || 'Tidak ada',
                  password: dataAkun[1] || 'Tidak ada',
                  profile: dataAkun[2] || 'Tidak ada',
                  pin: dataAkun[3] || 'Tidak ada',
                  twofa: dataAkun[4] || 'Tidak ada'
                };
              });
              
              // Save receipt (sama seperti di index.js)
              try {
                const { saveReceipt } = require('./config/r2-storage');
                const result = await saveReceipt(reffId, detailAkunCustomer);
                if (result.success) {
                  if (result.url) {
                    console.log(`✅ [Web POS] Receipt saved to ${result.storage}: ${result.url}`);
                  } else {
                    console.log(`✅ [Web POS] Receipt saved to ${result.storage}: ${result.path || reffId}`);
                  }
                }
              } catch (receiptError) {
                console.error('❌ [Web POS] Error saving receipt:', receiptError.message);
              }
              
              // Add to transaction database (sama seperti di index.js)
              db.data.transaksi.push({
                id: productId,
                name: product.name || product.nama,
                price: pricePerItem,
                date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                profit: product.profit || 0,
                jumlah: quantity,
                user: cleanPhone || userId.split("@")[0],
                userRole: userRole,
                reffId: reffId,
                metodeBayar: "QRIS",
                totalBayar: totalAmount,
                receiptText: detailAkunCustomer,
                account: accountArray,
                snk: product.snk || ''
              });
              
              // Save database
              try {
                if (typeof db._save === 'function') {
                  await db._save();
                } else {
                  await db.save();
                }
              } catch (saveError) {
                console.error('❌ [Web POS] Error saving database:', saveError);
              }
              
              // Clean up order
              delete db.data.order[userId];
              
              console.log(`✅ [Web POS] Transaction completed: ${orderId} - ${reffId}`);
            }
          } catch (error) {
            if (!error.message?.includes("timeout")) {
              console.error(`❌ [Web POS] Error checking payment for ${orderId}:`, error.message);
            }
          }
        }
        
        if (!paymentCompleted) {
          console.log(`⏰ [Web POS] Payment timeout for order ${orderId}`);
          // Clean up expired order
          if (db.data.order[userId]) {
            delete db.data.order[userId];
            try {
              if (typeof db._save === 'function') {
                await db._save();
              } else {
                await db.save();
              }
            } catch {}
          }
        }
      } catch (error) {
        console.error(`❌ [Web POS] Error in payment polling for ${orderId}:`, error);
      }
    });
    
  } catch (error) {
    console.error('[Web POS] Buynow error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan saat membuat order' 
    });
  }
});

// Webhook handler for payment confirmation (from payment gateway)
app.post('/api/payment/webhook', async (req, res) => {
  try {
    // TODO: Implement webhook verification based on your payment gateway
    // Example for Tripay/Midtrans webhook
    
    const { orderId, status, signature } = req.body;
    
    // Verify webhook signature (implement based on your payment gateway)
    // ...
    
    if (status === 'paid' || status === 'settlement') {
      // Find pending order
      const pendingOrder = db.data.pendingOrders?.find(o => o.orderId === orderId);
      
      if (!pendingOrder) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      
      // Process the order (same as regular purchase)
      const product = db.data.produk[pendingOrder.productId];
      if (!product || product.stok.length < pendingOrder.quantity) {
        return res.status(400).json({ success: false, message: 'Product no longer available' });
      }
      
      // Get stock items
      const purchasedItems = [];
      for (let i = 0; i < pendingOrder.quantity; i++) {
        purchasedItems.push(product.stok.shift());
      }
      
      // Update sold count
      product.terjual = (product.terjual || 0) + pendingOrder.quantity;
      
      // Save transaction
      const transaction = {
        id: pendingOrder.productId,
        name: pendingOrder.productName,
        price: String(pendingOrder.pricePerItem),
        date: moment.tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
        profit: product.profit || 0,
        jumlah: pendingOrder.quantity,
        user: pendingOrder.cleanPhone,
        userRole: pendingOrder.userRole || 'bronze',
        reffId: pendingOrder.reffId,
        metodeBayar: 'Buynow',
        totalBayar: pendingOrder.totalPrice
      };
      
      db.data.transaksi.push(transaction);
      
      // Remove from pending orders
      db.data.pendingOrders = db.data.pendingOrders.filter(o => o.orderId !== orderId);
      
      // Save database
      if (typeof db._save === 'function') {
        await db._save();
      } else {
        await db.save();
      }
      
      console.log(`✅ [Web POS] Payment confirmed - OrderID: ${orderId}, RefID: ${pendingOrder.reffId}`);
      
      // TODO: Send notification to user via WhatsApp
      // You can use your bot to send the receipt
      
      res.json({ success: true, message: 'Payment processed' });
    } else {
      res.json({ success: true, message: 'Payment status updated' });
    }
  } catch (error) {
    console.error('[Web POS] Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
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
app.get('/api/transactions/:reffId', requireAuth, async (req, res) => {
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
    
    // Get the actual reffId from transaction (could be reffId or ref_id)
    const actualReffId = transaction.reffId || transaction.ref_id || reffId;
    
    // Try to get receipt content
    let receiptContent = null;
    let accountDetails = [];
    
    try {
      // Get receipt from R2 or local storage
      const { getReceipt } = require('./config/r2-storage');
      console.log(`[Web POS] Attempting to get receipt for reffId: ${actualReffId}`);
      const receiptResult = await getReceipt(actualReffId);
      
      if (receiptResult.success) {
        receiptContent = receiptResult.content;
        console.log(`[Web POS] ✅ Receipt retrieved from ${receiptResult.storage || 'storage'}: ${actualReffId}`);
        
        // Parse account details from receipt
        const lines = receiptContent.split('\n');
        let currentAccount = null;
        
        lines.forEach(line => {
          const trimmed = line.trim();
          
          // Check for account details markers (support both with and without │ character)
          if (trimmed.includes('📧 Email:') || trimmed.includes('│ 📧 Email:')) {
            if (currentAccount) accountDetails.push(currentAccount);
            
            // Extract email value (handle both formats: "│ 📧 Email: value" and "📧 Email: value")
            const emailMatch = trimmed.match(/(?:│\s*)?📧\s*Email:\s*(.+)/);
            const emailValue = emailMatch ? emailMatch[1].trim() : (trimmed.split('Email:')[1]?.trim() || 'Tidak ada');
            
            currentAccount = {
              email: emailValue,
              password: '',
              profile: '',
              pin: '',
              twofa: ''
            };
          } else if (currentAccount) {
            // Parse password
            if (trimmed.includes('🔐 Password:') || trimmed.includes('│ 🔐 Password:')) {
              const passwordMatch = trimmed.match(/(?:│\s*)?🔐\s*Password:\s*(.+)/);
              currentAccount.password = passwordMatch ? passwordMatch[1].trim() : (trimmed.split('Password:')[1]?.trim() || 'Tidak ada');
            }
            // Parse profile
            else if (trimmed.includes('👤 Profil:') || trimmed.includes('│ 👤 Profil:')) {
              const profileMatch = trimmed.match(/(?:│\s*)?👤\s*Profil:\s*(.+)/);
              currentAccount.profile = profileMatch ? profileMatch[1].trim() : (trimmed.split('Profil:')[1]?.trim() || 'Tidak ada');
            }
            // Parse pin
            else if (trimmed.includes('🔢 Pin:') || trimmed.includes('│ 🔢 Pin:')) {
              const pinMatch = trimmed.match(/(?:│\s*)?🔢\s*Pin:\s*(.+)/);
              currentAccount.pin = pinMatch ? pinMatch[1].trim() : (trimmed.split('Pin:')[1]?.trim() || 'Tidak ada');
            }
            // Parse 2FA
            else if (trimmed.includes('🔒 2FA:') || trimmed.includes('│ 🔒 2FA:')) {
              const twofaMatch = trimmed.match(/(?:│\s*)?🔒\s*2FA:\s*(.+)/);
              currentAccount.twofa = twofaMatch ? twofaMatch[1].trim() : (trimmed.split('2FA:')[1]?.trim() || 'Tidak ada');
            }
          }
        });
        
        // Add last account if exists
        if (currentAccount) accountDetails.push(currentAccount);
        
        console.log(`[Web POS] ✅ Parsed ${accountDetails.length} account(s) from receipt: ${actualReffId}`);
      } else {
        console.error(`[Web POS] ❌ Failed to get receipt for ${actualReffId}:`, receiptResult.error);
      }
    } catch (error) {
      console.error('[Web POS] ❌ Error reading receipt:', error);
      console.error('[Web POS] Error stack:', error.stack);
    }
    
    res.json({
      success: true,
      transaction: {
        refId: actualReffId,
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

// Admin: Get all products (including stock count)
app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const cleanPhone = req.session.cleanPhone;
    
    if (!isOwner(cleanPhone)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin yang bisa mengakses.'
      });
    }
    
    const products = Object.entries(db.data.produk || {})
      .map(([id, product]) => ({
        id,
        name: product.name || product.nama,
        description: product.deskripsi || product.description || '',
        stock: Array.isArray(product.stok) ? product.stok.length : 0,
        basePrice: Number(product.harga || product.price || product.priceB || 0),
        category: product.kategori || product.category || 'Lainnya',
        sold: product.terjual || 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('[Web POS] Admin get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data produk'
    });
  }
});

// Admin: Add stock to product
app.post('/api/admin/addstock', requireAuth, async (req, res) => {
  try {
    const cleanPhone = req.session.cleanPhone;
    
    if (!isOwner(cleanPhone)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin yang bisa menambah stock.'
      });
    }
    
    const { productId, accounts } = req.body;
    
    if (!productId || !accounts) {
      return res.status(400).json({
        success: false,
        message: 'Product ID dan accounts harus diisi'
      });
    }
    
    // Check if product exists
    if (!db.data.produk[productId]) {
      return res.status(404).json({
        success: false,
        message: `Produk dengan ID "${productId}" tidak ditemukan`
      });
    }
    
    // Parse accounts (split by newline, trim each line)
    const accountLines = accounts
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (accountLines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada akun yang valid untuk ditambahkan'
      });
    }
    
    // Validate format (email|password|profil|pin|2fa)
    const invalidLines = accountLines.filter(line => {
      const parts = line.split('|');
      return parts.length < 2; // Minimal email|password
    });
    
    if (invalidLines.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Format tidak valid. Pastikan setiap baris memiliki format: email|password|profil|pin|2fa\n\nBaris yang error:\n${invalidLines.slice(0, 3).join('\n')}`
      });
    }
    
    // Add to stock
    if (!Array.isArray(db.data.produk[productId].stok)) {
      db.data.produk[productId].stok = [];
    }
    
    db.data.produk[productId].stok.push(...accountLines);
    
    // Save database
    await db.save();
    
    console.log(`✅ [Web POS Admin] Stock added - Product: ${productId}, Count: ${accountLines.length}, By: ${cleanPhone}`);
    
    res.json({
      success: true,
      message: `Berhasil menambahkan ${accountLines.length} akun ke produk ${db.data.produk[productId].name || productId}`,
      added: accountLines.length,
      newStockCount: db.data.produk[productId].stok.length
    });
  } catch (error) {
    console.error('[Web POS] Admin add stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menambahkan stock: ' + error.message
    });
  }
});

// Admin: Add saldo to user
app.patch('/api/admin/users/:userId/saldo', requireAuth, async (req, res) => {
  try {
    const cleanPhone = req.session.cleanPhone;
    
    if (!isOwner(cleanPhone)) {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak. Hanya admin yang bisa menambah saldo.'
      });
    }
    
    const { userId } = req.params;
    const { amount } = req.body;
    
    if (typeof amount !== 'number' || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        error: 'Amount harus berupa number'
      });
    }
    
    // Normalize user ID
    const nomorNya = userId.replace(/[^0-9]/g, '');
    const userIdWith = nomorNya + '@s.whatsapp.net';
    
    // Auto-create user if not exists (same as index.js addsaldo)
    if (!db.data.users[userIdWith]) {
      db.data.users[userIdWith] = {
        saldo: 0,
        role: 'bronze'
      };
    }
    
    // Also check without suffix
    if (!db.data.users[nomorNya]) {
      db.data.users[nomorNya] = {
        saldo: 0,
        role: 'bronze'
      };
    }
    
    const before = parseInt(db.data.users[userIdWith].saldo) || 0;
    const after = before + amount;
    
    // No limit - allow negative saldo
    // Update saldo using dbHelper
    await dbHelper.updateUserSaldo(userIdWith, amount, 'add');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    console.log(`✅ [Web POS Admin] Saldo added - User: ${nomorNya}, Amount: ${amount}, Before: ${before}, After: ${after}, By: ${cleanPhone}`);
    
    res.json({
      success: true,
      data: {
        userId: userIdWith,
        before: before,
        after: after,
        delta: amount
      }
    });
  } catch (error) {
    console.error('[Web POS] Admin add saldo error:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal menambahkan saldo: ' + error.message
    });
  }
});

// Admin: Change user PIN
app.patch('/api/admin/users/:userId/pin', requireAuth, async (req, res) => {
  try {
    const cleanPhone = req.session.cleanPhone;
    
    if (!isOwner(cleanPhone)) {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak. Hanya admin yang bisa mengubah PIN.'
      });
    }
    
    const { userId } = req.params;
    const { pin } = req.body;
    
    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'PIN harus diisi'
      });
    }
    
    // Validate PIN format (4-6 digits)
    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        error: 'PIN harus berupa 4-6 digit angka'
      });
    }
    
    // Normalize user ID - handle both formats
    let normalizedUserId = userId;
    
    // If it's a phone number format, normalize it
    if (!userId.includes('@')) {
      const nomorNya = normalizePhoneNumber(userId);
      normalizedUserId = nomorNya + '@s.whatsapp.net';
    } else {
      // Extract phone number from format like "628123456789@s.whatsapp.net"
      const phonePart = userId.split('@')[0];
      const nomorNya = normalizePhoneNumber(phonePart);
      normalizedUserId = nomorNya + '@s.whatsapp.net';
    }
    
    // Check if user exists
    const userExists = db.data.users[normalizedUserId] || db.data.users[normalizedUserId.replace('@s.whatsapp.net', '')];
    
    if (!userExists) {
      return res.status(404).json({
        success: false,
        error: 'User tidak ditemukan'
      });
    }
    
    // Get old PIN for logging
    const oldPin = await getUserPin(normalizedUserId);
    
    // Update PIN
    await setUserPin(normalizedUserId, pin);
    
    console.log(`✅ [Web POS Admin] PIN changed - User: ${normalizedUserId}, By: ${cleanPhone}`);
    
    res.json({
      success: true,
      data: {
        userId: normalizedUserId,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Web POS] Admin change PIN error:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal mengubah PIN: ' + error.message
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
    
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN baru harus 4 digit angka' 
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

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-pos-public', 'admin.html'));
});

// Payment page
app.get('/payment/:orderId', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-pos-public', 'payment.html'));
});

// API endpoint to get order details (untuk payment.html cek status)
app.get('/api/order/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    
    // Find order from db.data.order[userId]
    const order = db.data.order?.[userId];
    
    if (!order || order.orderId !== orderId) {
      // Check if already completed in transaction history
      const transaction = (db.data.transaksi || []).find(t => 
        t.reffId && orderId.includes(t.reffId)
      );
      
      if (transaction) {
        return res.json({
          success: true,
          order: {
            orderId: orderId,
            reffId: transaction.reffId,
            productName: transaction.name,
            quantity: transaction.jumlah,
            totalAmount: transaction.totalBayar,
            status: 'completed',
            expiresAt: null,
            receipt: transaction.receipt || null,
            receiptText: transaction.receiptText || null,
            account: transaction.account || [],
            snk: transaction.snk || ''
          }
        });
      }
      
      return res.status(404).json({ 
        success: false, 
        message: 'Order tidak ditemukan atau sudah expired' 
      });
    }
    
    // Get QR image base64 if available
    let qrisImageBase64 = null;
    if (order.qrisImagePath) {
      try {
        const qrBuffer = fs.readFileSync(order.qrisImagePath);
        qrisImageBase64 = qrBuffer.toString('base64');
      } catch (qrError) {
        console.error('[Web POS] Error reading QR image:', qrError.message);
      }
    }
    
    // Return order data dengan status
    res.json({
      success: true,
      order: {
        orderId: order.orderId,
        reffId: order.reffId,
        productName: order.productName || 'Unknown Product',
        quantity: order.jumlah,
        totalAmount: order.totalAmount,
        totalHarga: order.totalHarga,
        uniqueCode: order.uniqueCode,
        status: order.status || 'pending_payment',
        expiresAt: moment(order.createdAt + (30 * 60 * 1000)).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
        qrisImageBase64: qrisImageBase64
      }
    });
  } catch (error) {
    console.error('[Web POS] Get order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan saat mengambil data order' 
    });
  }
});

// API endpoint to get pending order for current user (untuk restore setelah reload)
app.get('/api/pending-order', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!db.data.order) db.data.order = {};
    
    const order = db.data.order[userId];
    
    if (!order) {
      return res.json({
        success: true,
        hasPendingOrder: false,
        order: null
      });
    }
    
    // Check if order is expired
    const expirationTime = order.createdAt + (30 * 60 * 1000); // 30 minutes
    if (Date.now() > expirationTime) {
      // Order expired, clean it up
      delete db.data.order[userId];
      try {
        if (typeof db._save === 'function') {
          await db._save();
        } else {
          await db.save();
        }
      } catch (saveError) {
        console.error(`❌ [Web POS] Error saving after cleanup:`, saveError);
      }
      
      return res.json({
        success: true,
        hasPendingOrder: false,
        order: null
      });
    }
    
    // Get QR image base64 if available
    let qrisImageBase64 = null;
    if (order.qrisImagePath) {
      try {
        const qrBuffer = fs.readFileSync(order.qrisImagePath);
        qrisImageBase64 = qrBuffer.toString('base64');
      } catch (qrError) {
        console.error('[Web POS] Error reading QR image:', qrError.message);
      }
    }
    
    // Return order data
    res.json({
      success: true,
      hasPendingOrder: true,
      order: {
        orderId: order.orderId,
        reffId: order.reffId,
        productName: order.productName || 'Unknown Product',
        jumlah: order.jumlah,
        totalAmount: order.totalAmount,
        totalHarga: order.totalHarga,
        uniqueCode: order.uniqueCode,
        createdAt: order.createdAt,
        status: order.status || 'pending_payment',
        qrisImageBase64: qrisImageBase64
      }
    });
  } catch (error) {
    console.error('[Web POS] Get pending order error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data order'
    });
  }
});

// API endpoint to cancel order (sama seperti case 'batal' di index.js)
app.post('/api/cancel-order', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!db.data.order) db.data.order = {};
    
    if (!db.data.order[userId]) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada order yang sedang berlangsung'
      });
    }
    
    // Delete order
    const orderId = db.data.order[userId].orderId;
    delete db.data.order[userId];
    
    // Save database
    try {
      if (typeof db._save === 'function') {
        await db._save();
      } else {
        await db.save();
      }
      console.log(`✅ [Web POS] Order cancelled - OrderID: ${orderId}, User: ${userId}`);
    } catch (saveError) {
      console.error(`❌ [Web POS] Error saving after cancel:`, saveError);
    }
    
    res.json({
      success: true,
      message: 'Order berhasil dibatalkan'
    });
  } catch (error) {
    console.error('[Web POS] Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membatalkan order'
    });
  }
});

// API endpoint to cancel specific order by orderId
app.post('/api/cancel-order/:orderId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { orderId } = req.params;
    
    if (!db.data.order) db.data.order = {};
    
    // Check if order exists and matches
    if (!db.data.order[userId]) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada order yang sedang berlangsung'
      });
    }
    
    if (db.data.order[userId].orderId !== orderId) {
      return res.status(404).json({
        success: false,
        message: 'Order tidak ditemukan atau sudah tidak valid'
      });
    }
    
    // Delete order
    delete db.data.order[userId];
    
    // Save database
    try {
      if (typeof db._save === 'function') {
        await db._save();
      } else {
        await db.save();
      }
      console.log(`✅ [Web POS] Order cancelled - OrderID: ${orderId}, User: ${userId}`);
    } catch (saveError) {
      console.error(`❌ [Web POS] Error saving after cancel:`, saveError);
    }
    
    res.json({
      success: true,
      message: 'Order berhasil dibatalkan'
    });
  } catch (error) {
    console.error('[Web POS] Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membatalkan order'
    });
  }
});

// API endpoint to check payment status (polling, sama seperti di index.js)
app.get('/api/payment/check/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const cleanPhone = req.session.cleanPhone;
    
    // Check if order exists
    const order = db.data.order?.[userId];
    if (!order || order.orderId !== orderId) {
      return res.status(404).json({
        success: false,
        message: 'Order tidak ditemukan'
      });
    }
    
    // Check if expired
    const expirationTime = order.createdAt + (30 * 60 * 1000); // 30 minutes
    if (Date.now() >= expirationTime) {
      // Delete expired order
      delete db.data.order[userId];
      await db.save();
      
      return res.json({
        success: false,
        expired: true,
        message: 'Order telah expired'
      });
    }
    
    // Check payment status from listener (sama seperti di index.js)
    try {
      const axios = require('axios');
      const listener = {
        baseUrl: process.env.LISTENER_URL || 'http://localhost:3001',
        apiKey: process.env.LISTENER_API_KEY || ''
      };
      
      const url = `${listener.baseUrl}/notifications?limit=50`;
      const headers = listener.apiKey ? { 'X-API-Key': listener.apiKey } : {};
      const resp = await axios.get(url, { headers, timeout: 5000 });
      const notifs = Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data) ? resp.data : []);
      
      // Check if payment found (sama logic dengan index.js)
      const paid = notifs.find(n => {
        try {
          const pkgOk = (n.package_name === 'id.bmri.livinmerchant') || (String(n.app_name||'').toUpperCase().includes('LIVIN'));
          const amt = Number(String(n.amount_detected || '').replace(/[^0-9]/g, ''));
          const postedAt = n.posted_at ? new Date(n.posted_at).getTime() : 0;
          return pkgOk && amt === Number(order.totalAmount) && postedAt >= order.createdAt;
        } catch {
          return false;
        }
      });
      
      if (paid) {
        // Payment confirmed! Process order
        const product = db.data.produk[order.id];
        if (!product || product.stok.length < order.jumlah) {
          return res.json({
            success: false,
            message: 'Produk tidak tersedia'
          });
        }
        
        // Process pembelian (sama seperti di index.js)
        product.terjual += order.jumlah;
        const dataStok = [];
        for (let i = 0; i < order.jumlah; i++) {
          dataStok.push(product.stok.shift());
        }
        
        // Format detail akun
        const detailParts = [
          `*📦 Produk:* ${product.name}`,
          `*📅 Tanggal:* ${moment.tz('Asia/Jakarta').format('DD MMMM YYYY')}`,
          `*⏰ Jam:* ${moment.tz('Asia/Jakarta').format('HH:mm:ss')} WIB`,
          `*Refid:* ${order.reffId}`,
          ''
        ];
        
        dataStok.forEach((i) => {
          const dataAkun = i.split("|");
          detailParts.push(
            `│ 📧 Email: ${dataAkun[0] || 'Tidak ada'}`,
            `│ 🔐 Password: ${dataAkun[1] || 'Tidak ada'}`,
            `│ 👤 Profil: ${dataAkun[2] || 'Tidak ada'}`,
            `│ 🔢 Pin: ${dataAkun[3] || 'Tidak ada'}`,
            `│ 🔒 2FA: ${dataAkun[4] || 'Tidak ada'}`,
            ''
          );
        });
        
        detailParts.push(
          `*╭────「 SYARAT & KETENTUAN 」────╮*`,
          '',
          `*📋 SNK PRODUK: ${product.name}*`,
          '',
          product.snk,
          '',
          `*⚠️ PENTING:*`,
          `• Baca dan pahami SNK sebelum menggunakan akun`,
          `• Akun yang sudah dibeli tidak dapat dikembalikan`,
          `• Hubungi admin jika ada masalah dengan akun`,
          '',
          `*╰────「 END SNK 」────╯*`
        );
        
        const detailAkunCustomer = detailParts.join('\n');
        
        // Save receipt
        try {
          const { saveReceipt } = require('./config/r2-storage');
          const result = await saveReceipt(order.reffId, detailAkunCustomer);
          if (result.success) {
            console.log(`✅ Receipt saved to ${result.storage}: ${result.url || result.path || order.reffId}`);
          }
        } catch (receiptError) {
          console.error('❌ Error saving receipt:', receiptError.message);
        }
        
        // Add to transaction database
        db.data.transaksi.push({
          id: order.id,
          name: product.name,
          price: order.totalHarga / order.jumlah,
          date: moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
          profit: product.profit,
          jumlah: order.jumlah,
          user: cleanPhone,
          userRole: order.userRole,
          reffId: order.reffId,
          metodeBayar: "QRIS",
          totalBayar: order.totalAmount
        });
        
        // Delete order
        delete db.data.order[userId];
        
        // Save database
        await db.save();
        
        console.log(`✅ [Web POS] Payment confirmed and processed - OrderID: ${orderId}, RefID: ${order.reffId}`);
        
        return res.json({
          success: true,
          paid: true,
          message: 'Pembayaran berhasil!',
          transaction: {
            refId: order.reffId,
            productName: product.name,
            quantity: order.jumlah,
            totalPrice: order.totalAmount,
            receiptContent: detailAkunCustomer
          }
        });
      }
      
      // Payment not found yet
      return res.json({
        success: true,
        paid: false,
        message: 'Menunggu pembayaran...'
      });
      
    } catch (listenerError) {
      console.error('[Web POS] Listener check error:', listenerError);
      return res.json({
        success: true,
        paid: false,
        message: 'Menunggu pembayaran...'
      });
    }
    
  } catch (error) {
    console.error('[Web POS] Check payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengecek status pembayaran'
    });
  }
});

// Serve QRIS image
app.get('/qris/:filename', (req, res) => {
  const { filename } = req.params;
  const qrisPath = path.join(__dirname, 'options', 'sticker', filename);
  
  if (fs.existsSync(qrisPath)) {
    res.sendFile(qrisPath);
  } else {
    res.status(404).json({ success: false, message: 'QRIS image not found' });
  }
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

