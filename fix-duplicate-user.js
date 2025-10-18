// Fix duplicate user with different saldo
require('dotenv').config();
const pg = require('./config/postgres');

async function fixDuplicateUser() {
  try {
    console.log('🔧 Fixing duplicate user issue...');
    
    const phoneNumber = '6281389592985';
    const idWithSuffix = phoneNumber + '@s.whatsapp.net';
    
    // Get both users
    const user1 = await pg.query('SELECT user_id, saldo, role, data FROM users WHERE user_id = $1', [phoneNumber]);
    const user2 = await pg.query('SELECT user_id, saldo, role, data FROM users WHERE user_id = $1', [idWithSuffix]);
    
    console.log('📊 User without suffix:', user1.rows[0]);
    console.log('📊 User with suffix:', user2.rows[0]);
    
    if (user1.rows[0] && user2.rows[0]) {
      const saldo1 = Number(user1.rows[0].saldo);
      const saldo2 = Number(user2.rows[0].saldo);
      
      console.log(`💰 Saldo without suffix: ${saldo1}`);
      console.log(`💰 Saldo with suffix: ${saldo2}`);
      
      if (saldo1 > saldo2) {
        // Update user with suffix to have the higher saldo
        console.log('🔄 Updating user with suffix to have higher saldo...');
        await pg.query('UPDATE users SET saldo = $1 WHERE user_id = $2', [saldo1, idWithSuffix]);
        console.log('✅ Updated user with suffix');
      } else if (saldo2 > saldo1) {
        // Update user without suffix to have the higher saldo
        console.log('🔄 Updating user without suffix to have higher saldo...');
        await pg.query('UPDATE users SET saldo = $1 WHERE user_id = $2', [saldo2, phoneNumber]);
        console.log('✅ Updated user without suffix');
      } else {
        console.log('ℹ️ Both users have same saldo, no update needed');
      }
    } else {
      console.log('❌ One or both users not found');
    }
    
    // Verify the fix
    console.log('\n🔍 Verifying fix...');
    const verify1 = await pg.query('SELECT user_id, saldo FROM users WHERE user_id = $1', [phoneNumber]);
    const verify2 = await pg.query('SELECT user_id, saldo FROM users WHERE user_id = $1', [idWithSuffix]);
    
    console.log('✅ Final result:');
    console.log('User without suffix:', verify1.rows[0]);
    console.log('User with suffix:', verify2.rows[0]);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

fixDuplicateUser();
