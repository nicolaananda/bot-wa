'use strict'
const { ageHours, reconciliation } = require('../../lib/operations-monitor')

test('backup freshness age is null for missing marker', () => {
  expect(ageHours('/definitely/missing')).toBeNull()
})

test('reconciliation is one read-only aggregate query', async () => {
  const pg = { query: jest.fn(async sql => ({ rows: [{ reason: 'x', count: 1, identifiers: ['o1'] }] })) }
  await expect(reconciliation(pg)).resolves.toEqual([{ reason: 'x', count: 1, identifiers: ['o1'] }])
  const sql = pg.query.mock.calls[0][0]
  expect(sql).toMatch(/^WITH recent_transactions AS MATERIALIZED/)
  expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/)
  expect(sql).toMatch(/paid_without_ledger/)
  expect(sql).toMatch(/completed_with_unsent_delivery/)
})

test('monitor includes PostgreSQL WAL archiver status', () => {
  const source = require('fs').readFileSync(require.resolve('../../lib/operations-monitor'), 'utf8')
  expect(source).toMatch(/FROM pg_stat_archiver/)
  expect(source).toMatch(/wal_archive_failed/)
  expect(source).toMatch(/wal_archive_stale/)
  expect(source).toMatch(/pitr-base-success/)
})

test('monitor excludes append-only owner resolutions without changing source rows', () => {
  const fs = require('fs')
  const source = fs.readFileSync(require.resolve('../../lib/operations-monitor'), 'utf8')
  const migration = fs.readFileSync(require.resolve('../../migrations/007_operational_anomaly_resolutions.sql'), 'utf8')
  expect(source).toMatch(/operational_anomaly_resolutions/)
  expect(source).toMatch(/anomaly_type='delivery_outbox'/)
  expect(source).toMatch(/anomaly_type='midtrans_webhook'/)
  expect(migration).toMatch(/append-only/)
  expect(migration).toMatch(/BEFORE UPDATE OR DELETE/)
})
