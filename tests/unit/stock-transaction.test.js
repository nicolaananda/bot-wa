'use strict';
const assert = {
 equal: (actual, expected) => expect(actual).toBe(expected),
 deepEqual: (actual, expected) => expect(actual).toEqual(expected),
 rejects: (fn, pattern) => expect(fn()).rejects.toThrow(pattern),
 match: (actual, pattern) => expect(actual).toMatch(pattern),
};
const fs=require('node:fs'); const path=require('node:path');
const { consumeStockPg, mutateProductPg, buyWithSaldoPg }=require('../../options/stock-helper');
function mockPg(product={stok:['A','B','C','D'],terjual:0},saldo=100){
 const state={product:structuredClone(product),saldo}; let snapshot; const calls=[];
 const client={query:async(sql,args)=>{calls.push(sql); if(sql==='BEGIN') snapshot=structuredClone(state); if(sql==='ROLLBACK') Object.assign(state,snapshot); if(sql.startsWith('SELECT saldo')) return {rows:[{saldo:state.saldo,data:{}}]}; if(sql.startsWith('SELECT data')) return {rows:[{data:structuredClone(state.product)}]}; if(sql.startsWith('UPDATE users')) state.saldo=args[1]; if(sql.startsWith('UPDATE produk')) state.product=JSON.parse(args[1]); return {rows:[]};},release:()=>calls.push('release')};
 return {pg:{getClient:async()=>client},client,state,calls};
}
test('stock consumption uses one client transaction and clones row data',async()=>{
 const original={stok:['a','b'],terjual:1}; const calls=[];
 const client={query:async(sql,args)=>{calls.push([sql,args]); if(sql.startsWith('SELECT')) return {rows:[{data:original}]}; return {rows:[]};},release:()=>calls.push(['release'])};
 const result=await consumeStockPg({getClient:async()=>client},'P1',1);
 assert.deepEqual(result.items,['a']); assert.deepEqual(original,{stok:['a','b'],terjual:1});
 assert.deepEqual(calls.map(x=>x[0]),['BEGIN','SELECT data FROM produk WHERE id=$1 FOR UPDATE','UPDATE produk SET data=$2, stock=$3 WHERE id=$1','COMMIT','release']);
});
test('stock transaction rolls back and releases on shortage',async()=>{
 const calls=[]; const client={query:async sql=>{calls.push(sql); if(sql.startsWith('SELECT')) return {rows:[{data:{stok:[]}}]}; return {rows:[]};},release:()=>calls.push('release')};
 await assert.rejects(()=>consumeStockPg({getClient:async()=>client},'P1',1),/Insufficient/);
 assert.deepEqual(calls.slice(-2),['ROLLBACK','release']);
});
test('saldo and stock rollback atomically when product update fails',async()=>{
 const {pg,client,state}=mockPg({stok:['A'],terjual:0}); const baseQuery=client.query; let failed=false;
 client.query=async(sql,args)=>{if(sql.startsWith('UPDATE produk')&&!failed){failed=true; throw new Error('product update failed');} return baseQuery(sql,args);};
 await assert.rejects(()=>buyWithSaldoPg(pg,'user@s.whatsapp.net','Exact-ID',1,50),/product update failed/);
 assert.equal(state.saldo,100); assert.deepEqual(state.product.stok,['A']);
});
test('indexed pick [4,2,2] returns B,D and leaves A,C',async()=>{
 const {pg}=mockPg(); let picked;
 const result=await mutateProductPg(pg,'Exact-ID',product=>{const indexes=[...new Set([4,2,2])].sort((a,b)=>b-a); picked=indexes.map(number=>({number,item:product.stok[number-1]})).sort((a,b)=>a.number-b.number); for(const number of indexes) product.stok.splice(number-1,1); return product;});
 assert.deepEqual(picked.map(x=>x.item),['B','D']); assert.deepEqual(result.product.stok,['A','C']);
});
test('50 parallel consumers receive exactly 50 unique items',async()=>{
 const state={product:{stok:Array.from({length:50},(_,i)=>`item-${i+1}`),terjual:0}}; let gate=Promise.resolve();
 const pg={getClient:async()=>{let unlock; return {query:async(sql,args)=>{if(sql==='BEGIN'){const previous=gate; gate=new Promise(resolve=>{unlock=resolve}); await previous;} if(sql.startsWith('SELECT')) return {rows:[{data:structuredClone(state.product)}]}; if(sql.startsWith('UPDATE')) state.product=JSON.parse(args[1]); if(sql==='COMMIT'||sql==='ROLLBACK') unlock(); return {rows:[]};},release:()=>{}};}};
 const results=await Promise.all(Array.from({length:50},()=>consumeStockPg(pg,'Exact-ID',1)));
 assert.equal(new Set(results.flatMap(result=>result.items)).size,50); assert.equal(state.product.stok.length,0); assert.equal(state.product.terjual,50);
});
test('canonical product result prevents stale-memory save reintroducing consumed stock',async()=>{
 const {pg,state}=mockPg(); const stale={stok:['A','B','C','D']}; const result=await consumeStockPg(pg,'Exact-ID',2); const memory=result.product; stale.stok.push('E');
 assert.deepEqual(memory.stok,['C','D']); assert.deepEqual(state.product.stok,['C','D']);
});
test('QRIS, saldo, and dashboard wire row-locked helpers',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../index.js'),'utf8'); const dashboard=fs.readFileSync(path.join(__dirname,'../../options/dashboard-api.js'),'utf8');
 assert.match(source,/stockResult = await consumeStockPg\(pg, productId, jumlah\)/); assert.match(source,/purchase = await buyWithSaldoPg\(pg, sender, data\[0\], jumlah, totalHarga\)/);
 const start=dashboard.indexOf('async function updateProdukStockPg'); const body=dashboard.slice(start,dashboard.indexOf('\n}',start)+2); assert.match(body,/SELECT data FROM produk WHERE id=\$1 FOR UPDATE/); assert.match(body,/client\.query\('COMMIT'\)/); assert.match(body,/client\.query\('ROLLBACK'\)/); assert.match(body,/client\.release\(\)/);
});
