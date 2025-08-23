const fs = require('fs');

function addResponList(groupID, key, response, isImage, image_url) {
  var obj_add = {
    id: groupID,
    key: key,
    response: response,
    isImage: isImage,
    image_url: image_url
  }
  db.data.list.push(obj_add)
}

function getDataResponList(groupID, key) {
  let position = null
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupID && db.data.list[x].key.toLowerCase() === key.toLowerCase()) {
      position = x
    }
  })
  if (position !== null) {
    return db.data.list[position]
  }
}

function isAlreadyResponList(groupID, key) {
  let found = false
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupID && db.data.list[x].key.toLowerCase() === key.toLowerCase()) {
      found = true
    }
  })
  return found
}

function sendResponList(groupId, key) {
  let position = null
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupId && db.data.list[x].key.toLowerCase() === key.toLowerCase()) {
      position = x
    }
  })
  if (position !== null) {
    return db.data.list[position].response
  }
}

function isAlreadyResponListGroup(groupID) {
  let found = false
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupID) {
      found = true
    }
  })
  return found
}

function resetListAll(groupID) {
  let position = null
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupID) {
      position = x
    }
  })
  if (position !== null) {
    delete db.data.list[position]
  }
}

function delResponList(groupID, key) {
  let position = null
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupID && db.data.list[x].key.toLowerCase() === key.toLowerCase()) {
      position = x
    }
  })
  if (position !== null) {
    db.data.list.splice(position, 1)
  }
}

function updateResponList(groupID, key, response, isImage, image_url) {
  let position = null
  Object.keys(db.data.list).forEach((x) => {
    if (db.data.list[x].id === groupID && db.data.list[x].key.toLowerCase() === key.toLowerCase()) {
      position = x
    }
  })
  if (position !== null) {
    db.data.list[position].response = response
    db.data.list[position].isImage = isImage
    db.data.list[position].image_url = image_url
  }
}
module.exports = {
  addResponList,
  delResponList,
  resetListAll,
  isAlreadyResponList,
  isAlreadyResponListGroup,
  sendResponList,
  updateResponList,
  getDataResponList
}
