/**
 * Test Script untuk Endpoint-Endpoint Baru
 * WhatsApp Bot Dashboard API
 */

const axios = require('axios');

// Konfigurasi API
const API_BASE_URL = 'http://localhost:3000';

// Test cases untuk endpoint baru
const testCases = [
  {
    name: 'User Activity Endpoint',
    endpoint: '/api/dashboard/users/activity',
    method: 'GET',
    expectedFields: {
      activeUsers: 'number',
      newUsers: 'number',
      userActivity: 'array',
      activityTrends: 'object'
    },
    description: 'Test endpoint untuk mendapatkan data aktivitas user'
  },
  {
    name: 'User Stats Endpoint',
    endpoint: '/api/dashboard/users/stats',
    method: 'GET',
    expectedFields: {
      totalUsers: 'number',
      totalSaldo: 'number',
      averageSaldo: 'number',
      userGrowth: 'object',
      roleDistribution: 'object'
    },
    description: 'Test endpoint untuk mendapatkan statistik user'
  },
  {
    name: 'User Transactions Endpoint',
    endpoint: '/api/dashboard/users/6281389592985/transactions',
    method: 'GET',
    expectedFields: {
      user: 'string',
      totalTransaksi: 'number',
      totalSpent: 'number',
      transaksi: 'array'
    },
    description: 'Test endpoint untuk mendapatkan transaksi user tertentu'
  }
];

// Function untuk test endpoint
async function testEndpoint(testCase) {
  try {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`📍 Endpoint: ${testCase.endpoint}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🔍 Expected Fields: ${Object.keys(testCase.expectedFields).join(', ')}`);
    
    const response = await axios.get(`${API_BASE_URL}${testCase.endpoint}`);
    
    if (response.data.success) {
      console.log('✅ Response success');
      
      // Check response structure
      if (response.data.data) {
        console.log('✅ Data structure OK');
        
        // Check expected fields
        let allFieldsValid = true;
        Object.keys(testCase.expectedFields).forEach(field => {
          const value = response.data.data[field];
          const expectedType = testCase.expectedFields[field];
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          const isValid = actualType === expectedType;
          
          if (isValid) {
            console.log(`  ✅ ${field}: ${value} (${actualType})`);
          } else {
            console.log(`  ❌ ${field}: ${value} (${actualType}) - Expected: ${expectedType}`);
            allFieldsValid = false;
          }
        });
        
        // Additional validation based on endpoint
        if (testCase.name === 'User Activity Endpoint') {
          const data = response.data.data;
          console.log('\n🔍 User Activity Validation:');
          console.log(`  📊 Active Users: ${data.activeUsers}`);
          console.log(`  📊 New Users: ${data.newUsers}`);
          console.log(`  📊 User Activity Count: ${data.userActivity.length}`);
          console.log(`  📊 Activity Trends: ${Object.keys(data.activityTrends).join(', ')}`);
          
          // Check if user activity has required fields
          if (data.userActivity.length > 0) {
            const firstActivity = data.userActivity[0];
            const requiredFields = ['userId', 'username', 'lastActivity', 'transactionCount', 'totalSpent', 'role'];
            const missingFields = requiredFields.filter(field => !firstActivity[field]);
            
            if (missingFields.length === 0) {
              console.log('  ✅ User activity data structure valid');
            } else {
              console.log(`  ❌ Missing fields in user activity: ${missingFields.join(', ')}`);
              allFieldsValid = false;
            }
          }
        }
        
        if (testCase.name === 'User Stats Endpoint') {
          const data = response.data.data;
          console.log('\n🔍 User Stats Validation:');
          console.log(`  📊 Total Users: ${data.totalUsers}`);
          console.log(`  📊 Total Saldo: ${data.totalSaldo}`);
          console.log(`  📊 Average Saldo: ${data.averageSaldo}`);
          console.log(`  📊 User Growth: ${data.userGrowth.thisMonth} this month, ${data.userGrowth.growthRate}% growth`);
          console.log(`  📊 Role Distribution: ${JSON.stringify(data.roleDistribution)}`);
          
          // Validate user growth structure
          const growthFields = ['thisMonth', 'lastMonth', 'growthRate'];
          const missingGrowthFields = growthFields.filter(field => !data.userGrowth[field]);
          
          if (missingGrowthFields.length === 0) {
            console.log('  ✅ User growth data structure valid');
          } else {
            console.log(`  ❌ Missing fields in user growth: ${missingGrowthFields.join(', ')}`);
            allFieldsValid = false;
          }
        }
        
        if (testCase.name === 'User Transactions Endpoint') {
          const data = response.data.data;
          console.log('\n🔍 User Transactions Validation:');
          console.log(`  👤 User: ${data.user}`);
          console.log(`  📊 Total Transaksi: ${data.totalTransaksi}`);
          console.log(`  💰 Total Spent: ${data.totalSpent}`);
          console.log(`  📋 Transactions Count: ${data.transaksi.length}`);
          
          // Check transaction structure if exists
          if (data.transaksi.length > 0) {
            const firstTransaction = data.transaksi[0];
            const requiredFields = ['id', 'name', 'price', 'date', 'jumlah', 'user_name', 'user_id', 'payment_method', 'totalBayar', 'reffId', 'order_id', 'status'];
            const missingFields = requiredFields.filter(field => !firstTransaction[field]);
            
            if (missingFields.length === 0) {
              console.log('  ✅ Transaction data structure valid');
            } else {
              console.log(`  ❌ Missing fields in transaction: ${missingFields.join(', ')}`);
              allFieldsValid = false;
            }
          }
        }
        
        // Check message field
        if (response.data.message) {
          console.log(`  📝 Message: ${response.data.message}`);
        }
        
        if (allFieldsValid) {
          console.log('🎉 SUCCESS: All validations passed!');
          return true;
        } else {
          console.log('❌ FAILED: Some validations failed');
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

// Function untuk test data consistency
async function testDataConsistency() {
  try {
    console.log('\n🔍 Testing Data Consistency Across Endpoints');
    console.log('=============================================');
    
    // Get user stats
    const statsResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/stats`);
    const stats = statsResponse.data.data;
    
    // Get user activity
    const activityResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/activity`);
    const activity = activityResponse.data.data;
    
    console.log('📊 Data Consistency Check:');
    console.log(`  📈 Stats Total Users: ${stats.totalUsers}`);
    console.log(`  📈 Activity Active Users: ${activity.activeUsers}`);
    console.log(`  📈 Activity New Users: ${activity.newUsers}`);
    
    // Check if numbers make sense
    const isConsistent = stats.totalUsers >= activity.activeUsers && 
                        activity.activeUsers >= activity.newUsers;
    
    if (isConsistent) {
      console.log('  ✅ Data consistency check passed');
    } else {
      console.log('  ⚠️  Data consistency issues detected');
    }
    
    return isConsistent;
    
  } catch (error) {
    console.log('❌ Data consistency test failed:', error.message);
    return false;
  }
}

// Function untuk test error handling
async function testErrorHandling() {
  try {
    console.log('\n🚨 Testing Error Handling');
    console.log('==========================');
    
    // Test invalid user ID
    const response = await axios.get(`${API_BASE_URL}/api/dashboard/users/invalid_user_id/transactions`);
    
    if (response.data.success === false) {
      console.log('✅ Error handling for invalid user ID working');
      return true;
    } else {
      console.log('❌ Error handling for invalid user ID not working');
      return false;
    }
    
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ Error handling for invalid user ID working (404 status)');
      return true;
    } else {
      console.log('❌ Unexpected error handling behavior');
      return false;
    }
  }
}

// Main test function
async function runAllTests() {
  console.log('🚀 Starting New Endpoints Verification Tests');
  console.log('===========================================');
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🎯 Focus: Testing newly implemented endpoints`);
  
  let passedTests = 0;
  let totalTests = testCases.length + 2; // +2 for consistency and error handling tests
  
  try {
    // Test each endpoint
    for (const testCase of testCases) {
      const result = await testEndpoint(testCase);
      if (result) passedTests++;
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test data consistency
    console.log('\n🔍 Additional Data Consistency Test');
    const consistencyResult = await testDataConsistency();
    if (consistencyResult) passedTests++;
    
    // Test error handling
    console.log('\n🚨 Additional Error Handling Test');
    const errorHandlingResult = await testErrorHandling();
    if (errorHandlingResult) passedTests++;
    
    // Summary
    console.log('\n🎯 Test Summary');
    console.log('================');
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED! New endpoints are working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the logs above for details.');
    }
    
    console.log('\n📋 Next Steps:');
    console.log('1. Verify frontend can display user activity data');
    console.log('2. Check that stats cards show correct numbers');
    console.log('3. Test user details dialog with transaction data');
    console.log('4. Monitor API performance with real data');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  }
}

// Export functions
module.exports = {
  testEndpoint,
  testDataConsistency,
  testErrorHandling,
  runAllTests
};

// Run tests if called directly
if (require.main === module) {
  runAllTests();
} 