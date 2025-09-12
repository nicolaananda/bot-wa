const express = require('express');
const crypto = require('crypto');
const { clearCachedPaymentData, storePaymentData, updateOrderIdFromWebhook } = require('./config/midtrans');

const app = express();
app.use(express.json());

// Midtrans Server Key untuk verifikasi signature (direct configuration)
const MIDTRANS_SERVER_KEY = 'Mid-server-ZVcAyI7O27Ta4HCL7E4K-gPJ';

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
    
    // Store updated payment data to cache
    const paymentData = {
      order_id,
      transaction_status,
      payment_type,
      gross_amount: notification.gross_amount,
      transaction_time: notification.transaction_time,
      settlement_time,
      fraud_status,
      status_code: notification.status_code,
      status_message: notification.status_message,
      webhook_updated: new Date().toISOString()
    };
    
    storePaymentData(order_id, paymentData);
    console.log(`💾 Payment data stored for ${order_id} with status: ${transaction_status}`);
    
    // Try to update order ID mapping if this looks like a full Midtrans order ID
    if (order_id.includes('-') && order_id.split('-').length >= 4) {
      // Extract potential original order ID (first 3 parts)
      const parts = order_id.split('-');
      const originalOrderId = parts.slice(0, 3).join('-');
      console.log(`🔍 Attempting to update order ID mapping: ${originalOrderId} -> ${order_id}`);
      updateOrderIdFromWebhook(originalOrderId, order_id);
    }
    
    // Jika payment berhasil, emit event untuk trigger immediate processing
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`✅ Payment successful for ${order_id} via ${payment_type}`);
      
      // Emit event untuk memberitahu sistem bahwa payment sudah berhasil
      process.emit('payment-completed', {
        orderId: order_id,
        transactionStatus: transaction_status,
        paymentType: payment_type,
        settlementTime: settlement_time,
        grossAmount: notification.gross_amount
      });
      
      console.log(`🚀 Payment completion event emitted for ${order_id}`);
    } else {
      console.log(`⏳ Payment status updated for ${order_id}: ${transaction_status}`);
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