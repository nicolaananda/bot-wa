const axios = require('axios');

async function testEndpoint() {
  try {
    console.log('Testing endpoint...');
    const response = await axios.get('http://localhost:3002/api/dashboard/users/6281389592985/transactions');
    console.log('Success!');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.response?.status, error.response?.data?.error || error.message);
  }
}

testEndpoint(); 