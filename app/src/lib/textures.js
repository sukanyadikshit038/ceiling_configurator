// Textures: procedural finishes drawn on a canvas, the real Wood Classic veneer
// photos, and the fabrics a user has uploaded into their own browser.
//
// Everything procedural is generated at runtime, so the bundle ships no image
// for it and a new colour family costs nothing to add. Sources that ARE files
// (veneer sheets, user fabrics) load through BASE_URL, which is '/ceiling/' in
// production — a hardcoded '/textures/...' would 404 behind CloudFront.
import * as THREE from 'three';
import { maxAnisotropy } from './gpu.js';
import { FABRICS, getFabric, fabricURL } from './fabrics.js';

const BASE = import.meta.env?.BASE_URL ?? '/';

export const FELT_COLORS = [
  { name: 'Graphite',   hex: '#383d42' },
  { name: 'Slate',      hex: '#5b6770' },
  { name: 'Mist',       hex: '#aeb6bc' },
  { name: 'Ivory',      hex: '#e9e4d9' },
  { name: 'Sand',       hex: '#cdbd9f' },
  { name: 'Ochre',      hex: '#c8a13a' },
  { name: 'Terracotta', hex: '#c65a33' },
  { name: 'Burgundy',   hex: '#7d3040' },
  { name: 'Moss',       hex: '#7d8c5c' },
  { name: 'Forest',     hex: '#3f5d50' },
  { name: 'Indigo',     hex: '#41586e' },
  { name: 'Sky',        hex: '#7fa8c9' },
];

export const WOOD_TONES = [
  { name: 'Natural Oak', base: '#c9a06d', grain: '#8a6a42' },
  { name: 'Walnut',      base: '#6e4a30', grain: '#452c1c' },
  { name: 'Ash',         base: '#ddc9a8', grain: '#b09a76' },
  { name: 'Smoked Oak',  base: '#8a6b4a', grain: '#5a422a' },
  { name: 'White Wash',  base: '#e7ded1', grain: '#c4b8a6' },
];

export const PERF_PATTERNS = [
  { key: 'none',   label: 'Solid (no perforation)' },
  { key: 'rounds', label: 'Round holes' },
  { key: 'slots',  label: 'Linear slots' },
  { key: 'micro',  label: 'Micro-perforation' },
];

const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy();
  return tex;
}

// mulberry32 — deterministic, so cached textures are stable between rebuilds
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------------------
// Felt
//
// Upholstery for the furniture in the room scenes — chairs, benches, screens.
//
// NOT the baffle finish. Solid Coloured PET is a plain colour and wears no
// texture at all (see feltFinMaterial in baffle.js); two attempts to give it a
// surface both came out worse than the colour they replaced. What is left here
// is the seating, which does want a cloth.
//
// Drawn as a periodic noise FIELD rather than as canvas strokes, which makes
// the tile seamless by construction.

const FELT_PX = 512;

/**
 * Periodic value noise on a SQUARE R x R lattice, smoothstep-interpolated.
 *
 * Periodic is half the point: the lattice indices wrap, so the tile meets
 * itself on all four edges for free and can be repeated over a seat or a
 * screen without a seam.
 *
 * Square is the other half, and it is square on purpose. This took a per-axis
 * Rx and Ry, and the felt used it to stretch all three fibre octaves 3:1 under
 * the name "machine direction" — three aligned octaves of stretched noise is
 * how you draw WOOD, and that is what it came out looking like. The knob is
 * gone rather than merely set to 1, because nothing else ever wanted it and a
 * knob whose only use was a bug is a bug waiting to come back.
 */
function periodicNoise(R, seed) {
  const rand = rng(seed);
  const v = new Float32Array(R * R);
  for (let i = 0; i < v.length; i++) v[i] = rand() * 2 - 1;
  return (u, w) => {
    const fx = u * R, fy = w * R;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i0 = ((x0 % R) + R) % R, i1 = (i0 + 1) % R;
    const j0 = ((y0 % R) + R) % R, j1 = (j0 + 1) % R;
    const a = v[j0 * R + i0], b = v[j0 * R + i1];
    const c = v[j1 * R + i0], d = v[j1 * R + i1];
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

/**
 * The felt's structure, once, colour-free. Every shade is this one field
 * wearing a dye, so the cost is a field plus a canvas per colour used.
 */
let feltField = null;
function feltStructure() {
  if (feltField) return feltField;
  const n = FELT_PX;
  // Every octave is square, so the mat has no direction — see periodicNoise for
  // what happened when they were not.
  //
  // The mottle is broad density variation, and the only part that survives
  // minification — it is what keeps the cloth reading as cloth from across the
  // room. Kept fine and weak, because large soft swirls are the other half of
  // a grain look.
  const mottleA = periodicNoise(7, 71);
  const mottleB = periodicNoise(17, 72);
  // fibre: the mat itself. A flat-ish spectrum rather than a falling one —
  // value noise weighted towards its lowest octave is cloudy, and felt is
  // granular.
  const fibreA = periodicNoise(72, 73);
  const fibreB = periodicNoise(155, 74);
  const fibreC = periodicNoise(330, 75);
  const rand = rng(76);
  const shade = new Float32Array(n * n);   // relative, multiplies the dye
  const lift = new Float32Array(n * n);    // absolute levels, so black is not flat
  for (let y = 0; y < n; y++) {
    const v = y / n;
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const mottle = 0.6 * mottleA(u, v) + 0.4 * mottleB(u, v);
      const fibre = 0.37 * fibreA(u, v) + 0.34 * fibreB(u, v) + 0.29 * fibreC(u, v);
      const speck = rand() * 2 - 1;
      const i = y * n + x;
      // Weighted towards the fibre and away from the mottle. Broad swirls are
      // what the eye reads as figure in a material; a mat is mostly grain.
      shade[i] = 0.055 * mottle + 0.135 * fibre + 0.045 * speck;
      // A purely relative dye leaves a black (#000000) perfectly flat, because
      // zero times anything is zero — and black felt is not a flat black
      // surface, it is a fibre mat you can see the structure of.
      lift[i] = 11 * (0.7 * fibre + 0.3 * speck);
    }
  }
  feltField = { n, shade, lift };
  return feltField;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * The colour map for one shade of felt: the shared structure, dyed.
 *
 * Cached per hex, and the texture is meant to be CLONED by callers that need
 * their own repeat — a clone shares its Source, so the copy costs a small JS
 * object and no GPU memory.
 */
export function feltTexture(hex) {
  const k = `felt|${hex}`;
  if (cache.has(k)) return cache.get(k);
  const { n, shade, lift } = feltStructure();
  const base = parseInt(hex.slice(1), 16);
  // A fibre mat scatters light, so it never reaches the dye's own black. With
  // the base at 0 the whole negative half of the field clips away and what
  // survives is isolated specks rather than a nap; a couple of percent of floor
  // gives it room to swing both ways. This is a RENDERING floor and not a
  // catalogue change — the swatch stays #000000 and a schedule still says Black.
  const FLOOR = 9;
  const br = Math.max((base >> 16) & 255, FLOOR);
  const bg = Math.max((base >> 8) & 255, FLOOR);
  const bb = Math.max(base & 255, FLOOR);
  // The scattered term is what you see on a dark dye and nothing at all on a
  // light one, where there is no headroom left to scatter into — without this
  // the pale shades clip their highlights flat, which is the same fault as the
  // dark ones clipping their shadows.
  const room = 1 - Math.max(br, bg, bb) / 255;
  const c = makeCanvas(n);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  const d = img.data;
  // Brightening is held to the headroom the dye actually leaves. Shading felt
  // is multiplicative on the dye — a denser tuft reflects more of whatever the
  // dye reflects — and that is right everywhere except the top of the range,
  // where White at 255 has nothing above it: unheld, the pale shades clipped
  // more than half their texels to flat 255 and lost the nap exactly where the
  // eye looks for it. Darkening never needs holding; there is always room below.
  const up = (b, s) => (s > 0 ? Math.min(s, (255 - b) / Math.max(1, b)) : s);
  for (let i = 0, p = 0; i < shade.length; i++, p += 4) {
    const s = shade[i], a = lift[i] * room;
    d[p] = clamp255(br * (1 + up(br, s)) + a);
    d[p + 1] = clamp255(bg * (1 + up(bg, s)) + a);
    d[p + 2] = clamp255(bb * (1 + up(bb, s)) + a);
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

function drawWood(ctx, size, tone, seed) {
  const rand = rng(seed);
  ctx.fillStyle = tone.base;
  ctx.fillRect(0, 0, size, size);
  // vertical grain streaks
  for (let i = 0; i < 70; i++) {
    const x0 = rand() * size;
    ctx.strokeStyle = hexToRgba(tone.grain, 0.06 + rand() * 0.16);
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x0, -10);
    const wobble = 3 + rand() * 6;
    const freq = 1 + rand() * 2;
    const phase = rand() * 6;
    for (let y = 0; y <= size + 20; y += 24) {
      ctx.lineTo(x0 + Math.sin((y / size) * Math.PI * freq + phase) * wobble, y);
    }
    ctx.stroke();
  }
  // occasional cathedral arcs
  for (let i = 0; i < 5; i++) {
    const cx = rand() * size, cy = rand() * size;
    ctx.strokeStyle = hexToRgba(tone.grain, 0.1);
    ctx.lineWidth = 1.2;
    for (let r = 8; r < 46; r += 9) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function punchHole(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(16,12,9,0.92)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // faint lower rim highlight to fake depth
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y + 0.8, r, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function drawPerforation(ctx, size, pattern) {
  if (pattern === 'rounds') {
    const step = 42, r = 7;
    for (let y = step / 2; y < size; y += step)
      for (let x = step / 2; x < size; x += step) punchHole(ctx, x, y, r);
  } else if (pattern === 'micro') {
    const step = 16, r = 2.2;
    for (let y = step / 2; y < size; y += step)
      for (let x = step / 2; x < size; x += step) punchHole(ctx, x, y, r);
  } else if (pattern === 'slots') {
    const stepX = 34, slotW = 5, slotH = 34, gapY = 14;
    ctx.fillStyle = 'rgba(16,12,9,0.92)';
    for (let x = stepX / 2; x < size; x += stepX) {
      for (let y = 8; y + slotH < size; y += slotH + gapY) {
        ctx.beginPath();
        ctx.roundRect(x - slotW / 2, y, slotW, slotH, slotW / 2);
        ctx.fill();
      }
    }
  }
}

export function woodTexture(toneName, perf = 'none') {
  const k = `wood|${toneName}|${perf}`;
  if (cache.has(k)) return cache.get(k);
  const tone = WOOD_TONES.find(t => t.name === toneName) || WOOD_TONES[0];
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  drawWood(ctx, size, tone, 7 + WOOD_TONES.indexOf(tone) * 13);
  if (perf !== 'none') drawPerforation(ctx, size, perf);
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

// ---------- user fabrics (stored per-browser; see lib/fabrics.js) ----------
const fabricCache = new Map();
const texLoader = new THREE.TextureLoader();

/**
 * Turn every stored fabric into a loaded texture.
 *
 * Preloading matters: materials clone the source texture, and cloning one that
 * has not decoded yet copies an empty image that never fills in. A fabric that
 * fails to decode is evicted so the caller falls back to a flat swatch, and so
 * the next call retries it.
 */
export async function initFabricTextures() {
  await Promise.all(FABRICS.map((f) => {
    if (fabricCache.has(f.id)) return Promise.resolve();
    const url = fabricURL(f.id);
    if (!url) return Promise.resolve();
    return new Promise((resolve) => {
      const tex = texLoader.load(url, () => resolve(), undefined,
        () => { fabricCache.delete(f.id); resolve(); });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAnisotropy();
      fabricCache.set(f.id, tex);
    });
  }));
}

export function fabricMeta(id) {
  return getFabric(id);
}

export function fabricTexture(id) {
  return fabricCache.get(id) || null;
}

export function forgetFabricTexture(id) {
  fabricCache.get(id)?.dispose();
  fabricCache.delete(id);
}

// ---------- real Wood Classic veneer sheets ----------
// Full-sheet photos, grain running vertically. Production logic: fins are cut
// as vertical strips along the sheet, so we pre-rotate each sheet into a
// landscape canvas (grain along U) — then a fin maps as
// repeat.x = length/SHEET.h, repeat.y = depth/SHEET.w, with offset.y stepping
// one strip per fin like successive cuts from the same sheet.
export const WOOD_SHEET = { w: 1.22, h: 2.8 }; // metres, per client spec
const realWoodLib = new Map(); // code -> {canvas, tex, hex, file}

export async function initWoodLibrary() {
  let list;
  try {
    const res = await fetch(BASE + 'textures/baffles/wood-classic/manifest.json');
    if (!res.ok) return;
    list = await res.json();
  } catch { return; }
  await Promise.all(list.map(entry => new Promise(resolve => {
    if (realWoodLib.has(entry.code)) return resolve();
    const img = new Image();
    img.onload = () => {
      const H = 1024; // across the sheet width
      const W = Math.min(2048, Math.round(H * (img.height / img.width)));
      const c = makeCanvas(W);
      c.height = H;
      const ctx = c.getContext('2d');
      // rotate the portrait sheet 90° so grain runs along U
      ctx.translate(W, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, H, W);
      const tex = toTexture(c);
      // average colour for swatch fallbacks / previews
      const s = makeCanvas(4);
      const sctx = s.getContext('2d');
      sctx.drawImage(img, 0, 0, 4, 4);
      const d = sctx.getImageData(0, 0, 4, 4).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      const hex = '#' + [r / n, g / n, b / n].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      realWoodLib.set(entry.code, { canvas: c, tex, hex, file: entry.file });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = BASE + 'textures/baffles/wood-classic/' + entry.file;
  })));
}

export function realWood(code) {
  return realWoodLib.get(code) || null;
}

// ---------- catalog textures (product families from the spec workbook) ----------
// One entry point: catalogTexture(spec) — cached procedural placeholders per
// colour family until real scanned finishes replace them.

function baseCanvasNoise(ctx, size, seed, amount = 4000, alpha = 0.05) {
  const rand = rng(seed);
  for (let i = 0; i < amount; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha * rand()})` : `rgba(0,0,0,${alpha * rand()})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawTextile(ctx, size, hex) {
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  const rand = rng(17);
  // fine twill weave
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const on = ((x + y) / 4) % 2 === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 3, 3);
    }
  }
  baseCanvasNoise(ctx, size, 91, 3000, 0.04);
}

function drawConcrete(ctx, size, hex) {
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  const rand = rng(55);
  baseCanvasNoise(ctx, size, 55, 9000, 0.06);
  // mottled patches + pin holes
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size, r = 12 + rand() * 42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(rng(i + 3)() * size, rand() * size, 0.8 + rand() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOmbre(ctx, size, from, to) {
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  baseCanvasNoise(ctx, size, 42, 7000, 0.05);
}

function drawVicStrip(ctx, size, baseHex, stripHex, variation) {
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  // wood strips over the base; texture = one 600 mm tile
  const modules = 8;
  const mod = size / modules;
  for (let i = 0; i < modules; i++) {
    const x0 = i * mod;
    const strips = variation === 'double' ? 2 : 1;
    const gapEdge = mod * 0.18;
    const inner = mod - gapEdge * 2;
    const sw = variation === 'double' ? inner * 0.42 : inner;
    for (let s = 0; s < strips; s++) {
      const x = x0 + gapEdge + s * (inner - sw);
      ctx.fillStyle = stripHex;
      ctx.fillRect(x, 0, sw, size);
      // grain streaks
      const rand = rng(i * 7 + s + 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const gx = x + rand() * sw;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx + (rand() - 0.5) * 6, size);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, 0, 2, size);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + sw - 2, 0, 2, size);
    }
  }
}

function drawRattan(ctx, size, tone) {
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, 0, size, size);
  const cane = tone === 'RT-Dark' ? '#7a5a38' : '#c9a970';
  const step = 42, w = 13;
  ctx.fillStyle = cane;
  for (let x = 0; x < size + step; x += step) {
    ctx.fillRect(x, 0, w, size);
    ctx.fillRect(x + step / 2, 0, w, size);
  }
  for (let y = 0; y < size + step; y += step) {
    for (let x = 0; x < size + step; x += step) {
      const over = (x / step + y / step) % 2 < 1;
      ctx.fillStyle = over ? cane : 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 2, y, step * 0.7, w);
    }
  }
  baseCanvasNoise(ctx, size, 23, 2500, 0.06);
}

function drawHeritage(ctx, size, code) {
  const idx = ['HT-A', 'HT-B', 'HT-C', 'HT-D'].indexOf(code);
  ctx.fillStyle = '#e7e4dd';
  ctx.fillRect(0, 0, size, size);
  const cells = idx % 2 === 0 ? 2 : 4;
  const cell = size / cells;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
      // pressed medallion: rings of light/shadow
      const rings = idx < 2 ? 4 : 3;
      for (let k = rings; k > 0; k--) {
        const rr = (cell * 0.42 * k) / rings;
        const g = ctx.createRadialGradient(cx - rr * 0.2, cy - rr * 0.2, rr * 0.5, cx, cy, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (idx === 3) ctx.rect(cx - rr, cy - rr, rr * 2, rr * 2);
        else ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.strokeRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
    }
  }
}

function drawEmboss(ctx, size, code, baseHex = '#e9e6df') {
  const idx = ['EM-A', 'EM-B', 'EM-C'].indexOf(code);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  const cells = [4, 6, 8][Math.max(0, idx)];
  const cell = size / cells;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const x = c * cell, y = r * cell;
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      g.addColorStop(0, 'rgba(255,255,255,0.3)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      if (idx === 1) {
        ctx.beginPath();
        ctx.moveTo(x + cell / 2, y + 3);
        ctx.lineTo(x + cell - 3, y + cell / 2);
        ctx.lineTo(x + cell / 2, y + cell - 3);
        ctx.lineTo(x + 3, y + cell / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      }
    }
  }
}

function drawPerfPattern(ctx, size, pf) {
  ctx.save();
  if (pf.style === 'rounds' || pf.style === 'micro') {
    for (let y = pf.step / 2; y < size; y += pf.step) {
      for (let x = pf.step / 2; x < size; x += pf.step) punchHole(ctx, x, y, pf.r);
    }
  } else if (pf.style === 'slots') {
    ctx.fillStyle = 'rgba(16,12,9,0.92)';
    const slotW = pf.step * 0.16, slotH = pf.step;
    for (let x = pf.step / 2; x < size; x += pf.step) {
      for (let y = 8; y + slotH < size; y += slotH + 14) {
        ctx.beginPath();
        ctx.roundRect(x - slotW / 2, y, slotW, slotH, slotW / 2);
        ctx.fill();
      }
    }
  } else if (pf.style === 'diagonal') {
    let row = 0;
    for (let y = pf.step / 2; y < size; y += pf.step * 0.62) {
      const off = (row++ % 2) * pf.step * 0.5;
      for (let x = pf.step / 2 + off; x < size; x += pf.step) punchHole(ctx, x, y, pf.r);
    }
  } else if (pf.style === 'cluster') {
    for (let y = pf.step / 2; y < size; y += pf.step) {
      for (let x = pf.step / 2; x < size; x += pf.step) {
        for (const [dx, dy] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, 0]]) punchHole(ctx, x + dx, y + dy, pf.r);
      }
    }
  } else if (pf.style === 'rings') {
    for (let y = pf.step / 2; y < size; y += pf.step) {
      for (let x = pf.step / 2; x < size; x += pf.step) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          punchHole(ctx, x + Math.cos(a) * 16, y + Math.sin(a) * 16, pf.r);
        }
      }
    }
  } else if (pf.style === 'gradient') {
    for (let y = pf.step / 2; y < size; y += pf.step) {
      const rr = pf.r * (0.35 + 0.65 * (y / size));
      for (let x = pf.step / 2; x < size; x += pf.step) punchHole(ctx, x, y, rr);
    }
  }
  ctx.restore();
}

function drawCloudSeries(ctx, size, series, hex) {
  // felt base
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  baseCanvasNoise(ctx, size, 42, 6000, 0.05);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 3;
  const n = parseInt(series.split('-')[1] || '1', 10);
  if (n === 1) { // dot grid
    for (let y = 24; y < size; y += 48) for (let x = 24; x < size; x += 48) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
  } else if (n === 2) { // lines
    for (let x = 16; x < size; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
  } else if (n === 3) { // waves
    for (let y = 20; y < size; y += 44) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const yy = y + Math.sin((x / size) * Math.PI * 4) * 9;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (n === 4) { // diamonds
    for (let y = 30; y < size; y += 60) for (let x = 30; x < size; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 14, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 14, y);
      ctx.closePath(); ctx.stroke();
    }
  } else { // arcs
    for (let y = 0; y < size + 60; y += 52) for (let x = 0; x < size + 60; x += 52) {
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI); ctx.stroke();
    }
  }
}

export function catalogTexture(spec) {
  const k = 'cat|' + JSON.stringify(spec);
  if (cache.has(k)) return cache.get(k);
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  switch (spec.kind) {
    case 'felt': {
      // The felt is generated at its own resolution and returned AS IT IS.
      // This used to drawImage a 256 tile into a 512 canvas and call it "higher
      // res": measured, that cost 21% of the tile's contrast and four times the
      // memory, and added no detail, because an upscale never does.
      cache.set(k, feltTexture(spec.hex));
      return cache.get(k);
    }
    case 'textile': drawTextile(ctx, size, spec.hex); break;
    case 'wood': {
      const rw = realWood(spec.code);
      if (rw) {
        const side = Math.min(rw.canvas.width, rw.canvas.height);
        ctx.drawImage(rw.canvas, (rw.canvas.width - side) / 2, 0, side, side, 0, 0, size, size);
      } else {
        drawWood(ctx, size, { base: spec.base, grain: spec.grain }, 7 + (spec.code || '').length * 13);
      }
      break;
    }
    case 'concrete': drawConcrete(ctx, size, spec.hex); break;
    case 'ombre': drawOmbre(ctx, size, spec.from, spec.to); break;
    case 'vic': drawVicStrip(ctx, size, spec.base, spec.strip, spec.variation); break;
    case 'rattan': drawRattan(ctx, size, spec.code); break;
    case 'heritage': drawHeritage(ctx, size, spec.code); break;
    case 'emboss': drawEmboss(ctx, size, spec.code); break;
    case 'embossc': drawEmboss(ctx, size, spec.code, spec.hex); break;
    case 'perf': {
      const rw = realWood(spec.code);
      if (rw) {
        const side = Math.min(rw.canvas.width, rw.canvas.height);
        ctx.drawImage(rw.canvas, (rw.canvas.width - side) / 2, 0, side, side, 0, 0, size, size);
      } else {
        drawWood(ctx, size, { base: spec.base, grain: spec.grain }, 11);
      }
      drawPerfPattern(ctx, size, spec.pf);
      break;
    }
    case 'series': drawCloudSeries(ctx, size, spec.series, spec.hex); break;
    default: ctx.fillStyle = '#888'; ctx.fillRect(0, 0, size, size);
  }
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function carpetTexture() {
  const k = 'carpet';
  if (cache.has(k)) return cache.get(k);
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7e858c';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(99);
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = rand() > 0.5
      ? `rgba(255,255,255,${0.02 + rand() * 0.05})`
      : `rgba(0,0,0,${0.03 + rand() * 0.08})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  // carpet tile seams (1 texture repeat = 1 m)
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

// ---------- realistic-office scene textures ----------
export function marbleTexture() {
  const k = 'marble';
  if (cache.has(k)) return cache.get(k);
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eae8e4';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(31);
  for (let v = 0; v < 14; v++) {
    let x = rand() * size, y = rand() * size;
    ctx.strokeStyle = `rgba(120,118,116,${0.10 + rand() * 0.14})`;
    ctx.lineWidth = 0.8 + rand() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 26; s++) {
      x += (rand() - 0.42) * 46;
      y += (rand() - 0.5) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  baseCanvasNoise(ctx, size, 77, 2500, 0.03);
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function stripedCarpetTexture() {
  const k = 'striped-carpet';
  if (cache.has(k)) return cache.get(k);
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8f9397';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(64);
  for (let x = 0; x < size; x += 26) {
    ctx.fillStyle = ((x / 26) % 2 === 0) ? '#7c8286' : '#989da1';
    ctx.fillRect(x, 0, 26, size);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, 0, 2, size);
  }
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function screenTexture() {
  const k = 'screen2';
  if (cache.has(k)) return cache.get(k);
  const W = 320, H = 200;
  const c = makeCanvas(W);
  c.height = H;
  const ctx = c.getContext('2d');
  // wallpaper
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#3457a6');
  g.addColorStop(0.55, '#4d7fd0');
  g.addColorStop(1, '#7fb0e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // menu bar
  ctx.fillStyle = 'rgba(250,250,252,0.92)';
  ctx.fillRect(0, 0, W, 14);
  ctx.fillStyle = '#9aa0a8';
  for (let x = 8; x < 80; x += 18) ctx.fillRect(x, 5, 12, 4);
  // window with sidebar + text lines
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fillRect(34, 30, 190, 130);
  ctx.fillStyle = '#e8eaee';
  ctx.fillRect(34, 30, 46, 130);
  ctx.fillStyle = '#c4c9cf';
  for (let y = 44; y < 150; y += 12) ctx.fillRect(88, y, 112 - (y % 36), 5);
  ctx.fillStyle = '#5b8def';
  ctx.fillRect(88, 38, 60, 5);
  // second window behind
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(238, 48, 66, 96);
  // dock
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.roundRect(70, H - 22, 180, 16, 8);
  ctx.fill();
  const dots = ['#e05c4f', '#f0b13d', '#57ba5c', '#4d8fe0', '#9b6dd8', '#e0699a', '#50c2c9'];
  dots.forEach((d, i) => {
    ctx.fillStyle = d;
    ctx.beginPath();
    ctx.arc(84 + i * 24, H - 14, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function keyboardTexture() {
  const k = 'keyboard';
  if (cache.has(k)) return cache.get(k);
  const c = makeCanvas(256);
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8dadc';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#f4f5f6';
  for (let y = 6; y < 66; y += 15) {
    for (let x = 6; x < 244; x += 16) {
      ctx.beginPath();
      ctx.roundRect(x, y, 13, 12, 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.roundRect(78, 78, 100, 12, 3); // space bar
  ctx.fill();
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function leafTexture() {
  const k = 'leaf';
  if (cache.has(k)) return cache.get(k);
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#3d6631');
  g.addColorStop(0.5, '#54833f');
  g.addColorStop(1, '#6b9b4d');
  ctx.fillStyle = g;
  // pointed leaf blade
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.bezierCurveTo(112, 34, 108, 92, 64, 118);
  ctx.bezierCurveTo(20, 92, 16, 34, 64, 4);
  ctx.closePath();
  ctx.fill();
  // veins
  ctx.strokeStyle = 'rgba(230,240,210,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 8);
  ctx.lineTo(64, 116);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = 24 + i * 18;
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(64 - 26 + i * 2, y + 14);
    ctx.moveTo(64, y);
    ctx.lineTo(64 + 26 - i * 2, y + 14);
    ctx.stroke();
  }
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function plantWallTexture() {
  const k = 'plantwall';
  if (cache.has(k)) return cache.get(k);
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#26361f';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(12);
  const greens = ['#4a6b3a', '#5d7d47', '#3d5c30', '#6f8f55', '#54713d'];
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = greens[Math.floor(rand() * greens.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + rand() * 7, 2 + rand() * 5, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}

export function plasterTexture() {
  const k = 'plaster';
  if (cache.has(k)) return cache.get(k);
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f1f2f3';
  ctx.fillRect(0, 0, size, size);
  const rand = rng(7);
  for (let i = 0; i < 4000; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  const tex = toTexture(c);
  cache.set(k, tex);
  return tex;
}
