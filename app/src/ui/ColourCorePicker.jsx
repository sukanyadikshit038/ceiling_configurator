// Colour Core Fabric is picked in two steps: the colour, then the weave.
//
// 19 colours x 3 structures is 57 combinations, and a flat grid of 57 swatches
// would be unreadable — worse, it would hide the fact that the three entries in
// each row are the same colour in a different cloth. So the colour comes first,
// the three structures it is woven in follow, and both always have a selection:
// choosing a family lands on the first colour in its first structure, already
// applied, which is the point where someone can start tweaking rather than
// start deciding.

import { useSyncExternalStore } from 'react'
import {
  COLOUR_CORE, getEntry, structuresFor, subscribe, getVersion, panelPending,
} from '../lib/colourCore.js'
import { Field, Note } from './bits.jsx'

export default function ColourCorePicker({ colour, onChange }) {
  // a panel finishing its download changes what this panel should say
  useSyncExternalStore(subscribe, getVersion, () => 0)

  const current = getEntry(colour)
  const colorId = current?.colorId ?? COLOUR_CORE.colors[0]?.id ?? null
  const structures = structuresFor(colorId)

  if (!COLOUR_CORE.ready) {
    return <Note tone="warn">The Colour Core panel map has not loaded — finishes are unavailable.</Note>
  }

  /** Keep the weave when changing colour, if that colour is woven in it. */
  const pickColour = (id) => {
    const options = structuresFor(id)
    const sameWeave = options.find((t) => t.structureId === current?.structureId)
    const next = sameWeave ?? options[0]
    if (next) onChange({ colour: next.key })
  }

  return (
    <>
      <Field label="Colour" hint={current?.colorName ?? '—'}>
        <div className="flex flex-wrap gap-1.5">
          {COLOUR_CORE.colors.map((c) => (
            <button
              key={c.id}
              type="button"
              title={`${c.name} (${c.id})`}
              onClick={() => pickColour(c.id)}
              style={{ background: c.hex }}
              className={`h-6 w-6 rounded-md ring-offset-2 ring-offset-surface transition ${
                c.id === colorId ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
            />
          ))}
        </div>
      </Field>

      <Field label="Structure" hint={current?.structureName ?? '—'}>
        <div className="grid grid-cols-3 gap-1.5">
          {structures.map((t) => {
            const on = t.key === colour
            return (
              <button
                key={t.key}
                type="button"
                title={`${t.structureName} — ${t.colorName}`}
                onClick={() => onChange({ colour: t.key })}
                className={`overflow-hidden rounded-md text-left transition ${
                  on ? 'ring-2 ring-accent' : 'ring-1 ring-line hover:ring-line-strong'
                }`}
              >
                {/* the 28 KB thumbnail, not the panel — this is a contact sheet,
                    and 57 of these must never pull 57 multi-megabyte JPEGs */}
                <img
                  src={t.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="block h-12 w-full object-cover"
                  style={{ background: t.hex }}
                />
                <span className="block px-1.5 py-1 text-[10px] text-txt-2">{t.structureName}</span>
              </button>
            )
          })}
        </div>
      </Field>

      {panelPending(colour) && (
        <Note>Loading the full-resolution panel — the weave sharpens when it lands.</Note>
      )}
    </>
  )
}
