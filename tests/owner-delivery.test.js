const assert = require('node:assert/strict');
const { resolveDelivery } = require('../lib/owner-delivery');
(async () => {
 const row={reffId:'REF',orderId:'ORDER',user:'628000000001',id:'PRODUCT'};
 const pg={query:async()=>({rows:[]})};const missing=async()=>({success:false});
 const db={order:{'628000000001@s.whatsapp.net':{orderId:'ORDER',reffId:'REF',id:'PRODUCT',fulfillmentReservation:['fixture|password']}}};
 let x=await resolveDelivery(row,db,pg,missing);
 assert.equal(x.content,'fixture|password');assert.equal(x.source,'order.fulfillmentReservation');assert.equal(x.status,'unknown');
 x=await resolveDelivery(row,{order:{'628000000002@s.whatsapp.net':db.order['628000000001@s.whatsapp.net']}},pg,missing);assert.equal(x.content,null);
 x=await resolveDelivery({...row,akun:[]},db,pg,missing);assert.equal(x.content,'fixture|password');
 x=await resolveDelivery({meta:{...row,akun:{email:'fixture@example.test'}}},{},pg,missing);assert.match(x.content,/fixture@example.test/);
 x=await resolveDelivery(row,{},pg,async()=>({success:true,content:'legacy receipt fixture',storage:'local'}));assert.equal(x.source,'receipt.local');assert.equal(x.content,'legacy receipt fixture');assert.equal(x.status,'unknown');
 x=await resolveDelivery(row,{},pg,async()=>{throw Error('storage down')});assert.equal(x.content,null);assert.equal(x.lookupFailed,true);
 let called=false;x=await resolveDelivery({...row,reffId:'../escape'}, {},pg,async()=>{called=true});assert.equal(called,false);
 const evidence={query:async(sql,args)=>{assert.ok(sql.includes('o.user_id=$2'));assert.equal(args[1],'628000000001@s.whatsapp.net');return {rows:[{items:['reserved-fixture'],status:'pending',sent_at:null}]}}};
 x=await resolveDelivery(row,{},evidence,missing);assert.equal(x.source,'stock_reservations');assert.equal(x.status,'pending');
 console.log('owner delivery persisted shapes, identity, fallback, failures: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
