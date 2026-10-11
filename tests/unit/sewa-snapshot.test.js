const { expiredCheck, getAllSewa } = require('../../function/sewa')

beforeEach(() => jest.useFakeTimers())
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); delete global.db })

test('expiry waits for a snapshot and resumes after a reload without replacing it', () => {
  const groupLeave = jest.fn()
  global.db = { data: {} }
  expiredCheck({ groupLeave })
  expect(() => jest.advanceTimersByTime(1000)).not.toThrow()
  expect(getAllSewa()).toEqual([])
  expect(db.data.sewa).toBeUndefined()
  db.data = { sewa: { group: { id: 'group', expired: 0 } } }
  jest.advanceTimersByTime(1000)
  expect(groupLeave).toHaveBeenCalledWith('group')
  expect(db.data.sewa).toEqual({})
  db.data = null
  expect(() => jest.advanceTimersByTime(1000)).not.toThrow()
  expect(getAllSewa()).toEqual([])
})
