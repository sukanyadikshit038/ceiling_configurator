// What the right panel shows when more than one thing is selected.
//
// Two states, and the difference matters:
//
//   a LOOSE selection — several things picked by shift-click or marquee. The
//   only thing you can do to it as a whole is make it a group. It can also be
//   edited together when every member is the same product, because that costs
//   nothing extra and is most of why you selected several things in the first
//   place.
//
//   a GROUP — a named set that moves, turns, copies and dies as one. Clicking
//   any member selects all of it, so this is what you get for a group.
//
// The single-selection panel is untouched: one thing selected still goes
// through Selection in RightPanel, which knows nothing about any of this.

import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.js'
import { Panel, Button, Note, Field } from './bits.jsx'
import BaffleFields from './BaffleFields.jsx'
import TileFields from './TileFields.jsx'
import CloudFields from './CloudFields.jsx'
import FlyFields from './FlyFields.jsx'

const LABEL = { baffles: 'baffle set', tiles: 'tile block', clouds: 'cloud' }

/** "4 tile blocks", or "2 baffle sets and 3 clouds" for a mixed bag. */
function describe(items) {
  const n = new Map()
  for (const it of items) n.set(it.type, (n.get(it.type) ?? 0) + 1)
  const parts = [...n].map(([t, c]) => `${c} ${LABEL[t] ?? t}${c === 1 ? '' : 's'}`)
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** The product's own fields, applied to every member at once. */
function GroupFields({ items }) {
  const updateGroup = useStore((s) => s.updateGroup)
  const ids = items.map((i) => i.id)
  // The FIRST member's parameters stand for the group. They are the same
  // product — that is the gate — so the fields are the same fields; where they
  // disagree on a value the control simply shows the first one's, and setting
  // it makes them agree, which is the point of editing a group.
  const params = items[0].params
  const onChange = (patch) => {
    if (!updateGroup(ids, patch)) {
      // Refused as a set rather than half-applied. The usual cause is a change
      // that grows the footprint into a neighbour.
      // eslint-disable-next-line no-console
      console.warn('[group] that change does not fit for every member')
    }
  }
  const type = items[0].type
  if (type === 'tiles') return <TileFields params={params} onChange={onChange} />
  if (type === 'clouds') return <CloudFields params={params} onChange={onChange} />
  if (type === 'fly') return <FlyFields params={params} onChange={onChange} />
  return <BaffleFields params={params} onChange={onChange} />
}

export default function GroupPanel() {
  // Subscribed to the two STABLE things and derived here, not through
  // `selectedItems()`. A selector has to return the same reference for the same
  // state — one that builds a fresh array every call re-renders forever, which
  // is exactly what it did.
  const allItems = useStore((s) => s.items)
  const selectedIds = useStore((s) => s.selectedIds)
  const items = useMemo(
    () => allItems.filter((i) => selectedIds.includes(i.id)),
    [allItems, selectedIds],
  )
  // These two are safe in a selector: one returns a reference out of the store,
  // the other a string.
  const group = useStore((s) => s.selectedGroup())
  const sharedSpec = useStore((s) => s.sharedSpec())
  const groupSelected = useStore((s) => s.groupSelected)
  const ungroup = useStore((s) => s.ungroup)
  const renameGroup = useStore((s) => s.renameGroup)
  const duplicateGroup = useStore((s) => s.duplicateGroup)
  const rotateGroup = useStore((s) => s.rotateGroup)
  const removeGroup = useStore((s) => s.removeGroup)
  const removeFromGroup = useStore((s) => s.removeFromGroup)
  const allGroups = useStore((s) => s.groups)
  const [draft, setDraft] = useState(null)

  if (items.length < 2) return null

  const name = draft ?? group?.name ?? ''

  // A SUBSET of one group — several members alt-clicked, or a marquee that
  // caught part of a zone and was then narrowed. `group` is null here, because
  // the selection is not the whole group, so this is the only place the
  // membership shows at all.
  const partial = !group && (() => {
    const id = items[0].groupId
    if (!id || items.some((i) => i.groupId !== id)) return null
    const whole = allItems.filter((i) => i.groupId === id).length
    return whole > items.length ? allGroups.find((gr) => gr.id === id) ?? null : null
  })()

  return (
    <>
      <Panel
        title={group ? 'Group' : 'Selection'}
        right={
          <span className="text-[11px] tabular-nums text-txt-3">{items.length} items</span>
        }
      >
        <div className="space-y-3">
          <div className="font-display text-[13px] font-semibold text-txt">
            {describe(items)}
          </div>

          {group ? (
            <>
              <Field label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    if (draft != null) renameGroup(group.id, draft.trim() || 'Group')
                    setDraft(null)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="h-7 w-full rounded-md border border-line bg-surface-2 px-2
                    text-[12px] text-txt outline-none focus:border-accent/60"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" className="h-8" onClick={() => rotateGroup(group.id)}>
                  Rotate
                </Button>
                <Button variant="outline" className="h-8" onClick={() => duplicateGroup(group.id)}>
                  Duplicate
                </Button>
                <Button variant="danger" className="h-8" onClick={() => removeGroup(group.id)}>
                  Delete
                </Button>
              </div>
              <Button variant="outline" className="h-8 w-full" onClick={() => ungroup(group.id)}>
                Ungroup
              </Button>
              <Note>
                Moves, turns and deletes as one. Dragging any member drags the
                whole group, on the coarsest step its members allow.
                {' '}<b className="font-medium text-txt-2">Alt-click</b> one to
                pick it out on its own — to move it, or to take it out of the group.
              </Note>
            </>
          ) : (
            <>
              {partial && (
                <>
                  <Button
                    variant="outline"
                    className="h-8 w-full"
                    onClick={() => removeFromGroup(items.map((i) => i.id))}
                  >
                    Take these {items.length} out of {partial.name}
                  </Button>
                  <Note>
                    Part of <b className="font-medium text-txt-2">{partial.name}</b>.
                    The rest of it stays grouped.
                  </Note>
                </>
              )}
              <Button
                variant="highlight"
                className="h-9 w-full"
                onClick={() => groupSelected()}
              >
                Group these {items.length}
              </Button>
              <Note>
                A group moves, turns and is deleted as one, and shows as its own
                section on the schedule.
              </Note>
            </>
          )}
        </div>
      </Panel>

      {sharedSpec ? (
        <Panel title={`All ${items.length} — same product`}>
          <div className="space-y-3.5">
            <Note>
              Every field below applies to all {items.length} at once. A change that
              will not fit for one of them is refused for all of them.
            </Note>
            <GroupFields items={items} />
          </div>
        </Panel>
      ) : (
        <Panel title="Editing together">
          <Note tone="warn">
            These are not all the same product, so there is no one set of fields to
            offer. They can still be moved, grouped and deleted together.
          </Note>
        </Panel>
      )}
    </>
  )
}
