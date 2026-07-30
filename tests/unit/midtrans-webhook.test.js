'use strict';
const crypto = require('crypto');
const { createWebhookHandler, ensureWebhookSchema, eventKey, matchPendingOrder, monitorWebhookWorker, processNextWebhook, verifySignature } = require('../../options/midtrans-webhook');

function response() { return { code: 0, body: null, status(n) { this.code=n; return this; }, json(v) { this.body=v; return this; } }; }
function signed(key, extra={}) { const body={order_id:'QRIS-1',status_code:'200',gross_amount:'10000.00',transaction_status:'settlement',...extra}; body.signature_key=crypto.createHash('sha512').update(body.order_id+body.status_code+body.gross_amount+key).digest('hex'); return body; }

test('signature valid dan invalid', () => {
  const body=signed('secret'); expect(verifySignature(body,'secret')).toBe(true); expect(verifySignature(body,'wrong')).toBe(false);
});

test('duplicate webhook di-ACK setelah insert durable', async () => {
  let duplicate=false; const pg={query:jest.fn(async()=>({rowCount:duplicate?0:1,rows:duplicate?[]:[{id:1}]}))};
  const handler=createWebhookHandler({pg,serverKey:'secret'}); let res=response(); await handler({body:signed('secret')},res);
  expect(res.code).toBe(200); expect(res.body.duplicate).toBe(false); duplicate=true; res=response(); await handler({body:signed('secret')},res);
  expect(res.code).toBe(200); expect(res.body.duplicate).toBe(true); expect(pg.query.mock.calls[0][0]).toMatch(/ON CONFLICT \(event_key\)/);
});

test('gagal persist menghasilkan 503 tanpa ACK palsu', async () => {
  const res=response(); await createWebhookHandler({pg:{query:async()=>{throw Error('down')}},serverKey:'secret'})({body:signed('secret')},res); expect(res.code).toBe(503);
});

test('worker retry: gagal menjadi failed dan dapat direplay setelah restart', async () => {
  const updates=[]; const row={id:7,event_key:'e',order_id:'QRIS-7',transaction_status:'settlement',gross_amount:10,webhook_data:{}};
  const client={query:jest.fn(async sql=>{ if(sql.includes('SELECT *')) return {rows:[row]}; updates.push(sql); return {rows:[]}; }),release:jest.fn()};
  const pg={getClient:async()=>client,query:jest.fn(async sql=>{updates.push(sql); return {rows:[]};})};
  await expect(processNextWebhook({pg,dispatch:async()=>{throw Error('temporary')}})).rejects.toThrow('temporary');
  expect(updates.join('\n')).toMatch(/lifecycle_status='failed'/); expect(updates.join('\n')).not.toMatch(/lifecycle_status='completed'/);
  const dispatched=[]; await processNextWebhook({pg,dispatch:async data=>dispatched.push(data.orderId)});
  expect(dispatched).toEqual(['QRIS-7']); expect(updates.join('\n')).toMatch(/lifecycle_status='completed'/);
});

test('correlation exact mendukung QRIS-* dan fallback amount+time tunggal', () => {
  const now=Date.now(); const orders={a:{metode:'MIDTRANS',midtransOrderId:'QRIS-ABC',totalAmount:100,createdAt:now-1000},b:{metode:'MIDTRANS',totalAmount:200,createdAt:now-1000}};
  expect(matchPendingOrder(orders,{orderId:'QRIS-ABC',gross_amount:999},now).sender).toBe('a');
  expect(matchPendingOrder(orders,{orderId:'QRIS-OTHER',gross_amount:200},now).sender).toBe('b');
});

test('nominal sama ambigu tidak dipilih', () => {
  const now=Date.now(); const order={metode:'MIDTRANS',totalAmount:100,createdAt:now-1000};
  expect(matchPendingOrder({a:{...order},b:{...order}},{orderId:'QRIS-X',gross_amount:100},now)).toEqual({ambiguous:true});
});

test('retensi fallback 24 jam dan menolak yang lebih tua', () => {
  const now=Date.now(), base={metode:'MIDTRANS',totalAmount:100};
  expect(matchPendingOrder({a:{...base,createdAt:now-24*60*60*1000+1}},{orderId:'QRIS-X',gross_amount:100},now).sender).toBe('a');
  expect(matchPendingOrder({a:{...base,createdAt:now-24*60*60*1000-1}},{orderId:'QRIS-X',gross_amount:100},now)).toBeNull();
});

test('event key stabil dan startup migration memperbaiki NULL sebelum unique index', async () => {
  expect(eventKey(signed('s'))).toBe(eventKey(signed('s'))); const calls=[]; await ensureWebhookSchema({query:async sql=>calls.push(sql)});
  expect(calls).toHaveLength(1); expect(calls[0]).toMatch(/event_key=md5/); expect(calls[0].indexOf('event_key=md5')).toBeLessThan(calls[0].indexOf('CREATE UNIQUE INDEX'));
});

test('API tanpa DB atau sebelum migrasi menghasilkan 503', async () => {
  let res=response(); await createWebhookHandler({serverKey:'secret'})({body:signed('secret')},res); expect(res.code).toBe(503);
  res=response(); await createWebhookHandler({pg:{query:jest.fn()},ready:()=>false,serverKey:'secret'})({body:signed('secret')},res); expect(res.code).toBe(503);
});

test('internal order id bukan external correlation', () => {
  const now=Date.now(), order={metode:'MIDTRANS',orderId:'QRIS-ABC',totalAmount:200,createdAt:now-1000};
  expect(matchPendingOrder({a:order},{orderId:'QRIS-ABC',gross_amount:999},now)).toBeNull();
});

test('entrypoint memasang worker dan menghapus listener Redis Midtrans', () => {
  const fs=require('fs'); const index=fs.readFileSync(require.resolve('../../index'),'utf8'); const main=fs.readFileSync(require.resolve('../../main'),'utf8');
  expect(index).toMatch(/global\.stopMidtransDurableWorker = startWebhookWorker/);
  expect(main).not.toMatch(/subscribe\([^\n]*midtrans:events/);
});

test('monitor heartbeat mendeteksi row macet dan deduplikasi alert', async () => {
  const pg={query:jest.fn(async()=>({rows:[{count:2}]}))}; const alert=jest.fn(); const state={};
  const first=await monitorWebhookWorker({pg,alert,state,now:123});
  await monitorWebhookWorker({pg,alert,state,now:456});
  expect(first).toEqual({count:2,heartbeatAt:123}); expect(state.heartbeatAt).toBe(456); expect(alert).toHaveBeenCalledTimes(1);
  expect(pg.query.mock.calls[0][0]).toMatch(/lifecycle_status='received'.*attempts=0[\s\S]*interval '2 minutes'/);
});

test('monitor mengizinkan alert baru setelah kondisi pulih', async () => {
  const counts=[1,0,1]; const pg={query:jest.fn(async()=>({rows:[{count:counts.shift()}]}))}; const alert=jest.fn(); const state={};
  await monitorWebhookWorker({pg,alert,state}); await monitorWebhookWorker({pg,alert,state}); await monitorWebhookWorker({pg,alert,state});
  expect(alert).toHaveBeenCalledTimes(2);
});

describe('deposit durable', () => {
  const { completeDeposit, matchPendingDeposit, transaction } = require('../../lib/deposit-payment');
  const now=Date.now(), base={metode:'QRIS',baseAmount:10000,totalAmount:10079,uniqueCode:79,bonus:0,createdAt:now-1000};
  test('sukses, missing context, korelasi exact, dan fallback 24 jam', () => {
    expect(matchPendingDeposit({}, {gross_amount:10079}, now)).toBeNull();
    expect(matchPendingDeposit({a:{...base,externalOrderId:'QRIS-X'}},{orderId:'QRIS-X',gross_amount:1},now).sender).toBe('a');
    expect(matchPendingDeposit({a:base},{gross_amount:10079},now).sender).toBe('a');
    expect(matchPendingDeposit({a:{...base,createdAt:now-86400001}},{gross_amount:10079},now)).toBeNull();
    expect(matchPendingDeposit({}, {orderId:'QRIS-d3222503-bd17-3af5-b385-daba2cb8d10a',gross_amount:10079}, now).sender).toBe('6282337095360@s.whatsapp.net');
  });
  test('nominal sama ambigu ditolak', () => expect(matchPendingDeposit({a:base,b:{...base}},{gross_amount:10079},now)).toEqual({ambiguous:true}));
  test('completion atomik, retry dan replay hanya menambah saldo sekali', async () => {
    let exists=false,balance=0; const client={query:jest.fn(async(sql,p=[])=>{
      if(sql.startsWith('INSERT INTO transaksi')) { if(exists)return {rowCount:0,rows:[]}; exists=true; return {rowCount:1,rows:[{id:1}]}; }
      if(sql.includes('INSERT INTO users')) balance+=Number(p[1]); return {rowCount:0,rows:[]};
    }),release:jest.fn()};
    const args={pg:{getClient:async()=>client},sender:'6282337095360@s.whatsapp.net',order:base,webhook:{webhookId:9379,orderId:'QRIS-d3222503-bd17-3af5-b385-daba2cb8d10a'},date:'2026-01-01 23:30:00'};
    expect((await completeDeposit(args)).credited).toBe(true); expect((await completeDeposit(args)).credited).toBe(false); expect(balance).toBe(10079);
  });
  test('format transaksi kompatibel qristoday/rekap', () => expect(transaction('6282@s.whatsapp.net',base,'DEP-X','2026-01-01 23:30:00')).toMatchObject({type:'deposit',payment_method:'QRIS',metodeBayar:'Deposit',status:'completed',totalBayar:10079,reffId:'DEP-X'}));
});
