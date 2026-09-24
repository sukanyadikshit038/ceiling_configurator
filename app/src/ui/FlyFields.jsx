// The two decisions a Fly is made of: size, and fabric.
//
// Shorter than the cloud panel on purpose. There is no shape — the shape IS the
// product — and no series, because Fly is offered in one: ten FB3 shades
// out of the 275 Designer Textile panels, which is the shortlist that arrived
// with the models.

import { useSyncExternalStore } from 'react'
import { Field, Choice, Note, Stepper } from './bits.jsx'
import {
  FLY_DROP, FLY_MODELS, flySizes, flyFor, subscribeFlyModel,
  FLY_FABRICS, FLY_WING_M2, flyRequired,
} from '../lib/fly.js'
import { gateOf } from '../lib/gate.js'
import { panelFor, textileReady } from '../lib/textiles.js'

/** Re-renders when a Fly finishes loading, so the measured size can appear. */
function useFlyModels() {
  return useSyncExternalStore(
    subscribeFlyModel,
    () => FLY_MODELS.length,
    () => FLY_MODELS.length
  )
}

export default function FlyFields({ params: p, onChange }) {
  useFlyModels()
  const sizes = flySizes()
  const entry = p.size != null ? flyFor(p.size) : null
  const ready = textileReady()

  // One question at a time — see lib/gate.js. Two fields deep, so the whole
  // staircase is Size, then Fabric, then the height it hangs at.
  const gate = gateOf(p, flyRequired(p))
  const waits = { colour: gate.before('colour'), drop: gate('colour') }
  const first = ['colour', 'drop'].find((k) => waits[k])
  const lock = (k) => (waits[k] ? (k === first ? waits[k] : true) : null)

  return (
    <div className="space-y-3">
      <Field label="Size" hint={entry ? `${entry.feltMeshes} felt panels` : '—'}>
        {/* From the models on disk, not a list here — the day a Fly 6 is added
            it appears by being built. */}
        <Choice
          cols={2}
          value={p.size}
          options={sizes.map((s) => ({ value: s, label: `Fly ${s}` }))}
          onChange={(size) => onChange({ size })}
        />
        {!sizes.length && (
          <Note tone="warn">
            No Fly models found — run <b>node scripts/build-fly.mjs</b>, then{' '}
            <b>npm run manifest</b>.
          </Note>
        )}
      </Field>

      <Field label="Fabric" hint={p.colour ?? '—'} locked={lock('colour')}>
        {!ready ? (
          <Note tone="warn">The Designer Textile map has not loaded.</Note>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {FLY_FABRICS.map((key) => {
              const panel = panelFor(key)
              return (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() => onChange({ colour: key })}
                  style={{ background: panel?.hex ?? '#888' }}
                  className={`h-7 w-7 rounded-md ring-offset-2 ring-offset-surface transition ${
                    p.colour === key ? 'ring-2 ring-accent' : 'ring-1 ring-line'
                  }`}
                />
              )
            })}
          </div>
        )}
        <Note>
          Ten Designer Textile shades, all FB3. The same cloth the baffles and
          clouds are offered in, so a Fly and a baffle in one shade match.
        </Note>
      </Field>

      <Field label="Suspension height" help="Slab to the top of the assembly."
        locked={lock('drop')}>
        <Stepper
          value={Math.round((p.drop ?? FLY_DROP.default) * 1000)}
          min={Math.round(FLY_DROP.min * 1000)}
          max={Math.round(FLY_DROP.max * 1000)}
          step={10}
          unit="mm"
          onChange={(v) => onChange({ drop: v / 1000 })}
        />
      </Field>

      {/* Said rather than left to be discovered. The two numbers people get
          wrong about this product are that it is 363 mm DEEP — ten times a
          cloud panel — and that its felt area is not its footprint. */}
      {entry && (
        <Note>
          Fly {entry.size} occupies {Math.round(entry.plan.x * 1000)} ×{' '}
          {Math.round(entry.plan.z * 1000)} mm and hangs {entry.heightMm} mm deep.
          Its wings are {(FLY_WING_M2 * entry.size).toFixed(1)} m² of felt — more
          than the rectangle it sits in, because they overlap.
        </Note>
      )}
    </div>
  )
}
