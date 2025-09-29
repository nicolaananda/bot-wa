// Debug cache issue
require('dotenv').config();
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';

console.log('🔧 USE_PG:', usePg);

if (usePg) {
  const pg = require('./config/postgres');
  
  async function debugCache() {
    try {
      console.log('🔍 Checking PostgreSQL data...');
      
      // Check specific user
      const userId = '6281389592985@s.whatsapp.net';
      const result = await pg.query('SELECT user_id, saldo, role FROM users WHERE user_id = $1', [userId]);
      
      console.log(`📊 PostgreSQL result for ${userId}:`, result.rows[0] || 'NOT FOUND');
      
      // Check cache
      console.log('\n📋 Cache status:');
      console.log('global.db exists:', !!global.db);
      console.log('global.db.data exists:', !!(global.db && global.db.data));
      console.log('global.db.data.users exists:', !!(global.db && global.db.data && global.db.data.users));
      
      if (global.db && global.db.data && global.db.data.users) {
        const users = global.db.data.users;
        console.log('Cache users count:', Object.keys(users).length);
        
        const userInCache = users[userId];
        console.log(`User ${userId} in cache:`, userInCache || 'NOT FOUND');
        
        // Check both formats
        const idNo = userId.replace(/@s\.whatsapp\.net$/, '');
        const userNoSuffix = users[idNo];
        console.log(`User ${idNo} in cache:`, userNoSuffix || 'NOT FOUND');
      }
      
    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      process.exit(0);
    }
  }
  
  debugCache();
} else {
  console.log('❌ This script is for PostgreSQL mode only');
  process.exit(1);
}
