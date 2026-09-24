// The three decisions a cloud is made of: shape, size, colour.
//
// In that order, because a shape decides which sizes exist — triangle comes in
// 900 and 1200 only, so offering it 600 would be offering a file that is not
// there. The sizes come from the models on disk rather than from a list here.

import { useSyncExternalStore } from 'react'
import { Field, Select, Note, SliderStepper, LockedBlock } from './bits.jsx'
import { COLOUR_FAMILIES } from '../lib/catalog.js'
import {
  CLOUD_DROP, CLOUD_MODELS, cloudShapes, sizesFor, cloudFor, subscribeCloudModel,
  CLOUD_FAMILIES, cloudIsFabric, cloudIsSeries, CLOUD_THICKNESSES, cloudRequired,
} from '../lib/clouds.js'
import { gateOf } from '../lib/gate.js'
import {
  designsFor, coloursForShape, designsForColour, seriesHex, seriesSwatchCode,
  splitSeriesSwatch, seriesThumbUrl, cloudSeriesReady,
} from '../lib/cloudSeries.js'
import TextileColourPicker from './TextileColourPicker.jsx'
// TEMPORARY, with lib/uvTune.js. Delete both together.
import {
  subscribeTune, tuneVersion, tuneOf, setTune, clearTune, tuneReport, SCALE_RANGE,
} from '../lib/uvTune.js'

const LABEL = { square: 'Square', circle: 'Circle', hexagon: 'Hexagon', triangle: 'Triangle' }

/**
 * Whether the temporary texture rotator is shown. TEMPORARY, with lib/uvTune.js.
 *
 * Off: the angles it was built to find are baked into the artwork now, in
 * FACE_TWEAK in scripts/build-cloud-series.py, so there is nothing left to
 * turn. Turned off rather than deleted because the next design to arrive --
 * CL-02 is missing from the supplied set -- may well be drawn askew the same
 * way, and this is a one-word switch instead of rebuilding the tool.
 *
 * Still AND-ed with import.meta.env.DEV below, so flipping this on cannot put a
 * diagnostic slider in front of a customer.
 */
const SHOW_TUNER = false

/**
 * A blank first entry, so a field nobody has answered does not look answered.
 *
 * For `shape` and `size` -- both of which start null -- the button would
 * otherwise have nothing to say. Select treats an empty value as a placeholder:
 * it labels the unanswered state and is not offered as a row, because "Choose a
 * shape" is not a shape. The "still to choose" line above stays the truth.
 */
const choose = (what, options) =>
  [{ value: '', label: `Choose a ${what}\u2026`, disabled: true }, ...options]

/**
 * Colour, then design -- and the designs are pictures.
 *
 * Round this way because the range allows it and the other way did not read.
 * All 64 images exist: four designs crossed with four shapes crossed with four
 * colours, no gaps. So asking for the colour first never takes a design off the
 * table, which is the thing that would have made the order wrong. Counted off
 * the manifest rather than assumed, and still narrowed below, because the day a
 * design lands in only two colours the picker has to shrink instead of offering
 * a file that is not there.
 *
 * The designs are shown as THUMBNAILS. CL-01 against CL-03 is a watercolour
 * wash against concentric arcs, and six characters say none of that -- the code
 * is an identifier, not a description, and a picker made of identifiers asks
 * you to already know the answer. The code stays as a caption under each one,
 * because that is what goes on an order and what the schedule prints.
 *
 * The pictures are the supplied artwork BEFORE the bleed, which is what keeps
 * the outline: a triangle cloud shows triangles, a circle shows discs, drawn
 * with the artwork's own anti-aliased edge rather than a silhouette this file
 * would otherwise have to know how to draw for four shapes. They sit on a white
 * card because the artwork was drawn on white -- so the white reads as the card
 * rather than as corners showing. See the taking point in
 * scripts/build-cloud-series.py for why it cannot come from the render.
 *
 * Two controls over one value: the spec carries a single code, "CL-01_Blue",
 * and this is the only place that knows it comes apart. The same bargain the
 * textile picker makes with FB1_Blue_2.
 *
 * The SHAPE is still not asked for. The cloud already has one, and the four
 * shapes of a design are the same artwork cut to different outlines; asking
 * again would be asking somebody to agree with themselves. It does decide which
 * pictures are shown, so the chips are of the cloud actually being placed.
 */
function SeriesPicker({ shape, colour, onChange }) {
  if (!cloudSeriesReady()) {
    return <Note tone="warn">Cloud Series artwork has not loaded.</Note>
  }

  const current = splitSeriesSwatch(colour)
  const design = current?.design ?? null
  const chosen = current?.colour ?? null

  const colours = coloursForShape(shape)
  const designs = chosen ? designsForColour(chosen, shape) : []

  const pick = (d, c) => onChange({ colour: seriesSwatchCode(d, c) })

  /**
   * Pick a colour, keeping the design in hand where it is drawn in it.
   *
   * Never falls back across the supplied set -- every design is drawn in every
   * colour -- which is exactly the reason to keep the fallback: it costs one
   * line and it is the difference between a narrower range shrinking the picker
   * and a narrower range writing a code with no file behind it.
   */
  const pickColour = (c) => {
    const made = designsForColour(c, shape)
    const want = design && made.includes(design) ? design : made[0]
    if (want) pick(want, c)
  }

  // Which design the colour chips are measured from: whatever is in hand, and
  // the first before anything is. The chip is what that design AVERAGES to,
  // measured off the image when it was built -- so Blue reads pale under
  // CL-01's wash and strong under CL-05's sunburst. That is the truth about the
  // panel; a fixed blue for the row would be a colour no cloud is.
  const from = design ?? designsFor(shape)[0] ?? null

  return (
    <>
      <Field label="Colour" hint={chosen ?? '—'}>
        <div className="flex flex-wrap gap-1.5">
          {colours.map((c) => (
            <button
              key={c}
              type="button"
              /* The colour and nothing else. It was `${from} ${c}` -- the
                 design it happens to be pictured in -- which spelled "CL-01
                 Red", and the design tile below it spells "CL-01 Red" too. Two
                 controls, one tooltip, two different meanings. The design the
                 chip is drawn from is not what the chip chooses. */
              title={c}
              onClick={() => pickColour(c)}
              style={{ background: seriesHex(from, shape, c) ?? '#888' }}
              className={`h-7 w-7 rounded-md ring-offset-2 ring-offset-surface transition ${
                chosen === c ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
            />
          ))}
        </div>
      </Field>

      {/* The design, once there is a colour to draw it in. Nothing to choose
          between before that: four pictures in four different colours compare
          the colours, not the designs, which is the question already answered
          above. */}
      {chosen && (
        <Field label="Design" hint={design ?? '—'}>
          {/* Four columns, always, however many there are. Measured: the row
              is 237 px, and a fixed 64 px tile made four of them 312 px, so
              they wrapped 3 + 1 -- two ragged rows to choose between four
              things. A grid divides the width it has instead of asking for a
              width it does not, which lands at about 51 px a tile and puts the
              whole range on one line. If CL-02 arrives it becomes five, and
              five in four columns is a tidy 4 + 1 rather than a reflow. */}
          <div className="grid grid-cols-4 gap-1.5">
            {designs.map((d) => {
              const url = seriesThumbUrl(d, shape, chosen)
              return (
                <button
                  key={d}
                  type="button"
                  title={`${d} ${chosen}`}
                  onClick={() => pick(d, chosen)}
                  className={`flex flex-col items-center gap-1 rounded-md p-0.5 transition ${
                    design === d ? 'bg-fill-2' : 'hover:bg-fill'
                  }`}
                >
                  <span
                    className={`block aspect-square w-full overflow-hidden rounded bg-white ring-offset-1 ring-offset-surface transition ${
                      design === d ? 'ring-2 ring-accent' : 'ring-1 ring-line'
                    }`}
                  >
                    {/* object-contain, not cover: the four shapes are four
                        aspect ratios, and cropping a hexagon to a square is
                        cropping off the thing that says it is a hexagon.
                        The hex behind it for a manifest built before the
                        thumbnails existed -- an older picker, not a broken one. */}
                    {url ? (
                      <img src={url} alt="" loading="lazy"
                        className="h-full w-full object-contain" />
                    ) : (
                      <span className="block h-full w-full"
                        style={{ background: seriesHex(d, shape, chosen) ?? '#888' }} />
                    )}
                  </span>
                  <span className={`text-[10px] ${
                    design === d ? 'text-txt' : 'text-txt-3'
                  }`}>{d}</span>
                </button>
              )
            })}
          </div>
        </Field>
      )}
    </>
  )
}

/** Re-renders when a cloud finishes loading, so the measured size can appear. */
function useClouds() {
  return useSyncExternalStore(
    subscribeCloudModel,
    () => CLOUD_MODELS.length,
    () => CLOUD_MODELS.length
  )
}

/**
 * TEMPORARY: turn the artwork until it lines up, then read off the angle.
 *
 * Delete this component and lib/uvTune.js together once the angles are baked
 * into scripts/build-cloud-series.py. Rendered only under `import.meta.env.DEV`
 * and only for Cloud Series, so a production build compiles it out.
 *
 * It changes nothing that is saved. The angle lives in memory, on the decoded
 * texture, and a reload forgets it -- so there is no way to leave a layout
 * carrying a number that only existed while somebody was looking for it.
 *
 * Per DESIGN and SHAPE, not per colour: the four colours of a design are one
 * artwork, and a turn that is right for Blue is right for Red. Per shape,
 * because the four shapes are cut differently and a triangle can be wrong while
 * a circle -- which cannot look wrong -- is not.
 */
function UvTuner({ design, shape }) {
  useSyncExternalStore(subscribeTune, tuneVersion, () => 0)
  if (!design || !shape) return null
  const t = tuneOf(design, shape)
  const set = (patch) => setTune(design, shape, patch)

  // One pair of helpers over a named field, so the size row gets the same
  // snaps and nudges as the angle without a second copy of either.
  const snap = (field, value, label) => (
    <button
      key={`${field}${value}`}
      type="button"
      onClick={() => set({ [field]: value })}
      className={`rounded px-2 py-1 text-[11px] transition ${
        t[field] === value ? 'bg-accent text-on-accent' : 'bg-fill-2 text-txt-2 hover:bg-fill-2'
      }`}
    >{label}</button>
  )

  const nudge = (field, by) => (
    <button
      key={`${field}${by}`}
      type="button"
      onClick={() => set({ [field]: t[field] + by })}
      className="rounded bg-fill-2 px-2 py-1 text-[11px] text-txt-2 transition hover:bg-fill-2"
    >{by > 0 ? `+${by}` : by}</button>
  )

  const heading = (text) => (
    <div className="mb-1 mt-2 text-[10px] font-medium uppercase tracking-wider text-txt-3">
      {text}
    </div>
  )

  const toggle = (field, label) => (
    <button
      type="button"
      onClick={() => set({ [field]: !t[field] })}
      className={`rounded px-2 py-1 text-[11px] transition ${
        t[field] ? 'bg-accent text-on-accent' : 'bg-fill-2 text-txt-2 hover:bg-fill-2'
      }`}
    >{label}</button>
  )

  return (
    <div className="rounded-md border border-dashed border-amber-400/40 bg-amber-400/[0.04] p-2">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-amber-300/80">
          Texture rotator &middot; temporary
        </span>
        <span className="text-[10px] text-txt-3">{design} &middot; {shape}</span>
      </div>

      {heading('Angle')}
      <SliderStepper
        value={t.rot}
        min={-180}
        max={180}
        step={1}
        unit="&deg;"
        onChange={(rot) => set({ rot })}
      />

      <div className="mt-2 flex flex-wrap gap-1">
        {[0, 90, 180, -90].map((d) => snap('rot', d, `${d}°`))}
        {[-1, +1].map((by) => nudge('rot', by))}
      </div>

      {/* Size, as a PERCENTAGE of the artwork as it is drawn now, so 100 is
          "leave it alone" and the number is the one to hand back. Above 100
          the image is cropped by the panel; below it, the edge pixels streak
          outward, because the panel is asking for artwork that is not there.

          Both directions are worth having even though only one can be right:
          if the artwork sits correctly at, say, 103%, that is a measurement of
          how much the image was trimmed past its own edge, and it belongs in
          the build script rather than in a slider. */}
      {heading('Size')}
      <SliderStepper
        value={t.scale}
        min={SCALE_RANGE.min}
        max={SCALE_RANGE.max}
        step={1}
        unit="%"
        onChange={(scale) => set({ scale })}
      />

      <div className="mt-2 flex flex-wrap gap-1">
        {[50, 100, 200].map((s) => snap('scale', s, `${s}%`))}
        {[-1, +1].map((by) => nudge('scale', by))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {toggle('flipU', 'Mirror ↔')}
        {toggle('flipV', 'Mirror ↕')}
        <button
          type="button"
          onClick={() => clearTune(design, shape)}
          className="rounded bg-fill-2 px-2 py-1 text-[11px] text-txt-2 transition hover:bg-fill-2"
        >Reset</button>
      </div>

      {/* The deliverable. Every design/shape that is not square, one line each,
          selectable so it can be pasted straight back. */}
      <pre className="mt-2 select-all whitespace-pre-wrap rounded bg-scrim/30 p-1.5 text-[10px] leading-snug text-txt-2">
{tuneReport()}
      </pre>
      <Note>
        Nothing here is saved. Turn and size it until the artwork sits on the
        panel, then send the lines above &mdash; they go into the build script,
        where the pixels get turned and trimmed once instead of every frame.
      </Note>
    </div>
  )
}

export default function CloudFields({ params: p, onChange }) {
  useClouds()
  const shapes = cloudShapes()
  const sizes = p.shape ? sizesFor(p.shape) : []
  // CLOUD_FAMILIES[0], not a name written out. It used to say 'cloud-solid',
  // which stopped being offered two changes ago — harmless only because
  // reconcileCloud always sets a family, so the ?? never fired. Through a
  // <select> it would have: a value matching no option shows a blank button.
  const family = p.family ?? CLOUD_FAMILIES[0]
  const fabric = cloudIsFabric(p)
  const series = cloudIsSeries(p)
  const swatches = COLOUR_FAMILIES[family]?.swatches ?? []
  const entry = p.shape && p.size ? cloudFor(p.shape, p.size) : null

  // ONE QUESTION AT A TIME. Every field stays on screen; a field is locked
  // until the required answers ABOVE it exist. The order is the product's own
  // (cloudRequired), not a second list kept here — see lib/gate.js.
  //
  // Each entry names the last required answer at or above that field in the
  // panel. Thickness and Series are not themselves required — one has a
  // single answer and the other a default — but they sit below Size, so they
  // wait for it like everything else. A staircase with a step missing out of
  // the middle is not a staircase.
  const gate = gateOf(p, cloudRequired(p))
  const waits = {
    size: gate('shape'),
    thickness: gate('size'),
    family: gate('size'),
    finish: gate('size'),
    drop: gate('colour'),
  }
  // Only the topmost locked field says what it is waiting for; the rest just
  // dim. See Field: a string explains, `true` is silent.
  const first = ['size', 'thickness', 'family', 'finish', 'drop'].find((k) => waits[k])
  const lock = (k) => (waits[k] ? (k === first ? waits[k] : true) : null)

  return (
    <div className="space-y-3">
      <Field label="Shape">
        <Select
          value={p.shape ?? ''}
          options={choose('shape', shapes.map((s) => ({ value: s, label: LABEL[s] ?? s })))}
          onChange={(shape) => onChange({ shape })}
        />
        {!shapes.length && <Note tone="warn">No cloud models found — run npm run manifest.</Note>}
      </Field>

      {/* Present from the start, locked rather than absent. It used to appear
          only once a shape existed, which made the form grow under the cursor
          and hid the fact that a size was going to be asked for at all. */}
      <Field label="Size" hint="mm" locked={lock('size')}>
          {/* From the files on disk, not a list here: triangle has no 600, and
              offering it would be offering a model that does not exist.

              Number() on the way out. Belt and braces now rather than the
              fix it once was: Select is a built listbox and hands back the
              option's own value, so a size arrives as the number 1200 already.
              It was a native <select> for an afternoon, and those hand back
              e.target.value, which is always a STRING — "1200" never equals the
              1200 in the manifest, cloudFor returns null, the panel reports no
              model, and nothing on screen says why. Cheap to keep, and it is
              what stops that afternoon happening twice. */}
          <Select
            value={p.size ?? ''}
            options={choose('size', sizes.map((s) => ({ value: s, label: String(s) })))}
            onChange={(size) => onChange({ size: Number(size) })}
          />
      </Field>

      <Field label="Thickness" hint="mm" locked={lock('thickness')}>
        {/* One option, and it comes answered. A field with a single answer is
            not a question; clicking it only agrees with it.

            It is the PRODUCT's thickness, not the model's. The eleven files are
            drawn at 11.6 to 43.2 mm and no two sizes agree, so the panel stops
            reporting what its own model measures — see CLOUD_THICKNESSES. */}
        <Select
          value={p.thickness ?? ''}
          options={CLOUD_THICKNESSES.map((t) => ({ value: t, label: String(t) }))}
          onChange={(thickness) => onChange({ thickness: Number(thickness) })}
        />
      </Field>

      <Field label="Series" hint={COLOUR_FAMILIES[family]?.label ?? family}
        locked={lock('family')}>
        {/* Which KIND of face, before which one. Changing it clears the colour:
            a cloud-solid code and a fabric key are read from different places,
            and carrying one across would name a swatch the new family has never
            heard of. */}
        <Select
          value={family}
          options={CLOUD_FAMILIES.map((f) => ({
            value: f,
            label: COLOUR_FAMILIES[f]?.label ?? f,
          }))}
          onChange={(f) => onChange({ family: f, colour: null })}
        />
      </Field>

      {/* The finish pickers bring their own Fields, so the branch is wrapped
          rather than each one gated. Same treatment: dimmed and inert, and
          silent because the field above it is already saying why. */}
      <LockedBlock locked={lock('finish')}>
      {series ? (
        <>
          <SeriesPicker shape={p.shape} colour={p.colour} onChange={onChange} />
          <Note>
            Printed on the face. The design is drawn to the shape and covers it
            once — it scales with the panel, so all three sizes wear the same
            artwork. The back of the panel takes the design&rsquo;s own colour.
          </Note>
          {/* TEMPORARY. Off; see SHOW_TUNER. Delete with UvTuner and
              lib/uvTune.js when no design is ever going to need turning again. */}
          {SHOW_TUNER && import.meta.env.DEV && (
            <UvTuner design={splitSeriesSwatch(p.colour)?.design} shape={p.shape} />
          )}
        </>
      ) : fabric ? (
        /* 275 panels — five weaves crossed with 55 shades. Picked COLOUR
           FIRST, the same way a baffle picks it: every shade on screen under
           its group heading, then the five weaves as thumbnails of the colour
           just chosen. Tiles are the last product still asking for the fabric
           first. */
        <>
          <TextileColourPicker colour={p.colour} onChange={onChange} />
          {entry && (
            <Note>
              This cloud shows {Math.round(entry.plan.x * 1000)} ×{' '}
              {Math.round(entry.plan.z * 1000)} mm of cloth, cropped from the
              1200 × 2800 mm panel — the weave is at life size, so a cloud, a tile
              and a baffle in this fabric match.
            </Note>
          )}
        </>
      ) : (
        /* UNREACHABLE as things stand: a cloud is offered a printed range or a
           fabric one, and nothing else, so `series` or `fabric` is always true.
           Left as the third arm of the three-way for the same reason
           reconcileCloud keeps its solid branch — a flat range may come back. */
        <Field label="Colour" hint={p.colour ?? '—'}>
          <div className="flex flex-wrap gap-1.5">
            {swatches.map((sw) => (
              <button
                key={sw.code}
                type="button"
                title={sw.code}
                onClick={() => onChange({ colour: sw.code })}
                style={{ background: sw.hex }}
                className={`h-7 w-7 rounded-md ring-offset-2 ring-offset-surface transition ${
                  p.colour === sw.code ? 'ring-2 ring-accent' : 'ring-1 ring-line'
                }`}
              />
            ))}
          </div>
        </Field>
      )}
      </LockedBlock>

      <Field label="Suspension height" help="Slab to the top of the panel."
        locked={lock('drop')}>
        {/* Swept or typed. The range is 50 to 2000 mm, which is two millimetres
            a pixel on a sidebar-width slider — fine for finding roughly the
            right height, useless for landing on 745, which is what the box
            underneath is for. */}
        <SliderStepper
          value={Math.round((p.drop ?? CLOUD_DROP.default) * 1000)}
          min={Math.round(CLOUD_DROP.min * 1000)}
          max={Math.round(CLOUD_DROP.max * 1000)}
          step={10}
          unit="mm"
          onChange={(v) => onChange({ drop: v / 1000 })}
        />
      </Field>

      {/* Said rather than left to be discovered: the panels do not measure what
          their names say, and it is not rounding — a "600" square is 583 and a
          "1200" is 1166, about 3% under across the range.

          The THICKNESS is deliberately not here any more. It used to report
          what the model measures, which is 11.6 to 43.2 mm across the eleven
          and disagrees with the 40 the product is made in. One number, and it
          is the one above. */}
      {entry && (
        <Note>
          {LABEL[entry.shape]} {entry.size}: the panel measures{' '}
          {Math.round(entry.plan.x * 1000)} × {Math.round(entry.plan.z * 1000)} mm.
        </Note>
      )}
    </div>
  )
}
