const fs = require('fs')
const vm = require('vm')
const moment = require('moment-timezone')
const { summarizeQris } = require('../../lib/qris-summary')
const source = fs.readFileSync(require.resolve('../../index.js'), 'utf8')
async function run(name, rows, sender = '6281@s.whatsapp.net') {
  const messages = [], queries = [], receipts = []
  const start = source.indexOf("      case 'kirimulang':")
  const end = source.indexOf("      case 'tes':", start)
  const context = { sender, from: 'group', isGroup: true, m: {}, ownerNomer: 'owner', moment, summarizeQris, toRupiah: String,
    db: { data: { transaksi: [] } }, pg: { query: async (sql, params) => { queries.push({sql, params}); return { rows } } },
    require: (name) => name === './lib/transaction-reader' ? require('../../lib/transaction-reader') : { getReceipt: async (id) => { receipts.push(id); return { success: true, content: 'PRIVATE' } } },
    reply: (text) => messages.push({text}), nicola: { sendMessage: async (to, data) => messages.push({to, ...data}) }, sleep: async () => {}, console: {log() {}, error() {}}
  }
  await vm.runInNewContext(`(async()=>{switch(${JSON.stringify(name)}){${source.slice(start,end)}}})()`, context)
  return {messages,queries,receipts}
}
test('daily reports read PG instead of empty RAM and keep deposits separate', async () => {
  const date = moment.tz('Asia/Jakarta').format('YYYY-MM-DD')
  const rows = [{meta:{date,metodeBayar:'QRIS',totalBayar:100,reffId:'sale'}},{meta:{date,type:'deposit',payment_method:'QRIS',totalBayar:200,reffId:'dep'}},{meta:{date,metodeBayar:'Saldo',totalBayar:300}}]
  expect((await run('qristoday', rows)).messages[0].text).toContain('Total QRIS:* 2 kali | Rp300')
  expect((await run('saldotoday', rows)).messages[0].text).toContain('Total Nominal:* Rp300')
})
test('resend queries only authenticated sender and sends receipt privately', async () => {
  const result = await run('resend', [{meta:{user:'6281',reffId:'owned'}}])
  expect(result.receipts).toEqual(['owned'])
  expect(result.messages.find(m => m.text === 'PRIVATE').to).toBe('6281@s.whatsapp.net')
  expect(result.queries[0].params).toContain('6281')
  expect(result.queries[0].sql).toMatch(/LIMIT \$3/)
  expect(result.queries[0].params[2]).toBe(1)
})
test('legacy dashboard rejects unauthenticated access before loading transactions', () => {
  const api = fs.readFileSync(require.resolve('../../options/dashboard-api'), 'utf8')
  const start = api.indexOf("app.use('/api/dashboard',")
  expect(start).toBeGreaterThan(-1)
  const middleware = api.slice(start, api.indexOf('\n});', start) + 4)
  let handler
  vm.runInNewContext(middleware, {app:{use:(path, fn)=>{handler=fn}},POS_TOKEN:'secret',posAuth:(req,res)=>{res.status(401);return false}})
  const res = {status:jest.fn().mockReturnThis(),json:jest.fn()}; const next=jest.fn()
  handler({headers:{}},res,next)
  expect(res.status).toHaveBeenCalledWith(401)
  expect(next).not.toHaveBeenCalled()
})
test('dashboard snapshot reads PG without reloading the database', async () => {
  const api = fs.readFileSync(require.resolve('../../options/dashboard-api'), 'utf8')
  const body = api.slice(api.indexOf('async function getFormattedDataAsync('), api.indexOf('// Helper untuk load map produk'))
  const instance = {data:{transaksi:[{totalBayar:999}],users:{existing:{saldo:1}},profit:{bronze:50},persentase:{bronze:5}},load:jest.fn()}
  const pg = {query:jest.fn(async(sql)=>({rows:sql.includes('FROM users')
    ? [{user_id:'existing',saldo:'250.00',role:'gold',data:{saldo:1,role:'bronze',name:'Fixture'}},{user_id:'new',saldo:'30.00',role:'silver',data:{}}]
    : [{meta:{totalBayar:123}}]}))}
  const result = await vm.runInNewContext(`(async()=>{${body};return getFormattedDataAsync()})()`, {usePg:true,pg,getDbInstance:async()=>instance,loadDatabaseAsync:async()=>{instance.load();return instance.data},require:n=>require('../../lib/transaction-reader')})
  expect(result.data.transaksi[0].totalBayar).toBe(123)
  expect(result.data.users).toEqual({existing:{saldo:250,role:'gold',name:'Fixture'},new:{saldo:30,role:'silver'}})
  expect(instance.data.users).toEqual({existing:{saldo:1}})
  expect(result.data.profit).toEqual({bronze:50})
  expect(result.data.persentase).toEqual({bronze:5})
  expect(instance.load).not.toHaveBeenCalled()
})
test('dashboard helper can read PG with stale RAM', async () => {
  const helper = require('../../options/dashboard-helper')
  const result = await helper.getDashboardData({data:{transaksi:[{totalBayar:999}]},pg:{query:async()=>({rows:[{meta:{totalBayar:123}}]})}})
  expect(result.totalPendapatan).toBe(123)
})
test('resend refuses another buyer even if a bad adapter returns it', async () => {
  const result = await run('sendagain', [{meta:{user:'6282',reffId:'not-owned'}}])
  expect(result.receipts).toEqual([])
})
