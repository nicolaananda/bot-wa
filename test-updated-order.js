const { isPaymentCompleted, getCachedPaymentData } = require('./config/midtrans');

async function testUpdatedOrderId() {
  console.log('Testing updated order ID...');
  
  const originalOrderId = 'GOPAY-8CF005CDB2-1757679587327';
  
  const orderData = getCachedPaymentData(originalOrderId);
  console.log('Order data:', orderData);
  
  if (orderData?.midtrans_order_id) {
    console.log('Testing payment status...');
    const result = await isPaymentCompleted(orderData.midtrans_order_id);
    console.log('Result:', result);
  }
}

testUpdatedOrderId().catch(console.error);
