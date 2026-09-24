// Fly: a pinwheel of fabric-faced wings on a central hub.
//
// The fourth product, and the first that is neither a run of fins, a field of
// tiles, nor a single panel. Two models, and the number is in the name:
//
//   Fly 4   4 wings   1099 x 1166 mm
//   Fly 8   8 wings   1099 x 2366 mm   — two pinwheels end to end
//
// Each wing is 456 x 585 mm of felt, 81 mm thick, and the whole assembly is
// 363 mm deep. Its suspension IS modelled — a fixing, a rod, a bracket, stacked
// — and reaches the top of the assembly, so at a drop of zero it touches the
// slab. Above that the renderer draws an extension rather than stretching the
// modelled parts, which are separate pieces and would come apart. See hangersOf.
//
// IT LOADS A SIMPLIFIED BUILD, and the distinction matters after the last go.
//
// An earlier version REPLACED every hardware part with its bounding box — 84 of
// 88 meshes became blocks — which was 28x lighter and wrong: measured against
// the parts they stood in for, only five were box-shaped to begin with and
// twenty-four were noticeably fatter. That was rejected, correctly.
//
// What loads now is the same frame at a coarser tessellation. Nothing is
// replaced and nothing is removed:
//
//              triangles                file          felt
//   Fly 4      1,652,970 -> 209,044     39.5 -> 8.5   untouched
//   Fly 8      3,133,284 -> 359,031     73.2 -> 14.2  untouched
//
// which is worth having because the count was never detail. Every heavy part in
// the supplied files carries EXACTLY 65,501 triangles whether it is a 13 x 20 mm
// rail or a 1 x 3 mm wire — a swept surface sampled at a fixed resolution, on
// parts that are straight extrusions. The worst any surface moves is 0.109 mm
// on Fly 4 and 0.438 on Fly 8, and the build refuses over half a millimetre.
//
// scripts/build-fly.mjs writes it; the supplied files are never touched, and
// deleting public/models/Fly/simplified puts them back.
//
// The finish is Designer Textiles, restricted to the ten FB3 shades in
// public/textures/fly — see FLY_FABRICS. They are ten of the same 275 panels
// the baffles and clouds already offer, so a Fly in FB3 Rust 4 is the same
// cloth at the same scale as a baffle in it.

import * as THREE from 'three'
import { COLOUR_FAMILIES, CLOUD_HARDWARE_FINISH } from './catalog.js'
import { TEXTILE_SHEET, loadTextileSheet, panelFor, textileReady } from './textiles.js'

const BASE = import.meta.env?.BASE_URL ?? '/'

/**
 * How far a Fly hangs below the slab, in metres — to the top of the assembly.
 *
 * Its own range rather than the cloud's: a Fly is 363 mm deep where a cloud
 * panel is 12-40, so the same 480 mm default would put its wings a third of a
 * metre lower than a cloud hung beside it.
 */
export const FLY_DROP = { min: 0.05, max: 2, default: 0.35 }

/**
 * One wing, in metres, and what it is worth as absorptive face.
 *
 * Measured off the supplied geometry: every wing in both files is 456 x 585 mm,
 * and the felt surface of one comes to 0.401 m² in Fly 4 and 0.392 in Fly 8 —
 * they are slightly different draws of the same part. 0.40 is the number the
 * schedule orders by.
 *
 * It matters that this is NOT the footprint. Four wings are 1.6 m² of felt
 * inside a 1.28 m² plan, because they overlap in elevation; ordering a Fly by
 * the rectangle it occupies would under-count the cloth by a fifth.
 */
export const FLY_WING = { length: 0.585, width: 0.456 }
export const FLY_WING_M2 = 0.4

/** Filled by loadFlyManifest(). A live array, like CLOUD_MODELS. */
export const FLY_MODELS = []

export const flySizes = () => FLY_MODELS.map((f) => f.size).sort((a, b) => a - b)
export const flyFor = (size) => FLY_MODELS.find((f) => f.size === size) ?? null

/** Adopt a parsed manifest. Split from the fetch so Node can drive it too. */
export function applyFlyManifest(list) {
  FLY_MODELS.length = 0
  for (const f of Array.isArray(list) ? list : []) FLY_MODELS.push(f)
  return FLY_MODELS.length
}

export async function loadFlyManifest() {
  try {
    const res = await fetch(`${BASE}models/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyFlyManifest((await res.json()).fly)
  } catch (e) {
    console.warn('Fly models unavailable:', e.message)
    return 0
  }
}

// ---------------------------------------------------------------------------
// the fabric
// ---------------------------------------------------------------------------

/**
 * The ten shades Fly is offered in — all FB3, all already in the 275.
 *
 * A shortlist, not a new range: these are the files in
 * public/textures/fly/designer-textile/FB3, named there as <Group>_FB3_<n> and
 * keyed here the way the textile map keys them, FB3_<Group>_<n>. Restricting
 * the picker to them is the whole difference between Fly's finish and a cloud's.
 */
export const FLY_FABRICS = [
  'FB3_Blue_2', 'FB3_Blue_4',
  'FB3_Green_1', 'FB3_Green_7',
  'FB3_Grey_6', 'FB3_Grey_8',
  'FB3_Neutral_11',
  'FB3_Rust_4',
  'FB3_Yellow_1', 'FB3_Yellow_3',
]

/**
 * Where a Fly shade's sheet actually comes from.
 *
 * These ten are on disk, so they are served from disk: no CDN round trip, no
 * CORS, and they work with the network off. The file is named the other way
 * round from the key — Blue_FB3_2.jpg for FB3_Blue_2 — which is why this is a
 * function and not a template.
 *
 * Returns null for anything not on the shortlist, and the caller falls back to
 * the CDN panel the rest of the app uses.
 */
export function flyFabricUrl(key) {
  if (!FLY_FABRICS.includes(key)) return null
  const m = /^(FB\d)_(.+)_(\d+)$/.exec(key)
  if (!m) return null
  return `${BASE}textures/fly/designer-textile/${m[1]}/${m[2]}_${m[1]}_${m[3]}.jpg`
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

/**
 * Where a Fly hangs from, in its own local frame.
 *
 * A Fly's suspension is modelled — a fixing, a rod, a bracket, stacked — and it
 * reaches the top of the assembly, which the loader puts at y = 0. So at a drop
 * of zero the model touches the slab and looks right. At any other drop the
 * whole thing moves down and NOTHING BRIDGES THE GAP: four rods stop in mid-air
 * and the ceiling is empty above them. That is what "the model is not touching
 * the ceiling" was.
 *
 * A cloud solves this by scaling its wire, but a Fly's suspension is not one
 * wire — it is a stack of separate parts with the frame threaded through it, and
 * stretching those in place would pull them apart from each other. So instead
 * the renderer draws an EXTENSION above the assembly, and this is where it goes:
 * the parts that reach the slab are the ceiling fixings, and their plan
 * positions are the points the whole thing hangs from.
 *
 * Measured, not assumed. Both models come out at four points, x = ±238 mm, and
 * the fixing is a 13 mm square section — which is what the extension is drawn
 * as, so it reads as the same rod continuing rather than a different part.
 *
 * Deduplicated on plan position: a fixing is modelled as two nested pieces (13
 * mm over 10 mm) at the same spot, and two rods in one hole would z-fight.
 */
function hangersOf(object, box) {
  const top = box.max.y
  const found = new Map()
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const bb = new THREE.Box3().setFromObject(o)
    // Has to reach the slab. 2 mm of slack, because the nested inner piece
    // stops a hair short of the outer one.
    if (top - bb.max.y > 0.002) return
    const s = bb.getSize(new THREE.Vector3())
    const c = bb.getCenter(new THREE.Vector3())
    // One rod per PLACE, at the widest section found there.
    const key = `${Math.round(c.x * 200)}|${Math.round(c.z * 200)}`
    const prev = found.get(key)
    if (prev && prev.w >= s.x) return
    found.set(key, { x: c.x, z: c.z, w: s.x, d: s.z })
  })
  return [...found.values()]
}

const loaded = new Map()   // model id -> built fly
const coming = new Map()   // model id -> promise
const listeners = new Set()

export function subscribeFlyModel(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const flyModel = (id) => loaded.get(id) ?? null

const asset = (f) => `${BASE}models/${f.split('/').map(encodeURIComponent).join('/')}`

/**
 * One material for every part of a Fly that is not felt, whatever its own file
 * shipped.
 *
 * Built once and shared. The files name one material "Blue felt" and call the
 * other 77 / 169 matNN, which is what an exporter writes when it has nothing to
 * say — so keeping them would mean a frame finished at whatever the exporter
 * guessed. The same bargain lib/clouds makes with its hardware.
 */
const HARDWARE_MAT = new THREE.MeshStandardMaterial({
  name: 'FlyHardware',
  color: new THREE.Color(CLOUD_HARDWARE_FINISH.hex),
  roughness: CLOUD_HARDWARE_FINISH.roughness,
  metalness: CLOUD_HARDWARE_FINISH.metalness,
})

/** The one material anybody named on purpose. It marks the felt wings. */
export const FELT_MATERIAL = 'Blue felt'

/**
 * Load one Fly, normalised the way every other product here is: centred in
 * X/Z, top of the assembly at y = 0 so it hangs off the ceiling plane, metres.
 *
 * The wings are found by MATERIAL. One material in each file is called
 * "Blue felt" and the rest are matNN; that is the only deliberate label in
 * there and it marks exactly the right meshes. Flagged with `flyWing` on the
 * way past so nothing downstream has to ask twice.
 *
 * This is the expensive path — 1.65 M and 3.13 M triangles, about three and
 * seven seconds — and it is the one that was asked for. The geometry is cloned
 * ONCE here and shared by every placed Fly: a placed set clones the Object3D
 * tree, which shares the BufferGeometry, so ten Flys of one size cost one
 * upload rather than ten.
 */
export function loadFlyModel(id) {
  const entry = FLY_MODELS.find((f) => f.id === id)
  if (!entry) return Promise.resolve(null)
  if (coming.has(id)) return coming.get(id)

  const promise = (async () => {
    const res = await fetch(asset(entry.file))
    if (!res.ok) throw new Error(`${res.status} loading ${entry.file}`)
    const buf = await res.arrayBuffer()
    // Whichever is on disk. The simplified build is a .glb and the supplied
    // model an .fbx, and everything after this is the same for both — the glb's
    // meshes carry an identity transform, so baking matrixWorld below is a
    // no-op for them rather than a second code path.
    let root
    if (/\.glb$/i.test(entry.file)) {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      root = (await new Promise((ok, fail) => {
        new GLTFLoader().parse(buf, '', ok, fail)
      })).scene
    } else {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      root = new FBXLoader().parse(buf, '')
    }
    root.updateMatrixWorld(true)

    const object = new THREE.Group()
    object.name = 'Fly'
    const wings = []
    const source = []
    root.traverse((o) => {
      if (o.isMesh && o.geometry?.attributes?.position) source.push(o)
    })

    for (const o of source) {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material
      // The supplied file says it in the material name; the simplified build
      // carries a flag, because its materials are rebuilt.
      const isWing = o.userData?.flyWing === true || mat?.name === FELT_MATERIAL
      const g = o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      const mesh = new THREE.Mesh(g, isWing ? new THREE.MeshStandardMaterial() : HARDWARE_MAT)
      mesh.name = o.name
      mesh.raycast = () => {}
      mesh.userData.flyWing = isWing
      object.add(mesh)
      if (isWing) wings.push(mesh)
    }
    if (!wings.length) throw new Error(`no mesh on "${FELT_MATERIAL}" in ${entry.file}`)

    // Centre in plan and put the TOP at y = 0, in metres. The file is drawn in
    // millimetres a long way from the origin — x around 176 m once scaled — so
    // neither of those is optional.
    const pre = new THREE.Box3().setFromObject(object)
    const c = pre.getCenter(new THREE.Vector3())
    for (const mesh of object.children) {
      mesh.geometry.translate(-c.x, -pre.max.y, -c.z)
      mesh.geometry.scale(0.001, 0.001, 0.001)
      mesh.geometry.computeBoundingBox()
    }

    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const built = {
      id, size: entry.size, object, wings,
      hangers: hangersOf(object, box),
      extent: { x: size.x, y: size.y, z: size.z },
    }
    loaded.set(id, built)
    listeners.forEach((l) => l())
    return built
  })()

  coming.set(id, promise)
  promise.catch((e) => { console.warn('[fly]', e.message); coming.delete(id) })
  return promise
}

// ---------------------------------------------------------------------------
// the product
// ---------------------------------------------------------------------------

export function defaultFlyParams() {
  return {
    size: null,
    family: 'designer-textiles',
    colour: null,
    drop: FLY_DROP.default,
    rot: 0,
  }
}

export const emptyFlyParams = defaultFlyParams

const FLY_REQUIRED = [
  ['size', 'Size'],
  ['colour', 'Fabric'],
]

/** What a Fly must answer, in panel order. See lib/gate.js. */
export const flyRequired = () => FLY_REQUIRED

export function flyMissingFields(p) {
  return flyRequired(p).filter(([k]) => p?.[k] == null).map(([, label]) => label)
}

export const flyReadyToPlace = (p) => flyMissingFields(p).length === 0

/** The one family a Fly is faced in. A list of one, so the panel reads the same. */
export const FLY_FAMILIES = ['designer-textiles']

/** Normalise a Fly spec — the Fly counterpart of reconcile(). */
export function reconcileFly(p = {}) {
  const size = flySizes().includes(p.size) ? p.size : null
  // Not ready and not a real key are different states, and only the second is a
  // reason to drop one: the textile map is fetched, so a spec loaded before it
  // lands must not have its fabric taken away.
  const colour = textileReady()
    ? (FLY_FABRICS.includes(p.colour) && panelFor(p.colour) ? p.colour : null)
    : p.colour ?? null
  return {
    ...p,
    size,
    family: 'designer-textiles',
    colour,
    drop: Math.min(FLY_DROP.max, Math.max(FLY_DROP.min,
      Number.isFinite(p.drop) ? p.drop : FLY_DROP.default)),
    rot: FLY_ROTATIONS.includes(p.rot) ? p.rot : 0,
  }
}

/** Every angle a Fly can be saved at. Quarter turns: it is a rectangle. */
export const FLY_ROTATIONS = [0, 90, 180, 270]

/**
 * What a Fly occupies on the ceiling, in metres.
 *
 * From the model's measured plan when one is loaded, and from the manifest when
 * it is not — the manifest is read at boot and the model only when something
 * wears it, so a brush knows its own size before any geometry arrives.
 */
export function flyExtent(p) {
  const entry = p?.size != null ? flyFor(p.size) : null
  const x = entry?.plan?.x ?? 1.1
  const z = entry?.plan?.z ?? 1.1
  const turned = (p?.rot ?? 0) % 180 !== 0
  return { length: turned ? z : x, width: turned ? x : z }
}

/** The cells it takes up, at a given grid pitch. */
export function flyCells(p, pitch) {
  const e = flyExtent(p)
  return {
    ci: Math.max(1, Math.round(e.length / pitch)),
    cj: Math.max(1, Math.round(e.width / pitch)),
  }
}

/**
 * A fabric face for one Fly wing, cropped at TRUE SCALE.
 *
 * The same 1200 x 2800 mm sheet a baffle fin is a strip of and a cloud is a
 * patch of. A wing is 456 x 585 mm, so it shows 456 x 585 mm of real cloth and
 * a Fly in FB3 Rust 4 matches a baffle in it.
 *
 * Every wing takes the SAME crop, centred. They are separate objects on separate
 * arms rather than a continuous surface, so there is no seam for a varied crop
 * to hide and a varied one would only make four wings of one product look like
 * four different pieces of cloth.
 */
export async function flyWingTexture(key, { wing } = {}) {
  const sheet = await loadTextileSheet(key)
  if (!sheet) return null
  const w = wing ?? { length: 0.585, width: 0.456 }
  // The sheet arrives turned a quarter: its canvas X is the 2800 mm side and
  // its Y the 1200 mm side.
  const rx = Math.min(1, w.length / TEXTILE_SHEET.h)
  const ry = Math.min(1, w.width / TEXTILE_SHEET.w)
  // Cloned so this Fly holds its own crop; a clone shares its Source, so every
  // Fly wearing one fabric is still a single upload.
  const tex = sheet.tex.clone()
  tex.repeat.set(rx, ry)
  tex.offset.set((1 - rx) / 2, (1 - ry) / 2)
  tex.needsUpdate = true
  return tex
}

/** Is this spec faced in photographed cloth? Always, for now — but asked. */
export const flyIsFabric = (p) => COLOUR_FAMILIES[p?.family]?.sheet === true
