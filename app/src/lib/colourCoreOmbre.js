// Colour Core Ombré — the second photographed panel range on the same CDN.
//
// A sibling of lib/colourCore rather than a copy of it. Everything about
// *holding* a panel is shared from there: fetched on demand, decoded down to
// PANEL_PX, and kept in one budgeted cache. Registering these panels into that
// same cache is what makes the memory ceiling apply across BOTH ranges together
// rather than one allowance each.
//
// What is different is the cloth and how it maps:
//
//   an ombré is DIRECTIONAL. The fabric range is a repeating weave, so a
//   centred crop of it is as good as any other. A fade is not: crop the middle
//   64% of it, as the fabric crop does, and you get a band of nearly one colour
//   with both ends of the fade thrown away. So the whole gradient goes on the
//   fin, end to end, and only the across-the-fin axis stays true-scale.
//
//   there are NO thumbnails. The fabric manifest ships 28 KB thumbnails for the
//   contact sheet; this one ships nothing but the 5 MB originals, and 106 of
//   them is not a contact sheet. The swatch is drawn instead, as a fade from
//   the base colour to the overlay colour — which is exactly what the swatch
//   IS, so nothing is lost by not photographing it.
//
//   the panels are 7382 x 17126. The manifest calls this out as a hard blocker
//   and it is right: 17126 is past the maximum texture size on essentially all
//   hardware (16384 at best, commonly 8192), so these cannot go to the GPU as
//   they are. Decoding them down to PANEL_PX happens before upload, so the
//   limit is never reached — but the browser still decodes 126 megapixels per
//   swatch, and that is the slow, memory-hungry step. Downsampled source assets
//   remain the real fix; see the manifest's own warnings.

import * as THREE from 'three'
import { PANEL_MM, getEntry, requestPanel, registerPanels, hasPanel } from './colourCore.js'
import { applyOmbreSwatches } from './catalog.js'

const BASE = import.meta.env?.BASE_URL ?? '/'

/** Filled by loadColourCoreOmbre(). A live object, like COLOUR_CORE. */
export const COLOUR_CORE_OMBRE = {
  ready: false,
  cdn: '',
  baseColors: [], // { id, name, hex, fileLabel }
  textures: [],   // { key, baseColorId, baseColorName, baseColorHex, overlayHex, textureUrl }
}

const byBase = new Map()

/** Every overlay offered over one base colour, in manifest order. */
export const overlaysFor = (baseColorId) => byBase.get(baseColorId) ?? []

/** The base colour a texture key belongs to, or null. */
export function baseOf(key) {
  const t = COLOUR_CORE_OMBRE.textures.find((x) => x.key === key)
  return t ? t.baseColorId : null
}

/**
 * Swatches for the catalogue, base-colour-major so the first entry is the first
 * overlay of the first base colour — which is what the finish picker opens on.
 *
 * `from` and `to` are the pair the swatch is drawn from, matching the shape the
 * authored ombré families already use, so the picker and any flat fallback need
 * no special case for this range.
 */
export function ombreSwatches() {
  return COLOUR_CORE_OMBRE.textures.map((t) => ({
    code: t.key,
    label: t.baseColorName,
    from: t.baseColorHex,
    to: t.overlayHex,
  }))
}

/**
 * Adopt a parsed ombré map. Split from the fetch so the same path can be driven
 * from Node, which is how the suite checks the map without a browser.
 */
export function applyOmbreManifest(data) {
  COLOUR_CORE_OMBRE.cdn = data?.meta?.cdnBaseUrl ?? ''
  COLOUR_CORE_OMBRE.baseColors = Array.isArray(data?.baseColors) ? data.baseColors : []
  COLOUR_CORE_OMBRE.textures = Array.isArray(data?.textures) ? data.textures : []

  byBase.clear()
  for (const t of COLOUR_CORE_OMBRE.textures) {
    if (!byBase.has(t.baseColorId)) byBase.set(t.baseColorId, [])
    byBase.get(t.baseColorId).push(t)
  }

  // into the SAME cache the fabric range uses, so the budget covers both
  registerPanels(COLOUR_CORE_OMBRE.textures)
  COLOUR_CORE_OMBRE.ready = COLOUR_CORE_OMBRE.textures.length > 0
  applyOmbreSwatches(ombreSwatches())
  return COLOUR_CORE_OMBRE.textures.length
}

export async function loadColourCoreOmbre() {
  try {
    const res = await fetch(`${BASE}flat-colour-core-ombre-textures.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyOmbreManifest(await res.json())
  } catch (e) {
    console.warn('Colour Core Ombré map unavailable:', e.message)
    return 0
  }
}

/**
 * Crop one ombré panel onto one fin, with the fade running end to end.
 *
 * The panel is a 1200 x 2800 mm sheet whose fade runs down the 2800 mm side, so
 * the quarter turn that puts the long axis along the fin — the same turn the
 * fabric crop makes — is also what puts the fade along the fin's length.
 *
 * The difference from the fabric crop is the repeat along that axis: 1, not
 * lengthMm/2800. The whole fade belongs on the fin. Cropping it true-scale
 * would show the middle 64% of the gradient and throw both ends away, which for
 * a fade is most of the product.
 *
 * Across the fin there is no gradient — an ombré is uniform along that axis —
 * so that one stays true-scale and the cloth keeps its real size.
 *
 * MIRRORING is a scale of -1 about the texture's centre, which needs no offset
 * to go with it: about 0.5, a scale of -1 maps 0 to 1 and 1 to 0 exactly. That
 * is what turns an A-to-B fin into a B-to-A one for the alternating layout.
 */
export function cropOmbreToFin(tex, lengthMm, depthMm, { mirror = false } = {}) {
  tex.center.set(0.5, 0.5)
  tex.rotation = Math.PI / 2
  tex.repeat.set(
    Math.min(1, depthMm / PANEL_MM.w), // across the fin, off the 1200 mm side
    mirror ? -1 : 1,                   // along the fin: the whole fade, or its reverse
  )
  tex.offset.set(0, 0)
  tex.needsUpdate = true
  return tex
}

// ---------------------------------------------------------------------------
// two views of the one panel
// ---------------------------------------------------------------------------

// A clone shares its SOURCE, and three uploads per source — so a second view of
// the same panel costs one small JS object and no GPU memory at all. Measured
// on three 0.183: two Texture objects, one WebGLTexture, info.memory.textures
// of 1. (The older note elsewhere that "a clone is a second upload" predates
// three r151 and is no longer true.)
//
// Two views is all that is ever needed: a fin either takes the fade forwards or
// backwards. Cloning per fin would be a clone per fin for no gain, since every
// forward fin wants the identical transform.
//
// The twin is kept ON the panel rather than in a slot here, so it is found
// again for as long as that panel is held and released with it when the panel
// goes. A module-level slot was a cache of one, and would have gone wrong the
// moment two designs were on screen — the same fault as the panel slot itself.
function viewOf(panel, mirror) {
  if (!mirror) return panel
  if (!panel.userData.mirrored) {
    const mirrored = panel.clone()
    mirrored.userData.shared = true
    panel.userData.mirrored = mirrored
  }
  return panel.userData.mirrored
}

/**
 * The map for one fin: this key's panel if it is in hand, else nothing.
 *
 * Nothing, and deliberately so. There is no thumbnail in this range to stand in
 * with, and the obvious substitute — drawing the fade from the two hexes — was
 * worse than showing nothing: it looks like the finished article, so a baffle
 * appears done and then visibly changes under you when the photograph lands.
 * Returning null leaves the fin wearing what it already had until there is
 * something real to put on it.
 */
export function ombreSurface(key, { lengthMm = PANEL_MM.l, depthMm = PANEL_MM.w, mirror = false } = {}) {
  if (!getEntry(key)) return null
  const panel = requestPanel(key)
  if (!panel) return null
  const tex = viewOf(panel, mirror)
  cropOmbreToFin(tex, lengthMm, depthMm, { mirror })
  return { texture: tex, shared: true }
}

/** True while this key's panel is on its way but not yet showing. */
export const ombrePending = (key) => !!getEntry(key) && !hasPanel(key)
