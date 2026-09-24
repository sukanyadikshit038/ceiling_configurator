// The room catalogue.
//
// Rooms come from two sources and are normalised into one shape here, so
// nothing downstream has to care which kind it is looking at:
//
//   'glb'         — a file in public/models/rooms/. Measured by
//                   scripts/build-manifest.mjs and read from manifest.json at
//                   runtime. Drop a file in the folder and it appears in the
//                   app; nothing about it is hardcoded (BRIEF §7).
//
//   'procedural'  — a furnished set built from primitives in lib/furniture.js.
//                   No asset to download, so it costs nothing to ship and works
//                   offline; its ceiling extents come from its own declared
//                   room size.
//
// Every room exposes the same `ceiling` plane, which is all lib/grid.js needs.

import { SCENARIOS } from './scenarios.js'
import { DEFAULT_PITCH } from './grid.js'

const BASE = import.meta.env?.BASE_URL ?? '/'
const asset = (f) => `${BASE}models/${f}`

/** Filled by loadRooms(). Exported live so importers keep a stable reference. */
export const ROOMS = []

export const getRoom = (id) => ROOMS.find((r) => r.id === id) ?? ROOMS[0] ?? null

const blurbOf = (c) =>
  `${(c.maxX - c.minX).toFixed(1)} × ${(c.maxZ - c.minZ).toFixed(1)} m · ${c.y.toFixed(1)} m clear`

/** Title-case an id like 'office-open' into 'Office Open'. */
const titleOf = (id) =>
  id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// ---------------------------------------------------------------------------
// procedural rooms
// ---------------------------------------------------------------------------

/**
 * A procedural scenario is authored as a width/length/height, centred on the
 * origin — which is exactly the convention the grid expects, so the ceiling
 * plane falls straight out of it.
 */
function proceduralRoom(key, sc) {
  const { w, l, h } = sc.room
  const ceiling = { y: h, minX: -w / 2, maxX: w / 2, minZ: -l / 2, maxZ: l / 2 }
  return {
    id: `sc:${key}`,
    name: sc.label ?? titleOf(key),
    kind: 'procedural',
    scenario: key,
    blurb: blurbOf(ceiling),
    ceiling,
    ceilingDetected: true,
    pitch: DEFAULT_PITCH,
  }
}

export const PROCEDURAL_ROOMS = Object.entries(SCENARIOS).map(([k, sc]) => proceduralRoom(k, sc))

// ---------------------------------------------------------------------------
// manifest rooms
// ---------------------------------------------------------------------------

function manifestRoom(r) {
  return {
    id: r.id,
    name: r.name ?? titleOf(r.id),
    kind: 'glb',
    model: asset(r.file),
    blurb: blurbOf(r.ceiling),
    ceiling: {
      y: r.ceiling.y,
      minX: r.ceiling.minX, maxX: r.ceiling.maxX,
      minZ: r.ceiling.minZ, maxZ: r.ceiling.maxZ,
    },
    ceilingDetected: r.ceiling.detected !== false,
    // The manifest measured this room in CORRECTED units, centred on the
    // origin. Both corrections have to be replayed on the mesh before anything
    // is compared against those numbers — see three/Room.jsx.
    unitScale: r.unitScale ?? 1,
    unitFix: r.unitFix ?? null,
    offset: r.offset ?? { x: 0, z: 0 },
    pitch: r.pitch ?? DEFAULT_PITCH,
    meshes: r.meshes,
    tris: r.tris,
    bytes: r.bytes ?? null,
  }
}

/**
 * Build the room list from a manifest object.
 *
 * Procedural rooms come first: they are instant, so the app has something to
 * show while a GLB is still downloading.
 */
export function applyRoomManifest(m) {
  ROOMS.length = 0
  ROOMS.push(...PROCEDURAL_ROOMS)
  for (const r of m?.rooms ?? []) ROOMS.push(manifestRoom(r))
  return ROOMS.length
}

/**
 * Fetch the manifest and build the room list.
 *
 * A missing or unreadable manifest is not fatal — the procedural rooms alone
 * are a working app, which is what keeps a first run from being a blank screen.
 */
export async function loadRooms() {
  ROOMS.length = 0
  ROOMS.push(...PROCEDURAL_ROOMS)
  try {
    const res = await fetch(`${BASE}models/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`manifest.json: ${res.status}`)
    const m = await res.json()
    for (const r of m.rooms ?? []) ROOMS.push(manifestRoom(r))
    return { rooms: ROOMS.length, manifest: m }
  } catch (e) {
    console.warn('[rooms] manifest unavailable, procedural rooms only:', e.message)
    return { rooms: ROOMS.length, manifest: null, error: e.message }
  }
}
