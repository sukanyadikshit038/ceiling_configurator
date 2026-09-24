// The five decisions a ceiling tile is made of: type, size, grid, base colour,
// perforation.
//
// In that order, because each one narrows the next. A type names a range, a
// size names which folder of that range the panels are read from AND which
// models exist, a grid width picks between those models, a base colour comes
// out of the size's folder, and a perforation is laid over whatever the base
// turned out to be. The same shape as the baffle panel, which is why it reads
// the same way even though nothing is shared.
//
// Size and grid are both MODEL choices here, not finishes: the supplied set is
// four files, 600x600 and 1200x600 each in a 15 mm and a 24 mm tee.

import { useEffect, useSyncExternalStore } from 'react'
import { Field, Choice, Note, Stepper, LockedBlock } from './bits.jsx'
import {
  TILE_TYPES, TILE_SIZES, tileSizeKeys, woodsFor, perforationsFor, drawnPanelMm,
  tileTypeOf, tileGridsFor, tileModelFor, TILE_FIELD, sizesForType,
  tileIsFabric, tileTypesOffered, TILE_THICKNESSES, tileRequired,
} from '../lib/tiles.js'
import { gateOf } from '../lib/gate.js'
import { warmThumbs, thumbFor, subscribeThumbs, thumbVersion } from '../lib/tileThumbs.js'
import TextileColourPicker from './TextileColourPicker.jsx'

function useThumbs(files) {
  useEffect(() => { warmThumbs(files) }, [files.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(subscribeThumbs, thumbVersion, thumbVersion)
}

/**
 * A row of panels to choose from.
 *
 * The chip shows the panel itself once its picture has been made — see
 * lib/tileThumbs.js, which is doing that one file at a time in the background.
 * Until then it shows the code, which is what the specification actually
 * carries, so the control is usable from the first frame rather than being a
 * row of empty squares.
 *
 * The chip carries the panel's own PROPORTIONS: a 1200 x 600 panel is a 2:1
 * chip. Two sizes of the same code drawn at the same shape would be two chips
 * claiming to be the same thing.
 */
function PanelGrid({ label, hint, panels, value, onChange, empty, wide, locked = null }) {
  const chip = wide ? 'w-[74px]' : 'w-9'

  // LOCKED IS NOT EMPTY, and the difference matters because `empty` says to go
  // and run the manifest. The panels for a size nobody has chosen are not
  // missing; they are not knowable yet. Reporting a fault there would send
  // somebody off to rebuild a manifest that is perfectly correct.
  //
  // The placeholders are so the field keeps its own shape while it waits — a
  // bare label over nothing reads as a row that failed to load.
  if (locked) {
    return (
      <Field label={label} locked={locked}>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`h-9 ${chip} rounded-md bg-fill ring-1 ring-line`} />
          ))}
        </div>
      </Field>
    )
  }

  if (!panels.length) return <Field label={label}><Note tone="warn">{empty}</Note></Field>

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5">
        {panels.map((p) => {
          const src = thumbFor(p.file)
          return (
            <button
              key={p.code}
              type="button"
              title={p.code}
              onClick={() => onChange(p.code)}
              className={`h-9 overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition ${chip} ${
                value === p.code ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
              style={src
                ? { backgroundImage: `url(${src})`, backgroundSize: 'cover' }
                : { background: '#4a5058' }}
            >
              {!src && (
                <span className="block text-[8px] leading-tight text-txt-2">
                  {p.code.replace(/^[A-Z]+-[A-Z]+-/, '')}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

export default function TileFields({ params: p, onChange }) {
  // The sizes the chosen TYPE is made in, not every size the folders hold:
  // Temp is one square model and a 2:1 panel on it would be stretched.
  const sizes = p.ttype ? sizesForType(p.ttype) : tileSizeKeys()
  const woods = p.size ? woodsFor(p.size) : []
  const perfs = p.size ? perforationsFor(p.size) : []
  useThumbs([...woods, ...perfs].map((x) => x.file))

  // The shallowest the loaded model can hang, mirroring the baffle field's
  // hardware minimum. Zero until the file has loaded, rather than a number
  // invented here for a model nobody has measured yet.
  // The widths the MODELS publish for the chosen size, rather than a list here:
  // a 38 mm set would be four more files in the folder and nothing to change.
  // Only a range that resolves its model BY (size, grid) has a grid to choose.
  // Temp and Univic Strip each name one file, so the control would be inert —
  // which is worse than absent, because an inert control looks broken.
  const asksGrid = !tileTypeOf(p.ttype).model
  const grids = asksGrid ? tileGridsFor(p.size) : []
  const model = tileModelFor(p)
  // A file holding ONE tile is repeated into a field, and how many is the
  // user's to say. A file that is already a block is not offered the control,
  // because repeating it would be repeating a ceiling.
  const field = !!model && (model.tilesInFile ?? 1) === 1
  const nx = p.cols ?? TILE_FIELD.default
  const nz = p.rows ?? TILE_FIELD.default
  const mod = p.moduleMm ?? model?.moduleMm ?? null
  const wide = p.size === '1200x600'
  // Against the tile of the CHOSEN type, not a constant: the two ranges are on
  // different modules, and quoting one range's tile while the other is selected
  // is how a number nobody can check ends up on screen.
  const tile = p.tileMm ?? tileTypeOf(p.ttype).tileMm
  const fabric = tileIsFabric(p)
  const drawn = p.size ? drawnPanelMm(p.size, tile) : null
  const spec = p.size ? TILE_SIZES[p.size] : null
  const over = drawn && spec ? (drawn.x / spec.panel.x - 1) * 100 : 0

  // One question at a time. Every field is on screen from the start and locks
  // until the answers above it exist — see lib/gate.js. The order is the
  // range's own (tileRequired), so it drops Grid for a range with its frame
  // built in and swaps the facing for a fabric one, and the panel follows.
  //
  // `gate.before` rather than naming the key above by hand: Univic Strip has no
  // Grid, and gating Thickness on a question that range never asks would leave
  // it open with no Size chosen.
  const gate = gateOf(p, tileRequired(p))
  const waits = {
    size: gate.before('size'),
    grid: gate.before('grid'),
    thickness: gate.before('thickness'),
    tiles: gate('thickness'),
    face: fabric ? gate.before('textile') : gate.before('wood'),
    perforation: gate.before('perforation'),
  }
  // Whether a block is repeated into a field depends on the FILE, so it is not
  // knowable until the model resolves. Shown while that is still open, and gone
  // once the file turns out to hold a block already — the same treatment Grid
  // gets from a range that has no grids.
  const asksTiles = model ? field : true

  // Only the topmost locked field says what it is waiting for. THE ORDER LISTS
  // WHAT IS ON SCREEN, and only that: a range with its frame built in has no
  // Grid and a fabric one has no Perforation, and handing the explanation to a
  // field that is not rendered leaves the panel locked and silent.
  const order = [
    'size',
    ...(asksGrid ? ['grid'] : []),
    'thickness',
    ...(asksTiles ? ['tiles'] : []),
    'face',
    ...(fabric ? [] : ['perforation']),
  ]
  const first = order.find((k) => waits[k])
  const lock = (k) => (waits[k] ? (k === first ? waits[k] : true) : null)

  return (
    <div className="space-y-3">
      <Field label="Type">
        <Choice
          cols={2}
          value={p.ttype}
          options={tileTypesOffered().map((t) => ({ value: t.id, label: t.label }))}
          onChange={(ttype) => onChange({ ttype })}
        />
      </Field>

      <Field label="Size" hint="mm" locked={lock('size')}>
        {/* Before the finishes, because it decides which folder they come from.
            Changing it does not clear a colour already chosen — both sizes
            publish the same eight codes and the same twelve perforations. */}
        <Choice
          cols={2}
          value={p.size}
          options={sizes.map((k) => ({ value: k, label: TILE_SIZES[k].label }))}
          onChange={(size) => onChange({ size })}
        />
        {!sizes.length && <Note tone="warn">No panel sizes found — run npm run manifest.</Note>}
      </Field>

      {asksGrid && (
        <Field label="Grid" hint="exposed tee" locked={lock('grid')}>
          {/* A different FILE, not a different finish. The widths come from the
              models on disk, so a size with only one is not offered a choice it
              does not have. */}
          <Choice
            cols={2}
            value={p.grid}
            options={grids.map((g) => ({ value: g, label: `${g} mm` }))}
            onChange={(grid) => onChange({ grid })}
          />
          {/* Only once a size is chosen. Before that there is no size for a
              model to be missing from, and the warning would be inviting
              somebody to rebuild a manifest that is fine. */}
          {p.size && !grids.length && (
            <Note tone="warn">No grid model for this size — run npm run manifest.</Note>
          )}
        </Field>
      )}

      <Field label="Thickness" hint={p.thickness ? `${p.thickness} mm` : '—'}
        locked={lock('thickness')}>
          {/* The BOARD, not the tee. It does not change the model — the supplied
              files are one thickness each — so this is specification only: it
              reaches the schedule and nothing else. */}
          <Choice
            cols={3}
            value={p.thickness}
            options={TILE_THICKNESSES.map((t) => ({ value: t, label: `${t} mm` }))}
            onChange={(thickness) => onChange({ thickness })}
          />
          <Note>
            Specification only — the panel renders the same at every thickness.
          </Note>
      </Field>

      {asksTiles && (
        <Field
          label="Tiles"
          hint={`${nx} × ${nz}`}
          locked={lock('tiles')}
          help="How many tiles this block lays. Inside a block they sit at the true module, so there is no joint between them."
        >
          <div className="grid grid-cols-2 gap-2">
            <Stepper
              value={nx}
              min={TILE_FIELD.min}
              max={TILE_FIELD.max}
              step={1}
              unit="across"
              onChange={(cols) => onChange({ cols })}
            />
            <Stepper
              value={nz}
              min={TILE_FIELD.min}
              max={TILE_FIELD.max}
              step={1}
              unit="down"
              onChange={(rows) => onChange({ rows })}
            />
          </div>
          {mod && (
            <Note>
              {nx * nz} {nx * nz === 1 ? 'tile' : 'tiles'} ·{' '}
              {((nx * mod.x) / 1000).toFixed(2)} × {((nz * mod.z) / 1000).toFixed(2)} m on a{' '}
              {Math.round(mod.x)} × {Math.round(mod.z)} mm module. Blocks snap to
              that module, so two placed side by side share one tee.
            </Note>
          )}
        </Field>
      )}

      {/* The face. Present from the start rather than replaced by "Choose a
          size to see the panels it comes in" — that sentence is now said by the
          lock, in the place the answer is going to appear. */}
      {fabric ? (
        <LockedBlock locked={lock('face')}>
          {/* A fabric-faced tile wears ONE thing, and it is not a colour out
              of a grid: the range is 275 panels — five weaves crossed with 55
              shades — picked COLOUR FIRST, the same way a baffle and a cloud
              pick it. A tile writes it under `textile` rather than `colour`,
              because a tile already has a `wood` and the two are read from
              different maps — hence the field name going in.
              No perforation follows it, because the PF codes are Wood
              Classic's and a fabric face is fabric edge to edge. */}
          <TextileColourPicker colour={p.textile} field="textile" onChange={onChange} />
          <Note>
            A tile shows {Math.round(tile.x)} × {Math.round(tile.z)} mm of cloth,
            cropped from the 1200 × 2800 mm panel — the weave is at life size, so
            a tile and a baffle in this fabric match. Every tile takes the same
            crop, so a large field will repeat.
          </Note>
        </LockedBlock>
      ) : (
        <>
          <PanelGrid
            label="Base colour"
            hint={p.wood ?? '—'}
            panels={woods}
            value={p.wood}
            onChange={(wood) => onChange({ wood })}
            empty="No Wood Classic panels in this size — run npm run manifest."
            wide={wide}
            locked={lock('face')}
          />

          <PanelGrid
            label="Perforation"
            hint={p.perforation ?? '—'}
            panels={perfs}
            value={p.perforation}
            onChange={(perforation) => onChange({ perforation })}
            empty="No perforations in this size — run npm run manifest."
            wide={wide}
            locked={lock('perforation')}
          />
        </>
      )}

      {/* NOT OFFERED. A tile ceiling hangs at one height and it is not a
          decision taken per block: asked for as "there will be no suspension
          height option in ceiling tiles".

          The value is still there and still drives the render — the block hangs
          at the range's own default and the corner rods are scaled to it — it is
          that nobody is asked. A saved file that carries its own drop still
          loads and still draws at that height; this takes away the control, not
          the property. Baffles and clouds keep theirs, because those DO hang at
          a height somebody chooses. */}

      <Note>
        The perforation is painted over the base, not cut through it — the supplied
        images are opaque JPEGs.
      </Note>

      {/* Said plainly rather than left for someone to measure off a screenshot:
          the delivered model's tiles are 1265 x 1289 mm, which is neither
          module, so a panel renders a few per cent oversize until the geometry
          is rebuilt from the module. */}
      {spec && drawn && (
        <Note tone={Math.abs(over) > 4 ? 'warn' : 'dim'}>
          {spec.panel.x} × {spec.panel.z} mm panels, drawn at{' '}
          {drawn.x.toFixed(0)} × {drawn.z.toFixed(0)} mm on this model&apos;s{' '}
          {tile.x.toFixed(0)} × {tile.z.toFixed(0)} mm tile — about{' '}
          {Math.abs(Math.round(over))}% {over > 0 ? 'oversize' : 'undersize'}.
        </Note>
      )}
    </div>
  )
}
