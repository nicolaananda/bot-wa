'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const test = global.test || require('node:test')
const moment = require('moment-timezone')
const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8')
const command = source.slice(source.indexOf("      case 'riwayat':"), source.indexOf("      case 'rekap':"))

async function run(q, rows, isOwner = true) {
  const messages = [], queries = []
  const context = {
    q, isOwner, moment, prefix: '.', mess: { owner: 'owner only' }, m: {}, from: 'test',
    db: { data: { transaksi: [] } },
    pg: { query: async (sql, params) => { queries.push({ sql, params }); return { rows } } },
    reply: (text) => messages.push(text), toRupiah: String,
    nicola: { sendMessage: async (_, message) => { messages.push(message.text); return { key: {} } } },
    scheduleAutoDelete() {}
  }
  await vm.runInNewContext(`(async () => { switch ('riwayat') { ${command} } })()`, context)
  return { messages, queries }
}

test('riwayat reads durable sales despite empty RAM and preserves product filtering', async () => {
  const rows = [
    { meta: { id: 'net1u', name: 'Durable sale', date: '2026-10-10 00:01:00', totalBayar: 16001, metodeBayar: 'QRIS' } },
    { meta: { id: 'other', name: 'Other product' } },
    { meta: { id: 'net1u', name: 'Deposit row', type: 'deposit' } },
    { meta: { id: 'net1u', name: 'Deposit method', metodeBayar: 'Deposit' } },
    { meta: { id: 'net1u', name: 'Reconciliation', type: 'wallet_reconciliation' } }
  ]
  const result = await run('net1u 2026-10-10', rows)
  assert.match(result.messages[0], /Durable sale/)
  assert.match(result.messages[0], /1 transaksi/)
  assert.doesNotMatch(result.messages[0], /Other product|Deposit row|Deposit method|Reconciliation/)
  assert.equal(result.queries.length, 1)
  assert.equal(JSON.stringify(result.queries[0].params), JSON.stringify(['2026-10-10', '2026-10-10']))
  assert.match(result.queries[0].sql, /created_at AT TIME ZONE 'Asia\/Jakarta'/)
  assert.match(result.queries[0].sql, /LEFT\(meta->>'date', 10\)::date/)
  assert.match(result.queries[0].sql, /BETWEEN \$1::date AND \$2::date/)
  const all = await run('all 7d', rows)
  assert.match(all.messages[0], /2 transaksi/)
  assert.equal(all.queries[0].params[0], moment.tz('Asia/Jakarta').subtract(6, 'days').format('YYYY-MM-DD'))
})

test('riwayat keeps authorization, empty results and invalid input behavior', async () => {
  assert.deepEqual((await run('all', [], false)).messages, ['owner only'])
  assert.match((await run('all', [])).messages[0], /Belum ada pembeli/)
  const invalid = await run('all invalid', [])
  assert.match(invalid.messages[0], /Format tanggal tidak valid/)
  assert.equal(invalid.queries.length, 0)
})
