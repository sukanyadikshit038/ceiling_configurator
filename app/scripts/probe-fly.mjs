// What is in the two Fly models?
//
// Nothing in the app knows about them yet — the manifest scanner reads Cloud,
// baffles, ceiling_tiles and rooms, and Fly is none of those. So before any of
// it is wired up: what are these files, what are they made of, how big are they
// in the room, and is their UV mapping one a photographed fabric can go on.
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'

const DIR = path.resolve('public/models/Fly')
const files = fs.readdirSync(DIR).filter((f) => /\.fbx$/i.test(f)).sort()

const mm = (v) => `${Math.round(v)}`

for (const file of files) {
  const buf = fs.readFileSync(path.join(DIR, file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  root.updateMatrixWorld(true)

  const meshes = []
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o)
  })

  const whole = new THREE.Box3().setFromObject(root)
  const size = whole.getSize(new THREE.Vector3())
  let tris = 0
  for (const m of meshes) {
    const g = m.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
  }

  console.log(`\n=== ${file}  (${(buf.length / 1e6).toFixed(1)} MB) ===`)
  console.log(`  meshes ${meshes.length}   triangles ${Math.round(tris).toLocaleString()}`)
  console.log(`  overall  ${mm(size.x)} x ${mm(size.y)} x ${mm(size.z)}  (file units)`)
  console.log(`  y range  ${mm(whole.min.y)} .. ${mm(whole.max.y)}`)

  // Every distinct material name, which usually says what the parts are meant
  // to be made of.
  const mats = new Set()
  for (const m of meshes) {
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mat?.name) mats.add(mat.name)
    }
  }
  console.log(`  materials  ${[...mats].join(', ') || '(none named)'}`)

  // Part-by-part, sorted tallest-first so the structure reads.
  const rows = meshes.map((m) => {
    const b = new THREE.Box3().setFromObject(m)
    const s = b.getSize(new THREE.Vector3())
    const g = m.geometry
    const uv = g.attributes.uv
    let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
        v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
      }
    }
    return {
      name: m.name || '(unnamed)',
      size: `${mm(s.x)} x ${mm(s.y)} x ${mm(s.z)}`,
      y: `${mm(b.min.y)}..${mm(b.max.y)}`,
      tris: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3),
      uv: uv ? `${u0.toFixed(2)}..${u1.toFixed(2)} x ${v0.toFixed(2)}..${v1.toFixed(2)}` : 'NO UV',
      mat: (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? '',
    }
  }).sort((a, b) => b.tris - a.tris)

  const pad = (s, n) => String(s).padEnd(n)
  console.log(`  ${pad('part', 22)} ${pad('size', 22)} ${pad('y', 16)} ${pad('tris', 9)} ${pad('uv range', 26)} material`)
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${pad(r.name, 22)} ${pad(r.size, 22)} ${pad(r.y, 16)} ${pad(r.tris, 9)} ${pad(r.uv, 26)} ${r.mat}`)
  }
  if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`)
}
