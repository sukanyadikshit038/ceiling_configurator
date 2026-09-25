// Layouts you saved yourself.
//
// ---------------------------------------------------------------------------
// WHY THESE ARE NOT THE PRESETS IN presets.js
// ---------------------------------------------------------------------------
//
// A built-in preset is CODE: a product() recipe and an arrange() that computes
// where things go from the grid it is handed. That is what lets "Hexagon field"
// work in a boardroom and a sports hall without being written twice.
//
// Nobody can type a function into a panel, so a saved layout is the other kind
// of thing: a SNAPSHOT of a ceiling that existed. It carries every set exactly
// where it was put, which is the point — it is your ceiling, not a rule that
// might reproduce it — and the price is that it cannot adapt to a room it was
// not laid out in. Applying one into a smaller ceiling drops what will not fit
// and says how many, the same answer an oversized built-in preset already
// gives.
//
// ---------------------------------------------------------------------------
// WHAT ONE IS
// ---------------------------------------------------------------------------
//
// { id, name, savedAt, doc } where `doc` is exactly what toJSON() writes — the
// same versioned document the Save button downloads and a share link carries.
// Reusing it rather than inventing a third shape means a saved layout is read
// by the code that already reads documents, is already covered by the
// round-trip guards, and carries its own schema version if the format moves.
//
// The doc also records the room and zone it was saved in. That is NOT applied
// on use — a saved layout lands in the ceiling you are looking at — but it is
// what lets the panel say "saved in a 9.0 x 7.0 m zone" when the current one is
// smaller, so a half-placed result is explicable instead of mysterious.
//
// ---------------------------------------------------------------------------
// WHERE THEY LIVE
// ---------------------------------------------------------------------------
//
// localStorage, beside the session. Nothing is sent anywhere. The cost is that
// they belong to this browser: another machine has its own, and clearing site
// data takes them with it — which is what export/import is for, and why the
// panel says so rather than leaving somebody to find out.

const KEY = 'univ.layouts.v1'
const FORMAT = 'univ-layouts-1'

/** A live array, like FABRICS and CLOUD_MODELS. Read it, never write it. */
export const LAYOUTS = []

const listeners = new Set()
let version = 0

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * The snapshot React watches.
 *
 * NOT `LAYOUTS` itself. The array is mutated in place, so its identity never
 * changes, and useSyncExternalStore — which compares with Object.is — would
 * be told the list is the same after every save, delete and import. A counter
 * is stable between changes and different across one, which is what the hook
 * actually asks for.
 */
export const layoutsVersion = () => version

const announce = () => { version += 1; for (const fn of listeners) fn() }

/**
 * Every storage call is wrapped.
 *
 * localStorage throws rather than returning null in a private window, with site
 * data blocked, and when the origin's quota is full. A layout list that cannot
 * be saved is a disappointment; a panel that cannot render because reading it
 * threw is a broken app.
 */
function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.layouts) ? parsed.layouts : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ format: FORMAT, layouts: list }))
    return true
  } catch {
    return false
  }
}

/** A layout is only as good as its document. */
const valid = (l) => !!l
  && typeof l.name === 'string'
  && !!l.doc
  && Array.isArray(l.doc.items)

const adopt = (list) => {
  LAYOUTS.length = 0
  for (const l of list) if (valid(l)) LAYOUTS.push(l)
  return LAYOUTS.length
}

const id = () => `ly_${Math.random().toString(36).slice(2, 10)}`

/** Read what this browser has. Call once at startup. */
export function loadLayouts() {
  const n = adopt(read())
  announce()
  return n
}

/**
 * A name nobody else in the list has.
 *
 * Silently overwriting a layout because its name matched is the kind of data
 * loss that is only noticed later, so a clash becomes "Kitchen (2)" instead.
 */
export function uniqueName(want, list = LAYOUTS, exceptId = null) {
  // AN EXISTING SUFFIX IS STRIPPED FIRST. Numbering "Studio A (2)" as a base
  // of its own gives "Studio A (2) (2)", and re-importing the same file
  // compounds it — measured, three rounds produced "Studio A (2) (2) (2)".
  // The suffix is bookkeeping, not part of anybody's name for the layout.
  const base = ((want || '').trim() || 'Untitled layout').replace(/ \(\d+\)$/, '')
  const taken = new Set(list.filter((l) => l.id !== exceptId).map((l) => l.name))
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const next = `${base} (${n})`
    if (!taken.has(next)) return next
  }
  return `${base} (${Date.now()})`
}

/** Save a document under a name. Returns the layout, or null if storage refused. */
export function saveLayout(name, doc) {
  if (!doc || !Array.isArray(doc.items) || !doc.items.length) return null
  const layout = {
    id: id(),
    name: uniqueName(name),
    savedAt: new Date().toISOString(),
    doc,
  }
  const next = [...LAYOUTS, layout]
  if (!write(next)) return null
  adopt(next)
  announce()
  return layout
}

export function renameLayout(layoutId, name) {
  const next = LAYOUTS.map((l) => (l.id === layoutId
    ? { ...l, name: uniqueName(name, LAYOUTS, layoutId) }
    : l))
  if (!write(next)) return false
  adopt(next)
  announce()
  return true
}

export function deleteLayout(layoutId) {
  const next = LAYOUTS.filter((l) => l.id !== layoutId)
  if (next.length === LAYOUTS.length) return false
  if (!write(next)) return false
  adopt(next)
  announce()
  return true
}

export const getLayout = (layoutId) => LAYOUTS.find((l) => l.id === layoutId) ?? null

/** The whole list as a file's worth of text. */
export function exportLayouts(list = LAYOUTS) {
  return JSON.stringify({ format: FORMAT, savedAt: new Date().toISOString(), layouts: list }, null, 2)
}

/**
 * Take in a file of layouts.
 *
 * MERGES rather than replaces: importing is how a second machine catches up,
 * and replacing would delete whatever that machine had saved of its own.
 * Everything arrives under a fresh id and a name that does not collide, so
 * importing the same file twice gives you copies rather than silent overwrites.
 */
export function importLayouts(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('not a layouts file')
  }
  const incoming = Array.isArray(parsed?.layouts) ? parsed.layouts : null
  if (!incoming) throw new Error('not a layouts file')

  const next = [...LAYOUTS]
  let added = 0
  let skipped = 0
  for (const l of incoming) {
    if (!valid(l)) { skipped++; continue }
    next.push({
      id: id(),
      name: uniqueName(l.name, next),
      savedAt: l.savedAt || new Date().toISOString(),
      doc: l.doc,
    })
    added++
  }
  if (!write(next)) throw new Error('this browser refused to store them')
  adopt(next)
  announce()
  return { added, skipped }
}

/** The zone a layout was laid out in, for the panel to compare against. */
export function zoneOf(layout) {
  const c = layout?.doc?.ceiling
  if (!c) return null
  return { w: Number(c.width) || 0, l: Number(c.length) || 0 }
}
