'use strict'

const { checkGroupWhitelist } = require('../../lib/group-whitelist')

const registeredJid = '120363419470324991@g.us'

test('allows a registered group JID without external lookup', () => {
  expect(checkGroupWhitelist({ jid: registeredJid, allowedJids: [registeredJid] })).toEqual({
    status: 'ALLOWED',
    source: 'jid',
  })
})

test('denies an unregistered group when a whitelist exists', () => {
  expect(
    checkGroupWhitelist({ jid: '120363000000000000@g.us', allowedJids: [registeredJid] })
  ).toEqual({ status: 'DENIED', reason: 'not_registered' })
})

test('does not fall back to a spoofable name when the JID whitelist is configured', () => {
  expect(
    checkGroupWhitelist({
      jid: '120363000000000000@g.us',
      allowedJids: [registeredJid],
      groupName: 'GH bot BARU',
      allowedNames: ['gh bot baru'],
    })
  ).toEqual({ status: 'DENIED', reason: 'not_registered' })
})

test('keeps normalized group names as migration compatibility', () => {
  expect(
    checkGroupWhitelist({
      jid: '120363000000000000@g.us',
      groupName: '  GH bot   BARU ',
      allowedNames: ['gh bot baru'],
    })
  ).toEqual({ status: 'ALLOWED', source: 'name' })
})

test('blocks legacy invite-link-only configuration without calling its API', () => {
  expect(checkGroupWhitelist({ jid: registeredJid, hasLegacyLinks: true })).toEqual({
    status: 'CHECK_FAILED',
    reason: 'legacy_links_require_jid_migration',
  })
})

test('denies malformed non-group JIDs', () => {
  expect(checkGroupWhitelist({ jid: '628123@s.whatsapp.net', allowedJids: [] })).toEqual({
    status: 'DENIED',
    reason: 'invalid_jid',
  })
})
