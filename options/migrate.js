const fs = require('fs');
const path = require('path');
const { pool } = require('../config/postgres');

const LOCK_KEY = 731042091;

async function migrate(db = pool, directory = path.join(__dirname, '..', 'migrations')) {
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(row => row.version));
    const files = fs.readdirSync(directory).filter(file => /^\d+.*\.sql$/.test(file)).sort();
    for (const version of files) {
      if (applied.has(version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(directory, version), 'utf8'));
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return files.filter(version => !applied.has(version));
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]); } finally { client.release(); }
  }
}

if (require.main === module) migrate().then(
  versions => { console.log(`Applied ${versions.length} migration(s)`); return pool.end(); },
  error => { console.error(`Migration failed: ${error.message}`); return pool.end().finally(() => { process.exitCode = 1; }); }
);

module.exports = { migrate, LOCK_KEY };
