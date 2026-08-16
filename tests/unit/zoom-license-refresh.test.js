'use strict'

const { refreshAllLicenses, formatLicenseSummary } = require('../../lib/zoom-license-refresh')

test('refreshes each account once and reports ready hosts per tier', async () => {
  const shared = { label: 'Akun shared', accountId: 'account-1' }
  const weak = { label: 'Akun weak', accountId: 'account-2' }
  const disabled = {
    label: 'Akun disabled',
    accountId: 'account-3',
    disabledAt: '2026-08-16T00:00:00.000Z',
    disabledReason: 'manual',
  }
  const pool = {
    VALID_TIERS: [100, 300, 500, 1000],
    loadPool: jest.fn((tier) =>
      tier === 100 ? [shared, disabled] : tier === 300 ? [shared, weak] : []
    ),
  }
  const license = {
    getHostLicense: jest.fn(async (host) => ({
      ok: true,
      info: { effectiveCapacity: host.accountId === 'account-2' ? 100 : 500 },
    })),
    evaluate: jest.fn((info, tier) => ({
      ok: info.effectiveCapacity >= tier,
      capacity: info.effectiveCapacity,
      plan: 'Licensed',
      reason: info.effectiveCapacity >= tier ? undefined : 'CAPACITY_TOO_LOW',
    })),
    reasonText: jest.fn((verdict, tier) => `kapasitas ${verdict.capacity}p, butuh ${tier}p`),
  }

  const snapshot = await refreshAllLicenses({ license, pool })

  expect(license.getHostLicense).toHaveBeenCalledTimes(3)
  expect(license.getHostLicense).toHaveBeenCalledWith(shared, { forceRefresh: true })
  expect(snapshot.tiers.map(({ tier, ready, total }) => ({ tier, ready, total }))).toEqual([
    { tier: 100, ready: 1, total: 2 },
    { tier: 300, ready: 1, total: 2 },
    { tier: 500, ready: 0, total: 0 },
    { tier: 1000, ready: 0, total: 0 },
  ])
  expect(formatLicenseSummary(snapshot)).toContain('*300p:* 1/2 akun siap pakai')
  expect(formatLicenseSummary(snapshot)).toContain('❌ Akun weak: kapasitas 100p, butuh 300p')
  expect(formatLicenseSummary(snapshot)).toContain('❌ Akun disabled: disabled: manual')
})
