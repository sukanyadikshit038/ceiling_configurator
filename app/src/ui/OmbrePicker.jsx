// Colour Core Ombré is picked in two steps: the base colour, then the overlay
// that fades across it.
//
// Same shape as the fabric picker and for the same reason — 106 combinations in
// one flat grid would be unreadable, and it would hide the fact that a row is
// one base colour under different overlays. Unlike the fabric range the rows
// are uneven: Coral Haze has 5 overlays, Glaciar 25. So the overlay row wraps
// rather than sitting in a fixed three-column grid.
//
// The swatches are DRAWN, not photographed. This range publishes no thumbnails
// — nothing but the 5 MB originals, and 106 of those is not a contact sheet. A
// fade between the two colours is what the swatch depicts anyway, so drawing it
// costs nothing and loses nothing. The photograph is fetched only for the one
// combination actually applied.

import { useSyncExternalStore } from 'react'
import { subscribe, getVersion } from '../lib/colourCore.js'
import { COLOUR_CORE_OMBRE, overlaysFor } from '../lib/colourCoreOmbre.js'
import { Field, Note } from './bits.jsx'

/** The swatch itself: the fade, running the way it runs on the fin. */
const fade = (from, to) => ({ background: `linear-gradient(90deg, ${from}, ${to})` })

export default function OmbrePicker({ colour, onChange }) {
  // a panel finishing its download changes what this panel should say
  useSyncExternalStore(subscribe, getVersion, () => 0)

  if (!COLOUR_CORE_OMBRE.ready) {
    return <Note tone="warn">The Colour Core Ombré map has not loaded — finishes are unavailable.</Note>
  }

  const current = COLOUR_CORE_OMBRE.textures.find((t) => t.key === colour) ?? null
  const baseId = current?.baseColorId ?? COLOUR_CORE_OMBRE.baseColors[0]?.id ?? null
  const overlays = overlaysFor(baseId)

  // Overlays are particular to a base colour — the same overlay hex is not
  // offered over every one — so changing base lands on that base's first.
  const pickBase = (id) => {
    const next = overlaysFor(id)[0]
    if (next) onChange({ colour: next.key })
  }

  return (
    <>
      <Field label="Base colour" hint={current?.baseColorName ?? '—'}>
        <div className="flex flex-wrap gap-1.5">
          {COLOUR_CORE_OMBRE.baseColors.map((c) => (
            <button
              key={c.id}
              type="button"
              title={`${c.name} — ${overlaysFor(c.id).length} overlays`}
              onClick={() => pickBase(c.id)}
              style={{ background: c.hex }}
              className={`h-6 w-6 rounded-md ring-offset-2 ring-offset-surface transition ${
                c.id === baseId ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
            />
          ))}
        </div>
      </Field>

      <Field
        label="Overlay"
        hint={current ? `${overlays.length} in ${current.baseColorName}` : '—'}
        help="The colour the base fades into, along the length of the baffle."
      >
        <div className="flex flex-wrap gap-1.5">
          {overlays.map((t) => (
            <button
              key={t.key}
              type="button"
              title={`${t.baseColorName} → ${t.overlayHex}`}
              onClick={() => onChange({ colour: t.key })}
              style={fade(t.baseColorHex, t.overlayHex)}
              className={`h-6 w-10 rounded-md ring-offset-2 ring-offset-surface transition ${
                t.key === colour ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
            />
          ))}
        </div>
      </Field>
    </>
  )
}
