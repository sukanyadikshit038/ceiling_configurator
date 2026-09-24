// Designer Textile: fabric, then colour group, then shade.
//
// Three steps because the range is 275 panels — five fabrics crossed with 55
// shades — and a flat grid of 275 swatches is not a control, it is a wall. The
// same reason ColourCorePicker exists: a family whose shape is not "one of
// these" gets a picker of its own rather than being forced into the grid.
//
// The value written is still a single code, the panel's key (`FB1_Blue_1`), so
// a saved layout, the schedule and the fin material all keep dealing in one
// field. Only the way it is CHOSEN is three steps.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Field, Choice, Note } from './bits.jsx'
import {
  TEXTILE_GROUPS, fabricIds, groupsFor, shadesFor, panelOf, splitKey,
  textileReady, subscribeTextile, textileVersion, panelFor,
} from '../lib/textiles.js'

/** Re-renders when a sheet lands, so a chosen swatch can show its own picture. */
function useTextiles() {
  return useSyncExternalStore(subscribeTextile, textileVersion, () => 0)
}

export default function TextilePicker({ colour, onChange, field = 'colour' }) {
  // Which key the chosen code is written under. A baffle set calls its finish
  // `colour`; a ceiling tile calls it `textile`, because a tile already has a
  // `wood` and the two are read from different maps. The picker is the same
  // three steps either way, so it takes the name rather than being copied.
  const emit = (key) => onChange({ [field]: key })
  useTextiles()
  const ready = textileReady()

  // The picker's own position, seeded from whatever is already chosen. Held
  // here rather than in the specification: a half-made choice is not a finish,
  // and the set on the ceiling must not change until a shade is picked.
  const from = splitKey(colour)
  const [fabricId, setFabricId] = useState(from?.fabricId ?? null)
  const [groupId, setGroupId] = useState(from?.groupId ?? null)

  // A colour set from outside — a preset, an undo, another set being selected —
  // moves the picker to it rather than leaving it pointing somewhere else.
  useEffect(() => {
    const p = splitKey(colour)
    if (!p) return
    setFabricId(p.fabricId)
    setGroupId(p.groupId)
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

  const fabrics = fabricIds()
  const fabric = fabricId ?? fabrics[0] ?? null
  const groups = fabric ? groupsFor(fabric) : []
  const group = groups.includes(groupId) ? groupId : groups[0] ?? null
  const shades = fabric && group ? shadesFor(fabric, group) : []
  const chosen = panelFor(colour)

  const pick = (shadeId) => {
    const p = panelOf(fabric, shadeId)
    if (p) emit(p.key)
  }

  return (
    <>
      <Field label="Fabric" hint={fabric ?? '—'}>
        {/* The fabric decides the weave; every one of them is made in all eight
            groups, but that is read off the map rather than assumed. */}
        <Choice
          cols={5}
          value={fabric}
          options={fabrics.map((f) => ({ value: f, label: f }))}
          onChange={(f) => {
            setFabricId(f)
            // Keep the same shade where the new fabric is made in it, so
            // comparing two weaves in one colour is a single click.
            const keep = from?.shadeId && panelOf(f, from.shadeId)
            if (keep) emit(keep.key)
          }}
        />
      </Field>

      <Field label="Colour group" hint={group ?? '—'}>
        <Choice
          cols={4}
          value={group}
          options={groups.map((g) => ({
            value: g,
            label: TEXTILE_GROUPS.find((x) => x.id === g)?.name ?? g,
          }))}
          onChange={setGroupId}
        />
      </Field>

      <Field label="Shade" hint={chosen ? chosen.shadeId : '—'}>
        {/* The thumbnails are 540 B to 3.8 KB — the whole range is 0.3 MB — so
            the swatch can be the fabric itself rather than its average colour.
            The hex is still there underneath as the fallback and as what a fin
            wears until its full sheet arrives. */}
        <div className="flex flex-wrap gap-1.5">
          {shades.map((s) => {
            const p = panelOf(fabric, s.id)
            if (!p) return null
            return (
              <button
                key={s.id}
                type="button"
                title={`${fabric} · ${s.id}`}
                onClick={() => pick(s.id)}
                style={{
                  background: `${p.hex} url(${p.thumbnailUrl}) center/cover no-repeat`,
                }}
                className={`h-7 w-7 rounded-md ring-offset-2 ring-offset-surface transition ${
                  colour === p.key ? 'ring-2 ring-accent' : 'ring-1 ring-line'
                }`}
              />
            )
          })}
        </div>
        {!shades.length && <Note tone="warn">No panels in this combination.</Note>}
      </Field>
    </>
  )
}
