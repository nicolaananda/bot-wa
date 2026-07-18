'use strict';
const assert = {
  equal: (actual, expected) => expect(actual).toBe(expected),
  match: (actual, pattern) => expect(actual).toMatch(pattern),
  ok: (value) => expect(value).toBeTruthy(),
};
const crypto = require('crypto');
const { createWebhookHandler, persistWebhook, processNextWebhook } = require('../../options/midtrans-webhook');

function response() { return { code: 0, body: null, status(n) { this.code=n; return this; }, json(v) { this.body=v; return this; } }; }
test('handler persists before ACK and duplicate exact event is accepted', async () => {
  const key='secret', body={order_id:'O1',status_code:'200',gross_amount:'10',transaction_status:'pending'};
  body.signature_key=crypto.createHash('sha512').update('O1'+'200'+'10'+key).digest('hex');
  let duplicate=false;
  const pg={query: async sql => { assert.match(sql,/INSERT/); return {rowCount:duplicate?0:1,rows:duplicate?[]:[{id:1}]}; }};
  const handler=createWebhookHandler({pg,serverKey:key});
  let res=response(); await handler({body},res); assert.equal(res.code,200); assert.equal(res.body.duplicate,false);
  duplicate=true; res=response(); await handler({body},res); assert.equal(res.code,200); assert.equal(res.body.duplicate,true);
});
test('persistence failure returns 5xx', async () => {
  const key='s', body={order_id:'O',status_code:'500',gross_amount:'1',transaction_status:'deny'};
  body.signature_key=crypto.createHash('sha512').update('O5001s').digest('hex');
  const res=response(); await createWebhookHandler({pg:{query:async()=>{throw Error('down')}},serverKey:key})({body},res);
  assert.equal(res.code,503);
});
test('worker claims durably before external work', async () => {
  const calls=[]; const client={query:async (sql)=>{calls.push(sql); if(sql.startsWith('SELECT')) return {rows:[{id:7,order_id:'O',transaction_status:'settlement',webhook_data:{order_id:'O'}}]}; return {rows:[]};},release:()=>calls.push('release')};
  await processNextWebhook({pg:{getClient:async()=>client},emit:()=>calls.push('emit'),forward:async()=>calls.push('forward')});
  const update=calls.findIndex(x=>String(x).startsWith('UPDATE')); const commit=calls.indexOf('COMMIT');
  assert.ok(calls.find(x=>String(x).includes('FOR UPDATE SKIP LOCKED'))); assert.ok(update < commit); assert.ok(commit < calls.indexOf('forward')); assert.equal(calls.at(-1),'release');
});
test('commit failure does not dispatch external work', async () => {
  const calls=[]; const client={query:async sql=>{calls.push(sql); if(sql.startsWith('SELECT')) return {rows:[{id:8,order_id:'O',transaction_status:'settlement',webhook_data:{order_id:'O'}}]}; if(sql==='COMMIT') throw Error('commit failed'); return {rows:[]};},release:()=>calls.push('release')};
  await expect(processNextWebhook({pg:{getClient:async()=>client},emit:()=>calls.push('emit'),forward:async()=>calls.push('forward')})).rejects.toThrow(/commit failed/);
  assert.equal(calls.includes('emit'),false); assert.equal(calls.includes('forward'),false); assert.ok(calls.includes('ROLLBACK'));
});
