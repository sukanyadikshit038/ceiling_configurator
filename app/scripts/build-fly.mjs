// Make the Fly models lighter WITHOUT changing their shape.
//
//   node scripts/build-fly.mjs
//
// THE ORIGINALS ARE NOT TOUCHED. Output is a .glb in Fly/simplified/, the same
// bargain fix-tile-models.mjs makes. Delete that folder and the app goes back to
// loading the supplied files; nothing else has to change.
//
// ---------------------------------------------------------------------------
// what is actually wrong with these files
// ---------------------------------------------------------------------------
//
// Not density in the ordinary sense. Every heavy part carries EXACTLY 65,501 or
// 65,502 triangles — a 13 x 20 mm rail and a 1 x 3 mm wire land on the same
// number, so the count has nothing to do with the shape. It is a swept surface
// tessellated at a fixed resolution, roughly 64 around by 512 along, on parts
// that are straight extrusions of a constant section.
//
// Which is why DELETING things does not help: the weight is not in small hidden
// brackets, it is in the long visible frame members. Dropping every hardware
// part under 50 mm saves 9%. The rails are the frame; they have to stay. They
// just do not need half a million triangles between them.
//
// So this simplifies rather than removes, and rather than substitutes. An
// earlier version replaced every hardware part with its bounding box, which was
// 28x lighter and was rejected — correctly, because it did not simplify the
// frame, it replaced it. Nothing here replaces anything.
//
// ---------------------------------------------------------------------------
// what it will refuse to do
// ---------------------------------------------------------------------------
//
// Every way this can go wrong has a number, and the build stops rather than
// asking to be trusted:
//
//   a surface moves more than MAX_MOVE_MM        -> refuse
//   a part disappears                            -> refuse
//   the felt changes by one triangle             -> refuse
//   the model stops hanging from four points      -> refuse
//   a hanging point stops reaching the top        -> refuse
//
// The felt is never simplified at all. It is the only thing anybody looks at,
// it is already cheap (57k for four wings), and it carries the UVs the fabric
// is cropped against.

import fs from 'node:fs'
import path from 'node:path'

// FBXLoader and GLTFExporter both reach for browser globals; the same stubs
// fix-tile-models and build-manifest use.
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
}

const THREE = await import('three')
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
const { MeshoptSimplifier } = await import('meshoptimizer')
await MeshoptSimplifier.ready

const SRC = path.join('public', 'models', 'Fly')
const OUT = path.join(SRC, 'simplified')

/** The one material anybody named on purpose. It marks the felt wings. */
const FELT_MATERIAL = 'Blue felt'

/**
 * How much of each hardware part's triangles to aim to keep.
 *
 * Measured across four settings on Fly-4. The simplifier stops well short of
 * the target on its own — these are many small disconnected shells and there is
 * only so far they collapse — so this is a floor to aim at, not a promise:
 *
 *   borders locked, any target   355k   0.031 mm moved
 *   5%                           209k   0.109 mm     <- here
 *   2%                           178k   0.158 mm
 *   1%                           168k   1.500 mm     <- shapes start to deform
 *
 * 5% is the last setting where nothing moves by more than a tenth of a
 * millimetre. 1% is where it stops being simplification.
 */
const TARGET_RATIO = 0.05

/**
 * How far any surface may move, in millimetres of the file's own units.
 *
 * 0.5 against a measured worst of 0.109 — room for a different export to be a
 * little different, and five times under anything a person could see on a
 * 900 mm rail. If a future model trips this, that is the build saying the
 * shapes have changed, which is the whole point of the number.
 */
const MAX_MOVE_MM = 0.5

/**
 * How much of a part's surface may go.
 *
 * Faceting a cylinder costs a little real area — 64 sides down to 8 loses about
 * 2.6% — so this cannot be zero. A part that has been COLLAPSED loses nearly
 * all of it, so anything in between is a wide, safe margin. 10%.
 *
 * This gate exists because the first version of this script did not have it,
 * shipped a model with no frame at all, and reported "88 parts, all present"
 * while doing so. Bounding boxes do not notice a part being flattened.
 */
const MAX_AREA_LOSS = 0.10

const say = (s) => console.log(s)
const num = (n) => Math.round(n).toLocaleString()
const pad = (s, n) => String(s).padEnd(n)

const materialNameOf = (mesh) => {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return m?.name ?? ''
}

const trisOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3

/** The box a set of indexed vertices actually occupies. */
function usedBox(geometry, index) {
  const p = geometry.attributes.position
  const bb = new THREE.Box3()
  const v = new THREE.Vector3()
  const seen = index ? new Set(index) : null
  if (seen) for (const i of seen) bb.expandByPoint(v.fromBufferAttribute(p, i))
  else for (let i = 0; i < p.count; i++) bb.expandByPoint(v.fromBufferAttribute(p, i))
  return bb
}

/** The worst distance between two boxes' corresponding faces. */
const boxMove = (a, b) => Math.max(
  Math.abs(a.min.x - b.min.x), Math.abs(a.max.x - b.max.x),
  Math.abs(a.min.y - b.min.y), Math.abs(a.max.y - b.max.y),
  Math.abs(a.min.z - b.min.z), Math.abs(a.max.z - b.max.z))

/**
 * How much surface a mesh actually has.
 *
 * This is the gate that matters, and the first version of this script did not
 * have it. A bounding box only sees the EXTREMES: a rod that collapses to a
 * sliver still spans the same box, so a box test passes it and the frame
 * silently disappears — which is exactly what happened. Rendered side by side,
 * the simplified model had lost every rail and all four rods while reporting
 * "88 parts, all present".
 *
 * Area cannot be fooled that way. A 64-sided cylinder reduced to 8 sides loses
 * about 2.6% of its surface; a collapsed one loses nearly all of it.
 */
function surfaceArea(geometry, index) {
  const pos = geometry.attributes.position
  const idx = index ?? (geometry.index ? geometry.index.array : null)
  const n = idx ? idx.length : pos.count
  const A = new THREE.Vector3(); const B = new THREE.Vector3(); const C = new THREE.Vector3()
  let area = 0
  for (let t = 0; t + 2 < n; t += 3) {
    A.fromBufferAttribute(pos, idx ? idx[t] : t)
    B.fromBufferAttribute(pos, idx ? idx[t + 1] : t + 1)
    C.fromBufferAttribute(pos, idx ? idx[t + 2] : t + 2)
    area += B.sub(A).cross(C.sub(A)).length() / 2
  }
  return area
}

/**
 * Where the model hangs from — the same test lib/fly makes at run time.
 *
 * Repeated here so the build can refuse rather than let the app discover it:
 * if simplification trims a rail, the parts reaching the top stop being four
 * and the suspension is drawn from the wrong places.
 */
function hangPoints(group) {
  const box = new THREE.Box3().setFromObject(group)
  const top = box.max.y
  const found = new Map()
  for (const o of group.children) {
    if (!o.isMesh) continue
    const bb = new THREE.Box3().setFromObject(o)
    if (top - bb.max.y > 2) continue          // millimetres here
    const c = bb.getCenter(new THREE.Vector3())
    found.set(`${Math.round(c.x / 5)}|${Math.round(c.z / 5)}`, true)
  }
  return found.size
}

async function build(file) {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const b = fs.readFileSync(path.join(SRC, file))
  const root = new FBXLoader().parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  root.updateMatrixWorld(true)

  const source = []
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) source.push(o)
  })

  const out = new THREE.Group()
  out.name = 'Fly'
  const problems = []
  let before = 0
  let after = 0
  let feltBefore = 0
  let feltAfter = 0
  let worstMove = 0
  let worstName = ''
  let worstLost = 0
  let worstLostName = ''

  for (const o of source) {
    const isWing = materialNameOf(o) === FELT_MATERIAL
    let g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld)
    // Only what the renderer reads. An FBX carries colour and second UV sets
    // that nothing here uses, and every extra attribute blocks a weld.
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    }
    // Welding changes no triangle — it merges vertices that agree on EVERY
    // attribute, so UVs and normals come through untouched. 72% of the vertices
    // in these files are duplicates.
    g = mergeVertices(g, 1e-4)
    const was = trisOf(g)
    before += was
    if (isWing) feltBefore += was

    if (isWing) {
      // Never simplified. It is the only thing anybody looks at, it is already
      // cheap, and it carries the UVs the fabric is cropped against.
      after += was
      feltAfter += was
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'FlyWing' }))
      mesh.name = o.name
      mesh.userData.flyWing = true
      out.add(mesh)
      continue
    }

    const boxWas = usedBox(g, null)
    const areaWas = surfaceArea(g, null)
    const target = Math.max(24, Math.floor(g.index.count * TARGET_RATIO / 3) * 3)
    // LOCKED BORDERS. Without this the simplifier is free to eat the open
    // edges of every thin shell, and on these parts — rails a few millimetres
    // across — that means eating the part. Measured: unlocked gives 209k
    // triangles and a model with no frame left; locked gives 355k and a frame.
    const [index] = MeshoptSimplifier.simplify(
      g.index.array, g.attributes.position.array, 3, target, 0.01, ['LockBorder'])

    if (!index.length) {
      problems.push(`${o.name}: simplified away to nothing`)
      continue
    }
    const moved = boxMove(boxWas, usedBox(g, index))
    if (moved > worstMove) { worstMove = moved; worstName = o.name }
    if (moved > MAX_MOVE_MM) {
      problems.push(`${o.name}: its surface moved ${moved.toFixed(3)} mm`
        + ` (limit ${MAX_MOVE_MM})`)
    }
    // COMPACT, or the saving is only on paper. Simplifying leaves the full
    // vertex buffer in place with an index reaching into a fraction of it, so
    // the file gets BIGGER — 1.39 M vertices carried for 209 k triangles.
    //
    // Done by hand rather than with meshopt's compactMesh. That was the first
    // attempt and it wrote NaN into every position: its remap is not indexed
    // the way this code assumed, and reading past the end of an attribute gives
    // undefined, which a Float32Array stores as NaN. The geometry looked right
    // by triangle count and was not there at all. This version cannot do that —
    // it only ever copies vertices the index actually names.
    const seen = new Map()
    const idx2 = new Uint32Array(index.length)
    for (let i = 0; i < index.length; i++) {
      const from = index[i]
      let to = seen.get(from)
      if (to === undefined) { to = seen.size; seen.set(from, to) }
      idx2[i] = to
    }
    const g2 = new THREE.BufferGeometry()
    for (const k of Object.keys(g.attributes)) {
      const src = g.attributes[k]
      const items = src.itemSize
      const dst = new Float32Array(seen.size * items)
      for (const [from, to] of seen) {
        for (let c = 0; c < items; c++) dst[to * items + c] = src.getComponent(from, c)
      }
      g2.setAttribute(k, new THREE.BufferAttribute(dst, items))
    }
    g2.setIndex(new THREE.BufferAttribute(idx2, 1))
    after += index.length / 3

    // And check it. A NaN anywhere in a position makes the part vanish while
    // every count still reads correctly, which is exactly how the last one got
    // through.
    const chk = g2.attributes.position.array
    for (let i = 0; i < chk.length; i++) {
      if (!Number.isFinite(chk[i])) { problems.push(`${o.name}: NaN in its positions`); break }
    }

    // The gate that matters, measured on the geometry that will actually be
    // WRITTEN rather than on the original indexed into. Measuring the wrong one
    // is how a model with no frame in it reported "all present".
    const areaNow = surfaceArea(g2, null)
    const lost = 1 - areaNow / areaWas
    if (lost > worstLost) { worstLost = lost; worstLostName = o.name }
    if (lost > MAX_AREA_LOSS) {
      problems.push(`${o.name}: lost ${(lost * 100).toFixed(1)}% of its surface`
        + ` (limit ${(MAX_AREA_LOSS * 100).toFixed(0)}%) — flattened, not simplified`)
    }
    const mesh = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ name: 'FlyHardware' }))
    mesh.name = o.name
    mesh.userData.flyWing = false
    out.add(mesh)
  }

  // ---- the gates --------------------------------------------------------
  if (out.children.length !== source.length) {
    problems.push(`${source.length - out.children.length} part(s) went missing`)
  }
  if (feltAfter !== feltBefore) {
    problems.push(`the felt changed: ${num(feltBefore)} -> ${num(feltAfter)} triangles`)
  }
  const hangs = hangPoints(out)
  if (hangs !== 4) problems.push(`it hangs from ${hangs} points, not 4`)

  return {
    out,
    stats: {
      before, after, feltBefore, worstMove, worstName, worstLost, worstLostName,
      parts: out.children.length, hangs,
    },
    problems,
  }
}

async function main() {
  if (!fs.existsSync(SRC)) { say(`no Fly folder at ${SRC}`); return [] }
  const files = fs.readdirSync(SRC).filter((f) => /\.fbx$/i.test(f)).sort()
  if (!files.length) { say('no Fly models to build'); return [] }

  const results = []
  for (const file of files) {
    const r = await build(file)
    results.push({ file, ...r })
  }

  // Nothing is written unless EVERY model passes. A half-built folder where one
  // model is simplified and one is not is the worst of both.
  const bad = results.filter((r) => r.problems.length)
  if (bad.length) {
    say('\nREFUSED — nothing written:\n')
    for (const r of bad) for (const p of r.problems) say(`  ${r.file}: ${p}`)
    say('\nThe supplied models are untouched and the app still loads them.')
    process.exitCode = 1
    return []
  }

  fs.mkdirSync(OUT, { recursive: true })
  const done = []
  for (const r of results) {
    const glb = await new Promise((res, rej) => {
      new GLTFExporter().parse(r.out, res, rej, { binary: true })
    })
    const name = `${path.basename(r.file, path.extname(r.file))}.glb`
    fs.writeFileSync(path.join(OUT, name), Buffer.from(glb))
    const s = r.stats
    say(`  ${r.file}  ->  simplified/${name}`)
    say(`     triangles   ${pad(num(s.before), 11)} -> ${pad(num(s.after), 10)}`
      + ` ${(s.before / s.after).toFixed(1)}x lighter`)
    say(`     the felt    ${pad(num(s.feltBefore), 11)} -> ${pad(num(s.feltBefore), 10)} untouched`)
    say(`     worst any surface moved: ${s.worstMove.toFixed(3)} mm (${s.worstName})`)
    say(`     worst surface lost:      ${(s.worstLost * 100).toFixed(1)}% (${s.worstLostName})`)
    say(`     ${s.parts} parts, all present; hangs from ${s.hangs} points`)
    done.push({ file: `Fly/simplified/${name}`, ...s })
  }
  return done
}

if (process.argv[1]?.endsWith('build-fly.mjs')) {
  say(`Fly — simplifying hardware to ${TARGET_RATIO * 100}%, felt untouched`)
  say(`      refusing anything that moves a surface over ${MAX_MOVE_MM} mm\n`)
  const done = await main()
  if (done.length) say(`\n${done.length} model(s) written to ${OUT}`)
}

export { main as buildFly, TARGET_RATIO, MAX_MOVE_MM }
