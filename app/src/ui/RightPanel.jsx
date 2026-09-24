import { useState } from 'react'
import { useStore, buildSchedule, coveredArea, itemArea, scheduleByGroup } from '../lib/store.js'
import { COLOUR_FAMILIES, getSwatch, baffleLabel, PRODUCT_TYPES } from '../lib/catalog.js'
import { gridOf } from '../lib/grid.js'
import SetEditor from './SetEditor.jsx'
import TileEditor from './TileEditor.jsx'
import CloudFields from './CloudFields.jsx'
import FlyFields from './FlyFields.jsx'
import { Panel, Button, Stat, Empty, Note } from './bits.jsx'
import GroupPanel from './GroupPanel.jsx'

/**
 * The group a singled-out member belongs to, and the way back out of it.
 *
 * Shown only when ONE item is selected and it is in a group — which happens
 * when you alt-click a member. The whole group selected goes to GroupPanel
 * instead; this is the other half of the pair.
 */
function GroupTag({ item }) {
  const groups = useStore((s) => s.groups)
  const selectGroup = useStore((s) => s.selectGroup)
  const removeFromGroup = useStore((s) => s.removeFromGroup)
  const group = groups.find((gr) => gr.id === item.groupId)
  if (!group) return null
  return (
    <div className="rounded-md border border-line bg-fill p-2">
      <div className="text-[11px] text-txt-3">
        One of <button
          type="button"
          onClick={() => selectGroup(group.id)}
          className="font-medium text-accent hover:underline"
        >{group.name}</button>. Dragging it moves this one alone.
      </div>
      <Button
        variant="outline"
        className="mt-1.5 h-7 w-full"
        onClick={() => removeFromGroup([item.id])}
      >
        Take out of {group.name}
      </Button>
    </div>
  )
}

function Selection() {
  const item = useStore((s) => s.selected())
  const rotate = useStore((s) => s.rotate)
  const update = useStore((s) => s.update)
  const duplicate = useStore((s) => s.duplicate)
  const remove = useStore((s) => s.remove)
  const askFocus = useStore((s) => s.askFocus)

  if (!item) {
    return (
      <Panel title="Selection">
        <Empty>
          Nothing selected. Switch to <span className="text-txt-2">Select</span> and
          click a set, or drag one to move it.
        </Empty>
      </Panel>
    )
  }

  const isTile = item.type === 'tiles'
  const isCloud = item.type === 'clouds'
  const isFly = item.type === 'fly'
  const overrides = Object.keys(item.params.finOverrides ?? {}).length

  return (
    <>
      <Panel
        title="Selection"
        right={
          <span className="text-[11px] tabular-nums text-txt-3">
            cell {item.cell[0]}, {item.cell[1]}
          </span>
        }
      >
        <div className="space-y-3.5">
          <div>
            <div className="font-display text-[13px] font-semibold text-txt">
              {isTile ? PRODUCT_TYPES.tiles.label
                : isCloud ? `${item.params.shape ?? 'Cloud'} ${item.params.size ?? ''} cloud`
                  : isFly ? `Fly ${item.params.size ?? ''}`.trim()
                    : baffleLabel(item.params)}
            </div>
            <div className="mt-0.5 text-[11px] text-txt-3">
              {isTile
                ? `${item.params.cols} × ${item.params.rows} tiles · ${item.ci} × ${item.cj} cells`
                : `${item.ci} × ${item.cj} cells`}
              {!isTile && overrides > 0 && ` · ${overrides} fin override${overrides === 1 ? '' : 's'}`}
            </div>

          </div>

          {item.groupId && <GroupTag item={item} />}

          {/* A cloud has no part to reach into, but it gets a focus view all
              the same — for the FINISH. At four metres a 1200 mm cloud is a
              coin, and a Cloud Series design cannot be judged from there.
              A Fly still does not: its wings all wear the one fabric, so there
              is nothing in there that the panel does not already show. */}
          {!isFly && (
            <Button variant="highlight" className="h-9 w-full" onClick={() => askFocus(item.id)}>
              {isTile ? 'Focus this ceiling' : isCloud ? 'Focus this cloud' : 'Focus this set'}
            </Button>
          )}

          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            <Button variant="outline" className="h-8" onClick={() => rotate(item.id)}>Rotate</Button>
            <Button variant="outline" className="h-8" onClick={() => duplicate(item.id)}>Duplicate</Button>
            <Button variant="danger" className="h-8" onClick={() => remove(item.id)}>Delete</Button>
          </div>
        </div>
      </Panel>

      {/* The tile panel is the same control the left sidebar builds with, so
          changing a placed block asks the same three questions in the same
          order as specifying a new one. Baffles get the editor the focus view
          uses, so those two offer the same things. */}
      {isTile ? <TileEditor item={item} />
        : isCloud ? (
          <Panel title="Cloud">
            <CloudFields params={item.params} onChange={(patch) => update(item.id, { params: patch })} />
          </Panel>
        )
          : isFly ? (
            <Panel title="Fly">
              <FlyFields params={item.params} onChange={(patch) => update(item.id, { params: patch })} />
            </Panel>
          )
            : <SetEditor item={item} />}
    </>
  )
}

function colourLabel(row) {
  // A row that names its own finish wins: the tile range is not one of the
  // baffle colour families, so looking its code up there would silently return
  // that family's FIRST swatch and label every tile the same.
  if (row.finishLabel) return row.finishLabel
  if (row.model && !row.colour) return 'model materials'
  if (typeof row.colour === 'string' && row.colour.startsWith('fabric:')) return 'Uploaded fabric'
  const sw = getSwatch(row.family, row.colour)
  // `label` where a family has one. Cloud Series codes are a design and a
  // colour joined for storage — "CL-04_Blue" — and an order line should read
  // "CL-04 Blue", which is the same thing said to a person.
  return sw?.label ?? sw?.code ?? row.colour ?? '—'
}

function swatchBackground(row) {
  if (row.finishLabel) return { background: '#8a6a4a' } // the tile range paints its own chips
  const sw = getSwatch(row.family, row.colour)
  if (!sw) return { background: 'repeating-linear-gradient(45deg,#5b6470 0 2px,#2c333c 2px 4px)' }
  if (sw.from) return { background: `linear-gradient(90deg, ${sw.from}, ${sw.to})` }
  if (sw.hex) return { background: sw.hex }
  if (sw.base) return { background: `linear-gradient(160deg, ${sw.base}, ${sw.grain})` }
  return { background: '#5b6770' }
}

/**
 * Quantities read off the saved document, never off the scene.
 *
 * A set is one item but N fins on an invoice, so this counts fins — including
 * per-fin colour overrides, which a naive count of items would collapse.
 */
/** One zone's lines, under its name. */
function GroupSection({ section, selectGroup }) {
  const { schedule: bom } = section
  return (
    <div className="mt-3 border-t border-line-soft pt-2 first:mt-1 first:border-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        {section.id ? (
          <button
            type="button"
            onClick={() => selectGroup(section.id)}
            title="Select this group"
            className="font-display text-[12px] font-semibold text-txt hover:text-accent"
          >
            {section.name}
          </button>
        ) : (
          <span className="font-display text-[12px] font-semibold text-txt-3">
            {section.name}
          </span>
        )}
        <span className="text-[10px] tabular-nums text-txt-3">
          {bom.totalQty} units · {section.coveredM2.toFixed(1)} m² of ceiling
        </span>
      </div>
      <table className="mt-1 w-full text-[11px]">
        <tbody className="text-txt-2">
          {bom.rows.map((r) => (
            <tr key={r.key} className="border-t border-line-soft">
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 text-txt-3">{r.finishLabel ?? r.colour ?? '—'}</td>
              <td className="py-1 text-right tabular-nums">{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Schedule() {
  const items = useStore((s) => s.items)
  const groups = useStore((s) => s.groups)
  const selectGroup = useStore((s) => s.selectGroup)
  const room = useStore((s) => s.room())
  const g = gridOf(room)
  const bom = buildSchedule(items)
  const sections = scheduleByGroup(items, groups)
  const ceilingArea = g.cols * g.pitch * (g.rows * g.pitch)
  const covered = coveredArea(items)
  const footprintPct = ceilingArea ? (covered / ceilingArea) * 100 : 0
  // What the SELECTION takes, beside what everything takes.
  //
  // Read off selectedIds rather than calling selectedItems() in the selector:
  // that builds a fresh array every time the store changes, which is never
  // Object.is-equal to the last one, so this panel would re-render on every
  // keystroke anywhere in the app.
  const pickedIds = useStore((s) => s.selectedIds)
  const picked = items.filter((i) => pickedIds.includes(i.id))
  const pickedM2 = picked.reduce((n, i) => n + itemArea(i), 0)

  return (
    <Panel title="Schedule / BOM">
      {!items.length ? (
        <Empty>Place a product to build a schedule. Quantities come from the saved layout, not the render.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Units" value={bom.totalQty} />
            <Stat label="Run" value={bom.totalRunM.toFixed(1)} unit="m" />
            <Stat label="Ceiling" value={covered.toFixed(1)} unit="m²" />
          </div>

          <div className="mt-2 space-y-0.5">
            <Note>
              {footprintPct.toFixed(0)}% of the {ceilingArea.toFixed(1)} m² ceiling is covered
            </Note>
            {picked.length > 0 && (
              <Note>
                {picked.length === 1 ? 'The selected set takes' : `${picked.length} selected sets take`}
                {' '}{pickedM2.toFixed(2)} m² of it
                {ceilingArea > 0 && ` — ${((pickedM2 / ceilingArea) * 100).toFixed(1)}% of the zone`}
              </Note>
            )}
            {/* THE ZONE, NOT THE MATERIAL. A run of fins reserves the rectangle
                it spreads over and most of that rectangle is air. Saying so
                here is cheaper than having somebody work out later why 24
                baffles "cover" a third of the room. */}
            <Note>
              Counted as the area each set reserves, gaps included — nothing else can go there.
            </Note>
          </div>

          {/* By ZONE where there are zones, flat where there are not. The
              sections are whole schedules of their own, so they add up to the
              totals above rather than re-slicing them. */}
          {sections ? (
            <div className="mt-2">
              {sections.map((sec) => (
                <GroupSection key={sec.id ?? 'loose'} section={sec} selectGroup={selectGroup} />
              ))}
            </div>
          ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-txt-3">
                  <th className="pb-1.5 font-medium">Item</th>
                  <th className="pb-1.5 font-medium">Finish</th>
                  <th className="pb-1.5 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="text-txt-2">
                {bom.rows.map((r) => (
                  <tr key={r.key} className="border-t border-line-soft">
                    <td className="py-1.5">
                      {r.name}
                      <span className="text-txt-3">
                        {' '}{r.lengthMm}×{r.depthMm}{r.thickness ? `×${r.thickness}` : ''}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <i className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-line" style={swatchBackground(r)} />
                        <span className="truncate" title={COLOUR_FAMILIES[r.family]?.label}>{colourLabel(r)}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-txt">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </Panel>
  )
}

/**
 * The panel: summoned by a selection, floating over the scene, foldable.
 *
 * THREE THINGS, and they are easier to hold apart than together.
 *
 * 1. IT IS NOT THERE UNTIL SOMETHING IS SELECTED. The panel exists to edit the
 *    thing you clicked, so with nothing clicked it has nothing to say — and
 *    "Nothing selected, switch to Select and click a set" is a sentence that
 *    takes 312 px of ceiling to tell you what the empty right-hand side would
 *    have told you for free. The Schedule goes with it, deliberately: it is the
 *    same panel, and the alternative was a second floating thing with its own
 *    button, which was offered and not wanted. Quantities are one click away —
 *    select any set.
 *
 * 2. IT FLOATS. Absolutely positioned, so the canvas keeps its full width and
 *    does not reflow underneath it. This matters more than it looks: every
 *    appearance and every fold used to resize the drawing buffer, which moves
 *    the camera framing and re-fits the view. Now the scene is still and the
 *    panel slides over the top of it.
 *
 *    The cost is honest and worth stating: the right 312 px of the ceiling is
 *    covered while the panel is open, and you cannot click what is under it.
 *    That is what the fold is for.
 *
 * 3. FOLDED LEAVES A STRIP, not nothing. The control that brings it back has to
 *    stay reachable; a panel that vanishes with no handle reads as one that has
 *    crashed. And the fold is REMEMBERED across selections — click another set
 *    and it stays folded, because somebody who put it away meant it. The strip
 *    is the way back.
 *
 * Below the modals in the stack (z-10 against their z-20 and z-30), so the
 * fabric manager and the focus views cover it rather than fighting it.
 *
 * Local state, not store state: which panel you last folded is not part of the
 * document and has no business in an exported layout. Returning null above
 * keeps that state alive — a component that renders nothing is still mounted,
 * so folding it, deselecting, and selecting again comes back folded.
 */
export default function RightPanel() {
  const [collapsed, setCollapsed] = useState(false)
  // Two booleans, both derived in the selector, so this re-renders when the
  // selection crosses a threshold rather than every time it changes.
  const any = useStore((s) => s.selectedIds.length > 0)
  const multi = useStore((s) => s.selectedIds.length > 1)

  const arrow =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] leading-none ' +
    'text-txt-3 transition-colors hover:bg-fill-2 hover:text-txt'

  // `selectedIds` and not `selected()`: the ids are the truth and the anchor is
  // derived from them. Asking the item would put the panel's existence at the
  // mercy of a lookup that returns null for an id the items list has moved on
  // from, which is a flicker rather than a decision.
  if (!any) return null

  // Floating, full height of the workspace, over the scene. Shadowed because a
  // panel that sits ON something needs to look like it does; against a flat
  // border alone it reads as part of the frame.
  const float =
    'absolute inset-y-0 right-0 z-10 flex flex-col border-l border-line-soft ' +
    'bg-surface shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.8)]'

  if (collapsed) {
    return (
      <aside className={`${float} w-9 items-center py-2`}>
        <button type="button" className={arrow} title="Show the panel" aria-label="Expand panel"
          onClick={() => setCollapsed(false)}>
          &#8249;
        </button>
      </aside>
    )
  }

  return (
    <aside className={`${float} w-[312px] overflow-y-auto`}>
      <div className="flex justify-end border-b border-line-soft px-2 py-1.5">
        <button type="button" className={arrow} title="Hide the panel" aria-label="Collapse panel"
          onClick={() => setCollapsed(true)}>
          &#8250;
        </button>
      </div>
      {/* One selected goes to Selection, which knows nothing about groups;
          more than one goes to GroupPanel, which returns null below two. Only
          ever one of them draws. */}
      {multi ? <GroupPanel /> : <Selection />}
      <Schedule />
    </aside>
  )
}
