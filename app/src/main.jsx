import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadRooms } from './lib/rooms.js'
import { loadModelManifest, MODELS } from './lib/models.js'
import { loadFabrics } from './lib/fabrics.js'
import { initWoodLibrary, initFabricTextures } from './lib/textures.js'
import { loadColourCore } from './lib/colourCore.js'
import { loadColourCoreOmbre } from './lib/colourCoreOmbre.js'
import { loadTileFinishes, loadTileManifest } from './lib/tiles.js'
import { loadCloudManifest } from './lib/clouds.js'
import { loadFlyManifest, FLY_FABRICS, flyFabricUrl } from './lib/fly.js'
import {
  loadTextileManifest, textileSwatches, retainTextiles, registerLocalPanels,
} from './lib/textiles.js'
import {
  loadCloudSeriesManifest, cloudSeriesSwatches, splitSeriesSwatch, seriesKey,
  retainCloudSeries,
} from './lib/cloudSeries.js'
import {
  applyTextileSwatches, applyCloudSeriesSwatches, COLOUR_FAMILIES,
} from './lib/catalog.js'
import { useStore } from './lib/store.js'
import { readLink, decodeConfig } from './lib/share.js'
import { readSession, clearSession, keepSession } from './lib/session.js'

// Everything the first render depends on is read before mounting:
//   rooms     — the store needs one to have a grid at all
//   fabrics   — a swatch that has not decoded renders as the fallback
//   veneers   — same, for the Wood Classic photos
// Doing this after mount would make the app re-initialise underneath itself.

const root = createRoot(document.getElementById('root'))

function fail(message) {
  root.render(
    <div style={{ padding: 32, color: '#e6eaee', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 16, marginBottom: 8 }}>Could not start the configurator</h1>
      <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.6, maxWidth: 560 }}>
        {message}
        <br /><br />
        Rooms come from the built-in furnished sets plus{' '}
        <code>public/models/manifest.json</code>, which is generated from{' '}
        <code>public/models/rooms</code>. Run <code>npm run manifest</code>, or restart the
        dev server.
      </p>
    </div>
  )
}

async function boot() {
  const { rooms } = await loadRooms()
  if (!rooms) return fail('No rooms are available — not even the built-in furnished sets loaded.')

  // Non-fatal: baffles are parametric, so the app works with no model files,
  // and finishes fall back to flat swatches if their images do not load.
  await Promise.all([
    loadModelManifest(),
    loadFabrics().then(initFabricTextures),
    initWoodLibrary(),
    // the Colour Core panel map: names and URLs only, no panels are fetched
    // until a surface actually wears one
    loadColourCore(),
    loadColourCoreOmbre(),
    loadTileFinishes(),
    loadTileManifest(),
    loadCloudManifest(),
    loadFlyManifest(),
    // 275 fabric panels on a CDN. Only the MAP is fetched here; a sheet is
    // pulled the first time something wears it, because the set is 1 GB.
    loadTextileManifest().then(() => applyTextileSwatches(textileSwatches())),
    // 64 printed cloud faces in public/textures. Only the MANIFEST is read
    // here — 20 MB of artwork is not fetched until a cloud wears some.
    loadCloudSeriesManifest().then(() => applyCloudSeriesSwatches(cloudSeriesSwatches())),
  ])

  // Fly ships ten FB3 shades in public/textures. They are ten of the same 275
  // panels, so registering them here means anything wearing one of those ten —
  // a Fly, a baffle, a cloud — reads it off disk instead of the CDN.
  registerLocalPanels(FLY_FABRICS.map((k) => [k, flyFabricUrl(k)]))

  // A fabric sheet is 39 MB decoded and nothing in lib/textiles knows when one
  // stops being worn. The document does, so it says: every time the layout
  // changes, the sheets nothing wears any more are freed. Without this, trying
  // a dozen shades on one set would hold half a gigabyte for the session.
  const textilesInUse = (items) => {
    const keys = new Set()
    for (const it of items ?? []) {
      const p = it?.params
      if (!p) continue
      if (COLOUR_FAMILIES[p.family]?.sheet && p.colour) keys.add(p.colour)
      for (const ov of Object.values(p.finOverrides ?? {})) {
        const fam = ov?.family ?? p.family
        if (COLOUR_FAMILIES[fam]?.sheet && ov?.colour) keys.add(ov.colour)
      }
      // Ceiling tiles wear the SAME sheets — a Designer Textile tile is a crop
      // of the panel a fin is a strip of. Missing them here would not look like
      // a missing key; it would look like a tile going blank, because the sheet
      // it is cropping would be freed out from under it the moment the layout
      // changed. A tile names its fabric `textile`, not `colour`.
      if (p.textile) keys.add(p.textile)
      for (const ov of Object.values(p.tileOverrides ?? {})) {
        if (ov?.textile) keys.add(ov.textile)
      }
    }
    return keys
  }
  // The same bargain for Cloud Series artwork, which is 7.8 MB decoded per
  // design and 500 MB for all 64. A cloud's image is keyed by design, SHAPE and
  // colour — the shape is in the key because the four shapes of a design are
  // four different files, so a ceiling of circles must not hold the hexagons.
  const printsInUse = (items) => {
    const keys = new Set()
    for (const it of items ?? []) {
      const p = it?.params
      if (!p || !COLOUR_FAMILIES[p.family]?.series) continue
      const bits = splitSeriesSwatch(p.colour)
      if (bits && p.shape) keys.add(seriesKey(bits.design, p.shape, bits.colour))
    }
    return keys
  }

  let lastKeys = ''
  let lastPrints = ''
  useStore.subscribe((s) => {
    const keys = [...textilesInUse(s.items)].sort()
    const sig = keys.join('|')
    if (sig !== lastKeys) {
      lastKeys = sig
      retainTextiles(keys)
    }
    const prints = [...printsInUse(s.items)].sort()
    const psig = prints.join('~')
    if (psig !== lastPrints) {
      lastPrints = psig
      retainCloudSeries(prints)
    }
  })

  if (!useStore.getState().hydrate()) return fail('The room list loaded but the store could not adopt it.')

  // A configuration in the address bar, applied BEFORE the first paint so a
  // shared link opens on the ceiling it describes rather than flashing an empty
  // one and filling in a frame later.
  //
  // After hydrate(), because it needs a room and a zone to measure items
  // against, and after the manifests above, because reconcileCloud and friends
  // read the catalogues to decide what a saved parameter still means.
  //
  // A BAD LINK IS NOT A BAD APP. Anything wrong with the fragment leaves the
  // ceiling empty and is reported in the bar — the alternative is a start-up
  // failure page for a mistyped character in something somebody else sent you.
  let startup = null
  // Which of the two put this ceiling on screen — the message differs, and only
  // a restore has an undo stack worth emptying.
  let openedFrom = null
  const link = readLink()
  if (link) {
    try {
      const doc = await decodeConfig(link, useStore.getState().roomId)
      const { loaded, dropped } = useStore.getState().openDoc(doc)
      openedFrom = 'link'
      startup = dropped
        ? `Opened a shared layout: ${loaded} set(s); ${dropped} did not fit this ceiling`
        : `Opened a shared layout: ${loaded} set(s)`
    } catch (err) {
      startup = `Could not open that link: ${err.message}`
    }
  } else {
    // THE LINK WINS, which is why this is an else. Following a link means you
    // came to see THAT ceiling, not the one you were building yesterday.
    const saved = readSession()
    if (saved) {
      try {
        const { loaded, dropped } = useStore.getState().openDoc(saved.doc, { brush: saved.brush })
        openedFrom = 'session'
        // What the ceiling was being judged against. Not part of the document,
        // so openDoc knows nothing about it.
        if (saved.background) useStore.getState().setBackground(saved.background)
        // Silent when there was nothing on the ceiling to bring back. Saying
        // "restored 0 sets" on every reload of an empty app is noise.
        if (loaded) {
          startup = dropped
            ? `Picked up where you left off: ${loaded} set(s); ${dropped} no longer fit this ceiling`
            : `Picked up where you left off: ${loaded} set(s)`
        }
      } catch (err) {
        // A save this build cannot read is dropped rather than retried, or the
        // same failure greets you on every reload for ever.
        clearSession()
        startup = `Could not restore your last session: ${err.message}`
      }
    }
  }

  // Open on a type that something can actually be built from. Done here rather
  // than in hydrate() because knowing which types have models needs the model
  // registry, and that is three.js — which the document layer stays clear of.
  //
  // The TYPE only. This used to adopt the first model's shape and id as well,
  // which quietly pre-answered a question the panel now asks: the brush opened
  // on Blade / Flow whether or not anyone had chosen Flow.
  //
  // GUARDED ON THE BRUSH BEING A BAFFLE, which it no longer is at boot: the app
  // opens on clouds now (DEFAULT_PRODUCT). Unguarded this wrote btype onto a
  // CLOUD spec — harmless to the render, because reconcileCloud ignores a field
  // it does not know, but it travels into an exported layout and is the sort of
  // stray key somebody later spends an afternoon accounting for.
  //
  // The consequence, stated rather than discovered: with clouds as the default
  // this seeding no longer runs at startup at all, so a baffle brush made later
  // by setProduct gets the STATIC default from emptyBrushParams() instead of
  // the registry's first type. That is safe only while those two agree, which
  // they do — both are 'blade' — and verify asserts it, so the day a model set
  // arrives whose first type is something else, a test fails rather than the
  // panel quietly opening on a type with nothing to build.
  //
  // ONLY AT A FRESH START. This picks a default baffle type, and it fires on
  // `brush.type === 'baffles'` — which a RESTORED baffle brush also satisfies.
  // openDoc sets the brush before this line is reached, so without the guard
  // this would quietly overwrite the type that came out of the link or the
  // saved session with whatever the model registry happens to list first.
  const first = MODELS[0]
  if (!openedFrom && first?.type && useStore.getState().brush.type === 'baffles') {
    useStore.getState().setBrush({ btype: first.type })
  }

  // The panel that goes with the ceiling is openDoc's business — see the store.
  //
  // NOTHING TO UNDO TO. fromJSON pushes an undo step, and at boot the state it
  // would return to is an empty ceiling that never existed for the user — so
  // one press of Undo after a reload would throw away everything just
  // restored.
  if (openedFrom) useStore.setState({ undoStack: [] })

  // From here on the browser's copy follows the document. Started AFTER the
  // restore so the restore is not raced by its own save, and after the brush so
  // the first thing written is what is actually on screen.
  keepSession(useStore)

  // Before the first paint. The token blocks key off <html data-theme>, so
  // rendering first would show one theme's surfaces for a frame.
  useStore.getState().setTheme(useStore.getState().theme)

  root.render(<React.StrictMode><App startup={startup} /></React.StrictMode>)
}

boot().catch((e) => fail(e.message))
