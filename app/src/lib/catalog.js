// Product catalogue — encodes config-data.xlsx (sheets: Baffles, Ceiling tiles,
// Clouds, Statement Solution).
//
// This is AUTHORED data, not measured data: thicknesses, widths, lengths,
// colour codes and perforation patterns are commercial facts that cannot be
// read off a model file. It stays hand-written here and is the one place the
// workbook is transcribed.
//
// Measured data — room ceiling planes, model dimensions, mesh counts — comes
// from public/models/manifest.json instead. See lib/rooms.js and lib/models.js.
//
// All dimensions are in millimetres as the workbook specifies; builders convert
// to metres at the boundary.

import { spanCells } from './grid.js'

export const MM = 0.001

/**
 * The finish the fin clamps are drawn in.
 *
 * The supplier files disagree with each other about this and there is no
 * reading of them under which that is deliberate: the clamps on Blade Standard
 * and Blade Tapered are #c6c6c6, a light grey, while Baffle Curve's hardware is
 * #101010. The clamps are one part in one finish, so they are given one here.
 *
 * Data rather than a literal in the renderer, because offering the suspension
 * in white or grey later should be a change to this object and not a hunt
 * through the model builder. Only the CLAMPS take it — the hanger rods keep the
 * file's own colour, so the wire still reads as steel.
 *
 * Not pure black: a flat black part loses its edges under this lighting and
 * reads as a silhouette rather than as a shape.
 */
export const CLAMP_FINISH = {
  label: 'Matte black',
  hex: '#1a1a1a',
  roughness: 0.9,
  metalness: 0,
}

/**
 * The length a new baffle opens at, in millimetres — parametric sets and
 * imported models alike.
 *
 * Not read from BAFFLE_TYPES.defaults, which transcribes the workbook — this is
 * an app choice. The workbook publishes 1200/1800/2400/2780 mm, so "about two
 * metres" is 1800; there is no 2000 mm product to pick.
 */
/**
 * The finish every part of a cloud that is NOT the panel is drawn in: the
 * suspension wire, the backing disc behind the circle and square panels, and
 * the ceiling fixture at the top of the triangle's cable.
 *
 * The four cloud files disagree about this and there is no reading of them under
 * which that is deliberate: circle and square hang on #808080, triangle on
 * #b8b8b8, and the hexagon on #99ff32 - a bright green, SHARED with its panel,
 * so the whole cloud came out green whatever colour was chosen for it.
 *
 * One part in one finish, so it is given one here. #808080 because it is what
 * two of the four already use; the other two are brought to match. On circle
 * and square the file already puts the wire and the disc on the same material
 * object, so treating them as one finish is what those files say, not a guess.
 *
 * Data rather than a literal in the renderer, for the same reason CLAMP_FINISH
 * is: offering it in white or black later should be a change to this object and
 * not a hunt through a loader.
 */
export const CLOUD_HARDWARE_FINISH = {
  label: 'Steel',
  hex: '#808080',
  roughness: 0.5,
  metalness: 0.3,
}

/**
 * The back of a ceiling tile: the board, not the finish.
 *
 * A lay-in tile is finished on ONE side. The veneer and the perforation are the
 * face the room sees; above it is the raw board, and on a perforated tile the
 * holes go right through onto acoustic fleece — so what is over the ceiling is
 * never the pattern, and never the wood.
 *
 * The supplied panels are solid boxes with one material on all six faces, so
 * without this the finish is painted on the top and the edges too. The edges
 * take it as well, deliberately: the sliver visible in a tee reveal is the board
 * edge, not the veneer.
 *
 * An authored placeholder, like the cloud colours — a plain warm board rather
 * than a value from the workbook, which does not publish one.
 */
export const TILE_BACK_FINISH = {
  label: 'Board',
  hex: '#cfc7b6',
  roughness: 0.95,
  metalness: 0,
}

export const OPENING_LENGTH = 1800

// ---------------------------------------------------------------------------
// colour families
// ---------------------------------------------------------------------------

export const COLOUR_FAMILIES = {
  'wood-classic': {
    label: 'Wood Classic',
    kind: 'wood',
    // Real veneer sheet photos live in public/textures/baffles/wood-classic (1220 x 2800
    // mm per sheet); fins are cut as vertical strips along the grain. More codes
    // are added by dropping a file + manifest entry there. base/grain are only
    // offline fallbacks for when the photo has not loaded.
    swatches: [
      { code: 'WD-NC-05', file: 'WD-NC-05.jpg', base: '#c08a5e', grain: '#9c6b45' },
      { code: 'WD-NC-13', file: 'WD-NC-13.jpg', base: '#a97b3f', grain: '#7d5a2c' },
      { code: 'WD-NC-15', file: 'WD-NC-15.jpg', base: '#6f4a2f', grain: '#452c1c' },
    ],
  },
  'designer-textiles': {
    label: 'Designer Textiles',
    // PHOTOGRAPHED, not a flat colour — the same kind of thing Wood Classic is,
    // and cut from a sheet the same way. It used to be eight invented hexes;
    // the real range is 275 panels, five fabrics crossed with 55 shades, and
    // they are filled in from the CDN map by lib/textiles.js.
    kind: 'textile',
    sheet: true,
    userFabrics: true, // fabrics the user uploads appear alongside these
    swatches: [],
  },
  concrete: {
    label: 'Concrete',
    kind: 'concrete',
    swatches: [
      { code: 'ST-NC-31', hex: '#b5b1aa' },
      { code: 'ST-NC-32', hex: '#8b8781' },
    ],
  },
  'signature-ombre': {
    label: 'Signature Ombre',
    kind: 'ombre',
    swatches: [
      { code: 'OM-01', from: '#c65a33', to: '#cdbd9f' },
      { code: 'OM-02', from: '#41586e', to: '#7fa8c9' },
      { code: 'OM-03', from: '#3f5d50', to: '#7d8c5c' },
      { code: 'OM-04', from: '#7d3040', to: '#d8a29a' },
      { code: 'OM-05', from: '#383d42', to: '#aeb6bc' },
      { code: 'OM-06', from: '#c8a13a', to: '#e9e4d9' },
    ],
  },
  'cloud-solid': {
    label: 'Solid Colours',
    kind: 'felt',
    // Placeholders for testing the cloud range, not transcribed from the
    // workbook — four plain hexes to see a shape against. Replace the values
    // here when the real range arrives; nothing else needs to change.
    swatches: [
      { code: 'Red', hex: '#c0392b' },
      { code: 'Blue', hex: '#2266aa' },
      { code: 'Green', hex: '#3f8f4f' },
      { code: 'Yellow', hex: '#e2b53c' },
    ],
  },
  'cloud-series': {
    label: 'Cloud Series',
    // PRINTED, not dyed — the same kind of thing Wood Classic and Designer
    // Textiles are, and unlike either of those it is a picture of ONE PANEL
    // rather than a sheet something is cut from. A design is drawn to the
    // shape, covers the face once and scales with the panel.
    kind: 'print',
    // Two questions, not one: a design (CL-01 ... CL-05) and then a colour. So
    // the swatch code carries both, and lib/cloudSeries owns the crossing.
    series: true,
    // Filled from the artwork manifest by applyCloudSeriesSwatches(), the way
    // Designer Textiles and Colour Core Ombre are filled from theirs. Empty
    // here on purpose: the set is 64 files on disk and a list copied by hand
    // would be a second place for CL-02 to have to be remembered.
    swatches: [],
  },
  'pet-solid': {
    label: 'Solid Coloured PET',
    kind: 'felt',
    // The range as it is actually named. The code IS the name here, the way it
    // already is for Cloud Colours and Uni Vic Strip: a schedule line reading
    // "Arabian Spice" is one somebody can order from, where a placeholder
    // number is not. Listed in the order the range lists them.
    swatches: [
      { code: 'Alloy', hex: '#767a82' },
      { code: 'Apricot', hex: '#e9ccc5' },
      { code: 'Arabian Spice', hex: '#9e5239' },
      { code: 'Artic Ice', hex: '#84b4d1' },
      { code: 'Birch', hex: '#95948d' },
      // Black and White are the plain values; if the range means an off-black
      // or a warm white, they are two hexes away from being right.
      { code: 'Black', hex: '#000000' },
      { code: 'Blue Fog', hex: '#9bb4c2' },
      { code: 'Concrete Gray', hex: '#909ea8' },
      { code: 'Coral Haze', hex: '#b87857' },
      { code: 'Cosmic Sky', hex: '#92b7d9' },
      { code: 'Dark Grey', hex: '#5b5b5b' },
      { code: 'Dune', hex: '#96795e' },
      { code: 'Emerald', hex: '#008586' },
      { code: 'Fog', hex: '#d3d3d3' },
      { code: 'Frost', hex: '#b5b1af' },
      { code: 'Glacier', hex: '#b6b5b8' },
      { code: 'Gleam', hex: '#afb990' },
      { code: 'Graphite', hex: '#5b5f64' },
      { code: 'Jalapeno', hex: '#587a54' },
      { code: 'Latte', hex: '#b16f3a' },
      { code: 'Maple', hex: '#bf6d4f' },
      { code: 'Marigold', hex: '#f09828' },
      { code: 'Marmalade', hex: '#b24f31' },
      { code: 'Mirage', hex: '#8e9d98' },
      { code: 'Mulberry', hex: '#462458' },
      { code: 'Mushroom', hex: '#aeadaf' },
      { code: 'Oat', hex: '#ecded3' },
      { code: 'Old Gold', hex: '#e4a61c' },
      { code: 'Olive', hex: '#abb86b' },
      { code: 'Pearl', hex: '#c6b4a4' },
      { code: 'Plum', hex: '#7a253b' },
      { code: 'Pomegranate', hex: '#983d45' },
      { code: 'Prussian Blue', hex: '#1c4b8d' },
      { code: 'Sand', hex: '#c6ab9a' },
      { code: 'Shadow', hex: '#6e8890' },
      { code: 'Smoke Blue', hex: '#6e7f92' },
      { code: 'Smoky Green', hex: '#a5d1c3' },
      { code: 'StarGaze', hex: '#36516d' },
      { code: 'Steel', hex: '#afaeae' },
      { code: 'Straw', hex: '#f9d698' },
      { code: 'Taupe', hex: '#a29083' },
      { code: 'Tornado', hex: '#7b7e84' },
      { code: 'White', hex: '#ffffff' },
      { code: 'Teal', hex: '#528388' },
    ],
  },
  'colour-core-fabric': {
    label: 'Colour Core Fabric',
    kind: 'colour-core',
    // Empty until the panel map is read — 19 colours x 3 weave structures, each
    // a photographed panel on CloudFront. Filled by applyColourCoreSwatches()
    // the way ROOMS and MODELS are filled from their manifests, because these
    // are published assets rather than authored catalogue facts.
    swatches: [],
  },
  'colour-core-ombre': {
    label: 'Colour Core Ombre',
    // its own kind, not plain 'ombre': the authored ombré families are drawn as
    // a gradient between two colours, while this one is a photographed panel
    // that happens to BE a gradient. Same picture, different source, and the
    // material builder has to tell them apart to know whether to fetch.
    kind: 'colour-core-ombre',
    // 10 base colours, 106 overlays. Filled by applyOmbreSwatches() from the
    // published panel map, the way the fabric range is — these are assets, not
    // authored catalogue facts.
    swatches: [],
  },
  'vmt-solid': {
    label: 'Solid Colour VMT',
    kind: 'felt',
    swatches: [
      { code: 'VMT-01', hex: '#e9e4d9' }, { code: 'VMT-02', hex: '#aeb6bc' },
      { code: 'VMT-03', hex: '#5b6770' }, { code: 'VMT-04', hex: '#41586e' },
      { code: 'VMT-05', hex: '#c65a33' }, { code: 'VMT-06', hex: '#7d8c5c' },
      { code: 'VMT-07', hex: '#c8a13a' }, { code: 'VMT-08', hex: '#383d42' },
    ],
  },
  'cloud-colours': {
    label: 'Cloud Colours',
    kind: 'felt',
    swatches: [
      { code: 'Red', hex: '#b5453a' }, { code: 'Blue', hex: '#41586e' },
      { code: 'Green', hex: '#5d7a5a' }, { code: 'Yellow', hex: '#c8a13a' },
    ],
  },
}

/** Uni Vic Strip finishes — strip colour on a black or glacier-grey base. */
export const VIC_STRIP = {
  bases: [
    { code: 'black', label: 'Black', hex: '#23211f' },
    { code: 'grey', label: 'Grey (Glaciar)', hex: '#b7b5ae' },
  ],
  strips: [
    { code: 'Glaciar White', hex: '#e8e6e1', bases: ['black', 'grey'] },
    { code: 'Lunar Ash', hex: '#b0aca3', bases: ['black'] },
    { code: 'Merlot', hex: '#6e2f36', bases: ['black'] },
    { code: 'Sage Green', hex: '#8a9a84', bases: ['black'] },
    { code: 'Carbon Black', hex: '#2b2b2b', bases: ['black'] },
    { code: 'Solara', hex: '#c98f4e', bases: ['black'] },
    { code: 'Alpine Frost', hex: '#dfe4e6', bases: ['black'] },
    { code: 'Amber Walnut', hex: '#8a5a33', bases: ['black'] },
    { code: 'Auburn Oak', hex: '#9c6b45', bases: ['black', 'grey'] },
    { code: 'Burbon Walnut', hex: '#6f4a2f', bases: ['black'] },
    { code: 'Monarch Oak', hex: '#b0824f', bases: ['black'] },
    { code: 'Obsidion Black', hex: '#1e1e1e', bases: ['black'] },
    { code: 'Sierra Elm', hex: '#a58464', bases: ['black'] },
    { code: 'Silver Birch', hex: '#cfc5b4', bases: ['black', 'grey'] },
    { code: 'Toffee Oak', hex: '#b3854f', bases: ['black'] },
    { code: 'Windsor Oak', hex: '#8f6a44', bases: ['black', 'grey'] },
  ],
}

/**
 * Perforation patterns (PF-NC codes) — placeholder hole layouts until the real
 * drawings arrive. Applied over a Wood Classic base colour.
 */
export const PF_PATTERNS = [
  { code: 'PF-NC-07', style: 'rounds', step: 42, r: 7 },
  { code: 'PF-NC-08', style: 'rounds', step: 30, r: 5 },
  { code: 'PF-NC-10', style: 'micro', step: 16, r: 2.2 },
  { code: 'PF-NC-11', style: 'micro', step: 12, r: 1.8 },
  { code: 'PF-NC-12', style: 'slots', step: 34 },
  { code: 'PF-NC-20', style: 'slots', step: 24 },
  { code: 'PF-NC-21', style: 'diagonal', step: 38, r: 6 },
  { code: 'PF-NC-25', style: 'cluster', step: 64, r: 4 },
  { code: 'PF-NC-26', style: 'rings', step: 72, r: 5 },
  { code: 'PF-NC-29', style: 'gradient', step: 36, r: 6 },
]

// ---------------------------------------------------------------------------
// baffles
// ---------------------------------------------------------------------------

export const BAFFLE_TYPES = {
  vmt: {
    label: 'VMT Baffles (all sides VMT)',
    thicknesses: [25, 50, 80],
    widthsByThickness: { 25: [100, 150, 200], 50: [150, 200, 250], 80: [200, 250, 300] },
    lengths: [1200, 1800, 2400, 2780],
    families: ['wood-classic', 'designer-textiles', 'concrete', 'signature-ombre'],
    defaults: { thickness: 25, width: 150, length: 2400, family: 'wood-classic', colour: 'WD-NC-13' },
  },
  blade: {
    label: 'Blade',
    shapes: {
      // THE LIST IS SHORTCUTS, NOT THE RANGE. Every blade shape is made
      // between 75 and 300 mm deep — Flow says so in its own entry and is the
      // same product on the same tooling — so the published sizes are the ones
      // worth a button, not the only ones that exist.
      standard: {
        label: 'Standard',
        widths: [75, 100, 150, 175, 200],
        depthRange: { min: 75, max: 300, step: 5 },
      },
      // A TAPER KEEPS TWO ENDS. A typed figure is the DEEPEST point, and the
      // shallow end follows at half of it — which reproduces 100-200 and
      // 150-300 exactly, two of the three profiles the workbook publishes.
      // Storing the one number instead would make parseWidth answer the same
      // depth at both ends and the extruded profile would come out straight,
      // so a Tapered blade would stop tapering.
      tapered: {
        label: 'Tapered',
        widths: ['100-200', '125-225', '150-300'],
        depthRange: { min: 100, max: 300, step: 5, taper: 0.5 },
      },
      // Flow is sold as one range rather than a list of depths, so there is
      // nothing to pick from and the panel used to show a sentence where every
      // other shape has buttons — which read as the option being missing. It
      // gets a stepper over the range instead: see depthRangeOf.
      flow: { label: 'Flow', widths: ['75-300'], depthRange: { min: 75, max: 300, step: 5 } },
    },
    thicknesses: [12, 25],
    lengths: [1200, 1800, 2400, 2780],
    families: ['pet-solid', 'colour-core-fabric', 'colour-core-ombre'],
    defaults: { shape: 'standard', thickness: 25, width: 150, length: 2400, family: 'pet-solid', colour: 'StarGaze' },
  },
  box: {
    label: 'Box',
    thicknesses: [50],
    widths: [75, 100, 150, 175, 200],
    lengths: [1200, 1800, 2400, 2780],
    families: ['pet-solid', 'colour-core-fabric', 'colour-core-ombre'],
    defaults: { thickness: 50, width: 150, length: 2400, family: 'pet-solid', colour: 'Graphite' },
  },
  embossed: {
    label: 'Embossed',
    thicknesses: [40],
    lengths: [1200, 1500],
    widths: [200, 300],
    families: ['vmt-solid', 'designer-textiles'],
    layouts: [1, 2, 3, 4, 5],
    defaults: { thickness: 40, width: 200, length: 1200, family: 'vmt-solid', colour: 'VMT-04' },
  },
}

export const BAFFLE_SHARED = {
  spacings: [50, 100, 150, 200], // edge-to-edge, mm
  directions: [
    { value: 'vertical', label: 'Vertical' },
    { value: 'horizontal', label: 'Horizontal' },
  ],
  mirrors: [
    { value: 'straight', label: 'All straight' },
    { value: 'alternate', label: 'Alternate mirrored' },
  ],
  counts: { min: 2, max: 24 },
  drop: { min: 0.05, max: 1.2 },
  wallClearance: 25, // mm — minimum clearance to walls and neighbours, per spec
}

// ---------------------------------------------------------------------------
// ceiling tiles  (data only in this pass — the tile builder lands next)
// ---------------------------------------------------------------------------

export const TILE_TYPES = {
  heritage: {
    label: 'Heritage Tiles',
    thicknesses: [12, 25, 40],
    sizes: ['600x600'],
    patterns: [{ code: 'HT-A' }, { code: 'HT-B' }, { code: 'HT-C' }, { code: 'HT-D' }],
    defaults: { thickness: 25, size: '600x600', pattern: 'HT-A' },
  },
  'embossed-tile': {
    label: 'Embossed Tiles',
    thicknesses: [40],
    sizes: ['600x600', '600x1200'],
    patterns: [{ code: 'EM-A' }, { code: 'EM-B' }, { code: 'EM-C' }],
    defaults: { thickness: 40, size: '600x600', pattern: 'EM-A' },
  },
  'wood-classic-tile': {
    label: 'Wood Classic',
    thicknesses: [12, 25, 40],
    sizes: ['600x600', '600x1200'],
    patterns: COLOUR_FAMILIES['wood-classic'].swatches.map((s) => ({ code: s.code })),
    defaults: { thickness: 25, size: '600x600', pattern: 'WD-NC-13' },
  },
  rattan: {
    label: 'Rattan',
    thicknesses: [12, 25, 40],
    sizes: ['600x600', '600x1200'],
    patterns: [{ code: 'RT-Natural' }, { code: 'RT-Dark' }],
    defaults: { thickness: 25, size: '600x600', pattern: 'RT-Natural' },
  },
  'vic-strip': {
    label: 'Uni Vic Strip',
    thicknesses: [12, 25],
    sizes: ['600x600'],
    variations: [
      { value: 'single', label: 'Vic Strip Single' },
      { value: 'double', label: 'Vic Strip Double' },
    ],
    defaults: { thickness: 25, size: '600x600', base: 'black', pattern: 'Windsor Oak', variation: 'single' },
  },
  perforation: {
    label: 'Perforation',
    thicknesses: [12, 25, 40],
    sizes: ['600x600', '600x1200'],
    baseColours: COLOUR_FAMILIES['wood-classic'].swatches.map((s) => s.code),
    patterns: PF_PATTERNS.map((p) => ({ code: p.code })),
    defaults: { thickness: 25, size: '600x600', base: 'WD-NC-13', pattern: 'PF-NC-07' },
  },
}

export const TILE_SHARED = {
  grids: [
    { value: '15', label: '15 mm' },
    { value: '24', label: '24 mm' },
    { value: '15sil', label: '15 mm silhouette' },
  ],
  gridColours: [
    { value: 'black', label: 'Black', hex: '#26262a' },
    { value: 'white', label: 'White', hex: '#f2f3f4' },
  ],
  rotations: [0, 90],
  layouts: [
    { value: 'straight', label: 'Straight' },
    { value: 'alternating', label: 'Alternating' },
    { value: 'custom', label: 'Custom (per-tile edits)' },
  ],
}

// ---------------------------------------------------------------------------
// clouds  (data only in this pass — the cloud builder lands next)
// ---------------------------------------------------------------------------

export const CLOUD_SHAPES = {
  square: { label: 'Square', sizes: [600, 900, 1200] },
  circle: { label: 'Circle', sizes: [600, 900, 1200] },
  hexagon: { label: 'Hexagon', sizes: [600, 900, 1200] },
  triangle: { label: 'Triangle', sizes: [900, 1200] },
}

export const CLOUD_SHARED = {
  thickness: 40,
  edges: [
    { value: 'embossed', label: 'Embossed cloud edge' },
    { value: 'vmt', label: '40 mm VMT edge' },
  ],
  patterns: [
    { value: 'series-1', label: 'Series 1' },
    { value: 'series-2', label: 'Series 2' },
    { value: 'series-3', label: 'Series 3' },
    { value: 'series-4', label: 'Series 4' },
    { value: 'series-5', label: 'Series 5' },
    { value: 'designer', label: 'Designer Textiles' },
  ],
  rotations: [0, 45, 90, 135, 180, 225, 270],
  layouts: [1, 2, 3, 4, 5, 6],
}

// ---------------------------------------------------------------------------
// product types
// ---------------------------------------------------------------------------

/**
 * `rotStep` is how far one press of Rotate turns a set, in degrees.
 *
 * A quarter turn everywhere except clouds, and the reason is what the product
 * is rather than a preference. A ceiling tile is a lay-in module sitting in a
 * suspended grid, so it has four orientations and no others. A baffle set is a
 * RUN, and `runLimits` measures the room across the axis the run spreads along
 * — at 45 degrees that is the diagonal, which is not a number this asks for
 * anywhere yet. A cloud is a single free-hanging panel that touches nothing, so
 * any angle is buildable and 45 is the one worth having.
 */
export const PRODUCT_TYPES = {
  baffles: { id: 'baffles', label: 'Baffles', hint: 'VMT · Blade · Box · Embossed', rotStep: 90 },
  tiles: { id: 'tiles', label: 'Ceiling Tiles', hint: 'Wood Classic · perforated', rotStep: 90 },
  clouds: { id: 'clouds', label: 'Clouds', hint: 'Square · Circle · Hexagon · Triangle', rotStep: 45 },
  // Quarter turns, not eighths: a Fly is a rectangle — 1099 x 1166 or
  // 1099 x 2366 — so 45 degrees would leave it sitting across a grid it
  // cannot be set out on. A cloud turns in eighths because it is round,
  // hexagonal or square about its own centre.
  fly: { id: 'fly', label: 'Fly', hint: 'Fly 4 · Fly 8', rotStep: 90 },
  statement: { id: 'statement', label: 'Statement Solution (Horizon)', hint: 'Coming soon', comingSoon: true, rotStep: 90 },
}

/** How far one press of Rotate turns a set of this type. */
export const rotStepFor = (type) => PRODUCT_TYPES[type]?.rotStep ?? 90

// ---------------------------------------------------------------------------
// lookups
// ---------------------------------------------------------------------------

export const getFamily = (key) => COLOUR_FAMILIES[key] ?? null

export function getSwatch(familyKey, code) {
  const fam = COLOUR_FAMILIES[familyKey]
  if (!fam) return null
  return fam.swatches.find((s) => s.code === code) ?? fam.swatches[0] ?? null
}

/**
 * Swatches for a family, including any fabrics the user has uploaded.
 *
 * User fabrics are stored per-browser (see lib/fabrics.js), so they are passed
 * in rather than read here — the catalogue stays a pure data module.
 */
/**
 * Hand Cloud Series its swatches once the artwork manifest has been read.
 *
 * One swatch per design x colour — sixteen for the supplied set, twenty when
 * CL-02 arrives. The SHAPE is deliberately not in here: the four shapes of a
 * design are the same artwork cut to different outlines, so the shape is
 * settled by the cloud that was placed, not by a choice anyone makes twice.
 *
 * Mutates the live array rather than replacing it, so anything already holding
 * the family object sees them appear.
 */
export function applyCloudSeriesSwatches(swatches) {
  const fam = COLOUR_FAMILIES['cloud-series']
  fam.swatches.length = 0
  for (const s of swatches) fam.swatches.push(s)
  return fam.swatches.length
}

/**
 * Hand the Colour Core family its swatches once the panel map has been read.
 *
 * Mutates the live array rather than replacing it, so anything already holding
 * the family object sees them appear.
 */
export function applyOmbreSwatches(swatches) {
  const fam = COLOUR_FAMILIES['colour-core-ombre']
  fam.swatches.length = 0
  fam.swatches.push(...swatches)
  return fam.swatches.length
}

export function applyColourCoreSwatches(swatches) {
  const fam = COLOUR_FAMILIES['colour-core-fabric']
  fam.swatches.length = 0
  fam.swatches.push(...swatches)
  return fam.swatches.length
}

/**
 * Hand the Designer Textile family its swatches once the CDN map is read.
 *
 * Mutates the live array rather than replacing it, so anything already holding
 * the family object sees them appear — the same bargain Colour Core makes.
 */
export function applyTextileSwatches(swatches) {
  const fam = COLOUR_FAMILIES['designer-textiles']
  fam.swatches.length = 0
  fam.swatches.push(...swatches)
  return fam.swatches.length
}

export function familySwatches(familyKey, userFabrics = []) {
  const fam = COLOUR_FAMILIES[familyKey]
  if (!fam) return []
  const swatches = [...fam.swatches]
  if (fam.userFabrics) {
    for (const f of userFabrics) swatches.push({ code: 'fabric:' + f.id, label: f.name, fabric: f })
  }
  return swatches
}

/** Widths available for a baffle type, which depend on shape and thickness. */
export function baffleWidths(p) {
  const bt = BAFFLE_TYPES[p.btype]
  if (!bt) return [150]
  if (bt.shapes) return bt.shapes[p.shape ?? 'standard']?.widths ?? [150]
  if (bt.widthsByThickness) return bt.widthsByThickness[p.thickness] ?? bt.widthsByThickness[bt.thicknesses[0]]
  return bt.widths ?? [150]
}

/**
 * The depth a shape may be set to freely, or null where it comes in fixed sizes.
 *
 * A shape with a range is measured at its DEEPEST point. Flow's profile
 * undulates along the fin and that profile belongs to the model, so setting a
 * depth scales the whole thing: at 200 its shallow end lands proportionally
 * shallower, not at the 75 it starts from. Anything else would mean a different
 * profile, which is a different product rather than a resized one.
 */
export function depthRangeOf(p) {
  const bt = BAFFLE_TYPES[p?.btype]
  return bt?.shapes?.[p?.shape ?? 'standard']?.depthRange ?? null
}

/**
 * Where a typed blade depth starts, taken from the length already chosen.
 *
 * A twelfth of the fin's length, snapped to the range's step and clamped to
 * it: 1200 -> 100, 1800 -> 150, 2400 -> 200, 2780 -> 230. Three of those four
 * land exactly on sizes the workbook publishes, which is the point — it is a
 * proportion a long fin and a short one can share, not an acoustic
 * recommendation.
 *
 * It is where the FIRST NUDGE lands, not a value written into the spec: depth
 * stays a question the panel asks, like every other field in the staircase.
 */
export function defaultDepthMm(p) {
  const range = depthRangeOf(p)
  if (!range) return null
  const snapped = Math.round(((p?.length ?? 1800) / 12) / range.step) * range.step
  return Math.min(range.max, Math.max(range.min, snapped))
}

/** Colour families a baffle type may be finished in. */
export const baffleFamilies = (btype) => BAFFLE_TYPES[btype]?.families ?? ['pet-solid']

/**
 * A tapered or flow width is written "100-200" (mm at each end).
 * Returns the two ends, so callers never parse the string themselves.
 */
export function parseWidth(width) {
  if (typeof width === 'number') return { a: width, b: width }
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(width))
  return m ? { a: +m[1], b: +m[2] } : { a: 150, b: 150 }
}

// ---------------------------------------------------------------------------
// derived geometry — the bridge from catalogue mm to grid cells
// ---------------------------------------------------------------------------

/**
 * Centre-to-centre distance between neighbouring fins, in metres.
 *
 * The workbook specifies spacing edge-to-edge, so the fin's own thickness has
 * to be added to get a pitch.
 */
export const finPitch = (p) => (p.spacing + p.thickness) * MM

/**
 * What ONE object measures across the run, in millimetres.
 *
 * The same split baffleExtent makes when it chooses a pitch: for a fin that
 * width is its thickness, for a model it is the model's measured width. It was
 * written out three times — in finPitch, in modelPitch and again inside
 * runLimits — which was harmless while only the geometry read it. It stopped
 * being harmless when the panel started showing centre-to-centre: a spacing
 * field converting by one rule while the renderer spaces by another would put
 * a number on screen that nothing in the scene measures.
 */
export const acrossUnitMm = (p) => (p.model ? (p.sizeMm?.w ?? 0) : (p.thickness ?? 0))

/**
 * Centre-to-centre from the clear gap, and the clear gap back from it.
 *
 * The workbook quotes the gap; a setting-out drawing quotes the pitch. They are
 * the same decision, one object's width apart.
 */
export const pitchOf = (p, gap = p.spacing) =>
  (Number.isFinite(gap) ? gap + acrossUnitMm(p) : null)
export const gapOf = (p, pitch) =>
  (Number.isFinite(pitch) ? pitch - acrossUnitMm(p) : null)

/**
 * The real extent of a baffle set on the ceiling, in metres.
 *
 * `length` runs along the fins; `width` is how far the set fans out across
 * them. This is the single definition of a set's size — the renderer, the
 * footprint and the schedule all read it, so they cannot disagree.
 */
/**
 * Centre-to-centre distance between neighbouring copies of an imported model.
 *
 * Same idea as finPitch: the workbook specifies spacing edge-to-edge, so the
 * object's own width across the run has to be added. For a fin that width is
 * its thickness; for a model it is the model's measured width.
 */
export const modelPitch = (p) => (p.spacing + (p.sizeMm?.w ?? 0)) * MM

/**
 * The extent a baffle item covers on the ceiling, in metres.
 *
 * A model run and a fin set are the same shape of thing — N objects spread
 * across the run at a pitch — so they share one formula and differ only in what
 * one object is.
 */
/**
 * One fin's own parameters: the set's, with that fin's overrides on top.
 *
 * A run may vary fin by fin — the workbook allows it and `finOverrides` carries
 * it — so anything that measures or draws a fin asks here rather than reading
 * the set once and assuming every fin matches it.
 */
export function finParams(p, i) {
  const ov = p?.finOverrides?.[i]
  return ov ? { ...p, ...ov } : p
}

/** A model size held inside what the loader will accept. */
export function clampModelSize(s) {
  const axis = (k) => {
    const lim = MODEL_SIZE_LIMITS[k]
    return Math.min(lim.max, Math.max(lim.min, Math.round(s[k])))
  }
  return { l: axis('l'), w: axis('w'), h: axis('h') }
}

/**
 * One fin's size in millimetres: along the fin, across the run, face depth.
 *
 * A fin with no size of its own gives back the SET's `sizeMm` exactly rather
 * than recomputing it. reconcile() is what derives that, clamps included, and
 * a second derivation here could land a millimetre away — which would move
 * every existing set by a hair the first time this function was called.
 */
export function finSizeMm(p, i) {
  const ov = p?.finOverrides?.[i] ?? {}
  const varies = ov.length !== undefined || ov.thickness !== undefined || ov.width !== undefined
  if (p?.model && p.sizeMm && !varies) return p.sizeMm
  const s = baffleSizeMm(finParams(p, i))
  return (p?.model && p.sizeMm) ? clampModelSize(s) : s
}

export function baffleExtent(p) {
  const count = Math.max(1, p.count | 0)
  // THE RUN KEEPS ITS RHYTHM. Pitch is the set's, so giving one fin a
  // thickness of its own does not move every other fin — which is the whole
  // point of editing one fin. A fin thicker than its pitch will touch its
  // neighbours, and that is the honest consequence of asking for it.
  const pitch = p.model ? modelPitch(p) : finPitch(p)
  const span = (count - 1) * pitch

  let length = 0
  let half = 0
  for (let i = 0; i < count; i++) {
    const s = finSizeMm(p, i)
    length = Math.max(length, s.l * MM)
    const z = -span / 2 + i * pitch
    half = Math.max(half, Math.abs(z) + (s.w * MM) / 2)
  }
  // SYMMETRIC about the run's centre. The footprint is placed from the item's
  // cell and everything downstream — snapping, the outline, the collision
  // test — reads the extent as centred on it. Measuring one side to the
  // thickest fin and the other to the thinnest would put the geometry off its
  // own footprint. Reserving to the furthest edge on both sides costs a little
  // ceiling and keeps the centre true.
  //
  // Identical to the old formula whenever every fin matches the set: max|z| is
  // span/2, so the width comes out at span + thickness exactly.
  return { length, width: 2 * half }
}

/** Where each copy sits along the run, in metres, centred on the item. */
export function baffleOffsets(p) {
  const count = Math.max(1, p.count | 0)
  const pitch = p.model ? modelPitch(p) : finPitch(p)
  const span = (count - 1) * pitch
  return Array.from({ length: count }, (_, i) => -span / 2 + i * pitch)
}

const scaledSize = (dims, k) => ({
  l: Math.round(dims.length * k * 1000),
  w: Math.round(dims.width * k * 1000),
  h: Math.round(dims.height * k * 1000),
})

/**
 * The largest an imported model can be and still sit on this ceiling.
 *
 * Source files are routinely authored for a bigger space than the one being
 * configured — the supplied installation FBX is 27.8 m long, which no room here
 * can hold. This is what the "Fit room" button applies. Proportions are kept.
 */
export function fitSizeMm(dims, room) {
  if (!dims?.length) return null
  const w = room ? room.ceiling.maxX - room.ceiling.minX : 4
  const d = room ? room.ceiling.maxZ - room.ceiling.minZ : 4
  const h = room ? room.ceiling.y : 3
  const fit = Math.min(
    1,
    (w - 0.3) / dims.length,
    (d - 0.3) / dims.width,
    (h * 0.6) / dims.height,
  )
  return scaledSize(dims, fit)
}

/**
 * The size an imported model opens at.
 *
 * OPENING_LENGTH applies to every baffle, not just the parametric ones: a model
 * arrives the same length as a catalogue run so the two are comparable on the
 * ceiling from the first click. Whichever is smaller wins — a model still may
 * not open bigger than the ceiling can hold.
 */
/**
 * The parameters a model opens with, taken from the run inside it.
 *
 * `sizeMm` describes ONE FIN — length, thickness across the run, face depth —
 * not the whole file. That is what makes a model share every piece of maths
 * with a catalogue set: pitch is spacing plus thickness either way, and the
 * footprint follows from the same extent formula.
 */
export function openingModelParams(entry, room) {
  const f = entry?.fins
  if (!f) {
    // not a run of fins: the file is one object, sized whole
    return { sizeMm: openingSizeMm(entry?.dims, room), count: 1, spacing: 200 }
  }
  const k = (OPENING_LENGTH / 1000) / f.size.length
  return {
    sizeMm: {
      l: Math.round(f.size.length * k * 1000),
      w: Math.max(1, Math.round(f.size.thickness * k * 1000)),
      h: Math.round(f.size.depth * k * 1000),
    },
    count: f.count,
    spacing: Math.max(0, Math.round(f.spacingMm * k)),
  }
}

/**
 * The shallowest drop a model run may take, from its manifest entry.
 *
 * Mirrors modelMinDrop() in lib/modelFins.js, which the renderer uses; this one
 * works from the manifest so the slider knows the limit before the model has
 * finished loading.
 */
export function modelMinDropMm(entry, sizeMm) {
  const f = entry?.fins
  if (!f?.hardwareAboveFin) return 0
  // matches modelMinDrop in lib/modelFins: hardware rides the fin's own fit
  const sy = sizeMm ? (sizeMm.h / 1000) / (f.size.depth || 1) : 1
  return Math.ceil(f.hardwareAboveFin * sy * 1000)
}

export function openingSizeMm(dims, room) {
  if (!dims?.length) return null
  const toOpening = (OPENING_LENGTH / 1000) / dims.length
  const fit = room
    ? Math.min(
        (room.ceiling.maxX - room.ceiling.minX - 0.3) / dims.length,
        (room.ceiling.maxZ - room.ceiling.minZ - 0.3) / dims.width,
        (room.ceiling.y * 0.6) / dims.height,
      )
    : Infinity
  return scaledSize(dims, Math.min(toOpening, fit))
}

/**
 * The largest count and spacing this ceiling can actually hold.
 *
 * Without these the sliders offer values that `update()` then refuses, and a
 * refusal is silent — you drag the slider, the run does not grow, and nothing
 * says why. In a 9 x 7 m room a four-copy run of a 1.5 m model already fills
 * the depth, so every increase dead-ends and the control looks broken.
 *
 * The run spreads across the grid's depth, or its width when rotated a quarter
 * turn, so which extent binds depends on the item's rotation.
 */
export function runLimits(p, g) {
  const along = (p.rot ?? 0) === 90 || (p.rot ?? 0) === 270
  const acrossCells = along ? g.cols : g.rows
  const availMm = acrossCells * g.pitch * 1000
  const unit = acrossUnitMm(p)
  const spacing = Math.max(0, p.spacing ?? 0)
  const count = Math.max(1, p.count | 0)

  const maxCount = Math.max(1, Math.floor((availMm - unit) / (spacing + unit)) + 1)

  // Spacing is measured against the count that actually fits, not the count
  // currently set. A four-copy run of a 1.5 m model does not fit a boardroom at
  // any spacing at all, so asking "how far apart may these four go" has no
  // answer — the count is what has to come down first, and reporting a max of
  // 0 mm would point at the wrong control.
  const effectiveCount = Math.min(count, maxCount)
  const maxSpacing = effectiveCount > 1
    ? Math.max(0, Math.floor((availMm - unit) / (effectiveCount - 1)) - unit)
    : Infinity

  return { maxCount, maxSpacing, effectiveCount, unit, availMm }
}

/** Cell footprint of a baffle set at a given grid pitch. */
export function baffleCells(p, pitch) {
  const e = baffleExtent(p)
  return { ci: spanCells(e.length, pitch), cj: spanCells(e.width, pitch) }
}

/**
 * Spacing range for a run of imported models.
 *
 * Wider than the catalogue's 50-200 mm, which is scaled for 25 mm fins: a model
 * is a whole object, often over a metre across, and a gap in that range is
 * invisible against it.
 */
export const MODEL_SPACING = { min: 0, max: 2000, step: 50 }

/**
 * The starting parameters for a baffle set.
 *
 * `model: 'baffle'` renders the customer's own FBX assembly; null falls back to
 * procedural fins built from the catalogue dimensions.
 */
/**
 * What a new set must have chosen before it can be placed, panel order.
 *
 * The brush no longer opens on a complete product. Only the type is decided;
 * everything down to the spacing is a decision someone has to make, so that
 * placing a baffle means placing the one they specified rather than the one
 * this file happened to open on.
 *
 * Shape only counts where the type HAS shapes — VMT has none, and a null shape
 * there is the answer rather than a gap.
 */
const REQUIRED = [
  ['shape', 'Shape'],
  ['thickness', 'Thickness'],
  ['length', 'Baffle length'],
  ['width', 'Baffle height'],
  ['family', 'Series'],
  ['colour', 'Colour'],
  ['rot', 'Direction'],
  ['spacing', 'Baffle spacing'],
]

/**
 * What a baffle must answer, in panel order, for THIS spec. See lib/gate.js —
 * the panel's unlocking and the "still to choose" line read the same list.
 */
export function baffleRequired(p) {
  const bt = BAFFLE_TYPES[p?.btype]
  // A type with no shapes is never asked for one.
  return REQUIRED.filter(([key]) => (key === 'shape' ? !!bt?.shapes : true))
}

/** The labels of the fields still to be filled, in the order they are asked. */
export function missingFields(p) {
  return baffleRequired(p).filter(([key]) => p?.[key] == null).map(([, label]) => label)
}

/** Can this brush be placed on the ceiling yet? */
export const readyToPlace = (p) => missingFields(p).length === 0

/**
 * The brush a session opens on: the type, and nothing else decided.
 *
 * Count, suspension height and the per-fin overrides keep their defaults — they
 * were not asked for, and a run of eight at 450 mm is a starting point rather
 * than a specification of the product.
 */
export function emptyBrushParams() {
  return {
    ...defaultBaffleParams(),
    shape: null,
    thickness: null,
    width: null,
    length: null,
    family: null,
    colour: null,
    rot: null,
    spacing: null,
    model: null,
    modelName: null,
    sizeMm: null,
  }
}

export function defaultBaffleParams() {
  // Blade / Standard, because it is the product that actually has a model. VMT
  // is still in the workbook and still listed, but opening on a type nothing
  // can be built from shows a disabled control and a warning as the first thing
  // in the panel.
  const d = BAFFLE_TYPES.blade.defaults
  return {
    btype: 'blade',
    shape: 'standard',
    thickness: d.thickness,
    width: d.width,
    length: OPENING_LENGTH,
    family: d.family,
    colour: d.colour,
    mirror: 'straight',
    // which way the run lies. It was only ever read as `p.rot ?? 0`, so it never
    // needed to be here — until Direction became a field somebody has to choose,
    // and "has it been chosen" needs a value to be absent FROM.
    rot: 0,
    spacing: 100,
    count: 8,
    // 300 mm, not the 450 this opened on. A run at 450 hangs further into the
    // room than it needs to before anyone has asked it to; 300 still reads as
    // suspended. Only NEW sets — anything already placed keeps what it was given.
    drop: 0.3,
    finOverrides: {}, // per-fin edits keyed by fin index
    // null = built from the catalogue above. An id from public/models/baffles
    // renders that file instead, sized by sizeMm. modelName is carried so an
    // exported layout says which model it used, not just an opaque id.
    model: null,
    modelName: null,
    sizeMm: null,
  }
}

/** Human label for an item, used in the schedule and the selection header. */
export function itemLabel(item) {
  if (item.type !== 'baffles') return PRODUCT_TYPES[item.type]?.label ?? item.type
  return BAFFLE_TYPES[item.params?.btype]?.label ?? PRODUCT_TYPES.baffles.label
}

/**
 * Every fin in a set, for quantity take-off. Lengths in millimetres.
 *
 * A set is one item in the document but N fins on an invoice, and per-fin
 * overrides mean those fins are not necessarily identical — so the schedule has
 * to expand a set rather than multiply it. Pure data: no geometry is built.
 */
/**
 * What a model-backed item's size may be, per axis, in millimetres.
 *
 * Shared by the store and the size controls so the two cannot disagree — and
 * they did. The panel floored every axis at 100 mm while the store accepted a
 * fin 5 mm thick, so a 16 mm fin could not be stepped down at all and jumped
 * straight to 100 on the first press up. The 100 had already been taken out of
 * the store once, for this exact reason, and left in the panel.
 *
 * `w` is the fin's THICKNESS across the run, which is why its floor is so much
 * lower than the others: the catalogue runs from 12 mm.
 */
export const MODEL_SIZE_LIMITS = {
  l: { min: 50, max: 30000 },
  w: { min: 5, max: 30000 },
  h: { min: 20, max: 6000 },
}

/**
 * Finishes offered on an imported model.
 *
 * A model has no catalogue type of its own, so this used to be EVERY family —
 * all eight — on the reasoning that a shortlist belongs to a type and a model
 * has none. Cut to these five, which is what the range actually offers here.
 * Signature Ombre, Solid Colour VMT and Concrete came off.
 *
 * The three are not deleted from COLOUR_FAMILIES and nothing else changes: the
 * catalogue types keep their own lists, so Concrete and Signature Ombre are
 * still offered on a VMT baffle and Solid Colour VMT on an Embossed one. This
 * list is only what an IMPORTED MODEL may wear.
 *
 * A saved layout naming one of the three is not broken by this — reconcile
 * falls back to the first entry here and re-picks a colour that family
 * publishes, so the set lands on Solid Coloured PET rather than on a finish
 * nothing can draw.
 */
export const MODEL_FIN_FAMILIES = [
  'pet-solid', 'wood-classic', 'designer-textiles',
  'colour-core-fabric', 'colour-core-ombre',
]

/**
 * The finish one fin actually renders in, as a family/colour PAIR.
 *
 * The pairing is the point. Half of a fin's own finish and half of the set's is
 * a combination that exists in neither: the colour code is not one that family
 * publishes, the swatch lookup falls back to the family's FIRST colour, and
 * every swatch you pick resolves to that same material — which reads as picking
 * a colour doing nothing at all. So a fin either has its own finish or takes
 * the set's, never one field from each.
 *
 * Returns null when the fin keeps the file's own materials, which only an
 * imported model has to keep.
 */
/**
 * The size a model must be scaled to, read off the catalogue.
 *
 * A model-backed baffle is no longer sized by free millimetre sliders: the
 * workbook publishes the thickness, length and face depth a product comes in,
 * and the model is scaled to whichever the user picked. So these three numbers
 * are DERIVED, never stored independently — there is no way to end up with a
 * model 1737 mm long when the catalogue only sells 1200/1800/2400/2780.
 *
 * A tapered or flow fin has a depth range; the model carries the profile that
 * varies along its length, so it is scaled to the deepest point.
 */
export function baffleSizeMm(p) {
  const w = parseWidth(p.width)
  return {
    l: p.length,                 // along the fin
    w: p.thickness,              // across the run
    h: Math.max(w.a, w.b),       // face depth, at its deepest
  }
}

export function finFinish(p, index) {
  const ov = p.finOverrides?.[index] ?? {}
  if (ov.family !== undefined || ov.colour !== undefined) {
    return {
      family: ov.family ?? (p.model ? MODEL_FIN_FAMILIES[0] : p.family),
      colour: ov.colour ?? null,
    }
  }
  if (!p.model) return { family: p.family, colour: p.colour }
  return p.finishAll ? { family: p.family, colour: p.colour } : null
}

export function finSchedule(p) {
  // An imported model is one unit, whatever it contains. The supplied FBX is an
  // installation of 24 fins plus backdrop slabs; counting its meshes would be
  // counting the file's authoring, not the product.
  const overrides = p.finOverrides ?? {}
  const out = []

  if (p.model) {
    const sz = p.sizeMm ?? { l: 0, w: 0, h: 0 }
    for (let i = 0; i < Math.max(1, p.count | 0); i++) {
      const ov = overrides[i] ?? {}
      if (ov.hidden) continue // a fin that is not there is not on the order
      // a fin left on the file's own materials has no catalogue finish
      const finish = finFinish(p, i)
      out.push({
        index: i,
        model: p.model,
        modelName: p.modelName ?? p.model,
        btype: null,
        shape: null,
        thickness: Math.round(sz.w),
        lengthMm: Math.round(sz.l),
        depthMm: Math.round(sz.h),
        family: finish?.family ?? null,
        colour: finish?.colour ?? null,
      })
    }
    return out
  }

  for (let i = 0; i < Math.max(1, p.count | 0); i++) {
    const ov = overrides[i]
    if (ov?.hidden) continue
    const finP = ov ? { ...p, ...ov } : p
    const w = parseWidth(finP.width)
    out.push({
      index: i,
      btype: finP.btype,
      shape: finP.shape ?? null,
      thickness: finP.thickness,
      lengthMm: finP.length,
      // a tapered fin's absorptive face is its mean depth
      depthMm: Math.round((w.a + w.b) / 2),
      family: finP.family,
      colour: finP.colour,
    })
  }
  return out
}

/** Label for a baffle set, e.g. "Blade · Tapered". */
export function baffleLabel(p) {
  if (p.model) return p.modelName ?? p.model
  const bt = BAFFLE_TYPES[p.btype]
  if (!bt) return PRODUCT_TYPES.baffles.label
  const shape = p.shape && bt.shapes?.[p.shape]?.label
  return shape ? `${bt.label} · ${shape}` : bt.label
}
