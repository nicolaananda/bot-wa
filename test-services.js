const { Xendit } = require('xendit-node');

console.log('🔍 Checking available Xendit services...\n');

try {
  const xendit = new Xendit({
    secretKey: 'xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K'
  });
  
  console.log('✅ Xendit instance created successfully');
  console.log('Available services:', Object.keys(xendit));
  console.log('');
  
  // Check if QRCode service exists
  if (xendit.QRCode) {
    console.log('✅ QRCode service is available');
  } else {
    console.log('❌ QRCode service is NOT available');
  }
  
  // Check if there are other payment services
  console.log('\n🔍 Looking for payment-related services...');
  Object.keys(xendit).forEach(key => {
    if (key.toLowerCase().includes('payment') || key.toLowerCase().includes('qris') || key.toLowerCase().includes('invoice')) {
      console.log(`Found: ${key}`);
    }
  });
  
} catch (error) {
  console.error('❌ Error creating Xendit instance:', error.message);
} 