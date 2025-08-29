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

// Xendit configuration
const XENDIT_SECRET_KEY = envConfig.XENDIT_SECRET_KEY || 'xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K';
const XENDIT_BASE_URL = envConfig.XENDIT_BASE_URL || 'https://api.xendit.co';

// Local payment storage to avoid repeated API calls
const paymentCache = new Map();
const PAYMENT_CACHE_FILE = path.join(__dirname, 'payment-cache.json');

// Load payment cache from file
function loadPaymentCache() {
  try {
    if (fs.existsSync(PAYMENT_CACHE_FILE)) {
      const data = fs.readFileSync(PAYMENT_CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      paymentCache.clear();
      Object.entries(cache).forEach(([key, value]) => {
        paymentCache.set(key, value);
      });
      console.log(`Loaded ${paymentCache.size} cached payments`);
    }
  } catch (error) {
    console.log('No payment cache found or error loading cache');
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
    console.log(`Saved ${paymentCache.size} cached payments`);
  } catch (error) {
    console.error('Error saving payment cache:', error);
  }
}

// Store payment data locally
function storePaymentData(externalId, paymentData) {
  paymentCache.set(externalId, {
    ...paymentData,
    cachedAt: new Date().toISOString()
  });
  savePaymentCache();
  console.log(`Stored payment data for ${externalId}`);
}

// Get payment data from cache
function getCachedPaymentData(externalId) {
  const cached = paymentCache.get(externalId);
  if (cached) {
    console.log(`Found cached payment data for ${externalId}`);
    return cached;
  }
  return null;
}

// Load cache on startup
loadPaymentCache();

/**
 * Make HTTP request to Xendit API
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} data - Request data
 * @returns {Promise<Object>} Response data
 */
function makeXenditRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64');
    
    const options = {
      hostname: 'api.xendit.co',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Xendit-Node-Client/1.0'
      }
    };

    if (data && method !== 'GET') {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
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
            const error = new Error(parsedData.message || `HTTP ${res.statusCode}`);
            error.status = res.statusCode;
            error.response = parsedData;
            reject(error);
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Create QRIS payment using Xendit Invoice API
 * @param {number} amount - Amount in IDR
 * @param {string} externalId - Unique external ID for the transaction
 * @param {string} callbackUrl - Callback URL (optional)
 * @returns {Promise<Object>} QRIS payment object
 */
async function createQRISPayment(amount, externalId, callbackUrl = null) {
  try {
    console.log(`Creating QRIS payment for amount: ${amount}, externalId: ${externalId}`);
    
    // Try to create invoice with QRIS payment method
    const invoiceData = {
      external_id: externalId,
      amount: amount,
      description: `Pembayaran produk - ${externalId}`,
      currency: 'IDR',
      payment_methods: ['QRIS'],
      success_redirect_url: callbackUrl || 'https://example.com/success',
      failure_redirect_url: callbackUrl || 'https://example.com/failure'
    };

    console.log('Invoice data:', JSON.stringify(invoiceData, null, 2));
    
    const result = await makeXenditRequest('/v2/invoices', 'POST', invoiceData);
    console.log('Xendit Invoice with QRIS created successfully:', result);
    
    const paymentData = {
      id: result.id,
      external_id: result.external_id,
      amount: result.amount,
      status: result.status,
      qr_string: result.qr_string || result.invoice_url,
      created: result.created,
      updated: result.updated
    };
    
    // Store payment data locally
    storePaymentData(externalId, paymentData);
    
    return paymentData;
    
  } catch (error) {
    console.error('Error creating Xendit Invoice with QRIS:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      response: error.response
    });
    
    // If Xendit fails, throw error - no fallback to mock
    throw new Error(`Failed to create Xendit payment: ${error.message}`);
  }
}

/**
 * Get payment by invoice ID (alternative method)
 * @param {string} invoiceId - Xendit invoice ID
 * @returns {Promise<Object>} Payment object
 */
async function getPaymentByInvoiceId(invoiceId) {
  try {
    console.log(`Getting payment by invoice ID: ${invoiceId}`);
    
    const result = await makeXenditRequest(`/v2/invoices/${invoiceId}`, 'GET');
    console.log('Payment by invoice ID retrieved:', JSON.stringify(result, null, 2));
    
    // Store in cache if we have external_id
    if (result.external_id) {
      storePaymentData(result.external_id, result);
    }
    
    return result;
  } catch (error) {
    console.error('Error getting payment by invoice ID:', error);
    throw error;
  }
}

/**
 * Get QRIS payment status
 * @param {string} externalId - External ID of the transaction
 * @returns {Promise<Object>} Payment status object
 */
async function getQRISStatus(externalId) {
  try {
    console.log(`Getting payment status for externalId: ${externalId}`);
    
    // First check cache
    const cached = getCachedPaymentData(externalId);
    if (cached && cached.status === 'PAID') {
      console.log(`Using cached PAID payment for ${externalId}`);
      return cached;
    }
    
    // Try to get invoice status by external_id
    const result = await makeXenditRequest(`/v2/invoices?external_id=${externalId}`, 'GET');
    console.log('Xendit payment status retrieved:', JSON.stringify(result, null, 2));
    
    if (result.data && result.data.length > 0) {
      const payment = result.data[0];
      console.log(`Found payment with status: ${payment.status}`);
      console.log(`Payment details: ID=${payment.id}, Amount=${payment.amount}, Status=${payment.status}`);
      
      // IMPORTANT: Update cache with latest data from Xendit
      storePaymentData(externalId, payment);
      console.log(`✅ Cache updated with latest data for ${externalId}`);
      
      return payment;
    } else {
      console.log(`No payment found with external_id: ${externalId}`);
      console.log('Response data:', JSON.stringify(result, null, 2));
      
      // Check if we have cached data
      if (cached) {
        console.log(`Using cached payment data for ${externalId}`);
        return cached;
      }
      
      throw new Error(`Payment not found with external_id: ${externalId}`);
    }
    
  } catch (error) {
    console.error('Error getting payment status:', error);
    
    // If API fails, try to use cached data
    const cached = getCachedPaymentData(externalId);
    if (cached) {
      console.log(`Using cached payment data due to API error for ${externalId}`);
      return cached;
    }
    
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      response: error.response
    });
    throw error;
  }
}

/**
 * Check if payment is completed
 * @param {string} externalId - External ID of the transaction
 * @returns {Promise<boolean>} True if payment is completed
 */
async function isPaymentCompleted(externalId) {
  try {
    const status = await getQRISStatus(externalId);
    
    // Check multiple possible status values
    const isCompleted = status.status === 'PAID' || 
                       status.status === 'COMPLETED' || 
                       status.status === 'SETTLED';
    
    console.log(`Payment status for ${externalId}: ${status.status} (Completed: ${isCompleted})`);
    console.log(`Payment amount: ${status.amount}, Paid amount: ${status.paid_amount}`);
    console.log(`Payment channel: ${status.payment_channel}, Method: ${status.payment_method}`);
    
    return isCompleted;
  } catch (error) {
    console.error('Error checking payment status:', error);
    return false;
  }
}

/**
 * Get payment details for debugging
 * @param {string} externalId - External ID of the transaction
 * @returns {Promise<Object>} Payment details
 */
async function getPaymentDetails(externalId) {
  try {
    const status = await getQRISStatus(externalId);
    return {
      externalId: status.external_id,
      invoiceId: status.id,
      status: status.status,
      amount: status.amount,
      paidAmount: status.paid_amount,
      description: status.description || `Payment for ${externalId}`,
      created: status.created,
      updated: status.updated,
      paidAt: status.paid_at,
      qrString: status.qr_string || status.invoice_url,
      paymentChannel: status.payment_channel,
      paymentMethod: status.payment_method
    };
  } catch (error) {
    console.error('Error getting payment details:', error);
    return null;
  }
}

/**
 * Get Xendit service status
 * @returns {Object} Service status information
 */
function getServiceStatus() {
  return {
    xenditAvailable: true,
    secretKey: envConfig.XENDIT_SECRET_KEY ? 'Configured' : 'Using Default',
    environment: envConfig.XENDIT_SECRET_KEY?.includes('development') ? 'Development' : 'Production',
    baseUrl: envConfig.XENDIT_BASE_URL || 'https://api.xendit.co',
    implementation: 'Xendit Invoice API with QRIS + Local Cache',
    cachedPayments: paymentCache.size
  };
}

module.exports = {
  createQRISPayment,
  getQRISStatus,
  getPaymentByInvoiceId,
  isPaymentCompleted,
  getPaymentDetails,
  getServiceStatus
}; 