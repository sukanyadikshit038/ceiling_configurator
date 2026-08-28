// Product builders — driven by js/catalog.js (the spec workbook).
// Items: 'baffles' (VMT/Blade/Box/Embossed sets), 'tiles' (full-ceiling grid),
// 'clouds' (square/circle/hexagon/triangle). All spec dimensions arrive in mm.
import * as THREE from 'three';
import { catalogTexture, customTexture, customTextureMeta, realWood, WOOD_SHEET } from './textures.js';
import { COLOUR_FAMILIES, VIC_STRIP, PF_PATTERNS, BAFFLE_TYPES, TILE_TYPES, CLOUD_SHAPES } from './catalog.js';
import { getModel } from './models.js';

export const PRODUCT_TYPES = {
  baffles: { label: 'Baffles', hint: 'VMT · Blade · Box · Embossed' },
  tiles: { label: 'Ceiling Tiles', hint: 'Grid system — fills the whole ceiling' },
  clouds: { label: 'Clouds', hint: 'Square · Circle · Hexagon · Triangle' },
  statement: { label: 'Statement Solution (Horizon)', hint: 'Coming soon', disabled: true },
};

const MM = 0.001;

export function defaultParams(type) {
  switch (type) {
    case 'baffles':
      return {
        btype: 'vmt', shape: null, thickness: 25, width: 150, length: 2400,
        family: 'wood-classic', colour: 'WD-NC-13', direction: 'vertical',
        mirror: 'straight', spacing: 100, drop: 0.45, count: 8, layout: null,
        // the uploaded product model's clips + hanger rods by default
        // (falls back to plain wires if the model library isn't loaded)
        model: 'real-baffle',
        finOverrides: {}, // per-fin edits keyed by fin index: {family, colour, width, drop}
      };
    case 'tiles':
      return {
        ttype: 'wood-classic-tile', thickness: 25, size: '600x600', pattern: 'WD-NC-13',
        base: null, variation: null, grid: '24', gridColour: 'white',
        rotation: 0, layout: 'straight', overrides: {},
      };
    case 'clouds':
      return { shape: 'square', size: 900, thickness: 40, edge: 'vmt', pattern: 'series-1', colour: 'Blue', drop: 0.55 };
    default:
      throw new Error('unknown product type: ' + type);
  }
}

export function itemLabel(item) {
  const p = item.params || {}; // placement hints pass {type} only
  if (item.type === 'baffles') return BAFFLE_TYPES[p.btype]?.label || PRODUCT_TYPES.baffles.label;
  if (item.type === 'tiles') return p.ttype ? (TILE_TYPES[p.ttype]?.label || 'Ceiling Tiles') + ' ceiling' : PRODUCT_TYPES.tiles.label;
  if (item.type === 'clouds') return p.shape ? (CLOUD_SHAPES[p.shape]?.label || 'Cloud') + ' cloud' : PRODUCT_TYPES.clouds.label;
  return PRODUCT_TYPES[item.type]?.label ?? item.type;
}

// ---------- shared materials ----------
const WIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.6 });
WIRE_MAT.userData.shared = true;
const HARDWARE_MAT = new THREE.MeshStandardMaterial({ color: 0xd9dadb, roughness: 0.45, metalness: 0.25 });
HARDWARE_MAT.userData.shared = true;
const ROD_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4f54, roughness: 0.4, metalness: 0.6 });
ROD_MAT.userData.shared = true;

// ---------- finish resolution ----------
function swatchOf(familyKey, code) {
  return COLOUR_FAMILIES[familyKey]?.swatches.find(s => s.code === code) || COLOUR_FAMILIES[familyKey]?.swatches[0];
}

// material for a baffle/cloud finish; returns fresh material (cloned texture)
function finishMaterial(family, colour, { repeatX = 1, repeatY = 1, flip = false } = {}) {
  let tex = null, rough = 0.92;
  if (colour && colour.startsWith('upload:')) {
    const id = colour.slice(7);
    const meta = customTextureMeta(id);
    const src = meta && customTexture(id);
    if (src) {
      tex = src.clone();
      const s = meta.scale || 0.5;
      tex.repeat.set(repeatX / s, repeatY / s);
    }
  }
  if (!tex) {
    const fam = COLOUR_FAMILIES[family] || COLOUR_FAMILIES['pet-solid'];
    const sw = swatchOf(family, colour) || {};
    switch (fam.kind) {
      case 'wood': tex = catalogTexture({ kind: 'wood', base: sw.base, grain: sw.grain, code: sw.code }); rough = 0.55; break;
      case 'concrete': tex = catalogTexture({ kind: 'concrete', hex: sw.hex }); rough = 0.85; break;
      case 'ombre': tex = catalogTexture({ kind: 'ombre', from: sw.from, to: sw.to }); break;
      case 'textile': tex = catalogTexture({ kind: 'textile', hex: sw.hex }); break;
      default: tex = catalogTexture({ kind: 'felt', hex: sw.hex });
    }
    tex = tex.clone();
    tex.repeat.set(repeatX, repeatY);
  }
  if (flip) {
    tex.repeat.x = -Math.abs(tex.repeat.x);
    tex.offset.x = 1;
  }
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0 });
}

// ---------- baffles ----------
function parseWidth(width) {
  // 150 -> uniform · '100-200' -> tapered from/to (fin depth in mm)
  if (typeof width === 'number') return { a: width, b: width };
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(width));
  return m ? { a: +m[1], b: +m[2] } : { a: 150, b: 150 };
}

// profile geometry: fin length along X, depth hanging down (−Y), thickness in Z
function finGeometry(p) {
  const L = p.length * MM;
  const t = p.thickness * MM;
  const { a, b } = parseWidth(p.width);
  const dA = a * MM, dB = b * MM;
  const maxD = Math.max(dA, dB);
  if (p.btype === 'blade' && p.shape === 'flow') {
    // depth undulates 75..300 mm along the run
    const lo = 0.075, hi = 0.3;
    const shape = new THREE.Shape();
    shape.moveTo(-L / 2, 0);
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const x = -L / 2 + (i / steps) * L;
      const d = lo + (hi - lo) * (0.5 + 0.5 * Math.sin((i / steps) * Math.PI * 2 - Math.PI / 2));
      shape.lineTo(x, -d);
    }
    shape.lineTo(L / 2, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    normalizeProfileUV(geo, L, hi);
    geo.translate(0, 0, -t / 2);
    return { geo, maxDepth: hi };
  }
  if (p.btype === 'blade' && p.shape === 'tapered') {
    const shape = new THREE.Shape();
    shape.moveTo(-L / 2, 0);
    shape.lineTo(-L / 2, -dA);
    shape.lineTo(L / 2, -dB);
    shape.lineTo(L / 2, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    normalizeProfileUV(geo, L, maxD);
    geo.translate(0, 0, -t / 2);
    return { geo, maxDepth: maxD };
  }
  const geo = new THREE.BoxGeometry(L, dA, t);
  geo.translate(0, -dA / 2, 0);
  return { geo, maxDepth: dA };
}

function normalizeProfileUV(geo, L, maxD) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / L + 0.5, uv.getY(i) / maxD + 1);
  }
  uv.needsUpdate = true;
}

// Real veneer sheet, applied per the production cutting logic: the fin is a
// vertical strip cut along the sheet's grain, wrapped around the blank.
// Grain runs along the fin length; each successive fin takes the next strip
// across the sheet so neighbouring fins vary naturally.
function realWoodFinMaterial(code, lengthMM, depthMM, finIndex, flip) {
  const rw = realWood(code);
  if (!rw) return null;
  const tex = rw.tex.clone();
  const repX = (lengthMM * MM) / WOOD_SHEET.h; // along grain
  const repY = Math.min(1, (depthMM * MM) / WOOD_SHEET.w); // strip width
  tex.repeat.set(flip ? -repX : repX, repY);
  const strips = Math.max(1, Math.floor(1 / repY));
  tex.offset.set(flip ? repX : 0, (finIndex % strips) * repY);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0 });
}

function baffleFinMaterial(p, flip) {
  const { a, b } = parseWidth(p.width);
  const isEmboss = p.btype === 'embossed';
  if (isEmboss) {
    const sw = swatchOf(p.family, p.colour) || {};
    const tex = catalogTexture({ kind: 'embossc', code: 'EM-A', hex: sw.hex || '#41586e' }).clone();
    tex.repeat.set(p.length / 600, 1);
    if (flip) { tex.repeat.x = -Math.abs(tex.repeat.x); tex.offset.x = 1; }
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
  }
  return finishMaterial(p.family, p.colour, {
    repeatX: p.family && COLOUR_FAMILIES[p.family]?.kind === 'ombre' ? 1 : (p.length * MM) / 0.5,
    repeatY: Math.max(1, (Math.max(a, b) * MM) / 0.5),
    flip,
  });
}

// The complete uploaded model, hung as authored. Blade units are selectable
// (userData.finIndex) and honour per-fin colour overrides; clips/rods keep
// their authored hardware colours.
function buildAssembly(asm, p) {
  const g = new THREE.Group();
  const matCache = new Map();
  const fo = (p && p.finOverrides) || {};
  for (const part of asm.parts) {
    let mat;
    const ov = part.isBlade && part.unit != null ? fo[part.unit] : null;
    if (ov && (ov.colour || ov.family)) {
      const famKey = ov.family || 'pet-solid';
      const colour = ov.colour;
      const key = 'ov|' + part.unit + '|' + famKey + '|' + colour;
      if (!matCache.has(key)) {
        let m = null;
        if (COLOUR_FAMILIES[famKey]?.kind === 'wood' && realWood(colour)) {
          m = realWoodFinMaterial(colour, asm.size.z * 1000, part.size.y * 1000, part.unit, false);
        } else {
          m = finishMaterial(famKey, colour, {
            repeatX: Math.max(1, asm.size.z / 0.5),
            repeatY: Math.max(1, part.size.y / 0.5),
          });
        }
        matCache.set(key, m);
      }
      mat = matCache.get(key);
    } else {
      if (!matCache.has(part.color)) {
        matCache.set(part.color, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.85 }));
      }
      mat = matCache.get(part.color);
    }
    const mesh = new THREE.Mesh(part.geometry, mat);
    mesh.position.y = -0.02;
    if (part.unit != null) mesh.userData.finIndex = part.unit;
    g.add(mesh);
  }
  return g;
}

function buildBaffles(p) {
  const model = p.model ? getModel(p.model) : null;
  if (model && model.assembly) return buildAssembly(model.assembly, p);
  const g = new THREE.Group();
  const t = p.thickness * MM;
  const pitch = (p.spacing * MM) + t; // spacing is edge-to-edge per spec
  const span = (p.count - 1) * pitch;
  const L = p.length * MM;
  const matA = baffleFinMaterial(p, false);
  const matB = p.mirror === 'alternate' ? baffleFinMaterial(p, true) : matA;
  const wireGeo = new THREE.CylinderGeometry(0.005, 0.005, p.drop, 6);
  let sharedGeo = null;
  const geoMirrors = p.btype === 'blade' && (p.shape === 'tapered' || p.shape === 'flow');
  const finOv = p.finOverrides || {};
  const ovMatCache = new Map();
  for (let i = 0; i < p.count; i++) {
    const z = -span / 2 + i * pitch;
    const mirrored = p.mirror === 'alternate' && i % 2 === 1;
    const ov = finOv[i];
    const finP = ov ? { ...p, ...ov } : p;
    const finDrop = finP.drop;
    // per-fin width override needs its own geometry; otherwise share one
    let geo;
    if (ov && ov.width !== undefined) {
      geo = finGeometry(finP).geo;
    } else {
      if (!sharedGeo) sharedGeo = finGeometry(p).geo;
      geo = sharedGeo;
    }
    // profile shapes mirror at the MESH so the renderer flips winding for us
    // (baking scale(-1) into the geometry would render fins inside-out);
    // the mesh mirror also flips the texture, so matB stays for flat fins only
    let mat;
    const effFamily = (ov && ov.family) || p.family;
    const effColour = (ov && ov.colour) || p.colour;
    const { a: wa, b: wb } = parseWidth(finP.width);
    if (p.btype !== 'embossed' && COLOUR_FAMILIES[effFamily]?.kind === 'wood' && realWood(effColour)) {
      // real veneer: per-fin strip cut from the sheet
      mat = realWoodFinMaterial(effColour, finP.length, Math.max(wa, wb), i, mirrored && !geoMirrors);
    } else if (ov && (ov.colour || ov.family)) {
      const key = effFamily + '|' + effColour + '|' + (mirrored && !geoMirrors);
      if (!ovMatCache.has(key)) ovMatCache.set(key, baffleFinMaterial(finP, mirrored && !geoMirrors));
      mat = ovMatCache.get(key);
    } else {
      mat = mirrored && !geoMirrors ? matB : matA;
    }
    const fin = new THREE.Mesh(geo, mat);
    if (mirrored && geoMirrors) fin.scale.x = -1;
    fin.position.set(0, -finDrop, z);
    fin.userData.finIndex = i;
    g.add(fin);
    if (model && model.parts && model.parts.carrier) {
      const carrier = model.parts.carrier;
      const rod = model.parts.rod;
      const n = Math.max(2, Math.round(L / 1.5));
      for (let k = 0; k < n; k++) {
        const tt = n === 1 ? 0.5 : k / (n - 1);
        const x = -L / 2 + (0.08 + 0.84 * tt) * L;
        const cm = new THREE.Mesh(carrier.geometry, HARDWARE_MAT);
        cm.rotation.y = Math.PI / 2;
        cm.position.set(x, -finDrop, z);
        g.add(cm);
        if (rod) {
          const rm = new THREE.Mesh(rod.geometry, ROD_MAT);
          rm.scale.y = Math.max(0.05, (finDrop - carrier.size.y * 0.4) / rod.size.y);
          rm.position.set(x, -(finDrop - carrier.size.y * 0.4) / 2, z);
          g.add(rm);
        }
      }
    } else {
      const finWireGeo = finDrop === p.drop ? wireGeo : new THREE.CylinderGeometry(0.005, 0.005, finDrop, 6);
      for (const sx of [-L * 0.4, L * 0.4]) {
        const wire = new THREE.Mesh(finWireGeo, WIRE_MAT);
        wire.position.set(sx, -finDrop / 2, z);
        g.add(wire);
      }
    }
  }
  if (p.direction === 'horizontal') g.rotation.y = Math.PI / 2;
  return g;
}

// ---------- ceiling tiles (full-room lay-in grid) ----------
function tileTexture(p, override = {}) {
  const ttype = p.ttype;
  const pattern = override.pattern ?? p.pattern;
  const base = override.base ?? p.base;
  const variation = override.variation ?? p.variation;
  switch (ttype) {
    case 'heritage': return { tex: catalogTexture({ kind: 'heritage', code: pattern }), rough: 0.75 };
    case 'embossed-tile': return { tex: catalogTexture({ kind: 'emboss', code: pattern }), rough: 0.85 };
    case 'wood-classic-tile': {
      const sw = swatchOf('wood-classic', pattern) || {};
      return { tex: catalogTexture({ kind: 'wood', base: sw.base, grain: sw.grain, code: sw.code }), rough: 0.55 };
    }
    case 'rattan': return { tex: catalogTexture({ kind: 'rattan', code: pattern }), rough: 0.85 };
    case 'vic-strip': {
      const baseHex = (VIC_STRIP.bases.find(b => b.code === base) || VIC_STRIP.bases[0]).hex;
      const stripHex = (VIC_STRIP.strips.find(s => s.code === pattern) || VIC_STRIP.strips[0]).hex;
      return { tex: catalogTexture({ kind: 'vic', base: baseHex, strip: stripHex, variation: variation || 'single' }), rough: 0.6 };
    }
    case 'perforation': {
      const sw = swatchOf('wood-classic', base || 'WD-NC-13') || {};
      const pf = PF_PATTERNS.find(x => x.code === pattern) || PF_PATTERNS[0];
      return { tex: catalogTexture({ kind: 'perf', code: sw.code, base: sw.base, grain: sw.grain, pf }), rough: 0.55 };
    }
    default: return { tex: catalogTexture({ kind: 'felt', hex: '#dddddd' }), rough: 0.9 };
  }
}

function buildTileGrid(p, room) {
  const g = new THREE.Group();
  const [aMM, bMM] = p.size.split('x').map(Number);
  const rot90 = (p.rotation === 90);
  const modW = (rot90 ? bMM : aMM) * MM;   // along room X
  const modL = (rot90 ? aMM : bMM) * MM;   // along room Z
  const thick = p.thickness * MM;
  const gridW = (p.grid === '24' ? 24 : 15) * MM;
  const silhouette = p.grid === '15sil';
  const gridHex = silhouette ? '#1c1c1e'
    : (p.gridColour === 'black' ? '#26262a' : '#f2f3f4');
  const gridMat = new THREE.MeshStandardMaterial({ color: gridHex, roughness: 0.5, metalness: 0.3 });

  const cols = Math.ceil(room.w / modW);
  const rows = Math.ceil(room.l / modL);
  const x0 = -room.w / 2, z0 = -room.l / 2;
  const faceY = -0.03; // grid face below the slab (group origin at ceiling)
  const tileY = faceY + 0.012;

  // per-pattern material cache; per-tile overrides get their own
  const matCache = new Map();
  const matFor = (override) => {
    const key = JSON.stringify(override || {});
    if (matCache.has(key)) return matCache.get(key);
    const { tex, rough } = tileTexture(p, override || {});
    const mat = new THREE.MeshStandardMaterial({ map: tex.clone(), roughness: rough, metalness: 0 });
    // rotation turns the pattern/grain in the texture, never the mesh —
    // meshes are cell-sized (incl. cut edge tiles), so spinning them would
    // overlap neighbours. Global 0/90 and per-tile rotation compose (XOR).
    if (!!rot90 !== !!(override && override.rotated)) {
      mat.map.center.set(0.5, 0.5);
      mat.map.rotation = Math.PI / 2;
    }
    mat.map.needsUpdate = true;
    matCache.set(key, mat);
    return mat;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = Math.min(modW, room.w - c * modW);
      const l = Math.min(modL, room.l - r * modL);
      if (w < 0.02 || l < 0.02) continue;
      const key = r + ',' + c;
      const override = { ...(p.overrides?.[key] || {}) };
      if (p.layout === 'alternating' && (r + c) % 2 === 1 && override.rotated === undefined) {
        override.rotated = true;
      }
      const mat = matFor(override);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(w, thick, l), mat);
      tile.position.set(x0 + c * modW + w / 2, tileY - thick / 2, z0 + r * modL + l / 2);
      tile.userData.tileKey = key;
      g.add(tile);
    }
  }

  // runners
  const runH = 0.03;
  const mkRun = (wx, lz, x, z) => {
    const run = new THREE.Mesh(new THREE.BoxGeometry(wx, runH, lz), gridMat);
    run.position.set(x, faceY + runH / 2 - 0.012, z);
    run.userData.grid = true;
    g.add(run);
  };
  for (let c = 0; c <= cols; c++) {
    const x = Math.min(x0 + c * modW, room.w / 2);
    mkRun(gridW, room.l, x, 0);
  }
  for (let r = 0; r <= rows; r++) {
    const z = Math.min(z0 + r * modL, room.l / 2);
    mkRun(room.w, gridW, 0, z);
  }
  g.userData.isTileGrid = true;
  return g;
}

// ---------- clouds ----------
function cloudShapePath(shape, size) {
  const s = size * MM;
  const path = new THREE.Shape();
  if (shape === 'square') {
    path.moveTo(-s / 2, -s / 2);
    path.lineTo(s / 2, -s / 2);
    path.lineTo(s / 2, s / 2);
    path.lineTo(-s / 2, s / 2);
    path.closePath();
  } else if (shape === 'circle') {
    path.absarc(0, 0, s / 2, 0, Math.PI * 2, false);
  } else if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * s / 2, y = Math.sin(a) * s / 2;
      i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    path.closePath();
  } else { // triangle (equilateral, side = size)
    const rOut = s / Math.sqrt(3);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      const x = Math.cos(a) * rOut, y = Math.sin(a) * rOut;
      i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    path.closePath();
  }
  return path;
}

function cloudMaterial(p) {
  const sw = swatchOf('cloud-colours', p.colour) || { hex: '#41586e' };
  if (p.pattern === 'designer') {
    return finishMaterial('designer-textiles', 'DT-02', { repeatX: 2, repeatY: 2 });
  }
  const tex = catalogTexture({ kind: 'series', series: p.pattern, hex: sw.hex }).clone();
  tex.repeat.set((p.size * MM) / 0.6, (p.size * MM) / 0.6);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
}

function buildCloud(p, room) {
  const g = new THREE.Group();
  const t = 0.04; // 40 mm per spec
  const shapePath = cloudShapePath(p.shape, p.size);
  const embossedEdge = p.edge === 'embossed';
  const geo = new THREE.ExtrudeGeometry(shapePath, embossedEdge
    ? { depth: t * 0.55, bevelEnabled: true, bevelThickness: t * 0.28, bevelSize: 0.012, bevelSegments: 3 }
    : { depth: t, bevelEnabled: false });
  const span = p.size * MM;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / span + 0.5, uv.getY(i) / span + 0.5);
  uv.needsUpdate = true;
  geo.rotateX(Math.PI / 2);
  const panel = new THREE.Mesh(geo, cloudMaterial(p));
  panel.position.y = -p.drop;
  g.add(panel);
  const wireGeo = new THREE.CylinderGeometry(0.005, 0.005, p.drop, 6);
  const rHang = span * 0.33;
  for (const [ax, az] of [[-rHang, -rHang], [rHang, -rHang], [-rHang, rHang], [rHang, rHang]]) {
    const wire = new THREE.Mesh(wireGeo, WIRE_MAT);
    wire.position.set(ax, -p.drop / 2, az);
    g.add(wire);
  }
  return g;
}

// ---------- shared ----------
export function buildItem(item, room) {
  const g = item.type === 'baffles' ? buildBaffles(item.params)
    : item.type === 'tiles' ? buildTileGrid(item.params, room)
    : buildCloud(item.params, room);
  g.position.set(item.x, room.h, item.z);
  if (item.type !== 'tiles') g.rotation.y += THREE.MathUtils.degToRad(item.rotY || 0);
  g.userData.itemId = item.id;
  g.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return g;
}

export function disposeItemGroup(g) {
  g.traverse(o => {
    if (!o.isMesh) return;
    if (!o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.userData.shared) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}
