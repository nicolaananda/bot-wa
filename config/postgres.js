const { Pool } = require('pg');

// Env-driven config with safe defaults
const PG_MAX = Number(process.env.PG_POOL_MAX || 10);
const PG_IDLE_TIMEOUT = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000);
const PG_CONN_TIMEOUT = Number(process.env.PG_CONN_TIMEOUT_MS || 15000);
const PG_STATEMENT_TIMEOUT = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 60000);
const PG_SLOW_MS = Number(process.env.PG_SLOW_MS || 500);
const PG_KEEPALIVE = String(process.env.PG_KEEPALIVE || 'true').toLowerCase() !== 'false';
const PG_RETRIES = Number(process.env.PG_QUERY_RETRIES || 2); // retries after initial attempt

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'bot_wa',
  user: process.env.PG_USER || 'bot_wa',
  password: process.env.PG_PASSWORD || 'bot_wa',
  max: PG_MAX,
  idleTimeoutMillis: PG_IDLE_TIMEOUT,
  connectionTimeoutMillis: PG_CONN_TIMEOUT,
  keepAlive: PG_KEEPALIVE,
  statement_timeout: PG_STATEMENT_TIMEOUT,
});

// Capture unexpected errors on idle clients to avoid silent failures
pool.on('error', (err) => {
  try { console.error('[PG] unexpected error on idle client:', err && err.message ? err.message : err); } catch {}
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function query(text, params) {
  const start = Date.now();
  let lastError;
  const totalAttempts = PG_RETRIES + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > PG_SLOW_MS) {
        console.log('[PG] slow query', { duration, text });
      }
      return res;
    } catch (err) {
      lastError = err;
      const transient =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        /Connection terminated|socket hang up|Connection terminated unexpectedly/i.test(String(err?.message || ''));
      if (!transient || attempt === totalAttempts) {
        throw err;
      }
      const backoff = Math.min(500 * 2 ** (attempt - 1), 4000);
      try { console.warn('[PG] transient error, retrying...', { attempt, backoff, message: err.message }); } catch {}
      await delay(backoff);
    }
  }
  throw lastError;
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

// Best-effort warm-up to reduce cold-start latency
(async function warmup() {
  try {
    await query('SELECT 1');
  } catch (e) {
    try { console.warn('[PG] warmup failed:', e.message); } catch {}
  }
})();

async function closePool() {
  try {
    await pool.end();
  } catch (e) {
    try { console.warn('[PG] error closing pool:', e.message); } catch {}
  }
}

module.exports = {
  pool,
  query,
  getClient,
  closePool,
};


