/**
 * Test Script untuk Verifikasi Field reffId Fix
 * Masalah "N/A" di Reference ID
 */

const axios = require('axios');

// Konfigurasi API
const API_BASE_URL = 'http://localhost:3000';

// Test data untuk field reffId
const testCases = [
  {
    name: 'Recent Transactions',
    endpoint: '/api/dashboard/transactions/recent?limit=5',
    expectedField: 'reffId',
    expectedValue: 'string', // Bukan "N/A"
    originalField: 'order_id'
  },
  {
    name: 'Search Transaction',
    endpoint: '/api/dashboard/transactions/search/TRX001',
    expectedField: 'reffId',
    expectedValue: 'string', // Bukan "N/A"
    originalField: 'order_id'
  },
  {
    name: 'User Transactions',
    endpoint: '/api/dashboard/users/6281389592985/transactions',
    expectedField: 'reffId',
    expectedValue: 'string', // Bukan "N/A"
    originalField: 'order_id'
  }
];

// Function untuk test field reffId
async function testReffIdField(testCase) {
  try {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`📍 Endpoint: ${testCase.endpoint}`);
    console.log(`🎯 Expected Field: ${testCase.expectedField}`);
    console.log(`🔗 Original Field: ${testCase.originalField}`);
    
    const response = await axios.get(`${API_BASE_URL}${testCase.endpoint}`);
    
    if (response.data.success) {
      console.log('✅ Response success');
      
      // Check response structure
      if (response.data.data) {
        console.log('✅ Data structure OK');
        
        let transactions = [];
        
        // Extract transactions based on endpoint
        if (testCase.name === 'Search Transaction') {
          transactions = [response.data.data]; // Single transaction
        } else if (response.data.data.transactions) {
          transactions = response.data.data.transactions; // Array of transactions
        } else {
          console.log('⚠️  No transactions found in response');
          return false;
        }
        
        console.log(`📊 Found ${transactions.length} transaction(s)`);
        
        if (transactions.length > 0) {
          const firstTransaction = transactions[0];
          console.log('🔍 First transaction fields:');
          
          // Check reffId field specifically
          const reffIdValue = firstTransaction[testCase.expectedField];
          const orderIdValue = firstTransaction[testCase.originalField];
          
          console.log(`  📋 ${testCase.expectedField}: ${reffIdValue} (${typeof reffIdValue})`);
          console.log(`  📋 ${testCase.originalField}: ${orderIdValue} (${typeof orderIdValue})`);
          
          // Validate reffId field
          if (reffIdValue && reffIdValue !== 'N/A' && reffIdValue !== 'undefined') {
            console.log(`  ✅ ${testCase.expectedField} field is properly filled`);
          } else {
            console.log(`  ❌ ${testCase.expectedField} field is empty or "N/A"`);
            return false;
          }
          
          // Check if transformation worked
          if (orderIdValue && reffIdValue === orderIdValue) {
            console.log(`  ✅ Field mapping ${testCase.originalField} → ${testCase.expectedField} working correctly`);
          } else if (reffIdValue && reffIdValue !== 'N/A') {
            console.log(`  ✅ ${testCase.expectedField} field has value (may be from different source)`);
          } else {
            console.log(`  ❌ Field mapping not working properly`);
            return false;
          }
          
          // Check other required fields
          const userValue = firstTransaction.user;
          const metodeBayarValue = firstTransaction.metodeBayar;
          
          console.log(`  👤 user: ${userValue} (${typeof userValue})`);
          console.log(`  💳 metodeBayar: ${metodeBayarValue} (${typeof metodeBayarValue})`);
          
          // Overall validation
          const hasValidReffId = reffIdValue && reffIdValue !== 'N/A';
          const hasValidUser = userValue && userValue !== 'Unknown';
          const hasValidMetodeBayar = metodeBayarValue && metodeBayarValue !== 'Unknown';
          
          if (hasValidReffId && hasValidUser && hasValidMetodeBayar) {
            console.log('🎉 SUCCESS: All field transformations working correctly!');
            return true;
          } else {
            console.log('❌ FAILED: Some field transformations not working');
            return false;
          }
          
        } else {
          console.log('⚠️  No transactions found');
          return false;
        }
        
      } else {
        console.log('❌ No data in response');
        return false;
      }
      
    } else {
      console.log('❌ Response not successful');
      console.log('Error:', response.data.error);
      return false;
    }
    
  } catch (error) {
    console.log('❌ Request failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
    return false;
  }
}

// Function untuk test database mapping
async function testDatabaseMapping() {
  try {
    console.log('\n🔍 Testing Database Field Mapping');
    console.log('==================================');
    
    // Test Recent Transactions untuk melihat mapping
    const response = await axios.get(`${API_BASE_URL}/api/dashboard/transactions/recent?limit=1`);
    
    if (response.data.success && response.data.data.transactions.length > 0) {
      const transaction = response.data.data.transactions[0];
      
      console.log('📊 Database Field Analysis:');
      console.log(`  🔗 order_id (DB): ${transaction.order_id || 'undefined'}`);
      console.log(`  🔗 reffId (Frontend): ${transaction.reffId || 'undefined'}`);
      console.log(`  👤 user_name (DB): ${transaction.user_name || 'undefined'}`);
      console.log(`  👤 user (Frontend): ${transaction.user || 'undefined'}`);
      console.log(`  💳 payment_method (DB): ${transaction.payment_method || 'undefined'}`);
      console.log(`  💳 metodeBayar (Frontend): ${transaction.metodeBayar || 'undefined'}`);
      
      // Check mapping logic
      const reffIdMapping = transaction.order_id === transaction.reffId;
      const userMapping = transaction.user_name === transaction.user;
      const metodeBayarMapping = transaction.payment_method === transaction.metodeBayar;
      
      console.log('\n🔍 Mapping Validation:');
      console.log(`  ✅ order_id → reffId: ${reffIdMapping ? 'Working' : 'Failed'}`);
      console.log(`  ✅ user_name → user: ${userMapping ? 'Working' : 'Failed'}`);
      console.log(`  ✅ payment_method → metodeBayar: ${metodeBayarMapping ? 'Working' : 'Failed'}`);
      
      return reffIdMapping && userMapping && metodeBayarMapping;
      
    } else {
      console.log('❌ Cannot test database mapping - no transactions found');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Database mapping test failed:', error.message);
    return false;
  }
}

// Main test function
async function runReffIdTests() {
  console.log('🚀 Starting reffId Field Fix Verification Tests');
  console.log('==============================================');
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🎯 Focus: Field reffId transformation from order_id`);
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  try {
    // Test each endpoint
    for (const testCase of testCases) {
      const result = await testReffIdField(testCase);
      if (result) passedTests++;
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test database mapping
    console.log('\n🔍 Additional Database Mapping Test');
    const mappingResult = await testDatabaseMapping();
    if (mappingResult) passedTests++;
    totalTests++;
    
    // Summary
    console.log('\n🎯 Test Summary');
    console.log('================');
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED! reffId field fix is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the logs above for details.');
    }
    
    console.log('\n📋 Next Steps:');
    console.log('1. Verify frontend no longer shows "N/A" for Reference ID');
    console.log('2. Check that order_id values are properly mapped to reffId');
    console.log('3. Monitor API logs for any transformation errors');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  }
}

// Export functions
module.exports = {
  testReffIdField,
  testDatabaseMapping,
  runReffIdTests
};

// Run tests if called directly
if (require.main === module) {
  runReffIdTests();
} 