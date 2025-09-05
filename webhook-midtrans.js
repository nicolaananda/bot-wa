const express = require('express');
const crypto = require('crypto');
const { clearCachedPaymentData } = require('./config/midtrans');

const app = express();
app.use(express.json());

// Midtrans Server Key untuk verifikasi signature
// Load and validate environment variables securely
const envValidator = require('./config/env-validator');
const validatedConfig = envValidator.validateOrExit();

// Secure Midtrans Server Key from validated environment
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

/**
 * Verify Midtrans notification signature
 */
function verifySignature(notification) {
  const {
    order_id,
    status_code,
    gross_amount,
    signature_key
  } = notification;

  const serverKey = MIDTRANS_SERVER_KEY;
  const input = order_id + status_code + gross_amount + serverKey;
  const hash = crypto.createHash('sha512').update(input).digest('hex');

  return hash === signature_key;
}

/**
 * Webhook endpoint untuk menerima notifikasi dari Midtrans
 */
app.post('/webhook/midtrans', (req, res) => {
  try {
    const notification = req.body;
    
    console.log('🔔 Received Midtrans notification:', JSON.stringify(notification, null, 2));
    
    // Verify signature untuk keamanan
    if (!verifySignature(notification)) {
      console.error('❌ Invalid signature for notification:', notification.order_id);
      return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }
    
    const {
      order_id,
      transaction_status,
      payment_type,
      fraud_status,
      settlement_time
    } = notification;
    
    console.log(`📋 Order: ${order_id}, Status: ${transaction_status}, Payment: ${payment_type}`);
    
    // Clear cache untuk order ini agar status terbaru langsung terdeteksi
    clearCachedPaymentData(order_id);
    console.log(`🗑️ Cache cleared for ${order_id}`);
    
    // Jika payment berhasil, bisa tambahkan logic untuk trigger immediate check
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`✅ Payment successful for ${order_id} via ${payment_type}`);
      
      // Bisa tambahkan logic untuk langsung memproses order tanpa menunggu polling
      // Misalnya dengan emit event atau update database langsung
      
      // Emit event untuk memberitahu sistem bahwa payment sudah berhasil
      process.emit('payment-completed', {
        orderId: order_id,
        transactionStatus: transaction_status,
        paymentType: payment_type,
        settlementTime: settlement_time
      });
    }
    
    // Respond OK ke Midtrans
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('❌ Error processing Midtrans webhook:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * Health check endpoint
 */
app.get('/webhook/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Midtrans Webhook Handler'
  });
});

const PORT = process.env.WEBHOOK_PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Midtrans Webhook server running on port ${PORT}`);
    console.log(`📡 Webhook URL: http://your-domain.com:${PORT}/webhook/midtrans`);
    console.log(`🔍 Health check: http://localhost:${PORT}/webhook/health`);
  });
}

module.exports = { app, verifySignature }; 