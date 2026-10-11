// Run: node -r dotenv/config tests/zoom-qris-claim-check.js (isolated TEMP tables; rollback).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pool } = require('../config/postgres');
const store = require('../lib/p0-store');
(async () => {
  const client = await pool.connect();
  let depth = 0;
  const db = { query: (...args) => client.query(...args), connect: async () => ({
    query: (sql, args) => client.query(sql === 'BEGIN' ? `SAVEPOINT nested_${++depth}` :
      sql === 'COMMIT' ? `RELEASE SAVEPOINT nested_${depth--}` :
      sql === 'ROLLBACK' ? `ROLLBACK TO SAVEPOINT nested_${depth--}` : sql, args), release() {},
  }) };
  try {
    await client.query('BEGIN');
    for (const table of ['business_orders','static_payment_orders','midtrans_webhooks','order_fulfillments','delivery_outbox','zoom_bookings','wallet_ledger','users']) {
      await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
      const cols = (await client.query(`SELECT column_name,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows;
      for (const col of cols.filter(c => c.column_default?.includes('nextval'))) {
        await client.query(`CREATE TEMP SEQUENCE ${table}_test_seq`);
        await client.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN ${col.column_name} SET DEFAULT nextval('pg_temp.${table}_test_seq')`);
      }
    }
    await client.query("SET LOCAL search_path=pg_temp,public");
    const src = fs.readFileSync(require.resolve('../index.js'), 'utf8');
    const start = src.indexOf('claimCreate: p0Store', src.indexOf('// BRANCH: Zoom QRIS'));
    const callback = src.slice(start + 'claimCreate: '.length, src.indexOf(',\n              finishCreate:', start));
    const orderId = 'synthetic-zoom-qris';
    const userId = 'synthetic-user';
    await client.query('INSERT INTO users(user_id,saldo) VALUES($1,0)', [userId]);
    const allocation = await store.allocateStaticPayment({ orderId, userId, baseAmount: 2000 }, db);
    // Real settlement matcher requires a durable settlement event.
    await client.query("INSERT INTO midtrans_webhooks(event_key,order_id,transaction_status,gross_amount,webhook_data,created_at) VALUES('synthetic-event','synthetic-provider','settlement',$1,'{}',now()+interval '1 second')", [allocation.amount]);
    assert(await store.claimStaticSettlement({eventKey:'synthetic-event',amount:Number(allocation.amount),authenticated:true}, db));
    assert(await store.claimFulfillment(orderId, db));
    assert.equal(await store.claimFulfillment(orderId, db), null);
    const claim = vm.runInNewContext(`(${callback})`, {p0Store:store, pg:db, orderId, sender:userId,
      totalAmount:allocation.amount, zoomDetail:{ startAtUtcMs:Date.parse('2030-01-01T00:00:00Z'), durationMinutes:60 }, Date, Number});
    const host = {accountId:'synthetic-host',concurrentMeetings:1};
    const result = await claim({host});
    assert.equal(result.status, 'creating');
    assert(result.claim_token);
    assert.equal(await claim({host}), null, 'in-flight claim must not grant provider creation twice');
    const input = {orderId,userId,hostId:host.accountId,startsAt:new Date('2030-01-01T00:00:00Z'),endsAt:new Date('2030-01-01T01:00:00Z'),capacity:1,amount:Number(allocation.amount)};
    assert.equal(await store.claimPaidZoomCreate({...input,userId:'wrong'},db), null);
    assert.equal(await store.claimPaidZoomCreate({...input,amount:999},db), null);
    await store.finishZoomCreate(orderId,result.claim_token,{id:'synthetic-meeting'},db);
    assert.equal((await claim({host})).meeting.id,'synthetic-meeting');
    assert.equal(Number((await client.query('SELECT saldo FROM users WHERE user_id=$1',[userId])).rows[0].saldo),0);
    assert.equal((await client.query('SELECT * FROM wallet_ledger')).rowCount,0);
    await client.query("INSERT INTO business_orders(order_id,kind,user_id,amount,status) VALUES('unpaid','qris',$1,2001,'awaiting_payment')",[userId]);
    assert.equal(await store.claimPaidZoomCreate({...input,orderId:'unpaid'},db),null);
    await client.query("INSERT INTO business_orders(order_id,kind,user_id,amount,status) VALUES('full-host','qris',$1,2001,'processing')",[userId]);
    await assert.rejects(store.claimPaidZoomCreate({...input,orderId:'full-host'},db), /capacity exceeded/);
    await store.queueFulfillmentDeliveries(orderId,[{orderId,destination:userId,payload:{text:'synthetic invite'},dedupeKey:orderId+':invite'}],db);
    let sends=0;
    await store.runDeliveryOutboxOnce(async () => { sends++; return {id:'synthetic-delivery'}; },db);
    await store.runDeliveryOutboxOnce(async () => { sends++; },db);
    assert.equal(sends,1);
    assert.equal((await client.query('SELECT status FROM business_orders WHERE order_id=$1',[orderId])).rows[0].status,'completed');
    console.log('PASS actual QRIS caller -> allocation -> settlement -> fulfillment -> SQL booking -> completion/replay; no wallet debit; ownership/amount/unpaid/duplicate guards');
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
