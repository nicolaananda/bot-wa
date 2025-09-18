#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { query, getClient } = require('../config/postgres');

async function ensureSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await query(sql);
}

function loadJsonDb() {
  const p = path.join(__dirname, 'database.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function toNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function toInteger(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const v = typeof value === 'string' ? value.trim() : value;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

async function migrate() {
  await ensureSchema();
  const db = loadJsonDb();
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // users
    if (db.users) {
      const entries = Object.entries(db.users);
      for (const [userId, u] of entries) {
        const saldo = toNumber(u.saldo, 0);
        const role = u.role || 'bronze';
        await client.query(
          'INSERT INTO users(user_id, saldo, role, data) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET saldo=EXCLUDED.saldo, role=EXCLUDED.role, data=EXCLUDED.data',
          [userId, saldo, role, JSON.stringify(u)]
        );
      }
      console.log(`[migrate] users: ${entries.length}`);
    }

    // transaksi
    if (Array.isArray(db.transaksi)) {
      for (const t of db.transaksi) {
        await client.query(
          'INSERT INTO transaksi(ref_id, user_id, amount, status, meta) VALUES ($1,$2,$3,$4,$5)',
          [t.ref_id || t.reffId || null, t.user_id || t.userId || null, toNumber(t.amount ?? t.nominal, 0), t.status || null, JSON.stringify(t)]
        );
      }
      console.log(`[migrate] transaksi: ${db.transaksi.length}`);
    }

    // produk
    if (db.produk) {
      // Widen stock column to BIGINT to avoid overflow on large numeric strings
      await client.query('ALTER TABLE IF EXISTS produk ALTER COLUMN stock TYPE BIGINT USING stock::bigint');
      const entries = Object.entries(db.produk);
      for (const [id, p] of entries) {
        await client.query(
          'INSERT INTO produk(id, name, price, stock, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock=EXCLUDED.stock, data=EXCLUDED.data',
          [id, p.name || p.nama || null, toNumber(p.price ?? p.harga, 0), toInteger(p.stock ?? p.stok, 0), JSON.stringify(p)]
        );
      }
      console.log(`[migrate] produk: ${entries.length}`);
    }

    // settings
    if (db.setting) {
      const entries = Object.entries(db.setting);
      for (const [k, v] of entries) {
        await client.query(
          'INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [k, JSON.stringify(v)]
        );
      }
      console.log(`[migrate] settings: ${Object.keys(db.setting).length}`);
    }

    // migrate all other top-level keys into their own tables
    const knownKeys = new Set(['users','transaksi','produk','setting']);
    for (const [topKey, value] of Object.entries(db)) {
      if (knownKeys.has(topKey)) continue;

      // sanitize table name (basic)
      const tableName = topKey.replace(/[^a-zA-Z0-9_]/g, '_');
      const safeTable = '"' + tableName + '"';

      if (Array.isArray(value)) {
        // array → table with item jsonb
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${safeTable} (
            id SERIAL PRIMARY KEY,
            item JSONB NOT NULL
          )
        `);
        // clean existing rows to avoid duplicates
        await client.query(`TRUNCATE ${safeTable} RESTART IDENTITY`);
        for (const item of value) {
          await client.query(`INSERT INTO ${safeTable}(item) VALUES ($1)`, [JSON.stringify(item)]);
        }
        console.log(`[migrate] ${topKey}: ${value.length} items`);
      } else if (value && typeof value === 'object') {
        // object map → table with k,v jsonb
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${safeTable} (
            k TEXT PRIMARY KEY,
            v JSONB NOT NULL
          )
        `);
        for (const [k, v] of Object.entries(value)) {
          await client.query(
            `INSERT INTO ${safeTable}(k, v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
            [k, JSON.stringify(v)]
          );
        }
        console.log(`[migrate] ${topKey}: ${Object.keys(value).length} entries`);
      } else {
        // primitive → store in settings namespace
        await client.query(
          'INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [topKey, JSON.stringify(value)]
        );
        console.log(`[migrate] ${topKey}: primitive saved to settings`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', e);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate();
}


