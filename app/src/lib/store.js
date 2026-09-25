// The document, its actions, and the schedule derived from it.
//
// Two kinds of state live here and are deliberately kept apart:
//
//   document  — roomId, items, obstructions, ceilingOverride. This is what a
//               saved file is, what undo snapshots, and what the schedule is
//               read off. Nothing about the camera or the panels is in it.
//   editor    — tool, selection, focus, hover, background. Never serialised,
//               because none of it changes what is ordered.
//
// Three products share one document. A baffle set, a tile block and a cloud are
// all `items` with a `type`, and the code that places, moves, rotates and
// removes them is the same code. Only three functions differ — productMissing,
// productCells and emptyParamsFor — so a caller asks the brush what it needs
// rather than assuming baffle.

import { create } from 'zustand'
import {
  BAFFLE_TYPES, COLOUR_FAMILIES, baffleCells, baffleExtent,
  defaultBaffleParams, baffleWidths, finSchedule, baffleLabel, MODEL_SPACING, MM,
  MODEL_FIN_FAMILIES, MODEL_SIZE_LIMITS, baffleSizeMm, rotStepFor,
  emptyBrushParams, missingFields, depthRangeOf, parseWidth, BAFFLE_SHARED,
} from './catalog.js'
import {
  gridOf, footprint, clampCorner, overlaps, key, onGrid,
  maskDims, maskFootprint, maskBlocks, snapCorner, snapStepOf, MASK_M,
} from './grid.js'
import { ROOMS, getRoom } from './rooms.js'
import {
  emptyTileParams, tileCells, tileMissingFields, reconcileTile, tileFinishOf,
  tileBlockExtent,
} from './tiles.js'
import {
  emptyCloudParams, cloudCells, cloudMissingFields, reconcileCloud, cloudExtent,
} from './clouds.js'
import {
  flyMissingFields, flyCells, emptyFlyParams, reconcileFly, flyExtent,
} from './fly.js'
import { buildPreset, getPreset } from './presets.js'
import { getLayout, saveLayout as storeLayout } from './layouts.js'
import { applyTheme, SELECT_COLOUR, THEMES } from './theme.js'

// ---------------------------------------------------------------------------
// what the brush is, whichever product it holds
// ---------------------------------------------------------------------------
//
// Placing a baffle, a tile block and a cloud is the same code; knowing what one
// still needs, how big it is and what a blank one looks like is not. These three
// functions are where the products differ, so a caller asks the brush rather
// than assuming baffle.

/** The fields still to be answered, in the order the panel asks them. */
export const productMissing = (brush) => {
  if (brush?.type === 'tiles') return tileMissingFields(brush.params)
  if (brush?.type === 'clouds') return cloudMissingFields(brush.params)
  if (brush?.type === 'fly') return flyMissingFields(brush.params)
  return missingFields(brush?.params)
}

/** Can this brush be placed on the ceiling yet? */
export const productReady = (brush) => productMissing(brush).length === 0

/** The cells it would occupy. */
export const productCells = (brush, pitch) => {
  if (brush?.type === 'tiles') return tileCells(brush.params, pitch)
  if (brush?.type === 'clouds') return cloudCells(brush.params, pitch)
  if (brush?.type === 'fly') return flyCells(brush.params, pitch)
  return baffleCells(brush.params, pitch)
}

/** A blank specification for a product — nothing decided but the type. */
/**
 * The product the app opens on.
 *
 * A constant because it is set in TWO places — the store's initial state and
 * hydrate(), which re-seeds the brush once the room list has been read — and
 * two literals are two chances to disagree. Whichever ran last would win, and
 * which one that is depends on whether the room manifest arrived.
 *
 * Clouds rather than baffles: it is the range with the printed artwork and the
 * five layout presets, so the app opens on something that can be seen rather
 * than on a blank baffle run.
 *
 * The brush still opens BLANK either way — the type, and nothing else decided.
 */
export const DEFAULT_PRODUCT = 'clouds'

export const emptyParamsFor = (type) => {
  if (type === 'tiles') return emptyTileParams()
  if (type === 'clouds') return emptyCloudParams()
  if (type === 'fly') return emptyFlyParams()
  return emptyBrushParams()
}

export const SCHEMA_VERSION = 3

// ---------------------------------------------------------------------------
// groups
// ---------------------------------------------------------------------------
//
// A group is a NAME and a set of members, and the members carry the membership
// rather than the group carrying a list. `groupId` on the item makes "one item
// is in one group" true by construction — there is nowhere to write a second —
// and it makes deleting an item a non-event: the group is whatever still points
// at it. The record on the side holds the name, which is the only thing a set
// of ids cannot hold for itself.
//
// Flat, deliberately. Nesting doubles the cost of every operation below — move,
// rotate, duplicate, delete, edit — and buys a shape nobody has asked for.

let gseq = 0
const gid = () => `gp_${Date.now().toString(36)}_${(gseq++).toString(36)}`

/** The members of a group, in document order. */
export const membersOf = (items, id) => (id ? items.filter((i) => i.groupId === id) : [])

/**
 * The step a whole group can move on: the COARSEST of its members.
 *
 * A tile block lands on its 600 mm module and a baffle run on 100 mm. A group
 * holding both can only move by a delta that is legal for every member, and the
 * only such delta is a multiple of the coarsest step — move by 100 and the tile
 * comes off its module, which is the joint the module exists to keep.
 */
export function groupStep(members, g) {
  let si = 1
  let sj = 1
  for (const m of members) {
    const [a, b] = snapStepOf(m, g)
    si = Math.max(si, a)
    sj = Math.max(sj, b)
  }
  return [si, sj]
}

/**
 * What makes two items THE SAME PRODUCT, for the purpose of editing them at once.
 *
 * Not the same item — the same form to fill in. A group of eight Blade/Standard
 * runs can be given a colour in one go because they all take the same fields; a
 * Blade and a VMT cannot, because "shape" means different things to them and the
 * panel would be offering options one of them does not have.
 *
 * Deliberately coarse: it names the RANGE, not the specification. Two runs that
 * differ in length and colour still share a form, and the point of editing a
 * group is to make them agree.
 */
export function specKey(it) {
  const p = it?.params ?? {}
  if (it?.type === 'tiles') return `tiles|${p.ttype}|${p.size}|${p.grid}`
  if (it?.type === 'clouds') return `clouds|${p.shape}|${p.size}`
  if (it?.type === 'fly') return `fly|${p.size}`
  return `baffles|${p.btype}|${p.shape}|${p.model ?? ''}`
}

/**
 * Drop the groups that no longer hold two members, and FREE whoever is left.
 *
 * Both halves, together, always. Dropping the record on its own leaves the last
 * survivor pointing at a group that does not exist — a dangling id that makes
 * `selectedGroup()` answer null for an item that still claims to be in
 * something. Four places thin a group out (a member removed, an item deleted,
 * a zone resized, a member poached by another group) and all four have to do
 * the same two things, so they do them here.
 */
export function pruneGroups(items, groups) {
  const live = groups.filter((gr) => membersOf(items, gr.id).length >= 2)
  const ids = new Set(live.map((gr) => gr.id))
  const freed = items.some((i) => i.groupId && !ids.has(i.groupId))
  return {
    items: freed ? items.map((i) => (i.groupId && !ids.has(i.groupId) ? { ...i, groupId: null } : i)) : items,
    groups: live,
  }
}

/** The smallest cell box holding every member. */
export function groupBounds(members, g) {
  if (!members.length) return null
  let i0 = Infinity; let j0 = Infinity; let i1 = -Infinity; let j1 = -Infinity
  for (const m of members) {
    const fp = footprint(m, g)
    i0 = Math.min(i0, fp.i0); j0 = Math.min(j0, fp.j0)
    i1 = Math.max(i1, fp.i0 + fp.ci); j1 = Math.max(j1, fp.j0 + fp.cj)
  }
  return { i0, j0, ci: i1 - i0, cj: j1 - j0 }
}

let seq = 0
const uid = () => `it_${Date.now().toString(36)}_${(seq++).toString(36)}`

const UNDO_DEPTH = 40

/** The document fields only — what a snapshot and an export both consist of. */
const documentOf = (s) => ({
  roomId: s.roomId,
  items: s.items,
  obstructions: s.obstructions,
  // In the snapshot, or an undo would bring items back stripped of the group
  // they belonged to — the membership rides on the items, but the NAME does
  // not, and half a group is worse than none.
  groups: s.groups,
  ceilingOverride: s.ceilingOverride,
})

/**
 * The ceiling a session opens on, in metres.
 *
 * A zone rather than whatever the first room happens to measure: this is a
 * ceiling configurator, and opening on a named room's dimensions made the room
 * look like the subject. The HEIGHT still comes from the room, because that is
 * the one dimension a room really does decide.
 */
export const DEFAULT_ZONE = { w: 7.5, l: 7 }

/** Bounds a configurable ceiling zone may take, in metres. */
export const CEILING_LIMITS = {
  w: { min: 3, max: 30, step: 0.3 },
  l: { min: 3, max: 30, step: 0.3 },
  h: { min: 2.4, max: 8, step: 0.1 },
}

const clampZone = (z) => ({
  w: Math.min(CEILING_LIMITS.w.max, Math.max(CEILING_LIMITS.w.min, z.w)),
  l: Math.min(CEILING_LIMITS.l.max, Math.max(CEILING_LIMITS.l.min, z.l)),
  h: Math.min(CEILING_LIMITS.h.max, Math.max(CEILING_LIMITS.h.min, z.h)),
})

/** The zone a room defines on its own, as width/length/height. */
export function roomZone(room) {
  if (!room) return null
  const c = room.ceiling
  return { w: +(c.maxX - c.minX).toFixed(3), l: +(c.maxZ - c.minZ).toFixed(3), h: c.y }
}

const roomKey = (roomId, override) =>
  `${roomId}|${override ? `${override.w},${override.l},${override.h}` : ''}`

/**
 * The room with its ceiling zone overridden, centred on the origin.
 *
 * The zone is always centred: the grid, the camera presets and every saved cell
 * coordinate assume it, so an off-centre zone would silently shift what a cell
 * means.
 */
function effectiveRoom(roomId, override) {
  const base = getRoom(roomId)
  if (!base || !override) return base
  const z = clampZone(override)
  return {
    ...base,
    ceiling: { ...base.ceiling, y: z.h, minX: -z.w / 2, maxX: z.w / 2, minZ: -z.l / 2, maxZ: z.l / 2 },
    zoneCustom: true,
  }
}

/**
 * One selection, written in one place.
 *
 * `selectedIds` is the truth and `selectedId` is its ANCHOR — the last thing
 * clicked. Both are real state because both are read reactively, and keeping
 * them in step by hand across the twenty places that clear a selection is how
 * they would drift; every one of those calls this instead.
 *
 * The anchor is what makes this additive rather than a rewrite: every panel,
 * outline and action that already reads `selectedId` keeps working untouched,
 * and only the things that care about more than one look at `selectedIds`.
 */
const sel = (ids = []) => ({
  selectedIds: ids,
  selectedId: ids.length ? ids[ids.length - 1] : null,
  selectedFin: null,
})

export const useStore = create((set, get) => ({
  // ---- document -----------------------------------------------------------
  roomId: null,
  items: [],
  obstructions: [], // ["i,j", ...] mask squares blocked by lights / HVAC / sprinklers
  // [{ id, name }]. The MEMBERSHIP is on the items; this holds what a group is
  // called, which is the part a set of ids cannot hold for itself.
  groups: [],
  // The ceiling zone, when it differs from the room's own. Part of the
  // document: it decides the grid, so it decides what every cell coordinate
  // means (BRIEF §6 — the ceiling is a parametric zone, not just a mesh).
  ceilingOverride: null, // { w, l, h } in metres, or null to use the room's

  // Derived: the room with the override applied. Held in state rather than
  // computed per call because `useStore((s) => s.room())` compares by identity —
  // returning a fresh object each time would re-render on every store read.
  // `_roomKey` is what makes the cache safe: anything that writes roomId or the
  // override without going through an action leaves the key mismatched, and
  // room() recomputes instead of quietly serving a stale ceiling.
  _room: null,
  _roomKey: null,

  // ---- editor state (never serialised) ------------------------------------
  tool: 'place', // 'place' | 'select' | 'obstruct'
  // Every selected item. The ANCHOR is selectedId — see sel().
  selectedIds: [],
  selectedId: null,
  selectedFin: null, // { id, index } — a single fin inside the selected set
  // The set open in the focus editor, or null. Editor state like the selection:
  // it decides what is on screen, never what is ordered, so it is not part of
  // the document and is not serialised.
  focusId: null,
  // The set the focus CHOOSER is asking about — the whole run, or one unit.
  // Held apart from focusId so the question can be cancelled without ever
  // having opened anything.
  focusAsk: null,
  // Inside focus, showing ONE fin of a run rather than the whole thing.
  focusSolo: false,
  hoverCell: null,
  /**
   * The id being dragged, while the position the cursor is asking for is
   * REFUSED — or null.
   *
   * Editor state, never serialised. It exists because a drag moves the item
   * live rather than previewing it: update() turns down anything that would
   * overlap another set or the mask, so the item simply stops following the
   * cursor and nothing on screen says why. This is what lets the halo say it.
   *
   * Cleared by endDrag() on pointer-up, so a refusal does not outlive the drag
   * that caused it.
   */
  dragBlocked: null,

  /**
   * Where the sets being dragged started, so a release over a spot they cannot
   * take can put them back.
   *
   * Editor state, never serialised. Null when nothing is being dragged.
   */
  dragFrom: null,

  // Space held = pan on left-drag. Transient input state, never serialised, but
  // it lives here rather than in App because the ceiling plane and every placed
  // set have to see it too — a space-drag must not place or move anything.
  spacePan: false,
  /**
   * Whether a drag on bare ceiling draws a selection box or turns the camera.
   *
   * OFF by default, because the camera had that gesture first. Adding the
   * marquee took it away without asking: with Select in hand, every drag became
   * a rubber band and the view could no longer be orbited at all. A drag is a
   * scarce thing and the camera is what most drags are for.
   *
   * Editor state — it changes how the pointer behaves, never what is ordered.
   */
  marquee: false,
  showGrid: true,
  // Distances from the selected set to its neighbours within MEASURE_RANGE_M.
  //
  // ON by default, because the question it answers — how far apart are these —
  // is the one being asked while a layout is being set out, and a measurement
  // you have to go and switch on is one you do not take. Off is for the moment
  // you want to LOOK at the ceiling rather than set it out, which is also why
  // preview suppresses it whatever this says.
  //
  // A view flag like the rest of this block: not in the document, not in a
  // share link, not in the session. What is ordered does not change.
  showMeasures: true,
  // Preview: placed sets stop taking clicks, so a drag on one orbits the camera
  // instead of dragging the baffle. Nothing else changes — the panels, the
  // grid, the tools and the presets all keep working. It is a lock on picking,
  // not a mode.
  preview: false,
  // Opens on the grid alone: the ceiling is the subject, and a furnished room
  // around it is context you switch ON rather than scenery to switch off. It is
  // also what makes the background worth setting.
  showRoom: false,
  // ONE OF THE THREE THE PICKER OFFERS. It was a warm beige, chosen because it
  // reads well against the felt colours — but the picker now offers white, grey
  // and dark grey, and a session that opens on a fourth colour shows a picker
  // with nothing selected, which reads as broken. The beige is still one click
  // away through the custom colour beside them.
  background: '#f4f6f8',
  undoStack: [],

  /**
   * What the next placed item inherits.
   *
   * Opens BLANK — the type, and nothing else decided. Placing a baffle should
   * mean placing the one that was specified, not the one this file happened to
   * default to.
   */
  brush: { type: DEFAULT_PRODUCT, params: emptyParamsFor(DEFAULT_PRODUCT) },

  /**
   * Which theme is on. Not persisted, and that is on purpose while the light
   * one is being judged: a reload gives you the house theme back rather than
   * whatever was last toggled, so what somebody sees on a fresh load is what
   * ships. See lib/theme.js.
   */
  theme: THEMES[0],

  setTheme(theme) {
    // applyTheme returns what it actually applied, so an unknown name lands on
    // the default in BOTH the document and the store rather than only one.
    set({ theme: applyTheme(theme) })
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  // ---- derived ------------------------------------------------------------
  room: () => {
    const st = get()
    const k = roomKey(st.roomId, st.ceilingOverride)
    if (st._room && st._roomKey === k) return st._room
    return effectiveRoom(st.roomId, st.ceilingOverride)
  },
  grid: () => gridOf(get().room()),
  selected: () => get().items.find((i) => i.id === get().selectedId) ?? null,
  /** Everything selected, in document order rather than the order clicked. */
  selectedItems: () => {
    const ids = new Set(get().selectedIds)
    return get().items.filter((i) => ids.has(i.id))
  },

  // ---- lifecycle ----------------------------------------------------------
  /**
   * Adopt the room list once it has been read.
   *
   * ROOMS is empty at module-eval time, so the store starts blank rather than
   * capturing nulls it would then have to re-initialise underneath itself.
   *
   * It opens on DEFAULT_ZONE rather than on the room's own ceiling, keeping
   * only the room's height — see DEFAULT_ZONE.
   */
  hydrate() {
    const room = ROOMS[0]
    if (!room) return false
    const zone = clampZone({ ...DEFAULT_ZONE, h: roomZone(room).h })
    set({
      roomId: room.id,
      _room: effectiveRoom(room.id, zone),
      _roomKey: roomKey(room.id, zone),
      ceilingOverride: zone,
      brush: { type: DEFAULT_PRODUCT, params: emptyParamsFor(DEFAULT_PRODUCT) },
      items: [], obstructions: [], groups: [], ...sel([]), undoStack: [],
    })
    return true
  },

  // ---- editor actions -----------------------------------------------------
  setTool: (tool) => set(tool === 'select'
    ? { tool }
    : { tool, ...sel([]) }),
  setHoverCell: (hoverCell) => set({ hoverCell }),
  /**
   * Select one thing, or add it to what is already selected.
   *
   * `additive` is the shift-click: it TOGGLES, because the way you take
   * something out of a selection is to shift-click it again, and a shift-click
   * that only ever added would leave no way back but starting over.
   */
  select: (id, { additive = false, only = false } = {}) => set((s) => {
    if (id == null) return { ...sel([]), tool: s.tool }
    // Clicking one member picks up the WHOLE group. That is what grouping
    // means: if a click could select one member on its own, every verb below
    // would need a second answer for "the group, or just this one".
    //
    // `only` is the way back in — alt-click. It reaches PAST the group to the
    // one item under the pointer, which is what you need to take a single tile
    // out of a group without taking the group apart.
    const it = s.items.find((x) => x.id === id)
    const family = !only && it?.groupId ? membersOf(s.items, it.groupId).map((m) => m.id) : [id]
    if (!additive) return { ...sel(family), tool: 'select' }
    // Toggling works on the family too, so shift-clicking a grouped item takes
    // the group out rather than leaving the rest of it behind.
    const had = s.selectedIds.includes(id)
    const ids = had
      ? s.selectedIds.filter((x) => !family.includes(x))
      : [...s.selectedIds.filter((x) => !family.includes(x)), ...family]
    return { ...sel(ids), tool: 'select' }
  }),

  /** Select a whole list at once — what the marquee hands back. */
  selectMany: (ids) => set((s) => {
    const live = new Set(s.items.map((i) => i.id))
    const keep = new Set([...ids].filter((id) => live.has(id)))
    // Catching one member of a group catches the group. A marquee that clipped
    // the corner of a zone and took two of its eight would make the next drag
    // tear the zone in half.
    for (const it of s.items) {
      if (it.groupId && keep.has(it.id)) {
        for (const m of membersOf(s.items, it.groupId)) keep.add(m.id)
      }
    }
    const out = s.items.filter((i) => keep.has(i.id)).map((i) => i.id)
    return { ...sel(out), tool: out.length ? 'select' : s.tool }
  }),
  // Fin actions come in two forms. The bare one acts on the selection, which is
  // what the right panel wants; the `...Of` one names the set explicitly, which
  // is what the focus editor wants — it keeps working on its subject even after
  // an undo has cleared the selection out from under it.
  selectFinOf: (id, index) => set(
    id != null && index != null
      ? { selectedFin: { id, index } }
      // Clearing the fin clears solo with it: solo IS one fin being shown, so a
      // solo view with no fin selected is a view of nothing.
      : { selectedFin: null, focusSolo: false }
  ),
  selectFin: (index) => get().selectFinOf(get().selectedId, index),

  /**
   * Open the focus editor on a set: one product alone in its own view.
   *
   * It selects the set as well. The focus editor names its subject explicitly
   * everywhere it writes, but the fin markers and the panels behind it read the
   * selection, and a focused set that is not the selected one reads as a bug.
   */
  openFocus: (id, { solo = false } = {}) => {
    const target = id ?? get().selectedId
    if (!target || !get().items.some((i) => i.id === target)) return false
    // Focusing narrows the selection to its subject: the focus view shows one
    // thing, and leaving four others selected behind it would leave the panels
    // editing what is not on screen. sel() first, so the fin below overrides
    // the null it sets.
    set({
      ...sel([target]),
      focusId: target,
      focusAsk: null,
      focusSolo: solo,
      selectedFin: solo ? { id: target, index: 0 } : null,
      tool: 'select',
    })
    return true
  },
  closeFocus: () => set({ focusId: null, focusSolo: false }),

  /**
   * Ask which focus is wanted rather than choosing one.
   *
   * A run hanging in a ceiling and one unit with its clamps are different
   * enough subjects that guessing is worse than asking.
   */
  askFocus: (id) => {
    const target = id ?? get().selectedId
    if (!target || !get().items.some((i) => i.id === target)) return false
    set({ ...sel([target]), focusAsk: target, tool: 'select' })
    return true
  },
  cancelFocusAsk: () => set({ focusAsk: null }),

  setFocusSolo(solo) {
    if (!solo) return set({ focusSolo: false })
    const id = get().focusId
    if (!get().items.find((i) => i.id === id)) return
    // Keep the fin already picked when it belongs to this set, otherwise the
    // first — solo has to be showing something.
    const sel = get().selectedFin
    const index = sel?.id === id && sel.index != null ? sel.index : 0
    set({ focusSolo: true, selectedFin: { id, index } })
  },

  toggle: (k) => set((s) => ({ [k]: !s[k] })),
  setSpacePan: (spacePan) => {
    // key repeat fires keydown continuously; only write on a real change
    if (get().spacePan !== spacePan) set({ spacePan, hoverCell: spacePan ? null : get().hoverCell })
  },
  setBackground: (background) => set({ background }),

  /**
   * Turn preview on or off.
   *
   * Entering drops the selection, because the selection is the one thing
   * preview is about: leaving a set selected would leave the panel editing
   * something the scene says you cannot pick.
   */
  setPreview: (preview) => set(preview
    ? { preview, ...sel([]) }
    : { preview }),

  /**
   * Change the brush, in blank mode so nothing fills itself in.
   *
   * Changing the TYPE starts the choices over. A different type sells different
   * shapes, thicknesses, lengths and depths, so carrying the old answers across
   * would leave a specification half from one product and half from another —
   * and would leave Place lit through a change that ought to send you back to
   * the fields.
   */
  setBrush: (patch) => set((s) => {
    if (s.brush.type === 'tiles') {
      // Changing RANGE drops the tile count with it. The two ranges do not mean
      // the same thing by it: Univic Strip's 4 x 3 is what its FILE holds, and
      // carrying that into Wood Classic would arrive as a field the user never
      // asked for. The same bargain a cloud's shape makes with its size.
      const changingType = patch.ttype != null && patch.ttype !== s.brush.params.ttype
      const base = changingType
        ? { ...s.brush.params, cols: null, rows: null }
        : s.brush.params
      return { brush: { ...s.brush, params: reconcileTile({ ...base, ...patch }) } }
    }
    if (s.brush.type === 'fly') {
      return { brush: { ...s.brush, params: reconcileFly({ ...s.brush.params, ...patch }) } }
    }
    if (s.brush.type === 'clouds') {
      // A shape change drops the size with it: triangle has no 600, so a size
      // carried across can name a model that does not exist.
      const changingShape = patch.shape != null && patch.shape !== s.brush.params.shape
      const base = changingShape ? { ...s.brush.params, size: null } : s.brush.params
      return {
        brush: { ...s.brush, params: reconcileCloud({ ...base, ...patch }) },
      }
    }
    const changingType = patch.btype != null && patch.btype !== s.brush.params.btype
    const base = changingType ? emptyBrushParams() : s.brush.params
    return { brush: { ...s.brush, params: reconcile({ ...base, ...patch }, { blank: true }) } }
  }),

  /**
   * Switch products.
   *
   * The specification does not survive: a baffle's thickness and a tile's
   * perforation are not the same decision wearing two labels, and carrying
   * anything across would leave a brush half one product and half another. The
   * selection goes too, because the reason to change product is to place one.
   */
  setProduct: (type) => set((s) => (type === s.brush.type ? {} : {
    brush: { type, params: emptyParamsFor(type) },
    ...sel([]),
  })),

  setRoom(roomId) {
    // Cells are room-relative, so items cannot survive a room change — a layout
    // laid out on a 30x23 grid means nothing on a 21x17 one. The zone override
    // goes with them: a 12 x 9 m zone carried into a boardroom is not a zone
    // the user asked for.
    get().pushUndo()
    set({
      roomId,
      _room: effectiveRoom(roomId, null),
      _roomKey: roomKey(roomId, null),
      ceilingOverride: null,
      items: [], obstructions: [], groups: [], ...sel([]),
    })
  },

  /**
   * Resize the ceiling zone.
   *
   * Shrinking can leave items off the new grid. They are dropped and counted
   * rather than clamped inward: clamping would pile them along the new edge,
   * overlapping each other, which is a worse answer than saying what was lost.
   * One undo step puts them all back.
   */
  setCeiling(patch) {
    const current = get().ceilingOverride ?? roomZone(get().room())
    return get()._applyZone(clampZone({ ...current, ...patch }))
  },

  /**
   * Back to the ceiling the room itself defines.
   *
   * Clears the override rather than setting one equal to the room: a zone that
   * merely happens to match is still a custom zone, and would be exported as
   * one and survive a room change it should not survive.
   */
  resetCeiling() {
    if (!get().ceilingOverride) return { dropped: 0, zone: roomZone(get().room()) }
    return get()._applyZone(null)
  },

  /** Shared by setCeiling and resetCeiling: swap the zone, prune what no longer fits. */
  _applyZone(zone) {
    const roomId = get().roomId
    const room = effectiveRoom(roomId, zone)
    const g = gridOf(room)

    const kept = []
    let dropped = 0
    for (const it of get().items) {
      const fp = footprint(it, g)
      const clash = kept.some((o) => overlaps(footprint(o, g), fp))
      if (!onGrid(fp, g) || clash) { dropped++; continue }
      kept.push(it)
    }
    // Bounded against the MASK's own dimensions, not the cell grid's. The two
    // are different resolutions — the grid counts millimetres and the mask
    // counts 100 mm squares — and testing one against the other throws away
    // every mark on the ceiling.
    const m = maskDims(g)
    const blocked = get().obstructions.filter((k) => {
      const [i, j] = k.split(',').map(Number)
      return i >= 0 && j >= 0 && i < m.cols && j < m.rows
    })

    get().pushUndo()
    set((st) => ({
      ceilingOverride: zone,
      _room: room,
      _roomKey: roomKey(roomId, zone),
      // A resize drops what no longer fits, which can take a group below two
      // members — and a group of one is a label on an item.
      ...pruneGroups(kept, st.groups),
      obstructions: blocked,
      // Whatever survived the resize stays selected; whatever was dropped
      // cannot be, and a selection naming an item that is gone is a panel
      // editing something nobody can see.
      ...sel(st.selectedIds.filter((id) => kept.some((i) => i.id === id))),
    }))
    return { dropped, zone: zone ?? roomZone(room) }
  },

  // ---- undo ---------------------------------------------------------------
  pushUndo() {
    set((s) => ({ undoStack: [...s.undoStack, JSON.stringify(documentOf(s))].slice(-UNDO_DEPTH) }))
  },

  undo() {
    const stack = get().undoStack
    if (!stack.length) return false
    const doc = JSON.parse(stack[stack.length - 1])
    set({
      ...doc,
      _room: effectiveRoom(doc.roomId, doc.ceilingOverride ?? null),
      _roomKey: roomKey(doc.roomId, doc.ceilingOverride ?? null),
      undoStack: stack.slice(0, -1),
      ...sel([]),
    })
    return true
  },

  // ---- placement ----------------------------------------------------------
  /**
   * Is the set being dragged — or its group — somewhere it could not be left?
   *
   * Against everything OUTSIDE the drag: the members of a group cannot clash
   * with each other, because they all moved by the same delta.
   */
  dragIllegal(id) {
    const g = get().grid()
    const d = get().dragFrom
    const mine = d ? new Set(d.cells.map(([x]) => x)) : new Set([id])
    return get().items.some((i) => mine.has(i.id) && !get().canPlace(footprint(i, g), mine))
  },

  /** True if the footprint fits: on-grid, unobstructed, not overlapping. */
  canPlace(fp, ignore = null) {
    const g = get().grid()
    // A SET or one id. Moving a group has to ignore every member at once —
    // they overlap their own old positions on the way past each other, and a
    // test that could only forgive one of them would refuse every group move
    // that was not a single step into empty ceiling.
    const skip = ignore == null
      ? null
      : (ignore instanceof Set ? ignore : new Set(Array.isArray(ignore) ? ignore : [ignore]))
    if (!onGrid(fp, g)) return false
    // maskBlocks asks the OBSTRUCTIONS whether they touch this footprint, which
    // is O(marks). Enumerating the footprint's own cells and testing each was
    // O(area) — at a millimetre pitch that is 380,000 lookups per drag frame.
    if (maskBlocks(fp, g, get().obstructions)) return false
    return !get().items.some((o) => !skip?.has(o.id) && overlaps(footprint(o, g), fp))
  },

  /**
   * What the current brush would occupy, and the measured fields that go with
   * it. Every placement path goes through this, so placeAt and autoLayout
   * cannot drift into producing differently-shaped items.
   */
  brushShape() {
    const g = get().grid()
    const b = get().brush
    const base = productCells(b, g.pitch)
    return { base, fields: { type: b.type, params: structuredClone(b.params), ...base } }
  },

  /** Place at a cell, centring the product on the cursor. */
  placeAt(i, j) {
    // Nothing is placed from a half-specified brush. The Place tool is faded
    // while fields are outstanding, but a stray click, a keyboard route or a
    // future caller should not be able to get round that and drop a set built
    // from whatever this file happened to default to.
    if (!productReady(get().brush)) return null
    const g = get().grid()
    const { base, fields } = get().brushShape()
    const rot = get().brush.params.rot ?? 0
    const along = rot === 90 || rot === 270
    const ci = along ? base.cj : base.ci
    const cj = along ? base.ci : base.cj
    // Snapped to what this kind of set lands on — its own module for a tile,
    // 100 mm for everything else. The grid counts millimetres now, so without
    // this a dropped set would sit wherever the pointer happened to be.
    const shape = { type: get().brush.type, params: get().brush.params }
    const [si, sj] = snapCorner(i - Math.floor(ci / 2), j - Math.floor(cj / 2), shape, g)
    // Clamped ON THE STEP. Without the step the clamp undoes the snap that was
    // just done: a block dropped near the far edge lands on `cols - ci`, which
    // is not a multiple of the module, and everything duplicated from it
    // inherits that half-module offset.
    const [i0, j0] = clampCorner(si, sj, ci, cj, g, snapStepOf(shape, g))
    const fp = { i0, j0, ci, cj }
    if (!get().canPlace(fp)) return null
    get().pushUndo()
    const item = { id: uid(), cell: [i0, j0], rot, ...fields }
    set((s) => ({ items: [...s.items, item], ...sel([item.id]) }))
    return item.id
  },

  /**
   * Patch an item. Rejected — leaving the item untouched — if the result would
   * not fit, so an illegal state is never reachable through the UI.
   */
  update(id, patch, { undoable = true, force = false } = {}) {
    const g = get().grid()
    const cur = get().items.find((i) => i.id === id)
    if (!cur) return false

    let next = { ...cur, ...patch }
    if (patch.params) {
      // A tile block is not a baffle wearing different words, and neither is a
      // cloud: reconciling one against the other's defaults produces an item
      // with a btype and no wood, which renders as a product nobody asked for.
      if (cur.type === 'tiles') next.params = reconcileTile({ ...cur.params, ...patch.params })
      else if (cur.type === 'fly') next.params = reconcileFly({ ...cur.params, ...patch.params })
      else if (cur.type === 'clouds') {
        next.params = reconcileCloud({ ...cur.params, ...patch.params })
      } else next.params = reconcile({ ...cur.params, ...patch.params })
      // a set's footprint follows its own dimensions, so resizing changes it
      Object.assign(next, productCells({ type: cur.type, params: next.params }, g.pitch))
    }

    // THE SET'S SUSPENSION IS THE WHOLE RUN'S HEIGHT.
    //
    // A fin's own drop is stored as an absolute height, so raising the set used
    // to move only the fins that had no height of their own: a staggered run
    // stood still while the box around it rose. Reported as "only the boundary
    // box moves, the baffle doesn't".
    //
    // So the set's control moves the RUN, and a fin that hangs lower than its
    // neighbours goes on hanging lower by the same amount. The alternative —
    // storing each fin's drop as an offset from the set — would say the same
    // thing more neatly and would rewrite the meaning of every fin drop already
    // saved in a session, a link or an exported file.
    //
    // Only an explicit drop edit shifts them. reconcile can settle `drop` as a
    // consequence of something else entirely, and that is not somebody asking
    // to move the run.
    if (patch.params?.drop !== undefined && cur.params?.drop != null && next.params?.finOverrides) {
      const ovs = next.params.finOverrides
      // Only the fins that hang at a height of their own. One FOLLOWING the set
      // already reads the set's drop, and writing a number into it would
      // quietly give it a height of its own.
      const own = Object.values(ovs).map((o) => o?.drop).filter((d) => d != null)
      let delta = (next.params.drop ?? 0) - cur.params.drop

      if (delta && own.length) {
        const lo = BAFFLE_SHARED.drop.min
        const hi = BAFFLE_SHARED.drop.max
        // THE RUN TRAVELS AS ONE, so it goes only as far as its deepest and
        // shallowest fins allow.
        //
        // Clamping each fin separately looked simpler and quietly destroyed
        // things: raising a staggered run to the limit piled every deep fin
        // onto 1.2 m, and moving the set back did not bring the stagger with
        // it — the offsets were gone. Refusing the last few millimetres is a
        // control that appears to stop; the other is a control that eats your
        // work.
        const round = (v) => Math.round(v * 1e4) / 1e4
        delta = Math.min(
          Math.min(...own.map((d) => hi - d)),
          Math.max(Math.max(...own.map((d) => lo - d)), delta),
        )
        const moved = {}
        for (const [k, ov] of Object.entries(ovs)) {
          moved[k] = ov?.drop == null ? ov : { ...ov, drop: round(ov.drop + delta) }
        }
        // The set's own number follows what actually happened. Left at what was
        // asked for it would read 900 mm over a run that had not moved.
        next.params = {
          ...next.params,
          finOverrides: moved,
          drop: round(cur.params.drop + delta),
        }
      }
    }

    // Direction is one fact under two names. `item.rot` is what the scene and
    // the grid turn by; `params.rot` is what the panel shows and what runLimits
    // measures the run across. They are written from opposite ends — Rotate
    // sets the first, the Direction field the second — so whichever arrives,
    // the other follows it.
    //
    // Left to drift they disagreed both ways round: picking a direction in the
    // panel turned nothing at all, and pressing Rotate left the panel naming
    // the old direction and capping the count against the wrong wall.
    const turn = patch.rot ?? patch.params?.rot
    if (turn != null) {
      next.rot = turn
      if (next.params && next.params.rot !== turn) next.params = { ...next.params, rot: turn }
    }

    const fp = footprint(next, g)
    // Stepless on purpose. An arrow-key nudge comes through here and has to be
    // able to sit anywhere; the snapped paths — placeAt and dragTo — do their
    // own clamping on the step before they call this.
    const [i0, j0] = clampCorner(fp.i0, fp.j0, fp.ci, fp.cj, g)
    const fixed = { ...next, cell: [i0, j0] }
    // `force` is for a DRAG IN PROGRESS, and nothing else passes it. A set
    // being dragged moves through whatever is in the way — other sets, the
    // obstruction mask — because stopping dead at the first obstacle makes it
    // impossible to move a panel past a row of its neighbours without taking
    // them out of the way first. The position is checked when the pointer is
    // released; see endDrag, which puts it back if it will not do.
    //
    // NOT off the ceiling: clampCorner above has already held the corner inside
    // the grid, so the edge still bounds the drag.
    if (!force && !get().canPlace(footprint(fixed, g), id)) return false

    if (undoable) get().pushUndo()
    set((s) => ({ items: s.items.map((i) => (i.id === id ? fixed : i)) }))
    return true
  },

  /** Patch the selected item's product parameters. */
  updateParams(patch, opts) {
    const id = get().selectedId
    return id ? get().update(id, { params: patch }, opts) : false
  },

  /** Patch a single fin inside a named set. */
  updateFinOf(id, index, patch) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return false
    const finOverrides = { ...(item.params.finOverrides ?? {}) }
    finOverrides[index] = { ...(finOverrides[index] ?? {}), ...patch }
    return get().update(item.id, { params: { finOverrides } })
  },

  /**
   * Give one tile of a block its own finish.
   *
   * The tile counterpart of updateFinOf. Merged rather than replaced, so
   * setting a colour on a tile that already had its own perforation keeps both.
   */
  updateTileOf(id, index, patch) {
    const item = get().items.find((i) => i.id === id)
    if (!item || item.type !== 'tiles') return false
    const tileOverrides = { ...(item.params.tileOverrides ?? {}) }
    tileOverrides[index] = { ...(tileOverrides[index] ?? {}), ...patch }
    return get().update(item.id, { params: { tileOverrides } })
  },

  /** Drop a tile's override, so it follows the block again. */
  resetTileOf(id, index) {
    const item = get().items.find((i) => i.id === id)
    if (!item || item.type !== 'tiles') return false
    const tileOverrides = { ...(item.params.tileOverrides ?? {}) }
    delete tileOverrides[index]
    return get().update(item.id, { params: { tileOverrides } })
  },

  /** Drop every tile override on a block. */
  resetAllTilesOf(id) {
    const item = get().items.find((i) => i.id === id)
    if (!item || item.type !== 'tiles') return false
    return get().update(item.id, { params: { tileOverrides: {} } })
  },

  /** Drop a fin's override, so it follows the set again. */
  resetFinOf(id, index) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return false
    const finOverrides = { ...(item.params.finOverrides ?? {}) }
    delete finOverrides[index]
    return get().update(item.id, { params: { finOverrides } })
  },

  /** Patch a single fin inside the selected set. */
  updateFin: (index, patch) => get().updateFinOf(get().selectedId, index, patch),

  resetFin: (index) => get().resetFinOf(get().selectedId, index),

  move(id, di, dj) {
    const it = get().items.find((i) => i.id === id)
    if (!it) return false
    return get().update(id, { cell: [it.cell[0] + di, it.cell[1] + dj] })
  },

  /**
   * Move a set to a cell during a DRAG, snapped to what it lands on.
   *
   * The grid counts millimetres now, so an unsnapped drag would put a set
   * wherever the pointer happened to be. A tile lands on its own module — which
   * is what lets two of them share a tee — and everything else on 100 mm, the
   * step the grid used to have. Arrow-key nudges deliberately do NOT come
   * through here: a nudge that snapped back to where it started would do
   * nothing at all.
   */
  /**
   * A drag begins.
   *
   * Two things have to be remembered before anything moves: WHERE IT WAS, so a
   * release somewhere illegal can put it back, and an undo step, so the whole
   * drag is one entry rather than one per cell crossed. dragTo has claimed that
   * second thing in a comment for a long time and nothing was pushing it — a
   * drag was not undoable at all until this.
   *
   * The undo step is taken back again by endDrag when the drag turns out to
   * have changed nothing, so a click that happens to wobble does not fill the
   * stack with entries that undo to themselves.
   */
  beginDrag(id) {
    const it = get().items.find((x) => x.id === id)
    if (!it) return false
    // The same rule dragTo uses to decide what moves: a member singled out of a
    // group drags alone, a whole selected group drags together.
    const members = it.groupId ? membersOf(get().items, it.groupId) : null
    const whole = members && members.every((m) => get().selectedIds.includes(m.id))
    const moving = (members && members.length > 1 && whole) ? members : [it]
    get().pushUndo()
    set({
      dragFrom: { id, cells: moving.map((m) => [m.id, [...m.cell]]) },
      dragBlocked: null,
    })
    return true
  },

  /**
   * A drag ends.
   *
   * Puts the sets back if where they were let go will not take them, and takes
   * the undo step back with them — a drag that ends where it started is not a
   * change, and an undo entry that undoes to itself is worse than none.
   *
   * Returns true when it snapped back.
   */
  endDrag() {
    const d = get().dragFrom
    if (!d) {
      if (get().dragBlocked !== null) set({ dragBlocked: null })
      return false
    }
    const g = get().grid()
    const mine = new Set(d.cells.map(([id]) => id))
    const back = new Map(d.cells)
    const here = get().items.filter((i) => mine.has(i.id))

    // Illegal against everything OUTSIDE the drag. The sets being dragged
    // cannot clash with each other — they all moved by the same delta.
    const illegal = here.some((i) => !get().canPlace(footprint(i, g), mine))
    const moved = here.some((i) => {
      const was = back.get(i.id)
      return !was || was[0] !== i.cell[0] || was[1] !== i.cell[1]
    })

    if (illegal || !moved) {
      set((s) => ({
        items: s.items.map((i) => (mine.has(i.id) ? { ...i, cell: [...back.get(i.id)] } : i)),
        undoStack: s.undoStack.slice(0, -1),
        dragFrom: null,
        dragBlocked: null,
      }))
      return illegal
    }
    set({ dragFrom: null, dragBlocked: null })
    return false
  },

  dragTo(id, i, j) {
    const g = get().grid()
    const it = get().items.find((x) => x.id === id)
    if (!it) return false
    // Snapped, then held inside the ceiling ON THE SAME STEP. update() clamps
    // too, but stepless — it has to be, because an arrow-key nudge goes through
    // it and must be able to sit anywhere. So a drag that reaches the far edge
    // has to do its own bounded snap, or the clamp there would quietly take it
    // off the module.
    const fp = footprint(it, g)
    // In a group AND the whole group is selected? Then the drag belongs to the
    // group, and the step is the one every member can land on rather than this
    // item's own.
    //
    // Singled out with alt-click, it drags ALONE. A group is a set of items,
    // not a rigid body: dragging the group moves it as one, dragging a member
    // you have picked out moves that member. Anything else would make it
    // impossible to nudge one tile of a zone without first leaving the zone.
    const members = it.groupId ? membersOf(get().items, it.groupId) : null
    const whole = members && members.every((m) => get().selectedIds.includes(m.id))
    if (members && members.length > 1 && whole) {
      // Rounded here rather than through snapCorner, which derives the step
      // from one item: a group's step is the coarsest of its members and no
      // single item knows it.
      const [gi, gj] = groupStep(members, g)
      const si = Math.round(i / gi) * gi
      const sj = Math.round(j / gj) * gj
      get().moveGroup(it.groupId, si - it.cell[0], sj - it.cell[1],
        { undoable: false, force: true })
      set({ dragBlocked: get().dragIllegal(id) ? id : null })
      return true
    }
    const [si, sj] = clampCorner(
      ...snapCorner(i, j, it, g), fp.ci, fp.cj, g, snapStepOf(it, g),
    )
    // ALREADY THERE. Most frames of a drag ask for the cell the set is already
    // on; there is nothing to move, but the set may still be sitting somewhere
    // illegal from an earlier frame, so the halo is told either way.
    if (si === it.cell[0] && sj === it.cell[1]) {
      set({ dragBlocked: get().dragIllegal(id) ? id : null })
      return false
    }
    // IT MOVES WHATEVER IS THERE. Passing through is the point — see update's
    // `force`. What used to happen is that the set stopped dead at the first
    // obstacle, so moving a panel past a row of its neighbours meant moving
    // them out of the way first.
    get().update(id, { cell: [si, sj] }, { undoable: false, force: true })
    // Red while it is somewhere it could not be left. The question is now about
    // WHERE IT IS rather than whether the move was refused, because the move is
    // never refused any more.
    set({ dragBlocked: get().dragIllegal(id) ? id : null })
    return true
  },

  /**
   * Rotate about the footprint centre, so it turns in place not around a corner.
   *
   * The step is the product's, not a constant here: 45 degrees for a cloud,
   * which hangs free, and a quarter turn for a tile block and a baffle run,
   * which do not. See PRODUCT_TYPES.rotStep for why.
   *
   * The new extent is asked of `footprint` rather than worked out again, so the
   * corner this lands on and the corner the grid then reads are the same sum.
   */
  rotate(id) {
    const g = get().grid()
    const it = get().items.find((i) => i.id === id)
    if (!it) return false
    const before = footprint(it, g)
    const cx = before.i0 + before.ci / 2
    const cz = before.j0 + before.cj / 2
    const rot = ((it.rot ?? 0) + rotStepFor(it.type)) % 360
    const after = footprint({ ...it, rot }, g)
    return get().update(id, {
      rot, cell: [Math.round(cx - after.ci / 2), Math.round(cz - after.cj / 2)],
    })
  },

  // ---- groups -------------------------------------------------------------
  /** The group the current selection is in, when the whole of it is one group. */
  selectedGroup() {
    const sel2 = get().selectedItems()
    if (!sel2.length) return null
    const id = sel2[0].groupId
    if (!id || sel2.some((i) => i.groupId !== id)) return null
    // And the selection has to BE the group, not part of it.
    return membersOf(get().items, id).length === sel2.length
      ? get().groups.find((gr) => gr.id === id) ?? null
      : null
  },

  /**
   * Make a group of what is selected.
   *
   * Two or more, because a group of one is a name attached to an item and
   * every verb below already works on a single item. Anything already in
   * another group LEAVES it — one item is in one group — and a group left with
   * fewer than two members is dissolved rather than kept as a label on nothing.
   */
  groupSelected(name) {
    const picked = get().selectedItems()
    if (picked.length < 2) return null
    const id = gid()
    const chosen = new Set(picked.map((i) => i.id))
    get().pushUndo()
    set((s) => {
      const claimed = s.items.map((i) => (chosen.has(i.id) ? { ...i, groupId: id } : i))
      // Numbered against the groups that will SURVIVE this, so the name does
      // not count one that is about to be dissolved.
      const n = s.groups.filter((gr) => membersOf(claimed, gr.id).length >= 2).length
      // The new group goes in BEFORE pruning. Prune without it and pruneGroups
      // sees items claiming a group it has never heard of and sets them free
      // again — which is a group record with no members in it.
      //
      // The prune is still needed: the groups those items LEFT may now be too
      // thin to stand.
      return pruneGroups(claimed, [...s.groups, { id, name: name || `Group ${n + 1}` }])
    })
    return id
  },

  /**
   * Take some members OUT of their group, leaving the group standing.
   *
   * Not the same thing as ungrouping. Ungroup dissolves the whole set; this
   * takes one tile — or several — out of it and leaves the rest a group. The
   * items do not move: leaving a group is a change of membership, not of place.
   *
   * A group that falls below two members afterwards is dissolved, for the same
   * reason it is anywhere else: a group of one is a name attached to an item.
   */
  removeFromGroup(ids) {
    const want = new Set(ids ?? get().selectedIds)
    const leaving = get().items.filter((i) => want.has(i.id) && i.groupId)
    if (!leaving.length) return false
    get().pushUndo()
    set((s) => {
      const left = s.items.map((i) => (want.has(i.id) ? { ...i, groupId: null } : i))
      return pruneGroups(left, s.groups)
    })
    return true
  },

  /** Take a group apart. The items stay exactly where they are. */
  ungroup(id) {
    const target = id ?? get().selectedGroup()?.id
    if (!target) return false
    get().pushUndo()
    set((s) => ({
      items: s.items.map((i) => (i.groupId === target ? { ...i, groupId: null } : i)),
      groups: s.groups.filter((gr) => gr.id !== target),
    }))
    return true
  },

  renameGroup(id, name) {
    if (!get().groups.some((gr) => gr.id === id)) return false
    set((s) => ({ groups: s.groups.map((gr) => (gr.id === id ? { ...gr, name } : gr)) }))
    return true
  },

  selectGroup(id) {
    const ids = membersOf(get().items, id).map((i) => i.id)
    if (!ids.length) return false
    get().selectMany(ids)
    return true
  },

  /**
   * Move a whole group by a cell delta — all of it, or none of it.
   *
   * Refused rather than clamped when a member would leave the ceiling. Clamping
   * one member and not the others would change the SHAPE of the group, which is
   * the one thing a group is: everything keeps its place relative to everything
   * else, or nothing moves.
   */
  moveGroup(id, di, dj, { undoable = true, force = false } = {}) {
    const g = get().grid()
    const members = membersOf(get().items, id)
    if (!members.length || (!di && !dj)) return false
    const mine = new Set(members.map((i) => i.id))
    const moved = members.map((i) => ({ ...i, cell: [i.cell[0] + di, i.cell[1] + dj] }))
    for (const m of moved) {
      const fp = footprint(m, g)
      // THE CEILING EDGE HOLDS EVEN UNDER `force`. A single set is bounded by
      // clampCorner before it ever reaches update(); a group is not, so this is
      // where the same bound comes from. Without it a forced group drag would
      // carry the whole thing off the ceiling and then have to be put back.
      if (!onGrid(fp, g)) return false
      if (force) continue
      if (maskBlocks(fp, g, get().obstructions)) return false
      // Against everything OUTSIDE the group. Members overlapping their own old
      // places on the way is not a clash; members overlapping each other would
      // be, and they cannot — they all move by the same delta.
      if (get().items.some((o) => !mine.has(o.id) && overlaps(footprint(o, g), fp))) return false
    }
    if (undoable) get().pushUndo()
    const by = new Map(moved.map((m) => [m.id, m]))
    set((s) => ({ items: s.items.map((i) => by.get(i.id) ?? i) }))
    return true
  },

  /**
   * Can this lot be edited as one? Only when they are all the same product.
   *
   * Returns the shared spec key, or null. The panel uses it both ways: as the
   * gate, and as the answer to "whose fields do I draw".
   */
  sharedSpec(ids) {
    const want = new Set(ids ?? get().selectedIds)
    const picked = get().items.filter((i) => want.has(i.id))
    if (!picked.length) return null
    const k = specKey(picked[0])
    return picked.every((i) => specKey(i) === k) ? k : null
  },

  /**
   * Edit every member at once — ALL of them, or none.
   *
   * The all-or-nothing is the whole difficulty. A parameter change can change a
   * FOOTPRINT — a baffle's count, a tile field's columns — so applying to ten
   * members one at a time through update() can leave three refused and seven
   * changed, which is a half-edited group and a state nobody asked for. The
   * whole result is built first, tested as a set, and then committed or thrown
   * away.
   */
  updateGroup(ids, patch) {
    const g = get().grid()
    const want = new Set(ids ?? get().selectedIds)
    const picked = get().items.filter((i) => want.has(i.id))
    if (!picked.length) return false
    if (!get().sharedSpec([...want])) return false

    const next = picked.map((it) => {
      const params = it.type === 'tiles'
        ? reconcileTile({ ...it.params, ...patch })
        : it.type === 'fly'
          ? reconcileFly({ ...it.params, ...patch })
          : it.type === 'clouds'
            ? reconcileCloud({ ...it.params, ...patch })
            : reconcile({ ...it.params, ...patch })
      const turn = patch.rot
      const out = {
        ...it,
        params,
        ...productCells({ type: it.type, params }, g.pitch),
      }
      if (turn != null) {
        out.rot = turn
        out.params = { ...out.params, rot: turn }
      }
      return out
    })

    // Every one of them has to fit, against the ceiling, the mask, everything
    // outside the group, and each other.
    const mine = new Set(next.map((m) => m.id))
    for (const m of next) {
      const fp = footprint(m, g)
      if (!onGrid(fp, g)) return false
      if (maskBlocks(fp, g, get().obstructions)) return false
      if (get().items.some((o) => !mine.has(o.id) && overlaps(footprint(o, g), fp))) return false
      if (next.some((o) => o.id !== m.id && overlaps(footprint(o, g), fp))) return false
    }

    get().pushUndo()
    const by = new Map(next.map((m) => [m.id, m]))
    set((s) => ({ items: s.items.map((i) => by.get(i.id) ?? i) }))
    return true
  },

  /** Delete a group and everything in it, in one undo step. */
  removeGroup(id) {
    const members = membersOf(get().items, id)
    if (!members.length) return false
    const mine = new Set(members.map((i) => i.id))
    get().pushUndo()
    set((s) => ({
      items: s.items.filter((i) => !mine.has(i.id)),
      groups: s.groups.filter((gr) => gr.id !== id),
      ...sel(s.selectedIds.filter((x) => !mine.has(x))),
    }))
    return true
  },

  /**
   * Copy a group whole, offset by its own width until it finds room.
   *
   * The copy is its OWN group. Two groups that shared an id would be one group
   * in two places, and every verb here would move both.
   */
  duplicateGroup(id) {
    const g = get().grid()
    const members = membersOf(get().items, id)
    if (!members.length) return null
    const b = groupBounds(members, g)
    const [si, sj] = groupStep(members, g)
    // Stepped by the group's own width, rounded UP to the step so the copy
    // lands on the same lattice its original is on.
    const up = (v, st) => Math.ceil(v / st) * st
    const dirs = [[up(b.ci, si), 0], [0, up(b.cj, sj)], [-up(b.ci, si), 0], [0, -up(b.cj, sj)]]
    const mine = new Set(members.map((i) => i.id))
    for (let ring = 1; ring <= 8; ring++) {
      for (const [dx, dz] of dirs) {
        const made = members.map((m) => ({
          ...structuredClone(m),
          id: uid(),
          cell: [m.cell[0] + dx * ring, m.cell[1] + dz * ring],
        }))
        const fits = made.every((m) => {
          const fp = footprint(m, g)
          return onGrid(fp, g) && !maskBlocks(fp, g, get().obstructions)
            && !get().items.some((o) => overlaps(footprint(o, g), fp))
        })
        if (!fits) continue
        const copy = gid()
        for (const m of made) m.groupId = copy
        const name = get().groups.find((gr) => gr.id === id)?.name ?? 'Group'
        get().pushUndo()
        set((s) => ({
          items: [...s.items, ...made],
          groups: [...s.groups, { id: copy, name: `${name} copy` }],
          ...sel(made.map((m) => m.id)),
        }))
        return copy
      }
    }
    return null
  },

  /**
   * Turn a group about its own centre.
   *
   * Two things turn at once: each member spins on the spot, AND its position
   * swings round the group's centre. Doing only the first would leave a row of
   * turned baffles still in a row.
   *
   * The step is the COARSEST its members allow — a quarter turn if anything in
   * it is a tile or a run, because those do not hang free. All-or-nothing, for
   * the same reason a move is.
   */
  rotateGroup(id) {
    const g = get().grid()
    const members = membersOf(get().items, id)
    if (members.length < 1) return false
    const step = Math.max(...members.map((m) => rotStepFor(m.type)))
    if (step % 90 !== 0) return false // nothing sensible to do with 45 here
    const b = groupBounds(members, g)
    const cx = b.i0 + b.ci / 2
    const cz = b.j0 + b.cj / 2
    const mine = new Set(members.map((i) => i.id))
    const turned = members.map((m) => {
      const fp = footprint(m, g)
      // Its own centre, swung a quarter turn about the group's: (x, z) -> (-z, x)
      const mx = fp.i0 + fp.ci / 2 - cx
      const mz = fp.j0 + fp.cj / 2 - cz
      const nx = cx - mz
      const nz = cz + mx
      const rot = ((m.rot ?? 0) + step) % 360
      const after = footprint({ ...m, rot }, g)
      return {
        ...m,
        rot,
        cell: [Math.round(nx - after.ci / 2), Math.round(nz - after.cj / 2)],
        params: m.params && m.params.rot != null ? { ...m.params, rot } : m.params,
      }
    })
    for (const m of turned) {
      const fp = footprint(m, g)
      if (!onGrid(fp, g)) return false
      if (get().items.some((o) => !mine.has(o.id) && overlaps(footprint(o, g), fp))) return false
      if (turned.some((o) => o.id !== m.id && overlaps(footprint(o, g), fp))) return false
    }
    get().pushUndo()
    const by = new Map(turned.map((m) => [m.id, m]))
    set((s) => ({ items: s.items.map((i) => by.get(i.id) ?? i) }))
    return true
  },

  /** Duplicate, nudging outward until a free slot is found. */
  duplicate(id) {
    const g = get().grid()
    const src = get().items.find((i) => i.id === id)
    if (!src) return null
    const fp = footprint(src, g)
    const dirs = [[fp.ci, 0], [0, fp.cj], [-fp.ci, 0], [0, -fp.cj]]
    for (let ring = 1; ring <= 8; ring++) {
      for (const [dx, dz] of dirs) {
        const cell = [src.cell[0] + dx * ring, src.cell[1] + dz * ring]
        if (get().canPlace(footprint({ ...src, cell }, g))) {
          get().pushUndo()
          const item = { ...structuredClone(src), id: uid(), cell }
          set((s) => ({ items: [...s.items, item], ...sel([item.id]) }))
          return item.id
        }
      }
    }
    return null
  },

  remove(id) {
    if (!get().items.some((i) => i.id === id)) return false
    get().pushUndo()
    set((s) => {
      const ids = s.selectedIds.filter((x) => x !== id)
      // A group of one is a label on an item, not a group — so a group that
      // falls below two members is dissolved and its survivor set free.
      const pruned = pruneGroups(s.items.filter((i) => i.id !== id), s.groups)
      return {
        ...pruned,
        ...sel(ids),
        selectedFin: s.selectedFin?.id === id ? null : s.selectedFin,
      }
    })
    return true
  },

  clear() {
    if (!get().items.length) return
    get().pushUndo()
    set({ items: [], groups: [], ...sel([]) })
  },

  // ---- bulk layout --------------------------------------------------------
  /**
   * Fill the ceiling with rows of the current brush.
   *
   * The gap and margin are MILLIMETRES, not cells. They were cells, and a cell
   * stopped being a fixed size the day the grid went to a millimetre pitch — a
   * "gap of 2" then meant two millimetres.
   */
  autoLayout(gapMm = 600, marginMm = 300) {
    const g = get().grid()
    const cells = (mm) => Math.max(0, Math.round(mm / 1000 / g.pitch))
    const gap = cells(gapMm)
    const margin = cells(marginMm)
    const { base, fields } = get().brushShape()
    const rot = get().brush.params.rot ?? 0
    const along = rot === 90 || rot === 270
    const ci = along ? base.cj : base.ci
    const cj = along ? base.ci : base.cj
    const blocked = new Set(get().obstructions)
    const placed = []
    for (let j = margin; j + cj <= g.rows - margin; j += cj + gap) {
      for (let i = margin; i + ci <= g.cols - margin; i += ci + gap) {
        if (maskBlocks({ i0: i, j0: j, ci, cj }, g, blocked)) continue
        placed.push({ id: uid(), cell: [i, j], rot, ...structuredClone(fields) })
      }
    }
    get().pushUndo()
    // A fresh layout replaces the old one wholesale, and a group naming items
    // that are gone is a name attached to nothing.
    set({ items: placed, groups: [], ...sel([]) })
    return placed.length
  },

  /**
   * Apply a one-click layout.
   *
   * Presets REPLACE the layout rather than adding to it. Adding was the legacy
   * behaviour, but it predates overlap rejection — dropped onto an occupied
   * ceiling most of a preset would now be silently refused, which reads as the
   * button being broken. Replacing is predictable, and Ctrl+Z restores.
   */
  applyPreset(presetKey) {
    const g = get().grid()
    // The brush is passed in so a preset arranges an imported model when one is
    // chosen, instead of replacing it with the preset's catalogue product.
    const specs = buildPreset(presetKey, get().room(), g, get().brush.params)
    if (!specs.length) return { placed: 0, skipped: 0 }

    // WHICH PRODUCT THE PRESET PLACES.
    //
    // This used to be the word 'baffles', three times over: defaultBaffleParams
    // for the spec, baffleCells for the footprint, and 'baffles' on the item.
    // A preset that laid clouds would have had them reconciled as baffles,
    // measured as baffles and stored as baffles -- which is why clouds could
    // not have presets at all rather than merely not having any.
    //
    // Defaulting to baffles rather than refusing: every preset carries a type
    // now, and one that does not is one written before they did.
    const kind = getPreset(presetKey)?.type ?? 'baffles'
    const blocked = new Set(get().obstructions)
    const items = []
    let skipped = 0
    for (const sp of specs) {
      const params = kind === 'clouds'
        ? reconcileCloud(sp.params)
        : reconcile({ ...defaultBaffleParams(), ...sp.params })
      const cells = kind === 'clouds'
        ? cloudCells(params, g.pitch)
        : baffleCells(params, g.pitch)
      const item = { id: uid(), type: kind, cell: sp.cell, rot: sp.rot ?? 0, params, ...cells }
      const fp = footprint(item, g)
      const clash = items.some((o) => overlaps(footprint(o, g), fp))
      if (!onGrid(fp, g) || clash || maskBlocks(fp, g, blocked)) { skipped++; continue }
      items.push(item)
    }

    get().pushUndo()
    set((st) => ({
      items,
      groups: [],
      ...sel([]),
      // adopt the preset's product, so placing more by hand continues the look
      brush: items.length ? { type: kind, params: structuredClone(items[0].params) } : st.brush,
    }))
    return { placed: items.length, skipped }
  },

  /**
   * Save the ceiling as it stands, under a name.
   *
   * The document itself is what is stored — see lib/layouts.js. Refuses an
   * empty ceiling: a saved layout of nothing is a row in a list that does
   * nothing when picked.
   */
  saveLayout(name) {
    if (!get().items.length) return null
    return storeLayout(name, get().toJSON())
  },

  /**
   * Put a saved layout on THIS ceiling.
   *
   * The room is not changed. A saved layout records the room it came from, but
   * applying it is "put my ceiling here", not "take me back there" — so what
   * does not fit the ceiling in front of you is dropped and counted, the same
   * answer an oversized built-in preset gives.
   *
   * REPLACES, like every other preset, in one undo step.
   */
  applyLayout(layoutId) {
    const layout = getLayout(layoutId)
    if (!layout) return { placed: 0, skipped: 0 }
    const g = get().grid()
    // Cells are a count, not a distance: a layout saved on a coarser grid has
    // to be scaled before it means anything here.
    const was = Number(layout.doc?.ceiling?.pitch) || g.pitch
    const { items: built, dropped } = itemsFromDoc(layout.doc, g, was / g.pitch)

    // THE MASK BELONGS TO THE CEILING, NOT TO THE LAYOUT. Replacing the sets
    // leaves the obstructions where they are, so a saved set landing on a
    // light is refused here exactly as it would be by hand.
    const blocked = new Set(get().obstructions)
    const items = []
    let skipped = dropped
    for (const it of built) {
      if (maskBlocks(footprint(it, g), g, blocked)) { skipped++; continue }
      items.push(it)
    }
    const groups = keepGroups(items, layout.doc.groups)

    get().pushUndo()
    set((st) => ({
      items,
      groups,
      ...sel([]),
      // adopt what it placed, so placing more by hand continues the look
      brush: items.length
        ? { type: items[0].type, params: structuredClone(items[0].params) }
        : st.brush,
    }))
    return { placed: items.length, skipped }
  },

  /**
   * Repeat the selected set into a rows x columns array.
   *
   * Offsets are in CELLS, not metres: the legacy version took a metre spacing
   * that had nothing to do with the snap grid, so a copy could land between
   * cells. Here every copy is on-grid by construction, and any that will not
   * fit is dropped and counted rather than overlapping its neighbour.
   */
  arraySelected(rows, cols, gap = 1) {
    const src = get().selected()
    if (!src) return { placed: 0, skipped: 0 }
    const g = get().grid()
    const r = Math.min(15, Math.max(1, Math.floor(rows) || 1))
    const c = Math.min(15, Math.max(1, Math.floor(cols) || 1))
    const gp = Math.max(0, Math.floor(gap) || 0)
    if (r * c <= 1) return { placed: 0, skipped: 0 }

    const fp = footprint(src, g)
    const stepI = fp.ci + gp
    const stepJ = fp.cj + gp
    const made = []
    let skipped = 0
    for (let jj = 0; jj < r; jj++) {
      for (let ii = 0; ii < c; ii++) {
        if (ii === 0 && jj === 0) continue // the original stays put
        const cell = [src.cell[0] + ii * stepI, src.cell[1] + jj * stepJ]
        const cfp = footprint({ ...src, cell }, g)
        // canPlace tests the grid, the obstruction mask and items already in the
        // document; the copies made in THIS pass are not in it yet, so they are
        // checked separately.
        const clashesPending = made.some((o) => overlaps(footprint(o, g), cfp))
        if (get().canPlace(cfp) && !clashesPending) {
          made.push({ ...structuredClone(src), id: uid(), cell })
        } else {
          skipped++
        }
      }
    }
    if (!made.length) return { placed: 0, skipped }
    get().pushUndo()
    set((st) => ({ items: [...st.items, ...made] }))
    return { placed: made.length, skipped }
  },

  // ---- obstruction mask ---------------------------------------------------
  /**
   * Mark or unmark one MASK square.
   *
   * `i, j` here are mask coordinates, not cells. The mask has a coarser pitch
   * than the grid — a one-millimetre square of "there is a light here" is not a
   * statement anybody can paint — so they are converted before they meet a
   * footprint.
   */
  toggleObstruction(i, j) {
    const k = key(i, j)
    if (get().obstructions.includes(k)) {
      get().pushUndo()
      set((s) => ({ obstructions: s.obstructions.filter((c) => c !== k) }))
      return true
    }
    const g = get().grid()
    // a square already covered by a product cannot become an obstruction
    const fp = maskFootprint(i, j, g)
    if (get().items.some((it) => overlaps(footprint(it, g), fp))) return false
    get().pushUndo()
    set((s) => ({ obstructions: [...s.obstructions, k] }))
    return true
  },

  // ---- serialisation ------------------------------------------------------
  toJSON() {
    const s = get()
    // the effective room, not the base one — otherwise a custom zone is flagged
    // as custom while its dimensions are silently the room's, and the file
    // reloads onto a different grid than it was laid out on
    const r = s.room()
    const g = gridOf(r)
    return {
      version: SCHEMA_VERSION,
      sceneId: s.roomId,
      ceiling: {
        height: r.ceiling.y,
        width: +(r.ceiling.maxX - r.ceiling.minX).toFixed(3),
        length: +(r.ceiling.maxZ - r.ceiling.minZ).toFixed(3),
        pitch: g.pitch,
        // The mask's pitch is its OWN, and it has to be written down. Read back
        // as though it were the cell pitch, a mask saved at 100 mm comes back
        // divided by a hundred and lands in the corner.
        maskPitch: MASK_M,
        cols: g.cols,
        rows: g.rows,
        // false = the room's own ceiling; true = a zone set for this layout
        custom: !!s.ceilingOverride,
      },
      ceilingOverride: s.ceilingOverride ? { ...s.ceilingOverride } : null,
      obstructions: [...s.obstructions],
      // Only the NAMES. Which items are in which group rides on the items, so
      // writing it twice would be writing something that can disagree.
      groups: s.groups.map(({ id, name }) => ({ id, name })),
      items: s.items.map(({ id, type, cell, rot, ci, cj, params, groupId }) => ({
        id, type, cell, rot, ci, cj, params, groupId: groupId ?? null,
      })),
    }
  },

  /**
   * Adopt a document that came from somewhere else — a link, a saved session.
   *
   * fromJSON puts the ceiling back and nothing else; the BRUSH is not in the
   * document, so every caller had to sort it out for itself. Three of them now
   * — boot from a link, boot from a session, and a link pasted into a tab that
   * is already open — which is two too many for a rule that has to be the same
   * in all of them: a restored ceiling under a blank panel of fields is a
   * sidebar asking questions the ceiling has plainly answered.
   *
   * `brush` when the source HAS one, which a saved session does: it knows what
   * you were setting up, including a spec you half filled in and never placed.
   * Without one — a link carries no brush — the first set on the ceiling stands
   * in, the way applyPreset adopts a preset's product so that placing more by
   * hand continues the look.
   *
   * Through setProduct/setBrush rather than written straight in, so the
   * parameters go through reconcile() and cannot arrive in a combination the
   * catalogue does not sell.
   */
  openDoc(doc, { brush = null } = {}) {
    const result = get().fromJSON(doc)
    const lead = (brush?.type && brush.params)
      ? brush
      : (get().items[0] ? { type: get().items[0].type, params: get().items[0].params } : null)
    if (lead) {
      if (get().brush.type !== lead.type) get().setProduct(lead.type)
      get().setBrush(structuredClone(lead.params))
    }
    return result
  },

  fromJSON(doc) {
    if (!doc || !Array.isArray(doc.items)) throw new Error('not a configurator file')
    const room = getRoom(doc.sceneId)
    if (!room) throw new Error(`unknown scene "${doc.sceneId}"`)
    if (doc.version > SCHEMA_VERSION) {
      throw new Error(`file is version ${doc.version}; this build reads up to ${SCHEMA_VERSION}`)
    }
    // The zone has to be applied before anything is measured: items are tested
    // against the grid, and the grid is what the zone defines.
    const override = doc.ceilingOverride ? clampZone(doc.ceilingOverride) : null
    const effective = effectiveRoom(room.id, override)
    const g = gridOf(effective)

    // Cells are pitch-relative. A file written when a cell was 300 mm holds
    // numbers a fraction of the size a millimetre grid wants, so they are
    // rescaled by the ratio rather than trusted.
    const was = Number(doc.ceiling?.pitch) || g.pitch
    const k = was / g.pitch
    // The MASK is on its own pitch and rescales by its own ratio. Reading it
    // as the old kind is what getting this wrong looks like: a mask saved at
    // 100 mm, read as though it were millimetres, comes back divided by a
    // hundred and lands in the corner.
    const maskWas = Number(doc.ceiling?.maskPitch) || was
    const maskK = maskWas / MASK_M
    const rescale = ([i, j]) => (k === 1 ? [i, j] : [Math.round(i * k), Math.round(j * k)])

    const { items, dropped } = itemsFromDoc(doc, g, k)
    const groups = keepGroups(items, doc.groups)

    get().pushUndo()
    set({
      roomId: room.id,
      ceilingOverride: override,
      _room: effective,
      _roomKey: roomKey(room.id, override),
      items,
      groups,
      obstructions: Array.isArray(doc.obstructions) ? rescaleMask(doc.obstructions, maskK) : [],
      ...sel([]),
    })
    return { loaded: items.length, dropped }
  },
}))

/**
 * Turn a saved document's items into items for THIS grid.
 *
 * Shared by fromJSON, which opens a document into the room it names, and by
 * applyLayout, which drops a saved layout into the room you are already in.
 * One definition because the two must not disagree about what a saved item
 * means: the same reconciliation per product, the same rescale when the pitch
 * has moved, the same footprint maths, and the same answer to an item the
 * ceiling cannot hold.
 *
 * `k` is the ratio between the pitch the document was written at and this
 * grid's. Cells are a count, not a distance — a layout saved at 100 mm cells
 * and read at 1 mm lands in the corner without it.
 */
/**
 * The groups worth keeping, and the members set free.
 *
 * A group is kept only where at least two of its members made it onto this
 * ceiling — items can be dropped for being off-grid or blocked, and a group
 * that lost all but one of them is a name attached to nothing. MUTATES the
 * items it is given, clearing a groupId that now points at nothing.
 *
 * Shared by fromJSON and applyLayout for the same reason itemsFromDoc is: two
 * copies of this rule would eventually disagree about what a half-placed group
 * means.
 */
export function keepGroups(items, named) {
  const groups = (Array.isArray(named) ? named : [])
    .filter((gr) => gr?.id && membersOf(items, gr.id).length >= 2)
    .map(({ id, name }) => ({ id, name: name || 'Group' }))
  const live = new Set(groups.map((gr) => gr.id))
  for (const it of items) if (it.groupId && !live.has(it.groupId)) it.groupId = null
  return groups
}

export function itemsFromDoc(doc, g, k = 1) {
  const rescale = ([i, j]) => (k === 1 ? [i, j] : [Math.round(i * k), Math.round(j * k)])
  const items = []
  let dropped = 0
  for (const raw of doc.items ?? []) {
    // A tile block is not a baffle wearing different words. Reconciling it
    // against the baffle defaults produced an item with a btype and no wood,
    // which rendered as a baffle set nobody had asked for.
    const kind = raw.type ?? 'baffles'
    const params = kind === 'tiles'
      ? reconcileTile(raw.params ?? {})
      : kind === 'fly'
        ? reconcileFly(raw.params ?? {})
        : kind === 'clouds'
          ? reconcileCloud(raw.params ?? {})
          : reconcile({ ...defaultBaffleParams(), ...(raw.params ?? {}) })
    const item = {
      id: raw.id || uid(),
      type: raw.type ?? 'baffles',
      cell: rescale(raw.cell ?? [0, 0]),
      rot: raw.rot ?? 0,
      // Absent in every file written before groups existed, which is what
      // `?? null` is for: an old layout loads as a ceiling of ungrouped
      // items rather than failing to load at all.
      groupId: raw.groupId ?? null,
      // The item's rotation is the one that placed it, so params follows it
      // rather than the other way about. Files written before the two were
      // kept in step can carry a set turned to 90 whose params still say 0.
      params: { ...params, rot: raw.rot ?? 0 },
      ...productCells({ type: raw.type ?? 'baffles', params }, g.pitch),
    }
    // A file laid out on a different room can carry cells this ceiling does
    // not have. Drop those rather than silently clamping them into a pile.
    if (!onGrid(footprint(item, g), g)) { dropped++; continue }
    items.push(item)
  }
  return { items, dropped }
}

// ---------------------------------------------------------------------------
// parameter reconciliation
// ---------------------------------------------------------------------------

/**
 * Keep dependent catalogue fields legal after an edit.
 *
 * Options cascade in the workbook — VMT widths depend on thickness, blade
 * widths depend on shape, and each type allows only certain colour families. A
 * raw merge can leave a 300 mm width on a 25 mm VMT fin, which is not a product
 * that exists. Every write to `params` goes through here.
 *
 * `blank` is the brush's mode. A placed set must always be complete — it has to
 * render — so everything is filled in. The BRUSH must not be, or the panel
 * would fill itself in and "pick a length" would answer itself. In blank mode
 * nothing is chosen on the user's behalf.
 */
export function reconcile(p, { blank = false } = {}) {
  const bt = BAFFLE_TYPES[p.btype] ?? BAFFLE_TYPES.vmt
  const next = { ...p }
  // in blank mode nothing is filled in on the user's behalf
  const fill = (value, fallback) => (blank ? null : fallback)

  // Only a model can defer to materials of its own, so only a model needs
  // telling to use the catalogue instead. A parametric fin has no such choice —
  // its finish IS the catalogue — so the flag does not exist for one.
  if (next.model) next.finishAll = next.finishAll === true
  else delete next.finishAll

  if (bt.shapes) {
    if (!next.shape || !bt.shapes[next.shape]) next.shape = fill(next.shape, Object.keys(bt.shapes)[0])
  } else {
    next.shape = null
  }

  if (!bt.thicknesses.includes(next.thickness)) next.thickness = fill(next.thickness, bt.thicknesses[0])

  // A shape sold as a RANGE of depths rather than a list of them. Its profile
  // varies along the fin and scales with the figure set, so the figure is
  // clamped to the range and rounded to its step instead of being matched
  // against options that do not exist.
  const range = depthRangeOf(next)
  if (range) {
    // A PUBLISHED TAPER SURVIVES VERBATIM. 125-225 does not sit on the taper
    // rule below — half of 225 is 112.5 — so putting it through would quietly
    // rewrite a chosen profile into a neighbouring one nobody asked for.
    //
    // Only where the shape TAPERS. Flow's one listed width IS its range, and
    // exempting that would leave '75-300' in the document where every reader
    // since has expected the number 300.
    const published = range.taper && baffleWidths(next).includes(next.width)
    if (next.width == null && blank) next.width = null
    else if (!published) {
      const w = parseWidth(next.width)
      const deepest = Math.max(w.a, w.b)
      const d = Math.min(range.max, Math.max(range.min, Math.round(deepest / range.step) * range.step))
      // A shape that TAPERS keeps two ends: see the catalogue entry. One
      // number would render it straight.
      //
      // BOTH ENDS STAY INSIDE THE RANGE. Half of a 135 mm deep end is 70,
      // which is shallower than any tapered blade is made; the range is what
      // the fin lives between, not just what may be typed into the box. The
      // cost is that a taper asked for near the bottom of the range comes out
      // shallow, and at 100 flat — which is the honest answer to asking for a
      // tapered blade 100 mm deep when the shallowest published taper is
      // 100-200.
      next.width = range.taper
        ? `${Math.max(range.min, Math.round((d * range.taper) / range.step) * range.step)}-${d}`
        : d
    }
  } else {
    const widths = baffleWidths(next)
    if (!widths.includes(next.width)) next.width = fill(next.width, widths[0])
  }

  // Nearest available length, not the longest: switching type should keep the
  // set roughly the size it already was. Taking the last entry used to jump a
  // 1200 mm run to 2780 mm, which is a different product, not a correction.
  if (!bt.lengths.includes(next.length)) {
    next.length = next.length == null
      ? fill(null, bt.lengths[0])
      : bt.lengths.reduce(
        (best, L) => (Math.abs(L - next.length) < Math.abs(best - next.length) ? L : best),
        bt.lengths[0]
      )
  }

  // A model is sized BY the catalogue — from the thickness, length and width
  // just settled — rather than by free millimetre sliders of its own. Derived
  // here, after those three are known to be legal values.
  if (next.model) {
    const s = baffleSizeMm(next)
    const axis = (k) => {
      const lim = MODEL_SIZE_LIMITS[k]
      return Math.min(lim.max, Math.max(lim.min, Math.round(s[k])))
    }
    next.sizeMm = { l: axis('l'), w: axis('w'), h: axis('h') }
  } else {
    next.sizeMm = null
  }

  // A model fin takes the finishes a model can actually wear, which is not the
  // same list as the catalogue type's.
  const families = next.model ? MODEL_FIN_FAMILIES : bt.families
  if (!families.includes(next.family)) next.family = fill(next.family, families[0])

  // A user fabric is legal in any family that accepts uploads; otherwise the
  // colour has to be a code the chosen family actually publishes, or changing
  // family would leave a swatch that renders as the fallback.
  const isFabric = typeof next.colour === 'string' && next.colour.startsWith('fabric:')
  if (!isFabric) {
    const fam = COLOUR_FAMILIES[next.family]
    if (!fam?.swatches.some((sw) => sw.code === next.colour)) {
      next.colour = blank ? null : (fam?.swatches[0]?.code ?? null)
    }
  }

  // A run of one is meaningless for a fin set — a single fin is not a baffle
  // set — but it is the natural default for an imported model, which is a whole
  // object in its own right. Spacing likewise: the catalogue's 50-200 mm is
  // scaled for 25 mm fins and far too tight for a metre-wide model.
  const lim = next.model
    ? { count: [1, 24], spacing: [MODEL_SPACING.min, MODEL_SPACING.max], byDefault: [1, 200] }
    : { count: [2, 24], spacing: [50, 200], byDefault: [8, 100] }
  next.count = Math.min(lim.count[1], Math.max(lim.count[0], Math.round(next.count ?? lim.byDefault[0])))
  next.spacing = next.spacing == null && blank
    ? null
    : Math.min(lim.spacing[1], Math.max(lim.spacing[0], Math.round(next.spacing ?? lim.byDefault[1])))
  next.drop = Math.min(1.2, Math.max(0.05, next.drop ?? 0.45))
  next.finOverrides = next.finOverrides ?? {}
  return next
}

/**
 * Bring a saved obstruction mask onto the current mask pitch.
 *
 * A coarser saved square becomes the several finer ones it contains — not one,
 * which would unmask most of what somebody painted. Through a Set, because the
 * squares of two neighbouring marks overlap once they are subdivided.
 */
/**
 * The selection colour for the 3D scene, as a subscription.
 *
 * A plain function would not do: zustand selectors are granular, so a component
 * subscribed to `items` does not re-render when `theme` changes, and the
 * outline would keep the old colour until something else happened to move. This
 * subscribes to the theme itself, so a toggle repaints the scene with it.
 */
export const useAccent = () => useStore((s) => SELECT_COLOUR[s.theme])

export function rescaleMask(list, k) {
  if (k === 1) return [...list]
  const out = new Set()
  const n = Math.max(1, Math.round(k))
  for (const s of list) {
    const [i, j] = s.split(',').map(Number)
    if (!Number.isFinite(i) || !Number.isFinite(j)) continue
    const i0 = Math.round(i * k)
    const j0 = Math.round(j * k)
    for (let di = 0; di < n; di++) for (let dj = 0; dj < n; dj++) out.add(`${i0 + di},${j0 + dj}`)
  }
  return [...out]
}

// ---------------------------------------------------------------------------
// schedule / BOM — read off the saved document, never off the scene
// ---------------------------------------------------------------------------

/**
 * Quantities, grouped by what a purchase order would distinguish.
 *
 * A baffle SET is one item in the document but N fins on the invoice, so the
 * schedule expands each set through finSchedule() — including per-fin colour
 * overrides, which is exactly the case a naive count-the-items version gets
 * wrong. A tile BLOCK is the same argument one product along: it is counted
 * tile by tile, because an accent tile is its own line on an order.
 */
export function buildSchedule(items) {
  const rows = new Map()
  for (const it of items) {
    if (it.type === 'tiles') {
      const p = it.params
      const tile = p.tileMm ?? { x: 1265, z: 1289 }
      const n = (p.cols ?? 4) * (p.rows ?? 3)
      // Counted TILE BY TILE, because a block can wear more than one finish: an
      // accent tile is a different line on an order, not a footnote to the
      // block's. A block with no edits still collapses to one row, because every
      // tile then resolves to the same pair.
      for (let i = 0; i < n; i++) {
        const f = tileFinishOf(p, i)
        // The FACING, whichever kind this range has: a veneer code and a
        // perforation, or a fabric key. Both are in the key so a block of two
        // fabrics is two lines, the same as a block with an accent veneer.
        const k = ['tile', p.ttype, p.size, p.thickness, f.wood, f.perforation, f.textile,
          tile.x, tile.z].join('|')
        const row = rows.get(k) ?? {
          key: k,
          name: 'Ceiling tile',
          model: null,
          // The board, in millimetres. It changes nothing on screen and
          // everything on an order, which is the whole reason it is asked for.
          thickness: p.thickness ?? null,
          lengthMm: Math.round(tile.x),
          depthMm: Math.round(tile.z),
          // The tile range is its own — its codes are not in COLOUR_FAMILIES, so
          // the row carries its own label rather than being looked up against a
          // family that has never heard of WD-NC-33.
          family: null,
          // A fabric-faced tile is scheduled by its fabric key — FB1_Blue_2 is
          // what you would order — and a veneer one by its panel code.
          colour: f.textile ?? f.wood,
          // The PANEL SIZE leads the finish, not the name. The name is followed
          // by the tile's own dimensions, so "Ceiling tile 600×600 / 1265×1289"
          // read as a contradiction — the 1265 is the tile in the model, the 600
          // is the panel facing it, and they are two different measurements.
          //
          // And the facing is whichever kind this range HAS. A fabric tile names
          // its panel key and nothing else — there is no perforation to add —
          // and without that it scheduled as a bare "600×600", which names the
          // size twice and the finish not at all.
          finishLabel: [
            p.size?.replace('x', '×'),
            f.textile ?? [f.wood, f.perforation].filter(Boolean).join(' + '),
          ].filter(Boolean).join(' · ') || '—',
          qty: 0,
          unitRunM: 0, // a tile has no run; that is a baffle's measurement
        }
        row.qty += 1
        rows.set(k, row)
      }
      continue
    }
    // One Fly per item, as placed. Its face is the WINGS, not its footprint:
    // four wings are 456 x 585 mm each, so a Fly 4 is 1.07 m² of felt inside a
    // 1.28 m² plan and a Fly 8 twice that. Ordering by footprint would under-
    // count the cloth by a fifth.
    if (it.type === 'fly') {
      const p = it.params
      const e = flyExtent(p)
      const k = ['fly', p.size, p.family, p.colour].join('|')
      const row = rows.get(k) ?? {
        key: k,
        name: `Fly ${p.size ?? '?'}`,
        model: null,
        thickness: null,
        lengthMm: Math.round(e.length * 1000),
        depthMm: Math.round(e.width * 1000),
        family: p.family ?? 'designer-textiles',
        colour: p.colour,
        qty: 0,
        unitRunM: 0,
      }
      row.qty += 1
      rows.set(k, row)
      continue
    }
    // One cloud per item, as placed. Its face is the panel, one side of it.
    if (it.type === 'clouds') {
      const p = it.params
      const e = cloudExtent(p)
      const k = ['cloud', p.shape, p.size, p.thickness, p.family, p.colour].join('|')
      const row = rows.get(k) ?? {
        key: k,
        name: `${(p.shape ?? '?')[0].toUpperCase()}${(p.shape ?? '?').slice(1)} cloud`,
        model: null,
        // The product's thickness, not the model's. See CLOUD_THICKNESSES.
        thickness: p.thickness ?? null,
        lengthMm: Math.round(e.length * 1000),
        depthMm: Math.round(e.width * 1000),
        // The family it actually wears, not a constant: a cloud can be a solid
        // colour or a photographed fabric, and they are different order lines.
        family: p.family ?? 'cloud-solid',
        colour: p.colour,
        qty: 0,
        unitRunM: 0,
      }
      row.qty += 1
      rows.set(k, row)
      continue
    }
    if (it.type === 'baffles') {
      for (const fin of finSchedule(it.params)) {
        // `model` is part of the key: two different models scaled to the same
        // size are not the same line on an order.
        const k = [fin.model, fin.btype, fin.shape, fin.thickness,
          fin.lengthMm, fin.depthMm, fin.family, fin.colour].join('|')
        const row = rows.get(k) ?? {
          key: k,
          name: baffleLabel(fin),
          model: fin.model ?? null,
          thickness: fin.thickness,
          lengthMm: fin.lengthMm,
          depthMm: fin.depthMm,
          family: fin.family,
          colour: fin.colour,
          qty: 0,
          unitRunM: fin.lengthMm * MM,
        }
        row.qty += 1
        rows.set(k, row)
      }
    }
  }
  const list = [...rows.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.lengthMm - b.lengthMm || a.depthMm - b.depthMm
  )
  return {
    rows: list,
    totalQty: list.reduce((n, r) => n + r.qty, 0),
    totalRunM: list.reduce((n, r) => n + r.qty * r.unitRunM, 0),
  }
}

/**
 * The schedule again, broken down by group — a section per zone.
 *
 * This is most of why grouping is worth having. The three verbs are editing
 * convenience; a schedule that says "Zone A, 24 baffles / Zone B, 40 tiles" is
 * the thing a client asks for, and buildSchedule on its own merges the whole
 * ceiling into one list where a zone cannot be seen.
 *
 * Each section is a whole schedule of its own, built by the same function, so a
 * section totals exactly what that zone totals and the sections add up to the
 * ceiling. Anything ungrouped comes last, under its own heading rather than
 * being hidden or silently folded into the first zone.
 *
 * Returns null when there are no groups at all — the caller then shows the flat
 * schedule rather than one section called "Ungrouped" holding everything.
 */
export function scheduleByGroup(items, groups) {
  if (!groups?.length) return null
  const sections = []
  for (const gr of groups) {
    const mine = items.filter((i) => i.groupId === gr.id)
    if (!mine.length) continue
    sections.push({ id: gr.id, name: gr.name, items: mine.length,
      coveredM2: coveredArea(mine), schedule: buildSchedule(mine) })
  }
  const loose = items.filter((i) => !i.groupId || !groups.some((gr) => gr.id === i.groupId))
  if (loose.length) {
    sections.push({ id: null, name: 'Ungrouped', items: loose.length,
      coveredM2: coveredArea(loose), schedule: buildSchedule(loose) })
  }
  return sections.length ? sections : null
}

/**
 * What one item measures on the ceiling, in metres.
 *
 * One switch over the four products, so nothing downstream has to repeat it.
 * Each product's own extent function is the authority on its size — the same
 * ones the footprint, the overlap test and the renderer read, so an item's
 * reported area and the space it actually reserves cannot disagree.
 */
export function itemExtent(it) {
  if (it?.type === 'tiles') return tileBlockExtent(it.params)
  if (it?.type === 'clouds') return cloudExtent(it.params)
  if (it?.type === 'fly') return flyExtent(it.params)
  if (it?.type === 'baffles') return baffleExtent(it.params)
  return null
}

/**
 * How much ceiling ONE item takes, in square metres, seen from below.
 *
 * THE RECTANGLE IT OCCUPIES, not the material inside it. A run of fins is
 * mostly gap — eight 25 mm fins 100 mm apart are 0.36 m² of fin inside the
 * 1.62 m² the run spreads over — and a triangular cloud fills a little over
 * half its box. What the layout has actually spent is the zone: nothing else
 * can be placed there, which is the question "how much of my ceiling is this
 * taking" is asking.
 */
export function itemArea(it) {
  const e = itemExtent(it)
  return e ? e.length * e.width : 0
}

/**
 * How much ceiling the layout covers, in square metres.
 *
 * The sum of the same per-item number the selection shows, so the parts add up
 * to the whole by construction rather than by two functions agreeing. Items
 * cannot overlap — placement refuses it, and so does a per-fin resize that
 * would grow a set into its neighbour — so nothing here is counted twice.
 */
export function coveredArea(items) {
  return items.reduce((sum, it) => sum + itemArea(it), 0)
}

// A dev handle on the running store, so the app can be asked what it holds
// without a component in the way. A dynamic import from the console gets a
// different module instance under Vite, which is why this exists at all.
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__ceiling = useStore
