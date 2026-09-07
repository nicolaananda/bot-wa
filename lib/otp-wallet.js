// No config import until called: the offline self-check never loads credentials.
let schemaPromise

async function ensureOtpWalletSchema(required = true) {
  if (!schemaPromise) {
    schemaPromise = require('../config/postgres')
      .query(
        `SELECT
      to_regclass('otp_orders') IS NOT NULL AS installed,
      to_regclass('otp_orders') IS NOT NULL AND
      to_regclass('uniq_otp_orders_active_user') IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgrelid='users'::regclass
          AND tgname='users_otp_wallet_debit' AND tgenabled IN ('O','A')
      ) AS ready`
      )
      .then(({ rows }) => {
        if (rows[0]?.installed && !rows[0]?.ready)
          throw new Error('OTP wallet schema incomplete; inspect OTP installation before spending')
        return Boolean(rows[0]?.ready)
      })
      .catch((error) => {
        schemaPromise = null
        throw error
      })
  }
  const ready = await schemaPromise
  if (!ready) {
    schemaPromise = null
    if (required) throw new Error('OTP wallet schema missing; run otp-setup.sh before using OTP')
  }
  return ready
}

async function walletQuery(text, params) {
  await ensureOtpWalletSchema(false)
  const client = await require('../config/postgres').getClient()
  try {
    // config/postgres.query retries ambiguous failures; money writes must not.
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

module.exports = { walletQuery, ensureOtpWalletSchema }

// Run: node lib/otp-wallet.js --self-test (mocked SQL, no dotenv or network).
if (require.main === module && process.argv.includes('--self-test')) {
  const assert = require('node:assert/strict')
  const fs = require('node:fs')
  const path = require('node:path')
  const vm = require('node:vm')
  ;(async () => {
    let normalWrites = 0
    const optional = {
      module: { exports: {} },
      require: () => ({
        query: async () => ({ rows: [{ installed: false, ready: false }] }),
        getClient: async () => ({
          query: async () => {
            normalWrites++
            return { rowCount: 1 }
          },
          release() {},
        }),
      }),
    }
    vm.runInNewContext(fs.readFileSync(__filename, 'utf8'), optional)
    assert.equal(await optional.module.exports.ensureOtpWalletSchema(false), false)
    assert.equal((await optional.module.exports.walletQuery('UPDATE users')).rowCount, 1)
    assert.equal(normalWrites, 1, 'regular wallet writes work without OTP tables or API key')
    await assert.rejects(optional.module.exports.ensureOtpWalletSchema(), /schema missing/)
    let balance = 70 // Snapshot still says 100 after a SQL debit of 30.
    let fail = false
    let release
    let calls = 0
    const mockWallet = {
      ensureOtpWalletSchema: async () => {},
      walletQuery: async (sql, params) => {
        calls++
        assert.match(sql, /saldo=users.saldo \+/)
        if (fail) throw Object.assign(new Error('connection lost'), { code: 'ECONNRESET' })
        balance += params[4]
        if (release)
          await new Promise((resolve) => {
            release = resolve
          })
        return { rows: [], rowCount: 1 }
      },
    }
    const context = {
      module: { exports: {} },
      console,
      process: { env: { USE_PG: 'true' } },
      require: (id) => {
        if (id === 'dotenv') return { config() {} }
        if (id === '../config/postgres') return { query: async () => ({ rows: [] }) }
        if (id === '../lib/otp-wallet') return mockWallet
        throw new Error(`Unexpected import: ${id}`)
      },
    }
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../function/database.js'), 'utf8'),
      context
    )
    const db = new context.module.exports()
    db.data = { users: { '1@s.whatsapp.net': { saldo: 100, role: 'bronze' } } }
    db._resetPersistedState()
    db.data.users['1@s.whatsapp.net'].role = 'silver'
    assert.equal(await db.save(), true)
    assert.equal(balance, 70, 'metadata save must not restore a SQL debit')
    db.data.users['1@s.whatsapp.net'].saldo += 20
    release = true
    const pending = db.save()
    db.data.users['1@s.whatsapp.net'].saldo -= 5
    release()
    release = null
    await pending
    await db.save()
    assert.equal(balance, 85, 'legacy mutations during save must persist exactly once')
    const previousCalls = calls
    await db.save()
    assert.equal(calls, previousCalls)
    fail = true
    db.data.users['1@s.whatsapp.net'].saldo++
    await assert.rejects(db.save(), /connection lost/)
    await assert.rejects(db.save(), /outcome unknown/)
    assert.equal(calls, previousCalls + 1, 'ambiguous writes must not retry')
    let result = { rows: [], rowCount: 0 }
    const helperContext = {
      module: { exports: {} },
      console: { error() {} },
      global: { db: { data: { users: { '1@s.whatsapp.net': { saldo: 100 } } } } },
      process: { env: { USE_PG: 'true' } },
      require: (id) => {
        if (id === 'dotenv') return { config() {} }
        if (id === 'crypto') return require('node:crypto')
        if (id === '../config/postgres')
          return {
            query: async (sql) => {
              assert.match(sql, /ORDER BY \(user_id=\$1\) DESC LIMIT 1/)
              assert.match(sql, /state IN \('purchasing','uncertain'\)/)
              return result
            },
          }
        if (id === '../lib/otp-wallet')
          return {
            ensureOtpWalletSchema: async () => true,
            walletQuery: async (sql) => {
              assert.match(sql, /AND saldo >= \$2::numeric/)
              return result
            },
          }
        throw new Error(`Unexpected import: ${id}`)
      },
    }
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../options/db-helper.js'), 'utf8'),
      helperContext
    )
    const helper = helperContext.module.exports
    assert.equal(await helper.updateUserSaldo('1', -1, 'subtract'), false)
    assert.equal(await helper.updateUserSaldo('1', 10, 'subtract'), false)
    result = { rows: [{ available: '40' }], rowCount: 1 }
    assert.equal(await helper.updateUserSaldo('1', 10, 'subtract'), true)
    assert.equal(await helper.getUserSaldoAsync('1'), 40)
    assert.equal(helperContext.global.db.data.users['1@s.whatsapp.net'].saldo, 100)
    console.log('OTP wallet offline checks passed')
  })().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
