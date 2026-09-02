'use strict'

jest.mock('fs', () => ({ readFileSync: jest.fn() }))
jest.mock('../../lib/zoom-client', () => ({
  listUsers: jest.fn(),
  createBasicUser: jest.fn(),
  disassociateUser: jest.fn(),
}))

const fs = require('fs')
const zoomClient = require('../../lib/zoom-client')
const indukPool = require('../../lib/induk-pool')

const parent = {
  accountId: 'parent-300',
  clientId: 'client-300',
  clientSecret: 'secret-300',
  userId: 'me',
  label: 'Induk 300',
}

beforeEach(() => {
  jest.clearAllMocks()
  fs.readFileSync.mockReturnValue(JSON.stringify(parent))
  zoomClient.listUsers.mockResolvedValue([])
})

test('lists all statuses using the single configured parent', async () => {
  zoomClient.listUsers
    .mockResolvedValueOnce([{ id: '1', email: 'active@example.com' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: '2', email: 'pending@example.com' }])

  await expect(indukPool.listUsers()).resolves.toMatchObject({
    parent,
    users: [{ id: '1' }, { id: '2' }],
  })
  expect(zoomClient.listUsers).toHaveBeenCalledTimes(3)
  expect(zoomClient.listUsers).toHaveBeenCalledWith({ status: 'pending', creds: parent })
})

test('invites a Basic user only when the email is absent', async () => {
  await indukPool.inviteBasic('new@example.com')
  expect(zoomClient.createBasicUser).toHaveBeenCalledWith({
    email: 'new@example.com',
    creds: parent,
  })
})

test('unlinks the matching user by id', async () => {
  zoomClient.listUsers.mockResolvedValue([{ id: 'user-1', email: 'client@example.com' }])
  await expect(indukPool.unlink('client@example.com')).resolves.toMatchObject({ found: true })
  expect(zoomClient.disassociateUser).toHaveBeenCalledWith({ userId: 'user-1', creds: parent })
})
