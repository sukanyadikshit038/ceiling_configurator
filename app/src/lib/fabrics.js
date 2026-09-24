// User-uploaded fabric swatches, stored in the viewer's own browser.
//
// The app is served as static files from S3 (BRIEF §4), so there is no server
// to receive an upload. IndexedDB is used instead: a fabric a user adds appears
// under Designer Textiles for them, on this machine, in this browser, and is
// never sent anywhere.
//
// The consequences are worth being explicit about, because they are the reason
// this file is small:
//   - a fabric is not shared with anyone else, and does not travel with an
//     exported layout;
//   - clearing site data removes it;
//   - a layout referencing a missing fabric falls back to the family's first
//     swatch rather than failing (see lib/textures.js).
//
// Fabrics that everyone should see belong in the repo as files, the way the
// Wood Classic veneer photos already are. When api.univicoustic.com grows an
// upload endpoint (BRIEF §3.2), this module is the only thing that changes.

const DB_NAME = 'univicoustic-ceiling'
const DB_VERSION = 1
const STORE = 'fabrics'

export const MAX_BYTES = 8 * 1024 * 1024

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('could not open the fabric store'))
  })
  return dbPromise
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const out = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(out?.result ?? out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('fabric write aborted'))
  }))
}

// ---------------------------------------------------------------------------
// registry — kept in memory so React can render synchronously
// ---------------------------------------------------------------------------

/** Loaded fabrics: { id, name, scale, type, blob }. Live array. */
export const FABRICS = []

const listeners = new Set()
const notify = () => listeners.forEach((l) => l())

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const getFabric = (id) => FABRICS.find((f) => f.id === id) ?? null

/**
 * Object URLs for the stored blobs, minted once and reused. Textures load from
 * these, so they must outlive the material — they are revoked only on delete.
 */
const urls = new Map()

export function fabricURL(id) {
  if (urls.has(id)) return urls.get(id)
  const f = getFabric(id)
  if (!f?.blob) return null
  const url = URL.createObjectURL(f.blob)
  urls.set(id, url)
  return url
}

function forgetURL(id) {
  const url = urls.get(id)
  if (url) URL.revokeObjectURL(url)
  urls.delete(id)
}

/** Read every stored fabric into memory. Safe to call more than once. */
export async function loadFabrics() {
  try {
    const all = await tx('readonly', (store) => store.getAll())
    FABRICS.length = 0
    FABRICS.push(...(all ?? []))
  } catch (e) {
    // A private window or a browser with site data blocked throws here. The
    // app is fully usable without user fabrics, so this is a warning.
    console.warn('[fabrics] unavailable:', e.message)
    FABRICS.length = 0
  }
  notify()
  return FABRICS
}

/**
 * Store a fabric image.
 * `scale` is the physical size of one tile in metres, which is what turns an
 * image into a material at the right real-world size.
 */
export async function addFabric(file, { name, scale = 0.5 } = {}) {
  if (!file) throw new Error('no file')
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('needs a PNG, JPEG or WebP image')
  if (file.size > MAX_BYTES) throw new Error(`larger than ${MAX_BYTES / 1024 / 1024} MB — downscale it first`)

  const record = {
    id: 'fab_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    name: String(name || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'Untitled').slice(0, 60),
    scale: Math.min(3, Math.max(0.1, Number(scale) || 0.5)),
    type: file.type,
    bytes: file.size,
    blob: file,
  }
  await tx('readwrite', (store) => store.put(record))
  FABRICS.push(record)
  notify()
  return record
}

export async function removeFabric(id) {
  await tx('readwrite', (store) => store.delete(id))
  const i = FABRICS.findIndex((f) => f.id === id)
  if (i >= 0) FABRICS.splice(i, 1)
  forgetURL(id)
  notify()
}

export async function renameFabric(id, name) {
  const f = getFabric(id)
  if (!f) return null
  f.name = String(name).slice(0, 60)
  await tx('readwrite', (store) => store.put(f))
  notify()
  return f
}
