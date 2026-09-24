// Follow-up to probe-cloud-uv.mjs: how much of the IMAGE does the face
// actually sample, and how badly is it stretched?
//
// The planar fit said "not a projection". This says what it is instead —
// the UV bounding box of the face alone, and the UV area per unit of real
// area, which is the number that decides whether a picture would survive.
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'
import { classifyCloudMeshes } from '../src/lib/clouds.js'

const MODELS = path.resolve('public/models')
const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'))

const pad = (s, n) => String(s).padEnd(n)
const out = []

for (const entry of manifest.clouds) {
  const buf = fs.readFileSync(path.join(MODELS, entry.file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  root.updateMatrixWorld(true)
  const { panel } = classifyCloudMeshes(root)
  const g = panel.geometry.clone()
  g.applyMatrix4(panel.matrixWorld)
  g.computeBoundingBox()
  const bb = g.boundingBox
  const pos = g.attributes.position
  const uv = g.attributes.uv
  const idx = g.index

  const cut = bb.min.y + (bb.max.y - bb.min.y) * 0.15
  const onFace = (i) => pos.getY(i) <= cut

  // UV box of the face only.
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  let n = 0
  for (let i = 0; i < pos.count; i++) {
    if (!onFace(i)) continue
    n++
    u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
    v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
  }

  // Per-triangle: real area (in plan) against UV area. A clean projection gives
  // one constant ratio; a collapsed mapping gives ~0.
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
  let realSum = 0, uvSum = 0, tris = 0, degenerate = 0
  const count = idx ? idx.count : pos.count
  for (let t = 0; t < count; t += 3) {
    const a = idx ? idx.getX(t) : t
    const b = idx ? idx.getX(t + 1) : t + 1
    const c = idx ? idx.getX(t + 2) : t + 2
    if (!onFace(a) || !onFace(b) || !onFace(c)) continue
    A.set(pos.getX(a), 0, pos.getZ(a))
    B.set(pos.getX(b), 0, pos.getZ(b))
    C.set(pos.getX(c), 0, pos.getZ(c))
    const real = Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2
    const ua = uv.getX(a), va = uv.getY(a)
    const ub = uv.getX(b), vb = uv.getY(b)
    const uc = uv.getX(c), vc = uv.getY(c)
    const uvA = Math.abs((ub - ua) * (vc - va) - (uc - ua) * (vb - va)) / 2
    if (real < 1e-9) continue
    tris++
    realSum += real
    uvSum += uvA
    if (uvA / real < 1e-9) degenerate++
  }

  const planArea = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z)
  out.push({
    id: entry.id,
    faceVerts: n,
    faceTris: tris,
    uvBox: `${u0.toFixed(2)}..${u1.toFixed(2)} x ${v0.toFixed(2)}..${v1.toFixed(2)}`,
    // What fraction of a full 0..1 image the face covers, if it were planar.
    covers: `${((u1 - u0) * (v1 - v0) * 100).toFixed(1)}%`,
    // Collapsed triangles: face area that maps to no image area at all.
    collapsed: `${((degenerate / Math.max(1, tris)) * 100).toFixed(0)}%`,
    // Total UV area the whole face uses. ~1 means a sane unwrap.
    uvArea: uvSum.toFixed(4),
    realArea: (realSum / planArea).toFixed(2),
  })
}

console.log(pad('cloud', 15), pad('verts', 6), pad('tris', 6), pad('face UV box', 24),
  pad('bbox covers', 12), pad('collapsed', 10), pad('uv area', 9), 'face/plan')
for (const r of out) {
  console.log(pad(r.id, 15), pad(r.faceVerts, 6), pad(r.faceTris, 6), pad(r.uvBox, 24),
    pad(r.covers, 12), pad(r.collapsed, 10), pad(r.uvArea, 9), r.realArea)
}
