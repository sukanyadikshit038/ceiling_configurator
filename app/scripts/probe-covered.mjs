// Is the covered-area total calculated properly?
//
// Four questions:
//   1. what is the denominator — the ceiling, or the grid rounded down to it?
//   2. can two items overlap, and would their areas then be counted twice?
//   3. does a baffle run's "covered" area include the gaps between its fins?
//   4. does a non-square cloud cover its bounding box?
//
// Reads nothing and writes nothing.

import fs from 'node:fs'
import { useStore, coveredArea, reconcile } from '../src/lib/store.js'
import { gridOf } from '../src/lib/grid.js'
import { baffleExtent, finSchedule, defaultBaffleParams } from '../src/lib/catalog.js'
import { applyRoomManifest } from '../src/lib/rooms.js'
import { applyModelManifest } from '../src/lib/models.js'

// The rooms come from the manifest, the way verify.mjs loads them.
const manifest = JSON.parse(fs.readFileSync('public/models/manifest.json', 'utf8'))
applyRoomManifest(manifest)
applyModelManifest(manifest)
useStore.getState().hydrate()
useStore.setState({ roomId: 'sc:edu-class', ceilingOverride: null, items: [] })

const S = () => useStore.getState()
const line = (s) => console.log('\n--- ' + s)
const m2 = (n) => `${n.toFixed(3)} m²`

// ---------------------------------------------------------------------------
line('the denominator')
const room = S().room()
const g = gridOf(room)
const c = room.ceiling
const trueZone = (c.maxX - c.minX) * (c.maxZ - c.minZ)
const gridArea = g.cols * g.pitch * (g.rows * g.pitch)
console.log(`  ceiling zone   ${(c.maxX - c.minX).toFixed(3)} x ${(c.maxZ - c.minZ).toFixed(3)} = ${m2(trueZone)}`)
console.log(`  grid           ${g.cols} x ${g.rows} @ ${g.pitch} = ${(g.cols * g.pitch).toFixed(3)} x ${(g.rows * g.pitch).toFixed(3)} = ${m2(gridArea)}`)
console.log(`  the panel calls the SECOND one "the ceiling"; difference ${m2(trueZone - gridArea)}`
  + `  (${((trueZone / gridArea - 1) * 100).toFixed(2)}% on every percentage)`)

// ---------------------------------------------------------------------------
line('can two items overlap?')
const ready = () => useStore.setState({
  items: [],
  brush: { type: 'baffles', params: reconcile({ ...defaultBaffleParams() }) },
})
ready()
const a = S().placeAt(1500, 1500)
const b = S().placeAt(3400, 1500)
console.log('  two sets placed:', !!a, !!b, ' items:', S().items.length)
if (a && b) {
  const before = coveredArea(S().items)
  const A = S().items.find((i) => i.id === a)
  const B = S().items.find((i) => i.id === b)
  console.log(`  A at cell ${A.cell} ${A.ci}x${A.cj}   B at cell ${B.cell} ${B.ci}x${B.cj}`)
  console.log('  covered before:', m2(before))
  // Grow ONE FIN of A until the set's footprint reaches into B.
  S().updateFinOf(a, 0, { length: 2780 })
  const A2 = S().items.find((i) => i.id === a)
  const B2 = S().items.find((i) => i.id === b)
  console.log(`  after growing a fin: A ${A2.ci}x${A2.cj} at ${A2.cell}, B ${B2.ci}x${B2.cj} at ${B2.cell}`)
  const boxA = { i0: A2.cell[0], j0: A2.cell[1], ci: A2.ci, cj: A2.cj }
  const boxB = { i0: B2.cell[0], j0: B2.cell[1], ci: B2.ci, cj: B2.cj }
  const hit = boxA.i0 < boxB.i0 + boxB.ci && boxB.i0 < boxA.i0 + boxA.ci
    && boxA.j0 < boxB.j0 + boxB.cj && boxB.j0 < boxA.j0 + boxA.cj
  console.log('  footprints now overlap:', hit)
  console.log('  covered after :', m2(coveredArea(S().items)),
    hit ? '  <- the shared ceiling is counted twice' : '')
}

// ---------------------------------------------------------------------------
line('what a baffle run counts as covered')
ready()
const one = S().placeAt(2000, 2000)
if (one) {
  const it = S().items.find((i) => i.id === one)
  const e = baffleExtent(it.params)
  const fins = finSchedule(it.params)
  const finArea = fins.reduce((n, f) => n + (f.lengthMm / 1000) * (f.thickness / 1000), 0)
  console.log(`  ${fins.length} fins, ${it.params.thickness} mm thick, ${it.params.spacing} mm apart`)
  console.log(`  counted as covered : ${m2(e.length * e.width)}   (the rectangle the run spreads over)`)
  console.log(`  the fins themselves: ${m2(finArea)}   (what you would see blocking the slab)`)
  console.log(`  the run is ${((1 - finArea / (e.length * e.width)) * 100).toFixed(0)}% gap`)
}

// ---------------------------------------------------------------------------
line('a non-square cloud')
const RATIO = { square: 1.0, circle: 0.785, hexagon: 0.75, triangle: 0.568 }
console.log('  measured from the supplied panels by probe-cloud-area.mjs:')
for (const [shape, r] of Object.entries(RATIO)) {
  console.log(`    ${shape.padEnd(9)} covers ${(r * 100).toFixed(1)}% of the box it is counted as`)
}
