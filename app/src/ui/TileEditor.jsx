// The editor stack for one tile block: which tile (or the whole block) is being
// worked on, and that thing's finish.
//
// Shared by the right panel and the focus editor, for the same reason
// SetEditor is: "the right panel offers the same options as the focus view" is
// a requirement, not a coincidence, and the only way to keep it true is for
// there to be one of these.

import { useStore } from '../lib/store.js'
import TileFields from './TileFields.jsx'
import { TILE_SIZES, tileFinishOf, tileEditCount, woodsFor, perforationsFor } from '../lib/tiles.js'
import { thumbFor } from '../lib/tileThumbs.js'
import { Panel, Note, Button, Field } from './bits.jsx'

/**
 * Every tile in the block, as a grid of chips laid out the way they sit.
 *
 * Row-major, matching the reading order the loader sorts the faces into — so
 * the third chip is the third tile from the left of the top row, on screen and
 * in the model both. An edited tile is ringed, so "which ones have I changed"
 * is answered by looking rather than by clicking through them.
 */
function TilePicker({ item }) {
  const selectedFin = useStore((s) => s.selectedFin)
  const selectFinOf = useStore((s) => s.selectFinOf)
  const resetAllTilesOf = useStore((s) => s.resetAllTilesOf)

  const p = item.params
  const cols = p.cols ?? 4
  const rows = p.rows ?? 3
  const picked = selectedFin?.id === item.id ? selectedFin.index : null
  const edits = tileEditCount(p)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-txt-2">
          {cols} × {rows} tiles
          {edits > 0 && <span className="text-accent"> · {edits} edited</span>}
        </span>
        {picked != null ? (
          <button
            type="button"
            className="text-[11px] text-txt-3 underline decoration-dotted underline-offset-2 hover:text-txt"
            onClick={() => selectFinOf(item.id, null)}
          >
            whole block
          </button>
        ) : edits > 0 ? (
          <button
            type="button"
            className="text-[11px] text-txt-3 underline decoration-dotted underline-offset-2 hover:text-txt"
            onClick={() => resetAllTilesOf(item.id)}
          >
            reset all
          </button>
        ) : null}
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const f = tileFinishOf(p, i)
          const panel = p.size ? woodsFor(p.size).find((w) => w.code === f.wood) : null
          const src = panel ? thumbFor(panel.file) : null
          return (
            <button
              key={i}
              type="button"
              title={`Tile ${i + 1}${f.edited ? ' — edited' : ''}\n${f.wood ?? '—'}${f.perforation ? ` + ${f.perforation}` : ''}`}
              onClick={() => selectFinOf(item.id, picked === i ? null : i)}
              className={`relative h-7 rounded ring-offset-2 ring-offset-surface transition ${
                picked === i
                  ? 'ring-2 ring-accent'
                  : f.edited ? 'ring-1 ring-amber-400/70' : 'ring-1 ring-line'
              }`}
              style={src
                ? { backgroundImage: `url(${src})`, backgroundSize: 'cover' }
                : { background: '#4a5058' }}
            >
              <span className="absolute inset-x-0 bottom-0 text-[8px] leading-3 text-txt-2 drop-shadow">
                {i + 1}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The finish of ONE tile: what it inherits, and what it has been given. */
function TileFinishEditor({ item, index }) {
  const updateTileOf = useStore((s) => s.updateTileOf)
  const resetTileOf = useStore((s) => s.resetTileOf)

  const p = item.params
  const ov = p.tileOverrides?.[index] ?? {}
  const f = tileFinishOf(p, index)
  const woods = p.size ? woodsFor(p.size) : []
  const perfs = p.size ? perforationsFor(p.size) : []

  const chips = (panels, value, own, onPick) => (
    <div className="flex flex-wrap gap-1.5">
      {panels.map((panel) => {
        const src = thumbFor(panel.file)
        const isOwn = own === panel.code
        return (
          <button
            key={panel.code}
            type="button"
            title={panel.code}
            onClick={() => onPick(panel.code)}
            className={`h-9 overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition ${
              p.size === '1200x600' ? 'w-[74px]' : 'w-9'
            } ${
              isOwn ? 'ring-2 ring-accent'
                : value === panel.code ? 'ring-2 ring-line-strong' : 'ring-1 ring-line'
            }`}
            style={src
              ? { backgroundImage: `url(${src})`, backgroundSize: 'cover' }
              : { background: '#4a5058' }}
          />
        )
      })}
    </div>
  )

  return (
    <Panel title={`Tile ${index + 1}`}>
      <div className="space-y-3">
        {f.edited ? (
          <div className="flex items-center justify-between gap-2">
            <Note>This tile has its own finish.</Note>
            <Button variant="outline" className="h-7 shrink-0 px-2.5"
              onClick={() => resetTileOf(item.id, index)}>
              Reset
            </Button>
          </div>
        ) : (
          <Note>Following the block. Pick a panel to give this tile its own.</Note>
        )}

        {/* A solid ring means the tile was given this itself; a faint one means
            it is inheriting it from the block. Without the distinction there is
            no way to tell a tile that matches the block by choice from one that
            matches it by default — and only the first survives a change to the
            block's own finish. */}
        <Field label="Base colour" hint={ov.wood ? `${ov.wood} · own` : `${f.wood ?? '—'} · inherited`}>
          {chips(woods, f.wood, ov.wood, (wood) => updateTileOf(item.id, index, { wood }))}
        </Field>

        <Field
          label="Perforation"
          hint={ov.perforation ? `${ov.perforation} · own` : `${f.perforation ?? '—'} · inherited`}
        >
          {chips(perfs, f.perforation, ov.perforation,
            (perforation) => updateTileOf(item.id, index, { perforation }))}
        </Field>
      </div>
    </Panel>
  )
}

export default function TileEditor({ item }) {
  const selectedFin = useStore((s) => s.selectedFin)
  const update = useStore((s) => s.update)

  const patch = (params) => update(item.id, { params })
  const count = (item.params.cols ?? 4) * (item.params.rows ?? 3)
  const index = selectedFin?.id === item.id ? selectedFin.index : null
  const tileOpen = index != null && index < count

  return (
    <>
      <Panel>
        <TilePicker item={item} />
      </Panel>

      {/* One slot, whichever is selected: the tile's editor or the block's. The
          two are the same kind of thing at different scopes, so they belong in
          the same place rather than one being buried under the other. */}
      {tileOpen ? (
        <TileFinishEditor item={item} index={index} />
      ) : (
        <Panel title={`Whole block — all ${count} tiles`}>
          <div className="space-y-3">
            <Note>
              Every tile takes this finish. Pick a single tile above, or in the 3D view,
              to give that one its own.
            </Note>
            <TileFields params={item.params} onChange={patch} />
          </div>
        </Panel>
      )}

      {tileOpen && (
        <Panel title="Block">
          <Note>
            {TILE_SIZES[item.params.size]?.label ?? '—'} panels ·{' '}
            {item.params.wood ?? '—'}
            {item.params.perforation ? ` + ${item.params.perforation}` : ''} ·{' '}
            {count} tiles. Choose the whole block above to change these.
          </Note>
        </Panel>
      )}
    </>
  )
}
