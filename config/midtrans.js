// midtrans-service.js (versi edited)
const fs = require('fs');
const path = require('path');
const https = require('https');

// ========== LOAD .ENV ==========
let envConfig = {};
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) {
        envConfig[key] = value;
        // CHANGE: apply to process.env if not already set
        if (process.env[key] === undefined) process.env[key] = value;
      }
    });
  }
} catch (error) {
  console.log('No .env file found, using process.env');
}

// Validate env
const envValidator = require('./env-validator');
const validatedConfig = envValidator.validateOrExit();

// Midtrans env
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;
const MIDTRANS_MERCHANT_ID = process.env.MIDTRANS_MERCHANT_ID;
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

const MIDTRANS_BASE_URL = MIDTRANS_IS_PRODUCTION
  ? 'https://api.midtrans.com'
  : 'https://api.sandbox.midtrans.com';

// ======= Simple fetch fallback (Node<18) =======
// CHANGE: provide fetch if missing
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = async (...args) => {
    const { default: fetch } = await import('node-fetch'); // pastikan package terinstall jika Node<18
    return fetch(...args);
  };
}

// ======= Simple logger guard (avoid sensitive logs) =======
const isProd = MIDTRANS_IS_PRODUCTION;
const safeLog = (...args) => { if (!isProd) console.log(...args); };

// ======= Local cache =======
const paymentCache = new Map();
const PAYMENT_CACHE_FILE = path.join(__dirname, 'midtrans-payment-cache.json');
const CACHE_TTL = 30 * 1000; // 30s

function loadPaymentCache() {
  try {
    if (fs.existsSync(PAYMENT_CACHE_FILE)) {
      const data = fs.readFileSync(PAYMENT_CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      paymentCache.clear();
      Object.entries(cache).forEach(([key, value]) => {
        if (Date.now() < new Date(value.cachedAt).getTime() + CACHE_TTL) {
          paymentCache.set(key, value);
        }
      });
      safeLog(`Loaded ${paymentCache.size} cached Midtrans payments`);
    }
  } catch (error) {
    console.log('No Midtrans payment cache found or error loading cache:', error?.message);
  }
}

function savePaymentCache() {
  try {
    const cache = {};
    paymentCache.forEach((value, key) => (cache[key] = value));
    fs.writeFileSync(PAYMENT_CACHE_FILE, JSON.stringify(cache, null, 2));
    safeLog(`Saved ${paymentCache.size} cached Midtrans payments`);
  } catch (error) {
    console.error('Error saving Midtrans payment cache:', error?.message);
  }
}

function storePaymentData(orderId, paymentData) {
  paymentCache.set(orderId, { ...paymentData, cachedAt: new Date().toISOString() });
  savePaymentCache();
}

function getCachedPaymentData(orderId) {
  const cached = paymentCache.get(orderId);
  if (cached && Date.now() < new Date(cached.cachedAt).getTime() + CACHE_TTL) {
    safeLog(`Found valid cached Midtrans payment data for ${orderId}`);
    return cached;
  }
  paymentCache.delete(orderId);
  savePaymentCache();
  return null;
}

function clearCachedPaymentData(orderId) {
  paymentCache.delete(orderId);
  savePaymentCache();
  safeLog(`Cleared Midtrans cache for ${orderId}`);
}

loadPaymentCache();

// ======= HTTP helper =======
function makeMidtransRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    // endpoint e.g. '/v2/charge'
    const url = new URL(endpoint, MIDTRANS_BASE_URL);

    const payload = data ? JSON.stringify(data) : null;

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Basic auth with server key
        'Authorization': `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64')}`
      },
      // CHANGE: add basic timeout
      timeout: 25_000
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (c) => (responseData += c));
      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            return resolve(parsed);
          }
          const msg =
            parsed?.error_messages?.join?.(', ') ||
            parsed?.error_message ||
            parsed?.status_message ||
            responseData ||
            `HTTP ${res.statusCode}`;
          reject(new Error(`Midtrans API Error: ${res.statusCode} - ${msg}`));
        } catch (e) {
          reject(new Error(`Failed to parse Midtrans response: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Midtrans request failed: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Midtrans request timeout'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ======= Core: Create QRIS (Core API) =======
async function createQRISCore(amount, orderId, customerDetails = {}, opts = {}) {
  try {
    safeLog(`Creating Midtrans Core API QRIS for amount: ${amount}, orderId: ${orderId}`);

    const transactionDetails = { order_id: orderId, gross_amount: Number(amount) };
    const itemDetails = [{
      id: customerDetails.product_id || 'PRODUCT',
      price: Number(amount),
      quantity: 1,
      name: customerDetails.product_name || 'Pembelian Produk Digital'
    }];

    const customerDetailsObj = {
      first_name: customerDetails.first_name || 'Customer',
      ...(customerDetails.last_name ? { last_name: customerDetails.last_name } : {}),
      email: customerDetails.email || 'customer@example.com',
      phone: customerDetails.phone || '08123456789'
    };

    // CHANGE: allow acquirer & custom_expiry via opts
    const qris = {};
    if (opts.acquirer) qris.acquirer = opts.acquirer;

    const coreRequest = {
      payment_type: 'qris',
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetailsObj,
      ...(Object.keys(qris).length ? { qris } : {}),
      ...(opts.expiryMinutes ? {
        custom_expiry: { expiry_duration: Number(opts.expiryMinutes), unit: 'minute' }
      } : {})
    };

    // jangan log payload lengkap di prod
    safeLog('Midtrans Core API QRIS request (safe):', {
      payment_type: coreRequest.payment_type,
      order_id: orderId,
      amount
    });

    let result = await makeMidtransRequest('/v2/charge', 'POST', coreRequest);

    // fallback kalau channel belum aktif
    if (result && String(result.status_code) === '402') {
      const fallbackReq = {
        payment_type: 'qris',
        transaction_details: transactionDetails,
        item_details: itemDetails,
        customer_details: customerDetailsObj
      };
      console.warn('Midtrans returned 402 (channel inactive). Retrying without specific acquirer...');
      result = await makeMidtransRequest('/v2/charge', 'POST', fallbackReq);
    }

    // parse QR
    let qrisString = result.qr_string || null;
    let qrImageUrl = result.qr_url || result.qr_code || null;

    if ((!qrisString || !qrImageUrl) && Array.isArray(result.actions)) {
      const v2 = result.actions.find(a => /generate-qr-code-v2/i.test(a.name || ''));
      const v1 = result.actions.find(a => /generate-qr-code/i.test(a.name || ''));
      const chosen = v2 || v1;
      if (chosen?.url) {
        qrImageUrl = qrImageUrl || chosen.url;
        qrisString = qrisString || chosen.url; // jika Midtrans hanya beri URL generator
      }
    }

    const stillInactive = result && String(result.status_code) === '402';
    const noUsableQr = !qrisString && !qrImageUrl;
    if (stillInactive || noUsableQr) {
      console.warn('QRIS Core unavailable, fallback to Payment Link hosted page...');
      const items = [{
        id: customerDetails.product_id || 'PRODUCT',
        price: Number(amount),
        quantity: 1,
        name: customerDetails.product_name || 'Pembelian Produk Digital'
      }];
      const link = await createPaymentLink(amount, orderId, customerDetailsObj, items, {
        title: `Order ${orderId}`,
        description: `Pembayaran pesanan ${orderId}`
      });
      const fallbackData = {
        transaction_id: result?.transaction_id,
        order_id: orderId,
        amount: Number(amount),
        status: 'pending',
        qr_string: link.payment_url,
        qr_image_url: link.payment_url,
        payment_url: link.payment_url,
        payment_link_id: link.id,
        created: new Date().toISOString(),
        payment_type: 'payment_link'
      };
      storePaymentData(orderId, fallbackData);
      return fallbackData;
    }

    const paymentData = {
      transaction_id: result.transaction_id,
      order_id: orderId,
      amount: Number(amount),
      status: 'pending',
      qr_string: qrisString,
      qr_image_url: qrImageUrl,
      created: new Date().toISOString(),
      payment_type: 'qris'
    };
    storePaymentData(orderId, paymentData);
    return paymentData;

  } catch (error) {
    console.error('Error creating Midtrans Core API QRIS:', error?.message);
    throw new Error(`Failed to create Midtrans QRIS: ${error.message}`);
  }
}

// ======= getQRISString (fallback) =======
async function getQRISString(qrCodeUrl) {
  try {
    const res = await fetchFn(qrCodeUrl);
    if (!res.ok) throw new Error(`Failed to fetch QR: ${res.status}`);
    // Tidak ada cara standar untuk extract raw EMV dari URL generator, jadi kembalikan URL.
    return qrCodeUrl;
  } catch (error) {
    console.error('Error getting QRIS string:', error?.message);
    throw error;
  }
}

// ======= Status / helpers =======
async function getPaymentStatus(orderId) {
  try {
    const cached = getCachedPaymentData(orderId);
    if (cached) return cached;

    const result = await makeMidtransRequest(`/v2/${orderId}/status`, 'GET');

    const paymentData = {
      order_id: result.order_id,
      transaction_status: result.transaction_status, // pending/settlement/expire/...
      payment_type: result.payment_type,
      gross_amount: Number(result.gross_amount || 0), // CHANGE: normalize
      transaction_time: result.transaction_time,
      settlement_time: result.settlement_time,
      fraud_status: result.fraud_status,
      status_code: String(result.status_code || ''),
      status_message: result.status_message
    };

    storePaymentData(orderId, paymentData);
    return paymentData;
  } catch (error) {
    console.error('Error getting Midtrans payment status:', error?.message);
    throw new Error(`Failed to get Midtrans payment status: ${error.message}`);
  }
}

async function isPaymentCompleted(orderId) {
  try {
    const status = await getPaymentStatus(orderId);
    const isDone = status.transaction_status === 'settlement' || status.transaction_status === 'capture';
    if (isDone) clearCachedPaymentData(orderId); // ensure fresh on next read
    return {
      status: isDone ? 'PAID' : 'PENDING',
      paid_amount: isDone ? status.gross_amount : 0,
      transaction_status: status.transaction_status,
      payment_type: status.payment_type,
      settlement_time: status.settlement_time
    };
  } catch (error) {
    console.error('Error checking completion:', error?.message);
    return { status: 'ERROR', paid_amount: 0, error: error.message };
  }
}

async function getPaymentDetails(orderId) {
  return getPaymentStatus(orderId);
}

// CHANGE: add expire helper
async function expireTransaction(orderId) {
  try {
    await makeMidtransRequest(`/v2/${orderId}/expire`, 'POST', {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ======= Payment Link helpers =======
async function getPaymentLinkStatus(paymentLinkId) {
  const normalize = (obj) => {
    const raw = String(obj?.status || obj?.transaction_status || obj?.payment_status || '');
    if (/paid|settlement|capture|success/i.test(raw)) return 'PAID';
    if (/expire|expired|cancel/i.test(raw)) return 'EXPIRED';
    return 'PENDING';
  };

  let lastError = null;
  const endpoints = [
    `/v1/payment-links/${paymentLinkId}`,
    `/v1/payment-links/${paymentLinkId}/transactions`
  ];

  for (const ep of endpoints) {
    try {
      const result = await makeMidtransRequest(ep, 'GET');
      if (Array.isArray(result?.transactions)) {
        const anyPaid = result.transactions.some(tx => /settlement|capture|success|paid/i.test(String(tx.transaction_status)));
        const latest = result.transactions[0];
        return { status: anyPaid ? 'PAID' : 'PENDING', raw: result, derived_order_id: latest?.order_id };
      } else {
        return { status: normalize(result), raw: result };
      }
    } catch (err) {
      lastError = err;
      // lanjut ke endpoint lain
    }
  }

  // optional opposite base try di-skip untuk sederhana (bisa ditambah bila perlu)
  return { status: 'ERROR', error: lastError?.message || 'Unknown error' };
}

async function createPaymentLink(amount, orderId, customerDetails = {}, itemDetails = [], meta = {}) {
  try {
    const items = Array.isArray(itemDetails) && itemDetails.length > 0
      ? itemDetails.map(it => ({ ...it, price: Number(it.price), quantity: Number(it.quantity) }))
      : [{ id: 'ITEM', price: Number(amount), quantity: 1, name: 'Order' }];

    const calculatedTotal = items.reduce((s, it) => s + (Number(it.price) * Number(it.quantity)), 0);

    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Number(calculatedTotal)
      },
      title: meta.title || `Order ${orderId}`,
      description: meta.description || `Pembayaran pesanan ${orderId}`,
      customer_details: {
        first_name: customerDetails.first_name || 'Customer',
        ...(customerDetails.last_name ? { last_name: customerDetails.last_name } : {}),
        email: customerDetails.email || 'customer@example.com',
        phone: customerDetails.phone || '08123456789'
      },
      item_details: items,
      usage_limit: 1
    };

    const result = await makeMidtransRequest('/v1/payment-links', 'POST', payload);
    return {
      id: result.id,
      payment_url: result.payment_url || result.short_url || result.url,
      created_at: result.created_at
    };
  } catch (error) {
    console.error('Error creating Payment Link:', error?.message);
    throw new Error(`Failed to create Payment Link: ${error.message}`);
  }
}

async function createQRISPayment(amount, orderId, customerDetails = {}) {
  try {
    const items = [{ id: 'PRODUCT', price: Number(amount), quantity: 1, name: 'Pembelian Produk Digital' }];
    const link = await createPaymentLink(amount, orderId, customerDetails, items, {
      title: `Order ${orderId}`,
      description: `Pembayaran pesanan ${orderId}`
    });
    return {
      transaction_id: undefined,
      order_id: orderId,
      amount: Number(amount),
      status: 'pending',
      qr_string: link.payment_url,
      snap_url: link.payment_url
    };
  } catch (error) {
    console.error('Error creating QRIS via Payment Link:', error?.message);
    throw new Error(`Failed to create Midtrans payment: ${error.message}`);
  }
}

async function getServiceStatus() {
  try {
    return {
      status: 'active',
      provider: 'Midtrans',
      environment: MIDTRANS_IS_PRODUCTION ? 'production' : 'sandbox',
      merchant_id: MIDTRANS_MERCHANT_ID,
      server_key: MIDTRANS_SERVER_KEY ? 'Using Provided' : 'Missing',
      base_url: MIDTRANS_BASE_URL
    };
  } catch (error) {
    return { status: 'inactive', provider: 'Midtrans', error: error.message };
  }
}

module.exports = {
  createQRISPayment,
  createQRISCore,
  getQRISString,
  getPaymentStatus,
  isPaymentCompleted,
  getPaymentDetails,
  createPaymentLink,
  getPaymentLinkStatus,
  getServiceStatus,
  expireTransaction, // CHANGE: export helper
  clearCachedPaymentData,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_CLIENT_KEY,
  MIDTRANS_MERCHANT_ID,
  MIDTRANS_IS_PRODUCTION
};
