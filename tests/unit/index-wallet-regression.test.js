// Run: node tests/unit/index-wallet-regression.test.js
// Execute extracted branches only: never load the bot, credentials, or network clients.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8')
function extract(start, end) {
  const from = source.indexOf(start)
  assert.notEqual(from, -1, `Missing start: ${start}`)
  const to = source.indexOf(end, from)
  assert.notEqual(to, -1, `Missing end: ${end}`)
  return source.slice(from, to)
}
function run(body, context) {
  return vm.runInNewContext(`(async () => { ${body}\n })()`, context, { timeout: 1000 })
}

async function main() {
  const providerBalance = extract("      case 'getbalance':", "      case 'otp':")
  for (const owner of [false, true]) {
    for (const group of [false, true]) {
      for (const privateChat of [false, true]) {
        let calls = 0
        const response = await run(`switch ('getbalance') { ${providerBalance} }`, {
          isOwner: owner,
          isGroup: group,
          sender: '628123@s.whatsapp.net',
          from: privateChat ? '628123@s.whatsapp.net' : 'other',
          reply: (text) => text,
          require: () => ({
            getBalance: async () => {
              calls++
              return 'provider balance'
            },
          }),
        })
        assert.equal(calls, owner && !group && privateChat ? 1 : 0)
        if (calls) assert.equal(response, 'provider balance')
      }
    }
  }
  const { getBalance } = require('../../lib/otp')
  for (const saldo of ['0', 0, '12345.50']) {
    const response = await getBalance(async (action) => {
      assert.equal(action, 'getBalance')
      return { ok: true, data: { saldo, email: 'private@example.test' } }
    })
    assert.match(response, /Saldo API OTPCepat: Rp/)
    assert.doesNotMatch(response, /private|email/)
  }
  for (const saldo of [null, -1, {}, 'NaN', '1.234']) {
    assert.match(
      await getBalance(async () => ({ ok: true, data: { saldo } })),
      /belum dapat dibaca/
    )
  }
  assert.match(await getBalance(async () => ({ ok: false })), /belum dapat dibaca/)
  const failure = await getBalance(async () => {
    throw Error('secret-api-key')
  })
  assert.match(failure, /Gagal cek saldo/)
  assert.doesNotMatch(failure, /secret-api-key/)

  const balances = extract("      case 'ceksaldo':", "      case 'addsaldo':")
  assert.doesNotMatch(balances, /getCachedSaldo|setCachedSaldo|db\.save\(|targetUser/)
  for (const quoted of [false, true]) {
    for (const owner of [false, true]) {
      for (const valid of [false, true]) {
        const calls = []
        const users = Object.freeze({})
        const context = {
          args: quoted ? [] : [valid ? '+628123456789' : 'invalid'],
          m: quoted
            ? { quoted: { sender: valid ? '628123456789@s.whatsapp.net' : 'bad@lid' } }
            : {},
          isOwner: owner,
          db: { data: { users } },
          dbHelper: {
            getUserSaldoAsync: async (id) => {
              calls.push(id)
              return 12345
            },
          },
          reply: (text) => text,
          toRupiah: String,
        }
        const result = await run(`switch ('ceksaldo') { ${balances} }`, context)
        assert.equal(calls.length, owner && valid ? 1 : 0)
        if (owner && valid) {
          assert.equal(calls[0], quoted ? '628123456789@s.whatsapp.net' : '628123456789')
          assert.match(result, /12345/)
        }
        assert.deepEqual(users, {})
      }
    }
  }

  const zoomSaldo = extract('// ====== SALDO PATH (existing)', '// ====== MODE ENV SINGLE-ACCOUNT')
  assert.match(zoomSaldo, /const saldoUser = await dbHelper\.getUserSaldoAsync\(sender\)/)
  assert.doesNotMatch(zoomSaldo, /\.saldo\s*=|setCachedSaldo/)
  const saldoBuy = extract('              let atomicPurchase = null', '              // Keep evidence outside expiring orders')
  let actualCallerInput
  await run(saldoBuy, {
    p0Store: { debitSaldoReserveStock: async (input, database) => { actualCallerInput = input; assert.equal(database, 'isolated-pg'); return { reserved_items: ['item'] } } },
    orderId: 'ORDER-1', sender: 'user-1', data: ['product-1'], jumlah: 2, totalHarga: 5000, pg: 'isolated-pg',
  })
  assert.equal(JSON.stringify(actualCallerInput), JSON.stringify({ orderId: 'ORDER-1', userId: 'user-1', productId: 'product-1', quantity: 2, amount: 5000 }))
  for (const zoom of [false, true]) {
    const body = extract(
      zoom ? 'const debitRef = `ZOOM-' : 'const debitRef = `${reffId}-DEBIT`',
      zoom ? 'saldoSesudah = await' : 'await sleep(1000)'
    )
    for (const outcome of [
      'confirmed',
      'false',
      'throw',
      'persist-fail',
      'status-fail',
      'missing-row',
    ]) {
      const events = []
      const durable = new Map()
      const context = {
        sender: '628123456789@s.whatsapp.net',
        meeting: { id: 42 },
        host: { accountId: 'host', label: 'host' },
        tier: 100,
        priceInfo: { price: 100 },
        totalHarga: 100,
        reffId: 'REF',
        data: ['product'],
        jumlah: 1,
        targetNumber: null,
        moment: { tz: () => ({ format: () => 'date' }) },
        requestPendingOrderSave() {},
        reply: (text) => text,
        db: {
          data: { order: {} },
          appendTransaction: async (row) => {
            events.push('persist')
            if (outcome === 'persist-fail') throw Error('persist')
            durable.set(row.reffId, structuredClone(row))
            return row
          },
        },
        dbHelper: {
          updateUserSaldo: async (id, amount, operation) => {
            events.push('debit')
            assert.equal(id, context.sender)
            assert.equal(amount, 100)
            assert.equal(operation, 'subtract')
            if (outcome === 'throw') throw Error('debit')
            return outcome !== 'false'
          },
        },
        pg: {
          query: async (sql, [ref, status]) => {
            events.push('status')
            assert.match(sql, /UPDATE transaksi SET status=\$2, meta=jsonb_set/)
            assert.match(sql, /WHERE ref_id=\$1/)
            if (outcome === 'status-fail') throw Error('status')
            if (outcome === 'missing-row') return { rowCount: 0 }
            durable.get(ref).status = status
            return { rowCount: 1 }
          },
        },
      }
      let result
      try {
        result = await run(`${body}\nreturn 'deliver'`, context)
      } catch (error) {
        assert.notEqual(outcome, 'confirmed', error.message)
        result = 'blocked'
      }
      assert.equal(
        result === 'deliver',
        zoom
          ? !['persist-fail', 'status-fail', 'missing-row'].includes(outcome)
          : outcome === 'confirmed',
        `${zoom ? 'Zoom' : 'Buy'}: ${outcome}`
      )
      if (outcome === 'persist-fail') {
        assert.deepEqual(events, ['persist'])
      } else {
        assert.deepEqual(events.slice(0, 2), zoom ? ['persist', 'status'] : ['persist', 'debit'])
        const record = [...durable.values()][0]
        assert.equal(record.debitAmount, 100)
        assert.equal(
          record.status,
          zoom
            ? outcome === 'status-fail' || outcome === 'missing-row' ? 'debit_pending' : 'debit_confirmed'
            : outcome === 'confirmed' ? 'debit_confirmed' : outcome === 'false' ? 'debit_unconfirmed' : 'debit_pending'
        )
        assert.ok(record.purchaseRef)
        if (zoom) assert.equal(record.meetingId, '42')
        // Pending-order cleanup cannot remove the separately persisted evidence.
        delete context.db.data.order[context.sender]
        assert.equal(durable.size, 1)
      }
    }
  }
  console.log('index wallet offline regression checks passed')
}

if (typeof test === 'function') {
  test('wallet command offline regressions', main)
} else {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
