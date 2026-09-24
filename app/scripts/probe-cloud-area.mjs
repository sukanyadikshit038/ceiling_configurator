// How much absorptive face does a cloud panel actually have?
//
// The schedule bills a cloud at `cloudExtent`, which is the plan BOUNDING BOX.
// That is exact for a square and generous for everything else — a triangle
// fills half its box. This measures the real plan area of each supplied panel,
// triangle by triangle, and prints it against the box the schedule uses.
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

/** Plan area of the upward-facing triangles, in m². */
function planArea(g) {
  const pos = g.attributes.position
  const idx = g.index
  const n = idx ? idx.count : pos.count
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const cross = new THREE.Vector3()
  let up = 0
  let down = 0
  let both = 0
  for (let t = 0; t + 2 < n; t += 3) {
    const i0 = idx ? idx.getX(t) : t
    const i1 = idx ? idx.getX(t + 1) : t + 1
    const i2 = idx ? idx.getX(t + 2) : t + 2
    a.fromBufferAttribute(pos, i0)
    b.fromBufferAttribute(pos, i1)
    c.fromBufferAttribute(pos, i2)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    cross.crossVectors(ab, ac)
    // The area this triangle covers in PLAN is the y component of the cross
    // product, halved — a vertical rim face contributes nothing, which is
    // right: it is not part of the face you see from the room.
    const signed = cross.y / 2
    both += Math.abs(signed)
    if (signed > 0) up += signed
    else down -= signed
  }
  // WINDING IS NOT CONSISTENT ACROSS THESE FILES: most panels come back with
  // their top face wound the other way, so "upward-facing" alone reports zero.
  // One side of the panel is the larger of the two, and half the unsigned total
  // is the same number where the panel is a simple slab.
  return { face: Math.max(up, down), half: both / 2 }
}

console.log(pad('shape', 10), pad('size', 6), pad('plan box', 16), pad('box m²', 9),
  pad('face m²', 9), pad('face/box', 9), 'analytic')

const ANALYTIC = {
  square: 1,
  circle: Math.PI / 4,
  // A regular hexagon flat-to-flat across one axis, point-to-point across the
  // other: 3*sqrt(3)/2 * s² inside a 2s x sqrt(3)s box = 0.75.
  hexagon: 0.75,
  triangle: 0.5,
}

for (const entry of manifest.clouds) {
  const buf = fs.readFileSync(path.join(MODELS, entry.file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  root.updateMatrixWorld(true)
  const { panel } = classifyCloudMeshes(root)
  if (!panel) { console.log(pad(entry.shape, 10), pad(entry.size, 6), 'no panel mesh'); continue }
  const g = panel.geometry.clone()
  g.applyMatrix4(panel.matrixWorld)
  g.computeBoundingBox()
  const bb = g.boundingBox
  const bx = bb.max.x - bb.min.x
  const bz = bb.max.z - bb.min.z
  const box = bx * bz
  const { face, half } = planArea(g)
  const up = Math.max(face, half)
  console.log(
    pad(entry.shape, 10), pad(entry.size, 6),
    pad(`${bx.toFixed(3)} x ${bz.toFixed(3)}`, 16),
    pad(box.toFixed(4), 9),
    pad(up.toFixed(4), 9),
    pad((up / box).toFixed(3), 9),
    (ANALYTIC[entry.shape] ?? '—').toString().slice(0, 5))
}
