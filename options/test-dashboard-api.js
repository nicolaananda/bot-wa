const axios = require('axios');

// Test script untuk dashboard API
const BASE_URL = 'http://localhost:3000/api/dashboard';

async function testDashboardAPI() {
  console.log('🧪 Testing Dashboard API...\n');
  
  try {
    // Test 1: Dashboard Overview
    console.log('1. Testing Dashboard Overview...');
    const overview = await axios.get(`${BASE_URL}/overview`);
    console.log('✅ Overview:', {
      totalTransaksi: overview.data.data.totalTransaksi,
      totalPendapatan: overview.data.data.totalPendapatan,
      transaksiHariIni: overview.data.data.transaksiHariIni,
      pendapatanHariIni: overview.data.data.pendapatanHariIni
    });
    
    // Test 2: Daily Chart Data
    console.log('\n2. Testing Daily Chart Data...');
    const dailyChart = await axios.get(`${BASE_URL}/chart/daily`);
    console.log('✅ Daily Chart:', dailyChart.data.data.length, 'days of data');
    
    // Test 3: Monthly Chart Data
    console.log('\n3. Testing Monthly Chart Data...');
    const monthlyChart = await axios.get(`${BASE_URL}/chart/monthly`);
    console.log('✅ Monthly Chart:', monthlyChart.data.data.length, 'months of data');
    
    // Test 4: User Activity
    console.log('\n4. Testing User Activity...');
    const userActivity = await axios.get(`${BASE_URL}/users/activity`);
    console.log('✅ User Activity:', userActivity.data.data.length, 'users');
    
    // Test 5: User Statistics
    console.log('\n5. Testing User Statistics...');
    const userStats = await axios.get(`${BASE_URL}/users/stats`);
    console.log('✅ User Stats:', {
      totalUsers: userStats.data.data.totalUsers,
      totalSaldo: userStats.data.data.totalSaldo,
      averageSaldo: userStats.data.data.averageSaldo
    });
    
    // Test 6: Product Statistics
    console.log('\n6. Testing Product Statistics...');
    const productStats = await axios.get(`${BASE_URL}/products/stats`);
    console.log('✅ Product Stats:', {
      totalProducts: productStats.data.data.totalProducts,
      totalSold: productStats.data.data.totalSold,
      topProducts: productStats.data.data.topProducts.length
    });
    
    // Test 7: Recent Transactions
    console.log('\n7. Testing Recent Transactions...');
    const recentTransactions = await axios.get(`${BASE_URL}/transactions/recent?limit=5`);
    console.log('✅ Recent Transactions:', recentTransactions.data.data.count, 'transactions');
    
    console.log('\n🎉 All tests passed! Dashboard API is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the dashboard API server is running:');
      console.log('   node dashboard-api.js');
    }
  }
}

// Run tests
testDashboardAPI(); 