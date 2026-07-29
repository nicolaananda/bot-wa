'use strict'

const GowaClient = require('../../lib/gowa-client')

test('uses current GOWA avatar and group endpoints', async () => {
  const client = new GowaClient({ baseUrl: 'http://gowa.test' })
  client.axios = {
    get: jest.fn(async () => ({ data: { results: { avatar: 'avatar-url' } } })),
    post: jest.fn(async () => ({ data: { ok: true } }))
  }

  await expect(client.profilePictureUrl('6281@s.whatsapp.net')).resolves.toBe('avatar-url')
  expect(client.axios.get).toHaveBeenCalledWith('/user/avatar', { params: { phone: '6281@s.whatsapp.net', is_preview: false } })
  await client.groupUpdateSubject('123', 'New name')
  await client.groupLeave('123')
  await client.groupSettingUpdate('123', 'announcement')
  expect(client.axios.post.mock.calls).toEqual([
    ['/group/name', { group_id: '123@g.us', name: 'New name' }],
    ['/group/leave', { group_id: '123@g.us' }],
    ['/group/announce', { group_id: '123@g.us', announce: true }]
  ])
})
