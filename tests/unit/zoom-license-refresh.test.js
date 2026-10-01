'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { refreshAllLicenses, formatLicenseSummary } = require('../../lib/zoom-license-refresh')

test('archives persistent failures, preserves API errors, restores valid archived hosts', async () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-pool-'))
  const active = [
    { label: 'bad', accountId: 'bad', clientSecret: 'keep-secret' },
    { label: 'api', accountId: 'api', custom: 'keep-field' },
  ]
  const archived = [{ label: 'restored', accountId: 'restored', clientSecret: 'archive-secret' }]
  fs.writeFileSync(path.join(configDir, 'zoom-pool-100.json'), JSON.stringify(active))
  fs.writeFileSync(path.join(configDir, 'zoom-pool-100.archive.json'), JSON.stringify(archived))

  const license = {
    getHostLicense: jest.fn(async ({ accountId }) => accountId === 'api'
      ? { ok: false, reason: 'API_ERROR', error: 'timeout' }
      : { ok: true, info: { accountId, effectiveCapacity: 100 } }),
    evaluate: jest.fn((info) => info.accountId === 'bad'
      ? { ok: false, reason: 'BASIC_PLAN', capacity: 100 }
      : { ok: true, capacity: 100, plan: 'Licensed' }),
    reasonText: jest.fn((verdict) => verdict.reason),
  }
  const pool = {
    VALID_TIERS: [100, 300, 500, 1000],
    getHostExpiryStatus: () => ({ ok: true }),
    clearCache: jest.fn(),
  }

  const snapshot = await refreshAllLicenses({ license, pool, configDir })
  const nextActive = JSON.parse(fs.readFileSync(path.join(configDir, 'zoom-pool-100.json')))
  const nextArchive = JSON.parse(fs.readFileSync(path.join(configDir, 'zoom-pool-100.archive.json')))

  expect(nextActive.map(({ accountId }) => accountId)).toEqual(['api', 'restored'])
  expect(nextArchive.map(({ accountId }) => accountId)).toEqual(['bad'])
  expect(nextActive.find(({ accountId }) => accountId === 'api').custom).toBe('keep-field')
  expect(nextArchive[0].clientSecret).toBe('keep-secret')
  expect(license.getHostLicense).toHaveBeenCalledTimes(3)
  expect(formatLicenseSummary(snapshot)).toContain('01:00 WIB')
})

test('archives an expired host without losing fields', async () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-pool-exp-'))
  const host = { label: 'expired', accountId: 'expired', clientSecret: 'secret', exp: '01/01/2020' }
  fs.writeFileSync(path.join(configDir, 'zoom-pool-100.json'), JSON.stringify([host]))
  const pool = {
    VALID_TIERS: [100],
    getHostExpiryStatus: () => ({ ok: false, reason: 'ACCOUNT_EXPIRED', detail: 'expired' }),
    clearCache: jest.fn(),
  }
  const license = {
    getHostLicense: jest.fn(async () => ({ ok: true, info: { effectiveCapacity: 100 } })),
    evaluate: jest.fn(),
    reasonText: jest.fn(({ reason }) => reason),
  }

  await refreshAllLicenses({ license, pool, configDir })

  expect(JSON.parse(fs.readFileSync(path.join(configDir, 'zoom-pool-100.json')))).toEqual([])
  expect(JSON.parse(fs.readFileSync(path.join(configDir, 'zoom-pool-100.archive.json')))).toEqual([host])
})
