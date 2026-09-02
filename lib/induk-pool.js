const fs = require('fs')
const path = require('path')
const zoomClient = require('./zoom-client')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'induk.json')

function getParent() {
  let parent
  try {
    parent = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('Induk Zoom 300 belum dikonfigurasi di config/induk.json')
    }
    throw new Error(`Config induk Zoom 300 tidak valid: ${error.message}`)
  }

  if (
    !parent ||
    Array.isArray(parent) ||
    !String(parent.accountId || '').trim() ||
    !String(parent.clientId || '').trim() ||
    !String(parent.clientSecret || '').trim()
  ) {
    throw new Error('config/induk.json wajib berisi satu accountId, clientId, dan clientSecret')
  }

  return {
    ...parent,
    accountId: String(parent.accountId).trim(),
    clientId: String(parent.clientId).trim(),
    clientSecret: String(parent.clientSecret).trim(),
    userId: String(parent.userId || 'me').trim() || 'me',
    label: String(parent.label || 'Induk Zoom 300').trim() || 'Induk Zoom 300',
  }
}

async function listUsers() {
  const parent = getParent()
  const groups = await Promise.all(
    ['active', 'inactive', 'pending'].map((status) =>
      zoomClient.listUsers({ status, creds: parent })
    )
  )
  const users = Array.from(
    new Map(
      groups
        .flat()
        .filter((user) => user && user.id)
        .map((user) => [user.id, user])
    ).values()
  )
  return { parent, users }
}

async function inviteBasic(email) {
  const { parent, users } = await listUsers()
  const existing = users.find((user) => String(user.email || '').toLowerCase() === email)
  if (existing) return { parent, existing }

  await zoomClient.createBasicUser({ email, creds: parent })
  return { parent, existing: null }
}

async function unlink(email) {
  const { parent, users } = await listUsers()
  const user = users.find((item) => String(item.email || '').toLowerCase() === email)
  if (!user || !user.id) return { parent, found: false }

  await zoomClient.disassociateUser({ userId: user.id, creds: parent })
  return { parent, found: true }
}

module.exports = { listUsers, inviteBasic, unlink }
