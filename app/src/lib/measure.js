// Clear distances between placed sets, for the dimensions the scene draws.
//
// EDGE TO EDGE, never centre to centre. A centre-to-centre figure is not a
// distance anyone sets out from: it changes when a set grows a fin, and it is
// not what you measure on site with a tape. What is wanted is the clear gap —
// the air between one set and the next.
//
// Measured off each set's TRUE extent, not its grid footprint. The footprint
// rounds up to whole cells, so two sets that touch on the grid can still have
// a few millimetres of reserved space between them, and a dimension that read
// off the grid would report that gap rather than the real one.
//
// Pure geometry: no three.js, no React, so the numbers can be asserted without
// a renderer.

import { baffleExtent } from './catalog.js'
import { tileBlockExtent } from './tiles.js'
import { footprint, footprintCentre } from './grid.js'

/** How far a neighbour may be before it stops being worth dimensioning. */
export const MEASURE_RANGE_M = 3

/**
 * A set's footprint in the plan, in metres: centre, and the size it really is.
 *
 * Rotation swaps the axes — a run turned 90 degrees is as wide as it was long —
 * so this is where "length" and "width" become "x" and "z" and stop being
 * product terms.
 */
export function planRect(item, g) {
  const [cx, , cz] = footprintCentre(footprint(item, g), g)
  const e = item.type === 'tiles' ? tileBlockExtent(item.params) : baffleExtent(item.params)
  const turned = (item.rot ?? 0) === 90 || (item.rot ?? 0) === 270
  return {
    id: item.id,
    cx,
    cz,
    w: turned ? e.width : e.length,
    d: turned ? e.length : e.width,
  }
}

const sign = (v) => (v < 0 ? -1 : 1)

/**
 * The clear gap between two plan rectangles, and where to draw it.
 *
 * Three cases, and they are genuinely different measurements rather than three
 * ways of writing one:
 *
 *   'x'  they overlap along z, so they face each other across a gap in x. The
 *        dimension runs square between the facing edges — a tape measurement.
 *   'z'  the same the other way round.
 *   'diagonal'  they overlap on neither axis, so the nearest points are two
 *        CORNERS. It is a real distance and the shortest one between them, but
 *        it is not square to anything and nobody sets out from it, so it is
 *        labelled as what it is.
 *
 * Returns null when the two overlap in plan, which the placement rules already
 * prevent — a gap of zero between overlapping sets would be a lie either way.
 */
export function gapBetween(a, b) {
  const dx = Math.abs(a.cx - b.cx) - (a.w + b.w) / 2
  const dz = Math.abs(a.cz - b.cz) - (a.d + b.d) / 2
  if (dx < 0 && dz < 0) return null

  const sx = sign(b.cx - a.cx)
  const sz = sign(b.cz - a.cz)

  if (dz < 0) {
    // facing across x; the line sits in the middle of the z they share
    const lo = Math.max(a.cz - a.d / 2, b.cz - b.d / 2)
    const hi = Math.min(a.cz + a.d / 2, b.cz + b.d / 2)
    const z = (lo + hi) / 2
    return {
      m: dx,
      kind: 'x',
      from: [a.cx + sx * (a.w / 2), z],
      to: [b.cx - sx * (b.w / 2), z],
    }
  }
  if (dx < 0) {
    const lo = Math.max(a.cx - a.w / 2, b.cx - b.w / 2)
    const hi = Math.min(a.cx + a.w / 2, b.cx + b.w / 2)
    const x = (lo + hi) / 2
    return {
      m: dz,
      kind: 'z',
      from: [x, a.cz + sz * (a.d / 2)],
      to: [x, b.cz - sz * (b.d / 2)],
    }
  }
  return {
    m: Math.hypot(dx, dz),
    kind: 'diagonal',
    from: [a.cx + sx * (a.w / 2), a.cz + sz * (a.d / 2)],
    to: [b.cx - sx * (b.w / 2), b.cz - sz * (b.d / 2)],
  }
}

/**
 * Every set within range of the selected one, with the gap to each.
 *
 * Baffle to baffle: a tile block is not a baffle, and a run of dimensions to
 * one would be answering a question nobody asked. Nearest first, so a crowded
 * ceiling reads in the order the eye wants.
 *
 * Stated as "is a baffle" rather than "is not a tile". Written the other way it
 * was right until clouds existed, and then it silently sent them to
 * `baffleExtent`, which reads baffle fields a cloud's params do not have. A
 * whitelist is wrong about a new product loudly; a blacklist is wrong quietly.
 */
export function neighbourGaps(item, items, g, range = MEASURE_RANGE_M) {
  if (item?.type !== 'baffles') return []
  const me = planRect(item, g)
  const out = []
  for (const other of items) {
    if (other.id === item.id || other.type !== 'baffles') continue
    const gap = gapBetween(me, planRect(other, g))
    if (!gap || gap.m > range) continue
    out.push({ ...gap, id: other.id, mm: Math.round(gap.m * 1000) })
  }
  return out.sort((p, q) => p.m - q.m)
}
