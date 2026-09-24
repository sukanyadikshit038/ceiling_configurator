// Grid maths for the ceiling zone.
//
// Everything downstream — placement, overlap tests, obstruction masking and the
// schedule/BOM — is derived from these functions, so what you see and what you
// order can never drift apart (BRIEF §6). All of it is integer arithmetic on
// cell indices; nothing here knows about three.js or React.
//
// The product basis is 300 mm, which divides the 600 mm ceiling-tile module
// exactly, so tiles and baffles share one coordinate system.

/**
 * The size of a cell, in metres. A MILLIMETRE.
 *
 * It has been 300 mm and then 100, and each time the reason to shrink it was
 * the same: an item's position is quantised to the cell, so the cell is the
 * finest anything can be moved, and a set reserves WHOLE cells, so it hoards
 * whatever it does not fill.
 *
 * 100 mm was still too coarse for a real product. The supplied ceiling tiles
 * are on a 616.56 mm module — a 600 mm panel with the grid rails outside it —
 * and 100 mm cells can only offer 600 or 700. Two tiles placed side by side sat
 * 700 mm apart with 83 mm of ceiling showing between them, and no amount of
 * dragging closed it, because there was no cell in between. At a millimetre the
 * same tile lands within half a millimetre of its module.
 *
 * What a cell is NOT any more is the step a person aims at. That job, and the
 * obstruction brush, and the lines actually drawn, are SNAP_M / MASK_M / DRAW_M
 * below — all still 100 mm. Separating them is what makes a millimetre cell
 * usable rather than a grid nobody can hit.
 *
 * A layout saved at another pitch is rescaled on load rather than misread; see
 * fromJSON, which is why toJSON has always recorded the pitch it used — and now
 * records the mask's own pitch beside it.
 */
export const DEFAULT_PITCH = 0.001 // metres

/**
 * The three steps that used to be one number, now that a cell is a millimetre.
 *
 * A millimetre grid exists so a tile can sit where its module puts it: the
 * supplied tiles are on a 616.56 mm module and a 100 mm cell could only ever
 * offer 600 or 700, which left an 83 mm joint no amount of dragging could
 * close. At 1 mm the same tile lands within half a millimetre of its module.
 *
 * But a millimetre is the wrong unit for the other two jobs a pitch was doing:
 *
 *   SNAP_M  what a DRAGGED set lands on. At 1 mm there is no snapping at all,
 *           and a run of baffles nobody can line up is worse than one that
 *           steps 100 mm. Tiles override this with their own module — see
 *           snapStepOf — because landing on the module is the whole point.
 *   MASK_M  the obstruction brush. A 1 mm square of "there is a light here" is
 *           not a statement anyone can paint; 100 mm is.
 *   DRAW_M  the lines actually drawn. 7,500 of them is a grey wash that says
 *           nothing about where anything will land.
 */
export const SNAP_M = 0.1
export const MASK_M = 0.1
export const DRAW_M = 0.1

/**
 * The usable cell grid for a room's ceiling.
 *
 * A whole number of cells is centred inside the ceiling extents, so any
 * remainder is split evenly between the two edges rather than piling up on one.
 */
export function gridOf(room) {
  const { ceiling: c } = room
  const pitch = room.pitch ?? DEFAULT_PITCH
  const cols = Math.floor((c.maxX - c.minX) / pitch + 1e-6)
  const rows = Math.floor((c.maxZ - c.minZ) / pitch + 1e-6)
  return {
    pitch,
    cols,
    rows,
    originX: -(cols * pitch) / 2,
    originZ: -(rows * pitch) / 2,
    y: c.y,
  }
}

/** Millimetres along an axis -> whole cells, never fewer than one. */
export const lengthCells = (mm, pitch) => Math.max(1, Math.round(mm / 1000 / pitch))

/** Metres along an axis -> whole cells, rounding up so nothing overhangs. */
export const spanCells = (m, pitch) => Math.max(1, Math.ceil(m / pitch - 1e-6))

/** Cell extent for something of the given metre dimensions. */
export const cellsFor = (lengthM, widthM, pitch) => ({
  ci: spanCells(lengthM, pitch),
  cj: spanCells(widthM, pitch),
})

/**
 * Footprint in grid cells: i0/j0 = min corner, ci/cj = extent.
 *
 * Every item carries its own measured extent, because a baffle set's footprint
 * is "run length x how wide the fins fan out", not "a length x one cell".
 *
 * Rotation is the axis-aligned box around the turned extent, which is the same
 * arithmetic at every angle rather than a special case per angle:
 *
 *     ci' = ci |cos t| + cj |sin t|
 *     cj' = ci |sin t| + cj |cos t|
 *
 * At 0 that is (ci, cj) and at 90 it is (cj, ci) — exactly the swap this used
 * to do — so clouds turning in 45 degree steps cost the other products nothing.
 * The epsilon is doing real work: cos(90 degrees) is 6.1e-17 in floating point,
 * not 0, and a bare ceil would hand every quarter-turned set an extra cell.
 *
 * At 45 degrees this is the box around the box, so a ROUND cloud reserves the
 * square around its circle turned on the diagonal — about 41% more than it
 * needs. Conservative rather than wrong: it is the same rectangle model the
 * grid uses everywhere, and a circle is the one shape nobody turns.
 */
export function footprint(item, g) {
  const ci = item.ci ?? lengthCells(item.lengthMm ?? 1000, g.pitch)
  const cj = item.cj ?? 1
  const t = (((item.rot ?? 0) * Math.PI) / 180)
  const c = Math.abs(Math.cos(t))
  const s = Math.abs(Math.sin(t))
  const span = (v) => Math.max(1, Math.ceil(v - 1e-6))
  return {
    i0: item.cell[0],
    j0: item.cell[1],
    ci: span(ci * c + cj * s),
    cj: span(ci * s + cj * c),
  }
}

/** World-space centre of a footprint, on the ceiling plane. */
export function footprintCentre(fp, g) {
  return [
    g.originX + (fp.i0 + fp.ci / 2) * g.pitch,
    g.y,
    g.originZ + (fp.j0 + fp.cj / 2) * g.pitch,
  ]
}

/** World XZ -> cell indices. Unclamped: callers decide what off-grid means. */
export function pointToCell(x, z, g) {
  return [Math.floor((x - g.originX) / g.pitch), Math.floor((z - g.originZ) / g.pitch)]
}

/** Cell centre in world space. */
export const cellCentre = (i, j, g) => [
  g.originX + (i + 0.5) * g.pitch,
  g.y,
  g.originZ + (j + 0.5) * g.pitch,
]

/**
 * Clamp a min-corner so the whole footprint stays on the ceiling — and, if a
 * `step` is given, so it stays ON THAT STEP.
 *
 * The step is the whole point, and leaving it out is what this got wrong. The
 * far edge of the ceiling is `cols - ci`, and there is no reason for that to be
 * a multiple of anything: on a 7.5 m ceiling a 600 mm tile clamps to 6900, and
 * 6900 is eleven and a HALF modules from the origin. A block that lands there
 * is half a tile out of step with every block that snapped, and — because
 * Duplicate offsets by exactly one module — so is every copy made from it.
 * That is two lattices on one ceiling: duplicates agree with each other,
 * snapped blocks agree with each other, and the two never meet.
 *
 * So the bound is applied first and the step second, FLOORING rather than
 * rounding, because rounding up would put the corner back outside the ceiling
 * it was just clamped into.
 *
 * Stepless by default, because not every caller wants it: an arrow-key nudge
 * goes through update() and deliberately does not snap, and a nudge that
 * snapped back to where it started would do nothing at all.
 */
/**
 * A point in metres, held inside the ceiling rectangle.
 *
 * For the marquee, which tracks an UNBOUNDED plane so the band keeps following
 * the pointer past the edge of the zone — see Marquee.jsx. This is what stops
 * the band being drawn out into the room, offering to select ceiling that is
 * not there, and it is what lets the edge that has run out of ceiling sit still
 * while the other one carries on.
 *
 * Here rather than in the component because it is a fact about the grid's
 * extent, and because a pure function can be asserted without a renderer.
 */
export function clampToCeiling(x, z, g) {
  return [
    Math.min(Math.max(x, g.originX), g.originX + g.cols * g.pitch),
    Math.min(Math.max(z, g.originZ), g.originZ + g.rows * g.pitch),
  ]
}

export function clampCorner(i0, j0, ci, cj, g, step) {
  const fit = (v, span, limit, s) => {
    const max = limit - span
    if (max <= 0) return 0
    const inside = Math.min(Math.max(v, 0), max)
    if (!(s > 1)) return inside
    const onStep = Math.floor(inside / s) * s
    return onStep >= 0 && onStep <= max ? onStep : inside
  }
  const [si, sj] = step ?? []
  return [fit(i0, ci, g.cols, si), fit(j0, cj, g.rows, sj)]
}

/** True when two footprints share any cell. */
export const overlaps = (a, b) =>
  a.i0 < b.i0 + b.ci && b.i0 < a.i0 + a.ci &&
  a.j0 < b.j0 + b.cj && b.j0 < a.j0 + a.cj

/** Canonical string key for a cell — obstruction masks are sets of these. */
export const key = (i, j) => `${i},${j}`

/**
 * Every cell a footprint covers.
 *
 * Only safe on a COARSE footprint. At the 1 mm pitch a tile block covers
 * 617 x 619 cells and this returns 381,923 strings — which is why nothing on
 * the placement path calls it any more. See maskBlocks.
 */
export function cellsOf(fp) {
  const out = []
  for (let i = fp.i0; i < fp.i0 + fp.ci; i++)
    for (let j = fp.j0; j < fp.j0 + fp.cj; j++) out.push(key(i, j))
  return out
}

// ---------------------------------------------------------------------------
// the obstruction mask
// ---------------------------------------------------------------------------
//
// Masked cells are MASK_M squares, whatever the placement pitch is. That keeps
// the brush paintable and, more importantly, keeps the mask a fixed physical
// thing: a light is 600 mm wide whether the grid steps 100 mm or 1.

/** How many mask cells fit across the grid. */
export const maskDims = (g) => ({
  cols: Math.max(1, Math.floor((g.cols * g.pitch) / MASK_M + 1e-6)),
  rows: Math.max(1, Math.floor((g.rows * g.pitch) / MASK_M + 1e-6)),
})

/** World XZ -> mask cell. */
export const pointToMask = (x, z, g) => [
  Math.floor((x - g.originX) / MASK_M),
  Math.floor((z - g.originZ) / MASK_M),
]

/** A mask cell as a placement footprint, so it can be compared with items. */
export const maskFootprint = (i, j, g) => {
  const k = MASK_M / g.pitch
  return { i0: Math.round(i * k), j0: Math.round(j * k), ci: Math.round(k), cj: Math.round(k) }
}

/**
 * Does any masked cell fall inside this footprint?
 *
 * Costs one comparison PER OBSTRUCTION rather than one per cell of the
 * footprint. That is not a micro-optimisation: canPlace runs on every frame of
 * a drag, and enumerating a tile block's cells at the 1 mm pitch is 381,923
 * string builds a frame.
 */
export function maskBlocks(fp, g, mask) {
  if (!mask) return false
  const k = MASK_M / g.pitch
  const i0 = fp.i0 / k
  const j0 = fp.j0 / k
  const i1 = (fp.i0 + fp.ci) / k
  const j1 = (fp.j0 + fp.cj) / k
  for (const cell of mask) {
    const c = cell.indexOf(',')
    const i = +cell.slice(0, c)
    const j = +cell.slice(c + 1)
    if (i + 1 > i0 && i < i1 && j + 1 > j0 && j < j1) return true
  }
  return false
}

/**
 * What a set of this kind lands on when dragged, in CELLS.
 *
 * A tile block snaps to its own module, so two of them dropped side by side are
 * an exact module apart and their shared tee is one tee. Everything else keeps
 * the 100 mm feel the grid had before it became millimetres.
 */
export function snapStepOf(item, g) {
  const mod = item?.params?.moduleMm
  if (item?.type === 'tiles' && mod?.x > 0 && mod?.z > 0) {
    // The SETTING-OUT module, which is the smaller of the two — not the tile's
    // own length on each axis.
    //
    // This was the tile's own module per axis, and that is a lattice PER SIZE
    // rather than one per ceiling. A 1200 x 600 tile could then only start at
    // multiples of 1200, while the 600 x 600 tiles beside it were creating
    // positions every 600 — so half the gaps a 600 field leaves cannot be
    // filled by a 1200 at all. Measured: a corner aimed at cell 1800 snapped to
    // 2400 for the 1200 tile and to 1800 for the 600, and 1800 is where the gap
    // was.
    //
    // A real ceiling has ONE grid and a bigger tile simply spans more of it:
    // the cross-tee pitch is what everything lands on, and a 1200 tile occupies
    // two bays of it. Taking the smaller axis says exactly that, and it says it
    // the same on both axes — which is also why rotation needs no special case
    // here. A turned tile's footprint swaps; a square step does not have to.
    const n = Math.max(1, Math.round(Math.min(mod.x, mod.z) / 1000 / g.pitch))
    return [n, n]
  }
  const n = Math.max(1, Math.round(SNAP_M / g.pitch))
  return [n, n]
}

/** Round a min-corner onto the step this kind of set lands on. */
export function snapCorner(i0, j0, item, g) {
  const [si, sj] = snapStepOf(item, g)
  return [Math.round(i0 / si) * si, Math.round(j0 / sj) * sj]
}

/** True when the footprint lies wholly inside the grid. */
export const onGrid = (fp, g) =>
  fp.i0 >= 0 && fp.j0 >= 0 && fp.i0 + fp.ci <= g.cols && fp.j0 + fp.cj <= g.rows
