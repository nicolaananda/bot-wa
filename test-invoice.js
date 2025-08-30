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

async function testInvoice() {
  console.log('🔍 Testing Xendit Invoice service for QRIS...\n');
  
  try {
    // Test 1: Try to create an invoice with QRIS payment method
    console.log('1️⃣ Testing Invoice creation with QRIS...');
    const invoiceData = {
      external_id: `TEST-INV-${Date.now()}`,
      amount: 50000,
      description: 'Test Invoice with QRIS',
      currency: 'IDR',
      payment_methods: ['QRIS'],
      success_redirect_url: 'https://example.com/success',
      failure_redirect_url: 'https://example.com/failure'
    };
    
    const createResult = await makeRequest('/v2/invoices', 'POST', invoiceData);
    console.log('Status:', createResult.status);
    console.log('Response:', JSON.stringify(createResult.data, null, 2));
    console.log('');
    
    // Test 2: Check if there are other invoice endpoints
    console.log('2️⃣ Testing other invoice endpoints...');
    const invoiceEndpoints = [
      '/invoices',
      '/v2/invoices',
      '/v1/invoices'
    ];
    
    for (const endpoint of invoiceEndpoints) {
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
    
    // Test 3: Try to get invoice list
    console.log('\n3️⃣ Testing GET invoices...');
    const listResult = await makeRequest('/v2/invoices');
    console.log('Status:', listResult.status);
    console.log('Response:', JSON.stringify(listResult.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testInvoice(); 