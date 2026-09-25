import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.js'
import { VIEW_NAMES } from '../lib/views.js'
import { Button } from './bits.jsx'
import { encodeConfig, linkFor, URL_BUDGET, readLink, decodeConfig } from '../lib/share.js'

// The wall configurator is a separate bundle, so this is a normal link
// (full page load), not a route change — BRIEF §3.4.
const WALL_APP_URL = 'https://configurator.univicoustic.com'

// Hidden, not deleted — the same bargain LeftPanel makes with SHOW_ROOM and
// friends. Both are one word from coming back, and both take something with
// them, which is worth knowing before anyone flips them:
//
//   SHOW_FABRICS  the Fabrics button is the ONLY way into FabricManager. With
//                 it off, that whole screen is unreachable; the component still
//                 builds and App still mounts it behind `fabricsOpen`.
//
//   SHOW_LOAD     used to be the only way to read a saved layout back in, and
//                 with it off the app could write a file it could not open.
//                 Copy link closes that: a configuration now travels in a URL
//                 and comes back through the same fromJSON. The file half of
//                 the asymmetry stands — Export JSON writes a .json nothing in
//                 the UI reads — and is deliberate, not an oversight.
const SHOW_FABRICS = false
const SHOW_LOAD = false

export default function TopBar({ view, setView, spin, setSpin, onOpenFabrics, startup = null }) {
  const items = useStore((s) => s.items)
  const toJSON = useStore((s) => s.toJSON)
  const fromJSON = useStore((s) => s.fromJSON)
  const openDoc = useStore((s) => s.openDoc)
  const clear = useStore((s) => s.clear)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const undo = useStore((s) => s.undo)
  const canUndo = useStore((s) => s.undoStack.length > 0)
  const preview = useStore((s) => s.preview)
  const setPreview = useStore((s) => s.setPreview)
  const showMeasures = useStore((s) => s.showMeasures)
  const toggle = useStore((s) => s.toggle)

  // Clearing is destructive and easy to hit by accident, so the button becomes
  // its own confirmation rather than firing straight away.
  const [confirmClear, setConfirmClear] = useState(false)
  // Seeded with whatever happened to a configuration in the address bar, so
  // "opened a shared layout" and "that link is damaged" both land in the same
  // place as every other message rather than needing somewhere of their own.
  const [msg, setMsg] = useState(startup)
  const fileRef = useRef()

  // Longer than the six seconds a message you asked for gets: this one is
  // waiting for somebody who has just arrived and is still looking at the
  // ceiling.
  useEffect(() => {
    if (!startup) return undefined
    const t = setTimeout(() => setMsg((m) => (m === startup ? null : m)), 10000)
    return () => clearTimeout(t)
  }, [startup])

  const download = () => {
    const doc = toJSON()
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${doc.sceneId.replace(/^sc:/, '')}-ceiling.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  /**
   * A LINK PASTED INTO A TAB THAT IS ALREADY OPEN.
   *
   * Changing only the fragment is a SAME-DOCUMENT navigation: the browser swaps
   * the hash and does not reload, so boot never runs and the link is ignored
   * without a word. Opening one in a new tab worked; pasting it into this one
   * did nothing at all.
   *
   * `history.replaceState` — what Copy link uses — does NOT fire hashchange, so
   * the app cannot set this off by writing its own link.
   *
   * The undo step that openDoc pushes is KEPT here, unlike at boot: there is a
   * ceiling to go back to, so Ctrl+Z is a real answer and the question says so.
   */
  useEffect(() => {
    const onHash = async () => {
      const encoded = readLink()
      // The hash cleared, or changed to something that is not a
      // configuration. Nothing to do and nothing to say.
      if (!encoded) return
      const say = (m) => { setMsg(m); setTimeout(() => setMsg(null), 8000) }
      let doc
      try {
        doc = await decodeConfig(encoded, useStore.getState().roomId)
      } catch (err) {
        say(`Could not open that link: ${err.message}`)
        return
      }
      // Only asked when there is something to lose. A dialog about an empty
      // ceiling has one sensible answer and is just a click in the way.
      const mine = useStore.getState().items.length
      if (mine && !window.confirm(
        `Open the shared layout? It replaces the ${mine} set(s) on this ceiling. `
        + 'Ctrl+Z puts them back.'
      )) {
        say('Kept your ceiling — reload to open the link instead')
        return
      }
      const { loaded, dropped } = openDoc(doc)
      say(dropped
        ? `Opened a shared layout: ${loaded} set(s); ${dropped} did not fit this ceiling`
        : `Opened a shared layout: ${loaded} set(s)`)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [openDoc])

  /**
   * The current ceiling, as a link.
   *
   * Into the address bar with replaceState rather than pushState: copying a
   * link is not navigation, and leaving a history entry behind would mean Back
   * appeared to undo it.
   *
   * The clipboard can refuse — it needs a secure context and, in some browsers,
   * a permission — so the URL goes into the address bar FIRST. Then even a
   * refusal leaves the link somewhere the user can get at it, and the message
   * says which of the two happened instead of claiming a copy that did not
   * take place.
   */
  const copyLink = async () => {
    try {
      const url = linkFor(await encodeConfig(toJSON()))
      history.replaceState(null, '', url)
      let copied = true
      try { await navigator.clipboard.writeText(url) } catch { copied = false }
      setMsg([
        copied ? 'Link copied' : 'Link is in the address bar — copying was blocked',
        `${items.length} set(s), ${url.length} characters`,
        // Said rather than left to be discovered by a link that arrives cut in
        // half. It is not a browser limit; it is what survives being pasted
        // into a chat window or an email.
        url.length > URL_BUDGET ? 'long enough that some apps may truncate it' : '',
      ].filter(Boolean).join(' · '))
    } catch (err) {
      setMsg(`Could not make a link: ${err.message}`)
    }
    setTimeout(() => setMsg(null), 8000)
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const { loaded, dropped } = fromJSON(JSON.parse(await f.text()))
      setMsg(dropped
        ? `Loaded ${loaded} set(s); ${dropped} did not fit this ceiling`
        : `Loaded ${loaded} set(s)`)
    } catch (err) {
      setMsg(`Could not load: ${err.message}`)
    }
    setTimeout(() => setMsg(null), 6000)
  }

  return (
    /* The bar scrolls rather than reflows. Every child is shrink-0, so a narrow
       window pushes the tail out of view instead of wrapping each label onto
       two lines — which is what a shrinking flex row does by default, and what
       made this bar look broken at ~1000 px. */
    <header className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-b border-line-soft bg-bg px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex shrink-0 flex-col justify-center gap-[3px]">
        {/* The real wordmark, not a gradient square and a typeset name.
            TWO ASSETS, not one with a filter. The logo is two colours — a near
            black and the brand orange #ef4935 — and the black disappears on the
            dark theme. `invert(1) hue-rotate(180deg)` lifts it, but it also
            drags the orange to #ff725e, which is a brand colour being altered
            to solve a legibility problem. So public/brand/ carries a reversed
            variant where only the dark ink is lifted and the orange is left
            bit-for-bit. Both are derived from the supplied files, which are
            untouched.

            The strapline is deliberately not here: the supplied lockup sets it
            at about a third the wordmark's height, which at a 56 px bar is
            around 8 px and unreadable. A logo too small to read is worse than
            one that stops at the wordmark. */}
        <img
          src={`${import.meta.env.BASE_URL}brand/wordmark${theme === 'dark' ? '-reversed' : ''}.png`}
          alt="UniVicoustic"
          className="h-[16px] w-auto shrink-0 select-none"
          draggable={false}
        />
        {/* The product name UNDER the wordmark, the way the wall app labels
            itself. It used to sit beside the logo behind `2xl:inline`, so below
            about 1536 px — most windows, and the screenshot this came from —
            the header said only "UNIV/COUSTIC" and never which of the two
            configurators you were in. Stacked it is always on, and costs no
            width: at 16 px the wordmark is ~171 px, and the descriptor sets to
            about 146. */}
        <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.15em] text-txt-3">
          Ceiling Configurator
        </span>
        </div>
      </div>

      <nav className="flex shrink-0 items-center gap-1.5">
        {/* the four views are one choice, so they read as one control rather
            than four buttons competing with Spin and Preview beside them */}
        <div className="flex shrink-0 overflow-hidden rounded-md border border-line">
          {Object.entries(VIEW_NAMES).map(([k, name]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={`h-7 shrink-0 whitespace-nowrap px-2.5 text-[12px] font-medium transition-colors ${
                view === k ? 'bg-accent text-on-accent' : 'text-txt-2 hover:bg-fill hover:text-txt'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <Button
          active={spin}
          onClick={() => setSpin(!spin)}
          className="h-7 px-2.5"
          aria-pressed={spin}
          title="Orbit the camera horizontally around the room, keeping the current height and distance. Picking a view or dragging a set pauses it."
        >
          <span aria-hidden="true" className={spin ? 'animate-spin [animation-duration:3s]' : ''}>↻</span>
          Spin
        </Button>

        {/* Dimensions are ON to start with, so this button is a way to get
            them OUT OF THE WAY rather than a feature to discover. It sits
            before Preview because Preview already implies it: a client-facing
            view has no dimensions in it whatever this says, and the disabled
            state says so rather than leaving a live-looking button that does
            nothing. */}
        <Button
          active={showMeasures && !preview}
          disabled={preview}
          onClick={() => toggle('showMeasures')}
          className="h-7 px-2.5"
          aria-pressed={showMeasures && !preview}
          title={preview
            ? 'Preview hides dimensions — turn Preview off to measure.'
            : 'Show the clear distance from the selected set to its neighbours within 3 m. Select a set to see them.'}
        >
          <span aria-hidden="true">↔</span>
          Measure
        </Button>

        <Button
          active={preview}
          onClick={() => setPreview(!preview)}
          className="h-7 px-2.5"
          aria-pressed={preview}
          title="Stop placed sets taking clicks, so dragging one orbits the camera instead of moving it. Everything else stays as it is."
        >
          <span aria-hidden="true">◉</span>
          Preview
        </Button>
      </nav>

      {msg && <span className="min-w-0 truncate text-[11px] text-accent">{msg}</span>}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="mr-1 shrink-0 whitespace-nowrap text-[11px] tabular-nums text-txt-3">
          {items.length} placed
        </span>

        <Button variant="outline" className="h-8 px-3" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </Button>

        {confirmClear ? (
          <>
            <span className="text-[11px] text-txt-2">Remove all {items.length}?</span>
            <Button variant="danger" className="h-8 px-3" onClick={() => { clear(); setConfirmClear(false) }}>
              Yes, clear
            </Button>
            <Button variant="outline" className="h-8 px-3" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="outline" className="h-8 px-3" disabled={!items.length} onClick={() => setConfirmClear(true)}>
            Clear all
          </Button>
        )}

        {/* TEMPORARY while the house theme is being judged. The app ships one
            theme; this is here so the two can be compared on the same layout
            rather than from screenshots. Not persisted — a reload gives the
            house theme back, so a fresh load always shows what ships. */}
        <Button
          variant="outline"
          className="h-8 px-3"
          title={theme === 'dark' ? 'Switch to the house theme' : 'Switch to the old dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>

        {SHOW_FABRICS && (
          <Button variant="outline" className="h-8 px-3" onClick={onOpenFabrics}>Fabrics</Button>
        )}

        {SHOW_LOAD && (
          <>
            <input ref={fileRef} type="file" accept="application/json" onChange={onFile} className="hidden" />
            <Button variant="outline" className="h-8 px-3" onClick={() => fileRef.current?.click()}>Load</Button>
          </>
        )}
        {/* Enabled with an empty ceiling, unlike Export JSON: a link to a
            bare room is a reasonable thing to send somebody as a starting
            point, whereas an empty file is not a thing anybody wants. */}
        <Button variant="outline" className="h-8 px-3" onClick={copyLink}
          title="A link that reopens this ceiling">
          Copy link
        </Button>
        <Button variant="solid" className="h-8 px-3" onClick={download} disabled={!items.length}>
          Export JSON
        </Button>

        <a
          href={WALL_APP_URL}
          title="Open the wall configurator"
          className="ml-1.5 shrink-0 whitespace-nowrap rounded-md border border-line px-3 py-1.5 text-[12px] text-txt-2 transition-colors hover:bg-fill hover:text-txt"
        >
          Wall<span className="hidden xl:inline"> configurator</span> ↗
        </a>
      </div>
    </header>
  )
}
