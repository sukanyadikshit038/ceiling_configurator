// One-click layouts.
//
// A preset is two separable things, and keeping them apart is what lets a
// preset work with an imported model as well as a catalogue product:
//
//   product()   the catalogue recipe it places when nothing else is chosen
//   arrange()   WHERE things go — a pure function of the grid and a footprint
//
// With an imported model on the brush the product half is skipped and the model
// is arranged instead. Without the split a preset can only ever place the one
// product it was written around, which is what made "VMT field" silently throw
// away a model the user had picked.
//
// Everything here is a pure function of the room's grid; the store puts the
// results through the same canPlace() rules as a hand-placed set, so no preset
// can produce an overlapping or off-grid layout.

import {
  MM, BAFFLE_TYPES, defaultBaffleParams, baffleCells, finPitch,
} from './catalog.js'
import { defaultCloudParams, cloudCells } from './clouds.js'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Millimetres to whole cells at whatever pitch the grid is on.
 *
 * Every gap and margin below is stated in MILLIMETRES rather than in cells,
 * because a cell is not a fixed distance — it was 300 mm and is now 100. A
 * preset that asked for a gap of two CELLS quietly became a 200 mm gap where
 * 600 mm was meant, packing every arrangement three times tighter than it was
 * designed to be.
 */
const cellsOfMm = (mm, g) => Math.max(0, Math.round((mm / 1000) / g.pitch))

/** The gap `field` leaves between items, so anything reading its rows agrees. */
const FIELD_GAP_MM = 600

/**
 * The longest catalogue length that fits across the grid, leaving a margin.
 * Presets ask for this rather than hardcoding 2780, which does not fit a
 * boardroom.
 */
function longestLength(type, g, marginMm) {
  const availM = (g.cols - 2 * cellsOfMm(marginMm, g)) * g.pitch
  const fits = BAFFLE_TYPES[type].lengths.filter((L) => L * MM <= availM)
  return fits.length ? Math.max(...fits) : Math.min(...BAFFLE_TYPES[type].lengths)
}

/** How many fins fit across the remaining depth, within the catalogue range. */
function fitCount(params, g, marginMm) {
  const availM = (g.rows - 2 * cellsOfMm(marginMm, g)) * g.pitch
  const n = Math.floor((availM - params.thickness * MM) / finPitch(params)) + 1
  return clamp(n, 2, 24)
}

// ---------------------------------------------------------------------------
// arrangements — each takes a footprint and returns cells
// ---------------------------------------------------------------------------

/**
 * Fill the ceiling with a grid of items at a given gap, centred.
 *
 * Centring matters: left-aligning leaves the whole remainder against one wall,
 * which reads as a mistake rather than a layout.
 */
function field(params, g, { gapMm = FIELD_GAP_MM, marginMm = 300,
  cells = baffleCells, stagger = false } = {}) {
  const gap = cellsOfMm(gapMm, g)
  const margin = cellsOfMm(marginMm, g)
  const { ci, cj } = cells(params, g.pitch)
  const usableI = g.cols - 2 * margin
  const usableJ = g.rows - 2 * margin
  if (ci > usableI || cj > usableJ) return []

  const stepI = ci + gap
  const stepJ = cj + gap
  const nI = Math.max(1, Math.floor((usableI + gap) / stepI))
  const nJ = Math.max(1, Math.floor((usableJ + gap) / stepJ))
  const i0 = margin + Math.floor((usableI - (nI * ci + (nI - 1) * gap)) / 2)
  const j0 = margin + Math.floor((usableJ - (nJ * cj + (nJ - 1) * gap)) / 2)

  const out = []
  for (let r = 0; r < nJ; r++) {
    // Alternate rows pushed half a step across. A staggered row reaches half a
    // step further, so the last item in it can fall outside the margin; it is
    // DROPPED rather than allowed to sit in the margin, because a preset that
    // breaks its own margin looks like a bug rather than a layout.
    const shift = stagger && r % 2 === 1 ? Math.round(stepI / 2) : 0
    for (let c = 0; c < nI; c++) {
      const i = i0 + c * stepI + shift
      if (i + ci > g.cols - margin) continue
      out.push([i, j0 + r * stepJ])
    }
  }
  return out
}

/**
 * A single centred row spanning the ceiling.
 *
 * A catalogue set grows its own fin count to span the depth, so one set is the
 * whole run. A model cannot grow — so the run becomes as many copies of it as
 * fit end to end, which is the same idea expressed the only way a fixed object
 * can express it.
 */
function row(params, g, { gapMm = 300, marginMm = 300, atJ = null,
  cells = baffleCells } = {}) {
  const gap = cellsOfMm(gapMm, g)
  const margin = cellsOfMm(marginMm, g)
  const { ci, cj } = cells(params, g.pitch)
  const usableI = g.cols - 2 * margin
  if (ci > usableI || cj > g.rows - 2 * margin) return []
  const step = ci + gap
  const n = Math.max(1, Math.floor((usableI + gap) / step))
  const i0 = margin + Math.floor((usableI - (n * ci + (n - 1) * gap)) / 2)
  const j = atJ ?? Math.floor((g.rows - cj) / 2)
  return Array.from({ length: n }, (_, k) => [i0 + k * step, j])
}

/** One centred item — used when a catalogue set is already room-sized. */
function centred(params, g, { cells = baffleCells } = {}) {
  const { ci, cj } = cells(params, g.pitch)
  if (ci > g.cols || cj > g.rows) return []
  return [[Math.floor((g.cols - ci) / 2), Math.floor((g.rows - cj) / 2)]]
}

/** A band tight to each edge, leaving the middle of the ceiling free. */
function perimeter(params, g, { gapMm = 300, marginMm = 300, cells = baffleCells } = {}) {
  const margin = cellsOfMm(marginMm, g)
  const { cj } = cells(params, g.pitch)
  if (cj * 2 + margin * 2 >= g.rows) return []
  return [
    ...row(params, g, { gapMm, marginMm, atJ: margin, cells }),
    ...row(params, g, { gapMm, marginMm, atJ: g.rows - margin - cj, cells }),
  ]
}

/**
 * All four edges, centre left clear.
 *
 * `perimeter` above lays two BANDS, top and bottom, which is what a run of
 * baffles can do — a baffle is already room-length, so the sides are covered by
 * the runs themselves. A cloud is a discrete object, so an edge treatment has
 * to walk all four sides or it is just two rows.
 *
 * Falls back to a plain field when the ceiling is too small to have an inside:
 * a ring of one row is a row, and pretending otherwise puts two clouds in the
 * same cell for the overlap check to throw away.
 */
function ring(params, g, { gapMm = 300, marginMm = 300, cells = baffleCells } = {}) {
  const gap = cellsOfMm(gapMm, g)
  const margin = cellsOfMm(marginMm, g)
  const { ci, cj } = cells(params, g.pitch)
  const usableI = g.cols - 2 * margin
  const usableJ = g.rows - 2 * margin
  if (ci > usableI || cj > usableJ) return []
  const stepI = ci + gap
  const stepJ = cj + gap
  const nI = Math.max(1, Math.floor((usableI + gap) / stepI))
  const nJ = Math.max(1, Math.floor((usableJ + gap) / stepJ))
  if (nI < 3 || nJ < 3) return field(params, g, { gapMm, marginMm, cells })
  const i0 = margin + Math.floor((usableI - (nI * ci + (nI - 1) * gap)) / 2)
  const j0 = margin + Math.floor((usableJ - (nJ * cj + (nJ - 1) * gap)) / 2)
  const out = []
  for (let c = 0; c < nI; c++) {
    out.push([i0 + c * stepI, j0])
    out.push([i0 + c * stepI, j0 + (nJ - 1) * stepJ])
  }
  for (let r = 1; r < nJ - 1; r++) {
    out.push([i0, j0 + r * stepJ])
    out.push([i0 + (nI - 1) * stepI, j0 + r * stepJ])
  }
  return out
}

/**
 * A quincunx over the middle: one in the centre and four on the diagonals.
 *
 * Five, and not a number that depends on the room. A cluster is a feature, and
 * a feature that grows with the ceiling is a field with extra steps.
 */
function cluster(params, g, { gapMm = 300, cells = baffleCells } = {}) {
  const gap = cellsOfMm(gapMm, g)
  const { ci, cj } = cells(params, g.pitch)
  const stepI = ci + gap
  const stepJ = cj + gap
  const cI = Math.floor((g.cols - ci) / 2)
  const cJ = Math.floor((g.rows - cj) / 2)
  return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([di, dj]) => [cI + di * stepI, cJ + dj * stepJ])
    .filter(([i, j]) => i >= 0 && j >= 0 && i + ci <= g.cols && j + cj <= g.rows)
}

// ---------------------------------------------------------------------------

/**
 * The gap a cloud layout leaves between panels.
 *
 * Smaller than the 600 mm a baffle field uses, and for a physical reason: a
 * baffle is a metres-long run and its neighbours read as separate objects
 * however close they are, where a cloud is a discrete panel and a wide gap
 * reads as things scattered rather than a ceiling.
 *
 * In MILLIMETRES, like every other distance here, because a cell is 100 mm
 * today and was 300 mm not long ago.
 */
const CLOUD_GAP_MM = 350

/**
 * Every preset names the PRODUCT it places.
 *
 * It used to be baffles or nothing — applyPreset built defaultBaffleParams()
 * and stamped `type: 'baffles'` on the result whatever was asked for, which is
 * why clouds could not have presets at all rather than merely not having any.
 */
export const PRESETS = [
  {
    key: 'vmt-field',
    type: 'baffles',
    label: 'VMT field',
    hint: 'Wood Classic runs across the ceiling',
    product(g) {
      const base = {
        ...defaultBaffleParams(),
        btype: 'vmt', thickness: 25, width: 150,
        length: longestLength('vmt', g, 300),
        family: 'wood-classic', colour: 'WD-NC-13',
        spacing: 200, drop: 0.4,
      }
      return { ...base, count: clamp(Math.round(fitCount(base, g, 300) / 3), 4, 12) }
    },
    arrange: (params, g) => field(params, g, { gapMm: 600, marginMm: 300 }),
  },
  {
    key: 'blade-field',
    type: 'baffles',
    label: 'Blade field',
    hint: 'Solid PET blades, alternating two colours',
    product(g) {
      const base = {
        ...defaultBaffleParams(),
        btype: 'blade', shape: 'standard', thickness: 25, width: 150,
        length: longestLength('blade', g, 300),
        family: 'pet-solid', colour: 'StarGaze',
        spacing: 150, drop: 0.35,
      }
      return { ...base, count: clamp(Math.round(fitCount(base, g, 300) / 3), 4, 12) }
    },
    arrange: (params, g) => field(params, g, { gapMm: 600, marginMm: 300 }),
    // Banding by row, so the alternation reads across the ceiling rather than
    // as noise. Catalogue only — a model keeps the materials it shipped with.
    vary(params, cell, i, g) {
      const { cj } = baffleCells(params, g.pitch)
      const colours = ['StarGaze', 'Blue Fog']
      // Which ROW this cell is in. The step has to be the one `field` actually
      // used — it was written as `cj + 2`, two cells, which was the 600 mm gap
      // only while a cell happened to be 300 mm. At 100 mm that read every band
      // as the same colour.
      const step = cj + cellsOfMm(FIELD_GAP_MM, g)
      return { ...params, colour: colours[Math.round(cell[1] / step) % colours.length] }
    },
  },
  {
    key: 'tapered-wave',
    type: 'baffles',
    label: 'Tapered wave',
    hint: 'One mirrored tapered run — a sawtooth ceiling line',
    product(g) {
      const base = {
        ...defaultBaffleParams(),
        btype: 'blade', shape: 'tapered', thickness: 25, width: '125-225',
        length: longestLength('blade', g, 300),
        family: 'pet-solid', colour: 'Graphite',
        spacing: 150, mirror: 'alternate', drop: 0.35,
      }
      return { ...base, count: fitCount(base, g, 600) }
    },
    arrange: (params, g, { isModel }) =>
      (isModel ? row(params, g, { gapMm: 300, marginMm: 300 }) : centred(params, g)),
  },
  {
    key: 'ombre-run',
    type: 'baffles',
    label: 'Ombre run',
    hint: 'Signature Ombre VMT, alternate mirrored so the gradient reverses',
    product(g) {
      const base = {
        ...defaultBaffleParams(),
        btype: 'vmt', thickness: 50, width: 200,
        length: longestLength('vmt', g, 300),
        family: 'signature-ombre', colour: 'OM-02',
        spacing: 150, mirror: 'alternate', drop: 0.45,
      }
      return { ...base, count: fitCount(base, g, 600) }
    },
    arrange: (params, g, { isModel }) =>
      (isModel ? row(params, g, { gapMm: 600, marginMm: 300 }) : centred(params, g)),
  },
  {
    key: 'perimeter',
    type: 'baffles',
    label: 'Perimeter band',
    hint: 'Runs around the edge, centre left clear for services',
    product(g) {
      return {
        ...defaultBaffleParams(),
        btype: 'vmt', thickness: 25, width: 150,
        length: longestLength('vmt', g, 300),
        family: 'wood-classic', colour: 'WD-NC-15',
        spacing: 100, drop: 0.35, count: 6,
      }
    },
    arrange: (params, g) => perimeter(params, g, { gapMm: 300, marginMm: 300 }),
  },

  // -------------------------------------------------------------------------
  // clouds
  //
  // Each one wears a DIFFERENT Cloud Series design, so the five buttons show
  // the range as well as the arrangement. All five use printed artwork rather
  // than Designer Textiles: a series code like CL-01_Blue is one of sixteen
  // that this repo builds and can be written down with confidence, where a
  // fabric key comes off a CDN manifest and a stale one would reconcile to null
  // and quietly refuse to place.
  //
  // No preset sets `rot`. A cloud turns in 45 degree steps and a turned panel's
  // plan footprint is not the one cloudCells reports, so a rotated layout would
  // be checked for overlaps against the wrong boxes. Turning is a per-panel
  // decision, made after placing, where the result can be seen.
  // -------------------------------------------------------------------------
  {
    key: 'cloud-hex-field',
    type: 'clouds',
    label: 'Hexagon field',
    hint: 'Hexagon 1200s on a regular grid, one printed design',
    product: () => ({
      ...defaultCloudParams(),
      shape: 'hexagon', size: 1200,
      family: 'cloud-series', colour: 'CL-01_Blue', drop: 0.5,
    }),
    arrange: (params, g) =>
      field(params, g, { gapMm: CLOUD_GAP_MM, marginMm: 400, cells: cloudCells }),
  },
  {
    key: 'cloud-circle-drift',
    type: 'clouds',
    label: 'Circle drift',
    hint: 'Circle 900s in staggered rows at three heights',
    product: () => ({
      ...defaultCloudParams(),
      shape: 'circle', size: 900,
      family: 'cloud-series', colour: 'CL-03_Green', drop: 0.4,
    }),
    arrange: (params, g) =>
      field(params, g, { gapMm: CLOUD_GAP_MM, marginMm: 350, cells: cloudCells, stagger: true }),
    // Height, not colour. The row is taken from the CELL rather than from the
    // index, so the pattern is a property of where a panel is and not of how
    // many happened to fit in the row before it -- which is what made the
    // blade field read as one colour when the count came out even.
    vary(params, cell, i, g) {
      const { cj } = cloudCells(params, g.pitch)
      const row = Math.round(cell[1] / (cj + cellsOfMm(CLOUD_GAP_MM, g)))
      const drops = [0.40, 0.55, 0.70]
      return { ...params, drop: drops[(row + i) % drops.length] }
    },
  },
  {
    key: 'cloud-chequer',
    type: 'clouds',
    label: 'Chequer',
    hint: 'Square 1200s alternating two printed colours',
    product: () => ({
      ...defaultCloudParams(),
      shape: 'square', size: 1200,
      family: 'cloud-series', colour: 'CL-04_Blue', drop: 0.5,
    }),
    arrange: (params, g) =>
      field(params, g, { gapMm: 250, marginMm: 300, cells: cloudCells }),
    // A true chequer needs BOTH axes. Alternating on the flat index alone
    // gives STRIPES whenever a row holds an even number of panels, because the
    // parity is back where it started by the time the next row begins.
    vary(params, cell, i, g) {
      const { ci, cj } = cloudCells(params, g.pitch)
      const gap = cellsOfMm(250, g)
      const col = Math.round(cell[0] / (ci + gap))
      const row = Math.round(cell[1] / (cj + gap))
      const colours = ['CL-04_Blue', 'CL-04_Yellow']
      return { ...params, colour: colours[Math.abs(col + row) % colours.length] }
    },
  },
  {
    key: 'cloud-cluster',
    type: 'clouds',
    label: 'Centre cluster',
    hint: 'Five hexagons over the middle at stepped heights',
    product: () => ({
      ...defaultCloudParams(),
      shape: 'hexagon', size: 1200,
      family: 'cloud-series', colour: 'CL-05_Red', drop: 0.45,
    }),
    arrange: (params, g) => cluster(params, g, { gapMm: 250, cells: cloudCells }),
    // The centre hangs lowest and the four around it step up, so the group
    // reads as one object with a shape rather than five panels at one height.
    vary: (params, cell, i) => ({ ...params, drop: [0.45, 0.62, 0.62, 0.62, 0.62][i] ?? 0.62 }),
  },
  {
    key: 'cloud-ring',
    type: 'clouds',
    label: 'Perimeter ring',
    hint: 'Circle 900s around all four edges, centre left clear',
    product: () => ({
      ...defaultCloudParams(),
      shape: 'circle', size: 900,
      family: 'cloud-series', colour: 'CL-01_Yellow', drop: 0.45,
    }),
    arrange: (params, g) =>
      ring(params, g, { gapMm: CLOUD_GAP_MM, marginMm: 300, cells: cloudCells }),
  },
]

export const getPreset = (key) => PRESETS.find((p) => p.key === key) ?? null

/**
 * Build a preset's placements.
 *
 * `brushParams` is what is currently on the brush. When it carries an imported
 * model the preset arranges THAT, keeping its size, drop and materials, and
 * only the arrangement comes from the preset. Otherwise the preset's own
 * catalogue recipe is used.
 *
 * Returns [] for an unknown preset, or one that cannot fit this ceiling.
 */
export function buildPreset(key, room, g, brushParams = null) {
  const p = getPreset(key)
  if (!p) return []

  // A cloud preset never arranges the brush's model: a cloud IS its model, and
  // `model` is a baffle field that a cloud spec does not carry. Stated rather
  // than left to the truthiness of an absent key, so that a cloud spec growing
  // a `model` field one day does not silently change what these presets do.
  const isModel = p.type !== 'clouds' && !!brushParams?.model
  const params = isModel ? { ...brushParams } : p.product(g)
  const cells = p.arrange(params, g, { isModel })

  return cells.map((cell, i) => ({
    // a model keeps its own materials, so per-placement variation is skipped
    params: !isModel && p.vary ? p.vary(params, cell, i, g) : params,
    cell,
    rot: 0,
  }))
}
