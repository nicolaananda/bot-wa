const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables if .env file exists
let envConfig = {};
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envConfig[key.trim()] = value.trim();
      }
    });
  }
} catch (error) {
  console.log('No .env file found, using default config');
}

// Midtrans configuration
const MIDTRANS_SERVER_KEY = envConfig.MIDTRANS_SERVER_KEY || 'Mid-server-gKkldwQbOCiluq1JardRR_bk';
const MIDTRANS_CLIENT_KEY = envConfig.MIDTRANS_CLIENT_KEY || 'Mid-client-nAhxrcVaalVHQMkv';
const MIDTRANS_MERCHANT_ID = envConfig.MIDTRANS_MERCHANT_ID || 'G636278165';
const MIDTRANS_BASE_URL = envConfig.MIDTRANS_BASE_URL || 'https://api.sandbox.midtrans.com';
const MIDTRANS_IS_PRODUCTION = envConfig.MIDTRANS_IS_PRODUCTION === 'true' || false;

// Local payment storage to avoid repeated API calls
const paymentCache = new Map();
const PAYMENT_CACHE_FILE = path.join(__dirname, 'midtrans-payment-cache.json');
const CACHE_TTL = 30 * 1000; // Cache TTL: 30 seconds (lebih responsif untuk payment monitoring)

// Load payment cache from file
function loadPaymentCache() {
  try {
    if (fs.existsSync(PAYMENT_CACHE_FILE)) {
      const data = fs.readFileSync(PAYMENT_CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      paymentCache.clear();
      Object.entries(cache).forEach(([key, value]) => {
        if (new Date().getTime() < new Date(value.cachedAt).getTime() + CACHE_TTL) {
          paymentCache.set(key, value);
        }
      });
      console.log(`Loaded ${paymentCache.size} cached Midtrans payments`);
    }
  } catch (error) {
    console.log('No Midtrans payment cache found or error loading cache:', error);
  }
}

// Save payment cache to file
function savePaymentCache() {
  try {
    const cache = {};
    paymentCache.forEach((value, key) => {
      cache[key] = value;
    });
    fs.writeFileSync(PAYMENT_CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`Saved ${paymentCache.size} cached Midtrans payments`);
  } catch (error) {
    console.error('Error saving Midtrans payment cache:', error);
  }
}

// Store payment data locally
function storePaymentData(orderId, paymentData) {
  paymentCache.set(orderId, {
    ...paymentData,
    cachedAt: new Date().toISOString()
  });
  savePaymentCache();
  console.log(`Stored Midtrans payment data for ${orderId}`);
}

// Get payment data from cache
function getCachedPaymentData(orderId) {
  const cached = paymentCache.get(orderId);
  if (cached && new Date().getTime() < new Date(cached.cachedAt).getTime() + CACHE_TTL) {
    console.log(`Found valid cached Midtrans payment data for ${orderId}`);
    return cached;
  }
  console.log(`No valid cached Midtrans payment data for ${orderId}`);
  paymentCache.delete(orderId);
  savePaymentCache();
  return null;
}

// Clear payment cache
function clearCachedPaymentData(orderId) {
  paymentCache.delete(orderId);
  savePaymentCache();
  console.log(`Cleared Midtrans cache for ${orderId}`);
}

// Load cache on startup
loadPaymentCache();

/**
 * Make HTTP request to Midtrans API
 */
function makeMidtransRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, MIDTRANS_BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64')}`
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject(new Error(`Midtrans API Error: ${res.statusCode} - ${parsedData.error_message || responseData}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Midtrans response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Midtrans request failed: ${error.message}`));
    });

    if (data && (method === 'POST' || method === 'PUT')) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Create QRIS payment using Midtrans Snap API with multiple payment options including DANA
 */
async function createQRISPayment(amount, orderId, customerDetails = {}) {
  try {
    console.log(`Creating Midtrans Snap payment for amount: ${amount}, orderId: ${orderId}`);
    
    const transactionDetails = {
      order_id: orderId,
      gross_amount: amount
    };

    const itemDetails = [{
      id: 'PRODUCT',
      price: amount,
      quantity: 1,
      name: 'Pembelian Produk Digital'
    }];

    const customerDetailsObj = {
      first_name: customerDetails.first_name || 'Customer',
      last_name: customerDetails.last_name || '',
      email: customerDetails.email || 'customer@example.com',
      phone: customerDetails.phone || '08123456789'
    };

    // Gunakan Snap API untuk multiple payment options termasuk DANA
    const snapRequest = {
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetailsObj,
      enabled_payments: [
        'qris',
        'gopay',
        'shopeepay',
        'dana',
        'ovo',
        'linkaja',
        'bca_va',
        'bni_va',
        'bri_va',
        'echannel',
        'permata_va',
        'other_va',
        'credit_card',
        'bca_klikbca',
        'bca_klikpay',
        'bri_epay',
        'telkomsel_cash',
        'mandiri_clickpay',
        'cimb_clicks',
        'danamon_online',
        'akulaku'
      ],
      callbacks: {
        finish: 'https://example.com/finish',
        pending: 'https://example.com/pending',
        error: 'https://example.com/error'
      }
    };

    console.log('Midtrans Snap request:', JSON.stringify(snapRequest, null, 2));
    
    // Gunakan Snap API untuk create payment
    const result = await makeMidtransRequest('/snap/v1/transactions', 'POST', snapRequest);
    console.log('Midtrans Snap created successfully:', result);
    
    // Buat URL Snap yang memberikan opsi pembayaran lengkap
    const invoiceUrl = result.redirect_url;
    
    const paymentData = {
      token: result.token,
      order_id: orderId,
      amount: amount,
      status: 'pending',
      qr_string: result.token, // Snap token untuk QR code
      created: new Date().toISOString(),
      snap_url: invoiceUrl
    };
    
    storePaymentData(orderId, paymentData);
    return paymentData;
  } catch (error) {
    console.error('Error creating Midtrans Snap payment:', error);
    throw new Error(`Failed to create Midtrans payment: ${error.message}`);
  }
}

/**
 * Get QRIS string from Midtrans QR code URL
 */
async function getQRISString(qrCodeUrl) {
  try {
    // Fetch the QR code data from Midtrans URL
    const response = await fetch(qrCodeUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch QR code: ${response.status}`);
    }
    
    // For now, we'll return the URL as the QRIS string
    // In a real implementation, you might need to extract the actual QRIS data
    return qrCodeUrl;
  } catch (error) {
    console.error('Error getting QRIS string:', error);
    throw error;
  }
}

/**
 * Create QRIS payment using Midtrans Core API to get QRIS string
 */
async function createQRISCore(amount, orderId, customerDetails = {}) {
  try {
    console.log(`Creating Midtrans Core API QRIS for amount: ${amount}, orderId: ${orderId}`);
    
    const transactionDetails = {
      order_id: orderId,
      gross_amount: amount
    };

    const itemDetails = [{
      id: 'PRODUCT',
      price: amount,
      quantity: 1,
      name: 'Pembelian Produk Digital'
    }];

    const customerDetailsObj = {
      first_name: customerDetails.first_name || 'Customer',
      last_name: customerDetails.last_name || '',
      email: customerDetails.email || 'customer@example.com',
      phone: customerDetails.phone || '08123456789'
    };

    // Gunakan Core API untuk mendapatkan QRIS string
    const coreRequest = {
      payment_type: 'qris',
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetailsObj,
      qris: {
        acquirer: 'gopay'
      }
    };

    console.log('Midtrans Core API QRIS request:', JSON.stringify(coreRequest, null, 2));
    
    // Gunakan Core API charge endpoint
    const result = await makeMidtransRequest('/v2/charge', 'POST', coreRequest);
    console.log('Midtrans Core API QRIS created successfully:', result);
    
    // Dapatkan QRIS string dari actions
    let qrisString = null;
    let qrImageUrl = null;
    let snapUrl = null;
    
    if (result.actions && result.actions.length > 0) {
      const qrAction = result.actions.find(action => action.name === 'generate-qr-code');
      if (qrAction && qrAction.url) {
        qrImageUrl = qrAction.url;
        qrisString = qrAction.url; // URL to get QR image
      }
    }
    
    // Tidak perlu SNAP payment, hanya gunakan Core API QRIS saja
    snapUrl = null;
    
    const paymentData = {
      transaction_id: result.transaction_id,
      order_id: orderId,
      amount: amount,
      status: 'pending',
      qr_string: qrisString,
      qr_image_url: qrImageUrl,
      snap_url: snapUrl,
      created: new Date().toISOString(),
      payment_type: 'qris',
      acquirer: 'gopay'
    };
    
    storePaymentData(orderId, paymentData);
    return paymentData;
  } catch (error) {
    console.error('Error creating Midtrans Core API QRIS:', error);
    throw new Error(`Failed to create Midtrans QRIS: ${error.message}`);
  }
}

/**
 * Get payment status by order ID
 */
async function getPaymentStatus(orderId) {
  try {
    console.log(`Getting Midtrans payment status for order: ${orderId}`);
    
    const cached = getCachedPaymentData(orderId);
    if (cached) {
      return cached;
    }
    
    const result = await makeMidtransRequest(`/v2/${orderId}/status`, 'GET');
    console.log('Midtrans payment status:', result);
    
    const paymentData = {
      order_id: result.order_id,
      transaction_status: result.transaction_status,
      payment_type: result.payment_type,
      gross_amount: result.gross_amount,
      transaction_time: result.transaction_time,
      settlement_time: result.settlement_time,
      fraud_status: result.fraud_status,
      status_code: result.status_code,
      status_message: result.status_message
    };
    
    storePaymentData(orderId, paymentData);
    return paymentData;
  } catch (error) {
    console.error('Error getting Midtrans payment status:', error);
    throw new Error(`Failed to get Midtrans payment status: ${error.message}`);
  }
}

/**
 * Check if payment is completed
 */
async function isPaymentCompleted(orderId) {
  try {
    const status = await getPaymentStatus(orderId);
    
    const isCompleted = status.transaction_status === 'settlement' || 
                       status.transaction_status === 'capture';
    
    // Jika status berubah menjadi completed, clear cache untuk memastikan data terbaru
    if (isCompleted) {
      clearCachedPaymentData(orderId);
      console.log(`✅ Payment completed for ${orderId}, cache cleared`);
    }
    
    return {
      status: isCompleted ? 'PAID' : 'PENDING',
      paid_amount: isCompleted ? status.gross_amount : 0,
      transaction_status: status.transaction_status,
      payment_type: status.payment_type,
      settlement_time: status.settlement_time
    };
  } catch (error) {
    console.error('Error checking Midtrans payment completion:', error);
    return {
      status: 'ERROR',
      paid_amount: 0,
      error: error.message
    };
  }
}

/**
 * Get payment details by order ID
 */
async function getPaymentDetails(orderId) {
  try {
    return await getPaymentStatus(orderId);
  } catch (error) {
    console.error('Error getting Midtrans payment details:', error);
    throw new Error(`Failed to get Midtrans payment details: ${error.message}`);
  }
}

/**
 * Get Midtrans service status
 */
async function getServiceStatus() {
  try {
    return {
      status: 'active',
      provider: 'Midtrans',
      environment: MIDTRANS_IS_PRODUCTION ? 'production' : 'sandbox',
      merchant_id: MIDTRANS_MERCHANT_ID,
      server_key: MIDTRANS_SERVER_KEY ? 'Using Provided' : 'Using Default',
      base_url: MIDTRANS_BASE_URL
    };
  } catch (error) {
    return {
      status: 'inactive',
      provider: 'Midtrans',
      error: error.message
    };
  }
}

module.exports = {
  createQRISPayment,
  createQRISCore,
  getQRISString,
  getPaymentStatus,
  isPaymentCompleted,
  getPaymentDetails,
  getServiceStatus,
  clearCachedPaymentData,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_CLIENT_KEY,
  MIDTRANS_MERCHANT_ID,
  MIDTRANS_IS_PRODUCTION
};
