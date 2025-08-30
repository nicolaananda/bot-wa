const https = require('https');

const XENDIT_SECRET_KEY = 'xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K';

function makeRequest(endpoint, method = 'GET', data = null) {
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
          resolve({
            status: res.statusCode,
            data: parsedData,
            headers: res.headers
          });
        } catch (parseError) {
          resolve({
            status: res.statusCode,
            data: responseData,
            headers: res.headers
          });
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

async function testPaymentRequests() {
  console.log('🔍 Testing Xendit Payment Requests endpoint...\n');
  
  try {
    // Test 1: Get available payment methods
    console.log('1️⃣ Testing GET /payment_requests...');
    const getResult = await makeRequest('/payment_requests');
    console.log('Status:', getResult.status);
    console.log('Response:', JSON.stringify(getResult.data, null, 2));
    console.log('');
    
    // Test 2: Try to create a payment request with QRIS
    console.log('2️⃣ Testing POST /payment_requests with QRIS...');
    const qrisData = {
      external_id: `TEST-QRIS-${Date.now()}`,
      amount: 50000,
      description: 'Test QRIS Payment',
      payment_methods: ['QRIS'],
      currency: 'IDR'
    };
    
    const postResult = await makeRequest('/payment_requests', 'POST', qrisData);
    console.log('Status:', postResult.status);
    console.log('Response:', JSON.stringify(postResult.data, null, 2));
    console.log('');
    
    // Test 3: Check if there are other payment endpoints
    console.log('3️⃣ Testing other potential payment endpoints...');
    const otherEndpoints = [
      '/ewallets',
      '/virtual_accounts',
      '/retail_outlets',
      '/direct_debits'
    ];
    
    for (const endpoint of otherEndpoints) {
      try {
        const result = await makeRequest(endpoint);
        console.log(`${endpoint}: Status ${result.status}`);
        if (result.status === 200) {
          console.log('✅ Available!');
        }
      } catch (error) {
        console.log(`${endpoint}: Error - ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPaymentRequests(); 