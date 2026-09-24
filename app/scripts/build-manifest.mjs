// Scans public/models/rooms and public/models/baffles and writes
// public/models/manifest.json — the runtime catalogue of measured assets.
//
// A browser cannot list a directory, so "drop a file in the folder and it turns
// up in the configurator" needs a manifest. Generating it from the folders (on
// dev start, on file change, and before every build) keeps the folders as the
// single source of truth. BRIEF §7 asks for exactly this shape: assets behind a
// runtime manifest, not baked into the bundle.
//
// For each file this measures what the app would otherwise have to guess:
//   baffles — overall size, mesh and triangle counts
//   rooms   — the ceiling plane: its height and extents, found by looking for
//             the topmost large flat horizontal surface
//
// Two real-world export faults are corrected AND reported, because the right
// answer is a corrected re-export, not a silent fix in the loader:
//   units    — a model over 50 units across is read as millimetres; one under
//              half a metre as a stray 0.001 in the export
//   position — a room need not be modelled at the origin, but the grid, the
//              cameras and every saved cell coordinate are

import * as THREE from 'three'
import fs from 'fs'
import path from 'path'

/**
 * Is this path one of the files the manifest is built from?
 *
 * Lives here, beside the scanner, because the dev server's watcher has to agree
 * with it — and once did not. The watcher matched a single path segment under
 * rooms/ and baffles/, which was right when a baffle was one file in one
 * folder. Baffles are now filed as <Type>/<Shape>.fbx, a level deeper, so
 * nothing dropped in there ever triggered a rebuild: the file was on disk, the
 * manifest was stale, and the app showed the shape greyed out with no clue why.
 *
 * Any depth below rooms/ or baffles/, and either separator, because this runs
 * on Windows too.
 */
export { isModelFile } from './model-files.mjs'
import { isModelFile } from './model-files.mjs'

// FBXLoader reaches for browser globals. We only ever want geometry bounds from
// it, never pixels — so these stubs exist to stop the texture path from
// throwing, not to make it work.
//
// The stub element needs addEventListener: an FBX with an embedded texture that
// has no filename makes FBXLoader build a placeholder image and attach load
// handlers to it. Without those methods the survey throws and the file is
// skipped, which looks exactly like "my model does not show up".
globalThis.self = globalThis
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => { this.result = ab; this.onloadend && this.onloadend() })
    }
  }
}
if (!globalThis.document) {
  const stubElement = () => ({
    style: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null },
    appendChild(c) { return c },
    removeChild(c) { return c },
    getContext: () => null,
  })
  globalThis.document = {
    createElement: stubElement,
    createElementNS: stubElement,
    createTextNode: () => ({}),
  }
}
if (typeof globalThis.URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = () => 'blob:stub'
  globalThis.URL.revokeObjectURL = () => {}
}

const MODELS = 'public/models'
const ROOMS = path.join(MODELS, 'rooms')
const BAFFLES = path.join(MODELS, 'baffles')
const OUT = path.join(MODELS, 'manifest.json')
const TILE_MODELS = path.join(MODELS, 'ceiling_tiles')
const CLOUD_MODELS_DIR = path.join(MODELS, 'Cloud')
// Fly prefers its SIMPLIFIED folder and falls back to the supplied files.
//
// scripts/build-fly.mjs reduces the frame's tessellation without changing its
// shape — every part kept, the felt untouched, and the build refusing outright
// if any surface moves more than half a millimetre. Delete the folder and the
// supplied 39 and 73 MB files load instead; nothing else has to change.
const FLY_MODELS_DIR = path.join(MODELS, 'Fly')
const FLY_SIMPLIFIED_DIR = path.join(FLY_MODELS_DIR, 'simplified')
// The tile finishes for ONE category. The tree is
//   textures/ceiling-tiles/<category>/<range>/<size>/<file>
// and only wood-classic is wired up: univicstrip is in the tree but its
// panels have the strip pattern baked into them, so the range is waiting on
// images that separate the two.
const TILE_TEX = path.join('public', 'textures', 'ceiling-tiles', 'wood-classic')
const TILE_TEX_OUT = path.join(TILE_TEX, 'manifest.json')

/**
 * The tile finishes, read off the folders.
 *
 * Two ranges that combine: a Wood Classic base, and a perforation laid over it.
 * Read rather than transcribed, so dropping a file in adds a finish — the same
 * bargain the model folders make.
 *
 * A code is the part of the filename before the first underscore. The rest of
 * the name is the panel's size in MILLIMETRES, not pixels, and it cannot be
 * trusted: three of the Wood Classic files are named 1195x1195 while being 2:1
 * images, and every file in the folder disagrees with its own name about pixel
 * size. The folder says what size the panel is; the name is decoration.
 */
const TEX_RE = /\.(jpe?g|png|webp)$/i

/** The size folders that actually exist, newest convention first. */
function listTileSizes() {
  const dir = path.join(TILE_TEX, 'WoodClassic')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+x\d+$/.test(e.name))
    .map((e) => e.name)
    // smallest module first, so the picker offers 600x600 before 1200x600
    .sort((a, b) => {
      const area = (n) => n.split('x').reduce((x, y) => x * Number(y), 1)
      return area(a) - area(b)
    })
}

function listTileFinishes(range, size) {
  const dir = path.join(TILE_TEX, range, size)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => TEX_RE.test(f))            // Thumbs.db and friends are not finishes
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({
      code: file.split('_')[0],
      file: `${range}/${size}/${file}`,
      bytes: fs.statSync(path.join(dir, file)).size,
      ...(jpegSizeOf(path.join(dir, file)) ?? {}),
    }))
}

/** Pixel size from a JPEG header, so the manifest can warn about the big ones. */
function jpegSizeOf(file) {
  let b
  try { b = fs.readFileSync(file) } catch { return null }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
    const len = b.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { px: [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)] }
    }
    if (len < 2) return null
    i += 2 + len
  }
  return null
}
const MODEL_RE = /\.(glb|gltf|fbx)$/i

const quiet = process.argv.includes('--quiet')
const say = (...a) => { if (!quiet) console.log(...a) }

const titleOf = (id) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const idOf = (file) => path.basename(file).replace(MODEL_RE, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------------------
// GLB survey — reads the glTF JSON chunk directly
// ---------------------------------------------------------------------------
// GLTFLoader needs browser APIs for textures, and we do not need the pixels:
// accessor min/max already carry every primitive's bounding box, so the whole
// survey is arithmetic on the header. That is what keeps a 90 MB room fast.

function readGLB(file) {
  const b = fs.readFileSync(file)
  if (b.slice(0, 4).toString() !== 'glTF') throw new Error('not a binary GLB')
  const jsonLen = b.readUInt32LE(12)
  return JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'))
}

const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function mul(a, b) {
  const o = new Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = s
    }
  }
  return o
}

function localMatrix(n) {
  if (n.matrix) return n.matrix.slice()
  const t = n.translation || [0, 0, 0]
  const q = n.rotation || [0, 0, 0, 1]
  const s = n.scale || [1, 1, 1]
  const [x, y, z, w] = q
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}

const xf = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]

/** Every primitive's world-space AABB, plus mesh and triangle counts. */
function surveyGLB(file) {
  const gltf = readGLB(file)
  const prims = []
  let meshes = 0
  let tris = 0
  const walk = (ni, parent) => {
    const n = gltf.nodes[ni]
    const m = mul(parent, localMatrix(n))
    if (n.mesh !== undefined) {
      for (const p of gltf.meshes[n.mesh].primitives) {
        const acc = gltf.accessors[p.attributes.POSITION]
        meshes++
        tris += (p.indices !== undefined ? gltf.accessors[p.indices].count : acc.count) / 3
        if (!acc.min || !acc.max) continue
        const mn = [Infinity, Infinity, Infinity]
        const mx = [-Infinity, -Infinity, -Infinity]
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            for (let c = 0; c < 2; c++) {
              const w = xf(m, [a ? acc.max[0] : acc.min[0], b ? acc.max[1] : acc.min[1], c ? acc.max[2] : acc.min[2]])
              for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]) }
            }
          }
        }
        prims.push({ min: mn, max: mx })
      }
    }
    for (const c of n.children || []) walk(c, m)
  }
  for (const n of gltf.scenes[gltf.scene ?? 0].nodes) walk(n, I4())
  return { prims, meshes, tris: Math.round(tris) }
}

async function surveyFBX(file) {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const b = fs.readFileSync(file)
  const root = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  root.updateMatrixWorld(true)
  const prims = []
  let meshes = 0
  let tris = 0
  // A node whose transform mirrors - negative determinant - comes out of the
  // loader's bake wound the wrong way round and renders inside-out. The loader
  // corrects it; this counts it, because the right answer is a re-export.
  let mirrored = 0
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    meshes++
    if (o.matrixWorld.determinant() < 0) mirrored++
    const g = o.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    const box = new THREE.Box3().setFromObject(o)
    prims.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] })
  })
  return { prims, meshes, tris: Math.round(tris), mirrored }
}

const survey = (file) => (/\.fbx$/i.test(file) ? surveyFBX(file) : Promise.resolve(surveyGLB(file)))

function bounds(prims) {
  const mn = [Infinity, Infinity, Infinity]
  const mx = [-Infinity, -Infinity, -Infinity]
  for (const p of prims) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.min[k]); mx[k] = Math.max(mx[k], p.max[k]) }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] }
}

// ---------------------------------------------------------------------------
// corrections
// ---------------------------------------------------------------------------

/**
 * Real export settings go wrong in both directions, and a browser cannot tell
 * you why the room came out blank or invisible.
 */
function unitCorrection(size) {
  const max = Math.max(...size)
  if (!Number.isFinite(max) || max === 0) return { scale: 1, fix: null }
  if (max > 200) return { scale: 0.001, fix: 'read as millimetres (×0.001)' }
  if (max < 0.5) return { scale: 1000, fix: 'read as a stray 0.001 in the export (×1000)' }
  return { scale: 1, fix: null }
}

/**
 * The ceiling plane: the topmost large flat horizontal surface.
 *
 * "Large" is relative to the model's own footprint, so it works for a 4 m
 * meeting room and a 25 m hall alike. A single flat light fitting up near the
 * slab is small and gets skipped; the slab itself is not.
 */
function detectCeiling(prims, b, scale) {
  const area = (p) => (p.max[0] - p.min[0]) * (p.max[2] - p.min[2])
  const modelArea = b.size[0] * b.size[2]
  const flatEps = Math.max(1e-4, b.size[1] * 0.01)

  const candidates = prims.filter((p) => {
    const thin = p.max[1] - p.min[1] <= flatEps
    const big = area(p) >= modelArea * 0.12
    const high = p.min[1] > b.min[1] + b.size[1] * 0.45
    return thin && big && high
  })

  if (candidates.length) {
    const top = candidates.reduce((best, p) => (p.min[1] > best.min[1] ? p : best))
    return {
      y: top.min[1] * scale,
      minX: top.min[0] * scale, maxX: top.max[0] * scale,
      minZ: top.min[2] * scale, maxZ: top.max[2] * scale,
      detected: true,
    }
  }

  // No slab quad. Fall back to the model's own top face and say so — the app
  // shows a warning rather than pretending the number was measured.
  return {
    y: b.max[1] * scale,
    minX: b.min[0] * scale, maxX: b.max[0] * scale,
    minZ: b.min[2] * scale, maxZ: b.max[2] * scale,
    detected: false,
  }
}

const round = (v, n = 3) => +v.toFixed(n)

// ---------------------------------------------------------------------------
// entries
// ---------------------------------------------------------------------------

async function roomEntry(dir, file) {
  const full = path.join(dir, file)
  const { prims, meshes, tris } = await survey(full)
  if (!prims.length) throw new Error('no measurable geometry')
  const b = bounds(prims)
  const { scale, fix } = unitCorrection(b.size)

  const c = detectCeiling(prims, b, scale)
  // Centre the ceiling on the origin: the grid, the camera presets and every
  // saved cell coordinate assume it is there.
  const cx = (c.minX + c.maxX) / 2
  const cz = (c.minZ + c.maxZ) / 2
  const ceiling = {
    y: round(c.y),
    minX: round(c.minX - cx), maxX: round(c.maxX - cx),
    minZ: round(c.minZ - cz), maxZ: round(c.maxZ - cz),
    detected: c.detected,
  }

  const id = idOf(file)
  const entry = {
    id,
    name: titleOf(id),
    file: `rooms/${file}`,
    bytes: fs.statSync(full).size,
    meshes,
    tris,
    size: { x: round(b.size[0] * scale), y: round(b.size[1] * scale), z: round(b.size[2] * scale) },
    ceiling,
    pitch: 0.3,
    unitScale: scale,
    unitFix: fix,
    offset: { x: round(-cx), z: round(-cz) },
  }

  const notes = []
  if (fix) notes.push(fix)
  if (!c.detected) notes.push('no flat ceiling quad found — using the top face')
  if (Math.abs(cx) > 0.5 || Math.abs(cz) > 0.5) notes.push(`recentred from (${round(cx, 1)}, ${round(cz, 1)})`)
  if (tris > 1_500_000) notes.push(`${tris.toLocaleString('en-US')} tris — over the 1.5M budget (BRIEF §7)`)
  if (entry.bytes > 20 * 1024 * 1024) notes.push(`${(entry.bytes / 1024 / 1024).toFixed(0)} MB — slow first load from S3`)
  say(`    room  ${id.padEnd(18)} ${ceiling.y.toFixed(2)} m clear, ` +
      `${(ceiling.maxX - ceiling.minX).toFixed(1)}×${(ceiling.maxZ - ceiling.minZ).toFixed(1)} m` +
      (notes.length ? `\n            ! ${notes.join('\n            ! ')}` : ''))
  return entry
}

/**
 * The run inside a baffle file: how many fins, how big one is, how far apart.
 *
 * Measured through the same loader the app uses, so the manifest cannot
 * disagree with what gets rendered. Null for a file that is not a run of fins.
 */
async function surveyFins(full, unitScale) {
  try {
    const { loadWhole } = await import('../src/lib/models.js')
    const b = fs.readFileSync(full)
    const kind = /\.fbx$/i.test(full) ? 'fbx' : 'glb'
    const parts = await loadWhole(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), kind, unitScale)
    const f = parts.finset
    if (!f) return null
    return {
      count: f.count,
      size: {
        length: round(f.size.length),
        depth: round(f.size.depth),
        thickness: round(f.size.thickness),
      },
      spacingMm: f.authoredSpacingMm,
      hardwarePerFin: Math.round(f.hardware.length / f.count),
      // how far the clamps reach above the fin, in the file's own metres: the
      // shallowest the run can hang before they push through the slab
      hardwareAboveFin: round(f.unit.hardwareAboveFin ?? 0, 4),
      // the hanger's cross-section in the file's own metres, or null where the
      // file uses brackets — what the renderer matches its extension rod to
      suspension: f.unit.suspension
        ? { x: round(f.unit.suspension.x, 5), z: round(f.unit.suspension.z, 5) }
        : null,
      // hangers cut back to their hook because the file modelled no wire
      hangerCuts: (f.unit.hangerCuts ?? []).map((c) => ({ hanger: c.hanger, moved: c.moved })),
      // texture coordinates generated because the file shipped none
      uvGenerated: f.unit.uvGenerated ?? null,
      // ...or rescaled because the file mapped the fin for tiling instead
      uvScaled: f.unit.uvScaled ?? null,
      // whether the fin's two faces had to be made to agree about which way a
      // texture runs; { moved: 0 } when the file already had them agreeing
      uvFix: f.unit.uvFix ?? null,
      // hanger rings straightened on load; a defect in the delivered file
      ringRepairs: (f.unit.ringRepairs ?? []).map((r) => ({
        hanger: r.hanger, moved: r.moved, of: r.of, ratio: r.ratio,
      })),
    }
  } catch (e) {
    console.error(`    fins ${path.basename(full)}: ${e.message}`)
    return null
  }
}

async function baffleEntry(dir, entry) {
  const { rel: file, type, shape } = entry
  const full = path.join(dir, file)
  const { prims, meshes, tris, mirrored = 0 } = await survey(full)
  if (!prims.length) throw new Error('no measurable geometry')
  const b = bounds(prims)
  const { scale, fix } = unitCorrection(b.size)
  // "length" is the longest horizontal run, matching how the loader normalises
  const [sx, sy, sz] = b.size.map((v) => v * scale)
  const length = Math.max(sx, sz)
  const width = Math.min(sx, sz)

  // Type AND shape, because the shape alone is not unique: Blade/Standard.fbx
  // and VMT/Standard.fbx would otherwise both be "standard".
  const id = type ? `${type}-${shape}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') : idOf(file)
  const record = {
    id,
    // what the catalogue calls this: the folder is the type, the file the shape
    type: type ? type.toLowerCase() : null,
    shape: shape ? shape.toLowerCase() : null,
    name: type ? `${type} · ${shape}` : titleOf(id),
    file: `baffles/${file}`,
    source: file,
    bytes: fs.statSync(full).size,
    meshes,
    tris,
    dims: { length: round(length), height: round(sy), width: round(width) },
    fins: await surveyFins(full, scale),
    unitScale: scale,
    unitFix: fix,
    // how many of its meshes are mirrored; corrected on load, worth re-exporting
    mirroredMeshes: mirrored,
  }
  if (record.fins) {
    say(`    baffle ${id.padEnd(17)} ${record.fins.count} fins of ` +
        `${record.fins.size.length.toFixed(2)} × ${record.fins.size.depth.toFixed(2)} × ` +
        `${record.fins.size.thickness.toFixed(3)} m at ${record.fins.spacingMm} mm, ` +
        `${record.fins.hardwarePerFin} hardware each`)
  }
  say(`    baffle ${id.padEnd(17)} ${record.dims.length.toFixed(2)} × ` +
      `${record.dims.height.toFixed(2)} × ${record.dims.width.toFixed(2)} m · ` +
      `${meshes} meshes, ${tris.toLocaleString('en-US')} tris` + (fix ? `\n            ! ${fix}` : ''))
  // A fin far larger than anything the catalogue sells is a re-export waiting to
  // happen. Reported, never corrected: everything downstream is a ratio, so the
  // over-scale cancels and nothing renders wrong — but the authored numbers are
  // not the product's, and a reader deserves to know that.
  if (record.fins) {
    const finMm = record.fins.size.length * 1000
    const biggest = 2780
    if (finMm > biggest * 2) {
      say(`            ! its fin is ${finMm.toFixed(0)} mm, ${(finMm / biggest).toFixed(1)}x the largest ` +
          `baffle the catalogue sells (${biggest} mm). Proportions still work out; the numbers are not the product's.`)
    }
  }
  if (record.fins?.hangerCuts?.length) {
    say(`            ! ${record.fins.hangerCuts.length} of its hangers are a hook and a tip with NOTHING ` +
        'between them - the file lofts one straight to the other, which draws as a spike: fat at ' +
        'the baffle, converging as it climbs, thin at the ceiling. Cut back to the hook on load and ' +
        'the wire drawn instead; the file on disk is untouched. Re-export with the wire modelled.')
  }
  if (record.fins?.uvScaled) {
    const r = record.fins.uvScaled
    say(`            ! its fin is mapped for TILING - u ${r.was.u[0]} to ${r.was.u[1]}, about ` +
        `${r.repeats} repeats - where every finish here assumes one span across the face. A ` +
        'photographed panel is clamped to its edges, so most of the fin sampled the edge texel ' +
        'and rendered in one flat colour. Rescaled to 0..1 on load; the file on disk is untouched.')
  }
  if (record.fins?.uvGenerated) {
    say(`            ! its fin ships with NO texture coordinates. A mapped material samples one ` +
        `texel without them, so every textured finish rendered as a single flat colour. A planar ` +
        `set was generated on load for ${record.fins.uvGenerated.generated} vertices; the file on ` +
        'disk is untouched. Re-export with a UV map.')
  }
  if (record.fins?.uvFix?.moved > 0) {
    say(`            ! its fin's two faces were laid out as mirror images, so a directional ` +
        `finish read one way on the front and the other on the back. ` +
        `${record.fins.uvFix.moved} vertices turned round on load; the file on disk is untouched. ` +
        'Harmless on a weave or a grain, wrong on a gradient.')
  }
  if (record.fins && record.fins.uvFix === null) {
    say('            ! its fin\'s two faces could not be made to agree — they share vertices, ' +
        'so turning the back round would drag the front with it. A directional finish will ' +
        'read the wrong way on one side. Re-export with the faces split.')
  }
  for (const r of record.fins?.ringRepairs ?? []) {
    say(`            ! hanger ${r.hanger}: ${r.moved} of ${r.of} vertices in its top ring sit ` +
        `${r.ratio}x further from the centre than the rest of the ring. That splays one ` +
        'facet of the wire open along its whole length, so one row of every run renders ' +
        'wrong while the others are clean. Straightened on load; the file on disk is ' +
        'untouched. Re-export with the ring closed.')
  }
  if (mirrored) {
    say(`            ! ${mirrored} of ${meshes} meshes have a mirrored transform - they render ` +
        'inside-out and are flipped back on load. Re-export without negative scale.')
  }
  return record
}

const listModels = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => MODEL_RE.test(f)).sort() : [])

/**
 * Baffle models, read as `baffles/<Type>/<Shape>.<ext>`.
 *
 * The folder is the catalogue type — Blade, VMT, Box, Embossed — and the file
 * is the shape within it. That is the whole registration mechanism: dropping
 * Blade/Tapered.fbx into place makes Tapered selectable, and a type or shape
 * with no file is offered as coming soon rather than silently missing.
 *
 * Files left loose in baffles/ are still read, as untyped, so an older layout
 * or a quick drop-in does not vanish.
 */
function listBaffles(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      for (const f of listModels(path.join(dir, entry.name))) {
        out.push({ rel: `${entry.name}/${f}`, type: entry.name, shape: f.replace(MODEL_RE, '') })
      }
    } else if (MODEL_RE.test(entry.name)) {
      out.push({ rel: entry.name, type: null, shape: entry.name.replace(MODEL_RE, '') })
    }
  }
  return out
}

/**
 * Survey a ceiling tile model.
 *
 * Reports what the file is made of using the same classifier the renderer uses,
 * so the two cannot disagree about which mesh is a tile. The delivered file is
 * a room's worth of ceiling rather than a tile, and most of its weight is in
 * parts that will not be drawn.
 */
async function tileEntry(dir, file) {
  const full = path.join(dir, file)
  const { classifyTileMeshes, tileSize, tileModule, railFlange } =
    await import('../src/lib/tiles.js')
  const b = fs.readFileSync(full)
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  let root
  if (/\.fbx$/i.test(full)) {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    root = new FBXLoader().parse(buf, '')
  } else if (/\.(glb|gltf)$/i.test(full)) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    root = (await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej))).scene
  } else {
    throw new Error(`no reader for ${path.extname(full)}`)
  }
  root.updateMatrixWorld(true)

  const { faces, bodies, grid, context } = classifyTileMeshes(root)
  const tris = (list) => Math.round(list.reduce((n, m) => {
    const g = m.geometry
    return n + (g.index ? g.index.count : g.attributes.position.count) / 3
  }, 0))

  const { prims, meshes, tris: allTris, mirrored = 0 } = await survey(full)
  const bb = bounds(prims)
  const { scale, fix } = unitCorrection(bb.size)
  const one = tileSize(faces)
  const mod = tileModule(grid)
  const flange = railFlange(grid)
  // The four Grid_* files name a size and a grid width, consistently, with one
  // wrinkle: a space before the second underscore. Parsed here so the app can
  // offer them by (size, grid) rather than by filename, and reported as null
  // when a file does not follow the pattern rather than guessed at.
  // Both namings: the supplied `Grid_600x600mm _24mm.fbx` and the re-cut
  // `Tile 600x600 24mm.glb`. Size first, tee second, either way round.
  const named = file.match(/^Grid[_ ](\d+)x(\d+)mm\s*_\s*(\d+)mm/i)
    ?? file.match(/^Tile[_ ](\d+)x(\d+)[_ ]+(\d+)mm/i)
  const record = {
    id: idOf(file),
    name: titleOf(idOf(file)),
    file: `ceiling_tiles/${file}`,
    source: file,
    unitScale: scale,
    dims: bb.size.map((v) => round(v * scale)),
    meshes,
    tris: allTris,
    // what the classifier found, and what each part costs
    parts: {
      faces: { n: faces.length, tris: tris(faces) },
      bodies: { n: bodies.length, tris: tris(bodies) },
      grid: { n: grid.length, tris: tris(grid) },
      context: { n: context.length, tris: tris(context) },
    },
    tile: one ? { x: round(one.x * scale), z: round(one.z * scale) } : null,
    // Rail centre to rail centre: what the block OCCUPIES, which is not the
    // tile and not the bounding box. See tileModule.
    module: mod ? { x: round(mod.x * scale), z: round(mod.z * scale) } : null,
    flangeMm: flange == null ? null : round(flange * scale * 1000, 2),
    // Only for files that name themselves the way the Grid_* set does.
    grid: named
      ? { sizeKey: `${named[1]}x${named[2]}`, gridMm: Number(named[3]) }
      : null,
  }

  say(`    tile   ${record.id.padEnd(20)} ${faces.length} tiles of ` +
      `${one ? `${(one.x * scale * 1000).toFixed(0)} x ${(one.z * scale * 1000).toFixed(0)} mm` : '?'}` +
      `, ${grid.length} grid pieces` +
      `${mod ? `, module ${(mod.x * scale * 1000).toFixed(0)} x ${(mod.z * scale * 1000).toFixed(0)} mm` : ''}` +
      `${flange == null ? '' : `, ${(flange * scale * 1000).toFixed(1)} mm flange`}`)
  say(`    tile   ${record.id.padEnd(20)} ${bb.size.map((v) => (v * scale).toFixed(2)).join(' × ')} m · ` +
      `${meshes} meshes, ${allTris.toLocaleString()} tris`)
  if (fix) say(`            ! ${fix}`)
  // A model the classifier found NO tiles in has not been understood, and the
  // warnings below all assume it was — "surrounding ceiling, dropped on load"
  // is a confident sentence about a mesh nothing has identified. Say what is
  // actually known instead, and say that the file is not wired up.
  if (!record.parts.faces.n) {
    const heaviest = Math.max(record.parts.grid.tris, record.parts.context.tris)
    say('            ! NO TILES FOUND in this file. The classifier looks for flat, mapped ' +
        'panels and there are none, so nothing below has been identified and the model is ' +
        'not loaded by the app.')
    say(`            ! what it does contain: ${record.meshes} mesh(es), ` +
        `${record.tris.toLocaleString()} triangles, the largest single mesh being ` +
        `${heaviest.toLocaleString()} of them.`)
    return record
  }

  if (record.parts.context.n) {
    say(`            ! it carries ${record.parts.context.n} mesh(es) of surrounding ceiling, ` +
        `${record.parts.context.tris.toLocaleString()} triangles. The app draws its own room, so this is ` +
        'dropped on load rather than left to fight it for depth.')
  }
  if (record.parts.grid.tris > record.parts.faces.tris * 20) {
    say(`            ! its grid rails are ${Math.round(record.parts.grid.tris / Math.max(1, record.parts.grid.n)).toLocaleString()} ` +
        `triangles each against ${Math.round(record.parts.faces.tris / Math.max(1, record.parts.faces.n))} for a tile. ` +
        'A T-bar is an extruded profile; a few hundred would do. Worth a re-export.')
  }
  if (mirrored) {
    say(`            ! ${mirrored} of ${meshes} meshes have a mirrored transform - they render ` +
        'inside-out and are flipped back on load. Re-export without negative scale.')
  }
  return record
}

/**
 * One Fly model, read from the lightened .glb.
 *
 * The number comes from the filename — Fly-4, Fly-8 — because it is the one
 * thing that distinguishes them and it is already in the name.
 *
 * `feltMeshes` is counted from the geometry and is NOT the wing count: Fly-4
 * draws each of its four wings as one mesh and Fly-8 draws each of its eight as
 * two, so the two files report 4 and 16 for 4 and 8 wings. Recorded as what it
 * actually is rather than divided by a number that holds for one file.
 */
async function flyEntry(dir, file) {
  const full = path.join(dir, file)
  const b = fs.readFileSync(full)
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  let root
  if (/\.glb$/i.test(file)) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    root = (await new Promise((res, rej) => {
      new GLTFLoader().parse(buf, '', res, rej)
    })).scene
  } else {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    root = new FBXLoader().parse(buf, '')
  }
  root.updateMatrixWorld(true)

  const m = file.match(/Fly-(\d+)/i)
  if (!m) throw new Error(`no wing count in the name "${file}"`)
  const size = Number(m[1])

  let meshes = 0
  let tris = 0
  let feltMeshes = 0
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    meshes++
    const g = o.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    // The supplied files say it in the material name; the simplified ones carry
    // a flag, because their materials are rebuilt.
    if (o.userData?.flyWing || m?.name === 'Blue felt') feltMeshes++
  })
  if (!feltMeshes) throw new Error('no mesh on the "Blue felt" material')

  // The file is millimetres; the app works in metres, and the loader scales it.
  const bb = new THREE.Box3().setFromObject(root)
  const sz = bb.getSize(new THREE.Vector3()).multiplyScalar(0.001)

  return {
    id: `fly-${size}`,
    size,
    name: `Fly ${size}`,
    file: `Fly/${path.relative(FLY_MODELS_DIR, dir) ? 'simplified/' : ''}${file}`,
    simplified: dir === FLY_SIMPLIFIED_DIR,
    feltMeshes,
    plan: { x: round(sz.x), z: round(sz.z) },
    heightMm: round(sz.y * 1000, 1),
    meshes,
    tris: Math.round(tris),
  }
}

/**
 * Survey one cloud.
 *
 * Shape comes from the FOLDER and size from the filename, because the filenames
 * are not consistent: ten are `..._<Shape>_<size>mm.fbx` and the two triangles
 * are `... 3D Triangle_<size>mm.fbx`, with a space where the others have an
 * underscore. Reading the folder sidesteps that entirely.
 */
async function cloudEntry(shapeDir, file) {
  const full = path.join(CLOUD_MODELS_DIR, shapeDir, file)
  const { classifyCloudMeshes } = await import('../src/lib/clouds.js')
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  const b = fs.readFileSync(full)
  const root = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  root.updateMatrixWorld(true)

  const mm = file.match(/(\d+)\s*mm/i)
  if (!mm) throw new Error(`no size in the name "${file}"`)
  const size = Number(mm[1])
  const shape = shapeDir.toLowerCase() === 'hexagone' ? 'hexagon' : shapeDir.toLowerCase()

  const { panel, cap, plate, suspension } = classifyCloudMeshes(root)
  if (!panel) throw new Error('no panel mesh found')

  const { prims, meshes, tris, mirrored = 0 } = await survey(full)
  const bb = bounds(prims)
  const { scale, fix } = unitCorrection(bb.size)
  // Panel AND cap. The cap is the panel's back face, so a re-export that splits
  // it into its own mesh must not make the panel report itself 4 mm thinner —
  // which is exactly what the second hexagon export did.
  const pbox = new THREE.Box3().setFromObject(panel)
  for (const m of cap) pbox.union(new THREE.Box3().setFromObject(m))
  const ps = pbox.getSize(new THREE.Vector3())
  const wbox = new THREE.Box3()
  for (const m of suspension) wbox.union(new THREE.Box3().setFromObject(m))
  const wireH = suspension.length ? wbox.max.y - wbox.min.y : 0

  const uv = panel.geometry.attributes.uv
  let u0 = Infinity; let u1 = -Infinity
  if (uv) for (let i = 0; i < uv.count; i++) { u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)) }
  const tiling = uv ? (u1 - u0) > 1.5 : false

  const record = {
    id: `${shape}-${size}`,
    shape,
    size,
    name: `${shape[0].toUpperCase()}${shape.slice(1)} ${size} mm`,
    file: `Cloud/${shapeDir}/${file}`,
    unitScale: scale,
    // The plan size of the PANEL, in metres, which is what it occupies on a
    // ceiling — not the whole file, which includes half a metre of wire.
    plan: { x: round(ps.x * scale), z: round(ps.z * scale) },
    thicknessMm: round(ps.y * scale * 1000, 1),
    dropMm: round(wireH * scale * 1000, 0),
    parts: {
      panel: 1, cap: cap.length, plate: plate.length, suspension: suspension.length,
    },
    meshes,
    tris,
  }

  say(`    cloud  ${record.id.padEnd(16)} panel ${(ps.x * scale * 1000).toFixed(0)} x ` +
      `${(ps.z * scale * 1000).toFixed(0)} mm, ${record.thicknessMm} thick, ` +
      `${record.dropMm} mm of wire · ${meshes} meshes, ${tris.toLocaleString()} tris`)
  if (fix) say(`            ! ${fix}`)
  if (tiling) {
    say(`            ! its panel is mapped for TILING - u spans ${(u1 - u0).toFixed(1)}, about ` +
        `${((u1 - u0) / 1).toFixed(0)} repeats - where every finish here assumes one span across ` +
        'the face. Rescaled to 0..1 on load; the file on disk is untouched.')
  }
  if (mirrored) {
    say(`            ! ${mirrored} of ${meshes} meshes have a mirrored transform - they render ` +
        'inside-out and are flipped back on load. Re-export without negative scale.')
  }
  if (!suspension.length) say('            ! no suspension found in it, so it will hang on nothing.')
  return record
}

// ---------------------------------------------------------------------------

export default async function build() {
  fs.mkdirSync(ROOMS, { recursive: true })
  fs.mkdirSync(BAFFLES, { recursive: true })

  const manifest = {
    version: 1, generated: new Date().toISOString(),
    rooms: [], baffles: [], tiles: [], clouds: [], fly: [],
  }

  for (const f of listModels(ROOMS)) {
    try { manifest.rooms.push(await roomEntry(ROOMS, f)) }
    catch (e) { console.error(`    room  ${f}: ${e.message}`) }
  }
  for (const f of listBaffles(BAFFLES)) {
    try { manifest.baffles.push(await baffleEntry(BAFFLES, f)) }
    catch (e) { console.error(`    baffle ${f}: ${e.message}`) }
  }

  if (fs.existsSync(CLOUD_MODELS_DIR)) {
    for (const shapeDir of fs.readdirSync(CLOUD_MODELS_DIR).sort()) {
      const dir = path.join(CLOUD_MODELS_DIR, shapeDir)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const f of fs.readdirSync(dir).filter((x) => /\.fbx$/i.test(x)).sort()) {
        try { manifest.clouds.push(await cloudEntry(shapeDir, f)) }
        catch (e) { console.error(`    cloud  ${f}: ${e.message}`) }
      }
    }
    manifest.clouds.sort((a, b) => a.shape.localeCompare(b.shape) || a.size - b.size)
  }

  // The simplified folder wins where it exists — same shapes, a fraction of the
  // triangles. Falling back rather than failing means deleting the folder is a
  // complete undo.
  const flyDir = fs.existsSync(FLY_SIMPLIFIED_DIR) ? FLY_SIMPLIFIED_DIR : FLY_MODELS_DIR
  if (fs.existsSync(flyDir)) {
    const want = flyDir === FLY_SIMPLIFIED_DIR ? /\.glb$/i : /\.fbx$/i
    for (const f of fs.readdirSync(flyDir).filter((x) => want.test(x)).sort()) {
      try { manifest.fly.push(await flyEntry(flyDir, f)) }
      catch (e) { console.error(`    fly    ${f}: ${e.message}`) }
    }
    manifest.fly.sort((a, b) => a.size - b.size)
  }

  for (const f of listModels(TILE_MODELS)) {
    try { manifest.tiles.push(await tileEntry(TILE_MODELS, f)) }
    catch (e) { console.error(`    tile  ${f}: ${e.message}`) }
  }
  // Tiles re-cut onto a true module by scripts/fix-tile-models.mjs. They sit in
  // their own folder so the supplied files stay exactly as delivered, and the
  // app prefers them where they exist — delete the folder and it falls back.
  const CORRECTED = path.join(TILE_MODELS, 'corrected')
  if (fs.existsSync(CORRECTED)) {
    for (const f of listModels(CORRECTED)) {
      try {
        const e = await tileEntry(CORRECTED, f)
        e.file = `ceiling_tiles/corrected/${f}`
        e.corrected = true
        manifest.tiles.push(e)
      } catch (e) { console.error(`    tile  corrected/${f}: ${e.message}`) }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2))

  // the finishes are their own file, beside the images they describe
  // Every size folder that exists, rather than the one this was written for.
  // Adding a size is adding a folder, the same bargain the model folders make.
  const finishes = {
    version: 2,
    generated: new Date().toISOString(),
    sizes: {},
  }
  for (const size of listTileSizes()) {
    const woodClassic = listTileFinishes('WoodClassic', size)
    const perforation = listTileFinishes('Perforation', size)
    if (!woodClassic.length && !perforation.length) continue
    finishes.sizes[size] = { woodClassic, perforation }
  }

  const allSizes = Object.entries(finishes.sizes)
  if (allSizes.length) {
    fs.mkdirSync(TILE_TEX, { recursive: true })
    fs.writeFileSync(TILE_TEX_OUT, JSON.stringify(finishes, null, 2))
    for (const [size, set] of allSizes) {
      say(`  ${TILE_TEX_OUT}: ${size} — ${set.woodClassic.length} wood, ${set.perforation.length} perforations`)
    }

    // The two sizes are the SAME range of finishes in two shapes, so a code in
    // one and not the other is a gap somebody has to fill, not a design.
    if (allSizes.length > 1) {
      const [aName, a] = allSizes[0]
      for (const [bName, b] of allSizes.slice(1)) {
        for (const range of ['woodClassic', 'perforation']) {
          const codes = (x) => new Set(x[range].map((t) => t.code))
          const A = codes(a)
          const B = codes(b)
          const only = (x, y) => [...x].filter((c) => !y.has(c))
          const gaps = [
            ...only(A, B).map((c) => `${c} is in ${aName} but not ${bName}`),
            ...only(B, A).map((c) => `${c} is in ${bName} but not ${aName}`),
          ]
          if (gaps.length) say(`            ! ${range}: ${gaps.join('; ')}`)
        }
      }
    }

    // A panel's ASPECT has to match the size it is filed under, and the names
    // cannot be trusted to say so: three Wood Classic files in 1200x600 are
    // named _1195x1195 while being 2:1 images. The folder is the authority and
    // the pixels are the evidence; the name is decoration.
    for (const [size, set] of allSizes) {
      const [wMm, hMm] = size.split('x').map(Number)
      if (!wMm || !hMm) continue
      const want = wMm / hMm
      for (const t of [...set.woodClassic, ...set.perforation]) {
        if (!t.px) continue
        const got = t.px[0] / t.px[1]
        if (Math.abs(got - want) / want > 0.05) {
          say(`            ! ${size}/${t.code} is ${t.px[0]}x${t.px[1]} (${got.toFixed(2)}:1) ` +
              `in a ${want.toFixed(2)}:1 folder — it will be stretched.`)
        }
      }
    }

    const every = allSizes.flatMap(([, set]) => [...set.woodClassic, ...set.perforation])
    const heavy = every.filter((t) => (t.px?.[0] ?? 0) * (t.px?.[1] ?? 0) > 20e6)
    if (heavy.length) {
      // by BYTES, not pixel count: they are nearly all 7205 square, so ranking
      // by area picks an arbitrary one, and what hurts here is the download
      const worst = heavy.reduce((a, b) => (a.bytes > b.bytes ? a : b))
      say(`            ! ${heavy.length} of ${every.length} are over 20 megapixels — the largest is ` +
          `${worst.code} at ${worst.px[0]}x${worst.px[1]} (${(worst.bytes / 1e6).toFixed(1)} MB). ` +
          'They are downsampled before upload, but the download is the download. ' +
          'A 600 mm panel does not need more than about 2000 px.')
      say(`            ! ${(every.reduce((n, t) => n + t.bytes, 0) / 1e6).toFixed(0)} MB of tile textures in total.`)
    }
  }

  return manifest
}

// run directly: node scripts/build-manifest.mjs
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-manifest.mjs')) {
  const m = await build()
  say(`\n  ${OUT}: ${m.rooms.length} room(s), ${m.baffles.length} baffle(s), ${m.tiles.length} tile model(s), ${m.clouds.length} cloud(s)`)
}
