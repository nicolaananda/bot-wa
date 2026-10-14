// Actual caller loops; no app boot, network, database, or real timers.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.js'), 'utf8')
function loopAt(marker) {
  const start = source.indexOf('while (', source.indexOf(marker))
  // All three caller loops end at their original indentation.
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start)
  const end = source.indexOf('\n' + indent + '}', start)
  const guard = source.lastIndexOf('const isCurrentPayment =', start)
  return source.slice(guard >= source.indexOf(marker) ? guard : start, end + indent.length + 2)
}
async function run(kind, hook = {}, expired = true) {
  const map = kind === 'deposit' ? 'orderDeposit' : 'order'
  const a = { orderId: 'A', status: 'awaiting_payment' }
  const b = { orderId: 'B', status: 'awaiting_payment' }
  const db = { data: { [map]: { user: a } } }
  const calls = [], timers = []
  const current = () => db.data[map].user
  const replace = () => { db.data[map].user = b }
  const sandbox = {
    db, sender: 'user', orderId: 'A', expirationTime: 100, pollInterval: 2,
    maxInterval: 10, pollCount: 0, from: 'chat', message: { key: 'QR-A' },
    Date: class extends Date { static now() { return expired ? 101 : 1 } },
    sleep: async () => { timers.push(1); if (timers.length > 3) { delete db.data[map].user; return } if (hook.sleep) hook.sleep({ a, replace }) },
    p0Store: { cancelOrder: async id => { calls.push(['cancel', id]); hook.cancel?.({ a, replace }); return hook.cancelResult !== false } },
    pg: { query: async sql => { calls.push(['query', sql.startsWith('SELECT') ? 'select' : 'update']); hook.query?.({ a, replace }); return { rows: hook.rows || [] } } },
    nicola: { sendMessage: async (_, payload) => { calls.push([payload.delete ? 'delete' : 'notice', payload.delete]); hook.send?.({ a, replace }); if (hook.sendThrows) throw Error('transport'); } },
    reply: () => calls.push(['notice']), requestPendingOrderSave: () => calls.push(['save']),
    paymentListener: () => calls.push(['payment']), process: { removeListener() {} },
    totalAmount: 9001, createdAtTs: 0, usePg: true, USE_POLLING: false,
    console: { log() {}, error() {} },
  }
  const marker = kind === 'zoom' ? '// Polling timeout —' : kind === 'deposit' ? 'console.log(\n              `📝 [DEPOSIT]' : '// Polling untuk timeout handling (jika webhook tidak datang)\n              let pollInterval'
  await vm.runInNewContext(`(async () => { ${loopAt(marker)} })()`, sandbox)
  return { calls, current: current(), a, b, timers }
}
;(async () => {
  for (const kind of ['mid', 'zoom', 'deposit']) {
    const replaced = await run(kind, { sleep: ({ a, replace }) => { a.status = 'completed'; replace() } })
    assert.equal(replaced.current, replaced.b, `${kind}: old expiry deleted B`)
    assert.deepEqual(replaced.calls, [], `${kind}: old expiry acted on replacement`)
    assert.equal(replaced.timers.length, 1)
    const beforeSleep = await run(kind, { sleep: ({ a }) => { a.processed = true } })
    assert.deepEqual(beforeSleep.calls, [], `${kind}: processed must stop`)
    const completed = await run(kind, { sleep: ({ a }) => { a.status = 'completed' } })
    assert.deepEqual(completed.calls, [], `${kind}: completed must stop`)
    const normal = await run(kind)
    assert.equal(normal.current, undefined, `${kind}: normal expiry`)
    assert(normal.calls.some(c => c[0] === 'notice'))
    assert(normal.calls.some(c => c[0] === 'delete' && c[1] === 'QR-A'))
    const sending = await run(kind, { send: ({ replace }) => replace() })
    assert.equal(sending.current, sending.b, `${kind}: post-send replacement`)
    assert(!sending.calls.some(c => c[0] === 'notice'))
    if (kind === 'zoom') {
      const rejected = await run(kind, { send: ({ replace }) => replace(), sendThrows: true })
      assert.equal(rejected.current, rejected.b)
      assert(!rejected.calls.some(c => c[0] === 'notice'), 'rejected old QR deletion must not notify B')
    }
    if (kind !== 'deposit') {
      const cancelling = await run(kind, { cancel: ({ replace }) => replace() })
      assert.equal(cancelling.current, cancelling.b)
      assert.deepEqual(cancelling.calls, [['cancel', 'A']])
      const paid = await run(kind, { cancelResult: false, cancel: ({ a }) => { a.status = 'completed' } })
      assert.deepEqual(paid.calls, [['cancel', 'A']], `${kind}: SQL payment wins`)
    }
    if (kind !== 'zoom') {
      const polling = await run(kind, { query: ({ replace }) => replace() }, false)
      assert.equal(polling.current, polling.b)
      assert(polling.calls.some(c => c[0] === 'query'), `${kind}: preserve payment polling`)
      assert(!polling.calls.some(c => c[0] === 'cancel' || c[0] === 'payment'))
      const rows = [{ id: 1, gross_amount: 9001, created_at: new Date(0),
        order_id: kind === 'mid' ? 'MID-A' : 'DEP-A', transaction_status: 'settlement' }]
      let queries = 0
      const updating = await run(kind, { rows, query: ({ replace }) => { if (++queries === 2) replace() } }, false)
      assert.equal(updating.current, updating.b)
      assert(!updating.calls.some(c => c[0] === 'payment'), `${kind}: stale SQL result must not dispatch payment`)
      const payable = await run(kind, { rows }, false)
      assert(payable.calls.some(c => c[0] === 'payment'), `${kind}: original payment polling still dispatches`)
    }
    console.log(`PASS ${kind}: identity, completed, expiry, post-await replacement, payment race/polling`)
  }
})().catch(e => { console.error(e); process.exitCode = 1 })
