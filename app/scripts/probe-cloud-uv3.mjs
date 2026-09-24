// Which way round does each panel sit, and which way round does the projection
// put the artwork on it?
//
// Reported as "the triangle texture is on the wrong way". The two triangle
// files are known to be mirrored against each other, and the projection maps v
// to a FIXED axis — so if one file's apex is at max z and the other's at min z,
// one of them wears its design upside down.
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'
import { classifyCloudMeshes, projectCloudUV } from '../src/lib/clouds.js'

const MODELS = path.resolve('public/models')
const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'))

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('cloud', 15), pad('det', 7), pad('w@minZ', 9), pad('w@maxZ', 9),
  pad('apex', 7), pad('v@apex', 8), 'artwork lands')

for (const entry of manifest.clouds) {
  const buf = fs.readFileSync(path.join(MODELS, entry.file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  root.updateMatrixWorld(true)
  const { panel } = classifyCloudMeshes(root)
  const det = panel.matrixWorld.determinant()
  const g = panel.geometry.clone()
  g.applyMatrix4(panel.matrixWorld)
  projectCloudUV(g)

  const pos = g.attributes.position
  const uv = g.attributes.uv
  g.computeBoundingBox()
  const bb = g.boundingBox
  const d = bb.max.z - bb.min.z

  // How wide the panel is in x at each end of z. A triangle is wide at its base
  // and next to nothing at its apex; the symmetric shapes are the same at both.
  const band = (z0, z1) => {
    let lo = Infinity; let hi = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z < z0 || z > z1) continue
      lo = Math.min(lo, pos.getX(i)); hi = Math.max(hi, pos.getX(i))
    }
    return hi > lo ? hi - lo : 0
  }
  const wMin = band(bb.min.z, bb.min.z + d * 0.06)
  const wMax = band(bb.max.z - d * 0.06, bb.max.z)

  // v at whichever end is the narrow one.
  const vAt = (z0, z1) => {
    let s = 0; let n = 0
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z < z0 || z > z1) continue
      s += uv.getY(i); n++
    }
    return n ? s / n : NaN
  }
  const narrowIsMin = wMin < wMax
  const vApex = narrowIsMin
    ? vAt(bb.min.z, bb.min.z + d * 0.06)
    : vAt(bb.max.z - d * 0.06, bb.max.z)

  const symmetric = Math.min(wMin, wMax) > Math.max(wMin, wMax) * 0.6
  const apex = symmetric ? '—' : (narrowIsMin ? 'min z' : 'max z')
  // The artwork's apex is at the TOP of the image, which is v = 1.
  const verdict = symmetric ? 'n/a (symmetric)'
    : (vApex > 0.5 ? 'right way up' : '*** UPSIDE DOWN ***')

  console.log(pad(entry.id, 15), pad(det.toFixed(2), 7),
    pad(wMin.toFixed(1), 9), pad(wMax.toFixed(1), 9),
    pad(apex, 7), pad(Number.isNaN(vApex) ? '—' : vApex.toFixed(2), 8), verdict)
}
