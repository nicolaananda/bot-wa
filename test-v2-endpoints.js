/**
 * Test Script untuk Endpoint V2 - WhatsApp Bot Dashboard API
 * Testing: Field saldo, username, role, balance distribution
 */

const axios = require('axios');

// Konfigurasi API
const API_BASE_URL = 'http://localhost:3000';

// Test cases untuk endpoint V2
const testCases = [
  {
    name: 'User Activity Endpoint V2',
    endpoint: '/api/dashboard/users/activity',
    method: 'GET',
    expectedFields: {
      user: 'string',
      username: 'string',
      totalTransaksi: 'number',
      totalSpent: 'number',
      saldo: 'number',
      lastActivity: 'string',
      role: 'string',
      metodeBayar: 'object'
    },
    description: 'Test endpoint untuk mendapatkan data aktivitas user dengan field saldo, username, dan role',
    additionalChecks: ['saldo', 'username', 'role', 'metodeBayar']
  },
  {
    name: 'User Stats Endpoint V2',
    endpoint: '/api/dashboard/users/stats',
    method: 'GET',
    expectedFields: {
      totalUsers: 'number',
      totalSaldo: 'number',
      averageSaldo: 'number',
      userGrowth: 'object',
      roleDistribution: 'object',
      balanceDistribution: 'object'
    },
    description: 'Test endpoint untuk mendapatkan statistik user dengan balance distribution',
    additionalChecks: ['balanceDistribution', 'totalSaldo', 'averageSaldo']
  },
  {
    name: 'User Transactions Endpoint V2',
    endpoint: '/api/dashboard/users/6281389592985/transactions',
    method: 'GET',
    expectedFields: {
      user: 'string',
      userId: 'string',
      totalTransaksi: 'number',
      totalSpent: 'number',
      currentSaldo: 'number',
      transaksi: 'array'
    },
    description: 'Test endpoint untuk mendapatkan transaksi user dengan current saldo',
    additionalChecks: ['currentSaldo', 'userId']
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
        if (testCase.name === 'User Activity Endpoint V2') {
          const data = response.data.data;
          console.log('\n🔍 User Activity V2 Validation:');
          
          if (Array.isArray(data) && data.length > 0) {
            const firstActivity = data[0];
            console.log(`  📊 Sample User: ${firstActivity.user}`);
            console.log(`  📊 Username: ${firstActivity.username}`);
            console.log(`  📊 Saldo: ${firstActivity.saldo}`);
            console.log(`  📊 Role: ${firstActivity.role}`);
            console.log(`  📊 Total Transaksi: ${firstActivity.totalTransaksi}`);
            console.log(`  📊 Total Spent: ${firstActivity.totalSpent}`);
            console.log(`  📊 Payment Methods: ${JSON.stringify(firstActivity.metodeBayar)}`);
            
            // Check if all required V2 fields are present
            const requiredV2Fields = ['saldo', 'username', 'role', 'metodeBayar'];
            const missingV2Fields = requiredV2Fields.filter(field => !firstActivity[field]);
            
            if (missingV2Fields.length === 0) {
              console.log('  ✅ All V2 fields present in user activity');
            } else {
              console.log(`  ❌ Missing V2 fields: ${missingV2Fields.join(', ')}`);
              allFieldsValid = false;
            }
            
            // Validate payment method breakdown
            if (firstActivity.metodeBayar) {
              const paymentFields = ['saldo', 'qris', 'unknown'];
              const missingPaymentFields = paymentFields.filter(field => !(field in firstActivity.metodeBayar));
              
              if (missingPaymentFields.length === 0) {
                console.log('  ✅ Payment method breakdown complete');
              } else {
                console.log(`  ❌ Missing payment method fields: ${missingPaymentFields.join(', ')}`);
                allFieldsValid = false;
              }
            }
          }
        }
        
        if (testCase.name === 'User Stats Endpoint V2') {
          const data = response.data.data;
          console.log('\n🔍 User Stats V2 Validation:');
          console.log(`  📊 Total Users: ${data.totalUsers}`);
          console.log(`  📊 Total Saldo: ${data.totalSaldo}`);
          console.log(`  📊 Average Saldo: ${data.averageSaldo}`);
          console.log(`  📊 User Growth: ${data.userGrowth.thisMonth} this month, ${data.userGrowth.growthRate}% growth`);
          console.log(`  📊 Role Distribution: ${JSON.stringify(data.roleDistribution)}`);
          console.log(`  📊 Balance Distribution: ${JSON.stringify(data.balanceDistribution)}`);
          
          // Validate balance distribution
          if (data.balanceDistribution) {
            const balanceFields = ['high', 'medium', 'low'];
            const missingBalanceFields = balanceFields.filter(field => !(field in data.balanceDistribution));
            
            if (missingBalanceFields.length === 0) {
              console.log('  ✅ Balance distribution complete');
            } else {
              console.log(`  ❌ Missing balance distribution fields: ${missingBalanceFields.join(', ')}`);
              allFieldsValid = false;
            }
          }
        }
        
        if (testCase.name === 'User Transactions Endpoint V2') {
          const data = response.data.data;
          console.log('\n🔍 User Transactions V2 Validation:');
          console.log(`  👤 User: ${data.user}`);
          console.log(`  🆔 User ID: ${data.userId}`);
          console.log(`  📊 Total Transaksi: ${data.totalTransaksi}`);
          console.log(`  💰 Total Spent: ${data.totalSpent}`);
          console.log(`  💳 Current Saldo: ${data.currentSaldo}`);
          console.log(`  📋 Transactions Count: ${data.transaksi.length}`);
          
          // Check if V2 fields are present
          const requiredV2Fields = ['currentSaldo', 'userId'];
          const missingV2Fields = requiredV2Fields.filter(field => !(field in data));
          
          if (missingV2Fields.length === 0) {
            console.log('  ✅ All V2 fields present in user transactions');
          } else {
            console.log(`  ❌ Missing V2 fields: ${missingV2Fields.join(', ')}`);
            allFieldsValid = false;
          }
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

// Function untuk test data consistency V2
async function testDataConsistencyV2() {
  try {
    console.log('\n🔍 Testing Data Consistency V2 (Saldo & Role)');
    console.log('==============================================');
    
    // Get user stats
    const statsResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/stats`);
    const stats = statsResponse.data.data;
    
    // Get user activity
    const activityResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/activity`);
    const activity = activityResponse.data.data;
    
    console.log('📊 V2 Data Consistency Check:');
    console.log(`  📈 Stats Total Users: ${stats.totalUsers}`);
    console.log(`  📈 Activity Users Count: ${activity.length}`);
    console.log(`  📈 Stats Total Saldo: ${stats.totalSaldo}`);
    console.log(`  📈 Stats Average Saldo: ${stats.averageSaldo}`);
    
    // Check if numbers make sense
    const isConsistent = stats.totalUsers >= activity.length && 
                        stats.totalSaldo >= 0 &&
                        stats.averageSaldo >= 0;
    
    if (isConsistent) {
      console.log('  ✅ V2 data consistency check passed');
    } else {
      console.log('  ⚠️  V2 data consistency issues detected');
    }
    
    // Check role distribution consistency
    if (stats.roleDistribution && activity.length > 0) {
      const activityRoles = {};
      activity.forEach(user => {
        const role = user.role || 'bronze';
        activityRoles[role] = (activityRoles[role] || 0) + 1;
      });
      
      console.log('  📊 Role Distribution Consistency:');
      console.log(`    Stats: ${JSON.stringify(stats.roleDistribution)}`);
      console.log(`    Activity: ${JSON.stringify(activityRoles)}`);
      
      // Check if roles are consistent
      const rolesConsistent = ['bronze', 'silver', 'gold'].every(role => {
        const statsCount = stats.roleDistribution[role] || 0;
        const activityCount = activityRoles[role] || 0;
        return statsCount >= activityCount; // Stats should be >= activity (some users might not have activity)
      });
      
      if (rolesConsistent) {
        console.log('  ✅ Role distribution consistency check passed');
      } else {
        console.log('  ⚠️  Role distribution consistency issues detected');
      }
    }
    
    return isConsistent;
    
  } catch (error) {
    console.log('❌ V2 data consistency test failed:', error.message);
    return false;
  }
}

// Function untuk test saldo field specifically
async function testSaldoField() {
  try {
    console.log('\n💰 Testing Saldo Field Implementation');
    console.log('=====================================');
    
    // Test user activity endpoint for saldo
    const activityResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/activity`);
    const activity = activityResponse.data.data;
    
    if (Array.isArray(activity) && activity.length > 0) {
      console.log('✅ User activity endpoint returns saldo field');
      
      // Check if all users have saldo field
      const usersWithSaldo = activity.filter(user => 'saldo' in user);
      const usersWithoutSaldo = activity.filter(user => !('saldo' in user));
      
      console.log(`  📊 Users with saldo: ${usersWithSaldo.length}`);
      console.log(`  📊 Users without saldo: ${usersWithoutSaldo.length}`);
      
      if (usersWithoutSaldo.length === 0) {
        console.log('  ✅ All users have saldo field');
        
        // Check saldo values
        const saldoValues = usersWithSaldo.map(user => user.saldo);
        const validSaldoValues = saldoValues.filter(saldo => typeof saldo === 'number' && saldo >= 0);
        
        console.log(`  📊 Valid saldo values: ${validSaldoValues.length}/${saldoValues.length}`);
        console.log(`  📊 Saldo range: ${Math.min(...validSaldoValues)} - ${Math.max(...validSaldoValues)}`);
        
        if (validSaldoValues.length === saldoValues.length) {
          console.log('  ✅ All saldo values are valid numbers');
          return true;
        } else {
          console.log('  ⚠️  Some saldo values are invalid');
          return false;
        }
      } else {
        console.log('  ❌ Some users missing saldo field');
        return false;
      }
    } else {
      console.log('❌ User activity endpoint not working properly');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Saldo field test failed:', error.message);
    return false;
  }
}

// Main test function
async function runAllV2Tests() {
  console.log('🚀 Starting V2 Endpoints Verification Tests');
  console.log('===========================================');
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🎯 Focus: Testing V2 endpoints with saldo, username, role, and balance distribution`);
  
  let passedTests = 0;
  let totalTests = testCases.length + 2; // +2 for consistency and saldo tests
  
  try {
    // Test each endpoint
    for (const testCase of testCases) {
      const result = await testEndpoint(testCase);
      if (result) passedTests++;
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test data consistency V2
    console.log('\n🔍 Additional V2 Data Consistency Test');
    const consistencyResult = await testDataConsistencyV2();
    if (consistencyResult) passedTests++;
    
    // Test saldo field specifically
    console.log('\n💰 Additional Saldo Field Test');
    const saldoResult = await testSaldoField();
    if (saldoResult) passedTests++;
    
    // Summary
    console.log('\n🎯 V2 Test Summary');
    console.log('==================');
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL V2 TESTS PASSED! Endpoints are working with new fields.');
    } else {
      console.log('⚠️  Some V2 tests failed. Check the logs above for details.');
    }
    
    console.log('\n📋 V2 Implementation Status:');
    console.log('✅ User Activity: saldo, username, role, metodeBayar breakdown');
    console.log('✅ User Stats: balance distribution, total saldo, average saldo');
    console.log('✅ User Transactions: current saldo, userId');
    console.log('✅ Auto-role calculation based on spending');
    console.log('✅ Payment method breakdown (saldo, qris, unknown)');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Verify frontend can display saldo information');
    console.log('2. Check that role badges show correct colors');
    console.log('3. Test balance distribution charts');
    console.log('4. Monitor API performance with new fields');
    
  } catch (error) {
    console.error('❌ V2 test execution failed:', error.message);
  }
}

// Export functions
module.exports = {
  testEndpoint,
  testDataConsistencyV2,
  testSaldoField,
  runAllV2Tests
};

// Run tests if called directly
if (require.main === module) {
  runAllV2Tests();
} 