'use strict'

function checkGroupWhitelist({
  jid,
  allowedJids = [],
  groupName = '',
  allowedNames = [],
  hasLegacyLinks = false,
}) {
  if (typeof jid !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(jid)) {
    return { status: 'DENIED', reason: 'invalid_jid' }
  }

  if (allowedJids.includes(jid)) return { status: 'ALLOWED', source: 'jid' }
  if (allowedJids.length > 0) return { status: 'DENIED', reason: 'not_registered' }

  const normalizedName = groupName.toLowerCase().trim().replace(/\s+/g, ' ')
  if (normalizedName && allowedNames.includes(normalizedName)) {
    return { status: 'ALLOWED', source: 'name' }
  }

  if (allowedNames.length > 0) {
    return { status: 'DENIED', reason: 'not_registered' }
  }

  if (hasLegacyLinks) {
    return { status: 'CHECK_FAILED', reason: 'legacy_links_require_jid_migration' }
  }

  return { status: 'ALLOWED', source: 'unconfigured' }
}

module.exports = { checkGroupWhitelist }
