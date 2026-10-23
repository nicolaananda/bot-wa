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
    for (const table of ['business_orders','static_payment_orders','midtrans_webhooks','order_fulfillments','delivery_outbox','zoom_bookings','wallet_ledger','users','transaksi']) {
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
    // Execute both actual Zoom queue callers, without booting the bot or calling Zoom.
    const zoomStart = src.indexOf('// BRANCH: Zoom QRIS');
    const queueStart = src.indexOf('await p0Store.queueFulfillmentDeliveries(', zoomStart);
    const initialStart = src.indexOf('await p0Store.queueFulfillmentDeliveries(', queueStart + 1);
    const snapshotStart = src.lastIndexOf('          const zoomLedger =', initialStart);
    const initialBody = src.slice(snapshotStart < 0 ? src.lastIndexOf('          order.fulfillment =', initialStart) : snapshotStart,
      src.indexOf('\n          const deliveryClient', initialStart));
    const savedOrder = {tier:100};
    for (const start of [initialStart, queueStart]) {
      const queue = start === initialStart ? initialBody : src.slice(start, src.indexOf('\n              return', start));
      for (const from of ['synthetic-group@g.us', userId, '', 'other@s.whatsapp.net']) {
        let deliveries;
        await vm.runInNewContext(`(async () => { ${queue} })()`, {
          p0Store: {queueFulfillmentDeliveries: async (_id, items, database, ledger) => {
            assert(ledger, 'Zoom QRIS must forward ledger before early return');
            assert.equal(ledger.orderId, orderId);
            assert.equal(ledger.user_id, userId);
            assert.equal(ledger.totalBayar, Number(allocation.amount));
            assert.equal(ledger.price, Number(allocation.amount));
            assert.equal(ledger.profit, Number(allocation.amount));
            assert.equal(ledger.reffId, 'synthetic-ref');
            assert.equal(ledger.id, 'zoom100');
            assert.equal(ledger.akun.meetingId, 'synthetic-meeting');
            assert.equal(ledger.akun.start_time, '2030-01-01T00:00:00Z');
            assert.equal(ledger.akun.duration, 60);
            deliveries = items;
            await store.queueFulfillmentDeliveries(_id, items, database, ledger);
          }},
          db: {data:{users:{},order:{}},saveOrders:async () => {}},
          totalAmount:allocation.amount, reffId:'synthetic-ref',
          moment:require('moment-timezone'),
          meeting:{id:'synthetic-meeting',topic:'Test',join_url:'https://zoom.invalid/test',duration:90},
          zoomDetail:{startTimeIso:'2030-01-01T00:00:00Z',durationMinutes:60,timezone:'Asia/Jakarta'},
          usedHost:{label:'Synthetic host'},
          pg: db, orderId, sender: userId, from, tier: 100, infoText: 'private receipt',
          inviteLines: ['https://zoom.invalid/secret Passcode: secret Hostkey: secret'],
          order: savedOrder,
        });
        const grouped = from.endsWith('@g.us');
        assert.equal(deliveries.length, grouped ? 3 : 2, 'group checkout must queue acknowledgement');
        assert(deliveries.slice(0,2).every(d => d.destination === userId));
        if (grouped) {
          const note = deliveries[2];
          assert.equal(note.destination, from);
          assert.equal(note.dedupeKey, `${orderId}:zoom-group-note`);
          assert.deepEqual(Array.from(note.payload.mentions), [userId]);
          assert(!/https?:|secret|Passcode|Hostkey|telah menerima|sudah dikirim/i.test(note.payload.text));
          assert.match(note.payload.text, /Pembayaran QRIS berhasil/);
          await store.queueFulfillmentDeliveries(orderId, deliveries, db);
        }
      }
    }
    assert.equal((await client.query('SELECT * FROM transaksi')).rowCount,1, 'initial/replay ledger dedupe');
    console.log('PASS actual Zoom initial/replay caller forwards compatible ledger; one durable transaction');
    assert.equal((await client.query('SELECT * FROM delivery_outbox')).rowCount,3, 'initial/replay dedupe');
    let sends=0;
    for (let i=0;i<4;i++) await store.runDeliveryOutboxOnce(async () => { sends++; return {id:'synthetic-delivery'}; },db);
    assert.equal(sends,3);
    console.log('PASS initial/replay Zoom queue: private invites, group-only acknowledgement, privacy, durable dedupe and worker delivery');
    assert.equal((await client.query('SELECT status FROM business_orders WHERE order_id=$1',[orderId])).rows[0].status,'completed');
    console.log('PASS actual QRIS caller -> allocation -> settlement -> fulfillment -> SQL booking -> completion/replay; no wallet debit; ownership/amount/unpaid/duplicate guards');
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
