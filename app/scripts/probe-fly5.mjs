// Why does every heavy part have exactly 65,501 triangles?
//
// That number is not detail, it is a ceiling — and parts as different as a
// 3 x 6 x 900 wire and a 13 x 20 x 900 rail landing on the same count means the
// tessellation has nothing to do with the shape. Before anything is removed or
// simplified it is worth knowing whether some of those triangles are simply
// WASTE, because removing waste is free and carries no risk at all.
//
// Two kinds of waste are worth testing for:
//
//   DEGENERATE triangles — zero area. They draw nothing. Removing them cannot
//                          change a single pixel.
//   DUPLICATE vertices   — the same position stored many times. Welding them
//                          does not change the surface, only how it is indexed.
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'

const SRC = path.resolve('public/models/Fly')
const pad = (s, n) => String(s).padEnd(n)
const num = (n) => Math.round(n).toLocaleString()

for (const file of ['Fly-4.fbx']) {
  const b = fs.readFileSync(path.join(SRC, file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  root.updateMatrixWorld(true)

  const rows = []
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const g = o.geometry
    const pos = g.attributes.position
    const idx = g.index
    const n = idx ? idx.count : pos.count
    const tris = n / 3

    // Degenerate: zero area, to a tolerance well under a micron squared.
    const A = new THREE.Vector3(); const B = new THREE.Vector3(); const C = new THREE.Vector3()
    let degenerate = 0
    for (let t = 0; t + 2 < n; t += 3) {
      const a = idx ? idx.getX(t) : t
      const b2 = idx ? idx.getX(t + 1) : t + 1
      const c = idx ? idx.getX(t + 2) : t + 2
      A.fromBufferAttribute(pos, a)
      B.fromBufferAttribute(pos, b2)
      C.fromBufferAttribute(pos, c)
      if (B.sub(A).cross(C.sub(A)).lengthSq() < 1e-12) degenerate++
    }

    // Unique positions, to a micron.
    const seen = new Set()
    for (let i = 0; i < pos.count; i++) {
      seen.add(`${Math.round(pos.getX(i) * 1000)},`
        + `${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`)
    }

    const m = Array.isArray(o.material) ? o.material[0] : o.material
    rows.push({
      name: o.name, felt: m?.name === 'Blue felt',
      tris, degenerate, verts: pos.count, unique: seen.size,
    })
  })

  const tot = (k) => rows.reduce((a, r) => a + r[k], 0)
  console.log(`\n=== ${file} ===`)
  console.log(`  ${num(tot('tris'))} triangles, ${num(tot('verts'))} vertices`)
  console.log(`  DEGENERATE (zero area, draws nothing): ${num(tot('degenerate'))}`
    + `  — ${(tot('degenerate') / tot('tris') * 100).toFixed(1)}% of every triangle in the file`)
  console.log(`  unique vertex positions: ${num(tot('unique'))}`
    + `  — the rest are duplicates (${(100 - tot('unique') / tot('verts') * 100).toFixed(1)}%)`)

  console.log(`\n  the heaviest parts, and what is inside them`)
  console.log(`  ${pad('part', 15)} ${pad('triangles', 11)} ${pad('degenerate', 12)}`
    + ` ${pad('real tris', 11)} ${pad('verts', 10)} unique`)
  for (const r of [...rows].sort((a, b) => b.tris - a.tris).slice(0, 10)) {
    console.log(`  ${pad(r.name, 15)} ${pad(num(r.tris), 11)} ${pad(num(r.degenerate), 12)}`
      + ` ${pad(num(r.tris - r.degenerate), 11)} ${pad(num(r.verts), 10)} ${num(r.unique)}`)
  }

  const felt = rows.filter((r) => r.felt)
  console.log(`\n  the felt, for comparison`)
  for (const r of felt) {
    console.log(`  ${pad(r.name, 15)} ${pad(num(r.tris), 11)} ${pad(num(r.degenerate), 12)}`
      + ` ${pad(num(r.tris - r.degenerate), 11)} ${pad(num(r.verts), 10)} ${num(r.unique)}`)
  }
}
