// Product catalog — encodes Ceiling_configurator_data.xlsx exactly.
// All dimensions in millimetres as specified; builders convert to metres.
// Colour families use placeholder swatches until real codes/textures arrive
// (Designer Textiles also pulls uploaded fabrics from the Admin panel).

// ---------- colour families ----------
export const COLOUR_FAMILIES = {
  'wood-classic': {
    label: 'Wood Classic',
    kind: 'wood',
    // real veneer sheet photos in /textures/wood-classic (1220 × 2800 mm per
    // sheet); fins are cut as vertical strips along the grain. More codes are
    // added by dropping a file + manifest entry there. base/grain are only
    // offline fallbacks.
    swatches: [
      { code: 'WD-NC-05', file: 'WD-NC-05.jpg', base: '#c08a5e', grain: '#9c6b45' },
      { code: 'WD-NC-13', file: 'WD-NC-13.jpg', base: '#a97b3f', grain: '#7d5a2c' },
      { code: 'WD-NC-15', file: 'WD-NC-15.jpg', base: '#6f4a2f', grain: '#452c1c' },
    ],
  },
  'designer-textiles': {
    label: 'Designer Textiles',
    kind: 'textile',
    adminUploads: true, // uploaded fabrics from the Admin panel appear here
    swatches: [
      { code: 'DT-01', hex: '#5b6770' }, { code: 'DT-02', hex: '#41586e' },
      { code: 'DT-03', hex: '#7d3040' }, { code: 'DT-04', hex: '#c65a33' },
      { code: 'DT-05', hex: '#cdbd9f' }, { code: 'DT-06', hex: '#7d8c5c' },
      { code: 'DT-07', hex: '#3f5d50' }, { code: 'DT-08', hex: '#aeb6bc' },
    ],
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
  'pet-solid': {
    label: 'Solid Coloured PET',
    kind: 'felt',
    swatches: [
      { code: 'PET-01', hex: '#383d42' }, { code: 'PET-02', hex: '#5b6770' },
      { code: 'PET-03', hex: '#aeb6bc' }, { code: 'PET-04', hex: '#e9e4d9' },
      { code: 'PET-05', hex: '#cdbd9f' }, { code: 'PET-06', hex: '#c8a13a' },
      { code: 'PET-07', hex: '#c65a33' }, { code: 'PET-08', hex: '#7d3040' },
      { code: 'PET-09', hex: '#7d8c5c' }, { code: 'PET-10', hex: '#3f5d50' },
      { code: 'PET-11', hex: '#41586e' }, { code: 'PET-12', hex: '#7fa8c9' },
    ],
  },
  'colour-core-fabric': {
    label: 'Colour Core Fabric',
    kind: 'textile',
    swatches: [
      { code: 'CC-01', hex: '#46505a' }, { code: 'CC-02', hex: '#6e4a4f' },
      { code: 'CC-03', hex: '#b0703f' }, { code: 'CC-04', hex: '#c2b49a' },
      { code: 'CC-05', hex: '#68785c' }, { code: 'CC-06', hex: '#8ba2b5' },
    ],
  },
  'colour-core-ombre': {
    label: 'Colour Core Ombre',
    kind: 'ombre',
    swatches: [
      { code: 'CO-01', from: '#46505a', to: '#8ba2b5' },
      { code: 'CO-02', from: '#b0703f', to: '#c2b49a' },
      { code: 'CO-03', from: '#68785c', to: '#c2b49a' },
      { code: 'CO-04', from: '#6e4a4f', to: '#c9a4a8' },
    ],
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
};

// Uni Vic Strip finishes (strip colour on a black or glacier-grey base)
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
};

// Perforation patterns (PF-NC codes) — placeholder hole layouts until the
// real drawings arrive. Applied over a Wood Classic base colour.
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
];

// ---------- baffles ----------
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
      standard: { label: 'Standard', widths: [75, 100, 150, 175, 200] },
      tapered: { label: 'Tapered', widths: ['100-200', '125-225', '150-300'] },
      flow: { label: 'Flow', widths: ['75-300'] },
    },
    thicknesses: [12, 25],
    lengths: [1200, 1800, 2400, 2780],
    families: ['pet-solid', 'colour-core-fabric', 'colour-core-ombre'],
    defaults: { shape: 'standard', thickness: 25, width: 150, length: 2400, family: 'pet-solid', colour: 'PET-11' },
  },
  box: {
    label: 'Box',
    thicknesses: [50],
    widths: [75, 100, 150, 175, 200],
    lengths: [1200, 1800, 2400, 2780],
    families: ['pet-solid', 'colour-core-fabric', 'colour-core-ombre'],
    defaults: { thickness: 50, width: 150, length: 2400, family: 'pet-solid', colour: 'PET-02' },
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
};

export const BAFFLE_SHARED = {
  spacings: [50, 100, 150, 200],       // edge-to-edge, mm
  directions: [
    { value: 'vertical', label: 'Vertical' },
    { value: 'horizontal', label: 'Horizontal' },
  ],
  mirrors: [
    { value: 'straight', label: 'All straight' },
    { value: 'alternate', label: 'Alternate mirrored' },
  ],
  wallClearance: 25, // mm, from spec — min clearance to walls & neighbours
};

// ---------- ceiling tiles ----------
export const TILE_TYPES = {
  heritage: {
    label: 'Heritage Tiles',
    thicknesses: [12, 25, 40],
    sizes: ['600x600'],
    patterns: [{ code: 'HT-A' }, { code: 'HT-B' }, { code: 'HT-C' }, { code: 'HT-D' }], // codes to be added
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
    patterns: COLOUR_FAMILIES['wood-classic'].swatches.map(s => ({ code: s.code })),
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
    baseColours: COLOUR_FAMILIES['wood-classic'].swatches.map(s => s.code),
    patterns: PF_PATTERNS.map(p => ({ code: p.code })),
    defaults: { thickness: 25, size: '600x600', base: 'WD-NC-13', pattern: 'PF-NC-07' },
  },
};

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
};

// ---------- clouds ----------
export const CLOUD_SHAPES = {
  square: { label: 'Square', sizes: [600, 900, 1200] },
  circle: { label: 'Circle', sizes: [600, 900, 1200] },
  hexagon: { label: 'Hexagon', sizes: [600, 900, 1200] },
  triangle: { label: 'Triangle', sizes: [900, 1200] },
};

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
};

export function familySwatches(familyKey, customTextures = []) {
  const fam = COLOUR_FAMILIES[familyKey];
  if (!fam) return [];
  const swatches = [...fam.swatches];
  if (fam.adminUploads) {
    for (const t of customTextures) {
      swatches.push({ code: 'upload:' + t.id, label: t.name, upload: t });
    }
  }
  return swatches;
}
