// Re-cut the supplied Grid_*.fbx tiles onto a TRUE module.
//
// The supplied files set out to the PANEL and hang the tee rails outside it, so
// the module comes out as panel + flange — 617 or 632 mm instead of 600 — and a
// "1200" tile is 39 mm short of two 600s. Two consequences on a ceiling: blocks
// cannot be laid without a joint, and the two sizes cannot be mixed at all.
//
// This reads each file, keeps ITS OWN tee profile and panel — the geometry is
// the product and is worth keeping — and rebuilds the setting-out around them:
//
//   * rail centres on a true 600 (and 1200) module, so a long tile is exactly
//     two short ones and everything lands on one grid
//   * the flange at its nominal width; the files measure 15.85 and 26.62 where
//     they are named 15 and 24
//   * the panel at 595 x 595 (1195 x 595), inside the module and resting on the
//     flanges, which is what a lay-in tile does and what the filenames claim
//   * the long axis on X, so nothing has to be turned on load
//   * a planar UV on the panel, 0..1 across the tile, replacing the box unwrap
//     that had the room face sampling a quarter of the panel photo
//
// The ORIGINALS ARE NOT TOUCHED. Output is a .glb beside them in corrected/, so
// the supplied files stay exactly as delivered and this can be thrown away the
// day a corrected export arrives.
//
//   node scripts/fix-tile-models.mjs

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

// FBXLoader and GLTFExporter both reach for browser globals; these stubs are
// the same ones build-manifest and build-tile-model use.
globalThis.self = globalThis
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => { this.result = ab; this.onloadend && this.onloadend() })
    }
  }
}
if (!globalThis.document) {
  const stub = () => ({
    style: {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null },
    appendChild(c) { return c }, removeChild(c) { return c }, getContext: () => null,
  })
  globalThis.document = { createElement: stub, createElementNS: stub, createTextNode: () => ({}) }
}
if (typeof globalThis.URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = () => 'blob:stub'
  globalThis.URL.revokeObjectURL = () => {}
}

import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const SRC = path.join('public', 'models', 'ceiling_tiles')
const OUT = path.join(SRC, 'corrected')

/** The setting-out every tile is put onto. Nominal, which is the point. */
export const TRUE = {
  '600x600': { module: { x: 600, z: 600 }, tile: { x: 595, z: 595 } },
  '1200x600': { module: { x: 1200, z: 600 }, tile: { x: 1195, z: 595 } },
}

const V = () => new THREE.Vector3()
const box = (o) => new THREE.Box3().setFromObject(o)

/**
 * Sort a supplied tile into its panel and its four rails.
 *
 * By shape, not by name: the panel is the flat one with real plan area, a rail
 * is long and narrow. The files also name their meshes Object_527 upward from
 * a numbering that changes with every export.
 */
function parts(root) {
  const meshes = []
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o) })
  const sized = meshes.map((m) => ({ m, b: box(m), s: box(m).getSize(V()) }))
  // the panel is the one whose two plan dimensions are both large
  const panel = sized.reduce((a, b) =>
    (Math.min(a.s.x, a.s.z) > Math.min(b.s.x, b.s.z) ? a : b))
  const rails = sized.filter((r) => r !== panel)
  return { panel, rails }
}

/** Rail centre to rail centre, per axis — what the file is actually set out to. */
function measure(rails) {
  const cx = []; const cz = []
  for (const r of rails) {
    const c = r.b.getCenter(V())
    if (r.s.z > r.s.x) cx.push(c.x); else cz.push(c.z)
  }
  const step = (v) => (v.length < 2 ? null : Math.max(...v) - Math.min(...v))
  const flange = rails.map((r) => Math.min(r.s.x, r.s.z)).sort((a, b) => a - b)
  return {
    module: { x: step(cx), z: step(cz) },
    flange: flange[Math.floor(flange.length / 2)],
  }
}

/** A planar UV across the geometry's own plan, which is what a panel photo wants. */
function planarUV(g) {
  g.computeBoundingBox()
  const b = g.boundingBox
  const sx = Math.max(1e-9, b.max.x - b.min.x)
  const sz = Math.max(1e-9, b.max.z - b.min.z)
  const p = g.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - b.min.x) / sx
    uv[i * 2 + 1] = (p.getZ(i) - b.min.z) / sz
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Bake a mesh's world transform into a geometry of its own. */
function baked(m) {
  const g = m.geometry.clone()
  g.applyMatrix4(m.matrixWorld)
  return g
}

/** Scale a geometry about a point, per axis. */
function scaleAbout(g, sx, sy, sz, cx, cy, cz) {
  g.translate(-cx, -cy, -cz)
  g.scale(sx, sy, sz)
  g.translate(cx, cy, cz)
}

async function fix(file, sizeKey, gridMm, turn) {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const b = fs.readFileSync(path.join(SRC, file))
  const root = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  // The 1200s run their long axis down Z. Turned here, once, so the corrected
  // file needs no turning on load.
  if (turn) root.rotation.y = Math.PI / 2
  root.updateMatrixWorld(true)

  const { panel, rails } = parts(root)
  const was = measure(rails)
  const want = TRUE[sizeKey]

  const out = new THREE.Group()
  out.name = 'CeilingTile'

  // ---- the panel: to nominal, centred, planar UV -----------------------------
  const pg = baked(panel.m)
  const pc = panel.b.getCenter(V())
  scaleAbout(pg, want.tile.x / panel.s.x, 1, want.tile.z / panel.s.z, pc.x, pc.y, pc.z)
  pg.translate(-pc.x, 0, -pc.z)
  // Normals must point at the room. The supplied panels are solid boxes wound
  // correctly, but this is cheap and makes the output independent of that.
  pg.computeVertexNormals()
  planarUV(pg)
  const panelMesh = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({
    name: 'Main Panel', color: 0xbbbbbb, roughness: 0.8, metalness: 0,
  }))
  panelMesh.name = 'Panel'
  out.add(panelMesh)

  // ---- the rails: THEIR profile, on a true module ----------------------------
  // Each rail keeps its own cross-section shape, narrowed to the nominal flange,
  // and is re-cut to the length the true module needs. Then it is placed on the
  // module line rather than outside the panel.
  const k = gridMm / was.flange              // 24 / 26.62, or 15 / 15.85
  // Which side of the tile a rail is on, measured against the tile's OWN
  // centre. Against the origin it is meaningless: these files are modelled at
  // ceiling height and off to one side, so both rails of a pair can share a
  // sign and end up stacked on top of each other.
  const mid = box(root).getCenter(V())
  const railMat = new THREE.MeshStandardMaterial({
    name: 'Frame', color: 0x0b0b0b, roughness: 0.55, metalness: 0.25,
  })
  const outer = { x: want.module.x + gridMm, z: want.module.z + gridMm }
  let n = 0
  for (const r of rails) {
    const alongZ = r.s.z > r.s.x
    const g = baked(r.m)
    const c = r.b.getCenter(V())
    // narrow the profile to the nominal flange, and re-cut the length
    const lenNow = alongZ ? r.s.z : r.s.x
    const lenWant = alongZ ? outer.z : outer.x
    scaleAbout(g, alongZ ? k : lenWant / lenNow, k, alongZ ? lenWant / lenNow : k,
      c.x, c.y, c.z)
    // and put it ON the module line
    const half = alongZ ? want.module.x / 2 : want.module.z / 2
    const side = alongZ
      ? (c.x >= mid.x ? 1 : -1)
      : (c.z >= mid.z ? 1 : -1)
    // On the module line in the axis it spaces, and on the ORIGIN in the other
    // — which is where the panel was just put. Sending it to the model's own
    // centre instead leaves the rails in the file's frame and the panel in the
    // origin's, and they come out mirrored about 1.2 m apart.
    g.translate(
      alongZ ? side * half - c.x : -c.x,
      0,
      alongZ ? -c.z : side * half - c.z,
    )
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, railMat)
    m.name = `Rail${++n}`
    out.add(m)
  }

  // ---- put the tile face at y = 0, centred ----------------------------------
  const whole = box(out)
  const c = whole.getCenter(V())
  for (const m of out.children) {
    m.geometry.translate(-c.x, -whole.max.y, -c.z)
    m.geometry.computeBoundingBox()
  }

  const after = measure(parts(out).rails)
  const pb = box(parts(out).panel.m).getSize(V())
  return { out, was, after, panelWas: panel.s, panelNow: pb, want }
}

const JOBS = [
  ['Grid_600x600mm _15mm.fbx', '600x600', 15, false, 'Tile 600x600 15mm.glb'],
  ['Grid_600x600mm _24mm.fbx', '600x600', 24, false, 'Tile 600x600 24mm.glb'],
  ['Grid_600x1200mm _15mm.fbx', '1200x600', 15, true, 'Tile 1200x600 15mm.glb'],
  ['Grid_600x1200mm _24mm.fbx', '1200x600', 24, true, 'Tile 1200x600 24mm.glb'],
]

export async function buildCorrected({ quiet = false } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a) }
  fs.mkdirSync(OUT, { recursive: true })
  const done = []
  for (const [file, sizeKey, gridMm, turn, outFile] of JOBS) {
    const r = await fix(file, sizeKey, gridMm, turn)
    const glb = await new Promise((res, rej) => {
      new GLTFExporter().parse(r.out, res, rej, { binary: true })
    })
    const dst = path.join(OUT, outFile)
    fs.writeFileSync(dst, Buffer.from(glb))
    const f = (n) => (n == null ? '   —  ' : n.toFixed(1).padStart(7))
    say(`  ${outFile}`)
    say(`     module  ${f(r.was.module.x)} x ${f(r.was.module.z)}  ->  `
      + `${f(r.after.module.x)} x ${f(r.after.module.z)}   (want ${r.want.module.x} x ${r.want.module.z})`)
    say(`     panel   ${f(r.panelWas.x)} x ${f(r.panelWas.z)}  ->  `
      + `${f(r.panelNow.x)} x ${f(r.panelNow.z)}   (want ${r.want.tile.x} x ${r.want.tile.z})`)
    say(`     flange  ${f(r.was.flange)}          ->  ${f(gridMm)}`)
    done.push({ file: outFile, ...r.want })
  }
  return done
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log('Re-cutting the supplied tiles onto a true module (originals untouched)\n')
  await buildCorrected()
  console.log('\nWritten to ' + OUT)
}
