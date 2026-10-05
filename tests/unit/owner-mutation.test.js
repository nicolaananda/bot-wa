'use strict'

const { requestHash, runOwnerMutation } = require('../../lib/owner-mutation')

function pgMock(prior) {
  const calls = []
  const client = {
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params })
      if (sql.startsWith('INSERT INTO owner_idempotency')) return { rowCount: prior ? 0 : 1, rows: [] }
      if (sql.startsWith('SELECT request_hash')) return { rowCount: 1, rows: [prior] }
      return { rowCount: 1, rows: [] }
    }),
    release: jest.fn(),
  }
  return { pg: { getClient: async () => client }, client, calls }
}

const req = body => ({ method: 'POST', path: '/balance', body, owner: '6281', headers: { 'idempotency-key': 'key-1' } })

test('commits mutation, audit, request hash, and result together', async () => {
  const { pg, calls } = pgMock()
  const result = await runOwnerMutation(pg, req({ amount: 10 }), 'balance.credit', 'user', async () => ({ data: { after: 110 }, audit: { amount: 10 } }))
  expect(result.result).toEqual({ after: 110 })
  expect(calls.map(x => x.sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']))
  expect(calls.some(x => x.sql.startsWith('INSERT INTO owner_audit'))).toBe(true)
  expect(calls.some(x => x.sql.startsWith('UPDATE owner_idempotency'))).toBe(true)
})

test('returns committed result for same request and rejects key reuse', async () => {
  const same = pgMock({ request_hash: requestHash(req({ amount: 10 })), status: 'completed', result: { after: 110 } })
  await expect(runOwnerMutation(same.pg, req({ amount: 10 }), 'x', 'y', jest.fn())).resolves.toMatchObject({ duplicate: true, result: { after: 110 } })
  const changed = pgMock({ request_hash: requestHash(req({ amount: 10 })), status: 'completed', result: { after: 110 } })
  await expect(runOwnerMutation(changed.pg, req({ amount: 11 }), 'x', 'y', jest.fn())).resolves.toEqual({ conflict: true })
  expect(changed.calls.map(x => x.sql)).toContain('ROLLBACK')
})

test('rolls back mutation failure without persisting result', async () => {
  const { pg, calls } = pgMock()
  await expect(runOwnerMutation(pg, req({ amount: 10 }), 'x', 'y', async () => { throw new Error('fail') })).rejects.toThrow('fail')
  expect(calls.map(x => x.sql)).toContain('ROLLBACK')
  expect(calls.some(x => x.sql.startsWith('UPDATE owner_idempotency'))).toBe(false)
})
