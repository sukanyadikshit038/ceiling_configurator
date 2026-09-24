// Acoustic clouds: what a cloud model is made of, and how one is specified.
//
// Eleven files, four shapes, at 600 / 900 / 1200 mm — triangle at 900 and 1200
// only, which is what the workbook lists too. The folder tree is the
// registration, the same bargain the baffle and tile folders make: drop a file
// in, run the manifest, and it is offered.
//
// Each file is ONE cloud with its own suspension, and comes apart into:
//
//   panel       the lowest mesh, and what the room really sees.
//   cap         a flat mesh on the panel's own footprint — its back face, split
//               out as a separate mesh on the hexagons and triangles and not
//               present at all on the circles and squares. Coloured WITH the
//               panel, because it is the panel.
//   plate       hardware: the backing disc that overhangs the circle and square
//               panels, and the fixture at the top of the triangle's cable.
//   suspension  400-1000 mm of wire. Separated so it can be SCALED to the drop
//               the user asks for, rather than every cloud hanging at the
//               height its file happened to be modelled at.
//
// Three faults measured across the eleven, all corrected on load, none written
// back to the file:
//
//   * NOT ONE of the eleven panels has a UV map a picture could go on. They
//     were unwrapped for uniform material and it shows: the circles are mapped
//     radially, the squares sample one small patch and tile it, the hexagons
//     tile at about 82 repeats and split across facets, and the two triangles
//     are mirrored against each other. Fitting a top-down projection to the
//     face leaves residuals of 0.20 to 0.74 out of a 0..1 range, where a clean
//     one fits at 0. So the mapping is GENERATED — see projectCloudUV. This was
//     invisible while every finish was a flat colour or a near-uniform cloth,
//     and became the whole problem the moment Cloud Series artwork arrived.
//   * Triangle 1200 has one mesh with a mirrored transform, which bakes wound
//     inside-out. Flipped back.
//   * the hexagons carry ONE material for the whole file, and it is a bright
//     green. Nothing here keeps a file's material: the panel takes a fresh one
//     the finish drives, the cap takes its own, everything else the declared
//     steel.

import * as THREE from 'three'
import { flipWinding } from './models.js'
import { CLOUD_HARDWARE_FINISH, rotStepFor, COLOUR_FAMILIES } from './catalog.js'
import { TEXTILE_SHEET, loadTextileSheet, panelFor, textileReady } from './textiles.js'
import {
  cloudSeriesReady, splitSeriesSwatch, seriesPanel, SERIES_PANELS,
} from './cloudSeries.js'

const BASE = import.meta.env?.BASE_URL ?? '/'

/** How far a cloud hangs below the slab, in metres — to the top of the panel. */
export const CLOUD_DROP = { min: 0.05, max: 2, default: 0.48 }

/** Filled by loadCloudManifest(). A live array, like MODELS and ROOMS. */
export const CLOUD_MODELS = []

export const cloudsOf = (shape) => CLOUD_MODELS.filter((c) => c.shape === shape)
export const cloudShapes = () => [...new Set(CLOUD_MODELS.map((c) => c.shape))]
export const sizesFor = (shape) => cloudsOf(shape).map((c) => c.size).sort((a, b) => a - b)
export const cloudFor = (shape, size) =>
  CLOUD_MODELS.find((c) => c.shape === shape && c.size === size) ?? null

/** Adopt a parsed manifest. Split from the fetch so Node can drive it too. */
export function applyCloudManifest(list) {
  CLOUD_MODELS.length = 0
  for (const c of Array.isArray(list) ? list : []) CLOUD_MODELS.push(c)
  return CLOUD_MODELS.length
}

export async function loadCloudManifest() {
  try {
    const res = await fetch(`${BASE}models/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyCloudManifest((await res.json()).clouds)
  } catch (e) {
    console.warn('Cloud models unavailable:', e.message)
    return 0
  }
}

// ---------------------------------------------------------------------------
// what a cloud model is made of
// ---------------------------------------------------------------------------

/**
 * How near a mesh's plan footprint must be to the panel's to count as part of
 * it. The four shapes are not close to this line from either side: the caps sit
 * at 0.00-0.09% and the nearest piece of hardware at 2.7%.
 */
export const CAP_TOLERANCE = 0.01

/**
 * Sort a cloud's meshes into the panel, its cap, the hardware and the wire.
 *
 * By SHAPE, not by name: the four shapes name their meshes Box019, Sphere002,
 * Object004 and so on, from different numberings, and none of that survives a
 * re-export — as the hexagons proved by arriving renamed and re-split.
 *
 *   suspension — the tall one. A cloud panel is 12-40 mm thick and its wire is
 *                400-1000, so nothing else comes close.
 *   panel      — of what is left, the LOWEST. The face the room sees.
 *   cap        — a flat mesh on the panel's OWN footprint. Not a separate part:
 *                it is the panel's back face, exported as its own mesh on the
 *                hexagons and triangles and not at all on the circles and
 *                squares. It takes the panel's colour, because it IS the panel.
 *   plate      — what is left over is hardware: the backing disc that overhangs
 *                the circle and square panels, and the ceiling fixture at the
 *                top of the triangle's cable. Finished as steel, with the wire.
 *
 * The cap/plate split is measured rather than assumed. Reading it off mesh
 * counts would have been wrong twice already: the hexagons shipped with no cap
 * and now have one, and the triangles shipped with one plate and now have two.
 */
export function classifyCloudMeshes(root) {
  const meshes = []
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o)
  })
  if (!meshes.length) return { panel: null, cap: [], plate: [], suspension: [] }

  const box = new Map()
  for (const m of meshes) box.set(m, new THREE.Box3().setFromObject(m))
  const height = (m) => box.get(m).max.y - box.get(m).min.y
  const size = (m) => box.get(m).getSize(new THREE.Vector3())

  // Tall against its own width is a wire, not a panel.
  const suspension = meshes.filter((m) => {
    const s = size(m)
    return s.y > Math.min(s.x, s.z) * 0.5
  })
  const flat = meshes.filter((m) => !suspension.includes(m))
  if (!flat.length) return { panel: null, cap: [], plate: [], suspension }

  const panel = flat.reduce((a, b) => (box.get(a).min.y <= box.get(b).min.y ? a : b))
  const ps = size(panel)
  const onPanelFootprint = (m) => {
    const s = size(m)
    return Math.abs(s.x - ps.x) <= ps.x * CAP_TOLERANCE
      && Math.abs(s.z - ps.z) <= ps.z * CAP_TOLERANCE
  }

  const rest = flat.filter((m) => m !== panel)
  return {
    panel,
    cap: rest.filter(onPanelFootprint),
    plate: rest.filter((m) => !onPanelFootprint(m)),
    suspension,
    height,
  }
}

/**
 * Bring a panel's UVs into the 0..1 the finishes assume, by RESCALING what the
 * file shipped.
 *
 * Kept because it says what the hexagons do — mapped for tiling, about 82
 * repeats across the face — but it is no longer what the loader uses, and the
 * reason is worth writing down. A rescale preserves the file's own LAYOUT; it
 * only moves the range. That was enough while every cloud finish was a flat
 * colour or a near-uniform cloth, where a scrambled layout is invisible.
 *
 * It is not enough for a picture. Measured across all eleven panels, not one
 * has a mapping that is even close to a top-down projection: fitting one leaves
 * residuals of 0.20 to 0.74 out of a 0..1 range, where a clean projection fits
 * at 0. The circles are unwrapped radially, the squares sample one small patch
 * of the map and tile it, the triangles are mirrored against each other and the
 * hexagons are split across facets. See projectCloudUV, which replaces this in
 * the load path.
 *
 * Returns false when the mapping is already within 0..1, so a correctly exported
 * panel is left exactly as it came.
 */
export function normaliseCloudUV(geometry) {
  const uv = geometry?.attributes?.uv
  if (!uv) return false
  let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity
  for (let i = 0; i < uv.count; i++) {
    u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
    v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
  }
  if (u0 >= -0.05 && u1 <= 1.05 && v0 >= -0.05 && v1 <= 1.05) return false
  const du = Math.max(1e-9, u1 - u0)
  const dv = Math.max(1e-9, v1 - v0)
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - u0) / du, (uv.getY(i) - v0) / dv)
  }
  uv.needsUpdate = true
  return true
}

/**
 * Give a panel a top-down planar UV map built from its own plan footprint.
 *
 * This is the mapping a FACE FINISH wants, and the only one that works for all
 * four shapes: u across the panel's width, v across its depth, 0..1 corner to
 * corner of the plan bounding box. A square metre of panel gets a square metre
 * of image, once, the right way up, whatever the exporter happened to unwrap.
 *
 * Generated rather than corrected, because there was nothing to correct — see
 * normaliseCloudUV above for what the files actually carry. Nothing is written
 * back to the file; this runs on the geometry the loader has already cloned,
 * the same bargain every other fault here is fixed under.
 *
 * Two details that are not arbitrary:
 *
 *   v is oriented by the PANEL, not by the axis. Textures upload with flipY, so
 *   v = 1 is the top of the image, which is where a shaped design puts its
 *   point. Which end of the panel is the point has to be measured, because the
 *   two triangle files disagree: triangle-1200 has its apex at max z and
 *   triangle-900 at min z, since one of them is exported through a mirrored
 *   transform (determinants -2061 and +1360). Mapping v to a fixed axis got
 *   1200 right and stood every 900 on its head — which is what "the triangle
 *   texture is on the wrong way" turned out to be.
 *
 *   the rim is projected too, not masked off. A cloud panel's edge is 12-40 mm
 *   seen almost edge-on, and projecting it carries the face colour over the
 *   edge — which is what a printed panel looks like. Masking it would need a
 *   second material for a band nobody can see.
 *
 * Applied to the panel AND its cap. The cap is the panel's back face, and a
 * back face that kept the file's own mapping would wear the design at whatever
 * scale the exporter left behind.
 */
export function projectCloudUV(geometry) {
  const pos = geometry?.attributes?.position
  if (!pos) return false
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  const w = bb.max.x - bb.min.x
  const d = bb.max.z - bb.min.z
  // A panel with no extent in plan is not a panel. Refused rather than divided
  // by, which would fill the buffer with NaN and render nothing at all.
  if (!(w > 1e-9) || !(d > 1e-9)) return false
  const flip = pointsAtMinZ(geometry, bb, d)
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) - bb.min.z) / d
    uv[i * 2] = (pos.getX(i) - bb.min.x) / w
    uv[i * 2 + 1] = flip ? 1 - t : t
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.attributes.uv.needsUpdate = true
  return true
}

/**
 * How far the plan area has to sit off centre before a panel counts as pointed.
 *
 * A triangle's area centroid is a third of the way up from its base, which is
 * 17% of the depth off centre — nowhere near this line from either side. The
 * square, circle and hexagon sit at 0.0%. 5% is wide enough that nothing
 * symmetric is ever flipped by arithmetic noise and narrow enough that anything
 * genuinely pointed is caught.
 */
export const POINTED_TOLERANCE = 0.05

/**
 * Does this panel's point face min z?
 *
 * Answered from the AREA, not from the outline: the centroid of a shape's plan
 * area sits away from its point, towards the broad end. So a centroid past the
 * middle means the broad end is at max z and the point is at min z, and v has
 * to run backwards for the artwork's point to land on the panel's.
 *
 * Measured this way rather than by comparing the width at the two ends, because
 * the hexagons are a point at BOTH ends — two widths of zero, which that test
 * cannot tell apart from a shape with no point at all. An area centroid answers
 * "dead centre" for the hexagon, which is the truth, and the tolerance then
 * leaves it alone.
 *
 * The rim is included and costs nothing: its faces are vertical, so they have
 * no area in plan to weigh.
 */
function pointsAtMinZ(geometry, bb, d) {
  const pos = geometry.attributes.position
  const idx = geometry.index
  const n = idx ? idx.count : pos.count
  let area = 0
  let weighted = 0
  for (let t = 0; t + 2 < n; t += 3) {
    const a = idx ? idx.getX(t) : t
    const b = idx ? idx.getX(t + 1) : t + 1
    const c = idx ? idx.getX(t + 2) : t + 2
    const ax = pos.getX(a); const az = pos.getZ(a)
    const bx = pos.getX(b); const bz = pos.getZ(b)
    const cx = pos.getX(c); const cz = pos.getZ(c)
    const face = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2
    if (!(face > 0)) continue
    area += face
    weighted += face * (az + bz + cz) / 3
  }
  if (!(area > 0)) return false
  const middle = (bb.min.z + bb.max.z) / 2
  return (weighted / area) - middle > d * POINTED_TOLERANCE
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

/**
 * One material for every part of every cloud that is not the panel, whatever
 * its own file shipped.
 *
 * Built once and shared. The alternative is what the files give: the hexagon
 * hanging on bright green, and its back face green too, because that is the one
 * material its file carries. See CLOUD_HARDWARE_FINISH for the numbers and why.
 */
const HARDWARE_MAT = new THREE.MeshStandardMaterial({
  name: 'CloudHardware',
  color: new THREE.Color(CLOUD_HARDWARE_FINISH.hex),
  roughness: CLOUD_HARDWARE_FINISH.roughness,
  metalness: CLOUD_HARDWARE_FINISH.metalness,
})

const loaded = new Map()   // model id -> built cloud
const coming = new Map()   // model id -> promise
const listeners = new Set()

export function subscribeCloudModel(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const cloudModel = (id) => loaded.get(id) ?? null

const asset = (f) => `${BASE}models/${f.split('/').map(encodeURIComponent).join('/')}`

/**
 * Load one cloud, normalised the way every other product here is: centred in
 * X/Z, top of the PANEL at y = 0 so it hangs off the ceiling plane, metres.
 *
 * The suspension is put on its own group and measured, so the renderer can
 * scale it to whatever drop is asked for without the panel moving with it.
 */
export function loadCloudModel(id) {
  const entry = CLOUD_MODELS.find((c) => c.id === id)
  if (!entry) return Promise.resolve(null)
  if (coming.has(id)) return coming.get(id)

  const promise = (async () => {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    const res = await fetch(asset(entry.file))
    if (!res.ok) throw new Error(`${res.status} loading ${entry.file}`)
    const root = new FBXLoader().parse(await res.arrayBuffer(), '')
    root.updateMatrixWorld(true)

    const { panel, cap, plate, suspension } = classifyCloudMeshes(root)
    if (!panel) throw new Error(`no panel found in ${entry.file}`)

    const body = new THREE.Group()
    body.name = 'Cloud'
    const wires = new THREE.Group()
    wires.name = 'CloudSuspension'

    let uvFixed = false
    let flipped = 0
    // Nothing here keeps the material its file shipped. Panel and cap are given
    // a fresh one so the colour picker can drive them; everything else is given
    // the declared steel. The hexagon is why: one green material for the whole
    // file, so anything left on it came out green whatever colour was chosen.
    const take = (o, into, role) => {
      const isPanel = role === 'panel' || role === 'cap'
      const g = o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      if (o.matrixWorld.determinant() < 0) { flipWinding(g); flipped++ }
      // Panel AND cap. They are the two faces the room sees and they share one
      // material, so once that material can carry a PICTURE both of them need a
      // real mapping — not the file's rescaled, which is a scrambled layout at
      // the right range. Free for a flat colour, which has no map to place.
      if (isPanel && projectCloudUV(g)) uvFixed = true
      const mesh = new THREE.Mesh(g, isPanel ? o.material : HARDWARE_MAT)
      mesh.name = o.name
      mesh.raycast = () => {}
      mesh.userData.cloudPanel = isPanel
      mesh.userData.cloudRole = role
      into.add(mesh)
      return mesh
    }

    const panelMesh = take(panel, body, 'panel')
    for (const m of cap) take(m, body, 'cap')
    for (const m of plate) take(m, body, 'hardware')
    for (const m of suspension) take(m, wires, 'wire')

    // Centre on the panel and put ITS top at y = 0 — the cloud hangs from there,
    // and measuring the box around the suspension instead would put the panel
    // half a metre below wherever it was asked to go.
    const pb = new THREE.Box3().setFromObject(panelMesh)
    const c = pb.getCenter(new THREE.Vector3())
    const place = (m) => {
      m.geometry.translate(-c.x, -pb.max.y, -c.z)
      m.geometry.scale(0.001, 0.001, 0.001)
      m.geometry.computeBoundingBox()
    }
    body.children.forEach(place)
    wires.children.forEach(place)

    const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3())
    const wb = new THREE.Box3().setFromObject(wires)
    const wireHeight = wires.children.length && Number.isFinite(wb.max.y)
      ? Math.max(1e-6, wb.max.y)
      : 0

    const built = {
      id, shape: entry.shape, size: entry.size,
      object: body, panel: panelMesh, wires, wireHeight,
      extent: { x: size.x, y: size.y, z: size.z },
      uvFixed, flipped,
    }
    loaded.set(id, built)
    listeners.forEach((l) => l())
    return built
  })()

  coming.set(id, promise)
  promise.catch((e) => { console.warn('[clouds]', e.message); coming.delete(id) })
  return promise
}

// ---------------------------------------------------------------------------
// the product
// ---------------------------------------------------------------------------

export function defaultCloudParams() {
  return {
    shape: null,
    size: null,
    // Answered, because there is only one answer. Nothing else here is filled
    // in for you — but a field with a single option is not a question, and
    // making somebody click it to agree with it is a click for nothing.
    thickness: CLOUD_THICKNESSES[0],
    family: CLOUD_FAMILIES[0],
    colour: null,
    drop: CLOUD_DROP.default,
    rot: 0,
  }
}

export const emptyCloudParams = defaultCloudParams

const CLOUD_REQUIRED = [
  ['shape', 'Shape'],
  ['size', 'Size'],
  ['colour', 'Colour'],
]

/**
 * What a cloud must answer, in the order the panel asks, for THIS spec.
 *
 * Split out from cloudMissingFields so the "still to choose" line and the
 * field-by-field unlocking in the panel read the same list — see lib/gate.js.
 * Two sources for one order is two chances for them to disagree about what
 * comes next.
 */
export function cloudRequired(p) {
  const fabric = cloudIsFabric(p)
  const series = cloudIsSeries(p)
  // The same field under the name its range gives it. A solid cloud is asked
  // for a Colour; a fabric one is asked for a Fabric, because FB1_Blue_2 is
  // not a colour and calling it one in the "still to choose" line is how a
  // list stops being readable. A Cloud Series one is asked for a Design,
  // because that is the half of CL-01_Blue somebody has to decide first.
  return CLOUD_REQUIRED.map(([k, label]) => {
    if (k !== 'colour') return [k, label]
    return [k, fabric ? 'Fabric' : series ? 'Design' : label]
  })
}

export function cloudMissingFields(p) {
  return cloudRequired(p).filter(([k]) => p?.[k] == null).map(([, label]) => label)
}

/** Is this cloud faced in photographed cloth rather than a flat colour? */
export const cloudIsFabric = (p) => COLOUR_FAMILIES[p?.family]?.sheet === true

/** Is this cloud faced in printed Cloud Series artwork? */
export const cloudIsSeries = (p) => COLOUR_FAMILIES[p?.family]?.series === true

/**
 * The thicknesses a cloud is made in.
 *
 * One, and it is 40 mm. A list rather than a constant because that is the shape
 * every other product's thickness takes here, and because a second thickness
 * arriving should be a value added to a list rather than a control invented.
 *
 * It does NOT come from the models, and they disagree with it: the eleven files
 * are drawn at 11.6 to 43.2 mm, no two sizes alike. 40 is what the product is;
 * the drawings are a drawing. The panel says 40 and no longer reports what its
 * own model measures, because a number nobody can order is not worth the space.
 */
export const CLOUD_THICKNESSES = [40]

/**
 * The finish families a cloud is offered, in the order the panel lists them.
 *
 * The printed range, then the 275-panel fabric picker. A cloud has no flat
 * colour at all now.
 *
 * TWO have been removed, and it is worth keeping them apart.
 *
 * `cloud-solid` was four invented hexes — its own comment said "placeholders
 * for testing the cloud range, not transcribed from the workbook" — and was
 * replaced by Solid Coloured PET, the real 44-colour range doing the same job.
 *
 * `pet-solid` then went too, and that was a product decision rather than a
 * correction: clouds are sold printed or in cloth. It is still offered on
 * baffles and fins, so the family itself stays in the catalogue; it is only
 * this list that has stopped naming it.
 *
 * Both are left resolvable in the catalogue so that a layout saved against
 * either still finds its swatch — but nothing now carries it through
 * reconcileCloud, which is said plainly at LEGACY_CLOUD_COLOURS below and in
 * the solid branch of reconcileCloud, both of which are currently unreachable.
 *
 * Colour Core Fabric and Ombre are NOT here. They are 163 photographed finishes
 * offered on baffles, and putting them on a cloud is not a list change — each
 * would need the same per-panel true-scale crop the fabric already gets, or it
 * would land at whatever scale the exporter left behind.
 */
export const CLOUD_FAMILIES = ['cloud-series', 'designer-textiles']

/**
 * Where the four placeholder cloud colours went when PET replaced them.
 *
 * INERT AS IT STANDS, and left rather than deleted. It is read only by the
 * solid branch of reconcileCloud, and no family a cloud is offered reaches that
 * branch any more — both remaining ones are a sheet or a series. So a cloud
 * saved as cloud-solid now lands on cloud-series with no colour, exactly like
 * one saved as pet-solid.
 *
 * Kept because it is four lines, because it is correct if a solid range is ever
 * offered on clouds again, and because deleting the map would also delete the
 * record of what those four colours were.
 *
 * Nearest by RGB distance, all within 40 of 255. Applied only when the spec
 * actually SAYS cloud-solid, so a PET colour that happens to share a name is
 * never rewritten.
 */
export const LEGACY_CLOUD_COLOURS = {
  Red: 'Marmalade',
  Blue: 'Prussian Blue',
  Green: 'Jalapeno',
  Yellow: 'Old Gold',
}

export const cloudReadyToPlace = (p) => cloudMissingFields(p).length === 0

/** Normalise a cloud spec — the cloud counterpart of reconcile(). */
export function reconcileCloud(p = {}) {
  const shape = cloudShapes().includes(p.shape) ? p.shape : null
  // A size the shape does not come in is dropped rather than kept: triangle has
  // no 600, and a spec naming one would load nothing.
  const size = shape && sizesFor(shape).includes(p.size) ? p.size : null
  // The family is a real choice now, not a constant. `swatches` is still the
  // solid range the caller passes — a fabric key is checked against the panel
  // map instead, because a sheet is not a swatch and the two live in different
  // places.
  const family = CLOUD_FAMILIES.includes(p.family) ? p.family : CLOUD_FAMILIES[0]
  const fabric = COLOUR_FAMILIES[family]?.sheet === true
  const series = COLOUR_FAMILIES[family]?.series === true
  let colour
  if (fabric) {
    // Not ready and not a real key are different states, and only the second is
    // a reason to drop one — the map comes off a CDN.
    colour = textileReady() ? (panelFor(p.colour) ? p.colour : null) : p.colour ?? null
  } else if (series) {
    // Same rule, and for the same reason: the artwork manifest is fetched, so
    // "not loaded yet" must not look like "you picked something that is gone".
    //
    // A code is real when it IS one, and when the design is drawn in that
    // colour. When the shape is known it also has to be drawn in that shape —
    // a design that shipped without one of its four would otherwise be pickable
    // on the one it is missing. When the shape is not known yet, the first two
    // still have to hold: an unknown shape is a reason to skip the third test,
    // not a reason to wave everything through.
    const bits = splitSeriesSwatch(p.colour)
    const real = bits
      && (shape
        ? !!seriesPanel(bits.design, shape, bits.colour)
        : SERIES_PANELS.some((q) => q.design === bits.design && q.colour === bits.colour))
    colour = cloudSeriesReady() ? (real ? p.colour : null) : p.colour ?? null
  } else {
    // UNREACHABLE while CLOUD_FAMILIES names no solid range — both of the two
    // it does name are a sheet or a series, so one of the branches above always
    // takes it. Kept as the third arm of a three-way rather than deleted: a
    // solid family may come back, and a reconcile that silently had no answer
    // for one would be worse than a branch nobody visits.
    //
    // The chosen family's own swatches, looked up here rather than passed in.
    // Every caller used to hand over cloud-solid's list whatever family was
    // actually chosen, which was harmless only while cloud-solid was the one
    // solid family a cloud had.
    const swatches = COLOUR_FAMILIES[family]?.swatches ?? []
    // A colour carried over from the placeholder range: mapped rather than
    // dropped, so a saved layout does not come back missing its finish.
    const carried = p.family === 'cloud-solid' && LEGACY_CLOUD_COLOURS[p.colour]
      ? LEGACY_CLOUD_COLOURS[p.colour]
      : p.colour
    colour = swatches.length
      ? (swatches.some((s) => s.code === carried) ? carried : null)
      : carried ?? null
  }
  return {
    ...p,
    shape,
    size,
    // Never null. One option means there is nothing to drop it to.
    thickness: CLOUD_THICKNESSES.includes(p.thickness) ? p.thickness : CLOUD_THICKNESSES[0],
    family,
    colour,
    drop: Math.min(CLOUD_DROP.max, Math.max(CLOUD_DROP.min,
      Number.isFinite(p.drop) ? p.drop : CLOUD_DROP.default)),
    // Eight positions, because a cloud turns in 45 degree steps. Derived from
    // the step rather than listed, so a layout saved at 45 does not quietly
    // come back at 0 if the step is ever changed again.
    rot: CLOUD_ROTATIONS.includes(p.rot) ? p.rot : 0,
  }
}

/**
 * A fabric face for one cloud, cropped out of the panel at TRUE SCALE.
 *
 * The same 1200 x 2800 mm sheet a baffle fin is a strip of and a ceiling tile
 * is a patch of: a 1200 mm cloud shows 1200 mm of real cloth, so three products
 * in one fabric are the same cloth at the same size.
 *
 * A crop, not a fit — repeat below 1 with an offset, which is what
 * RepeatWrapping already does. The crop is CENTRED, so every cloud of a size
 * wears the same patch; clouds hang as separate objects rather than as a field,
 * so there is no seam for a varied crop to hide.
 *
 * The panel's UVs are PROJECTED top-down on load (projectCloudUV), which is
 * what makes one crop work across square, circle, hexagon and triangle without
 * any of them knowing about fabric.
 */
export async function cloudPanelTexture(code, { plan } = {}) {
  const sheet = await loadTextileSheet(code)
  if (!sheet) return null
  const p = plan ?? { length: 1.2, width: 1.2 }
  // The sheet arrives turned a quarter: its canvas X is the panel's 2800 mm
  // side and its Y the 1200 mm side.
  const rx = Math.min(1, p.length / TEXTILE_SHEET.h)
  const ry = Math.min(1, p.width / TEXTILE_SHEET.w)
  // Cloned so this cloud can hold its own crop; a clone shares its Source, so
  // every cloud wearing one fabric is still a single upload.
  const tex = sheet.tex.clone()
  tex.repeat.set(rx, ry)
  tex.offset.set((1 - rx) / 2, (1 - ry) / 2)
  tex.needsUpdate = true
  return tex
}

/** Every angle a cloud can be saved at: 0, 45, 90 ... 315. */
export const CLOUD_ROTATIONS = Array.from(
  { length: Math.round(360 / rotStepFor('clouds')) },
  (_, i) => i * rotStepFor('clouds')
)

/**
 * The plan size of one cloud, in metres.
 *
 * From the model where it has loaded, and from the nominal size before that —
 * the two differ, and by more than rounding: a "1200" hexagon measures 1046
 * across the flats and 1208 across the corners, and a "1200" square is 1197.
 */
export function cloudExtent(p) {
  const m = p?.shape && p?.size ? cloudFor(p.shape, p.size) : null
  const nominal = (p?.size ?? 600) / 1000
  if (!m?.plan) return { length: nominal, width: nominal }
  return { length: m.plan.x, width: m.plan.z }
}

export function cloudCells(p, pitch) {
  const e = cloudExtent(p)
  return {
    ci: Math.max(1, Math.ceil(e.length / pitch - 1e-6)),
    cj: Math.max(1, Math.ceil(e.width / pitch - 1e-6)),
  }
}
