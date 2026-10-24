const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { Client } = require('pg')
const source = fs.readFileSync(require.resolve('../function/database'), 'utf8')
const index = fs.readFileSync(require.resolve('../index'), 'utf8')
;(async () => {
  if (process.getuid() === 0) process.setuid('postgres')
  const client = new Client({ host: '/var/run/postgresql', database: 'postgres', user: 'postgres' })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO pg_temp;
      CREATE TEMP TABLE produk(id text PRIMARY KEY,name text,price numeric,stock integer,data jsonb,updated_at timestamptz);
      CREATE TEMP TABLE users(user_id text PRIMARY KEY,saldo numeric,role text,data jsonb);
      CREATE TEMP TABLE kv_store(key text PRIMARY KEY,value jsonb,updated_at timestamptz);
      CREATE TEMP TABLE transaksi(id serial,meta jsonb);
      CREATE TEMP TABLE settings(key text,value jsonb);
      CREATE TEMP TABLE business_orders(product_id text,status text);`)
    const context = { module: { exports: {} }, console: { log() {}, error() {} }, process: { env: { USE_PG: 'true' } }, require: name => {
      if (name === 'dotenv') return { config() {} }
      if (name === '../config/postgres') return { query: (...args) => client.query(...args) }
      if (name === '../lib/otp-wallet') return { walletQuery: (...args) => client.query(...args) }
      throw new Error(name)
    } }
    vm.runInNewContext(source, context)
    const Database = context.module.exports
    const db = new Database()
    async function command(command, q, isOwner = true) {
      const start = index.indexOf(`      case '${command}':`)
      const end = index.indexOf('\n      case ', start + 1)
      return vm.runInNewContext(`(async () => { switch(command) { ${index.slice(start, end)} } })()`, {
        db, command, q, isOwner, prefix: '.', mess: { owner: 'owner only' }, reply() {}, global: { scheduleSave() {} },
      })
    }
    await client.query(`INSERT INTO produk VALUES ('old','Original',10,2,'{"id":"old","name":"Original","priceB":10,"priceS":9,"priceG":8,"profit":7,"snk":"keep","terjual":18,"stok":["fixture-a","fixture-b"]}',now())`)
    await db.load()
    await command('setkode', 'old|new', false)
    assert.ok(db.data.produk.old)
    await command('setkode', 'old|new')
    await db.save()
    const fresh = new Database()
    await fresh.load()
    assert.ok(fresh.data.produk.new, 'rename must survive save and fresh load')
    assert.equal(fresh.data.produk.old, undefined)
    assert.equal(fresh.data.produk.new.id, 'new')
    assert.equal(fresh.data.produk.new.profit, 7)
    assert.equal(fresh.data.produk.new.snk, 'keep')
    assert.equal(fresh.data.produk.new.terjual, 18)
    assert.equal(fresh.data.produk.new.stok.length, 2)
    await command('addproduk', 'created|Created|Description|Terms|20|19|18|3')
    await db.save()
    await fresh.load()
    assert.equal(fresh.data.produk.created.name, 'Created')
    assert.equal(fresh.data.produk.created.stok.length, 0)
    assert.equal(fresh.data.produk.created.terjual, 0)
    await assert.rejects(db.renameProduct('new', 'created'))
    await assert.rejects(db.createProduct('created', { name: 'Overwrite', priceB: 1, priceS: 1, priceG: 1 }))
    await assert.rejects(db.renameProduct('new', '__proto__'))
    // A newer SQL stock edit must cause CAS rejection, never resurrect inventory.
    await client.query(`UPDATE produk SET data=jsonb_set(data,'{stok}','["fixture-b"]'),stock=1 WHERE id='new'`)
    await assert.rejects(db.renameProduct('new', 'race'), { code: '40001' })
    await db.load()
    await client.query("INSERT INTO business_orders VALUES ('new','processing')")
    await assert.rejects(db.renameProduct('new', 'blocked'), { code: '40001' })
    await client.query("DELETE FROM business_orders")
    await db.renameProduct('new', 'race')
    await db.save()
    await fresh.load()
    assert.equal(fresh.data.produk.race.stok.length, 1)
    assert.equal(fresh.data.produk.race.terjual, 18)
    assert.equal(fresh.data.produk.race.priceS, 9)
    console.log('PASS catalogue: owner authorization, rename/save/fresh reload, create/reload, collisions, CAS, inventory/metadata preservation')
  } finally { await client.query('ROLLBACK'); await client.end() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
