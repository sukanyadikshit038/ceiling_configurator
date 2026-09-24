// What are the Fly models MADE of, and can the app use them as they are?
//
// Follow-up to probe-fly.mjs. Three questions the first pass raised:
//
//   where are the 1.65 M triangles? — a cloud panel is 6,540. Something here is
//   two orders of magnitude denser and it matters whether that is the visible
//   form or a hidden detail nobody can see from four metres.
//   which meshes are the FACE? — one material is called "Blue felt" and the
//   other 169 are called matNN, which is what an exporter writes when it has
//   nothing to say.
//   is the face mappable? — the supplied textures are Designer Textile sheets,
//   which have to be cropped to true scale, and that needs a sane UV.
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'

const DIR = path.resolve('public/models/Fly')
const pad = (s, n) => String(s).padEnd(n)
const num = (n) => Math.round(n).toLocaleString()

for (const file of fs.readdirSync(DIR).filter((f) => /\.fbx$/i.test(f)).sort()) {
  const buf = fs.readFileSync(path.join(DIR, file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  root.updateMatrixWorld(true)

  const meshes = []
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o)
  })

  const info = meshes.map((m) => {
    const g = m.geometry
    const b = new THREE.Box3().setFromObject(m)
    const s = b.getSize(new THREE.Vector3())
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    // Surface area in world units, which is what says whether a mesh is a big
    // flat face or a thin piece of trim.
    const pos = g.attributes.position
    const idx = g.index
    const n = idx ? idx.count : pos.count
    const A = new THREE.Vector3(); const B = new THREE.Vector3(); const C = new THREE.Vector3()
    let area = 0
    for (let t = 0; t + 2 < n; t += 3) {
      const a = idx ? idx.getX(t) : t
      const b2 = idx ? idx.getX(t + 1) : t + 1
      const c = idx ? idx.getX(t + 2) : t + 2
      A.fromBufferAttribute(pos, a).applyMatrix4(m.matrixWorld)
      B.fromBufferAttribute(pos, b2).applyMatrix4(m.matrixWorld)
      C.fromBufferAttribute(pos, c).applyMatrix4(m.matrixWorld)
      area += B.sub(A).cross(C.sub(A)).length() / 2
    }
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? ''
    return {
      name: m.name, mat, tris, area,
      dims: [s.x, s.y, s.z],
      // triangles per square metre of surface — the density number
      density: area > 1e-9 ? tris / (area / 1e6) : Infinity,
    }
  })

  const total = info.reduce((a, r) => a + r.tris, 0)
  const totalArea = info.reduce((a, r) => a + r.area, 0)

  console.log(`\n=== ${file} ===`)
  console.log(`  ${num(total)} triangles over ${(totalArea / 1e6).toFixed(2)} m² of surface`)

  // By material, because "Blue felt" is the one name anybody chose on purpose.
  const byMat = new Map()
  for (const r of info) {
    const k = /^mat\d+$/.test(r.mat) ? '(matNN — exporter default)' : (r.mat || '(unnamed)')
    const e = byMat.get(k) ?? { meshes: 0, tris: 0, area: 0 }
    e.meshes++; e.tris += r.tris; e.area += r.area
    byMat.set(k, e)
  }
  console.log(`\n  ${pad('material', 30)} ${pad('meshes', 8)} ${pad('triangles', 12)} ${pad('area m²', 10)} share`)
  for (const [k, e] of [...byMat].sort((a, b) => b[1].tris - a[1].tris)) {
    console.log(`  ${pad(k, 30)} ${pad(e.meshes, 8)} ${pad(num(e.tris), 12)} ${pad((e.area / 1e6).toFixed(2), 10)} ${(e.tris / total * 100).toFixed(0)}%`)
  }

  // The densest meshes: triangles per m². This is where the waste is.
  console.log(`\n  densest parts — triangles per m² of their own surface`)
  console.log(`  ${pad('part', 16)} ${pad('size mm', 22)} ${pad('tris', 10)} ${pad('area m²', 10)} tris/m²`)
  for (const r of [...info].sort((a, b) => b.density - a.density).slice(0, 6)) {
    console.log(`  ${pad(r.name, 16)} ${pad(r.dims.map((d) => Math.round(d)).join(' x '), 22)} ${pad(num(r.tris), 10)} ${pad((r.area / 1e6).toFixed(3), 10)} ${num(r.density)}`)
  }

  // The biggest FACES by area — the wings, presumably.
  console.log(`\n  biggest parts by surface area — the form the room sees`)
  console.log(`  ${pad('part', 16)} ${pad('size mm', 22)} ${pad('tris', 10)} ${pad('area m²', 10)} material`)
  for (const r of [...info].sort((a, b) => b.area - a.area).slice(0, 6)) {
    console.log(`  ${pad(r.name, 16)} ${pad(r.dims.map((d) => Math.round(d)).join(' x '), 22)} ${pad(num(r.tris), 10)} ${pad((r.area / 1e6).toFixed(3), 10)} ${r.mat}`)
  }
}
