// Cloud Series: printed artwork for cloud panel faces.
//
// Four designs crossed with four shapes and four colours — 64 images, and the
// set is complete, which is why the shape is not a question anyone is asked.
// You pick a DESIGN and a COLOUR; the shape comes from the cloud you already
// placed, and the right file follows from the three.
//
//   CL-01  a watercolour wash
//   CL-03  concentric arcs
//   CL-04  nested frames
//   CL-05  a radial sunburst
//
// This is not a sheet the way Designer Textiles and the Wood Classic veneers
// are, and the difference decides the whole module. A veneer is a 1200 x 2800
// panel that a fin takes a STRIP of and a tile takes a PATCH of, so those have
// to be cropped to true scale. A Cloud Series design is a picture OF ONE PANEL:
// it is drawn to the shape, it covers the face exactly once, and it scales with
// the panel rather than being cut from something bigger. So there is no crop
// here, no repeat and no offset — the image goes on whole.
//
// That only works because the panel has a real top-down UV map, which it did
// not until projectCloudUV in lib/clouds.js. The files' own mapping is radial
// on the circles, tiled on the hexagons and collapsed on the squares; see the
// note there.
//
// The images come from public/textures/clouds/cloud-series, built from the
// supplied artwork by scripts/build-cloud-series.py. That step trims each image
// to the artwork's own edge — so image edge = shape edge = panel edge — turns
// the two designs whose triangle was drawn pointing the wrong way, and brings
// 518 MB of source down to 20.

import * as THREE from 'three'

const BASE = import.meta.env?.BASE_URL ?? '/'
const ROOT = `${BASE}textures/clouds/cloud-series`
const MAP = `${ROOT}/manifest.json`

/** Filled by loadCloudSeriesManifest(). Live arrays, like CLOUD_MODELS. */
export const SERIES_PANELS = []
export const SERIES_DESIGNS = []
export const SERIES_COLOURS = []

// A design is called by its CODE and nothing else — CL-01, CL-03, CL-04,
// CL-05. There was a table of invented names here (Watercolour, Arcs, Frames,
// Sunburst) and it is gone: the codes are what the range is called, they are
// what goes on an order, and a name nobody outside this file uses is a second
// name for the same thing that has to be kept in step with the first. When a
// design arrives the list grows by itself, which it cannot do if each one also
// needs somebody to think of a word for it.

/** One key for one IMAGE: design, shape and colour, in that order. */
export const seriesKey = (design, shape, colour) => `${design}|${shape}|${colour}`

/** Split an image key back apart. Returns null for anything that is not one. */
export function splitSeriesKey(key) {
  const bits = String(key ?? '').split('|')
  return bits.length === 3 ? { design: bits[0], shape: bits[1], colour: bits[2] } : null
}

/**
 * One code for one SWATCH: the design and the colour, and not the shape.
 *
 * A spec carries a single `colour` string, and everything downstream of it —
 * getSwatch, the schedule, the group's shared-spec test, the undo diff — takes
 * that one string as the finish. Two new fields on the spec would mean touching
 * every one of them.
 *
 * Designer Textiles already settled this shape: FB1_Blue_2 is one code holding
 * a fabric, a group and a shade, and the panel asks for the three separately.
 * This is the same bargain with two.
 *
 * The SHAPE is not in it, because the shape is not a choice — a cloud already
 * has one, and the four shapes of a design are the same artwork cut to
 * different outlines. Putting it in the code would let a spec say "hexagon"
 * while sitting on a circle.
 */
export const seriesSwatchCode = (design, colour) => `${design}_${colour}`

/** Split a swatch code back into its design and colour, or null. */
export function splitSeriesSwatch(code) {
  const m = /^(CL-\d\d)_(.+)$/.exec(String(code ?? ''))
  return m ? { design: m[1], colour: m[2] } : null
}

/**
 * Every design x colour that exists, as swatches the catalogue can hold.
 *
 * The hex is the colour that design averages to — measured off the image when
 * it was built, so the chip in the picker is the panel's own colour rather than
 * a guess at it. Any shape will do for the chip: the four are one artwork.
 */
export function cloudSeriesSwatches() {
  const out = []
  for (const design of SERIES_DESIGNS) {
    for (const colour of SERIES_COLOURS) {
      const hex = seriesHex(design, null, colour)
      if (!hex) continue
      out.push({
        code: seriesSwatchCode(design, colour),
        hex,
        design,
        colour,
        label: `${design} ${colour}`,
      })
    }
  }
  return out
}

/** Adopt a parsed manifest. Split from the fetch so Node can drive it too. */
export function applyCloudSeriesManifest(data) {
  SERIES_PANELS.length = 0
  SERIES_DESIGNS.length = 0
  SERIES_COLOURS.length = 0
  for (const p of data?.panels ?? []) SERIES_PANELS.push(p)
  // Read off the manifest rather than hard-coded: CL-02 is missing from the
  // supplied set, and when it arrives it should appear by being built, not by
  // anybody editing a list here.
  for (const d of data?.designs ?? []) SERIES_DESIGNS.push(d)
  for (const c of data?.colours ?? []) SERIES_COLOURS.push(c)
  return SERIES_PANELS.length
}

export async function loadCloudSeriesManifest() {
  try {
    const res = await fetch(MAP, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyCloudSeriesManifest(await res.json())
  } catch (e) {
    console.warn('Cloud Series artwork unavailable:', e.message)
    return 0
  }
}

// ---------------------------------------------------------------------------
// what exists
// ---------------------------------------------------------------------------

export const cloudSeriesReady = () => SERIES_PANELS.length > 0

export const seriesPanel = (design, shape, colour) =>
  SERIES_PANELS.find((p) => p.design === design && p.shape === shape && p.colour === colour)
  ?? null

/**
 * The designs that exist for a shape.
 *
 * Asked per shape rather than taken from SERIES_DESIGNS, because a design that
 * arrives with only three of its four shapes drawn should not be offered on the
 * fourth — it would be offered, chosen, and then render as a flat colour with
 * no explanation.
 */
export function designsFor(shape) {
  if (!shape) return [...SERIES_DESIGNS]
  const has = new Set(SERIES_PANELS.filter((p) => p.shape === shape).map((p) => p.design))
  return SERIES_DESIGNS.filter((d) => has.has(d))
}

/** The colours a design is drawn in for a shape. */
export function coloursFor(design, shape) {
  const has = new Set(
    SERIES_PANELS
      .filter((p) => p.design === design && (!shape || p.shape === shape))
      .map((p) => p.colour)
  )
  return SERIES_COLOURS.filter((c) => has.has(c))
}

/**
 * Every colour drawn for a shape, across all the designs.
 *
 * The colour is asked for FIRST now, and a first question cannot be a property
 * of the answer to the second: there is no design in hand yet to ask about.
 *
 * Across the supplied set this is always the same four, because the grid is
 * full -- four designs x four shapes x four colours, all 64 present. Counted
 * off the panels anyway rather than returning SERIES_COLOURS, so that a design
 * arriving in two colours cannot quietly put two colours in the row that only
 * half the designs can honour.
 */
export function coloursForShape(shape) {
  const has = new Set(
    SERIES_PANELS.filter((p) => !shape || p.shape === shape).map((p) => p.colour)
  )
  return SERIES_COLOURS.filter((c) => has.has(c))
}

/**
 * The designs drawn in a colour, for a shape. The mirror of coloursFor.
 *
 * Complete today, which is precisely why it is computed: the picker offering a
 * design that is not drawn in the chosen colour would be offering a file that
 * is not there, and a cloud wearing it renders as flat paint with nothing on
 * screen to say why.
 */
export function designsForColour(colour, shape) {
  const has = new Set(
    SERIES_PANELS
      .filter((p) => p.colour === colour && (!shape || p.shape === shape))
      .map((p) => p.design)
  )
  return SERIES_DESIGNS.filter((d) => has.has(d))
}

/**
 * The picture of one panel, small enough to sit in the sidebar.
 *
 * A separate file from the render, and it has to be: the render is 1400 px and
 * 169 to 528 KB, so four of them in a picker is 1.4 MB of download and 31 MB of
 * decoded RGBA for four chips an inch wide. These are 128 px and 3.4 KB each,
 * 217 KB for all 64 -- the same order as the 275 Designer Textile thumbnails.
 *
 * It is also DIFFERENT pixels, not just smaller ones. The thumbnail is taken
 * before the bleed, so it keeps the white the artwork was drawn on and the
 * shape's own outline with it; the render has that smeared away on purpose.
 * See the long note at the taking point in scripts/build-cloud-series.py.
 *
 * Null when the manifest predates the thumbnails, so a caller falls back to the
 * hex rather than requesting a file that was never written.
 */
export function seriesThumbUrl(design, shape, colour) {
  const p = seriesPanel(design, shape, colour)
    // Any shape of that design will do when the exact one is missing -- the
    // four are one artwork -- the same fallback seriesHex makes.
    ?? SERIES_PANELS.find((q) => q.design === design && q.colour === colour)
  if (!p?.thumb) return null
  return `${ROOT}/${p.thumb.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * The colour a panel averages to.
 *
 * Two jobs: the chip in the picker, and what the panel wears between being
 * placed and its image arriving, so a cloud never flashes white on the way to
 * being right. Measured off each image when it was built, not invented.
 */
export function seriesHex(design, shape, colour) {
  const exact = seriesPanel(design, shape, colour)
  if (exact) return exact.hex
  // For a chip, before a shape is known: any shape of that design will do —
  // the four are the same artwork cut to different outlines.
  const any = SERIES_PANELS.find((p) => p.design === design && p.colour === colour)
  return any?.hex ?? null
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

const textures = new Map()   // key -> THREE.Texture
const coming = new Map()     // key -> promise
const listeners = new Set()
let version = 0

export function subscribeCloudSeries(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Bumped every time an image lands, so a placed cloud can repaint itself. */
export const cloudSeriesVersion = () => version

export const cloudSeriesTexture = (design, shape, colour) =>
  textures.get(seriesKey(design, shape, colour)) ?? null

/**
 * Fetch one design and turn it into a face texture.
 *
 * Clamped, not repeating, and with no repeat or offset set: the projection maps
 * the panel's plan box onto 0..1, and the image IS the panel's face, so it goes
 * on whole and exactly once. Repeating it would tile a picture; cropping it
 * would cut the shape off its own outline.
 *
 * One texture per design/shape/colour, shared by every cloud wearing it — a
 * whole ceiling of one design is a single upload.
 */
export function loadCloudSeriesTexture(design, shape, colour) {
  const key = seriesKey(design, shape, colour)
  if (textures.has(key)) return Promise.resolve(textures.get(key))
  if (coming.has(key)) return coming.get(key)
  const panel = seriesPanel(design, shape, colour)
  if (!panel) return Promise.resolve(null)

  const promise = (async () => {
    const url = `${ROOT}/${panel.file.split('/').map(encodeURIComponent).join('/')}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} fetching ${key}`)
    // FLIPPED AT DECODE, and this is not optional.
    //
    // three's `Texture.flipY` is IGNORED for an ImageBitmap source — the flip
    // is a pixel-store setting applied on upload, and an ImageBitmap does not
    // go through that path. So the default `flipY = true` is a lie here: the
    // texture uploads unflipped, v = 1 samples the BOTTOM of the image, and
    // every design lands upside down on every shape.
    //
    // Measured rather than reasoned about: a 64 px image, red top half and blue
    // bottom half, taken through this exact call, rendered BLUE at a panel
    // vertex whose v is 0.967. It is only the triangles where anybody can see
    // it — the other three shapes' artwork is near enough symmetric to hide it.
    //
    // Both halves of the belt: flipped when the bitmap is made, AND flipY
    // turned off. If a browser does honour flipY for ImageBitmap the two would
    // otherwise cancel out and put it back where it started.
    const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'flipY' })
    const tex = new THREE.Texture(bmp)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    // Clamped on both axes. The panel's UVs land inside 0..1 by construction,
    // but the RIM is projected too and rounds a hair outside at the corners —
    // clamped it takes the edge pixel, which is the face colour carried over
    // the edge. Repeating would wrap the far side of the design onto it.
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.needsUpdate = true

    textures.set(key, tex)
    version += 1
    listeners.forEach((l) => l())
    return tex
  })()

  coming.set(key, promise)
  promise.catch((e) => {
    console.warn(`[cloud-series] ${key}:`, e.message)
    coming.delete(key)
  })
  return promise
}

/** How many images are decoded right now — reported rather than guessed at. */
export const cloudSeriesLoaded = () => textures.size

/** Roughly what the decoded images are costing, in megabytes of RGBA. */
export const cloudSeriesMemoryMB = () => {
  let px = 0
  for (const t of textures.values()) {
    px += (t.image?.width ?? 0) * (t.image?.height ?? 0)
  }
  return +(px * 4 / 1e6).toFixed(1)
}

/**
 * Keep only the images these keys name, and free the rest.
 *
 * 1400 x 1400 is about 7.8 MB decoded, and all 64 would be 500. Nothing here
 * knows when a design stops being worn; the document does, so main.jsx says.
 * Safe because a cloud holds the texture by reference and repaints whenever its
 * finish changes — a key still wanted is never in the list, and one dropped is
 * simply fetched again if it comes back.
 */
export function retainCloudSeries(keys) {
  const keep = new Set(keys)
  for (const [k, tex] of [...textures]) {
    if (keep.has(k)) continue
    tex.image?.close?.()
    tex.dispose()
    textures.delete(k)
    coming.delete(k)
  }
  return textures.size
}

// A dev handle on THIS module instance, the same way store.js and lib/textiles
// expose theirs. A dynamic import from the console gets a different instance
// under Vite, so without this there is no way to ask the running app what it
// actually holds.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__cloudSeries = {
    panels: SERIES_PANELS, textures, loaded: cloudSeriesLoaded,
    memoryMB: cloudSeriesMemoryMB, version: cloudSeriesVersion,
  }
}
