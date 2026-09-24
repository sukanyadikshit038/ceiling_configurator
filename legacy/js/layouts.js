// Layout presets & inspiration scenes — built on the spec catalog.
// Item specs: {type, params, x, z, rotY}; the app assigns ids.
import { defaultParams } from './products.js';
import { SCENARIOS } from './furniture.js';
import { CLOUD_SHAPES } from './catalog.js';

function baffles(x, z, params = {}, rotY = 0) {
  return { type: 'baffles', x, z, rotY, params: { ...defaultParams('baffles'), ...params } };
}
function cloud(x, z, params = {}, rotY = 0) {
  return { type: 'clouds', x, z, rotY, params: { ...defaultParams('clouds'), ...params } };
}
function tiles(params = {}) {
  return { type: 'tiles', x: 0, z: 0, rotY: 0, params: { ...defaultParams('tiles'), ...params } };
}

// ---------- sidebar quick presets ----------
export const PRESETS = [
  { key: 'vmt-field', label: 'VMT baffle field — Wood Classic' },
  { key: 'blade-field', label: 'Blade field — Solid PET' },
  { key: 'tapered-wave', label: 'Tapered blades — mirrored wave' },
  { key: 'ombre-run', label: 'Ombre VMT — alternate mirrored' },
  { key: 'cloud-grid', label: 'Cloud grid — squares' },
  { key: 'tile-wood', label: 'Wood Classic tile ceiling' },
  { key: 'showroom', label: 'Showroom demo — mixed' },
];

export function buildPreset(key, room) {
  switch (key) {
    case 'vmt-field': {
      const cols = Math.max(1, Math.floor((room.w - 2) / 3.0));
      const count = Math.min(24, Math.floor((room.l - 2) / 0.325) + 1);
      const items = [];
      for (let c = 0; c < cols; c++) {
        const x = -((cols - 1) * 3.0) / 2 + c * 3.0;
        items.push(baffles(x, 0, { btype: 'vmt', thickness: 25, width: 150, length: 2780, family: 'wood-classic', colour: 'WD-NC-13', spacing: 200, count, drop: 0.4 }));
      }
      return items;
    }
    case 'blade-field': {
      const cols = Math.max(1, Math.floor((room.w - 2) / 2.7));
      const count = Math.min(24, Math.floor((room.l - 2) / 0.175) + 1);
      const items = [];
      const colours = ['PET-11', 'PET-03', 'PET-11'];
      for (let c = 0; c < cols; c++) {
        const x = -((cols - 1) * 2.7) / 2 + c * 2.7;
        items.push(baffles(x, 0, { btype: 'blade', shape: 'standard', thickness: 25, width: 150, length: 2400, family: 'pet-solid', colour: colours[c % 3], spacing: 150, count, drop: 0.35 }));
      }
      return items;
    }
    case 'tapered-wave':
      return [baffles(0, 0, {
        btype: 'blade', shape: 'tapered', thickness: 25, width: '125-225', length: 2780,
        family: 'pet-solid', colour: 'PET-02', spacing: 150, mirror: 'alternate',
        count: Math.min(24, Math.floor((room.l - 1.5) / 0.175) + 1), drop: 0.35,
      })];
    case 'ombre-run':
      return [baffles(0, 0, {
        btype: 'vmt', thickness: 50, width: 200, length: 2400, family: 'signature-ombre',
        colour: 'OM-02', spacing: 150, mirror: 'alternate',
        count: Math.min(20, Math.floor((room.l - 1.5) / 0.2) + 1), drop: 0.45,
      })];
    case 'cloud-grid':
      return cloudLayoutSpecs(3, { shape: 'square', size: 1200, colour: 'Blue', pattern: 'series-3' }, 0, 0, room);
    case 'tile-wood':
      return [tiles({ ttype: 'wood-classic-tile', pattern: 'WD-NC-13', grid: '24', gridColour: 'black' })];
    case 'showroom': {
      return [
        baffles(-room.w / 4, 0, { btype: 'blade', shape: 'standard', family: 'pet-solid', colour: 'PET-11', length: 2400, width: 150, spacing: 150, count: Math.min(14, Math.floor((room.l * 0.66) / 0.175)), drop: 0.4 }),
        cloud(room.w / 4, -room.l / 5, { shape: 'circle', size: 1200, colour: 'Red', pattern: 'series-1', drop: 0.6 }),
        cloud(room.w / 4 + 1.6, 0.4, { shape: 'hexagon', size: 900, colour: 'Yellow', pattern: 'series-4', drop: 0.85 }),
        cloud(room.w / 4 - 0.4, room.l / 4, { shape: 'square', size: 900, colour: 'Green', pattern: 'series-2', drop: 0.5 }, 45),
        cloud(room.w / 4 + 1.2, room.l / 3, { shape: 'triangle', size: 900, colour: 'Blue', pattern: 'series-5', drop: 0.7 }),
      ];
    }
    default: return [];
  }
}

// ---------- embossed baffle layouts 1-5 (design defaults, refine to drawings later) ----------
export function baffleLayoutSpecs(n, base, room) {
  const p = (over, x, z, rotY = 0) => baffles(x, z, { ...base, ...over }, rotY);
  const L = (base.length || 1200) / 1000;
  switch (n) {
    case 1: { // parallel rows across the ceiling
      const cols = Math.max(2, Math.floor((room.w - 2) / (L + 0.5)));
      return Array.from({ length: cols }, (_, c) =>
        p({}, -((cols - 1) * (L + 0.5)) / 2 + c * (L + 0.5), 0));
    }
    case 2: { // staggered ends
      const cols = Math.max(2, Math.floor((room.w - 2) / (L + 0.5)));
      return Array.from({ length: cols }, (_, c) =>
        p({}, -((cols - 1) * (L + 0.5)) / 2 + c * (L + 0.5), (c % 2 ? 0.8 : -0.8)));
    }
    case 3: // perimeter frame
      return [
        p({}, 0, -room.l / 2 + 1.2, 90),
        p({}, 0, room.l / 2 - 1.2, 90),
        p({}, -room.w / 2 + 1.2, 0),
        p({}, room.w / 2 - 1.2, 0),
      ];
    case 4: // chevron pairs
      return [
        p({}, -L * 0.7, -1.2, 30), p({}, L * 0.7, -1.2, 330),
        p({}, -L * 0.7, 1.2, 330), p({}, L * 0.7, 1.2, 30),
      ];
    case 5: // crosshatch
      return [p({}, 0, -1.0), p({}, 0, 1.0), p({}, 0, 0, 90)];
    default: return [];
  }
}

// ---------- cloud layouts 1-6 ----------
export function cloudLayoutSpecs(n, base, cx, cz, room) {
  // clamp any size override to what the base shape actually offers
  // (e.g. triangles have no 600 mm option)
  const sizes = (CLOUD_SHAPES[base.shape] || CLOUD_SHAPES.square).sizes;
  const okSize = v => (sizes.includes(v) ? v : sizes[0]);
  const c = (over, x, z, rotY = 0) => {
    if (over.size !== undefined) over = { ...over, size: okSize(over.size) };
    return cloud(cx + x, cz + z, { ...base, ...over }, rotY);
  };
  const s = (base.size || 900) / 1000;
  const g = s + 0.4;
  switch (n) {
    case 1: // 3×3 grid
      return [-1, 0, 1].flatMap(r => [-1, 0, 1].map(col => c({}, col * g, r * g)));
    case 2: // diamond stagger
      return [c({}, 0, 0), c({}, g, g * 0.55), c({}, -g, g * 0.55), c({}, g, -g * 0.55), c({}, -g, -g * 0.55)];
    case 3: // diagonal run
      return [-2, -1, 0, 1, 2].map(i => c({}, i * g * 0.9, i * g * 0.55, (i % 2 ? 45 : 0)));
    case 4: // centre cluster, mixed sizes
      return [
        c({ size: 1200, drop: (base.drop || 0.55) }, 0, 0),
        c({ size: 900, drop: (base.drop || 0.55) + 0.25 }, s + 0.35, 0.3, 45),
        c({ size: 600, drop: (base.drop || 0.55) + 0.45 }, -s - 0.2, 0.5),
        c({ size: 600, drop: (base.drop || 0.55) + 0.35 }, 0.3, -s - 0.3, 45),
      ];
    case 5: { // ring
      const r = s + 0.8;
      return Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return c({}, Math.cos(a) * r, Math.sin(a) * r, (i * 45) % 360);
      });
    }
    case 6: // scattered mix
      return [
        c({}, -g * 1.4, -g, 45), c({ size: 600 }, 0.2, -g * 1.5), c({}, g * 1.3, -g * 0.6),
        c({ size: 600 }, -g, g * 0.7, 45), c({}, 0.4, g * 1.2, 90), c({ size: 600 }, g * 1.5, g * 0.9),
      ];
    default: return [];
  }
}

// ---------- inspiration scenes (sector setups, one product family each) ----------
export const INSPIRATIONS = [
  {
    key: 'office-executive', sector: 'Office', product: 'VMT baffles',
    label: 'Executive open plan — wood slat ceiling',
    blurb: 'Walnut VMT fins running tight over the bench desks, glass meeting suite kept clear — the classic slat-ceiling office',
    scenario: 'office-realistic',
    shot: { p: [2.6, 1.65, 4.5], g: [-3.4, 2.4, -2.4] },
    items() {
      const a = SCENARIOS['office-realistic'].anchors;
      const items = [];
      for (const x of a.deskCols) {
        for (const z of a.deskRows) {
          items.push(baffles(x, z, {
            btype: 'vmt', thickness: 25, width: 150, length: 2780,
            family: 'wood-classic', colour: 'WD-NC-15',
            spacing: 100, count: 24, drop: 0.28, model: null,
          }));
        }
      }
      return items;
    },
  },
  {
    key: 'office-baffles', sector: 'Office', product: 'Blade baffles',
    label: 'Open plan — PET blade runs',
    blurb: 'Indigo PET blades over each work zone with a deeper spine along the circulation lane',
    scenario: 'office-open',
    shot: { p: [5.8, 1.65, 4.8], g: [-1.2, 2.55, -1.2] },
    items() {
      const a = SCENARIOS['office-open'].anchors;
      const items = a.clusters.map(([x, z]) =>
        baffles(x, z, { btype: 'blade', shape: 'standard', family: 'pet-solid', colour: 'PET-03', length: 2780, width: 150, spacing: 150, count: 9, drop: 0.35 }));
      items.push(baffles(0, 0, { btype: 'blade', shape: 'standard', family: 'pet-solid', colour: 'PET-11', length: 2400, width: 200, spacing: 200, count: 5, drop: 0.5 }, 90));
      return items;
    },
  },
  {
    key: 'office-clouds', sector: 'Office', product: 'Clouds',
    label: 'Team bays — square rafts',
    blurb: 'A 1200 mm square cloud centred over each desk group, blue over the meeting table',
    scenario: 'office-teams',
    shot: { p: [-5.0, 1.55, 3.9], g: [1.6, 2.45, -0.9] },
    items() {
      const a = SCENARIOS['office-teams'].anchors;
      const items = a.clusters.map(([x, z]) =>
        cloud(x, z, { shape: 'square', size: 1200, colour: 'Green', pattern: 'series-2', drop: 0.4 }));
      items.push(cloud(a.meeting[0], a.meeting[1], { shape: 'square', size: 1200, colour: 'Blue', pattern: 'series-3', drop: 0.5 }, 45));
      return items;
    },
  },
  {
    key: 'office-wood', sector: 'Office', product: 'Ceiling tiles',
    label: 'Boardroom — Wood Classic ceiling',
    blurb: 'WD-NC-15 walnut lay-in tiles on a slim black 15 mm grid',
    scenario: 'office-board',
    shot: { p: [3.1, 1.5, 2.35], g: [-0.7, 2.3, -0.5] },
    items() {
      return [tiles({ ttype: 'wood-classic-tile', pattern: 'WD-NC-15', thickness: 25, grid: '15', gridColour: 'black' })];
    },
  },
  {
    key: 'hosp-baffles', sector: 'Hospitality', product: 'VMT baffles',
    label: 'Restaurant — Ombre herringbone',
    blurb: 'Signature Ombre VMT fins in warm terracotta grades, angled over the dining lanes',
    scenario: 'hosp-dining',
    shot: { p: [4.7, 1.6, 3.7], g: [-1.4, 2.7, -0.9] },
    items() {
      const items = [];
      [-3.4, 0, 3.4].forEach((x, i) => {
        items.push(baffles(x, -1.2, { btype: 'vmt', thickness: 50, width: 200, length: 2400, family: 'signature-ombre', colour: i % 2 ? 'OM-06' : 'OM-01', mirror: 'alternate', spacing: 150, count: 6, drop: 0.55 }, 24));
        items.push(baffles(x, 2.1, { btype: 'vmt', thickness: 50, width: 200, length: 2400, family: 'signature-ombre', colour: i % 2 ? 'OM-01' : 'OM-06', mirror: 'alternate', spacing: 150, count: 6, drop: 0.7 }, 336));
      });
      return items;
    },
  },
  {
    key: 'hosp-clouds', sector: 'Hospitality', product: 'Clouds',
    label: 'Hotel lounge — circle constellations',
    blurb: 'Layered circle clouds in warm reds and yellows floating over each seating group',
    scenario: 'hosp-lounge',
    shot: { p: [5.3, 1.7, 4.3], g: [-1.4, 2.9, -1.4] },
    items() {
      const a = SCENARIOS['hosp-lounge'].anchors;
      const items = [];
      a.groups.forEach(([gx, gz], gi) => {
        items.push(cloud(gx - 0.6, gz - 0.4, { shape: 'circle', size: 1200, colour: gi % 2 ? 'Red' : 'Yellow', pattern: 'series-1', drop: 0.75 }));
        items.push(cloud(gx + 0.8, gz + 0.4, { shape: 'circle', size: 900, colour: 'Red', pattern: 'series-5', drop: 1.0 }));
        items.push(cloud(gx - 0.1, gz + 1.0, { shape: 'circle', size: 600, colour: 'Yellow', pattern: 'series-1', drop: 1.2 }));
      });
      return items;
    },
  },
  {
    key: 'hosp-wood', sector: 'Hospitality', product: 'Ceiling tiles',
    label: 'Fine dining — perforated walnut',
    blurb: 'Micro-perforated WD-NC-15 walnut tiles on a black silhouette grid — timber warmth, quiet room',
    scenario: 'hosp-fine',
    shot: { p: [3.9, 1.55, 3.1], g: [-0.9, 2.55, -0.7] },
    items() {
      return [tiles({ ttype: 'perforation', base: 'WD-NC-15', pattern: 'PF-NC-10', thickness: 25, grid: '15sil', gridColour: 'black' })];
    },
  },
  {
    key: 'edu-baffles', sector: 'Education', product: 'Blade baffles',
    label: 'Classroom — speech clarity grid',
    blurb: 'Even sky and sage PET blade coverage over the desks keeps every word from the front clear',
    scenario: 'edu-class',
    shot: { p: [3.5, 1.55, 3.0], g: [-0.7, 2.25, -0.8] },
    items() {
      return [
        baffles(-1.8, 1.5, { btype: 'blade', shape: 'standard', family: 'pet-solid', colour: 'PET-12', length: 2400, width: 100, spacing: 200, count: 7, drop: 0.3 }),
        baffles(1.8, 1.5, { btype: 'blade', shape: 'standard', family: 'pet-solid', colour: 'PET-09', length: 2400, width: 100, spacing: 200, count: 7, drop: 0.3 }),
        baffles(0, -2.2, { btype: 'blade', shape: 'standard', family: 'pet-solid', colour: 'PET-06', length: 1800, width: 100, spacing: 150, count: 3, drop: 0.32 }),
      ];
    },
  },
  {
    key: 'edu-clouds', sector: 'Education', product: 'Clouds',
    label: 'Library commons — mixed shapes',
    blurb: 'A big disc over every reading table with smaller satellites; hexagons over the lounge pod',
    scenario: 'edu-library',
    shot: { p: [4.8, 1.6, 3.8], g: [-1.1, 2.55, -1.1] },
    items() {
      const a = SCENARIOS['edu-library'].anchors;
      const items = [];
      const cols = ['Blue', 'Green', 'Yellow'];
      a.tables.forEach(([x, z], i) => {
        items.push(cloud(x, z, { shape: 'circle', size: 1200, colour: cols[i % 3], pattern: 'series-1', drop: 0.5 }));
        items.push(cloud(x + 1.3, z + 0.6, { shape: 'circle', size: 600, colour: cols[(i + 1) % 3], pattern: 'series-1', drop: 0.8 }));
      });
      const [px, pz] = a.pod;
      items.push(cloud(px - 0.5, pz - 0.3, { shape: 'hexagon', size: 900, colour: 'Green', pattern: 'series-4', drop: 0.6 }));
      items.push(cloud(px + 0.6, pz + 0.5, { shape: 'hexagon', size: 600, colour: 'Yellow', pattern: 'series-4', drop: 0.85 }));
      return items;
    },
  },
  {
    key: 'edu-wood', sector: 'Education', product: 'Ceiling tiles',
    label: 'Lecture hall — Vic Strip ceiling',
    blurb: 'Uni Vic Strip in Windsor Oak on black, alternating tile direction for a woven look',
    scenario: 'edu-lecture',
    shot: { p: [4.4, 1.6, 3.7], g: [-0.9, 2.65, -0.9] },
    items() {
      return [tiles({ ttype: 'vic-strip', base: 'black', pattern: 'Windsor Oak', variation: 'single', thickness: 25, grid: '15', gridColour: 'black', layout: 'alternating' })];
    },
  },
];

export function buildInspiration(key) {
  return INSPIRATIONS.find(i => i.key === key) || null;
}
