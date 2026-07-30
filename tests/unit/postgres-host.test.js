test('PostgreSQL defaults to IPv4 loopback without DNS', () => {
  const oldHost = process.env.PG_HOST
  delete process.env.PG_HOST
  jest.resetModules()
  jest.doMock('pg', () => ({
    Pool: jest.fn(config => ({
      on: jest.fn(),
      query: jest.fn(() => Promise.resolve({ rows: [] })),
      end: jest.fn(),
      config,
    })),
  }))
  const { pool } = require('../../config/postgres')
  expect(pool.config.host).toBe('127.0.0.1')
  if (oldHost === undefined) delete process.env.PG_HOST
  else process.env.PG_HOST = oldHost
})