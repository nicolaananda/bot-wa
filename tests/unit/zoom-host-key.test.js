'use strict'

jest.mock('axios')
jest.mock('fs')
jest.mock('../../function/redis-helper', () => ({
  getCache: jest.fn(async () => ({ token: 'test-token', expiresAt: Date.now() + 60000 })),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
}))
jest.mock('../../lib/zoom-license', () => ({
  checkHostForTier: jest.fn(async () => ({ ok: true })),
}))
jest.mock('../../lib/zoom-backdate', () => ({
  isBackdateTier: () => false,
  applyBackdate: (opts) => opts,
  recordBooking: jest.fn(),
}))

const axios = require('axios')
const fs = require('fs')
const client = require('../../lib/zoom-client')
const pool = require('../../lib/zoom-pool')
const bookings = require('../../lib/zoom-backdate')
const actualFs = jest.requireActual('fs')
const vm = require('node:vm')
const indexSource = actualFs.readFileSync(require.resolve('../../index'), 'utf8')
const host = {
  accountId: 'test-account',
  clientId: 'test-client',
  clientSecret: 'test-secret',
  userId: 'host@example.com',
  hostKey: '999999',
}
const opts = {
  tier: 1000,
  host,
  topic: 'Test',
  startTimeIso: '2026-10-01T10:00:00',
  startAtUtcMs: Date.parse('2026-10-01T10:00:00Z'),
  durationMinutes: 60,
}
let profile

beforeEach(() => {
  jest.clearAllMocks()
  pool.clearCache()
  profile = { host_key: '001234' }
  fs.statSync.mockReturnValue({ mtimeMs: 1 })
  fs.readFileSync.mockReturnValue(JSON.stringify([host]))
  axios.mockImplementation(async (request) => {
    if (request.method === 'POST') return { status: 201, data: { id: '123456789' } }
    if (request.url.endsWith('/meetings')) return { status: 200, data: { meetings: [] } }
    expect(request.url).toBe('https://api.zoom.us/v2/users/host%40example.com')
    expect(request.params).toEqual({ include_fields: 'host_key' })
    if (profile instanceof Error) throw profile
    return { status: 200, data: profile }
  })
})

test('requests the API host key and preserves leading zeros', async () => {
  await expect(client.getUser({ creds: host, requireHostKey: true })).resolves.toEqual({
    host_key: '001234',
  })
  expect(pool.loadPool(1000)[0].hostKey).toBe('999999')
})

test.each([undefined, null, '', '12345', '1234567', 'abcdef', ' 123456', 123456])(
  'uses the configured key when API key %p is invalid',
  async (host_key) => {
    profile = { host_key }
    await expect(client.getUser({ creds: host, requireHostKey: true })).resolves.toMatchObject({
      host_key: '999999',
      host_key_source: 'config',
    })
  }
)

test.each(['createMeetingOnFirstAvailable', 'createMeetingOnHost'])(
  '%s returns only the API key after validation and records the meeting',
  async (method) => {
    const result = await pool[method](opts)
    expect(result.ok).toBe(true)
    expect(result.hostInfo.host_key).toBe('001234')
    const requests = axios.mock.calls.map(([request]) => request)
    expect(requests.findIndex((r) => r.params?.include_fields === 'host_key')).toBeLessThan(
      requests.findIndex((r) => r.method === 'POST')
    )
    expect(bookings.recordBooking).toHaveBeenCalledTimes(1)
  }
)

test.each([{}, { host_key: 'invalid' }, new Error('Zoom permission denied')])(
  'key lookup failure %p falls back to config across rental paths',
  async (response) => {
    profile = response
    expect((await pool.findFirstAvailableHost(opts)).ok).toBe(true)
    expect((await pool.createMeetingOnFirstAvailable(opts)).ok).toBe(true)
    expect((await pool.createMeetingOnHost(opts)).ok).toBe(true)
    expect(axios.mock.calls.some(([request]) => request.method === 'POST')).toBe(true)
    expect(bookings.recordBooking).toHaveBeenCalledTimes(2)
  }
)

test('selector stops after an ambiguous Zoom POST timeout instead of trying another host', async () => {
  const secondHost = { ...host, accountId: 'test-account-2', userId: 'second@example.com' }
  fs.readFileSync.mockReturnValue(JSON.stringify([host, secondHost]))
  const posts = []
  axios.mockImplementation(async (request) => {
    if (request.method === 'POST') {
      posts.push(request.url)
      const error = new Error('timeout')
      error.code = 'ECONNABORTED'
      error.request = {}
      throw error
    }
    if (request.url.endsWith('/meetings')) return { status: 200, data: { meetings: [] } }
    return { status: 200, data: profile }
  })

  const result = await pool.createMeetingOnFirstAvailable(opts)

  expect(result).toMatchObject({ ok: false, error: 'ZOOM_CREATE_AMBIGUOUS', ambiguous: true })
  expect(posts).toHaveLength(1)
})

test('fallback can retry the earmarked host without treating its own lock as busy', async () => {
  let meetingScans = 0
  axios.mockImplementation(async (request) => {
    if (request.method === 'POST') return { status: 201, data: { id: '123456789' } }
    if (request.url.endsWith('/meetings')) {
      meetingScans++
      return {
        status: 200,
        data: {
          meetings:
            meetingScans === 1
              ? [{ id: 'busy', start_time: '2026-10-01T10:00:00Z', duration: 60 }]
              : [],
        },
      }
    }
    return { status: 200, data: profile }
  })

  const result = await pool.createMeetingOnHost({ ...opts, allowFallback: true })

  expect(result.ok).toBe(true)
  expect(result.host.accountId).toBe(host.accountId)
  expect(meetingScans).toBe(2)
})

function runIndexSaldo(p0Store) {
  const start = indexSource.indexOf('poolResult = await zoomPool.createMeetingOnFirstAvailable({')
  const end = indexSource.indexOf('\n                } catch (pErr)', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const body = indexSource.slice(start, end)
  return vm.runInNewContext(`(async () => { let poolResult; ${body}; return poolResult })()`, {
    zoomPool: pool, p0Store, pg: {}, flowIsBuy: true, tier: 1000,
    sender: 'buyer@s.whatsapp.net', priceInfo: { price: 10000 },
    parsed: { topic: 'Paid', startTimeIso: opts.startTimeIso, durationMinutes: 60, timezone: 'UTC' },
    startUtcMs: opts.startAtUtcMs, buildZoomAgenda: () => '', zoomOrderId: 'ZOOM-STABLE-ORDER',
  })
}

function provider(result) {
  const posts = []
  axios.mockImplementation(async (request) => {
    if (request.method === 'POST') { posts.push(request.url); if (result instanceof Error) throw result; return { status: 201, data: result } }
    if (request.url.endsWith('/meetings')) return { status: 200, data: { meetings: [] } }
    return { status: 200, data: profile }
  })
  return posts
}

test('actual index saldo callback rejects insufficient funds before provider POST', async () => {
  const posts = provider({ id: 'unexpected' })
  await expect(runIndexSaldo({ claimZoomCreate: async () => { throw new Error('insufficient balance') } }))
    .resolves.toMatchObject({ ok: false })
  expect(posts).toHaveLength(0)
})

test('actual index saldo callback reserves debit before one POST and makes no second wallet mutation', async () => {
  const events = []
  provider({ id: 'paid-meeting' })
  axios.mockImplementationOnce(async () => ({ status: 200, data: { meetings: [] } }))
  const store = {
    claimZoomCreate: jest.fn(async () => { events.push('debit'); return { status: 'creating', claim_token: 'claim-1' } }),
    finishZoomCreate: jest.fn(async () => { events.push('finish') }),
  }
  axios.mockImplementation(async (request) => {
    if (request.method === 'POST') { events.push('post'); return { status: 201, data: { id: 'paid-meeting' } } }
    if (request.url.endsWith('/meetings')) return { status: 200, data: { meetings: [] } }
    return { status: 200, data: profile }
  })
  await expect(runIndexSaldo(store)).resolves.toMatchObject({ ok: true })
  expect(events).toEqual(['debit', 'post', 'finish'])
  expect(store.claimZoomCreate).toHaveBeenCalledTimes(1)
})

test('actual index saldo callback compensates definite rejection once', async () => {
  provider(Object.assign(new Error('rejected'), { response: { status: 400 } }))
  const store = {
    claimZoomCreate: jest.fn(async () => ({ status: 'creating', claim_token: 'claim-1' })),
    finishZoomCreate: jest.fn(async () => {}),
  }
  await expect(runIndexSaldo(store)).resolves.toMatchObject({ ok: false })
  expect(store.finishZoomCreate).toHaveBeenCalledTimes(1)
  expect(store.finishZoomCreate.mock.calls[0][4]).toMatchObject({ error: expect.any(Error) })
})

test('actual index saldo callback quarantines timeout without fallback or refund', async () => {
  const posts = provider(Object.assign(new Error('timeout'), { request: {}, code: 'ECONNABORTED' }))
  const store = {
    claimZoomCreate: jest.fn(async () => ({ status: 'creating', claim_token: 'claim-1' })),
    finishZoomCreate: jest.fn(async () => {}),
  }
  await expect(runIndexSaldo(store)).resolves.toMatchObject({ error: 'ZOOM_CREATE_AMBIGUOUS' })
  expect(posts).toHaveLength(1)
  expect(store.finishZoomCreate).toHaveBeenCalledTimes(1)
  expect(store.finishZoomCreate.mock.calls[0][4]).toMatchObject({ ambiguous: true })
})

test('actual index saldo callback replays stored result without POST', async () => {
  const posts = provider({ id: 'unexpected' })
  const store = {
    claimZoomCreate: jest.fn(async () => ({ status: 'created', meeting: { id: 'stored' } })),
    finishZoomCreate: jest.fn(),
  }
  await expect(runIndexSaldo(store)).resolves.toMatchObject({ ok: true, replayed: true, meeting: { id: 'stored' } })
  expect(posts).toHaveLength(0)
  expect(store.finishZoomCreate).not.toHaveBeenCalled()
})
