const crypto = require('crypto')
const { pool } = require('../config/postgres')

const ACTIVE = new Set(['awaiting_payment', 'pending', 'processing', 'paid', 'reserved', 'delivery_pending'])
function positiveAmount(value) { const amount=Number(value); return Number.isFinite(amount)&&amount>0 ? amount:null }
function mapStatus(value) { const status=String(value||'').toLowerCase(); return status==='delivery_pending'?status:['paid','processing','reserved'].includes(status)?'processing':'awaiting_payment' }
function planLegacyRows(legacy) {
  const rows=[], quarantined=[]
  for (const [legacyKind,entries] of [['order',legacy.order],['orderDeposit',legacy.orderDeposit]]) {
    if (!entries||typeof entries!=='object'||Array.isArray(entries)) continue
    for (const [legacyKey,value] of Object.entries(entries)) {
      const item=value&&typeof value==='object'&&!Array.isArray(value)?value:{}
      const providerOrderId=typeof item.orderId==='string'?item.orderId.trim():''
      const userId=typeof legacyKey==='string'?legacyKey.trim():''
      const amount=positiveAmount(item.totalAmount), status=String(item.status||'').toLowerCase()
      if (legacyKind === 'order' && typeof item.staticPaymentMarker === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.staticPaymentMarker)) continue
      if (!providerOrderId||!userId||!amount||(status&&!ACTIVE.has(status))) { quarantined.push({legacyKind,legacyKey,reason:!providerOrderId?'missing_order_id':!amount?'invalid_amount':'unknown_status'}); continue }
      rows.push({legacyKind,legacyKey,providerOrderId,subjectId:providerOrderId,userId,amount,kind:legacyKind==='orderDeposit'?'deposit':'order',orderKind:legacyKind==='orderDeposit'?'deposit':'qris',status:mapStatus(status)})
    }
  }
  return { rows, quarantined }
}
function legacyFingerprint(legacy) { const p=planLegacyRows(legacy); return crypto.createHash('sha256').update(JSON.stringify(p.rows.map(r=>[r.legacyKind,r.legacyKey,r.providerOrderId,r.userId,r.amount,r.status]).sort())).digest('hex') }
function same(row,expected,fields) { return fields.every(field=>field==='amount'?Number(row[field])===Number(expected[field]):String(row[field])===String(expected[field])) }
async function importRow(client,row) {
  const order=(await client.query('SELECT order_id,kind,user_id,amount,status,provider_order_id FROM business_orders WHERE order_id=$1 FOR UPDATE',[row.subjectId])).rows[0]
  if (order&&!same(order,{order_id:row.subjectId,kind:row.orderKind,user_id:row.userId,amount:row.amount,provider_order_id:row.providerOrderId},['order_id','kind','user_id','amount','provider_order_id'])) throw new Error('legacy backfill identity conflict')
  const correlation=(await client.query('SELECT provider_order_id,kind,subject_id,user_id,amount FROM payment_correlations WHERE provider_order_id=$1 FOR UPDATE',[row.providerOrderId])).rows[0]
  if (correlation&&!same(correlation,{provider_order_id:row.providerOrderId,kind:row.kind,subject_id:row.subjectId,user_id:row.userId,amount:row.amount},['provider_order_id','kind','subject_id','user_id','amount'])) throw new Error('legacy backfill identity conflict')
  if (!order) await client.query('INSERT INTO business_orders(order_id,kind,user_id,amount,status,provider_order_id) VALUES($1,$2,$3,$4,$5,$6)',[row.subjectId,row.orderKind,row.userId,row.amount,row.status,row.providerOrderId])
  if (!correlation) await client.query('INSERT INTO payment_correlations(provider_order_id,kind,subject_id,user_id,amount) VALUES($1,$2,$3,$4,$5)',[row.providerOrderId,row.kind,row.subjectId,row.userId,row.amount])
  await client.query('INSERT INTO legacy_pending_backfill(legacy_kind,legacy_key,order_id,status) VALUES($1,$2,$3,$4) ON CONFLICT (legacy_kind,legacy_key) DO NOTHING',[row.legacyKind,row.legacyKey,row.subjectId,'imported'])
  return order&&correlation?'existing':'imported'
}
const STRUCTURE_SQL = `SELECT
  to_regclass('business_orders') IS NOT NULL AND to_regclass('payment_correlations') IS NOT NULL
  AND to_regclass('legacy_pending_backfill') IS NOT NULL AND to_regclass('legacy_pending_backfill_runs') IS NOT NULL
  AND to_regprocedure('reserve_zoom_booking(text,text,text,timestamp with time zone,timestamp with time zone,integer,integer)') IS NOT NULL
  AND to_regprocedure('claim_zoom_create(text,text,text,timestamp with time zone,timestamp with time zone,integer,uuid,numeric)') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (VALUES
    ('business_orders','order_id'),('business_orders','kind'),('business_orders','user_id'),('business_orders','amount'),('business_orders','status'),('business_orders','provider_order_id'),
    ('payment_correlations','provider_order_id'),('payment_correlations','kind'),('payment_correlations','subject_id'),('payment_correlations','user_id'),('payment_correlations','amount'),
    ('legacy_pending_backfill','legacy_kind'),('legacy_pending_backfill','legacy_key'),('legacy_pending_backfill','order_id'),('legacy_pending_backfill','status'),
    ('legacy_pending_backfill_runs','fingerprint'),('legacy_pending_backfill_runs','eligible_count')) required(table_name,column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema=current_schema() AND c.table_name=required.table_name AND c.column_name=required.column_name))
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='business_orders'::regclass AND conname='business_orders_kind_check'
    AND pg_get_constraintdef(oid)='CHECK ((kind = ANY (ARRAY[''saldo''::text, ''qris''::text, ''zoom''::text, ''deposit''::text])))')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='business_orders'::regclass AND conname='business_orders_status_check'
    AND pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''awaiting_payment''::text, ''pending''::text, ''processing''::text, ''delivery_pending''::text, ''completed''::text, ''cancelled''::text, ''expired''::text, ''manual_review''::text])))')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='legacy_pending_backfill'::regclass AND conname='legacy_pending_backfill_status_check'
    AND pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''imported''::text, ''conflict''::text, ''insufficient_identity''::text])))') AS ready`
async function assertBackfillReady({db=pool,legacy}) {
  if (!(await db.query(STRUCTURE_SQL)).rows[0]?.ready) throw new Error('Required schema structure is not ready')
  const plan=planLegacyRows(legacy||{})
  if (!plan.rows.length&&!plan.quarantined.length) return true
  if (plan.quarantined.length) throw new Error('Legacy backfill has unknown or conflicting rows')
  for (const row of plan.rows) {
    const represented = await db.query(`SELECT true AS ok FROM business_orders o
      JOIN payment_correlations p ON p.provider_order_id=$1
      WHERE o.order_id=$2 AND o.kind=$3 AND o.user_id=$4 AND o.amount=$5
        AND o.provider_order_id=$1 AND p.kind=$6 AND p.subject_id=$2 AND p.user_id=$4 AND p.amount=$5`,
    [row.providerOrderId,row.subjectId,row.orderKind,row.userId,row.amount,row.kind])
    if (!represented.rows[0]) throw new Error('Legacy row is not represented in authoritative storage')
  }
  return true
}
async function backfillLegacyPending({db=pool,legacy,apply=false,batchSize=100}) {
  const plan=planLegacyRows(legacy||{}), result={dryRun:!apply,eligible:plan.rows.length,quarantined:plan.quarantined.length,imported:0,existing:0}
  if (!apply) return result
  if (plan.quarantined.length) throw new Error('legacy backfill has unknown or conflicting rows')
  const client=await db.connect()
  try { await client.query('BEGIN'); for(let offset=0;offset<plan.rows.length;offset+=batchSize) for(const row of plan.rows.slice(offset,offset+batchSize)) result[await importRow(client,row)]++
    await client.query('INSERT INTO legacy_pending_backfill_runs(fingerprint,eligible_count) VALUES($1,$2) ON CONFLICT (fingerprint) DO UPDATE SET eligible_count=EXCLUDED.eligible_count,completed_at=now()',[legacyFingerprint(legacy),plan.rows.length]); await client.query('COMMIT')
  } catch(error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  return result
}
async function readLegacy(db=pool) { const result=await db.query("SELECT key,value FROM kv_store WHERE key IN ('order','orderDeposit')"); return Object.fromEntries(result.rows.map(row=>[row.key,row.value])) }
if (require.main===module) { const apply=process.argv.includes('--apply'); readLegacy().then(legacy=>backfillLegacyPending({legacy,apply})).then(result=>{console.log(JSON.stringify(result));return pool.end()}).catch(()=>{console.error(JSON.stringify({ok:false,error:'backfill_failed'}));process.exitCode=1;return pool.end()}) }
module.exports={planLegacyRows,legacyFingerprint,backfillLegacyPending,assertBackfillReady,readLegacy}
