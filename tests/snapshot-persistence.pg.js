// Offline credentials: run as the local PostgreSQL OS user; TEMP tables only, rolled back.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { Client } = require('pg')
const databaseSource = fs.readFileSync(require.resolve('../function/database'), 'utf8')
;(async () => {
  if (process.getuid() === 0) process.setuid('postgres')
  const client = new Client({ host: '/var/run/postgresql', database: 'postgres', user: 'postgres' })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO pg_temp;
      CREATE TEMP TABLE produk(id text PRIMARY KEY,name text,price numeric,stock integer,data jsonb);
      CREATE TEMP TABLE users(user_id text PRIMARY KEY,saldo numeric CHECK(saldo>=0),role text,data jsonb);
      CREATE TEMP TABLE kv_store(key text PRIMARY KEY,value jsonb,updated_at timestamptz);
      CREATE TEMP TABLE transaksi(id serial,meta jsonb);
      CREATE TEMP TABLE settings(key text,value jsonb);`)
    const context = { module: { exports: {} }, console: { log() {}, error() {} },
      process: { env: { USE_PG: 'true' } }, require: name => {
        if (name === 'dotenv') return { config() {} }
        if (name === '../config/postgres') return { query: (...args) => client.query(...args) }
        if (name === '../lib/otp-wallet') return { walletQuery: (...args) => client.query(...args) }
        throw new Error(name)
      } }
    vm.runInNewContext(databaseSource, context)
    const db = new context.module.exports()
    await client.query(`INSERT INTO produk VALUES ('a','A',10,2,'{"name":"A","price":10,"stok":["fixture-a","fixture-b"],"profit":7}'),
      ('b','B',10,0,'{"name":"B","stok":[]}');
      INSERT INTO users VALUES ('fixture',100,'bronze','{}')`)
    await db.load()
    db.data.produk.a.name = 'Edited'
    await db.save()
    assert.equal((await client.query("SELECT data->>'name' name FROM produk WHERE id='a'")).rows[0].name, 'Edited')
    db.data.produk.a.name = 'Second'
    db.data.produk.b.name = 'Stale'
    await client.query(`UPDATE produk SET data='{"name":"Owner","stok":[]}' WHERE id='b'`)
    await assert.rejects(db.save(), { code: '40001' })
    assert.equal(JSON.parse(db._persisted.produk.get('a')).name, 'Second')
    assert.equal((await client.query("SELECT data->>'name' name FROM produk WHERE id='b'")).rows[0].name, 'Owner')
    // Reset only the fixture's conflicting local edit; no live reconciliation.
    db.data.produk.b = JSON.parse(db._persisted.produk.get('b'))
    await client.query(`UPDATE users SET saldo=40 WHERE user_id='fixture';
      UPDATE produk SET data=jsonb_set(data,'{stok}','["fixture-b"]'),stock=1 WHERE id='a'`)
    await db.refreshProductSnapshot('a')
    await db.save()
    assert.equal(Number((await client.query("SELECT saldo FROM users WHERE user_id='fixture'")).rows[0].saldo), 40)
    assert.equal((await client.query("SELECT stock FROM produk WHERE id='a'")).rows[0].stock, 1)
    assert.equal((await client.query("SELECT data->>'profit' profit FROM produk WHERE id='a'")).rows[0].profit, '7')
    console.log('PostgreSQL TEMP fixtures passed: normalized CAS, partial success, newer-state protection, no repeated debit/stock, profit unchanged')
  } finally { await client.query('ROLLBACK'); await client.end() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
