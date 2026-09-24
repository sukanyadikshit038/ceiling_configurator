// The focus editor: one set, on its own, with the whole editing form beside it.
//
// The ceiling scene is a layout tool — sets are small, seen from across a room,
// and a single fin is a few pixels wide. This is the other half of the job:
// getting one set right. Same store, same actions, same geometry; the only
// thing that changes is that nothing else is in the way.

import { useEffect, useState } from 'react'
import { useStore } from '../lib/store.js'
import { baffleLabel } from '../lib/catalog.js'
import { isFinRun } from '../lib/models.js'
import FocusView from '../three/FocusView.jsx'
import TileFocusView from '../three/TileFocusView.jsx'
import CloudFocusView from '../three/CloudFocusView.jsx'
import SetEditor from './SetEditor.jsx'
import TileEditor from './TileEditor.jsx'
import CloudFields from './CloudFields.jsx'
import { PRODUCT_TYPES } from '../lib/catalog.js'
import { TILE_SIZES, tileEditCount } from '../lib/tiles.js'
import { Button } from './bits.jsx'

export default function FocusModal() {
  const focusId = useStore((s) => s.focusId)
  const item = useStore((s) => s.items.find((i) => i.id === s.focusId) ?? null)
  const closeFocus = useStore((s) => s.closeFocus)
  const rotate = useStore((s) => s.rotate)
  const update = useStore((s) => s.update)
  const selectedFin = useStore((s) => s.selectedFin)
  const focusSolo = useStore((s) => s.focusSolo)
  const setFocusSolo = useStore((s) => s.setFocusSolo)

  // "Reset view" is a counter rather than a callback: the camera rig lives
  // inside the Canvas and is only reachable from there, so the button changes
  // an input it watches instead of reaching in.
  const [resetKey, setResetKey] = useState(0)

  // The document can drop this set out from under the modal — an undo, a room
  // change, a preset replacing the layout. Rather than teach every one of those
  // actions about the modal, the modal closes when its subject is gone.
  useEffect(() => {
    if (focusId && !item) closeFocus()
  }, [focusId, item, closeFocus])

  if (!item) return null

  // A tile block and a baffle set are the same shape of problem — a whole thing
  // and a part of it — so they share the header, the camera controls and the
  // solo toggle, and differ only in which view and which editor they name.
  const isTile = item.type === 'tiles'
  // A cloud has no parts to reach into, so most of what follows does not apply
  // to it: no solo toggle, no part count, nothing to click. It is here for the
  // FINISH — a 1200 mm cloud is a coin at four metres and a Cloud Series design
  // cannot be judged from there.
  const isCloud = item.type === 'clouds'
  const tileCount = (item.params.cols ?? 4) * (item.params.rows ?? 3)

  const overrides = isTile
    ? tileEditCount(item.params)
    : isCloud ? 0
      : Object.keys(item.params.finOverrides ?? {}).length

  // Only a run has fins to pick one out of, so only a run gets the toggle — the
  // same test the chooser uses to decide whether to ask at all. Every block has
  // tiles, so a block always gets it.
  const isRun = !isCloud && (isTile || isFinRun(item.params))
  const finIndex = selectedFin?.id === item.id ? selectedFin.index : null
  const solo = focusSolo && finIndex != null

  const partName = isTile ? 'tile' : 'fin'
  const partCount = isTile ? tileCount : item.params.count

  const subject = (label, on, onClick, title) => (
    <button
      type="button" onClick={onClick} title={title}
      className={`h-7 shrink-0 whitespace-nowrap px-2.5 text-[12px] font-medium transition-colors ${
        on ? 'bg-accent text-on-accent' : 'text-txt-2 hover:bg-fill hover:text-txt'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line-soft px-4">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          Focus
        </span>
        <div className="min-w-0">
          <span className="font-display text-[13px] font-semibold text-txt">
            {isTile ? PRODUCT_TYPES.tiles.label
              : isCloud
                ? `${(item.params.shape ?? 'Cloud')} ${item.params.size ?? ''} cloud`
                : baffleLabel(item.params)}
          </span>
          <span className="ml-2 text-[11px] text-txt-3">
            {isTile && item.params.size && `${TILE_SIZES[item.params.size]?.label} · `}
            {isCloud
              ? `${Math.round((item.params.drop ?? 0) * 1000)} mm drop`
              : solo
                ? `${partName} ${finIndex + 1} of ${partCount}`
                : `${partCount} ${partName}${partCount === 1 ? '' : 's'}`}
            {overrides > 0 && ` · ${overrides} edited`}
            {' · '}cell {item.cell[0]}, {item.cell[1]}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isRun && (
            <div className="mr-1.5 flex shrink-0 overflow-hidden rounded-md border border-line">
              {subject(isTile ? 'Whole block' : 'Whole set', !solo, () => setFocusSolo(false),
                isTile ? 'Show the block as it sits' : 'Show the run as it hangs')}
              {subject(isTile ? 'Single tile' : 'Single fin', solo, () => setFocusSolo(true),
                isTile
                  ? 'Show only the selected tile, with the finish it actually has. Picks the first tile if none is selected.'
                  : 'Show only the selected fin, with its own clamps and drop. Picks the first fin if none is selected.')}
            </div>
          )}
          <Button variant="outline" className="h-7 px-2.5" onClick={() => setResetKey((k) => k + 1)}>
            Reset view
          </Button>
          <Button variant="outline" className="h-7 px-2.5" onClick={() => rotate(item.id)}>
            Rotate
          </Button>
          <Button variant="solid" className="h-7 px-3" onClick={closeFocus}>
            Done
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {/* keyed on the set, so switching focus rebuilds rather than
              inheriting the previous set's camera framing */}
          {isTile
            ? <TileFocusView key={item.id} item={item} resetKey={resetKey} />
            : isCloud
              ? <CloudFocusView key={item.id} item={item} resetKey={resetKey} />
              : <FocusView key={item.id} item={item} resetKey={resetKey} />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-center">
            <span className="rounded-md bg-bg/70 px-2.5 py-1 text-[11px] text-txt-3">
              {/* Nothing to click on a cloud, so it is not offered. */}
              {isCloud ? '' : solo
                ? `Showing one ${partName} · pick another from the panel · `
                : `Click a ${partName} to edit it · `}
              drag to orbit · scroll to zoom · <b className="font-medium text-txt-2">Esc</b> closes
            </span>
          </div>
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-line-soft bg-surface">
          {isTile ? <TileEditor item={item} />
            : isCloud ? (
              <div className="p-3.5">
                <CloudFields
                  params={item.params}
                  onChange={(patch) => update(item.id, { params: patch })}
                />
              </div>
            )
              : <SetEditor item={item} focus />}
        </aside>
      </div>
    </div>
  )
}
