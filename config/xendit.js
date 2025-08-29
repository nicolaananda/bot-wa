const { Xendit } = require('xendit-node');
const fs = require('fs');
const path = require('path');

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
const xendit = new Xendit({
  secretKey: envConfig.XENDIT_SECRET_KEY || 'xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K',
  xenditURL: envConfig.XENDIT_BASE_URL || 'https://api.xendit.co'
});

// QRIS service
const qrisService = new xendit.QRCode();

/**
 * Create QRIS payment using Xendit API
 * @param {number} amount - Amount in IDR
 * @param {string} externalId - Unique external ID for the transaction
 * @param {string} callbackUrl - Callback URL (optional)
 * @returns {Promise<Object>} QRIS payment object
 */
async function createQRISPayment(amount, externalId, callbackUrl = null) {
  try {
    console.log(`Creating QRIS payment for amount: ${amount}, externalId: ${externalId}`);
    
    const qrisData = {
      external_id: externalId,
      type: 'DYNAMIC',
      callback_url: callbackUrl,
      amount: amount,
      description: `Pembayaran produk - ${externalId}`,
      success_redirect_url: callbackUrl,
      failure_redirect_url: callbackUrl
    };

    console.log('QRIS data:', JSON.stringify(qrisData, null, 2));
    
    const result = await qrisService.createCode(qrisData);
    console.log('Xendit QRIS payment created successfully:', result);
    
    return result;
  } catch (error) {
    console.error('Error creating QRIS payment:', error);
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
 * Get QRIS payment status
 * @param {string} externalId - External ID of the transaction
 * @returns {Promise<Object>} Payment status object
 */
async function getQRISStatus(externalId) {
  try {
    console.log(`Getting QRIS status for externalId: ${externalId}`);
    
    const result = await qrisService.getCode(externalId);
    console.log('Xendit QRIS status retrieved:', result);
    
    return result;
  } catch (error) {
    console.error('Error getting QRIS status:', error);
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
    const isCompleted = status.status === 'PAID';
    
    console.log(`Payment status for ${externalId}: ${status.status} (Completed: ${isCompleted})`);
    
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
      status: status.status,
      amount: status.amount,
      description: status.description || `Payment for ${externalId}`,
      created: status.created,
      updated: status.updated,
      qrString: status.qr_string
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
    baseUrl: envConfig.XENDIT_BASE_URL || 'https://api.xendit.co'
  };
}

module.exports = {
  createQRISPayment,
  getQRISStatus,
  isPaymentCompleted,
  getPaymentDetails,
  getServiceStatus
}; 