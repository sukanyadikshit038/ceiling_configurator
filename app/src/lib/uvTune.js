// TEMPORARY. A rotator for Cloud Series artwork, to find the right angle by
// eye and write the number down.
//
// DELETE THIS FILE when the angles are known and baked into
// scripts/build-cloud-series.py. It is imported in exactly one place — the
// dev-only block at the bottom of ui/CloudFields.jsx — so removing it is
// deleting this file and that block. Nothing else reaches for it.
//
// WHY IT EXISTS. The triangle artwork is reported as not lining up with the
// triangle panel, and measuring the panel says it should: the model's area
// centroid sits 13.2% off centre along z and 0.0000% off centre along x, so
// the apex is on the z axis and projectCloudUV's apex test resolves it to
// v = 1, which is the top of the image, which is where the artwork's apex is.
// By that reasoning it already fits. It does not. So the reasoning is missing
// something, and the way to find out what is to turn the picture until it
// lands and then read off the angle.
//
// WHAT IT DOES NOT DO. It does not touch the images, the manifest, the UV
// projection, or anything that is saved. It sets `rotation`, `center` and
// `repeat` on the decoded THREE.Texture — the same three handles the renderer
// already reads every frame — so every cloud wearing that design repaints at
// once and a reload puts everything back. Nothing here can outlive the tab.
//
// WHY THE TEXTURE AND NOT THE UVs. The UVs are built once per geometry at load
// and shared; rewriting them means rebuilding a 23,040-vertex buffer on every
// drag of a slider. The texture matrix is a uniform. It is also the right
// place to experiment, because the ANSWER — if it turns out to be a quarter or
// a half turn — belongs in the build script as another entry beside
// TRIANGLE_TURNED, where the pixels get turned once instead of every frame.
//
// A rotation in UV space is only a true rotation if UV space is square. Here it
// is near enough: every image was built to its panel's own aspect and the two
// agree to within 1% on all four shapes (triangle 1.113 against the model's
// 1.121, the worst of them). So a 90 deg turn looks like a 90 deg turn. If a
// shape ever lands more than a few percent out, this will shear it slightly and
// the angle read off here will still be the right angle.

import { SERIES_COLOURS, cloudSeriesTexture, subscribeCloudSeries } from './cloudSeries.js'

/** `${design}|${shape}` -> { rot, flipU, flipV }. Empty means untouched. */
const TUNE = new Map()

const listeners = new Set()
let version = 0
let watching = false

const key = (design, shape) => `${design}|${shape}`
// `scale` is a PERCENTAGE, 100 being the artwork at the size it is now. A
// percentage rather than a factor because it is what somebody reads off a
// slider and types into a build script; 1.05 and 105 are the same number and
// only one of them is obvious at a glance.
const DEFAULT = { rot: 0, flipU: false, flipV: false, scale: 100 }

/** What the scale is allowed to be, in percent. Wide, because this is a probe. */
export const SCALE_RANGE = { min: 25, max: 300 }

export function subscribeTune(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const tuneVersion = () => version

/** What is set for one design and shape. Always an object, never null. */
export function tuneOf(design, shape) {
  return { ...DEFAULT, ...(TUNE.get(key(design, shape)) ?? null) }
}

/**
 * Put one design/shape's transform onto every decoded image of it.
 *
 * Every COLOUR, because the four colours of a design are the same artwork and
 * nobody is going to want Blue straight and Red turned. Whichever of them
 * happen to be decoded right now; one that arrives later is caught by the
 * subscription below.
 */
/**
 * The repeat a tune comes out as. Pulled out of paint() so it can be TESTED.
 *
 * It is the one piece of arithmetic here that can be wrong without looking
 * wrong: a slider that scales the opposite way is something somebody fights
 * for ten minutes before suspecting the tool. Everything else in this file is
 * either a pass-through or visible the instant it runs.
 */
export function repeatFor(t) {
  const k = 100 / (t.scale || 100)
  return [(t.flipU ? -1 : 1) * k, (t.flipV ? -1 : 1) * k]
}

function paint(design, shape) {
  const t = tuneOf(design, shape)
  let touched = 0
  for (const colour of SERIES_COLOURS) {
    const tex = cloudSeriesTexture(design, shape, colour)
    if (!tex) continue
    // Around the middle of the image, not its corner, or a turn becomes a turn
    // plus a slide and the two cannot be told apart by eye.
    tex.center.set(0.5, 0.5)
    tex.rotation = (t.rot * Math.PI) / 180
    // Size and mirroring both live in `repeat`, because in three they are the
    // same handle: it is how many times the image spans the UV square.
    //
    // INVERTED, and that is not a slip. repeat 2 fits the image into the
    // square twice, which makes it look SMALLER. So to draw it 25% bigger the
    // repeat has to be 1/1.25. Getting this backwards would make the slider
    // work the wrong way round, which is the kind of thing somebody spends ten
    // minutes fighting before they suspect the tool.
    //
    // Above 100% the UVs land inside the image and it is simply cropped.
    // Below 100% they run off the edge, and the texture is clamped, so the
    // border pixels streak outward -- expected, obvious on screen, and a
    // reminder that shrinking the artwork leaves the panel with nothing to
    // wear at its rim.
    //
    // A negative repeat is how three mirrors an axis, so the sign carries the
    // flip and the magnitude carries the size. Kept as separate controls
    // because a mirror is not a rotation and no amount of turning substitutes
    // for one -- exactly the distinction this tool is here to settle.
    const [rx, ry] = repeatFor(t)
    tex.repeat.set(rx, ry)
    touched += 1
  }
  return touched
}

/** Re-apply everything set so far. Cheap; there are at most 16 entries. */
export function repaintAll() {
  let n = 0
  for (const k of TUNE.keys()) {
    const [design, shape] = k.split('|')
    n += paint(design, shape)
  }
  return n
}

/**
 * Set part of one design/shape's transform.
 *
 * Starts watching the image cache on first use, rather than at import, so that
 * a production build with the UI block compiled out drops this module whole
 * instead of keeping it alive for a subscription nobody reads.
 */
export function setTune(design, shape, patch) {
  if (!design || !shape) return tuneOf(design, shape)
  const next = { ...tuneOf(design, shape), ...patch }
  // Keep the angle in (-180, 180] so the readout is the shortest way round.
  // Half-open at the bottom on purpose: a half turn reads as 180, not -180,
  // because 180 is what somebody would type and what the build script will
  // eventually be told.
  const r = ((next.rot % 360) + 360) % 360
  next.rot = r > 180 ? r - 360 : r
  // Clamped rather than trusted: a 0 here divides by zero in paint() and puts
  // Infinity into a repeat, which is a black panel and no clue why.
  const sc = Number(next.scale)
  next.scale = Number.isFinite(sc)
    ? Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, sc))
    : 100
  TUNE.set(key(design, shape), next)
  if (!watching) {
    watching = true
    // An image decoded AFTER an angle was set still has to wear it -- switch
    // colour with the slider at 90 and the new one must arrive turned, not
    // straight and then snap.
    subscribeCloudSeries(() => repaintAll())
  }
  paint(design, shape)
  version += 1
  listeners.forEach((l) => l())
  return next
}

/** Put one design/shape back to square. */
export function clearTune(design, shape) {
  TUNE.delete(key(design, shape))
  const tex = SERIES_COLOURS.map((c) => cloudSeriesTexture(design, shape, c))
  for (const t of tex) {
    if (!t) continue
    t.center.set(0.5, 0.5)
    t.rotation = 0
    // Back to one span of the image across the UV square: no turn, no mirror,
    // no zoom.
    t.repeat.set(1, 1)
  }
  version += 1
  listeners.forEach((l) => l())
}

export function clearAllTune() {
  for (const k of [...TUNE.keys()]) clearTune(...k.split('|'))
}

/** Everything that is not square, as a line each. This is the deliverable. */
export function tuneReport() {
  const rows = []
  for (const [k, t] of TUNE) {
    if (t.rot === 0 && !t.flipU && !t.flipV && t.scale === 100) continue
    const [design, shape] = k.split('|')
    rows.push(`${design} ${shape}: rot ${t.rot}, scale ${t.scale}%, `
      + `flipU ${t.flipU ? 'yes' : 'no'}, flipV ${t.flipV ? 'yes' : 'no'}`)
  }
  return rows.length ? rows.sort().join('\n') : '(nothing changed yet)'
}

// A console handle, because a slider is a clumsy way to type 90 and this is
// faster: __uvTune.set('CL-01', 'triangle', { rot: 180 }); __uvTune.report()
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__uvTune = {
    set: setTune, of: tuneOf, clear: clearTune, clearAll: clearAllTune,
    report: tuneReport, all: TUNE, repaint: repaintAll,
  }
}
