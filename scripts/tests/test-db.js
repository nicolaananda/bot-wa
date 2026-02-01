const { Pool } = require('pg');

const pool = new Pool({
    host: 'nicola.id',
    port: 5432,
    database: 'bot_wa',
    user: 'bot_wa',
    password: 'bot_xwa',
    ssl: false,
    connectionTimeoutMillis: 15000,
});

async function testConnection() {
    try {
        console.log('🔄 Attempting to connect to PostgreSQL...');
        console.log('Host:', 'nicola.id');
        console.log('Port:', 5432);
        console.log('Database:', 'bot_wa');
        console.log('User:', 'bot_wa');
        console.log('Password:', 'bot_xwa');
        console.log('');

        const client = await pool.connect();
        console.log('✅ Connection successful!');

        const result = await client.query('SELECT version(), current_database(), current_user');
        console.log('');
        console.log('Database info:');
        console.log('- Version:', result.rows[0].version.split(' ').slice(0, 2).join(' '));
        console.log('- Current database:', result.rows[0].current_database);
        console.log('- Current user:', result.rows[0].current_user);

        client.release();
        await pool.end();

        console.log('');
        console.log('✅ Test completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('❌ Connection failed!');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('');
        console.error('Full error:', error);

        await pool.end();
        process.exit(1);
    }
}

testConnection();
