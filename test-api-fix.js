/**
 * Test Script untuk Verifikasi Perbaikan API
 * Masalah "UNKNOWN" di Recent Transactions
 */

const axios = require('axios');

// Konfigurasi API
const API_BASE_URL = 'http://localhost:3000';
const API_ENDPOINTS = {
  recentTransactions: '/api/dashboard/transactions/recent',
  searchTransaction: '/api/dashboard/transactions/search/TRX001',
  userTransactions: '/api/dashboard/users/6281389592985/transactions'
};

// Test data yang diharapkan
const expectedFields = {
  user: 'string',           // Bukan "Unknown"
  metodeBayar: 'string',    // Bukan "Unknown"
  reffId: 'string',         // Bukan "N/A"
  user_name: 'string',      // Field original untuk reference
  payment_method: 'string', // Field original untuk reference
  order_id: 'string'        // Field original untuk reference
};

// Function untuk test endpoint
async function testEndpoint(endpoint, description) {
  try {
    console.log(`\n🧪 Testing: ${description}`);
    console.log(`📍 Endpoint: ${endpoint}`);
    
    const response = await axios.get(`${API_BASE_URL}${endpoint}`);
    
    if (response.data.success) {
      console.log('✅ Response success');
      
      // Check response structure
      if (response.data.data) {
        console.log('✅ Data structure OK');
        
        // Check transactions array
        if (response.data.data.transactions) {
          const transactions = response.data.data.transactions;
          console.log(`📊 Found ${transactions.length} transactions`);
          
          // Check first transaction
          if (transactions.length > 0) {
            const firstTransaction = transactions[0];
            console.log('🔍 First transaction fields:');
            
            // Check required fields
            Object.keys(expectedFields).forEach(field => {
              const value = firstTransaction[field];
              const type = typeof value;
              const status = value && value !== 'Unknown' ? '✅' : '❌';
              
              console.log(`  ${status} ${field}: ${value} (${type})`);
              
              if (field === 'user' && (value === 'Unknown' || !value)) {
                console.log(`    ⚠️  Field 'user' masih "Unknown" atau kosong`);
              }
              
              if (field === 'metodeBayar' && (value === 'Unknown' || !value)) {
                console.log(`    ⚠️  Field 'metodeBayar' masih "Unknown" atau kosong`);
              }
            });
            
            // Check if transformation worked
            const hasUserField = firstTransaction.user && firstTransaction.user !== 'Unknown';
            const hasMetodeBayarField = firstTransaction.metodeBayar && firstTransaction.metodeBayar !== 'Unknown';
            const hasReffIdField = firstTransaction.reffId && firstTransaction.reffId !== 'N/A';
            
            if (hasUserField && hasMetodeBayarField && hasReffIdField) {
              console.log('🎉 SUCCESS: All field transformations working correctly!');
            } else {
              console.log('❌ FAILED: Some field transformations not working');
            }
            
          } else {
            console.log('⚠️  No transactions found');
          }
        } else {
          console.log('⚠️  No transactions array in response');
        }
      } else {
        console.log('❌ No data in response');
      }
      
    } else {
      console.log('❌ Response not successful');
      console.log('Error:', response.data.error);
    }
    
  } catch (error) {
    console.log('❌ Request failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Function untuk test search transaction
async function testSearchTransaction() {
  try {
    console.log('\n🧪 Testing: Search Transaction by Reference ID');
    console.log('📍 Endpoint: /api/dashboard/transactions/search/TRX001');
    
    const response = await axios.get(`${API_BASE_URL}/api/dashboard/transactions/search/TRX001`);
    
    if (response.data.success) {
      console.log('✅ Response success');
      
      const transaction = response.data.data;
      console.log('🔍 Transaction fields:');
      
      // Check required fields
      Object.keys(expectedFields).forEach(field => {
        const value = transaction[field];
        const type = typeof value;
        const status = value && value !== 'Unknown' ? '✅' : '❌';
        
        console.log(`  ${status} ${field}: ${value} (${type})`);
      });
      
      // Check if transformation worked
      const hasUserField = transaction.user && transaction.user !== 'Unknown';
      const hasMetodeBayarField = transaction.metodeBayar && transaction.metodeBayar !== 'Unknown';
      const hasReffIdField = transaction.reffId && transaction.reffId !== 'N/A';
      
      if (hasUserField && hasMetodeBayarField && hasReffIdField) {
        console.log('🎉 SUCCESS: Search transaction transformation working!');
      } else {
        console.log('❌ FAILED: Search transaction transformation not working');
      }
      
    } else {
      console.log('❌ Response not successful');
      console.log('Error:', response.data.error);
    }
    
  } catch (error) {
    console.log('❌ Request failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Function untuk test user transactions
async function testUserTransactions() {
  try {
    console.log('\n🧪 Testing: User Transactions');
    console.log('📍 Endpoint: /api/dashboard/users/6281389592985/transactions');
    
    const response = await axios.get(`${API_BASE_URL}/api/dashboard/users/6281389592985/transactions`);
    
    if (response.data.success) {
      console.log('✅ Response success');
      
      const data = response.data.data;
      console.log(`📊 User: ${data.user}`);
      console.log(`📊 Total Transaksi: ${data.totalTransaksi}`);
      console.log(`📊 Total Spent: ${data.totalSpent}`);
      
      if (data.transaksi && data.transaksi.length > 0) {
        console.log(`🔍 Found ${data.transaksi.length} user transactions`);
        
        const firstTransaction = data.transaksi[0];
        console.log('🔍 First user transaction fields:');
        
        // Check required fields
        Object.keys(expectedFields).forEach(field => {
          const value = firstTransaction[field];
          const type = typeof value;
          const status = value && value !== 'Unknown' ? '✅' : '❌';
          
          console.log(`  ${status} ${field}: ${value} (${type})`);
        });
        
        // Check if transformation worked
        const hasUserField = firstTransaction.user && firstTransaction.user !== 'Unknown';
        const hasMetodeBayarField = firstTransaction.metodeBayar && firstTransaction.metodeBayar !== 'Unknown';
        const hasReffIdField = firstTransaction.reffId && firstTransaction.reffId !== 'N/A';
        
        if (hasUserField && hasMetodeBayarField && hasReffIdField) {
          console.log('🎉 SUCCESS: User transactions transformation working!');
        } else {
          console.log('❌ FAILED: User transactions transformation not working');
        }
        
      } else {
        console.log('⚠️  No user transactions found');
      }
      
    } else {
      console.log('❌ Response not successful');
      console.log('Error:', response.data.error);
    }
    
  } catch (error) {
    console.log('❌ Request failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Main test function
async function runAllTests() {
  console.log('🚀 Starting API Fix Verification Tests');
  console.log('=====================================');
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Test 1: Recent Transactions
    await testEndpoint(API_ENDPOINTS.recentTransactions, 'Recent Transactions');
    
    // Test 2: Search Transaction
    await testSearchTransaction();
    
    // Test 3: User Transactions
    await testUserTransactions();
    
    console.log('\n🎯 All tests completed!');
    console.log('📋 Check the results above to verify the fixes.');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  }
}

// Export functions
module.exports = {
  testEndpoint,
  testSearchTransaction,
  testUserTransactions,
  runAllTests
};

// Run tests if called directly
if (require.main === module) {
  runAllTests();
} 