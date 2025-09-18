const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'bot_wa',
  user: process.env.PG_USER || 'bot_wa',
  password: process.env.PG_PASSWORD || 'bot_wa',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    console.log('[PG] slow query', { duration, text });
  }
  return res;
}

async function getClient() {
  const client = await pool.connect();
  const q = client.query.bind(client);
  const release = client.release.bind(client);
  client.query = (...args) => {
    return q(...args);
  };
  client.release = () => release();
  return client;
}

module.exports = {
  pool,
  query,
  getClient,
};


