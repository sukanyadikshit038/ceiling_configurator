// Ceiling tiles: what the model is made of, and how a finish is put on it.
//
// A tile finish is TWO images. A Wood Classic panel is the base, and a
// perforation is laid over it — a white sheet with dark holes, which is what
// the supplied JPEGs are. They carry no alpha, so "overlay" here means
// multiply: white leaves the wood alone and the holes darken it. The two are
// combined once, into one texture, rather than asked of the renderer every
// frame.
//
// The range comes in two panel sizes, 600 x 600 and 1200 x 600, and each is a
// folder of its own under textures/ceiling-tiles/wood-classic. How many times
// a panel repeats across a tile is DERIVED from the module and the tile it is
// going on, not
// declared — so a model on a truer module needs no change here.
//
// A caveat that belongs in the file rather than in a commit message: the
// delivered model's tiles are 1265 x 1289 mm, which is neither module. Measured
// off the file — the tile centres step 1259/1308/1301 mm along x and the rails
// come in three different lengths — so it is a visual mock-up rather than a
// setting-out model, and every panel renders about 6-8% oversize. That was a
// deliberate call: the finishes are real and worth seeing now, and the geometry
// is to be rebuilt from the module later.
//
// One mesh in the file, `vicstripceiling_sneha001`, is the perimeter frame, the
// cross-tees AND the four suspension rods. It spans the whole model, so a
// footprint test called it surrounding ceiling and dropped it; it is not, and
// 98.8% of its 225,920 triangles sit at grid height filling 11% of their
// footprint, which is what a frame looks like and what a ceiling does not.
//
// The rods inside it are 6.4 mm across and run the full 2,928 mm from the grid
// to the slab. They cannot be found by looking at vertex heights — a cylinder
// has vertices only at its two ends, so the middle 2.8 m of a rod holds no
// vertex and reads as empty. splitAtHeight tests TRIANGLES for that reason.

import * as THREE from 'three'
import { flipWinding } from './models.js'
// The rod is hardware, and hardware is one declared finish across the app —
// the same grey a cloud's clamps and wires take.
import { CLOUD_HARDWARE_FINISH } from './catalog.js'
import {
  TEXTILE_SHEET, textileSheet, loadTextileSheet, panelFor, textileReady,
} from './textiles.js'

const BASE = import.meta.env?.BASE_URL ?? '/'

/**
 * Where one tile category's panels live.
 *
 * The tree is textures/ceiling-tiles/<category>/<range>/<size>/, and only
 * wood-classic is wired up. univicstrip sits alongside it in the folders but
 * is deliberately not read: its panels have the strip pattern already in
 * them, so that range is waiting on images where the colour and the pattern
 * are separable the way Wood Classic's are.
 */
export const TILE_TEX = 'textures/ceiling-tiles/wood-classic/'

/**
 * The panel sizes the range is made in.
 *
 * `module` is the setting-out square the panel belongs to; `panel` is the panel
 * itself, 5 mm smaller on each axis for the grid it drops into — which is what
 * the filenames say (595x595 and 1195x595) and what a real tile measures.
 *
 * The key is the folder name under the category's <range>/ directory, so adding
 * a size is adding a folder and one entry here.
 */
export const TILE_SIZES = {
  '600x600': {
    id: '600x600',
    label: '600 × 600',
    module: { x: 600, z: 600 },
    panel: { x: 595, z: 595 },
  },
  '1200x600': {
    id: '1200x600',
    label: '1200 × 600',
    module: { x: 1200, z: 600 },
    // The long axis runs along X — the tile face's u, measured: the mapping is
    // planar with R2 = 1.0000, u spanning the tile's 1265 mm x and v its 1289 mm z.
    panel: { x: 1195, z: 595 },
  },
}

/**
 * How far a block hangs below the slab, in metres.
 *
 * Measured from the slab to the TILE FACE, which is how a suspended ceiling is
 * quoted — not to the top of the grid, which is 43 mm of rail nobody specifies
 * against. Zero is allowed: a block tight to the soffit is a real detail, and it
 * is where this sat before the control existed.
 *
 * Nothing is drawn in the void. A real grid hangs on wire, and the delivered
 * model has none — inventing some would be inventing product geometry.
 */
export const TILE_DROP = { min: 0, max: 1.2, default: 0.15 }

/**
 * The board thicknesses the range is made in, in millimetres.
 *
 * SPECIFICATION ONLY. Nothing here reaches the model, the footprint or the
 * grid: the supplied files are one thickness each and a 40 mm tile renders
 * exactly as a 12 mm one does. It is on the schedule because it is on the
 * order, and it is asked for because a tile block should BE the tile somebody
 * specified — the same reason the size and the perforation are asked for.
 *
 * Not to be confused with the GRID, which is the 15 or 24 mm exposed tee. That
 * one does change the model, because it is a different file.
 */
export const TILE_THICKNESSES = [12, 25, 40]

/**
 * The shallowest a block can hang, in metres — the depth of grid above the tile
 * face. Measured off the loaded model; 0 until it has loaded, which lets the
 * control exist before the file does rather than inventing a number for it.
 */
export const tileFaceOffset = (p) => tileModel(p)?.faceOffset ?? 0

/** The size a tile opens on, and the one every fallback uses. */
export const DEFAULT_TILE_SIZE = '600x600'

/**
 * The grid width a tile spec opens on.
 *
 * 24 mm because it is the common lay-in tee and because it is what the
 * generated model this range used to draw was built at, so the default
 * appearance does not change under anyone who had one placed.
 */
export const DEFAULT_TILE_GRID = 24

/**
 * How many tiles a field may be, per axis.
 *
 * A field exists because the placement grid cannot express the module. The
 * supplied tiles are on a 617 or 632 mm module and the grid counts in 100 mm
 * cells, so two SEPARATELY placed blocks can never be nearer than 700 mm and
 * leave an 83 mm joint. Inside one field the tiles are laid at the module
 * itself, exactly, so the joint does not exist — the grid only decides where
 * the field starts.
 *
 * Capped at 16 because every tile is its own draw: 16 x 16 is 9.9 m of ceiling
 * and about 1,700 rail meshes, which is already more than any room here needs.
 */
export const TILE_FIELD = { min: 1, max: 16, default: 1 }

export const clampField = (n, fallback = TILE_FIELD.default) =>
  Math.min(TILE_FIELD.max, Math.max(TILE_FIELD.min,
    Number.isFinite(n) ? Math.round(n) : fallback))

/**
 * How many panels fit across a tile of the given size, per axis.
 *
 * Derived rather than declared. On the delivered 1265 x 1289 mm tile a 600 mm
 * module gives 2 x 2 and a 1200 x 600 gives 1 x 2 — and on a model built to a
 * true module it would give the right answer there too, with nothing to change.
 */
export function tileRepeat(sizeKey, tileMm = { x: 1265, z: 1289 }) {
  const size = TILE_SIZES[sizeKey] ?? TILE_SIZES[DEFAULT_TILE_SIZE]
  return [
    Math.max(1, Math.round(tileMm.x / size.module.x)),
    Math.max(1, Math.round(tileMm.z / size.module.z)),
  ]
}

/** What one panel actually renders as, once stretched over the tile it is on. */
export function drawnPanelMm(sizeKey, tileMm = { x: 1265, z: 1289 }) {
  const [rx, rz] = tileRepeat(sizeKey, tileMm)
  return { x: tileMm.x / rx, z: tileMm.z / rz }
}

/**
 * How wide a tile texture is kept once decoded.
 *
 * The supplied files are 7205 px square — 52 megapixels for a 600 mm panel,
 * which is 12 pixels per millimetre and about 200 MB decoded. A tile is a metre
 * or so of ceiling seen from four metres away. 1024 across 600 mm is 1.7 px/mm,
 * which is more than the screen can show and a two-hundredth of the memory.
 */
export const TILE_PX = 1024

/**
 * How much of a perforation sheet is bleed rather than panel.
 *
 * The perforation files are PREPRESS SHEETS, not textures. Each carries
 * registration crop marks at the four corners and a printed caption below the
 * panel — "PF-NC-08_595x595" — and drawing the whole sheet onto a tile puts
 * both of them on the ceiling.
 *
 * Measured on all twelve files at the pixel: the crop marks end at 87 px of
 * 7205 on every one, so the panel is the middle 1.207%..98.793%. Declared here
 * rather than detected per image because it is one artwork template and twelve
 * files agree to the pixel; a sheet on a different template would show a hair
 * of its marks at the tile edge, which is the failure this would have.
 *
 * The WOOD files need none of this — they are edge-to-edge veneer with no marks
 * and no caption, which is why only the perforation is cropped.
 */
export const PERF_BLEED = 87 / 7205

/** Filled by loadTileFinishes(). A live object, like COLOUR_CORE. */
export const TILE_FINISHES = {
  ready: false,
  // size key -> { woodClassic: [{ code, file, px, bytes }], perforation: [...] }
  sizes: {},
}

/** The sizes the folders actually publish, in the order the picker offers them. */
export const tileSizeKeys = () =>
  Object.keys(TILE_SIZES).filter((k) => TILE_FINISHES.sizes[k]?.woodClassic?.length)

const setFor = (size) => TILE_FINISHES.sizes[size] ?? TILE_FINISHES.sizes[DEFAULT_TILE_SIZE] ?? null

export const woodsFor = (size) => setFor(size)?.woodClassic ?? []
export const perforationsFor = (size) => setFor(size)?.perforation ?? []

export const woodOf = (size, code) => woodsFor(size).find((w) => w.code === code) ?? null
export const perforationOf = (size, code) => perforationsFor(size).find((p) => p.code === code) ?? null

/** Adopt a parsed finish map. Split from the fetch so Node can drive it too. */
export function applyTileFinishes(data) {
  TILE_FINISHES.sizes = {}
  for (const [key, set] of Object.entries(data?.sizes ?? {})) {
    TILE_FINISHES.sizes[key] = {
      woodClassic: Array.isArray(set?.woodClassic) ? set.woodClassic : [],
      perforation: Array.isArray(set?.perforation) ? set.perforation : [],
    }
  }
  TILE_FINISHES.ready = tileSizeKeys().length > 0
  return tileSizeKeys().reduce((n, k) => n + TILE_FINISHES.sizes[k].woodClassic.length, 0)
}

export async function loadTileFinishes() {
  try {
    const res = await fetch(`${BASE}${TILE_TEX}manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyTileFinishes(await res.json())
  } catch (e) {
    console.warn('Tile finish map unavailable:', e.message)
    return 0
  }
}

/** The tile MODELS, from the same manifest the rooms and clouds come from. */
export async function loadTileManifest() {
  try {
    const res = await fetch(`${BASE}models/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyTileModels((await res.json()).tiles)
  } catch (e) {
    console.warn('Tile models unavailable:', e.message)
    return 0
  }
}

// ---------------------------------------------------------------------------
// what the model is made of
// ---------------------------------------------------------------------------

/**
 * How much of its own footprint a mesh's horizontal surfaces actually fill.
 *
 * Only faces pointing up or down count — the edges of a frame are vertical and
 * would otherwise let a thin rail read as solid. Returned as a fraction of one
 * side, so a slab modelled with a top and a bottom comes out near 1 rather than
 * near 2.
 */
function flatCoverage(mesh, size) {
  const g = mesh.geometry
  const plan = Math.max(1e-9, size.x * size.z)
  const p = g.attributes.position
  const idx = g.index
  const n = idx ? idx.count : p.count
  const A = new THREE.Vector3()
  const B = new THREE.Vector3()
  const C = new THREE.Vector3()
  const u = new THREE.Vector3()
  const v = new THREE.Vector3()
  let flat = 0
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx.getX(t) : t
    const b = idx ? idx.getX(t + 1) : t + 1
    const c = idx ? idx.getX(t + 2) : t + 2
    A.fromBufferAttribute(p, a).applyMatrix4(mesh.matrixWorld)
    B.fromBufferAttribute(p, b).applyMatrix4(mesh.matrixWorld)
    C.fromBufferAttribute(p, c).applyMatrix4(mesh.matrixWorld)
    u.subVectors(B, A)
    v.subVectors(C, A)
    u.cross(v)
    const len = u.length()
    if (len && Math.abs(u.y / len) > 0.9) flat += len / 2
  }
  // halved: a solid panel presents both a top and a bottom
  return flat / 2 / plan
}

/**
 * Split a geometry at a height, into what is below it and what reaches above.
 *
 * The frame mesh holds the grid AND the suspension rods — four of them, 6.4 mm
 * across, running the full 2,928 mm from the grid to the slab. They have to be
 * separated because they are scaled to the drop while the grid is not, and they
 * cannot be found by looking at vertex heights: a plain cylinder has vertices
 * only at its two ends, so the middle 2.8 m of a rod contains no vertex at all
 * and reads as empty space. A TRIANGLE that reaches above the cut is the test;
 * a vertex above it is not.
 *
 * Either half is null when it would be empty, so a caller can tell "nothing to
 * split" from "split into two" rather than adding invisible meshes.
 */
export function splitAtHeight(geometry, maxY, matrix) {
  const p = geometry.attributes.position
  const idx = geometry.index
  const n = idx ? idx.count : p.count
  const at = (i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix)

  const under = []
  const over = []
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx.getX(t) : t
    const b = idx ? idx.getX(t + 1) : t + 1
    const c = idx ? idx.getX(t + 2) : t + 2
    // A triangle belongs to the rods if ANY corner reaches above the grid — one
    // corner on the grid and one at the slab is exactly what a rod's side is.
    const list = (at(a).y <= maxY && at(b).y <= maxY && at(c).y <= maxY) ? under : over
    list.push(a, b, c)
  }
  if (!over.length) return { below: null, above: null } // nothing to split

  const build = (list) => {
    if (!list.length) return null
    const out = new THREE.BufferGeometry()
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      const size = attr.itemSize
      const arr = new Float32Array(list.length * size)
      list.forEach((src, i) => {
        for (let k = 0; k < size; k++) arr[i * size + k] = attr.array[src * size + k]
      })
      out.setAttribute(name, new THREE.BufferAttribute(arr, size))
    }
    return out
  }
  return { below: build(under), above: build(over) }
}

/**
 * Sort a tile model's meshes into the tile faces, the grid, and the context.
 *
 * Sorted by SHAPE rather than by name, because names survive a re-export about
 * as well as they survived the last three baffle files:
 *
 *   context  — its footprint covers most of the whole model AND it fills that
 *              footprint. Both halves are needed, and testing the footprint
 *              alone threw the cross-tees away: see the note in the classifier.
 *   panels   — flat and thin against their own width: the tiles. NOT required
 *              to arrive with UVs. The Wood Classic export ships none at all,
 *              and a flat rectangle has one sensible mapping anyway, so a
 *              planar set is generated on load rather than the tiles being
 *              refused for the want of it.
 *   face     — of those, the thinnest group. A tile here is a 3 mm face with a
 *              35 mm body behind it, and the face is what the room sees.
 *   grid     — everything else: the rails, the tees and the perimeter frame.
 */
/**
 * The height the grid actually occupies, in the model's own units.
 *
 * The MEDIAN of the pieces, not the maximum, and that distinction is the whole
 * function. The frame mesh is one of the grid pieces and reaches 2.9 m, so a
 * maximum puts the ceiling of the grid plane above the soffit it is meant to cut
 * off — nothing is clipped, the block loads 2.9 m tall, and its pick box becomes
 * a room-height slab. Nine of the ten pieces top out at 51 mm; the median says
 * so and the maximum does not.
 *
 * Returns Infinity when there is no grid to measure, which clips nothing — the
 * honest answer when there is nothing to compare against.
 */
export function gridPlaneTop(gridMeshes) {
  if (!gridMeshes?.length) return Infinity
  const boxes = gridMeshes.map((m) => new THREE.Box3().setFromObject(m))
  const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const top = mid(boxes.map((b) => b.max.y))
  const height = Math.max(1e-6, mid(boxes.map((b) => b.max.y - b.min.y)))
  return top + height * 0.5
}

export function classifyTileMeshes(root) {
  const meshes = []
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o)
  })
  if (!meshes.length) return { faces: [], bodies: [], grid: [], context: [] }

  const whole = new THREE.Box3()
  const boxes = new Map()
  for (const m of meshes) {
    const b = new THREE.Box3().setFromObject(m)
    boxes.set(m, b)
    whole.union(b)
  }
  const ws = whole.getSize(new THREE.Vector3())
  const wholePlan = Math.max(1e-9, ws.x * ws.z)

  // A big footprint is not enough to call something context, and believing it
  // was is how this file lost its cross-tees. `vicstripceiling_sneha001` spans
  // the whole model — because it IS the perimeter frame and the tees between the
  // rows — and 98.8% of its 225,920 triangles sit at grid height. Dropping it
  // took every divider running the short way with it.
  //
  // What actually separates a ceiling from a frame is COVERAGE: a ceiling fills
  // its footprint, a frame is mostly hole. Measured on this file, the frame
  // covers 11%; a slab would be near 100% per side.
  const context = []
  const rest = []
  for (const m of meshes) {
    const s = boxes.get(m).getSize(new THREE.Vector3())
    const wide = s.x * s.z > wholePlan * 0.5
    ;(wide && flatCoverage(m, s) > 0.5 ? context : rest).push(m)
  }

  const split = (list) => {
    const panels = []
    const grid = []
    for (const m of list) {
      const s = boxes.get(m).getSize(new THREE.Vector3())
      const plan = Math.min(s.x, s.z)
      const flat = plan > 0 && s.y < plan * 0.25
      ;(flat ? panels : grid).push(m)
    }
    return { panels, grid }
  }

  let { panels, grid } = split(rest)

  // Context only means anything as something a ceiling is SURROUNDED BY. A model
  // of a single tile is mostly tile by footprint and the tile does fill it, so
  // the test above calls the product its own surroundings and drops it, leaving
  // a model with no tiles in it.
  //
  // Nothing that leaves zero tiles was context. Put it back and sort again.
  if (!panels.length && context.length) {
    ({ panels, grid } = split([...rest, ...context]))
    context.length = 0
  }

  // the thinnest group of panels is the face; the rest are the bodies behind it
  const thickness = (m) => +boxes.get(m).getSize(new THREE.Vector3()).y.toFixed(3)
  const thinnest = panels.length ? Math.min(...panels.map(thickness)) : 0
  const faces = panels.filter((m) => thickness(m) <= thinnest * 1.5)
  const bodies = panels.filter((m) => !faces.includes(m))

  return { faces, bodies, grid, context }
}

/**
 * How much of a panel's area faces down, up, and sideways.
 *
 * Measured per triangle from its own winding, because that is the only thing
 * that says which way a surface is meant to be seen. The three ranges disagree
 * completely: the two box models are 0.35 m2 each way, and Univic Strip's panel
 * is 1.35 m2 UP and nothing down — a plane wound inside out.
 */
export function panelFacing(geometry) {
  const pos = geometry.attributes.position
  const idx = geometry.index
  const n = idx ? idx.count / 3 : pos.count / 3
  let down = 0; let up = 0; let edge = 0
  for (let t = 0; t < n; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
    const ax = pos.getX(i0); const ay = pos.getY(i0); const az = pos.getZ(i0)
    const ux = pos.getX(i1) - ax; const uy = pos.getY(i1) - ay; const uz = pos.getZ(i1) - az
    const vx = pos.getX(i2) - ax; const vy = pos.getY(i2) - ay; const vz = pos.getZ(i2) - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) continue
    const a = len / 2
    const d = ny / len
    if (d < -FACING) down += a
    else if (d > FACING) up += a
    else edge += a
  }
  return { down, up, edge, tris: n }
}

/** How square-on a triangle must be to count as facing the room, or the slab. */
const FACING = 0.5

/**
 * Reorder a panel's triangles so the room-facing ones come first, and group
 * them, so the mesh can wear the finish on one side and the board on the other.
 *
 * A lay-in tile is finished on ONE side, and the supplied panels are solid
 * boxes with a single material over all six faces — so without this the veneer
 * and the perforation are painted on the top and the edges too.
 *
 * Groups rather than two meshes: geometry is shared by every placed block, so
 * the reordering is paid once per MODEL and a block still draws as one object.
 *
 * A panel with no up-facing area at all is a flat plane, which has no top to
 * paint. There the SAME triangles are grouped twice and the board is drawn on
 * their reverse — see the material array in useTileBlock.
 *
 * Returns what it did, so the loader can report it rather than assume it.
 */
export function splitPanelFaces(geometry) {
  const pos = geometry.attributes.position
  const idx = geometry.index
  const n = idx ? idx.count / 3 : pos.count / 3
  const src = idx
    ? Array.from(idx.array)
    : Array.from({ length: pos.count }, (_, i) => i)

  const face = []
  const back = []
  // The area of what is NOT the face that points at the slab, accumulated here
  // because this loop already has every triangle's normal.
  let topArea = 0
  for (let t = 0; t < n; t++) {
    const [i0, i1, i2] = [src[t * 3], src[t * 3 + 1], src[t * 3 + 2]]
    const ax = pos.getX(i0); const ay = pos.getY(i0); const az = pos.getZ(i0)
    const ux = pos.getX(i1) - ax; const uy = pos.getY(i1) - ay; const uz = pos.getZ(i1) - az
    const vx = pos.getX(i2) - ax; const vy = pos.getY(i2) - ay; const vz = pos.getZ(i2) - az
    const ny = uz * vx - ux * vz
    const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
    const down = len > 1e-12 && ny / len < -FACING
    if (!down && len > 1e-12 && ny / len > FACING) topArea += len / 2
    ;(down ? face : back).push(i0, i1, i2)
  }

  geometry.setIndex(face.concat(back))
  geometry.clearGroups()

  // Does the leftover actually include a TOP? That is the question, not "is
  // there anything left over" — Univic Strip's panel has 0.14 m2 of edges and
  // no top at all, so treating it as a board left a hole you could see the void
  // through from above.
  const noTop = topArea < 1e-6

  geometry.addGroup(0, face.length, 0)
  if (back.length) geometry.addGroup(face.length, back.length, 1)
  // No top of its own: the board goes on the REVERSE of the very triangles the
  // finish is on, so the panel reads as board from above and finish from below.
  if (noTop && face.length) geometry.addGroup(0, face.length, 2)

  return { faceTris: face.length / 3, backTris: back.length / 3, noTop }
}

/** The plan size of one tile, in the model's own units. */
export function tileSize(faces) {
  if (!faces.length) return null
  const b = new THREE.Box3().setFromObject(faces[0])
  const s = b.getSize(new THREE.Vector3())
  return { x: +s.x.toFixed(3), z: +s.z.toFixed(3) }
}

/**
 * The MODULE: rail centre to rail centre, in the model's own units.
 *
 * This, and not the tile and not the bounding box, is what a block occupies on
 * a ceiling. Two blocks laid side by side at the module share one tee, exactly
 * as a real grid does — the rail on the seam is one rail belonging to both. Lay
 * them out at the BOUNDING BOX instead and every seam gains a spare flange.
 *
 * Measured, because the supplied Grid_* files do not have the module their
 * names imply: `Grid_600x600mm _15mm` is a 600 mm PANEL with the rails outside
 * it, so its module is 616 mm rather than 600.
 *
 * Null when the rails are not separate meshes — the Univic Strip file carries
 * its whole frame as one object — so callers fall back to the tile size.
 */
export function tileModule(gridMeshes) {
  if (!gridMeshes?.length) return null
  const V = () => new THREE.Vector3()
  const centres = { x: [], z: [] }
  for (const m of gridMeshes) {
    const b = new THREE.Box3().setFromObject(m)
    const s = b.getSize(V())
    const c = b.getCenter(V())
    // A rail running the long way down Z is narrow in X, and it is its X
    // position that spaces the grid in X.
    if (s.z > s.x) centres.x.push(c.x)
    else if (s.x > s.z) centres.z.push(c.z)
  }
  // Median gap, not mean: a block with a perimeter rail at each end and cross
  // tees between has one gap per bay, and a mean would be dragged by an odd one.
  const step = (cs) => {
    const sorted = [...cs].sort((a, b) => a - b)
    const gaps = []
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1e-6) gaps.push(sorted[i] - sorted[i - 1])
    }
    if (!gaps.length) return null
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }
  const x = step(centres.x)
  const z = step(centres.z)
  return x && z ? { x: +x.toFixed(3), z: +z.toFixed(3) } : null
}

/**
 * The exposed face width of a rail — the "15 mm" or "24 mm" a grid is sold as.
 *
 * A tee is widest at its flange, which is the face the room sees, so the narrow
 * plan dimension of the rail's box IS the flange. Median across the four rails,
 * for the same reason as above.
 */
export function railFlange(gridMeshes) {
  if (!gridMeshes?.length) return null
  const widths = []
  for (const m of gridMeshes) {
    const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
    const narrow = Math.min(s.x, s.z)
    if (narrow > 1e-6) widths.push(narrow)
  }
  if (!widths.length) return null
  widths.sort((a, b) => a - b)
  return +widths[Math.floor(widths.length / 2)].toFixed(3)
}

// ---------------------------------------------------------------------------
// the finish
// ---------------------------------------------------------------------------

/**
 * Decode an image down to TILE_PX wide, so a 52 megapixel panel never reaches
 * the GPU.
 *
 * WIDTH only, so the height follows the source aspect. Passing both would make
 * every panel square, and a 1200 x 600 one is 2:1 — its grain would come out at
 * half width and its holes as ovals.
 */
async function decode(url) {
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const blob = await res.blob()
  return createImageBitmap(blob, { resizeWidth: TILE_PX, resizeQuality: 'high' })
}

/**
 * Combine a wood base and a perforation into the one texture a tile wears.
 *
 * MULTIPLY, because the perforation is a white sheet with dark holes and no
 * alpha to it: white is 1 and leaves the wood as it is, a hole is dark and
 * darkens what is under it. Painting the holes on rather than cutting them
 * through is what was asked for, and it is also the only thing a JPEG can do.
 *
 * The canvas keeps the PANEL's aspect, not a square: a 1200 x 600 panel is a
 * 2:1 image, and forcing it into a square canvas would squash the grain to half
 * width before it ever reached a tile. How many times it then repeats across a
 * tile is worked out by tileRepeat from the module.
 *
 * It is a texture in its own right and is disposed by its owner.
 */
export async function tileTexture(sizeKey, woodCode, perforationCode, { tileMm } = {}) {
  const wood = woodOf(sizeKey, woodCode)
  if (!wood) return null
  const perf = perforationOf(sizeKey, perforationCode)

  const base = `${BASE}${TILE_TEX}`
  const woodBmp = await decode(base + wood.file)
  const w = woodBmp.width
  const h = woodBmp.height
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(woodBmp, 0, 0, w, h)
  woodBmp.close()

  if (perf) {
    // Drawn to the WOOD's rectangle. The two are the same panel photographed
    // twice, so they agree in shape; if a perforation is ever filed at a
    // different aspect the manifest says so rather than this silently stretching
    // it without a word.
    const perfBmp = await decode(base + perf.file)
    // The SHEET is cropped to the panel it contains, so the crop marks and the
    // caption never reach a tile and the perforated field registers with the
    // edge-to-edge wood underneath it. See PERF_BLEED.
    const bx = Math.round(perfBmp.width * PERF_BLEED)
    const by = Math.round(perfBmp.height * PERF_BLEED)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(
      perfBmp,
      bx, by, perfBmp.width - bx * 2, perfBmp.height - by * 2,
      0, 0, w, h,
    )
    ctx.globalCompositeOperation = 'source-over'
    perfBmp.close()
  }

  const [rx, rz] = tileRepeat(sizeKey, tileMm)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(rx, rz)
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * A fabric face for one tile, cropped out of the panel at TRUE SCALE.
 *
 * Designer Textile is the same 1200 x 2800 mm photographed sheet the baffles
 * are cut from, and a tile takes a patch of it: a 595 square tile shows 595 mm
 * of real cloth, so the weave is at life size and a tile beside a fin is the
 * same fabric at the same size.
 *
 * That is a crop, not a fit — repeat below 1 with an offset, which is exactly
 * what RepeatWrapping does. Nothing is squashed, because nothing is being made
 * to fill anything.
 *
 * The crop is CENTRED and the same for every tile, which is what was asked for:
 * one patch, repeated. A large field will therefore show the repeat, and the
 * alternative — successive tiles taking successive patches — is a different
 * offset here and nothing else.
 *
 * There is no perforation. A fabric-faced tile is fabric edge to edge; the PF
 * codes belong to Wood Classic, and tileMissingFields does not ask for one.
 */
export async function tileTextileTexture(code, { tileMm } = {}) {
  const sheet = await loadTextileSheet(code)
  if (!sheet) return null
  const t = tileMm ?? { x: 595, z: 595 }
  // The sheet arrives turned a quarter: its canvas X is the panel's 2800 mm
  // side and its Y the 1200 mm side. A tile's long axis goes on the long side.
  const sheetX = TEXTILE_SHEET.h * 1000
  const sheetY = TEXTILE_SHEET.w * 1000
  const rx = Math.min(1, t.x / sheetX)
  const ry = Math.min(1, t.z / sheetY)
  // Cloned so this tile can hold its own crop; a clone shares its Source, so
  // every tile in the range wearing one fabric is still one upload.
  const tex = sheet.tex.clone()
  tex.repeat.set(rx, ry)
  tex.offset.set((1 - rx) / 2, (1 - ry) / 2)
  tex.needsUpdate = true
  return tex
}

// ---------------------------------------------------------------------------
// the product
// ---------------------------------------------------------------------------

/**
 * The grid widths the range is offered in — the flange, the face the room sees.
 *
 * A live array rather than a list, filled from whatever Grid_* files are on
 * disk. Two today; a 38 mm set would be four more files and no code.
 */
export const TILE_GRIDS = []

/** Filled by applyTileModels(). A live array, like CLOUD_MODELS. */
export const TILE_MODELS = []

/**
 * What every tile file MEASURES, keyed by its path — including the ones that
 * are not offered by (size, grid).
 *
 * A range that names one file still wants its module read off the model rather
 * than declared here. That is the same bargain everything else in this file
 * makes, and it is what stops a "600 module" that is really 616 from going
 * unnoticed.
 */
export const TILE_MEASURED = new Map()

export const measuredTile = (file) => TILE_MEASURED.get(file) ?? null

/** Grid widths available, narrowest first. */
export const tileGridsFor = (sizeKey) =>
  [...new Set(TILE_MODELS.filter((m) => !sizeKey || m.sizeKey === sizeKey).map((m) => m.gridMm))]
    .sort((a, b) => a - b)

/** Size keys the MODELS publish — which is not the same as what the textures do. */
export const tileModelSizes = () =>
  [...new Set(TILE_MODELS.map((m) => m.sizeKey))]

/**
 * A model whose module is much longer in Z than in X is turned a quarter on
 * load, so every tile block lies long-side-along-X.
 *
 * The supplied 600x1200 files run their long axis down Z; the size is labelled
 * "1200 × 600" and its textures are 2:1 LANDSCAPE, 14291 x 7205, with u on the
 * long edge. Left as they came, the wood grain would land across the tile
 * instead of along it and be stretched 2:1 doing it.
 *
 * The ratio has to be loose: the "square" 600x600 file measures 617 x 619, so a
 * bare `z > x` would turn it too.
 */
export const LONG_AXIS_RATIO = 1.1
export const needsQuarterTurn = (mod) => !!mod && mod.z > mod.x * LONG_AXIS_RATIO

/** Adopt the tile models a manifest describes. */
export function applyTileModels(list) {
  TILE_MODELS.length = 0
  TILE_MEASURED.clear()
  for (const t of Array.isArray(list) ? list : []) {
    if (!t?.file || !t.tile) continue
    TILE_MEASURED.set(t.file, {
      tileMm: { x: t.tile.x * 1000, z: t.tile.z * 1000 },
      moduleMm: t.module ? { x: t.module.x * 1000, z: t.module.z * 1000 } : null,
      flangeMm: t.flangeMm ?? null,
      tilesInFile: t.parts?.faces?.n ?? 1,
    })
    if (!t.grid) continue
    const turn = needsQuarterTurn(t.module)
    const swap = (v) => (turn && v ? { x: v.z, z: v.x } : v ? { ...v } : null)
    // The KEY comes from the filename, long edge first, because it has to match
    // the texture folders on disk — which are 600x600 and 1200x600. The
    // GEOMETRY comes from the measurement. The two disagree by the flange and
    // that is the point: see the note on tileModule.
    const [a, b] = t.grid.sizeKey.split('x').map(Number)
    TILE_MODELS.push({
      id: t.id,
      file: t.file,
      sizeKey: `${Math.max(a, b)}x${Math.min(a, b)}`,
      gridMm: t.grid.gridMm,
      quarterTurn: turn,
      tileMm: swap({ x: t.tile.x * 1000, z: t.tile.z * 1000 }),
      moduleMm: swap(t.module && { x: t.module.x * 1000, z: t.module.z * 1000 }),
      flangeMm: t.flangeMm ?? null,
      // How many tiles the FILE holds. One means the app repeats it to make a
      // field; more means the file is already the block and is left alone.
      tilesInFile: t.parts?.faces?.n ?? 1,
      corrected: !!t.corrected,
      cols: 1,
      rows: 1,
    })
  }
  // A model re-cut onto a true module supersedes the file it came from. Both
  // are in the manifest — the supplied one is still what was delivered — but
  // only one can be offered for a given size and tee, and it is the one that
  // tiles. Delete public/models/ceiling_tiles/corrected and the originals come
  // straight back.
  const superseded = new Set()
  for (const m of TILE_MODELS) {
    if (m.corrected) superseded.add(`${m.sizeKey}|${m.gridMm}`)
  }
  const kept = TILE_MODELS.filter(
    (m) => m.corrected || !superseded.has(`${m.sizeKey}|${m.gridMm}`)
  )
  TILE_MODELS.length = 0
  for (const m of kept) TILE_MODELS.push(m)

  TILE_GRIDS.length = 0
  for (const g of tileGridsFor(null)) TILE_GRIDS.push(g)
  return TILE_MODELS.length
}

/** The model for a spec, or null when that combination is not on disk. */
export function tileModelFor(p) {
  const spec = tileTypeOf(p?.ttype)
  if (spec.model) {
    // Measured off the file where the manifest has read it; the declaration in
    // TILE_TYPES is only the fallback for before it has loaded.
    const m = measuredTile(spec.model)
    return {
      id: spec.id, file: spec.model, quarterTurn: false,
      cols: spec.cols, rows: spec.rows,
      tilesInFile: m?.tilesInFile ?? spec.cols * spec.rows,
      tileMm: { ...(m?.tileMm ?? spec.tileMm) },
      moduleMm: m?.moduleMm ? { ...m.moduleMm } : null,
      flangeMm: m?.flangeMm ?? null,
    }
  }
  const size = p?.size ?? DEFAULT_TILE_SIZE
  const grid = p?.grid ?? DEFAULT_TILE_GRID
  return TILE_MODELS.find((m) => m.sizeKey === size && m.gridMm === grid) ?? null
}

/**
 * Tile types. One for now, and the shape of the object is the point: a second
 * range drops in beside Wood Classic without any of the callers changing.
 */
export const TILE_TYPES = {
  'wood-classic': {
    id: 'wood-classic',
    label: 'Wood Classic',
    hint: 'one lay-in tile and its grid',
    range: 'woodClassic',
    // No single model: the range is four supplied files, one per size and grid
    // width, resolved by tileModelFor. The GENERATED Tile 600x600.glb it used
    // to name is still in the folder and still measures its own spec exactly —
    // which is what checked tileModule and railFlange when they were written.
    cols: 1,
    rows: 1,
    tileMm: { x: 595, z: 595 },
  },
  'designer-textile': {
    id: 'designer-textile',
    label: 'Designer Textile',
    hint: 'fabric-faced lay-in tile',
    // NOT OFFERED. The range works — the crop, the schedule line, the sheet
    // retention and its guards are all still here and still tested — it is just
    // not in the Type list. One word to bring it back, which is the whole point
    // of hiding it rather than deleting it.
    //
    // Kept reachable by reconcileTile on purpose: a layout saved while it WAS
    // offered still loads and still renders, rather than coming back as a
    // range this build has never heard of.
    hidden: true,
    // The same four Grid_* lay-in files Wood Classic uses, resolved by size and
    // grid — the tile and its tee are the same product, only the face differs.
    // What this entry really declares is the RANGE, which is what decides
    // whether the panel is a veneer or a fabric.
    range: 'designerTextile',
    cols: 1,
    rows: 1,
    tileMm: { x: 595, z: 595 },
  },
  temp: {
    id: 'temp',
    label: 'Temp 600 × 600',
    hint: 'generated · a TRUE 600 module',
    range: 'woodClassic',
    // The model built by scripts/build-tile-model.mjs, where its dimensions
    // live. It is here as a reference: unlike the supplied Grid_* files it sits
    // on a real 600 mm module — 595 of tile inside a 24 mm tee — so a field of
    // it lays out on round numbers and every seam is one shared tee.
    model: 'ceiling_tiles/Tile 600x600.glb',
    cols: 1,
    rows: 1,
    tileMm: { x: 595, z: 595 },
    // 600 x 600 only: the model is square, and the 1200 x 600 textures are 2:1
    // landscape, so offering that size would stretch a wide panel over a square
    // tile. A type that lists no sizes is offered all of them.
    sizes: ['600x600'],
  },
  univicstrip: {
    id: 'univicstrip',
    label: 'Univic Strip',
    hint: '12 tiles, strip ceiling',
    range: 'woodClassic',
    model: 'ceiling_tiles/Ceiling Grid Univic Strip.fbx',
    // 12 tiles, 4 across by 3 down, each 1265 x 1289 mm — a module that matches
    // no panel size the range is sold in. See the note at the top of this file.
    cols: 4,
    rows: 3,
    tileMm: { x: 1265, z: 1289 },
  },
}

/** The type a tile spec opens on, and the one every fallback uses. */
export const DEFAULT_TILE_TYPE = 'wood-classic'

export const tileTypeOf = (key) => TILE_TYPES[key] ?? TILE_TYPES[DEFAULT_TILE_TYPE]

/**
 * The ranges the picker offers, which is not every range that EXISTS.
 *
 * A hidden one still loads, still reconciles and still renders — it is only
 * absent from the list of things you can choose.
 */
export const tileTypesOffered = () => Object.values(TILE_TYPES).filter((t) => !t.hidden)

/**
 * The sizes a type is actually made in, of those the folders publish.
 *
 * A type may narrow the list — Temp is one square model — and one that says
 * nothing gets all of them, so adding a range needs no entry here.
 */
export function sizesForType(ttype) {
  const only = TILE_TYPES[ttype]?.sizes
  const published = tileSizeKeys()
  return only ? published.filter((k) => only.includes(k)) : published
}

/**
 * What the supplied model IS: four tiles by three, rails and all.
 *
 * Kept as a number rather than assumed, because it is read in two places that
 * must agree — the footprint the block takes on the grid, and the check that
 * the file still contains what it did when this was written.
 */
export const TILE_BLOCK = TILE_TYPES[DEFAULT_TILE_TYPE]

/**
 * What one tile is actually wearing: the block's finish, with its own edits on
 * top.
 *
 * An override holds only what DIFFERS, so a tile given its own colour keeps the
 * block's perforation and follows it when the block's changes. That is the same
 * bargain finFinish makes for a fin, and it is what makes "reset this tile" a
 * matter of deleting a key rather than restating the block.
 */
export function tileFinishOf(params, index) {
  const ov = params?.tileOverrides?.[index] ?? {}
  return {
    wood: ov.wood ?? params?.wood ?? null,
    perforation: ov.perforation ?? params?.perforation ?? null,
    textile: ov.textile ?? params?.textile ?? null,
    edited: Object.keys(ov).length > 0,
  }
}

/** How many tiles carry an edit of their own. */
export const tileEditCount = (params) => Object.keys(params?.tileOverrides ?? {}).length

/** The block's size in metres, from the tile size the manifest measured. */
export function tileBlockExtent(p) {
  // Falls back to the type's own block, and to the default type's, so a spec
  // that has not been reconciled yet still measures as something real rather
  // than as one range's numbers wearing another range's name.
  const spec = tileTypeOf(p?.ttype)
  // The MODULE when the model has one, because that is the distance at which
  // two blocks tile: laid at the module they share the rail on the seam, which
  // is what a real grid does. Falls back to the tile for the Univic Strip file,
  // whose frame is one mesh and so has no measurable rail spacing.
  const t = p?.moduleMm ?? p?.tileMm ?? spec.tileMm
  return {
    length: (t.x * (p?.cols ?? spec.cols)) / 1000,
    width: (t.z * (p?.rows ?? spec.rows)) / 1000,
  }
}

/** Cell footprint of a tile block at a given grid pitch. */
export function tileCells(p, pitch) {
  const e = tileBlockExtent(p)
  return {
    ci: Math.max(1, Math.ceil(e.length / pitch - 1e-6)),
    cj: Math.max(1, Math.ceil(e.width / pitch - 1e-6)),
  }
}

/**
 * A tile block opens with nothing decided but the type — the same bargain the
 * baffle brush makes. Placing a tile means placing the one that was specified.
 */
export function emptyTileParams() {
  return {
    ttype: null,
    // Asked BEFORE the finishes, because it decides which folder they are read
    // from. It never invalidates one already chosen — the two sizes publish the
    // same codes — but a colour picked from a list the size did not choose would
    // be a colour nobody was actually offered.
    size: null,
    // Which grid the tile sits in — the 15 mm or 24 mm tee, the face the room
    // sees. Asked because it is a different MODEL, not a different finish: the
    // supplied set is four files, one per size and width.
    grid: null,
    // The board, in millimetres. Specification only — see TILE_THICKNESSES.
    thickness: null,
    wood: null,
    perforation: null,
    // The fabric a Designer Textile tile wears — a panel key like FB1_Blue_2,
    // the same code a baffle fin uses. Its own field rather than a second
    // meaning for `wood`: a veneer code and a fabric key are different things
    // read from different maps, and one name for both is how a field ends up
    // validated against the wrong list.
    textile: null,
    // How far the block hangs below the slab. Not one of the four decisions a
    // tile spec is made of — it has a sensible default and is not asked for
    // before Place lights up, the same bargain the baffle drop makes.
    drop: TILE_DROP.default,
    // Per-tile edits, keyed by tile index — the tile counterpart of a baffle
    // set's finOverrides. An entry holds only what DIFFERS from the block, so a
    // tile given its own colour still follows the block's perforation.
    tileOverrides: {},
    // Filled in by reconcileTile from whichever type is chosen; a blank brush
    // has no type yet, so it has no block either.
    cols: null,
    rows: null,
    tileMm: null,
    moduleMm: null,
    // Which way the block lies is not one of the three decisions a tile spec
    // is made of, so it opens at 0 rather than being asked for. Rotating a
    // placed block is still a thing you can do to it.
    rot: 0,
  }
}

const TILE_REQUIRED = [
  ['ttype', 'Type'],
  ['size', 'Size'],
  ['grid', 'Grid'],
  // After the two that decide the MODEL and before the ones that decide the
  // face, because that is the order the panel asks them in: what the tile is,
  // then what it looks like.
  ['thickness', 'Thickness'],
  ['textile', 'Fabric'],
  ['wood', 'Base colour'],
  ['perforation', 'Perforation'],
]

/**
 * What a tile must answer, in panel order, for THIS spec. See lib/gate.js —
 * the panel's unlocking and the "still to choose" line read the same list.
 */
export function tileRequired(p) {
  // Grid is asked only of a range that HAS a choice of grids. Univic Strip is
  // one file with its frame already in it, so asking would be asking a question
  // with no answers — and requiring it unconditionally made that range
  // unplaceable, which is how this was found.
  const spec = tileTypeOf(p?.ttype)
  const asksGrid = !spec.model
  // And a range asks for the facing IT is made of. Designer Textile is a fabric
  // and carries no perforation — the PF codes are Wood Classic's — so asking
  // for either would be the Univic Strip fault again in a different range.
  const fabric = spec.range === 'designerTextile'
  return TILE_REQUIRED
    .filter(([k]) => k !== 'grid' || asksGrid)
    .filter(([k]) => (k === 'textile' ? fabric : true))
    .filter(([k]) => (k === 'wood' || k === 'perforation' ? !fabric : true))
}

export function tileMissingFields(p) {
  return tileRequired(p).filter(([k]) => p?.[k] == null).map(([, label]) => label)
}

/** Is this spec's range faced in fabric rather than veneer? */
export const tileIsFabric = (p) => tileTypeOf(p?.ttype).range === 'designerTextile'

export const tileReadyToPlace = (p) => tileMissingFields(p).length === 0

/** Normalise a tile spec — the tile counterpart of reconcile(). */
export function reconcileTile(p = {}) {
  const known = (list, v) => (list.some((x) => x.code === v) ? v : null)
  const ttype = TILE_TYPES[p.ttype] ? p.ttype : null
  const spec = tileTypeOf(ttype)
  // A size the folders do not publish is dropped, the same as an unknown code.
  // A size the folders do not publish is dropped, and so is one the chosen TYPE
  // is not made in — Temp is a square model, and a 2:1 panel on it would be a
  // wide photograph stretched over a square tile.
  const offered = ttype ? sizesForType(ttype) : tileSizeKeys()
  const size = TILE_SIZES[p.size] && (!TILE_FINISHES.ready || offered.includes(p.size))
    ? p.size
    : null
  // A grid width the models do not publish is dropped, the same as a size. The
  // Univic Strip range is one file and has no choice to make, so it takes the
  // width its own frame measures rather than being asked.
  const grids = TILE_MODELS.length ? tileGridsFor(size) : []
  const grid = spec.model
    ? null
    : (grids.length ? (grids.includes(p.grid) ? p.grid : null) : p.grid ?? null)
  const model = tileModelFor({ ttype, size, grid })
  // Whether this spec draws a FIELD of repeated tiles, or a file that is
  // already a block. Measured off the file, not assumed from the range.
  const field = !!model && (model.tilesInFile ?? 1) === 1
  // An override naming a code the chosen size does not publish is dropped, the
  // same as the block's own. Rebuilt as an object of only real entries, so
  // "how many tiles are edited" counts edits and never ghosts.
  const overrides = {}
  for (const [k, ov] of Object.entries(p.tileOverrides ?? {})) {
    const i = Number(k)
    if (!Number.isInteger(i) || i < 0) continue
    const live = !TILE_FINISHES.ready || !size
    const keep = {}
    if (ov?.wood != null && (live || woodOf(size, ov.wood))) keep.wood = ov.wood
    if (ov?.perforation != null && (live || perforationOf(size, ov.perforation))) {
      keep.perforation = ov.perforation
    }
    // The fabric map is fetched from the CDN, so "not ready" and "not a real
    // key" are different states and only the second is a reason to drop one.
    if (ov?.textile != null && (!textileReady() || panelFor(ov.textile))) {
      keep.textile = ov.textile
    }
    if (Object.keys(keep).length) overrides[i] = keep
  }

  return {
    ...p,
    ttype,
    size,
    tileOverrides: overrides,
    // A code that is no longer in the folder is dropped rather than kept as a
    // name nothing can be loaded from — the finish map is read off disk, so a
    // saved layout can outlive the file it named. Checked against the CHOSEN
    // size's folder: the two publish the same codes today, and this is what
    // notices on the day one of them does not.
    wood: TILE_FINISHES.ready && size ? known(woodsFor(size), p.wood) : p.wood ?? null,
    perforation: TILE_FINISHES.ready && size
      ? known(perforationsFor(size), p.perforation)
      : p.perforation ?? null,
    // Checked against the panel map rather than a size's folder: a fabric is
    // one 1200 x 2800 sheet and a tile takes a crop of it, so the same key is
    // valid at every tile size. Kept as written while the map is still coming,
    // for the same reason the veneer is.
    textile: textileReady() ? (panelFor(p.textile) ? p.textile : null) : p.textile ?? null,
    // A thickness the range is not made in is dropped, the same as a size. It
    // survives a change of size, range or grid untouched: a 25 mm board is a
    // 25 mm board whichever tile is cut from it, and none of those choices
    // narrows the list.
    thickness: TILE_THICKNESSES.includes(p.thickness) ? p.thickness : null,
    // The block comes FROM the type: the two ranges are 3 x 6 and 4 x 3 on
    // different tiles, so carrying one range's block onto the other would put a
    // Wood Classic ceiling on a Univic Strip footprint.
    grid,
    // Measured off the resolved MODEL when there is one, so a block carries the
    // numbers of the file it will actually draw. Falls back to the range's own
    // while the manifest is still loading.
    //
    // A file holding ONE tile is repeated into a field and the count is the
    // user's; a file that already holds a block keeps its own, because
    // repeating it would be repeating a ceiling.
    cols: field ? clampField(p.cols) : model?.cols ?? spec.cols,
    rows: field ? clampField(p.rows) : model?.rows ?? spec.rows,
    tileMm: { ...(model?.tileMm ?? spec.tileMm) },
    moduleMm: model?.moduleMm ? { ...model.moduleMm } : null,
    // Clamped rather than rejected: a file from before this existed has no drop
    // at all and should open at the default, not at zero.
    drop: Math.min(TILE_DROP.max, Math.max(TILE_DROP.min,
      Number.isFinite(p.drop) ? p.drop : TILE_DROP.default)),
    rot: p.rot ?? 0,
  }
}

// ---------------------------------------------------------------------------
// the model
// ---------------------------------------------------------------------------

const modelUrl = (file) => `${BASE}models/${file.split('/').map(encodeURIComponent).join('/')}`

// Per TYPE, because each range is its own file now and both can be on the
// ceiling at once. Keyed by type rather than by filename so a caller never has
// to know which file a range lives in.
const models = new Map()    // model id -> loaded model
const promises = new Map()  // model id -> in-flight promise
const modelListeners = new Set()

export function subscribeTileModel(fn) {
  modelListeners.add(fn)
  return () => modelListeners.delete(fn)
}

/**
 * The id a spec resolves to.
 *
 * Keyed on the MODEL, not on the range: Wood Classic is four files now, one per
 * size and grid width, and keying on the range would hand a 600 x 600 block to
 * a spec that asked for 1200 x 600 and cache it there.
 */
export const tileModelId = (p) => tileModelFor(p)?.id ?? null

export const tileModel = (p) => models.get(typeof p === 'string' ? p : tileModelId(p)) ?? null

/**
 * A planar UV set for a flat tile, generated from its own bounding box.
 *
 * The Wood Classic export ships no texture coordinates at all, and without them
 * a mapped material samples one texel and the tile renders in a single flat
 * colour — the same fault the tapered baffle had. A flat rectangle has exactly
 * one sensible mapping, so there is nothing to guess: u runs along x and v along
 * z, matching what the Univic Strip file already does (measured: planar,
 * R2 = 1.0000, u on x and v on z). The file on disk is untouched.
 *
 * Returns false when the geometry already carries UVs, so a file that was
 * exported properly is left exactly as it came.
 */
export function planarTileUV(geometry, force = false) {
  if (geometry.attributes.uv && !force) return false
  geometry.computeBoundingBox()
  const b = geometry.boundingBox
  const sx = Math.max(1e-9, b.max.x - b.min.x)
  const sz = Math.max(1e-9, b.max.z - b.min.z)
  const p = geometry.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - b.min.x) / sx
    uv[i * 2 + 1] = (p.getZ(i) - b.min.z) / sz
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return true
}

/**
 * Load the tile block, keeping only what the room should see.
 *
 * The file is a room's worth of ceiling. Three quarters of it is dropped here
 * and the reasons differ:
 *
 *   context — one mesh, 225,920 triangles, carrying the whole surrounding
 *             ceiling. The app draws its own room; this one would sit in the
 *             same place and fight it for depth. Dropped.
 *   bodies  — the 35 mm backs behind each tile face. Kept: they are what the
 *             tile's edge reads as where the rail does not cover it.
 *   grid    — the rails. Kept, as asked.
 *
 * Normalised the way loadWhole normalises a baffle — centred in X/Z, top face
 * at y = 0, metres — so a tile block hangs off the ceiling plane on the same
 * terms as everything else and the placement maths does not need a special case.
 *
 * The faces are drawn DOUBLE-SIDED, and have to be. Measured on the delivered
 * file: of a tile panel's 180 triangles, 0 m² faces down and 1.35 m² faces up —
 * every surface in it points at the slab. A material is front-side only unless
 * told otherwise, so the whole block was culled away when seen from underneath
 * and drew only from above, which is the one angle a ceiling is never looked at
 * from. Flipping the winding instead would only move the problem to the other
 * side, and the block IS orbited from above in the plan views.
 */
// ---------------------------------------------------------------------------
// the suspension rod
// ---------------------------------------------------------------------------

/**
 * Grid Support: the rod a tile block hangs from, supplied as its own file.
 *
 * MEASURED, not assumed. 343.52 mm long on a 16.45 x 18.99 mm section, with a
 * 12 x 12 mm socket at one end and a flat fixing plate at the other, and
 * nothing at all between 48 and 333 mm — a plain prismatic shaft has vertices
 * only where it ends, which is the same thing splitAtHeight had to know about
 * the Univic Strip rods.
 *
 * It is modelled at (6250, 3710, -1060) mm and lying on Z, like every other
 * supplied file: at ceiling height and off to one side, in the orientation its
 * own scene used. So it is re-cut on load — never in the file — onto the one
 * contract a tile block already keeps: X/Z centred, BASE AT y = 0, rising +Y,
 * in metres. That is what lets TileSet scale it by drop / rodHeight without
 * knowing anything about it.
 */
export const GRID_SUPPORT_FILE = 'ceiling_tiles/Grid Support.fbx'

/**
 * Which end of the rod meets the slab.
 *
 * The socket end goes DOWN, to the grid, and the flat plate goes up against the
 * soffit — a plate that wide and that thin is a fixing plate, and a socket is
 * something another part plugs into. Named rather than buried in a sign so it
 * is one word to turn over if the product says otherwise.
 */
export const GRID_SUPPORT_PLATE_UP = true

let supportPromise = null
let support = null

/** The loaded rod, or null until it lands. One object, shared by every block. */
export const gridSupport = () => support

export function loadGridSupport() {
  if (supportPromise) return supportPromise
  supportPromise = (async () => {
    const res = await fetch(modelUrl(GRID_SUPPORT_FILE))
    if (!res.ok) throw new Error(`${res.status} loading the grid support`)
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    const root = new FBXLoader().parse(await res.arrayBuffer(), '')
    root.updateMatrixWorld(true)

    // One geometry, baked out of whatever transforms the file wrapped it in.
    const parts = []
    root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) parts.push(o) })
    if (!parts.length) throw new Error('the grid support has no mesh in it')
    const geo = parts[0].geometry.clone()
    geo.applyMatrix4(parts[0].matrixWorld)

    // Stand it up by MEASURING which way it lies rather than assuming: the
    // long axis becomes +Y, and the socket end becomes the bottom.
    geo.computeBoundingBox()
    const s = geo.boundingBox.getSize(new THREE.Vector3())
    const long = s.y >= s.x && s.y >= s.z ? 'y' : (s.z >= s.x ? 'z' : 'x')
    if (long === 'z') geo.rotateX(GRID_SUPPORT_PLATE_UP ? -Math.PI / 2 : Math.PI / 2)
    else if (long === 'x') geo.rotateZ(GRID_SUPPORT_PLATE_UP ? Math.PI / 2 : -Math.PI / 2)

    // X/Z centred, base at y = 0, metres — the contract the block keeps.
    geo.computeBoundingBox()
    const b = geo.boundingBox
    const c = b.getCenter(new THREE.Vector3())
    geo.translate(-c.x, -b.min.y, -c.z)
    geo.scale(0.001, 0.001, 0.001)
    geo.computeBoundingBox()
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      name: 'GridSupport',
      color: new THREE.Color(CLOUD_HARDWARE_FINISH.hex),
      roughness: CLOUD_HARDWARE_FINISH.roughness,
      metalness: CLOUD_HARDWARE_FINISH.metalness,
    }))
    mesh.name = 'GridSupport'
    mesh.raycast = () => {}

    const size = geo.boundingBox.getSize(new THREE.Vector3())
    support = { mesh, height: size.y, sectionMm: { x: size.x * 1000, z: size.z * 1000 } }
    modelListeners.forEach((l) => l())
    return support
  })()
  supportPromise.catch((e) => {
    console.warn('[tiles] grid support:', e.message)
    supportPromise = null
  })
  return supportPromise
}

export function loadTileModel(p = { ttype: DEFAULT_TILE_TYPE }) {
  const entry = tileModelFor(typeof p === 'string' ? { ttype: p } : p)
  if (!entry) return Promise.resolve(null)
  const key = entry.id
  if (promises.has(key)) return promises.get(key)
  const promise = (async () => {
    const file = entry.file
    const res = await fetch(modelUrl(file))
    if (!res.ok) throw new Error(`${res.status} loading the ${key} tile model`)
    const buf = await res.arrayBuffer()
    // Both readers, because a tile model can now be either: the supplied ranges
    // are FBX and the generated one is glTF.
    let root
    if (/\.fbx$/i.test(file)) {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      root = new FBXLoader().parse(buf, '')
    } else {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      root = (await new Promise((ok, no) => new GLTFLoader().parse(buf, '', ok, no))).scene
    }
    // A quarter turn BEFORE anything is measured, so every number below — the
    // tile, the module, the tile ordering — comes out in the orientation the
    // block will actually be drawn in. See needsQuarterTurn for why.
    if (entry.quarterTurn) root.rotation.y = Math.PI / 2
    root.updateMatrixWorld(true)

    const sorted = classifyTileMeshes(root)
    const tileMm = tileSize(sorted.faces)
    const moduleUnits = tileModule(sorted.grid)
    const flangeUnits = railFlange(sorted.grid)

    // READING ORDER, so "tile 3" is the same tile every session. The file lists
    // them as Object084 upward in no useful arrangement, and an index taken from
    // that order would move the moment anyone re-exported. Sorted by row then
    // column, with a tolerance of half a tile so a row that is a few millimetres
    // out of line — and this one is, its centres step 1259/1308 mm — still reads
    // as one row.
    const rowTol = (tileMm?.z ?? 1289) * 0.5
    const centreOf = (m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())
    const ordered = [...sorted.faces].sort((a, b) => {
      const ca = centreOf(a)
      const cb = centreOf(b)
      return Math.abs(ca.z - cb.z) > rowTol ? ca.z - cb.z : ca.x - cb.x
    })
    const group = new THREE.Group()
    group.name = 'CeilingTiles'
    const faces = []

    // The face material is OURS — one shared instance, so setting the finish
    // once repaints every tile. The rails and bodies keep the file's own.
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.72, metalness: 0, side: THREE.DoubleSide,
    })

    const gridTop = gridPlaneTop(sorted.grid)

    const keep = [
      ...ordered.map((m) => [m, true]),
      ...sorted.bodies.map((m) => [m, false]),
      ...sorted.grid.map((m) => [m, false]),
    ]
    // The rods live in the same mesh as the frame and are separated out here.
    // They are drawn on their own group and SCALED to the drop, because the file
    // hangs them 2,928 mm — the height the ceiling happened to be modelled at,
    // not the height the user asked for.
    const rods = new THREE.Group()
    rods.name = 'CeilingTileRods'
    let split = 0
    let uvRemapped = 0
    // What the panels turned out to be, reported rather than assumed.
    let inverted = 0
    let planes = 0
    let faceTris = 0
    let backTris = 0
    let panelKind = false

    for (const [o, isFace] of keep) {
      // splitAtHeight copies the ORIGINAL attribute values, so both halves are
      // still in the node's own space and get baked exactly like a whole one.
      const cut = isFace ? { below: null, above: null }
        : splitAtHeight(o.geometry, gridTop, o.matrixWorld)
      if (cut.above) {
        split++
        const rg = cut.above
        rg.applyMatrix4(o.matrixWorld)
        if (o.matrixWorld.determinant() < 0) flipWinding(rg)
        const rod = new THREE.Mesh(rg, o.material)
        rod.name = `${o.name}:rods`
        rod.raycast = () => {}
        rods.add(rod)
      }
      const g = cut.below ?? o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      if (o.matrixWorld.determinant() < 0) flipWinding(g)
      const mesh = new THREE.Mesh(g, isFace ? faceMat : o.material)
      mesh.name = o.name
      mesh.raycast = () => {}
      // Marked, because what gets rendered is a CLONE of this group — an
      // Object3D has one parent, so two placed blocks cannot share it — and a
      // clone has to be able to find its own faces to give them their own
      // material. Names would not do it: the faces are Object084 upward and the
      // rails are Object063 upward, from the same numbering.
      // A file with no UVs at all gets a planar set here; without them a mapped
      // material samples one texel and every tile renders in a single flat
      // colour. The Wood Classic export ships none.
      // The face gets a planar mapping ALWAYS, replacing whatever the file
      // shipped. A tile finish is a photograph OF THAT PANEL, so laying it on
      // the panel is planar by definition — and the supplied Grid_* files carry
      // a BOX UNWRAP, under which the room-facing face samples u 0..0.251,
      // v 0.511..1. That is a quarter-by-half corner of the panel photo
      // stretched over the whole tile, which is what put the perforation
      // off-centre. Nothing is lost by overwriting: the only other group is the
      // board, and it carries no map.
      if (isFace && planarTileUV(g, true)) uvRemapped++
      if (isFace) {
        // A panel with NO down-facing area is wound inside out — Univic Strip's
        // is 1.35 m2 up and nothing down. Flipped rather than rescued with a
        // DoubleSide material, which is what used to hide it: a double-sided
        // finish is also what painted the veneer over the top of every box.
        const facing = panelFacing(g)
        if (facing.down < facing.up * 0.01) { flipWinding(g); inverted++ }
        const cut = splitPanelFaces(g)
        faceTris += cut.faceTris
        backTris += cut.backTris
        if (cut.noTop) planes++
        // Which KIND of back this panel needs. A board has a genuine top and
        // four edges, and they face outward; a plane has neither, so its board
        // is the reverse of the face itself. Recorded per mesh rather than per
        // model, so a file holding both is still drawn correctly.
        panelKind = cut.noTop
      }
      mesh.userData.tileFace = isFace
      if (isFace) mesh.userData.tilePlane = panelKind
      // The index a per-tile override is keyed by. Put on the face itself, so a
      // click in the focus editor names a tile without anything having to work
      // out which one it hit from its position.
      if (isFace) mesh.userData.tileIndex = faces.length
      group.add(mesh)
      if (isFace) faces.push(mesh)
    }
    if (!group.children.length) throw new Error('the tile model has no tiles in it')

    // Centre X/Z, top at y = 0, into metres. The BLOCK sets the transform and
    // the rods take the same one, so the two stay registered with each other —
    // measuring the rods into it would put the block's top 2.9 m up again.
    const box = new THREE.Box3().setFromObject(group)
    const c = box.getCenter(new THREE.Vector3())
    const place = (m) => {
      m.geometry.translate(-c.x, -box.max.y, -c.z)
      m.geometry.scale(0.001, 0.001, 0.001)
      m.geometry.computeBoundingBox()
    }
    group.children.forEach(place)
    rods.children.forEach(place)
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())

    // Which edge of the tile each rail sits on.
    //
    // A field repeats this model at the module, so the rail on every seam gets
    // drawn TWICE — once by each neighbour, in exactly the same place. That is
    // double the cost and a z-fight along every joint. Tagged here so the field
    // can draw each grid line once: a copy keeps its far rails always and its
    // near ones only on the field's own edge.
    for (const m of group.children) {
      if (m.userData.tileFace) continue
      const b = new THREE.Box3().setFromObject(m)
      const c = b.getCenter(new THREE.Vector3())
      const s2 = b.getSize(new THREE.Vector3())
      if (s2.z > s2.x * 1.5) m.userData.railSide = c.x < 0 ? 'x-' : 'x+'
      else if (s2.x > s2.z * 1.5) m.userData.railSide = c.z < 0 ? 'z-' : 'z+'
      else m.userData.railSide = 'other'
    }

    // How tall the rods are as modelled, so the renderer can scale them to the
    // drop the user asked for. Measured from the top of the block — which is
    // y = 0 after the transform above — to the highest point they reach.
    const rodBox = new THREE.Box3().setFromObject(rods)
    const rodHeight = rods.children.length && Number.isFinite(rodBox.max.y)
      ? Math.max(1e-6, rodBox.max.y)
      : 0

    // How far the TILE FACE sits below the top of the assembly.
    //
    // A suspended ceiling is quoted slab-to-face, not slab-to-top-of-grid: the
    // number a client cares about is where the ceiling they can see ends up.
    // The grid rises above the tiles — 57 mm of it on this file, more than the
    // tiles' own 38 — so the two differ by enough to matter, and the renderer
    // subtracts this so a setting of 150 mm puts the face 150 mm down.
    //
    // It is also the SHALLOWEST the block can hang: at this value the top of the
    // grid is flush with the slab, and asking for less would push it inside.
    const faceBox = new THREE.Box3()
    for (const m of faces) faceBox.union(new THREE.Box3().setFromObject(m))
    const faceOffset = Number.isFinite(faceBox.max.y) ? -faceBox.max.y : 0

    const built = {
      type: key,
      id: key,
      quarterTurn: !!entry.quarterTurn,
      object: group, faces, faceMat, size, tileMm, count: faces.length, faceOffset,
      // Rail centre to rail centre, in MILLIMETRES, measured after the turn.
      // This is what the block occupies; tileMm is what it draws. On the
      // supplied files they differ by a flange — 600 of tile inside a 617
      // module — and using the wrong one either overlaps every block or leaves
      // a spare rail at every seam.
      moduleMm: moduleUnits ? { x: moduleUnits.x, z: moduleUnits.z } : null,
      flangeMm: flangeUnits,
      // The suspension rods, on their own group so they can be scaled to the
      // drop without the grid moving with them.
      rods, rodHeight, rodCount: rods.children.length,
      // How many meshes had rods separated out of them. Reported so "the rods
      // came through" is visible rather than assumed.
      split,
      // How many tile faces had a planar UV set generated because the file
      // shipped none. Reported rather than assumed: a mapped material with no
      // UVs renders one flat colour, which looks like a bad texture rather than
      // a missing one.
      // How many tile faces had their mapping replaced with a planar one.
      uvRemapped,
      // How many panels were wound inside out, how many are flat planes rather
      // than boards, and how the triangles divide between the face the room
      // sees and the board above it.
      inverted, planes, faceTris, backTris,
    }
    models.set(key, built)
    modelListeners.forEach((l) => l())
    return built
  })()
  promises.set(key, promise)
  promise.catch((e) => { console.warn(`[tiles] ${key}:`, e.message); promises.delete(key) })
  return promise
}

/**
 * Put a finish on the faces.
 *
 * One texture, built once per (wood, perforation) pair and cached — a block is
 * twelve tiles wearing the same panel, and twelve copies of a 1024² texture for
 * one finish would be 48 MB of nothing.
 */
const finishes = new Map() // "size|wood|perf" -> Promise<Texture>

export function tileFinish(sizeKey, woodCode, perforationCode, opts) {
  // The SIZE is part of the key: the same code names a square panel in one
  // folder and a 2:1 one in the other, and they are different textures with
  // different repeats.
  const key = `${sizeKey}|${woodCode}|${perforationCode ?? ''}`
  if (!finishes.has(key)) {
    finishes.set(key, tileTexture(sizeKey, woodCode, perforationCode, opts).catch((e) => {
      console.warn('[tiles] finish', key, e.message)
      finishes.delete(key)
      return null
    }))
  }
  return finishes.get(key)
}
