const { Xendit } = require('xendit-node');

console.log('🔍 Testing Xendit PaymentRequest service...\n');

try {
  const xendit = new Xendit({
    secretKey: 'xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K'
  });
  
  const paymentRequest = new xendit.PaymentRequest();
  
  console.log('✅ PaymentRequest service created');
  console.log('PaymentRequest methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(paymentRequest)));
  console.log('');
  
  // Check if there are static methods
  console.log('PaymentRequest static methods:', Object.getOwnPropertyNames(xendit.PaymentRequest));
  
} catch (error) {
  console.error('❌ Error with PaymentRequest service:', error.message);
} 