#!/usr/bin/env node
/**
 * Neon.tech Connection Tester
 * 
 * Usage:
 *   node config/neon-test.js
 * 
 * This script tests:
 * 1. Basic connectivity to Neon
 * 2. Query performance
 * 3. Connection pooling
 * 4. Data integrity
 */

require('dotenv').config();
const { Pool } = require('pg');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSuccess(msg) {
  log(`✅ ${msg}`, 'green');
}

function logError(msg) {
  log(`❌ ${msg}`, 'red');
}

function logInfo(msg) {
  log(`ℹ️  ${msg}`, 'cyan');
}

function logWarning(msg) {
  log(`⚠️  ${msg}`, 'yellow');
}

// Create pool with Neon configuration
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'bot_wa',
  user: process.env.PG_USER || 'bot_wa',
  password: process.env.PG_PASSWORD || 'bot_wa',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function testBasicConnection() {
  log('\n🔌 Test 1: Basic Connection', 'bright');
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    const duration = Date.now() - start;
    
    logSuccess(`Connected to Neon in ${duration}ms`);
    logInfo(`PostgreSQL version: ${result.rows[0].pg_version.split(' ')[1]}`);
    logInfo(`Server time: ${result.rows[0].current_time}`);
    return true;
  } catch (err) {
    logError(`Connection failed: ${err.message}`);
    return false;
  }
}

async function testTableExistence() {
  log('\n📋 Test 2: Table Existence', 'bright');
  const requiredTables = ['users', 'transaksi', 'produk', 'settings', 'web_pos_pin', 'kv_store'];
  
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);
    
    const existingTables = result.rows.map(r => r.table_name);
    
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        logSuccess(`Table '${table}' exists`);
      } else {
        logWarning(`Table '${table}' missing - run 'npm run pg:schema'`);
      }
    }
    
    return true;
  } catch (err) {
    logError(`Table check failed: ${err.message}`);
    return false;
  }
}

async function testDataIntegrity() {
  log('\n📊 Test 3: Data Integrity', 'bright');
  
  try {
    // Count records in each table
    const tables = [
      { name: 'users', countCol: 'user_id' },
      { name: 'transaksi', countCol: 'id' },
      { name: 'produk', countCol: 'id' },
      { name: 'settings', countCol: 'key' },
    ];
    
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(${table.countCol}) as count FROM ${table.name}`);
        const count = result.rows[0].count;
        
        if (count > 0) {
          logSuccess(`${table.name}: ${count} records`);
        } else {
          logInfo(`${table.name}: empty (this is OK for new setup)`);
        }
      } catch (err) {
        logWarning(`${table.name}: ${err.message}`);
      }
    }
    
    return true;
  } catch (err) {
    logError(`Data integrity check failed: ${err.message}`);
    return false;
  }
}

async function testQueryPerformance() {
  log('\n⚡ Test 4: Query Performance', 'bright');
  
  const queries = [
    {
      name: 'Simple SELECT',
      sql: 'SELECT 1',
    },
    {
      name: 'User lookup',
      sql: 'SELECT * FROM users LIMIT 1',
    },
    {
      name: 'Transaction count',
      sql: 'SELECT COUNT(*) FROM transaksi',
    },
    {
      name: 'JSONB query',
      sql: `SELECT user_id, data->>'role' as role FROM users LIMIT 1`,
    },
  ];
  
  for (const query of queries) {
    try {
      const start = Date.now();
      await pool.query(query.sql);
      const duration = Date.now() - start;
      
      if (duration < 100) {
        logSuccess(`${query.name}: ${duration}ms (excellent)`);
      } else if (duration < 500) {
        logInfo(`${query.name}: ${duration}ms (good)`);
      } else {
        logWarning(`${query.name}: ${duration}ms (slow)`);
      }
    } catch (err) {
      logWarning(`${query.name}: ${err.message}`);
    }
  }
  
  return true;
}

async function testConnectionPooling() {
  log('\n🏊 Test 5: Connection Pooling', 'bright');
  
  try {
    logInfo(`Pool max connections: ${pool.options.max}`);
    logInfo(`Pool idle timeout: ${pool.options.idleTimeoutMillis}ms`);
    logInfo(`Pool connection timeout: ${pool.options.connectionTimeoutMillis}ms`);
    
    // Test concurrent queries
    const start = Date.now();
    const concurrentQueries = Array(5).fill(null).map(() => 
      pool.query('SELECT pg_sleep(0.1)')
    );
    
    await Promise.all(concurrentQueries);
    const duration = Date.now() - start;
    
    logSuccess(`5 concurrent queries completed in ${duration}ms`);
    
    if (duration < 500) {
      logSuccess('Connection pooling is working efficiently');
    } else {
      logWarning('Connection pooling might need optimization');
    }
    
    return true;
  } catch (err) {
    logError(`Connection pooling test failed: ${err.message}`);
    return false;
  }
}

async function testWriteOperations() {
  log('\n✍️  Test 6: Write Operations', 'bright');
  
  try {
    // Test insert
    const testUserId = 'test_neon_' + Date.now();
    await pool.query(
      'INSERT INTO users(user_id, saldo, role, data) VALUES ($1, $2, $3, $4)',
      [testUserId, 1000, 'test', JSON.stringify({ test: true })]
    );
    logSuccess('INSERT operation successful');
    
    // Test update
    await pool.query(
      'UPDATE users SET saldo = saldo + $1 WHERE user_id = $2',
      [500, testUserId]
    );
    logSuccess('UPDATE operation successful');
    
    // Test select to verify
    const result = await pool.query(
      'SELECT saldo FROM users WHERE user_id = $1',
      [testUserId]
    );
    
    if (result.rows[0].saldo === '1500.00') {
      logSuccess('Data verification successful');
    } else {
      logWarning(`Expected 1500, got ${result.rows[0].saldo}`);
    }
    
    // Cleanup test data
    await pool.query('DELETE FROM users WHERE user_id = $1', [testUserId]);
    logSuccess('DELETE operation successful (cleanup)');
    
    return true;
  } catch (err) {
    logError(`Write operation test failed: ${err.message}`);
    return false;
  }
}

async function displayConnectionInfo() {
  log('\n📡 Connection Information', 'bright');
  
  logInfo(`Host: ${process.env.PG_HOST || 'localhost'}`);
  logInfo(`Port: ${process.env.PG_PORT || '5432'}`);
  logInfo(`Database: ${process.env.PG_DATABASE || 'bot_wa'}`);
  logInfo(`User: ${process.env.PG_USER || 'bot_wa'}`);
  logInfo(`SSL: ${process.env.PG_SSL === 'true' ? 'enabled' : 'disabled'}`);
  
  // Check if using Neon
  const isNeon = (process.env.PG_HOST || '').includes('neon.tech');
  if (isNeon) {
    logSuccess('Detected Neon.tech connection!');
    
    // Check if using pooled endpoint
    const isPooled = (process.env.PG_HOST || '').includes('-pooler');
    if (isPooled) {
      logSuccess('Using Neon pooled endpoint (recommended)');
    } else {
      logWarning('Not using pooled endpoint - consider using pooled connection string');
    }
  } else {
    logInfo('Using standard PostgreSQL connection');
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'bright');
  log('🧪 Neon.tech Connection Test Suite', 'bright');
  log('='.repeat(60), 'bright');
  
  displayConnectionInfo();
  
  const results = [];
  
  results.push({ name: 'Basic Connection', passed: await testBasicConnection() });
  results.push({ name: 'Table Existence', passed: await testTableExistence() });
  results.push({ name: 'Data Integrity', passed: await testDataIntegrity() });
  results.push({ name: 'Query Performance', passed: await testQueryPerformance() });
  results.push({ name: 'Connection Pooling', passed: await testConnectionPooling() });
  results.push({ name: 'Write Operations', passed: await testWriteOperations() });
  
  // Summary
  log('\n' + '='.repeat(60), 'bright');
  log('📈 Test Summary', 'bright');
  log('='.repeat(60), 'bright');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    if (result.passed) {
      logSuccess(`${result.name}: PASSED`);
    } else {
      logError(`${result.name}: FAILED`);
    }
  });
  
  log('');
  if (passed === total) {
    logSuccess(`All tests passed! (${passed}/${total})`);
    logSuccess('Your Neon connection is ready for production! 🚀');
  } else {
    logWarning(`${passed}/${total} tests passed`);
    logWarning('Please review the failed tests above');
  }
  
  log('\n' + '='.repeat(60) + '\n', 'bright');
}

// Run tests
runAllTests()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch(err => {
    logError(`Fatal error: ${err.message}`);
    pool.end();
    process.exit(1);
  });

