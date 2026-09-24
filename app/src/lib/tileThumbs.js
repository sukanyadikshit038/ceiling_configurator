// Small pictures of the tile panels, for the picker.
//
// The supplied panels are 7205 px square: 2.7 MB for a wood, up to 14 MB for a
// perforation, 66.7 MB across the twenty of them. Using those as the swatch
// images would download the entire range to draw twenty chips the size of a
// fingernail — so each one is decoded once at THUMB_PX and kept.
//
// Kept in localStorage as well as in memory, because the cost is the DOWNLOAD,
// not the decode, and a reload should not pay it again. Twenty chips at 96 px
// come to about 60 KB of JPEG, which sits inside the quota with room to spare;
// the full-size originals never go near it.
//
// The right fix is smaller source files — a 600 mm panel does not need 52
// megapixels — and when those arrive this module keeps working and simply
// finishes sooner.

import { TILE_TEX } from './tiles.js'

const THUMB_PX = 96
const STORE_KEY = 'univ.tileThumbs.v1'
const BASE = import.meta.env?.BASE_URL ?? '/'

const thumbs = new Map() // file -> dataURL
const failed = new Set()
const listeners = new Set()
const notify = () => listeners.forEach((l) => l())

// ---------------------------------------------------------------------------
// the browser's copy
// ---------------------------------------------------------------------------

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return
    for (const [file, url] of Object.entries(JSON.parse(raw))) thumbs.set(file, url)
  } catch {
    // A corrupt or unreadable entry is not worth reporting: the pictures are
    // rebuilt from the images, so the worst case is doing the work again.
  }
}

let writePending = null
function writeStore() {
  // Coalesced: warming a range writes twenty times in a few seconds otherwise,
  // and each write serialises the whole map.
  clearTimeout(writePending)
  writePending = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(thumbs)))
    } catch {
      // Over quota, or storage disabled. Nothing to do about it and nothing
      // lost — the memory cache still serves this session.
    }
  }, 400)
}

readStore()

// ---------------------------------------------------------------------------
// making one
// ---------------------------------------------------------------------------

async function makeThumb(file) {
  const url = `${BASE}${TILE_TEX}${file.split('/').map(encodeURIComponent).join('/')}`
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error(String(res.status))
  // WIDTH only, so the height follows the panel. Asking for both made every
  // chip square, and a 1200 x 600 panel is 2:1 — its grain came out at half
  // width, so the two sizes of the same code looked like different woods.
  const bmp = await createImageBitmap(await res.blob(), {
    resizeWidth: THUMB_PX, resizeQuality: 'high',
  })
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  canvas.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.72)
}

// ---------------------------------------------------------------------------
// the queue
// ---------------------------------------------------------------------------
//
// ONE at a time, deliberately. Twenty parallel fetches of a 2.7 MB file would
// saturate the connection and hold up the composite the 3D view is waiting for,
// which is the picture that actually matters. Sequential means the chips fill
// in over a few seconds and everything else stays responsive.

const queue = []
let running = false

async function drain() {
  if (running) return
  running = true
  while (queue.length) {
    const file = queue.shift()
    if (thumbs.has(file) || failed.has(file)) continue
    try {
      thumbs.set(file, await makeThumb(file))
      writeStore()
      notify()
    } catch (e) {
      // Marked failed rather than retried: a missing file will still be missing
      // next time round, and a queue that retries is a queue that never drains.
      failed.add(file)
      console.warn('[tiles] thumbnail', file, e.message)
    }
  }
  running = false
}

/** Ask for pictures of these panels. Returns at once; they arrive as they land. */
export function warmThumbs(files) {
  let added = 0
  for (const f of files) {
    if (!f || thumbs.has(f) || failed.has(f) || queue.includes(f)) continue
    queue.push(f)
    added++
  }
  if (added) drain()
  return added
}

export const thumbFor = (file) => thumbs.get(file) ?? null

export function subscribeThumbs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** A version stamp, so a React subscriber has something stable to compare. */
export const thumbVersion = () => thumbs.size + failed.size * 1000
