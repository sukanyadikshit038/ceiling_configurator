// What could actually be dropped from a Fly, and what would it cost?
//
// The question was "keep the outer model and remove any density part". Two
// different things get confused under that heading and they have very different
// risks:
//
//   REMOVING a part        — free if nobody can see it, a hole if they can.
//   DECIMATING a part      — keeps the shape, reduces the tessellation. Safe,
//                            but needs a simplifier and has a quality dial.
//
// This measures what is available for the first, which is the cheap one. For
// each hardware part: how many triangles it carries, how big it is, and whether
// its box sits INSIDE another part's box, which is the crude test for "nobody
// can see this".
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'

const SRC = path.resolve('public/models/Fly')
const pad = (s, n) => String(s).padEnd(n)
const num = (n) => Math.round(n).toLocaleString()

for (const file of ['Fly-4.fbx', 'Fly-8.fbx']) {
  const b = fs.readFileSync(path.join(SRC, file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  root.updateMatrixWorld(true)

  const parts = []
  let wingTris = 0
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const g = o.geometry
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    const bb = new THREE.Box3().setFromObject(o)
    if (m?.name === 'Blue felt') { wingTris += tris; return }
    const s = bb.getSize(new THREE.Vector3())
    parts.push({
      name: o.name, tris, bb,
      dims: [s.x, s.y, s.z],
      longest: Math.max(s.x, s.y, s.z),
      smallest: Math.min(s.x, s.y, s.z),
      diag: s.length(),
    })
  })

  const total = wingTris + parts.reduce((a, p) => a + p.tris, 0)

  // Crude occlusion: is this part's box inside another part's box, with a
  // millimetre of slack? A part swallowed by another is one nobody can see.
  let hidden = 0
  let hiddenTris = 0
  for (const p of parts) {
    const inside = parts.some((q) => q !== p
      && q.bb.min.x - 1 <= p.bb.min.x && q.bb.max.x + 1 >= p.bb.max.x
      && q.bb.min.y - 1 <= p.bb.min.y && q.bb.max.y + 1 >= p.bb.max.y
      && q.bb.min.z - 1 <= p.bb.min.z && q.bb.max.z + 1 >= p.bb.max.z
      && q.tris >= p.tris)
    if (inside) { hidden++; hiddenTris += p.tris; p.hidden = true }
  }

  console.log(`\n=== ${file} ===`)
  console.log(`  ${num(total)} triangles: ${num(wingTris)} felt, ${num(total - wingTris)} hardware`)
  console.log(`  parts whose box sits inside another part's: ${hidden}`
    + `  (${num(hiddenTris)} triangles, ${(hiddenTris / total * 100).toFixed(1)}%)`)

  // If everything under N mm went, what would be left?
  console.log(`\n  dropping every hardware part under a size — what is left`)
  console.log(`  ${pad('longest side <', 16)} ${pad('parts gone', 12)} ${pad('triangles left', 16)} of original`)
  for (const mm of [15, 25, 50, 100, 200]) {
    const gone = parts.filter((p) => p.longest < mm)
    const left = total - gone.reduce((a, p) => a + p.tris, 0)
    console.log(`  ${pad(`${mm} mm`, 16)} ${pad(gone.length, 12)} ${pad(num(left), 16)}`
      + ` ${(left / total * 100).toFixed(1)}%`)
  }

  // Where the triangles really are, by part size.
  console.log(`\n  where the triangles are, by the part's longest side`)
  const bands = [[0, 15], [15, 50], [50, 200], [200, 1000], [1000, 1e9]]
  for (const [lo, hi] of bands) {
    const inBand = parts.filter((p) => p.longest >= lo && p.longest < hi)
    if (!inBand.length) continue
    const t = inBand.reduce((a, p) => a + p.tris, 0)
    console.log(`  ${pad(`${lo}-${hi >= 1e9 ? '…' : hi} mm`, 16)} ${pad(inBand.length + ' parts', 12)}`
      + ` ${pad(num(t), 16)} ${(t / total * 100).toFixed(1)}%`)
  }

  // The heaviest parts, with their size, so "is this visible?" can be judged.
  console.log(`\n  the twelve heaviest hardware parts`)
  console.log(`  ${pad('part', 15)} ${pad('triangles', 11)} ${pad('size mm', 22)} hidden?`)
  for (const p of [...parts].sort((a, b) => b.tris - a.tris).slice(0, 12)) {
    console.log(`  ${pad(p.name, 15)} ${pad(num(p.tris), 11)}`
      + ` ${pad(p.dims.map((d) => Math.round(d)).join(' x '), 22)} ${p.hidden ? 'yes' : ''}`)
  }
}
