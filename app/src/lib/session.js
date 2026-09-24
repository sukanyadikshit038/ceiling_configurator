// The ceiling you were working on, still there after a reload.
//
// ---------------------------------------------------------------------------
// WHY THE BROWSER'S STORAGE AND NOT THE ADDRESS BAR
// ---------------------------------------------------------------------------
//
// A configuration already travels in a URL — see lib/share.js — but that link
// is built ON DEMAND, by Copy link, and the address bar is left alone while you
// work. Writing the hash on every placement would undo that decision, put a
// history entry behind every click, and re-encode the whole document each time
// a panel moved a cell.
//
// So this is a quiet local save: nothing in the URL, nothing sent anywhere, and
// it survives a reload, a crash and closing the tab.
//
// ---------------------------------------------------------------------------
// WHAT IT KEEPS
// ---------------------------------------------------------------------------
//
// The WHOLE document — room, ceiling zone, obstruction mask, groups, every
// placed set. A link deliberately drops the room and the mask because it is
// being handed to somebody else; this is your own session coming back to you,
// so there is nothing to trim.
//
// And the BRUSH, which the document does not carry. Restoring twenty panels
// under a blank panel of fields is the same fault as opening a shared link into
// one: the ceiling plainly answers questions the sidebar is still asking.
//
// And the BACKGROUND, for the same reason: it is what the ceiling is being
// judged against, and coming back to a different one is coming back to a
// different-looking ceiling. It is not in the document either — a link carries
// a layout, not the wall you were standing in front of.
//
// ---------------------------------------------------------------------------
// WHAT BEATS IT
// ---------------------------------------------------------------------------
//
// A configuration in the address bar. If you followed a link, you came to see
// THAT ceiling, not the one you were building yesterday. The link stays in the
// address bar, so reloading keeps showing it; and the moment you change
// anything, that becomes the saved session too.

export const SESSION_KEY = 'univ.session.v1'

/** Bumped only if the envelope below changes shape. */
const FORMAT = 1

/**
 * The last session, or null.
 *
 * Null for every way this can go wrong — no storage, storage disabled, nothing
 * saved, half-written JSON, a save from a future build. The caller does the
 * same thing in all of those cases: start empty. A session that cannot be read
 * is not worth a message, because there is nothing anybody can do about it.
 */
export function readSession() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || saved.v !== FORMAT) return null
    if (!saved.doc || !Array.isArray(saved.doc.items)) return null
    return saved
  } catch {
    return null
  }
}

/** Returns false when the browser would not take it, which is not an error. */
export function writeSession(doc, brush, background) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: FORMAT,
      at: Date.now(),
      doc,
      // Cloned on the way out: the store hands over its live object, and
      // JSON.stringify would otherwise capture whatever it is midway through
      // an edit.
      brush: brush ? { type: brush.type, params: { ...brush.params } } : null,
      background: background ?? null,
    }))
    return true
  } catch {
    // Over quota, or storage disabled. Nothing lost that this session needs.
    return false
  }
}

export function clearSession() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_KEY)
  } catch { /* nothing to do, and nothing depends on it */ }
}

/**
 * Keep the browser's copy in step with the document.
 *
 * `store` is passed in rather than imported so this module knows nothing about
 * zustand and can be exercised without it.
 *
 * WATCHES THE DOCUMENT, NOT THE STATE. hoverCell changes on every pointer move;
 * subscribing to everything would serialise the whole ceiling a hundred times a
 * second while the cursor crosses it. These six are what toJSON reads plus the
 * brush, and each is replaced rather than mutated, so reference equality is
 * enough.
 *
 * Returns a function that stops watching.
 */
export function keepSession(store, { delay = 500 } = {}) {
  const shot = (s) => [
    s.items, s.obstructions, s.groups, s.ceilingOverride, s.roomId, s.brush, s.background,
  ]
  let last = shot(store.getState())
  let timer = null

  const save = () => {
    timer = null
    const s = store.getState()
    writeSession(s.toJSON(), s.brush, s.background)
  }

  const unsubscribe = store.subscribe((s) => {
    const next = shot(s)
    if (next.every((v, i) => v === last[i])) return
    last = next
    // Coalesced. Dragging a set writes a new cell every few pixels, and each
    // write serialises the whole document.
    clearTimeout(timer)
    timer = setTimeout(save, delay)
  })

  // A reload one keystroke after an edit would otherwise land inside the
  // coalescing window and lose it. pagehide rather than beforeunload: it fires
  // on the mobile back-forward cache path too, where beforeunload does not.
  const flush = () => { if (timer) { clearTimeout(timer); save() } }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)

  return () => {
    unsubscribe()
    clearTimeout(timer)
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush)
  }
}
