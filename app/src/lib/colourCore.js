// Colour Core Fabric — real photographed panels, served from CloudFront.
//
// The map in public/colour-core-textures.json pairs 3 weave structures with 19
// colours: 57 panels, each a 3402 x 7937 JPEG of 3-9 MB. That is the whole
// difficulty. A decoded panel costs about 103 MB of GPU memory, so the rule
// here is ONE full-resolution panel alive at a time:
//
//   - panels are fetched only when a surface actually asks for one
//   - the bytes are held as a blob we own, decoded to an ImageBitmap, and
//     wrapped in exactly one THREE.Texture — never cloned, because cloning a
//     texture uploads the image to the GPU a second time
//   - the outgoing panel is released only once its replacement has decoded, so
//     a surface never blanks or flickers mid-swap
//
// Thumbnails are the other half. At 210 x 210 and 28 KB, served immutable for a
// year, they are cheap enough to keep several of, so every Colour Core surface
// renders from its thumbnail immediately and sharpens to the panel when one
// arrives. That is what makes "no flicker" mean "never the wrong colour
// either", rather than "the previous colour until the download lands".

import * as THREE from 'three'
import { applyColourCoreSwatches } from './catalog.js'
import { maxAnisotropy } from './gpu.js'

const BASE = import.meta.env?.BASE_URL ?? '/'

/** Filled by loadColourCore(). Live objects, like ROOMS and MODELS. */
export const COLOUR_CORE = {
  ready: false,
  cdn: '',
  structures: [], // { id, name }
  colors: [],     // { id, name, hex }
  textures: [],   // { key, structureId, structureName, colorId, colorName, hex, textureUrl, thumbnailUrl }
}

const byKey = new Map()

/** The physical panel these photographs are of, in millimetres. */
export const PANEL_MM = { w: 1200, l: 2800 }

/**
 * How wide a panel is kept, in pixels, once decoded.
 *
 * The photographs are 3402 x 7937 — 27 megapixels for a fin that gets a few
 * hundred pixels of face. Handing that to the GPU whole does not buy detail; it
 * buys a false pattern. Minifying that far is done by averaging blocks of
 * texels, which is a crude low-pass, and what it leaves behind beats against
 * the pixel grid as a shimmer that is in neither the cloth nor the photograph.
 *
 * Measured on this GPU, through the real sampler, at the crop and the shapes a
 * fin actually gets — the false pattern as a multiple of the cloth's own
 * detail, averaged over two colours and three distances, lower being better:
 *
 *                     as-is    1024    1536    2048
 *     FB-CC-01         4.27    2.86    2.55    3.30
 *     FB-CC-02         4.66    4.28    3.52    5.05
 *     FB-CC-03         5.43    3.24    2.93    3.69
 *
 * FB-CC-03 is the one that shows on screen, and the table says why: it makes
 * the most mess AND its cloth is the smoothest at distance, so there is the
 * least real texture for the mess to hide behind. At the worst distance its
 * false pattern measured 6.8x the real weave detail, against 2-3x for the
 * other two.
 *
 * 1536 is not a compromise between 1024 and 2048 — 2048 is WORSE than 1024 for
 * every structure. Whether a weave aliases depends on how its thread pitch
 * lines up with the sampling grid, not on how much of it there is, so "bigger
 * is safer" is simply false here. 1536 is the best of the three measured.
 *
 * Also costs a quarter of the memory: 108 MB a panel becomes about 29 MB.
 */
export const PANEL_PX = 1536

/**
 * The largest texture worth trying to upload, on the pessimistic side.
 *
 * GL_MAX_TEXTURE_SIZE is 16384 on desktop hardware and commonly 8192 elsewhere.
 * A texture over the limit is not slow, it is REJECTED — and the ombré panels
 * are 7382 x 17126, past even the generous figure. So the cap is applied to the
 * longest side, not just the width: an asset can be narrow and still far too
 * tall to upload.
 */
export const MAX_GPU_PX = 8192

/**
 * The pixel size a JPEG declares, read from its header.
 *
 * Wanted before decoding, to avoid asking for a resize that would UPSCALE a
 * smaller asset — the whole point is to hand the GPU less, not to inflate a
 * file that was already sensible. Reading the header costs a few kilobytes;
 * decoding twice to find out would cost the memory this exists to avoid.
 */
export function jpegSize(buffer) {
  const b = new DataView(buffer)
  if (b.byteLength < 4 || b.getUint8(0) !== 0xff || b.getUint8(1) !== 0xd8) return null
  let i = 2
  while (i < b.byteLength - 9) {
    if (b.getUint8(i) !== 0xff) { i++; continue }
    const marker = b.getUint8(i + 1)
    // padding, and the markers that carry no length
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    const len = b.getUint16(i + 2)
    // a frame header: SOF0-SOF15, less the three that are not frames
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: b.getUint16(i + 7), height: b.getUint16(i + 5) }
    }
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

/** Just the width, for callers that only care about that. */
export const jpegWidth = (buffer) => jpegSize(buffer)?.width ?? null

/**
 * How far into a file the frame header might be.
 *
 * Not a guess that can be got wrong quietly: the sizes are tried in turn until
 * the header is found or the file runs out. It matters because the ombré panels
 * carry an embedded colour profile in FOUR 64 KB APP2 segments, plus EXIF and a
 * Photoshop block, which puts their frame header past 272 KB. A single 64 KB
 * peek read none of it, reported "size unknown", and so let a 7382 x 17126
 * image through to a GPU that will not take anything over 16384.
 */
const HEADER_TRIES = [65536, 524288, Infinity]

export async function blobImageSize(blob) {
  const soi = new DataView(await blob.slice(0, 2).arrayBuffer())
  if (soi.byteLength < 2 || soi.getUint8(0) !== 0xff || soi.getUint8(1) !== 0xd8) return null
  for (const bytes of HEADER_TRIES) {
    const take = Math.min(bytes, blob.size)
    const size = jpegSize(await blob.slice(0, take).arrayBuffer())
    if (size) return size
    if (take >= blob.size) break
  }
  return null
}

/**
 * How to decode a panel of a given size: resized down, or left alone.
 *
 * Two separate reasons to shrink, and the stronger one wins:
 *
 *   quality — a panel wider than PANEL_PX aliases when minified onto a fin,
 *             which is what PANEL_PX is measured for.
 *   possible — a panel longer than MAX_GPU_PX on any side cannot be uploaded at
 *             all. The ombré range is 7382 x 17126: shrinking its WIDTH to 1536
 *             happens to bring the height to about 3560 as well, but a narrow,
 *             very tall asset would pass a width-only test and still be
 *             rejected by the driver.
 *
 * Split out as a plain function so the decision is checkable without a browser
 * — createImageBitmap does not exist in Node, but this does.
 */
export function panelDecodeOptions(size) {
  const { width, height } = typeof size === 'number' ? { width: size } : (size ?? {})
  if (!width) return null
  const longest = Math.max(width, height ?? 0)
  // Both caps expressed as a WIDTH, then the smaller wins. Scaling by a ratio
  // and rounding afterwards is what you would write first, and it is wrong at
  // the edge: rounding the width up pushes the height back over the limit, so
  // a 1000 x 20000 panel came out at 8200 against a cap of 8192 and would still
  // have been refused.
  const forQuality = width > PANEL_PX ? PANEL_PX : width
  const toFitGpu = longest > MAX_GPU_PX ? Math.floor((width * MAX_GPU_PX) / longest) : width
  const target = Math.min(forQuality, toFitGpu)
  if (target >= width) return null
  // height is left out on purpose: given one dimension the browser keeps the
  // aspect ratio, so a re-export at a different shape still lands right
  return { resizeWidth: Math.max(1, target), resizeQuality: 'high' }
}

export const getEntry = (key) => byKey.get(key) ?? null

/**
 * Add panels to the one slot, so a sibling range can use it.
 *
 * Colour Core Ombré is a second published range on the same CDN with the same
 * decode and the same memory problem. Registering its panels HERE rather than
 * giving it a slot of its own is what keeps "one panel on the GPU" true across
 * both ranges instead of one each. Keys are distinct between the two, so a
 * single map serves both.
 */
export function registerPanels(entries) {
  for (const e of entries ?? []) if (e?.key && e.textureUrl) byKey.set(e.key, e)
  return byKey.size
}

/** Every structure offered for one colour, in manifest order. */
export const structuresFor = (colorId) =>
  COLOUR_CORE.textures.filter((t) => t.colorId === colorId)

/**
 * Swatches for the catalogue, colour-major so the first entry is the first
 * colour in its first structure — which is what the finish picker opens on.
 */
export function catalogueSwatches() {
  const out = []
  for (const c of COLOUR_CORE.colors) {
    for (const t of structuresFor(c.id)) {
      out.push({ code: t.key, label: `${t.colorName} · ${t.structureName}`, hex: t.hex })
    }
  }
  return out
}

/**
 * Adopt a parsed panel map. Split from the fetch so the same path can be driven
 * from Node, which is how the suite checks the map without a browser.
 */
export function applyColourCoreManifest(data) {
  COLOUR_CORE.cdn = data?.meta?.cdnBaseUrl ?? ''
  COLOUR_CORE.structures = data?.structures ?? []
  COLOUR_CORE.colors = data?.colors ?? []
  COLOUR_CORE.textures = data?.textures ?? []
  byKey.clear()
  for (const t of COLOUR_CORE.textures) byKey.set(t.key, t)
  COLOUR_CORE.ready = COLOUR_CORE.textures.length > 0
  applyColourCoreSwatches(catalogueSwatches())
  return COLOUR_CORE.textures.length
}

export async function loadColourCore() {
  try {
    const res = await fetch(`${BASE}colour-core-textures.json`)
    if (!res.ok) return null
    const data = await res.json()
    applyColourCoreManifest(data)
    return data
  } catch {
    return null // offline, or the map is not published — the family falls back
  }
}

// ---------------------------------------------------------------------------
// subscription — a texture arriving is not a parameter change, so the views
// need telling that what they built is now out of date
// ---------------------------------------------------------------------------

const listeners = new Set()
let version = 0

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const getVersion = () => version
const notify = () => { version++; listeners.forEach((fn) => fn()) }

// ---------------------------------------------------------------------------
// thumbnails — small, cached, several at a time
// ---------------------------------------------------------------------------

const thumbs = new Map() // key -> THREE.Texture
const thumbLoader = new THREE.TextureLoader()
thumbLoader.setCrossOrigin('anonymous')

/**
 * How a woven panel has to be filtered.
 *
 * A weave is a regular high-frequency pattern on a long thin surface seen at a
 * grazing angle — the exact recipe for moiré, where the pattern beats against
 * the pixel grid and produces fringes that are in neither the cloth nor the
 * photograph. Mipmaps deal with the uniform case; the grazing angle is what
 * needs anisotropy, and the useful amount is whatever the GPU offers rather
 * than the 4 this used to ask for.
 */
function filterAsFabric(tex) {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter // trilinear, not nearest-mip
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = maxAnisotropy()
  return tex
}

export function thumbTexture(key) {
  const entry = byKey.get(key)
  if (!entry) return null
  if (thumbs.has(key)) return thumbs.get(key)
  const tex = thumbLoader.load(entry.thumbnailUrl, () => notify(), undefined, () => thumbs.delete(key))
  filterAsFabric(tex)
  thumbs.set(key, tex)
  return tex
}

// ---------------------------------------------------------------------------
// the panels held on the GPU
// ---------------------------------------------------------------------------

/**
 * How much decoded panel to keep, in megabytes.
 *
 * This used to be ONE panel, full stop, and that was right when a panel decoded
 * to 108 MB — holding two was most of a laptop's texture memory. Downsampling
 * on the way in (see PANEL_PX) took a panel to about 29 MB, so the budget below
 * holds four of them for close to what a single panel used to cost.
 *
 * One slot was not merely tight, it was WRONG once a ceiling could carry two
 * designs at once. Each set asked for its own panel every frame; each request
 * evicted the other's; neither ever settled. Measured, the two took the slot in
 * turn about every four seconds — a set going black, being repainted, and going
 * black again, for as long as you watched. A cache of one is a cache that
 * thrashes the moment anything wants two.
 *
 * Beyond four distinct designs on one ceiling it will thrash again, and the
 * honest fix at that point is smaller assets rather than a bigger number here.
 */
export const PANEL_BUDGET_BYTES = 120 * 1024 * 1024

const panels = new Map()   // key -> { texture, bytes, used }
const coming = new Map()   // key -> AbortController
let clock = 0

/** The panel most recently asked for, or null. Handy in tests and messages. */
export const livePanelKey = () => {
  let best = null
  for (const [key, p] of panels) if (!best || p.used > panels.get(best).used) best = key
  return best
}
export const hasPanel = (key) => panels.has(key)
export const panelPending = (key) => coming.has(key)
/** Every panel currently held, and what they cost. For tests and diagnostics. */
export const panelsHeld = () => [...panels.entries()].map(([key, p]) => ({ key, bytes: p.bytes }))

/** Free a panel's texture, the bitmap behind it, and any second view of it. */
function release(held) {
  if (!held) return
  // A caller may have cloned the texture for a mirrored view; a clone shares
  // the source, so it has to go at the same time or it points at freed memory.
  held.texture.userData?.mirrored?.dispose?.()
  held.texture.image?.close?.() // the decoded bitmap, not just the GPU copy
  held.texture.dispose()
}

/**
 * Which panels to let go of, least recently asked-for first, to meet a budget.
 *
 * A plain function over plain data so the policy can be checked without a GPU,
 * a network or a browser — the thing it replaces was a loop over live textures
 * and could only be exercised by watching it misbehave.
 *
 * Never drops the last one. A cache of zero would re-fetch on the next frame,
 * which is the thrash this exists to end, only worse.
 */
export function overBudget(held, budget) {
  const order = [...held].sort((a, b) => a.used - b.used)
  let total = order.reduce((sum, p) => sum + p.bytes, 0)
  const drop = []
  for (const p of order) {
    if (total <= budget || order.length - drop.length <= 1) break
    drop.push(p.key)
    total -= p.bytes
  }
  return drop
}

/** Apply that policy to what is actually held. */
function evict() {
  const held = [...panels.entries()].map(([key, p]) => ({ key, bytes: p.bytes, used: p.used }))
  for (const key of overBudget(held, PANEL_BUDGET_BYTES)) {
    release(panels.get(key))
    panels.delete(key)
  }
}

/**
 * Ask for a panel. Returns its texture if it is already in hand, otherwise null
 * while it loads and the caller shows whatever it shows meanwhile.
 *
 * Asking for a second panel no longer displaces the first: they are held
 * together up to the budget, and only the least recently asked-for is let go.
 */
export function requestPanel(key) {
  const entry = byKey.get(key)
  if (!entry) return null

  const held = panels.get(key)
  if (held) { held.used = ++clock; return held.texture }
  if (coming.has(key)) return null // already on its way

  const controller = new AbortController()
  coming.set(key, controller)

  fetch(entry.textureUrl, { signal: controller.signal, mode: 'cors' })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then(async (blob) => {
      // Shrink on the way in, with the browser's own resampler — a proper
      // filter, applied once, in place of the GPU averaging blocks of a huge
      // photograph every frame. See PANEL_PX for the measurements, and
      // MAX_GPU_PX for the panels that cannot be uploaded at all otherwise.
      const opts = panelDecodeOptions(await blobImageSize(blob))
      return opts ? createImageBitmap(blob, opts) : createImageBitmap(blob)
    })
    .then((bitmap) => {
      coming.delete(key)
      // asked for again while decoding, and already answered — drop this one
      if (panels.has(key)) { bitmap.close(); return }
      const tex = filterAsFabric(new THREE.Texture(bitmap))
      tex.needsUpdate = true
      panels.set(key, { texture: tex, bytes: bitmap.width * bitmap.height * 4, used: ++clock })
      evict()
      notify()
    })
    .catch((e) => {
      coming.delete(key)
      if (e?.name === 'AbortError') return
      console.warn('Colour Core panel failed:', key, e)
    })
  return null
}

/**
 * The map for one surface: the live panel if this key holds the slot, else the
 * thumbnail, else nothing and the caller paints the flat colour.
 *
 * The crop is true-scale — the panel's long axis runs along the fin, and a
 * catalogue fin is at most 2780 mm against a 2800 mm panel, so nothing ever
 * wraps and no seam is possible.
 *
 * The panel texture is shared, never cloned, so repeat and offset are set on
 * the one instance. Two sets of different sizes wearing the same finish at once
 * therefore share the larger one's crop rather than costing a second 103 MB
 * upload — the price of holding only one panel.
 */
/**
 * Crop a panel to one fin, at the size the cloth really is.
 *
 * The photograph is portrait — 3402 x 7937 for a 1200 x 2800 mm panel — so its
 * U axis is the 1200 mm side and its V axis the 2800 mm side. A fin's UVs run
 * the other way: U along the length, V down the face. Mapping straight across
 * therefore laid the panel's 1200 mm width along an 1800 mm fin and drew the
 * weave about 2.3x too coarse.
 *
 * Turning the texture a quarter turn puts the panel's long axis along the fin,
 * which is also the only orientation where nothing has to repeat: the longest
 * catalogue fin is 2780 mm against 2800 mm of cloth.
 *
 * With rotation the scales swap, because three applies scale before rotation —
 * repeat.x ends up governing what V samples and repeat.y what U samples. An
 * offset of zero then lands a centred crop, which is why none is set.
 */
export function cropToFin(tex, lengthMm, depthMm) {
  tex.center.set(0.5, 0.5)
  tex.rotation = Math.PI / 2
  tex.repeat.set(
    Math.min(1, depthMm / PANEL_MM.w),  // across the fin, off the 1200 mm side
    Math.min(1, lengthMm / PANEL_MM.l), // along the fin, off the 2800 mm side
  )
  tex.offset.set(0, 0)
  tex.needsUpdate = true
  return tex
}

export function surfaceTexture(key, { lengthMm = PANEL_MM.l, depthMm = PANEL_MM.w } = {}) {
  const entry = byKey.get(key)
  if (!entry) return null

  const panel = requestPanel(key)
  if (panel) {
    cropToFin(panel, lengthMm, depthMm)
    return { texture: panel, shared: true }
  }

  const thumb = thumbTexture(key)
  if (!thumb) return null
  // The thumbnail is a square crop of the panel, so it carries no usable scale;
  // it stands in for colour and weave until the panel lands, stretched to fit.
  return { texture: thumb, shared: true }
}
