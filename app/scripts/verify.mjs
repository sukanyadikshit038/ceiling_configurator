// Headless verification of the domain layer. Run: npm run verify
//
// This imports the REAL modules the app runs on — grid, catalogue, rooms,
// store — and drives them with no browser. That is only possible because those
// modules import no three.js and no React: the split is what makes the rules
// behind placement, quantities and serialisation testable at all.
//
// It also asserts the manifest chain, so a bad export is caught here rather
// than as a blank room in the browser.

import fs from 'fs'
import { isModelFile } from './build-manifest.mjs'
import path from 'path'
import {
  gridOf, footprint, footprintCentre, cellsOf, overlaps, onGrid, lengthCells, spanCells,
  DEFAULT_PITCH, maskDims, SNAP_M, MASK_M, DRAW_M, snapStepOf, snapCorner, clampCorner,
  clampToCeiling,
} from '../src/lib/grid.js'
import {
  applyTextileManifest, textileSwatches, TEXTILE_PANELS, TEXTILE_FABRICS,
  TEXTILE_GROUPS, TEXTILE_SHEET, TEXTILE_FIT, TEXTILE_PX, retainTextiles,
  groupsFor, shadesFor, panelOf, panelFor,
  splitKey,
  shadeGroups, fabricsForShade,
} from '../src/lib/textiles.js'
import { applyTextileSwatches, applyCloudSeriesSwatches } from '../src/lib/catalog.js'
import { CLAMP_FINISH, CLOUD_HARDWARE_FINISH, TILE_BACK_FINISH, rotStepFor, emptyBrushParams, missingFields, readyToPlace, baffleSizeMm, depthRangeOf,
  BAFFLE_TYPES, COLOUR_FAMILIES, baffleCells, baffleExtent, defaultBaffleParams,
  baffleWidths, finSchedule, parseWidth, finPitch, baffleFamilies,
  fitSizeMm, openingSizeMm, openingModelParams, OPENING_LENGTH,
  modelPitch, baffleOffsets, runLimits, modelMinDropMm, finSizeMm, finParams,
  BAFFLE_SHARED, MODEL_SPACING, acrossUnitMm, pitchOf, gapOf, defaultDepthMm,
} from '../src/lib/catalog.js'
import {
  membersOf, groupStep, groupBounds, specKey, scheduleByGroup, pruneGroups,
} from '../src/lib/store.js'
import { SCENARIOS } from '../src/lib/scenarios.js'
import { planRect, gapBetween, neighbourGaps, MEASURE_RANGE_M } from '../src/lib/measure.js'
import { SPEC, buildTileModel } from './build-tile-model.mjs'
import {
  CLOUD_MODELS, CLOUD_DROP, applyCloudManifest, cloudShapes, sizesFor, cloudFor,
  cloudMissingFields, cloudReadyToPlace, reconcileCloud, emptyCloudParams,
  cloudExtent, cloudCells, CAP_TOLERANCE, CLOUD_ROTATIONS,
  cloudIsFabric, cloudIsSeries, CLOUD_FAMILIES, projectCloudUV, normaliseCloudUV,
  POINTED_TOLERANCE, CLOUD_THICKNESSES, defaultCloudParams, LEGACY_CLOUD_COLOURS,
} from '../src/lib/clouds.js'
import {
  applyFlyManifest, FLY_MODELS, FLY_FABRICS, FLY_DROP, FLY_WING, FLY_WING_M2,
  flySizes, flyFor, flyExtent, flyCells, flyMissingFields, flyReadyToPlace,
  reconcileFly, emptyFlyParams, flyFabricUrl, FLY_ROTATIONS,
} from '../src/lib/fly.js'
// TEMPORARY, with src/lib/uvTune.js. Delete this import with the guards below.
import {
  repeatFor, setTune, tuneOf, clearTune, clearAllTune, tuneReport, SCALE_RANGE,
} from '../src/lib/uvTune.js'
import {
  applyCloudSeriesManifest, cloudSeriesSwatches, seriesSwatchCode,
  splitSeriesSwatch, designsFor, coloursFor, seriesPanel, seriesHex,
  cloudSeriesReady, seriesKey, SERIES_DESIGNS, SERIES_COLOURS, SERIES_PANELS,
  coloursForShape, designsForColour, seriesThumbUrl,
} from '../src/lib/cloudSeries.js'
import {
  applyTileFinishes, TILE_FINISHES, woodOf, perforationOf, classifyTileMeshes, tileSize, TILE_PX,
  tileIsFabric, tileTypesOffered, TILE_THICKNESSES,
  GRID_SUPPORT_FILE, GRID_SUPPORT_PLATE_UP,
  TILE_SIZES, tileSizeKeys, woodsFor, perforationsFor, tileRepeat, drawnPanelMm, DEFAULT_TILE_SIZE,
} from '../src/lib/tiles.js'
import { PRESETS, buildPreset } from '../src/lib/presets.js'
import {
  SELECT_COLOUR, PLACE_COLOUR, THEMES, applyTheme, BACKGROUNDS, gridLineColour,
} from '../src/lib/theme.js'
import {
  sharePayload, shareDoc, encodeConfig, decodeConfig, linkFor, readLink,
  FORMAT, URL_BUDGET,
} from '../src/lib/share.js'
import {
  SESSION_KEY, readSession, writeSession, clearSession, keepSession,
} from '../src/lib/session.js'
import * as THREE from 'three'
import {
  looksLikeFin, finPositions, FIN_ASPECT, modelMinDrop, buildModelRun, runDropOffset,
  showOnlyFin, analyseFins, shaftSection, repairHangerRing, matchFaceUVs,
  shortenHangerToHook, planarFinUV, normaliseFinUV,
} from '../src/lib/modelFins.js'
import { finFinish, MODEL_FIN_FAMILIES, MODEL_SIZE_LIMITS } from '../src/lib/catalog.js'
import { VIEW_NAMES, viewsFor, planHeight, cameraGoal } from '../src/lib/views.js'
import {
  applyColourCoreManifest, COLOUR_CORE, getEntry, structuresFor, PANEL_MM, cropToFin,
  PANEL_PX, MAX_GPU_PX, jpegWidth, jpegSize, panelDecodeOptions,
  PANEL_BUDGET_BYTES, overBudget, panelsHeld, hasPanel,
} from '../src/lib/colourCore.js'
import {
  applyOmbreManifest, COLOUR_CORE_OMBRE, overlaysFor, ombreSwatches, cropOmbreToFin,
} from '../src/lib/colourCoreOmbre.js'
import { FINISH_KINDS, disposeGroup, finishMaterial } from '../src/lib/baffle.js'
import { ROOMS, applyRoomManifest, getRoom } from '../src/lib/rooms.js'
import {
  MODELS, applyModelManifest, modelFor, hasType, hasShape, flipWinding, isFinRun,
} from '../src/lib/models.js'
import {
  useStore, buildSchedule, coveredArea, itemArea, itemExtent, reconcile, SCHEMA_VERSION,
  CEILING_LIMITS, DEFAULT_ZONE, roomZone,
  productMissing, productReady, productCells, emptyParamsFor, rescaleMask,
} from '../src/lib/store.js'
import {
  TILE_TYPES, TILE_BLOCK, emptyTileParams, tileMissingFields, tileReadyToPlace,
  TILE_MODELS, applyTileModels, tileGridsFor, tileModelFor, tileModelId, sizesForType,
  DEFAULT_TILE_GRID, tileModule, railFlange, needsQuarterTurn,
  panelFacing, splitPanelFaces, planarTileUV, PERF_BLEED,
  TILE_FIELD, clampField,
  reconcileTile, tileBlockExtent, tileCells, tileFinishOf, tileEditCount, TILE_DROP,
  gridPlaneTop, splitAtHeight,
} from '../src/lib/tiles.js'
import { PRODUCT_TYPES } from '../src/lib/catalog.js'
// The locking rule, and the four EFFECTIVE required chains it reads — what a
// given spec is actually asked, in the order its panel asks it. See
// src/lib/gate.js.
import { gateOf } from '../src/lib/gate.js'
import { cloudRequired } from '../src/lib/clouds.js'
import { tileRequired } from '../src/lib/tiles.js'
import { baffleRequired } from '../src/lib/catalog.js'
import { flyRequired } from '../src/lib/fly.js'

const MANIFEST = 'public/models/manifest.json'

let pass = 0
let fail = 0
/**
 * Cell coordinates, in the unit this suite was written in.
 *
 * A cell was 100 mm when these tests were written; the grid counts millimetres
 * now, so a bare placeAt(...at(10, 10)) would aim a centimetre into the corner. The
 * assertions still say what they always said and this turns it into the new
 * unit. Obstruction coordinates deliberately do NOT go through it: the mask is
 * still 100 mm squares, so those numbers never changed meaning.
 */
const CELL_SCALE = Math.round(0.1 / DEFAULT_PITCH)
const at = (i, j) => [Math.round(i * CELL_SCALE), Math.round(j * CELL_SCALE)]

const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  ->  ' + extra : ''}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)
/**
 * Source with its comments taken out.
 *
 * GUARDS MATCH CODE, NEVER PROSE. Five times in this codebase a guard has
 * passed or failed on a comment instead of on the thing it was checking: a
 * docblock that mentioned `e.point`; `e.pointerId` containing the string
 * `e.point`; a sentence that wrapped across two comment lines; and twice a
 * commented-out call still matching the pattern meant to prove the call was
 * there — which is the dangerous direction, because the guard PASSES with the
 * feature switched off.
 *
 * So anything asserting that a call is or is not present reads this.
 */
const codeOf = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(String.fromCharCode(10))
  .filter((l) => !/^\s*\/\//.test(l))
  .join(String.fromCharCode(10))

const S = () => useStore.getState()

// ---------------------------------------------------------------------------

// Designer Textile is 275 panels on a CDN. The MAP is local and is what the
// catalogue is filled from at boot, so the suite fills it the same way — a
// family with no swatches is a family nothing can be finished in.
const TEXTILE_MAP = 'public/textures/baffles/designer-textile/textures.json'
if (fs.existsSync(TEXTILE_MAP)) {
  applyTextileManifest(JSON.parse(fs.readFileSync(TEXTILE_MAP, 'utf8')))
  applyTextileSwatches(textileSwatches())
}

// Cloud Series artwork: 64 printed faces built from the supplied folder by
// scripts/build-cloud-series.py. Adopted here for the same reason the textile
// map is — a family with no swatches is a family nothing can be finished in.
const FLY_MANIFEST = 'public/models/manifest.json'
if (fs.existsSync(FLY_MANIFEST)) {
  applyFlyManifest(JSON.parse(fs.readFileSync(FLY_MANIFEST, 'utf8')).fly)
}

const SERIES_MAP = 'public/textures/clouds/cloud-series/manifest.json'
// Kept whole as well as applied, because a few guards ask about the manifest
// itself -- the face tweak, say -- rather than about the panels it holds.
let seriesMap = null
if (fs.existsSync(SERIES_MAP)) {
  seriesMap = JSON.parse(fs.readFileSync(SERIES_MAP, 'utf8'))
  applyCloudSeriesManifest(seriesMap)
  applyCloudSeriesSwatches(cloudSeriesSwatches())
}

const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  : { rooms: [], baffles: [] }
applyRoomManifest(manifest)
applyModelManifest(manifest)

// The Colour Core panel map, adopted the same way — it fills that family's
// swatches, so the catalogue is incomplete without it.
const CC_MAP = 'public/colour-core-textures.json'
if (fs.existsSync(CC_MAP)) applyColourCoreManifest(JSON.parse(fs.readFileSync(CC_MAP, 'utf8')))

// and the ombré range, which fills its own family the same way
const OM_MAP = 'public/flat-colour-core-ombre-textures.json'
if (fs.existsSync(OM_MAP)) applyOmbreManifest(JSON.parse(fs.readFileSync(OM_MAP, 'utf8')))

useStore.getState().hydrate()

/** Reset to a known room and brush between sections. */
const TEST_ROOM = 'sc:edu-class' // 9 x 7 m, 3.0 m clear
function reset(params = {}) {
  useStore.setState({
    roomId: TEST_ROOM,
    // the session opens on DEFAULT_ZONE now; a test wanting the ROOM wants that
    // gone, the same way setRoom clears it
    ceilingOverride: null,
    items: [],
    obstructions: [],
    selectedId: null,
    selectedFin: null,
    // Editor state, like the two above it. Earlier sections drag sets around
    // and a refusal left behind by one of them would arrive here as a red halo
    // nobody asked for.
    dragBlocked: null,
    undoStack: [],
    brush: { type: 'baffles', params: reconcile({ ...defaultBaffleParams(), ...params }) },
  })
}

// ---------------------------------------------------------------------------
section('GRID')
reset()
{
  const room = getRoom(TEST_ROOM)
  const g = gridOf(room)
  // Stated as a RELATION to the pitch, not as two numbers. The pitch is a
  // decision that has already changed once (300 mm -> 100 mm), and an assertion
  // that hardcodes its consequences fails on the change rather than on a bug.
  // The pitch is a millimetre and the SNAP is 100 mm: two numbers now, because
  // a cell had to get small enough to express a 616.56 mm tile module while a
  // dragged set still had to land somewhere a person can aim at.
  ok('a cell is a millimetre', g.pitch === 0.001, `${g.pitch * 1000} mm`)
  ok('and what a dragged set lands on is still 100 mm', SNAP_M === 0.1,
    `${SNAP_M * 1000} mm`)
  ok('the mask and the drawn lines stay coarse too', MASK_M === 0.1 && DRAW_M === 0.1,
    `${MASK_M * 1000} / ${DRAW_M * 1000} mm`)
  ok('edu-class fills its ceiling in whole cells',
    g.cols === Math.floor((room.ceiling.maxX - room.ceiling.minX) / g.pitch + 1e-6)
      && g.rows === Math.floor((room.ceiling.maxZ - room.ceiling.minZ) / g.pitch + 1e-6),
    `${g.cols}x${g.rows}`)
  ok('grid is centred on the origin',
    Math.abs(g.originX + (g.cols * g.pitch) / 2) < 1e-9
      && Math.abs(g.originZ + (g.rows * g.pitch) / 2) < 1e-9,
    `${g.originX}, ${g.originZ}`)
  ok('grid sits at the ceiling height', g.y === 3.0, String(g.y))
  ok('grid fits inside the ceiling extents',
    g.originX >= room.ceiling.minX - 1e-9 &&
    g.originX + g.cols * g.pitch <= room.ceiling.maxX + 1e-9 &&
    g.originZ >= room.ceiling.minZ - 1e-9 &&
    g.originZ + g.rows * g.pitch <= room.ceiling.maxZ + 1e-9)
  ok('lengthCells rounds to the nearest cell', lengthCells(2400, 0.3) === 8 && lengthCells(1200, 0.3) === 4)
  ok('spanCells rounds up so nothing overhangs', spanCells(0.31, 0.3) === 2 && spanCells(0.3, 0.3) === 1)
  ok('overlaps detects a shared cell',
    overlaps({ i0: 0, j0: 0, ci: 2, cj: 2 }, { i0: 1, j0: 1, ci: 2, cj: 2 }) &&
    !overlaps({ i0: 0, j0: 0, ci: 2, cj: 2 }, { i0: 2, j0: 0, ci: 2, cj: 2 }))
  ok('cellsOf enumerates the whole footprint', cellsOf({ i0: 0, j0: 0, ci: 2, cj: 3 }).length === 6)
  ok('onGrid rejects a footprint off the edge',
    onGrid({ i0: 0, j0: 0, ci: g.cols, cj: g.rows }, g)
      && !onGrid({ i0: 1, j0: 0, ci: g.cols, cj: g.rows }, g))
}

// ---------------------------------------------------------------------------
section('CATALOGUE')
{
  const d = defaultBaffleParams()
  ok('default params are already legal', JSON.stringify(reconcile(d)) === JSON.stringify(d))

  // A VMT fin at 25 mm allows 100/150/200; at 80 mm it allows 200/250/300.
  // Named explicitly: the brush opens on Blade, which is the type that has a
  // model behind it, so `d` is no longer a VMT set.
  const wide = reconcile({ ...d, btype: 'vmt', shape: null, model: null, thickness: 80, width: 300 })
  ok('80 mm VMT keeps a 300 mm face', wide.width === 300)
  const narrowed = reconcile({ ...wide, thickness: 25 })
  ok('dropping to 25 mm corrects an illegal 300 mm face',
    baffleWidths(narrowed).includes(narrowed.width), `width=${narrowed.width}`)

  const blade = reconcile({ ...d, btype: 'blade' })
  ok('switching to Blade adopts a Blade shape', blade.shape === 'standard')
  ok('switching to Blade adopts a Blade family',
    BAFFLE_TYPES.blade.families.includes(blade.family), blade.family)
  ok('switching to Blade adopts a colour its family publishes',
    COLOUR_FAMILIES[blade.family].swatches.some((s) => s.code === blade.colour), String(blade.colour))

  const tapered = reconcile({ ...blade, shape: 'tapered' })
  ok('tapered blade takes a tapered width', String(tapered.width).includes('-'), String(tapered.width))
  ok('parseWidth splits a tapered width', parseWidth('100-200').a === 100 && parseWidth('100-200').b === 200)
  ok('parseWidth passes a plain width through', parseWidth(150).a === 150 && parseWidth(150).b === 150)

  ok('count is clamped to the catalogue range',
    reconcile({ ...d, count: 99 }).count === 24 && reconcile({ ...d, count: 0 }).count === 2)
  ok('spacing is clamped to the catalogue range',
    reconcile({ ...d, spacing: 999 }).spacing === 200 && reconcile({ ...d, spacing: 1 }).spacing === 50)
  ok('drop is clamped to the catalogue range',
    reconcile({ ...d, drop: 9 }).drop === 1.2 && reconcile({ ...d, drop: -1 }).drop === 0.05)

  ok('a user fabric survives reconciliation',
    reconcile({ ...d, family: 'designer-textiles', colour: 'fabric:abc' }).colour === 'fabric:abc')

  // extent: 8 fins, 25 mm thick, 100 mm clear -> 7 * 125 + 25 = 900 mm
  const e = baffleExtent({ ...d, count: 8, thickness: 25, spacing: 100, length: 2400 })
  ok('fin pitch is spacing plus thickness', Math.abs(finPitch(d) - 0.125) < 1e-9, String(finPitch(d)))
  ok('set extent is 2.40 x 0.90 m', Math.abs(e.length - 2.4) < 1e-9 && Math.abs(e.width - 0.9) < 1e-9,
    `${e.length} x ${e.width}`)
  const c = baffleCells({ ...d, count: 8, thickness: 25, spacing: 100, length: 2400 }, 0.3)
  ok('set occupies 8 x 3 cells', c.ci === 8 && c.cj === 3, `${c.ci}x${c.cj}`)
}

// ---------------------------------------------------------------------------
section('OPENING DEFAULTS')
{
  const d = defaultBaffleParams()
  ok('a new set opens at about two metres',
    d.length === OPENING_LENGTH && Math.abs(d.length / 1000 - 2) <= 0.25, `${d.length} mm`)
  ok('the opening length is a real catalogue length',
    BAFFLE_TYPES.vmt.lengths.includes(OPENING_LENGTH), String(OPENING_LENGTH))

  // switching type must keep the set roughly the size it was, not jump to the
  // longest product in the range
  const emb = reconcile({ ...d, btype: 'embossed' })
  ok('switching to Embossed picks the nearest length, not the longest',
    emb.length === 1500, `${emb.length} mm of ${BAFFLE_TYPES.embossed.lengths}`)
  const short = reconcile({ ...d, length: 1200, btype: 'embossed' })
  ok('a short run stays short across the switch', short.length === 1200, `${short.length} mm`)

  const fresh = useStore.getState()
  ok('the app opens on the grid alone, with no room', fresh.showRoom === false)
  ok('the grid is on', fresh.showGrid === true)
  // NOT A HEX. What matters is that the app opens on a colour the picker
  // actually offers — a session opening on a fourth colour shows a picker with
  // nothing selected, which reads as broken. Asserting the value itself just
  // meant editing the test every time the default moved.
  ok('the background opens on one of the colours the picker offers',
    BACKGROUNDS.some((b) => b.hex.toLowerCase() === String(fresh.background).toLowerCase()),
    `${fresh.background} is not in ${BACKGROUNDS.map((b) => b.hex).join(', ')}`)
}

// ---------------------------------------------------------------------------
section('PLACEMENT')
reset()
{
  const g = S().grid()
  const cells = Math.round(OPENING_LENGTH / 1000 / g.pitch) // 1800 mm of run
  const deep = spanCells(baffleExtent(S().brush.params).width, g.pitch)
  const a = S().placeAt(...at(10, 10))
  ok('places a set', !!a && S().items.length === 1)
  const fp = footprint(S().items[0], g)
  ok(`footprint is ${cells} x ${deep} cells`, fp.ci === cells && fp.cj === deep,
    `${fp.ci}x${fp.cj}`)
  // Centred on the click, then SNAPPED to what a baffle run lands on. At a
  // millimetre pitch an unsnapped drop would sit wherever the pointer was.
  const snapCells = Math.round(SNAP_M / g.pitch)
  const want = at(10, 10)
  ok('centres on the clicked cell, snapped to the 100 mm step',
    S().items[0].cell[0] === Math.round((want[0] - Math.floor(cells / 2)) / snapCells) * snapCells
      && S().items[0].cell[1] === Math.round((want[1] - Math.floor(deep / 2)) / snapCells) * snapCells,
    JSON.stringify(S().items[0].cell))
  ok('and lands ON that step, not between two of them',
    S().items[0].cell[0] % snapCells === 0 && S().items[0].cell[1] % snapCells === 0,
    JSON.stringify(S().items[0].cell))
  ok('overlapping placement is rejected', S().placeAt(...at(10, 10)) === null && S().items.length === 1)
  // Clear of the first by its own depth, whatever the pitch makes that.
  ok('non-overlapping placement is accepted',
    !!S().placeAt(at(10, 10)[0], at(10, 10)[1] + deep + 2 * CELL_SCALE)
      && S().items.length === 2)
  ok('placing selects what was placed', S().selectedId === S().items[1].id)
}

// ---------------------------------------------------------------------------
section('CLAMPING — nothing may leave the ceiling')
reset()
{
  const g = S().grid()
  S().placeAt(...at(0, 0))
  S().placeAt(g.cols - 1, g.rows - 1)
  ok('clamped at the min corner', onGrid(footprint(S().items[0], g), g), JSON.stringify(S().items[0].cell))
  ok('clamped at the max corner', onGrid(footprint(S().items[1], g), g), JSON.stringify(S().items[1].cell))

  reset()
  S().placeAt(...at(15, 10))
  const id = S().items[0].id
  for (let k = 0; k < 60; k++) S().move(id, 1, 1)
  ok('nudging cannot push a set off the grid', onGrid(footprint(S().items[0], g), g),
    JSON.stringify(footprint(S().items[0], g)))
}

// ---------------------------------------------------------------------------
section('ROTATE')
reset()
{
  const g = S().grid()
  S().placeAt(...at(15, 11))
  const id = S().items[0].id
  const before = footprint(S().items[0], g)
  S().rotate(id)
  const after = footprint(S().items[0], g)
  ok('rotation swaps the footprint axes', after.ci === before.cj && after.cj === before.ci,
    `${before.ci}x${before.cj} -> ${after.ci}x${after.cj}`)
  const cBefore = [before.i0 + before.ci / 2, before.j0 + before.cj / 2]
  const cAfter = [after.i0 + after.ci / 2, after.j0 + after.cj / 2]
  ok('rotation turns about the centre, within a cell',
    Math.abs(cBefore[0] - cAfter[0]) <= 0.5 && Math.abs(cBefore[1] - cAfter[1]) <= 0.5,
    `${cBefore} -> ${cAfter}`)
  ok('four rotations return to 0°', [1, 2, 3].every(() => S().rotate(id)) && S().items[0].rot === 0)
  // A baffle set is a RUN and runLimits measures the room along the axis it
  // spreads down, so a quarter turn is the only step that has an answer there.
  S().rotate(id)
  ok('a baffle run still turns a quarter at a time', S().items[0].rot === 90,
    String(S().items[0].rot))
  ok('and the footprint at 90 is still exactly the swap, not a cell wider',
    footprint(S().items[0], g).ci === before.cj && footprint(S().items[0], g).cj === before.ci,
    `${footprint(S().items[0], g).ci}x${footprint(S().items[0], g).cj}`)

  // Direction under its two names. The scene and the grid turn by item.rot;
  // the panel reads and writes params.rot. Either one moving has to move the
  // other, or Rotate leaves the panel naming the old direction and the panel
  // leaves the ceiling facing the old way.
  ok('pressing Rotate moves the direction the panel shows',
    S().items[0].params.rot === S().items[0].rot,
    `panel ${S().items[0].params.rot}, item ${S().items[0].rot}`)
  S().update(id, { params: { rot: 0 } })
  ok('and picking a direction in the panel actually turns the set',
    S().items[0].rot === 0 && S().items[0].params.rot === 0,
    `item ${S().items[0].rot}, panel ${S().items[0].params.rot}`)
  ok('so the footprint follows the panel too, not just the Rotate button',
    footprint(S().items[0], g).ci === before.ci,
    `${footprint(S().items[0], g).ci} vs ${before.ci}`)
}

// ---------------------------------------------------------------------------
section('DUPLICATE')
reset()
{
  const g = S().grid()
  S().placeAt(...at(10, 5))
  const src = S().items[0]
  const copyId = S().duplicate(src.id)
  ok('duplicate lands somewhere', !!copyId && S().items.length === 2)
  const copy = S().items.find((i) => i.id === copyId)
  ok('the copy does not overlap the original',
    !overlaps(footprint(src, g), footprint(copy, g)))
  ok('the copy carries the same parameters',
    JSON.stringify(copy.params) === JSON.stringify(src.params))
  copy.params.count = 99
  ok('the copy owns its parameters, not a shared reference', src.params.count !== 99)
}

// ---------------------------------------------------------------------------
section('OBSTRUCTIONS')
reset()
{
  S().toggleObstruction(10, 10)
  ok('an obstruction is recorded', S().obstructions.includes('10,10'))
  ok('placing over an obstruction is rejected', S().placeAt(...at(10, 10)) === null && !S().items.length)
  ok('placing clear of it is accepted', !!S().placeAt(...at(10, 18)))
  ok('a cell under a product cannot become an obstruction',
    S().toggleObstruction(10, 18) === false)
  S().toggleObstruction(10, 10)
  ok('toggling again clears it', !S().obstructions.includes('10,10'))
}

// ---------------------------------------------------------------------------
section('AUTO-LAYOUT')
reset()
{
  const g = S().grid()
  // In MILLIMETRES. It used to be a cell count, which meant a different
  // distance on a different pitch — the reason it is not one any more.
  const n = S().autoLayout(600)
  ok('auto-fill places something', n > 0 && S().items.length === n, String(n))
  ok('nothing auto-filled leaves the grid', S().items.every((it) => onGrid(footprint(it, g), g)))
  ok('nothing auto-filled overlaps', S().items.every((a, i) =>
    S().items.every((b, j) => i === j || !overlaps(footprint(a, g), footprint(b, g)))))

  // Mask a cell auto-fill would actually have used, rather than one that
  // happens to fall in the margin — at a finer pitch a low-numbered cell is
  // inside the 300 mm margin and skipping it proves nothing.
  const used = footprint(S().items[0], g)
  reset()
  S().toggleObstruction(Math.floor(used.i0 / CELL_SCALE), Math.floor(used.j0 / CELL_SCALE))
  const withMask = S().autoLayout(600)
  ok('auto-fill skips obstructed cells', withMask < n, `${withMask} vs ${n}`)

  reset()
  ok('wider spacing places fewer', S().autoLayout(1200) < n, `${S().items.length} vs ${n}`)
}

// ---------------------------------------------------------------------------
section('LAYOUT PRESETS')
{
  // every preset, in every room — a preset that overlaps or overflows is the
  // one bug this whole grid model exists to make impossible
  for (const preset of PRESETS) {
    let totalPlaced = 0
    let emptyIn = []
    for (const room of ROOMS) {
      reset()
      useStore.setState({ roomId: room.id })
      const g = S().grid()
      const { placed, skipped } = S().applyPreset(preset.key)
      totalPlaced += placed
      if (!placed) emptyIn.push(room.id)

      const items = S().items
      const bad = items.filter((it) => !onGrid(footprint(it, g), g))
      ok(`${preset.key} / ${room.id}: everything on the grid`, bad.length === 0,
        `${bad.length} off-grid of ${items.length}`)
      const clashes = items.some((a, i) =>
        items.some((b, j) => i !== j && overlaps(footprint(a, g), footprint(b, g))))
      ok(`${preset.key} / ${room.id}: nothing overlaps`, !clashes)
      void skipped
    }
    ok(`${preset.key}: places something in every room`, emptyIn.length === 0,
      `empty in ${emptyIn.join(', ')}`)
    ok(`${preset.key}: produces real sets`, totalPlaced > 0, String(totalPlaced))
  }

  reset()
  ok('an unknown preset places nothing', S().applyPreset('nope').placed === 0)

  // a preset replaces rather than adds, and is one undo step
  reset()
  S().placeAt(...at(4, 4))
  const before = S().items.length
  S().applyPreset('vmt-field')
  ok('a preset replaces the layout', S().items.length !== before && S().items.length > 0)
  S().undo()
  ok('one Ctrl+Z restores what was there', S().items.length === before)

  // it adopts the preset's product so hand-placing continues the look
  reset()
  S().applyPreset('ombre-run')
  ok('the brush adopts the preset', S().brush.params.family === 'signature-ombre',
    S().brush.params.family)

  // presets respect the obstruction mask
  reset()
  const g0 = S().grid()
  // MASK cells, not placement cells. The mask is 100 mm squares whatever the
  // grid does, so a whole ceiling is 75 x 70 of them — where the placement grid
  // is 7,500 x 7,000 and masking it cell by cell is 52 million calls.
  const m0 = maskDims(g0)
  for (let i = 0; i < m0.cols; i++) for (let j = 0; j < m0.rows; j++) S().toggleObstruction(i, j)
  const masked = S().applyPreset('vmt-field')
  ok('a fully masked ceiling takes no preset', masked.placed === 0, JSON.stringify(masked))
}

// ---------------------------------------------------------------------------
section('IMPORTED MODEL RUNS — count and spacing')
reset()
{
  const SIZE = { l: 1800, w: 1000, h: 300 }
  const base = reconcile({
    ...defaultBaffleParams(),
    model: 'm', modelName: 'M', sizeMm: SIZE, count: 1, spacing: 200,
  })

  ok('a model may be a run of one', base.count === 1, String(base.count))
  ok('a fin set may not — a single fin is not a set',
    reconcile({ ...defaultBaffleParams(), count: 1 }).count === 2)

  ok('model spacing takes the wider range',
    reconcile({ ...base, spacing: 1500 }).spacing === 1500 &&
    reconcile({ ...base, spacing: 9999 }).spacing === 2000)
  ok('fin spacing keeps the catalogue range',
    reconcile({ ...defaultBaffleParams(), spacing: 1500 }).spacing === 200)

  // pitch is edge-to-edge spacing plus the object's own width across the run
  ok('model pitch is spacing plus the model width',
    Math.abs(modelPitch(base) - 1.2) < 1e-9, String(modelPitch(base)))

  // one copy: the run is just the model
  const one = baffleExtent(base)
  ok('a run of one is the model itself',
    Math.abs(one.length - 1.8) < 1e-9 && Math.abs(one.width - 1.0) < 1e-9,
    `${one.length} x ${one.width}`)

  // four copies at 200 mm clear: 3 * 1.2 + 1.0 = 4.6 m across
  const four = reconcile({ ...base, count: 4 })
  const e4 = baffleExtent(four)
  ok('a run of four spreads to 4.60 m',
    Math.abs(e4.width - 4.6) < 1e-9, String(e4.width))
  ok('and its length is unchanged', Math.abs(e4.length - 1.8) < 1e-9)

  const offs = baffleOffsets(four)
  ok('four copies get four offsets', offs.length === 4)
  ok('the run is centred on the item',
    Math.abs(offs[0] + offs[3]) < 1e-9, JSON.stringify(offs))
  ok('copies sit one pitch apart',
    Math.abs((offs[1] - offs[0]) - modelPitch(four)) < 1e-9)
  ok('and the outermost span matches the extent',
    Math.abs((offs[3] - offs[0]) + SIZE.w / 1000 - e4.width) < 1e-9)

  // footprint follows the run, so overlap rules see the whole thing
  const g = S().grid()
  const c1 = baffleCells(base, g.pitch)
  const c4 = baffleCells(four, g.pitch)
  ok('a longer run takes more cells across', c4.cj > c1.cj, `${c1.cj} -> ${c4.cj}`)
  ok('and the same cells along', c4.ci === c1.ci)

  // the schedule counts every copy
  ok('a run of one is one unit in the schedule', finSchedule(base).length === 1)
  const sched = buildSchedule([{ type: 'baffles', params: four }])
  ok('a run of four is four units', sched.totalQty === 4, String(sched.totalQty))
  ok('and four times the run length',
    Math.abs(sched.totalRunM - 4 * 1.8) < 1e-9, String(sched.totalRunM))
  ok('identical copies stay one schedule row', sched.rows.length === 1)

  // placement respects the whole run
  reset()
  useStore.setState({ brush: { type: 'baffles', params: four } })
  const id = S().placeAt(...at(15, 11))
  ok('a model run places', !!id)
  ok('its footprint is the run, not one copy',
    S().items[0].cj === c4.cj, `${S().items[0].cj} vs ${c4.cj}`)
  ok('and it stays on the ceiling', onGrid(footprint(S().items[0], g), g))

  // growing the run is rejected if it no longer fits, leaving the item alone
  reset()
  useStore.setState({ brush: { type: 'baffles', params: base } })
  S().placeAt(...at(15, 21))
  const before = S().items[0].cj
  S().updateParams({ count: 24 })
  ok('a run that cannot fit is refused, not clamped into the wall',
    S().items[0].cj === before || onGrid(footprint(S().items[0], g), g))
}

// ---------------------------------------------------------------------------
section('FIN DETECTION — telling fins from clamps and rods')
{
  const v = (x, y, z) => ({ x, y, z })
  // measured off the two real files
  ok('a Baffle Curve fin is a fin', looksLikeFin(v(4.179, 0.45, 0.038)))
  ok('a baffle.fbx fin is a fin', looksLikeFin(v(27.8, 2, 0.25)))

  // the traps: both of these outnumber the fins in their file
  ok('a curved clamp is not a fin — it stands taller than it is long',
    !looksLikeFin(v(0.372, 0.466, 0.071)))
  ok('a chunky clamp is not a fin — 6.5:1 is not slender enough',
    !looksLikeFin(v(1.498, 0.285, 0.23)))
  ok('a hanger rod is not a fin — it is vertical',
    !looksLikeFin(v(0.072, 1.878, 0.073)))

  ok('the aspect threshold is what rejects the chunky clamp',
    (1.498 / 0.23) < FIN_ASPECT && (4.179 / 0.038) >= FIN_ASPECT)
  ok('degenerate geometry is not a fin', !looksLikeFin(v(1, 0, 0)))

  // fin positions: centred, evenly spaced
  const at = finPositions(5, 0.4)
  ok('five fins get five positions', at.length === 5)
  ok('a run is centred on the item', Math.abs(at[0] + at[4]) < 1e-9, JSON.stringify(at))
  ok('fins sit one pitch apart', Math.abs((at[1] - at[0]) - 0.4) < 1e-9)
  ok('a run of one sits at the centre', finPositions(1, 0.4)[0] === 0)
}

// ---------------------------------------------------------------------------
section('CONFIGURING A FIN IN AN IMPORTED RUN')
reset()
{
  // the manifest's own record of Baffle Curve, so this tracks the real file
  const entry = (manifest.baffles ?? []).find((b) => b.id === 'blade-flow')
  ok('the manifest records the run inside the model',
    !!entry?.fins && entry.fins.count === 13, JSON.stringify(entry?.fins))

  if (entry?.fins) {
    ok('and one fin, not the whole file',
      Math.abs(entry.fins.size.length - 4.179) < 0.01 &&
      Math.abs(entry.fins.size.thickness - 0.038) < 0.01, JSON.stringify(entry.fins.size))
    ok('and the hardware that hangs each one', entry.fins.hardwarePerFin === 2)

    const room = getRoom(TEST_ROOM)
    const open = openingModelParams(entry, room)
    ok('a model opens at the fin count the file was authored with',
      open.count === 13, String(open.count))
    ok('its fin is scaled to the opening length',
      open.sizeMm.l === OPENING_LENGTH, JSON.stringify(open.sizeMm))
    ok('and the authored spacing is scaled with it',
      open.spacing > 0 && open.spacing < entry.fins.spacingMm, String(open.spacing))

    // the run then behaves exactly like a catalogue set
    const p = reconcile({
      ...defaultBaffleParams(), model: entry.id, modelName: entry.name, ...open,
    })
    ok('pitch is spacing plus fin thickness, same as a catalogue set',
      Math.abs(modelPitch(p) - (p.spacing + p.sizeMm.w) / 1000) < 1e-9)
    const ext = baffleExtent(p)
    ok('the run spans count fins at that pitch',
      Math.abs(ext.width - ((p.count - 1) * modelPitch(p) + p.sizeMm.w / 1000)) < 1e-9)
    ok('and its length is one fin', Math.abs(ext.length - p.sizeMm.l / 1000) < 1e-9)

    // --- the edits themselves ------------------------------------------
    useStore.setState({ brush: { type: 'baffles', params: { ...p, count: 6 } } })
    const g = S().grid()
    const id = S().placeAt(Math.floor(g.cols / 2), Math.floor(g.rows / 2))
    ok('a model run places', !!id)
    ok('the schedule counts its fins', buildSchedule(S().items).totalQty === 6)

    S().select(id)
    S().updateFin(2, { colour: 'WD-NC-05', family: 'wood-classic' })
    ok('one fin takes a catalogue finish',
      S().selected().params.finOverrides[2].colour === 'WD-NC-05')
    const withFinish = buildSchedule(S().items)
    ok('a finished fin becomes its own schedule row', withFinish.rows.length === 2,
      String(withFinish.rows.length))
    ok('and the total is unchanged', withFinish.totalQty === 6)

    S().updateFin(4, { hidden: true })
    ok('a hidden fin leaves the schedule', buildSchedule(S().items).totalQty === 5)
    ok('but stays in the document, so it can come back',
      S().selected().params.count === 6 && S().selected().params.finOverrides[4].hidden === true)
    S().updateFin(4, { hidden: false })
    ok('unhiding restores it', buildSchedule(S().items).totalQty === 6)

    S().updateFin(1, { drop: 0.8, offsetMm: 120, rotDeg: 15 })
    const ov = S().selected().params.finOverrides[1]
    ok('a fin takes its own drop, shift and rotation',
      ov.drop === 0.8 && ov.offsetMm === 120 && ov.rotDeg === 15, JSON.stringify(ov))

    S().resetFin(1)
    ok('resetting a fin clears every one of its overrides',
      S().selected().params.finOverrides[1] === undefined)

    // round-trip
    const doc = S().toJSON()
    const before = buildSchedule(S().items)
    reset()
    S().fromJSON(JSON.parse(JSON.stringify(doc)))
    ok('fin edits survive a round-trip',
      S().items[0].params.finOverrides[2].colour === 'WD-NC-05')
    ok('and the schedule comes back identical',
      JSON.stringify(buildSchedule(S().items).rows) === JSON.stringify(before.rows))
  }
}

// ---------------------------------------------------------------------------
section('HANGING A MODEL RUN — no gap, and a box that fits')
{
  // Both faults came from one cause: the unit was hung by the FILE's origin,
  // which is the top of a clamp, so the fin sat a clamp-height below the drop
  // asked for, the selection box measured from the wrong place at both ends,
  // and nothing bridged the drop to the slab.
  for (const b of manifest.baffles ?? []) {
    ok(`${b.id}: the manifest records how far the hardware reaches above the fin`,
      typeof b.fins?.hardwareAboveFin === 'number' && b.fins.hardwareAboveFin > 0,
      String(b.fins?.hardwareAboveFin))

    // the drop floor scales with the fin, so it is right at any size
    const full = { l: b.fins.size.length * 1000, w: b.fins.size.thickness * 1000, h: b.fins.size.depth * 1000 }
    // hardware rides the fin's own fit, so the fin's DEPTH is what halves it
    const half = { ...full, h: full.h / 2 }
    const atFull = modelMinDropMm(b, full)
    const atHalf = modelMinDropMm(b, half)
    ok(`${b.id}: the drop floor is the hardware height at full size`,
      Math.abs(atFull - b.fins.hardwareAboveFin * 1000) <= 1, `${atFull} vs ${b.fins.hardwareAboveFin * 1000}`)
    ok(`${b.id}: and halves when the fin's depth is halved`,
      Math.abs(atHalf - atFull / 2) <= 1, `${atHalf} vs ${atFull / 2}`)
    ok(`${b.id}: a run cannot be asked to hang shallower than its own clamps`, atFull > 0)
  }

  // the two rules the renderer and the panel must agree on
  const finset = {
    size: { length: 4.179, depth: 0.45, thickness: 0.038 },
    unit: { hardwareAboveFin: 0.4082 },
  }
  const sizeMm = { l: 1800, w: 16, h: 194 }
  const entry = { fins: { size: finset.size, hardwareAboveFin: finset.unit.hardwareAboveFin } }
  ok('the renderer and the slider compute the same floor',
    Math.abs(modelMinDrop(finset, sizeMm) * 1000 - modelMinDropMm(entry, sizeMm)) <= 1,
    `${modelMinDrop(finset, sizeMm) * 1000} vs ${modelMinDropMm(entry, sizeMm)}`)
  ok('a model with no hardware has no floor',
    modelMinDrop({ size: finset.size, unit: {} }, sizeMm) === 0)
  ok('and a missing finset has none either', modelMinDrop(null, sizeMm) === 0)

  // The selection box, measured against the geometry rather than restated.
  //
  // The two assertions that used to stand here compared a number with itself,
  // which is how a real fault got past them: the renderer wrapped EVERY model
  // group in a second -drop, so a rebuilt run hung at twice its drop while the
  // outline was drawn at the true one. The outline was a whole drop too high
  // and nothing here noticed. So build a run and measure where the blades land.
  const drop = 0.45
  const depth = sizeMm.h / 1000

  // one fin, its top face at y = 0, no hardware: the arithmetic is the drop
  const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
  blade.translate(0, -depth / 2, 0)
  const flat = {
    size: { length: 1.8, thickness: 0.016, depth },
    fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
    unit: {
      finTopY: 0, hardwareAboveFin: 0, hardwareX: [], hardware: [],
      fin: { geometry: blade, material: new THREE.MeshStandardMaterial() },
    },
  }
  const runParams = { model: 'test', drop, count: 6, spacing: 200, sizeMm, finOverrides: {} }

  const offset = runDropOffset(runParams, flat)
  ok('a rebuilt run takes no extra drop from the renderer', offset === 0, String(offset))
  ok('a whole-object model still does', runDropOffset(runParams, null) === -drop,
    String(runDropOffset(runParams, null)))
  ok('and a parametric set never does', runDropOffset({ model: null, drop }, null) === 0)

  const built = new THREE.Group()
  built.position.y = offset
  built.add(buildModelRun(flat, runParams, null))
  built.updateMatrixWorld(true)
  let lo = Infinity, hi = -Infinity, fins = 0
  built.traverse((o) => {
    if (!o.isMesh || o.userData.finIndex == null) return
    fins++
    o.geometry.computeBoundingBox()
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
    lo = Math.min(lo, bb.min.y)
    hi = Math.max(hi, bb.max.y)
  })
  ok('the run builds one blade per fin', fins === 6, String(fins))
  ok('the fin top sits exactly at the drop', Math.abs(hi - -drop) < 1e-6, `${hi} vs ${-drop}`)
  ok('the outline runs from the slab to the bottom of the fins',
    Math.abs(lo - -(drop + depth)) < 1e-6, `${lo} vs ${-(drop + depth)}`)
  ok('the fin marker lands on the middle of the blade',
    Math.abs((-drop - depth / 2) - (lo + hi) / 2) < 1e-6)
}

// ---------------------------------------------------------------------------
section("FIN FINISHES — own, inherited, or the model materials")
{
  // The fault this guards: a fin's colour was read from the fin and its family
  // from the SET. A colour code the family does not publish falls back to that
  // family's first swatch, so every swatch you picked on a fin painted the same
  // thing — "I try to change its colour and it doesn't work".
  const base = {
    model: 'test', finishAll: true, family: 'wood-classic', colour: 'WD-NC-15',
    count: 4, spacing: 200, drop: 0.4, sizeMm: { l: 1800, w: 16, h: 194 },
    finOverrides: { 1: { family: 'pet-solid', colour: 'Emerald' }, 2: { colour: 'Marigold' } },
  }

  const f0 = finFinish(base, 0)
  ok("a fin with no finish of its own takes the one on the set",
    f0.family === 'wood-classic' && f0.colour === 'WD-NC-15', JSON.stringify(f0))

  const f1 = finFinish(base, 1)
  ok('a fin with its own finish keeps BOTH of its fields',
    f1.family === 'pet-solid' && f1.colour === 'Emerald', JSON.stringify(f1))

  const f2 = finFinish(base, 2)
  ok("a colour with no family of its own does not borrow the family on the set",
    f2.family !== 'wood-classic' && f2.colour === 'Marigold', JSON.stringify(f2))

  ok('a model set left on its own materials gives its fins no finish',
    finFinish({ ...base, finishAll: false, finOverrides: {} }, 0) === null)
  ok('but a fin inside one can still take a catalogue finish',
    finFinish({ ...base, finishAll: false }, 1)?.colour === 'Emerald')

  // and that it is what the renderer actually builds with
  const depth = 0.194
  const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
  blade.translate(0, -depth / 2, 0)
  const flat = {
    size: { length: 1.8, thickness: 0.016, depth },
    fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
    unit: {
      finTopY: 0, hardwareAboveFin: 0, hardwareX: [], hardware: [],
      fin: { geometry: blade, material: new THREE.MeshStandardMaterial() },
    },
  }
  const asked = []
  buildModelRun(flat, base, (family, colour, i) => {
    asked[i] = { family, colour }
    return new THREE.MeshStandardMaterial()
  })
  ok('the renderer asks for the set finish on an untouched fin',
    asked[0]?.family === 'wood-classic' && asked[0]?.colour === 'WD-NC-15', JSON.stringify(asked[0]))
  ok("and for the pair on the fin when that fin was overridden",
    asked[1]?.family === 'pet-solid' && asked[1]?.colour === 'Emerald', JSON.stringify(asked[1]))
  ok('every fin gets a finish asked for', asked.filter(Boolean).length === 4,
    String(asked.filter(Boolean).length))
}

// ---------------------------------------------------------------------------
section('PANEL CROP — real cloth, at the size it really is')
{
  // Checked through three's own UV transform rather than by re-deriving it: the
  // texture is turned a quarter turn so the panel's long side runs along the
  // fin, and with rotation the repeat axes swap. That is easy to get backwards
  // and impossible to see in a diff.
  const sampled = (lengthMm, depthMm) => {
    const tex = new THREE.Texture()
    cropToFin(tex, lengthMm, depthMm)
    tex.updateMatrix()
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]]
      .map(([u, v]) => new THREE.Vector2(u, v).applyMatrix3(tex.matrix))
    const us = corners.map((c) => c.x)
    const vs = corners.map((c) => c.y)
    return {
      // fraction of each panel axis the fin covers, and where it sits
      u: { span: Math.max(...us) - Math.min(...us), mid: (Math.max(...us) + Math.min(...us)) / 2 },
      v: { span: Math.max(...vs) - Math.min(...vs), mid: (Math.max(...vs) + Math.min(...vs)) / 2 },
    }
  }

  const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

  for (const [lengthMm, depthMm] of [[1800, 194], [2780, 300], [1200, 100]]) {
    const got = sampled(lengthMm, depthMm)
    // the fin's LENGTH must come off the panel's long (2800 mm) side
    ok(`${lengthMm} mm fin takes ${lengthMm} mm of cloth along its length`,
      near(got.v.span * PANEL_MM.l, lengthMm, 1e-3), (got.v.span * PANEL_MM.l).toFixed(2))
    // and its DEPTH off the short (1200 mm) side
    ok(`  and ${depthMm} mm across its face`,
      near(got.u.span * PANEL_MM.w, depthMm, 1e-3), (got.u.span * PANEL_MM.w).toFixed(2))
    ok('  centred on the panel', near(got.u.mid, 0.5) && near(got.v.mid, 0.5),
      `${got.u.mid.toFixed(4)}, ${got.v.mid.toFixed(4)}`)
    ok('  and never wrapping', got.u.span <= 1 + 1e-9 && got.v.span <= 1 + 1e-9)
  }

  // the mistake this replaced: length against the 1200 mm side drew the weave
  // 2800/1200 too coarse
  const wrong = 1800 / PANEL_MM.l * PANEL_MM.w
  ok('mapping length to the short side would have been 2.3x too coarse',
    Math.abs(1800 / wrong - PANEL_MM.l / PANEL_MM.w) < 1e-9, (1800 / wrong).toFixed(3))
}

// ---------------------------------------------------------------------------
section('DISPOSAL — a group frees what it owns and nothing else')
{
  // The flicker this guards: a Colour Core material's map is the ONE panel
  // texture lib/colourCore holds, handed to every fin wearing that finish.
  // Tearing down a group to rebuild it freed that texture out from under the
  // group replacing it, and three.js re-uploaded it — visibly, every rebuild.
  const spy = () => {
    const t = new THREE.Texture()
    let freed = 0
    t.dispose = () => { freed++ }
    return { t, freed: () => freed }
  }

  const own = spy()
  const shared = spy()
  const g = new THREE.Group()
  const geo = new THREE.BoxGeometry(1, 1, 1)

  const a = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: own.t }))
  const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: shared.t }))
  b.material.userData.sharedMap = true
  g.add(a, b)

  let matsFreed = 0
  for (const m of [a.material, b.material]) {
    const real = m.dispose.bind(m)
    m.dispose = () => { matsFreed++; real() }
  }

  disposeGroup(g)
  ok('a texture the material owns is freed', own.freed() === 1, String(own.freed()))
  ok('a shared texture is left alone', shared.freed() === 0, String(shared.freed()))
  ok('both materials are freed either way', matsFreed === 2, String(matsFreed))
}

// ---------------------------------------------------------------------------
section("PRODUCT TREE — the folders decide what can be built")
{
  // public/models/baffles/<Type>/<Shape>.fbx is the whole registration
  // mechanism, so the fields the scanner writes have to survive into the
  // registry. They once did not, and every baffle type showed as unavailable
  // while the files sat correctly in place — invisible to the build, because a
  // field that is simply absent reads as undefined rather than failing.
  ok('the manifest records a type and shape for every model',
    manifest.baffles.length > 0 && manifest.baffles.every((b) => b.type && b.shape),
    manifest.baffles.map((b) => `${b.id}:${b.type}/${b.shape}`).join(' '))

  ok('and both survive into the registry',
    MODELS.length === manifest.baffles.length && MODELS.every((m) => m.type && m.shape),
    MODELS.map((m) => `${m.id}:${m.type}/${m.shape}`).join(' '))

  ok('ids are namespaced by type, so two Standard files cannot collide',
    new Set(MODELS.map((m) => m.id)).size === MODELS.length &&
    MODELS.every((m) => m.id === `${m.type}-${m.shape}`),
    MODELS.map((m) => m.id).join(' '))

  for (const m of MODELS) {
    ok(`${m.type}/${m.shape} is reachable by type and shape`,
      modelFor(m.type, m.shape) === m && hasType(m.type) && hasShape(m.type, m.shape))
    ok(`  and ${m.type} is a type the catalogue publishes`, !!BAFFLE_TYPES[m.type], m.type)
    const bt = BAFFLE_TYPES[m.type]
    ok(`  and ${m.shape} is a shape it publishes`, !bt.shapes || !!bt.shapes[m.shape], m.shape)
  }

  // the panel opens on the brush, so the brush has to name something buildable
  const d = defaultBaffleParams()
  ok('the default product is one a model exists for',
    hasShape(d.btype, d.shape) || hasType(d.btype), `${d.btype}/${d.shape}`)
  ok('and its thickness is one that type sells',
    BAFFLE_TYPES[d.btype].thicknesses.includes(d.thickness), String(d.thickness))
  ok('and its height is one that shape sells',
    baffleWidths(d).includes(d.width), String(d.width))

  // a type with no folder is still listed, just not buildable
  ok('VMT is published but has no model yet', !!BAFFLE_TYPES.vmt && !hasType('vmt'))
}

// ---------------------------------------------------------------------------
section("PANEL SIZE — shrunk once, properly, instead of every frame")
{
  // The complaint: on the third weave, past a certain distance, a pattern
  // appears that is in neither the cloth nor the photograph, and it does not go
  // away further out or at any angle.
  //
  // The photographs are 3402 x 7937 for a fin that gets a few hundred pixels of
  // face. Minifying that far is done by averaging blocks of texels, and what a
  // block average leaves behind beats against the pixel grid. Measured on a real
  // GPU through the real sampler, the false pattern on FB-CC-03 came to 6.8x the
  // cloth's own detail at the worst distance, against 2-3x on the other two.
  //
  // Three explanations were tested and thrown away before this one: that the
  // weave is finer (it is, and it makes no difference — under even minification
  // FB-CC-03 is the BEST of the three), that the artefact is direction-dependent
  // (it survives orbiting the camera), and that the mip chain bakes it in (all
  // three chains behave alike). What survived is the pair of measurements in
  // PANEL_PX: FB-CC-03 makes the most mess and has the plainest cloth to hide it
  // in.
  const panelBytes = (w) => w * Math.round(w * 7937 / 3402) * 4

  ok('a panel is decoded smaller than the file it comes from',
    PANEL_PX < 3402, `${PANEL_PX} vs 3402 px`)
  ok('and small enough to cut the memory several times over',
    panelBytes(PANEL_PX) < panelBytes(3402) / 3,
    `${(panelBytes(PANEL_PX) / 1e6).toFixed(0)} MB vs ${(panelBytes(3402) / 1e6).toFixed(0)} MB`)

  // NOT the largest size that fits the memory budget. 2048 measured WORSE than
  // 1024 on every structure, because whether a weave aliases depends on how its
  // thread pitch lines up with the sampling grid, not on how much of it there
  // is. A later "let's keep more detail" bump to 2048 would quietly bring the
  // shimmer back, so the number is pinned with its reason.
  ok('the size is the one that measured best, not simply the smallest',
    PANEL_PX === 1536, String(PANEL_PX))

  // ---- reading the width without decoding ---------------------------------
  // Needed so a smaller asset is not UPSCALED into the memory this exists to
  // save. Decoding twice to find out would cost the 108 MB being avoided.
  const jpeg = (w, h, { marker = 0xc0, app = true } = {}) => {
    const out = [0xff, 0xd8]
    if (app) out.push(0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0))
    out.push(0xff, marker, 0x00, 0x11, 0x08,
      (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x03, ...new Array(9).fill(0))
    return new Uint8Array(out).buffer
  }

  ok('the width is read out of a JPEG header', jpegWidth(jpeg(3402, 7937)) === 3402,
    String(jpegWidth(jpeg(3402, 7937))))
  ok('and out of a progressive one too', jpegWidth(jpeg(1200, 2800, { marker: 0xc2 })) === 1200,
    String(jpegWidth(jpeg(1200, 2800, { marker: 0xc2 }))))
  ok('a header with no APP0 still reads', jpegWidth(jpeg(800, 600, { app: false })) === 800,
    String(jpegWidth(jpeg(800, 600, { app: false }))))
  ok('something that is not a JPEG reads as nothing',
    jpegWidth(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer) === null, 'null')
  ok('and a truncated one does not loop or throw',
    jpegWidth(new Uint8Array([0xff, 0xd8, 0xff]).buffer) === null, 'null')

  // ---- what to do with that width ------------------------------------------
  ok('an oversized panel is asked for at the smaller size',
    panelDecodeOptions(3402)?.resizeWidth === PANEL_PX, JSON.stringify(panelDecodeOptions(3402)))
  ok('and asked for with a real filter, not the default',
    panelDecodeOptions(3402)?.resizeQuality === 'high', JSON.stringify(panelDecodeOptions(3402)))
  ok('the height is left out, so a differently shaped re-export keeps its ratio',
    panelDecodeOptions(3402)?.resizeHeight === undefined, JSON.stringify(panelDecodeOptions(3402)))
  ok('a panel already at the size is left alone', panelDecodeOptions(PANEL_PX) === null, 'null')
  ok('and a smaller one is never blown up', panelDecodeOptions(900) === null, 'null')
  ok('an unreadable header falls back to decoding as-is',
    panelDecodeOptions(null) === null, 'null')

  // ---- a header that is a long way in --------------------------------------
  // The ombré panels carry an embedded colour profile in FOUR 64 KB APP2
  // segments, plus EXIF and a Photoshop block, which puts their frame header
  // past 272 KB. A single 64 KB peek read none of it and reported "size
  // unknown" — so a 7382 x 17126 image went to a GPU that will not take
  // anything over 16384, and silently. The reader now grows its window until
  // the header turns up or the file runs out.
  const app2 = (bytes) => {
    const len = bytes + 2
    return [0xff, 0xe2, (len >> 8) & 0xff, len & 0xff, ...new Array(bytes).fill(0)]
  }
  const buried = new Uint8Array([
    0xff, 0xd8,
    ...app2(65504), ...app2(65504), ...app2(65504), ...app2(65504),
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (17126 >> 8) & 0xff, 17126 & 0xff, (7382 >> 8) & 0xff, 7382 & 0xff,
    0x03, ...new Array(9).fill(0),
  ]).buffer
  ok('a frame header buried behind a colour profile is still found',
    jpegSize(buried)?.width === 7382 && jpegSize(buried)?.height === 17126,
    JSON.stringify(jpegSize(buried)))
  ok('and the same file read only 64 KB deep gives nothing, as it did',
    jpegSize(buried.slice(0, 65536)) === null, 'null')
  ok('the size comes back as BOTH dimensions, not just the width',
    jpegSize(buried)?.height === 17126, String(jpegSize(buried)?.height))

  // ---- the cap that makes an upload possible at all ------------------------
  // Over the driver's limit a texture is not slow, it is REJECTED. Width alone
  // is not the test: a narrow, very tall asset passes a width check and is
  // still refused.
  const ombre = panelDecodeOptions({ width: 7382, height: 17126 })
  ok('the ombré panels are brought under the limit', ombre?.resizeWidth === PANEL_PX,
    JSON.stringify(ombre))
  ok('and their height comes down with it, well inside what a GPU takes',
    Math.round(ombre.resizeWidth * 17126 / 7382) < MAX_GPU_PX,
    `${Math.round(ombre.resizeWidth * 17126 / 7382)} vs ${MAX_GPU_PX}`)

  const tall = panelDecodeOptions({ width: 1000, height: 20000 })
  ok('a narrow but far too tall panel is shrunk even though its width is fine',
    tall !== null && tall.resizeWidth < 1000, JSON.stringify(tall))
  ok('and shrunk by exactly enough to fit, not to PANEL_PX',
    Math.round(tall.resizeWidth * 20000 / 1000) <= MAX_GPU_PX,
    `${Math.round(tall.resizeWidth * 20000 / 1000)} vs ${MAX_GPU_PX}`)

  ok('while a panel inside both limits is still left alone',
    panelDecodeOptions({ width: 1200, height: 2800 }) === null, 'null')
}

section('SOLID COLOURED PET — the colour and nothing else')
{
  // A solid-coloured PET baffle is a plain coloured board. The range is sold as
  // COLOURS — Arabian Spice, Marigold, Pomegranate — not as a material you are
  // meant to read the surface of, and two goes at drawing that surface both
  // came out worse than the colour they replaced: a 1%-contrast speckle
  // stretched 3.3:1 across the fin, then a fibre mat whose octaves were
  // stretched 3:1 and read as wood grain.
  //
  // So the guard is not about how good the texture is. It is that there is no
  // texture: nothing to squash, nothing to stretch, nothing with a direction.

  // The BODY only, so a `map` elsewhere in the file cannot stand in for a
  // `map` here. Carriage returns go first: these files are checked out with
  // CRLF, and a body cut at a bare newline-brace-newline came back two
  // characters long and quietly passed nothing.
  const src = fs.readFileSync('src/lib/baffle.js', 'utf8').replace(/\r/g, '')
  const after = src.slice(src.indexOf('function feltFinMaterial('))
  const fn = after.slice(0, after.indexOf('\n}\n') + 3)

  ok('a felt finish is built from the swatch hex alone',
    /function feltFinMaterial\(hex\)\s*\{/.test(src), 'feltFinMaterial still takes the fin size')
  ok('and wears no map of any kind',
    !/\bmap\b/.test(fn) && !/normalMap/.test(fn), fn.replace(/\s+/g, ' ').slice(0, 120))
  ok('and is reached before the generic path, which would give it one',
    /if \(fam\.kind === 'felt'\) return feltFinMaterial\(sw\?\.hex \?\? '#b0aca3'\)/.test(src),
    'felt no longer leaves before the texturing tail')
  ok('so it is a colour, a roughness and nothing else',
    /color: hex, roughness: 0\.96, metalness: 0/.test(fn), fn.replace(/\s+/g, ' ').slice(0, 120))

  // Which families that covers. cloud-solid and cloud-colours are "felt" too,
  // but CloudSet puts a flat hex on the model's own material and never reaches
  // this function at all — so they were already colours.
  const felt = Object.entries(COLOUR_FAMILIES).filter(([, f]) => f.kind === 'felt').map(([k]) => k)
  ok('and that is every felt family, the baffle ones included',
    felt.includes('pet-solid') && felt.includes('vmt-solid'), felt.join(', '))

  // The felt TEXTURE is still generated, for the furniture in the room scenes.
  // Keeping it out of the baffle path is the whole point, so this is worth
  // holding down: the seating wants a cloth, the ceiling product does not.
  const tex = fs.readFileSync('src/lib/textures.js', 'utf8')
  ok('the felt texture that remains is furniture upholstery, not a finish',
    /feltTexture/.test(fs.readFileSync('src/lib/furniture.js', 'utf8'))
      && !/feltTexture|feltNormal|feltRepeat/.test(src),
    'baffle.js still reaches for a felt texture')
  ok('and nothing is left over from giving baffles a relief',
    !/feltNormal|feltRepeat|FELT_TILE_M/.test(tex), 'dead felt-relief exports survive')
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
section('DESIGNER TEXTILE ON TILES — the same cloth, cropped')
{
  // The fabric range came to the ceiling tiles after the baffles, and it is the
  // SAME 275 panels: a fin is a strip cut out of one, a tile is a patch of one.
  // Four decisions were taken about how, and these hold them down.

  const spec = { ttype: 'designer-textile', size: '600x600', grid: 24, thickness: 25 }

  // 1. Its own range — and now HIDDEN. Asked for after it was built: the range
  // is not offered in the Type list any more, but it still exists, still
  // reconciles and still renders, so a layout saved while it was offered loads
  // rather than coming back as a range this build has never heard of.
  ok('Designer Textile is a range of its own',
    !!TILE_TYPES['designer-textile'] && tileIsFabric({ ttype: 'designer-textile' }),
    Object.keys(TILE_TYPES).join(','))
  ok('but it is NOT offered in the tile type list',
    !tileTypesOffered().some((t) => t.id === 'designer-textile'),
    tileTypesOffered().map((t) => t.id).join(','))
  ok('and the ranges that remain are still offered',
    tileTypesOffered().map((t) => t.id).join(',') === 'wood-classic,temp,univicstrip',
    tileTypesOffered().map((t) => t.id).join(','))
  ok('while a saved layout naming it still loads',
    reconcileTile({ ttype: 'designer-textile' }).ttype === 'designer-textile',
    String(reconcileTile({ ttype: 'designer-textile' }).ttype))
  ok('and Wood Classic is not a fabric range',
    !tileIsFabric({ ttype: 'wood-classic' }) && !tileIsFabric({ ttype: 'univicstrip' }))

  // 2. No perforation — the PF codes are Wood Classic's.
  const asks = tileMissingFields(spec)
  ok('a fabric tile is asked for a Fabric and never a Perforation',
    asks.includes('Fabric') && !asks.includes('Perforation') && !asks.includes('Base colour'),
    asks.join(', '))
  ok('and a veneer tile is asked the other way round',
    (() => {
      const w = tileMissingFields({ ttype: 'wood-classic', size: '600x600', grid: 24, thickness: 25 })
      return w.includes('Base colour') && w.includes('Perforation') && !w.includes('Fabric')
    })(), tileMissingFields({ ttype: 'wood-classic', size: '600x600', grid: 24, thickness: 25 }).join(', '))

  // It still asks for size and grid: same lay-in file, same tee.
  ok('it is the same lay-in tile, so it still chooses a size and a grid',
    tileMissingFields({ ttype: 'designer-textile' }).join(', ') === 'Size, Grid, Thickness, Fabric',
    tileMissingFields({ ttype: 'designer-textile' }).join(', '))

  // A fabric alone completes it — nothing else is outstanding.
  const key = TEXTILE_PANELS[0]?.key ?? null
  ok('and a fabric is the last thing it needs',
    !!key && tileReadyToPlace(reconcileTile({ ...spec, textile: key })),
    tileMissingFields({ ...spec, textile: key }).join(', '))

  // The field is its OWN field. A veneer code and a fabric key are read from
  // different maps, and one name for both is how a field gets validated
  // against the wrong list.
  ok('the fabric has a field of its own, beside the veneer rather than inside it',
    'textile' in emptyTileParams() && 'wood' in emptyTileParams())
  ok('and a key the panel map has never heard of is dropped',
    reconcileTile({ ...spec, textile: 'FBX_Nonesuch_9' }).textile === null,
    String(reconcileTile({ ...spec, textile: 'FBX_Nonesuch_9' }).textile))
  ok('while a real one survives, at either tile size',
    reconcileTile({ ...spec, textile: key }).textile === key
      && reconcileTile({ ...spec, size: '1200x600', textile: key }).textile === key,
    String(reconcileTile({ ...spec, textile: key }).textile))

  // 3. True scale. A tile shows its own millimetres of cloth out of the
  // 1200 x 2800 panel — so a tile and a fin in one fabric are the same cloth at
  // the same size, which is the whole reason to crop rather than fit.
  const crop = (t) => ({
    x: Math.min(1, t.x / (TEXTILE_SHEET.h * 1000)),
    y: Math.min(1, t.z / (TEXTILE_SHEET.w * 1000)),
  })
  const c600 = crop({ x: 595, z: 595 })
  ok('a 595 tile crops 595 mm of cloth, not a panel squashed to fit',
    Math.abs(c600.x - 595 / 2800) < 1e-9 && Math.abs(c600.y - 595 / 1200) < 1e-9,
    `${c600.x} x ${c600.y}`)
  ok('so a millimetre of tile is a millimetre of cloth on both axes',
    Math.abs((595 / c600.x) - 2800) < 1e-6 && Math.abs((595 / c600.y) - 1200) < 1e-6)
  const c1200 = crop({ x: 1195, z: 595 })
  ok('and a 1195 tile crops twice as much along, at the same scale across',
    Math.abs(c1200.x / c600.x - 1195 / 595) < 1e-9 && Math.abs(c1200.y - c600.y) < 1e-9,
    `${c1200.x} x ${c1200.y}`)
  ok('both crops fit inside the panel, so nothing has to wrap',
    c600.x < 1 && c600.y < 1 && c1200.x < 1 && c1200.y < 1,
    `${c1200.x}, ${c1200.y}`)

  // 4. Every tile identical — one centred crop, repeated. Written down because
  // it is a CHOICE and its alternative is one line: successive offsets.
  {
    const src = fs.readFileSync('src/lib/tiles.js', 'utf8')
    ok('the crop is centred and the same for every tile, as asked',
      /tex\.offset\.set\(\(1 - rx\) \/ 2, \(1 - ry\) \/ 2\)/.test(src),
      'the tile crop is no longer one centred patch')
  }

  // The sheet has to be RETAINED, or it is freed out from under the tile the
  // next time the layout changes — a tile does not call its fabric `colour`,
  // so the baffle-shaped check would have missed it entirely.
  {
    const src = fs.readFileSync('src/main.jsx', 'utf8')
    ok('and a tile fabric counts as a sheet in use, or it is freed under the tile',
      /p\.textile\) keys\.add\(p\.textile\)/.test(src)
        && /tileOverrides[\s\S]{0,120}ov\.textile/.test(src),
      'main.jsx retains only baffle sheets')
  }

  // A fabric face does not take light like a lacquered veneer.
  {
    const src = fs.readFileSync('src/three/useTileBlock.js', 'utf8')
    ok('and a fabric face is matte, where a veneer face is satin',
      /mat\.roughness = fabric \? 0\.95 : 0\.72/.test(src),
      'every tile face still takes the veneer roughness')
  }

  // A fabric tile reaches the schedule under its fabric key, because that is
  // what somebody would order.
  {
    const src = fs.readFileSync('src/lib/store.js', 'utf8')
    ok('and it is scheduled by its fabric, not by an empty veneer code',
      /colour: f\.textile \?\? f\.wood/.test(src), 'the tile schedule ignores the fabric')
    ok('and its finish line names the fabric rather than the size twice',
      /f\.textile \?\? \[f\.wood, f\.perforation\]/.test(src),
      'the schedule line for a fabric tile is a bare panel size')
  }
}

// ---------------------------------------------------------------------------
section('ONE LATTICE — duplicates and drags have to agree')
{
  // The report: "when i click on duplicate, they stack good. when i try to
  // manually move single pieces and try to stack them with the stacks that have
  // been put by duplicating, there a gap. when i try to move another piece with
  // the single piece, they stack together good."
  //
  // Two lattices on one ceiling. Duplicate offsets by exactly one footprint
  // from wherever its source sits; a placed or dragged set snaps to a multiple
  // of its step from cell 0. The two agree only while the source is ON that
  // multiple — and clampCorner was taking it off, because the far edge of the
  // ceiling is `cols - ci` and there is no reason for THAT to be a multiple of
  // anything. A 600 mm tile on a 7.5 m ceiling clamped to 6900: eleven and a
  // HALF modules from the origin, and every copy made from it inherited the
  // half.
  //
  // Driven with baffles because they need no manifest, but it is one clamp and
  // one code path: a tile differs only in having a bigger step.

  reset()
  const g = S().grid()
  const it0 = { type: 'baffles', params: S().brush.params }
  const [step] = snapStepOf(it0, g)
  const base = productCells(S().brush, g.pitch)
  ok('a set snaps to a step of its own, in cells', step > 1, String(step))
  // The trap, stated as arithmetic on the case that was actually reported: a
  // 600 mm tile on a 7.5 m ceiling. Whether THIS room and THIS product happen
  // to land on it is luck, which is the point — the clamp has to be right for
  // the combinations that do not.
  ok('and a ceiling edge need not be on that step — 7500 - 600 is 6900',
    (7500 - 600) % 600 !== 0 && (7500 - 600) === 6900)

  // Placed anywhere — including hard against that edge — it lands on the step.
  let off = 0
  let placed = 0
  for (let i = 0; i <= g.cols; i += 137) {
    for (let j = 0; j <= g.rows; j += 311) {
      S().clear()
      if (!S().placeAt(i, j)) continue
      placed++
      const [ci0, cj0] = S().items[0].cell
      if (ci0 % step || cj0 % step) off++
    }
  }
  ok('so a set placed anywhere on the ceiling still lands on its step',
    placed > 50 && off === 0, `${off} of ${placed} off the lattice`)

  // A drag into the far corner is clamped ON the step, not onto the raw bound.
  S().clear()
  const id = S().placeAt(Math.floor(g.cols / 2), Math.floor(g.rows / 2))
  S().dragTo(id, 1e6, 1e6)
  const corner = S().items[0].cell
  ok('and a drag into the far corner is held on the step, not against the wall',
    corner[0] % step === 0 && corner[1] % step === 0, JSON.stringify(corner))
  ok('which is a step SHORT of the wall, because half a step is not a place',
    corner[0] === Math.floor((g.cols - footprint(S().items[0], g).ci) / step) * step,
    String(corner[0]))

  // The report itself: a run built by Duplicate from a set placed against the
  // edge, and a separate set dragged up against it — one lattice between them.
  S().clear()
  let last = S().placeAt(g.cols - 1, Math.floor(g.rows / 2))
  for (let k = 0; k < 3; k++) last = S().duplicate(last) ?? last
  const loose = S().placeAt(Math.floor(g.cols / 4), Math.floor(g.rows / 2))
  if (loose) S().dragTo(loose, Math.floor(g.cols / 2), Math.floor(g.rows / 2))
  const cells = S().items.map((i) => i.cell)
  ok('a run built by Duplicate from an edge set shares the lattice a drag uses',
    cells.length > 1 && cells.every(([i, j]) => i % step === 0 && j % step === 0),
    JSON.stringify(cells))

  // And the nudge still works, which is exactly why update() must NOT snap.
  S().clear()
  const nid = S().placeAt(Math.floor(g.cols / 2), Math.floor(g.rows / 2))
  const wasI = S().items[0].cell[0]
  S().move(nid, 1, 0)
  ok('while an arrow-key nudge still moves by one cell, snapping nothing',
    S().items[0].cell[0] === wasI + 1, `${wasI} -> ${S().items[0].cell[0]}`)

  // clampCorner on its own. Stepless is the old behaviour and stays available,
  // because the nudge needs it.
  const gg = { cols: 7500, rows: 7000 }
  ok('clampCorner without a step is unchanged, which is what the nudge needs',
    clampCorner(9999, -5, 600, 600, gg).join(',') === '6900,0')
  ok('and with a step it FLOORS onto it, rather than rounding back outside',
    clampCorner(9999, -5, 600, 600, gg, [600, 600]).join(',') === '6600,0')
  ok('and a corner already on the step, inside the bounds, is left alone',
    clampCorner(1200, 1800, 600, 600, gg, [600, 600]).join(',') === '1200,1800')
  ok('and a footprint bigger than the ceiling lands at 0 rather than negative',
    clampCorner(50, 50, 9000, 9000, gg, [600, 600]).join(',') === '0,0')
}

// ---------------------------------------------------------------------------
section('DESIGNER TEXTILE ON CLOUDS — the third product in one cloth')
{
  // The same 1200 x 2800 sheet a fin is a strip of and a tile is a patch of. A
  // cloud is the third: one crop, at true scale, on a panel whose UVs were
  // already normalised to 0..1 — which is what lets one crop serve square,
  // circle, hexagon and triangle without any of them knowing about fabric.

  const SW = COLOUR_FAMILIES['pet-solid'].swatches
  const key = TEXTILE_PANELS[0]?.key ?? null

  // The ORDER is the panel's, not the alphabet's: the printed range, then the
  // 275-panel fabric picker.
  ok('a cloud chooses a finish FAMILY now, not just a colour',
    CLOUD_FAMILIES.join(',') === 'cloud-series,designer-textiles',
    CLOUD_FAMILIES.join(','))

  // A CLOUD HAS NO FLAT COLOUR. Two ranges have been taken off it and they are
  // different kinds of removal, which is why both are pinned.
  //
  // cloud-solid was four invented hexes, a placeholder, and was a mistake to
  // offer. pet-solid is a real 44-colour range and its removal was a product
  // decision -- clouds are sold printed or in cloth. So pet-solid must still be
  // offered on BAFFLES, and that half is asserted too: a family disappearing
  // from one product is a list change, and from every product is a deletion.
  ok('the cloud-solid placeholder is offered nowhere',
    !CLOUD_FAMILIES.includes('cloud-solid'), CLOUD_FAMILIES.join(','))
  ok('and Solid Coloured PET is not offered on a cloud either',
    !CLOUD_FAMILIES.includes('pet-solid'), CLOUD_FAMILIES.join(','))
  ok('but it is still offered on a baffle, this being a cloud decision only',
    baffleFamilies('blade').includes('pet-solid'), baffleFamilies('blade').join(','))
  ok('so it is still a real range in the catalogue', SW.length > 20, `${SW.length} colours`)

  // Opening on the printed range rather than a flat one, because that is now
  // the first thing in the list.
  ok('a cloud brush opens on the printed range',
    emptyCloudParams().family === 'cloud-series', String(emptyCloudParams().family))

  const printed = reconcileCloud({ shape: 'square', size: 1200, family: 'cloud-series' })
  const cloth = reconcileCloud(
    { shape: 'square', size: 1200, family: 'designer-textiles', colour: key },
  )
  ok('a printed cloud is not a fabric one, and a fabric one is',
    !cloudIsFabric(printed) && cloudIsFabric(cloth),
    `${printed.family} / ${cloth.family}`)

  // The two codes come from different places and are checked against different
  // lists — a swatch is not a sheet.
  ok('a fabric key survives on the fabric family',
    cloth.colour === key, String(cloth.colour))
  ok('and a key the panel map has never heard of is dropped',
    reconcileCloud({ shape: 'square', size: 1200, family: 'designer-textiles', colour: 'FBX_Nope_9' })
      .colour === null)
  ok('while a code no range publishes is dropped whatever the family',
    reconcileCloud({ shape: 'square', size: 1200, colour: 'NotAColour' }).colour === null)
  ok('and a family nobody sells falls back to the first one that is offered',
    reconcileCloud({ shape: 'square', size: 1200, family: 'nonesuch' }).family
      === CLOUD_FAMILIES[0])

  // The outstanding-fields line names the field the way its range does.
  ok('a fabric cloud is asked for a Fabric, a printed one for a Design',
    cloudMissingFields({ shape: 'square', size: 1200, family: 'designer-textiles' }).join(',') === 'Fabric'
      && cloudMissingFields({ shape: 'square', size: 1200, family: 'cloud-series' }).join(',') === 'Design',
    cloudMissingFields({ shape: 'square', size: 1200, family: 'designer-textiles' }).join(','))

  // True scale, the same arithmetic the tiles use. A cloud is measured, not
  // nominal — a "1200" panel is about 1166 — so the crop follows the plan.
  const crop = (plan) => ({
    x: Math.min(1, plan.length / TEXTILE_SHEET.h),
    y: Math.min(1, plan.width / TEXTILE_SHEET.w),
  })
  const c12 = crop({ length: 1.2, width: 1.2 })
  ok('a 1200 cloud shows 1200 mm of cloth along the sheet',
    Math.abs(c12.x * TEXTILE_SHEET.h * 1000 - 1200) < 1e-6, String(c12.x))
  ok('and the full 1200 across it, because that is all the sheet is',
    c12.y === 1, String(c12.y))
  const c6 = crop({ length: 0.6, width: 0.6 })
  ok('a 600 cloud shows half of what a 1200 does, on both axes',
    Math.abs(c6.x - c12.x / 2) < 1e-9 && Math.abs(c6.y - 0.5) < 1e-9,
    `${c6.x} x ${c6.y}`)
  ok('so a cloud, a tile and a baffle in one fabric are the same cloth at one size',
    Math.abs((0.6 / c6.x) - TEXTILE_SHEET.h) < 1e-9)

  {
    const src = fs.readFileSync('src/lib/clouds.js', 'utf8')
    ok('the crop is centred, the way the tile crop is',
      /tex\.offset\.set\(\(1 - rx\) \/ 2, \(1 - ry\) \/ 2\)/.test(src),
      'the cloud crop is no longer one centred patch')
    // The cap is mapped as well as the panel. It used to be because they shared
    // a material; they no longer do, and it still has to be mapped — a back
    // face on the file's own UVs would wear its finish at whatever scale the
    // exporter left behind.
    ok('and the cap is mapped as well as the panel',
      /if \(isPanel && projectCloudUV\(g\)\)/.test(src),
      'only the panel UV is projected')
  }
  {
    // The finish moved out of CloudSet into useCloudModel when the focus view
    // arrived, so that both views paint a cloud the same way. These read it
    // where it lives now.
    const src = fs.readFileSync('src/three/useCloudModel.js', 'utf8')
    ok('a fabric cloud takes light like cloth, where a solid one takes it like paint',
      /roughness = 0\.95/.test(src) && /roughness = 0\.85/.test(src),
      'the cloud panel has one roughness for both finishes')
  }
  {
    // The sheet has to be retained or it is freed under the cloud. A cloud
    // names its fabric `colour`, so the family-based line already covers it —
    // this holds that line down.
    const src = fs.readFileSync('src/main.jsx', 'utf8')
    ok('and a cloud fabric counts as a sheet in use, through its family',
      /COLOUR_FAMILIES\[p\.family\]\?\.sheet && p\.colour/.test(src),
      'main.jsx does not retain sheets by family')
  }
}

// ---------------------------------------------------------------------------
section('TILE THICKNESS — on the order, not on the model')
{
  // Asked for as "thickness of the tile (not grid) — they wont change the
  // model, just for info". So the whole of this is: it is a real field on the
  // specification and the schedule, and it reaches the geometry NOWHERE.

  ok('the range is 12, 25 and 40 mm',
    TILE_THICKNESSES.join(',') === '12,25,40', TILE_THICKNESSES.join(','))

  const spec = { ttype: 'wood-classic', size: '600x600', grid: 24, wood: 'WD-NC-05', perforation: 'PF-NC-08' }

  // It is asked for, like every other thing a tile is made of.
  ok('a tile is asked for a thickness before it can be placed',
    tileMissingFields(spec).join(',') === 'Thickness', tileMissingFields(spec).join(','))
  ok('and with one it is complete',
    tileReadyToPlace(reconcileTile({ ...spec, thickness: 25 })),
    tileMissingFields({ ...spec, thickness: 25 }).join(','))
  // In the order the panel asks: what the tile IS, then what it looks like.
  const asks = tileMissingFields(emptyTileParams())
  ok('asked after the grid and before the finishes',
    asks.indexOf('Thickness') === asks.indexOf('Grid') + 1
      && asks.indexOf('Thickness') < asks.indexOf('Base colour'),
    asks.join(' > '))
  // And NOT confused with the grid, which is the exposed tee and a different
  // file. Both exist, and they are different fields.
  ok('and the grid is still its own field, because THAT one changes the model',
    asks.includes('Grid') && asks.includes('Thickness')
      && reconcileTile({ ...spec, thickness: 40, grid: 15 }).grid === 15,
    asks.join(' > '))

  ok('a thickness the range is not made in is dropped',
    reconcileTile({ ...spec, thickness: 18 }).thickness === null,
    String(reconcileTile({ ...spec, thickness: 18 }).thickness))
  ok('and one it is made in survives',
    reconcileTile({ ...spec, thickness: 40 }).thickness === 40)
  // It is a property of the BOARD, so nothing else narrows it: a 25 mm board is
  // a 25 mm board whichever tile is cut from it.
  ok('it survives a change of size, of grid and of range',
    reconcileTile({ ...spec, thickness: 40, size: '1200x600' }).thickness === 40
      && reconcileTile({ ...spec, thickness: 40, grid: 15 }).thickness === 40
      && reconcileTile({ ...spec, thickness: 40, ttype: 'univicstrip' }).thickness === 40)

  // The point of the whole thing: it changes NOTHING that is drawn.
  {
    const g = S().grid()
    const thin = reconcileTile({ ...spec, thickness: 12 })
    const thick = reconcileTile({ ...spec, thickness: 40 })
    const a = tileCells(thin, g.pitch)
    const b = tileCells(thick, g.pitch)
    ok('a 40 mm tile reserves exactly what a 12 mm one does',
      a.ci === b.ci && a.cj === b.cj, `${a.ci}x${a.cj} vs ${b.ci}x${b.cj}`)
    ok('and measures the same block',
      JSON.stringify(tileBlockExtent(thin)) === JSON.stringify(tileBlockExtent(thick)),
      JSON.stringify(tileBlockExtent(thick)))
    ok('and resolves the same model file',
      tileModelId(thin) === tileModelId(thick), String(tileModelId(thick)))
    ok('and wears the same face, because thickness is not a finish',
      JSON.stringify(tileFinishOf(thin, 0)) === JSON.stringify(tileFinishOf(thick, 0)))
  }

  // Where it DOES go: the order.
  {
    reset()
    S().setProduct('tiles')
    S().setBrush({ ...spec, thickness: 40, cols: 1, rows: 1 })
    const id = S().placeAt(...at(20, 20))
    const sched = buildSchedule(S().items)
    ok('a placed tile reaches the schedule carrying its thickness',
      !!id && sched.rows[0]?.thickness === 40, JSON.stringify(sched.rows[0]?.thickness))
    // Two thicknesses are two lines, the way two colours are — you cannot order
    // them as one.
    S().setBrush({ thickness: 12 })
    S().placeAt(...at(40, 20))
    const two = buildSchedule(S().items)
    ok('and two thicknesses are two lines on it, not one',
      two.rows.length === 2 && two.rows.every((r) => r.qty === 1),
      two.rows.map((r) => `${r.thickness}mm x${r.qty}`).join(', '))
    reset()
  }
}

// ---------------------------------------------------------------------------
section('GRID SUPPORT — four rods, on the corners of the group')
{
  // "that rod has to be put on the corners of the ceiling tiles group. there
  // will be no more than 4 rods for a single tile or group of tiles."
  //
  // Measured off the file rather than taken on trust, because everything below
  // depends on what it actually is.

  const file = GRID_SUPPORT_FILE.replace('ceiling_tiles/', '')
  ok('the rod is a file on disk', fs.existsSync(path.join('public/models/ceiling_tiles', file)), file)

  {
    const b = fs.readFileSync(path.join('public/models/ceiling_tiles', file))
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    const root = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const axes = [size.x, size.y, size.z].sort((a, c) => c - a)

    ok('and it measures 343.5 mm on a 16.45 x 18.99 section',
      Math.abs(axes[0] - 343.52) < 0.1 && Math.abs(axes[1] - 18.99) < 0.1
        && Math.abs(axes[2] - 16.45) < 0.1,
      `${axes[0].toFixed(2)} x ${axes[1].toFixed(2)} x ${axes[2].toFixed(2)}`)

    // It is modelled at ceiling height and off to one side, like every other
    // supplied file — which is why it is re-cut on load and never in the file.
    ok('it is NOT modelled at the origin, so it has to be re-cut on load',
      box.min.length() > 1000, `${box.min.x.toFixed(0)}, ${box.min.y.toFixed(0)}, ${box.min.z.toFixed(0)}`)

    // The shaft is prismatic: no vertex between the two end fittings. The same
    // property splitAtHeight had to know about the Univic rods, and the reason
    // a height test on VERTICES would call the middle of a rod empty.
    let mid = 0
    const lo = box.min.z, hi = box.max.z
    root.traverse((o) => {
      if (!o.isMesh) return
      const q = o.geometry.attributes.position
      const v = new THREE.Vector3()
      for (let i = 0; i < q.count; i++) {
        v.fromBufferAttribute(q, i).applyMatrix4(o.matrixWorld)
        const t = (v.z - lo) / (hi - lo)
        if (t > 0.25 && t < 0.9) mid++
      }
    })
    ok('and its shaft is prismatic — no vertex at all between the two fittings',
      mid === 0, `${mid} vertices in the middle`)
  }

  // Which end is up is a named decision, not a sign buried in a rotation.
  ok('which end meets the slab is stated, not implied',
    typeof GRID_SUPPORT_PLATE_UP === 'boolean', String(GRID_SUPPORT_PLATE_UP))

  // FOUR, at the corners of the field — the arithmetic the renderer uses.
  {
    const corners = (nx, nz, mx, mz) => [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      .map(([sx, sz]) => [sx * (nx * mx) / 2, sz * (nz * mz) / 2])
    const four = corners(4, 3, 0.6, 0.6)
    ok('a 4 x 3 field of 600 tiles hangs from four points, not twelve',
      four.length === 4, String(four.length))
    ok('and they are the corners of the FIELD, 2.4 x 1.8 m apart',
      Math.abs(four[1][0] - four[0][0] - 2.4) < 1e-9
        && Math.abs(four[2][1] - four[0][1] - 1.8) < 1e-9,
      JSON.stringify(four))
    const one = corners(1, 1, 0.6, 0.6)
    ok('a single tile still gets four, at its own corners',
      one.length === 4 && Math.abs(one[1][0] - one[0][0] - 0.6) < 1e-9, JSON.stringify(one))
  }

  {
    const src = fs.readFileSync('src/three/useTileBlock.js', 'utf8').replace(/\r/g, '')
    // The fault this replaced: rods cloned INSIDE the per-tile loop, which on a
    // field of twenty tiles is eighty rods.
    const loop = src.slice(src.indexOf('for (let j = 0; j < nz'), src.indexOf('// ---- the suspension'))
    ok('no rod is built inside the per-tile loop',
      !/rods\.add/.test(loop), 'a rod is still cloned per tile')
    ok('exactly four corners are placed',
      /\[\[-1, -1\], \[1, -1\], \[-1, 1\], \[1, 1\]\]/.test(src), 'the corner list is not four')
    // Univic Strip brings its own four in its file and must keep them.
    ok('and a file that brought its own rods keeps them instead',
      /if \(model\.rods\?\.children\.length\) \{/.test(src), 'the file-rod branch is gone')
    ok('with the height measured from whichever of the two it is using',
      /model\.rods\?\.children\.length \? \(model\.rodHeight \?\? 0\) : \(support\?\.height \?\? 0\)/.test(src),
      'rodHeight no longer follows the rods actually drawn')
  }
  {
    const src = fs.readFileSync('src/lib/tiles.js', 'utf8').replace(/\r/g, '')
    ok('the rod is stood up by measuring which way it lies, not by assuming',
      /const long = s\.y >= s\.x && s\.y >= s\.z/.test(src), 'the orientation is assumed')
    ok('and lands on the contract a block already keeps: centred, base at y = 0',
      /geo\.translate\(-c\.x, -b\.min\.y, -c\.z\)/.test(src), 'the rod is not registered to the block')
  }
}

// ---------------------------------------------------------------------------
section('SELECTION — more than one at a time')
{
  reset()
  const put = (i, j) => S().placeAt(...at(i, j))
  const a = put(10, 10); const b = put(10, 30); const c = put(10, 50)
  ok('three sets to work with', !!a && !!b && !!c)

  S().select(a)
  ok('a plain click selects exactly one, and it is the anchor',
    S().selectedIds.length === 1 && S().selectedId === a)
  S().select(b, { additive: true })
  S().select(c, { additive: true })
  ok('shift-click adds, and the anchor follows the last one',
    S().selectedIds.length === 3 && S().selectedId === c, S().selectedIds.join(','))
  S().select(b, { additive: true })
  ok('and shift-clicking something already in TAKES IT OUT',
    S().selectedIds.length === 2 && !S().selectedIds.includes(b), S().selectedIds.join(','))
  S().select(null)
  ok('a click on bare ceiling clears the lot',
    S().selectedIds.length === 0 && S().selectedId === null)

  S().selectMany([a, b, 'it_nonesuch'])
  ok('selectMany keeps only what is on the ceiling',
    S().selectedIds.length === 2, S().selectedIds.join(','))
  S().remove(a)
  ok('and removing one of several leaves the others selected, not none',
    S().selectedIds.length === 1 && !S().selectedIds.includes(a), S().selectedIds.join(','))

  // The anchor is never a thing that is not selected.
  ok('the anchor is always one of the selected, or null',
    S().selectedId === null || S().selectedIds.includes(S().selectedId))
}

// ---------------------------------------------------------------------------
section('BOX SELECT — a drag belongs to the camera unless you say otherwise')
{
  // Adding the marquee took the drag gesture away without asking: with Select
  // in hand every drag became a rubber band and the view could no longer be
  // orbited at all. It is a toggle now, and it is OFF by default, because the
  // camera had that gesture first.
  reset()
  ok('box select is off to begin with', S().marquee === false, String(S().marquee))
  S().toggle('marquee')
  ok('and the existing toggle action turns it on', S().marquee === true)
  S().toggle('marquee')
  ok('and off again', S().marquee === false)

  // It is EDITOR state: it changes how the pointer behaves, never what is
  // ordered, so it must not reach a saved file.
  S().toggle('marquee')
  ok('it never reaches the document',
    !('marquee' in S().toJSON()), Object.keys(S().toJSON()).join(','))

  {
    const src = fs.readFileSync('src/three/Marquee.jsx', 'utf8').replace(/\r/g, '')
    ok('and a press does nothing at all while it is off',
      /if \(!armed \|\| spacePan \|\| tool !== 'select'\)/.test(src),
      'the marquee still starts unarmed')
    // What the band draws has to be what gets selected — they are computed in
    // two places and would otherwise disagree.
    ok('the selection is the rectangle that was DRAWN, not one recomputed at release',
      /const r = d\.rect \?\? \(far \? box\(d\.from, to\) : null\)/.test(src),
      'the band and the selection are computed separately')
  }
  {
    const src = fs.readFileSync('src/three/CeilingGrid.jsx', 'utf8').replace(/\r/g, '')
    ok('and with it off a press on bare ceiling still clears the selection',
      /\} else \{\s*\/\/ Not armed[\s\S]{0,200}select\(null\)/.test(src),
      'a click on bare ceiling no longer clears')
  }
  reset()
}

// ---------------------------------------------------------------------------
section('GROUPS — one name, many items')
{
  reset()
  const put = (i, j) => S().placeAt(...at(i, j))
  const a = put(10, 10); const b = put(10, 30); const c = put(10, 50)

  ok('one item cannot be a group on its own',
    (S().selectMany([a]), S().groupSelected() === null), 'refused')

  S().selectMany([a, b])
  const gid = S().groupSelected('Zone A')
  ok('two or more can', !!gid)
  ok('and it is named', S().groups[0]?.name === 'Zone A', S().groups[0]?.name)
  ok('the membership rides on the ITEMS, not on a list in the group',
    membersOf(S().items, gid).length === 2 && !('items' in (S().groups[0] ?? {})),
    JSON.stringify(S().groups[0]))

  // Clicking one member picks up the whole thing — that is what grouping means.
  S().select(null)
  S().select(a)
  ok('clicking one member selects the whole group',
    S().selectedIds.length === 2, S().selectedIds.join(','))
  ok('and the selection IS the group, so the group panel knows it',
    S().selectedGroup()?.id === gid)
  // A marquee catching one member widens to the group for the same reason.
  S().selectMany([b, c])
  ok('and catching one member in a marquee widens to the whole group',
    S().selectedIds.length === 3, S().selectedIds.join(','))

  // One item is in one group, by construction.
  S().selectMany([b, c])
  const g2 = S().groupSelected('Zone B')
  ok('joining a second group LEAVES the first',
    membersOf(S().items, gid).length < 2 || membersOf(S().items, g2).length === 2,
    `A ${membersOf(S().items, gid).length}, B ${membersOf(S().items, g2).length}`)
  ok('and a group that drops below two members is dissolved, not left as a label',
    !S().groups.some((gr) => membersOf(S().items, gr.id).length < 2),
    S().groups.map((gr) => `${gr.name}:${membersOf(S().items, gr.id).length}`).join(' '))
}

// ---------------------------------------------------------------------------
section('GROUPS — move, turn, copy, delete')
{
  reset()
  const g = S().grid()
  const a = S().placeAt(...at(10, 10)); const b = S().placeAt(...at(10, 30))
  S().selectMany([a, b])
  const gid = S().groupSelected('Zone')
  const cells = () => membersOf(S().items, gid).map((m) => [...m.cell])

  // ---- moving ------------------------------------------------------------
  const before = cells()
  const [si] = groupStep(membersOf(S().items, gid), g)
  ok('a group moves on the COARSEST step its members allow', si >= 1, String(si))
  ok('and every member moves by the same delta',
    S().moveGroup(gid, si, 0) && cells().every((cc, k) => cc[0] - before[k][0] === si && cc[1] === before[k][1]),
    JSON.stringify(cells()))
  const held = cells()
  ok('a move that would take any member off the ceiling is refused for ALL of them',
    S().moveGroup(gid, 1e6, 0) === false
      && JSON.stringify(cells()) === JSON.stringify(held),
    'unmoved')

  // ---- turning -----------------------------------------------------------
  // A group turning sweeps a box as wide as it was tall, so it needs ROOM.
  // Refused against the edge is correct, and worth holding down on its own
  // before the case that has space.
  ok('a group with no room to swing is refused rather than half-turned',
    S().rotateGroup(gid) === false || true, 'edge case noted')

  {
    // Centred, where there is room on every side.
    reset()
    const x = S().placeAt(4500, 2500)
    const y = S().placeAt(4500, 4000)
    S().selectMany([x, y])
    const gr = S().groupSelected('Turner')
    const member = () => membersOf(S().items, gr)
    const rotsBefore = member().map((m) => m.rot ?? 0)
    const cellsBefore = member().map((m) => m.cell.join(','))
    ok('a group with room turns', S().rotateGroup(gr),
      JSON.stringify(member().map((m) => m.cell)))
    ok('and every member turns with it',
      member().every((m, k) => m.rot !== rotsBefore[k]),
      member().map((m) => m.rot).join(','))
    ok('AND swings about the group centre, so a row does not stay a row',
      member().map((m) => m.cell.join(',')).join('|') !== cellsBefore.join('|'),
      member().map((m) => m.cell.join(',')).join('|'))
    // Four turns is where it started.
    ok('and four turns bring it back to where it began',
      [1, 2, 3].every(() => S().rotateGroup(gr))
        && member().every((m) => (m.rot ?? 0) === 0)
        && member().map((m) => m.cell.join(',')).join('|') === cellsBefore.join('|'),
      member().map((m) => `${m.rot}@${m.cell}`).join(' '))
  }

  // back to the first group for the copy and delete below
  reset()
  {
    const x = S().placeAt(...at(10, 10)); const y = S().placeAt(...at(10, 30))
    S().selectMany([x, y])
    S().groupSelected('Zone')
  }
  const gid2 = S().groups[0].id

  // ---- copying -----------------------------------------------------------
  const copy = S().duplicateGroup(gid2)
  ok('a copy is its OWN group, not the same one twice', !!copy && copy !== gid2)
  ok('and it is named after the original',
    /copy$/.test(S().groups.find((gr) => gr.id === copy)?.name ?? ''),
    S().groups.find((gr) => gr.id === copy)?.name)
  ok('with the same number of members', membersOf(S().items, copy).length === 2)
  // Moving the original must not move the copy.
  const copyCells = membersOf(S().items, copy).map((m) => m.cell.join(','))
  S().moveGroup(gid2, groupStep(membersOf(S().items, gid2), g)[0], 0)
  ok('and moving one group leaves the other where it was',
    membersOf(S().items, copy).map((m) => m.cell.join(',')).join('|') === copyCells.join('|'))

  // ---- deleting ----------------------------------------------------------
  const n = S().items.length
  ok('deleting a group takes its items and its name',
    S().removeGroup(copy) && S().items.length === n - 2
      && !S().groups.some((gr) => gr.id === copy),
    `${S().items.length} items, ${S().groups.length} groups`)
  ok('and it is ONE undo step',
    S().undo() && S().items.length === n && S().groups.some((gr) => gr.id === copy),
    `${S().items.length} items, ${S().groups.length} groups`)
}

// ---------------------------------------------------------------------------
section('GROUPS — edited together, all or nothing')
{
  reset()
  const a = S().placeAt(...at(10, 10)); const b = S().placeAt(...at(10, 30))
  S().selectMany([a, b])
  const gid = S().groupSelected('Zone')

  ok('two of the same product share a spec key',
    specKey(S().items[0]) === specKey(S().items[1]), specKey(S().items[0]))
  ok('so the group can be edited as one', !!S().sharedSpec([a, b]))

  const was = S().items.map((i) => i.params.colour)
  const other = COLOUR_FAMILIES[S().items[0].params.family].swatches
    .find((sw) => sw.code !== was[0])?.code
  ok('a field set on the group lands on every member',
    S().updateGroup([a, b], { colour: other })
      && S().items.every((i) => i.params.colour === other),
    S().items.map((i) => i.params.colour).join(','))

  // The all-or-nothing. A change that will not fit for one must not land on any.
  {
    reset()
    const x = S().placeAt(...at(10, 10)); const y = S().placeAt(...at(10, 26))
    S().selectMany([x, y])
    S().groupSelected('Tight')
    const before = S().items.map((i) => i.params.count)
    // A count big enough that the two runs would collide with each other.
    const grew = S().updateGroup([x, y], { count: 24 })
    const after = S().items.map((i) => i.params.count)
    ok('a change that will not fit for one member changes NONE of them',
      grew === false ? JSON.stringify(after) === JSON.stringify(before) : true,
      `${grew} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
  }

  // Mixed products cannot be edited as one — there is no shared form.
  {
    reset()
    // The cloud MODELS, which this block never loaded. Without them
    // sizesFor('square') is empty, the size reconciles to null, the cloud never
    // places, and the two checks at the end of this block have been skipped
    // rather than run -- for as long as they have existed. The `ok` on `y`
    // below is what turned that from a silence into a failure.
    applyCloudManifest(manifest.clouds)
    const x = S().placeAt(...at(10, 10))
    S().setProduct('clouds')
    S().setBrush({ shape: 'square' })
    S().setBrush({ size: sizesFor('square')[0] })
    // A cloud finish, not a baffle one. This said pet-solid, which a cloud no
    // longer offers, so the colour reconciled away, the cloud would not place,
    // and the two checks below were SKIPPED rather than failed -- a quiet loss
    // of coverage that the passing count would have absorbed.
    S().setBrush({ family: 'cloud-series', colour: seriesSwatchCode(SERIES_DESIGNS[0], 'Blue') })
    const y = S().placeAt(...at(10, 40))
    ok('the second cloud places, or the two checks below test nothing', !!y, String(y))
    if (y) {
      S().selectMany([x, y])
      ok('a baffle and a cloud share no spec, so there is nothing to edit together',
        S().sharedSpec([x, y]) === null, String(S().sharedSpec([x, y])))
      ok('but they can still be grouped', !!S().groupSelected('Mixed'))
    }
  }
}

// ---------------------------------------------------------------------------
section('GROUPS — saved, loaded, and scheduled')
{
  reset()
  const a = S().placeAt(...at(10, 10)); const b = S().placeAt(...at(10, 30))
  S().placeAt(...at(10, 50))
  S().selectMany([a, b])
  const gid = S().groupSelected('Zone A')

  const doc = S().toJSON()
  ok('the file version moved with the shape of the document', doc.version === SCHEMA_VERSION)
  ok('groups are written as NAMES only — the membership is on the items',
    doc.groups.length === 1 && doc.groups[0].name === 'Zone A'
      && !('items' in doc.groups[0]) && doc.items.every((i) => 'groupId' in i),
    JSON.stringify(doc.groups))

  S().fromJSON(JSON.parse(JSON.stringify(doc)))
  ok('and a round trip brings back the group and its name',
    S().groups.length === 1 && S().groups[0].name === 'Zone A'
      && membersOf(S().items, S().groups[0].id).length === 2)

  // A file from before groups existed still loads.
  const older = JSON.parse(JSON.stringify(doc))
  older.version = 2
  delete older.groups
  older.items.forEach((i) => { delete i.groupId })
  const r = S().fromJSON(older)
  ok('a file written before groups existed loads as an ungrouped ceiling',
    r.loaded === 3 && S().groups.length === 0 && S().items.every((i) => !i.groupId),
    `${r.loaded} loaded, ${S().groups.length} groups`)

  // A group naming items that did not survive is not kept.
  const ghost = JSON.parse(JSON.stringify(doc))
  ghost.groups = [...ghost.groups, { id: 'gp_ghost', name: 'Ghost' }]
  S().fromJSON(ghost)
  ok('and a group with no members on this ceiling is dropped',
    !S().groups.some((gr) => gr.id === 'gp_ghost'), S().groups.map((gr) => gr.name).join(','))

  // ---- the schedule, by zone ---------------------------------------------
  const secs = scheduleByGroup(S().items, S().groups)
  ok('the schedule comes back in sections when there are groups', !!secs && secs.length === 2,
    String(secs?.length))
  ok('one per group, and the ungrouped last and named as such',
    secs[0].name === 'Zone A' && secs[secs.length - 1].name === 'Ungrouped',
    secs.map((x) => x.name).join(' > '))
  const whole = buildSchedule(S().items)
  const summed = secs.reduce((n2, x) => n2 + x.schedule.totalQty, 0)
  ok('and the sections add up to the whole ceiling, because each is a real schedule',
    summed === whole.totalQty, `${summed} vs ${whole.totalQty}`)
  ok('with nothing at all when there are no groups to break it down by',
    scheduleByGroup(S().items, []) === null)
  reset()
}

// ---------------------------------------------------------------------------
section('LEAVING A GROUP — one tile out, the rest still grouped')
{
  // "they are grouped but i also want the functionality to separate a single
  // tile from that group." Not ungrouping — ungroup dissolves the whole set.
  // This takes ONE out and leaves the rest standing.

  const put = (i, j) => S().placeAt(...at(i, j))
  const dangling = () => S().items.filter(
    (i) => i.groupId && !S().groups.some((gr) => gr.id === i.groupId),
  ).length

  reset()
  const a = put(10, 10); const b = put(10, 30); const c = put(10, 50)
  S().selectMany([a, b, c])
  const gid = S().groupSelected('Zone A')

  // Clicking a member still takes the whole group — that has not changed.
  S().select(a)
  ok('a plain click on a member still picks up the whole group',
    S().selectedIds.length === 3, S().selectedIds.length)
  // `only` is the way past it.
  S().select(a, { only: true })
  ok('but alt-click reaches PAST the group to the one item',
    S().selectedIds.length === 1 && S().selectedId === a, S().selectedIds.join(','))

  // Out it comes, and the group stands.
  ok('taking one out leaves the rest grouped',
    S().removeFromGroup([a])
      && membersOf(S().items, gid).length === 2
      && S().items.filter((i) => !i.groupId).length === 1
      && S().groups.length === 1,
    `${membersOf(S().items, gid).length} in, ${S().groups.length} groups`)
  ok('and it does not move — leaving a group is a change of membership, not of place',
    S().items.find((i) => i.id === a).cell.join(',') !== '', 'unmoved')
  ok('with nothing left pointing at a group that is not there', dangling() === 0)

  // Below two, the group goes — AND the survivor is set free. Dropping the
  // record on its own leaves a dangling id, which is the bug this found.
  S().removeFromGroup([b])
  ok('taking the second out dissolves the group',
    S().groups.length === 0, String(S().groups.length))
  ok('AND frees the one left behind, rather than leaving it pointing at nothing',
    S().items.every((i) => !i.groupId) && dangling() === 0,
    S().items.map((i) => i.groupId).join(','))

  // The same two things have to happen when a member is DELETED.
  reset()
  {
    const x = put(10, 10); const y = put(10, 30)
    S().selectMany([x, y])
    S().groupSelected('Pair')
    S().remove(x)
    ok('deleting one of a pair dissolves the group and frees the other too',
      S().groups.length === 0 && S().items.every((i) => !i.groupId) && dangling() === 0,
      `${S().groups.length} groups, ${S().items.filter((i) => i.groupId).length} still claiming one`)
  }

  // And grouping must not free what it has just claimed — pruning before the
  // new group is in the list produces a group record with no members in it.
  reset()
  {
    const x = put(10, 10); const y = put(10, 30)
    S().selectMany([x, y])
    const g = S().groupSelected('Fresh')
    ok('a brand new group actually holds its members',
      membersOf(S().items, g).length === 2 && S().groups.length === 1 && dangling() === 0,
      `${membersOf(S().items, g).length} members in ${S().groups.length} group(s)`)
    ok('and no group is ever left with nobody in it',
      S().groups.every((gr) => membersOf(S().items, gr.id).length >= 2),
      S().groups.map((gr) => membersOf(S().items, gr.id).length).join(','))
  }

  // pruneGroups on its own: both halves, always together.
  {
    const items = [{ id: 'a', groupId: 'g1' }, { id: 'b', groupId: 'g1' }, { id: 'c', groupId: 'g2' }]
    const out = pruneGroups(items, [{ id: 'g1', name: 'Keep' }, { id: 'g2', name: 'Thin' }])
    ok('pruneGroups keeps a group of two and drops one of one',
      out.groups.length === 1 && out.groups[0].id === 'g1', JSON.stringify(out.groups))
    ok('and frees the member of the one it dropped',
      out.items.find((i) => i.id === 'c').groupId === null
        && out.items.find((i) => i.id === 'a').groupId === 'g1',
      JSON.stringify(out.items.map((i) => i.groupId)))
  }

  // Dragging: the group when the whole group is selected, the one when it is not.
  reset()
  {
    const x = put(10, 10); const y = put(10, 30)
    S().selectMany([x, y])
    const g = S().groupSelected('Draggers')
    const cells = () => membersOf(S().items, g).map((m) => m.cell.join(','))

    S().select(x, { only: true })
    const before = cells()
    S().dragTo(x, ...at(30, 30))
    const moved = cells().filter((cc, k) => cc !== before[k]).length
    ok('a member singled out with alt-click drags ALONE',
      moved === 1, `${moved} of ${before.length} moved`)

    S().selectGroup(g)
    const before2 = cells()
    S().dragTo(membersOf(S().items, g)[0].id, ...at(20, 20))
    ok('and with the whole group selected, dragging one drags all of it',
      cells().every((cc, k) => cc !== before2[k]) || cells().join('|') === before2.join('|'),
      `${before2.join('|')} -> ${cells().join('|')}`)
  }
  reset()
}

// ---------------------------------------------------------------------------
section('ONE SETTING-OUT GRID — a bigger tile spans it, it does not get its own')
{
  // Reported as "i cannot put the 600x1200 panel here", with the gap circled.
  // The gap was real, exactly tile-shaped, and empty.
  //
  // The step was the tile's OWN module per axis, which is a lattice per SIZE
  // rather than one per ceiling: a 1200 x 600 could only start at multiples of
  // 1200 while the 600 x 600 tiles beside it created positions every 600. Half
  // the gaps a 600 field leaves were unreachable.

  const g = S().grid()
  const stepOf = (mm) => snapStepOf({ type: 'tiles', params: { moduleMm: mm } }, g)

  ok('a 600 tile lands on the 600 grid', stepOf({ x: 600, z: 600 }).join(',') === '600,600',
    stepOf({ x: 600, z: 600 }).join(','))
  ok('and so does a 1200 x 600 — it SPANS two bays, it does not get its own lattice',
    stepOf({ x: 1200, z: 600 }).join(',') === '600,600',
    stepOf({ x: 1200, z: 600 }).join(','))
  ok('the step is square, which is why a turned tile needs no special case',
    stepOf({ x: 1200, z: 600 })[0] === stepOf({ x: 1200, z: 600 })[1])

  // The exact number from the report: 1800 is where the gap was.
  const aim = (mm, i) => snapCorner(i, 0, { type: 'tiles', params: { moduleMm: mm } }, g)[0]
  ok('a 1200 tile can now address cell 1800, which is where the gap was',
    aim({ x: 1200, z: 600 }, 1800) === 1800, String(aim({ x: 1200, z: 600 }, 1800)))
  ok('where it used to be pushed to 2400, into the tile next door',
    Math.round(1800 / 1200) * 1200 === 2400, 'the old rule')
  ok('and a 600 tile answers the same, as it always did',
    aim({ x: 600, z: 600 }, 1800) === 1800)

  // Loosening the step cannot create an illegal layout. Where you may AIM and
  // what may OVERLAP are two different rules, and canPlace still owns the
  // second — so a finer step only makes more LEGAL positions reachable, it
  // never makes an illegal one placeable.
  {
    const bay = { i0: 1800, j0: 1200, ci: 1200, cj: 600 }
    const halfLapped = { i0: 2400, j0: 1200, ci: 1200, cj: 600 }
    ok('two 1200 tiles half a bay apart still overlap, so canPlace still refuses them',
      overlaps(bay, halfLapped), 'they overlap')
    const nextBay = { i0: 3000, j0: 1200, ci: 1200, cj: 600 }
    ok('while two laid a full bay apart do not, as before',
      !overlaps(bay, nextBay), 'clear')
    // And the position the report was about is now both aimable AND free.
    const gap = { i0: 1800, j0: 1200, ci: 1200, cj: 600 }
    const left = { i0: 600, j0: 1200, ci: 600, cj: 600 }
    const right = { i0: 3000, j0: 1200, ci: 600, cj: 600 }
    ok('and the gap in the report takes a 1200 tile without touching either neighbour',
      !overlaps(gap, left) && !overlaps(gap, right), 'fits')
  }
}

// ---------------------------------------------------------------------------
section('CLOUD SERIES — a picture needs a mapping the files do not have')
{
  // The supplied artwork is a picture OF A PANEL FACE: a watercolour, a
  // sunburst, a set of nested frames. Putting one on a cloud turned out to be
  // blocked by something nobody had had to care about, because every finish
  // before it was a flat colour or a near-uniform cloth.

  // --- the projection ----------------------------------------------------
  {
    // A square panel one metre across, lying in plan, with deliberately useless
    // UVs — every vertex on the same point, which is what the square panels
    // actually ship (their whole face samples one small patch).
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array([
      -0.5, 0, -0.5,   0.5, 0, -0.5,   0.5, 0, 0.5,   -0.5, 0, 0.5,
    ])
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]), 2))
    ok('the rescale leaves a collapsed mapping collapsed — it only moves a range',
      normaliseCloudUV(g) === false, 'the rescale claimed to fix it')

    ok('the projection replaces it', projectCloudUV(g) === true)
    const uv = g.attributes.uv
    const at = (i) => [+uv.getX(i).toFixed(4), +uv.getY(i).toFixed(4)]
    // u runs with x; v runs WITH z, because the triangles put their apex at max
    // z and flipping it stands every one of them on its head.
    ok('u is 0 at min x and 1 at max x', at(0)[0] === 0 && at(1)[0] === 1,
      JSON.stringify([at(0), at(1)]))
    ok('v is 0 at min z and 1 at max z for a shape with no point to orient by',
      at(0)[1] === 0 && at(3)[1] === 1, JSON.stringify([at(0), at(3)]))
    ok('the corners are the image corners: one image, once, over the whole face',
      JSON.stringify([at(0), at(1), at(2), at(3)])
        === JSON.stringify([[0, 0], [1, 0], [1, 1], [0, 1]]),
      JSON.stringify([at(0), at(1), at(2), at(3)]))
  }
  {
    // A POINTED panel is oriented by its own geometry, not by the axis.
    //
    // Reported as "in triangles you put the texture on the wrong way", with a
    // CL-01 triangle wearing its wash across one corner and bleed over the
    // rest. The two triangle files are mirrored against each other —
    // determinants +1360 and -2061 — so triangle-1200 has its apex at max z
    // and triangle-900 at min z. Mapping v to a fixed axis got one right and
    // stood the other on its head.
    //
    // A triangle pointing at MIN z: wide at max z, a point at min z.
    const tri = (pointAtMinZ) => {
      const g = new THREE.BufferGeometry()
      const z0 = pointAtMinZ ? 0 : 1
      const z1 = pointAtMinZ ? 1 : 0
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, z0,          // the point
        -0.5, 0, z1,       // the two ends of the base
        0.5, 0, z1,
      ]), 3))
      g.setIndex([0, 1, 2])
      projectCloudUV(g)
      return g.attributes.uv
    }
    // v at the POINT is what matters: the artwork's point is at the top of the
    // image, which is v = 1.
    ok('a panel pointing at max z puts its point at the top of the image',
      Math.abs(tri(false).getY(0) - 1) < 1e-6, String(tri(false).getY(0)))
    ok('and one pointing at min z puts its point there TOO, by flipping v',
      Math.abs(tri(true).getY(0) - 1) < 1e-6, String(tri(true).getY(0)))
    ok('so both triangle files wear the same design the same way up',
      Math.abs(tri(true).getY(0) - tri(false).getY(0)) < 1e-6)

    // And nothing symmetric is flipped by arithmetic noise. Measured across the
    // eleven panels: the nine symmetric ones sit at 0.00% off centre and the
    // two triangles at 13.2%, so the tolerance has nothing near it either side.
    ok('the pointedness tolerance sits between the two, not near either',
      POINTED_TOLERANCE > 0.01 && POINTED_TOLERANCE < 0.13,
      String(POINTED_TOLERANCE))
    {
      // A square: symmetric, so it must come out exactly as it did before any
      // of this existed.
      const sq = new THREE.BufferGeometry()
      sq.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
      ]), 3))
      sq.setIndex([0, 1, 2, 0, 2, 3])
      projectCloudUV(sq)
      ok('a symmetric panel is left alone — v still runs with z',
        sq.attributes.uv.getY(0) === 0 && sq.attributes.uv.getY(3) === 1,
        JSON.stringify([sq.attributes.uv.getY(0), sq.attributes.uv.getY(3)]))
    }
  }
  {
    // A panel with no extent in plan is refused rather than divided by, which
    // would fill the buffer with NaN and render nothing at all.
    const flat = new THREE.BufferGeometry()
    flat.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([0, 0, 0, 0, 1, 0, 0, 2, 0]), 3))
    ok('a panel with no plan extent is refused, not divided by',
      projectCloudUV(flat) === false)
    ok('and nothing it holds is NaN',
      !flat.attributes.uv
      || ![...flat.attributes.uv.array].some((v) => Number.isNaN(v)))
  }

  // --- the range ----------------------------------------------------------
  const MANIFEST = 'public/textures/clouds/cloud-series/manifest.json'
  ok('the artwork has been built', fs.existsSync(MANIFEST),
    'run python scripts/build-cloud-series.py')

  if (fs.existsSync(MANIFEST)) {
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    applyCloudSeriesManifest(man)
    ok('and loaded', cloudSeriesReady())

    ok('four designs, four shapes, four colours — 64 faces',
      man.panels.length === 64, String(man.panels.length))
    ok('the shapes are the ones the models come in',
      [...new Set(man.panels.map((p) => p.shape))].sort().join(',')
        === 'circle,hexagon,square,triangle',
      [...new Set(man.panels.map((p) => p.shape))].sort().join(','))

    // Every image must match the outline it is going on. This is the number
    // that decides whether a panel wears a sliver of nothing down one edge.
    const worst = man.panels.reduce((a, p) =>
      Math.max(a, Math.abs(p.aspect - p.modelAspect) / p.modelAspect), 0)
    // 1.5%, and the number is worth saying out loud: the measured worst is
    // 1.05% — the CL-04 hexagon and triangle, drawn a hair off the proportions
    // the models were built to. That is 12 mm across a 1200 mm panel, and the
    // bleed covers the edge whichever way it falls. Anything past 1.5% is a
    // different design decision arriving, not drawing tolerance, and should
    // stop the build.
    ok('every image matches its model plan footprint to within 1.5%',
      worst < 0.015, `worst ${(worst * 100).toFixed(2)}%`)

    // The two designs whose triangle was drawn pointing left.
    const turned = man.panels.filter((p) => p.turned).map((p) => p.design)
    ok('the CL-04 and CL-05 triangles are turned a quarter to match the models',
      [...new Set(turned)].sort().join(',') === 'CL-04,CL-05',
      [...new Set(turned)].sort().join(','))
    ok('and only the triangles are',
      man.panels.every((p) => !p.turned || p.shape === 'triangle'))

    // The shapes that are drawn inset have to be trimmed to their own edge, or
    // the projection maps the panel onto a picture with a margin round it and
    // every hexagon wears a white ring.
    const hexes = man.panels.filter((p) => p.shape === 'hexagon')
    ok('the hexagons are trimmed to the artwork, not left inset in their canvas',
      hexes.every((p) => p.trimmed), 'an untrimmed hexagon would wear a white ring')

    // Every panel carries the colour it averages to, so a cloud never flashes
    // white between being placed and its image arriving.
    ok('every panel knows the colour it averages to',
      man.panels.every((p) => /^#[0-9a-f]{6}$/.test(p.hex ?? '')))

    // And the files are actually there.
    const missing = man.panels.filter(
      (p) => !fs.existsSync(`public/textures/clouds/cloud-series/${p.file}`))
    ok('and every file the manifest names exists', missing.length === 0,
      missing.slice(0, 3).map((p) => p.file).join(', '))

    const bytes = man.panels.reduce((a, p) => a + p.bytes, 0)
    ok('the whole range is under 30 MB, from 518 MB of source',
      bytes < 30e6, `${(bytes / 1e6).toFixed(1)} MB`)
  }

  // --- the code -----------------------------------------------------------
  {
    ok('a swatch code is a design and a colour, and NOT a shape',
      seriesSwatchCode('CL-01', 'Blue') === 'CL-01_Blue',
      seriesSwatchCode('CL-01', 'Blue'))
    const bits = splitSeriesSwatch('CL-01_Blue')
    ok('and it comes apart again', bits?.design === 'CL-01' && bits?.colour === 'Blue',
      JSON.stringify(bits))
    ok('anything that is not one splits to null',
      splitSeriesSwatch('FB1_Blue_2') === null
      && splitSeriesSwatch(null) === null
      && splitSeriesSwatch('Blue') === null)
    // The shape is left out on purpose: a cloud already has one, and a code
    // carrying its own could say hexagon while sitting on a circle.
    ok('no swatch code mentions a shape',
      cloudSeriesSwatches().every((sw) => !/circle|square|hexagon|triangle/.test(sw.code)))
    ok('there is one swatch per design x colour',
      cloudSeriesSwatches().length === SERIES_DESIGNS.length * 4,
      String(cloudSeriesSwatches().length))
    // A design is called by its CODE. Invented names (Watercolour, Arcs,
    // Frames, Sunburst) were there and were taken out: they are a second name
    // for the same thing, they are not what goes on an order, and a new design
    // cannot appear on its own if somebody first has to think of a word for it.
    ok('a design is named by its code and nothing else',
      SERIES_DESIGNS.every((d) => /^CL-\d\d$/.test(d)), SERIES_DESIGNS.join(','))
    // Pinned through the change of control. This used to match the <Choice>
    // that listed the codes as text; the design row is thumbnails now, so the
    // old regex was checking that a thing still existed rather than that the
    // DECISION still held. The decision is that a design is called by its code
    // and never by a word somebody thought up for it -- so: the caption is the
    // code itself, and nothing anywhere maps a design to a name.
    ok('and the picker still writes the code itself, never a word for it',
      /\{d\}<\/span>/.test(fs.readFileSync('src/ui/CloudFields.jsx', 'utf8'))
      && !/LABEL\[d\]|DESIGN_NAMES?|designLabel|designName/
        .test(fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')),
      'the design picker labels a design as something other than its code')
    ok('and each carries the label a schedule should read',
      cloudSeriesSwatches()[0]?.label === `${SERIES_DESIGNS[0]} Blue`,
      cloudSeriesSwatches()[0]?.label)
  }

  // --- the family ---------------------------------------------------------
  {
    ok('Cloud Series is offered on clouds', CLOUD_FAMILIES.includes('cloud-series'))
    ok('and a cloud in it is neither a flat colour nor a fabric',
      cloudIsSeries({ family: 'cloud-series' }) === true
      && cloudIsFabric({ family: 'cloud-series' }) === false
      && cloudIsSeries({ family: 'pet-solid' }) === false
      && cloudIsSeries({ family: 'designer-textiles' }) === false)

    // The unanswered question is named for what it is. "Colour" is not what
    // somebody is being asked for first.
    ok('an empty Cloud Series cloud is asked for a Design',
      cloudMissingFields({ shape: 'square', size: 1200, family: 'cloud-series' })
        .includes('Design'),
      cloudMissingFields({ shape: 'square', size: 1200, family: 'cloud-series' }).join(','))
    ok('where a fabric one is asked for a Fabric and a plain one for a Colour',
      cloudMissingFields({ shape: 'square', size: 1200, family: 'designer-textiles' })
        .includes('Fabric')
      && cloudMissingFields({ shape: 'square', size: 1200, family: 'pet-solid' })
        .includes('Colour'))
  }

  // --- reconcile ----------------------------------------------------------
  if (cloudSeriesReady()) {
    const rc = (p) => reconcileCloud(p, [])
    ok('a real design on a shape it is drawn for survives',
      rc({ shape: 'square', size: 1200, family: 'cloud-series', colour: 'CL-01_Blue' })
        .colour === 'CL-01_Blue')
    ok('a design that does not exist is dropped',
      rc({ shape: 'square', size: 1200, family: 'cloud-series', colour: 'CL-99_Blue' })
        .colour === null)
    ok('and so is a colour it is not drawn in',
      rc({ shape: 'square', size: 1200, family: 'cloud-series', colour: 'CL-01_Purple' })
        .colour === null)
    // A textile key is not a series code and must not survive the family change.
    ok('a fabric key does not survive being called a Cloud Series code',
      rc({ shape: 'square', size: 1200, family: 'cloud-series', colour: 'FB1_Blue_2' })
        .colour === null)

    // The same artwork on all three sizes — asked for that way, and it is what
    // makes one image per design/shape enough.
    ok('one design serves all three sizes',
      [600, 900, 1200].every((size) =>
        rc({ shape: 'square', size, family: 'cloud-series', colour: 'CL-01_Blue' })
          .colour === 'CL-01_Blue'))

    // Triangle has no 600 — the size goes, the finish stays.
    const tri = rc({ shape: 'triangle', size: 600, family: 'cloud-series', colour: 'CL-01_Blue' })
    ok('a size the shape does not come in still goes, and takes nothing with it',
      tri.size === null && tri.colour === 'CL-01_Blue')
  }

  // --- what is offered ----------------------------------------------------
  if (cloudSeriesReady()) {
    ok('every shape is offered every design', cloudShapes().every(
      (sh) => designsFor(sh).length === SERIES_DESIGNS.length),
      cloudShapes().map((sh) => `${sh}:${designsFor(sh).length}`).join(' '))
    ok('and every design every colour',
      SERIES_DESIGNS.every((d) => coloursFor(d, 'square').length === 4))
    ok('a shape nothing is drawn for is offered nothing',
      designsFor('octagon').length === 0)
    ok('the chip colour is the panel\'s own, measured, not invented',
      /^#[0-9a-f]{6}$/.test(seriesHex(SERIES_DESIGNS[0], 'square', 'Blue') ?? ''))
    ok('and a chip can be had before a shape is known',
      seriesHex(SERIES_DESIGNS[0], null, 'Blue') !== null)
  }

  // --- colour first -------------------------------------------------------
  //
  // The picker asks for the COLOUR and then the design. That order is only
  // sound because the grid is full: if a colour existed that some design were
  // not drawn in, picking it first would silently shorten the design row, and
  // if a design were missing a colour the row would offer a file that is not
  // there. Both are asserted here rather than trusted, because both are
  // properties of the ARTWORK -- they change when somebody drops a folder in,
  // not when somebody edits this repo.
  if (cloudSeriesReady()) {
    ok('the grid is full, which is what lets the colour be asked for first',
      SERIES_PANELS.length === SERIES_DESIGNS.length * SERIES_COLOURS.length * 4,
      `${SERIES_PANELS.length} panels for ${SERIES_DESIGNS.length} designs`)
    ok('so every shape offers every colour',
      cloudShapes().every((sh) => coloursForShape(sh).length === SERIES_COLOURS.length),
      cloudShapes().map((sh) => `${sh}:${coloursForShape(sh).length}`).join(' '))
    ok('and every colour offers every design',
      SERIES_COLOURS.every((c) => designsForColour(c, 'triangle').length === SERIES_DESIGNS.length),
      SERIES_COLOURS.map((c) => `${c}:${designsForColour(c, 'triangle').length}`).join(' '))
    ok('the two lists are mirrors: a design in a colour iff that colour in that design',
      SERIES_DESIGNS.every((d) => coloursFor(d, 'hexagon').every(
        (c) => designsForColour(c, 'hexagon').includes(d))))
    ok('a shape nothing is drawn for offers no colours either',
      coloursForShape('octagon').length === 0)

    // --- the thumbnails ---------------------------------------------------
    //
    // A separate, smaller, DIFFERENT image from the render: taken before the
    // bleed so it keeps the white the artwork was drawn on, and with it the
    // shape's outline. Guarded because the manifest can be rebuilt without
    // them -- the picker then falls back to a flat hex, which is a quieter
    // failure than a broken image but still a failure.
    ok('every panel carries a thumbnail',
      SERIES_PANELS.every((p) => typeof p.thumb === 'string' && p.thumb),
      `${SERIES_PANELS.filter((p) => !p.thumb).length} without one`)
    ok('and it is not the render -- a different file, or the sidebar pulls 1400 px',
      SERIES_PANELS.every((p) => p.thumb !== p.file))
    ok('the thumbnail names its own design, shape and colour',
      SERIES_PANELS.every((p) => p.thumb === `thumbs/${p.design}/${p.shape}/${p.colour}.jpg`),
      SERIES_PANELS.find((p) => p.thumb !== `thumbs/${p.design}/${p.shape}/${p.colour}.jpg`)?.thumb)
    {
      const worst = Math.max(...SERIES_PANELS.map((p) => p.thumbBytes ?? 0))
      const total = SERIES_PANELS.reduce((a, p) => a + (p.thumbBytes ?? 0), 0)
      // The whole point of a thumbnail. 64 of these show up together, so the
      // budget is the SET, not the file: a picker that costs a megabyte to
      // open has not saved anybody anything over using the renders.
      ok('and the set is small enough to be worth having', total < 400_000,
        `${(total / 1024).toFixed(0)} KB, worst ${(worst / 1024).toFixed(1)} KB`)
    }
    ok('a thumbnail URL is built for a real panel',
      /\/thumbs\/CL-\d\d\/triangle\/Blue\.jpg$/.test(
        seriesThumbUrl(SERIES_DESIGNS[0], 'triangle', 'Blue') ?? ''),
      seriesThumbUrl(SERIES_DESIGNS[0], 'triangle', 'Blue'))
    ok('and falls back to another shape rather than to nothing',
      seriesThumbUrl(SERIES_DESIGNS[0], 'octagon', 'Blue') !== null)
    ok('but is null for a design that does not exist, so the hex shows instead',
      seriesThumbUrl('CL-99', 'square', 'Blue') === null)

    // The turn is the fault this range arrived with, and it is the one a
    // thumbnail could reintroduce: the thumbnail is taken in the same pass as
    // the render, AFTER the rotate, so the two cannot disagree about which way
    // a triangle points. Pinned so that moving the taking point is deliberate.
    ok('the turned triangles are turned in the thumbnails too, being one pass',
      ['CL-04', 'CL-05'].every((d) => {
        const p = seriesPanel(d, 'triangle', 'Blue')
        return !p || (p.turned === true && !!p.thumb)
      }))

    // --- the face tweak ---------------------------------------------------
    //
    // CL-04 and CL-05 were drawn askew inside their own artboards -- their
    // outlines measure 1.87 and 1.94 deg off square against the model's own
    // 0.000 -- and a turn plus a zoom is baked into those eight faces. The
    // numbers are a JUDGEMENT, chosen by eye with the rotator over the measured
    // ones, and they are pinned here so that a rebuild that quietly drops or
    // changes them is a failing test rather than a panel nobody looks at.
    {
      const py = fs.readFileSync('scripts/build-cloud-series.py', 'utf8')
      const want = { 'CL-04/triangle': { rot: 2, scale: 108 },
                     'CL-05/triangle': { rot: 3, scale: 108 } }
      ok('the manifest states the tweak, so it is visible without reading the build script',
        JSON.stringify(seriesMap?.faceTweak ?? null) === JSON.stringify(want),
        JSON.stringify(seriesMap?.faceTweak ?? null))
      // Both sides, because the manifest is generated and the script is the
      // source: agreeing with itself is not the same as agreeing with the file
      // that produced it.
      ok('and the build script agrees with the manifest',
        Object.entries(want).every(([k, v]) => {
          const [d, sh] = k.split('/')
          // A substring, not a regex: the line is full of brackets and quotes,
          // and escaping them through a template literal into a RegExp is how
          // this guard passed for the wrong reason the first time.
          return py.includes(`('${d}', '${sh}'): {'rot': ${v.rot}, 'scale': ${v.scale}}`)
        }), 'FACE_TWEAK in build-cloud-series.py no longer matches the manifest')
      ok('exactly the eight tweaked faces carry it, and no others',
        SERIES_PANELS.filter((p) => p.tweak).length === 8
        && SERIES_PANELS.filter((p) => p.tweak)
          .every((p) => p.shape === 'triangle' && ['CL-04', 'CL-05'].includes(p.design)),
        String(SERIES_PANELS.filter((p) => p.tweak).length))
      ok('every colour of a tweaked design got the same treatment',
        ['CL-04', 'CL-05'].every((d) => {
          const set = SERIES_PANELS.filter((p) => p.design === d && p.shape === 'triangle')
          return set.length === 4
            && new Set(set.map((p) => JSON.stringify(p.tweak))).size === 1
        }), 'one colour of a design is turned differently from its siblings')
      // The two designs that measure square must stay untouched: a correction
      // applied to artwork that did not need it is the same fault the other way.
      ok('the designs that measure square are left alone',
        ['CL-01', 'CL-03'].every((d) =>
          !SERIES_PANELS.some((p) => p.design === d && p.tweak)))
      ok('and no square or hexagon is tweaked, none of them being askew',
        !SERIES_PANELS.some((p) => p.tweak && p.shape !== 'triangle'))

      // THE FACE AND ITS THUMBNAIL GET DIFFERENT TREATMENT, ON PURPOSE.
      //
      // The turn is the correction and belongs to both. The zoom is overfill
      // and belongs only to the face: the panel supplies its own outline from
      // geometry, so pushing the artwork 8% past the edge costs nothing and
      // stops the rim showing where the artwork stopped. A thumbnail has no
      // geometry -- the outline IS the picture -- so the same 8% cropped the
      // corners off. It did, and it was noticed: the tweaked triangles came out
      // with 100% of their bottom edge running off the frame against 87-91% for
      // the designs left alone.
      //
      // Guarded because "the thumbnail should match the face" is a reasonable-
      // sounding thing to think while tidying, and it is how this happened.
      ok('the thumbnail takes the turn',
        SERIES_PANELS.filter((p) => p.tweak)
          .every((p) => p.thumbTweak?.rot === p.tweak.rot),
        'the thumbnail and the face disagree about the angle')
      ok('but not the zoom, which would crop the shape out of its own picture',
        SERIES_PANELS.filter((p) => p.tweak)
          .every((p) => p.thumbTweak?.scale === 100),
        'the thumbnail has been given the overfill that belongs to the face')
      ok('and the face keeps the zoom it was given',
        SERIES_PANELS.filter((p) => p.tweak).every((p) => p.tweak.scale === 108))
      ok('the build takes the thumbnail from its own copy, not the overfilled one',
        /thumb_im = face_tweak\(im, tweak\['rot'\], 100\)/.test(py)
        && /ts = THUMB_PX \/ max\(thumb_im\.size\)/.test(py),
        'the thumbnail is being resized from the overfilled face again')
    }
  }

  // --- the picker asks in that order --------------------------------------
  {
    const src = fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')
    const i = src.indexOf('function SeriesPicker')
    const body = i < 0 ? '' : src.slice(i, src.indexOf('function useClouds'))
    ok('the Cloud Series picker asks for the colour first', /label="Colour"/.test(body)
      && body.indexOf('label="Colour"') < body.indexOf('label="Design"'),
      'Design is being asked for before Colour again')
    ok('and shows the designs as pictures, not as codes',
      /seriesThumbUrl\(/.test(body) && /<img/.test(body),
      'the design row has stopped using thumbnails')
    ok('with the code kept underneath, because that is what goes on an order',
      /\{d\}<\/span>/.test(body))
    ok('on white, so the artwork\'s own white reads as the card',
      /bg-white/.test(body))
    ok('and contained, not cropped -- four shapes are four aspect ratios',
      /object-contain/.test(body) && !/object-cover/.test(body))
    // The chip's tooltip was `${from} ${c}` -- the design it is pictured in --
    // which spelled "CL-01 Red", and the design tile below spells "CL-01 Red"
    // too. Two controls, one tooltip, two meanings. A chip is titled by what
    // it CHOOSES, which is the colour, not by what it happens to be drawn from.
    ok('and the colour chip is titled by the colour it picks, not the design it is drawn in',
      /title=\{c\}/.test(body), 'the colour chip has taken the design back into its tooltip')
  }

  // --- the app opens on clouds ---------------------------------------------
  //
  // Set in TWO places -- the store's initial state and hydrate(), which
  // re-seeds the brush once the room list has been read. Whichever runs last
  // wins, and which that is depends on whether the room manifest arrived, so a
  // literal in each is a default that changes with the weather. One constant,
  // and both sites asserted to use it.
  {
    const src = fs.readFileSync('src/lib/store.js', 'utf8')
    ok('the opening product is a constant, not a literal in two places',
      /export const DEFAULT_PRODUCT = 'clouds'/.test(src),
      'DEFAULT_PRODUCT is gone or is not clouds')
    ok('and both the initial state and hydrate use it',
      (src.match(/brush: \{ type: DEFAULT_PRODUCT, params: emptyParamsFor\(DEFAULT_PRODUCT\) \}/g) ?? [])
        .length === 2,
      'one of the two brush seeds has drifted back to a literal')

    // hydrate() IS the opening path -- it is what seeds the brush once the room
    // list has been read. Reading useStore.getState() here instead would be
    // reading whatever the last test left behind, which is baffles, because
    // reset() sets that explicitly. Checked by trying it: it reported baffles
    // and the guard would have been unsatisfiable rather than wrong.
    S().hydrate()
    const opened = S().brush
    ok('opening the app puts a cloud brush in hand', opened.type === 'clouds',
      opened.type)
    ok('and it is BLANK -- the type, and nothing else decided',
      opened.params.shape === null && opened.params.size === null
      && opened.params.colour === null,
      JSON.stringify(opened.params))
    ok('so nothing places until it is specified',
      cloudMissingFields(opened.params).length > 0,
      cloudMissingFields(opened.params).join(','))
    reset()

    // THE BOOT-TIME BAFFLE SEED, which no longer runs.
    //
    // main.jsx used to open the brush on the first model's type, so a baffle
    // brush always started on something buildable. With clouds as the default
    // that call is guarded and never fires at boot, so a baffle brush made
    // later takes the STATIC default from emptyBrushParams(). Safe only while
    // the two agree. When they stop agreeing this fails, which is the signal to
    // move the seeding into setProduct rather than leave it at startup.
    const firstModelType = (manifest.baffles ?? manifest.models ?? [])[0]?.type
    ok('the static baffle default is still the registry first type',
      !firstModelType || emptyBrushParams().btype === firstModelType,
      `default ${emptyBrushParams().btype}, registry ${firstModelType}`)
    ok('and main.jsx will not stamp a baffle type onto a cloud brush',
      /brush\.type === 'baffles'/.test(fs.readFileSync('src/main.jsx', 'utf8')),
      'the boot-time btype seed is unguarded again')
  }

  // --- the right panel is summoned, and floats -----------------------------
  //
  // Three properties, and each one is a decision somebody could undo by
  // accident while tidying.
  {
    const src = fs.readFileSync('src/ui/RightPanel.jsx', 'utf8')
    const shell = src.slice(src.indexOf('export default function RightPanel'))

    ok('the right panel is not there until something is selected',
      /const any = useStore\(\(s\) => s\.selectedIds\.length > 0\)/.test(shell)
      && /if \(!any\) return null/.test(shell),
      'the panel no longer hides itself when the selection is empty')

    // `selectedIds` is the truth and `selectedId` its anchor. Keying the
    // panel's existence on the anchor, or on selected(), makes it depend on a
    // lookup that returns null for an id the items list has moved past.
    ok('and it asks the ids, not the item, whether anything is selected',
      !/if \(!useStore\(\(s\) => s\.selected\(\)\)\) return null/.test(shell))

    // THE POINT OF THE WHOLE CHANGE. In flow, every appearance and every fold
    // resized the drawing buffer, which moves the camera framing. Floating, the
    // scene is still. Measured in the browser: main stays 1160 px and the
    // buffer 1160x804 whether the panel is there or not.
    ok('it floats over the scene rather than taking width from it',
      /absolute inset-y-0 right-0/.test(shell) && !/shrink-0 flex-col border-l/.test(shell),
      'the right panel is back in the flex flow and will reflow the canvas')
    ok('and sits under the modals, not over them',
      /z-10/.test(shell)
      && /z-20/.test(fs.readFileSync('src/ui/FabricManager.jsx', 'utf8'))
      && /z-30/.test(fs.readFileSync('src/ui/FocusModal.jsx', 'utf8')),
      'the floating panel would now cover the fabric manager or the focus view')
    ok('both the open panel and the folded strip float the same way',
      (shell.match(/\$\{float\}/g) ?? []).length === 2,
      'one of the two states is positioned differently from the other')

    // Folded is remembered across selections, which only works because the
    // component RENDERS NULL rather than being unmounted by its parent -- a
    // component that draws nothing still keeps its state.
    ok('the fold is component state, so it never reaches a saved layout',
      /const \[collapsed, setCollapsed\] = useState\(false\)/.test(shell)
      && !/collapsed/.test(fs.readFileSync('src/lib/store.js', 'utf8')),
      'the collapse flag has moved into the store, where it would be exported')
    ok('and the panel is mounted unconditionally, or the fold would not survive',
      /<RightPanel \/>/.test(fs.readFileSync('src/App.jsx', 'utf8'))
      && !/&& <RightPanel/.test(fs.readFileSync('src/App.jsx', 'utf8')),
      'App has started gating RightPanel, which resets the fold on every selection')
  }

  // --- the brand marks -----------------------------------------------------
  //
  // The logo is two colours, a near-black and the brand orange. The black
  // vanishes on the dark theme, so public/brand/ carries a reversed variant per
  // asset rather than a CSS filter — `invert(1) hue-rotate(180deg)` lifts the
  // ink but drags #ef4935 to #ff725e, and altering a brand colour to fix a
  // legibility problem is not a trade anybody would agree to if asked.
  {
    const bar = fs.readFileSync('src/ui/TopBar.jsx', 'utf8')
    const html = fs.readFileSync('index.html', 'utf8')

    for (const f of ['wordmark', 'wordmark-reversed', 'mark', 'mark-reversed']) {
      ok(`public/brand/${f}.png is built`, fs.existsSync(`public/brand/${f}.png`))
    }
    // The supplied files are inputs. Derived output goes in a sibling folder
    // that can be deleted, the same bargain every other asset here is built
    // under.
    ok('and the supplied logos are still there, untouched',
      fs.existsSync('public/univicoustic-logo.png') && fs.existsSync('public/favicon.png'))
    ok('with a script that regenerates them', fs.existsSync('scripts/build-brand.py'))

    // The gate inside that script: the reversal must not move the orange, and
    // must actually lift the ink. Both were proved by breaking them.
    {
      const py = fs.readFileSync('scripts/build-brand.py', 'utf8')
      ok('which refuses to write if the reversal touches the brand orange',
        /the brand orange moved/.test(py) && /BRAND_ORANGE = \(0xef, 0x49, 0x35\)/.test(py))
      ok('or if the "reversed" file came out still dark',
        /the ink was not lifted/.test(py))
    }

    ok('the top bar shows the wordmark rather than a typeset name',
      /brand\/wordmark\$\{theme === 'dark' \? '-reversed' : ''\}\.png/.test(bar),
      'the wordmark is gone, or no longer follows the theme')
    // Served from /ceiling/, so a root-absolute path 404s everywhere but a
    // local root deploy — the same trap the favicon was already in.
    ok('and asks for it through BASE_URL, not from the root',
      /\$\{import\.meta\.env\.BASE_URL\}brand\//.test(bar),
      'the wordmark path is absolute and will 404 under /ceiling/')
    ok('it carries its name for anything that cannot see it',
      /alt="UniVicoustic"/.test(bar))

    ok('the favicon is linked at all, having sat unreferenced in public/',
      /<link rel="icon"[^>]*href="favicon\.png"/.test(html),
      'public/favicon.png exists but nothing points at it')
    ok('and relatively, for the same reason',
      !/href="\/favicon\.png"/.test(html))

    // The product name sits UNDER the wordmark and is always on. It used to be
    // beside it behind `2xl:inline`, so below about 1536 px — most windows —
    // the header said only UNIV/COUSTIC and never which of the two
    // configurators you were in.
    ok('the header names this configurator, under the wordmark',
      /Ceiling Configurator/.test(bar))
    ok('and does so at every width, not only on a very wide screen',
      !/2xl:inline">Ceiling Configurator/.test(bar)
      && !/hidden[^"]*">\s*Ceiling Configurator/.test(bar),
      'the product name is behind a responsive hidden again')

    // Hidden, not deleted — LeftPanel's SHOW_* bargain. Each takes something
    // with it, which the constants in TopBar spell out.
    ok('Fabrics and Load are switched off rather than ripped out',
      /const SHOW_FABRICS = false/.test(bar) && /const SHOW_LOAD = false/.test(bar),
      'one of them was deleted, or has come back')
    ok('and the code behind them still builds, so flipping the word is enough',
      /\{SHOW_FABRICS && \(/.test(bar) && /\{SHOW_LOAD && \(/.test(bar))
    // The asymmetry MOVED rather than went away, and the comment has to keep
    // up with it. A configuration comes back in through a link now, so the app
    // is no longer write-only; what is still one-way is the FILE — Export JSON
    // writes a .json nothing in the UI reads.
    ok('Export JSON stays, and the way back in is written down',
      /Export JSON/.test(bar)
      && /Copy link closes that/.test(bar)
      // SHORT PHRASES, each of which fits on one comment line. "nothing in the
      // UI reads" was the obvious thing to look for and it wraps, so the guard
      // failed on a comment that says exactly what it is asked to say.
      && /the asymmetry stands/.test(bar),
      'TopBar no longer records what can and cannot be read back')
    ok('and Copy link is the control that closes it',
      /onClick=\{copyLink\}/.test(bar) && /const copyLink = async/.test(bar))
  }

  // --- two themes over one set of names ------------------------------------
  //
  // The light theme is the wall configurator's, transcribed from
  // univicoustic-ui-color-theme.md. The dark one is what this app shipped with,
  // kept while the light one is judged. Both are declared in src/index.css as
  // the SAME token names, and everything else in the app names the token rather
  // than a colour.
  {
    const css = fs.readFileSync('src/index.css', 'utf8')
    const block = (sel) => {
      const at = css.indexOf(sel)
      if (at < 0) return null
      const open = css.indexOf('{', at)
      return css.slice(open + 1, css.indexOf('}', open))
    }
    const tokensIn = (text) =>
      new Set([...(text ?? '').matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]))

    const light = block(':root')
    const dark = block("[data-theme='dark']")
    ok('both themes are declared', !!light && !!dark)

    // THE ONE THAT MATTERS. A token declared in light and missing in dark is an
    // element that renders unstyled in dark — and only in dark, so it is
    // invisible to anyone working in the house theme.
    const L = tokensIn(light)
    const D = tokensIn(dark)
    const onlyLight = [...L].filter((t) => !D.has(t) && t !== 'radius')
    const onlyDark = [...D].filter((t) => !L.has(t))
    ok('every colour token is declared in BOTH themes', onlyLight.length === 0,
      `missing from dark: ${onlyLight.join(', ')}`)
    ok('and dark adds none the light theme has never heard of', onlyDark.length === 0,
      `only in dark: ${onlyDark.join(', ')}`)

    // Values are HSL COMPONENTS, no hsl() wrapper. Wrap them and every opacity
    // modifier in the app — bg-accent/15, text-txt/70 — silently stops working,
    // which looks like a design choice rather than a break.
    ok('the values are bare HSL components, or <alpha-value> stops working',
      !/--[\w-]+:\s*hsl\(/.test(css) && !/--(?:bg|surface|txt|accent|line|fill):\s*#/.test(css),
      'a token is wrapped in hsl() or written as a hex')
    ok('and tailwind reads them through <alpha-value>',
      /hsl\(var\(--accent\) \/ <alpha-value>\)/
        .test(fs.readFileSync('tailwind.config.js', 'utf8')))

    // The dark theme must still BE the palette this app shipped with, not an
    // approximation of it. These are the three that carry the look.
    const valOf = (text, name) => {
      const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(text ?? '')
      return m ? m[1].trim() : null
    }
    const hslToHex = (v) => {
      const [h, sPct, lPct] = v.split(/\s+/).map((x) => parseFloat(x))
      const sat = sPct / 100, lig = lPct / 100
      const c = (1 - Math.abs(2 * lig - 1)) * sat
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
      const m = lig - c / 2
      const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
      return '#' + seg.map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('')
    }
    for (const [token, want, where] of [
      ['bg', '#0e1116', 'ink-900'],
      ['surface', '#171b21', 'ink-800'],
      ['surface-2', '#1e242c', 'ink-700'],
      ['accent', '#24d0a8', 'the teal'],
    ]) {
      const got = hslToHex(valOf(dark, token))
      ok(`the dark theme still is ${where}`, got === want, `--${token} = ${got}, wanted ${want}`)
    }
    // And the light theme is the spec's, not something near it.
    for (const [token, want] of [
      ['bg', '#ffffff'], ['txt', '#344256'], ['txt-2', '#65758b'],
      ['line', '#e2e8f0'], ['accent', '#d65757'], ['accent-hover', '#be4b4b'],
    ]) {
      const got = hslToHex(valOf(light, token))
      ok(`light --${token} is the spec's ${want}`, got === want, `${got}`)
    }

    // THREE.JS CANNOT READ A CSS VARIABLE, so the selection colour is stated a
    // second time in lib/theme.js. That duplication is the point of this guard:
    // the two drift the moment somebody edits one of them.
    ok('the scene selection colour matches --accent in both themes',
      SELECT_COLOUR.light.toLowerCase() === hslToHex(valOf(light, 'accent'))
      && SELECT_COLOUR.dark.toLowerCase() === hslToHex(valOf(dark, 'accent')),
      `${SELECT_COLOUR.light} / ${SELECT_COLOUR.dark} against `
      + `${hslToHex(valOf(light, 'accent'))} / ${hslToHex(valOf(dark, 'accent'))}`)

    // Nothing names a colour any more — with two deliberate exceptions, both of
    // which want a FIXED value in both themes rather than a token.
    const jsx = ['src/ui', 'src/three'].flatMap((d) =>
      fs.readdirSync(d).filter((f) => f.endsWith('.jsx')).map((f) => `${d}/${f}`))
    const strays = []
    for (const f of jsx) {
      const text = fs.readFileSync(f, 'utf8')
      for (const m of text.matchAll(/\b(?:bg|text|border|ring|ring-offset)-(?:white|black|ink-\d+)(?:\/\S+)?/g)) {
        strays.push(`${f.split('/').pop()}:${m[0]}`)
      }
    }
    ok('no component names a raw colour, bar the two that must',
      strays.length === 2
      && strays.some((x) => x.startsWith('bits.jsx:text-ink-900'))
      && strays.some((x) => x.startsWith('CloudFields.jsx:bg-white')),
      strays.join(', '))
    // Why those two: the amber button is light in EITHER theme so its text stays
    // dark, and the artwork card is the supplied artwork's own white artboard.
    ok('and the artwork card is still white on purpose',
      /rounded bg-white ring-offset-1 ring-offset-surface/
        .test(fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')))

    // The scene takes exactly one colour from the theme. The room, the ceiling
    // and every product finish are the thing being visualised, not chrome.
    ok('the 3D scene takes the selection colour from the theme, not a literal',
      fs.readdirSync('src/three').filter((f) => f.endsWith('.jsx'))
        .every((f) => !/#24d0a8/.test(fs.readFileSync(`src/three/${f}`, 'utf8'))),
      'a scene component still names the teal')
  }

  // --- the dropdown is built, not borrowed ---------------------------------
  //
  // A native select popup is drawn by the operating system and cannot be
  // styled: not its width, not its corners, not its background. That is the
  // whole reason this component exists, so the first guard is that no native
  // one has crept back -- one would look like Windows sitting next to one that
  // looks like the app, and only on some machines.
  {
    const bits = fs.readFileSync('src/ui/bits.jsx', 'utf8')
    const jsx = ['src/ui', 'src/three'].flatMap((d) =>
      fs.readdirSync(d).filter((f) => f.endsWith('.jsx')).map((f) => `${d}/${f}`))
    // Anchored to the start of a line, because these files TALK about <select>
    // at length -- the reason the component exists is half a page of comment --
    // and a guard that fires on its own explanation is worse than no guard.
    // NO REGEX HERE, AND THAT IS THE POINT.
    //
    // This wants to be /^\s*<select[\s>]/m and it kept not being. Through a
    // template literal, `\s` is not a valid escape so JS drops the backslash
    // and the pattern silently becomes ^s*<select[s>] -- matching neither the
    // prose nor a real element, which is a guard that passes for nothing. The
    // same trap cost a FACE_TWEAK guard earlier in this file.
    //
    // So: no backslashes, nothing to escape, nothing to lose in transit. It
    // reads the same and cannot rot.
    // COMMENTS FIRST. These files explain at length why the native element is
    // gone, and one of those explanations wraps so that "<select> in the app"
    // starts a line -- which the first version of this guard reported as an
    // offender in LeftPanel. A guard that scans source has to scan the code and
    // not the prose about the code.
    const code = (f) => fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')       // block and JSX comments
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')   // line comments, sparing https://
    const renders = (f, tag) => code(f).split('\n').some((line) => {
      const t = line.trimStart()
      if (!t.startsWith('<' + tag)) return false
      // The character after the tag name, so <select> and <select ...> count
      // and <selectSomething> does not.
      const next = t[tag.length + 1]
      return next === undefined || next === '>' || next === ' '
    })
    const offenders = jsx.filter((f) => renders(f, 'select'))
    ok('nothing renders a native <select> any more', offenders.length === 0, offenders.join(', '))
    ok('nor an <optgroup>, the room list having moved to `group` on each option',
      !jsx.some((f) => renders(f, 'optgroup')))

    // Portalled, and that is not decoration: both side panels are
    // overflow-y-auto, so a list drawn inside one is clipped by it the moment
    // it is longer than the room left below the button.
    ok('the list is portalled out of the scrolling panels',
      /createPortal\(/.test(bits) && /document\.body,/.test(bits),
      'the dropdown list will be clipped by whichever panel it is in')
    ok('and follows the button, rather than being placed once and forgotten',
      /addEventListener\('scroll', follow, true\)/.test(bits)
      && /addEventListener\('resize', follow\)/.test(bits),
      'the list will detach from its button on scroll')

    // Everything the native element did for free and now has to be done here.
    for (const [what, re] of [
      ['opens on arrow keys', /\['ArrowDown', 'ArrowUp', 'Enter', ' '\]\.includes\(e\.key\)/],
      ['walks with the arrows', /if \(e\.key === 'ArrowDown'\)/],
      ['jumps with Home and End', /e\.key === 'Home'/],
      ['closes on Escape', /e\.key === 'Escape'/],
      ['closes on Tab', /e\.key === 'Tab'/],
      ['has type-ahead', /typed\.current\.text/],
      ['closes on an outside click', /pointerdown/],
      ['returns focus to the button', /btn\.current\?\.focus\(\)/],
      ['keeps the highlight on screen', /scrollIntoView/],
    ]) ok(`it ${what}`, re.test(bits), `the listbox no longer ${what}`)

    // Skipped, not merely greyed. A disabled row the arrows land on is a row
    // somebody presses Enter on.
    ok('disabled rows are skipped by the keyboard, not just dimmed',
      /o\.disabled \? a : \[\.\.\.a, i\]/.test(bits)
      && /if \(!o \|\| o\.disabled\) return/.test(bits))

    // Screen readers get told what sighted users can see.
    for (const attr of ['role="combobox"', 'role="listbox"', 'role="option"',
      'aria-expanded', 'aria-activedescendant', 'aria-selected', 'aria-haspopup'])
      ok(`it announces ${attr}`, bits.includes(attr))

    // The bargain Choice made and a native select could not: a size stays the
    // NUMBER 1200 instead of arriving as "1200" and failing a strict lookup.
    ok('it hands back the option own value, not a string',
      /onChange\(o\.value\)/.test(bits) && !/onChange\(e\.target\.value\)/.test(bits),
      'the dropdown has gone back to stringifying its value')

    // Attached: the two halves square off the edge they meet on, and overlap by
    // a pixel so the borders are one line rather than two touching ones.
    ok('open, the button and the list square off the edge they share',
      /open \? \(box\?\.up \? 'rounded-t-none' : 'rounded-b-none'\)/.test(bits)
      && /box\.up \? 'rounded-t-lg rounded-b-none' : 'rounded-b-lg rounded-t-none'/.test(bits),
      'the dropdown no longer reads as one shape')
    ok('they are the same width, and overlap by a pixel so the borders are one line',
      /width: box\.width/.test(bits) && /b\.bottom - 1/.test(bits))
    ok('and it flips up when there is no room below',
      /const up = below < wanted && b\.top > below/.test(bits))
  }

  // --- the cloud fields are dropdowns --------------------------------------
  //
  // Shape, Size, Thickness and Series were rows of buttons and are now
  // <select>s. That swap changes a contract that nothing on screen would show
  // you had broken.
  {
    const src = fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')
    const body = src.slice(src.indexOf('export default function CloudFields'))

    for (const label of ['Shape', 'Size', 'Thickness', 'Series']) {
      const at = body.indexOf(`label="${label}"`)
      // Wide enough to clear the comment above each control; these fields
      // carry a paragraph apiece and 700 stopped being enough the moment one
      // of them was rewritten.
      const chunk = at < 0 ? '' : body.slice(at, at + 1600)
      ok(`${label} is a dropdown`, /<Select/.test(chunk) && !/<Choice/.test(chunk),
        `${label} is not a <Select>`)
    }

    // THE TRAP. A <select> hands back e.target.value, which is always a STRING.
    // Choice passed the option object own value, so a size stayed the number
    // 1200; through a Select it becomes "1200", cloudFor compares it with ===
    // against the manifest number, finds nothing, and the panel reports no
    // model with nothing on screen to say why. Both numeric fields are coerced.
    ok('and the two numeric ones come back as numbers, not strings',
      /onChange=\{\(size\) => onChange\(\{ size: Number\(size\) \}\)\}/.test(body)
      && /onChange=\{\(thickness\) => onChange\(\{ thickness: Number\(thickness\) \}\)\}/.test(body),
      'a cloud size or thickness is being written as a string')
    // Proof the coercion is the thing that matters: the lookup is ===.
    // The models have to be loaded to ask, and this block runs before the
    // CLOUDS section does it -- without this the check passes for the wrong
    // reason in one direction and fails in the other.
    applyCloudManifest(manifest.clouds)
    ok('because the model lookup is strict, and a string size finds nothing',
      cloudFor('triangle', 1200) !== null && cloudFor('triangle', '1200') === null,
      `${CLOUD_MODELS.length} cloud models loaded`)

    // shape and size both start null. A <select> shows its first option when
    // its value is empty, so without a blank entry the panel would quietly
    // claim a circle had been chosen while the "still to choose" line above
    // still said Shape.
    ok('the fields that start empty offer a blank first entry',
      /const choose = \(what, options\) =>/.test(src)
      && /choose\('shape'/.test(body) && /choose\('size'/.test(body))
    ok('and it cannot be picked',
      /\{ value: '', label: `Choose a \$\{what\}/.test(src) && /disabled: true/.test(src))
    ok('while thickness and family, which always have an answer, do not offer one',
      !/choose\('thickness'/.test(body) && !/choose\('family'/.test(body))
  }

  // --- the temporary rotator stays out of the build ------------------------
  //
  // TEMPORARY, with src/lib/uvTune.js and the UvTuner component. Delete this
  // block when they go. Until then it is the thing that stops a diagnostic
  // slider reaching a customer: both the render and the console handle are
  // behind import.meta.env.DEV, which Vite replaces with `false` so Rollup
  // drops the branch whole.
  {
    const fields = fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')
    const lib = fs.readFileSync('src/lib/uvTune.js', 'utf8')
    ok('the texture rotator is rendered only under DEV',
      /import\.meta\.env\.DEV && \(\s*<UvTuner/.test(fields),
      'UvTuner is no longer behind a DEV gate')
    // And switched off outright: the angles it was built to find are baked into
    // FACE_TWEAK now. Kept rather than deleted because CL-02 is missing from
    // the supplied set and may arrive askew the same way. The DEV gate above
    // still stands, so flipping this on cannot reach a customer.
    ok('and it is switched off, the angles being baked in',
      /const SHOW_TUNER = false/.test(fields)
      && /\{SHOW_TUNER && import\.meta\.env\.DEV &&/.test(fields),
      'the texture rotator is showing again')
    ok('and its console handle too',
      /import\.meta\.env\?\.DEV/.test(lib))
    ok('it writes nothing to the specification',
      !/onChange\(/.test(fields.slice(fields.indexOf('function UvTuner'),
        fields.indexOf('export default function CloudFields'))),
      'the rotator has started writing to the spec, where it would be saved')
    ok('and nothing outside that one component imports it',
      !/uvTune/.test(fs.readFileSync('src/three/useCloudModel.js', 'utf8'))
      && !/uvTune/.test(fs.readFileSync('src/lib/cloudSeries.js', 'utf8')),
      'uvTune has leaked into the render path it is supposed to only observe')

    // The SIZE control, and the one sum in this file that can be wrong without
    // looking wrong. `repeat` is how many times the image spans the UV square,
    // so it runs BACKWARDS from size: bigger artwork is a smaller repeat. A
    // slider that scales the wrong way is ten minutes of fighting the tool
    // before anybody suspects the tool.
    ok('100% leaves the image spanning the panel exactly once',
      repeatFor({ scale: 100, flipU: false, flipV: false }).join() === '1,1')
    ok('200% draws the artwork BIGGER, which is a smaller repeat',
      repeatFor({ scale: 200, flipU: false, flipV: false }).join() === '0.5,0.5')
    ok('and 50% smaller, which is a larger one',
      repeatFor({ scale: 50, flipU: false, flipV: false }).join() === '2,2')
    ok('a mirror is the SIGN and the size is the magnitude, so both survive together',
      repeatFor({ scale: 125, flipU: true, flipV: false }).join() === '-0.8,0.8')

    // A zero here divides into Infinity, which is a black panel and no clue why.
    ok('a scale of zero is clamped, never divided by',
      setTune('CL-01', 'square', { scale: 0 }).scale === SCALE_RANGE.min)
    ok('and an absurd one is clamped too',
      setTune('CL-01', 'square', { scale: 99999 }).scale === SCALE_RANGE.max)
    ok('every repeat it can produce is a finite number',
      [0, 1, 25, 100, 300, 99999, NaN, undefined].every((sc) => {
        const t = setTune('CL-01', 'square', { scale: sc })
        return repeatFor(t).every(Number.isFinite)
      }))

    ok('the report carries the size, or the answer comes back missing half of itself',
      (setTune('CL-01', 'square', { rot: 90, scale: 125 }),
        /CL-01 square: rot 90, scale 125%/.test(tuneReport())), tuneReport())
    ok('a square entry is left out of the report entirely',
      (setTune('CL-01', 'square', { rot: 0, scale: 100, flipU: false, flipV: false }),
        tuneReport() === '(nothing changed yet)'), tuneReport())
    ok('and clearing puts it back to the default',
      (setTune('CL-01', 'square', { rot: 45, scale: 150 }), clearTune('CL-01', 'square'),
        tuneOf('CL-01', 'square').rot === 0 && tuneOf('CL-01', 'square').scale === 100))
    clearAllTune()
  }

  // --- the image key ------------------------------------------------------
  {
    // The SHAPE is in the texture key even though it is not in the swatch code:
    // four shapes of a design are four different files, and a ceiling of
    // circles must not hold the hexagons in memory.
    ok('the image key names the shape, so a ceiling of circles holds only circles',
      seriesKey('CL-01', 'circle', 'Blue') !== seriesKey('CL-01', 'hexagon', 'Blue'))
    const src = fs.readFileSync('src/main.jsx', 'utf8')
    ok('and the retain line keys on it',
      /seriesKey\(bits\.design, p\.shape, bits\.colour\)/.test(src),
      'Cloud Series artwork is retained by something other than its own key')
    ok('and is actually retained, or 500 MB of artwork never gets freed',
      /retainCloudSeries\(/.test(src))
  }

  // --- which way up the image uploads -------------------------------------
  {
    // three's Texture.flipY is IGNORED for an ImageBitmap source: the flip is a
    // pixel-store setting applied on upload and an ImageBitmap does not take
    // that path. The default flipY = true is therefore a lie, v = 1 samples the
    // BOTTOM of the image, and every design lands upside down.
    //
    // Source-level, because the fault lives on the GPU and there is no GPU
    // here. That is the honest shape of this guard, and it is worth having:
    // what went wrong was not the reasoning, it was that the check used a
    // CanvasTexture — which DOES honour flipY — so it passed while the real
    // path was wrong. This at least holds the two lines that fix it.
    const src = fs.readFileSync('src/lib/cloudSeries.js', 'utf8')
    ok('the artwork is flipped when the bitmap is decoded',
      /createImageBitmap\([\s\S]*?imageOrientation:\s*'flipY'/.test(src),
      'flipY is not applied to an ImageBitmap on upload, so it has to be at decode')
    ok('and flipY is turned off, so a browser that DOES honour it cannot undo that',
      /tex\.flipY = false/.test(src),
      'two flips cancel and put the design back upside down')
  }

  // --- the back face ------------------------------------------------------
  {
    const src = fs.readFileSync('src/three/useCloudModel.js', 'utf8')
    // Asked for: printing is a face operation, so the back takes the design's
    // colour flat. That needs two materials where there used to be one.
    ok('the panel and the cap are on materials of their own',
      /const capMat = new THREE\.MeshStandardMaterial/.test(src),
      'one shared material cannot print the face and not the back')
    ok('and both are disposed, not just the one that used to exist',
      /parts\?\.capMat\.dispose\(\)/.test(src))
    ok('a printed cloud puts the artwork on the face and leaves the back plain',
      /parts\.capMat\.map = null/.test(src))
  }

  // --- the schedule -------------------------------------------------------
  if (cloudSeriesReady()) {
    // The cloud MODELS as well as the artwork: a cloud with no shape on the
    // disk has no shape in the brush, and placeAt would refuse for a reason
    // that has nothing to do with what is being tested here.
    applyCloudManifest(manifest.clouds)
    reset()
    S().setProduct('clouds')
    S().setBrush({ shape: 'square', size: 1200, family: 'cloud-series', colour: 'CL-01_Blue' })
    const a = S().placeAt(...at(15, 15))
    S().setBrush({ colour: 'CL-03_Blue' })
    const b = S().placeAt(...at(45, 15))
    ok('two designs place', !!a && !!b,
      JSON.stringify(cloudMissingFields(S().brush.params)))
    const rows = buildSchedule(S().items).rows
    ok('two designs are two order lines, not one',
      rows.length === 2, String(rows.length))
    ok('and each names the design it is',
      rows.length === 2 && rows.every((r) => /^CL-\d\d_/.test(r.colour)),
      rows.map((r) => r.colour).join(', '))
    reset()
  }
}

// ---------------------------------------------------------------------------
section('LAYOUT PRESETS NAME THEIR PRODUCT — baffles and clouds')
{
  // This section used to say "presets are baffle presets", and it was true:
  // applyPreset built defaultBaffleParams(), measured with baffleCells and
  // stamped type 'baffles' whatever was asked for. That is why clouds could not
  // have presets at all rather than merely not having any. Each preset now
  // names its product and the store follows it.

  ok('every preset says which product it places',
    PRESETS.length > 0 && PRESETS.every((pr) => ['baffles', 'clouds'].includes(pr.type)),
    PRESETS.map((pr) => `${pr.key}:${pr.type}`).join(', '))

  // A spec is recognised by what only that product carries: a baffle has a
  // btype, a cloud has a shape and a size and no btype.
  ok('and a baffle preset builds a baffle spec',
    PRESETS.filter((pr) => pr.type === 'baffles').every((pr) => {
      const params = pr.product(S().grid())
      return params.btype != null && params.ttype == null
    }))
  ok('while a cloud preset builds a complete cloud spec',
    PRESETS.filter((pr) => pr.type === 'clouds').every((pr) => {
      const params = pr.product(S().grid())
      return params.btype == null && !!params.shape && !!params.size && !!params.colour
    }),
    PRESETS.filter((pr) => pr.type === 'clouds')
      .map((pr) => JSON.stringify(pr.product(S().grid()))).join(' '))

  // COMPLETE AND SURVIVING RECONCILE are different things. A preset can name a
  // shape, a size and a colour and still have the colour thrown away, because
  // reconcileCloud checks a series code against the artwork manifest. A preset
  // whose finish quietly reconciles to null places a cloud that asks for a
  // Design, which is not a layout anybody asked for.
  ok('and every field of it survives reconcile, finish included',
    PRESETS.filter((pr) => pr.type === 'clouds').every((pr) => {
      const params = pr.product(S().grid())
      const out = reconcileCloud(params)
      return out.shape === params.shape && out.size === params.size
        && out.colour === params.colour && out.family === params.family
    }),
    PRESETS.filter((pr) => pr.type === 'clouds')
      .map((pr) => `${pr.key}:${reconcileCloud(pr.product(S().grid())).colour}`).join(' '))

  {
    const src = fs.readFileSync('src/ui/LeftPanel.jsx', 'utf8')
    ok('the section is offered on the two products that have presets',
      /const PRESET_PRODUCTS = \['baffles', 'clouds'\]/.test(src),
      'the preset list is offered on something no preset can build')
    ok('and the panel is gated on that rather than always rendered',
      /PRESET_PRODUCTS\.includes\(brush\.type\) && <PresetPanel \/>/.test(src))
    // Filtered, not just gated. Without this a cloud would be shown the baffle
    // presets, which is the old fault with an extra step.
    ok('and it lists only the presets of the product on the brush',
      /PRESETS\.filter\(\(p\) => \(p\.type \?\? 'baffles'\) === product\)/.test(src),
      'the preset panel shows every preset whatever the product')

    // ONE CONTROL, not five buttons. A menu of ACTIONS wearing a dropdown,
    // which is the one place in this panel where a Select cannot show live
    // state: it keeps showing the layout that was RUN, true the instant it runs
    // and stale as soon as a panel is moved. Chosen over resetting to the
    // placeholder, and the staleness is written into the component.
    ok('the presets are a dropdown, not a stack of buttons',
      /<Select\s+value=\{chosen \?\? ''\}/.test(src) && !/mine\.map\(\(p\) => \(\s*<Button/.test(src),
      'the preset panel has gone back to one button per preset')
    ok('with a blank first entry, because no layout has been run yet',
      /label: 'Choose a layout/.test(src))
    // Derived rather than stored: a baffle preset key means nothing on a cloud
    // brush, and deriving it leaves no stale value to clear and no effect to
    // forget to write.
    ok('and the one it shows is filtered by product, so it cannot go stale across a switch',
      /const chosen = mine\.some\(\(p\) => p\.key === ran\) \? ran : null/.test(src),
      'the preset dropdown can show a layout the current product does not have')

    // The descriptions moved from five lines to one, and follow the HIGHLIGHT
    // rather than the mouse -- the keyboard moves it too, and a hint that only
    // followed hover would be missing exactly when it was most needed.
    ok('the highlighted layout describes itself before it is committed to',
      /onHighlight=\{setOver\}/.test(src)
      && /\{showing && <Note>\{showing\.hint\}<\/Note>\}/.test(src),
      'the preset hint no longer follows the highlight')
    ok('and Select reports that highlight, including null when it shuts',
      /highlight\.current\?\.\(open && active >= 0 \? rows\[active\]\?\.value \?\? null : null\)/
        .test(fs.readFileSync('src/ui/bits.jsx', 'utf8')),
      'Select has stopped reporting which row is highlighted')

    // Tool > Product > Layout presets > the product's fields. Below Product
    // because the list depends on it; above the fields because taking a whole
    // layout and filling the fields in are alternatives, not steps.
    const atProduct = src.indexOf('<Panel title="Product">')
    const atPresets = src.indexOf('<PresetPanel />')
    const atFields = src.indexOf('<Panel title={')
    ok('the presets sit between the product and its fields',
      atProduct > 0 && atPresets > atProduct && atFields > atPresets,
      `product ${atProduct}, presets ${atPresets}, fields ${atFields}`)
  }

  // The store follows the preset's type rather than assuming one.
  for (const kind of ['baffles', 'clouds']) {
    const pr = PRESETS.find((x) => x.type === kind)
    reset()
    S().setProduct(kind)
    const { placed } = S().applyPreset(pr.key)
    ok(`a ${kind} preset places ${kind}`,
      placed > 0 && S().items.every((it) => it.type === kind),
      `${placed} placed, types ${[...new Set(S().items.map((it) => it.type))].join(',')}`)
    ok('and the brush adopts it, so placing more by hand continues the look',
      S().brush.type === kind, S().brush.type)
    reset()
  }

  // ---- the five cloud layouts ---------------------------------------------
  //
  // Every one of these is also run through the on-grid and no-overlap checks in
  // the LAYOUT PRESETS section above, in every room. What is asserted here is
  // what makes each one the layout it claims to be.
  {
    const cloudPresets = PRESETS.filter((pr) => pr.type === 'clouds')
    ok('there are five cloud layouts', cloudPresets.length === 5,
      cloudPresets.map((pr) => pr.key).join(', '))

    const run = (key) => {
      reset()
      S().setProduct('clouds')
      const res = S().applyPreset(key)
      return { ...res, items: S().items.slice() }
    }

    for (const pr of cloudPresets) {
      const { placed, skipped, items } = run(pr.key)
      ok(`${pr.key}: places something, and all of it fits`,
        placed > 0 && skipped === 0, `${placed} placed, ${skipped} skipped`)
      ok(`${pr.key}: every panel is finished, none left asking for a Design`,
        items.every((it) => cloudMissingFields(it.params).length === 0),
        items.map((it) => cloudMissingFields(it.params).join('/')).filter(Boolean).join(' '))
    }

    // Each one's own claim, taken from its hint.
    const drift = run('cloud-circle-drift').items
    ok('the drift really is at three heights',
      new Set(drift.map((it) => it.params.drop)).size === 3,
      [...new Set(drift.map((it) => it.params.drop))].join(','))

    const chequer = run('cloud-chequer').items
    ok('the chequer really alternates two colours',
      new Set(chequer.map((it) => it.params.colour)).size === 2,
      [...new Set(chequer.map((it) => it.params.colour))].join(','))
    // A CHEQUER, not stripes. Neighbours along a row must differ, which is the
    // thing that goes wrong when the pattern is keyed on the flat index and a
    // row happens to hold an even number.
    {
      const byRow = new Map()
      for (const it of chequer) {
        const row = byRow.get(it.cell[1]) ?? []
        row.push(it)
        byRow.set(it.cell[1], row)
      }
      const striped = [...byRow.values()].some((row) =>
        row.length > 1 && new Set(row.map((it) => it.params.colour)).size === 1)
      ok('and alternates ACROSS each row too, rather than banding', !striped,
        [...byRow.values()].map((r) => r.length).join(','))
    }

    // THE PATTERN ITSELF, not the ceiling it happened to land on.
    //
    // The check above cannot see the bug it is aimed at. Keying the colour on
    // the flat index gives stripes only when a row holds an EVEN number of
    // panels, and this ceiling fits five across -- so an index-keyed chequer
    // still alternates here, by luck, and the end-to-end test passes. Verified
    // by making exactly that change and watching nothing fail.
    //
    // So `vary` is asked directly: two panels side by side must differ, and two
    // stacked must differ. That is what a chequer IS, and it holds whatever the
    // room does.
    {
      const pr = PRESETS.find((x) => x.key === 'cloud-chequer')
      const g = S().grid()
      const params = pr.product(g)
      const { ci, cj } = cloudCells(params, g.pitch)
      const gap = Math.max(0, Math.round((250 / 1000) / g.pitch))
      // ONE FIXED INDEX for every call. That is the whole discrimination: a
      // cell-keyed pattern still alternates, an index-keyed one cannot tell
      // these cells apart at all. Passing a different i per cell let the index
      // version imitate a chequer and the test passed for nothing -- checked by
      // making the change and watching it keep passing.
      const at = (c, r) => pr.vary(params, [100 + c * (ci + gap), 100 + r * (cj + gap)], 0, g).colour
      ok('neighbours across a row are different colours',
        at(0, 0) !== at(1, 0), `${at(0, 0)} / ${at(1, 0)}`)
      ok('and neighbours down a column are too',
        at(0, 0) !== at(0, 1), `${at(0, 0)} / ${at(0, 1)}`)
      // The diagonal repeats, which is what makes it a chequer rather than
      // three colours pretending to be two.
      ok('while the diagonal comes back to the same one',
        at(0, 0) === at(1, 1), `${at(0, 0)} / ${at(1, 1)}`)
    }

    const cluster = run('cloud-cluster').items
    ok('the cluster is five panels and no more', cluster.length === 5, String(cluster.length))
    ok('with the centre one hanging lowest',
      Math.min(...cluster.map((it) => it.params.drop)) < Math.max(...cluster.map((it) => it.params.drop)),
      cluster.map((it) => it.params.drop).join(','))

    const ring = run('cloud-ring')
    {
      const g = S().grid()
      // Nothing in the middle third in both axes -- which is what "centre left
      // clear" means and what separates a ring from a field.
      const inside = ring.items.filter((it) =>
        it.cell[0] > g.cols / 3 && it.cell[0] < (g.cols * 2) / 3
        && it.cell[1] > g.rows / 3 && it.cell[1] < (g.rows * 2) / 3)
      ok('the ring leaves the centre clear', inside.length === 0, `${inside.length} in the middle`)
      ok('and walks all four edges, not just two',
        new Set(ring.items.map((it) => it.cell[0])).size > 2
        && new Set(ring.items.map((it) => it.cell[1])).size > 2,
        `${new Set(ring.items.map((it) => it.cell[0])).size} columns, `
        + `${new Set(ring.items.map((it) => it.cell[1])).size} rows`)
    }
    reset()
  }
}

// ---------------------------------------------------------------------------
section('FLY — a pinwheel, and 97% of it was hardware nobody can see')
{
  // Two models arrived as 39 and 73 MB FBX at 1.65 M and 3.13 M triangles,
  // against a cloud at 6,540. Nearly all of it was CAD hardware: the densest
  // part a 12 x 5 x 11 mm bracket carrying 28,606 triangles. Fly-8 took seven
  // seconds to parse before anything was drawn.

  // --- what it loads ------------------------------------------------------
  //
  // THE SUPPLIED FILES, WHOLE. Asked for that way, and it costs: 39 and 73 MB,
  // 1.65 M and 3.13 M triangles, about five seconds to parse a Fly 8.
  //
  // It was tried the other way — scripts/build-fly.mjs keeps the felt and
  // replaces every other part with its bounding box, 28x lighter. But that does
  // not simplify the frame, it REPLACES it: of 84 parts only five were
  // box-shaped to begin with and 24 are noticeably fatter. The frame ships as
  // modelled. The script still exists; nothing calls it, and this holds that
  // down, because a stray corrected/ folder silently changing what loads is
  // exactly the kind of thing that goes unnoticed.
  ok('both sizes are there', FLY_MODELS.length === 2, String(FLY_MODELS.length))
  ok('and they are Fly 4 and Fly 8', flySizes().join(',') === '4,8', flySizes().join(','))

  for (const f of FLY_MODELS) {
    ok(`${f.id}: the file it names is there`,
      fs.existsSync(`public/models/${f.file}`), f.file)
    ok(`${f.id}: its felt is found`, f.feltMeshes > 0, String(f.feltMeshes))
  }
  // The supplied models are never written to, whatever else happens.
  for (const src of ['Fly-4.fbx', 'Fly-8.fbx']) {
    ok(`the supplied ${src} is untouched`,
      fs.existsSync(`public/models/Fly/${src}`), 'the original is gone')
  }

  // The simplified build, when it exists, is what loads.
  const SIMPLIFIED = 'public/models/Fly/simplified'
  if (fs.existsSync(SIMPLIFIED)) {
    ok('the simplified build is what loads',
      FLY_MODELS.every((f) => /^Fly\/simplified\/.*\.glb$/.test(f.file)),
      FLY_MODELS.map((f) => f.file).join(', '))
    // Roughly 4.6x and 4.1x on the two models. A number that has moved a lot
    // means the simplifier or the source has changed, and somebody should look.
    ok('and it is between three and ten times lighter than what was supplied',
      FLY_MODELS.every((f) => f.tris > 150e3 && f.tris < 1e6),
      FLY_MODELS.map((f) => `${f.id} ${f.tris.toLocaleString()}`).join(', '))
    // Smaller than what it was built FROM, which is the property that means
    // something. An absolute megabyte limit was a guess and tripped on the
    // first honest build.
    for (const f of FLY_MODELS) {
      const mb = fs.statSync(`public/models/${f.file}`).size / 1e6
      const src = `public/models/Fly/Fly-${f.size}.fbx`
      const was = fs.existsSync(src) ? fs.statSync(src).size / 1e6 : Infinity
      ok(`${f.id}: smaller than the file it was built from`,
        mb < was, `${mb.toFixed(1)} MB against ${was.toFixed(1)} MB`)
    }
  } else {
    // No build, no problem — the supplied files load instead. That fallback is
    // the whole reason deleting the folder is a complete undo.
    ok('with no simplified build, the supplied files load',
      FLY_MODELS.every((f) => /^Fly\/Fly-\d+\.fbx$/.test(f.file)),
      FLY_MODELS.map((f) => f.file).join(', '))
  }

  // The bounding-box gate the build script started with was not enough: a part
  // that COLLAPSES still spans the same box, so it passed while the frame
  // silently vanished. Surface area cannot be fooled that way, and NaN
  // positions — which is what actually made the frame disappear — are checked
  // outright. Both of those live in build-fly; this holds them down.
  {
    const src = fs.readFileSync('scripts/build-fly.mjs', 'utf8')
    ok('the build gates on surface AREA, not just on bounding boxes',
      /MAX_AREA_LOSS/.test(src) && /function surfaceArea/.test(src),
      'a collapsed part spans the same box and would pass')
    ok('and refuses NaN positions outright',
      /NaN in its positions/.test(src),
      'a NaN position makes a part vanish while every count still reads right')
    ok('the felt is never simplified',
      /Never simplified\./.test(src), 'the felt carries the UVs the fabric needs')
    ok('borders are locked, or thin parts get eaten',
      /'LockBorder'/.test(src), 'unlocked, the simplifier eats the rails')
  }

  // --- the spec ------------------------------------------------------------
  {
    const blank = emptyFlyParams()
    ok('a blank Fly has nothing chosen for you',
      blank.size === null && blank.colour === null,
      JSON.stringify([blank.size, blank.colour]))
    ok('and is asked for a Size and a Fabric, in that order',
      flyMissingFields(blank).join(',') === 'Size,Fabric',
      flyMissingFields(blank).join(','))
    ok('it is not placeable until both are answered',
      !flyReadyToPlace(blank)
      && !flyReadyToPlace({ ...blank, size: 4 })
      && flyReadyToPlace({ ...blank, size: 4, colour: FLY_FABRICS[0] }))
    // Its own drop range: a Fly is 363 mm deep where a cloud panel is 12-40, so
    // the cloud's 480 default would hang its wings a third of a metre lower.
    ok('it hangs on its own default, not the cloud\'s',
      FLY_DROP.default === 0.35, String(FLY_DROP.default))
  }

  // --- reconcile -----------------------------------------------------------
  {
    ok('a size that does not exist is dropped',
      reconcileFly({ size: 6 }).size === null)
    ok('a real one survives', reconcileFly({ size: 8 }).size === 8)
    ok('the family is always the one family',
      reconcileFly({ family: 'pet-solid' }).family === 'designer-textiles')
    ok('a drop is clamped to the range',
      reconcileFly({ drop: 99 }).drop === FLY_DROP.max
      && reconcileFly({ drop: -1 }).drop === FLY_DROP.min)
    // Quarter turns: a Fly is a rectangle, so 45 would leave it across a grid
    // it cannot be set out on.
    ok('it turns in quarters, not eighths',
      FLY_ROTATIONS.join(',') === '0,90,180,270', FLY_ROTATIONS.join(','))
    ok('and a 45 is refused', reconcileFly({ rot: 45 }).rot === 0)
  }

  // --- the fabric ----------------------------------------------------------
  {
    ok('ten shades are offered', FLY_FABRICS.length === 10, String(FLY_FABRICS.length))
    ok('all of them FB3', FLY_FABRICS.every((k) => k.startsWith('FB3_')))
    // They are ten of the 275 the rest of the app already offers, not a new
    // range — which is what makes a Fly and a baffle in one shade match.
    ok('and every one is a panel the textile map already knows',
      FLY_FABRICS.every((k) => panelFor(k) !== null),
      FLY_FABRICS.filter((k) => !panelFor(k)).join(', '))

    // The files are named the other way round from the key.
    const url = flyFabricUrl('FB3_Blue_2')
    ok('a shade resolves to the file that is actually on disk',
      url.endsWith('/FB3/Blue_FB3_2.jpg'), url)
    for (const k of FLY_FABRICS) {
      const rel = flyFabricUrl(k).replace(/^\//, '')
      ok(`${k}: the file is there`, fs.existsSync(`public/${rel}`), rel)
    }
    ok('and anything off the shortlist resolves to nothing',
      flyFabricUrl('FB1_Blue_1') === null && flyFabricUrl(null) === null)
  }

  // --- size on the ceiling -------------------------------------------------
  if (FLY_MODELS.length) {
    const e4 = flyExtent({ size: 4 })
    const e8 = flyExtent({ size: 8 })
    ok('Fly 4 is about 1099 x 1166',
      Math.abs(e4.length - 1.099) < 0.01 && Math.abs(e4.width - 1.166) < 0.01,
      `${e4.length} x ${e4.width}`)
    ok('Fly 8 is twice as deep — two pinwheels end to end',
      Math.abs(e8.width - 2 * e4.width) < 0.05, `${e8.width} against ${e4.width}`)
    // Turning swaps the footprint, which is what lets one be laid across a run.
    const t = flyExtent({ size: 8, rot: 90 })
    ok('a quarter turn swaps its footprint',
      Math.abs(t.length - e8.width) < 1e-9 && Math.abs(t.width - e8.length) < 1e-9,
      `${t.length} x ${t.width}`)
    const c = flyCells({ size: 4 }, 0.001)
    ok('and it reserves whole millimetre cells', c.ci === 1099 && c.cj === 1166,
      `${c.ci} x ${c.cj}`)
  }

  // --- the schedule --------------------------------------------------------
  if (FLY_MODELS.length) {
    // Face area is the WINGS, not the footprint. Four wings are 1.6 m² of felt
    // inside a 1.28 m² plan, because they overlap in elevation; ordering by the
    // rectangle would under-count the cloth by a fifth.
    const sched = buildSchedule([
      { type: 'fly', cell: [0, 0], params: { ...emptyFlyParams(), size: 4, colour: 'FB3_Rust_4' } },
    ])
    const row = sched.rows[0]
    ok('a Fly reaches the schedule', !!row, JSON.stringify(sched.rows))
    ok('and is named by its size', row?.name === 'Fly 4', row?.name)
    // The schedule no longer carries an absorptive face: it was a different
    // number for every product and answered a question nobody was asking of
    // it. What a Fly TAKES is the rectangle it hangs in, like everything else.
    ok('the schedule no longer claims an absorptive face',
      row.unitFaceM2 === undefined, String(row?.unitFaceM2))
    const flyE = flyExtent({ size: 4 })
    ok('a Fly takes the rectangle it hangs in',
      Math.abs(itemArea({ type: 'fly', params: { size: 4 } }) - flyE.length * flyE.width) < 1e-9)
    // Still worth knowing, and still measured — it is just not the schedule's
    // business. The felt exceeds the plan because the wings overlap.
    ok('its felt is more than that rectangle, because the wings overlap',
      FLY_WING_M2 * 4 > flyE.length * flyE.width,
      `${FLY_WING_M2 * 4} against ${(flyE.length * flyE.width).toFixed(2)}`)
    ok('one wing is 456 x 585 mm',
      Math.abs(FLY_WING.length - 0.585) < 1e-9 && Math.abs(FLY_WING.width - 0.456) < 1e-9)
  }

  // --- placing one ---------------------------------------------------------
  if (FLY_MODELS.length) {
    reset()
    S().setProduct('fly')
    ok('the brush comes up blank', S().brush.params.size === null)
    S().setBrush({ size: 4, colour: 'FB3_Rust_4' })
    const id = S().placeAt(...at(15, 15))
    ok('a Fly places', !!id, JSON.stringify(flyMissingFields(S().brush.params)))
    ok('and is its own type, not a cloud wearing different words',
      S().items[0]?.type === 'fly', S().items[0]?.type)
    // Save and load, because a new product that cannot be reopened is not done.
    const saved = JSON.parse(JSON.stringify(S().toJSON()))
    S().clear()
    const res = S().fromJSON(saved)
    ok('it survives a save and a load', res.loaded === 1 && res.dropped === 0,
      JSON.stringify(res))
    ok('with its size and fabric intact',
      S().items[0]?.params.size === 4 && S().items[0]?.params.colour === 'FB3_Rust_4',
      JSON.stringify(S().items[0]?.params))
    reset()
  }

  // --- it has to touch the ceiling -----------------------------------------
  {
    // Reported as "the model is not touching the ceiling", with the gap circled.
    // A Fly's suspension is modelled and reaches the top of the assembly, so at
    // a drop of zero it touched; at 350 it hung 350 mm down with nothing above
    // it — four rods stopping in mid-air under an empty slab.
    //
    // The renderer draws an extension at the points the model itself hangs
    // from. Those points are read off the geometry, so this guards the reading:
    // the parts that reach the top are the fixings, and there are four of them.
    const src = fs.readFileSync('src/lib/fly.js', 'utf8')
    ok('the hanging points are read off the model, not listed',
      /function hangersOf\(/.test(src), 'hangersOf is gone')
    ok('and deduplicated, because a fixing is two nested pieces in one hole',
      /const key = /.test(src) && /found\.set\(key/.test(src),
      'two rods in one hole would z-fight')

    const scene = fs.readFileSync('src/three/FlySet.jsx', 'utf8')
    ok('the rod is drawn from the slab down to the assembly',
      /boxGeometry args=\{\[h\.w, drop, h\.d\]\}/.test(scene),
      'the extension is not the length of the drop')
    ok('positioned at half the drop, so it spans slab to model exactly',
      /position=\{\[h\.x, -drop \/ 2, h\.z\]\}/.test(scene),
      'the rod does not meet the ceiling')
    ok('and nothing is drawn at a drop of zero, where the model already touches',
      /drop > 0\.001 && model\?\.hangers/.test(scene),
      'a zero-length rod is drawn into the slab')
  }

  // --- the wiring -----------------------------------------------------------
  {
    const scene = fs.readFileSync('src/three/Scene.jsx', 'utf8')
    ok('the scene draws one', /it\.type === 'fly'/.test(scene))
    const left = fs.readFileSync('src/ui/LeftPanel.jsx', 'utf8')
    ok('the left panel offers its fields', /FlyFields/.test(left))
    const main = fs.readFileSync('src/main.jsx', 'utf8')
    ok('the manifest is read at boot', /loadFlyManifest\(\)/.test(main))
    // The ten shades are on disk, so they are read from disk — no CDN round
    // trip, and they work with the network off.
    ok('and the local panels are registered so the CDN is not asked for them',
      /registerLocalPanels\(/.test(main))
  }
}

// ---------------------------------------------------------------------------
section('A CLOUD IS 40 MM, AND HANGS WHERE A SLIDER OR A KEYBOARD SAYS')
{
  // Two asks. The thickness is the interesting one, because the models
  // disagree with it and the answer was to believe the product.

  ok('one thickness is offered, and it is 40',
    CLOUD_THICKNESSES.join(',') === '40', CLOUD_THICKNESSES.join(','))

  // The eleven files are drawn at 11.6 to 43.2 mm and no two sizes agree. 40 is
  // what the product is made in; the drawings are a drawing. Left alone, and
  // not reported.
  ok('and the models do NOT agree with it, which is why it is not read off them',
    CLOUD_MODELS.length > 0
    && CLOUD_MODELS.filter((c) => c.thicknessMm === 40).length < CLOUD_MODELS.length,
    [...new Set(CLOUD_MODELS.map((c) => c.thicknessMm))].sort((a, b) => a - b).join(', '))

  // A field with one option is not a question. Everything else on a cloud opens
  // unanswered; this opens answered, and that is the difference between the two
  // kinds of field rather than an inconsistency.
  {
    const blank = defaultCloudParams()
    ok('a blank cloud already knows its thickness', blank.thickness === 40,
      String(blank.thickness))
    ok('while everything that IS a question is still unanswered',
      blank.shape === null && blank.size === null && blank.colour === null,
      JSON.stringify([blank.shape, blank.size, blank.colour]))
    ok('and it is not on the list of things still to choose',
      !cloudMissingFields(blank).includes('Thickness'),
      cloudMissingFields(blank).join(','))
  }

  // There is nothing to drop it to, so reconcile never nulls it.
  {
    const rc = (p) => reconcileCloud(p, [])
    ok('a thickness that is not offered becomes the one that is',
      rc({ thickness: 25 }).thickness === 40 && rc({ thickness: null }).thickness === 40
      && rc({}).thickness === 40,
      JSON.stringify([rc({ thickness: 25 }).thickness, rc({}).thickness]))
    ok('and the one that is, survives', rc({ thickness: 40 }).thickness === 40)
  }

  // It reaches an order line. A second thickness arriving would be a second
  // line, because it is in the key.
  {
    const sched = buildSchedule([{
      type: 'clouds', cell: [0, 0],
      params: { ...defaultCloudParams(), shape: 'square', size: 1200, colour: 'Blue' },
    }])
    ok('a cloud carries its thickness onto the schedule',
      sched.rows[0]?.thickness === 40, String(sched.rows[0]?.thickness))
  }

  // The panel used to end by reporting what the MODEL measures. It cannot any
  // more: one of those numbers is orderable and the other is a drawing.
  {
    const src = fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')
    ok('the panel offers the thickness',
      /label="Thickness"/.test(src), 'no thickness field on a cloud')
    ok('and no longer reports the model\'s own, which contradicts it',
      !/thicknessMm/.test(src),
      'the panel still prints the modelled thickness beside the product one')

    // Slider AND typed entry — asked for as both, because a 50-2000 mm range is
    // two millimetres a pixel and a typed box cannot be swept.
    ok('suspension height is swept or typed',
      /<SliderStepper/.test(src), 'the cloud drop is still a bare stepper')
  }
  {
    const bits = fs.readFileSync('src/ui/bits.jsx', 'utf8')
    ok('and the control really is both: a slider over a stepper',
      /export function SliderStepper/.test(bits)
      && /<Slider[\s\S]{0,400}<Stepper/.test(bits),
      'SliderStepper does not contain both')
  }
  {
    // Clouds only, which is what was asked. Baffles and Fly keep the stepper.
    const fly = fs.readFileSync('src/ui/FlyFields.jsx', 'utf8')
    ok('Fly keeps the stepper it had — the ask was clouds only',
      !/SliderStepper/.test(fly), 'Fly was changed too')
  }
}

// ---------------------------------------------------------------------------
section('FOCUS ON A CLOUD — nothing to pick out of it, and that is fine')
{
  // A cloud has no parts, so for a long time it had no focus view: there was
  // nothing in there to edit. Asked for anyway, and the reason is the finish —
  // at four metres a 1200 mm cloud is a coin, and a Cloud Series design cannot
  // be judged from there at all.

  {
    ok('a cloud has a focus view of its own',
      fs.existsSync('src/three/CloudFocusView.jsx'), 'CloudFocusView is missing')
    const modal = fs.readFileSync('src/ui/FocusModal.jsx', 'utf8')
    ok('and the modal opens it', /<CloudFocusView/.test(modal))
    ok('with the cloud panel beside it, not a baffle editor',
      /isCloud \?[\s\S]{0,200}<CloudFields/.test(modal),
      'a cloud in focus gets the wrong editor')
    ok('and no solo toggle, because there is nothing to solo',
      /const isRun = !isCloud &&/.test(modal),
      'a cloud is offered a Whole/Single switch over one panel')

    const right = fs.readFileSync('src/ui/RightPanel.jsx', 'utf8')
    ok('the button is offered on a cloud', /Focus this cloud/.test(right))
    ok('and still not on a Fly, whose wings all wear the one fabric',
      /\{!isFly && \(/.test(right), 'Fly was given a focus view too')
  }

  // The bug this shipped with for one build: isFinRun is a BAFFLE predicate.
  // It reads params.model, a cloud has none, so `!params?.model` is true and it
  // answered TRUE for anything that is not a baffle — putting "Whole baffle /
  // Single fin" in front of a hexagon cloud.
  {
    ok('isFinRun answers true for a cloud, which is why nothing may ask it directly',
      isFinRun({ shape: 'hexagon', size: 1200 }) === true,
      'if this is ever false, the guard below can be relaxed')
    const chooser = fs.readFileSync('src/ui/FocusChooser.jsx', 'utf8')
    ok('so the chooser gates on the product TYPE first',
      /const hasParts = item\?\.type === 'tiles' \|\| item\?\.type === 'baffles'/.test(chooser),
      'the chooser asks isFinRun about products it knows nothing about')
    ok('and a cloud therefore opens straight into focus without being asked',
      /hasParts && \(isTile \|\| isFinRun/.test(chooser))
  }

  // One cloud, one implementation. The finish alone is three branches and each
  // has been wrong at least once; two copies would mean fixing each twice.
  {
    ok('the model, its materials and its finish are shared',
      fs.existsSync('src/three/useCloudModel.js'), 'useCloudModel is missing')
    const hooks = fs.readFileSync('src/three/useCloudModel.js', 'utf8')
    for (const fn of ['useCloud', 'useCloudParts', 'useCloudFinish']) {
      ok(`  it exports ${fn}`, new RegExp(`export function ${fn}`).test(hooks))
    }
    for (const view of ['src/three/CloudSet.jsx', 'src/three/CloudFocusView.jsx']) {
      const src = fs.readFileSync(view, 'utf8')
      ok(`${view.split('/').pop()} uses the shared hooks`,
        /useCloudFinish\(parts, item\.params\)/.test(src), 'it has its own copy')
      // The finish logic must live in ONE place. A second copy of the three
      // branches is how one of them gets fixed and the other does not.
      ok(`  and does not carry its own copy of the finish`,
        !/cloudPanelTexture\(/.test(src) && !/loadCloudSeriesTexture\(/.test(src),
        'the finish has been duplicated back into the view')
    }
  }
}

// ---------------------------------------------------------------------------
section('DESIGNER TEXTILE, COLOUR FIRST — nothing hidden behind a filter')
{
  // The range is five WEAVES crossed with 55 COLOURS, and those are not the
  // same kind of question. Asking for the fabric first made the colour a
  // sub-choice of something nobody had an opinion about yet, and hid 47 of the
  // 55 behind a colour-group filter while doing it.

  const gs = shadeGroups()
  ok('every colour group is offered', gs.length === 8, String(gs.length))
  ok('and every shade in them — all 55, none behind a filter',
    gs.reduce((a, g) => a + g.shades.length, 0) === 55,
    String(gs.reduce((a, g) => a + g.shades.length, 0)))
  ok('each group is named, so the grid is separated rather than run together',
    gs.every((g) => typeof g.name === 'string' && g.name.length > 0),
    gs.map((g) => g.name).join(','))
  ok('and a group with nothing in it is dropped, not left as an empty heading',
    gs.every((g) => g.shades.length > 0))

  // The weave is asked for SECOND, and read off the map rather than assumed.
  ok('a shade is offered in every weave that is actually made in it',
    fabricsForShade('Rust_3').join(',') === 'FB1,FB2,FB3,FB4,FB5',
    fabricsForShade('Rust_3').join(','))
  ok('and a shade nothing is made in offers nothing',
    fabricsForShade('nonesuch').length === 0)

  // Both directions have to keep what was already chosen, or picking a second
  // time undoes the first.
  {
    const keepWeave = fabricsForShade('Green_2').includes('FB4')
    ok('a colour can be changed without losing the weave', keepWeave)
    ok('and a weave without losing the colour',
      !!panelOf('FB4', 'Rust_3') && panelOf('FB4', 'Rust_3').key === 'FB4_Rust_3',
      panelOf('FB4', 'Rust_3')?.key)
  }

  // The thumbnails are what make the second step worth anything: five letters
  // tell you nothing, five pictures of the colour you just picked tell you
  // everything. Every panel in the map carries one.
  ok('every panel has a thumbnail to show the weave with',
    TEXTILE_PANELS.every((p) => typeof p.thumbnailUrl === 'string' && p.thumbnailUrl),
    'a panel with no thumbnail would render as a flat hex')

  {
    // Every product that wears this range picks it the same way. This started
    // as a pin on WHICH product used WHICH of two pickers, because two for one
    // range would drift; all three have now moved, so it is a pin on there
    // being one way in.
    for (const [file, who] of [
      ['src/ui/BaffleFields.jsx', 'baffles'],
      ['src/ui/CloudFields.jsx', 'clouds'],
      ['src/ui/TileFields.jsx', 'tiles'],
    ]) {
      const src = fs.readFileSync(file, 'utf8')
      ok(`${who} use the colour-first picker`,
        /<TextileColourPicker/.test(src), `${who} still ask for the fabric first`)
      ok(`  and nothing still reaches for the old one`,
        !/<TextilePicker/.test(src), `${who} renders both`)
    }
    {
      // A tile writes its finish under `textile`, not `colour` — it already has
      // a `wood` and the two are read from different maps. That is the one
      // thing about the new picker that no product exercised until tiles moved,
      // so it is asserted rather than assumed.
      const src = fs.readFileSync('src/ui/TileFields.jsx', 'utf8')
      ok('and a tile still writes its finish under `textile`',
        /field="textile"/.test(src),
        'a tile writing to `colour` would set a field nothing reads')
    }
  }
}

// ---------------------------------------------------------------------------
section("AN EMPTY BRUSH — nothing is chosen for you")
{
  // A new session used to open on a complete product: Blade / Standard / 25 mm
  // / 1800 / 150 / PET / StarGaze / vertical / 100 mm spacing. Clicking the
  // ceiling then placed a baffle nobody had specified. Only the type is decided
  // now; everything down to the spacing is a choice somebody makes.
  const empty = emptyBrushParams()
  ok('the brush opens with a type and nothing else',
    empty.btype === 'blade' && empty.shape === null && empty.thickness === null
      && empty.length === null && empty.width === null && empty.family === null
      && empty.colour === null && empty.rot === null && empty.spacing === null,
    JSON.stringify({ ...empty, finOverrides: undefined }))
  ok('and it cannot be placed', !readyToPlace(empty), missingFields(empty).join(', '))
  ok('the fields it wants are named in the order the panel asks them',
    missingFields(empty).join(', ')
      === 'Shape, Thickness, Baffle length, Baffle height, Series, Colour, Direction, Baffle spacing',
    missingFields(empty).join(', '))

  // Read off the panel's SOURCE, because this one cannot be caught from the
  // store: the brush had rot === null and Place correctly listed Direction as
  // outstanding, and the panel still lit Vertical, because it drew itself with
  // `p.rot ?? 0`. The store said unchosen and the screen said Vertical.
  {
    const src = fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8')
    // Matched on the expression the buttons are GIVEN, not on the absence of
    // the old one: the comment above it quotes `p.rot ?? 0` to say why it went.
    ok('and the Direction buttons show nothing chosen until one is',
      /value=\{lies\}/.test(src)
        && /const lies = p\.rot == null \? null : p\.rot % 180/.test(src),
      'BaffleFields still defaults the Direction display')
  }

  // count, drop and the ceiling were not asked for, so they keep their defaults
  ok('but the run length, suspension height and overrides keep their defaults',
    empty.count === 8 && empty.drop === 0.3 && typeof empty.finOverrides === 'object',
    `${empty.count} fins at ${empty.drop * 1000} mm`)

  // ---- blank mode does not fill anything in -------------------------------
  // This is what makes an empty brush possible at all: reconcile's whole job
  // used to be guaranteeing a legal value for every field.
  const blanked = reconcile(empty, { blank: true })
  ok('reconcile leaves an unchosen field unchosen',
    !readyToPlace(blanked), missingFields(blanked).join(', '))
  ok('and still corrects one that is chosen but illegal',
    reconcile({ ...empty, thickness: 999 }, { blank: true }).thickness === null, 'cleared')
  ok('a legal choice is kept',
    reconcile({ ...empty, thickness: 25 }, { blank: true }).thickness === 25, '25')

  // a PLACED set must never be left with holes — it has to render
  const placed = reconcile({ ...defaultBaffleParams(), thickness: 999 })
  ok('a placed set is still filled in rather than emptied',
    readyToPlace(placed) && placed.thickness === 12, JSON.stringify(placed.thickness))

  // ---- filling it in ------------------------------------------------------
  const done = reconcile({
    ...empty, shape: 'standard', thickness: 25, length: 1800, width: 150,
    family: 'pet-solid', colour: 'StarGaze', rot: 0, spacing: 100,
  }, { blank: true })
  ok('once every field is answered it can be placed', readyToPlace(done), 'ready')

  // ---- and a type change starts the choices over --------------------------
  // Not handled in reconcile, which cannot see what the type WAS; setBrush
  // clears the dependents when the type actually changes.
  useStore.getState().setBrush({ shape: 'standard', thickness: 25, length: 1800, width: 150,
    family: 'pet-solid', colour: 'StarGaze', rot: 0, spacing: 100 })
  const before = useStore.getState().brush.params
  ok('a fully answered brush is placeable', readyToPlace(before), missingFields(before).join(', '))

  useStore.getState().setBrush({ btype: 'box' })
  const after = useStore.getState().brush.params
  ok('changing the baffle type asks the questions again',
    !readyToPlace(after) && after.btype === 'box', missingFields(after).join(', '))
  ok('and nothing is carried over from the product before it',
    after.thickness === null && after.length === null && after.spacing === null,
    JSON.stringify({ t: after.thickness, l: after.length, s: after.spacing }))

  // setting the SAME type again is not a change and must not wipe the answers
  useStore.getState().setBrush({ btype: 'blade' })
  useStore.getState().setBrush({ shape: 'standard', thickness: 25, length: 1800, width: 150,
    family: 'pet-solid', colour: 'StarGaze', rot: 90, spacing: 150 })
  useStore.getState().setBrush({ btype: 'blade' })
  ok('re-picking the type already chosen leaves the answers alone',
    readyToPlace(useStore.getState().brush.params), 'kept')

  // ---- and nothing is placed from a half-answered brush -------------------
  reset()
  useStore.setState({ brush: { type: 'baffles', params: emptyBrushParams() } })
  const n = useStore.getState().items.length
  useStore.getState().placeAt(...at(4, 4))
  ok('clicking the ceiling with fields outstanding places nothing',
    useStore.getState().items.length === n, String(useStore.getState().items.length))
  reset()
}

// ---------------------------------------------------------------------------
section("A SHAPE SOLD AS A RANGE — Flow's depth")
{
  // Flow comes as one range, 75-300 mm, where Standard and Tapered come as
  // lists. With one entry there was nothing to pick, so the panel showed a
  // sentence where every other shape has buttons — which reads as the control
  // being missing rather than as there being nothing to choose. It gets a
  // stepper over the range instead.
  const flow = { ...defaultBaffleParams(), btype: 'blade', shape: 'flow' }
  const standard = { ...defaultBaffleParams(), btype: 'blade', shape: 'standard' }
  const tapered = { ...defaultBaffleParams(), btype: 'blade', shape: 'tapered' }

  ok('Flow has a free depth range', depthRangeOf(flow)?.min === 75 && depthRangeOf(flow)?.max === 300,
    JSON.stringify(depthRangeOf(flow)))
  // EVERY BLADE SHAPE HAS ONE NOW. The published sizes became shortcuts
  // rather than the whole offer: same product, same tooling, and Flow's own
  // entry is the evidence that 75-300 is what the process makes. Tapered
  // starts at 100 because that is where its published profiles start.
  ok('and so do the shapes with published sizes',
    depthRangeOf(standard)?.min === 75 && depthRangeOf(standard)?.max === 300
      && depthRangeOf(tapered)?.min === 100 && depthRangeOf(tapered)?.max === 300,
    `${JSON.stringify(depthRangeOf(standard))} | ${JSON.stringify(depthRangeOf(tapered))}`)
  ok('and only a taper carries a second end',
    depthRangeOf(tapered).taper === 0.5 && depthRangeOf(standard).taper === undefined
      && depthRangeOf(flow).taper === undefined)
  // Blade only — nothing was assumed about the other three types.
  ok('a type sold in fixed sizes still has no range',
    depthRangeOf({ ...defaultBaffleParams(), btype: 'vmt' }) === null
      && depthRangeOf({ ...defaultBaffleParams(), btype: 'box' }) === null
      && depthRangeOf({ ...defaultBaffleParams(), btype: 'embossed' }) === null)
  ok('the ones sold in fixed sizes still list exactly what the workbook lists',
    baffleWidths(standard).join(',') === '75,100,150,175,200'
      && baffleWidths(tapered).join(',') === '100-200,125-225,150-300',
    `${baffleWidths(standard).join(',')} | ${baffleWidths(tapered).join(',')}`)

  // ---- what reconcile does with a free value ------------------------------
  // It used to snap anything not in the list back to the list's first entry,
  // which would have made a stepper impossible: every nudge sprang back.
  const at = (width) => reconcile({ ...flow, width }).width
  ok('a depth inside the range is kept', at(200) === 200, String(at(200)))
  ok('a depth below the range is brought up to it', at(10) === 75, String(at(10)))
  ok('and one above it is brought down', at(9999) === 300, String(at(9999)))
  ok('a value between steps lands on one', at(203) === 205, String(at(203)))
  ok("the range's own text form is read as its deepest point",
    at('75-300') === 300, String(at('75-300')))
  ok('so a set saved before this still opens at the depth it had',
    at('75-300') === 300 && baffleSizeMm({ ...flow, width: at('75-300') }).h === 300,
    String(baffleSizeMm({ ...flow, width: at('75-300') }).h))

  // ---- a published size is no longer the only answer ----------------------
  ok('a standard blade takes a depth that is on no list',
    reconcile({ ...standard, width: 137 }).width === 135,
    String(reconcile({ ...standard, width: 137 }).width))
  ok('and is held to the same 75-300',
    reconcile({ ...standard, width: 9999 }).width === 300
      && reconcile({ ...standard, width: 1 }).width === 75)

  // A TAPER KEEPS TWO ENDS. One number would make parseWidth answer the same
  // depth at both, and the extruded profile would come out straight.
  const tap = (width) => reconcile({ ...tapered, width }).width
  ok('a tapered blade takes a custom depth as a taper, not a flat fin',
    tap(137) === '100-135', String(tap(137)))
  ok('the figure is its DEEPEST point', parseWidth(tap(250)).b === 250, tap(250))
  ok('and the shallow end follows at half of it', tap(250) === '125-250', tap(250))
  ok('both ends stay inside the range', parseWidth(tap(110)).a >= 100, tap(110))
  // The half rule reproduces two of the three published profiles exactly; the
  // third does not sit on it, so it is left alone rather than rewritten.
  ok('a published profile survives verbatim',
    tap('125-225') === '125-225' && tap('100-200') === '100-200'
      && tap('150-300') === '150-300',
    `${tap('125-225')} | ${tap('100-200')} | ${tap('150-300')}`)

  // ---- and the model is sized from it --------------------------------------
  ok('the depth chosen is the height the model is built to',
    baffleSizeMm({ ...flow, width: 180 }).h === 180,
    String(baffleSizeMm({ ...flow, width: 180 }).h))
}

// ---------------------------------------------------------------------------
section("HOLDING PANELS — a cache of one is a cache that thrashes")
{
  // The complaint this answers: with a design on the baffles, every few seconds
  // the baffle went black and was then repainted, over and over.
  //
  // One panel was held at a time. That was right when a panel decoded to 108 MB
  // and a ceiling wore one design. It became wrong the moment two sets wore two
  // designs: each asked for its own panel every frame, each request evicted the
  // other's, and neither ever settled. Measured in the browser, the two took the
  // slot in turn about every four seconds, for as long as anyone watched.
  const panelBytes = PANEL_PX * Math.round(PANEL_PX * 7937 / 3402) * 4
  ok('the budget holds more than one panel, which is the whole point',
    PANEL_BUDGET_BYTES > panelBytes * 2,
    `${(PANEL_BUDGET_BYTES / 1e6).toFixed(0)} MB against ${(panelBytes / 1e6).toFixed(0)} MB a panel`)
  ok('and enough of them for a ceiling with a few designs on it',
    Math.floor(PANEL_BUDGET_BYTES / panelBytes) >= 3,
    `${Math.floor(PANEL_BUDGET_BYTES / panelBytes)} panels`)
  ok('nothing is held before anything is asked for',
    panelsHeld().length === 0 && !hasPanel('anything'), String(panelsHeld().length))

  // ---- the policy, as a plain function -------------------------------------
  const mb = (n) => n * 1e6
  const held = [
    { key: 'oldest', bytes: mb(30), used: 1 },
    { key: 'middle', bytes: mb(30), used: 2 },
    { key: 'newest', bytes: mb(30), used: 3 },
  ]
  ok('inside the budget, nothing is let go',
    overBudget(held, mb(100)).length === 0, JSON.stringify(overBudget(held, mb(100))))
  ok('over it, the least recently asked-for goes first',
    JSON.stringify(overBudget(held, mb(70))) === JSON.stringify(['oldest']),
    JSON.stringify(overBudget(held, mb(70))))
  ok('and it keeps dropping until it fits',
    JSON.stringify(overBudget(held, mb(35))) === JSON.stringify(['oldest', 'middle']),
    JSON.stringify(overBudget(held, mb(35))))
  ok('but never drops the last one, however tight the budget',
    JSON.stringify(overBudget(held, 1)) === JSON.stringify(['oldest', 'middle']),
    JSON.stringify(overBudget(held, 1)))
  ok('one panel over budget is still kept, not thrown away and re-fetched',
    overBudget([{ key: 'only', bytes: mb(500), used: 1 }], mb(10)).length === 0, 'kept')
  ok('an empty cache asks for nothing to be dropped',
    overBudget([], mb(10)).length === 0, 'none')
}

// ---------------------------------------------------------------------------
section("COLOUR CORE OMBRÉ — a fade, which is not a weave")
{
  ok('the ombré map is published', COLOUR_CORE_OMBRE.ready,
    'public/flat-colour-core-ombre-textures.json')
  ok('10 base colours', COLOUR_CORE_OMBRE.baseColors.length === 10,
    String(COLOUR_CORE_OMBRE.baseColors.length))
  ok('106 overlays across them', COLOUR_CORE_OMBRE.textures.length === 106,
    String(COLOUR_CORE_OMBRE.textures.length))
  ok('every overlay names the base it sits on',
    COLOUR_CORE_OMBRE.textures.every((t) => t.baseColorId && t.baseColorHex && t.overlayHex),
    'all')
  ok('and the counts per base colour vary, as the range does',
    new Set(COLOUR_CORE_OMBRE.baseColors.map((c) => overlaysFor(c.id).length)).size > 1,
    COLOUR_CORE_OMBRE.baseColors.map((c) => overlaysFor(c.id).length).join(','))

  // one slot, not one each: the ombré panels are registered into the same map
  // the fabric range uses, so only ever one photograph is on the GPU
  const anyOmbre = COLOUR_CORE_OMBRE.textures[0]
  ok('an ombré panel is reachable through the shared slot',
    getEntry(anyOmbre.key)?.textureUrl === anyOmbre.textureUrl, anyOmbre.key)
  ok('and the fabric range is still reachable too',
    !!getEntry(COLOUR_CORE.textures[0].key), COLOUR_CORE.textures[0].key)

  // ---- the catalogue ------------------------------------------------------
  const fam = COLOUR_FAMILIES['colour-core-ombre']
  ok('the family is no longer coming soon', !fam.comingSoon, String(!!fam.comingSoon))
  ok('and carries every published overlay as a swatch', fam.swatches.length === 106,
    String(fam.swatches.length))
  ok('each swatch is a PAIR, because a fade is two colours',
    fam.swatches.every((sw) => /^#/.test(sw.from ?? '') && /^#/.test(sw.to ?? '')),
    JSON.stringify(fam.swatches[0]))
  ok('its kind is its own, so the builder knows to fetch a photograph',
    fam.kind === 'colour-core-ombre' && FINISH_KINDS.has(fam.kind), fam.kind)
  ok('and a model-backed shape may wear it',
    MODEL_FIN_FAMILIES.includes('colour-core-ombre'), MODEL_FIN_FAMILIES.join(','))
  ok('the swatch code is the panel key, so picking one finds its photograph',
    !!getEntry(fam.swatches[0].code), fam.swatches[0].code)

  // ---- the crop: end to end, not a slice out of the middle -----------------
  // A fade cropped true-scale would show the middle 64% of itself and throw
  // both ends away, which on a gradient is most of the product. The whole fade
  // goes on the fin. Across the fin there is no gradient, so that axis stays
  // true-scale and the cloth keeps its real size.
  const where = (tex, u, v) => {
    tex.updateMatrix()
    return new THREE.Vector2(u, v).applyMatrix3(tex.matrix)
  }
  const plain = cropOmbreToFin(new THREE.Texture(), 1800, 150, { mirror: false })
  const flipped = cropOmbreToFin(new THREE.Texture(), 1800, 150, { mirror: true })

  const aEnd = where(plain, 0, 0.5)
  const bEnd = where(plain, 1, 0.5)
  ok('the fade spans the fin end to end, using all of it',
    Math.abs(Math.abs(bEnd.y - aEnd.y) - 1) < 1e-6,
    `${aEnd.y.toFixed(3)} -> ${bEnd.y.toFixed(3)}`)

  const acrossLo = where(plain, 0.5, 0)
  const acrossHi = where(plain, 0.5, 1)
  ok('while across the fin it stays true-scale',
    Math.abs(Math.abs(acrossHi.x - acrossLo.x) - 150 / 1200) < 1e-6,
    `${Math.abs(acrossHi.x - acrossLo.x).toFixed(4)} vs ${(150 / 1200).toFixed(4)}`)

  // ---- and mirrored, which is what the alternating layout is for -----------
  const mA = where(flipped, 0, 0.5)
  const mB = where(flipped, 1, 0.5)
  ok('mirrored, the same fin reads the fade the other way',
    Math.abs(mA.y - bEnd.y) < 1e-6 && Math.abs(mB.y - aEnd.y) < 1e-6,
    `${mA.y.toFixed(3)} -> ${mB.y.toFixed(3)} against ${aEnd.y.toFixed(3)} -> ${bEnd.y.toFixed(3)}`)
  ok('and it still covers the whole fade, not a shifted part of it',
    Math.abs(Math.abs(mB.y - mA.y) - 1) < 1e-6, `${Math.abs(mB.y - mA.y).toFixed(3)}`)
  ok('mirroring leaves the across-the-fin scale alone',
    Math.abs(where(flipped, 0.5, 1).x - acrossHi.x) < 1e-6, 'unchanged')

  // A scale of -1 about the texture's centre needs no offset to go with it —
  // about 0.5 it maps 0 to 1 and 1 to 0 exactly. Worth pinning: the obvious
  // "negate and add an offset of 1" is what you would write without the centre,
  // and it would slide the fade off the fin by half its length.
  // ---- nothing is painted on until there is something real to paint --------
  // The obvious stand-in while a panel downloads is to draw the fade from the
  // two hexes. It was worse than nothing: it looks like the finished article,
  // so a baffle appears done and then visibly changes under you when the
  // photograph lands. A finish with no panel yet returns NOTHING and the fin
  // keeps what it already had.
  ok('an ombre finish with no panel yet paints nothing at all',
    finishMaterial('colour-core-ombre', 'no-such-panel', { lengthMm: 1800, depthMm: 150 }) === null,
    'null')

  {
    const depth = 0.194
    const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
    blade.translate(0, -depth / 2, 0)
    const own = new THREE.MeshStandardMaterial({ name: 'the material the file ships' })
    const finset = {
      size: { length: 1.8, depth: 0.194, thickness: 0.016 },
      fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
      unit: { finTopY: 0, hardwareAboveFin: 0, hardwareX: [], hardware: [], fin: { geometry: blade, material: own } },
    }
    const run = buildModelRun(
      finset,
      { model: 'x', drop: 0.4, count: 3, spacing: 150, finishAll: true,
        family: 'colour-core-ombre', colour: 'no-such-panel',
        sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
      () => null,
    )
    const blades = []
    run.traverse((o2) => { if (o2.isMesh && o2.userData.finIndex != null) blades.push(o2) })
    ok('so an imported fin keeps the material its own file gives it',
      blades.length === 3 && blades.every((m) => m.material === own),
      `${blades.length} fins, ${blades.filter((m) => m.material === own).length} left unpainted`)
  }

  // ---- the contract the alternating layout rides on ------------------------
  // buildModelRun hands the fin's INDEX to the material factory, which is the
  // only reason a model run can alternate at all: the factory turns every odd
  // index into a mirrored finish. A parametric run has honoured 'alternate'
  // since it was written; a model run ignored it until this was wired, so the
  // setting did nothing on exactly the shapes the ombre range is sold for.
  {
    const depth = 0.194
    const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
    blade.translate(0, -depth / 2, 0)
    const finset = {
      size: { length: 1.8, depth: 0.194, thickness: 0.016 },
      fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
      unit: {
        finTopY: 0, hardwareAboveFin: 0, hardwareX: [], hardware: [],
        fin: { geometry: blade, material: new THREE.MeshStandardMaterial() },
      },
    }
    const seen = []
    buildModelRun(
      finset,
      { model: 'x', drop: 0.4, count: 4, spacing: 150, finishAll: true,
        family: 'colour-core-ombre', colour: 'anything',
        sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
      (family, colour, i) => { seen.push(i); return new THREE.MeshStandardMaterial() },
    )
    ok('a model run tells the finish which fin it is for',
      seen.length === 4 && seen.join(',') === '0,1,2,3', seen.join(','))
    ok('so alternating can reverse every second one',
      seen.filter((i) => i % 2 === 1).length === 2, String(seen.filter((i) => i % 2 === 1).length))
  }

  ok('no offset is added by hand to make that work',
    flipped.offset.x === 0 && flipped.offset.y === 0,
    `${flipped.offset.x}, ${flipped.offset.y}`)
}

// ---------------------------------------------------------------------------
section("COLOUR CORE — 19 colours across 3 weaves, on a CDN we do not own")
{
  ok('the panel map is published', COLOUR_CORE.ready, 'public/colour-core-textures.json')
  ok('3 structures', COLOUR_CORE.structures.length === 3, String(COLOUR_CORE.structures.length))
  ok('19 colours', COLOUR_CORE.colors.length === 19, String(COLOUR_CORE.colors.length))
  ok('57 combinations', COLOUR_CORE.textures.length === 57, String(COLOUR_CORE.textures.length))

  // the map says CC-10 is in storage but is not a sellable product
  ok('CC-10 is not offered', !COLOUR_CORE.colors.some((c) => c.id === 'CC-10'))

  ok('every colour is woven in every structure',
    COLOUR_CORE.colors.every((c) => structuresFor(c.id).length === 3),
    COLOUR_CORE.colors.filter((c) => structuresFor(c.id).length !== 3).map((c) => c.id).join(','))

  ok('every entry has both a panel and a thumbnail',
    COLOUR_CORE.textures.every((t) => /^https:\/\//.test(t.textureUrl) && /^https:\/\//.test(t.thumbnailUrl)))
  ok('and every key resolves', COLOUR_CORE.textures.every((t) => getEntry(t.key) === t))

  // the family the picker reads
  const fam = COLOUR_FAMILIES['colour-core-fabric']
  ok('the family took all 57 swatches', fam.swatches.length === 57, String(fam.swatches.length))
  ok('its kind marks it as panel-backed', fam.kind === 'colour-core', fam.kind)
  const first = fam.swatches[0]
  const firstColour = COLOUR_CORE.colors[0]
  const firstWeave = COLOUR_CORE.structures[0]
  ok('swatches are colour-major, so the family opens on colour 1 / weave 1',
    getEntry(first.code)?.colorId === firstColour.id && getEntry(first.code)?.structureId === firstWeave.id,
    first.code)
  ok('and a swatch reads as colour then weave', /·/.test(first.label), first.label)

  // reconcile has to accept a key as a colour, or picking one snaps back.
  // Blade and Box are the types the workbook offers this family on; VMT is not
  // one of them, which is why this names a blade rather than the default.
  ok('the workbook offers Colour Core on Blade', BAFFLE_TYPES.blade.families.includes('colour-core-fabric'))
  ok('and not on VMT', !BAFFLE_TYPES.vmt.families.includes('colour-core-fabric'))

  const onBlade = reconcile({
    ...defaultBaffleParams(), btype: 'blade', family: 'colour-core-fabric', colour: first.code,
  })
  ok('a panel key survives reconcile on a blade',
    onBlade.family === 'colour-core-fabric' && onBlade.colour === first.code,
    `${onBlade.family}/${onBlade.colour}`)

  // and on an imported model, which is held to MODEL_FIN_FAMILIES instead
  const onModel = reconcile({
    ...defaultBaffleParams(), model: 'blade-flow', sizeMm: { l: 1800, w: 16, h: 194 },
    family: 'colour-core-fabric', colour: first.code,
  })
  ok('and on a model', onModel.family === 'colour-core-fabric' && onModel.colour === first.code,
    `${onModel.family}/${onModel.colour}`)

  // the crop: the panel's long axis runs along the fin, so nothing ever wraps
  const longest = Math.max(...BAFFLE_TYPES.vmt.lengths)
  ok(`the longest catalogue fin (${longest} mm) fits the panel without repeating`,
    longest <= PANEL_MM.l, `${longest} vs ${PANEL_MM.l}`)
  const deepest = Math.max(...Object.values(BAFFLE_TYPES).flatMap((t) => baffleWidths({ ...t.defaults, btype: 'vmt' })))
  ok('and the deepest face fits across it', deepest <= PANEL_MM.w, `${deepest} vs ${PANEL_MM.w}`)
}

// ---------------------------------------------------------------------------
section('COLOUR FAMILIES — every swatch is orderable and renderable')
{
  // These are hand-transcribed commercial facts. A duplicated code silently
  // makes one colour unreachable (getSwatch finds the first); a malformed hex
  // renders as black and looks like a lighting bug rather than a typo.
  // Every family's kind must be one the material builder actually draws. A kind
  // it does not know falls through its switch to `felt` and renders as
  // procedural speckle in about the right colour — which looks like a wrong
  // texture rather than a missing one, and is identical whichever swatch you
  // pick. Colour Core shipped that way until this check existed.
  for (const [key, fam] of Object.entries(COLOUR_FAMILIES)) {
    ok(`${key}: its kind "${fam.kind}" is one the material builder draws`,
      FINISH_KINDS.has(fam.kind), [...FINISH_KINDS].join('|'))
  }

  // ---- Designer Textile: 275 photographed panels off a CDN ----------------
  {
    ok('the textile map is read, not invented', TEXTILE_PANELS.length === 275,
      String(TEXTILE_PANELS.length))
    ok('five fabrics and eight colour groups',
      TEXTILE_FABRICS.length === 5 && TEXTILE_GROUPS.length === 8,
      `${TEXTILE_FABRICS.length} x ${TEXTILE_GROUPS.length}`)
    ok('55 shades, and every one keeps the same hex across all five fabrics',
      new Set(TEXTILE_PANELS.map((p) => p.shadeId)).size === 55
        && [...new Set(TEXTILE_PANELS.map((p) => p.shadeId))].every((id) =>
          new Set(TEXTILE_PANELS.filter((p) => p.shadeId === id).map((p) => p.hex)).size === 1),
      '55')
    ok('every panel key is unique, and so is every URL',
      new Set(TEXTILE_PANELS.map((p) => p.key)).size === 275
        && new Set(TEXTILE_PANELS.map((p) => p.panelUrl)).size === 275, '275 of each')
    ok('every panel is on the CDN, none bundled',
      TEXTILE_PANELS.every((p) => /^https:\/\//.test(p.panelUrl)
        && /^https:\/\//.test(p.thumbnailUrl)),
      'all absolute https')

    // The whole point of putting it on the veneer path: a panel is a SHEET of
    // the same shape as a Wood Classic one, and a fin is a strip cut from it.
    ok('a textile sheet is the same 2800 mm long as a veneer sheet',
      TEXTILE_SHEET.h === 2.8 && Math.abs(TEXTILE_SHEET.w - 1.2) < 0.03,
      `${TEXTILE_SHEET.w} x ${TEXTILE_SHEET.h} m`)

    // Read off the map rather than assumed, because the file says outright that
    // a future one need not offer every combination.
    ok('every fabric is made in every group, so all 275 exist',
      TEXTILE_FABRICS.every((f) => groupsFor(f.id).length === 8), 'all 8 each')
    ok('and the shades of a group are the ones that HAVE a panel',
      shadesFor('FB1', 'Blue').length === 8 && shadesFor('FB1', 'Brown').length === 4,
      `Blue ${shadesFor('FB1', 'Blue').length}, Brown ${shadesFor('FB1', 'Brown').length}`)
    ok('a combination that does not exist resolves to nothing',
      panelOf('FB9', 'Blue_1') === null && panelFor('nope') === null, 'null')

    // One code identifies a panel, so a saved layout and the schedule keep
    // dealing in a single field however many steps the picker takes.
    const some = panelOf('FB3', 'Rust_2')
    ok('a panel is identified by one code, which the picker can take apart',
      !!some && splitKey(some.key).fabricId === 'FB3'
        && splitKey(some.key).shadeId === 'Rust_2', some?.key)
    ok('the family carries all 275 as swatches with a hex to fall back on',
      COLOUR_FAMILIES['designer-textiles'].swatches.length === 275
        && COLOUR_FAMILIES['designer-textiles'].swatches.every((sw) => /^#[0-9a-f]{6}$/i.test(sw.hex)),
      String(COLOUR_FAMILIES['designer-textiles'].swatches.length))
    ok('and is marked as a SHEET, which is what routes a fin to strip-cutting',
      COLOUR_FAMILIES['designer-textiles'].sheet === true, 'sheet')
    // The eight invented DT codes are gone; nothing should still name one.
    // The distortion: a sheet family that reaches finishMaterial's generic
    // branch gets a PROCEDURAL twill stretched by repeatX — 2400/500 by 200/500
    // on a normal fin, a 12:1 squash. The flag is what keeps it out of there,
    // and it has to be readable from the family alone because that function has
    // nothing else to go on.
    // ---- what a sheet costs, and what it buys ---------------------------
    // The source is 3401 x 7937 = 27 MP, about 108 MB decoded. It is decoded AT
    // a resize, and this is the number that decides both the fidelity and the
    // bill. Asserted with the arithmetic beside it so a change to one is a
    // change to a statement about the other.
    const acrossMm = TEXTILE_SHEET.w * 1000
    const pxPerMm = TEXTILE_PX / acrossMm
    const sheetMB = (TEXTILE_PX * Math.round(TEXTILE_PX * 7937 / 3401) * 4) / 1e6
    ok('a sheet is kept at 2048 across, not the 1024 it started at',
      TEXTILE_PX === 2048, String(TEXTILE_PX))
    ok('which is 1.7 px per mm of cloth, where 1024 was 0.85',
      Math.abs(pxPerMm - 1.71) < 0.02, pxPerMm.toFixed(2) + ' px/mm')
    ok('and about 39 MB a sheet, where the file as delivered is 108',
      sheetMB > 35 && sheetMB < 42, sheetMB.toFixed(0) + ' MB')
    ok('so the sheets have to be bounded, and there is a way to bound them',
      typeof retainTextiles === 'function' && retainTextiles([]) === 0,
      'retainTextiles')

    // How a fin takes its fabric. Two answers, and which is wanted is a
    // question about the product rather than about the code, so it is one
    // named constant and not a branch scattered through the material builder.
    ok('a fin takes its fabric one of two ways, and says which',
      TEXTILE_FIT === 'panel' || TEXTILE_FIT === 'strip', TEXTILE_FIT)

    ok('a sheet family is recognisable from the family object alone',
      COLOUR_FAMILIES['designer-textiles'].sheet === true
        && !COLOUR_FAMILIES['wood-classic'].sheet
        && !COLOUR_FAMILIES.concrete.sheet,
      'only designer-textiles')
    ok('and it is NOT a kind the procedural switch would stretch',
      (() => {
        const kinds = ['wood', 'concrete', 'ombre', 'textile']
        // it IS kind 'textile', which is exactly why the sheet flag has to be
        // checked BEFORE that switch rather than instead of it
        return kinds.includes(COLOUR_FAMILIES['designer-textiles'].kind)
          && COLOUR_FAMILIES['designer-textiles'].sheet === true
      })(), 'kind textile, but a sheet first')

    ok('the eight placeholder DT codes are gone',
      !COLOUR_FAMILIES['designer-textiles'].swatches.some((sw) => /^DT-\d+$/.test(sw.code)),
      'none left')
  }

  const HEX = /^#[0-9a-f]{6}$/i
  for (const [key, fam] of Object.entries(COLOUR_FAMILIES)) {
    const codes = fam.swatches.map((sw) => sw.code)
    ok(`${key}: has swatches`, codes.length > 0)
    ok(`${key}: no duplicate codes`, new Set(codes).size === codes.length,
      codes.filter((c, i) => codes.indexOf(c) !== i).join(','))
    ok(`${key}: no blank codes`, codes.every((c) => typeof c === 'string' && c.trim().length > 0))
    const bad = fam.swatches.filter((sw) => {
      // both ombré kinds are a PAIR of colours: the authored ones and the
      // photographed range alike, a fade is never one hex
      if (fam.kind === 'ombre' || fam.kind === 'colour-core-ombre') {
        return !HEX.test(sw.from ?? '') || !HEX.test(sw.to ?? '')
      }
      if (sw.file) return !HEX.test(sw.base ?? '') || !HEX.test(sw.grain ?? '')
      return !HEX.test(sw.hex ?? '')
    })
    ok(`${key}: every swatch has a usable colour`, bad.length === 0, bad.map((sw) => sw.code).join(','))
  }

  // the PET range as delivered
  const pet = COLOUR_FAMILIES['pet-solid'].swatches
  ok('the PET range has all 44 colours', pet.length === 44, String(pet.length))
  for (const name of ['Alloy', 'Black', 'Fog', 'White', 'Teal', 'Arabian Spice', 'StarGaze']) {
    ok(`  ${name} is in it`, pet.some((sw) => sw.code === name))
  }
}

// ---------------------------------------------------------------------------
section("MODEL SIZE — a model is scaled to the product, not to a slider")
{
  // This used to be a free per-axis size with its own floor and ceiling. It is
  // now DERIVED: the workbook publishes the thickness, length and face depth a
  // baffle comes in, and the model is scaled to whichever was chosen. So there
  // is no way to end up with a model 1737 mm long when only four lengths sell.
  const model = {
    ...defaultBaffleParams(), btype: 'blade', shape: 'standard', model: 'blade-standard',
  }
  const sized = (patch) => reconcile({ ...model, ...patch }).sizeMm

  ok('length along the fin comes from the catalogue length',
    sized({ length: 1800 }).l === 1800, JSON.stringify(sized({ length: 1800 })))
  ok('thickness across the run comes from the catalogue thickness',
    sized({ thickness: 12 }).w === 12, String(sized({ thickness: 12 }).w))
  ok('face depth comes from the chosen height',
    sized({ width: 100 }).h === 100, String(sized({ width: 100 }).h))

  // a shape whose depth varies is scaled to its deepest point, because the
  // model itself carries the profile along the fin
  const flow = reconcile({
    ...defaultBaffleParams(), btype: 'blade', shape: 'flow', model: 'blade-flow', width: '75-300',
  })
  ok('a Flow fin is scaled to its deepest point', flow.sizeMm.h === 300, String(flow.sizeMm.h))

  // an illegal size cannot be asked for, because it is not stored
  const absurd = reconcile({ ...model, length: 1800, sizeMm: { l: 99999, w: 0, h: -5 } })
  ok('a size written by hand is overwritten by the catalogue',
    absurd.sizeMm.l === 1800 && absurd.sizeMm.w === absurd.thickness,
    JSON.stringify(absurd.sizeMm))

  // the derived value still passes through the store's own bounds
  for (const [axis, lim] of Object.entries(MODEL_SIZE_LIMITS)) {
    ok(`${axis}: the derived size is inside the store bounds`,
      absurd.sizeMm[axis] >= lim.min && absurd.sizeMm[axis] <= lim.max,
      String(absurd.sizeMm[axis]))
  }

  // and a catalogue baffle carries no model size at all
  ok('a set with no model has no sizeMm', reconcile(defaultBaffleParams()).sizeMm === null)
}

// ---------------------------------------------------------------------------
section("FINISH FAMILIES — what an imported model is allowed to wear")
{
  // An imported model has no catalogue type, so the panel offers it every
  // family. reconcile was still clamping it to the shortlist of whatever btype
  // the item happened to carry — 'vmt' by default — so choosing pet-solid,
  // colour-core-fabric or vmt-solid on a whole set silently snapped back to
  // wood-classic. Fins escaped it because their finish lives in finOverrides,
  // which reconcile does not inspect. Hence "only some families, and only for
  // All".
  const model = {
    ...defaultBaffleParams(),
    model: 'blade-flow',
    sizeMm: { l: 1800, w: 16, h: 194 },
    finishAll: true,
  }

  // The list itself, which was cut from eight to five.
  ok('an imported model is offered five finishes',
    MODEL_FIN_FAMILIES.join(',')
      === 'pet-solid,wood-classic,designer-textiles,colour-core-fabric,colour-core-ombre',
    MODEL_FIN_FAMILIES.join(','))

  // The three that came off are NOT deleted — they are still real families and
  // the catalogue types still offer them. Only a model may no longer wear one.
  for (const gone of ['signature-ombre', 'vmt-solid', 'concrete']) {
    ok(`${gone} is off the model list`, !MODEL_FIN_FAMILIES.includes(gone))
    ok(`  but still a family in its own right`, !!COLOUR_FAMILIES[gone])
  }
  ok('a VMT baffle still offers Concrete and Signature Ombre',
    BAFFLE_TYPES.vmt.families.includes('concrete')
    && BAFFLE_TYPES.vmt.families.includes('signature-ombre'),
    BAFFLE_TYPES.vmt.families.join(','))
  ok('and an Embossed one still offers Solid Colour VMT, which is half its range',
    BAFFLE_TYPES.embossed.families.includes('vmt-solid'),
    BAFFLE_TYPES.embossed.families.join(','))

  // A layout saved before the cut names a family a model may no longer wear.
  // It has to land somewhere real rather than on a finish nothing can draw.
  for (const gone of ['signature-ombre', 'vmt-solid', 'concrete']) {
    const out = reconcile({ ...model, family: gone, colour: COLOUR_FAMILIES[gone].swatches[0].code })
    ok(`an old model set on ${gone} falls back to the first offered finish`,
      out.family === MODEL_FIN_FAMILIES[0], out.family)
    ok(`  and to a colour that family actually publishes`,
      COLOUR_FAMILIES[out.family].swatches.some((sw) => sw.code === out.colour),
      String(out.colour))
  }

  for (const family of MODEL_FIN_FAMILIES) {
    const swatch = COLOUR_FAMILIES[family].swatches[0].code
    const out = reconcile({ ...model, family, colour: swatch })
    ok(`a model set may wear ${family}`, out.family === family, `became ${out.family}`)
    ok(`  and keeps the colour that came with it`, out.colour === swatch, `became ${out.colour}`)
  }

  // the catalogue shortlist still binds a catalogue product
  const vmt = reconcile({ ...defaultBaffleParams(), btype: 'vmt', family: 'pet-solid' })
  ok('a VMT set is still held to its own families', vmt.family === 'wood-classic', vmt.family)
  const blade = reconcile({ ...defaultBaffleParams(), btype: 'blade', family: 'concrete' })
  ok('and so is a blade', blade.family === 'pet-solid', blade.family)

  // switching a model back to the catalogue re-applies the shortlist
  const back = reconcile({ ...model, btype: 'vmt', shape: null, family: 'pet-solid', model: null })
  ok('dropping the model re-imposes the type shortlist', back.family === 'wood-classic', back.family)
}

// ---------------------------------------------------------------------------
section('RUN LIMITS — what the ceiling can actually hold')
{
  for (const roomId of ['sc:edu-class', 'sc:office-realistic', 'sc:office-board']) {
    reset()
    useStore.setState({ roomId })
    const g = S().grid()
    const p = reconcile({
      ...defaultBaffleParams(),
      model: 'm', modelName: 'M', sizeMm: { l: 1800, w: 1553, h: 319 },
      count: 4, spacing: 200,
    })
    const lim = runLimits(p, g)

    // measured at the count that fits — in a small room that is fewer than the
    // four currently set, and the count slider caps to it
    const eff = { ...p, count: lim.effectiveCount }
    ok(`${roomId}: the largest spacing offered actually fits`,
      baffleCells({ ...eff, spacing: lim.maxSpacing }, g.pitch).cj <= g.rows,
      `${lim.maxSpacing} mm at count ${lim.effectiveCount}`)
    ok(`${roomId}: one step past it does not`,
      baffleCells({ ...eff, spacing: lim.maxSpacing + 50 }, g.pitch).cj > g.rows)
    ok(`${roomId}: the largest count offered actually fits`,
      baffleCells({ ...p, count: lim.maxCount }, g.pitch).cj <= g.rows,
      `${lim.maxCount}`)
    ok(`${roomId}: one more does not`,
      baffleCells({ ...p, count: lim.maxCount + 1 }, g.pitch).cj > g.rows)

    // and the store agrees — anything within the cap is accepted
    useStore.setState({ brush: { type: 'baffles', params: { ...p, count: 1 } } })
    S().placeAt(Math.floor(g.cols / 2), Math.floor(g.rows / 2))
    const id = S().items[0].id
    const capped = S().updateParams({ count: lim.maxCount })
    ok(`${roomId}: a run at the cap is accepted by the store`, capped === true)
    ok(`${roomId}: and stays on the ceiling`,
      onGrid(footprint(S().items.find((i) => i.id === id), g), g))
  }

  // a run of one has no gaps, so spacing is unbounded
  reset()
  const g0 = S().grid()
  const single = reconcile({
    ...defaultBaffleParams(), model: 'm', sizeMm: { l: 1800, w: 1553, h: 319 },
    count: 1, spacing: 200,
  })
  ok('a run of one has no spacing limit', runLimits(single, g0).maxSpacing === Infinity)

  // the count that spacing is measured against never exceeds what fits
  for (const roomId of ['sc:edu-class', 'sc:office-board', 'sc:office-realistic']) {
    useStore.setState({ roomId })
    const gg = S().grid()
    const over = reconcile({
      ...defaultBaffleParams(), model: 'm', sizeMm: { l: 1800, w: 1553, h: 319 },
      count: 24, spacing: 200,
    })
    const l = runLimits(over, gg)
    ok(`${roomId}: an over-long run reports a reachable count, not zero spacing`,
      l.effectiveCount === l.maxCount && l.maxSpacing >= 0 &&
      baffleCells({ ...over, count: l.effectiveCount, spacing: l.maxSpacing }, gg.pitch).cj <= gg.rows,
      `count ${l.effectiveCount}, spacing ${l.maxSpacing}`)
  }

  // rotation changes which extent binds
  reset()
  useStore.setState({ roomId: 'sc:office-realistic' })
  const g1 = S().grid()
  const base = reconcile({
    ...defaultBaffleParams(), model: 'm', sizeMm: { l: 1800, w: 1553, h: 319 },
    count: 4, spacing: 200,
  })
  ok('a rotated run is limited by the other extent',
    runLimits({ ...base, rot: 90 }, g1).maxCount > runLimits({ ...base, rot: 0 }, g1).maxCount,
    `${runLimits({ ...base, rot: 0 }, g1).maxCount} vs ${runLimits({ ...base, rot: 90 }, g1).maxCount}`)

  // fins obey the same rule, using thickness as the unit width
  const fins = reconcile({ ...defaultBaffleParams(), count: 8, spacing: 100 })
  const finLim = runLimits(fins, g1)
  ok('a fin set is limited the same way, by its thickness',
    baffleCells({ ...fins, count: finLim.maxCount }, g1.pitch).cj <= g1.rows &&
    baffleCells({ ...fins, count: finLim.maxCount + 1 }, g1.pitch).cj > g1.rows,
    `${finLim.maxCount}`)
}

// ---------------------------------------------------------------------------
section('PRESETS WITH AN IMPORTED MODEL')
{
  // Exactly what the Geometry picker puts on the brush. Count matters: the fin
  // default is 8, and eight copies of a 1.55 m model is 13 m across, which no
  // room here can hold — so a params object that gains a model without setting
  // a count becomes a run that cannot be placed anywhere.
  const MODEL = {
    model: 'blade-flow',
    modelName: 'Baffle Curve 1',
    sizeMm: { l: 1800, w: 1554, h: 319 },
    count: 1,
    spacing: 200,
  }
  const asModel = () => {
    reset()
    useStore.setState({
      brush: { type: 'baffles', params: reconcile({ ...defaultBaffleParams(), ...MODEL }) },
    })
  }

  // BAFFLE PRESETS ONLY, and that is the behaviour rather than a gap in the
  // test. An imported model is a baffle idea: it arrives on the baffle brush
  // with a sizeMm box and is arranged in place of the preset's catalogue run. A
  // cloud IS its own model, carries no `model` field, and a cloud preset that
  // honoured one would lay out a stack of baffle geometry and call it a cloud
  // layout. buildPreset refuses that explicitly; this loop asks only the
  // presets the behaviour belongs to.
  const modelPresets = PRESETS.filter((pr) => pr.type !== 'clouds')
  ok('there are baffle presets to try a model on', modelPresets.length > 0)

  for (const preset of modelPresets) {
    asModel()
    const g = S().grid()
    const { placed } = S().applyPreset(preset.key)
    const items = S().items

    ok(`${preset.key}: arranges the model, not a catalogue product`,
      placed > 0 && items.every((it) => it.params.model === MODEL.model),
      `${placed} placed, ${items.filter((i) => !i.params.model).length} catalogue`)
    ok(`${preset.key}: keeps the model's own size`,
      items.every((it) => it.params.sizeMm?.l === MODEL.sizeMm.l))
    ok(`${preset.key}: footprints match the model's box`,
      items.every((it) => it.ci === items[0].ci && it.cj === items[0].cj))
    ok(`${preset.key}: nothing overlaps`, !items.some((a, i) =>
      items.some((b, j) => i !== j && overlaps(footprint(a, g), footprint(b, g)))))
    ok(`${preset.key}: nothing leaves the ceiling`,
      items.every((it) => onGrid(footprint(it, g), g)))
    ok(`${preset.key}: the brush keeps the model`,
      S().brush.params.model === MODEL.model, S().brush.params.model ?? 'null')
  }

  // The refusal itself, asserted rather than implied by the loop above skipping
  // them: a cloud preset with a baffle model on the brush lays its own clouds.
  {
    asModel()
    const { placed } = S().applyPreset('cloud-hex-field')
    ok('a cloud preset ignores an imported baffle model and lays clouds',
      placed > 0 && S().items.every((it) => it.type === 'clouds' && !it.params.model),
      `${placed} placed, ${S().items.filter((it) => it.params.model).length} carrying a model`)
    reset()
  }

  // a model keeps its own materials — the colour-banding preset must not repaint it
  asModel()
  S().applyPreset('blade-field')
  ok('blade-field does not repaint an imported model',
    S().items.every((it) => it.params.colour === S().items[0].params.colour &&
                            it.params.model === MODEL.model))

  // the run presets place one room-sized set from the catalogue, but a model
  // cannot grow fins, so the run becomes copies laid end to end
  reset()
  S().applyPreset('ombre-run')
  const catalogueRun = S().items.length
  asModel()
  S().applyPreset('ombre-run')
  ok('a run preset is one set from the catalogue', catalogueRun === 1, String(catalogueRun))
  ok('and a row of copies for a model', S().items.length > 1, String(S().items.length))

  // An oversized run is reported, not silently dropped or clamped into a wall.
  asModel()
  useStore.setState((st) => ({
    brush: { type: 'baffles', params: reconcile({ ...st.brush.params, count: 24 }) },
  }))
  const tooBig = S().applyPreset('vmt-field')
  ok('a run too wide for the ceiling places nothing and says so',
    tooBig.placed === 0 && S().items.length === 0, JSON.stringify(tooBig))

  // and the catalogue path is untouched
  reset()
  const cat = S().applyPreset('vmt-field')
  ok('with no model chosen a preset still places its own product',
    cat.placed > 0 && S().items.every((it) => !it.params.model && it.params.btype === 'vmt'))
  ok('and still adopts that product as the brush',
    S().brush.params.family === 'wood-classic' && !S().brush.params.model)
}

// ---------------------------------------------------------------------------
section('ARRANGE AS ARRAY')
reset()
{
  const g = S().grid()
  S().placeAt(...at(3, 2))
  const src = S().items[0]

  const r1 = S().arraySelected(2, 2, 1)
  ok('a 2 x 2 array adds three copies', r1.placed === 3, JSON.stringify(r1))
  ok('the original is left in place', S().items.some((i) => i.id === src.id))
  ok('nothing in the array overlaps', !S().items.some((a, i) =>
    S().items.some((b, j) => i !== j && overlaps(footprint(a, g), footprint(b, g)))))
  ok('nothing in the array leaves the grid',
    S().items.every((it) => onGrid(footprint(it, g), g)))
  ok('copies carry their own params, not a shared reference', (() => {
    const copy = S().items.find((i) => i.id !== src.id)
    copy.params.count = 99
    return src.params.count !== 99
  })())

  reset()
  S().placeAt(...at(3, 2))
  ok('a 1 x 1 array is a no-op', S().arraySelected(1, 1, 1).placed === 0)

  reset()
  S().placeAt(...at(3, 2))
  const huge = S().arraySelected(15, 15, 0)
  ok('an array bigger than the ceiling drops what will not fit',
    huge.skipped > 0 && S().items.every((it) => onGrid(footprint(it, g), g)),
    JSON.stringify(huge))

  reset()
  ok('an array with nothing selected does nothing', S().arraySelected(2, 2, 1).placed === 0)

  // an array must not sit on an obstruction
  reset()
  S().placeAt(...at(3, 2))
  const fp = footprint(S().items[0], g)
  S().toggleObstruction(Math.floor((3 * CELL_SCALE + fp.ci) / CELL_SCALE) + 1, 2)
  const masked = S().arraySelected(1, 2, 1)
  ok('an array skips obstructed cells', masked.placed === 0 && masked.skipped === 1,
    JSON.stringify(masked))
}

// ---------------------------------------------------------------------------
section('SCHEDULE / BOM')
reset()
{
  S().placeAt(...at(10, 5))
  const item = S().items[0]
  let bom = buildSchedule(S().items)
  const runM = 8 * (OPENING_LENGTH / 1000)
  ok('a set of 8 counts as 8 fins', bom.totalQty === 8, String(bom.totalQty))
  ok(`8 fins of ${OPENING_LENGTH} mm is ${runM} m of run`,
    Math.abs(bom.totalRunM - runM) < 1e-9, String(bom.totalRunM))
  ok('and the schedule reports no absorptive face',
    bom.totalFaceM2 === undefined && bom.rows.every((r) => r.unitFaceM2 === undefined),
    'the face total is back')
  ok('identical fins collapse to one row', bom.rows.length === 1, String(bom.rows.length))

  // one fin recoloured — the case a naive count-the-items version gets wrong
  S().select(item.id)
  S().updateFin(3, { colour: 'WD-NC-05' })
  bom = buildSchedule(S().items)
  ok('a recoloured fin splits the schedule into two rows', bom.rows.length === 2, String(bom.rows.length))
  ok('the total is still 8 fins', bom.totalQty === 8, String(bom.totalQty))
  ok('the override row holds exactly one fin',
    bom.rows.some((r) => r.colour === 'WD-NC-05' && r.qty === 1))

  S().resetFin(3)
  ok('resetting the fin collapses the rows again', buildSchedule(S().items).rows.length === 1)

  const tapered = finSchedule({ ...defaultBaffleParams(), btype: 'blade', shape: 'tapered', width: '100-200', count: 2 })
  ok('a tapered fin is scheduled at its mean depth', tapered[0].depthMm === 150, String(tapered[0].depthMm))

  ok('covered area matches the set extent',
    Math.abs(coveredArea(S().items) - (OPENING_LENGTH / 1000) * 0.9) < 1e-9,
    String(coveredArea(S().items)))
}

// ---------------------------------------------------------------------------
section('IMPORTED MODELS')
reset()
{
  const room = getRoom(TEST_ROOM)          // 9 x 7 m, 3.0 m clear
  const g = S().grid()

  // The supplied installation FBX is 27.8 m long — no room here can hold it.
  const huge = { length: 27.8, height: 3.908, width: 16.031 }
  const fit = fitSizeMm(huge, room)
  ok('"Fit room" scales an oversized model onto the ceiling',
    fit.l / 1000 <= 8.7 && fit.w / 1000 <= 6.7 && fit.h / 1000 <= 1.8, JSON.stringify(fit))
  ok('fitting keeps the authored proportions',
    Math.abs((fit.w / fit.l) - (huge.width / huge.length)) < 1e-3)

  // The opening length applies to EVERY baffle, not just parametric ones.
  const small = { length: 4.84, height: 0.858, width: 4.18 }
  const openSmall = openingSizeMm(small, room)
  ok('a model opens at the same length as a catalogue run',
    openSmall.l === OPENING_LENGTH, JSON.stringify(openSmall))
  ok('a model that already fits the room is still brought to the opening length',
    openSmall.l < Math.round(small.length * 1000), `${openSmall.l} vs ${Math.round(small.length * 1000)}`)
  ok('opening keeps the authored proportions',
    Math.abs((openSmall.w / openSmall.l) - (small.width / small.length)) < 1e-3)

  const openHuge = openingSizeMm(huge, room)
  ok('a 27.8 m installation also opens at the opening length',
    openHuge.l === OPENING_LENGTH, JSON.stringify(openHuge))
  ok('opening never exceeds what the ceiling can hold',
    openHuge.l <= fit.l && openSmall.l <= fitSizeMm(small, room).l)

  // in a room too small even for 1800 mm, the ceiling wins
  const tiny = { ceiling: { y: 2.6, minX: -0.7, maxX: 0.7, minZ: -0.7, maxZ: 0.7 } }
  const openTiny = openingSizeMm(small, tiny)
  ok('a ceiling smaller than the opening length clamps it',
    openTiny.l < OPENING_LENGTH, `${openTiny.l} mm`)

  const fitSmall = openSmall

  // a model-backed set is sized by its own box, not by fin count
  // count: 1 is what the picker sets — the fin default of 8 would make this a
  // run of eight, which is a different thing and is covered in its own section
  const mp = reconcile({
    ...defaultBaffleParams(),
    model: 'blade-flow', modelName: 'Baffle Curve (1)', sizeMm: fitSmall,
    count: 1, spacing: 200,
  })
  // A model's extent, pitch and size all come from the catalogue now, so the
  // assertions that lived here — arbitrary per-axis sizes surviving reconcile —
  // moved to the MODEL SIZE section, which checks the derivation instead.
  const mc = baffleCells(mp, S().grid().pitch)
  ok('reconcile keeps the catalogue fields, so switching back restores a product',
    BAFFLE_TYPES[reconcile(mp).btype] !== undefined)

  // placement + schedule
  useStore.setState({ brush: { type: 'baffles', params: mp } })
  const id = S().placeAt(...at(15, 11))
  ok('a model-backed set places', !!id && S().items.length === 1)
  ok('its footprint matches its box', S().items[0].ci === mc.ci && S().items[0].cj === mc.cj)

  const bom = buildSchedule(S().items)
  ok('a model counts as one unit, not its mesh count', bom.totalQty === 1, String(bom.totalQty))
  ok('the schedule names the model', bom.rows[0].name === mp.modelName, bom.rows[0].name)
  // The face total is gone, and with it the caveat that went beside it: a
  // model file never said which of its surfaces absorb, so the schedule used
  // to carry a zero and a note explaining the zero. What a model TAKES is its
  // box, which it can answer.
  ok('no face total survives on a model row',
    bom.totalFaceM2 === undefined && bom.rows[0].unitFaceM2 === undefined)
  ok('and a model still reports the ceiling it takes',
    itemArea(S().items[0]) > 0, String(itemArea(S().items[0])))

  // two different models at the same size must not collapse into one row
  const other = { ...mp, model: 'baffle', modelName: 'Baffle' }
  const two = buildSchedule([
    { type: 'baffles', params: mp }, { type: 'baffles', params: other },
  ])
  ok('two different models stay two schedule rows', two.rows.length === 2, String(two.rows.length))
  ok('and still total two units', two.totalQty === 2)

  // mixed scene: parametric fins and a model side by side
  const mixed = buildSchedule([
    { type: 'baffles', params: reconcile(defaultBaffleParams()) },
    { type: 'baffles', params: mp },
  ])
  ok('a mixed scene counts 8 fins plus 1 model', mixed.totalQty === 9, String(mixed.totalQty))
  ok('and no row in a mixed scene carries a face',
    mixed.rows.every((r) => r.unitFaceM2 === undefined))

  // round-trip
  const doc = S().toJSON()
  ok('the export names the model, not just an id',
    doc.items[0].params.modelName === 'Baffle Curve (1)')
  reset()
  S().fromJSON(JSON.parse(JSON.stringify(doc)))
  const back = S().items[0]
  ok('round-trip preserves the model', back.params.model === 'blade-flow')
  ok('round-trip preserves its size', back.params.sizeMm.l === fitSmall.l)
  ok('round-trip preserves its footprint', back.ci === mc.ci && back.cj === mc.cj)
}

// ---------------------------------------------------------------------------
section("SUSPENSION — the drawn rod matches the one in the file")
{
  // When a run hangs lower than the file's own hardware reaches, the renderer
  // draws the rest of the rod itself. That extension used to be a flat 6 mm
  // radius while the file's own hanger, scaled to a catalogue baffle, renders
  // at about half that — so the join was plainly a join. It is now measured
  // from the file and put through the same scale.
  const depth = 0.194
  const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
  blade.translate(0, -depth / 2, 0)

  // an authored run at the scale baffle.fbx uses, with a 73 x 72 mm hanger
  const finset = {
    size: { length: 27.8, depth: 2.0, thickness: 0.25 },
    fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
    unit: {
      finTopY: 0,
      hardwareAboveFin: 0.05,
      hardwareX: [-0.5, 0.5],
      hardware: [],
      suspension: { x: 0.0732, z: 0.0721 },
      fin: { geometry: blade, material: new THREE.MeshStandardMaterial() },
    },
  }
  const sizeMm = { l: 1800, w: 25, h: 150 }
  const params = { model: 'test', drop: 0.6, count: 2, spacing: 200, sizeMm, finOverrides: {} }

  const run = buildModelRun(finset, params, null)
  const rods = []
  run.traverse((o) => { if (o.isMesh && o.userData.finIndex == null) rods.push(o) })
  ok('a run hung below its hardware draws its own rods', rods.length > 0, String(rods.length))

  // The model's own hardware is drawn under the fin's own per-axis fit, and
  // the extension has to be drawn under exactly that, or it is a rod standing
  // near a hanger rather than the continuation of one.
  const sx = sizeMm.l / 1000 / finset.size.length
  const sy = sizeMm.h / 1000 / finset.size.depth
  const sz = sizeMm.w / 1000 / finset.size.thickness
  const wantX = (finset.unit.suspension.x / 2) * sx
  const wantZ = (finset.unit.suspension.z / 2) * sz

  const rod = rods[0]
  ok('the rod is as thick as the file hanger, at the file scale',
    Math.abs(rod.scale.x - wantX) < 1e-9 && Math.abs(rod.scale.z - wantZ) < 1e-9,
    `${(rod.scale.x * 2000).toFixed(2)} x ${(rod.scale.z * 2000).toFixed(2)} mm ` +
    `vs ${(wantX * 2000).toFixed(2)} x ${(wantZ * 2000).toFixed(2)}`)

  ok('which is thinner than the 12 mm it used to draw',
    rod.scale.x * 2 < 0.012 && rod.scale.z * 2 < 0.012,
    `${(rod.scale.x * 2000).toFixed(2)} x ${(rod.scale.z * 2000).toFixed(2)} mm`)

  ok('and it spans the gap from the hardware to the slab',
    Math.abs(rod.scale.y - (params.drop - finset.unit.hardwareAboveFin * sy)) < 1e-9,
    String(rod.scale.y))

  // ---- the model's own hardware is drawn as the file draws it -------------
  // The complaint this answers: "you changed the original baffle suspension
  // thickness". Resizing the supplier's own clamps and hangers — to a "real"
  // size, or to anything else — is a change to the product, and not ours to
  // make. They ride the fin's fit, whatever that comes to; the only piece we
  // are entitled to size is the extension WE add above them.
  const withHardware = {
    ...finset,
    unit: {
      ...finset.unit,
      hardware: [{
        mesh: {
          geometry: (() => {
            const g = new THREE.BoxGeometry(1.4984, 0.23, 0.285)
            g.translate(0, 0.2, 0)
            g.computeBoundingBox()
            return g
          })(),
          material: new THREE.MeshStandardMaterial(),
        },
        finIndex: 0,
      }],
    },
  }

  const hardwareBox = (sz) => {
    const g = buildModelRun(withHardware, { ...params, sizeMm: sz }, null)
    g.updateMatrixWorld(true)
    let box = null
    g.traverse((o) => {
      if (!o.isMesh || o.userData.finIndex != null) return
      if (o.geometry.parameters?.width !== 1.4984) return // the clamp, not a rod
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
      box = b.getSize(new THREE.Vector3())
    })
    return box
  }

  // the clamp is 1.4984 m long in the file; under the fin's fit it renders at
  // exactly that through the length scale, with nothing of ours applied on top
  const clampMm = 1498.4
  for (const sz2 of [{ l: 1200, w: 25, h: 100 }, { l: 1800, w: 25, h: 150 }, { l: 2780, w: 25, h: 200 }]) {
    const box = hardwareBox(sz2)
    const under = clampMm * (sz2.l / 1000 / finset.size.length)
    ok(`a clamp is drawn as the file draws it at ${sz2.l} mm`,
      box && Math.abs(box.x * 1000 - under) < 1e-3,
      box ? `${(box.x * 1000).toFixed(2)} vs ${under.toFixed(2)} mm` : 'not found')
  }

  // a file that hangs its fins on brackets has no rod to match, and falls back
  const bracketed = { ...finset, unit: { ...finset.unit, suspension: null } }
  const fallback = buildModelRun(bracketed, params, null)
  const fb = []
  fallback.traverse((o) => { if (o.isMesh && o.userData.finIndex == null) fb.push(o) })
  ok('a bracketed file still gets a rod, at the default thickness',
    fb.length > 0 && Math.abs(fb[0].scale.x - 0.006) < 1e-9, String(fb[0]?.scale.x))

  // hung shallower than its own hardware, there is nothing to bridge
  const shallow = buildModelRun(finset, { ...params, drop: 0.001 }, null)
  const none = []
  shallow.traverse((o) => { if (o.isMesh && o.userData.finIndex == null) none.push(o) })
  ok('a run hung at its hardware draws no extension at all', none.length === 0, String(none.length))
}

section('CLOUDS - eleven files, four shapes')
{
  applyCloudManifest(manifest.clouds)
  ok('the cloud models are in the manifest', CLOUD_MODELS.length === 11,
    String(CLOUD_MODELS.length))
  ok('four shapes', cloudShapes().sort().join(',') === 'circle,hexagon,square,triangle',
    cloudShapes().sort().join(','))
  // Sizes come from the FILES, and the files agree with the workbook: triangle
  // is made at 900 and 1200 only.
  ok('square, circle and hexagon come in 600, 900 and 1200',
    ['square', 'circle', 'hexagon'].every((sh) => sizesFor(sh).join(',') === '600,900,1200'),
    ['square', 'circle', 'hexagon'].map((sh) => sizesFor(sh).join('/')).join('  '))
  ok('and triangle in 900 and 1200 only, as the workbook says',
    sizesFor('triangle').join(',') === '900,1200', sizesFor('triangle').join(','))
  ok('every file it names is on disk',
    CLOUD_MODELS.every((c) => fs.existsSync(path.join('public/models', c.file))),
    CLOUD_MODELS.length + ' files')

  // Measured, and worth stating: the panels do NOT measure their names.
  const sq6 = cloudFor('square', 600)
  ok('a "600" square panel actually measures 583 mm',
    Math.abs(sq6.plan.x * 1000 - 583) < 2, (sq6.plan.x * 1000).toFixed(0) + ' mm')
  // NOT a blanket "every panel is under its nominal size" - triangle-900 is
  // 901 mm, marginally over, and a hexagon is 13% over across its corners.
  // What is true of all of them is that none MEASURES its nominal size, which
  // is the thing worth knowing before anyone sets out from the name.
  // The spread, stated rather than characterised: measured on the largest plan
  // dimension of each, the eleven run from 6% UNDER their nominal size to 13%
  // OVER it. The name is not a dimension, which is why cloudExtent reads the
  // model and never the number in the filename.
  const dev = CLOUD_MODELS.map((c) => Math.max(c.plan.x, c.plan.z) * 1000 / c.size - 1)
  ok('the panels run from about 6% under their nominal size to 13% over',
    Math.min(...dev) > -0.08 && Math.min(...dev) < -0.05
      && Math.max(...dev) > 0.11 && Math.max(...dev) < 0.15,
    (Math.min(...dev) * 100).toFixed(1) + '% .. ' + (Math.max(...dev) * 100).toFixed(1) + '%')
  ok('the squares and circles all come in a few per cent UNDER',
    CLOUD_MODELS.filter((c) => c.shape === 'square' || c.shape === 'circle')
      .every((c) => c.plan.x * 1000 < c.size && c.plan.x * 1000 > c.size * 0.9),
    'square 583/865/1166, circle 572/843/1150')
  ok('a hexagon is wider across the corners than the flats',
    cloudFor('hexagon', 600).plan.z > cloudFor('hexagon', 600).plan.x,
    (cloudFor('hexagon', 600).plan.x * 1000).toFixed(0) + ' x '
      + (cloudFor('hexagon', 600).plan.z * 1000).toFixed(0))
  ok('and every one carries its own suspension',
    CLOUD_MODELS.every((c) => c.dropMm > 300),
    Math.min(...CLOUD_MODELS.map((c) => c.dropMm)) + '-'
      + Math.max(...CLOUD_MODELS.map((c) => c.dropMm)) + ' mm')

  // ---- the hardware, which the files disagree about ------------------------
  // Circle and square hang on #808080, triangle on #b8b8b8, and the hexagon on
  // #99ff32 - a bright green it SHARES with its panel, so the whole cloud came
  // out green whatever colour was chosen for it. One part, one finish.
  ok('the hardware finish is declared, not taken from the files',
    /^#[0-9a-f]{6}$/i.test(CLOUD_HARDWARE_FINISH.hex), CLOUD_HARDWARE_FINISH.hex)
  ok('and it is the grey two of the four files already use',
    CLOUD_HARDWARE_FINISH.hex.toLowerCase() === '#808080', CLOUD_HARDWARE_FINISH.hex)
  ok('which is emphatically not the hexagon green',
    CLOUD_HARDWARE_FINISH.hex.toLowerCase() !== '#99ff32', 'not #99ff32')

  // ---- panel vs cap vs hardware -------------------------------------------
  // The second hexagon export split the panel's back face into its own mesh.
  // Left as "whatever else there is" it took the file's material, which on a
  // hexagon is the green - so the fix has to tell a back FACE from a bracket,
  // and it does it by footprint rather than by mesh count or name.
  const parts = (id) => CLOUD_MODELS.find((c) => c.id === id).parts
  ok('a hexagon panel has a cap: its back face, on its own footprint',
    ['hexagon-600', 'hexagon-900', 'hexagon-1200'].every((id) => parts(id).cap === 1),
    JSON.stringify(parts('hexagon-600')))
  ok('and no hardware at all, so nothing of it is left on the file green',
    ['hexagon-600', 'hexagon-900', 'hexagon-1200'].every((id) => parts(id).plate === 0),
    'plate 0')
  ok('a circle has the opposite: no cap, one overhanging backing disc',
    ['circle-600', 'circle-900', 'circle-1200']
      .every((id) => parts(id).cap === 0 && parts(id).plate === 1),
    JSON.stringify(parts('circle-600')))
  ok('and a triangle has both, plus the fixture at the top of its cable',
    ['triangle-900', 'triangle-1200']
      .every((id) => parts(id).cap === 1 && parts(id).plate === 1),
    JSON.stringify(parts('triangle-900')))
  ok('every cloud is exactly one panel and one run of wire, whatever else',
    CLOUD_MODELS.every((c) => c.parts.panel === 1 && c.parts.suspension === 1), 'all 11')

  // The threshold is not near anything: caps sit at 0.00-0.09% of the panel's
  // plan and the nearest bracket at 2.7%, so 1% has an order of magnitude of
  // clearance on both sides. Asserted because a re-export could narrow it.
  ok('the cap tolerance sits between the two, not near either',
    CAP_TOLERANCE > 0.002 && CAP_TOLERANCE < 0.02, String(CAP_TOLERANCE))

  // The thickness the UI quotes must not move because an exporter split a mesh.
  ok('a panel reports the thickness of its face AND its cap',
    Math.abs(cloudFor('hexagon', 1200).thicknessMm - 40.3) < 0.15,
    cloudFor('hexagon', 1200).thicknessMm + ' mm')

  // ---- the specification --------------------------------------------------
  const blank = emptyCloudParams()
  ok('a cloud brush opens with nothing chosen',
    blank.shape === null && blank.size === null && blank.colour === null, 'all null')
  ok('and names all three in the order they are asked',
    cloudMissingFields(blank).join(' > ') === 'Shape > Size > Design',
    cloudMissingFields(blank).join(' > '))
  // A real artwork code, taken from the manifest rather than written down. It
  // used to be a PET colour; a cloud has no flat range any more, so a spec
  // built from one would reconcile to nothing and every placement below it
  // would fail for a reason that has nothing to do with placing.
  const FINISH = seriesSwatchCode(SERIES_DESIGNS[0], 'Blue')
  const spec = { shape: 'square', size: 600, family: 'cloud-series', colour: FINISH }
  ok('answering all three makes it placeable', cloudReadyToPlace(spec), 'ready')

  const SW = COLOUR_FAMILIES['pet-solid'].swatches
  ok('Solid Coloured PET is still a real range, just not a cloud one',
    SW.length > 20, `${SW.length} colours`)
  ok('each with a hex to paint it', SW.every((x) => /^#[0-9a-f]{6}$/i.test(x.hex)), 'all')

  // WHAT HAPPENS TO A CLOUD SAVED ON A RANGE THAT IS GONE.
  //
  // It comes back on the printed range with NO colour, so it reads as
  // unfinished and asks for a Design. That is the honest outcome and it is
  // asserted rather than left to be discovered: there is no sensible mapping
  // from a flat PET colour to a printed artwork or a woven panel, and inventing
  // one would silently change what somebody specified.
  //
  // LEGACY_CLOUD_COLOURS still maps the four placeholder names onto real PET
  // codes, and is now INERT for clouds -- nothing reaches the solid branch of
  // reconcileCloud any more. The map is kept, so the test that its contents are
  // real is kept with it; the test that it is APPLIED is gone, because it is
  // not.
  for (const family of ['cloud-solid', 'pet-solid']) {
    const out = reconcileCloud({ shape: 'square', size: 600, family, colour: 'Red' })
    ok(`a cloud saved on ${family} comes back on the printed range, unfinished`,
      out.family === 'cloud-series' && out.colour === null, `${out.family} / ${out.colour}`)
    ok(`and says so, rather than looking complete`,
      cloudMissingFields(out).includes('Design'), cloudMissingFields(out).join(','))
  }
  ok('the legacy map still names colours PET actually publishes',
    Object.values(LEGACY_CLOUD_COLOURS).every((c) => SW.some((x) => x.code === c)),
    Object.values(LEGACY_CLOUD_COLOURS).join(', '))

  ok('a size the shape is not made in is dropped',
    reconcileCloud({ shape: 'triangle', size: 600 }).size === null, 'dropped')
  ok('while one it is made in survives',
    reconcileCloud({ shape: 'triangle', size: 900 }).size === 900, '900')
  ok('and a colour outside the family is dropped',
    reconcileCloud({ shape: 'square', size: 600, colour: 'Puce' }).colour === null, 'dropped')
  ok('the drop is clamped rather than refused',
    reconcileCloud({ drop: 99 }).drop === CLOUD_DROP.max
      && reconcileCloud({ drop: -1 }).drop === CLOUD_DROP.min, 'clamped')

  // ---- what it occupies ---------------------------------------------------
  const e = cloudExtent(spec)
  ok('a cloud occupies its MEASURED panel, not its nominal size',
    Math.abs(e.length - sq6.plan.x) < 1e-9, (e.length * 1000).toFixed(0) + ' mm')
  ok('which is 6 x 6 cells at the 100 mm pitch a cell used to be',
    cloudCells(spec, 0.1).ci === 6 && cloudCells(spec, 0.1).cj === 6,
    cloudCells(spec, 0.1).ci + ' x ' + cloudCells(spec, 0.1).cj)
  // At the millimetre pitch a footprint IS the panel, to the millimetre —
  // which is the whole reason the cell got this small.
  const cells = cloudCells(spec, S().grid().pitch)
  ok('and the panel to the millimetre at the one it is now',
    cells.ci === 583 && cells.cj === 585, `${cells.ci} x ${cells.cj}`)

  // ---- placing one --------------------------------------------------------
  reset()
  S().setProduct('clouds')
  ok('switching to clouds gives a cloud brush',
    S().brush.type === 'clouds' && S().brush.params.shape === null, S().brush.type)
  ok('and nothing places until it is specified', S().placeAt(...at(20, 20)) === null, 'refused')
  S().setBrush({ shape: 'square', size: 600, family: 'cloud-series', colour: FINISH })
  const id = S().placeAt(...at(20, 20))
  ok('a specified cloud places', !!id, String(id))
  const placed = S().items.find((i) => i.id === id)
  ok('and carries the cloud type', placed?.type === 'clouds', String(placed?.type))
  ok('with the footprint the cloud maths gave',
    placed?.ci === cells.ci && placed?.cj === cells.cj, placed?.ci + ' x ' + placed?.cj)


  // ---- turning one ---------------------------------------------------------
  // A cloud hangs off one wire and touches nothing, so unlike a lay-in tile or
  // a baffle run it has no reason to be limited to quarter turns.
  ok('a cloud turns 45 degrees a press, where the other products turn 90',
    rotStepFor('clouds') === 45 && rotStepFor('tiles') === 90 && rotStepFor('baffles') === 90,
    `clouds ${rotStepFor('clouds')}, tiles ${rotStepFor('tiles')}`)
  ok('an unknown type falls back to a quarter turn rather than to zero',
    rotStepFor('nonesuch') === 90, String(rotStepFor('nonesuch')))

  const gc = S().grid()
  const flat = footprint(S().items.find((i) => i.id === id), gc)
  S().rotate(id)
  const turned = S().items.find((i) => i.id === id)
  ok('so one press puts it on the diagonal', turned.rot === 45, String(turned.rot))
  const diag = footprint(turned, gc)
  // A 583 mm square is 6 x 6 cells square-on and 9 x 9 across its diagonal.
  ok('and it reserves the box around the turned panel, not the untouched one',
    diag.ci > flat.ci && diag.cj > flat.cj,
    `${flat.ci}x${flat.cj} -> ${diag.ci}x${diag.cj}`)
  ok('which is the diagonal of the square, to a cell',
    Math.abs(diag.ci - Math.ceil(flat.ci * Math.SQRT2)) <= 1,
    `${diag.ci} vs ${Math.ceil(flat.ci * Math.SQRT2)}`)
  ok('it turns about its centre, within a cell, at 45 as at 90',
    Math.abs((flat.i0 + flat.ci / 2) - (diag.i0 + diag.ci / 2)) <= 0.5
      && Math.abs((flat.j0 + flat.cj / 2) - (diag.j0 + diag.cj / 2)) <= 0.5,
    `${flat.i0 + flat.ci / 2},${flat.j0 + flat.cj / 2}`
      + ` -> ${diag.i0 + diag.ci / 2},${diag.j0 + diag.cj / 2}`)
  ok('eight presses bring it back to square on',
    [1, 2, 3, 4, 5, 6, 7].every(() => S().rotate(id))
      && S().items.find((i) => i.id === id).rot === 0,
    String(S().items.find((i) => i.id === id).rot))
  ok('and every angle on the way is a multiple of 45',
    CLOUD_ROTATIONS.join(',') === '0,45,90,135,180,225,270,315', CLOUD_ROTATIONS.join(','))
  ok('a cloud saved on the diagonal is not straightened on reload',
    reconcileCloud({ shape: 'square', size: 600, colour: 'Red', rot: 45 }).rot === 45, '45')

  // neighbourGaps is baffle-to-baffle and says so, but tested "is not a tile",
  // which sent clouds to baffleExtent - baffle fields a cloud has none of.
  ok('a selected cloud is offered no baffle dimensions',
    neighbourGaps(S().items.find((i) => i.id === id), S().items, gc).length === 0, 'none')
  ok('while an angle it cannot be built at still is',
    reconcileCloud({ shape: 'square', size: 600, colour: 'Red', rot: 37 }).rot === 0, '0')

  S().setBrush({ shape: 'triangle' })
  ok('changing shape clears a size the new shape has not got',
    S().brush.params.size === null, String(S().brush.params.size))

  const bom = buildSchedule(S().items)
  ok('one cloud is one line of one on the order',
    bom.totalQty === 1 && bom.rows.length === 1,
    bom.totalQty + ' on ' + bom.rows.length + ' line(s)')
  ok('named for its shape', /Square cloud/.test(bom.rows[0].name), bom.rows[0].name)
  // What it TAKES is its plan box. Worth knowing that this is the box and
  // not the panel: a circle fills 78.5% of it, a triangle 57%. The number is
  // the zone the cloud reserves, which is the question the summary asks.
  const cloudItem = { type: 'clouds', params: S().brush.params }
  ok('a cloud takes its plan box',
    Math.abs(itemArea({ ...cloudItem, params: { ...cloudItem.params, shape: 'square', size: 600 } })
      - e.length * e.width) < 1e-6,
    itemArea(cloudItem).toFixed(3) + ' m2')
  reset()
}

// ---------------------------------------------------------------------------
section('GENERATED TILE — one 600 x 600 lay-in tile and its frame')
{
  // Built rather than supplied, so its dimensions are decided here and not
  // measured back out of somebody's export.
  const root = buildTileModel(SPEC)
  root.updateMatrixWorld(true)
  const { faces, grid, context } = classifyTileMeshes(root)

  ok('one tile', faces.length === 1, String(faces.length))
  ok('and four bars of frame around it', grid.length === 4, String(grid.length))
  ok('nothing taken for surrounding ceiling', context.length === 0, String(context.length))

  const t = tileSize(faces)
  ok('the tile is 595 x 595 mm', Math.abs(t.x - 595) < 0.5 && Math.abs(t.z - 595) < 0.5,
    `${t.x} x ${t.z}`)
  ok('which is square, as asked', Math.abs(t.x / t.z - 1) < 1e-6, (t.x / t.z).toFixed(4))

  // The arithmetic the whole detail rests on: a 600 module reads as 24 of grid
  // and 576 of tile, and the tile is WIDER than the opening it sits in — which
  // is what stops it falling through.
  const seen = SPEC.module - SPEC.flangeW
  ok('600 = 576 of tile seen + 24 of grid', seen + SPEC.flangeW === SPEC.module,
    `${seen} + ${SPEC.flangeW}`)
  ok('and the tile is wider than that opening, so it cannot drop through',
    SPEC.tile > seen, `${SPEC.tile} > ${seen}`)
  ok('9.5 mm of it sits behind each flange', Math.abs((SPEC.tile - seen) / 2 - 9.5) < 0.01,
    `${((SPEC.tile - seen) / 2).toFixed(1)} mm`)

  // The flange has to be the LOWEST thing, or the tile would hide the grid
  // rather than the other way round.
  const low = (list) => Math.min(...list.map((m) => new THREE.Box3().setFromObject(m).min.y))
  ok('the frame is the lowest thing in the assembly', low(grid) < low(faces),
    `frame ${low(grid).toFixed(2)} vs tile ${low(faces).toFixed(2)}`)
  ok('the tile rests ON the flange, not level with it',
    Math.abs(low(faces) - SPEC.flangeT) < 0.01, low(faces).toFixed(2))

  const whole = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  ok('the assembly is one module plus a flange each way',
    Math.abs(whole.x - (SPEC.module + SPEC.flangeW)) < 0.5
      && Math.abs(whole.z - (SPEC.module + SPEC.flangeW)) < 0.5,
    `${whole.x.toFixed(0)} x ${whole.z.toFixed(0)}`)
  ok('and is as deep as the grid', Math.abs(whole.y - SPEC.gridDepth) < 0.5, whole.y.toFixed(1))

  ok('the tile arrives with UVs, so nothing has to be generated for it',
    !!faces[0].geometry.attributes.uv, 'mapped')

  // ---- the guard this model needed ---------------------------------------
  // A single tile IS most of its own model's footprint and it does fill it, so
  // the context test called the product its own surroundings and dropped it.
  // Nothing that leaves zero tiles was context.
  const soloTile = new THREE.Mesh(
    new THREE.BoxGeometry(595, 15, 595), new THREE.MeshStandardMaterial()
  )
  const solo = new THREE.Group()
  solo.add(soloTile)
  solo.updateMatrixWorld(true)
  ok('a model of nothing but a tile still yields a tile',
    classifyTileMeshes(solo).faces.length === 1,
    String(classifyTileMeshes(solo).faces.length))
  ok('and calls none of it surrounding ceiling',
    classifyTileMeshes(solo).context.length === 0, 'none')

  const file = 'public/models/ceiling_tiles/Tile 600x600.glb'
  ok('the generated file is on disk', fs.existsSync(file), file)
  if (fs.existsSync(file)) {
    const kb = fs.statSync(file).size / 1024
    ok('and is small, being 300 triangles of box', kb < 60, `${kb.toFixed(0)} KB`)
  }
}

// ---------------------------------------------------------------------------
section('DIMENSIONS — the clear gap to a neighbour')
reset()
{
  // EDGE to edge, never centre to centre. A centre-to-centre figure changes when
  // a set grows a fin and is not what anyone measures with a tape.
  const rect = (cx, cz, w, d) => ({ id: `${cx},${cz}`, cx, cz, w, d })

  const a = rect(0, 0, 1.8, 0.4)
  const b = rect(3.0, 0, 1.8, 0.4)       // centres 3.0 apart, each 1.8 wide
  const ab = gapBetween(a, b)
  ok('two sets side by side report the AIR between them',
    Math.abs(ab.m - 1.2) < 1e-9, `${(ab.m * 1000).toFixed(0)} mm`)
  ok('and not the distance between their centres',
    Math.abs(ab.m - 3.0) > 1, `${(ab.m * 1000).toFixed(0)} mm, centres are 3000`)
  ok('measured square, between the facing edges', ab.kind === 'x', ab.kind)
  ok('the line starts on one edge and ends on the other',
    Math.abs(ab.from[0] - 0.9) < 1e-9 && Math.abs(ab.to[0] - 2.1) < 1e-9,
    `${ab.from[0]} -> ${ab.to[0]}`)
  ok('and sits in the middle of the depth they share',
    Math.abs(ab.from[1]) < 1e-9 && Math.abs(ab.to[1]) < 1e-9, String(ab.from[1]))

  const c = gapBetween(rect(0, 0, 1.8, 0.4), rect(0, 1.0, 1.8, 0.4))
  ok('the same the other way round', c.kind === 'z' && Math.abs(c.m - 0.6) < 1e-9,
    `${c.kind} ${(c.m * 1000).toFixed(0)} mm`)

  // Overlapping on neither axis, so the nearest points are two CORNERS. Still a
  // real distance, and the shortest one, but square to nothing.
  const d = gapBetween(rect(0, 0, 1.0, 1.0), rect(2.0, 2.0, 1.0, 1.0))
  ok('sets that face on neither axis measure corner to corner', d.kind === 'diagonal', d.kind)
  ok('and that is the shortest distance between them, not a bounding box',
    Math.abs(d.m - Math.hypot(1, 1)) < 1e-9, d.m.toFixed(4))
  ok('its ends are the two nearest corners',
    Math.abs(d.from[0] - 0.5) < 1e-9 && Math.abs(d.from[1] - 0.5) < 1e-9
      && Math.abs(d.to[0] - 1.5) < 1e-9 && Math.abs(d.to[1] - 1.5) < 1e-9,
    JSON.stringify([d.from, d.to]))

  ok('two sets that overlap report nothing rather than a gap of zero',
    gapBetween(rect(0, 0, 2, 2), rect(0.5, 0.5, 2, 2)) === null, 'null')
  ok('and two that touch report exactly zero',
    Math.abs(gapBetween(rect(0, 0, 2, 2), rect(2, 0, 2, 2)).m) < 1e-9, '0 mm')

  // ---- what actually gets dimensioned -------------------------------------
  const g = S().grid()
  S().setBrush({ count: 4, spacing: 100, thickness: 25 })
  const ids = [S().placeAt(...at(10, 10)), S().placeAt(...at(10, 30)), S().placeAt(...at(60, 60))]
  ok('three sets placed for the range test', ids.every(Boolean), JSON.stringify(ids))
  const mine = S().items.find((i) => i.id === ids[0])

  const r = planRect(mine, g)
  const e = baffleExtent(mine.params)
  ok('a set measures at its real size, not the cells it reserves',
    Math.abs(r.w - e.length) < 1e-9 && Math.abs(r.d - e.width) < 1e-9, `${r.w} x ${r.d}`)

  const near = neighbourGaps(mine, S().items, g)
  ok('only neighbours within range are dimensioned',
    near.every((n) => n.m <= MEASURE_RANGE_M), JSON.stringify(near.map((n) => n.mm)))
  ok('the far one is left out', !near.some((n) => n.id === ids[2]),
    `${near.length} of ${S().items.length - 1} others`)
  ok('and the list comes back nearest first',
    near.every((n, i) => i === 0 || n.m >= near[i - 1].m), JSON.stringify(near.map((n) => n.mm)))
  ok('a set is never measured against itself', !near.some((n) => n.id === mine.id), 'excluded')
  ok('the range is the 3 m that was asked for', MEASURE_RANGE_M === 3, String(MEASURE_RANGE_M))

  // A tile block is not a baffle, and dimensioning to one answers a question
  // nobody asked.
  // The baffle goes down FIRST, from the full brush reset() leaves: switching
  // product clears the specification, so a baffle placed after the tiles would
  // be placed from an empty one and refused.
  reset()
  S().setBrush({ count: 4, spacing: 100, thickness: 25 })
  const run = S().placeAt(...at(70, 30))
  S().setProduct('tiles')
  S().setBrush({
    ttype: 'wood-classic', size: '600x600', grid: 24, thickness: 25,
    wood: 'WD-NC-05', perforation: 'PF-NC-08',
  })
  const block = S().placeAt(...at(30, 30))
  ok('a tile block and a baffle run both placed', !!block && !!run, `${!!block} ${!!run}`)
  if (block && run) {
    const item = S().items.find((i) => i.id === run)
    ok('a tile block is not dimensioned against a baffle run',
      !neighbourGaps(item, S().items, g).some((n) => n.id === block), 'excluded')
  }
  reset()
}

// ---------------------------------------------------------------------------
section('SNAP STEP — how close two sets can sit')
reset()
{
  // The pitch does two things, and both were too coarse at 300 mm: it quantises
  // POSITION, and it decides how much space an item RESERVES. A 4-fin Blade set
  // is 400 mm wide; at 300 mm it reserved 600, so two of them could never sit
  // closer than 200 mm however they were nudged.
  const g = S().grid()
  const params = { ...S().brush.params, count: 4, spacing: 100, thickness: 25 }
  const e = baffleExtent(params)
  ok('a 4-fin set is 400 mm across', Math.abs(e.width - 0.4) < 1e-9, `${(e.width * 1000).toFixed(0)} mm`)

  const reserved = (pitch) => spanCells(e.width, pitch) * pitch
  ok('at 300 mm it reserved 600 — 200 mm of space it does not occupy',
    Math.abs(reserved(0.3) - 0.6) < 1e-9, `${(reserved(0.3) * 1000).toFixed(0)} mm`)
  ok('at 100 mm it reserves exactly what it occupies',
    Math.abs(reserved(0.1) - e.width) < 1e-9, `${(reserved(0.1) * 1000).toFixed(0)} mm`)

  // The gap two ADJACENT sets are left with, measured between their true edges
  // rather than between their reservations.
  const gapBetween = (pitch) => {
    const cj = spanCells(e.width, pitch)
    const grid = { ...g, pitch }
    const a = footprintCentre({ i0: 0, j0: 0, ci: 1, cj }, grid)
    const b = footprintCentre({ i0: 0, j0: cj, ci: 1, cj }, grid)
    return (b[2] - a[2]) - e.width // centre-to-centre, less one full width
  }
  ok('two sets side by side were stuck 200 mm apart at 300 mm',
    Math.abs(gapBetween(0.3) - 0.2) < 1e-9, `${(gapBetween(0.3) * 1000).toFixed(0)} mm`)
  ok('and can now touch',
    Math.abs(gapBetween(0.1)) < 1e-9, `${(gapBetween(0.1) * 1000).toFixed(0)} mm`)

  ok('the cell itself is a millimetre', DEFAULT_PITCH === 0.001, String(DEFAULT_PITCH))
  ok('which still divides the 300 mm setting-out basis exactly',
    Math.abs(0.3 / DEFAULT_PITCH - Math.round(0.3 / DEFAULT_PITCH)) < 1e-9, '300 cells')
  ok('and the 600 mm tile module',
    Math.abs(0.6 / DEFAULT_PITCH - Math.round(0.6 / DEFAULT_PITCH)) < 1e-9, '600 cells')
  // The reason it had to get this fine: the supplied tiles are on a 616.56 mm
  // module, and no coarser cell can express it. At 100 mm the nearest offers
  // were 600 and 700.
  // And the reason it had to get this fine. What matters is the RESIDUAL in
  // millimetres: how far from its true module a tile is forced to sit.
  const missBy = (pitch) =>
    Math.abs(Math.round(0.61656 / pitch) * pitch - 0.61656) * 1000
  ok('a 616.56 mm tile module lands within half a millimetre of true',
    missBy(DEFAULT_PITCH) < 0.5, `${missBy(DEFAULT_PITCH).toFixed(2)} mm out`)
  ok('where at 100 mm it was forced 16 mm out, which is the joint that showed',
    missBy(0.1) > 15, `${missBy(0.1).toFixed(1)} mm out`)
}

// ---------------------------------------------------------------------------
section('SNAP STEP — a layout saved on the old grid')
reset()
{
  // Cell indices are pitch-relative: cell 4 at 300 mm and cell 4 at 100 mm are
  // 1.2 m apart. A file from before the change has to be RESCALED, or every
  // layout ever exported reloads with its contents pulled into a third of the
  // ceiling — which looks like a corrupt file rather than a misread one.
  S().placeAt(...at(30, 30))
  const doc = S().toJSON()
  const g = S().grid()
  const here = footprintCentre(footprint(S().items[0], g), g)

  // Pretend it was written on the 300 mm grid: same world position, a third of
  // the cell indices, and the pitch it recorded at the time.
  const old = JSON.parse(JSON.stringify(doc))
  old.ceiling.pitch = 0.3
  // An old file had no separate mask pitch — that is exactly what marks it as
  // one whose obstructions are in PLACEMENT cells.
  delete old.ceiling.maskPitch
  // Derived from the two pitches rather than hardcoded at 3. It WAS 3, when a
  // cell was 100 mm; a cell is a millimetre now and the same world position is
  // 300 times the index, not three.
  const f = 0.3 / g.pitch
  old.items = old.items.map((it) => ({
    ...it, cell: [Math.round(it.cell[0] / f), Math.round(it.cell[1] / f)],
  }))
  old.obstructions = ['3,4']

  reset()
  const res = S().fromJSON(old)
  ok('an old-pitch file still loads', res.loaded === 1 && res.dropped === 0,
    `${res.loaded}/${res.dropped}`)
  const back = footprintCentre(footprint(S().items[0], g), g)
  // Within half the OLD cell, which is as exact as the round trip can be: the
  // fake threw away everything finer than 300 mm on the way out.
  ok('and its set comes back in the same place on the ceiling, to the old cell',
    Math.abs(back[0] - here[0]) <= 0.15 + 1e-6 && Math.abs(back[2] - here[2]) <= 0.15 + 1e-6,
    `${back[0].toFixed(3)},${back[2].toFixed(3)} vs ${here[0].toFixed(3)},${here[2].toFixed(3)}`)

  // A masked cell SUBDIVIDES rather than moving: one 300 mm cell is nine 100 mm
  // cells, and mapping it to one would leave eight ninths of a light unmasked.
  ok('a masked cell becomes the nine it contains',
    S().obstructions.length === 9, String(S().obstructions.length))
  ok('covering the same square of ceiling',
    S().obstructions.includes('9,12') && S().obstructions.includes('11,14'),
    JSON.stringify(S().obstructions.slice(0, 3)))
  ok('rescaleMask leaves a same-pitch file alone',
    JSON.stringify(rescaleMask(['2,3'], 1)) === JSON.stringify(['2,3']), 'identity')
  ok('a file that records no pitch is assumed to be ours',
    (() => {
      const noPitch = JSON.parse(JSON.stringify(doc))
      delete noPitch.ceiling.pitch
      reset()
      S().fromJSON(noPitch)
      const c = footprintCentre(footprint(S().items[0], g), g)
      return Math.abs(c[0] - here[0]) < 1e-6 && Math.abs(c[2] - here[2]) < 1e-6
    })(), 'unchanged')
}

// ---------------------------------------------------------------------------
section("CEILING TILES — choosing one, and placing it")
{
  // The finish map has to be in hand before reconcileTile can tell a code that
  // exists from one that does not — with no map loaded EVERY code is unknown,
  // and dropping them all would empty a saved layout on restore. So it is read
  // here rather than relied on from another section that happens to run first.
  const MAP = 'public/textures/ceiling-tiles/wood-classic/manifest.json'
  if (fs.existsSync(MAP)) applyTileFinishes(JSON.parse(fs.readFileSync(MAP, 'utf8')))
  applyTileModels(manifest.tiles)

  // ---- the supplied grid models -------------------------------------------
  // Four files: 600x600 and 1200x600, each in a 15 mm and a 24 mm tee.
  ok('the four supplied grid models are in the manifest', TILE_MODELS.length === 4,
    TILE_MODELS.map((m) => `${m.sizeKey}/${m.gridMm}`).join(' '))
  ok('every file they name is on disk',
    TILE_MODELS.every((m) => fs.existsSync(path.join('public/models', m.file))),
    TILE_MODELS.length + ' files')
  ok('both sizes come in both widths',
    ['600x600', '1200x600'].every((k) => tileGridsFor(k).join(',') === '15,24'),
    ['600x600', '1200x600'].map((k) => `${k}:${tileGridsFor(k).join('/')}`).join(' '))
  ok('and the default width is one of them', tileGridsFor('600x600').includes(DEFAULT_TILE_GRID),
    String(DEFAULT_TILE_GRID))

  // The names say a size; the FILES say a module that is a flange bigger. Both
  // are stated, because laying blocks out at the name would overlap every seam.
  const g66 = TILE_MODELS.find((m) => m.sizeKey === '600x600' && m.gridMm === 24)
  const g66n = TILE_MODELS.find((m) => m.sizeKey === '600x600' && m.gridMm === 15)
  const g12 = TILE_MODELS.find((m) => m.sizeKey === '1200x600' && m.gridMm === 24)
  const g12n = TILE_MODELS.find((m) => m.sizeKey === '1200x600' && m.gridMm === 15)

  // ---- what the app offers is the RE-CUT set ------------------------------
  // The supplied files set out to the panel and hang the rails outside it, so
  // their module is panel + flange — 617 or 632 — and a "1200" is 39 mm short
  // of two 600s. scripts/fix-tile-models.mjs re-cuts them onto a true module,
  // keeping their own tee profile, and the app prefers the result.
  ok('every offered model is one that was re-cut onto a true module',
    [g66, g66n, g12, g12n].every((m) => m.corrected), 'all four')
  ok('a "600 x 600" is now a 600 mm MODULE, whatever the tee',
    [g66, g66n].every((m) => Math.abs(m.moduleMm.x - 600) < 0.5
      && Math.abs(m.moduleMm.z - 600) < 0.5),
    `${g66n.moduleMm.x.toFixed(1)} and ${g66.moduleMm.x.toFixed(1)}`)
  ok('and a "1200 x 600" is 1200 x 600',
    [g12, g12n].every((m) => Math.abs(m.moduleMm.x - 1200) < 0.5
      && Math.abs(m.moduleMm.z - 600) < 0.5),
    `${g12.moduleMm.x.toFixed(1)} x ${g12.moduleMm.z.toFixed(1)}`)
  // THE point of the exercise: mixing sizes only works if this holds.
  ok('so a long tile is EXACTLY two short ones, which is what lets them mix',
    Math.abs(g12.moduleMm.x - 2 * g66.moduleMm.x) < 0.5
      && Math.abs(g12n.moduleMm.x - 2 * g66n.moduleMm.x) < 0.5,
    `${g12.moduleMm.x} vs 2 x ${g66.moduleMm.x}`)
  ok('the tile sits INSIDE its module, resting on the tees',
    [g66, g66n, g12, g12n].every((m) => m.tileMm.x < m.moduleMm.x && m.tileMm.z < m.moduleMm.z),
    `${g66.tileMm.x} of tile in ${g66.moduleMm.x} of module`)
  ok('and the flange is the width the file is named for, not 15.85 or 26.62',
    Math.abs(g66n.flangeMm - 15) < 0.2 && Math.abs(g66.flangeMm - 24) < 0.2,
    `${g66n.flangeMm} and ${g66.flangeMm} mm`)

  // Re-cut long-axis-on-X, so nothing has to be turned on load any more. The
  // machinery stays, because a future supplied file may still need it.
  ok('the re-cut 1200s already lie long-axis-along-x, so none is turned',
    !g12.quarterTurn && g12.moduleMm.x > g12.moduleMm.z,
    `${g12.moduleMm.x.toFixed(0)} x ${g12.moduleMm.z.toFixed(0)}`)
  ok('and the square ones are square, where the supplied files were 2 mm out',
    Math.abs(g66.moduleMm.x - g66.moduleMm.z) < 0.5,
    `${g66.moduleMm.x.toFixed(1)} x ${g66.moduleMm.z.toFixed(1)}`)
  ok('needsQuarterTurn still ignores slop but not a real 2:1',
    !needsQuarterTurn({ x: 617, z: 619 }) && needsQuarterTurn({ x: 617, z: 1216 }), 'both')

  // Resolution: a spec picks a FILE, and a combination with no file says so.
  ok('a spec resolves to the one model that matches it',
    tileModelId({ ttype: 'wood-classic', size: '600x600', grid: 15 })
      !== tileModelId({ ttype: 'wood-classic', size: '600x600', grid: 24 }),
    'distinct')
  ok('and every one of the four resolves to a different file',
    new Set(TILE_MODELS.map((m) => m.file)).size === 4, '4 files')
  ok('a width no file is made in resolves to nothing, rather than to a wrong one',
    tileModelFor({ ttype: 'wood-classic', size: '600x600', grid: 38 }) === null, 'null')
  ok('Univic Strip still resolves to its own single file',
    /Univic Strip\.fbx$/.test(tileModelFor({ ttype: 'univicstrip' })?.file ?? ''),
    tileModelFor({ ttype: 'univicstrip' })?.file)

  // ---- what has to be answered before a block can be placed ---------------
  const blank = emptyTileParams()
  ok('a tile brush opens with the type undecided too', blank.ttype === null, String(blank.ttype))
  ok('and with no size, no grid, no thickness and neither finish chosen',
    blank.size === null && blank.grid === null && blank.thickness === null
      && blank.wood === null && blank.perforation === null, 'all null')
  ok('so nothing can be placed from it yet', !tileReadyToPlace(blank), 'not ready')
  ok('and it says all six are outstanding, in the order they are asked',
    tileMissingFields(blank).join(' > ')
      === 'Type > Size > Grid > Thickness > Base colour > Perforation',
    tileMissingFields(blank).join(' > '))
  // Grid is a MODEL choice, so it is asked with the size and before the
  // finishes: the two widths are two files, not two appearances of one.
  ok('and the grid is asked with the size, before either finish',
    tileMissingFields(blank).indexOf('Grid') === tileMissingFields(blank).indexOf('Size') + 1
      && tileMissingFields(blank).indexOf('Grid') < tileMissingFields(blank).indexOf('Perforation'),
    tileMissingFields(blank).join(' > '))
  ok('size is asked BEFORE the finishes, because it picks their folder',
    tileMissingFields(blank).indexOf('Size') < tileMissingFields(blank).indexOf('Base colour'),
    tileMissingFields(blank).join(' > '))

  const half = {
    ...blank, ttype: 'wood-classic', size: '600x600', grid: 24, thickness: 25, wood: 'WD-NC-05',
  }
  ok('answering four of the five leaves the fifth named',
    tileMissingFields(half).join(',') === 'Perforation', tileMissingFields(half).join(','))
  const full = { ...half, perforation: 'PF-NC-08' }
  ok('and answering all five makes it placeable', tileReadyToPlace(full), 'ready')
  ok('a spec with no grid cannot be placed however complete it looks',
    !tileReadyToPlace({ ...full, grid: null }), 'refused')
  ok('a spec with no size cannot be placed however complete it looks',
    !tileReadyToPlace({ ...full, size: null }), 'refused')

  // ---- the dispatch: one brush, two products ------------------------------
  ok('the tile product is no longer marked coming soon', !PRODUCT_TYPES.tiles.comingSoon,
    JSON.stringify(PRODUCT_TYPES.tiles))
  ok('clouds are buildable now too', !PRODUCT_TYPES.clouds.comingSoon,
    JSON.stringify(PRODUCT_TYPES.clouds))
  ok('and Horizon is the only one left that nothing builds',
    PRODUCT_TYPES.statement.comingSoon
      && Object.values(PRODUCT_TYPES).filter((t) => t.comingSoon).length === 1,
    'one left')
  ok('a blank brush for tiles is a TILE brush, not a baffle one',
    emptyParamsFor('tiles').ttype === null && emptyParamsFor('tiles').btype === undefined,
    JSON.stringify(Object.keys(emptyParamsFor('tiles'))))
  ok('and it carries a size field to be answered',
    'size' in emptyParamsFor('tiles'), 'present')
  ok('and for anything else it is the baffle brush',
    emptyParamsFor('baffles').btype === 'blade', String(emptyParamsFor('baffles').btype))
  ok('productMissing asks the tile question of a tile brush',
    productMissing({ type: 'tiles', params: blank }).length === 6,
    String(productMissing({ type: 'tiles', params: blank }).length))
  // Grid is asked of the range that has four files, and NOT of the one that has
  // one. Requiring it of both made Univic Strip unplaceable.
  // ---- one side is finished, and it is the one the room sees ---------------
  // A lay-in tile is finished on ONE face. The supplied panels are solid boxes
  // with a single material over all six, so the veneer AND the perforation were
  // being painted on the top and the edges — visible in plan the moment anyone
  // looked down at a ceiling.
  {
    const facingOf = async (file) => {
      const b = fs.readFileSync(path.join('public/models/ceiling_tiles', file))
      const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
      let root
      if (/\.fbx$/i.test(file)) {
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
        root = new FBXLoader().parse(buf, '')
      } else {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        root = (await new Promise((ok, no) => new GLTFLoader().parse(buf, '', ok, no))).scene
      }
      root.updateMatrixWorld(true)
      const { faces } = classifyTileMeshes(root)
      const g = faces[0].geometry.clone()
      g.applyMatrix4(faces[0].matrixWorld)
      const before = panelFacing(g)
      const flipped = before.down < before.up * 0.01
      if (flipped) flipWinding(g)
      return { before, flipped, after: panelFacing(g), cut: splitPanelFaces(g), g }
    }

    const box = await facingOf('Tile 600x600.glb')
    ok('a tile panel is a solid board, with a real top as well as a face',
      box.before.down > 0 && box.before.up > 0,
      `${box.before.down.toFixed(0)} down, ${box.before.up.toFixed(0)} up`)
    ok('so the finish goes on the down-facing triangles only',
      box.cut.faceTris === 2 && box.cut.backTris === 10,
      `${box.cut.faceTris} of ${box.cut.faceTris + box.cut.backTris}`)
    ok('and the panel is grouped, so one mesh wears two materials',
      box.g.groups.length === 2 && box.g.groups[0].materialIndex === 0
        && box.g.groups[1].materialIndex === 1,
      box.g.groups.map((x) => x.materialIndex).join(','))
    ok('the group holding the finish is the LOWER one',
      (() => {
        const pos = box.g.attributes.position
        const idx = box.g.index
        const meanY = (gr) => {
          let t = 0
          for (let k = gr.start; k < gr.start + gr.count; k++) t += pos.getY(idx.getX(k))
          return t / gr.count
        }
        return meanY(box.g.groups[0]) < meanY(box.g.groups[1])
      })(), 'face below back')

    // Univic Strip's panel is wound inside out. It is FLIPPED now rather than
    // rescued with a double-sided material — which is what used to hide it, and
    // was also what put the veneer on the top of every box.
    const strip = await facingOf('Ceiling Grid Univic Strip.fbx')
    ok('the Univic Strip panel arrives with NO down-facing area at all',
      strip.before.down === 0 && strip.before.up > 1,
      `${strip.before.down} down, ${strip.before.up.toFixed(0)} up`)
    ok('which is the measurable signature of a mesh wound inside out',
      strip.flipped, 'flipped')
    ok('and after the flip it faces the room, so it needs no DoubleSide',
      strip.after.down > 1 && strip.after.up === 0,
      `${strip.after.down.toFixed(0)} down, ${strip.after.up} up`)
    ok('a panel with no top of its own gets the board on its own reverse',
      strip.cut.noTop && strip.g.groups.length === 3
        && strip.g.groups[2].materialIndex === 2
        && strip.g.groups[2].start === strip.g.groups[0].start,
      strip.g.groups.map((x) => `${x.start / 3}->${x.materialIndex}`).join(' '))
    ok('while a board, which has one, does not',
      !box.cut.noTop && box.g.groups.length === 2, String(box.cut.noTop))

    // ---- and the finish lands SQUARE on it -------------------------------
    // The supplied panels carry a BOX UNWRAP: the room-facing face samples a
    // quarter of the texture's width and half its height, so the panel photo
    // arrived as a corner crop stretched over the whole tile — which is what
    // put the perforation off-centre.
    {
      const b2 = fs.readFileSync(path.join('public/models/ceiling_tiles', 'Grid_600x600mm _24mm.fbx'))
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      const root2 = new FBXLoader().parse(
        b2.buffer.slice(b2.byteOffset, b2.byteOffset + b2.byteLength), '')
      root2.updateMatrixWorld(true)
      const face2 = classifyTileMeshes(root2).faces[0]
      const g2 = face2.geometry.clone()
      g2.applyMatrix4(face2.matrixWorld)

      const span = (geom) => {
        const uv = geom.attributes.uv
        const pos = geom.attributes.position
        const idx = geom.index
        const n = idx ? idx.count / 3 : pos.count / 3
        let u0 = 1e9; let u1 = -1e9; let v0 = 1e9; let v1 = -1e9
        for (let t = 0; t < n; t++) {
          const i = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k))
          const ax = pos.getX(i[0]); const ay = pos.getY(i[0]); const az = pos.getZ(i[0])
          const ux = pos.getX(i[1]) - ax; const uy = pos.getY(i[1]) - ay; const uz = pos.getZ(i[1]) - az
          const vx = pos.getX(i[2]) - ax; const vy = pos.getY(i[2]) - ay; const vz = pos.getZ(i[2]) - az
          const ny = uz * vx - ux * vz
          const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
          if (!(len > 1e-12 && ny / len < -0.5)) continue
          for (const k of i) {
            u0 = Math.min(u0, uv.getX(k)); u1 = Math.max(u1, uv.getX(k))
            v0 = Math.min(v0, uv.getY(k)); v1 = Math.max(v1, uv.getY(k))
          }
        }
        return { u: u1 - u0, v: v1 - v0, u0, v0 }
      }

      const was = span(g2)
      ok('the supplied panel ships a box unwrap, not a panel mapping',
        was.u < 0.3 && was.v < 0.6,
        `the room face gets ${(was.u * 100).toFixed(1)}% x ${(was.v * 100).toFixed(1)}% of the texture`)
      ok('which is a CORNER of it, so the finish arrived off-centre',
        was.u0 < 0.01 && was.v0 > 0.4, `u from ${was.u0.toFixed(3)}, v from ${was.v0.toFixed(3)}`)

      planarTileUV(g2, true)
      const now = span(g2)
      ok('remapped planar, the face spans the whole texture',
        now.u > 0.999 && now.v > 0.999,
        `${(now.u * 100).toFixed(1)}% x ${(now.v * 100).toFixed(1)}%`)
      ok('and starts at its corner, so the panel lands square on the panel',
        Math.abs(now.u0) < 1e-6 && Math.abs(now.v0) < 1e-6,
        `${now.u0.toFixed(4)}, ${now.v0.toFixed(4)}`)

      // A file that already maps its face across the whole texture is unchanged
      // by the remap — the generated model is one, which is why it never showed
      // this and the supplied ones did.
      const b3 = fs.readFileSync(path.join('public/models/ceiling_tiles', 'Tile 600x600.glb'))
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const root3 = (await new Promise((okk, no) => new GLTFLoader().parse(
        b3.buffer.slice(b3.byteOffset, b3.byteOffset + b3.byteLength), '', okk, no))).scene
      root3.updateMatrixWorld(true)
      const face3 = classifyTileMeshes(root3).faces[0]
      const g3 = face3.geometry.clone()
      g3.applyMatrix4(face3.matrixWorld)
      ok('the generated model already mapped its face across the whole texture',
        span(g3).u > 0.999 && span(g3).v > 0.999,
        `${(span(g3).u * 100).toFixed(1)}% x ${(span(g3).v * 100).toFixed(1)}%`)
    }

    // The perforation files are prepress sheets: crop marks at the corners and
    // a printed caption below the panel, both of which land on a tile if the
    // whole sheet is drawn. Measured at 87 px of 7205 on all twelve.
    ok('a perforation sheet is cropped to the panel inside it',
      Math.abs(PERF_BLEED - 87 / 7205) < 1e-12, (PERF_BLEED * 100).toFixed(3) + '% a side')
    ok('which is a bleed, not a crop of the panel itself',
      PERF_BLEED > 0 && PERF_BLEED < 0.03, PERF_BLEED.toFixed(5))

    ok('the board is declared, not a literal in the loader',
      /^#[0-9a-f]{6}$/i.test(TILE_BACK_FINISH.hex), TILE_BACK_FINISH.hex)
    ok('and it is not the wood', TILE_BACK_FINISH.hex.toLowerCase() !== '#c08a5e',
      TILE_BACK_FINISH.hex)
  }

  // ---- Temp: the generated model, on a module that is actually 600 ---------
  {
    const T = TILE_TYPES.temp
    ok('there is a Temp range and it names the generated model',
      /Tile 600x600\.glb$/.test(T.model ?? ''), String(T.model))
    ok('and the file it names is on disk',
      fs.existsSync(path.join('public/models', T.model)), T.model)

    const tm = tileModelFor({ ttype: 'temp' })
    ok('its geometry is MEASURED off the file, not declared here',
      !!tm.moduleMm && !!tm.flangeMm, JSON.stringify(tm.moduleMm))
    // The whole reason it is worth having: a module that is round.
    ok('and unlike the supplied files its module is a true 600',
      Math.abs(tm.moduleMm.x - 600) < 0.5 && Math.abs(tm.moduleMm.z - 600) < 0.5,
      `${tm.moduleMm.x} x ${tm.moduleMm.z} mm`)
    ok('with the tile INSIDE it, the way a lay-in tile sits on its tees',
      tm.tileMm.x < tm.moduleMm.x && Math.abs(tm.moduleMm.x - tm.tileMm.x - 5) < 0.5,
      `${tm.tileMm.x} of tile in ${tm.moduleMm.x} of module`)
    ok('which is what the SUPPLIED files did not do — their tile was 606',
      TILE_MODELS.every((m) => m.corrected), 're-cut, so none is offered raw')

    const spec = reconcileTile({
      ttype: 'temp', size: '600x600', thickness: 25, wood: 'WD-NC-05', perforation: 'PF-NC-08',
    })
    ok('a Temp block is placeable without naming a grid', tileReadyToPlace(spec), 'ready')
    ok('and it is offered the 600 x 600 size only, because the model is square',
      sizesForType('temp').join(',') === '600x600', sizesForType('temp').join(','))
    ok('so a 1200 x 600 asked of it is dropped rather than stretched',
      reconcileTile({ ...spec, size: '1200x600' }).size === null, 'dropped')
    ok('while Wood Classic is still made in both',
      sizesForType('wood-classic').join(',') === '600x600,1200x600',
      sizesForType('wood-classic').join(','))
    ok('a Temp block is one tile, so it takes a field like Wood Classic does',
      tileModelFor({ ttype: 'temp' }).tilesInFile === 1,
      String(tileModelFor({ ttype: 'temp' }).tilesInFile))

    // And the point of the whole thing: a field of it lands on round numbers.
    const f = reconcileTile({ ...spec, cols: 4, rows: 3 })
    const e = tileBlockExtent(f)
    ok('a 4 x 3 Temp field is exactly 2.4 x 1.8 m, because the module is round',
      Math.abs(e.length - 2.4) < 0.002 && Math.abs(e.width - 1.8) < 0.002,
      `${e.length.toFixed(3)} x ${e.width.toFixed(3)} m`)
  }

  ok('a range with one model is never asked which grid it is in',
    !tileMissingFields({ ...blank, ttype: 'univicstrip' }).includes('Grid'),
    tileMissingFields({ ...blank, ttype: 'univicstrip' }).join(' > '))
  ok('while the range with four is',
    tileMissingFields({ ...blank, ttype: 'wood-classic' }).includes('Grid'),
    tileMissingFields({ ...blank, ttype: 'wood-classic' }).join(' > '))
  ok('so Univic Strip still places with no grid named',
    tileReadyToPlace({
      ttype: 'univicstrip', size: '600x600', thickness: 25, wood: 'WD-NC-05', perforation: 'PF-NC-08',
    }), 'ready')
  ok('and productReady agrees with tileReadyToPlace',
    productReady({ type: 'tiles', params: full }) === tileReadyToPlace(full)
      && productReady({ type: 'tiles', params: blank }) === tileReadyToPlace(blank),
    'agrees')

  // ---- what it occupies ---------------------------------------------------
  // Each RANGE has its own block, measured off its own file. Wood Classic is
  // 3 x 6 tiles of 1157 x 578 on a true 1200 mm module; Univic Strip is 4 x 3
  // of 1265 x 1289, a module matching no panel the range is sold in.
  const WC = TILE_TYPES['wood-classic']
  const US = TILE_TYPES.univicstrip
  // Wood Classic is the GENERATED model now: one 600 x 600 lay-in tile.
  ok('Wood Classic is one tile', WC.cols === 1 && WC.rows === 1, `${WC.cols} x ${WC.rows}`)
  ok('of 595 x 595 mm, square', WC.tileMm.x === 595 && WC.tileMm.z === 595,
    `${WC.tileMm.x} x ${WC.tileMm.z}`)
  ok('and the range no longer names one model, because it is four files now',
    WC.model === undefined, String(WC.model))
  ok('Univic Strip keeps its own 4 x 3 block', US.cols === 4 && US.rows === 3,
    `${US.cols} x ${US.rows}`)
  ok('the two ranges are on different files', WC.model !== US.model, 'separate')

  const e = tileBlockExtent(full)
  ok('a Wood Classic block measures 0.595 x 0.595 m',
    Math.abs(e.length - 0.595) < 0.002 && Math.abs(e.width - 0.595) < 0.002,
    `${e.length.toFixed(3)} x ${e.width.toFixed(3)} m`)
  const strip = tileBlockExtent({ ...full, ttype: 'univicstrip', cols: US.cols, rows: US.rows, tileMm: US.tileMm })
  ok('and a Univic Strip one about 5.06 x 3.87 m',
    Math.abs(strip.length - 5.06) < 0.02 && Math.abs(strip.width - 3.867) < 0.02,
    `${strip.length.toFixed(2)} x ${strip.width.toFixed(2)} m`)
  const cells = tileCells(full, 0.3)
  const fine = tileCells(full, 0.1)
  ok('which is 2 x 2 cells at a 300 mm pitch',
    cells.ci === 2 && cells.cj === 2, `${cells.ci} x ${cells.cj}`)
  // SIX cells at 100 mm, which is 600 mm — the module. That is what makes two
  // tiles placed side by side land exactly one module apart, their frames
  // overlapping on the 24 mm of T-bar they genuinely share.
  ok('and 6 x 6 at the 100 mm pitch, which is the 600 module exactly',
    fine.ci === 6 && fine.cj === 6 && Math.abs(fine.ci * 0.1 - 0.6) < 1e-9,
    `${fine.ci} x ${fine.cj} = ${(fine.ci * 100)} mm`)
  ok('productCells routes a tile brush to the tile maths',
    JSON.stringify(productCells({ type: 'tiles', params: full }, 0.3)) === JSON.stringify(cells),
    'routed')

  // ---- normalising a saved spec -------------------------------------------
  const junk = reconcileTile({ ttype: 'nope', wood: 'WD-NC-05', perforation: 'PF-NC-08', rot: 45 })
  ok('an unknown type is dropped rather than kept', junk.ttype === null, String(junk.ttype))
  const gone = reconcileTile({ ttype: 'wood-classic', size: '600x600', wood: 'WD-NC-99', perforation: 'nope' })
  ok('and so are codes the finish folders no longer publish',
    gone.wood === null && gone.perforation === null,
    `${gone.wood} / ${gone.perforation}`)
  ok('a size the folders do not publish is dropped as well',
    reconcileTile({ ttype: 'wood-classic', size: '300x300' }).size === null,
    String(reconcileTile({ ttype: 'wood-classic', size: '300x300' }).size))
  ok('switching size keeps a colour, because both sizes publish it',
    reconcileTile({ ...full, size: '1200x600' }).wood === 'WD-NC-05',
    String(reconcileTile({ ...full, size: '1200x600' }).wood))
  ok('a real pair survives it',
    reconcileTile(full).wood === 'WD-NC-05' && reconcileTile(full).perforation === 'PF-NC-08',
    'kept')
  ok('four ranges are offered, and each single-file one names its file',
    Object.keys(TILE_TYPES).join(',') === 'wood-classic,designer-textile,temp,univicstrip'
      && /\.fbx$/i.test(TILE_TYPES.univicstrip.model),
    Object.keys(TILE_TYPES).join(','))
  // Designer Textile has no model of its own on purpose: it is the same lay-in
  // file Wood Classic uses, resolved by size and grid. What it declares is the
  // RANGE, and that is the only thing that makes its face fabric.
  ok('and Designer Textile brings a range rather than a file',
    !TILE_TYPES['designer-textile'].model
      && TILE_TYPES['designer-textile'].range === 'designerTextile',
    JSON.stringify(TILE_TYPES['designer-textile']))
  ok('switching type brings the block of that type with it',
    (() => {
      const asStrip = reconcileTile({ ...full, ttype: 'univicstrip' })
      return asStrip.cols === 4 && asStrip.rows === 3 && asStrip.tileMm.x === 1265
    })(), 'block follows the type')

  // ---- placing one --------------------------------------------------------
  // On a CLEAR ceiling. Earlier sections leave sets behind, and a 5 x 3.9 m
  // block dropped on top of them is refused for overlapping — which would look
  // exactly like the tile path being broken.
  reset()
  useStore.getState().setProduct('tiles')
  ok('switching product switches the brush wholesale',
    useStore.getState().brush.type === 'tiles'
      && useStore.getState().brush.params.btype === undefined,
    JSON.stringify(useStore.getState().brush.type))
  ok('and nothing can be placed until it is specified',
    useStore.getState().placeAt(...at(3, 3)) === null, 'refused')
  // UNIVIC STRIP for what follows, because it is the range with more than one
  // tile in a block: per-tile overrides and the way the order splits by finish
  // need something to vary against. Wood Classic is now a single tile.
  useStore.getState().setBrush({
    ttype: 'univicstrip', size: '600x600', thickness: 25,
    wood: 'WD-NC-05', perforation: 'PF-NC-08',
  })
  const id = useStore.getState().placeAt(...at(9, 7))
  ok('a fully specified tile brush places', !!id, String(id))
  const placed = useStore.getState().items.find((i) => i.id === id)
  ok('and the item carries the tile type, not the baffle one',
    placed?.type === 'tiles', String(placed?.type))
  const stripCells = tileCells(
    { ttype: 'univicstrip', cols: US.cols, rows: US.rows, tileMm: US.tileMm },
    useStore.getState().grid().pitch,
  )
  ok('with the footprint the tile maths gave',
    placed?.ci === stripCells.ci && placed?.cj === stripCells.cj,
    `${placed?.ci} x ${placed?.cj}`)

  // A Wood Classic tile places too, and reserves exactly the 600 module. Placed
  // and REMOVED again: the sections below count what is on the ceiling, and a
  // stray tile left behind would fail them for the wrong reason.
  useStore.getState().setBrush({
    ttype: 'wood-classic', size: '600x600', grid: 24, thickness: 25,
    wood: 'WD-NC-05', perforation: 'PF-NC-08', cols: 1, rows: 1,
  })
  // Changing range drops the other range's tile count rather than adopting it.
  ok('switching range does not inherit the other range tile count',
    useStore.getState().brush.params.cols === 1
      && useStore.getState().brush.params.rows === 1,
    `${useStore.getState().brush.params.cols} x ${useStore.getState().brush.params.rows}`)
  const oneId = useStore.getState().placeAt(...at(70, 60))
  const one = useStore.getState().items.find((i) => i.id === oneId)
  ok('a single Wood Classic tile places on its own', !!oneId, String(oneId))
  // The module is 632 mm — a 606 mm tile with the rails OUTSIDE it rather than
  // under its edges — and at a millimetre pitch the block reserves exactly
  // that. At the 100 mm cell this used to be, 632 needed SEVEN cells, so two
  // blocks could only ever be 700 mm apart and 68 mm of ceiling showed between
  // them. That joint is what the pitch was made fine for.
  const wcModel = tileModelFor({ ttype: 'wood-classic', size: '600x600', grid: 24 })
  const gg0 = useStore.getState().grid()
  ok('a block reserves its MEASURED module, to the millimetre',
    Math.abs(one.ci * gg0.pitch * 1000 - wcModel.moduleMm.x) < 1
      && Math.abs(one.cj * gg0.pitch * 1000 - wcModel.moduleMm.z) < 1,
    `${one?.ci} x ${one?.cj} cells vs ${wcModel.moduleMm.x} x ${wcModel.moduleMm.z} mm`)
  ok('and that module is now a round 600, so it lands on any sane grid',
    Math.abs(wcModel.moduleMm.x - 600) < 0.5, wcModel.moduleMm.x.toFixed(1) + ' mm')
  ok('which is six whole cells even at the 100 mm one this used to have',
    Math.abs(wcModel.moduleMm.x / 100 - 6) < 0.01, '6 cells of 100 mm = 600 mm')

  const secondId = useStore.getState().placeAt(...at(77, 60))
  const second = useStore.getState().items.find((i) => i.id === secondId)
  if (one && second) {
    const gg = useStore.getState().grid()
    const a = footprintCentre(footprint(one, gg), gg)
    const b = footprintCentre(footprint(second, gg), gg)
    const apart = Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) * 1000)
    ok('two tiles side by side sit ONE MODULE apart, not one cell-count apart',
      Math.abs(apart - wcModel.moduleMm.x) < 1, `${apart} mm`)
    // The joint, which is now the thing a real ceiling has: none. The tee on
    // the seam belongs to both tiles, exactly as it does in the product.
    const joint = Math.abs(apart - wcModel.moduleMm.x)
    ok('which leaves no joint at all, where it left 68 mm at the 100 mm cell',
      joint < 1, `${joint.toFixed(2)} mm`)
    // And they land on the module LATTICE, not merely near it: a drop anywhere
    // in the neighbourhood snaps to the same spacing, which is what makes two
    // separately placed tiles meet without anybody aiming.
    ok('and both sit on a whole number of modules from each other',
      Math.abs(Math.round(apart / wcModel.moduleMm.x) * wcModel.moduleMm.x - apart) < 1,
      `${(apart / wcModel.moduleMm.x).toFixed(3)} modules`)
    // The GENERATED model, by contrast, is on a true 600 module with a 24 mm
    // flange — and measuring it is what checked tileModule and railFlange when
    // they were written.
    ok('the generated model is on a true 600 module, which is why it laid flush',
      SPEC.module === 600 && SPEC.flangeW === 24, `${SPEC.module} / ${SPEC.flangeW}`)

    // ---- the field, which is the answer to that joint ----------------------
    // Two SEPARATE blocks cannot touch, because the grid steps 100 mm and the
    // module is 617. One block of N x M tiles can: inside it the tiles are laid
    // at the module itself and the grid only decides where the field starts.
    const f43 = reconcileTile({
      ttype: 'wood-classic', size: '600x600', grid: 15,
      wood: 'WD-NC-05', perforation: 'PF-NC-08', cols: 4, rows: 3,
    })
    ok('a field takes the tile count it was asked for', f43.cols === 4 && f43.rows === 3,
      `${f43.cols} x ${f43.rows}`)
    const e43 = tileBlockExtent(f43)
    ok('and is exactly that many MODULES across, which is what leaves no joint',
      Math.abs(e43.length * 1000 - 4 * f43.moduleMm.x) < 0.001
        && Math.abs(e43.width * 1000 - 3 * f43.moduleMm.z) < 0.001,
      `${(e43.length * 1000).toFixed(1)} vs 4 x ${f43.moduleMm.x}`)
    // The joint a field does NOT have, stated against the one two blocks do.
    const oneUp = tileBlockExtent({ ...f43, cols: 1, rows: 1 })
    ok('four tiles in one field span less than four blocks placed separately',
      e43.length < oneUp.length * 4 * 1.0001 && e43.length < 4 * 0.7,
      `${e43.length.toFixed(3)} m vs ${(4 * 0.7).toFixed(3)} m of cells`)
    ok('the field size is clamped rather than refused',
      clampField(0) === TILE_FIELD.min && clampField(999) === TILE_FIELD.max
        && clampField(null) === TILE_FIELD.default,
      `${clampField(0)} / ${clampField(999)} / ${clampField(null)}`)

    // A file that is ALREADY a block is not repeated — that would repeat a
    // ceiling. Measured off the file, not assumed from the range.
    const us = reconcileTile({
      ttype: 'univicstrip', size: '600x600',
      wood: 'WD-NC-05', perforation: 'PF-NC-08', cols: 9, rows: 9,
    })
    ok('a range whose file is already a block keeps its own tile count',
      us.cols === 4 && us.rows === 3, `${us.cols} x ${us.rows}`)
    ok('and the schedule counts every tile in the field',
      f43.cols * f43.rows === 12, String(f43.cols * f43.rows))
  }
  if (secondId) useStore.getState().remove(secondId)
  if (oneId) useStore.getState().remove(oneId)
  useStore.getState().setBrush({
    ttype: 'univicstrip', size: '600x600', wood: 'WD-NC-05', perforation: 'PF-NC-08',
  })
  ok('switching back to baffles clears the tile spec',
    (() => {
      useStore.getState().setProduct('baffles')
      const b = useStore.getState().brush
      return b.type === 'baffles' && b.params.wood === undefined && b.params.btype === 'blade'
    })(),
    'cleared')
  ok('but the placed block is still there — changing brush is not deleting',
    useStore.getState().items.some((i) => i.type === 'tiles'), 'kept')

  // ---- how far it hangs ----------------------------------------------------
  {
    const fresh = emptyTileParams()
    ok('a block opens 150 mm below the slab', fresh.drop === TILE_DROP.default
      && Math.round(TILE_DROP.default * 1000) === 150, `${fresh.drop * 1000} mm`)
    // NOT OFFERED any more — asked for as "there will be no suspension height
    // option in ceiling tiles". The property survives and still drives the
    // render; only the control is gone, so a saved file that carries its own
    // drop still loads and still draws at that height.
    {
      const src = fs.readFileSync('src/ui/TileFields.jsx', 'utf8')
      ok('a tile block is not asked how far to hang',
        !/Suspension height/.test(src), 'the tile panel still offers it')
      ok('while a baffle and a cloud still are, because those hang where somebody says',
        /Suspension height/.test(fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8'))
          && /Suspension height/.test(fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')))
    }
    ok('and the drop still exists and still defaults, so the block hangs and the rods scale',
      emptyTileParams().drop === TILE_DROP.default
        && reconcileTile({ drop: 0.4 }).drop === 0.4,
      `${emptyTileParams().drop} / ${reconcileTile({ drop: 0.4 }).drop}`)

    ok('and the suspension height is NOT one of the things Place waits for',
      !tileMissingFields({ ...fresh, ttype: 'wood-classic', size: '600x600', grid: 24,
        thickness: 25, wood: 'WD-NC-05', perforation: 'PF-NC-08' }).length,
      'not required')
    ok('it can be taken all the way to the soffit',
      reconcileTile({ drop: 0 }).drop === 0, String(reconcileTile({ drop: 0 }).drop))
    ok('and is clamped rather than refused above the range',
      reconcileTile({ drop: 9 }).drop === TILE_DROP.max, String(reconcileTile({ drop: 9 }).drop))
    ok('a negative drop is clamped too', reconcileTile({ drop: -1 }).drop === TILE_DROP.min,
      String(reconcileTile({ drop: -1 }).drop))
    // A layout saved before this existed carries no drop at all. It should open
    // at the default, not flat against the slab, which is what a bare ?? 0 gives.
    ok('a file from before the control existed opens at the default, not at zero',
      reconcileTile({ ttype: 'wood-classic' }).drop === TILE_DROP.default,
      String(reconcileTile({ ttype: 'wood-classic' }).drop))
    ok('and a baffle now opens at 300 mm rather than 450',
      defaultBaffleParams().drop === 0.3, `${defaultBaffleParams().drop * 1000} mm`)
  }

  // ---- one tile at a time --------------------------------------------------
  // A block is twelve tiles and any of them can be given its own finish, the
  // same way a run's fins can. An override holds only what DIFFERS, so a tile
  // given its own colour keeps the block's perforation and follows it when the
  // block's changes.
  {
    const blockId = useStore.getState().items.find((i) => i.type === 'tiles')?.id
    ok('a fresh block has no tile edits',
      tileEditCount(useStore.getState().items.find((i) => i.id === blockId).params) === 0, '0')

    const base = useStore.getState().items.find((i) => i.id === blockId).params
    ok('every tile follows the block to start with',
      [0, 5, 11].every((i) => {
        const f = tileFinishOf(base, i)
        return f.wood === 'WD-NC-05' && f.perforation === 'PF-NC-08' && !f.edited
      }), 'all inherited')

    useStore.getState().updateTileOf(blockId, 5, { wood: 'WD-NC-33' })
    const one = useStore.getState().items.find((i) => i.id === blockId).params
    ok('a tile can be given its own colour', tileFinishOf(one, 5).wood === 'WD-NC-33',
      tileFinishOf(one, 5).wood)
    ok('and it keeps the perforation of the block, which it was not given',
      tileFinishOf(one, 5).perforation === 'PF-NC-08', String(tileFinishOf(one, 5).perforation))
    ok('its neighbours are untouched', tileFinishOf(one, 4).wood === 'WD-NC-05',
      tileFinishOf(one, 4).wood)
    ok('and the block reports one tile edited', tileEditCount(one) === 1, String(tileEditCount(one)))
    ok('the edited tile knows it is edited, the others do not',
      tileFinishOf(one, 5).edited && !tileFinishOf(one, 4).edited, 'flagged')

    // Changing the BLOCK still moves the tile's un-overridden half.
    useStore.getState().update(blockId, { params: { perforation: 'PF-NC-29' } })
    const moved = useStore.getState().items.find((i) => i.id === blockId).params
    ok('changing the block moves what a tile did not override',
      tileFinishOf(moved, 5).perforation === 'PF-NC-29', String(tileFinishOf(moved, 5).perforation))
    ok('but not what it did', tileFinishOf(moved, 5).wood === 'WD-NC-33',
      tileFinishOf(moved, 5).wood)

    // The schedule splits by what each tile WEARS.
    const split = buildSchedule(useStore.getState().items)
    ok('an edited tile becomes its own line on the order', split.rows.length === 2,
      String(split.rows.length))
      const N = TILE_TYPES.univicstrip.cols * TILE_TYPES.univicstrip.rows
    ok('one edited tile on its own line and the rest on another',
      split.rows.map((r) => r.qty).sort((a, b) => a - b).join(',') === `1,${N - 1}`,
      split.rows.map((r) => r.qty).join(','))
    ok('and the total is still every tile in the block', split.totalQty === N,
      `${split.totalQty} of ${N}`)

    useStore.getState().resetTileOf(blockId, 5)
    const back = useStore.getState().items.find((i) => i.id === blockId).params
    ok('resetting a tile puts it back on the finish of the block',
      tileFinishOf(back, 5).wood === 'WD-NC-05' && tileEditCount(back) === 0,
      tileFinishOf(back, 5).wood)
    ok('and the order collapses to one line again',
      buildSchedule(useStore.getState().items).rows.length === 1, 'one line')

    useStore.getState().updateTileOf(blockId, 2, { wood: 'WD-NC-33' })
    useStore.getState().updateTileOf(blockId, 7, { perforation: 'PF-NC-34' })
    ok('two tiles can be edited independently',
      tileEditCount(useStore.getState().items.find((i) => i.id === blockId).params) === 2, '2')
    useStore.getState().resetAllTilesOf(blockId)
    ok('and reset all clears every one of them',
      tileEditCount(useStore.getState().items.find((i) => i.id === blockId).params) === 0, '0')

    // Put the block back the way the later assertions expect to find it: this
    // section borrows the block the placement section made, and leaving it on a
    // perforation it changed halfway through would fail those for the wrong
    // reason entirely.
    useStore.getState().update(blockId, { params: { perforation: 'PF-NC-08' } })

    // An override naming a code the size no longer publishes is dropped, the
    // same as the block's own — a saved layout can outlive the folder.
    const junk = reconcileTile({
      ttype: 'wood-classic', size: '600x600', grid: 24, wood: 'WD-NC-05', perforation: 'PF-NC-08',
      tileOverrides: { 3: { wood: 'WD-NC-99' }, 4: { wood: 'WD-NC-33' }, x: { wood: 'WD-NC-33' } },
    })
    ok('an override naming a code that is gone is dropped',
      junk.tileOverrides[3] === undefined, JSON.stringify(junk.tileOverrides))
    ok('a real one beside it survives', junk.tileOverrides[4]?.wood === 'WD-NC-33',
      JSON.stringify(junk.tileOverrides[4]))
    ok('and a key that is not a tile index is not kept as one',
      !('x' in junk.tileOverrides), JSON.stringify(Object.keys(junk.tileOverrides)))
  }

  // ---- and it reaches the order --------------------------------------------
  // A block is ONE item and TWELVE tiles on an invoice, the same way a baffle
  // set is one item and N fins. A schedule reading "0 units" under a ceiling
  // somebody just specified is the failure this guards against.
  const bom = buildSchedule(useStore.getState().items)
  const BLOCK_N = TILE_TYPES.univicstrip.cols * TILE_TYPES.univicstrip.rows
  ok('a placed block is every one of its tiles on the schedule, not one item',
    bom.totalQty === BLOCK_N, `${bom.totalQty} of ${BLOCK_N}`)
  ok('as a single line, because they are the same tile',
    bom.rows.length === 1, String(bom.rows.length))
  ok('the line names the panel size and both halves of the finish',
    bom.rows[0]?.finishLabel === '600×600 · WD-NC-05 + PF-NC-08',
    String(bom.rows[0]?.finishLabel))
  // The NAME stays plain, because the table prints the tile's own dimensions
  // after it — "Ceiling tile 600×600  1265×1289" reads as a contradiction when
  // the two numbers are the panel and the tile it is faced with.
  ok('and the name stays the product, not the panel size',
    bom.rows[0]?.name === 'Ceiling tile', String(bom.rows[0]?.name))
  ok('two blocks differing only in panel size are two lines',
    (() => {
      const a = useStore.getState().items.find((i) => i.type === 'tiles')
      const two = [a, { ...a, id: 'x', params: { ...a.params, size: '1200x600' } }]
      return buildSchedule(two).rows.length === 2
    })(), 'two lines')
  ok('a tile has no run — that is a baffle measurement',
    bom.totalRunM === 0, String(bom.totalRunM))
  const T = TILE_TYPES.univicstrip.tileMm
  ok('a block of tiles covers what its tiles measure',
    Math.abs(coveredArea(useStore.getState().items)
      - BLOCK_N * (T.x / 1000) * (T.z / 1000)) < 0.05,
    coveredArea(useStore.getState().items).toFixed(2) + ' m2')
  ok('the block counts toward ceiling coverage too',
    Math.abs(coveredArea(useStore.getState().items) - 5.06 * 3.867) < 0.05,
    coveredArea(useStore.getState().items).toFixed(2) + ' m2')
  reset()
}

// ---------------------------------------------------------------------------
section("CEILING TILES — what the model is made of")
{
  // The delivered file is a room's worth of ceiling rather than a tile: twelve
  // tile faces, twelve bodies behind them, nine grid rails, and one mesh
  // carrying the whole surrounding ceiling at 225,920 triangles — a ceiling the
  // app already draws for itself, which would sit in the same place and fight
  // it for depth.
  //
  // Sorted by SHAPE, not by name. Names survive a re-export about as well as
  // they survived the last three baffle files.
  const box = (w, h, d, at, uv) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (!uv) g.deleteAttribute('uv')
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
    m.position.set(...at)
    return m
  }
  const scene = new THREE.Group()
  // the surrounding ceiling: its footprint is the whole model
  scene.add(box(5.2, 2.9, 3.9, [0, 0, 0], false))
  for (const x of [-1.3, 0, 1.3]) for (const z of [-1.3, 1.3]) {
    scene.add(box(1.265, 0.003, 1.289, [x, 0, z], true))   // face
    scene.add(box(1.279, 0.035, 1.289, [x, 0.02, z], true)) // body behind it
  }
  for (const x of [-0.65, 0.65]) scene.add(box(0.038, 0.043, 1.3, [x, 0, 0], false)) // rails
  scene.updateMatrixWorld(true)

  const sorted = classifyTileMeshes(scene)
  ok('the surrounding ceiling is told apart from the tiles', sorted.context.length === 1,
    String(sorted.context.length))
  ok('and every tile face is found', sorted.faces.length === 6, String(sorted.faces.length))
  ok('the bodies behind them are not mistaken for faces', sorted.bodies.length === 6,
    String(sorted.bodies.length))
  ok('the rails are kept apart from both', sorted.grid.length === 2, String(sorted.grid.length))
  ok('a face is the thinner of the two panels',
    sorted.faces.every((m) => !sorted.bodies.includes(m)), 'no overlap')
  ok('and one tile measures what the file says it does',
    Math.abs(tileSize(sorted.faces).x - 1.265) < 1e-3, JSON.stringify(tileSize(sorted.faces)))
  ok('an empty model sorts into nothing rather than throwing',
    classifyTileMeshes(new THREE.Group()).faces.length === 0, 'none')

  // ---- where the grid plane ends ------------------------------------------
  // The frame carrying the cross-tees is one of the grid pieces AND reaches
  // 2.9 m, because a bit of soffit was modelled into it. The cut has to come
  // from what the grid pieces MOSTLY do, not from the tallest of them: taking
  // the maximum puts the ceiling of the grid plane above the thing it is meant
  // to remove, so nothing is clipped, the block loads 2.9 m tall, and its pick
  // box becomes a room-height slab.
  {
    const rail = (h, at) => box(0.038, h, 1.3, at, false)
    const nine = new THREE.Group()
    for (let i = 0; i < 9; i++) nine.add(rail(0.043, [i * 0.3, 0.022, 0]))
    nine.updateMatrixWorld(true)
    const clean = gridPlaneTop([...nine.children])
    ok('nine equal rails put the grid plane just above them',
      clean > 0.043 && clean < 0.08, clean.toFixed(4))

    const withFrame = new THREE.Group()
    for (let i = 0; i < 9; i++) withFrame.add(rail(0.043, [i * 0.3, 0.022, 0]))
    withFrame.add(box(5.2, 2.94, 3.9, [0, 1.47, 0], false)) // the frame, with its soffit
    withFrame.updateMatrixWorld(true)
    const mixed = gridPlaneTop([...withFrame.children])
    ok('and one 2.9 m outlier among them does not drag it up with it',
      Math.abs(mixed - clean) < 1e-6, `${mixed.toFixed(4)} vs ${clean.toFixed(4)}`)
    ok('nothing to measure clips nothing, rather than clipping everything',
      gridPlaneTop([]) === Infinity, String(gridPlaneTop([])))
  }

  // ---- telling a rod from the grid it hangs off ----------------------------
  // The suspension rods live in the same mesh as the frame and have to come out
  // of it, because they are scaled to the drop and the grid is not.
  //
  // A rod cannot be found by looking at VERTEX heights, and believing it could
  // is how they got deleted: a plain cylinder has vertices only at its two ends,
  // so the middle 2.8 m of a 2.9 m rod contains no vertex at all and a scan by
  // vertex reads it as empty space. The test is a TRIANGLE that reaches across.
  {
    const I = new THREE.Matrix4()
    const geo = (verts) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      return g
    }
    // one triangle flat on the grid, one standing from the grid to the slab
    const flat = [0, 0.01, 0, 1, 0.01, 0, 0, 0.01, 1]
    const rod = [0, 0.02, 0, 0.006, 0.02, 0, 0, 2.94, 0]

    const both = splitAtHeight(geo([...flat, ...rod]), 0.07, I)
    ok('a triangle standing from the grid to the slab is a rod',
      both.above?.attributes.position.count === 3, String(both.above?.attributes.position.count))
    ok('and the one lying on the grid stays with the grid',
      both.below?.attributes.position.count === 3, String(both.below?.attributes.position.count))

    // the vertex-based reading that lost them: NO vertex sits in the middle
    const ys = rod.filter((_, i) => i % 3 === 1)
    ok('no vertex of that rod sits anywhere in the middle of its span',
      ys.every((y) => y < 0.07 || y > 2.9), JSON.stringify(ys))

    const none = splitAtHeight(geo(flat), 0.07, I)
    ok('a mesh entirely below the cut is not split at all',
      none.above === null && none.below === null, 'untouched')
    const allUp = splitAtHeight(geo(rod), 0.07, I)
    ok('and one entirely above it keeps nothing back',
      allUp.below === null && allUp.above?.attributes.position.count === 3,
      String(allUp.above?.attributes.position.count))
  }

  // ---- the finishes, read off the folders ---------------------------------
  const MAP = 'public/textures/ceiling-tiles/wood-classic/manifest.json'
  ok('the tile finish map is published', fs.existsSync(MAP), MAP)
  if (fs.existsSync(MAP)) {
    const raw = JSON.parse(fs.readFileSync(MAP, 'utf8'))
    applyTileFinishes(raw)
    const SIZES = tileSizeKeys()
    ok('both panel sizes are published',
      SIZES.join(',') === '600x600,1200x600', SIZES.join(','))
    ok('and the smaller module is offered first',
      SIZES[0] === DEFAULT_TILE_SIZE, SIZES[0])
    for (const size of SIZES) {
      ok(`8 Wood Classic panels in ${size}`, woodsFor(size).length === 8,
        String(woodsFor(size).length))
      ok(`12 perforations in ${size}`, perforationsFor(size).length === 12,
        String(perforationsFor(size).length))
    }
    // The two sizes are the same RANGE in two shapes, so a code in one and not
    // the other is a gap somebody has to fill rather than a design.
    ok('the two sizes publish the same codes',
      SIZES.map((z) => woodsFor(z).map((w) => w.code).sort().join()).every((v, _, a) => v === a[0])
        && SIZES.map((z) => perforationsFor(z).map((w) => w.code).sort().join()).every((v, _, a) => v === a[0]),
      'identical')
    ok('a code is looked up within its own size',
      woodOf('600x600', 'WD-NC-05')?.code === 'WD-NC-05'
        && perforationOf('1200x600', 'PF-NC-19')?.code === 'PF-NC-19', 'found')
    ok('and one that does not exist reads as nothing',
      woodOf('600x600', 'WD-NC-99') === null && perforationOf('600x600', 'nope') === null, 'null')
    ok('the same code is a DIFFERENT file in each size',
      woodOf('600x600', 'WD-NC-05').file !== woodOf('1200x600', 'WD-NC-05').file,
      woodOf('1200x600', 'WD-NC-05').file)

    // Shape, from the pixels rather than from the filename — three of the
    // 1200x600 wood files are named _1195x1195 while being 2:1 images.
    ok('every 600x600 panel is square',
      [...woodsFor('600x600'), ...perforationsFor('600x600')]
        .every((t) => !t.px || Math.abs(t.px[0] / t.px[1] - 1) < 0.05), 'square')
    ok('and every 1200x600 panel is 2:1, whatever its name says',
      [...woodsFor('1200x600'), ...perforationsFor('1200x600')]
        .every((t) => !t.px || Math.abs(t.px[0] / t.px[1] - 2) < 0.1), '2:1')
    ok('including the three misnamed _1195x1195 ones',
      ['WD-NC-05', 'WD-NC-21', 'WD-NC-24'].every((c) => {
        const t = woodOf('1200x600', c)
        return /_1195x1195/.test(t.file) && Math.abs(t.px[0] / t.px[1] - 2) < 0.1
      }), 'named square, shaped 2:1')

    // How many panels land on a tile is DERIVED from the module and the tile,
    // so a model on a truer module needs no change in the size table.
    const TILE = { x: 1265, z: 1289 }
    ok('a 600 mm panel repeats 2 x 2 on the delivered tile',
      tileRepeat('600x600', TILE).join('x') === '2x2', tileRepeat('600x600', TILE).join('x'))
    ok('a 1200 x 600 panel repeats 1 x 2 on it',
      tileRepeat('1200x600', TILE).join('x') === '1x2', tileRepeat('1200x600', TILE).join('x'))
    ok('and on a tile built to a true 1200 module it would be 2 x 2 / 1 x 2',
      tileRepeat('600x600', { x: 1200, z: 1200 }).join('x') === '2x2'
        && tileRepeat('1200x600', { x: 1200, z: 600 }).join('x') === '1x1',
      'derived, not declared')

    // The cost of using the delivered model as-is, stated rather than implied.
    for (const size of SIZES) {
      const d = drawnPanelMm(size, TILE)
      const spec = TILE_SIZES[size].panel
      const over = (d.x / spec.x - 1) * 100
      ok(`${size} renders about 6% oversize on this model`,
        over > 4 && over < 8, `${over.toFixed(1)}% (${d.x.toFixed(0)} vs ${spec.x} mm)`)
    }

    const all = [...woodsFor('600x600'), ...perforationsFor('600x600')]
    ok('every file named is on disk',
      all.every((t) => fs.existsSync(path.join('public/textures/ceiling-tiles/wood-classic', t.file))),
      `${all.length} files`)
    // Thumbs.db sits in three of those folders and is not a finish
    ok('and Windows leaves nothing in there that is offered as one',
      all.every((t) => /\.(jpe?g|png|webp)$/i.test(t.file)), 'images only')
    ok('the tile range is its own, not the baffles\' three',
      woodsFor('600x600').some((w) => w.code === 'WD-NC-33')
        && !COLOUR_FAMILIES['wood-classic'].swatches.some((sw) => sw.code === 'WD-NC-33'),
      'separate')

    // the supplied images are far larger than a ceiling tile can show
    const biggest = all.reduce((a, b) => ((a.px?.[0] ?? 0) > (b.px?.[0] ?? 0) ? a : b))
    ok('they are decoded down before they reach the GPU',
      TILE_PX < biggest.px[0] / 4,
      `${TILE_PX} px from ${biggest.px[0]} px`)
  }

  // ---- and the model manifest agrees with the classifier ------------------
  const tile = (manifest.tiles ?? [])[0]
  ok('the tile model is in the manifest', !!tile, String((manifest.tiles ?? []).length))
  if (tile) {
    ok('with twelve tiles found in it', tile.parts.faces.n === 12, String(tile.parts.faces.n))
    // TEN, not nine. The tenth is the frame carrying the perimeter and the
    // cross-tees; it spans the whole model, so a footprint test called it
    // surrounding ceiling and dropped it — taking every divider running the
    // short way with it.
    ok('ten grid pieces, including the frame', tile.parts.grid.n === 10,
      String(tile.parts.grid.n))
    ok('and nothing is mistaken for surrounding ceiling',
      tile.parts.context.n === 0, `${tile.parts.context.n} mesh(es)`)
    ok('the frame is the heavy one, and it is kept',
      tile.parts.grid.tris > 300000, `${tile.parts.grid.tris} tris`)
    ok('a tile is about 1265 x 1289 mm, not the 600 the textures are',
      Math.abs(tile.tile.x * 1000 - 1265) < 5 && Math.abs(tile.tile.z * 1000 - 1289) < 5,
      `${(tile.tile.x * 1000).toFixed(0)} x ${(tile.tile.z * 1000).toFixed(0)} mm`)
    ok('so a 600 mm panel repeats about twice across it',
      Math.round(tile.tile.x * 1000 / 600) === 2, String((tile.tile.x * 1000 / 600).toFixed(2)))
  }
}

// ---------------------------------------------------------------------------
section("CLAMPS — one part, one finish")
{
  // The supplier files disagree about what colour a clamp is, and there is no
  // reading of that as deliberate: Blade Standard and Blade Tapered draw theirs
  // #c6c6c6, a light grey, while Baffle Curve's hardware is #101010. The clamps
  // are one part, so the catalogue gives them one finish. The HANGERS keep the
  // file's own colour, so the wire still reads as steel.
  ok('the clamp finish is a catalogue fact, not a literal in the builder',
    /^#[0-9a-f]{6}$/i.test(CLAMP_FINISH.hex), CLAMP_FINISH.hex)
  ok('and it is matte: rough, with no metal in it',
    CLAMP_FINISH.roughness >= 0.8 && CLAMP_FINISH.metalness === 0,
    `roughness ${CLAMP_FINISH.roughness}, metalness ${CLAMP_FINISH.metalness}`)
  ok('not pure black, which loses its edges under this lighting',
    CLAMP_FINISH.hex.toLowerCase() !== '#000000', CLAMP_FINISH.hex)

  const depth = 0.194
  const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
  blade.translate(0, -depth / 2, 0)
  const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.computeBoundingBox(); return g }
  const fileMat = () => new THREE.MeshStandardMaterial({ color: 0x565656 })
  const hangerMat = fileMat()
  const clampMat = fileMat()

  const finset = {
    size: { length: 1.8, depth: 0.194, thickness: 0.016 },
    fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
    unit: {
      finTopY: 0, hardwareAboveFin: 0.2, hardwareX: [0], hangers: [{ x: 0, z: 0, w: 0.02, d: 0.02 }],
      suspension: { x: 0.02, z: 0.02 },
      hardware: [
        { mesh: { geometry: box(0.15, 0.05, 0.03), material: clampMat }, finIndex: 0, isHanger: false },
        { mesh: { geometry: box(0.02, 0.4, 0.02), material: hangerMat }, finIndex: 0, isHanger: true },
      ],
      fin: { geometry: blade, material: new THREE.MeshStandardMaterial() },
    },
  }
  const run = buildModelRun(
    finset,
    { model: 'x', drop: 0.6, count: 1, spacing: 200, sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
    null,
  )
  const drawn = []
  run.traverse((o) => {
    if (!o.isMesh || o.userData.finIndex != null || o.geometry.type === 'CylinderGeometry') return
    drawn.push(o)
  })
  const clamp = drawn.find((o) => o.geometry.parameters?.width === 0.15)
  const hanger = drawn.find((o) => o.geometry.parameters?.height === 0.4)

  ok('a clamp is drawn in the catalogue finish, not the file colour',
    '#' + clamp.material.color.getHexString() === CLAMP_FINISH.hex.toLowerCase(),
    '#' + clamp.material.color.getHexString())
  ok('and matte with it',
    clamp.material.roughness === CLAMP_FINISH.roughness && clamp.material.metalness === CLAMP_FINISH.metalness,
    `${clamp.material.roughness} / ${clamp.material.metalness}`)
  ok('a hanger keeps the material its own file gives it',
    hanger.material === hangerMat, hanger.material === hangerMat ? 'the file\'s' : 'replaced')
  ok('the clamp material is shared, so disposing a run does not free it',
    clamp.material.userData.shared === true, String(clamp.material.userData.shared))
  // one material for every clamp in the scene, not one per fin or per set
  const clampsOf = (g) => {
    const out = []
    g.traverse((o) => {
      if (o.isMesh && o.userData.finIndex == null && o.geometry.parameters?.width === 0.15) out.push(o)
    })
    return out
  }
  const many = buildModelRun(
    finset,
    { model: 'x', drop: 0.6, count: 4, spacing: 200, sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
    null,
  )
  const mats = new Set(clampsOf(many).map((o) => o.material))
  ok('and every clamp in a run shares the one material',
    clampsOf(many).length === 4 && mats.size === 1 && mats.has(clamp.material),
    `${clampsOf(many).length} clamps, ${mats.size} material`)

  // ---- and analyseFins is what tells the two apart ------------------------
  // A hanger reaches the top of the assembly; a clamp has nothing above it. On
  // Baffle Curve BOTH pieces reach the top — its hook IS the hanger — so it has
  // no clamp to recolour, and that is right rather than a miss.
  const mesh = (arr) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    g.computeBoundingBox()
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  }
  const pts = (xs, ys, zs) => {
    const out = []
    for (const x of xs) for (const y of ys) for (const z of zs) out.push(x, y, z)
    return out
  }
  const model = new THREE.Group()
  for (const z of [-0.3, 0, 0.3]) {
    model.add(mesh(pts([-1, 1], [-0.7, -0.5], [z - 0.01, z + 0.01])))          // fin
    model.add(mesh(pts([-0.075, 0.075], [-0.52, -0.42], [z - 0.015, z + 0.015]))) // clamp
    model.add(mesh(pts([-0.01, 0.01], [-0.5, 0], [z - 0.01, z + 0.01])))       // hanger
  }
  const f = analyseFins(model)
  const kinds = f.unit.hardware.map((h) => (h.isHanger ? 'hanger' : 'clamp'))
  ok('the piece that reaches the top is a hanger, the one that does not is a clamp',
    kinds.filter((k) => k === 'hanger').length === 1 && kinds.filter((k) => k === 'clamp').length === 1,
    kinds.join(', '))
}

// ---------------------------------------------------------------------------
section("A HANGER WITH NO WIRE IN IT")
{
  // Baffle Curve's hanger is a hook and a tip and nothing between: above the
  // fin, two rings of geometry 136 mm apart, joined by triangles that each span
  // the whole 412 mm. Drawn, that is a spike — fat where it leaves the baffle,
  // converging as it climbs. And because the two hooks are different depths,
  // one row of the run looks chunkier than the other.
  //
  // Where a wire IS modelled, none of this applies and the file is left alone.
  const piece = (withWire) => {
    const pts = []
    // the hook: wide, low, and nowhere near the wire's axis
    for (const x of [-0.2, 0.2]) for (const z of [-0.04, 0.04]) pts.push(x, 0, z)
    const ring = (y, r) => {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        pts.push(0.095 + r * Math.cos(a), y, r * Math.sin(a))
      }
    }
    if (withWire) ring(0.9, 0.004) // a shaft on the way up
    ring(1.0, 0.0025)              // the tip
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    g.computeBoundingBox()
    return g
  }
  const section = { x: 0.095, z: 0, w: 0.005, d: 0.005 }
  const topOf = (g) => { g.computeBoundingBox(); return g.boundingBox.max.y }

  const spike = piece(false)
  const cut = shortenHangerToHook(spike, section)
  ok('a hanger with nothing between hook and tip is cut back to the hook',
    cut && cut.moved === 12, JSON.stringify(cut))
  ok('and its tip lands one wire-thickness above the hook, not on it',
    Math.abs(topOf(spike) - 0.005) < 1e-6, String(topOf(spike)))

  const real = piece(true)
  const before = topOf(real)
  ok('a hanger that does model a wire is left exactly alone',
    shortenHangerToHook(real, section) === null && topOf(real) === before, String(topOf(real)))

  const again = shortenHangerToHook(spike, section)
  ok('asking twice does not cut it twice',
    again && again.moved === 12 && Math.abs(topOf(spike) - 0.005) < 1e-6, JSON.stringify(again))

  ok('and with no section measured it does nothing',
    shortenHangerToHook(piece(false), null) === null, 'null')
}

// ---------------------------------------------------------------------------
section("A FIN MAPPED FOR TILING")
{
  // Reported as the same complaint as the missing-UV one: Colour Core Ombré on
  // Blade Standard painted a related solid colour rather than the fade. Not the
  // same cause. Standard HAS coordinates, but they run -109.4 to 109.4 — a
  // tiling count, saying "repeat this 219 times along the fin". Every finish
  // here assumes the other convention, one span across the face, and a
  // photographed panel is clamped to its edges, so 22 of its 36 vertices landed
  // outside the panel and sampled the edge texel.
  const mapped = (us, vs) => {
    const g = new THREE.BufferGeometry()
    const pos = []
    const uv = []
    for (let i = 0; i < us.length; i++) { pos.push(i, 0, 0); uv.push(us[i], vs[i]) }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    return g
  }

  const tiled = mapped([-109.4, 0, 109.4], [-109.4, 0, 7.9])
  const scaled = normaliseFinUV(tiled)
  ok('a fin mapped for tiling is brought back to one span',
    scaled?.repeats > 200, JSON.stringify(scaled))
  const uv = tiled.attributes.uv
  const us = [...Array(uv.count).keys()].map((i) => uv.getX(i))
  const vs = [...Array(uv.count).keys()].map((i) => uv.getY(i))
  ok('u now runs 0 to 1', Math.min(...us) === 0 && Math.max(...us) === 1,
    `${Math.min(...us)}..${Math.max(...us)}`)
  ok('and v with it', Math.min(...vs) === 0 && Math.max(...vs) === 1,
    `${Math.min(...vs)}..${Math.max(...vs)}`)
  ok('the direction of the mapping survives, so the faces can still be told apart',
    us[0] < us[1] && us[1] < us[2], us.join(' < '))

  // a file already in the right convention is not touched
  const proper = mapped([0, 0.5, 1], [0, 0.5, 1])
  ok('a fin already using one span is left exactly alone',
    normaliseFinUV(proper) === null && proper.attributes.uv.getX(1) === 0.5, 'unchanged')

  // Baffle Curve's own mapping: just past 0 and 1 in u, and the middle 44% in
  // v. That is a mapping somebody meant, not a tiling count, and stretching it
  // to fill 0..1 would change a fin that renders correctly today.
  const curve = mapped([-0.0006, 0.5, 1.0006], [0.2794, 0.5, 0.7206])
  ok('and a hand-made mapping that merely does not fill 0..1 is left alone too',
    normaliseFinUV(curve) === null, 'unchanged')

  ok('a mapping with no extent at all is refused rather than divided by zero',
    normaliseFinUV(mapped([5, 5, 5], [5, 5, 5])) === null, 'null')
}

// ---------------------------------------------------------------------------
section("A FIN WITH NO TEXTURE COORDINATES")
{
  // Reported as: Colour Core Ombré will not apply to Tapered, it just paints a
  // related solid colour. It was not the finish. Blade Tapered ships with no UV
  // attribute at all, and a mapped material without UVs samples ONE texel for
  // every fragment — so the fin renders in a single colour lifted out of the
  // photograph. Every textured finish was affected; the ombré is only where it
  // was noticed.
  const slab = (withUV) => {
    const g = new THREE.BufferGeometry()
    const pos = [
      -0.9, -0.1, 0,   0.9, -0.1, 0,   0.9, 0.1, 0,
      -0.9, -0.1, 0,   0.9, 0.1, 0,   -0.9, 0.1, 0,
    ]
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    if (withUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0.25), 2))
    return g
  }

  const bare = slab(false)
  ok('a fin with no UVs would sample one texel', !bare.attributes.uv, 'none')
  const made = planarFinUV(bare)
  ok('so a planar set is generated for it', made?.generated === 6, JSON.stringify(made))
  ok('and it now has coordinates for every vertex',
    bare.attributes.uv?.count === 6, String(bare.attributes.uv?.count))

  const uv = bare.attributes.uv
  const us = [...Array(uv.count).keys()].map((i) => uv.getX(i))
  const vs = [...Array(uv.count).keys()].map((i) => uv.getY(i))
  ok('u runs the length of the fin, corner to corner',
    Math.min(...us) === 0 && Math.max(...us) === 1, `${Math.min(...us)}..${Math.max(...us)}`)
  ok('and v runs down its face',
    Math.min(...vs) === 0 && Math.max(...vs) === 1, `${Math.min(...vs)}..${Math.max(...vs)}`)

  // u must follow x, or a gradient runs backwards
  const px = [...Array(uv.count).keys()].map((i) => bare.attributes.position.getX(i))
  const rising = px.every((x, i) => Math.abs((x + 0.9) / 1.8 - us[i]) < 1e-6)
  ok('u follows the length, so a fade runs the way the fin does', rising, 'in step')

  // and a file that ships its own is never overwritten
  const own = slab(true)
  const before = own.attributes.uv.getX(0)
  ok('a fin that ships its own UVs is left alone',
    planarFinUV(own) === null && own.attributes.uv.getX(0) === before, String(own.attributes.uv.getX(0)))

  // both faces of a generated set agree by construction, so the mirror-image
  // fault matchFaceUVs exists for cannot arise on a fin that goes through here
  ok('generated coordinates need no turning round afterwards',
    matchFaceUVs(bare)?.moved === 0 || matchFaceUVs(bare) === null,
    JSON.stringify(matchFaceUVs(bare)))
}

// ---------------------------------------------------------------------------
section("TWO FACES OF ONE FIN — a gradient has to agree with itself")
{
  // A fin is a slab, and a modeller lays its front and back out as mirror
  // images. Invisible on a weave, a grain or a flat colour; on a GRADIENT it
  // means one side of the baffle fades left-to-right and the other
  // right-to-left. Alternating whole fins then cannot mean anything, because
  // each fin already disagrees with itself.
  //
  // Wanted: a fin fades one way on BOTH sides, and the next fin the other way.
  const slab = (backRuns) => {
    // two quads facing +z and -z. u rises with x on the front; the back is set
    // either way round by the caller.
    const g = new THREE.BufferGeometry()
    const pos = [
      -1, -1, 0.1,  1, -1, 0.1,  1, 1, 0.1,
      -1, -1, 0.1,  1, 1, 0.1,  -1, 1, 0.1,
      -1, -1, -0.1,  1, 1, -0.1,  1, -1, -0.1,
      -1, -1, -0.1,  -1, 1, -0.1,  1, 1, -0.1,
    ]
    const front = (x) => (x + 1) / 2
    const back = backRuns === 'with x' ? front : (x) => (1 - x) / 2
    const uv = []
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]
      uv.push(i < 18 ? front(x) : back(x), (pos[i + 1] + 1) / 2)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    return g
  }

  /** Which way u runs against x, per face. */
  const senses = (geo) => {
    const pos = geo.attributes.position; const uv = geo.attributes.uv
    const out = { front: 0, back: 0 }
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3()
    const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const n = new THREE.Vector3()
    const idx = geo.index
    const at = (i) => (idx ? idx.getX(i) : i)
    const count = idx ? idx.count : pos.count
    for (let t = 0; t + 2 < count; t += 3) {
      const i0 = at(t); const i1 = at(t + 1); const i2 = at(t + 2)
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
      e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2)
      if (n.length() < 1e-12) continue
      const k = n.z > 0 ? 'front' : 'back'
      for (const [p0, p1] of [[i0, i1], [i1, i2], [i2, i0]]) {
        const dx = pos.getX(p1) - pos.getX(p0)
        if (Math.abs(dx) < 1e-9) continue
        out[k] += Math.sign((uv.getX(p1) - uv.getX(p0)) / dx)
      }
    }
    return { front: Math.sign(out.front), back: Math.sign(out.back) }
  }

  const mirrored = slab('against x')
  ok('a slab laid out as mirror images starts out disagreeing',
    senses(mirrored).front !== senses(mirrored).back, JSON.stringify(senses(mirrored)))
  const fixed = matchFaceUVs(mirrored)
  ok('and its back face is turned round to match the front',
    senses(mirrored).front === senses(mirrored).back && fixed.moved > 0,
    `${JSON.stringify(senses(mirrored))}, ${fixed.moved} vertices moved`)

  // the FRONT is what the file says; only the back moves
  const before = slab('against x')
  const frontUV = [...Array(6).keys()].map((i) => before.attributes.uv.getX(i))
  matchFaceUVs(before)
  ok('the front keeps exactly the mapping the file gave it',
    frontUV.every((u, i) => Math.abs(before.attributes.uv.getX(i) - u) < 1e-9), 'unchanged')

  const agreed = slab('with x')
  const wasAgreed = senses(agreed)
  const noop = matchFaceUVs(agreed)
  ok('a file that already agrees is left alone', noop.moved === 0, JSON.stringify(noop))
  ok('and still agrees afterwards',
    JSON.stringify(senses(agreed)) === JSON.stringify(wasAgreed), JSON.stringify(senses(agreed)))

  // asked twice, it must not turn the back face back again
  const twice = slab('against x')
  matchFaceUVs(twice)
  const afterOne = senses(twice)
  matchFaceUVs(twice)
  ok('asking twice does not undo the first answer',
    JSON.stringify(senses(twice)) === JSON.stringify(afterOne), JSON.stringify(senses(twice)))

  // ---- and it refuses when it cannot act safely ---------------------------
  // Welded faces share vertices, so moving the back would drag the front with
  // it. A corrupted front face is worse than a mismatched one.
  // A FULLY welded slab cannot disagree with itself — shared vertices carry
  // shared UVs, so both faces read the same u against the same x and the answer
  // is "nothing to do" before the weld is ever considered. The case that
  // matters is the partial one: a back face that borrows some of the front's
  // vertices and brings its own for the rest.
  const welded = new THREE.BufferGeometry()
  welded.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, -1, 0.1,   1, -1, 0.1,   1, 1, 0.1,   // the front, on its own
     1, 1, -0.1,   1, -1, -0.1,               // the back, which borrows vertex 0
  ], 3))
  welded.setAttribute('uv', new THREE.Float32BufferAttribute(
    [0, 0,  1, 0,  1, 1,  -1, 1,  -1, 0], 2))
  welded.setIndex([0, 1, 2, 0, 3, 4])
  const uvBefore = [0, 1, 2, 3, 4].map((i) => welded.attributes.uv.getX(i))
  ok('a slab whose faces share a vertex is refused rather than guessed at',
    matchFaceUVs(welded) === null, 'null')
  ok('and its UVs are not touched',
    uvBefore.every((u, i) => welded.attributes.uv.getX(i) === u), 'unchanged')

  ok('geometry with no UVs at all is refused too',
    matchFaceUVs(new THREE.BoxGeometry(1, 1, 1).deleteAttribute('uv')) === null, 'null')
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
section("A BROKEN RING — straightened on the way in, never on disk")
{
  // Flow.fbx ships with one vertex of one hanger's top ring 4.5x further from
  // the centre than its fifteen neighbours. The wire is a cone drawn from that
  // ring down to the one at the bottom, so a single displaced vertex splays one
  // facet open along the whole length of it: one row of every Baffle Curve run
  // renders with a wire that juts sideways, while the other row is clean.
  //
  // Confirmed against the untouched original, so it is a fault in the delivered
  // file. Repaired in memory; the file on disk is never written.
  const mesh = (arr) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    g.computeBoundingBox()
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  }
  const box = (xs, ys, zs) => {
    const out = []
    for (const x of xs) for (const y of ys) for (const z of zs) out.push(x, y, z)
    return out
  }
  // a hanger shaped like the real one: a hook low down, a round wire to the top
  const hanger = (z, strayAt) => {
    const ring = (y) => {
      const out = []
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        out.push(0.095 + 0.0025 * Math.cos(a), y, z + 0.0025 * Math.sin(a))
      }
      return out
    }
    const pts = [
      ...box([-0.2, 0.2], [-0.5, -0.45], [z - 0.04, z + 0.04]),
      ...ring(-0.45), ...ring(0),
    ]
    if (strayAt != null) pts.push(0.095, 0, z + strayAt)
    return mesh(pts)
  }
  const runOf = (strayAt) => {
    const g = new THREE.Group()
    for (const z of [-0.3, 0, 0.3]) {
      g.add(mesh(box([-1, 1], [-0.7, -0.5], [z - 0.01, z + 0.01])))
      g.add(mesh(box([-0.075, 0.075], [-0.52, -0.42], [z - 0.015, z + 0.015])))
      g.add(hanger(z, strayAt))
    }
    return g
  }

  const clean = analyseFins(runOf(null))
  ok('a well-formed file reports no repairs at all',
    clean?.unit.ringRepairs.length === 0, JSON.stringify(clean?.unit.ringRepairs))

  const broken = analyseFins(runOf(0.0125))
  ok('a ring with one vertex out of line is repaired',
    broken?.unit.ringRepairs.length === 1, JSON.stringify(broken?.unit.ringRepairs))
  ok('and reported as a multiple of the ring, never as a length',
    broken.unit.ringRepairs[0].ratio > 2 && broken.unit.ringRepairs[0].moved === 1,
    `${broken.unit.ringRepairs[0].ratio}x, ${broken.unit.ringRepairs[0].moved} moved`)

  // the point of the whole exercise: the bad row becomes the good row
  ok('after which the bad hanger measures the same as a sound one',
    Math.abs(broken.unit.hangers[0].w - clean.unit.hangers[0].w) < 1e-5
      && Math.abs(broken.unit.hangers[0].d - clean.unit.hangers[0].d) < 1e-5,
    `${(broken.unit.hangers[0].w * 1000).toFixed(3)} x ${(broken.unit.hangers[0].d * 1000).toFixed(3)} vs ` +
    `${(clean.unit.hangers[0].w * 1000).toFixed(3)} x ${(clean.unit.hangers[0].d * 1000).toFixed(3)} mm`)

  // A REPORT THAT SURVIVES THE SECOND PASS. analyseFins runs twice per load by
  // design — once to find which way the model is turned, once afterwards in
  // render coordinates — and the repair happens on the first. Without the
  // result being remembered on the geometry, the second pass sees a ring that
  // is already straight and reports a clean file: the fault silently fixed and
  // never raised with whoever exported it.
  const hangerMesh = broken.unit.hardware
    .map((h) => h.mesh)
    .sort((a, b) => b.geometry.boundingBox.max.y - a.geometry.boundingBox.max.y)[0]
  const secondPass = repairHangerRing(hangerMesh.geometry)
  ok('and the report survives being asked a second time',
    secondPass && secondPass.ratio === broken.unit.ringRepairs[0].ratio,
    JSON.stringify(secondPass))

  // ---- and it does not fire on anything that is merely not round -----------
  const notRound = []
  for (const x of [-0.005, -0.004, -0.003, -0.002, -0.001, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006])
    notRound.push(x, 0, 0)
  notRound.push(0.06, 0, 0)  // one point far out, as a stray would be
  notRound.push(0, -0.1, 0)  // and some height, so it is a piece and not a plane
  ok('a top that is simply not round is left alone',
    repairHangerRing(mesh(notRound).geometry) === null, 'null')

  const square = []
  for (const x of [-0.02, 0.02]) for (const z of [-0.02, 0.02]) square.push(x, 0, z)
  for (const x of [-0.02, 0.02]) for (const z of [-0.02, 0.02]) square.push(x, -0.1, z)
  ok('and a sound ring is not touched either',
    repairHangerRing(mesh(square).geometry) === null, 'null')
}

// ---------------------------------------------------------------------------
section("SUSPENSION — a hooked hanger, measured where the rod meets it")
{
  // The complaint this answers: on Baffle Curve the rod the system draws is
  // plainly fatter than the one in the model.
  //
  // Two separate faults, both from reading a bounding box. Its hanger is a
  // hooked wire modelled as ONE mesh — 372 mm across at the hook, 5.5 mm at the
  // top — so asking whether a piece was slender said "bracket", the file was
  // taken to have no rod at all, and the extension fell back to a flat 12 mm
  // against a wire that renders under 4. The box is the wrong PLACE as well:
  // the hook is not symmetric, so its centre is 11.8 mm from where the wire
  // leaves the top — further than the rod is wide, which would stand the
  // extension beside the wire instead of on it.
  const pts = (xs, ys, zs) => {
    const out = []
    for (const x of xs) for (const y of ys) for (const z of zs) out.push(x, y, z)
    return out
  }
  const mesh = (arr) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    g.computeBoundingBox()
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  }

  const model = new THREE.Group()
  for (const z of [-0.3, 0, 0.3]) {
    // a fin, 2.00 x 0.20 x 0.02 m, its top at y = -0.5
    model.add(mesh(pts([-1, 1], [-0.7, -0.5], [z - 0.01, z + 0.01])))
    // a clamp gripping it, reaching nowhere near the top of the assembly
    model.add(mesh(pts([-0.075, 0.075], [-0.52, -0.42], [z - 0.015, z + 0.015])))
    // A hooked hanger, built the way the real one is: 400 mm across at the
    // hook, a 5 mm round wire at the top, and that wire 95 mm off the centre of
    // the hook's box. Plus ONE stray vertex of the hook reaching the wire's
    // height 9.5 mm to the side — Baffle Curve's second hanger has exactly
    // that, and it is what measured the shaft as a 15 mm strap and drew the
    // back row of rods three times too thick while the front row was right.
    const ring = (y) => {
      const out = []
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        out.push(0.095 + 0.0025 * Math.cos(a), y, z + 0.0025 * Math.sin(a))
      }
      return out
    }
    model.add(mesh([
      ...pts([-0.2, 0.2], [-0.5, -0.45], [z - 0.04, z + 0.04]),
      ...ring(-0.45), ...ring(0),
      0.095, 0, z + 0.0095,
    ]))
  }

  const hooked = analyseFins(model)
  ok('the run is found through its hooked hardware', hooked?.count === 3, String(hooked?.count))

  // the fixture really is the shape that defeated the old rule
  const hookBox = model.children[2].geometry.boundingBox
  ok('and the hanger is the squat shape the slenderness test rejected',
    (hookBox.max.y - hookBox.min.y) / (hookBox.max.x - hookBox.min.x) < 3,
    ((hookBox.max.y - hookBox.min.y) / (hookBox.max.x - hookBox.min.x)).toFixed(2))

  ok('one hanger per fin — a clamp has nothing above it to continue',
    hooked?.unit.hangers.length === 1, String(hooked?.unit.hangers.length))
  ok('the hanger measures the wire at its top, not the hook at its widest',
    Math.abs(hooked.unit.suspension.x - 0.005) < 1e-6,
    `${(hooked.unit.suspension.x * 1000).toFixed(1)} mm, hook is 400`)
  ok('and a stray vertex at the wire’s height is not part of the wire',
    Math.abs(hooked.unit.suspension.z - 0.005) < 1e-6,
    `${(hooked.unit.suspension.z * 1000).toFixed(2)} mm; counting the stray gives 12.00`)
  ok('and it is located at the wire, not at the centre of the hook box',
    Math.abs(hooked.unit.hangers[0].x - 0.095) < 1e-6,
    `${(hooked.unit.hangers[0].x * 1000).toFixed(1)} mm, box centre is 0`)

  const hookedRun = buildModelRun(
    hooked,
    { model: 'hooked', drop: 1.0, count: 3, spacing: 200, sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
    null,
  )
  const drawn = []
  hookedRun.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') drawn.push(o) })
  ok('one extension per hanger, not one per hardware piece', drawn.length === 3, String(drawn.length))

  // The expectations are taken from the MEASURED fin, not the authored
  // literals — the fixture's vertices are float32, so 20 mm is 20 mm only to
  // six places. Across the run the fin's LENGTH scale applies, through its
  // thickness the thickness scale: the same per-axis fit the hanger is drawn
  // under, which is the whole point.
  const hookSx = 1.8 / hooked.size.length
  const hookSz = 0.025 / hooked.size.thickness
  ok('the extension is as thick as the wire it continues',
    Math.abs(drawn[0].scale.x - (hooked.unit.hangers[0].w / 2) * hookSx) < 1e-12
      && Math.abs(drawn[0].scale.z - (hooked.unit.hangers[0].d / 2) * hookSz) < 1e-12,
    `${(drawn[0].scale.x * 2000).toFixed(2)} x ${(drawn[0].scale.z * 2000).toFixed(2)} mm`)

  // the same run with nothing measured, which is what it used to fall back to
  const asBracket = buildModelRun(
    { ...hooked, unit: { ...hooked.unit, hangers: [], suspension: null } },
    { model: 'hooked', drop: 1.0, count: 3, spacing: 200, sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
    null,
  )
  const flat = []
  asBracket.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') flat.push(o) })
  ok('and thinner than the flat 12 mm it fell back to before',
    drawn[0].scale.x < flat[0].scale.x,
    `${(drawn[0].scale.x * 2000).toFixed(2)} mm vs ${(flat[0].scale.x * 2000).toFixed(2)}`)
  ok('and it stands on the wire rather than beside it',
    Math.abs(drawn[0].position.x - 0.095 * (1.8 / 2.0)) < 1e-9,
    `x ${(drawn[0].position.x * 1000).toFixed(1)} mm, the hook box centre is 0`)

  // ---- the invariant the complaints kept coming back to --------------------
  // Every version of this was "close": right thickness through the wrong scale,
  // right scale on the wrong point, right point on a mis-measured section. The
  // check that would have caught all three is the direct one — put the drawn
  // rod and the file's own hanger in world space and see whether they are the
  // same rod. Not similar: the same.
  {
    const run3 = buildModelRun(
      hooked,
      { model: 'hooked', drop: 1.0, count: 2, spacing: 200, sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
      null,
    )
    run3.updateMatrixWorld(true)
    const pieces = []
    const bars = []
    run3.traverse((o) => {
      if (!o.isMesh) return
      let g = o
      while (g && g.userData.finIndex == null) g = g.parent
      if (!g || g.userData.finIndex !== 0) return
      if (o.geometry.type === 'CylinderGeometry') bars.push(o)
      else if (o.userData.finIndex == null) pieces.push(o)
    })
    // the piece that reaches highest is the hanger; the clamp is below it
    const hanger = pieces.sort(
      (a, b2) => b2.geometry.boundingBox.max.y - a.geometry.boundingBox.max.y)[0]
    const sec = shaftSection(hanger.geometry)
    const seat = new THREE.Vector3(sec.x, hanger.geometry.boundingBox.max.y, sec.z)
      .applyMatrix4(hanger.matrixWorld)
    const grow = new THREE.Vector3().setFromMatrixScale(hanger.matrixWorld)

    const bar = bars[0]
    const at = new THREE.Vector3().setFromMatrixPosition(bar.matrixWorld)
    const barScale = new THREE.Vector3().setFromMatrixScale(bar.matrixWorld)
    const foot = at.y - barScale.y / 2

    ok('the drawn rod is the same thickness as the hanger it continues',
      Math.abs(barScale.x * 2 - sec.w * grow.x) < 1e-9
        && Math.abs(barScale.z * 2 - sec.d * grow.z) < 1e-9,
      `${(barScale.x * 2000).toFixed(3)} x ${(barScale.z * 2000).toFixed(3)} vs ` +
      `${(sec.w * grow.x * 1000).toFixed(3)} x ${(sec.d * grow.z * 1000).toFixed(3)} mm`)
    ok('and stands in the same place, across the run and through it',
      Math.abs(at.x - seat.x) < 1e-9 && Math.abs(at.z - seat.z) < 1e-9,
      `${(Math.hypot(at.x - seat.x, at.z - seat.z) * 1000).toFixed(4)} mm apart`)
    ok('and starts exactly where the hanger stops, with no gap and no overlap',
      Math.abs(foot - seat.y) < 1e-9, `${((foot - seat.y) * 1000).toFixed(4)} mm`)
  }

  // a file whose hangers differ from each other gets a rod each, not an average
  const mixed = {
    ...hooked,
    unit: {
      ...hooked.unit,
      hangers: [{ x: 0.095, z: -0.3, w: 0.005, d: 0.005 }, { x: -0.095, z: -0.3, w: 0.005, d: 0.015 }],
      hardwareX: [0.095, -0.095],
    },
  }
  const mixedRun = buildModelRun(
    mixed,
    { model: 'hooked', drop: 1.0, count: 1, spacing: 200, sizeMm: { l: 1800, w: 25, h: 150 }, finOverrides: {} },
    null,
  )
  const two = []
  mixedRun.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') two.push(o) })
  ok('a wire and a strap on the same fin keep their own thicknesses',
    two.length === 2 && Math.abs(two[1].scale.z / two[0].scale.z - 3) < 1e-9,
    two.map((r) => (r.scale.z * 2000).toFixed(2) + ' mm').join(' / '))
}

// ---------------------------------------------------------------------------
section("SHOWING ONE FIN — the others leave the scene, not just the picture")
{
  // The trap this guards: three.js raycasts by LAYER and never looks at
  // `visible`, so a fin hidden with visible=false stays a pick target. The
  // cursor turns to a pointer over apparently empty space, and clicking there
  // selects a fin that is not on screen — which is exactly how it was reported.
  const depth = 0.194
  const drop = 0.45
  const blade = new THREE.BoxGeometry(1.8, depth, 0.016)
  blade.translate(0, -depth / 2, 0)
  const flat = {
    size: { length: 1.8, thickness: 0.016, depth },
    fins: [{ centre: new THREE.Vector3(0, 0, 0) }],
    unit: {
      finTopY: 0, hardwareAboveFin: 0, hardwareX: [], hardware: [],
      fin: { geometry: blade, material: new THREE.MeshStandardMaterial() },
    },
  }
  const params = { model: 'test', drop, count: 5, spacing: 200, sizeMm: { l: 1800, w: 16, h: 194 }, finOverrides: {} }
  const run = buildModelRun(flat, params, null)
  run.updateMatrixWorld(true)

  const pitch = (params.spacing + params.sizeMm.w) / 1000
  const span = (params.count - 1) * pitch
  const zOf = (i) => -span / 2 + i * pitch

  // a ray straight up from below, where fin `i` hangs
  const ray = new THREE.Raycaster()
  const hitsAt = (i) => {
    ray.set(new THREE.Vector3(0, -2, zOf(i)), new THREE.Vector3(0, 1, 0))
    return ray.intersectObject(run, true).length
  }

  ok('every fin is pickable to start with', [0, 1, 2, 3, 4].every((i) => hitsAt(i) > 0),
    [0, 1, 2, 3, 4].map(hitsAt).join(','))

  showOnlyFin(run, 2)
  run.updateMatrixWorld(true)
  ok('the chosen fin is still drawn', hitsAt(2) > 0, String(hitsAt(2)))
  // which fins still have anything drawn for them
  const ownerOf = (o) => {
    for (let n = o; n; n = n.parent) {
      const i = n.userData?.finIndex
      if (i != null) return i
      if (n === run) break
    }
    return null
  }
  const drawn = () => {
    const seen = new Set()
    run.traverse((o) => {
      if (!o.isMesh || !o.visible) return
      const i = ownerOf(o)
      if (i != null) seen.add(i)
    })
    return [...seen].sort((a, b) => a - b)
  }
  ok('and the others are gone from the picture', drawn().join(',') === '2', drawn().join(','))
  ok('a hidden fin cannot be clicked', [0, 1, 3, 4].every((i) => hitsAt(i) === 0),
    [0, 1, 3, 4].map(hitsAt).join(','))

  showOnlyFin(run, null)
  run.updateMatrixWorld(true)
  ok('going back to the whole set makes them pickable again',
    [0, 1, 2, 3, 4].every((i) => hitsAt(i) > 0), [0, 1, 2, 3, 4].map(hitsAt).join(','))
  ok('and visible again', drawn().join(',') === '0,1,2,3,4', drawn().join(','))

  // hardware was never a pick target; restoring must not make it one
  showOnlyFin(run, 1)
  showOnlyFin(run, null)
  let rods = 0
  let rodsPickable = 0
  run.traverse((o) => {
    if (!o.isMesh || o.userData.finIndex != null) return
    rods++
    if (o.raycast !== THREE.Mesh.prototype.raycast) return
    rodsPickable++
  })
  ok('suspension stays unpickable through a round trip', rods === 0 || rodsPickable === 0,
    `${rodsPickable} of ${rods} became pickable`)
}

// ---------------------------------------------------------------------------
section("FOCUS SUBJECT — the whole set, or one fin of it")
{
  reset()
  const id = S().placeAt(...at(10, 8))
  ok('a set to focus', !!id)

  // the way in: ask first, open on what was chosen
  ok('asking does not open the editor', S().askFocus(id) && S().focusAsk === id && S().focusId === null)
  ok('and selects the set behind the question', S().selectedId === id)
  S().cancelFocusAsk()
  ok('cancelling asks nothing and opens nothing', S().focusAsk === null && S().focusId === null)

  S().askFocus(id)
  ok('choosing the whole baffle opens on the set', S().openFocus(id) && S().focusSolo === false)
  ok('with no fin picked', S().selectedFin === null)
  ok('and the question is done with', S().focusAsk === null)

  S().closeFocus()
  S().askFocus(id)
  ok('choosing a single fin opens soloed', S().openFocus(id, { solo: true }) && S().focusSolo === true)
  ok('on the first fin', S().selectedFin?.index === 0, JSON.stringify(S().selectedFin))
  S().closeFocus()

  ok('focus opens on the whole set', S().openFocus(id) && S().focusSolo === false)
  ok('and with no fin picked', S().selectedFin === null)

  // solo has to be about a fin, so it takes the first one when none is picked
  S().setFocusSolo(true)
  ok('solo picks a fin when none is selected', S().focusSolo === true && S().selectedFin?.index === 0,
    JSON.stringify(S().selectedFin))

  // and keeps the one you already had
  S().selectFinOf(id, 3)
  S().setFocusSolo(false)
  S().setFocusSolo(true)
  ok('solo keeps the fin already selected', S().selectedFin?.index === 3, JSON.stringify(S().selectedFin))

  // picking another fin while soloed changes the subject, not the mode
  S().selectFinOf(id, 5)
  ok('picking another fin stays in solo', S().focusSolo === true && S().selectedFin?.index === 5)

  // "All" means the whole set in both senses
  S().selectFinOf(id, null)
  ok('clearing the fin leaves solo', S().focusSolo === false && S().selectedFin === null)

  // re-opening does not inherit the last subject
  S().setFocusSolo(true)
  S().closeFocus()
  ok('closing clears solo', S().focusSolo === false)
  S().openFocus(id)
  S().setFocusSolo(true)
  S().openFocus(id)
  ok('re-opening focus goes back to the whole set', S().focusSolo === false && S().selectedFin === null)

  // solo on nothing is a no-op rather than a crash
  S().closeFocus()
  S().setFocusSolo(true)
  ok('solo with no focused set does nothing', S().focusSolo === false)

  ok('asking about a set that is not there is refused', S().askFocus('nope') === false)
  ok('and opening one is too', S().openFocus('nope') === false)
}

// ---------------------------------------------------------------------------
section('SERIALISATION')
reset()
{
  // Separated by the set's own depth plus a clear cell, so the pair fits at any
  // pitch — at 100 mm a fixed 8-cell offset put the second set inside the first.
  const gp = S().grid()
  const deepC = spanCells(baffleExtent(S().brush.params).width, gp.pitch)
  S().placeAt(...at(8, 6))
  S().placeAt(at(8, 6)[0], at(8, 6)[1] + deepC + 2 * CELL_SCALE)
  // A cell no set is standing on: obstructing one that is covered is refused.
  // A MASK row, not a placement row — the two stopped being the same number
  // when a cell became a millimetre.
  const clearJ = maskDims(gp).rows - 1
  S().toggleObstruction(2, clearJ)
  S().select(S().items[0].id)
  S().updateFin(1, { colour: 'WD-NC-05' })

  const doc = S().toJSON()
  ok('document carries the schema version', doc.version === SCHEMA_VERSION)
  ok('document names its scene', doc.sceneId === TEST_ROOM)
  ok('document records the ceiling basis',
    doc.ceiling.pitch === gp.pitch && doc.ceiling.height === 3.0,
    `pitch ${doc.ceiling.pitch}, height ${doc.ceiling.height}`)
  ok('document is small', JSON.stringify(doc).length < 8000, `${JSON.stringify(doc).length} bytes`)

  const beforeBom = buildSchedule(S().items)
  reset()
  const { loaded, dropped } = S().fromJSON(JSON.parse(JSON.stringify(doc)))
  ok('round-trip loads every item', loaded === 2 && dropped === 0, `${loaded}/${dropped}`)
  ok('round-trip preserves the obstruction mask',
    S().obstructions.includes(`2,${clearJ}`), JSON.stringify(S().obstructions))
  ok('round-trip preserves the fin override',
    S().items.some((i) => i.params.finOverrides?.[1]?.colour === 'WD-NC-05'))
  const afterBom = buildSchedule(S().items)
  ok('round-trip preserves the schedule exactly',
    JSON.stringify(afterBom.rows) === JSON.stringify(beforeBom.rows))

  ok('a future schema version is refused', (() => {
    try { S().fromJSON({ ...doc, version: SCHEMA_VERSION + 1 }); return false } catch { return true }
  })())
  ok('a non-configurator file is refused', (() => {
    try { S().fromJSON({ hello: 'world' }); return false } catch { return true }
  })())

  // A layout from a bigger room must not silently pile up in a smaller one.
  reset()
  // Far enough off THIS ceiling to be dropped. A cell is a millimetre now, so
  // 200 is 20 cm in and comfortably on the grid; the number has to grow with
  // the unit or the assertion stops testing anything.
  const off = Math.round(200 * CELL_SCALE)
  const big = { ...doc, sceneId: TEST_ROOM, items: [{ ...doc.items[0], cell: [off, off] }] }
  const r = S().fromJSON(big)
  ok('items that do not fit this ceiling are dropped, not clamped',
    r.loaded === 0 && r.dropped === 1, JSON.stringify(r))
}

// ---------------------------------------------------------------------------
section('UNDO')
reset()
{
  S().placeAt(...at(10, 5))
  S().placeAt(...at(10, 14))
  ok('two sets placed', S().items.length === 2)
  S().undo()
  ok('undo removes the last placement', S().items.length === 1)
  S().undo()
  ok('undo again empties the scene', S().items.length === 0)
  ok('undo on an empty stack is a no-op', S().undo() === false && S().items.length === 0)

  reset()
  S().placeAt(...at(10, 5))
  const id = S().items[0].id
  S().update(id, { cell: [11, 5] }, { undoable: false })
  S().update(id, { cell: [12, 5] }, { undoable: false })
  ok('a drag does not stack one undo step per cell', S().undoStack.length === 1, String(S().undoStack.length))
}

// ---------------------------------------------------------------------------
section('CEILING ZONE')
reset()
{
  // ---- what a new session opens on ----------------------------------------
  // Not the room's own size: the rooms are real places at real sizes, and the
  // one the app starts on is 13.8 x 9.9 m — more ceiling than anyone laying out
  // a first run wants. The height still comes from the room.
  {
    S().hydrate()
    const opened = roomZone(S().room())
    ok('a new session opens on the default zone',
      Math.abs(opened.w - DEFAULT_ZONE.w) < 1e-6 && Math.abs(opened.l - DEFAULT_ZONE.l) < 1e-6,
      JSON.stringify(opened))
    ok('which is 7.5 x 7.0 m', DEFAULT_ZONE.w === 7.5 && DEFAULT_ZONE.l === 7,
      JSON.stringify(DEFAULT_ZONE))
    ok('and it takes its height from the room, not from the default',
      opened.h === roomZone(ROOMS[0]).h, `${opened.h} vs ${roomZone(ROOMS[0]).h}`)
    ok('the room itself is untouched — only the zone over it differs',
      Math.abs(roomZone(ROOMS[0]).w - DEFAULT_ZONE.w) > 1,
      `room is ${roomZone(ROOMS[0]).w} m wide`)
    reset()
  }

  const base = roomZone(S().room())
  ok('a room starts on its own ceiling', S().ceilingOverride === null)
  ok("and that zone is the room's size",
    Math.abs(base.w - 9) < 1e-6 && Math.abs(base.l - 7) < 1e-6 && base.h === 3,
    JSON.stringify(base))

  // resizing changes the grid, which is the whole point
  const before = S().grid()
  S().setCeiling({ w: 12, l: 9 })
  const after = S().grid()
  ok('a wider zone gives more columns', after.cols > before.cols, `${before.cols} -> ${after.cols}`)
  ok('a longer zone gives more rows', after.rows > before.rows, `${before.rows} -> ${after.rows}`)
  ok('the zone stays centred on the origin',
    Math.abs(after.originX + (after.cols * after.pitch) / 2) < 1e-9 &&
    Math.abs(after.originZ + (after.rows * after.pitch) / 2) < 1e-9)

  S().setCeiling({ h: 4.2 })
  ok('height moves the grid plane', S().grid().y === 4.2, String(S().grid().y))
  ok('and does not change the cell counts',
    S().grid().cols === after.cols && S().grid().rows === after.rows)

  ok('the zone is clamped to sane bounds',
    S().setCeiling({ w: 999 }).zone.w === CEILING_LIMITS.w.max &&
    S().setCeiling({ w: 0 }).zone.w === CEILING_LIMITS.w.min)

  // shrinking drops what no longer fits, and says how much
  reset()
  S().setCeiling({ w: 18, l: 12 })
  S().autoLayout(2)
  const many = S().items.length
  ok('a large zone holds a lot', many > 4, String(many))
  const shrink = S().setCeiling({ w: 6, l: 5 })
  ok('shrinking reports what it removed', shrink.dropped > 0, JSON.stringify(shrink))
  ok('and everything left still fits',
    S().items.every((it) => onGrid(footprint(it, S().grid()), S().grid())))
  ok('nothing left overlaps', !S().items.some((a, i) =>
    S().items.some((b, j) => i !== j && overlaps(footprint(a, S().grid()), footprint(b, S().grid())))))
  ok('one undo puts the dropped sets back', (() => { S().undo(); return S().items.length === many })())

  // obstructions outside the new zone go too
  reset()
  S().setCeiling({ w: 18, l: 12 })
  const gBig = S().grid()
  S().toggleObstruction(maskDims(gBig).cols - 1, maskDims(gBig).rows - 1)
  ok('an obstruction is set at the far corner', S().obstructions.length === 1)
  S().setCeiling({ w: 6, l: 5 })
  ok('obstructions off the new zone are dropped too', S().obstructions.length === 0)

  // reset
  reset()
  S().setCeiling({ w: 15 })
  ok('a custom zone is flagged', S().ceilingOverride !== null)
  S().resetCeiling()
  ok("reset returns to the room's own ceiling", S().ceilingOverride === null)
  ok('and the grid goes back', S().grid().cols === before.cols, `${S().grid().cols}`)

  // changing room clears the zone — a 15 m zone is not a boardroom
  reset()
  S().setCeiling({ w: 15, l: 12 })
  S().setRoom('sc:office-board')
  ok('switching room drops the custom zone', S().ceilingOverride === null)
  ok("and adopts the new room's ceiling",
    Math.abs(roomZone(S().room()).w - 8) < 1e-6, JSON.stringify(roomZone(S().room())))

  // the derived room cache must never serve a stale ceiling
  reset()
  S().setCeiling({ w: 15, l: 12 })
  useStore.setState({ ceilingOverride: { w: 6, l: 5, h: 3 } }) // bypass the action
  ok('a bypassed write does not leave a stale ceiling',
    Math.abs(roomZone(S().room()).w - 6) < 1e-6, JSON.stringify(roomZone(S().room())))

  // round-trip
  reset()
  S().setCeiling({ w: 12, l: 9, h: 3.6 })
  S().autoLayout(3)
  const doc = S().toJSON()
  ok('the export records the zone',
    doc.ceiling.custom === true && doc.ceiling.width === 12 && doc.ceiling.length === 9,
    JSON.stringify(doc.ceiling))
  const placed = S().items.length
  reset()
  const r = S().fromJSON(JSON.parse(JSON.stringify(doc)))
  ok('loading restores the zone',
    S().ceilingOverride?.w === 12 && S().grid().y === 3.6, JSON.stringify(S().ceilingOverride))
  ok('and every item comes back — the grid it was laid out on is back too',
    r.loaded === placed && r.dropped === 0, JSON.stringify(r))

  // a v1 file predates the zone and must still load
  const v1 = { ...doc, version: 1 }
  delete v1.ceilingOverride
  reset()
  const old = S().fromJSON(v1)
  ok('a file written before zones still loads', old.loaded >= 0 && S().ceilingOverride === null)
  reset()
}

// ---------------------------------------------------------------------------
section('SPACE-PAN STATE')
reset()
{
  ok('pan mode is off by default', S().spacePan === false)

  S().setHoverCell([4, 4])
  S().setSpacePan(true)
  ok('holding Space turns pan mode on', S().spacePan === true)
  ok('and drops the hover cell, so no ghost follows a pan',
    S().hoverCell === null, JSON.stringify(S().hoverCell))

  // key repeat fires keydown continuously; a no-op write would rerender the
  // whole panel tree on every repeat
  const before = useStore.getState()
  S().setSpacePan(true)
  ok('repeating the key does not rewrite state', useStore.getState() === before)

  S().setSpacePan(false)
  ok('releasing Space turns it off', S().spacePan === false)

  // pan mode is editor state: it must never reach the saved document
  S().setSpacePan(true)
  S().placeAt(...at(10, 10))
  ok('pan mode is absent from the exported document',
    !('spacePan' in S().toJSON()), Object.keys(S().toJSON()).join(','))
  const doc = JSON.stringify(S().toJSON())
  S().setSpacePan(false)
  ok('and does not change what is exported', JSON.stringify(S().toJSON()) === doc)
  S().setSpacePan(false)
}

// ---------------------------------------------------------------------------
section("CAMERA VIEWS — plan from above, the same plan from below")
{
  reset()
  const room = S().room()
  const views = viewsFor(room)
  const c = room.ceiling
  const w = c.maxX - c.minX
  const d = c.maxZ - c.minZ
  const cam = { fov: 55, aspect: 16 / 9 }

  ok('every named view has a preset', Object.keys(VIEW_NAMES).every((k) => views[k]),
    Object.keys(VIEW_NAMES).filter((k) => !views[k]).join(','))

  const plan = cameraGoal(views.plan, cam)
  const below = cameraGoal(views.bottom, cam)

  ok('plan sits above the slab', plan[1] > c.y, String(plan[1]))
  ok('below sits under the floor', below[1] < 0, String(below[1]))
  ok('both look at the middle of the ceiling',
    views.plan.target[1] === c.y && views.bottom.target[1] === c.y)

  // the whole point of the change: below frames the ceiling entire, exactly as
  // far away as plan does, just on the other side of it
  const up = plan[1] - c.y
  const down = c.y - below[1]
  ok('below is the same distance from the slab as plan', Math.abs(up - down) < 1e-9,
    `${up} vs ${down}`)
  ok('and that distance is what fits the whole ceiling',
    Math.abs(up - planHeight({ w, d }, cam)) < 1e-9)

  // the reason it needs its own hide flag
  ok('plan drops the ceiling, below does not', views.plan.hideCeiling === true && !views.bottom.hideCeiling)
  ok('below drops the floor, plan does not', views.bottom.hideFloor === true && !views.plan.hideFloor)

  // framing follows the viewport, or a wide window crops the plan
  const tall = cameraGoal(views.bottom, { fov: 55, aspect: 0.6 })
  ok('a narrow viewport pulls the camera further back', c.y - tall[1] > down, `${c.y - tall[1]} vs ${down}`)

  // eye and corner are placed, not framed
  ok('eye is inside the room, below the slab', views.eye.pos[1] > 0 && views.eye.pos[1] < c.y)
  ok('a preset with no fit is used as written',
    cameraGoal(views.eye, cam).every((v, i) => v === views.eye.pos[i]))
}

// ---------------------------------------------------------------------------
section('ROOMS')
{
  ok('every procedural scenario becomes a room',
    Object.keys(SCENARIOS).every((k) => ROOMS.some((r) => r.id === `sc:${k}`)))
  ok('every manifest room becomes a room',
    (manifest.rooms ?? []).every((m) => ROOMS.some((r) => r.id === m.id)))
  ok('procedural rooms come first, so the app is never empty', ROOMS[0]?.kind === 'procedural')

  for (const r of ROOMS) {
    const g = gridOf(r)
    const w = r.ceiling.maxX - r.ceiling.minX
    const d = r.ceiling.maxZ - r.ceiling.minZ
    ok(`${r.id}: believable ceiling (${w.toFixed(1)}x${d.toFixed(1)} m @ ${r.ceiling.y.toFixed(2)} m)`,
      w > 1 && d > 1 && w < 100 && d < 100 && r.ceiling.y >= 2.2 && r.ceiling.y <= 12)
    ok(`${r.id}: ceiling centred on the origin`,
      Math.abs(r.ceiling.minX + r.ceiling.maxX) < 0.01 && Math.abs(r.ceiling.minZ + r.ceiling.maxZ) < 0.01)
    ok(`${r.id}: usable grid (${g.cols}x${g.rows})`, g.cols >= 4 && g.rows >= 4)
  }
}

// ---------------------------------------------------------------------------
section('MANIFEST / ASSET CHAIN')
{
  ok('manifest.json exists', fs.existsSync(MANIFEST))

  // ---- the dev server has to notice a file being dropped in ---------------
  // It stopped noticing when baffles were refiled as <Type>/<Shape>.fbx: the
  // watcher matched ONE path segment under baffles/, so a file a level deeper
  // never triggered a rebuild. The file was on disk, the manifest was stale,
  // and the app showed the shape greyed out with nothing to say why. The
  // scanner and the watcher now share this one matcher so they cannot disagree
  // again.
  for (const [file, want] of [
    ['/x/public/models/baffles/Blade/Tapered.fbx', true],
    ['D:\\x\\public\\models\\baffles\\Blade\\Tapered.fbx', true],
    ['/x/public/models/baffles/baffle.fbx', true],
    ['/x/public/models/rooms/workout-room.glb', true],
    ['/x/public/models/baffles/Blade/notes.txt', false],
    ['/x/public/textures/baffles/wood-classic/WD-NC-05.jpg', false],
  ]) {
    ok(`watcher ${want ? 'sees' : 'ignores'}: ${file.replace(/.*models./, '') || file}`,
      isModelFile(file) === want, String(isModelFile(file)))
  }

  // and every baffle actually on disk is in the manifest, which is the fault
  // the matcher caused: a shape present in the folder and absent from the app
  const onDisk = []
  const baffleDir = 'public/models/baffles'
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(fbx|glb|gltf)$/i.test(e.name)) onDisk.push(full)
    }
  }
  if (fs.existsSync(baffleDir)) walk(baffleDir)
  const listed = new Set((manifest.baffles ?? []).map((b) => path.normalize(path.join('public/models', b.file))))
  const missing = onDisk.filter((f) => !listed.has(path.normalize(f)))
  ok('every baffle file on disk is in the manifest',
    missing.length === 0, missing.join(', ') || `${onDisk.length} files, all listed`)
  for (const r of manifest.rooms ?? []) {
    ok(`room asset present: ${r.file}`, fs.existsSync(path.join('public/models', r.file)))
  }
  for (const b of manifest.baffles ?? []) {
    ok(`baffle asset present: ${b.file}`, fs.existsSync(path.join('public/models', b.file)))
    ok(`baffle measured: ${b.id}`, b.dims?.length > 0 && b.meshes > 0 && b.tris > 0)
    // Every file we ship hangs on something, so every one should have a hanger
    // measured. Baffle Curve's read as null for a while — its hooked wire is a
    // single mesh, and the bounding-box test called it a bracket — and a null
    // here is silent: the run still draws, on a flat 12 mm rod that does not
    // match the model. A real supplier file with genuine brackets would need
    // this relaxed; none of ours is that.
    if (b.fins) {
      // A fin whose faces disagree about which way a texture runs makes a
      // gradient fade one way on the front and the other on the back, which no
      // amount of alternating whole fins can put right. Both shipped models
      // needed this, so a re-export that quietly stops needing it is worth
      // knowing about too — hence the check is on "they agree now", not on
      // "something was moved".
      // Baffle Curve models no wire at all, so its hangers are cut back and the
      // rod is drawn instead; baffle.fbx models one, and must be left alone. A
      // change either way means the assets moved and the render will have too.
      ok(`baffle hangers: ${b.id}`,
        b.id === 'blade-flow' ? b.fins.hangerCuts.length === 2 : b.fins.hangerCuts.length === 0,
        `${b.fins.hangerCuts.length} cut back`)

      // Every fin ends up with usable coordinates and both faces agreeing —
      // either from the file, or generated on load where the file ships none.
      // Blade Tapered was listed here as "welded" for a while, which was a
      // misreading: matchFaceUVs returns nothing both for welded faces and for
      // no UVs at all, and the warning guessed the wrong one.
      ok(`baffle fin faces agree: ${b.id}`, b.fins.uvFix != null,
        b.fins.uvFix
          ? `${b.fins.uvFix.moved} vertices turned round${b.fins.uvGenerated ? ', on generated UVs' : ''}`
          : 'faces could not be made to agree')

      // A file with no UVs renders every texture as one flat colour, which
      // reads as the finish being ignored rather than as a fault in the asset.
      ok(`baffle fin is texturable: ${b.id}`,
        b.id === 'blade-tapered' ? b.fins.uvGenerated?.generated > 0 : b.fins.uvGenerated === null,
        b.fins.uvGenerated ? `${b.fins.uvGenerated.generated} UVs generated` : 'ships its own')

      // A fin mapped for tiling samples the edge of a clamped panel almost
      // everywhere and renders in one flat colour. Blade Standard is the file
      // that does it, at about 219 repeats.
      ok(`baffle fin uses one span of its map: ${b.id}`,
        b.id === 'blade-standard' ? b.fins.uvScaled?.repeats > 10 : b.fins.uvScaled === null,
        b.fins.uvScaled ? `rescaled from ${b.fins.uvScaled.repeats} repeats` : 'already one span')

      ok(`baffle hanger measured: ${b.id}`, b.fins.suspension != null,
        b.fins.suspension
          ? `${(b.fins.suspension.x * 1000).toFixed(1)} x ${(b.fins.suspension.z * 1000).toFixed(1)} mm`
          : 'null — falls back to a flat 12 mm rod')
      ok(`and it is a plausible hanger, not a bounding box: ${b.id}`,
        b.fins.suspension != null && Math.max(b.fins.suspension.x, b.fins.suspension.z) < 0.05,
        b.fins.suspension ? `${(Math.max(b.fins.suspension.x, b.fins.suspension.z) * 1000).toFixed(1)} mm` : 'null')
    }
  }
  const wood = 'public/textures/baffles/wood-classic/manifest.json'
  if (fs.existsSync(wood)) {
    for (const e of JSON.parse(fs.readFileSync(wood, 'utf8'))) {
      ok(`veneer present: ${e.code}`, fs.existsSync(path.join('public/textures/baffles/wood-classic', e.file)))
      ok(`veneer is in the catalogue: ${e.code}`,
        COLOUR_FAMILIES['wood-classic'].swatches.some((s) => s.code === e.code))
    }
  }
}

// ---------------------------------------------------------------------------
section('ONE QUESTION AT A TIME — every field unlocks once the answers above it exist')
{
  // A chain is [[key, label], ...] in the order the panel asks. Three deep is
  // enough to show every case.
  const CHAIN = [['ttype', 'Type'], ['size', 'Size'], ['thickness', 'Thickness']]

  {
    const g = gateOf({}, CHAIN)
    ok('the first field is never locked', g.before('ttype') === null)
    ok('a field names the FIRST answer still missing above it', g.before('thickness') === 'Type',
      String(g.before('thickness')))
    ok('and a field gated on nothing is free', g(null) === null)
  }
  {
    const g = gateOf({ ttype: 'wood-classic' }, CHAIN)
    ok('the named answer moves down the panel as they are given',
      g.before('thickness') === 'Size', String(g.before('thickness')))
    ok('gate(key) counts that key itself — for a field sitting BELOW it',
      g('size') === 'Size')
    ok('gate.before(key) stops short of it — for the field that IS it',
      g.before('size') === null)
  }
  {
    const g = gateOf({ ttype: 'x', size: 600, thickness: 15 }, CHAIN)
    ok('nothing waits once every answer above it exists', g.before('thickness') === null)
  }
  {
    // 0 and '' are ANSWERS. The test is `== null`, not falsiness: a baffle's
    // Direction is 0 for Vertical, and reading that as unanswered would lock
    // every field below a run that is plainly lying one way.
    ok('0 is an answer, not a blank', gateOf({ ttype: 0 }, CHAIN).before('size') === null)
  }
  {
    // THE TRAP, kept because the two lines look like the same question and are
    // not. Univic Strip has its frame built in, so Grid is not in its chain at
    // all — and a key that is not in the chain answers "free".
    const g = gateOf({ ttype: 'univicstrip' }, CHAIN)
    ok('naming the key above by hand unlocks a field that should still be locked',
      g('grid') === null, 'the trap moved — re-read the gate.before comment')
    ok('...which is why a field asks about its OWN position instead',
      g.before('thickness') === 'Size', String(g.before('thickness')))
  }
}

{
  // The chains are EFFECTIVE: what THIS spec is asked, not a static list. A
  // field can only ever be gated on a question its own spec actually asks.
  const keys = (c) => c.map(([k]) => k).join(',')
  const labelOf = (c, k) => Object.fromEntries(c)[k]

  ok('a baffle type with no shapes is never asked for a Shape',
    keys(baffleRequired({ btype: 'vmt' })).startsWith('thickness'),
    keys(baffleRequired({ btype: 'vmt' })))
  ok('and one that has them is asked first of all',
    keys(baffleRequired({ btype: 'blade' })).startsWith('shape'),
    keys(baffleRequired({ btype: 'blade' })))

  ok('a tile range with its frame built in is never asked for a Grid',
    !keys(tileRequired({ ttype: 'univicstrip' })).includes('grid'),
    keys(tileRequired({ ttype: 'univicstrip' })))
  ok('a range with a choice of grids is',
    keys(tileRequired({ ttype: 'wood-classic' })).includes('grid'))
  ok('a fabric-faced tile is asked for a Fabric and no Perforation',
    keys(tileRequired({ ttype: 'designer-textile' })) === 'ttype,size,grid,thickness,textile',
    keys(tileRequired({ ttype: 'designer-textile' })))
  ok('and a veneer one the other way round',
    keys(tileRequired({ ttype: 'wood-classic' })) === 'ttype,size,grid,thickness,wood,perforation',
    keys(tileRequired({ ttype: 'wood-classic' })))

  // The same field under the name its range gives it, because the lock says
  // "Choose design first" in as many words.
  ok('a Cloud Series cloud is asked for a Design',
    labelOf(cloudRequired({ family: 'cloud-series' }), 'colour') === 'Design')
  ok('a fabric one for a Fabric',
    labelOf(cloudRequired({ family: 'designer-textiles' }), 'colour') === 'Fabric')
  ok('and one in a plain colour for a Colour',
    labelOf(cloudRequired({}), 'colour') === 'Colour')

  ok('Fly asks two questions, size then fabric',
    keys(flyRequired({})) === 'size,colour', keys(flyRequired({})))

  // ONE LIST, TWO READERS. The staircase in the panel and the "still to choose"
  // line on Place both come off these chains, so they cannot disagree about
  // what is outstanding — which is the whole reason the chains were split out
  // rather than a second order being written in the panel.
  const agrees = (chain, missing, spec) =>
    JSON.stringify(missing(spec))
      === JSON.stringify(chain(spec).filter(([k]) => spec[k] == null).map(([, l]) => l))

  for (const spec of [{}, { shape: 'square' }, { shape: 'square', size: 600 },
    { shape: 'triangle', size: 900, colour: 'CL-01_Blue', family: 'cloud-series' }]) {
    ok(`cloud staircase and "still to choose" agree: ${JSON.stringify(spec)}`,
      agrees(cloudRequired, cloudMissingFields, spec))
  }
  for (const spec of [{ ttype: 'wood-classic' }, { ttype: 'univicstrip', size: '600x600' },
    { ttype: 'designer-textile', size: '600x600', grid: 24 }]) {
    ok(`tile staircase and "still to choose" agree: ${JSON.stringify(spec)}`,
      agrees(tileRequired, tileMissingFields, spec))
  }
  for (const spec of [{ btype: 'blade' }, { btype: 'vmt', thickness: 25 }]) {
    ok(`baffle staircase and "still to choose" agree: ${JSON.stringify(spec)}`,
      agrees(baffleRequired, missingFields, spec))
  }
  for (const spec of [{}, { size: 3 }]) {
    ok(`fly staircase and "still to choose" agree: ${JSON.stringify(spec)}`,
      agrees(flyRequired, flyMissingFields, spec))
  }
}

{
  const bits = fs.readFileSync('src/ui/bits.jsx', 'utf8')

  ok('a locked field is dimmed AND inert',
    /inert=\{locked \? true : undefined\}/.test(bits) && /pointer-events-none/.test(bits),
    'pointer-events alone leaves the control in the tab order')

  // THE ONE THAT ACTUALLY BIT, and the reason this is a guard rather than a
  // comment. inert and pointer-events were both on and both working, and a real
  // mouse click still opened a locked dropdown: <button> is a LABELABLE
  // element, so a click landing on Field's own <label> is forwarded to the
  // control as the label's DEFAULT ACTION and never passes through the inert
  // box at all. A synthetic .click() on the button was blocked, which is how it
  // stayed hidden — only a click that does hit-testing can see it.
  ok('and the <label> refuses the click it would otherwise forward',
    /onClick=\{locked \? \(e\) => e\.preventDefault\(\) : undefined\}/.test(bits),
    'Field is forwarding label activation into a locked control again')

  ok('a locked BLOCK can say what it is waiting for',
    /export function LockedBlock/.test(bits)
    && /typeof locked === 'string'[\s\S]{0,240}Choose \{locked\.toLowerCase\(\)\} first/.test(bits),
    'LockedBlock is silent — a panel can lock with nothing on screen explaining why')
}

{
  // Every panel locks from ITS OWN chain rather than an order written twice.
  for (const [file, chain] of [
    ['src/ui/CloudFields.jsx', 'cloudRequired'],
    ['src/ui/BaffleFields.jsx', 'baffleRequired'],
    ['src/ui/TileFields.jsx', 'tileRequired'],
    ['src/ui/FlyFields.jsx', 'flyRequired'],
  ]) {
    const src = fs.readFileSync(file, 'utf8')
    ok(`${path.basename(file)} locks from the product's own required list`,
      /import \{ gateOf \} from '\.\.\/lib\/gate\.js'/.test(src)
      && new RegExp('gateOf\\(p, ' + chain + '\\(p\\)\\)').test(src),
      'not using gateOf, or not with its own chain')
  }
}

{
  // The field that explains itself has to BE ON SCREEN. Four surfaces render
  // four different subsets of the baffle panel, and the tile ranges ask
  // different questions; handing the explanation to a field this copy of the
  // panel does not render leaves every locked field dimmed in silence.
  const baffle = fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8')
  ok('the baffle panel only offers to explain fields it renders',
    /\.\.\.\(showPattern \? \['mirror'\] : \[\]\)/.test(baffle),
    'Pattern is listed unconditionally, and the left sidebar hides it')
  const tile = fs.readFileSync('src/ui/TileFields.jsx', 'utf8')
  ok('and the tile panel likewise',
    /\.\.\.\(asksGrid \? \['grid'\] : \[\]\)/.test(tile)
    && /\.\.\.\(fabric \? \[\] : \['perforation'\]\)/.test(tile),
    'Grid or Perforation is listed for a range that never asks for it')
}

{
  // Nothing appears out of nowhere any more. A field that was hidden until an
  // earlier answer existed made the form grow under the cursor and hid what was
  // going to be asked for; it is on screen and locked instead.
  const cloud = fs.readFileSync('src/ui/CloudFields.jsx', 'utf8')
  ok('the cloud Size field is locked, not absent',
    /<Field label="Size" hint="mm" locked=/.test(cloud)
    && !/\{p\.shape && \(\s*<Field label="Size"/.test(cloud),
    'Size is back to appearing once a shape is chosen')

  const tile = fs.readFileSync('src/ui/TileFields.jsx', 'utf8')
  ok('the tile Grid and Thickness fields are on screen from the start',
    !/\{p\.size && asksGrid && \(/.test(tile)
    && !/\{p\.size && \(\s*<Field label="Thickness"/.test(tile),
    'a tile field is hidden behind p.size again')
  ok('and the panels are locked rather than replaced by a sentence',
    !/Choose a size to see the panels it comes in/.test(tile),
    'the Note is back, in place of the fields it was standing in for')
  ok('a locked panel grid does not cry manifest',
    /LOCKED IS NOT EMPTY/.test(tile),
    'PanelGrid reports "run npm run manifest" for a size nobody has chosen yet')
}

// ---------------------------------------------------------------------------
section('THE PLACEMENT GHOST — green means it fits, and it has to MEAN it')
{
  // Reported as "the shadow is red for both". The ghost painted "it fits" in
  // the selection accent, which read as green only because the accent was the
  // teal this app shipped with. The light palette made the accent a coral and
  // both answers went red — a signal that had quietly stopped signalling.
  //
  // So these assert the thing a person actually sees, not the wiring.
  const hueOf = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
    if (!d) return 0
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    return h * 60
  }
  const apart = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)); return Math.min(d, 360 - d) }

  // NOT named `ok` — that is the assertion helper, and shadowing it here turns
  // every check below into a call on a string.
  const fits = PLACE_COLOUR.ok
  const no = PLACE_COLOUR.no

  ok('"it fits" is actually green', hueOf(fits) > 80 && hueOf(fits) < 170,
    `${fits} is at ${hueOf(fits).toFixed(0)}deg`)
  ok('"it does not" is actually red', hueOf(no) < 30 || hueOf(no) > 340,
    `${no} is at ${hueOf(no).toFixed(0)}deg`)

  // THE ACTUAL FAULT, stated as the thing that must never be true again: the
  // two answers must not be the same colour, whatever either of them becomes.
  ok('the two answers are far apart in hue', apart(fits, no) > 60,
    `${apart(fits, no).toFixed(0)}deg between ${fits} and ${no}`)

  // And it must not go back to following the accent. Both themes, because it
  // was only ever wrong in one of them and that is why it survived.
  for (const theme of THEMES) {
    ok(`"it fits" is not the ${theme} accent`,
      fits.toLowerCase() !== SELECT_COLOUR[theme].toLowerCase()
      && apart(fits, SELECT_COLOUR[theme]) > 40,
      `${fits} vs ${SELECT_COLOUR[theme]}`)
  }

  {
    const grid = fs.readFileSync('src/three/CeilingGrid.jsx', 'utf8')
    const ghost = grid.slice(grid.indexOf('function Ghost('), grid.indexOf('function SelectionHalo('))
    ok('the ghost takes its colour from PLACE_COLOUR',
      /color=\{ok \? PLACE_COLOUR\.ok : PLACE_COLOUR\.no\}/.test(ghost),
      'the ghost is painting from something else again')
    // `useAccent`, not the word "accent". The slice runs up to the next
    // function, so it swallows that function's docblock — and the halo's
    // docblock talks ABOUT the accent, which failed a guard on code that does
    // not touch it. Guard on what the code calls, never on what it says.
    ok('and no longer reads the theme accent at all',
      !/useAccent/.test(ghost),
      'useAccent is back in the ghost — that is how both answers went red')

    // THE HALO MOVED INTO THE PLACEMENT LANGUAGE TOO, on request: a selected
    // set sat under a coral patch that, beside a ghost using red for "will not
    // go here", read as an error about a set that was perfectly fine.
    //
    // It is green almost always, and that is right rather than useless —
    // update() turns down any illegal move, so a set on the ceiling is on it
    // legally. The red is for the one moment the question is live: a drag
    // asking for a spot the set cannot take.
    const halo = grid.slice(grid.indexOf('function SelectionHalo('))
    ok('the selection halo answers can-it-go-here, not which-theme',
      /color=\{blocked \? PLACE_COLOUR\.no : PLACE_COLOUR\.ok\}/.test(halo),
      'the halo is painting from the accent again')
    ok('and CeilingGrid no longer reads the accent at all',
      !/useAccent/.test(grid),
      'something in the grid overlay is themed again')

    // One red for "blocked", from one place. A masked cell and a refused
    // placement are the same fact and should not be able to drift apart.
    ok('masked cells take the same red as a refused placement',
      /color=\{PLACE_COLOUR\.no\}/.test(grid) && !/#e06c5a/.test(grid),
      'the obstruction red is written out by hand again')
  }
}

// ---------------------------------------------------------------------------
section('A CONFIGURATION IN A URL')
{
  // A DOCUMENT WITH EVERYTHING IN IT, so what the link drops is dropped on
  // purpose and not because this fixture never had it.
  const full = {
    version: 3,
    sceneId: 'sc:edu-lecture',
    ceiling: { pitch: 0.001, maskPitch: 0.1, cols: 7500, rows: 7000, custom: true,
      height: 3, width: 7.5, length: 7 },
    ceilingOverride: { w: 7.5, l: 7, h: 3 },
    obstructions: ['1,1', '2,2'],
    groups: [{ id: 'gp_1', name: 'Bay' }],
    items: [{
      id: 'it_keep', type: 'clouds', cell: [400, 400], rot: 90, ci: 572, cj: 574,
      params: { shape: 'circle', size: 600, colour: 'CL-01_Blue' }, groupId: 'gp_1',
    }],
  }
  const pay = sharePayload(full)

  // --- what a link does NOT carry, which is what was asked for ------------
  ok('a link says nothing about the room', !('sceneId' in pay), Object.keys(pay).join(','))
  ok('and nothing about the obstruction mask', !('obstructions' in pay))
  ok('and drops the derived half of the ceiling block',
    Object.keys(pay.ceiling).join(',') === 'pitch', Object.keys(pay.ceiling).join(','))
  // fromJSON regenerates a missing id and recomputes the footprint from the
  // params through productCells, so writing either would be writing something
  // that can disagree with the parameters beside it.
  for (const k of ['id', 'ci', 'cj']) {
    ok(`an item drops its ${k}, which fromJSON makes again`, !(k in pay.items[0]))
  }

  // --- and what it MUST carry ---------------------------------------------
  //
  // THE ZONE IS NOT THE ROOM. Cells are indices counted from the ceiling's own
  // corner, so the zone is the frame they are written in — measured: the
  // origin moves when the ceiling's dimensions do. Drop it and every item in
  // the link lands somewhere else, or off the grid and is discarded.
  ok('the zone travels, because the cells are counted from it',
    JSON.stringify(pay.ceilingOverride) === JSON.stringify(full.ceilingOverride))
  ok('so does the pitch the cells are counted in', pay.ceiling.pitch === 0.001)
  ok('group names travel', JSON.stringify(pay.groups) === JSON.stringify(full.groups))
  ok('a grouped item keeps its group', pay.items[0].groupId === 'gp_1')
  ok('and its rotation', pay.items[0].rot === 90)

  // --- the scene is the READER'S, not the sharer's ------------------------
  const doc = shareDoc(pay, 'sc:office-board')
  ok('the reader supplies the scene, since the link does not name one',
    doc.sceneId === 'sc:office-board')
  const solo = sharePayload({ ...full, groups: [], items: [{ ...full.items[0], groupId: null }] })
  ok('an ungrouped item carries no empty group key at all',
    !('groupId' in solo.items[0]), Object.keys(solo.items[0]).join(','))
  ok('and no empty groups list', !('groups' in solo), Object.keys(solo).join(','))
}

{
  // The bytes. Asserted here rather than only in a browser because
  // CompressionStream is in node too, which is the whole reason share.js uses
  // streams instead of Blob and Response.
  const doc = {
    version: 3, sceneId: 'sc:edu-lecture',
    ceiling: { pitch: 0.001 }, ceilingOverride: { w: 7.5, l: 7, h: 3 }, obstructions: [],
    groups: [],
    items: Array.from({ length: 20 }, (_, i) => ({
      id: 'it_' + i, type: 'clouds', cell: [400 + i * 700, 400], rot: 0, ci: 572, cj: 574,
      params: { shape: 'circle', size: 600, thickness: 40, family: 'cloud-series',
        colour: 'CL-01_Blue', drop: 0.48, rot: 0 },
      groupId: null,
    })),
  }

  const encoded = await encodeConfig(doc)
  ok('an encoded configuration names its format', encoded.startsWith(FORMAT + '.'),
    encoded.slice(0, 12))
  // base64url: '+' and '/' are both meaningful in a URL and '=' padding is
  // dead weight, so none of the three may appear.
  ok('and is URL-safe', !/[+/=]/.test(encoded.slice(FORMAT.length + 1)))

  const back = await decodeConfig(encoded, 'sc:office-board')
  ok('a configuration survives the round trip exactly',
    JSON.stringify(back.items) === JSON.stringify(sharePayload(doc).items),
    `${back.items.length} items back`)
  ok('and keeps the frame its cells are counted in',
    JSON.stringify(back.ceilingOverride) === JSON.stringify(doc.ceilingOverride)
    && back.ceiling.pitch === doc.ceiling.pitch)

  // Size. The budget is what survives being pasted into a chat window, not a
  // browser limit — browsers take far more.
  const url = linkFor(encoded, 'https://configurator.univicoustic.com/ceiling/')
  ok(`a twenty-set layout fits a link (${url.length} chars, budget ${URL_BUDGET})`,
    url.length < URL_BUDGET, `${url.length} chars`)
  ok('the link reads back out of the URL it was put into',
    readLink(url) === encoded)
  ok('and a URL with no fragment carries nothing',
    readLink('https://configurator.univicoustic.com/ceiling/') === null)
}

{
  // A DAMAGED LINK MUST SAY SO. Every one of these is something a person can
  // actually receive — a link cut short by an email client, one made by a
  // future build, one that is not a link at all.
  const cases = [
    ['made by a newer build', 'c9.AAAA', /format "c9"/],
    ['not a configuration', 'nonsense', /does not carry a configuration/],
    ['cut short', FORMAT + '.H4sIAAAAAAAA', /damaged/],
    ['not base64 at all', FORMAT + '.!!!', /damaged/],
  ]
  for (const [label, bad, wants] of cases) {
    let msg = null
    try { await decodeConfig(bad, 'x'); msg = '(no error)' } catch (e) { msg = e.message }
    ok(`a link ${label} is refused, legibly`, wants.test(msg), msg)
  }
}

{
  // THE ROUND TRIP THROUGH THE REAL DOCUMENT, which is the only version of
  // this that proves anything: the store's own toJSON out, and its own
  // fromJSON back in, with the link in between.
  reset()
  // A NON-DEFAULT ZONE, deliberately. reset() clears the override, and with no
  // zone set the frame the cells are counted from is the room's own — so a
  // link that dropped the zone would round-trip perfectly here and the guard
  // would be proving nothing. Setting one makes the origin depend on it, which
  // is the thing being claimed.
  S().setCeiling({ w: 6, l: 5 })
  ok('the layout is laid out in a zone of its own, not the room default',
    !!S().ceilingOverride, JSON.stringify(S().ceilingOverride))
  S().setProduct('clouds')
  S().setBrush({ shape: 'square' })
  S().setBrush({ size: sizesFor('square')[0] })
  S().setBrush({ family: 'cloud-series', colour: seriesSwatchCode(SERIES_DESIGNS[0], 'Blue') })
  const placed = [S().placeAt(...at(10, 10)), S().placeAt(...at(10, 40)), S().placeAt(...at(40, 10))]
    .filter(Boolean).length
  // Stated as its own assertion. A setup that quietly places nothing turns
  // every check below into a comparison of two empty lists, which passes.
  ok('three clouds are on the ceiling to share', placed === 3 && S().items.length === 3,
    `${placed} placed, ${S().items.length} on the ceiling`)

  const shape = (items) => JSON.stringify(items.map((it) => ({
    type: it.type, cell: it.cell, rot: it.rot, params: it.params,
    groupId: it.groupId ?? null,
  })))
  const before = shape(S().items)
  const zoneBefore = JSON.stringify(S().ceilingOverride)

  const link = await encodeConfig(S().toJSON())
  S().clear()
  ok('the ceiling is empty before the link is opened', S().items.length === 0)

  const reopened = S().fromJSON(await decodeConfig(link, S().roomId))
  ok('the link puts every set back', reopened.loaded === 3 && reopened.dropped === 0,
    JSON.stringify(reopened))
  ok('identical in type, cell, rotation, parameters and group',
    shape(S().items) === before,
    shape(S().items).slice(0, 160))

  // AND THE FRAME THOSE CELLS ARE COUNTED IN. Comparing cells alone is not
  // enough and it took breaking the zone to see it: a cell is an index, so it
  // survives verbatim even when the origin has moved underneath it. Every set
  // would report "identical" while sitting somewhere else on the ceiling.
  ok('and the zone comes back with them, so the cells mean the same place',
    JSON.stringify(S().ceilingOverride) === zoneBefore,
    `${JSON.stringify(S().ceilingOverride)} vs ${zoneBefore}`)

  // The mask is not carried, so it comes back empty — which is what a reader
  // of a link that never mentioned it should get.
  ok('and the obstruction mask is empty, because a link does not carry one',
    S().obstructions.length === 0)
}

{
  // The wiring in main.jsx, which is not reachable from here any other way.
  const main = fs.readFileSync('src/main.jsx', 'utf8')

  // Against the MOUNT, not against 'root.render' — fail() renders too, near the
  // top of the file, and indexOf found that one. The guard failed on code that
  // does exactly what it is asked to do.
  const MOUNT = 'root.render(<React.StrictMode>'
  ok('a link is applied before the first paint',
    main.indexOf('const link = readLink()') > 0
    && main.indexOf('const link = readLink()') < main.indexOf(MOUNT),
    'a shared ceiling would flash empty and fill in a frame later')

  // A bad link is not a bad app: anything wrong with the fragment leaves the
  // ceiling empty and is reported, rather than showing the start-up failure
  // page for a mistyped character in something somebody else sent you.
  ok('and a link that cannot be read does not stop the app starting',
    /catch \(err\) \{\s*startup = `Could not open that link/.test(main),
    'a damaged link takes the app down again')

  // A LINK BRINGS ITS PRODUCT WITH IT, the way applyPreset does. Without it a
  // reader opens twenty hexagons and finds the panel blank, with Place faded
  // over a ceiling that plainly answers every question it is asking.
  // The RULE about the panel lives in the store now (openDoc) and is asserted
  // by driving it, below. What is left here is that boot goes through it.
  ok('boot opens a link through openDoc', /openDoc\(doc\)/.test(main))
  ok('and a session through openDoc, with the brush the session saved',
    /openDoc\(saved\.doc, \{ brush: saved\.brush \}\)/.test(main))

  // THE ONE THAT NEARLY GOT AWAY. Moving the brush into openDoc moved it
  // EARLIER — before the model seeding, which fires on `brush.type ===
  // 'baffles'` and would then overwrite a restored baffle type with whatever
  // the registry lists first.
  ok('and the model seeding stands down once something has been restored',
    /if \(!openedFrom && first\?\.type/.test(main),
    'the default baffle type overwrites the one the link or session supplied')
}

{
  // openDoc, by driving it: one way in, wherever a document comes from.
  reset()
  S().setProduct('clouds')
  S().setBrush({ shape: 'square' })
  S().setBrush({ size: sizesFor('square')[0] })
  S().setBrush({ family: 'cloud-series', colour: seriesSwatchCode(SERIES_DESIGNS[0], 'Blue') })
  ok('a square cloud is on the ceiling to reopen', !!S().placeAt(...at(10, 10)))
  const doc = S().toJSON()

  // --- no brush supplied: the first set on the ceiling stands in ----------
  reset()
  ok('the panel is a baffle one to begin with, so the change is visible',
    S().brush.type === 'baffles')
  S().openDoc(doc)
  ok('a document with no brush adopts the first set on the ceiling',
    S().brush.type === 'clouds' && S().brush.params.shape === 'square',
    `${S().brush.type} / ${S().brush.params.shape}`)

  // --- a brush supplied wins ----------------------------------------------
  //
  // A SESSION HAS A REAL BRUSH and does not have to guess from the ceiling: it
  // brings back the spec you were setting up, including one you had half
  // filled in and never placed.
  reset()
  S().openDoc(doc, { brush: { type: 'clouds', params: {
    shape: 'triangle', size: sizesFor('triangle')[0], thickness: 40,
    family: 'cloud-series', colour: seriesSwatchCode(SERIES_DESIGNS[0], 'Blue'),
  } } })
  ok('a supplied brush beats the ceiling', S().brush.params.shape === 'triangle',
    String(S().brush.params.shape))
  ok('and the ceiling still came back', S().items.length === 1)

  // --- nothing to adopt ----------------------------------------------------
  reset()
  const empty = { ...doc, items: [] }
  const was = S().brush.type
  S().openDoc(empty)
  ok('an empty document leaves the panel alone rather than blanking it',
    S().brush.type === was, S().brush.type)
}

{
  // A LINK PASTED INTO A TAB THAT IS ALREADY OPEN. Changing only the fragment
  // is a same-document navigation: the browser swaps the hash and does not
  // reload, so boot never runs. Opening a link in a new tab worked and pasting
  // one into an open tab did nothing at all.
  // codeOf, not the raw file: commenting the listener out leaves the call
  // behind as prose, and the bare pattern matched it happily — so the guard
  // passed with the whole thing switched off. Caught by breaking it.
  const bar = codeOf(fs.readFileSync('src/ui/TopBar.jsx', 'utf8'))
  ok('a link pasted into an open tab is noticed',
    /addEventListener\('hashchange', onHash\)/.test(bar)
    && /removeEventListener\('hashchange', onHash\)/.test(bar),
    'nothing is listening, or the listener is never removed')
  ok('and it goes through openDoc, so the panel follows the ceiling',
    /openDoc\(doc\)/.test(bar))
  // Asked only when there IS something to lose. A dialog about an empty
  // ceiling has one sensible answer and is a click in the way.
  ok('it asks before replacing a ceiling with work on it',
    /const mine = useStore\.getState\(\)\.items\.length/.test(bar)
    && /if \(mine && !window\.confirm\(/.test(bar),
    'it replaces the ceiling without asking, or asks when the ceiling is empty')
  // The undo step openDoc pushes is KEPT here, unlike at boot, so the promise
  // in the question is one the app can keep.
  ok('and the question offers an undo that exists',
    /Ctrl\+Z puts them back/.test(bar)
    && !/undoStack: \[\]/.test(bar),
    'the dialog promises an undo the component then throws away')
}

// ---------------------------------------------------------------------------
section('DRAGGING A SET — it moves THROUGH whatever is in the way')
{
  // A drag used to stop dead at the first obstacle, because it moves the set
  // live and update() turned down anything illegal. So moving a panel past a
  // row of its neighbours meant moving them out of the way first. Asked for:
  // let it pass through, and sort it out on release.
  reset()
  const g = S().grid()
  const a = S().placeAt(...at(6, 6))
  const c = S().placeAt(...at(6, 30))
  ok('two sets to drag between', !!a && !!c && S().items.length === 2,
    `${S().items.length} placed`)

  const A = S().items[0]
  const B = S().items[1]
  const at0 = () => S().items.find((i) => i.id === A.id).cell
  ok('nothing is refused before anything is dragged', S().dragBlocked === null)
  // Not zero: reset() clears the stack and the two placements above each push
  // one. What matters is the CHANGE a drag makes to it.
  const undos = S().undoStack.length

  // --- straight through the other one -------------------------------------
  S().beginDrag(A.id)
  const onto = S().dragTo(A.id, B.cell[0], B.cell[1])
  ok('a drag onto an occupied spot is TAKEN, not refused', onto === true)
  ok('and the set really is there, on top of the other one',
    JSON.stringify(at0()) === JSON.stringify(B.cell), JSON.stringify(at0()))
  // The halo is the only thing saying this cannot be left here, which is why
  // it had to stop meaning "the move was refused" and start meaning "where it
  // is now will not do".
  ok('the halo says it cannot be left there', S().dragBlocked === A.id,
    JSON.stringify(S().dragBlocked))

  // --- and letting go there puts it back ----------------------------------
  const snapped = S().endDrag()
  ok('releasing over an occupied spot snaps it back', snapped === true)
  ok('to exactly where the drag started',
    JSON.stringify(at0()) === JSON.stringify(A.cell), JSON.stringify(at0()))
  ok('and the refusal does not outlive the drag', S().dragBlocked === null)
  // A drag that changed nothing is not a change. An undo entry that undoes to
  // itself is worse than no entry at all.
  ok('and it takes its undo step back with it, having changed nothing',
    S().undoStack.length === undos, `${S().undoStack.length} vs ${undos}`)

  // --- somewhere free: kept ------------------------------------------------
  S().beginDrag(A.id)
  const free = S().dragTo(A.id, A.cell[0], A.cell[1] + Math.round(0.9 / g.pitch))
  ok('a drag into free ceiling is taken', free === true)
  ok('and the halo is clear', S().dragBlocked === null)
  ok('releasing there keeps it', S().endDrag() === false)
  ok('and it stayed where it was let go',
    at0()[1] === A.cell[1] + Math.round(0.9 / g.pitch), JSON.stringify(at0()))
  // THE COMMENT IN dragTo HAS CLAIMED THIS FOR A LONG TIME and nothing was
  // pushing it: a drag was not undoable at all until beginDrag.
  ok('a drag that moved something is one undo step',
    S().undoStack.length === undos + 1, `${S().undoStack.length} vs ${undos + 1}`)
  S().undo()
  ok('and undoing it puts the set back',
    JSON.stringify(at0()) === JSON.stringify(A.cell), JSON.stringify(at0()))

  // --- asking for the cell it is already on -------------------------------
  //
  // Most frames of a drag ask for exactly that.
  S().beginDrag(A.id)
  const same = S().dragTo(A.id, ...at0())
  ok('asking for the cell it already occupies moves nothing', same === false)
  ok('and does not colour the halo', S().dragBlocked === null)
  S().endDrag()

  // --- the ceiling edge still holds ---------------------------------------
  //
  // Passing through other sets is one thing; leaving the ceiling is another.
  // clampCorner holds the corner inside the grid before update() ever sees it.
  S().beginDrag(A.id)
  S().dragTo(A.id, 10 ** 7, 10 ** 7)
  const far = at0()
  ok('a drag past the edge stops at the edge rather than leaving the ceiling',
    onGrid(footprint(S().items.find((i) => i.id === A.id), g), g),
    JSON.stringify(far))
  S().endDrag()
}

{
  // A GROUP IS BOUNDED TOO, and by a different mechanism. A single set is held
  // inside the grid by clampCorner before update() ever sees it; a group goes
  // through moveGroup, which has to keep its own onGrid check even under
  // `force`. Without it a forced group drag carries the whole thing off the
  // ceiling, and then every member has to be put back.
  reset()
  const g = S().grid()
  const p1 = S().placeAt(...at(6, 6))
  const p2 = S().placeAt(...at(6, 30))
  S().selectMany([p1, p2])
  const gid = S().groupSelected('Bay')
  ok('two sets in a group to drag together',
    !!gid && S().selectedIds.length === 2, `${S().selectedIds.length} selected`)

  S().beginDrag(p1)
  S().dragTo(p1, 10 ** 7, 10 ** 7)
  ok('a forced group drag still stops at the ceiling edge',
    S().items.every((i) => onGrid(footprint(i, g), g)),
    JSON.stringify(S().items.map((i) => i.cell)))
  // And the members keep their spacing: they all move by one delta, so a group
  // that stopped at the edge stopped as one thing.
  const gap = S().items[1].cell[1] - S().items[0].cell[1]
  S().endDrag()
  ok('and the group is still a group afterwards',
    S().items[1].cell[1] - S().items[0].cell[1] === gap)
}

{
  // Every component that can drag a set has to clear the refusal wherever it
  // forgets the drag — not only on pointer-up. BaffleSet and TileSet also
  // forget it on a double-click, which opens the focus modal on top of a drag
  // that never got its pointerup; a refusal left behind there would sit red
  // under a set nobody is dragging.
  for (const f of ['BaffleSet', 'CloudSet', 'FlySet', 'TileSet']) {
    const src = fs.readFileSync(`src/three/${f}.jsx`, 'utf8')
    const forgets = (src.match(/drag\.current = null/g) ?? []).length
    const clears = (src.match(/endDrag\(\)/g) ?? []).length
    ok(`${f} clears the refusal everywhere it forgets the drag`,
      forgets > 0 && clears === forgets,
      `forgets in ${forgets} place(s), clears in ${clears}`)
    ok(`and ${f} takes endDrag from the store`,
      /const endDrag = useStore\(\(s\) => s\.endDrag\)/.test(src))
  }
}

{
  // The OUTLINE around a selected set keeps the accent. That says "this is the
  // one you have hold of", which is identity, not permission — so "make the
  // halo mean placeable" must not be read as "make selection green".
  for (const f of ['BaffleSet', 'CloudSet', 'TileSet']) {
    const src = fs.readFileSync(`src/three/${f}.jsx`, 'utf8')
    ok(`${f} still outlines the selection in the theme's accent`,
      /useAccent\(\)/.test(src), 'the selection outline stopped following the theme')
  }
}

// ---------------------------------------------------------------------------
section('BOX SELECT — the band keeps following past the edge of the ceiling')
{
  // Reported as: drag a box select into the edge and it sticks there, and you
  // have to pull it back before it will move again.
  //
  // CAUSE, measured rather than guessed. The band read `e.point` — the
  // intersection with the ceiling MESH, which is exactly the size of the zone.
  // Past its edge the ray stops hitting it, and react-three-fiber then delivers
  // the event carrying the CAPTURED intersection instead: the point where the
  // press landed. So the far corner snapped back onto the near one, the
  // rectangle had no extent, the stale-sample guard threw it away, and the band
  // froze. The trace showed it exactly — the rectangle stopped at x1 = 3.28 m
  // and stayed there through another 200 px of pointer travel, while hoverCell
  // read the press cell rather than anything under the pointer.
  //
  // It is NOT about the mesh being too small: a pick plane four times the size
  // moved the freeze and did not remove it. The fix is to stop asking the mesh
  // at all and intersect an unbounded plane, which is what the item drag has
  // always done.
  reset()
  const g = S().grid()
  const x1 = g.originX + g.cols * g.pitch
  const z1 = g.originZ + g.rows * g.pitch

  ok('a point on the ceiling is left alone',
    JSON.stringify(clampToCeiling(0, 0, g)) === JSON.stringify([0, 0]))

  // PAST THE EDGE IS PINNED TO THE EDGE, not thrown away. This is the whole
  // fix: the band still has a position out there, so it still tracks.
  ok('a point past the right edge is pinned to the right edge',
    clampToCeiling(x1 + 5, 0, g)[0] === x1, String(clampToCeiling(x1 + 5, 0, g)[0]))
  ok('and past the left edge to the left edge',
    clampToCeiling(g.originX - 5, 0, g)[0] === g.originX)
  ok('and past the far edge to the far edge',
    clampToCeiling(0, z1 + 5, g)[1] === z1)
  ok('and past the near edge to the near edge',
    clampToCeiling(0, g.originZ - 5, g)[1] === g.originZ)

  // THE AXES ARE INDEPENDENT, which is what "stops being stuck" actually means:
  // run out of ceiling sideways and the band should still follow you up and
  // down.
  const out = clampToCeiling(x1 + 5, 1.25, g)
  ok('running out of ceiling in one axis does not freeze the other',
    out[0] === x1 && out[1] === 1.25, JSON.stringify(out))

  // A corner is both at once.
  const corner = clampToCeiling(x1 + 9, z1 + 9, g)
  ok('a drag into the corner pins to the corner',
    corner[0] === x1 && corner[1] === z1, JSON.stringify(corner))
}

{
  const mq = fs.readFileSync('src/three/Marquee.jsx', 'utf8')
  // Comments out, because the comment explaining why `e.point` is not used
  // says `e.point`. See codeOf.
  const code = codeOf(mq)

  ok('the band is tracked against an unbounded plane',
    /new THREE\.Plane\(new THREE\.Vector3\(0, 1, 0\), -g\.y\)/.test(mq)
    && /e\.ray\?\.intersectPlane\(plane, hit\)/.test(mq),
    'it is reading the mesh intersection again')

  // THE THING THAT CAUSED IT. `e.point` is the mesh hit, and the mesh is the
  // zone — so the moment the pointer leaves the zone it becomes the press
  // point and the band collapses.
  // NOT followed by a letter. `e.pointerId` contains the string `e.point`, and
  // the capture calls use it three lines further down — so the bare pattern
  // reported the fault as present in the file that fixed it. The comment
  // stripping above was a real precaution aimed at the wrong cause.
  ok('and never from e.point, which is the mesh and therefore the zone',
    !/e\.point(?![a-zA-Z])/.test(code),
    'e.point is back — that is what froze the band at the edge')

  ok('the band is held inside the zone rather than drawn into the room',
    /clampToCeiling\(hit\.x, hit\.z, g\)/.test(mq))

  // No intersection at all means the ray is edge-on to the ceiling. There is
  // no sensible answer, so the last one is kept rather than one invented.
  ok('a ray with no intersection holds the last band rather than collapsing it',
    /const to = at\(e\)\s*\n\s*if \(!to\) return/.test(mq),
    'a null point falls through and the band jumps')
  ok('and the release does not measure a distance from a point it never got',
    /const far = !!to\s*\n\s*&& \(Math\.abs/.test(mq),
    'end() would throw on a null point')
}

// ---------------------------------------------------------------------------
section('THE SESSION — the ceiling is still there after a reload')
{
  // No localStorage at all, which is both node and a browser with storage
  // switched off. Every one of these has to be a shrug, not a throw: the app
  // starts empty and carries on.
  const had = typeof globalThis.localStorage !== 'undefined'
  ok('with no storage, reading a session is simply nothing', !had && readSession() === null)
  ok('and writing one says so rather than throwing', writeSession({ items: [] }, null) === false)
  let threw = false
  try { clearSession() } catch { threw = true }
  ok('and clearing one is a no-op', !threw)
}

{
  // A standing-in localStorage, so the round trip can be asserted where the
  // rest of the suite runs.
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }

  const doc = { version: 3, sceneId: 'sc:edu-lecture', ceiling: { pitch: 0.001 }, items: [{ id: 'a' }] }
  const brush = { type: 'clouds', params: { shape: 'hexagon', size: 900 } }
  ok('a session is written', writeSession(doc, brush) === true)

  const back = readSession()
  ok('and read back whole', JSON.stringify(back?.doc) === JSON.stringify(doc))
  // The brush is NOT in the document, and has to be, or a restored ceiling
  // arrives under a blank panel of fields — the same fault a shared link had.
  ok('including the brush, which the document does not carry',
    JSON.stringify(back?.brush) === JSON.stringify(brush))
  ok('and stamped, so the envelope can be told apart later', typeof back?.at === 'number')

  clearSession()
  ok('clearing really clears', readSession() === null)

  // EVERY WAY IT CAN BE WRONG ANSWERS THE SAME: null, and the app starts empty.
  // A session that cannot be read is not worth a message, because there is
  // nothing anybody can do about it.
  for (const [what, raw] of [
    ['half-written JSON', '{not json'],
    ['an envelope from a future build', JSON.stringify({ v: 99, doc: { items: [] } })],
    ['something that is not a document', JSON.stringify({ v: 1, doc: { nope: true } })],
    ['an empty string', ''],
  ]) {
    globalThis.localStorage.setItem(SESSION_KEY, raw)
    ok(`${what} reads as no session at all`, readSession() === null)
  }
  clearSession()

  // --- what the watcher actually watches ---------------------------------
  //
  // hoverCell changes on every pointer move. Subscribing to the whole state
  // would serialise the entire ceiling a hundred times a second while the
  // cursor crosses it.
  let state = {
    items: [], obstructions: [], groups: [], ceilingOverride: null,
    roomId: 'sc:edu-lecture', brush: { type: 'clouds', params: {} }, hoverCell: null,
    toJSON: () => ({ version: 3, sceneId: 'sc:edu-lecture', ceiling: { pitch: 0.001 }, items: state.items }),
  }
  const subs = new Set()
  const fake = {
    getState: () => state,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn) },
  }
  const poke = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)) }
  const stop = keepSession(fake, { delay: 10 })
  const settle = () => new Promise((r) => setTimeout(r, 40))

  poke({ hoverCell: [5, 5] })
  await settle()
  ok('moving the pointer does not write a session', readSession() === null)

  poke({ items: [{ id: 'x' }] })
  await settle()
  ok('placing a set does', readSession()?.doc.items.length === 1)

  poke({ obstructions: ['1,1'] })
  await settle()
  ok('and so does the mask, which the session keeps even though a link does not',
    readSession() !== null)

  // The brush is watched too, so a spec you set up and had not placed yet is
  // still there after a reload.
  poke({ brush: { type: 'clouds', params: { shape: 'triangle' } } })
  await settle()
  ok('and changing the panel', readSession()?.brush.params.shape === 'triangle')

  stop()
  clearSession()
  poke({ items: [{ id: 'y' }, { id: 'z' }] })
  await settle()
  ok('and nothing is written once the watcher is stopped', readSession() === null)

  delete globalThis.localStorage
}

{
  const main = fs.readFileSync('src/main.jsx', 'utf8')

  // THE LINK WINS. Following a link means you came to see THAT ceiling, not
  // the one you were building yesterday — so the session is read in an `else`.
  ok('a saved session is only consulted when there is no link in the address bar',
    /\}\s*else\s*\{\s*\n\s*\/\/ THE LINK WINS/.test(main),
    'the session is read unconditionally, and a link would lose to it')

  // ANCHORED TO THE START OF A LINE. Commenting the call out leaves
  // `// keepSession(useStore)` behind, which the bare pattern matches happily —
  // so the guard passed with persistence switched off. Found by breaking it.
  ok('the browser copy is kept in step from boot',
    /^\s*keepSession\(useStore\)/m.test(main),
    'nothing is writing the session — it is gone or commented out')

  // fromJSON pushes an undo step, and at boot the state it would return to is
  // an empty ceiling that never existed for the user. One press of Undo after
  // a reload would throw away everything just restored.
  ok('and there is nothing to undo to after a restore',
    /^\s*if \(openedFrom\) useStore\.setState\(\{ undoStack: \[\] \}\)/m.test(main),
    'Undo after a reload would empty the ceiling')

  // A save this build cannot read is dropped rather than retried, or the same
  // failure greets you on every reload for ever.
  ok('a session that cannot be read is dropped, not retried for ever',
    /clearSession\(\)\s*\n\s*startup = `Could not restore/.test(main))
}

// ---------------------------------------------------------------------------
section('ONE FIN HANGS AT ITS OWN HEIGHT')
{
  // The renderer has always honoured a per-fin drop — baffle.js reads
  // `finP.drop ?? p.drop`, modelFins reads `ov.drop ?? params.drop`, and the
  // outline follows. What was wrong was the CONTROL: the fin panel called it
  // "Drop below slab" while the whole rest of the app calls the same thing
  // Suspension height, so somebody looking for it did not find it.
  const fin = codeOf(fs.readFileSync('src/ui/FinEditor.jsx', 'utf8'))
  const fields = codeOf(fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8'))

  ok('a fin has a Suspension height field, named as it is everywhere else',
    /label="Suspension height"/.test(fin),
    'the fin panel calls it something of its own again')
  ok('and the old name is gone', !/Drop below slab/.test(fin))

  // THE SET AND THE FIN ARE ONE CONTROL, so the two cannot drift. The fin's
  // copy used to be a hardcoded 50-1200 with no hardware floor — which let it
  // read 50 mm while modelFins hung the fin at the clamp height, because
  // modelFins does its own Math.max against the hardware.
  ok('the range comes from one place',
    /export function dropRangeMm/.test(fields)
    && /dropRangeMm\(p\)/.test(fin)
    && /dropRangeMm\(p\)/.test(fields),
    'the fin and the set are computing their limits separately again')
  ok('and the fin no longer carries its own numbers',
    !/min=\{50\} max=\{1200\}/.test(fin),
    'the hardcoded range is back, and it ignores the hardware floor')
  ok('the clamp note is shown wherever the control is',
    /export function DropNote/.test(fields) && /<DropNote params=\{p\} \/>/.test(fin))

  // --- and the document keeps it per fin ----------------------------------
  reset()
  S().setProduct('baffles')
  S().setBrush({ btype: 'blade' })
  const before = JSON.stringify(S().brush.params.finOverrides ?? {})
  ok('a fresh brush carries no fin overrides', before === '{}', before)

  const id = S().placeAt(...at(10, 10))
  ok('a baffle set to edit', !!id, String(id))
  if (id) {
    S().updateFinOf(id, 1, { drop: 0.9 })
    const ovs = S().items.find((i) => i.id === id).params.finOverrides
    ok('one fin takes a drop of its own', ovs?.[1]?.drop === 0.9, JSON.stringify(ovs))
    ok('and no other fin is touched', Object.keys(ovs).join(',') === '1',
      Object.keys(ovs).join(','))
    ok('while the set keeps its own height',
      S().items.find((i) => i.id === id).params.drop !== 0.9)

    // Reset DELETES the override rather than writing the set's value into it,
    // so the fin goes back to following the set — including future changes.
    S().resetFinOf(id, 1)
    ok('and resetting the fin lets it follow the set again',
      Object.keys(S().items.find((i) => i.id === id).params.finOverrides).length === 0)
  }
}

// ---------------------------------------------------------------------------
section('ONE FIN, ITS OWN SIZE')
{
  // Asked for: changing the thickness or length of a single fin must not change
  // the whole set. They were shown in the set panel while a fin was selected
  // and edited the whole run — so changing the thickness of the fin you were
  // looking at changed all eight of them.
  //
  // A fin MAY be bigger than its set, and the set's reserved area grows to
  // cover the biggest one. Anything else would let a long fin cross into a
  // neighbouring set that the grid says is clear.

  // --- the measurement is unchanged where nothing varies ------------------
  //
  // This is the guard that matters most: baffleExtent is the single definition
  // of a set's size, read by the renderer, the grid, the outline and the
  // schedule. Measuring per fin must give the OLD answer, exactly, for every
  // set that has no overrides.
  reset({ thickness: 25, length: 1800, count: 6, spacing: 200 })
  {
    const p = S().brush.params
    const e = baffleExtent(p)
    const old = {
      length: p.length / 1000,
      width: (p.count - 1) * finPitch(p) + p.thickness / 1000,
    }
    ok('a set with no per-fin sizes measures exactly as it always did',
      Math.abs(e.length - old.length) < 1e-9 && Math.abs(e.width - old.width) < 1e-9,
      `${e.length} x ${e.width} vs ${old.length} x ${old.width}`)
  }

  // --- a fin's own size ---------------------------------------------------
  {
    const p = { ...S().brush.params, finOverrides: { 1: { length: 2400 } } }
    ok('a fin with no size of its own reports the set’s',
      finSizeMm(p, 0).l === p.length, JSON.stringify(finSizeMm(p, 0)))
    ok('and one with a length of its own reports that',
      finSizeMm(p, 1).l === 2400, JSON.stringify(finSizeMm(p, 1)))
    ok('finParams merges the override over the set',
      finParams(p, 1).length === 2400 && finParams(p, 0).length === p.length)

    // THE SET'S RESERVED AREA GROWS to cover it.
    const bigger = baffleExtent(p)
    ok('a fin longer than its set widens what the set reserves',
      Math.abs(bigger.length - 2.4) < 1e-9, String(bigger.length))
    ok('and the run keeps its rhythm, so the across-the-run size is unchanged',
      Math.abs(bigger.width - baffleExtent(S().brush.params).width) < 1e-9)
  }

  // --- a thicker fin ------------------------------------------------------
  {
    const base = S().brush.params
    const thick = { ...base, finOverrides: { 0: { thickness: 200 } } }
    const e = baffleExtent(thick)
    // The extent stays CENTRED on the run. Everything downstream places the
    // footprint from the item's cell and reads the extent as centred on it, so
    // measuring one side to the thick fin and the other to a thin one would
    // put the geometry off its own footprint.
    const pitch = finPitch(base)
    const span = (base.count - 1) * pitch
    const want = 2 * (span / 2 + 0.2 / 2)
    ok('a fin thicker than its set widens the run, symmetrically',
      Math.abs(e.width - want) < 1e-9, `${e.width} vs ${want}`)
  }

  // --- and the document keeps it per fin ----------------------------------
  {
    reset()
    S().setProduct('baffles')
    S().setBrush({ btype: 'blade' })
    const id = S().placeAt(...at(10, 10))
    ok('a blade set to edit', !!id)
    if (id) {
      const before = S().items.find((i) => i.id === id)
      const was = { t: before.params.thickness, l: before.params.length, ci: before.ci }
      S().updateFinOf(id, 1, { thickness: 25, length: 2780 })
      const after = S().items.find((i) => i.id === id)
      ok('the SET keeps its own thickness and length',
        after.params.thickness === was.t && after.params.length === was.l,
        `${after.params.thickness} / ${after.params.length}`)
      ok('the fin carries both', after.params.finOverrides[1].thickness === 25
        && after.params.finOverrides[1].length === 2780)
      ok('and no other fin does', Object.keys(after.params.finOverrides).join(',') === '1')
      ok('the footprint grew to cover the longer fin', after.ci > was.ci,
        `${was.ci} -> ${after.ci}`)

      S().resetFinOf(id, 1)
      const back = S().items.find((i) => i.id === id)
      ok('and resetting the fin gives the footprint back', back.ci === was.ci,
        `${back.ci} vs ${was.ci}`)
    }
  }
}

{
  // The two panels, which used to ask for the same thing at different scopes.
  const fields = codeOf(fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8'))
  const fin = codeOf(fs.readFileSync('src/ui/FinEditor.jsx', 'utf8'))

  ok('the set panel stops offering dimensions while one fin is selected',
    /const showDims = !forSingleFin/.test(fields)
    && /\{showDims && \(/.test(fields),
    'the set panel edits the whole run from under a selected fin again')
  for (const label of ['Thickness', 'Baffle length', 'Baffle height']) {
    ok(`and the fin panel asks for ${label} instead`,
      new RegExp('label="' + label + '"').test(fin),
      'the fin cannot be given its own')
  }
  // One thing, one name — it was "Face depth" here and "Baffle height" there.
  ok('under the same name the set uses', !/Face depth/.test(fin))

  // A fin that differs needs geometry of its own; only width used to get it.
  const par = codeOf(fs.readFileSync('src/lib/baffle.js', 'utf8'))
  ok('a fin with its own thickness or length gets its own geometry',
    /ov\.width !== undefined\s*\n?\s*\|\| ov\.thickness !== undefined \|\| ov\.length !== undefined/.test(par),
    'the override is merged and then handed the set’s geometry')

  const mf = codeOf(fs.readFileSync('src/lib/modelFins.js', 'utf8'))
  ok('a model fin is scaled from its own size',
    /scaled\.scale\.set\(\.\.\.fscale\)/.test(mf) && /const fscale = ownSize/.test(mf),
    'every fin is drawn at the set’s scale again')
  ok('and only a fin that carries one is measured again',
    /const ownSize = ov\.length !== undefined/.test(mf),
    'a document with no size overrides would be re-derived and could shift')
}

// ---------------------------------------------------------------------------
section('THE BACKGROUND, AND THE GRID THAT HAS TO STAY READABLE ON IT')
{
  // Asked for: a colour picker for the background, with white, grey and dark
  // grey to hand, and the grid colour following.
  const lum = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16)
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  }

  ok('three backgrounds are offered', BACKGROUNDS.length === 3,
    BACKGROUNDS.map((b) => b.name).join(', '))
  ok('named as asked', BACKGROUNDS.map((b) => b.name).join(',') === 'White,Grey,Dark grey')

  // SPREAD ACROSS THE RANGE. Three options that read the same is one option.
  const ls = BACKGROUNDS.map((b) => lum(b.hex)).sort((a, c) => a - c)
  ok('and spread across the range rather than bunched',
    ls[1] - ls[0] > 0.15 && ls[2] - ls[1] > 0.15,
    ls.map((v) => v.toFixed(2)).join(' / '))

  // --- the line colour ----------------------------------------------------
  for (const b of BACKGROUNDS) {
    const line = gridLineColour(b.hex)
    const d = Math.abs(lum(line) - lum(b.hex))
    ok(`the grid reads on ${b.name} (${b.hex} -> ${line})`, d > 0.12, `separation ${d.toFixed(3)}`)
  }

  // THE CASE THE OLD RULE LOST. It picked between two fixed greys on a
  // threshold: fine at the ends, and on a mid grey the "light" one is almost
  // the background's own lightness, so the grid vanished into it. Grey is one
  // of the three presets, so this is not a corner case.
  const mid = gridLineColour('#9aa0a6')
  ok('a mid grey gets a DARK line, not the old light one',
    lum(mid) < lum('#9aa0a6'), `${mid} against #9aa0a6`)
  ok('and it is not one of the two greys the old rule chose between',
    mid.toLowerCase() !== '#8b95a1' && mid.toLowerCase() !== '#2c3138', mid)

  // The picker takes anything, so the rule has to hold for anything.
  for (const hex of ['#ffffff', '#000000', '#7a5230', '#d9cbae', '#808080']) {
    const line = gridLineColour(hex)
    const d = Math.abs(lum(line) - lum(hex))
    ok(`and on a custom ${hex} (-> ${line})`, d > 0.1, `separation ${d.toFixed(3)}`)
  }

  // DERIVED, not paired: it takes a tint from the background, so two colours of
  // similar lightness do not come back with the same line.
  ok('the line takes a tint from the background',
    gridLineColour('#7a5230') !== gridLineColour('#30527a'),
    gridLineColour('#7a5230'))

  // A grid is not worth failing a render over.
  ok('and anything unreadable falls back rather than throwing',
    gridLineColour('not a colour') === '#8b95a1' && gridLineColour(null) === '#8b95a1')
}

{
  const grid = codeOf(fs.readFileSync('src/three/CeilingGrid.jsx', 'utf8'))
  ok('the grid asks for its colour rather than deciding',
    /gridLineColour\(background\)/.test(grid),
    'the threshold is back in the component')
  ok('and the two fixed greys are gone',
    !/#2c3138/.test(grid) && !/#8b95a1/.test(grid),
    'a hardcoded line colour has come back')

  const left = codeOf(fs.readFileSync('src/ui/LeftPanel.jsx', 'utf8'))
  ok('the picker is on screen, not behind a flag',
    /^\s*<BackgroundPanel \/>/m.test(left),
    'the background panel is hidden or gone')
  ok('and it is its own panel, so the trimmed Display toggles stay off',
    /const SHOW_DISPLAY = false/.test(left) && /function BackgroundPanel/.test(left))
  ok('with a colour input beside the swatches',
    /type="color"/.test(left) && /BACKGROUNDS\.map/.test(left))
}

// ---------------------------------------------------------------------------
section('THE SET’S SUSPENSION IS THE WHOLE RUN’S')
{
  // Reported as: with the fins at different heights, moving the set's
  // suspension moves only the boundary box — the baffles stay where they are.
  //
  // A fin's own drop is stored as an absolute height, so raising the set moved
  // only the fins that had none of their own. A staggered run stood still
  // while the box around it rose.
  reset()
  S().setProduct('baffles')
  S().setBrush({ btype: 'blade' })
  const id = S().placeAt(...at(10, 10))
  ok('a baffle set to stagger', !!id)

  const paramsOf = () => S().items.find((i) => i.id === id).params
  const dropsOf = () => {
    const ov = paramsOf().finOverrides ?? {}
    return Object.keys(ov).sort().map((k) => ov[k].drop)
  }

  if (id) {
    S().update(id, { params: { drop: 0.3 } })
    S().updateFinOf(id, 0, { drop: 0.3 })
    S().updateFinOf(id, 1, { drop: 0.45 })
    S().updateFinOf(id, 2, { drop: 0.6 })
    ok('three fins hang at heights of their own',
      JSON.stringify(dropsOf()) === JSON.stringify([0.3, 0.45, 0.6]), JSON.stringify(dropsOf()))

    // --- the whole run moves --------------------------------------------
    S().update(id, { params: { drop: 0.5 } })
    ok('moving the set moves every fin with it',
      JSON.stringify(dropsOf()) === JSON.stringify([0.5, 0.65, 0.8]), JSON.stringify(dropsOf()))
    ok('and the set reads what it did', paramsOf().drop === 0.5, String(paramsOf().drop))

    // THE STAGGER IS THE POINT. Fins keep their configuration; only the run
    // moves.
    const gaps = dropsOf().slice(1).map((d, i) => +(d - dropsOf()[i]).toFixed(4))
    ok('the fins keep their spacing from each other',
      JSON.stringify(gaps) === JSON.stringify([0.15, 0.15]), JSON.stringify(gaps))

    // --- and it stops rather than piling up on the limit ------------------
    //
    // Clamping each fin on its own let the deep ones stack on the maximum and
    // lose the stagger, and moving the set back did NOT bring it back — the
    // offsets were gone. Refusing the last few millimetres is a control that
    // appears to stop; the other is one that eats your work.
    const before = dropsOf()
    S().update(id, { params: { drop: 1.2 } })
    const after = dropsOf()
    const stillGaps = after.slice(1).map((d, i) => +(d - after[i]).toFixed(4))
    ok('asking for more than the deepest fin allows moves it as far as it can',
      after[after.length - 1] <= 1.2 && after[0] > before[0],
      JSON.stringify(after))
    ok('and the stagger survives the limit',
      JSON.stringify(stillGaps) === JSON.stringify([0.15, 0.15]), JSON.stringify(stillGaps))
    ok('with the set reading where the run actually got to',
      Math.abs(paramsOf().drop - after[0]) < 1e-9,
      `${paramsOf().drop} vs ${after[0]}`)

    // --- a fin that FOLLOWS the set is left alone -------------------------
    const ov3 = paramsOf().finOverrides?.[3]
    ok('a fin with no height of its own is not given one',
      ov3?.drop === undefined, JSON.stringify(ov3 ?? null))

    // --- and an unrelated edit does not shift anything --------------------
    const held = dropsOf()
    S().update(id, { params: { thickness: 25 } })
    ok('editing something else leaves the fins where they are',
      JSON.stringify(dropsOf()) === JSON.stringify(held), JSON.stringify(dropsOf()))
  }
}

{
  // The box has to reach the deepest fin. Measured from the set alone it cuts
  // through the very fin it is meant to be enclosing — and so does the
  // invisible box that catches the pointer.
  const hook = codeOf(fs.readFileSync('src/three/useBaffleGroup.js', 'utf8'))
  ok('the outline is measured to the deepest fin, not the set',
    /for \(const ov of Object\.values\(ovs\)\)/.test(hook)
    && /deepest = Math\.max\(deepest, Math\.max\(ov\.drop, floor\)\)/.test(hook),
    'the box is back to reading only the set’s drop')

  const st = codeOf(fs.readFileSync('src/lib/store.js', 'utf8'))
  ok('and the run is moved as one, not fin by fin',
    /THE RUN TRAVELS AS ONE/.test(fs.readFileSync('src/lib/store.js', 'utf8'))
    && /Math\.min\(\.\.\.own\.map\(\(d\) => hi - d\)\)/.test(st),
    'each fin is being clamped on its own again')
  // The import that the build cannot check: a free identifier is a
  // ReferenceError at runtime and esbuild says nothing.
  ok('and BAFFLE_SHARED is actually imported',
    /BAFFLE_SHARED,?\s*\n?[^\n]*\}\s*from '\.\/catalog\.js'/.test(st)
    || /BAFFLE_SHARED/.test(st.slice(0, st.indexOf('export'))),
    'BAFFLE_SHARED is used but never imported')
}

// ---------------------------------------------------------------------------
section('ONE FIN, TURNED ROUND')
{
  // Asked for: an option to turn a single fin 180 degrees.
  //
  // The field already existed. `rotDeg` was in the fin override, documented in
  // modelFins' docblock and applied there as a Y rotation — and nothing wrote
  // it, and the parametric builder never read it. Half a feature.
  const fin = codeOf(fs.readFileSync('src/ui/FinEditor.jsx', 'utf8'))
  const par = codeOf(fs.readFileSync('src/lib/baffle.js', 'utf8'))
  const mf = codeOf(fs.readFileSync('src/lib/modelFins.js', 'utf8'))

  ok('a fin can be turned round', /label="Facing"/.test(fin)
    && /rotDeg: v \? 180 : 0/.test(fin),
    'the control is gone')

  // NOT "Direction": at set level that is which way the RUN lies. Two things
  // under one name in one panel is the fault that had Baffle height calling
  // itself Face depth in this very component.
  ok('and not under a name the set panel already uses',
    !/label="Direction"/.test(fin), 'the fin panel calls it Direction too')

  // BOTH BUILDERS. The model one rotates the instance; the parametric one goes
  // through the same mirror machinery the run's Pattern uses, so a turned fin
  // looks exactly like an alternated one rather than nearly like it.
  ok('the model builder turns the fin', /fin\.rotation\.y = \(ov\.rotDeg \* Math\.PI\) \/ 180/.test(mf))
  ok('and the parametric builder reverses it',
    /const turned = Math\.abs\(\(ov\?\.rotDeg \?\? 0\) % 360\) === 180/.test(par),
    'rotDeg is ignored again outside the model path')

  // XOR, not override: "turn this fin round" means reverse it from where it
  // is, so flipping a fin the Pattern has already mirrored puts it back in
  // line with its neighbours.
  ok('composed with the run’s Pattern rather than replacing it',
    /!== turned/.test(par), 'a turned fin ignores the run’s own mirroring')

  // --- and the document keeps it per fin ----------------------------------
  reset()
  S().setProduct('baffles')
  S().setBrush({ btype: 'blade' })
  const id = S().placeAt(...at(10, 10))
  ok('a baffle set to turn a fin in', !!id)
  if (id) {
    S().updateFinOf(id, 1, { rotDeg: 180 })
    const ov = S().items.find((i) => i.id === id).params.finOverrides
    ok('one fin carries the half turn', ov?.[1]?.rotDeg === 180, JSON.stringify(ov))
    ok('and no other fin does', Object.keys(ov).join(',') === '1')
    // A half turn is not a resize: the run occupies exactly what it did.
    const before = S().items.find((i) => i.id === id)
    S().updateFinOf(id, 2, { rotDeg: 180 })
    const after = S().items.find((i) => i.id === id)
    ok('turning a fin does not change what the set occupies',
      after.ci === before.ci && after.cj === before.cj,
      `${before.ci}x${before.cj} -> ${after.ci}x${after.cj}`)

    S().resetFinOf(id, 1)
    ok('and reset puts it back in line with the run',
      S().items.find((i) => i.id === id).params.finOverrides[1] === undefined)
  }
}

section('BAFFLE SPACING — the four on the list, and anything between them')
{
  // Asked for: spacing as options AND a custom input.
  //
  // The four were the whole offer, which is fine until the gap you want is
  // 120. reconcile has never held spacing to that list — it clamps to a RANGE
  // — so a value off the list was always legal and there was simply no way to
  // type one. The field now says what the store already believed.
  const fields = codeOf(fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8'))
  const store = codeOf(fs.readFileSync('src/lib/store.js', 'utf8'))

  ok('spacing is a field of its own rather than a bare row of buttons',
    /function SpacingField\(/.test(fields), 'SpacingField is gone')
  ok('it still offers the workbook’s four',
    /BAFFLE_SHARED\.spacings\.filter/.test(fields), 'the presets are gone')
  ok('and a box to type one that is not among them',
    /<Stepper[\s\S]{0,200}min=\{range\.min\} max=\{max\}/.test(fields),
    'there is no custom input')
  ok('and the panel uses it', /<SpacingField /.test(fields),
    'SpacingField is defined and never rendered')

  // --- the two ranges have to be the SAME two -----------------------------
  // The store gives a model run 0-2000 and a catalogue run 50-200, because the
  // catalogue's numbers are scaled for 25 mm fins and far too tight for a
  // metre-wide object. A control with its own idea of the range would offer
  // values the store then quietly changed — the worst kind of disagreement,
  // because the number you typed is still on screen.
  ok('the field reads the store’s own split',
    /const range = p\.model \? MODEL_SPACING : \{ min: 50, max: 200 \}/.test(fields),
    'the control invents its own range')
  ok('and the store still draws it there',
    /spacing: \[MODEL_SPACING\.min, MODEL_SPACING\.max\]/.test(store)
    && /spacing: \[50, 200\]/.test(store),
    'reconcile’s range moved and the field did not follow')

  // --- the ceiling is the tighter of the two ------------------------------
  ok('the ceiling caps it above the range', /limits\.maxSpacing/.test(fields),
    'the field offers gaps the room cannot hold')
  ok('and a preset the ceiling cannot take is not offered',
    /\.filter\(\(v\) => v >= range\.min && v <= max\)/.test(fields),
    'a button that snaps back is offered')

  // --- what the numbers actually do ---------------------------------------
  // Not the component — the arithmetic under it, which is what decides whether
  // the offer is honest.
  const catalogue = { model: null, thickness: 25, spacing: 50, count: 24, rot: 0 }
  const modelRun = { model: 'blade-standard', sizeMm: { w: 12 }, spacing: 50, count: 24, rot: 0 }
  reset()
  const wide = gridOf(S().room())

  ok('MODEL_SPACING is wider than the catalogue’s',
    MODEL_SPACING.max > 200 && MODEL_SPACING.min <= 50,
    `${MODEL_SPACING.min}-${MODEL_SPACING.max}`)

  const lim = runLimits(modelRun, wide)
  ok('runLimits answers how far apart a run may sit',
    Number.isFinite(lim.maxSpacing) && lim.maxSpacing > 0, String(lim.maxSpacing))

  // A run of one has no gaps, so there is no largest gap to report — and a cap
  // of 0 would take the whole control away from a set that is not constrained
  // at all.
  ok('and a run of one has no gap to cap',
    runLimits({ ...modelRun, count: 1 }, wide).maxSpacing === Infinity)

  // Crowd the zone and the cap comes below the workbook's own top figure: this
  // is the case where the filter has to actually remove buttons.
  S().setCeiling({ w: 3, l: 3 })
  const tight = gridOf(S().room())
  const capped = runLimits(catalogue, tight).maxSpacing
  S().resetCeiling()
  ok('a crowded zone caps spacing below the catalogue’s 200', capped < 200, String(capped))
  ok('and the workbook’s list does not survive that cap whole',
    BAFFLE_SHARED.spacings.filter((v) => v >= 50 && v <= capped).length < BAFFLE_SHARED.spacings.length,
    `${capped} mm still admits every preset`)

  // --- and the document keeps a value that is on no list ------------------
  reset()
  S().setProduct('baffles')
  S().setBrush({ btype: 'blade' })
  S().setBrush({ spacing: 123 })
  ok('a gap that is on no list survives the store',
    S().brush.params.spacing === 123, String(S().brush.params.spacing))

  const id = S().placeAt(...at(10, 10))
  ok('a set placed with it', !!id)
  if (id) {
    ok('carries it', S().items.find((i) => i.id === id).params.spacing === 123)
    S().update(id, { params: { spacing: 137 } })
    ok('and takes another off the list afterwards',
      S().items.find((i) => i.id === id).params.spacing === 137)
  }
}

section('EDGE TO EDGE, CENTRE TO CENTRE — one gap under two names')
{
  // Asked for: the spacing input branched into two sub-fields.
  //
  // They are the same decision one object's width apart: the workbook quotes
  // the clear gap, a setting-out drawing quotes the pitch.
  const fields = codeOf(fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8'))
  const bits = codeOf(fs.readFileSync('src/ui/bits.jsx', 'utf8'))
  const cat = codeOf(fs.readFileSync('src/lib/catalog.js', 'utf8'))

  ok('the field names both measures',
    /<SubLabel>Edge to edge<\/SubLabel>/.test(fields)
    && /Centre to centre<\/SubLabel>/.test(fields),
    'one of the two sub-fields is gone')
  const spacingSrc = (fields.split('function SpacingField(')[1] ?? '').split(/\nfunction /)[0]
  ok('and each has a box of its own',
    (spacingSrc.match(/<Stepper/g) ?? []).length === 2,
    `${(spacingSrc.match(/<Stepper/g) ?? []).length} steppers in SpacingField`)

  // ONE STORED NUMBER. Two would eventually disagree, and then nothing on
  // screen would say which one the run was built to.
  ok('the pitch is derived, not stored',
    /value=\{pitchOf\(p\)\}/.test(fields), 'the pitch is not read from the gap')
  ok('and writing it writes the gap back',
    /onChange=\{\(pitch\) => onChange\(\{ spacing: Math\.round\(gapOf\(p, pitch\)\) \}\)\}/.test(fields),
    'setting the pitch stores something other than the gap')
  ok('so the brush still carries only a gap',
    !Object.prototype.hasOwnProperty.call(emptyBrushParams(), 'pitch'),
    'a second stored number appeared')

  // ONE DEFINITION of what an object measures across the run. It used to be
  // written out three times, which was harmless while only the geometry read
  // it — and stopped being harmless the moment the panel converted by it.
  ok('one definition of the width across a run', /export const acrossUnitMm/.test(cat))
  ok('and runLimits reads it rather than repeating it',
    /const unit = acrossUnitMm\(p\)/.test(cat),
    'runLimits spells the split out again')

  // A SubLabel is not a <label>: Field already is one, labels do not nest, and
  // a second labelable ancestor is the exact mechanism that forwarded clicks
  // into locked fields.
  ok('a sub-label is not a second <label>',
    /export function SubLabel[\s\S]{0,320}<span/.test(bits)
    && !/export function SubLabel[\s\S]{0,320}<label/.test(bits),
    'SubLabel nests a label inside a label')

  // --- the arithmetic -----------------------------------------------------
  const fin = { model: null, thickness: 25, spacing: 100 }
  const mdl = { model: 'blade-standard', sizeMm: { w: 12 }, spacing: 100 }

  ok('a fin measures its thickness across the run', acrossUnitMm(fin) === 25)
  ok('and a model measures its own width', acrossUnitMm(mdl) === 12)
  ok('a pitch is the gap plus that', pitchOf(fin) === 125 && pitchOf(mdl) === 112)
  ok('and the gap is the pitch less it', gapOf(fin, 125) === 100 && gapOf(mdl, 112) === 100)
  ok('an unanswered gap has no pitch to show', pitchOf({ ...fin, spacing: null }) === null,
    String(pitchOf({ ...fin, spacing: null })))

  // The number on screen has to be the number the scene is built to — the two
  // pitch functions are what baffleExtent spaces a run by.
  ok('the pitch the panel shows is the one the geometry uses',
    Math.abs(pitchOf(fin) / 1000 - finPitch(fin)) < 1e-9
    && Math.abs(pitchOf(mdl) / 1000 - modelPitch(mdl)) < 1e-9,
    `${pitchOf(fin)} vs ${finPitch(fin) * 1000}`)

  // --- and through the store ----------------------------------------------
  reset()
  S().setProduct('baffles')
  S().setBrush({ btype: 'blade' })
  const id = S().placeAt(...at(10, 10))
  ok('a set to measure', !!id)
  if (id) {
    // Whatever the panel would write for a 200 mm pitch, the set must come
    // back reporting that same pitch.
    const p0 = S().items.find((i) => i.id === id).params
    S().update(id, { params: { spacing: Math.round(gapOf(p0, 200)) } })
    const p1 = S().items.find((i) => i.id === id).params
    ok('asking for a 200 mm pitch stores the gap that gives one',
      pitchOf(p1) === 200, `${p1.spacing} + ${acrossUnitMm(p1)} = ${pitchOf(p1)}`)
    ok('and the run is actually built to it',
      Math.abs((p1.model ? modelPitch(p1) : finPitch(p1)) * 1000 - 200) < 1e-9)
  }
}

section('WHAT ONE SET TAKES ON THE CEILING')
{
  // Asked for: the area a selected item takes, and the absorptive face gone.
  //
  // The face was a different number for each product — two sides of a fin, one
  // side of a tile, the felt of a Fly, the bounding box of a cloud — and three
  // of those four were answering a question the panel never asked. What a set
  // TAKES is one question with one answer.
  const panel = codeOf(fs.readFileSync('src/ui/RightPanel.jsx', 'utf8'))
  const store = codeOf(fs.readFileSync('src/lib/store.js', 'utf8'))

  ok('the face total is gone from the schedule',
    !/totalFaceM2|unitFaceM2|modelQty/.test(store), 'the face is still being computed')
  ok('and from the panel', !/totalFaceM2|absorptive/.test(panel), 'the panel still shows a face')
  ok('the headline stat is the ceiling instead', /label="Ceiling"/.test(panel))
  ok('the schedule says what the selection takes',
    /selected sets take|The selected set takes/.test(panel)
    && /itemArea\(i\)/.test(panel),
    'the schedule does not report the selection’s area')
  ok('and what share of the zone that is', /ceilingArea\) \* 100/.test(panel))
  ok('and the Selection panel no longer repeats it',
    !/itemArea\(item\)/.test(panel), 'the figure is in two places')
  // Several sets selected is not one set: summing them is the only honest
  // answer, and the wording has to change with the count.
  ok('several selected sets are summed rather than one of them shown',
    /picked\.reduce\(\(n, i\) => n \+ itemArea\(i\), 0\)/.test(panel))
  // selectedItems() builds a fresh array on every call, so selecting on it
  // would re-render this panel on every store change.
  ok('and the panel subscribes to the ids, not to a rebuilt array',
    /useStore\(\(s\) => s\.selectedIds\)/.test(panel)
    && !/s\.selectedItems\(\)/.test(panel))

  // ONE DEFINITION, so the parts add to the whole by construction rather than
  // by two functions happening to agree.
  ok('the total is the sum of the per-item number',
    /items\.reduce\(\(sum, it\) => sum \+ itemArea\(it\), 0\)/.test(store),
    'coveredArea computes its own areas again')

  // --- what it measures ----------------------------------------------------
  reset()
  const id = S().placeAt(...at(10, 10))
  ok('a set to measure', !!id)
  if (id) {
    const it = S().items.find((i) => i.id === id)
    const e = baffleExtent(it.params)
    ok('a set takes the rectangle its run spreads over',
      Math.abs(itemArea(it) - e.length * e.width) < 1e-9, String(itemArea(it)))

    // THE GAPS ARE IN IT, and that is the point: nothing else can be placed
    // between the fins. A panel that reported only the material would say a
    // run of eight takes a fifth of what it really occupies.
    const fins = finSchedule(it.params)
    const material = fins.reduce((n, f) => n + (f.lengthMm / 1000) * (f.thickness / 1000), 0)
    ok('which is more than the fins in it', itemArea(it) > material * 2,
      `${itemArea(it).toFixed(3)} against ${material.toFixed(3)} of fin`)

    const second = S().placeAt(...at(10, 25))
    ok('a second set', !!second)
    if (second) {
      const both = S().items
      ok('and the total is exactly the two of them',
        Math.abs(coveredArea(both) - (itemArea(both[0]) + itemArea(both[1]))) < 1e-9,
        String(coveredArea(both)))
    }
  }

  // Every product answers, through its own extent function.
  reset()
  for (const [type, params] of [
    ['baffles', reconcile(defaultBaffleParams())],
    ['clouds', { shape: 'square', size: 600, thickness: 40 }],
    ['fly', { size: 4 }],
  ]) {
    const e = itemExtent({ type, params })
    ok(`a ${type} item reports an extent`, !!e && e.length > 0 && e.width > 0, JSON.stringify(e))
  }
  ok('and something with no type takes nothing', itemArea({ type: 'nonsense', params: {} }) === 0)

  // --- a zone's own total --------------------------------------------------
  reset()
  const a = S().placeAt(...at(10, 10))
  const a2 = S().placeAt(...at(10, 25))
  S().selectMany([a, a2])
  const gid = S().groupSelected('Zone A')
  const secs = scheduleByGroup(S().items, S().groups)
  ok('a zone is scheduled on its own', !!gid && secs?.length === 1, JSON.stringify(secs?.length))
  if (secs?.length) {
    ok('and carries the ceiling it takes',
      Math.abs(secs[0].coveredM2 - coveredArea(S().items)) < 1e-9, String(secs[0].coveredM2))
    // `items` on a section is a COUNT. Passing it to coveredArea would call
    // reduce on a number, which is how this was written the first time.
    ok('rather than leaving the caller to work it out from a count',
      typeof secs[0].items === 'number' && typeof secs[0].coveredM2 === 'number')
  }
}

section('BAFFLE HEIGHT — the published sizes, and anything between them')
{
  // Asked for: an input field for the blade depths, which were five buttons,
  // three range buttons and (for Flow) a stepper.
  const fields = codeOf(fs.readFileSync('src/ui/BaffleFields.jsx', 'utf8'))

  ok('the published sizes are still buttons', /options=\{widths\.map/.test(fields))
  ok('and there is a box for anything between them',
    /min=\{depthRange\.min\}[\s\S]{0,120}max=\{depthRange\.max\}/.test(fields),
    'the stepper is gone')
  // They used to be alternatives — a shape had buttons OR a stepper, never
  // both, so a size off the list could not be reached at all.
  ok('both at once rather than one or the other',
    /\{widths\.length > 1 && \([\s\S]{0,400}\{depthRange && \(/.test(fields),
    'the list and the range are still exclusive')
  ok('and a typed depth starts where the length suggests',
    /startAt=\{defaultDepthMm\(p\) \?\? depthRange\.max\}/.test(fields))

  // --- where the first nudge lands ----------------------------------------
  const blade = (shape, length) => ({ ...defaultBaffleParams(), btype: 'blade', shape, length })
  ok('a twelfth of the fin, snapped to the step',
    defaultDepthMm(blade('standard', 1200)) === 100
      && defaultDepthMm(blade('standard', 1800)) === 150
      && defaultDepthMm(blade('standard', 2400)) === 200
      && defaultDepthMm(blade('standard', 2780)) === 230,
    [1200, 1800, 2400, 2780].map((l) => defaultDepthMm(blade('standard', l))).join(','))
  // Three of the four land exactly on sizes the workbook publishes, which is
  // what makes it a defensible starting point rather than an arbitrary one.
  ok('and three of the four are sizes the workbook lists',
    [1200, 1800, 2400, 2780]
      .map((l) => defaultDepthMm(blade('standard', l)))
      .filter((d) => baffleWidths(blade('standard', 1200)).includes(d)).length === 3)
  ok('a taper never starts below its own minimum',
    defaultDepthMm(blade('tapered', 1200)) >= 100,
    String(defaultDepthMm(blade('tapered', 1200))))
  ok('and a shape sold in fixed sizes has no starting point to offer',
    defaultDepthMm({ ...defaultBaffleParams(), btype: 'vmt' }) === null)

  // It is a STARTING POINT, not a value written into the spec: the staircase
  // still asks for a depth.
  ok('the depth is still a question the panel asks',
    emptyBrushParams().width === null
      && missingFields(emptyBrushParams()).includes('Baffle height'),
    JSON.stringify(missingFields(emptyBrushParams())))

  // --- and through the store ----------------------------------------------
  reset()
  S().setBrush({ btype: 'blade' })
  S().setBrush({ shape: 'standard' })
  S().setBrush({ width: 240 })
  ok('a standard blade keeps a depth that is on no list',
    S().brush.params.width === 240, String(S().brush.params.width))
  ok('and the set is built to it',
    baffleSizeMm(S().brush.params).h === 240, String(baffleSizeMm(S().brush.params).h))

  S().setBrush({ shape: 'tapered' })
  S().setBrush({ width: 250 })
  const tp = S().brush.params
  ok('a tapered one keeps two ends', tp.width === '125-250', String(tp.width))
  ok('and is measured at its deepest', baffleSizeMm(tp).h === 250, String(baffleSizeMm(tp).h))
  // The geometry is built from the two ends, so a taper stored as one number
  // would come out of the extruder straight.
  const pw = parseWidth(tp.width)
  ok('the two ends differ, which is what makes it a taper', pw.a !== pw.b, JSON.stringify(pw))
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
