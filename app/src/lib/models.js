// Model registry — loads .glb / .gltf / .fbx, from the manifest or from a file
// the user picks off disk, behind one interface.
//
// A file is loaded WHOLE: every mesh, with the materials it shipped with.
// Picking "the product" out of a file means deciding which mesh matters, and
// getting that wrong silently drops the thing the user cared about. Where a
// product IS parametric, it is built from the catalogue instead (lib/baffle.js)
// — not guessed at from geometry.
//
// Normalised means: longest horizontal run on X, centred in X/Z, top face at
// y = 0 so it hangs from the ceiling, and metres.

import * as THREE from 'three'
import { analyseFins, matchFaceUVs, planarFinUV, normaliseFinUV } from './modelFins.js'

/**
 * Reverse a geometry's triangle winding.
 *
 * Needed because this loader BAKES each node's world matrix into its geometry,
 * and a mirrored node — one whose matrix has a negative determinant — comes out
 * of that wound the wrong way round. Baffle Curve has 7 such meshes out of 39.
 *
 * Nothing downstream puts it right. three.js does compensate for mirrored
 * objects, by flipping the renderer's front-face setting per object from
 * `matrixWorld.determinant()` — but baking leaves every matrix at identity, so
 * that compensation reads a determinant of +1 and does nothing. The faces then
 * cull the wrong way and you see straight through a fin into its inside, which
 * is exactly what a viewer that keeps the transform on the node does not show.
 *
 * Only the winding is wrong: applyMatrix4 puts normals through the normal
 * matrix, so those come out of a mirror still pointing outward. Recomputing
 * them would be the wrong fix — it would throw away the file's own smoothing.
 */
export function flipWinding(geometry) {
  if (geometry.index) {
    const idx = geometry.index.array
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const t = idx[i + 1]
      idx[i + 1] = idx[i + 2]
      idx[i + 2] = t
    }
    geometry.index.needsUpdate = true
    return geometry
  }
  // non-indexed (what FBXLoader produces): swap the 2nd and 3rd vertex of every
  // triangle, in every attribute, so positions/normals/uvs stay in step
  for (const attr of Object.values(geometry.attributes)) {
    const a = attr.array
    const n = attr.itemSize
    for (let v = 0; v + 2 < attr.count; v += 3) {
      for (let k = 0; k < n; k++) {
        const b = (v + 1) * n + k
        const c = (v + 2) * n + k
        const t = a[b]
        a[b] = a[c]
        a[c] = t
      }
    }
    attr.needsUpdate = true
  }
  return geometry
}

const BASE = import.meta.env?.BASE_URL ?? '/'
// Real filenames contain spaces and brackets - "Baffle Curve (1).fbx" is a
// perfectly ordinary export name - so the path has to be encoded before it
// becomes a URL.
const asset = (f) => `${BASE}models/${f.split('/').map(encodeURIComponent).join('/')}`

/** Filled by loadModelManifest(). Live array: { id, name, url, ... }. */
export const MODELS = []

export const getModelEntry = (id) => MODELS.find((m) => m.id === id) ?? null

/**
 * Does this item have fins you can address one at a time?
 *
 * A catalogue baffle always does. An imported file does only when it is a run
 * of fins rather than one sculpted object — and where it is not, offering to
 * look at "a single fin" is offering something that does not exist.
 */
export const isFinRun = (params) => !params?.model || !!getModelEntry(params.model)?.fins

/**
 * Which catalogue types and shapes actually have a model behind them.
 *
 * The folder tree is the registration: public/models/baffles/<Type>/<Shape>.fbx.
 * Everything the workbook lists is still shown — a type or shape with no file
 * is offered as coming soon, which is more honest than quietly omitting a
 * product that exists on paper.
 */
export const modelFor = (type, shape) =>
  MODELS.find((m) => m.type === type && m.shape === shape) ?? null

export const hasType = (type) => MODELS.some((m) => m.type === type)
export const hasShape = (type, shape) => !!modelFor(type, shape)

// ---------------------------------------------------------------------------
// cache + subscription
// ---------------------------------------------------------------------------

const cache = new Map() // url -> { status, parts, error }
const listeners = new Set()
const notify = () => listeners.forEach((l) => l())

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const statusOf = (url) => cache.get(url)?.status ?? 'idle'
export const partsOf = (url) => cache.get(url)?.parts ?? null
export const errorOf = (url) => cache.get(url)?.error ?? null

// ---------------------------------------------------------------------------
// parsing
// ---------------------------------------------------------------------------

async function parseBuffer(buffer, kind) {
  if (kind === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    return new FBXLoader().parse(buffer, '')
  }
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buffer, '', res, rej))
  return gltf.scene
}

const kindOf = (url) => (/\.fbx(\?|$)/i.test(url) ? 'fbx' : 'glb')

/**
 * Source files authored in millimetres need scaling; glTF is already metres.
 * Only used for a file the user just dropped in — anything from the manifest
 * carries a measured unitScale, which is not re-guessed here.
 */
function guessUnitScale(root) {
  const b = new THREE.Box3().setFromObject(root)
  const max = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
  if (!Number.isFinite(max) || max === 0) return 1
  if (max > 50) return 0.001 // >50 units across can only be mm
  if (max < 0.02) return 1000 // <20 mm means a stray 0.001 in the export
  return 1
}

/**
 * Load a file whole and normalise its placement.
 * Returns { object, meshes, tris, materials, dims }.
 */
export async function loadWhole(buffer, kind, unitScaleOverride = null) {
  const root = await parseBuffer(buffer, kind)
  root.updateMatrixWorld(true)

  const unitScale = unitScaleOverride ?? guessUnitScale(root)
  const group = new THREE.Group()
  group.name = 'ImportedModel'

  let meshes = 0
  let tris = 0
  const materials = new Set()
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld) // bake, so the group is flat
    // ...and put the winding back the right way round if that matrix mirrored
    if (o.matrixWorld.determinant() < 0) flipWinding(g)
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => m && materials.add(m))
    const mesh = new THREE.Mesh(g, o.material) // keep the file's own materials
    mesh.name = o.name
    mesh.raycast = () => {} // the wrapper owns picking
    group.add(mesh)
    meshes++
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  if (!meshes) throw new Error('no meshes in this file')

  // Put the run on X so "length" means the same thing for an imported model as
  // it does for a catalogue part — fins along X, spreading along Z.
  //
  // Which way to turn comes from the FINS where there are any. The overall
  // bounding box is not evidence: Baffle Curve is 4.84 x 4.18 m, near enough
  // square, while its fins plainly lie along Z. Orienting by the box left the
  // fins crossways, which made their pitch measure as zero.
  const probe = analyseFins(group)
  const pre = new THREE.Box3().setFromObject(group)
  const preSize = pre.getSize(new THREE.Vector3())
  const turn = probe ? probe.longAxis === 'z' : preSize.z > preSize.x
  if (turn) {
    const rot = new THREE.Matrix4().makeRotationY(-Math.PI / 2)
    group.children.forEach((m) => m.geometry.applyMatrix4(rot))
  }

  // centre X/Z, put the top at y = 0, convert to metres
  const box = new THREE.Box3().setFromObject(group)
  const c = new THREE.Vector3()
  box.getCenter(c)
  group.children.forEach((m) => {
    m.geometry.translate(-c.x, -box.max.y, -c.z)
    m.geometry.scale(unitScale, unitScale, unitScale)
    m.geometry.computeBoundingBox()
  })

  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())
  // Re-analysed after the rotation, centring and scaling above, so every
  // position it records is in the coordinates the renderer will actually use.
  const finset = analyseFins(group)

  // Now that the run lies along X for good, the fin's two faces can be told
  // apart and made to read a texture the same way round as each other. Before
  // the turn above, "the faces" are whichever surfaces happened to point along
  // z, which on a model authored the other way are its ends.
  if (finset) {
    // A file with no UVs at all gets a planar set first; without them a mapped
    // material samples one texel and the fin renders in a single flat colour.
    finset.unit.uvGenerated = planarFinUV(finset.unit.fin.geometry)
    // then into the convention the finishes assume — a fin mapped for tiling
    // samples the edge of a clamped panel and renders in one flat colour
    finset.unit.uvScaled = normaliseFinUV(finset.unit.fin.geometry)
    finset.unit.uvFix = matchFaceUVs(finset.unit.fin.geometry)
  }

  return {
    object: group,
    meshes,
    tris: Math.round(tris),
    materials: materials.size,
    dims: { length: size.x, height: size.y, width: size.z },
    finset,
  }
}

// ---------------------------------------------------------------------------
// loading by url
// ---------------------------------------------------------------------------

async function ensure(url, unitScale = null) {
  if (!url || cache.has(url)) return
  cache.set(url, { status: 'loading' })
  notify()
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
    const parts = await loadWhole(await res.arrayBuffer(), kindOf(url), unitScale)
    cache.set(url, { status: 'ready', parts })
  } catch (e) {
    cache.set(url, { status: 'error', error: e.message })
  }
  notify()
}

/** Ask for a model without rendering it — the picker uses this for real dims. */
export function ensureLoaded(url, unitScale = null) {
  if (url) ensure(url, unitScale)
}

/** Register a model the user picked off disk, under a synthetic url key. */
export async function registerFile(file) {
  const url = `file:${file.name}:${Date.now().toString(36)}`
  cache.set(url, { status: 'loading' })
  notify()
  try {
    const parts = await loadWhole(await file.arrayBuffer(), kindOf(file.name))
    cache.set(url, { status: 'ready', parts })
    notify()
    return { url, parts }
  } catch (e) {
    cache.set(url, { status: 'error', error: e.message })
    notify()
    throw e
  }
}

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

/**
 * Read the baffle models listed in the manifest.
 *
 * As with rooms, a missing manifest is not fatal — baffles are parametric, so
 * the app is fully usable with no model files at all.
 */
/**
 * Adopt a parsed model manifest. Split from the fetch so the suite can drive the
 * same path in Node — which is the only way to catch a field that fails to make
 * the crossing, as `type` and `shape` once did.
 */
export function applyModelManifest(m) {
  MODELS.length = 0
  {
    for (const b of m?.baffles ?? []) {
      MODELS.push({
        id: b.id,
        type: b.type ?? null,
        shape: b.shape ?? null,
        // which catalogue product this file IS, read from its folder and name.
        // Without these every type and shape looks unavailable, because that is
        // the only thing the picker tests.
        name: b.name,
        url: asset(b.file),
        sourceFile: b.source ?? b.file,
        dims: b.dims,
        // the run inside the file, measured by the manifest: fin count, one
        // fin's size, and the spacing it was authored at
        fins: b.fins ?? null,
        meshes: b.meshes,
        tris: b.tris,
        unitScale: b.unitScale ?? null,
        note: b.fins
          ? `${b.fins.count} fins · ${b.fins.size.length.toFixed(2)} × ` +
            `${b.fins.size.depth.toFixed(2)} × ${b.fins.size.thickness.toFixed(3)} m ` +
            `at ${b.fins.spacingMm} mm · ${b.tris.toLocaleString()} tris`
          : `${b.meshes} meshes · ${b.tris.toLocaleString()} tris · ` +
            `${b.dims.length.toFixed(2)} × ${b.dims.height.toFixed(2)} × ${b.dims.width.toFixed(2)} m`,
      })
    }
  }
  return MODELS
}

export async function loadModelManifest() {
  try {
    const res = await fetch(`${BASE}models/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`manifest.json: ${res.status}`)
    applyModelManifest(await res.json())
  } catch (e) {
    console.warn('[models] manifest unavailable:', e.message)
  }
  return MODELS
}
