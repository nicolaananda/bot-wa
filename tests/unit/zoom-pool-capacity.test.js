'use strict'

const fs = require('fs')

jest.mock('fs')
jest.mock('../../lib/zoom-client', () => ({}))
jest.mock('../../lib/zoom-license', () => ({}))

function host(accountId) {
  return [{ accountId, clientId: `client-${accountId}`, clientSecret: `secret-${accountId}` }]
}

test('uses exact tier first and larger tiers as fallback stock', () => {
  const files = {
    'zoom-pool-500.json': host('account-500'),
    'zoom-pool-1000.json': host('account-1000'),
  }
  fs.statSync.mockImplementation((file) => {
    if (!files[file.split('/').pop()]) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { mtimeMs: 1 }
  })
  fs.readFileSync.mockImplementation((file) => JSON.stringify(files[file.split('/').pop()]))

  const zoomPool = require('../../lib/zoom-pool')
  const candidates = zoomPool.loadHostsForTier(500)

  expect(candidates.map(({ host: item, capacityTier }) => [item.accountId, capacityTier])).toEqual([
    ['account-500', 500],
    ['account-1000', 1000],
  ])
})

test('does not count the same account twice when registered in two pools', () => {
  const files = {
    'zoom-pool-500.json': host('shared-account'),
    'zoom-pool-1000.json': host('shared-account'),
  }
  fs.statSync.mockImplementation((file) => {
    if (!files[file.split('/').pop()]) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { mtimeMs: 2 }
  })
  fs.readFileSync.mockImplementation((file) => JSON.stringify(files[file.split('/').pop()]))

  const zoomPool = require('../../lib/zoom-pool')
  zoomPool.clearCache()

  expect(zoomPool.loadHostsForTier(500)).toHaveLength(1)
})
