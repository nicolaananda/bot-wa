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

// Direct Midtrans configuration (bypass validation)
const MIDTRANS_SERVER_KEY = 'Mid-server-ZVcAyI7O27Ta4HCL7E4K-gPJ';
const MIDTRANS_CLIENT_KEY = 'Mid-client-X9jH0BYWkQilhmW0';
const MIDTRANS_MERCHANT_ID = 'G636278165';
const MIDTRANS_IS_PRODUCTION = true;

console.log('🔧 Using direct Midtrans configuration:');
console.log('- Merchant ID:', MIDTRANS_MERCHANT_ID);
console.log('- Environment:', MIDTRANS_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX');
console.log('- Server Key: [CONFIGURED]');
console.log('- Client Key: [CONFIGURED]');

// Determine API base URL based on environment
// const MIDTRANS_BASE_URL = MIDTRANS_IS_PRODUCTION 
//   ? 'https://api.midtrans.com'
//   : 'https://api.sandbox.midtrans.com';
const MIDTRANS_BASE_URL = MIDTRANS_IS_PRODUCTION 
  ? 'https://api.midtrans.com'
  : 'https://api.sandbox.midtrans.com';
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
      id: customerDetails.product_id || 'PRODUCT',
      price: amount, // Total amount (termasuk kode unik) 
      quantity: 1,   // Quantity selalu 1 karena price sudah total
      name: customerDetails.product_name || 'Pembelian Produk Digital'
    }];

    const customerDetailsObj = {
      first_name: customerDetails.first_name || 'Customer',
      last_name: customerDetails.last_name || 'User', // Midtrans requires non-empty last_name
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
    
    if (result.actions && result.actions.length > 0) {
      const qrAction = result.actions.find(action => action.name === 'generate-qr-code');
      if (qrAction && qrAction.url) {
        qrImageUrl = qrAction.url;
        qrisString = qrAction.url; // URL to get QR image
      }
    }
    
    const paymentData = {
      transaction_id: result.transaction_id,
      order_id: orderId,
      amount: amount,
      status: 'pending',
      qr_string: qrisString,
      qr_image_url: qrImageUrl,
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
 * Check if payment is completed - Simplified webhook-based approach
 */
async function isPaymentCompleted(orderId) {
  try {
    console.log(`🔍 Checking payment completion for order: ${orderId}`);
    
    // First check cache for webhook updates
    const cached = getCachedPaymentData(orderId);
    if (cached && (cached.transaction_status === 'settlement' || cached.transaction_status === 'capture')) {
      console.log(`✅ Found completed payment in cache for ${orderId}`);
      return {
        status: 'PAID',
        paid_amount: cached.gross_amount || 0,
        transaction_status: cached.transaction_status,
        payment_type: cached.payment_type,
        settlement_time: cached.settlement_time,
        working_order_id: orderId
      };
    }
    
    // Try direct status check with original order ID
    try {
      const status = await getPaymentStatus(orderId);
      
      console.log(`📊 Payment status for ${orderId}:`, {
        transaction_status: status.transaction_status,
        payment_type: status.payment_type,
        gross_amount: status.gross_amount,
        status_code: status.status_code
      });
      
      const isCompleted = status.transaction_status === 'settlement' || 
                         status.transaction_status === 'capture';
      
      if (isCompleted) {
        console.log(`✅ Payment completed for ${orderId}`);
        // Update cache with completed status
        storePaymentData(orderId, status);
      } else {
        console.log(`⏳ Payment still pending for ${orderId}, status: ${status.transaction_status || 'undefined'}`);
      }
      
      return {
        status: isCompleted ? 'PAID' : 'PENDING',
        paid_amount: isCompleted ? (status.gross_amount || 0) : 0,
        transaction_status: status.transaction_status,
        payment_type: status.payment_type,
        settlement_time: status.settlement_time,
        working_order_id: orderId
      };
      
    } catch (apiError) {
      console.log(`❌ Direct status check failed for ${orderId}: ${apiError.message}`);
      
      // If API call fails, check if it's a 404 (transaction not found)
      if (apiError.message.includes('404') || apiError.message.includes("doesn't exist")) {
        console.log('💡 Transaction not found - may need webhook update or different order ID format');
        
        // Return pending status and suggest webhook
        return {
          status: 'PENDING',
          paid_amount: 0,
          error: 'Transaction not found via API',
          suggestion: 'webhook_required',
          working_order_id: null
        };
      }
      
      // For other errors, return error status
      return {
        status: 'ERROR',
        paid_amount: 0,
        error: apiError.message,
        working_order_id: null
      };
    }
    
  } catch (error) {
    console.error('Error checking payment completion:', error);
    return {
      status: 'ERROR',
      paid_amount: 0,
      error: error.message,
      working_order_id: null
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
 * Create Gopay payment using Midtrans Snap API (more reliable)
 */
async function createGopayPayment(amount, orderId, customerDetails = {}) {
  try {
    console.log(`Creating Midtrans Gopay payment via Snap API for amount: ${amount}, orderId: ${orderId}`);
    
    const transactionDetails = {
      order_id: orderId,
      gross_amount: amount
    };

    const itemDetails = [{
      id: customerDetails.product_id || 'PRODUCT',
      price: amount,
      quantity: 1,
      name: customerDetails.product_name || 'Pembelian Produk Digital'
    }];

    const customerDetailsObj = {
      first_name: customerDetails.first_name || 'Customer',
      last_name: customerDetails.last_name || 'User', // Midtrans requires non-empty last_name
      email: customerDetails.email || 'customer@example.com',
      phone: customerDetails.phone || '08123456789'
    };

    // Gunakan Snap API untuk Gopay - lebih reliable
    const snapRequest = {
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetailsObj,
      enabled_payments: ["gopay"], // Hanya aktifkan Gopay
      gopay: {
        enable_callback: true,
        callback_url: "https://midtrans.com"
      }
    };

    console.log('Midtrans Snap Gopay request:', JSON.stringify(snapRequest, null, 2));
    
    // Gunakan Snap API endpoint untuk create payment link
    const result = await makeMidtransRequest('/v1/payment-links', 'POST', snapRequest);
    console.log('Midtrans Snap Gopay payment created successfully:', result);
    
    // Extract payment URL and info
    let paymentUrl = result.payment_url;
    
    // Extract order ID from response - this might be incomplete
    let midtransOrderId = result.order_id || result.id || result.payment_id || orderId;
    
    // If still not found, extract from payment URL
    if (!midtransOrderId && paymentUrl) {
      const urlParts = paymentUrl.split('/');
      midtransOrderId = urlParts[urlParts.length - 1] || orderId;
    }
    
    console.log('🔍 Payment creation details:');
    console.log(`- Original Order ID: ${orderId}`);
    console.log(`- Midtrans Order ID (from response): ${midtransOrderId}`);
    console.log(`- Payment URL: ${paymentUrl}`);
    console.log(`- ⚠️  Note: Real Midtrans Order ID will be updated via webhook`);
    console.log(`- Full Midtrans Response:`, JSON.stringify(result, null, 2));
    
    const paymentData = {
      transaction_id: midtransOrderId, // Use Midtrans order ID for status checking
      order_id: orderId, // Our original order ID
      midtrans_order_id: midtransOrderId, // Store both for reference
      amount: amount,
      status: 'pending',
      payment_url: paymentUrl,
      snap_token: midtransOrderId,
      deeplink: paymentUrl, // Use payment URL as deeplink
      qr_string: paymentUrl,
      created: new Date().toISOString(),
      payment_type: 'gopay',
      status_code: '200',
      status_message: 'Payment link created successfully'
    };
    
    // Store with both order IDs for easier lookup
    storePaymentData(orderId, paymentData);
    storePaymentData(midtransOrderId, paymentData);
    return paymentData;
  } catch (error) {
    console.error('Error creating Midtrans Gopay payment:', error);
    throw new Error(`Failed to create Midtrans Gopay payment: ${error.message}`);
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

/**
 * Update order ID mapping from webhook data
 */
function updateOrderIdFromWebhook(originalOrderId, webhookOrderId, webhookData = null) {
  try {
    console.log(`🔄 Updating order ID mapping: ${originalOrderId} -> ${webhookOrderId}`);
    
    // Get existing payment data
    const existingData = getCachedPaymentData(originalOrderId);
    const webhookPaymentData = getCachedPaymentData(webhookOrderId);
    
    if (existingData) {
      // Update with correct Midtrans order ID and webhook data
      existingData.midtrans_order_id = webhookOrderId;
      existingData.webhook_updated = new Date().toISOString();
      
      // If webhook data is available, merge it
      if (webhookPaymentData) {
        existingData.transaction_status = webhookPaymentData.transaction_status;
        existingData.payment_type = webhookPaymentData.payment_type;
        existingData.gross_amount = webhookPaymentData.gross_amount;
        existingData.settlement_time = webhookPaymentData.settlement_time;
        existingData.status_code = webhookPaymentData.status_code;
        existingData.status_message = webhookPaymentData.status_message;
        console.log(`📊 Merged webhook data: status=${webhookPaymentData.transaction_status}`);
      }
      
      // Store with both IDs
      storePaymentData(originalOrderId, existingData);
      storePaymentData(webhookOrderId, existingData);
      
      console.log(`✅ Order ID mapping updated successfully`);
      return true;
    } else {
      console.log(`⚠️ No existing data found for ${originalOrderId}`);
      return false;
    }
  } catch (error) {
    console.error('Error updating order ID mapping:', error);
    return false;
  }
}

module.exports = {
  createQRISCore,
  createGopayPayment,
  getQRISString,
  getPaymentStatus,
  isPaymentCompleted,
  getPaymentDetails,
  getServiceStatus,
  clearCachedPaymentData,
  storePaymentData,
  getCachedPaymentData,
  updateOrderIdFromWebhook,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_CLIENT_KEY,
  MIDTRANS_MERCHANT_ID,
  MIDTRANS_IS_PRODUCTION
};
