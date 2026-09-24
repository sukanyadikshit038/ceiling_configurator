// A configuration in a URL.
//
// The app could already WRITE a layout (Export JSON) and, since the Load button
// was switched off, had no way to read one back. This is the way back in, and a
// way to hand a ceiling to somebody else without sending them a file.
//
// ---------------------------------------------------------------------------
// WHAT THE LINK CARRIES, and what it deliberately does not
// ---------------------------------------------------------------------------
//
//   items            every placed set: what it is, where it sits, how it is
//                    turned, and its full parameters
//   groups           the names only; membership rides on the items
//   ceilingOverride  the ceiling zone
//   ceiling.pitch    the unit the cells are counted in
//
// NOT the room, and NOT the obstruction mask — asked for, on the grounds that
// neither is in use. The room picker is not rendered in the sidebar today and
// the app ships one effective scene, so a link that says nothing about the room
// opens in whatever room the reader is already in. The mask is likewise
// unreachable, and `fromJSON` reads a missing `obstructions` as an empty one,
// so leaving it out costs nothing.
//
// THE ZONE IS NOT THE ROOM, which is why it stays. Cells are indices counted
// from the ceiling's own corner, so the zone is the coordinate frame they are
// written in — measured: a default zone puts the origin at (-3.75, -3.5), and
// changing the ceiling's dimensions moves it. Drop the zone and every item in
// the link lands somewhere else, or off the grid entirely and is discarded.
// `hydrate()` always sets one, so it is never absent and never guesswork.
//
// ---------------------------------------------------------------------------
// WHY THE HASH, AND NOT A QUERY STRING
// ---------------------------------------------------------------------------
//
// A fragment is never sent to the server. A configuration is the reader's own
// work, and putting it in a query would write it into access logs, referrer
// headers and CDN cache keys on every open. It also sidesteps the request-line
// limits a long query runs into.
//
// ---------------------------------------------------------------------------
// SIZE
// ---------------------------------------------------------------------------
//
// Measured on real layouts: a twenty-panel cloud preset is about 520 characters
// and a twenty-eight panel mixed ceiling about 830. Both are well inside
// URL_BUDGET, which is the length a link survives being pasted into a chat
// window or an email client rather than any browser limit — browsers take far
// more. A layout that exceeds it still produces a working link; the caller is
// told so it can say the link is long rather than letting it be truncated
// somewhere out of sight.

/** The fragment key, so the hash can hold other things later. */
export const LINK_KEY = 'c'

/**
 * The payload format, carried in the link.
 *
 * Bumped only if the SHAPE below changes in a way an older reader would get
 * wrong. The document's own `version` rides inside the payload and is checked
 * by fromJSON, which already refuses a file from a newer build — this marker is
 * about the envelope, not the contents.
 */
export const FORMAT = 'c1'

/** Past this, a link starts getting broken by the things people paste it into. */
export const URL_BUDGET = 2000

/**
 * The document, reduced to what a link carries.
 *
 * The KEY NAMES ARE THE FILE'S. Short keys would shave perhaps a tenth off the
 * payload before compression and almost nothing after it, in exchange for a
 * second vocabulary to keep in step with the first — so this omits fields and
 * renames none. A decoded payload can be read against toJSON() directly.
 */
export function sharePayload(doc) {
  if (!doc || !Array.isArray(doc.items)) throw new Error('not a configuration')
  return {
    version: doc.version,
    // Cells are pitch-relative, so the pitch travels with them. The rest of the
    // `ceiling` block is derived from the zone and is not read back.
    ceiling: { pitch: doc.ceiling?.pitch },
    ceilingOverride: doc.ceilingOverride ?? null,
    ...(doc.groups?.length ? { groups: doc.groups } : {}),
    // `id` and `ci`/`cj` are left out because fromJSON makes them again: it
    // regenerates a missing id and recomputes the footprint from the params
    // through productCells. Writing them would be writing something that can
    // disagree with the parameters beside it.
    items: doc.items.map(({ type, cell, rot, params, groupId }) => (
      groupId
        ? { type, cell, rot, params, groupId }
        : { type, cell, rot, params }
    )),
  }
}

/**
 * The payload, back into a document fromJSON will take.
 *
 * `sceneId` is supplied by the CALLER — the reader's current room — rather than
 * defaulted here. The link says nothing about the room, and getRoom() answering
 * with ROOMS[0] would quietly be a decision about which room that is.
 */
export function shareDoc(payload, sceneId) {
  if (!payload || !Array.isArray(payload.items)) throw new Error('not a configuration')
  return {
    version: payload.version,
    sceneId,
    ceiling: { pitch: payload.ceiling?.pitch },
    ceilingOverride: payload.ceilingOverride ?? null,
    groups: payload.groups ?? [],
    items: payload.items,
  }
}

// ---------------------------------------------------------------------------
// bytes
// ---------------------------------------------------------------------------

/**
 * gzip, through the platform's own stream.
 *
 * Streams rather than Blob/Response so the same code runs in the browser and
 * under node, which is what lets the round trip be asserted in the suite
 * instead of only by hand.
 */
async function through(bytes, stream) {
  const writer = stream.writable.getWriter()
  // THE WRITE SIDE HAS TO BE HANDLED. When the stream errors — which is exactly
  // what a truncated link does, gzip reporting an unexpected end of file — both
  // write() and close() reject. Left dangling those are unhandled rejections:
  // they bring the process down under node and log an error in the browser
  // console, even though the failure is ALREADY being reported properly, by the
  // reader, as "this link is damaged". Found by a guard for a cut-short link
  // that passed and then killed the suite three assertions later.
  //
  // Swallowed here rather than reported: the reader's rejection is the same
  // fault with the better message, and it is the one that propagates.
  const pumped = writer.write(bytes).then(() => writer.close()).catch(() => {})
  const reader = stream.readable.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    await pumped
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

// base64url: the '+' and '/' of plain base64 are both meaningful in a URL, and
// '=' padding is dropped because the length already implies it.
const toB64Url = (bytes) => {
  let s = ''
  // A character at a time. String.fromCharCode(...bytes) is shorter and blows
  // the argument limit on a large layout.
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64Url = (str) => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A document, as the string that goes after the '=' in the fragment. */
export async function encodeConfig(doc) {
  const json = JSON.stringify(sharePayload(doc))
  const gz = await through(new TextEncoder().encode(json), new CompressionStream('gzip'))
  return `${FORMAT}.${toB64Url(gz)}`
}

/** And back. Throws with something a person can act on, never returns junk. */
export async function decodeConfig(str, sceneId) {
  const s = String(str ?? '')
  const dot = s.indexOf('.')
  const marker = dot < 0 ? '' : s.slice(0, dot)
  if (marker !== FORMAT) {
    throw new Error(marker
      ? `this link is in format "${marker}"; this build reads ${FORMAT}`
      : 'this link does not carry a configuration')
  }
  let payload
  try {
    const gz = fromB64Url(s.slice(dot + 1))
    const raw = await through(gz, new DecompressionStream('gzip'))
    payload = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    // One message for every way the bytes can be wrong, because the reader can
    // do exactly one thing about all of them: ask for the link again.
    throw new Error('this link is damaged — it may have been cut short')
  }
  return shareDoc(payload, sceneId)
}

// ---------------------------------------------------------------------------
// the address bar
// ---------------------------------------------------------------------------

/** The encoded configuration in the current URL, or null. */
export function readLink(href = typeof location === 'undefined' ? '' : location.href) {
  const hash = String(href).split('#')[1]
  if (!hash) return null
  const found = new URLSearchParams(hash).get(LINK_KEY)
  return found || null
}

/** The same URL with this configuration in its fragment. */
export function linkFor(encoded, href = typeof location === 'undefined' ? '' : location.href) {
  const [base] = String(href).split('#')
  return `${base}#${LINK_KEY}=${encoded}`
}
