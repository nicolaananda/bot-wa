// Check all users with phone number 6281389592985
require('dotenv').config();
const pg = require('./config/postgres');

async function checkAllUsers() {
  try {
    console.log('🔍 Checking all users with phone 6281389592985...');
    
    // Check all formats
    const queries = [
      "SELECT user_id, saldo, role FROM users WHERE user_id = '6281389592985'",
      "SELECT user_id, saldo, role FROM users WHERE user_id = '6281389592985@s.whatsapp.net'",
      "SELECT user_id, saldo, role FROM users WHERE user_id LIKE '%6281389592985%'"
    ];
    
    for (let i = 0; i < queries.length; i++) {
      console.log(`\n📊 Query ${i + 1}:`);
      console.log(queries[i]);
      
      const result = await pg.query(queries[i]);
      console.log('Result:', result.rows);
    }
    
    // Check if there's a user with high saldo
    console.log('\n🔍 Checking users with saldo > 1000000...');
    const highSaldo = await pg.query('SELECT user_id, saldo, role FROM users WHERE saldo > 1000000 ORDER BY saldo DESC LIMIT 10');
    console.log('High saldo users:', highSaldo.rows);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkAllUsers();
