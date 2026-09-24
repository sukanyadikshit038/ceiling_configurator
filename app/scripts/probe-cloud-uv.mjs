// Ask every cloud panel one question: is its UV a clean top-down projection?
//
// It matters because the Cloud Series artwork is a PICTURE OF THE FACE — a
// watercolour wash, a sunburst, a set of nested frames. A photographed fabric
// is near enough uniform that a scrambled unwrap still looks like fabric; a
// sunburst put on the same unwrap comes out as a scribble, and the only way to
// know which we have is to measure it.
//
// The test: fit u = a*x + b*z + c and v = d*x + e*z + f by least squares over
// the panel's own vertices, then report the worst residual as a fraction of the
// 0..1 range. A planar projection fits exactly. Anything else does not.
//
// Reads the supplied files and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'   // for its DOM stubs
import * as THREE from 'three'
import { classifyCloudMeshes, normaliseCloudUV } from '../src/lib/clouds.js'

const MODELS = path.resolve('public/models')
const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'))

/** Least-squares fit of w ≈ a*x + b*z + c over n samples. Returns [a,b,c]. */
function fitPlane(xs, zs, ws) {
  const n = xs.length
  let sx = 0, sz = 0, sw = 0, sxx = 0, szz = 0, sxz = 0, sxw = 0, szw = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sz += zs[i]; sw += ws[i]
    sxx += xs[i] * xs[i]; szz += zs[i] * zs[i]; sxz += xs[i] * zs[i]
    sxw += xs[i] * ws[i]; szw += zs[i] * ws[i]
  }
  // 3x3 normal equations, solved by Cramer.
  const M = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, n]]
  const b = [sxw, szw, sw]
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M)
  if (Math.abs(D) < 1e-12) return null
  const col = (k) => M.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D]
}

const rows = []
for (const entry of manifest.clouds) {
  const buf = fs.readFileSync(path.join(MODELS, entry.file))
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const root = new FBXLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  root.updateMatrixWorld(true)

  const { panel } = classifyCloudMeshes(root)
  const g = panel.geometry.clone()
  g.applyMatrix4(panel.matrixWorld)
  const uvBefore = (() => {
    const uv = g.attributes.uv
    if (!uv) return null
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (let i = 0; i < uv.count; i++) {
      u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
      v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
    }
    return [u0, u1, v0, v1]
  })()
  const fixed = normaliseCloudUV(g)

  const pos = g.attributes.position
  const uv = g.attributes.uv
  if (!uv) { rows.push({ id: entry.id, note: 'NO UV AT ALL' }); continue }

  // Only the vertices on the FACE the room sees — the lowest 15% of the
  // panel's thickness. The rim wraps round and would fight any planar fit.
  g.computeBoundingBox()
  const bb = g.boundingBox
  const cut = bb.min.y + (bb.max.y - bb.min.y) * 0.15
  const xs = [], zs = [], us = [], vs = []
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > cut) continue
    xs.push(pos.getX(i)); zs.push(pos.getZ(i))
    us.push(uv.getX(i)); vs.push(uv.getY(i))
  }

  const pu = fitPlane(xs, zs, us)
  const pv = fitPlane(xs, zs, vs)
  let worst = 0
  if (pu && pv) {
    for (let i = 0; i < xs.length; i++) {
      worst = Math.max(worst,
        Math.abs(pu[0] * xs[i] + pu[1] * zs[i] + pu[2] - us[i]),
        Math.abs(pv[0] * xs[i] + pv[1] * zs[i] + pv[2] - vs[i]))
    }
  }

  const w = bb.max.x - bb.min.x
  const d = bb.max.z - bb.min.z
  rows.push({
    id: entry.id,
    faceVerts: xs.length,
    uvBefore: uvBefore.map((n) => +n.toFixed(2)).join(' .. '),
    normalised: fixed,
    worstResidual: +worst.toFixed(4),
    // Does u run along x and v along z, or is it turned / mirrored?
    du: pu ? [+(pu[0] * w).toFixed(3), +(pu[1] * d).toFixed(3)] : null,
    dv: pv ? [+(pv[0] * w).toFixed(3), +(pv[1] * d).toFixed(3)] : null,
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('cloud', 15), pad('verts', 7), pad('uv range before', 22),
  pad('fixed', 7), pad('residual', 10), pad('u(dx,dz)', 18), 'v(dx,dz)')
for (const r of rows) {
  if (r.note) { console.log(pad(r.id, 15), r.note); continue }
  console.log(pad(r.id, 15), pad(r.faceVerts, 7), pad(r.uvBefore, 22),
    pad(r.normalised, 7), pad(r.worstResidual, 10),
    pad(JSON.stringify(r.du), 18), JSON.stringify(r.dv))
}
