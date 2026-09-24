import { useState } from 'react'
import { useStore, CEILING_LIMITS, roomZone, productMissing } from '../lib/store.js'
import { ROOMS } from '../lib/rooms.js'
import { PRODUCT_TYPES } from '../lib/catalog.js'
import { PRESETS } from '../lib/presets.js'
import { gridOf } from '../lib/grid.js'
import { BACKGROUNDS } from '../lib/theme.js'
import BaffleFields from './BaffleFields.jsx'
import TileFields from './TileFields.jsx'
import CloudFields from './CloudFields.jsx'
import FlyFields from './FlyFields.jsx'
import { Panel, Button, Choice, Note, Select, Empty, Field, Stepper } from './bits.jsx'

// Obstruct marks cells that lights, HVAC or sprinklers occupy, so auto-fill
// skips them. Hidden while there is no work on it, and while auto-fill — the
// only thing that reads obstructions — is hidden too.
const SHOW_OBSTRUCT = false

/**
 * The products Layout presets are offered on.
 *
 * Derived from what the presets ARE, not from a judgement about which products
 * deserve them: every entry in lib/presets builds `defaultBaffleParams()`, so
 * baffles is the only product any of them can lay out. On clouds and tiles the
 * buttons quietly swapped the product and replaced the ceiling with a baffle
 * field, which is not a preset misbehaving — it is a preset for a different
 * product being offered where it does not belong.
 *
 * When a cloud or tile preset is written, add its product here and the section
 * comes back for it.
 */
const PRESET_PRODUCTS = ['baffles', 'clouds']

const TOOLS = [
  { value: 'place', label: 'Place', hint: 'Click the ceiling to add a set' },
  { value: 'select', label: 'Select', hint: 'Click or drag a set' },
  ...(SHOW_OBSTRUCT
    ? [{ value: 'obstruct', label: 'Obstruct', hint: 'Mark lights, HVAC, sprinklers' }]
    : []),
]



// Turned off at the client's request while the sidebar is trimmed. Kept as
// constants rather than commented-out JSX so the components stay referenced,
// stay compiled, and cannot quietly rot while they are out of sight.
const SHOW_ROOM = false
const SHOW_ARRANGE = false
const SHOW_LAYOUT = false
const SHOW_DISPLAY = false

function RoomPanel() {
  const roomId = useStore((s) => s.roomId)
  const setRoom = useStore((s) => s.setRoom)
  const items = useStore((s) => s.items)
  const room = useStore((s) => s.room())
  const g = gridOf(room)

  const groups = [
    { label: 'Furnished sets (built in)', rooms: ROOMS.filter((r) => r.kind === 'procedural') },
    { label: 'Imported 3D scenes', rooms: ROOMS.filter((r) => r.kind === 'glb') },
  ].filter((grp) => grp.rooms.length)

  return (
    <Panel title="Room">
      {/* The same dropdown as everything else. It was the last native
          <select> in the app, and leaving it would have put an operating-system
          popup directly above a styled one in the same sidebar. <optgroup>
          becomes a `group` on each option; see Select. */}
      <Select
        value={roomId ?? ''}
        options={groups.flatMap((grp) =>
          grp.rooms.map((r) => ({ value: r.id, label: r.name, group: grp.label })))}
        onChange={(next) => {
          if (items.length && !confirm(`Switching room clears ${items.length} placed set(s). Continue?`)) return
          setRoom(next)
        }}
        className="font-display text-[13px] font-semibold"
      />

      <div className="mt-1.5 space-y-1">
        {room.kind === 'glb' && !room.ceilingDetected && (
          <Note tone="warn">No flat ceiling quad found in this file — the top face is being used instead.</Note>
        )}
      </div>

    </Panel>
  )
}

/**
 * The ceiling zone — the area products may be placed on.
 *
 * It is part of the document, not a view setting: it defines the grid, so it
 * defines what every saved cell coordinate means (BRIEF §6). For a GLB room the
 * starting values are the ones measured from the file; changing them moves the
 * working zone without touching the mesh, which is the point of authoring the
 * ceiling as a zone rather than as geometry.
 *
 * A panel in its own right, not a section of the room chooser. It used to sit
 * inside it, which meant hiding the chooser took the ceiling's dimensions away
 * with it — and those are the thing people reach for most.
 */
function CeilingZone() {
  const room = useStore((s) => s.room())
  const override = useStore((s) => s.ceilingOverride)
  const setCeiling = useStore((s) => s.setCeiling)
  const resetCeiling = useStore((s) => s.resetCeiling)
  const roomId = useStore((s) => s.roomId)
  const [msg, setMsg] = useState(null)

  const g = gridOf(room)
  const zone = roomZone(room)
  const area = (zone.w * zone.l).toFixed(1)

  const apply = (patch) => {
    const { dropped } = setCeiling(patch)
    setMsg(dropped ? `${dropped} set${dropped === 1 ? '' : 's'} no longer fitted and were removed — Ctrl+Z restores them` : null)
    if (dropped) setTimeout(() => setMsg(null), 6000)
  }

  const axis = (key, label) => (
    <Field key={key} label={label}>
      <Stepper
        value={zone[key]}
        min={CEILING_LIMITS[key].min}
        max={CEILING_LIMITS[key].max}
        step={CEILING_LIMITS[key].step}
        decimals={key === 'h' ? 2 : 1}
        unit="m"
        onChange={(v) => apply({ [key]: v })}
      />
    </Field>
  )

  return (
    <Panel
      title="Ceiling zone"
      right={override && (
        <button
          type="button"
          onClick={() => { resetCeiling(); setMsg(null) }}
          className="text-[11px] text-accent hover:underline"
        >
          reset to room
        </button>
      )}
    >
      <div className="space-y-3">
      {axis('w', 'Width')}
      {axis('l', 'Length')}
      {axis('h', 'Ceiling height')}

      <div className="space-y-0.5">
        <Note>
          {area} m² · grid {g.cols} × {g.rows} cells @ {Math.round(g.pitch * 1000)} mm
        </Note>
        {override
          ? <Note tone="warn">Custom zone — the room itself is unchanged, only the area products go on.</Note>
          : <Note>Matches the room.</Note>}
        {msg && <Note tone="warn">{msg}</Note>}
      </div>
      </div>
    </Panel>
  )
}

function DisplayPanel() {
  const showGrid = useStore((s) => s.showGrid)
  const showRoom = useStore((s) => s.showRoom)
  const toggle = useStore((s) => s.toggle)

  return (
    <Panel title="Display">
      <div className="grid grid-cols-2 gap-1.5">
        <Button active={showGrid} onClick={() => toggle('showGrid')} className="h-7">Grid</Button>
        <Button active={showRoom} onClick={() => toggle('showRoom')} className="h-7">Room</Button>
      </div>
      <div className="mt-1.5">
        <Note>The room is off by default — turn it on to see the ceiling in context.</Note>
      </div>
    </Panel>
  )
}

/**
 * What the ceiling is judged against.
 *
 * Its own panel rather than part of Display, which is switched off with the
 * rest of the trimmed sidebar. The background was in there and went off with
 * it; it is asked for back, and the Grid and Room toggles are not.
 */
function BackgroundPanel() {
  const background = useStore((s) => s.background)
  const setBackground = useStore((s) => s.setBackground)

  return (
    <Panel title="Background">
      <div className="flex flex-wrap items-center gap-1.5">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.hex}
              type="button"
              title={b.name}
              onClick={() => setBackground(b.hex)}
              style={{ background: b.hex }}
              className={`h-6 w-6 rounded-md ring-offset-2 ring-offset-surface transition ${
                background?.toLowerCase() === b.hex.toLowerCase() ? 'ring-2 ring-accent' : 'ring-1 ring-line'
              }`}
            />
          ))}
        {/* Anything at all, through the browser's own colour input. The
            swatches are a shortcut, not the whole range — which is why the
            grid's line colour is derived from whatever this lands on rather
            than being paired with the three. */}
        <label
          title="Custom colour"
          className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-md ring-1 ring-line"
          style={{ background: 'conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)' }}
        >
          <input
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      <div className="mt-1.5">
        <Note>The setting-out grid follows it, so the lines stay readable.</Note>
      </div>
    </Panel>
  )
}

/**
 * One-click layouts. They replace the current layout; Ctrl+Z restores it.
 *
 * FILTERED TO THE PRODUCT ON THE BRUSH, which is the whole of what used to be
 * "baffles only". Every preset used to build defaultBaffleParams(), so offering
 * the buttons on any other product replaced the ceiling with baffles and left
 * the product picker saying something else. Now a preset names its own product
 * and this shows the ones that match; a product with none shows no panel at
 * all, via PRESET_PRODUCTS.
 */
function PresetPanel() {
  const applyPreset = useStore((s) => s.applyPreset)
  const product = useStore((s) => s.brush.type)
  const modelName = useStore((s) => s.brush.params.modelName)
  const [msg, setMsg] = useState(null)
  // The layout last RUN, not a setting. See the note on `value` below.
  const [ran, setRan] = useState(null)
  // Which row the dropdown is highlighting, so its description can be read
  // before committing. Null when the list is shut.
  const [over, setOver] = useState(null)
  const mine = PRESETS.filter((p) => (p.type ?? 'baffles') === product)

  // Derived, not stored: switching product makes a baffle preset key meaningless
  // on a cloud brush. Deriving it means there is no stale value to clear and no
  // effect to forget to write.
  const chosen = mine.some((p) => p.key === ran) ? ran : null
  const showing = mine.find((p) => p.key === (over ?? chosen)) ?? null

  const run = (key) => {
    const p = mine.find((x) => x.key === key)
    if (!p) return
    setRan(key)
    const { placed, skipped } = applyPreset(key)
    setMsg(placed
      ? `${p.label}: ${placed} set${placed === 1 ? '' : 's'}${skipped ? `, ${skipped} did not fit` : ''}`
      : `${p.label} does not fit this ceiling`)
    setTimeout(() => setMsg(null), 5000)
  }

  return (
    <Panel title="Layout presets">
      {/* A menu of ACTIONS wearing a dropdown, which is worth being honest
          about: every other Select in this panel shows live state, and this one
          cannot. It keeps showing the layout you ran, which is true the instant
          it runs and goes stale as soon as a panel is moved or deleted — there
          is no way for it to know. Chosen deliberately over resetting to the
          placeholder, because reading back what you last ran is worth more than
          a control that never admits to anything. */}
      <Select
        value={chosen ?? ''}
        options={[
          { value: '', label: 'Choose a layout…', disabled: true },
          ...mine.map((p) => ({ value: p.key, label: p.label })),
        ]}
        onChange={run}
        onHighlight={setOver}
      />
      <div className="mt-1.5 space-y-0.5">
        {/* The highlighted layout's description, or the one you ran. Five
            descriptions used to be on screen at once under five buttons; this
            is the one that is being considered right now, which is the only one
            anybody reads. */}
        {showing && <Note>{showing.hint}</Note>}
        {msg && <Note tone="warn">{msg}</Note>}
        {modelName && product === 'baffles'
          ? <Note tone="warn">Presets will arrange <b>{modelName}</b> — only the layout comes from the preset.</Note>
          : <Note>Each preset brings its own product and finish.</Note>}
        <Note>A preset replaces the current layout — Ctrl+Z restores it.</Note>
      </div>
    </Panel>
  )
}

/** Repeat the selected set into a rows x columns array, spaced in grid cells. */
function ArrangePanel() {
  const selectedId = useStore((s) => s.selectedId)
  const arraySelected = useStore((s) => s.arraySelected)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(2)
  const [gap, setGap] = useState(1)
  const [msg, setMsg] = useState(null)

  const num = (value, set, min, max) => (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10)
        set(Number.isNaN(v) ? min : Math.min(max, Math.max(min, v)))
      }}
      className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] tabular-nums
                 text-txt outline-none focus:border-accent/60"
    />
  )

  const run = () => {
    const { placed, skipped } = arraySelected(rows, cols, gap)
    setMsg(placed
      ? `${placed} ${placed === 1 ? 'copy' : 'copies'} added${skipped ? `, ${skipped} did not fit` : ''}`
      : 'No copies fit — reduce the rows, columns or gap')
    setTimeout(() => setMsg(null), 5000)
  }

  return (
    <Panel title="Arrange as array" className={selectedId ? '' : 'opacity-50'}>
      <div className="grid grid-cols-3 gap-1.5">
        <Field label="Rows">{num(rows, setRows, 1, 15)}</Field>
        <Field label="Columns">{num(cols, setCols, 1, 15)}</Field>
        <Field label="Gap">{num(gap, setGap, 0, 20)}</Field>
      </div>
      <Button
        variant="outline"
        className="mt-2 h-8 w-full"
        disabled={!selectedId}
        onClick={run}
      >
        Duplicate as array
      </Button>
      <div className="mt-1.5 space-y-0.5">
        {msg && <Note tone="warn">{msg}</Note>}
        <Note>
          {selectedId
            ? 'Gap is in grid cells. Copies that would overlap or leave the ceiling are dropped.'
            : 'Select a set first.'}
        </Note>
      </div>
    </Panel>
  )
}

export default function LeftPanel() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const marquee = useStore((s) => s.marquee)
  const toggle = useStore((s) => s.toggle)
  const brush = useStore((s) => s.brush)
  const setBrush = useStore((s) => s.setBrush)
  const setProduct = useStore((s) => s.setProduct)
  const autoLayout = useStore((s) => s.autoLayout)
  const clear = useStore((s) => s.clear)
  const items = useStore((s) => s.items)
  const obstructions = useStore((s) => s.obstructions)

  // A baffle is only placeable once the product has actually been specified.
  // The list is what is still outstanding, in the order the fields ask for it.
  const missing = productMissing(brush)
  const canPlaceYet = missing.length === 0

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-line-soft bg-surface">
      {/* Sticky, so the tool you are in — and whether a baffle can be placed at
          all — stays on screen while the fields below are scrolled through. */}
      <Panel title="Tool" className="sticky top-0 z-20 bg-surface">
        <Choice
          cols={TOOLS.length}
          value={tool}
          options={TOOLS.map((t) => (t.value === 'place' && !canPlaceYet ? { ...t, disabled: true } : t))}
          onChange={setTool}
        />
        {/* Only under Select: it changes what a drag on bare ceiling does, and
            under Place a drag does not select anything to begin with. */}
        {tool === 'select' && (
          <div className="mt-2">
            <Button
              variant={marquee ? 'solid' : 'outline'}
              className="h-7 w-full"
              title="Drag on bare ceiling to select several at once"
              onClick={() => toggle('marquee')}
            >
              Box select {marquee ? 'on' : 'off'}
            </Button>
            <Note>
              {marquee
                ? 'Drag on bare ceiling to select everything it touches. Turn this off to orbit the camera by dragging.'
                : 'Dragging turns the camera. Turn this on to drag a selection box instead.'}
            </Note>
          </div>
        )}

        <div className="mt-2">
          {canPlaceYet
            ? <Note>{TOOLS.find((t) => t.value === tool)?.hint}</Note>
            : (
              <Note tone="warn">
                Fill in the fields below to place{' '}
                {brush.type === 'tiles' ? 'a tile block'
                  : brush.type === 'clouds' ? 'a cloud' : 'a baffle'} — still to choose:{' '}
                <b className="font-medium text-txt">{missing.join(', ')}</b>.
              </Note>
            )}
        </div>
      </Panel>

      <Panel title="Product">
        <Select
          value={brush.type}
          options={Object.values(PRODUCT_TYPES).map((t) => ({
            value: t.id,
            label: t.comingSoon ? `${t.label} — coming soon` : t.label,
            disabled: !!t.comingSoon,
          }))}
          /* Changing product clears the specification — see setProduct. A
             baffle's thickness is not a tile's perforation under another name,
             and half of each would leave Place lit on a product nobody chose. */
          onChange={setProduct}
        />
        <div className="mt-1.5">
          <Note>{PRODUCT_TYPES[brush.type]?.hint}</Note>
        </div>
      </Panel>

      {/* Presets sit BETWEEN the product and its fields, which is where they
          are actually used: you pick a product, and then either take a whole
          layout or fill the fields in yourself. Below the product because the
          list depends on it — a preset panel above the control that decides
          what it contains changes under you as you use it. */}
      {PRESET_PRODUCTS.includes(brush.type) && <PresetPanel />}

      {/* Tool, then product, then what a new one is made of — the three
          decisions in the order they are actually taken. Everything after this
          is about the room and the layout rather than the product. */}
      <Panel title={
        brush.type === 'tiles' ? 'Tile finish'
          : brush.type === 'clouds' ? 'Cloud'
            : brush.type === 'fly' ? 'Fly' : 'Defaults for new sets'
      }>
        {brush.type === 'tiles' ? <TileFields params={brush.params} onChange={setBrush} />
          : brush.type === 'clouds' ? <CloudFields params={brush.params} onChange={setBrush} />
            : brush.type === 'fly' ? <FlyFields params={brush.params} onChange={setBrush} />
              : <BaffleFields params={brush.params} onChange={setBrush} patternForOmbreOnly blank />}
      </Panel>

      {/* Hidden for now, not deleted: the panels still build and are one
          constant away from coming back. Room chooses the scene; Arrange copies
          a set into a grid. */}
      {SHOW_ROOM && <RoomPanel />}

      <CeilingZone />

      {SHOW_ARRANGE && <ArrangePanel />}

      {SHOW_LAYOUT && (
      <Panel title="Layout">
        <div className="space-y-1.5">
          <Button variant="outline" className="h-8 w-full" onClick={() => autoLayout(600)}>
            Auto-fill ceiling
          </Button>
          <Button variant="outline" className="h-8 w-full" onClick={() => autoLayout(1200)}>
            Auto-fill · wide spacing
          </Button>
          <Button variant="danger" className="h-8 w-full" onClick={clear} disabled={!items.length}>
            Clear all sets
          </Button>
          <Note>Auto-fill uses the settings above; presets bring their own.</Note>
          {!!obstructions.length && (
            <Note>
              {obstructions.length} obstructed cell{obstructions.length === 1 ? '' : 's'} — auto-fill skips these.
            </Note>
          )}
        </div>
      </Panel>
      )}

      {SHOW_DISPLAY && <DisplayPanel />}
      <BackgroundPanel />

      <div className="mt-auto px-4 py-4">
        <Empty>
          <span className="text-txt-2">Shortcuts</span><br />
          <b className="font-medium text-txt-2">Space</b> + drag to pan<br />
          R rotate · D duplicate · ⌫ delete<br />
          Arrows nudge · Ctrl+Z undo · Esc deselect
        </Empty>
      </div>
    </aside>
  )
}
