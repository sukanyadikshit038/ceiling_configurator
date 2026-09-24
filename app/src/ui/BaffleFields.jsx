import { useSyncExternalStore } from 'react'
import { depthRangeOf,
  BAFFLE_TYPES, BAFFLE_SHARED, COLOUR_FAMILIES,
  baffleWidths, baffleExtent, familySwatches, parseWidth,
  fitSizeMm, openingSizeMm, openingModelParams, OPENING_LENGTH,
  MODEL_SPACING, modelPitch, runLimits, modelMinDropMm, MODEL_FIN_FAMILIES,
  defaultDepthMm,
  acrossUnitMm, pitchOf, gapOf,
  MODEL_SIZE_LIMITS, baffleRequired,
} from '../lib/catalog.js'
import { gateOf } from '../lib/gate.js'
import { FABRICS, subscribe as subscribeFabrics, fabricURL } from '../lib/fabrics.js'
import {
  MODELS, getModelEntry, subscribe as subscribeModels, statusOf, errorOf,
} from '../lib/models.js'
import { useStore } from '../lib/store.js'
import ColourCorePicker from './ColourCorePicker.jsx'
import TextileColourPicker from './TextileColourPicker.jsx'
import OmbrePicker from './OmbrePicker.jsx'
import { gridOf } from '../lib/grid.js'
import { Field, Choice, Stepper, Select, Note, Button, LockedBlock, SubLabel } from './bits.jsx'

/**
 * The parameter editor for a baffle set.
 *
 * Shared by the left panel (editing the brush — defaults for the next set
 * placed) and the right panel (editing the selected set). Keeping it in one
 * place is deliberate: two copies of a form like this drift, and the drift is
 * silent — a control that edits a field the other side never reads just
 * quietly does nothing.
 */

// An unanswered field has no figure to show. "null mm" beside a row of
// unselected buttons reads as a bug rather than as a question.
const mm = (v) => (v == null ? '—' : `${v} mm`)
const mmOpts = (arr) => arr.map((v) => ({ value: v, label: String(v) }))

/** Subscribes to the fabric store so uploads appear without a reload. */
function useFabrics() {
  return useSyncExternalStore(
    subscribeFabrics,
    () => FABRICS,
    () => FABRICS
  )
}

function swatchStyle(sw) {
  if (sw.fabric) {
    const url = fabricURL(sw.fabric.id)
    return url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover' } : { background: '#5b6770' }
  }
  if (sw.from) return { background: `linear-gradient(90deg, ${sw.from}, ${sw.to})` }
  if (sw.hex) return { background: sw.hex }
  if (sw.base) return { background: `linear-gradient(160deg, ${sw.base}, ${sw.grain})` }
  return { background: '#5b6770' }
}

/** Colour family, then a swatch from it. Uploaded fabrics join their family. */
export function FinishPicker({ families, family, colour, onChange }) {
  const fabrics = useFabrics()
  const swatches = familySwatches(family, fabrics)
  const current = swatches.find((s) => s.code === colour)

  const familyField = (
    <Field label="Series">
      <Select
        value={family}
        options={families.map((f) => ({ value: f, label: COLOUR_FAMILIES[f]?.label ?? f }))}
        /* the family's first swatch comes with it: a colour code from the old
           family is not one the new family publishes, and a finish naming a
           colour its family has never heard of renders as neither */
        onChange={(f) => onChange({ family: f, colour: familySwatches(f, fabrics)[0]?.code ?? null })}
      />
    </Field>
  )

  // An ombré is a base colour and the overlay it fades into — two steps, like
  // the weave, and 106 of them.
  if (COLOUR_FAMILIES[family]?.kind === 'colour-core-ombre') {
    return (
      <>
        {familyField}
        <OmbrePicker colour={colour} onChange={(patch) => onChange({ family, ...patch })} />
      </>
    )
  }

  // Designer Textile is 275 panels — five fabrics by 55 shades — which is a
  // wall rather than a grid. Picked COLOUR FIRST here: every shade on screen at
  // once under its group heading, then the five weaves as thumbnails of the
  // colour just chosen. Still written as one code.
  //
  // Baffles, clouds and tiles all pick it this way now.
  if (COLOUR_FAMILIES[family]?.sheet) {
    return (
      <>
        {familyField}
        <TextileColourPicker colour={colour} onChange={(patch) => onChange({ family, ...patch })} />
      </>
    )
  }

  // Colour Core is a colour and a weave, not one swatch out of a grid.
  if (COLOUR_FAMILIES[family]?.kind === 'colour-core') {
    return (
      <>
        {familyField}
        <ColourCorePicker colour={colour} onChange={(patch) => onChange({ family, ...patch })} />
      </>
    )
  }

  return (
    <>
      <Field label="Series">
        <Select
          value={family}
          options={families.map((f) => ({ value: f, label: COLOUR_FAMILIES[f]?.label ?? f }))}
          /* the family's first swatch comes with it: a colour code from the
             old family is not one the new family publishes, and a finish that
             names a colour its family has never heard of renders as neither */
          onChange={(f) => onChange({ family: f, colour: familySwatches(f, fabrics)[0]?.code ?? null })}
        />
      </Field>

      <Field label="Colour" hint={current?.label ?? current?.code ?? '—'}>
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((sw) => (
            <button
              key={sw.code}
              type="button"
              title={sw.label ?? sw.code}
              /* the family travels with the colour — see finFinish(): a colour
                 paired with someone else's family resolves to that family's
                 first swatch, so every swatch here would paint the same thing */
              onClick={() => onChange({ family, colour: sw.code })}
              style={swatchStyle(sw)}
              className={`h-6 w-6 rounded-md ring-offset-2 ring-offset-surface transition ${
                colour === sw.code ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
            />
          ))}
        </div>
        {COLOUR_FAMILIES[family]?.userFabrics && !fabrics.length && (
          <Note>Fabrics you add appear here — see Fabrics in the top bar.</Note>
        )}
      </Field>
    </>
  )
}

/** Subscribes to the model registry so load state and errors show up live. */
function useModels() {
  return useSyncExternalStore(subscribeModels, () => MODELS, () => MODELS)
}

/**
 * Where a baffle's geometry comes from: the catalogue, or a file dropped into
 * public/models/baffles.
 *
 * Without this control a model in that folder is measured into the manifest and
 * then unreachable — there is nothing in the app that would ever render it.
 */
function withoutFinFinishes(finOverrides) {
  const kept = {}
  let cleared = 0
  for (const [index, ov] of Object.entries(finOverrides ?? {})) {
    const { family, colour, ...rest } = ov
    if (family !== undefined || colour !== undefined) cleared++
    if (Object.keys(rest).length) kept[index] = rest
  }
  return { kept, cleared }
}

/** How many fins in this set carry a finish of their own. */
function finishOverrideCount(finOverrides) {
  return withoutFinFinishes(finOverrides).cleared
}

/**
 * The finish of the WHOLE set — the same control a single fin gets, one scope up.
 *
 * There used to be a Model's own / Catalogue switch in front of this, and the
 * swatches only appeared once it was flipped: selecting "All" showed a toggle
 * and no way to colour anything, which is not an option anyone goes looking
 * for. Now the picker is simply there, exactly as it is for a fin.
 *
 * An imported set that has not been given a finish yet shows an empty
 * selection, again like a fin: the file's own materials are what "nothing
 * picked" looks like. Picking a swatch is what adopts the catalogue, so the
 * flag that used to be a button is now a consequence of the choice.
 */
export function SetFinish({ params, onChange }) {
  const p = params
  const bt = BAFFLE_TYPES[p.btype] ?? BAFFLE_TYPES.vmt
  // how many fins carry a finish of their own — this picker is about to
  // replace them, and says so
  const finFinishes = finishOverrideCount(p.finOverrides)

  // A catalogue set always has a finish. A model set has one only once it has
  // been chosen, because until then its fins are still wearing the file's.
  const chosen = !p.model || !!p.finishAll

  // The finish here is the SET's finish, so it paints every fin — a fin that
  // was given its own colour included. Leaving those behind would mean the
  // whole-set colour visibly failed to apply to the whole set.
  const setFinish = (patch) => {
    const next = p.model ? { ...patch, finishAll: true } : patch
    if (!finFinishes) return onChange(next)
    onChange({ ...next, finOverrides: withoutFinFinishes(p.finOverrides).kept })
  }

  return (
    <>
      <FinishPicker
        families={p.model ? MODEL_FIN_FAMILIES : bt.families}
        family={chosen ? p.family : MODEL_FIN_FAMILIES[0]}
        colour={chosen ? p.colour : null}
        onChange={setFinish}
      />

      {p.model && !chosen && (
        <Note>Until a colour is picked, every fin keeps the material the file was authored with.</Note>
      )}

      {finFinishes > 0 && (
        <Note tone="warn">
          {finFinishes} fin{finFinishes === 1 ? ' has' : 's have'} their own colour. Picking one
          here repaints the whole set, those included.
        </Note>
      )}
    </>
  )
}

/**
 * `finish` is off when the caller is already showing SetFinish somewhere else —
 * the focus editor puts it beside the selection, so repeating it in the form
 * below would be two controls for one value.
 */

// ---------------------------------------------------------------------------
// the product: type, then shape, then the dimensions the workbook publishes
// ---------------------------------------------------------------------------

/**
 * A type or shape is buildable when a model file sits in the tree for it —
 * public/models/baffles/<Type>/<Shape>.fbx. Everything the workbook lists is
 * still shown; what has no file is offered as coming soon, which is truer than
 * omitting a product that exists on paper.
 */
function useAvailability() {
  const models = useModels()
  return {
    forType: (btype) => models.filter((m) => m.type === btype),
    forShape: (btype, shape) => models.find((m) => m.type === btype && m.shape === shape) ?? null,
  }
}

/**
 * Adopt a type/shape pair, bringing its model with it.
 *
 * `blank` is the brush: choosing a type there chooses ONLY the type. Picking
 * its first shape on the user's behalf is what "nothing is pre-selected" is
 * meant to stop, and it would carry a model in with it.
 */
function pickProduct(onChange, avail, btype, shape, blank = false) {
  if (blank) { onChange({ btype, shape: null, model: null, modelName: null }); return }
  const model = shape ? avail.forShape(btype, shape) : (avail.forType(btype)[0] ?? null)
  onChange({ btype, shape: shape ?? null, model: model?.id ?? null, modelName: model?.name ?? null })
}

function TypeField({ params: p, onChange, blank = false }) {
  const avail = useAvailability()

  return (
    <Field label="Baffle type">
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(BAFFLE_TYPES).map(([key, t]) => {
          const ready = avail.forType(key).length > 0
          return (
            <Button
              key={key}
              active={p.btype === key}
              disabled={!ready}
              title={ready ? t.label : t.label + ' — no model yet'}
              className="h-7 px-0"
              onClick={() => pickProduct(
                onChange, avail, key, blank ? null : (t.shapes ? Object.keys(t.shapes)[0] : null), blank,
              )}
            >
              {t.label.split(' ')[0]}
            </Button>
          )
        })}
      </div>
      {!avail.forType(p.btype).length && (
        <div className="mt-1.5">
          <Note tone="warn">
            No model for this type yet. Drop one into public/models/baffles/ under a folder
            named for the type and it appears here.
          </Note>
        </div>
      )}
    </Field>
  )
}

function ShapeField({ params: p, onChange }) {
  const avail = useAvailability()
  const bt = BAFFLE_TYPES[p.btype]
  if (!bt?.shapes) return null

  return (
    <Field
      label="Shape"
      help="Standard — constant depth. Flow — depth undulates along the run. Tapered — depth runs from one value to another."
    >
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(bt.shapes).map(([key, sh]) => {
          const ready = !!avail.forShape(p.btype, key)
          return (
            <Button
              key={key}
              active={p.shape === key}
              disabled={!ready}
              title={ready ? sh.label : sh.label + ' — no model yet'}
              className="h-7 px-0"
              onClick={() => pickProduct(onChange, avail, p.btype, key)}
            >
              {sh.label}
            </Button>
          )
        })}
      </div>
    </Field>
  )
}

/**
 * Fin count, capped at what the ceiling can hold.
 *
 * The cap is the point: update() refuses a run that will not fit, and refuses it
 * silently, so an uncapped control would just snap back.
 */
function CountField({ params: p, onChange, locked = null }) {
  const room = useStore((s) => s.room())
  const limits = runLimits(p, gridOf(room))
  const maxCount = Math.min(24, limits.maxCount)

  return (
    <>
      <Field
        label="Baffles in the set"
        help="How many fins in this run. The set's footprint grows with it."
        locked={locked}
      >
        <Stepper
          value={Math.min(p.count, Math.max(1, maxCount))}
          min={1} max={Math.max(1, maxCount)} step={1}
          unit={p.count === 1 ? 'fin' : 'fins'}
          onChange={(count) => onChange({ count })}
        />
      </Field>
      {/* Not while the field is locked. runLimits measures a fin that has no
          length or spacing yet, so the cap it reports is arithmetic on blanks —
          a warning about a run nobody has described. */}
      {!locked && maxCount < 24 && (
        <Note tone="warn">
          Limited by the ceiling: this run holds {maxCount} baffle{maxCount === 1 ? '' : 's'}.
        </Note>
      )}
    </>
  )
}

/**
 * Spacing: the four the workbook publishes, and anything else in range.
 *
 * The four were the whole offer, which is fine until the gap you want is 120.
 * reconcile has never held spacing to that list — it clamps to a RANGE — so a
 * value off the list was always legal and there was simply no way to type one.
 *
 * THE RANGE IS NOT THE SAME FOR EVERY SET. reconcile gives a catalogue run
 * 50–200 mm, scaled for 25 mm fins, and a model run 0–2000, because the
 * catalogue's numbers are far too tight for a metre-wide object. This reads the
 * same two, or they would drift apart and the stepper would offer values the
 * store then quietly changed.
 *
 * And the CEILING caps it above that: runLimits knows how far apart this many
 * fins of this length can sit and still fit. Offering more would be offering a
 * run that cannot be placed — the same bargain the fin count makes.
 *
 * TWO SUB-FIELDS, ONE STORED NUMBER. Edge-to-edge is the clear gap the workbook
 * quotes; centre-to-centre is the pitch a setting-out drawing quotes. They are
 * the same decision one object's width apart, so only the gap is stored and the
 * pitch is derived from it through acrossUnitMm — the same definition the
 * renderer spaces by. Storing both would let them disagree, and then nothing on
 * screen would say which one the run was actually built to.
 */
function SpacingField({ params: p, onChange, locked = null }) {
  const room = useStore((s) => s.room())
  const limits = runLimits(p, gridOf(room))
  const range = p.model ? MODEL_SPACING : { min: 50, max: 200 }
  const capped = Number.isFinite(limits.maxSpacing)
    ? Math.min(range.max, limits.maxSpacing)
    : range.max
  const max = Math.max(range.min, capped)
  // A preset the ceiling cannot take is not offered. A button that snaps back
  // is worse than no button.
  const opts = BAFFLE_SHARED.spacings.filter((v) => v >= range.min && v <= max)
  // The one conversion between the two sub-fields, from the one definition the
  // geometry uses.
  const unit = acrossUnitMm(p)
  const start = Math.min(max, 100)

  return (
    <>
      <Field
        label="Baffle spacing"
        hint={mm(p.spacing)}
        help="Edge to edge is the clear gap between fins; centre to centre adds the fin's own width. Set whichever one you have been given."
        locked={locked}
      >
        {/* The workbook's own measure, so its four figures belong under it. */}
        <SubLabel>Edge to edge</SubLabel>
        {!!opts.length && (
          <Choice
            cols={Math.min(4, opts.length)}
            value={p.spacing}
            options={mmOpts(opts)}
            onChange={(spacing) => onChange({ spacing })}
          />
        )}
        {/* Anything in between. Nothing lights above when the value is not one
            of the four, which is exactly right: the buttons are shortcuts, not
            the range. */}
        <div className={opts.length ? 'mt-1.5' : ''}>
          <Stepper
            value={p.spacing}
            min={range.min} max={max} step={5}
            startAt={start}
            unit="mm"
            onChange={(spacing) => onChange({ spacing })}
          />
        </div>

        <SubLabel className="mt-2.5">Centre to centre</SubLabel>
        <Stepper
          value={pitchOf(p)}
          min={range.min + unit} max={max + unit} step={5}
          startAt={start + unit}
          unit="mm"
          /* ROUNDED TO THE NEAREST GAP THAT EXISTS. The gap is stored whole, so
             a model whose width is not whole cannot reach every pitch; what
             comes back is the real centre-to-centre rather than the one that
             was asked for, which is the figure worth trusting. */
          onChange={(pitch) => onChange({ spacing: Math.round(gapOf(p, pitch)) })}
        />
      </Field>
      {!locked && max < range.max && (
        <Note tone="warn">
          Limited by the ceiling: this run allows up to {max} mm edge to edge,
          {' '}{Math.round(max + unit)} mm centre to centre.
        </Note>
      )}
    </>
  )
}

/**
 * How high a baffle may hang, in millimetres.
 *
 * FLOORED AT THE MODEL'S OWN HARDWARE. Hang it shallower and the clamps come
 * through the slab, and the renderer refuses to go higher anyway — modelFins
 * does its own `Math.max(drop, hardwareTop)` — so a control that offered less
 * would be showing a number the scene does not use.
 *
 * Exported because A SINGLE FIN HANGS AT ITS OWN HEIGHT TOO, and had its own
 * copy of this: a hardcoded 50–1200 with no hardware floor, so the fin control
 * could read 50 mm while the fin in front of you hung at the clamp height. The
 * floor is the set's, because a fin hangs from the set's model.
 */
export function dropRangeMm(p) {
  const entry = p?.model ? getModelEntry(p.model) : null
  const hardware = modelMinDropMm(entry, p?.sizeMm)
  return {
    min: Math.max(Math.round(BAFFLE_SHARED.drop.min * 1000), hardware),
    max: Math.round(BAFFLE_SHARED.drop.max * 1000),
    hardware,
  }
}

/** The note that goes with it, wherever the control is shown. */
export function DropNote({ params: p }) {
  const { min, hardware } = dropRangeMm(p)
  if (!(hardware > BAFFLE_SHARED.drop.min * 1000)) return null
  return (
    <Note>
      Measured to the top of the fin. It cannot hang closer than {min} mm — that is the
      height of the model&apos;s own clamps.
    </Note>
  )
}

function DropField({ params: p, onChange, locked = null }) {
  const { min, max } = dropRangeMm(p)

  return (
    <>
      <Field label="Suspension height" locked={locked}>
        <Stepper
          value={Math.max(Math.round(p.drop * 1000), min)}
          min={min} max={max}
          step={10} unit="mm"
          onChange={(v) => onChange({ drop: v / 1000 })}
        />
      </Field>
      {!locked && <DropNote params={p} />}
    </>
  )
}

/**
 * `finish` is off when the caller already shows SetFinish elsewhere — the focus
 * editor puts it beside the selection, so repeating it here would be two
 * controls for one value.
 */
export default function BaffleFields({
  params,
  onChange,
  finish = true,
  // Show Pattern only for a finish that fades along the baffle. Asked for on
  // the left sidebar, where the control was landing in front of people setting
  // up a plain colour, for which it does nothing they can see.
  //
  // Worth knowing if this is ever widened: mirroring is NOT ombre-only in
  // effect. It reverses wood grain and embossed patterns too, so gating it
  // takes that away from those finishes as well.
  patternForOmbreOnly = false,
  // The brush, where a field nobody has chosen must stay unchosen.
  blank = false,
  // Standing beside ONE fin rather than the set.
  //
  // The fields hidden here are the ones whose scope contradicts what is being
  // edited: baffle type, shape, spacing and suspension height belong to the
  // whole run, so reaching for them while a single fin is selected changes
  // every other fin as a side effect of looking at this one. Thickness, length,
  // height, direction and count are set-wide too and stay — they were not asked
  // for, and are what a fin is usually judged against.
  forSingleFin = false,
  // Inside the focus modal, where the baffle is the whole subject. What it is
  // and which way the run lies are decisions taken before you get here, so they
  // are not offered again beside a close-up of one product.
  inFocus = false,
}) {
  const p = params
  const bt = BAFFLE_TYPES[p.btype] ?? BAFFLE_TYPES.blade
  const widths = baffleWidths(p)
  const extent = baffleExtent(p)
  const w = parseWidth(p.width)
  // parseWidth answers 150 for a width nobody has set, which would show as a
  // depth already chosen beside buttons that are all unselected
  const depthLabel = p.width == null ? '—' : (w.a === w.b ? mm(w.a) : w.a + '–' + w.b + ' mm')
  const depthRange = depthRangeOf(p)

  // Which fields this copy of the panel shows, in one place. Four surfaces ask
  // for four different subsets, and spelling the rules out here beats reading
  // them off a scatter of negations further down.
  //
  //                      type  shape  dims  direction  spacing  susp  pattern
  //   left defaults       yes   yes   yes     yes       yes      yes   ombre only
  //   right, whole set    yes   yes   yes     yes       yes      yes   always
  //   a single fin         -     -     -      yes        -        -    ombre only
  //   focus, whole baffle  -     -    yes      -        yes      yes   ombre only
  //
  // `dims` is thickness, length and height. They LEFT the single-fin column:
  // they were shown there and edited the whole run, so changing the thickness
  // of the fin you were looking at changed all eight. A fin carries its own
  // thickness, length and height now — see FinEditor, which is where they are
  // asked for while a fin is selected. Direction and count stay because they
  // are facts about the RUN and have no per-fin meaning.
  // Which way the run LIES, which is not the same as the angle it is at: Rotate
  // steps a quarter turn at a time, so two presses leave a vertical run at 180.
  // That is the same axis, and folding it to 0 keeps a button lit rather than
  // dropping the field to "unchosen" for a set plainly lying one way.
  const lies = p.rot == null ? null : p.rot % 180
  const showType = !forSingleFin && !inFocus
  const showShape = showType
  const showDirection = !inFocus
  const showSpacing = !forSingleFin
  const showDrop = !forSingleFin
  const showDims = !forSingleFin
  const ombreOnlyPattern = patternForOmbreOnly || forSingleFin || inFocus
  // Read from the SET's family, not the selected fin's — see the field itself.
  const showPattern = !ombreOnlyPattern || COLOUR_FAMILIES[p.family]?.kind === 'colour-core-ombre'

  // One question at a time — see lib/gate.js. Every field stays on screen and
  // locks until the answers above it exist, in the order REQUIRED already
  // declares, so the staircase and the "still to choose" line on Place can
  // never disagree about what is outstanding.
  //
  // A type with no shapes drops Shape from its own chain, and `gate.before`
  // then leaves Thickness free rather than waiting for a question that range
  // never asks. Baffle type is not in the chain at all — it always carries a
  // value — so it is never locked, and is the answer everything else descends
  // from.
  //
  // On the other three surfaces this costs nothing: a set that has been placed
  // has answered all of REQUIRED (that is what Place waits for), so every gate
  // reads null and the panel is exactly what it was.
  const gate = gateOf(p, baffleRequired(p))
  const waits = {
    thickness: gate.before('thickness'),
    length: gate.before('length'),
    width: gate.before('width'),
    finish: gate.before('family'),
    rot: gate.before('rot'),
    mirror: gate('rot'),
    spacing: gate.before('spacing'),
    count: gate('spacing'),
    drop: gate('spacing'),
  }
  // Only the topmost locked field says what it is waiting for; the rest just
  // dim. See Field: a string explains, `true` is silent.
  //
  // THE ORDER LISTS WHAT THIS COPY OF THE PANEL RENDERS, and only that. Four
  // surfaces show four different subsets, and handing the explanation to a
  // field that is not on screen — Pattern, which the left sidebar hides for a
  // finish that does not fade — leaves every locked field dimmed in silence
  // with nothing anywhere saying why.
  const order = [
    'thickness', 'length', 'width',
    ...(finish ? ['finish'] : []),
    ...(showDirection ? ['rot'] : []),
    ...(showPattern ? ['mirror'] : []),
    ...(showSpacing ? ['spacing'] : []),
    'count',
    ...(showDrop ? ['drop'] : []),
  ]
  const first = order.find((k) => waits[k])
  const lock = (k) => (waits[k] ? (k === first ? waits[k] : true) : null)

  return (
    <div className="space-y-3.5">
      {showType && <TypeField params={p} onChange={onChange} blank={blank} />}
      {showShape && <ShapeField params={p} onChange={onChange} />}

      {showDims && (
      <Field label="Thickness" hint={mm(p.thickness)} locked={lock('thickness')}>
        <Choice
          cols={Math.min(4, bt.thicknesses.length)}
          value={p.thickness}
          options={mmOpts(bt.thicknesses)}
          onChange={(thickness) => onChange({ thickness })}
        />
      </Field>
      )}

      {showDims && (
      <Field label="Baffle length" hint={mm(p.length)} help="The horizontal run of each fin."
        locked={lock('length')}>
        <Choice cols={4} value={p.length} options={mmOpts(bt.lengths)} onChange={(length) => onChange({ length })} />
      </Field>
      )}

      {showDims && (
      <Field
        label="Baffle height"
        hint={depthLabel}
        locked={lock('width')}
        help={depthRange
          ? 'How far each fin hangs, at its deepest. This shape\'s profile varies along '
            + 'the fin and scales with the figure you set, rather than one end of it moving '
            + 'on its own.'
          : 'How far each fin hangs. Deeper fins absorb more low-mid frequency.'}
      >
        {widths.length > 1 && (
          <Choice
            cols={Math.min(5, widths.length)}
            value={p.width}
            options={widths.map((v) => ({ value: v, label: String(v) }))}
            onChange={(width) => onChange({ width })}
          />
        )}
        {/* The sizes above are shortcuts; this is the range they are drawn
            from. The figure is the fin at its DEEPEST — for a taper the hint
            above shows both ends of what that gives. Nothing lights up when
            the depth is not one of the published sizes, which is right. */}
        {depthRange && (
          <div className={widths.length > 1 ? 'mt-1.5' : ''}>
            <Stepper
              value={p.width == null ? null : Math.max(w.a, w.b)}
              min={depthRange.min}
              max={depthRange.max}
              step={depthRange.step}
              startAt={defaultDepthMm(p) ?? depthRange.max}
              unit="mm"
              onChange={(width) => onChange({ width })}
            />
          </div>
        )}
        {!depthRange && widths.length <= 1 && (
          <Note>
            {depthLabel} — this shape comes in one depth, and its profile varies along
            the fin.
          </Note>
        )}
      </Field>
      )}

      {/* SetFinish brings its own Fields — family, then the swatches, then
          whatever notes apply — so the block is wrapped rather than each one
          gated. Silent, because the locked field above it is already saying
          which answer everything is waiting on. */}
      {finish && (
        <LockedBlock locked={lock('finish')} className="space-y-3.5">
          <SetFinish params={p} onChange={onChange} />
        </LockedBlock>
      )}

      {showDirection && (
        <Field
          label="Direction"
          hint={lies == null ? '—' : (lies === 0 ? 'Vertical' : 'Horizontal')}
          help="Which way the run lies on the ceiling."
          locked={lock('rot')}
        >
          {/* `p.rot`, not `p.rot ?? 0`. Direction is a field somebody has to
              choose — it is in REQUIRED and Place stays faded until it is
              answered — so defaulting the DISPLAY to 0 lit Vertical under a
              question nobody had answered, beside a Place button whose tooltip
              still listed Direction as outstanding. The same trap the depth
              label fell into with parseWidth. */}
          <Choice
            cols={2}
            value={lies}
            options={[{ value: 0, label: 'Vertical' }, { value: 90, label: 'Horizontal' }]}
            onChange={(rot) => onChange({ rot })}
          />
        </Field>
      )}

      {/* showPattern reads the SET's family, not the selected fin's: mirroring
          alternates the whole run, so it is the run's finish that decides
          whether there is anything to see. A single fin wearing an ombre inside
          a plain set does not bring the control back. */}
      {showPattern && (
        <Field
          label="Pattern"
          help="Alternate mirrors every second baffle, so a directional finish reverses down the run."
          locked={lock('mirror')}
        >
          <Choice
            cols={2}
            value={p.mirror ?? 'straight'}
            options={BAFFLE_SHARED.mirrors}
            onChange={(mirror) => onChange({ mirror })}
          />
        </Field>
      )}

      {showSpacing && <SpacingField params={p} onChange={onChange} locked={lock('spacing')} />}

      <CountField params={p} onChange={onChange} locked={lock('count')} />
      {showDrop && <DropField params={p} onChange={onChange} locked={lock('drop')} />}

      {Number.isFinite(extent.length) && Number.isFinite(extent.width) ? (
        <Note>
          Set covers {extent.length.toFixed(2)} × {extent.width.toFixed(2)} m
          {' · '}{p.count} fin{p.count === 1 ? '' : 's'}
        </Note>
      ) : (
        <Note>The set's footprint follows from the choices above.</Note>
      )}
    </div>
  )
}
