jest.mock('child_process', () => ({ spawn: jest.fn() }))

const { spawn } = require('child_process')
const launcher = require('../../nicola')

beforeEach(() => {
  jest.useFakeTimers()
  spawn.mockReset()
})

afterEach(() => jest.useRealTimers())

test('five rapid failures cool down, then continue retrying', () => {
  let exit
  spawn.mockImplementation(() => ({
    on(event, handler) { if (event === 'exit') exit = handler; return this },
    kill: jest.fn(),
  }))

  launcher.start()
  for (let i = 1; i < launcher.MAX_RESTARTS; i++) {
    exit(1)
    jest.advanceTimersByTime(i * 2000)
  }
  exit(1)
  expect(spawn).toHaveBeenCalledTimes(launcher.MAX_RESTARTS)
  jest.advanceTimersByTime(launcher.COOLDOWN_MS - 1)
  expect(spawn).toHaveBeenCalledTimes(launcher.MAX_RESTARTS)
  jest.advanceTimersByTime(1)
  expect(spawn).toHaveBeenCalledTimes(launcher.MAX_RESTARTS + 1)
})

test('stable uptime resets rapid failure count', () => {
  let exit
  spawn.mockImplementation(() => ({ on(event, handler) { if (event === 'exit') exit = handler; return this } }))
  launcher.start()
  jest.advanceTimersByTime(launcher.RESTART_WINDOW_MS)
  exit(1)
  jest.advanceTimersByTime(2000)
  expect(spawn).toHaveBeenCalledTimes(2)
})