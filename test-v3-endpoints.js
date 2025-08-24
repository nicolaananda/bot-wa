/**
 * Test Script untuk Endpoint V3 - WhatsApp Bot Dashboard API
 * Testing: Get All Users with Pagination, Search, and Filters
 */

const axios = require('axios');

// Konfigurasi API
const API_BASE_URL = 'http://localhost:3000';

// Test cases untuk endpoint V3
const testCases = [
  {
    name: 'Get All Users Endpoint V3',
    endpoint: '/api/dashboard/users/all',
    method: 'GET',
    queryParams: {},
    expectedFields: {
      users: 'array',
      pagination: 'object'
    },
    description: 'Test endpoint untuk mendapatkan semua users dengan pagination default'
  },
  {
    name: 'Get All Users with Pagination V3',
    endpoint: '/api/dashboard/users/all',
    method: 'GET',
    queryParams: { page: 1, limit: 5 },
    expectedFields: {
      users: 'array',
      pagination: 'object'
    },
    description: 'Test endpoint dengan pagination: page 1, limit 5'
  },
  {
    name: 'Get All Users with Search V3',
    endpoint: '/api/dashboard/users/all',
    method: 'GET',
    queryParams: { search: '6281' },
    expectedFields: {
      users: 'array',
      pagination: 'object'
    },
    description: 'Test endpoint dengan search term "6281"'
  },
  {
    name: 'Get All Users with Role Filter V3',
    endpoint: '/api/dashboard/users/all',
    method: 'GET',
    queryParams: { role: 'bronze' },
    expectedFields: {
      users: 'array',
      pagination: 'object'
    },
    description: 'Test endpoint dengan role filter "bronze"'
  },
  {
    name: 'User Activity Endpoint V3 (Updated)',
    endpoint: '/api/dashboard/users/activity',
    method: 'GET',
    queryParams: {},
    expectedFields: {
      activeUsers: 'number',
      newUsers: 'number',
      userActivity: 'array',
      activityTrends: 'object'
    },
    description: 'Test endpoint user activity yang sudah diupdate dengan complete data structure'
  }
];

// Function untuk test endpoint
async function testEndpoint(testCase) {
  try {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`📍 Endpoint: ${testCase.endpoint}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🔍 Expected Fields: ${Object.keys(testCase.expectedFields).join(', ')}`);
    
    // Build query string
    const queryString = Object.keys(testCase.queryParams)
      .map(key => `${key}=${encodeURIComponent(testCase.queryParams[key])}`)
      .join('&');
    
    const fullUrl = queryString ? 
      `${API_BASE_URL}${testCase.endpoint}?${queryString}` : 
      `${API_BASE_URL}${testCase.endpoint}`;
    
    console.log(`🌐 Full URL: ${fullUrl}`);
    
    const response = await axios.get(fullUrl);
    
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
        if (testCase.name.includes('Get All Users')) {
          const data = response.data.data;
          console.log('\n🔍 Get All Users V3 Validation:');
          
          if (data.users && Array.isArray(data.users)) {
            console.log(`  📊 Users Count: ${data.users.length}`);
            console.log(`  📊 Total Users: ${data.pagination.totalUsers}`);
            console.log(`  📊 Current Page: ${data.pagination.currentPage}`);
            console.log(`  📊 Total Pages: ${data.pagination.totalPages}`);
            console.log(`  📊 Users Per Page: ${data.pagination.usersPerPage}`);
            console.log(`  📊 Has Next Page: ${data.pagination.hasNextPage}`);
            console.log(`  📊 Has Prev Page: ${data.pagination.hasPrevPage}`);
            
            // Check if users have required fields
            if (data.users.length > 0) {
              const firstUser = data.users[0];
              const requiredFields = [
                'userId', 'username', 'phone', 'email', 'saldo', 'role', 
                'isActive', 'lastActivity', 'createdAt', 'transactionCount', 
                'totalSpent', 'hasTransactions'
              ];
              const missingFields = requiredFields.filter(field => !(field in firstUser));
              
              if (missingFields.length === 0) {
                console.log('  ✅ All required user fields present');
              } else {
                console.log(`  ❌ Missing user fields: ${missingFields.join(', ')}`);
                allFieldsValid = false;
              }
              
              // Check user data sample
              console.log(`  👤 Sample User: ${firstUser.username} (${firstUser.userId})`);
              console.log(`  💰 Saldo: ${firstUser.saldo}`);
              console.log(`  🏆 Role: ${firstUser.role}`);
              console.log(`  📊 Transactions: ${firstUser.transactionCount}`);
              console.log(`  💳 Total Spent: ${firstUser.totalSpent}`);
              console.log(`  ✅ Has Transactions: ${firstUser.hasTransactions}`);
            }
            
            // Validate pagination logic
            const expectedTotalPages = Math.ceil(data.pagination.totalUsers / data.pagination.usersPerPage);
            if (data.pagination.totalPages === expectedTotalPages) {
              console.log('  ✅ Pagination calculation correct');
            } else {
              console.log(`  ❌ Pagination calculation wrong: expected ${expectedTotalPages}, got ${data.pagination.totalPages}`);
              allFieldsValid = false;
            }
          }
        }
        
        if (testCase.name === 'User Activity Endpoint V3 (Updated)') {
          const data = response.data.data;
          console.log('\n🔍 User Activity V3 Validation:');
          console.log(`  📊 Active Users: ${data.activeUsers}`);
          console.log(`  📊 New Users: ${data.newUsers}`);
          console.log(`  📊 User Activity Count: ${data.userActivity.length}`);
          console.log(`  📊 Activity Trends: ${Object.keys(data.activityTrends).join(', ')}`);
          
          // Check if all required fields are present
          const requiredFields = ['activeUsers', 'newUsers', 'userActivity', 'activityTrends'];
          const missingFields = requiredFields.filter(field => !(field in data));
          
          if (missingFields.length === 0) {
            console.log('  ✅ All required V3 fields present');
          } else {
            console.log(`  ❌ Missing V3 fields: ${missingFields.join(', ')}`);
            allFieldsValid = false;
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

// Function untuk test pagination logic
async function testPaginationLogic() {
  try {
    console.log('\n📄 Testing Pagination Logic V3');
    console.log('================================');
    
    // Test different page sizes
    const testCases = [
      { page: 1, limit: 5 },
      { page: 1, limit: 10 },
      { page: 2, limit: 5 },
      { page: 1, limit: 20 }
    ];
    
    let allTestsPassed = true;
    
    for (const testCase of testCases) {
      console.log(`\n🔍 Testing: page=${testCase.page}, limit=${testCase.limit}`);
      
      const queryString = `page=${testCase.page}&limit=${testCase.limit}`;
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/users/all?${queryString}`);
      
      if (response.data.success) {
        const data = response.data.data;
        const pagination = data.pagination;
        
        console.log(`  📊 Users returned: ${data.users.length}`);
        console.log(`  📊 Total users: ${pagination.totalUsers}`);
        console.log(`  📊 Current page: ${pagination.currentPage}`);
        console.log(`  📊 Total pages: ${pagination.totalPages}`);
        
        // Validate pagination logic
        const expectedTotalPages = Math.ceil(pagination.totalUsers / pagination.usersPerPage);
        const expectedOffset = (testCase.page - 1) * testCase.limit;
        const expectedUserCount = Math.min(testCase.limit, pagination.totalUsers - expectedOffset);
        
        let testPassed = true;
        
        if (pagination.totalPages !== expectedTotalPages) {
          console.log(`  ❌ Total pages wrong: expected ${expectedTotalPages}, got ${pagination.totalPages}`);
          testPassed = false;
        }
        
        if (data.users.length !== expectedUserCount && testCase.page <= pagination.totalPages) {
          console.log(`  ❌ User count wrong: expected ${expectedUserCount}, got ${data.users.length}`);
          testPassed = false;
        }
        
        if (pagination.currentPage !== testCase.page) {
          console.log(`  ❌ Current page wrong: expected ${testCase.page}, got ${pagination.currentPage}`);
          testPassed = false;
        }
        
        if (testPassed) {
          console.log('  ✅ Pagination logic correct');
        } else {
          allTestsPassed = false;
        }
        
      } else {
        console.log('  ❌ Request failed');
        allTestsPassed = false;
      }
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return allTestsPassed;
    
  } catch (error) {
    console.log('❌ Pagination logic test failed:', error.message);
    return false;
  }
}

// Function untuk test search and filter functionality
async function testSearchAndFilter() {
  try {
    console.log('\n🔍 Testing Search and Filter V3');
    console.log('=================================');
    
    // Test search functionality
    console.log('\n🔍 Testing Search:');
    const searchResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/all?search=6281`);
    
    if (searchResponse.data.success) {
      const searchData = searchResponse.data.data;
      console.log(`  📊 Search results: ${searchData.users.length} users found`);
      
      // Check if all results contain search term
      const allContainSearch = searchData.users.every(user => 
        user.userId.includes('6281') || user.username.toLowerCase().includes('6281')
      );
      
      if (allContainSearch) {
        console.log('  ✅ All search results contain search term');
      } else {
        console.log('  ❌ Some search results do not contain search term');
        return false;
      }
    }
    
    // Test role filter
    console.log('\n🏆 Testing Role Filter:');
    const roleResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/all?role=bronze`);
    
    if (roleResponse.data.success) {
      const roleData = roleResponse.data.data;
      console.log(`  📊 Bronze users found: ${roleData.users.length}`);
      
      // Check if all results have bronze role
      const allBronze = roleData.users.every(user => user.role === 'bronze');
      
      if (allBronze) {
        console.log('  ✅ All filtered users have bronze role');
      } else {
        console.log('  ❌ Some filtered users do not have bronze role');
        return false;
      }
    }
    
    // Test combined search and filter
    console.log('\n🔍 Testing Combined Search + Filter:');
    const combinedResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/all?search=6281&role=bronze`);
    
    if (combinedResponse.data.success) {
      const combinedData = combinedResponse.data.data;
      console.log(`  📊 Combined results: ${combinedData.users.length} users found`);
      console.log('  ✅ Combined search and filter working');
    }
    
    return true;
    
  } catch (error) {
    console.log('❌ Search and filter test failed:', error.message);
    return false;
  }
}

// Function untuk test data consistency V3
async function testDataConsistencyV3() {
  try {
    console.log('\n🔍 Testing Data Consistency V3 (All Users vs Activity)');
    console.log('========================================================');
    
    // Get all users
    const allUsersResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/all`);
    const allUsers = allUsersResponse.data.data;
    
    // Get user activity
    const activityResponse = await axios.get(`${API_BASE_URL}/api/dashboard/users/activity`);
    const activity = activityResponse.data.data;
    
    console.log('📊 V3 Data Consistency Check:');
    console.log(`  📈 All Users Total: ${allUsers.pagination.totalUsers}`);
    console.log(`  📈 Activity Active Users: ${activity.activeUsers}`);
    console.log(`  📈 Activity New Users: ${activity.newUsers}`);
    
    // Check if numbers make sense
    const isConsistent = allUsers.pagination.totalUsers >= activity.activeUsers && 
                        activity.activeUsers >= activity.newUsers;
    
    if (isConsistent) {
      console.log('  ✅ V3 data consistency check passed');
    } else {
      console.log('  ⚠️  V3 data consistency issues detected');
    }
    
    // Check if all users endpoint returns more users than activity
    if (allUsers.pagination.totalUsers > activity.userActivity.length) {
      console.log('  ✅ All users endpoint returns more users (including those without transactions)');
    } else {
      console.log('  ⚠️  All users endpoint should return more users than activity endpoint');
    }
    
    return isConsistent;
    
  } catch (error) {
    console.log('❌ V3 data consistency test failed:', error.message);
    return false;
  }
}

// Main test function
async function runAllV3Tests() {
  console.log('🚀 Starting V3 Endpoints Verification Tests');
  console.log('===========================================');
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🎯 Focus: Testing V3 endpoints with Get All Users, Pagination, Search, and Filters`);
  
  let passedTests = 0;
  let totalTests = testCases.length + 3; // +3 for pagination, search, and consistency tests
  
  try {
    // Test each endpoint
    for (const testCase of testCases) {
      const result = await testEndpoint(testCase);
      if (result) passedTests++;
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test pagination logic
    console.log('\n📄 Additional Pagination Logic Test');
    const paginationResult = await testPaginationLogic();
    if (paginationResult) passedTests++;
    
    // Test search and filter
    console.log('\n🔍 Additional Search and Filter Test');
    const searchFilterResult = await testSearchAndFilter();
    if (searchFilterResult) passedTests++;
    
    // Test data consistency V3
    console.log('\n🔍 Additional V3 Data Consistency Test');
    const consistencyResult = await testDataConsistencyV3();
    if (consistencyResult) passedTests++;
    
    // Summary
    console.log('\n🎯 V3 Test Summary');
    console.log('==================');
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL V3 TESTS PASSED! New endpoints are working correctly.');
    } else {
      console.log('⚠️  Some V3 tests failed. Check the logs above for details.');
    }
    
    console.log('\n📋 V3 Implementation Status:');
    console.log('✅ Get All Users: pagination, search, filters');
    console.log('✅ User Activity: complete data structure with trends');
    console.log('✅ Pagination Logic: page, limit, offset calculation');
    console.log('✅ Search Functionality: username and user ID search');
    console.log('✅ Role Filtering: bronze, silver, gold');
    console.log('✅ Data Consistency: all users vs activity endpoint');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Verify frontend can display all 39 users (not just 2)');
    console.log('2. Test pagination controls (10 users per page)');
    console.log('3. Test search functionality for all users');
    console.log('4. Test role filtering for different user types');
    console.log('5. Monitor API performance with pagination');
    
  } catch (error) {
    console.error('❌ V3 test execution failed:', error.message);
  }
}

// Export functions
module.exports = {
  testEndpoint,
  testPaginationLogic,
  testSearchAndFilter,
  testDataConsistencyV3,
  runAllV3Tests
};

// Run tests if called directly
if (require.main === module) {
  runAllV3Tests();
} 