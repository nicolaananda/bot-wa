const axios = require('axios');

const BASE_URL = 'http://localhost:3002';

async function testUserTransactions() {
  console.log('🧪 Testing User Transactions Endpoint\n');
  
  // Test Case 1: User dengan transaksi (6281389592985)
  console.log('📋 Test Case 1: User dengan transaksi (6281389592985)');
  try {
    const response = await axios.get(`${BASE_URL}/api/dashboard/users/6281389592985/transactions`);
    console.log('✅ Status:', response.status);
    console.log('📊 Total Transaksi:', response.data.data.totalTransaksi);
    console.log('💰 Total Spent:', response.data.data.totalSpent);
    console.log('💳 Current Saldo:', response.data.data.currentSaldo);
    console.log('📝 Sample Transaction:', response.data.data.transaksi[0]);
    console.log('');
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.data?.error || error.message);
    console.log('');
  }
  
  // Test Case 2: User tanpa transaksi (999999999999)
  console.log('📋 Test Case 2: User tanpa transaksi (999999999999)');
  try {
    const response = await axios.get(`${BASE_URL}/api/dashboard/users/999999999999/transactions`);
    console.log('✅ Status:', response.status);
    console.log('📊 Total Transaksi:', response.data.data.totalTransaksi);
    console.log('💰 Total Spent:', response.data.data.totalSpent);
    console.log('💳 Current Saldo:', response.data.data.currentSaldo);
    console.log('📝 Transactions Array:', response.data.data.transaksi.length === 0 ? 'Empty' : 'Not Empty');
    console.log('');
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.data?.error || error.message);
    console.log('');
  }
  
  // Test Case 3: User tidak valid (invalid)
  console.log('📋 Test Case 3: User tidak valid (invalid)');
  try {
    const response = await axios.get(`${BASE_URL}/api/dashboard/users/invalid/transactions`);
    console.log('✅ Status:', response.status);
    console.log('📊 Response:', response.data);
    console.log('');
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.data?.error || error.message);
    console.log('');
  }
  
  // Test Case 4: User dengan format @s.whatsapp.net
  console.log('📋 Test Case 4: User dengan format @s.whatsapp.net (6281389592985@s.whatsapp.net)');
  try {
    const response = await axios.get(`${BASE_URL}/api/dashboard/users/6281389592985/transactions`);
    console.log('✅ Status:', response.status);
    console.log('📊 Total Transaksi:', response.data.data.totalTransaksi);
    console.log('💰 Total Spent:', response.data.data.totalSpent);
    console.log('💳 Current Saldo:', response.data.data.currentSaldo);
    console.log('📝 Sample Transaction:', response.data.data.transaksi[0]);
    console.log('');
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.data?.error || error.message);
    console.log('');
  }
}

// Run tests
testUserTransactions().catch(console.error); 