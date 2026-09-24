// Designer Textile: 275 photographed fabric panels, fetched from the CDN.
//
// Five fabrics (FB1-FB5) crossed with 55 shades in 8 colour groups. Every
// fabric is made in every group, so all 275 combinations exist — but the map is
// read rather than assumed, because the file says outright that it need not be
// true of a future one.
//
// A panel is a 1200 x 2800 mm SHEET, which is the same thing the Wood Classic
// veneers are: fins are cut from it as vertical strips. That is why this lands
// on the existing veneer path rather than a new one, and why "these will seam
// if repeated" — the file's own warning — does not bite. Nothing repeats a
// sheet; a fin takes one strip out of it.
//
// Two numbers decide the whole shape of this module:
//
//   1,006 MB   the full set at full resolution. Nothing is loaded up front; a
//              sheet is fetched the first time something asks to wear it.
//     108 MB   ONE panel decoded — 3401 x 7937 is 27 megapixels. Decoded at a
//              resize rather than at full size, so the spike never happens.
//
// The thumbnails are a different matter: 540 B to 3.8 KB, and 0.3 MB for all
// 275. Small enough that the picker can have the lot.

import * as THREE from 'three'

const BASE = import.meta.env?.BASE_URL ?? '/'
const MAP = `${BASE}textures/baffles/designer-textile/textures.json`

/** The sheet a fin is cut from, in metres. */
export const TEXTILE_SHEET = { w: 1.2, h: 2.8 }

/**
 * How wide a sheet is kept once decoded.
 *
 * The source is 3401 x 7937 — 27 megapixels, about 108 MB once decoded, which
 * is far too much to hold even one of. So it is decoded AT a resize, and this
 * is the number.
 *
 *   3401  2.83 px/mm   108 MB   the file as delivered
 *   2048  1.71 px/mm    39 MB   here
 *   1024  0.85 px/mm    10 MB   where this started
 *
 * 2048 because the file says outright that these weaves carry real
 * high-frequency detail and lose fidelity when reduced hard, and at 0.85 px/mm
 * a thread was well under a pixel — what survived was the cloth's tone, not its
 * weave. Full resolution is not the answer either: four fabrics on one ceiling
 * would be 430 MB of texture for something seen from four metres.
 *
 * Whatever this is, the sheets have to be BOUNDED — see retainTextiles. At
 * 39 MB each, clicking through a dozen shades would otherwise cost half a
 * gigabyte that nothing ever frees.
 */
export const TEXTILE_PX = 2048

/**
 * How a fin takes its fabric.
 *
 * 'strip'  — the production model, and what a veneer does: the sheet is a
 *            1200 x 2800 panel, a fin is a vertical strip cut out of it, and
 *            successive fins take successive strips. True to scale: 200 mm of
 *            fin shows 200 mm of cloth.
 * 'panel'  — the WHOLE image on every fin, one photograph per fin. Every fin
 *            then looks the same and shows the entire panel, but a 1200 mm
 *            wide sheet squeezed onto a 200 mm fin is a 6:1 squash, so the
 *            weave is no longer at life size.
 *
 * One line to change, because which of these is wanted is a question about the
 * product and not about the code.
 */
export const TEXTILE_FIT = 'panel'

/** Filled by applyTextileManifest(). Live arrays, like CLOUD_MODELS. */
export const TEXTILE_FABRICS = []
export const TEXTILE_GROUPS = []
export const TEXTILE_PANELS = []

let cdnBase = ''

/** Adopt a parsed map. Split from the fetch so Node can drive it too. */
export function applyTextileManifest(doc) {
  TEXTILE_FABRICS.length = 0
  TEXTILE_GROUPS.length = 0
  TEXTILE_PANELS.length = 0
  cdnBase = doc?.meta?.cdnBaseUrl ?? ''
  for (const f of doc?.fabrics ?? []) {
    TEXTILE_FABRICS.push({ id: f.id, name: f.name, groups: [...(f.supportedColorGroups ?? [])] })
  }
  for (const g of doc?.colorGroups ?? []) {
    TEXTILE_GROUPS.push({ id: g.id, name: g.name, shades: (g.shades ?? []).map((s) => ({ ...s })) })
  }
  for (const t of doc?.textures ?? []) {
    // Only entries the generator actually reached. A 404 recorded here would be
    // a swatch that picks nothing, which is worse than a swatch that is absent.
    if (t?.verified && (t.verified.panel !== 200 || t.verified.thumbnail !== 200)) continue
    TEXTILE_PANELS.push({
      key: t.key,
      fabricId: t.fabricId,
      groupId: t.colorGroupId,
      shadeId: t.shadeId,
      hex: t.hex,
      panelUrl: t.panelUrl,
      thumbnailUrl: t.thumbnailUrl,
      panelMB: t.panelMB ?? null,
    })
  }
  return TEXTILE_PANELS.length
}

export async function loadTextileManifest() {
  try {
    const res = await fetch(MAP, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    return applyTextileManifest(await res.json())
  } catch (e) {
    console.warn('Designer Textile map unavailable:', e.message)
    return 0
  }
}

// ---------------------------------------------------------------------------
// what exists
// ---------------------------------------------------------------------------

export const textileReady = () => TEXTILE_PANELS.length > 0

export const fabricIds = () => TEXTILE_FABRICS.map((f) => f.id)

/** The groups a fabric is actually made in, of those that have panels. */
export function groupsFor(fabricId) {
  const has = new Set(TEXTILE_PANELS.filter((p) => p.fabricId === fabricId).map((p) => p.groupId))
  return TEXTILE_GROUPS.filter((g) => has.has(g.id)).map((g) => g.id)
}

/**
 * Every colour group and the shades in it, ACROSS ALL FABRICS.
 *
 * `shadesFor` answers "which shades does this fabric come in", which is the
 * question when the fabric is chosen first. This is the other order: show every
 * colour, then ask which weave. Read off the panels rather than off the group
 * list, so a shade no fabric is actually made in is not offered.
 *
 * Groups with nothing in them are dropped rather than rendered as an empty
 * heading.
 */
export function shadeGroups() {
  return TEXTILE_GROUPS.map((g) => {
    const has = new Set(
      TEXTILE_PANELS.filter((p) => p.groupId === g.id).map((p) => p.shadeId)
    )
    return {
      id: g.id,
      name: g.name,
      shades: g.shades.filter((s) => has.has(s.id)).map((s) => s.id),
    }
  }).filter((g) => g.shades.length)
}

/**
 * The fabrics one shade is actually made in, in the map's own order.
 *
 * All five, for every shade in the supplied map — but read rather than assumed,
 * because the map says outright that it need not be true of a future one.
 */
export function fabricsForShade(shadeId) {
  const has = new Set(
    TEXTILE_PANELS.filter((p) => p.shadeId === shadeId).map((p) => p.fabricId)
  )
  return TEXTILE_FABRICS.filter((f) => has.has(f.id)).map((f) => f.id)
}

/** The shades of one group that this fabric is made in, in the map's order. */
export function shadesFor(fabricId, groupId) {
  const g = TEXTILE_GROUPS.find((x) => x.id === groupId)
  if (!g) return []
  const has = new Set(
    TEXTILE_PANELS.filter((p) => p.fabricId === fabricId && p.groupId === groupId)
      .map((p) => p.shadeId)
  )
  return g.shades.filter((s) => has.has(s.id))
}

export const panelFor = (key) => TEXTILE_PANELS.find((p) => p.key === key) ?? null

export const panelOf = (fabricId, shadeId) =>
  TEXTILE_PANELS.find((p) => p.fabricId === fabricId && p.shadeId === shadeId) ?? null

/** The parts of a key, for a picker that has only the saved value to go on. */
export function splitKey(key) {
  const p = panelFor(key)
  return p ? { fabricId: p.fabricId, groupId: p.groupId, shadeId: p.shadeId } : null
}

/** The whole range as flat swatches — what the generic catalogue path wants. */
export const textileSwatches = () =>
  TEXTILE_PANELS.map((p) => ({ code: p.key, hex: p.hex, thumb: p.thumbnailUrl, textile: p }))

// ---------------------------------------------------------------------------
// the sheets, fetched one at a time
// ---------------------------------------------------------------------------

const sheets = new Map()      // key -> { canvas, tex, hex }
const coming = new Map()      // key -> promise
const listeners = new Set()
let version = 0

/**
 * Panels that are on disk, and should be read from there rather than the CDN.
 *
 * Keyed the way everything else here is, by panel key. Fly ships ten FB3 shades
 * in public/textures/fly and registers them at boot; a local file is faster, has
 * no CORS to satisfy and works with the network off, and it is the SAME panel —
 * same shade, same 3401 x 7937 sheet — so anything else wearing one of those ten
 * gets the local copy too, which is the right answer rather than a side effect.
 *
 * Registered rather than hard-coded, because this module knows about fabric and
 * nothing about products.
 */
const local = new Map()

export function registerLocalPanels(entries) {
  for (const [key, url] of entries) if (key && url) local.set(key, url)
  return local.size
}

export const localPanelUrl = (key) => local.get(key) ?? null

export function subscribeTextile(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Bumped every time a sheet lands, so a placed set can rebuild itself.
 *
 * A panel finishing its download is not a parameter change, but it does change
 * what the fins should sample — the same shape Colour Core already uses, and
 * without it a set stays on its flat shade colour until something else happens
 * to re-render it.
 */
export const textileVersion = () => version

export const textileSheet = (key) => sheets.get(key) ?? null

/**
 * Fetch one sheet and turn it into a texture a fin can be cut from.
 *
 * Decoded AT A RESIZE rather than at full size: `createImageBitmap` with a
 * resizeWidth never materialises the 27 megapixels, where an <img> would hold
 * 108 MB for as long as it took to draw it once.
 *
 * Then rotated a quarter turn, so the weave runs along U and a fin maps as
 * repeat.x = length / sheet height — exactly what realWoodFinMaterial already
 * does with a veneer, which is why a textile fin needs no new maths.
 */
export function loadTextileSheet(key) {
  if (sheets.has(key)) return Promise.resolve(sheets.get(key))
  if (coming.has(key)) return coming.get(key)
  const panel = panelFor(key)
  if (!panel) return Promise.resolve(null)

  const promise = (async () => {
    // A local copy wins where there is one — see registerLocalPanels. Same
    // image, no round trip.
    //
    // crossOrigin is not set on the CDN path because it goes through fetch and
    // the CDN answers Access-Control-Allow-Origin: * — without that the canvas
    // would be tainted and nothing could be read back out of it. A local file is
    // same-origin and needs no mode at all.
    const url = local.get(key) ?? panel.panelUrl
    const res = local.has(key) ? await fetch(url) : await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(`${res.status} fetching ${panel.key}`)
    const bmp = await createImageBitmap(await res.blob(), {
      resizeWidth: TEXTILE_PX, resizeQuality: 'high',
    })
    const W = bmp.height   // the sheet is portrait; the canvas is its rotation
    const H = bmp.width
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.translate(W, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(bmp, 0, 0, H, W)
    bmp.close()

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true

    const built = { canvas, tex, hex: panel.hex, key }
    sheets.set(key, built)
    version += 1
    listeners.forEach((l) => l())
    return built
  })()

  coming.set(key, promise)
  promise.catch((e) => {
    console.warn(`[textile] ${key}:`, e.message)
    coming.delete(key)
  })
  return promise
}

/** How many sheets are decoded right now — reported rather than guessed at. */
export const textileSheetsLoaded = () => sheets.size

/** Roughly what the decoded sheets are costing, in megabytes of RGBA. */
export const textileMemoryMB = () => {
  let px = 0
  for (const s of sheets.values()) px += s.canvas.width * s.canvas.height
  return +(px * 4 / 1e6).toFixed(1)
}

/**
 * Keep only the sheets these keys name, and free the rest.
 *
 * A sheet is 39 MB decoded and nothing here knows when one stops being worn, so
 * without this a session that tried a dozen shades would hold half a gigabyte
 * for the rest of its life. The app calls this with what its placed sets
 * actually wear.
 *
 * Safe to dispose because a fin holds a CLONE of the texture and a set rebuilds
 * — and is disposed — whenever its finish changes. A key that is still wanted
 * is never in the list, and one that is dropped is simply re-fetched if it
 * comes back.
 */
export function retainTextiles(keys) {
  const keep = new Set(keys)
  for (const [k, sheet] of [...sheets]) {
    if (keep.has(k)) continue
    sheet.tex.dispose()
    sheets.delete(k)
    coming.delete(k)
  }
  return sheets.size
}

// A dev handle on THIS module instance, the same way store.js exposes the
// store. A dynamic import from the console gets a different instance under
// Vite, so without this there is no way to ask the running app what it holds.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__textiles = {
    panels: TEXTILE_PANELS, sheets, loaded: textileSheetsLoaded, version: textileVersion,
  }
}
