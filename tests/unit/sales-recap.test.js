const { summarizeProducts } = require('../../lib/sales-recap')

test('Zoom recap groups distinct persisted titles and falls back without changing other products', () => {
  expect(
    summarizeProducts([
      { id: 'zoom100', name: 'Zoom 100p — ZOOM AAAA', jumlah: 1, totalBayar: 7001, profit: 7001 },
      { id: 'zoom100', name: 'Zoom 100p — ZOOM BBBB', jumlah: 1, totalBayar: 8001, profit: 8001 },
      { id: 'zoom100', jumlah: 1, totalBayar: 9001, profit: 9001 },
      { id: 'net1u', name: 'Netflix 1U', jumlah: 1, totalBayar: 10000, profit: 1000 },
      { id: 'net1u', name: 'Ignored renamed label', jumlah: 2, totalBayar: 20000, profit: 2000 },
    ])
  ).toEqual([
    { name: 'Zoom 100p — ZOOM AAAA', omzet: 7001, profit: 7001, terjual: 1 },
    { name: 'Zoom 100p — ZOOM BBBB', omzet: 8001, profit: 8001, terjual: 1 },
    { name: 'Zoom 100p', omzet: 9001, profit: 9001, terjual: 1 },
    { name: 'Netflix 1U', omzet: 30000, profit: 3000, terjual: 3 },
  ])
})
