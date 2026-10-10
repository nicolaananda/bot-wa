// Run: /usr/bin/node tests/integration/transaction-reader-pg.js
// Only synthetic TEMP rows are written; reader queries run in READ ONLY.
require('dotenv').config({ quiet: true })
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const pg = require('../../config/postgres')
const { readTransactions } = require('../../lib/transaction-reader')
const { transactionDateWib } = require('../../lib/qris-summary')

async function main() {
  const client = await pg.getClient()
  try {
    await client.query('CREATE TEMP TABLE transaksi (id serial, meta jsonb, created_at timestamptz)')
    await client.query('CREATE TEMP TABLE users (user_id text, saldo numeric, role text, data jsonb)')
    const fixtures = [
      { date: '', reffId: 'empty' },
      { date: null, reffId: 'null' },
      { reffId: 'missing' },
      { date: '2026-10-09T18:00:00Z', reffId: 'utc-boundary' },
      { date: '2026-10-10 00:00:00', reffId: 'wib' },
      { date: '2026-10-09 23:59:59', reffId: 'previous' }
    ]
    for (const meta of fixtures) {
      await client.query('INSERT INTO pg_temp.transaksi(meta, created_at) VALUES ($1, $2)', [meta, '2026-10-09T18:00:00Z'])
    }
    await client.query("INSERT INTO pg_temp.users VALUES ('fixture', 250, 'gold', '{\"saldo\":1,\"role\":\"bronze\"}'), ('new', 30, 'silver', '{}')")
    await client.query('BEGIN READ ONLY')
    const expected = fixtures.filter(meta => transactionDateWib({ ...meta, created_at: new Date('2026-10-09T18:00:00Z') }) === '2026-10-10').map(meta => meta.reffId)
    const actual = await readTransactions(client, { date: '2026-10-10' })
    assert.deepEqual(actual.map(meta => meta.reffId), expected)
    const api = fs.readFileSync(require.resolve('../../options/dashboard-api'), 'utf8')
    const body = api.slice(api.indexOf('async function getFormattedDataAsync('), api.indexOf('// Helper untuk load map produk'))
    const stale = { data: { users: { fixture: { saldo: 1 } }, profit: { bronze: 50 }, persentase: { bronze: 5 } } }
    const load = () => { throw new Error('Full DB reload forbidden') }
    const context = { usePg: true, pg: client, getDbInstance: async () => stale, loadDatabaseAsync: load, require: () => ({ readTransactions }) }
    const result = await vm.runInNewContext(`(async()=>{${body};return getFormattedDataAsync()})()`, context)
    assert.equal(result.data.users.fixture.saldo, 250)
    assert.equal(result.data.users.fixture.role, 'gold')
    assert.equal(result.data.users.new.saldo, 30)
    assert.equal(stale.data.users.fixture.saldo, 1)
    assert.equal(result.data.profit, stale.data.profit)
    assert.equal(result.data.persentase, stale.data.persentase)
    console.log('PASS: real PostgreSQL date fallback/WIB parity and fresh dashboard users; TEMP fixtures, READ ONLY queries')
  } finally {
    await client.query('ROLLBACK')
    await client.query('DROP TABLE IF EXISTS pg_temp.transaksi, pg_temp.users')
    client.release()
    await pg.closePool()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
