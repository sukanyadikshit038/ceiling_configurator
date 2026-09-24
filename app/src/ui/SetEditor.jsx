// The editor stack for one baffle set: which fin (or the whole set) is being
// worked on, that thing's finish, and then the set's dimensions.
//
// Shared by the right panel and the focus editor. The right panel having "the
// same options as the focus view" is a requirement, not a coincidence, and the
// only way to keep it true is for there to be one of these.

import { useStore } from '../lib/store.js'
import BaffleFields, { SetFinish } from './BaffleFields.jsx'
import { FinEditor, FinPicker } from './FinEditor.jsx'
import { Panel, Note } from './bits.jsx'

export default function SetEditor({ item, focus = false }) {
  const selectedFin = useStore((s) => s.selectedFin)
  const update = useStore((s) => s.update)

  const patch = (params) => update(item.id, { params })
  const finOpen = selectedFin?.id === item.id && selectedFin.index != null

  return (
    <>
      <Panel>
        <FinPicker item={item} />
      </Panel>

      {/* One slot, whichever is selected: the fin's editor, or the set's. The
          two are the same kind of thing at different scopes, so they belong in
          the same place rather than one being buried under the dimensions. */}
      {finOpen ? (
        <FinEditor item={item} index={selectedFin.index} />
      ) : (
        <Panel title={`Whole set — all ${item.params.count} fins`}>
          <div className="space-y-3.5">
            <Note>Every fin takes this finish. Pick a single fin to give that one its own.</Note>
            <SetFinish params={item.params} onChange={patch} />
          </div>
        </Panel>
      )}

      <Panel title="Dimensions & run">
        <BaffleFields
          params={item.params}
          onChange={patch}
          finish={false}
          forSingleFin={finOpen}
          inFocus={focus}
        />
      </Panel>
    </>
  )
}
