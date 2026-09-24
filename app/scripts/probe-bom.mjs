// What does the schedule actually bill?
//
// Three questions, asked of the real buildSchedule:
//   1. a model run where one fin has been given its own size
//   2. the absorptive face of each cloud shape against its true plan area
//   3. the face of a VMT baffle, which the catalogue calls "all sides VMT"
//
// Reads nothing and writes nothing; builds documents in memory.

import { buildSchedule } from '../src/lib/store.js'
import { finSchedule, finSizeMm } from '../src/lib/catalog.js'
import { cloudExtent } from '../src/lib/clouds.js'
import { loadCloudManifest } from '../src/lib/clouds.js'
await loadCloudManifest()

const pad = (s, n) => String(s).padEnd(n)
const line = (s) => console.log('\n--- ' + s)

// ---------------------------------------------------------------------------
line('a model run with one fin resized')

const modelSet = {
  id: 'a', type: 'baffles', ci: 0, cj: 0,
  // The params a real blade set carries: the catalogue fields AND the model
  // the shape picked. Leaving the catalogue fields out is not a smaller test
  // case, it is a different one — baffleSizeMm reads them.
  params: {
    btype: 'blade', shape: 'standard', thickness: 12, width: 75, length: 1200,
    family: 'pet-solid', colour: 'Alloy',
    model: 'blade-standard', modelName: 'Blade · Standard',
    sizeMm: { l: 1200, w: 12, h: 75 },
    count: 4, spacing: 100, drop: 0.3,
    finOverrides: { 1: { length: 2780 } },
  },
}
console.log('  what the renderer builds fin by fin:')
for (let i = 0; i < 4; i++) {
  const s = finSizeMm(modelSet.params, i)
  console.log(`    fin ${i}: ${s.l} x ${s.w} x ${s.h}`)
}
console.log('  what the schedule bills:')
for (const f of finSchedule(modelSet.params)) {
  console.log(`    fin ${f.index}: ${f.lengthMm} x ${f.thickness} x ${f.depthMm}`)
}
const ms = buildSchedule([modelSet])
console.log('  rows:')
for (const r of ms.rows) console.log(`    ${r.qty} x ${r.name}  ${r.lengthMm} x ${r.depthMm}`)

// The same edit on a CATALOGUE run, for comparison.
line('the same edit on a catalogue run')
const catSet = {
  id: 'b', type: 'baffles', ci: 0, cj: 0,
  params: {
    btype: 'vmt', model: null, thickness: 25, width: 150, length: 1200,
    family: 'wood-classic', colour: 'WD-NC-13',
    count: 4, spacing: 100, drop: 0.3,
    finOverrides: { 1: { length: 2780 } },
  },
}
for (const r of buildSchedule([catSet]).rows) {
  console.log(`    ${r.qty} x ${r.name}  ${r.lengthMm} x ${r.depthMm}`)
}

// ---------------------------------------------------------------------------
line('cloud face: what the schedule bills against the panel that exists')

// Measured from the supplied files by probe-cloud-area.mjs.
const TRUE_RATIO = { square: 1.000, circle: 0.785, hexagon: 0.750, triangle: 0.568 }
console.log(' ', pad('shape', 10), pad('size', 6), pad('billed m²', 11), pad('actual m²', 11), 'over by')
for (const shape of ['square', 'circle', 'hexagon', 'triangle']) {
  for (const size of [600, 900, 1200]) {
    const it = { id: 'c', type: 'clouds', ci: 0, cj: 0, params: { shape, size, thickness: 40, family: 'cloud-solid', colour: 'x' } }
    const e = cloudExtent(it.params)
    const billed = e.length * e.width
    if (!(billed > 0)) continue
    const actual = billed * TRUE_RATIO[shape]
    console.log(' ', pad(shape, 10), pad(size, 6), pad(billed.toFixed(4), 11),
      pad(actual.toFixed(4), 11), `${((billed / actual - 1) * 100).toFixed(1)}%`)
  }
}

// ---------------------------------------------------------------------------
line('a VMT baffle, which the catalogue calls "all sides VMT"')
const vmt = { btype: 'vmt', thickness: 25, width: 150, length: 1200 }
const twoFaces = (vmt.length / 1000) * (vmt.width / 1000) * 2
const edges = (vmt.length / 1000) * (vmt.thickness / 1000) * 2
const ends = (vmt.width / 1000) * (vmt.thickness / 1000) * 2
console.log(`  billed (two faces)      ${twoFaces.toFixed(4)} m²`)
console.log(`  long edges              ${edges.toFixed(4)} m²`)
console.log(`  ends                    ${ends.toFixed(4)} m²`)
console.log(`  all six                 ${(twoFaces + edges + ends).toFixed(4)} m²`
  + `  (+${(((twoFaces + edges + ends) / twoFaces - 1) * 100).toFixed(1)}%)`)
