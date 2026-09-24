// Designer Textile, colour first: every shade at once, then the weave.
//
// The other way round from TextilePicker, and the reason is what the range
// actually is. 275 panels is five WEAVES crossed with 55 COLOURS, and those are
// not the same kind of question. The colour is the decision — it is what the
// room will look like — and the weave is a refinement of it. Asking for the
// fabric first made the colour a sub-choice of something nobody had an opinion
// about yet, and hid 47 of the 55 colours behind a group filter while doing it.
//
// So: all 55 on screen, under their group headings, nothing hidden. Pick one
// and the five weaves appear BENEATH IT as thumbnails of that very colour, so
// choosing between them is looking at five pictures of the same shade rather
// than five letters.
//
// The value written is still a single code, the panel's key (`FB1_Blue_1`), so
// a saved layout, the schedule and the fin material all keep dealing in one
// field. Only the way it is chosen has changed.
//
// Every product that wears this range now uses this picker — baffles, clouds
// and tiles. TextilePicker, which asked fabric first and hid the other seven
// colour groups behind a filter, has nothing left pointing at it.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Field, Note } from './bits.jsx'
import {
  shadeGroups, fabricsForShade, panelOf, splitKey,
  textileReady, subscribeTextile, textileVersion, panelFor,
} from '../lib/textiles.js'

/** Re-renders when a sheet lands, so a chosen swatch can show its own picture. */
function useTextiles() {
  return useSyncExternalStore(subscribeTextile, textileVersion, () => 0)
}

export default function TextileColourPicker({ colour, onChange, field = 'colour' }) {
  // Which key the chosen code is written under. A baffle set and a cloud call
  // their finish `colour`; a ceiling tile calls it `textile`, because a tile
  // already has a `wood` and the two are read from different maps. Taking the
  // name as a prop is what lets one picker serve all three.
  const emit = (key) => onChange({ [field]: key })
  useTextiles()
  const ready = textileReady()

  // The weave in hand. Held here rather than in the specification because it is
  // only half a choice until a colour goes with it — and because picking a
  // colour has to keep the weave you were already looking at.
  const from = splitKey(colour)
  const [fabricId, setFabricId] = useState(from?.fabricId ?? null)

  // A colour set from outside — a preset, an undo, another set being selected —
  // moves the picker to it rather than leaving it pointing somewhere else.
  useEffect(() => {
    const p = splitKey(colour)
    if (p) setFabricId(p.fabricId)
  }, [colour])

  if (!ready) {
    return (
      <Field label="Colour">
        <Note tone="warn">
          Designer Textile panels unavailable — the CDN map did not load.
        </Note>
      </Field>
    )
  }

  const groups = shadeGroups()
  const chosen = panelFor(colour)
  const shadeId = chosen?.shadeId ?? null

  // Which weave the colour swatches are pictured in. Whatever is in hand, so
  // that once a weave is chosen the whole colour range is shown in it — which
  // is the comparison somebody is actually making by then. Before anything is
  // chosen, the first, because a swatch has to show something.
  const anyFabric = groups.length ? fabricsForShade(groups[0].shades[0])[0] : null
  const shownIn = fabricId ?? chosen?.fabricId ?? anyFabric

  /** Pick a colour, keeping the weave in hand where it is made in that colour. */
  const pickShade = (id) => {
    const made = fabricsForShade(id)
    const want = made.includes(shownIn) ? shownIn : made[0]
    const p = want ? panelOf(want, id) : null
    if (p) { setFabricId(p.fabricId); emit(p.key) }
  }

  const fabrics = shadeId ? fabricsForShade(shadeId) : []

  return (
    <>
      <Field label="Colour" hint={shadeId ?? '—'}>
        {/* All of them, under their group headings. The thumbnails are 540 B to
            3.8 KB — the whole range is 0.3 MB — so a swatch can be the fabric
            itself rather than its average colour. The hex is still underneath
            as the fallback and as what a fin wears until its sheet arrives. */}
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-txt-3">
                {g.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.shades.map((id) => {
                  const p = panelOf(shownIn, id) ?? panelOf(fabricsForShade(id)[0], id)
                  if (!p) return null
                  return (
                    <button
                      key={id}
                      type="button"
                      title={id}
                      onClick={() => pickShade(id)}
                      style={{
                        background: `${p.hex} url(${p.thumbnailUrl}) center/cover no-repeat`,
                      }}
                      className={`h-7 w-7 rounded-md ring-offset-2 ring-offset-surface transition ${
                        shadeId === id ? 'ring-2 ring-accent' : 'ring-1 ring-line'
                      }`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Field>

      {/* The weave, once there is a colour to show it in. Nothing to choose
          between before that: five labels reading FB1 to FB5 tell you nothing,
          and five pictures of the colour you just picked tell you everything. */}
      {shadeId && (
        <Field label="Fabric" hint={chosen?.fabricId ?? '—'}>
          <div className="flex flex-wrap gap-1.5">
            {fabrics.map((f) => {
              const p = panelOf(f, shadeId)
              if (!p) return null
              return (
                <button
                  key={f}
                  type="button"
                  title={`${f} · ${shadeId}`}
                  onClick={() => { setFabricId(f); emit(p.key) }}
                  className={`flex flex-col items-center gap-1 rounded-md p-1 transition ${
                    chosen?.fabricId === f ? 'bg-fill-2' : 'hover:bg-fill'
                  }`}
                >
                  <span
                    style={{
                      background: `${p.hex} url(${p.thumbnailUrl}) center/cover no-repeat`,
                    }}
                    className={`block h-11 w-11 rounded ring-offset-2 ring-offset-surface transition ${
                      chosen?.fabricId === f ? 'ring-2 ring-accent' : 'ring-1 ring-line'
                    }`}
                  />
                  <span className={`text-[10px] ${
                    chosen?.fabricId === f ? 'text-txt' : 'text-txt-3'
                  }`}>{f}</span>
                </button>
              )
            })}
          </div>
          <Note>
            The same colour in each weave. Bigger than the swatches above because
            this is the difference you are looking for.
          </Note>
        </Field>
      )}
    </>
  )
}
