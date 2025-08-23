const expiredCheck = (ronzz) => {
  setInterval(() => {
    const { groupLeave } = ronzz
    let position = null
    Object.keys(db.data.sewa).forEach((i) => {
      if (Date.now() >= db.data.sewa[i].expired) {
        position = i
      }
    })
    if (position !== null) {
      delete db.data.sewa[position]
      groupLeave(position)
    }
  }, 1000)
}

const getAllSewa = () => {
  const array = []
  Object.keys(db.data.sewa).forEach((i) => {
    array.push(db.data.sewa[i].id)
  })
  return array
}

module.exports = {
  expiredCheck,
  getAllSewa
}