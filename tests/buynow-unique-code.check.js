// Run with node tests/buynow-unique-code.check.js; no app boot or database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../lib/p0-store.js'), 'utf8');
const input = { orderId: 'fixture', userId: 'user', baseAmount: 1000, minCode: 77, maxCode: 150, randomize: true };
async function run(options = {}, start = 77, occupied = () => false) {
  const calls = [], attempts = [], randomCalls = [];
  const client = {
    release() { calls.push('release'); },
    async query(sql, values) {
      calls.push(sql);
      if (sql.startsWith('SELECT 1 FROM business_orders')) {
        assert(sql.includes('UNION ALL SELECT 1 FROM static_payment_orders'));
        assert(sql.includes("'pending','processing','delivery_pending'"));
        attempts.push(values[0]);
        return { rows: occupied(values[0]) ? [{}] : [] };
      }
      if (sql.startsWith('INSERT INTO static_payment_orders')) return { rows: [{ amount: values[2], marker: values[3] }] };
      assert(/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock|UPDATE static_payment_orders SET status='expired'|INSERT INTO business_orders)/.test(sql), sql);
      return { rows: [] };
    }
  };
  const sandbox = { module: { exports: {} }, require(name) {
    if (name === '../config/postgres') return { pool: { connect() { throw Error('default DB forbidden'); } } };
    assert.equal(name, 'crypto');
    return { randomUUID: () => 'marker', randomInt(min, max) { randomCalls.push([min, max]); assert(start >= min && start < max); return start; } };
  } };
  vm.runInNewContext(source, sandbox);
  let result, error;
  try { result = await sandbox.module.exports.allocateStaticPayment({ ...input, ...options }, { connect: async () => client }); }
  catch (e) { error = e; }
  return { result, error, calls, attempts, randomCalls };
}
(async () => {
  for (const code of [77, 112, 150]) {
    const r = await run({}, code);
    assert.ifError(r.error);
    assert.equal(r.result.amount, 1000 + code);
    assert.deepEqual(r.randomCalls, [[77, 151]]);
    assert.equal(r.calls[0], 'BEGIN');
    assert(r.calls[1].includes('pg_advisory_xact_lock'));
    assert.deepEqual(r.calls.slice(-2), ['COMMIT', 'release']);
  }
  const collision = await run({}, 150, amount => amount === 1150);
  assert.ifError(collision.error);
  assert.deepEqual(collision.attempts, [1150, 1077]);
  const full = await run({}, 112, () => true);
  assert.match(full.error.message, /No collision-free/);
  assert.equal(full.attempts.length, 74);
  assert.equal(new Set(full.attempts).size, 74);
  assert(full.attempts.every(amount => amount >= 1077 && amount <= 1150));
  assert(full.calls.includes('ROLLBACK'));
  const legacy = await run({ minCode: undefined, maxCode: undefined, randomize: false });
  assert.ifError(legacy.error);
  assert.equal(legacy.result.amount, 1001);
  for (const options of [{ minCode: 0 }, { minCode: 151 }, { maxCode: 1.5 }]) {
    const invalid = await run(options);
    assert.match(invalid.error.message, /invalid unique code range/);
    assert.equal(invalid.calls.length, 0);
  }
  const checkout = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  assert.match(checkout, /baseAmount: totalHarga, validMinutes: 30,\s+minCode: 77, maxCode: 150, randomize: true/);
  console.log('PASS buynow random 77–150, boundaries, collision wrap, exhaustion, validation, legacy defaults, caller');
})().catch(error => { console.error(error); process.exitCode = 1; });
