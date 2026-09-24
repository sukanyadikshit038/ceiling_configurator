// Per-fin editing, shared by the right panel and the focus editor.
//
// Both name the set explicitly rather than relying on the selection, so the
// focus editor keeps working on its subject even when something behind it —
// an undo, say — has cleared the selection.

import { useStore } from '../lib/store.js'
import { BAFFLE_TYPES, baffleWidths, MODEL_FIN_FAMILIES, finFinish } from '../lib/catalog.js'
import { FinishPicker, dropRangeMm, DropNote } from './BaffleFields.jsx'
import { Panel, Button, Field, Choice, Stepper, Note } from './bits.jsx'

/**
 * Editor for one fin inside a set.
 *
 * The workbook allows a run to vary fin by fin, so a fin carries its own
 * optional family/colour/depth/drop. Anything left unset inherits the set —
 * which is why "Reset to set" deletes the override rather than writing the
 * set's current value into it.
 */
export function FinEditor({ item, index }) {
  const updateFinOf = useStore((s) => s.updateFinOf)
  const resetFinOf = useStore((s) => s.resetFinOf)
  const selectFinOf = useStore((s) => s.selectFinOf)

  const p = item.params
  const ov = p.finOverrides?.[index] ?? {}
  const bt = BAFFLE_TYPES[p.btype] ?? BAFFLE_TYPES.vmt
  const isModel = !!p.model
  // What this fin is actually rendering in — its own finish, or the set's, or
  // (a model only) the file's own materials. Reading the family from here and
  // the colour from somewhere else is precisely the mix finFinish exists to
  // stop: the picker would show a family that does not publish the colour
  // beside it, and clicking any swatch would paint the same thing.
  const effective = finFinish(p, index)
  const family = effective?.family ?? MODEL_FIN_FAMILIES[0]
  const colour = effective?.colour ?? null
  const overridden = Object.keys(ov).length > 0
  // A fin hangs from the set's model, so the range is the set's.
  const drop = dropRangeMm(p)
  const finishSet = isModel ? !!effective : true

  const set = (patch) => updateFinOf(item.id, index, patch)

  return (
    <Panel
      title={`Fin ${index + 1} of ${p.count}`}
      right={
        <button
          type="button"
          onClick={() => selectFinOf(item.id, null)}
          className="text-[11px] text-txt-3 hover:text-txt"
        >
          close
        </button>
      }
    >
      <div className="space-y-3.5">
        <Note tone={overridden ? 'warn' : 'dim'}>
          {overridden ? 'This fin overrides the set.' : 'This fin follows the set.'}
        </Note>

        <Field label="Show this fin">
          <Choice
            cols={2}
            value={!ov.hidden}
            options={[{ value: true, label: 'Shown' }, { value: false, label: 'Hidden' }]}
            onChange={(v) => set({ hidden: !v })}
          />
        </Field>

        {!ov.hidden && (
          <>
            <FinishPicker
              families={isModel ? MODEL_FIN_FAMILIES : bt.families}
              family={family}
              colour={colour}
              onChange={(patch) => set(patch)}
            />
            {isModel && (
              <Note>
                {finishSet
                  ? 'This fin is finished from the catalogue.'
                  : "Pick a colour to override the model's own material."}
              </Note>
            )}

            {/* THE FIN'S OWN DIMENSIONS.
                These used to live in the set panel below, where they edited the
                whole run: changing the thickness of the fin you were looking at
                changed all eight of them. A fin may now be thicker, longer or
                deeper than its set, and the set's reserved footprint grows to
                cover the biggest one — see baffleExtent.
                Whose number is showing is spelled out, because a control
                displaying the set's value gives no clue that it is the set's.
                Face depth was called that here and Baffle height in the set
                panel; one thing, one name. */}
            <Field label="Thickness" hint={ov.thickness == null ? "the set's" : 'this fin'}>
              <Choice
                cols={Math.min(4, bt.thicknesses.length)}
                value={ov.thickness ?? p.thickness}
                options={bt.thicknesses.map((v) => ({ value: v, label: String(v) }))}
                onChange={(thickness) => set({ thickness })}
              />
            </Field>

            <Field
              label="Baffle length"
              hint={ov.length == null ? "the set's" : 'this fin'}
              help="The horizontal run of this fin."
            >
              <Choice
                cols={4}
                value={ov.length ?? p.length}
                options={bt.lengths.map((v) => ({ value: v, label: String(v) }))}
                onChange={(length) => set({ length })}
              />
            </Field>

            {/* Offered for a model too now. A model fin is scaled from its own
                size, so the depth is as adjustable as the other two — it was
                hidden here only because the scale used to be the set's. */}
            {baffleWidths(p).length > 1 && (
              <Field label="Baffle height" hint={ov.width == null ? "the set's" : 'this fin'}>
                <Choice
                  cols={3}
                  value={ov.width ?? p.width}
                  options={baffleWidths(p).map((v) => ({ value: v, label: String(v) }))}
                  onChange={(width) => set({ width })}
                />
              </Field>
            )}

            {/* THE SAME FIELD THE SET HAS, under the same name and with the
                same limits — see dropRangeMm.

                It used to be called "Drop below slab" and ran 50–1200 with no
                hardware floor: a different name for the thing the rest of the
                app calls Suspension height, so somebody looking for it in this
                panel did not find it, and a range that let the control read
                50 mm while modelFins hung the fin at the clamp height.

                The hint says whose number it is. A fin with no drop of its own
                follows the set, and changing the set moves it — which is not
                obvious from a stepper showing the set's value. */}
            {/* NOT called Direction: at set level that is which way the RUN
                lies, and two things under one name in one panel is the fault
                that had Baffle height calling itself Face depth here.

                A half turn is the whole offer. The field carries a rotation in
                degrees because the model builder already reads one, and an
                angle nobody can type is an angle nobody can get wrong. */}
            <Field
              label="Facing"
              hint={ov.rotDeg ? 'this fin' : "the run's"}
              help="Turns this fin round, so a tapered profile or a finish that runs one way goes the other."
            >
              <Choice
                cols={2}
                value={Math.abs((ov.rotDeg ?? 0) % 360) === 180}
                options={[
                  { value: false, label: 'Straight' },
                  { value: true, label: 'Reversed' },
                ]}
                onChange={(v) => set({ rotDeg: v ? 180 : 0 })}
              />
            </Field>

            <Field
              label="Suspension height"
              hint={ov.drop == null ? "the set's" : 'this fin'}
              help="Slab to the top of this fin."
            >
              <Stepper
                value={Math.max(Math.round((ov.drop ?? p.drop) * 1000), drop.min)}
                min={drop.min} max={drop.max} step={10} unit="mm"
                onChange={(v) => set({ drop: v / 1000 })}
              />
            </Field>
            <DropNote params={p} />

          </>
        )}

        <Button
          variant="outline"
          className="h-8 w-full"
          disabled={!overridden}
          onClick={() => resetFinOf(item.id, index)}
        >
          Reset to set
        </Button>
      </div>
    </Panel>
  )
}

/**
 * Reach the whole set, or any fin in it, by number.
 *
 * "All" is not a no-op that happens to clear the fin selection: no fin picked
 * IS the whole set selected, and the set is what the colour under it paints.
 * Making that a chip of its own means there is a way back to the set from a
 * fin, and something showing which of the two you are editing.
 */
export function FinPicker({ item, label = true }) {
  const selectedFin = useStore((s) => s.selectedFin)
  const selectFinOf = useStore((s) => s.selectFinOf)
  const overrides = item.params.finOverrides ?? {}
  const n = Math.max(1, item.params.count | 0)
  const whole = !(selectedFin?.id === item.id && selectedFin.index != null)

  return (
    <div>
      {label && (
        <div className="mb-1.5 text-[11px] font-medium text-txt-2">
          Fins <span className="text-txt-3">— click one here or in the 3D view</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          title="Select the whole set — every fin at once"
          onClick={() => selectFinOf(item.id, null)}
          className={`h-6 rounded px-2 text-[10px] font-medium transition ${
            whole ? 'bg-accent text-on-accent' : 'bg-fill text-txt-2 hover:bg-fill-2'
          }`}
        >
          All
        </button>
        {Array.from({ length: n }, (_, i) => {
          const ov = overrides[i]
          const edited = ov && Object.keys(ov).length > 0
          const on = selectedFin?.id === item.id && selectedFin.index === i
          return (
            <button
              key={i}
              type="button"
              title={ov?.hidden ? `Fin ${i + 1} — hidden` : `Fin ${i + 1}${edited ? ' — edited' : ''}`}
              onClick={() => selectFinOf(item.id, on ? null : i)}
              className={`h-6 min-w-[1.5rem] rounded px-1 text-[10px] tabular-nums transition ${
                on ? 'bg-accent text-on-accent'
                  : ov?.hidden ? 'bg-fill text-txt-3 line-through'
                  : edited ? 'bg-accent/20 text-accent'
                  : 'bg-fill text-txt-2 hover:bg-fill-2'
              }`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
