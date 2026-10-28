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
