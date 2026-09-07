'use strict'

// Run: node lib/otp-self-test.js. No packages, credentials, database, or network.
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const crypto = require('node:crypto')
const source = join(__dirname, 'otp.js')
const loaded = { exports: {} }
runInNewContext(
  readFileSync(source, 'utf8'),
  {
    module: loaded,
    require(id) {
      if (id === 'node:crypto') return crypto
      if (id === './otp-wallet')
        return {
          ensureOtpWalletSchema() {
            throw new Error('Default ensure must not run')
          },
        }
      throw new Error(`Forbidden offline import: ${id}`)
    },
  },
  { filename: source }
)
const { createOtp, DEADLINE } = loaded.exports
const copy = (value) => JSON.parse(JSON.stringify(value))
const user = '628123456789@s.whatsapp.net'
const terminal = new Set(['cancelled', 'done', 'rejected'])

function fixture({
  balance = 100,
  price = '10',
  purchase = 'ok',
  purchaseData = {},
  echoId = true,
  purchaseDelay = 0,
  indonesiaName = 'Indonesia',
} = {}) {
  let db = { balance, orders: [] }
  let clock = 1700000000000
  let status = 'Waiting SMS'
  let sms
  let providerSequence = 0
  let failDebit = false
  let snapshot = null
  let held = false
  let clients = 0
  let ensures = 0
  let rollbacks = 0
  const calls = []
  const statements = []
  const statuses = []
  const sent = []

  async function query(sql, args = []) {
    statements.push(sql)
    const result = (rows = [], rowCount = rows.length) => ({ rows: copy(rows), rowCount })
    if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') {
      assert.equal(snapshot, null)
      snapshot = copy(db)
      return result()
    }
    if (sql === 'COMMIT') {
      assert.notEqual(snapshot, null)
      snapshot = null
      return result()
    }
    if (sql === 'ROLLBACK') {
      assert.notEqual(snapshot, null)
      db = snapshot
      snapshot = null
      rollbacks++
      return result()
    }
    if (sql.startsWith('SELECT pg_try_advisory_lock')) {
      if (held) return result([{ locked: false }])
      held = true
      return result([{ locked: true }])
    }
    if (sql.startsWith('SELECT pg_advisory_unlock')) {
      assert.equal(held, true)
      held = false
      return result()
    }
    if (sql.startsWith('SELECT * FROM otp_orders WHERE user_id=$1')) {
      const rows = db.orders.filter((o) => o.user_id === args[0])
      return result(
        sql.includes('AND id=$2')
          ? rows.filter((o) => o.id === args[1])
          : rows.sort((a, b) => b.data.created - a.data.created).slice(0, 1)
      )
    }
    if (sql.startsWith('SELECT id, user_id FROM otp_orders')) {
      return result(
        db.orders
          .filter((o) => !terminal.has(o.state) || 'notice' in o.data)
          .map(({ id, user_id }) => ({ id, user_id }))
      )
    }
    if (sql.startsWith('INSERT INTO otp_orders')) {
      assert.notEqual(snapshot, null)
      assert.equal(
        db.orders.some((o) => o.user_id === args[1] && !terminal.has(o.state)),
        false
      )
      db.orders.push({
        id: args[0],
        user_id: args[1],
        state: args[2],
        amount: args[3],
        data: JSON.parse(args[4]),
      })
      return result([], 1)
    }
    if (sql === 'UPDATE otp_orders SET state=$2, amount=$3, data=$4::jsonb WHERE id=$1') {
      const order = db.orders.find((o) => o.id === args[0])
      assert.ok(order)
      Object.assign(order, { state: args[1], amount: args[2], data: JSON.parse(args[3]) })
      return result([], 1)
    }
    if (sql === 'SELECT saldo FROM users WHERE user_id=$1') return result([{ saldo: db.balance }])
    if (sql === 'SELECT saldo FROM users WHERE user_id=$1 FOR UPDATE') {
      assert.notEqual(snapshot, null)
      assert.equal(args[0], user)
      return result([{ saldo: db.balance }])
    }
    if (sql.startsWith('SELECT COALESCE(SUM(amount),0)')) {
      return result([
        {
          amount: db.orders
            .filter((o) => o.user_id === args[0] && ['purchasing', 'uncertain'].includes(o.state))
            .reduce((sum, o) => sum + o.amount, 0),
        },
      ])
    }
    if (sql.startsWith('UPDATE users SET saldo=saldo-')) {
      assert.notEqual(snapshot, null)
      assert.equal(args[0], user)
      if (db.balance < args[1]) return result()
      db.balance -= args[1]
      if (failDebit) {
        failDebit = false
        throw new Error('Injected debit failure after mutation')
      }
      return result([{ saldo: db.balance }])
    }
    if (sql === 'UPDATE users SET saldo=saldo+$2 WHERE user_id=$1') {
      assert.notEqual(snapshot, null)
      assert.equal(args[0], user)
      db.balance += args[1]
      return result([], 1)
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  const dependencies = {
    pg: {
      query,
      async getClient() {
        clients++
        return {
          query,
          release(destroy) {
            assert.equal(Boolean(destroy), false)
            clients--
          },
        }
      },
    },
    now: () => clock,
    ensure: async () => {
      ensures++
    },
    async request(action, params) {
      calls.push({ action, params: params && copy(params) })
      assert.ok(calls.length < 100, 'Provider loop must be bounded')
      if (action === 'getCountries')
        return {
          ok: true,
          data: [
            { countryID: '6', countryName: indonesiaName },
            { countryID: '16', countryName: 'United Kingdom' },
          ],
        }
      if (action === 'getServices') {
        assert.ok(['6', '16'].includes(params.country_id), 'Use provider ID, not ISO code')
        return {
          ok: true,
          data: [
            { serviceID: 'expensive', serviceName: 'GoPay', price: '15' },
            { serviceID: 'unrelated', serviceName: 'GoPay Extra', price: '1' },
            { serviceID: 'cheap', serviceName: 'GOPAY', price: '10' },
          ],
        }
      }
      if (action === 'getOperators') return { ok: true, data: ['telkomsel', 'random'] }
      if (action === 'get_order') {
        assert.equal(snapshot, null, 'Hold must be committed before external purchase')
        const pending = db.orders.filter((o) => o.state === 'purchasing')
        assert.equal(pending.length, 1)
        assert.equal(pending[0].amount, 10)
        assert.equal(pending[0].data.debited, false)
        assert.equal(db.balance, balance, 'Reserve before purchase; do not debit yet')
        if (purchase === 'throw') throw new Error('Ambiguous provider timeout')
        if (purchase === 'malformed') return { ok: true, data: {} }
        if (purchase === 'reject') return { ok: false }
        clock += purchaseDelay
        return {
          ok: true,
          data: {
            order_id: `provider-${++providerSequence}`,
            number: '628000000000',
            price,
            ...purchaseData,
          },
        }
      }
      if (action === 'get_status') {
        assert.ok(db.orders.some((o) => o.data.providerId === params.order_id))
        return {
          ok: true,
          data: {
            ...(echoId ? { order_id: params.order_id } : {}),
            status: statuses.shift() || status,
            sms,
          },
        }
      }
      if (action === 'set_status') {
        assert.ok([2, 3, 4].includes(params.status))
        return { ok: true }
      }
      throw new Error(`Unexpected provider action: ${action}`)
    },
  }
  return {
    otp: createOtp(dependencies),
    restart() {
      this.otp = createOtp(dependencies)
    },
    get db() {
      return copy(db)
    },
    get order() {
      return copy(db.orders[db.orders.length - 1])
    },
    get rollbacks() {
      return rollbacks
    },
    calls,
    statements,
    statuses,
    sent,
    count(action) {
      return calls.filter((call) => call.action === action).length
    },
    advance(ms) {
      clock += ms
    },
    status(value, text) {
      status = value
      sms = text
    },
    failDebit() {
      failDebit = true
    },
    send: async (to, text) => {
      sent.push({ to, text })
    },
    clean() {
      assert.equal(snapshot, null)
      assert.equal(held, false)
      assert.equal(clients, 0)
      assert.ok(ensures > 0)
    },
  }
}

async function main() {
  let passed = 0
  async function test(name, work) {
    await work()
    passed++
    console.log(`ok ${passed} - ${name}`)
  }

  await test('API accepts boolean/string status and never retries ambiguous purchases', async () => {
    let body,
      calls = 0
    const module = { exports: {} }
    runInNewContext(readFileSync(source, 'utf8'), {
      module,
      URL,
      URLSearchParams,
      process: { env: { OTPCEPAT_API_KEY: 'offline-placeholder-not-a-real-key' } },
      require(id) {
        if (id === 'node:crypto') return crypto
        if (id === './otp-wallet') return {}
        if (id === 'node-fetch')
          return async (url, options) => {
            calls++
            assert.equal(url.origin + url.pathname, 'https://otpcepat.org/api/handler_api.php')
            assert.equal(url.searchParams.get('action'), 'get_order')
            assert.equal(options.redirect, 'error')
            return { ok: true, json: async () => body }
          }
        throw new Error(`Forbidden offline import: ${id}`)
      },
    })
    for (const status of [true, 'true', 'success']) {
      body = { status, data: { order_id: 'test', number: '123' } }
      assert.equal((await module.exports.api('get_order')).ok, true)
    }
    body = { status: false }
    assert.equal((await module.exports.api('get_order')).ok, false)
    for (const data of [{ order_id: 'test' }, { number: '123' }]) {
      body = { status: 'false', data }
      const before = calls
      await assert.rejects(module.exports.api('get_order'), /jangan ulangi pembelian/)
      assert.equal(calls, before + 1)
    }
  })

  await test('cheapest exact id gopay, provider country IDs, committed hold, one active', async () => {
    for (const [input, country] of [
      ['id gopay', '6'],
      ['uk gopay', '16'],
    ]) {
      const f = fixture()
      await f.otp.buy(user, input)
      assert.deepEqual(f.calls.find((c) => c.action === 'get_order').params, {
        country_id: country,
        service_id: 'cheap',
        operator_id: 'random',
      })
      assert.equal(f.db.balance, 90)
      assert.equal(f.order.state, 'waiting')
      const calls = f.calls.length
      await assert.rejects(f.otp.buy(user, input), /Masih ada order OTP aktif/)
      assert.equal(f.calls.length, calls)
      assert.equal(f.db.orders.length, 1)
      f.clean()
    }
  })

  await test('Indonesia aliases resolve Wakanda provider name without changing wallet flow', async () => {
    for (const country of ['id', 'Indo', 'indonesia']) {
      const f = fixture({ indonesiaName: 'Wakanda (Indo)' })
      await f.otp.buy(user, `${country} gopay`)
      assert.equal(f.calls.find((c) => c.action === 'get_order').params.country_id, '6')
      assert.equal(f.db.balance, 90)
      f.clean()
    }
    assert.throws(
      () =>
        loaded.exports.countryMatch(
          [
            { countryID: '6', countryName: 'Wakanda (Indo)' },
            { countryID: '7', countryName: 'Indonesia' },
          ],
          'id'
        ),
      /ambigu/
    )
  })

  await test('insufficient funds rolls back reservation without purchase', async () => {
    const f = fixture({ balance: 9 })
    await assert.rejects(f.otp.buy(user, 'id gopay'), /Saldo tidak cukup/)
    assert.deepEqual(f.db, { balance: 9, orders: [] })
    assert.equal(f.rollbacks, 1)
    assert.equal(f.count('get_order'), 0)
    f.clean()
  })

  await test('deadline starts when number arrives and reply uses user balance', async () => {
    const f = fixture({ purchaseDelay: 12000 })
    const reply = await f.otp.buy(user, 'id gopay')
    assert.equal(f.order.data.deadline - f.order.data.created, DEADLINE + 12000)
    assert.match(reply, /Sisa saldo: Rp90/)
    f.clean()
  })

  await test('ambiguous timeout or malformed success never repurchases, including restart', async () => {
    for (const purchase of ['throw', 'malformed']) {
      const f = fixture({ purchase })
      await f.otp.buy(user, 'id gopay')
      assert.equal(f.order.state, 'uncertain')
      f.restart()
      f.advance(DEADLINE * 2)
      await f.otp.operate(user, 'cek')
      await f.otp.poll(f.send)
      await assert.rejects(f.otp.buy(user, 'id gopay'), /Masih ada order OTP aktif/)
      assert.equal(f.count('get_order'), 1)
      assert.equal(f.count('get_status'), 0)
      assert.equal(f.db.balance, 100)
      assert.equal(f.order.amount, 10)
      assert.equal(f.order.state, 'uncertain')
      f.clean()
    }
  })

  await test('explicit rejection releases hold without debit', async () => {
    const f = fixture({ purchase: 'reject' })
    await f.otp.buy(user, 'id gopay')
    assert.equal(f.order.state, 'rejected')
    assert.equal(f.db.balance, 100)
    f.clean()
  })

  await test('lower settlement price survives debit rollback and restart recovery', async () => {
    const f = fixture({ price: '7.25' })
    f.failDebit()
    await assert.rejects(f.otp.buy(user, 'id gopay'), /Injected debit failure/)
    assert.equal(f.rollbacks, 1)
    assert.equal(f.db.balance, 100)
    assert.equal(f.order.state, 'purchasing')
    assert.equal(f.order.amount, 7.25)
    assert.equal(f.order.data.providerPrice, 7.25)
    assert.equal(f.order.data.providerId, 'provider-1')
    assert.equal(f.order.data.debited, false)
    f.restart()
    await f.otp.operate(user, 'cek')
    await f.otp.operate(user, 'cek')
    assert.equal(f.db.balance, 92.75)
    assert.equal(f.order.data.debited, true)
    assert.equal(f.order.state, 'waiting')
    assert.equal(f.count('get_order'), 1)
    f.clean()
  })

  await test('high and invalid prices request bounded cancellation; Waiting is not refund', async () => {
    for (const price of ['11', 'bad', null, '0', '-1', '1.234']) {
      const f = fixture({ price })
      await f.otp.buy(user, 'id gopay')
      assert.equal(f.order.amount, 10)
      assert.equal(f.order.data.priceMismatch, true)
      assert.equal(f.order.data.cancelRequested, true)
      assert.equal(f.order.state, 'waiting')
      assert.equal(f.db.balance, 90)
      assert.equal(f.count('get_status'), 2)
      assert.deepEqual(
        f.calls.filter((c) => c.action === 'set_status').map((c) => c.params.status),
        [2]
      )
      f.status('Cancel')
      await f.otp.operate(user, 'cek')
      assert.equal(f.db.balance, 100)
      assert.equal(f.order.state, 'cancelled')
      f.clean()
    }
  })

  await test('20-minute boundary cancels but refunds only confirmed Cancel, exactly once', async () => {
    const f = fixture()
    await f.otp.buy(user, 'id gopay')
    f.advance(DEADLINE - 1)
    await f.otp.operate(user, 'cek')
    assert.equal(f.count('set_status'), 0)
    f.advance(1)
    await f.otp.operate(user, 'cek')
    assert.equal(f.count('set_status'), 1)
    assert.equal(f.count('get_status'), 3)
    assert.equal(f.db.balance, 90)
    assert.equal(f.order.data.refunded, undefined)
    f.status('Cancel')
    await f.otp.operate(user, 'cek', f.send)
    await f.otp.operate(user, 'batal', f.send)
    await f.otp.poll(f.send)
    assert.equal(f.db.balance, 100)
    assert.equal(f.order.data.refunded, true)
    assert.equal(
      f.statements.filter((sql) => sql.startsWith('UPDATE users SET saldo=saldo+')).length,
      1
    )
    assert.equal(f.sent.length, 1)
    assert.match(f.sent[0].text, /Rp10 dikembalikan/)
    f.clean()
  })

  await test('received OTP cannot refund, resend keeps deadline even after restart', async () => {
    const f = fixture()
    await f.otp.buy(user, 'id gopay')
    const deadline = f.order.data.deadline
    f.status('Recieved', 'Your code is 123456')
    await f.otp.operate(user, 'cek', f.send)
    await assert.rejects(f.otp.operate(user, 'batal'), /OTP sudah diterima/)
    f.advance(60000)
    await f.otp.operate(user, 'resend')
    assert.equal(f.order.data.deadline, deadline)
    assert.deepEqual(
      f.calls.filter((c) => c.action === 'set_status').map((c) => c.params.status),
      [3]
    )
    f.restart()
    f.advance(DEADLINE)
    f.status('Waiting SMS')
    await f.otp.operate(user, 'cek')
    assert.equal(f.order.data.deadline, deadline)
    assert.equal(f.count('set_status'), 1)
    f.status('Cancel')
    await f.otp.operate(user, 'cek', f.send)
    assert.equal(f.db.balance, 90)
    assert.equal(f.order.data.refunded, undefined)
    assert.match(f.sent[1].text, /Tidak ada refund/)
    f.clean()
  })

  await test('Done with SMS sends OTP notice, not refund', async () => {
    const f = fixture()
    await f.otp.buy(user, 'id gopay')
    f.status('Done', 'OTP 654321')
    await f.otp.operate(user, 'cek', f.send)
    assert.equal(f.order.state, 'done')
    assert.equal(f.db.balance, 90)
    assert.equal(f.sent.length, 1)
    assert.equal(f.sent[0].to, user)
    assert.match(f.sent[0].text, /OTP 654321/)
    assert.match(f.sent[0].text, /Order OTP selesai/)
    assert.equal(f.order.data.notice, undefined)
    await f.otp.poll(f.send)
    assert.equal(f.sent.length, 1)
    f.clean()
  })

  await test('poll delivers old terminal notice by ID while a newer order is active', async () => {
    const f = fixture()
    await f.otp.buy(user, 'id gopay')
    const oldId = f.order.id
    f.status('Cancel')
    await assert.rejects(
      f.otp.operate(user, 'cek', async () => {
        throw new Error('Offline send failure')
      }),
      /Offline send failure/
    )
    assert.ok(f.order.data.notice)
    f.advance(1)
    await f.otp.buy(user, 'id gopay')
    const newId = f.order.id
    f.status('Waiting SMS')
    f.restart()
    await f.otp.poll(f.send)
    assert.equal(f.sent.length, 1)
    assert.match(f.sent[0].text, /Rp10 dikembalikan/)
    assert.equal(f.db.orders.find((o) => o.id === oldId).data.notice, undefined)
    assert.equal(f.db.orders.find((o) => o.id === newId).state, 'waiting')
    assert.equal(f.db.balance, 90)
    await f.otp.poll(f.send)
    assert.equal(f.sent.length, 1)
    assert.ok(f.statements.includes('SELECT * FROM otp_orders WHERE user_id=$1 AND id=$2'))
    f.clean()
  })
  await test('status need not echo ID; resend before first SMS keeps deadline', async () => {
    const f = fixture({ echoId: false })
    await f.otp.buy(user, 'id gopay')
    const deadline = f.order.data.deadline
    await f.otp.operate(user, 'resend')
    assert.equal(f.order.data.deadline, deadline)
    assert.equal(f.calls.find((c) => c.action === 'set_status').params.status, 3)
    f.status('Cancel')
    await f.otp.operate(user, 'cek')
    assert.equal(f.db.balance, 100)
    f.clean()
  })
  await test('purchase SMS evidence survives restart and prevents refund', async () => {
    const f = fixture({ purchaseData: { sms: 'OTP 123456' } })
    await f.otp.buy(user, 'id gopay')
    f.restart()
    f.status('Cancel')
    await f.otp.operate(user, 'cek')
    assert.equal(f.db.balance, 90)
    assert.equal(f.order.data.sms, 'OTP 123456')
    assert.equal(f.order.data.refunded, undefined)
    f.clean()
  })
  await test('known provider ID without number remains cancellable without debit', async () => {
    const f = fixture({ purchaseData: { number: null }, echoId: false })
    await f.otp.buy(user, 'id gopay')
    assert.equal(f.order.data.providerId, 'provider-1')
    assert.equal(f.order.data.debited, false)
    f.restart()
    f.status('Recieved', 'OTP 123456')
    await f.otp.operate(user, 'cek')
    assert.equal(f.order.state, 'uncertain', 'Undebited orders must retain their reservation')
    f.clean()
  })
  await test('known provider ID without number cancels at deadline', async () => {
    const f = fixture({ purchaseData: { number: null }, echoId: false })
    await f.otp.buy(user, 'id gopay')
    f.restart()
    f.advance(DEADLINE)
    await f.otp.poll(f.send)
    assert.equal(f.count('set_status'), 1)
    f.status('Cancel')
    await f.otp.poll(f.send)
    assert.equal(f.order.state, 'cancelled')
    assert.equal(f.db.balance, 100)
    assert.equal(f.count('get_order'), 1)
    f.clean()
  })
  console.log(`PASS: ${passed} offline OTP tests`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
