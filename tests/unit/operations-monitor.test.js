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
