const https = require('https');

const XENDIT_SECRET_KEY = 'xnd_development_JCGzwsaBwnsBS3wPrSIIynK8Ygw93foCsPVBfAYWTz6Y1ZY3KeFUITs5ZH5K';

function testEndpoint(endpoint, method = 'GET', data = null) {
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

async function testEndpoints() {
  console.log('🔍 Testing different Xendit API endpoints...\n');
  
  const endpoints = [
    '/qrcodes',
    '/qr_codes',
    '/qris',
    '/payment_requests',
    '/invoices',
    '/v2/qrcodes',
    '/v2/qris',
    '/v2/payment_requests'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing endpoint: ${endpoint}`);
      const result = await testEndpoint(endpoint);
      console.log(`Status: ${result.status}`);
      
      if (result.status === 200) {
        console.log('✅ Endpoint available!');
        console.log('Response:', JSON.stringify(result.data, null, 2));
      } else if (result.status === 404) {
        console.log('❌ Endpoint not found');
      } else if (result.status === 401) {
        console.log('🔒 Unauthorized - check secret key');
      } else if (result.status === 403) {
        console.log('🚫 Forbidden - check permissions');
      } else {
        console.log(`⚠️ Status: ${result.status}`);
        console.log('Response:', result.data);
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`❌ Error testing ${endpoint}:`, error.message);
      console.log('');
    }
  }
}

testEndpoints(); 