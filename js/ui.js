// Sidebar + toolbar UI — dropdown structure follows Ceiling_configurator_data.xlsx.
// app.js passes an `api` object; the UI reads state via refreshUI(...).
import { CUSTOM_TEXTURES } from './textures.js';
import { PRODUCT_TYPES, itemLabel } from './products.js';
import { MODEL_LIBRARY, getModel } from './models.js';
import { PRESETS, INSPIRATIONS } from './layouts.js';
import { SCENE_LIBRARY } from './scenes.js';
import {
  COLOUR_FAMILIES, VIC_STRIP, BAFFLE_TYPES, BAFFLE_SHARED,
  TILE_TYPES, TILE_SHARED, CLOUD_SHAPES, CLOUD_SHARED, familySwatches,
} from './catalog.js';

let api = null;
let els = {};

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    el.append(c);
  }
  return el;
}

const ICONS = {
  baffles: `<svg width="30" height="30" viewBox="0 0 30 30"><g fill="#41586e"><rect x="4" y="6" width="3.5" height="18" rx="1"/><rect x="11" y="6" width="3.5" height="18" rx="1"/><rect x="18" y="6" width="3.5" height="18" rx="1"/><rect x="25" y="6" width="3.5" height="18" rx="1" fill="#5b6770"/></g></svg>`,
  tiles: `<svg width="30" height="30" viewBox="0 0 30 30"><g fill="#c9a06d" stroke="#26262a" stroke-width="1"><rect x="3" y="3" width="11" height="11"/><rect x="16" y="3" width="11" height="11"/><rect x="3" y="16" width="11" height="11"/><rect x="16" y="16" width="11" height="11"/></g></svg>`,
  clouds: `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="3" y="4" width="10" height="10" rx="1.5" fill="#41586e"/><circle cx="21.5" cy="9" r="5.5" fill="#b5453a"/><path d="M9 18 L15 28 L3 28 Z" fill="#c8a13a"/><path d="M21 17 l5 3 v6 l-5 3 -5-3 v-6 Z" fill="#5d7a5a"/></svg>`,
  statement: `<svg width="30" height="30" viewBox="0 0 30 30"><path d="M3 20 Q10 8 15 15 T27 12" stroke="#5b6770" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M3 26 Q10 14 15 21 T27 18" stroke="#3a3f45" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
};

// label span with an optional hover explanation (dotted underline = has help)
const helpSpan = (label, help) => h('span', help ? { class: 'has-help', title: help } : {}, label);

function slider(label, { min, max, step, value, fmt = v => v, onInput, help }) {
  const valueEl = h('span', { class: 'ctl-value' }, String(fmt(value)));
  const input = h('input', {
    type: 'range', min, max, step, value,
    onpointerdown: () => api.beginChange(),
    oninput: e => {
      const v = parseFloat(e.target.value);
      valueEl.textContent = String(fmt(v));
      onInput(v);
    },
  });
  return h('div', { class: 'ctl' },
    h('div', { class: 'ctl-label' }, helpSpan(label, help), valueEl),
    input);
}

function selectRow(label, options, value, onChange, help) {
  const sel = h('select', { onchange: e => onChange(e.target.value) },
    ...options.map(o => {
      const opt = h('option', { value: o.value }, o.label);
      if (String(o.value) === String(value)) opt.selected = true;
      return opt;
    }));
  return h('div', { class: 'ctl' },
    h('div', { class: 'ctl-label' }, helpSpan(label, help)),
    sel);
}

function segmented(label, options, value, onChange, help) {
  return h('div', { class: 'ctl' },
    h('div', { class: 'ctl-label' }, helpSpan(label, help)),
    h('div', { class: 'seg' },
      ...options.map(o => h('button', {
        class: String(o.value) === String(value) ? 'active' : '',
        onclick: () => onChange(o.value),
      }, o.label))));
}

// swatch buttons for any family: solid hex, ombre gradient, wood tone, or upload
function swatchStyle(sw) {
  if (sw.upload) return `background-image:url(/textures/${sw.upload.file});background-size:cover`;
  if (sw.file) return `background-image:url(/textures/wood-classic/${sw.file});background-size:cover`;
  if (sw.from) return `background:linear-gradient(90deg, ${sw.from}, ${sw.to})`;
  return `background:${sw.hex || sw.base || '#888'}`;
}

function swatchRow(label, swatches, current, onPick, help) {
  const cur = swatches.find(s => s.code === current);
  return h('div', { class: 'ctl' },
    h('div', { class: 'ctl-label' },
      helpSpan(label, help),
      h('span', { class: 'ctl-value' }, cur ? (cur.label || cur.code) : '')),
    h('div', { class: 'swatches' },
      ...swatches.map(sw => h('button', {
        class: 'swatch' + (sw.code === current ? ' selected' : ''),
        style: swatchStyle(sw),
        title: sw.label || sw.code,
        onclick: () => onPick(sw.code),
      }))));
}

const mm = v => `${v} mm`;
const m = v => `${v.toFixed(2)} m`;
const deg = v => `${v}°`;
const mmOpts = arr => arr.map(v => ({ value: v, label: `${v} mm` }));

// ---------- in-panel product guide ----------
const PRODUCT_GUIDE = {
  baffles: {
    intro: 'Vertical acoustic fins hung in parallel runs. Four families: VMT (felt-wrapped all sides), Blade (PET, in Standard, Tapered and Flow profiles), Box (50 mm PET box section) and Embossed (patterned 40 mm fins). A 25 mm clearance to walls and between neighbouring baffles keeps the ceiling composition uniform.',
    terms: [
      ['Type', 'VMT — all sides wrapped, in Wood Classic, Designer Textiles, Concrete and Signature Ombre finishes. Blade — 12/25 mm PET. Box — 50 mm box profile. Embossed — 40 mm patterned face with its own layout presets.'],
      ['Shape (Blade)', 'Standard — constant depth. Tapered — depth runs from one value to another along the length (e.g. 100→200 mm), giving a sawtooth ceiling line. Flow — depth undulates 75–300 mm in a continuous wave.'],
      ['Thickness', 'The slab thickness of each fin. Options depend on the type; VMT width options change with thickness.'],
      ['Baffle length', 'The horizontal run of each fin: 1200–2780 mm (1200/1500 for Embossed).'],
      ['Baffle width', 'The vertical face depth of the hanging fin. Deeper fins absorb more low-mid frequencies.'],
      ['Colour', 'Finish family then swatch. Ombre finishes grade from one colour to another along the length. Designer Textiles also lists fabrics uploaded through the Admin panel.'],
      ['Direction', 'Runs the set vertically or horizontally relative to the room orientation.'],
      ['Mirror pattern', 'All straight, or alternate fins mirrored — designed for Ombre (gradient reverses fin to fin) and Tapered blades (sawtooth becomes a zigzag).'],
      ['Baffle spacing', 'Clear gap from fin edge to fin edge: 50–200 mm. Tighter spacing = more absorption per ceiling area.'],
      ['Suspension height', 'Slider — how far below the ceiling the fins hang.'],
    ],
  },
  tiles: {
    intro: 'A suspended lay-in tile ceiling that fills the whole room automatically. Choose the tile family and grid; then click any individual tile in the 3D view to change just that tile. All tiles are square-edge.',
    terms: [
      ['Type', 'Heritage (pressed patterns), Embossed, Wood Classic (WD-NC veneers), Rattan (cane weave), Uni Vic Strip (wood strips on a black or glacier-grey base, single or double), Perforation (PF-NC hole patterns over a Wood Classic base).'],
      ['Tile thickness', '12, 25 or 40 mm depending on type.'],
      ['Tile size', '600×600 mm or 600×1200 mm modules where available.'],
      ['Grid type', '15 mm or 24 mm exposed tee grid, or 15 mm silhouette — a slim recessed shadow-line profile.'],
      ['Grid colour', 'Black or white runners.'],
      ['Tile rotation', '0° or 90° — turns the pattern/grain direction of every tile.'],
      ['Layout', 'Straight — all tiles aligned. Alternating — every other tile rotated 90° (checkerboard grain). Custom — your per-tile edits.'],
      ['Per-tile editing', 'Click a tile in the 3D view: change its pattern or rotation alone, or reset it back to the global setting.'],
    ],
  },
  clouds: {
    intro: 'Horizontal 40 mm acoustic rafts suspended below the ceiling, most effective directly over the noise source. Four shapes with patterned faces from the Series range.',
    terms: [
      ['Shape & size', 'Square, Circle and Hexagon in 600/900/1200 mm; Triangle in 900/1200 mm.'],
      ['Edge detail', 'Embossed cloud edge — softly rounded; or a square-cut 40 mm VMT edge.'],
      ['Pattern', 'Series 1–5 embossed face patterns, or Designer Textiles fabric.'],
      ['Colour', 'Red, Blue, Green or Yellow base felt under the pattern.'],
      ['Rotation', '45° steps for dynamic compositions.'],
      ['Layout', 'Layouts 1–6 arrange a group of clouds around the selected one; Custom keeps your manual placement.'],
      ['Suspension height', 'Slider — the hanging depth below the ceiling. 300 mm+ of air gap improves absorption.'],
    ],
  },
};

const guideOpen = { baffles: false, tiles: false, clouds: false };

function guideBlock(type) {
  const g = PRODUCT_GUIDE[type];
  if (!g) return null;
  const dl = h('dl', {});
  for (const [term, text] of g.terms) dl.append(h('dt', {}, term), h('dd', {}, text));
  const det = h('details', { class: 'guide' },
    h('summary', {}, 'What do these settings mean?'),
    h('p', {}, g.intro),
    dl);
  det.open = guideOpen[type];
  det.addEventListener('toggle', () => { guideOpen[type] = det.open; });
  return det;
}

// ---------- baffles ----------
function baffleWidthOptions(p) {
  const bt = BAFFLE_TYPES[p.btype];
  if (!bt) return [150];
  if (p.btype === 'vmt') return bt.widthsByThickness[p.thickness] || bt.widthsByThickness[25];
  if (p.btype === 'blade') return bt.shapes[p.shape || 'standard'].widths;
  return bt.widths;
}

function baffleProps(p, setCommit) {
  const bt = BAFFLE_TYPES[p.btype];
  const rows = [];

  rows.push(selectRow('Type of baffles',
    Object.entries(BAFFLE_TYPES).map(([value, t]) => ({ value, label: t.label })),
    p.btype, v => {
      const nt = BAFFLE_TYPES[v];
      setCommit({
        btype: v, ...nt.defaults,
        shape: v === 'blade' ? 'standard' : null,
        layout: null,
        // embossed has no Fin model control (a stale model would be stuck);
        // other types default back to the uploaded product model
        model: v === 'embossed' ? null : (p.model || 'real-baffle'),
      });
    }, 'VMT, Blade, Box or Embossed — each with its own thickness, width and finish options.'));

  if (p.btype === 'blade') {
    rows.push(segmented('Shape of baffle',
      Object.entries(bt.shapes).map(([value, s]) => ({ value, label: s.label })),
      p.shape || 'standard', v => {
        const widths = bt.shapes[v].widths;
        setCommit({ shape: v, width: widths[0] });
      }, 'Standard, Tapered (depth runs end to end) or Flow (wave profile).'));
  }

  rows.push(selectRow('Thickness', mmOpts(bt.thicknesses), p.thickness, v => {
    const patch = { thickness: +v };
    if (p.btype === 'vmt') {
      const widths = bt.widthsByThickness[+v];
      if (!widths.includes(p.width)) patch.width = widths[0];
    }
    setCommit(patch);
  }));

  rows.push(selectRow('Baffle length', mmOpts(bt.lengths), p.length, v => setCommit({ length: +v })));

  const widths = baffleWidthOptions(p);
  rows.push(selectRow('Baffle width', widths.map(w => ({ value: w, label: typeof w === 'number' ? `${w} mm` : `${w} mm` })),
    p.width, v => setCommit({ width: widths.find(w => String(w) === String(v)) ?? +v }),
    'The vertical face depth of each fin.'));

  rows.push(selectRow('Colour family',
    bt.families.map(f => ({ value: f, label: COLOUR_FAMILIES[f].label })),
    p.family, v => setCommit({ family: v, colour: familySwatches(v, CUSTOM_TEXTURES)[0]?.code }),
    'Finish range; swatches update below.'));

  rows.push(swatchRow('Colour', familySwatches(p.family, CUSTOM_TEXTURES), p.colour,
    code => setCommit({ colour: code })));

  rows.push(segmented('Direction', BAFFLE_SHARED.directions, p.direction,
    v => setCommit({ direction: v }), 'Orientation of the runs relative to the room.'));

  rows.push(segmented('Mirror pattern', BAFFLE_SHARED.mirrors, p.mirror,
    v => setCommit({ mirror: v }), 'Alternate mirrored is designed for Ombre finishes and Tapered blades.'));

  rows.push(selectRow('Baffle spacing', mmOpts(BAFFLE_SHARED.spacings), p.spacing,
    v => setCommit({ spacing: +v }), 'Clear gap from baffle edge to baffle edge.'));

  rows.push(slider('Suspension height', {
    min: 0.1, max: 1.5, step: 0.05, value: p.drop, fmt: m,
    onInput: v => api.updateSelected({ params: { drop: v } }),
    help: 'Distance from the ceiling to the top of the fins.',
  }));

  rows.push(slider('Baffle count', {
    min: 2, max: 24, step: 1, value: p.count,
    onInput: v => api.updateSelected({ params: { count: v } }),
    help: 'Number of fins in this set.',
  }));

  if (p.btype === 'embossed') {
    rows.push(selectRow('Baffle layout',
      [{ value: '', label: '— pick a layout —' },
        ...bt.layouts.map(n => ({ value: n, label: `Layout ${n}` }))],
      p.layout || '', v => { if (v) api.applyBaffleLayout(+v); },
      'Arranges embossed baffle sets across the ceiling in preset compositions.'));
  }

  if (MODEL_LIBRARY.length && p.btype !== 'embossed') {
    rows.push(selectRow('Fin model',
      [{ value: '', label: 'Generic (parametric)' },
        ...MODEL_LIBRARY.map(md => ({ value: md.id, label: md.name }))],
      p.model || '', v => setCommit({ model: v || null }),
      'Use hardware or the full assembly from your uploaded 3D product model.'));
    const asm = p.model && p.model.endsWith('-assembly') ? getModel(p.model)?.assembly : null;
    if (asm) {
      rows.push(h('p', { class: 'panel-note' },
        `Placed exactly as authored — ${asm.size.x.toFixed(2)} × ${asm.size.z.toFixed(2)} m, hung flush. `
        + 'Pick a baffle below (or click one in 3D) to recolour it individually.'));
    }
  }
  return rows;
}

// per-blade editor for the full-assembly model: select by count, then recolour
const ASSEMBLY_FIN_FAMILIES = ['pet-solid', 'wood-classic', 'designer-textiles', 'colour-core-fabric', 'signature-ombre', 'vmt-solid'];

function assemblyFinProps(p, asm, selectedFin) {
  const rows = [];
  const units = asm.units || 0;
  if (!units) return rows;
  rows.push(selectRow('Select baffle (by count)',
    [{ value: '', label: '— none selected —' },
      ...Array.from({ length: units }, (_, i) => ({ value: i, label: `Baffle ${i + 1} of ${units}` }))],
    selectedFin && selectedFin.index < units ? selectedFin.index : '',
    v => api.selectFin(v === '' ? null : +v),
    'Blades are numbered left to right across the assembly. Clicking a blade in the 3D view selects it too.'));
  if (selectedFin && selectedFin.index < units) {
    const ov = p.finOverrides?.[selectedFin.index] || {};
    const famKey = ov.family || 'pet-solid';
    rows.push(h('div', { class: 'props-title', style: 'margin-top:8px' },
      `Selected baffle ${selectedFin.index + 1} of ${units}`));
    rows.push(selectRow('Fin colour family',
      ASSEMBLY_FIN_FAMILIES.map(f => ({ value: f, label: COLOUR_FAMILIES[f].label })),
      famKey, v => api.updateFin({ family: v, colour: familySwatches(v, CUSTOM_TEXTURES)[0]?.code })));
    rows.push(swatchRow('Fin colour', familySwatches(famKey, CUSTOM_TEXTURES),
      ov.colour || '', code => api.updateFin({ colour: code })));
    rows.push(h('div', { class: 'seg', style: 'margin-bottom:10px' },
      h('button', { onclick: () => api.resetFin() }, 'Reset to authored colour'),
    ));
  }
  return rows;
}

// ---------- ceiling tiles ----------
function tilePatternControls(p, setCommit, { forTile = false, value = {}, onPatch = null } = {}) {
  const tt = TILE_TYPES[p.ttype];
  const cur = k => (forTile ? (value[k] ?? p[k]) : p[k]);
  const patch = forTile ? onPatch : setCommit;
  const rows = [];
  if (p.ttype === 'vic-strip') {
    if (!forTile) {
      rows.push(segmented('Base colour',
        VIC_STRIP.bases.map(b => ({ value: b.code, label: b.label })),
        cur('base') || 'black', v => {
          const valid = VIC_STRIP.strips.filter(s => s.bases.includes(v));
          const okStrip = code => valid.some(s => s.code === code);
          // drop per-tile strip overrides that don't exist on the new base
          const overrides = {};
          for (const [k, ov] of Object.entries(p.overrides || {})) {
            if (ov.pattern && !okStrip(ov.pattern)) {
              const { pattern: _drop, ...rest } = ov;
              if (Object.keys(rest).length) overrides[k] = rest;
            } else overrides[k] = ov;
          }
          patch({ base: v, pattern: okStrip(cur('pattern')) ? cur('pattern') : valid[0].code, overrides });
        }, 'Strip finishes are available on a black or glacier-grey base.'));
      rows.push(segmented('Variation', tt.variations, cur('variation') || 'single',
        v => patch({ variation: v }), 'Single or double strip per module.'));
    }
    const strips = VIC_STRIP.strips.filter(s => s.bases.includes(cur('base') || 'black'));
    rows.push(swatchRow(forTile ? 'Tile strip colour' : 'Strip colour',
      strips.map(s => ({ code: s.code, hex: s.hex })), cur('pattern'),
      code => patch({ pattern: code })));
  } else if (p.ttype === 'perforation') {
    rows.push(swatchRow(forTile ? 'Tile base' : 'Base colour',
      COLOUR_FAMILIES['wood-classic'].swatches, cur('base') || 'WD-NC-13',
      code => patch({ base: code }), 'Wood Classic veneer behind the perforation.'));
    rows.push(selectRow(forTile ? 'Tile pattern' : 'Perforation pattern',
      tt.patterns.map(x => ({ value: x.code, label: x.code })), cur('pattern'),
      v => patch({ pattern: v }), 'PF-NC hole layouts — placeholders until real drawings arrive.'));
  } else if (p.ttype === 'wood-classic-tile') {
    rows.push(swatchRow(forTile ? 'Tile veneer' : 'Veneer',
      COLOUR_FAMILIES['wood-classic'].swatches, cur('pattern'),
      code => patch({ pattern: code })));
  } else {
    rows.push(selectRow(forTile ? 'Tile pattern' : 'Pattern',
      tt.patterns.map(x => ({ value: x.code, label: x.code })), cur('pattern'),
      v => patch({ pattern: v })));
  }
  return rows;
}

function tileProps(p, setCommit, selectedTile) {
  const tt = TILE_TYPES[p.ttype];
  const rows = [];
  rows.push(selectRow('Type of ceiling tiles',
    Object.entries(TILE_TYPES).map(([value, t]) => ({ value, label: t.label })),
    p.ttype, v => {
      const nt = TILE_TYPES[v];
      setCommit({ ttype: v, ...nt.defaults, overrides: {} });
    }));
  rows.push(selectRow('Tile thickness', mmOpts(tt.thicknesses), p.thickness, v => setCommit({ thickness: +v })));
  rows.push(...tilePatternControls(p, setCommit));
  rows.push(segmented('Tile size', tt.sizes.map(s => ({ value: s, label: s.replace('x', ' × ') + ' mm' })),
    p.size, v => setCommit({ size: v })));
  rows.push(selectRow('Grid type', TILE_SHARED.grids, p.grid, v => setCommit({ grid: v }),
    'Exposed tee width, or the recessed silhouette profile.'));
  rows.push(segmented('Grid colour', TILE_SHARED.gridColours, p.gridColour, v => setCommit({ gridColour: v })));
  rows.push(segmented('Tile rotation', TILE_SHARED.rotations.map(r => ({ value: r, label: r + '°' })),
    p.rotation, v => setCommit({ rotation: +v }), 'Turns the pattern/grain of every tile.'));
  rows.push(selectRow('Tile layout', TILE_SHARED.layouts, p.layout, v => setCommit({ layout: v }),
    'Straight, alternating (every other tile turned 90°), or custom per-tile edits.'));

  if (selectedTile) {
    const ov = p.overrides?.[selectedTile.key] || {};
    rows.push(h('div', { class: 'props-title', style: 'margin-top:12px' },
      `Selected tile ${selectedTile.key.replace(',', ' · ')}`));
    rows.push(...tilePatternControls(p, setCommit, {
      forTile: true, value: ov,
      onPatch: patch => api.updateTile(patch),
    }));
    rows.push(h('div', { class: 'seg', style: 'margin-bottom:10px' },
      h('button', { onclick: () => api.updateTile({ rotated: !ov.rotated }) },
        ov.rotated ? 'Un-rotate tile' : 'Rotate tile 90°'),
      h('button', { onclick: () => api.resetTile() }, 'Reset tile'),
    ));
  } else {
    rows.push(h('p', { class: 'panel-note' }, 'Click any tile in the 3D view to edit that tile individually.'));
  }
  return rows;
}

// ---------- clouds ----------
function cloudProps(p, setCommit, item) {
  const rows = [];
  rows.push(segmented('Shape',
    Object.entries(CLOUD_SHAPES).map(([value, s]) => ({ value, label: s.label })),
    p.shape, v => {
      const sizes = CLOUD_SHAPES[v].sizes;
      setCommit({ shape: v, size: sizes.includes(p.size) ? p.size : sizes[sizes.length - 1] });
    }));
  rows.push(selectRow('Size', CLOUD_SHAPES[p.shape].sizes.map(s => ({ value: s, label: s + ' mm' })),
    p.size, v => setCommit({ size: +v }), 'Side length (square/triangle/hexagon) or diameter (circle).'));
  rows.push(selectRow('Edge detail', CLOUD_SHARED.edges, p.edge, v => setCommit({ edge: v }),
    'Softly rounded embossed edge, or a square-cut 40 mm VMT edge.'));
  rows.push(selectRow('Pattern', CLOUD_SHARED.patterns, p.pattern, v => setCommit({ pattern: v }),
    'Series 1–5 embossed face patterns, or a Designer Textiles fabric.'));
  if (p.pattern !== 'designer') {
    rows.push(swatchRow('Colour', COLOUR_FAMILIES['cloud-colours'].swatches, p.colour,
      code => setCommit({ colour: code })));
  }
  rows.push(selectRow('Cloud rotation', CLOUD_SHARED.rotations.map(r => ({ value: r, label: r + '°' })),
    ((item.rotY ?? 0) % 360 + 360) % 360, v => api.updateSelected({ rotY: +v }, { commit: true }),
    '45° steps.'));
  rows.push(selectRow('Layout',
    [{ value: '', label: 'Custom (as placed)' },
      ...CLOUD_SHARED.layouts.map(n => ({ value: n, label: `Layout ${n}` }))],
    '', v => { if (v) api.applyCloudLayout(+v); },
    'Arranges a group of clouds around this one in preset compositions.'));
  rows.push(slider('Suspension height', {
    min: 0.15, max: 1.5, step: 0.05, value: p.drop, fmt: m,
    onInput: v => api.updateSelected({ params: { drop: v } }),
  }));
  rows.push(h('p', { class: 'panel-note' }, 'Thickness: 40 mm (per specification).'));
  return rows;
}

// ---------- panel assembly ----------
// per-fin editor: colour, width and suspension for one selected fin
function finProps(p, selectedFin) {
  const bt = BAFFLE_TYPES[p.btype];
  const ov = p.finOverrides?.[selectedFin.index] || {};
  const famKey = ov.family || p.family;
  const widths = baffleWidthOptions(p);
  const rows = [];
  rows.push(h('div', { class: 'props-title', style: 'margin-top:12px' },
    `Selected baffle ${selectedFin.index + 1} of ${p.count}`));
  rows.push(selectRow('Fin colour family',
    bt.families.map(f => ({ value: f, label: COLOUR_FAMILIES[f].label })),
    famKey, v => api.updateFin({ family: v, colour: familySwatches(v, CUSTOM_TEXTURES)[0]?.code })));
  rows.push(swatchRow('Fin colour', familySwatches(famKey, CUSTOM_TEXTURES),
    ov.colour || p.colour, code => api.updateFin({ colour: code })));
  rows.push(selectRow('Fin width',
    widths.map(w => ({ value: w, label: `${w} mm` })),
    ov.width ?? p.width,
    v => api.updateFin({ width: widths.find(w => String(w) === String(v)) ?? +v }),
    'Face depth of just this fin.'));
  rows.push(slider('Fin suspension', {
    min: 0.1, max: 1.5, step: 0.05, value: ov.drop ?? p.drop, fmt: m,
    onInput: v => api.updateFin({ drop: v }, false),
    help: 'Hang just this fin deeper or shallower — staggered compositions.',
  }));
  rows.push(h('div', { class: 'seg', style: 'margin-bottom:10px' },
    h('button', { onclick: () => api.resetFin() }, 'Reset fin'),
  ));
  rows.push(h('p', { class: 'panel-note' }, 'Click another fin in the 3D view to edit it, or press Esc to go back to the whole set.'));
  return rows;
}

function propsFor(item, selectedTile, selectedFin) {
  const p = item.params;
  const setCommit = patch => api.updateSelected({ params: patch }, { commit: true });
  const rows = [h('div', { class: 'props-title' }, itemLabel(item),
    h('span', { class: 'props-sub' }, `#${item.id}`))];
  const guide = guideBlock(item.type);
  if (guide) rows.push(guide);

  if (item.type === 'baffles') {
    rows.push(...baffleProps(p, setCommit));
    const isAssembly = p.model && p.model.endsWith('-assembly');
    if (isAssembly) {
      const asm = getModel(p.model)?.assembly;
      if (asm) rows.push(...assemblyFinProps(p, asm, selectedFin));
    } else if (selectedFin && p.btype && selectedFin.index < p.count) {
      rows.push(...finProps(p, selectedFin));
    } else {
      rows.push(h('p', { class: 'panel-note' }, 'Click any single fin in the 3D view to edit just that baffle.'));
    }
    rows.push(slider('Rotation', { min: 0, max: 345, step: 15, value: item.rotY || 0, fmt: deg,
      onInput: v => api.updateSelected({ rotY: v }),
      help: 'Turns the set on plan in 15° steps (shortcut: R).' }));
  } else if (item.type === 'tiles') {
    rows.push(...tileProps(p, setCommit, selectedTile));
  } else if (item.type === 'clouds') {
    rows.push(...cloudProps(p, setCommit, item));
  }
  return rows;
}

function renderArrange() {
  const num = (label, value, min, max) => {
    const input = h('input', { type: 'number', value, min, max, step: label.startsWith('Spacing') ? 0.1 : 1 });
    return { input, wrap: h('div', {}, h('div', { class: 'ctl-label' }, h('span', {}, label)), input) };
  };
  const rows = num('Rows', 2, 1, 15);
  const cols = num('Columns', 2, 1, 15);
  const sx = num('Spacing X (m)', 1.6, 0.2, 10);
  const sz = num('Spacing Z (m)', 1.6, 0.2, 10);
  const clamped = (el, parse) => {
    const v = parse(el.value);
    const lo = parseFloat(el.min), hi = parseFloat(el.max);
    return Number.isNaN(v) ? lo : Math.min(hi, Math.max(lo, v));
  };
  els.arrangeBody.replaceChildren(
    h('div', { class: 'arrange-grid' }, rows.wrap, cols.wrap, sx.wrap, sz.wrap),
    h('button', {
      onclick: () => api.arraySelected(
        clamped(rows.input, parseInt), clamped(cols.input, parseInt),
        clamped(sx.input, parseFloat), clamped(sz.input, parseFloat)),
    }, 'Duplicate as array'),
    h('p', { class: 'panel-note' }, 'Duplicates the selection into a rows × columns grid — a multi-selection repeats as one cluster.'),
  );
}

const SCENARIO_LABELS = {
  'office-realistic': 'Office — executive open plan',
  'office-open': 'Office — open plan desks',
  'office-teams': 'Office — team bays',
  'office-board': 'Boardroom',
  'hosp-dining': 'Restaurant',
  'hosp-lounge': 'Hotel lounge',
  'hosp-fine': 'Fine dining',
  'edu-class': 'Classroom',
  'edu-library': 'Library commons',
  'edu-lecture': 'Lecture hall',
};

function renderRoom(state) {
  const room = state.room;
  const rows = [];
  rows.push(selectRow('Scene',
    [{ value: '', label: 'Default room' },
      ...Object.entries(SCENARIO_LABELS).map(([k, label]) => ({ value: 'sc:' + k, label: label + ' (built-in)' })),
      ...SCENE_LIBRARY.map(s => ({ value: s.id, label: s.name }))],
    state.sceneId || (state.scenario ? 'sc:' + state.scenario : ''),
    v => api.setScene(v || null),
    'Load a furnished environment — built-in sets or imported 3D scenes. Products place on the ceiling.'));
  if (state.sceneId) {
    rows.push(h('p', { class: 'panel-note' },
      `Imported scene: ${room.w.toFixed(1)} × ${room.l.toFixed(1)} m, ceiling detected at ${room.h.toFixed(2)} m. `
      + 'Room sliders are disabled while a scene is loaded.'));
  } else {
    rows.push(
      slider('Width', { min: 4, max: 24, step: 0.5, value: room.w, fmt: m, onInput: v => api.setRoom({ w: v }) }),
      slider('Length', { min: 4, max: 24, step: 0.5, value: room.l, fmt: m, onInput: v => api.setRoom({ l: v }) }),
      slider('Ceiling height', { min: 2.6, max: 6, step: 0.1, value: room.h, fmt: m, onInput: v => api.setRoom({ h: v }) }),
    );
  }
  els.roomBody.replaceChildren(...rows);
}

let toolbarButtons = {};

function renderToolbar() {
  const views = document.getElementById('tb-views');
  const toggles = document.getElementById('tb-toggles');
  const actions = document.getElementById('tb-actions');

  const vb = name => h('button', { onclick: () => api.setView(name.toLowerCase()) }, name);
  views.append(vb('Orbit'), vb('Look up'), vb('Plan'));

  toolbarButtons.grid = h('button', { onclick: () => api.toggleGrid() }, 'Grid');
  toolbarButtons.snap = h('button', { onclick: () => api.toggleSnap() }, 'Snap');
  toggles.append(toolbarButtons.grid, toolbarButtons.snap);

  toolbarButtons.undo = h('button', { onclick: () => api.undo(), title: 'Ctrl+Z' }, 'Undo');
  toolbarButtons.dup = h('button', { onclick: () => api.duplicateSelected(), title: 'Ctrl+D' }, 'Duplicate');
  toolbarButtons.del = h('button', { class: 'danger', onclick: () => api.deleteSelected(), title: 'Delete' }, 'Delete');
  const clear = h('button', { class: 'danger', onclick: () => api.clearAll() }, 'Clear all');
  const save = h('button', { onclick: () => api.save() }, 'Save');
  const load = h('button', { onclick: () => api.load() }, 'Load');
  const png = h('button', { onclick: () => api.screenshot() }, 'PNG');
  const admin = h('a', { class: 'btn-link', href: 'admin.html', target: '_blank', title: 'Texture library admin' }, 'Admin ↗');
  actions.append(toolbarButtons.undo, toolbarButtons.dup, toolbarButtons.del, clear, save, load, png, admin);
}

export function initUI(theApi) {
  api = theApi;
  els = {
    productCards: document.getElementById('product-cards'),
    presetButtons: document.getElementById('preset-buttons'),
    propsBody: document.getElementById('props-body'),
    arrangeBody: document.getElementById('arrange-body'),
    roomBody: document.getElementById('room-body'),
    panelProps: document.getElementById('panel-props'),
    panelArrange: document.getElementById('panel-arrange'),
    hint: document.getElementById('hint'),
  };

  for (const [type, def] of Object.entries(PRODUCT_TYPES)) {
    const card = h('button', {
      class: 'product-card' + (def.disabled ? ' disabled-card' : ''),
      onclick: () => { if (!def.disabled) api.startPlacing(type); },
    },
      h('span', { html: ICONS[type] || '' }),
      h('span', {},
        h('span', { class: 'pc-label' }, def.label),
        h('span', { class: 'pc-hint' }, def.hint)),
    );
    if (def.disabled) card.disabled = true;
    els.productCards.append(card);
  }

  for (const preset of PRESETS) {
    els.presetButtons.append(h('button', { onclick: () => api.applyPreset(preset.key) }, preset.label));
  }

  renderToolbar();
  renderArrange();
  renderInspiration();
}

// "✨ Inspiration" gallery
function renderInspiration() {
  const strip = h('div', { id: 'insp-strip' });
  strip.hidden = true;
  for (const insp of INSPIRATIONS) {
    strip.append(h('button', {
      class: 'insp-card',
      title: `${insp.blurb}. Applies a full scene — Ctrl+Z restores your current design.`,
      onclick: () => api.applyInspiration(insp.key),
    },
      h('img', { src: `assets/inspiration/${insp.key}.jpg`, alt: insp.label, loading: 'lazy' }),
      h('span', { class: 'insp-meta' },
        h('span', { class: 'insp-sector' }, `${insp.sector} · ${insp.product}`),
        h('span', { class: 'insp-name' }, insp.label)),
    ));
  }
  const toggle = h('button', { id: 'insp-toggle', onclick: () => {
    strip.hidden = !strip.hidden;
    toggle.classList.toggle('active', !strip.hidden);
  } }, '✨ Inspiration');
  document.getElementById('viewport').append(
    h('div', { id: 'inspiration' }, strip, toggle));
}

export function refreshUI(state, selectedItems = [], selectedTile = null, selectedFin = null) {
  const count = selectedItems.length;
  if (count === 1) {
    els.propsBody.replaceChildren(...propsFor(selectedItems[0], selectedTile, selectedFin));
  } else if (count > 1) {
    const byType = {};
    for (const it of selectedItems) {
      const label = itemLabel(it);
      byType[label] = (byType[label] || 0) + 1;
    }
    els.propsBody.replaceChildren(
      h('div', { class: 'props-title' }, `${count} items selected`),
      h('p', { class: 'empty-note' },
        Object.entries(byType).map(([label, n]) => `${label} × ${n}`).join(' · ')),
      h('p', { class: 'panel-note' },
        'Drag any selected item to move the group. “Duplicate as array” tiles the whole selection. Ctrl-click adds or removes items; click empty ceiling to clear.'),
    );
  } else {
    els.propsBody.replaceChildren(
      h('p', { class: 'empty-note' }, 'Nothing selected. Click a product in the scene (Ctrl-click for several), or add one from Products above.'));
  }
  els.panelProps.classList.toggle('disabled', count === 0);
  els.panelArrange.classList.toggle('disabled', count === 0);
  renderRoom(state);
  toolbarButtons.grid.classList.toggle('active', state.grid);
  toolbarButtons.snap.classList.toggle('active', state.snap);
  toolbarButtons.dup.disabled = count === 0;
  toolbarButtons.del.disabled = count === 0;
}

let hintTimer = null;
export function setHint(html, sticky = false) {
  const hint = document.getElementById('hint');
  hint.innerHTML = html || '';
  clearTimeout(hintTimer);
  if (html && !sticky) hintTimer = setTimeout(() => { hint.innerHTML = ''; }, 6000);
}
