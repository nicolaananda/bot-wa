'use strict'

const redisState = { client: null }

jest.mock('../../config/redis', () => ({
  getRedis: () => redisState.client
}))

const {
  acquireLock,
  releaseLock,
  checkRateLimit,
  getCache,
  setCache,
  isLocked
} = require('../../function/redis-helper')

function createRedis(status = 'ready') {
  const values = new Map()
  const counts = { ping: 0, set: 0, eval: 0 }
  return {
    status,
    counts,
    values,
    ping: jest.fn(async () => { counts.ping++; return 'PONG' }),
    set: jest.fn(async (key, value, ...args) => {
      counts.set++
      if (args.includes('NX') && values.has(key)) return null
      values.set(key, value)
      return 'OK'
    }),
    eval: jest.fn(async (_script, _keys, key, token) => {
      counts.eval++
      if (values.get(key) !== token) return 0
      values.delete(key)
      return 1
    }),
    exists: jest.fn(async key => Number(values.has(key))),
    get: jest.fn(async key => values.get(key) ?? null),
    del: jest.fn(async key => Number(values.delete(key))),
    incr: jest.fn(async key => {
      const value = Number(values.get(key) || 0) + 1
      values.set(key, String(value))
      return value
    }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 60)
  }
}

beforeEach(() => {
  redisState.client = createRedis()
  jest.restoreAllMocks()
})

test('hot-path helpers issue zero PING commands', async () => {
  const redis = redisState.client
  const token = await acquireLock('user', 'buy')
  await isLocked('user', 'buy')
  await checkRateLimit('user', 'buy', 3, 60)
  await setCache('key', { ok: true })
  await getCache('key')
  await releaseLock('user', 'buy', token)

  expect(redis.counts.ping).toBe(0)
  expect(redis.ping).not.toHaveBeenCalled()
})

test('disconnected helpers use their documented fallbacks without commands', async () => {
  const redis = createRedis('end')
  redisState.client = redis

  await expect(acquireLock('user', 'buy')).resolves.toEqual(expect.any(String))
  await expect(releaseLock('user', 'buy', 'token')).resolves.toBe(false)
  await expect(isLocked('user', 'buy')).resolves.toBe(false)
  await expect(checkRateLimit('user', 'buy')).resolves.toEqual({ allowed: true, remaining: 5, resetIn: 0 })
  await expect(getCache('key')).resolves.toBeNull()
  await expect(setCache('key', 'value')).resolves.toBe(false)
  expect(redis.counts).toEqual({ ping: 0, set: 0, eval: 0 })
})

test('stale owner cannot delete a replacement lock', async () => {
  const redis = redisState.client
  const staleToken = await acquireLock('user', 'buy', 1)
  redis.values.delete('lock:buy:user') // Simulate expiry.
  const currentToken = await acquireLock('user', 'buy', 1)

  await expect(releaseLock('user', 'buy', staleToken)).resolves.toBe(false)
  expect(redis.values.get('lock:buy:user')).toBe(currentToken)
  await expect(releaseLock('user', 'buy', currentToken)).resolves.toBe(true)
  expect(redis.values.has('lock:buy:user')).toBe(false)
})
