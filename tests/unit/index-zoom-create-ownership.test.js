const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8')
function between(start, end) {
  const from = source.indexOf(start)
  assert.notEqual(from, -1, `missing ${start}`)
  const to = source.indexOf(end, from)
  assert.notEqual(to, -1, `missing ${end}`)
  return source.slice(from, to)
}
function run(body, context) {
  return vm.runInNewContext(`(async () => { let createResult, poolResult; ${body}; return createResult || poolResult })()`, context)
}

async function main() {
  const selected = { accountId: 'actual-host', label: 'actual', concurrentMeetings: 2 }
  const claims = []
  const finishes = []
  const p0Store = {
    claimZoomCreate: async (input) => {
      claims.push(input)
      return { status: 'creating', claim_token: `token-${claims.length}` }
    },
    finishZoomCreate: async (...args) => finishes.push(args),
  }
  const zoomPool = {
    createMeetingOnHost: async (options) => {
      const claim = await options.claimCreate({ host: selected, capacityTier: 300 })
      await options.finishCreate(claim, { id: 'qris-meeting' })
      return { ok: true, meeting: { id: 'qris-meeting' }, host: selected }
    },
    createMeetingOnFirstAvailable: async (options) => {
      const claim = await options.claimCreate({ host: selected, capacityTier: 100 })
      await options.finishCreate(claim, { id: 'saldo-meeting' })
      return { ok: true, meeting: { id: 'saldo-meeting' }, host: selected }
    },
  }

  const qris = between(
    'createResult = await zoomPool.createMeetingOnHost({',
    '\n          } catch (createErr)',
  )
  await run(qris, {
    zoomPool, p0Store, pg: {}, tier: 300, earmarkedHost: { accountId: 'earmarked', poolTier: 300 },
    zoomDetail: { topic: 'q', startTimeIso: '2026-01-01T10:00:00', durationMinutes: 90, timezone: 'Asia/Jakarta', startAtUtcMs: 1767236400000 },
    buildZoomAgenda: () => '', orderId: 'stable-qris-order', sender: 'user@s.whatsapp.net',
  })
  assert.equal(claims[0].orderId, 'stable-qris-order')
  assert.equal(claims[0].hostId, 'actual-host')
  assert.equal(claims[0].endsAt - claims[0].startsAt, 90 * 60000)
  assert.deepEqual(finishes[0].slice(0, 3), ['stable-qris-order', 'token-1', { id: 'qris-meeting' }])

  const saldo = between(
    'poolResult = await zoomPool.createMeetingOnFirstAvailable({',
    '\n                } catch (pErr)',
  )
  await run(saldo, {
    zoomPool, p0Store, pg: {}, flowIsBuy: true, tier: 100, sender: 'user@s.whatsapp.net',
    priceInfo: { price: 10000 },
    parsed: { topic: 's', startTimeIso: '2026-01-02T10:00:00', durationMinutes: 45, timezone: 'Asia/Jakarta' },
    startUtcMs: 1767322800000, buildZoomAgenda: () => '', zoomOrderId: 'stable-saldo-order',
  })
  assert.equal(claims[1].orderId, 'stable-saldo-order')
  assert.equal(claims[1].hostId, 'actual-host')
  assert.equal(claims[1].amount, 10000)
  assert.equal(claims[1].endsAt - claims[1].startsAt, 45 * 60000)
  assert.deepEqual(finishes[1].slice(0, 3), ['stable-saldo-order', 'token-2', { id: 'saldo-meeting' }])

  assert.doesNotMatch(qris, /reserveZoomBooking/)
  console.log('index Zoom ownership caller checks passed')
}

test('QRIS and saldo callers claim the selector-selected host before create', main)
