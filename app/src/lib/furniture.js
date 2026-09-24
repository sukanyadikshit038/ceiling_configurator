// Procedural furnished rooms, built from primitives — no asset to download.
//
// Each scenario declares its room size and builds its own furniture, so it
// costs nothing to ship and works offline. lib/rooms.js turns each one into a
// room with a ceiling plane, alongside the GLB rooms read from the manifest.
//
// Scenario groups are scenery only: they are never selectable and never take
// part in placement raycasts (see three/ProceduralRoom.jsx).
//
// The declarative half — room size, decor, furniture anchors — lives in
// lib/scenarios.js, which imports nothing. Only the geometry is here, so the
// document logic never has to pull three.js in to know how big a room is.
import * as THREE from 'three';
import { SCENARIOS } from './scenarios.js';
import {
  feltTexture, woodTexture, catalogTexture,
  marbleTexture, screenTexture, plantWallTexture,
  keyboardTexture, leafTexture,
} from './textures.js';

const METAL = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.65, roughness: 0.4 });
METAL.userData.shared = true;
const LAMINATE = new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.55 });
LAMINATE.userData.shared = true;
const DARK = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.7 });
DARK.userData.shared = true;
const FOLIAGE = new THREE.MeshStandardMaterial({ color: 0x4a6b4f, roughness: 0.9 });
FOLIAGE.userData.shared = true;
const WHITEBOARD = new THREE.MeshStandardMaterial({ color: 0xfafbfc, roughness: 0.3 });
WHITEBOARD.userData.shared = true;

function woodMat(tone) {
  const tex = woodTexture(tone, 'none').clone();
  tex.repeat.set(1.5, 1.5);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
}

function feltMat(hex) {
  const tex = feltTexture(hex).clone();
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
}

function box(mat, w, h, d, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  return mesh;
}

function cyl(mat, r, hgt, x, y, z, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, seg), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------- pieces (each returns a Group at local origin, on the floor) ----------

function desk() {
  const g = new THREE.Group();
  g.add(box(LAMINATE, 1.4, 0.03, 0.7, 0, 0.735, 0));
  for (const [sx, sz] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) {
    g.add(cyl(METAL, 0.022, 0.72, sx, 0.36, sz, 8));
  }
  return g;
}

function taskChair(fabric) {
  const g = new THREE.Group();
  g.add(box(fabric, 0.46, 0.06, 0.46, 0, 0.46, 0));
  g.add(box(fabric, 0.46, 0.5, 0.06, 0, 0.75, 0.22));
  g.add(cyl(METAL, 0.025, 0.42, 0, 0.22, 0, 8));
  g.add(cyl(METAL, 0.26, 0.03, 0, 0.02, 0, 12));
  return g;
}

function deskCluster(fabric) {
  const g = new THREE.Group();
  for (const [dx, dz, ry] of [[-0.72, -0.4, 0], [0.72, -0.4, 0], [-0.72, 0.4, Math.PI], [0.72, 0.4, Math.PI]]) {
    const d = desk();
    d.position.set(dx, 0, dz);
    d.rotation.y = ry;
    g.add(d);
    const c = taskChair(fabric);
    c.position.set(dx, 0, dz + (ry === 0 ? -0.75 : 0.75));
    c.rotation.y = ry + Math.PI;
    g.add(c);
  }
  return g;
}

function meetingTable(len, wid, tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(box(mat, len, 0.04, wid, 0, 0.74, 0));
  g.add(box(mat, 0.08, 0.72, wid * 0.7, -len / 2 + 0.35, 0.36, 0));
  g.add(box(mat, 0.08, 0.72, wid * 0.7, len / 2 - 0.35, 0.36, 0));
  return g;
}

function sofa(hex) {
  const g = new THREE.Group();
  const mat = feltMat(hex);
  g.add(box(mat, 2.0, 0.4, 0.85, 0, 0.22, 0));
  g.add(box(mat, 2.0, 0.45, 0.2, 0, 0.62, -0.32));
  g.add(box(mat, 0.2, 0.28, 0.85, -0.9, 0.56, 0));
  g.add(box(mat, 0.2, 0.28, 0.85, 0.9, 0.56, 0));
  return g;
}

function armchair(hex) {
  const g = new THREE.Group();
  const mat = feltMat(hex);
  g.add(box(mat, 0.95, 0.4, 0.85, 0, 0.22, 0));
  g.add(box(mat, 0.95, 0.42, 0.2, 0, 0.61, -0.32));
  g.add(box(mat, 0.18, 0.26, 0.85, -0.38, 0.55, 0));
  g.add(box(mat, 0.18, 0.26, 0.85, 0.38, 0.55, 0));
  return g;
}

function coffeeTable(tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(cyl(mat, 0.5, 0.04, 0, 0.42, 0, 24));
  g.add(cyl(mat, 0.06, 0.4, 0, 0.2, 0, 10));
  g.add(cyl(mat, 0.28, 0.03, 0, 0.015, 0, 16));
  return g;
}

function rug(hex, r) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 28), feltMat(hex));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  return mesh;
}

function diningChair(mat) {
  const g = new THREE.Group();
  g.add(box(mat, 0.42, 0.04, 0.42, 0, 0.45, 0));
  g.add(box(mat, 0.42, 0.45, 0.04, 0, 0.7, 0.19));
  for (const [sx, sz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    g.add(box(mat, 0.035, 0.44, 0.035, sx, 0.22, sz));
  }
  return g;
}

function diningSet(tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(cyl(mat, 0.55, 0.04, 0, 0.74, 0, 28));
  g.add(cyl(mat, 0.06, 0.72, 0, 0.36, 0, 10));
  g.add(cyl(mat, 0.3, 0.03, 0, 0.015, 0, 18));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = diningChair(mat);
    c.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85);
    c.rotation.y = -a - Math.PI / 2;
    g.add(c);
  }
  return g;
}

function barCounter(len, tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(box(DARK, len, 1.05, 0.55, 0, 0.525, 0));
  g.add(box(mat, len + 0.15, 0.05, 0.7, 0, 1.08, 0));
  return g;
}

function studentDesk(fabric) {
  const g = new THREE.Group();
  g.add(box(LAMINATE, 1.2, 0.03, 0.5, 0, 0.72, 0));
  for (const [sx, sz] of [[-0.55, -0.2], [0.55, -0.2], [-0.55, 0.2], [0.55, 0.2]]) {
    g.add(cyl(METAL, 0.018, 0.7, sx, 0.35, sz, 8));
  }
  const c = taskChair(fabric);
  c.position.set(0, 0, 0.55);
  g.add(c);
  return g;
}

function whiteboard() {
  const g = new THREE.Group();
  g.add(box(DARK, 2.7, 1.3, 0.04, 0, 1.5, 0));
  g.add(box(WHITEBOARD, 2.6, 1.2, 0.02, 0, 1.5, 0.02));
  return g;
}

function bookshelf(tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(box(mat, 0.9, 2.05, 0.32, 0, 1.025, 0));
  g.add(box(DARK, 0.82, 1.9, 0.05, 0, 1.02, 0.13));
  for (let i = 0; i < 4; i++) {
    g.add(box(mat, 0.84, 0.03, 0.24, 0, 0.42 + i * 0.42, 0.05));
  }
  return g;
}

function stage(w, d, tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(box(mat, w, 0.32, d, 0, 0.16, 0));
  g.add(box(mat, 0.55, 1.1, 0.4, -w * 0.24, 0.32 + 0.55, 0)); // lectern
  return g;
}

let LEAF_MAT = null;
function leafMat() {
  if (!LEAF_MAT) {
    LEAF_MAT = new THREE.MeshStandardMaterial({
      map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85,
    });
    LEAF_MAT.userData.shared = true;
  }
  return LEAF_MAT;
}

// rosette of textured leaf planes arcing up and out — reads as a real plant
function foliage(count, scale, seedOffset = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * scale, 0.62 * scale), leafMat());
    const a = (i / count) * Math.PI * 2 + seedOffset;
    const lean = 0.55 + ((i * 37) % 10) / 18; // 0.55..1.1 rad outward lean
    leaf.position.set(Math.cos(a) * 0.05 * scale, 0.28 * scale, Math.sin(a) * 0.05 * scale);
    leaf.rotation.set(0, -a + Math.PI / 2, 0);
    leaf.rotateX(-Math.PI / 2 + lean);
    leaf.translateY(0.25 * scale);
    g.add(leaf);
  }
  return g;
}

function plant() {
  const g = new THREE.Group();
  g.add(cyl(new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.8 }), 0.2, 0.42, 0, 0.21, 0, 14));
  g.add(cyl(DARK, 0.185, 0.02, 0, 0.43, 0, 14)); // soil
  const inner = foliage(9, 1.35, 0.4);
  inner.position.y = 0.42;
  g.add(inner);
  const outer = foliage(7, 1.9, 1.1);
  outer.position.y = 0.34;
  g.add(outer);
  return g;
}

// ---------- realistic open-office pieces ----------
const GLASS = new THREE.MeshStandardMaterial({ color: 0xd8e4ea, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0 });
GLASS.userData.shared = true;
const FRAME_DARK = new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.5, metalness: 0.5 });
FRAME_DARK.userData.shared = true;
const LIGHT_STRIP = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e2, emissiveIntensity: 1.6, roughness: 0.4 });
LIGHT_STRIP.userData.shared = true;
const BEIGE_TOP = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.6 });
BEIGE_TOP.userData.shared = true;
const NICHE_GLOW = new THREE.MeshStandardMaterial({ color: 0xf0d27a, emissive: 0xe8b84a, emissiveIntensity: 0.7, roughness: 0.6 });
NICHE_GLOW.userData.shared = true;

function screenMat() {
  const tex = screenTexture().clone();
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xbfd9ff, emissiveIntensity: 0.55, emissiveMap: tex, roughness: 0.3 });
}

const ALU = new THREE.MeshStandardMaterial({ color: 0xd4d6d9, roughness: 0.35, metalness: 0.7 });
ALU.userData.shared = true;

function monitor() {
  // iMac-style all-in-one: aluminium slab, screen inset, chin, foot + base,
  // with keyboard and mouse on the desk in front
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(box(ALU, 0.54, 0.4, 0.022, 0, 0.42, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), screenMat());
  screen.position.set(0, 0.455, 0.0115);
  body.add(screen);
  const foot = box(ALU, 0.2, 0.024, 0.19, 0, 0.008, 0.05);
  body.add(foot);
  const neck = box(ALU, 0.16, 0.2, 0.018, 0, 0.12, -0.045);
  neck.rotation.x = 0.25;
  body.add(neck);
  body.rotation.x = -0.03;
  g.add(body);
  const kbTex = keyboardTexture().clone();
  kbTex.needsUpdate = true;
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.135),
    [ALU, ALU, new THREE.MeshStandardMaterial({ map: kbTex, roughness: 0.5 }), ALU, ALU, ALU]);
  kb.position.set(-0.03, 0.006, 0.24);
  g.add(kb);
  const mouse = box(ALU, 0.058, 0.016, 0.095, 0.24, 0.008, 0.25);
  g.add(mouse);
  return g;
}

function wheelChair(hex) {
  const g = new THREE.Group();
  const mat = feltMat(hex);
  g.add(box(mat, 0.47, 0.07, 0.46, 0, 0.47, 0));
  const back = box(mat, 0.45, 0.52, 0.06, 0, 0.78, 0.21);
  back.rotation.x = 0.08;
  g.add(back);
  g.add(box(FRAME_DARK, 0.05, 0.28, 0.34, -0.24, 0.6, 0.05));
  g.add(box(FRAME_DARK, 0.05, 0.28, 0.34, 0.24, 0.6, 0.05));
  g.add(cyl(METAL, 0.025, 0.36, 0, 0.28, 0, 8));
  g.add(cyl(FRAME_DARK, 0.3, 0.035, 0, 0.05, 0, 5));
  return g;
}

function deskPlant() {
  const g = new THREE.Group();
  g.add(cyl(new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.8 }), 0.05, 0.09, 0, 0.045, 0, 10));
  const f = foliage(6, 0.42, 0.7);
  f.position.y = 0.08;
  g.add(f);
  return g;
}

function binders() {
  const g = new THREE.Group();
  const cols = [0x6b7d94, 0xb0713f, 0x5d7a5a, 0x9aa2aa];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.7 });
    g.add(box(m, 0.035, 0.24, 0.18, i * 0.045, 0.12, 0));
  }
  return g;
}

// two desks back-to-back with divider screen, monitors, chairs, accessories
function workstationPair(chairHex, seed) {
  const g = new THREE.Group();
  const topMat = woodMat('Ash');
  for (const side of [-1, 1]) {
    const d = new THREE.Group();
    d.add(box(topMat, 1.5, 0.035, 0.72, 0, 0.735, 0));
    for (const sx of [-0.7, 0.7]) d.add(box(LAMINATE, 0.05, 0.72, 0.6, sx, 0.36, 0));
    d.position.z = side * 0.38;
    g.add(d);
    const mon = monitor();
    mon.position.set((seed + side) % 2 ? -0.15 : 0.12, 0.75, side * 0.28);
    mon.rotation.y = side > 0 ? Math.PI : 0;
    g.add(mon);
    const ch = wheelChair(chairHex);
    ch.position.set(0, 0, side * 1.12);
    ch.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(ch);
    if ((seed + side) % 3 === 0) {
      const pl = deskPlant();
      pl.position.set(0.5, 0.755, side * 0.42);
      g.add(pl);
    } else if ((seed + side) % 3 === 1) {
      const bn = binders();
      bn.position.set(-0.62, 0.755, side * 0.44);
      g.add(bn);
    }
  }
  g.add(box(feltMat('#8b9198'), 1.5, 0.34, 0.03, 0, 0.9, 0));
  const ped = box(LAMINATE, 0.4, 0.55, 0.5, 0.52, 0.28, -0.7);
  g.add(ped);
  return g;
}

function linearLight(len) {
  const g = new THREE.Group();
  g.add(box(LIGHT_STRIP, len, 0.03, 0.08, 0, 0, 0));
  for (const sx of [-len * 0.35, len * 0.35]) g.add(cyl(METAL, 0.004, 0.4, sx, 0.21, 0, 6));
  return g;
}

function glassPartition(len, h) {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(len, h - 0.15, 0.02), GLASS);
  pane.position.y = (h - 0.15) / 2 + 0.05;
  g.add(pane);
  g.add(box(FRAME_DARK, len, 0.06, 0.06, 0, 0.05, 0));
  g.add(box(FRAME_DARK, len, 0.06, 0.06, 0, h - 0.05, 0));
  const bays = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= bays; i++) {
    g.add(box(FRAME_DARK, 0.05, h, 0.05, -len / 2 + (i / bays) * len, h / 2, 0));
  }
  return g;
}

function displayShelf(tone) {
  const g = new THREE.Group();
  const mat = woodMat(tone);
  g.add(box(mat, 1.2, 2.2, 0.35, 0, 1.1, 0));
  g.add(box(DARK, 1.1, 2.05, 0.06, 0, 1.1, 0.13));
  const rand = (n) => ((n * 9301 + 49297) % 233280) / 233280;
  for (let s = 0; s < 4; s++) {
    const y = 0.45 + s * 0.45;
    g.add(box(mat, 1.08, 0.03, 0.28, 0, y + 0.17, 0.02));
    let x = -0.45;
    let k = 0;
    while (x < 0.4) {
      const w = 0.05 + rand(s * 7 + k) * 0.06;
      const hgt = 0.2 + rand(s * 13 + k) * 0.12;
      const col = new THREE.Color().setHSL(rand(s * 3 + k), 0.28, 0.42 + rand(k) * 0.25);
      g.add(box(new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 }), w, hgt, 0.16, x, y + hgt / 2, 0.05));
      x += w + 0.012;
      k++;
    }
  }
  return g;
}

function upperCabinets(len) {
  const g = new THREE.Group();
  g.add(box(LAMINATE, len, 0.7, 0.38, 0, 2.15, 0));
  g.add(box(NICHE_GLOW, len * 0.4, 0.55, 0.34, 0, 1.5, 0));
  g.add(box(LAMINATE, len, 0.9, 0.45, 0, 0.45, 0));
  g.add(box(BEIGE_TOP, len + 0.05, 0.04, 0.5, 0, 0.92, 0));
  return g;
}

function plantWallPanel(w, h) {
  const tex = plantWallTexture().clone();
  tex.repeat.set(w / 1.2, h / 1.2);
  tex.needsUpdate = true;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  panel.position.y = h / 2 + 0.3;
  return panel;
}

function marblePanel(w, h) {
  const tex = marbleTexture().clone();
  tex.repeat.set(w / 2, h / 2);
  tex.needsUpdate = true;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 }));
  panel.position.y = h / 2;
  return panel;
}

function slatWallPanel(w, h) {
  const tex = catalogTexture({ kind: 'vic', base: '#1e1c1a', strip: '#8f6a44', variation: 'single' }).clone();
  tex.repeat.set(w / 1.2, h / 2.4);
  tex.needsUpdate = true;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  panel.position.y = h / 2;
  return panel;
}

function place(parent, piece, x, z, ry = 0) {
  piece.position.set(x, 0, z);
  piece.rotation.y = ry;
  parent.add(piece);
  return piece;
}

// ---------- scenarios ----------
const BUILDERS = {
  'office-realistic': {
    build(anchors) {
      const g = new THREE.Group();
      // bench desking: pairs in three rows, chair colours alternating
      const pairXs = [-4.4, -2.6, -0.8, 1.0];
      const pairZs = [-2.5, 0.4, 3.2];
      pairZs.forEach((z, r) => {
        pairXs.forEach((x, c) => {
          place(g, workstationPair(r % 2 ? '#cdc6b8' : '#b9bdc2', r * 4 + c), x, z);
        });
      });
      // linear pendant luminaires over the work lanes
      pairZs.forEach(z => {
        for (const lx of [-3.5, 0.1]) {
          const li = linearLight(4.6);
          li.position.set(lx, 2.78, z - 1.3);
          g.add(li);
        }
      });
      // glass meeting zone along +x
      const part = glassPartition(10, 2.6);
      part.rotation.y = Math.PI / 2;
      part.position.set(anchors.meetingX, 0, 0);
      g.add(part);
      const div = glassPartition(3.6, 2.6);
      div.position.set(anchors.meetingX + 1.9, 0, 0);
      g.add(div);
      place(g, meetingTable(2.6, 1.2, 'Walnut'), 5.1, -2.4);
      for (const [cx, cz, ry] of [[4.4, -3.1, 0], [5.8, -3.1, 0], [4.4, -1.7, Math.PI], [5.8, -1.7, Math.PI]]) {
        place(g, wheelChair('#b9bdc2'), cx, cz, ry);
      }
      place(g, sofa('#8a9a84'), 5.4, 2.0, Math.PI);
      place(g, coffeeTable('Walnut'), 5.4, 3.2);
      place(g, armchair('#cdc6b8'), 4.2, 3.4, Math.PI * 0.6);
      // back wall composition: marble · plant wall · cabinets with lit niche · shelving
      const mp = marblePanel(2.4, 2.9);
      mp.position.z = -4.93;
      mp.position.x = -5.4;
      g.add(mp);
      const pw = plantWallPanel(2.6, 2.2);
      pw.position.z = -4.9;
      pw.position.x = -2.6;
      g.add(pw);
      place(g, upperCabinets(3.4), 0.8, -4.75);
      place(g, displayShelf('Walnut'), 2.65, -4.78);
      // left wall: wood slat feature + greenery
      const sw = slatWallPanel(4.2, 3.0);
      sw.rotation.y = Math.PI / 2;
      sw.position.set(-6.95, 0, -0.6);
      g.add(sw);
      place(g, plant(), -6.3, 2.6);
      place(g, plant(), -6.3, -3.6);
      place(g, plant(), 6.4, 4.2);
      return g;
    },
  },
  'office-open': {
    build(anchors) {
      const g = new THREE.Group();
      for (const [x, z] of anchors.clusters) place(g, deskCluster(feltMat('#5b6770')), x, z);
      place(g, plant(), -6.2, -4.0);
      place(g, plant(), 6.2, 4.0);
      place(g, plant(), 6.2, -4.0);
      return g;
    },
  },
  'office-teams': {
    build(anchors) {
      const g = new THREE.Group();
      for (const [x, z] of anchors.clusters) place(g, deskCluster(feltMat('#41586e')), x, z);
      const [mx, mz] = anchors.meeting;
      place(g, meetingTable(2.6, 1.2, 'Walnut'), mx, mz, Math.PI / 2);
      for (const [cx, cz, ry] of [[mx - 0.75, mz - 0.7, 0], [mx + 0.75, mz - 0.7, 0], [mx - 0.75, mz + 0.7, Math.PI], [mx + 0.75, mz + 0.7, Math.PI]]) {
        place(g, taskChair(feltMat('#383d42')), cx, cz, ry);
      }
      place(g, plant(), -5.2, 3.5);
      return g;
    },
  },
  'office-board': {
    build() {
      const g = new THREE.Group();
      place(g, meetingTable(3.4, 1.3, 'Walnut'), 0, 0);
      for (let i = 0; i < 4; i++) {
        place(g, taskChair(feltMat('#383d42')), -1.2 + i * 0.8, -0.95, 0);
        place(g, taskChair(feltMat('#383d42')), -1.2 + i * 0.8, 0.95, Math.PI);
      }
      const cred = box(woodMat('Walnut'), 2.0, 0.75, 0.45, -3.5, 0.375, 0);
      cred.rotation.y = Math.PI / 2;
      g.add(cred);
      place(g, plant(), 3.4, -2.3);
      return g;
    },
  },
  'hosp-dining': {
    build(anchors) {
      const g = new THREE.Group();
      for (const [x, z] of anchors.tables) place(g, diningSet('Walnut'), x, z);
      place(g, barCounter(5, 'Smoked Oak'), 0, -3.6);
      place(g, plant(), -5.2, 3.6);
      place(g, plant(), 5.2, 3.6);
      return g;
    },
  },
  'hosp-lounge': {
    build(anchors) {
      const g = new THREE.Group();
      const palettes = [['#7d3040', '#cdbd9f'], ['#3f5d50', '#cdbd9f'], ['#41586e', '#cdbd9f']];
      anchors.groups.forEach(([x, z], i) => {
        const [sofaHex, chairHex] = palettes[i % palettes.length];
        const r = rug('#b9a98c', 1.7);
        r.position.x = x;
        r.position.z = z;
        g.add(r);
        place(g, sofa(sofaHex), x, z - 1.0);
        place(g, armchair(chairHex), x - 1.3, z + 0.6, Math.PI * 0.65);
        place(g, armchair(chairHex), x + 1.3, z + 0.6, -Math.PI * 0.65);
        place(g, coffeeTable('Walnut'), x, z);
      });
      place(g, plant(), -5.8, 3.9);
      place(g, plant(), 5.8, -3.9);
      place(g, plant(), 5.8, 3.9);
      return g;
    },
  },
  'hosp-fine': {
    build(anchors) {
      const g = new THREE.Group();
      for (const [x, z] of anchors.tables) place(g, diningSet('Smoked Oak'), x, z);
      const cred = box(woodMat('Smoked Oak'), 2.2, 0.9, 0.4, -4.6, 0.45, 0);
      cred.rotation.y = Math.PI / 2;
      g.add(cred);
      place(g, plant(), 4.3, -3.2);
      return g;
    },
  },
  'edu-class': {
    build(anchors) {
      const g = new THREE.Group();
      for (const x of anchors.deskCols) {
        for (const z of anchors.deskRows) place(g, studentDesk(feltMat('#7fa8c9')), x, z);
      }
      const [tx, tz] = anchors.teacher;
      place(g, desk(), tx, tz, Math.PI);
      place(g, taskChair(feltMat('#383d42')), tx, tz - 0.75, 0);
      place(g, whiteboard(), 0, -3.44);
      place(g, plant(), -4.0, -2.9);
      return g;
    },
  },
  'edu-library': {
    build(anchors) {
      const g = new THREE.Group();
      for (const [x, z] of anchors.tables) {
        place(g, meetingTable(2.4, 1.0, 'Ash'), x, z);
        place(g, taskChair(feltMat('#7d8c5c')), x - 0.6, z - 0.85, 0);
        place(g, taskChair(feltMat('#7d8c5c')), x + 0.6, z - 0.85, 0);
        place(g, taskChair(feltMat('#7d8c5c')), x - 0.6, z + 0.85, Math.PI);
        place(g, taskChair(feltMat('#7d8c5c')), x + 0.6, z + 0.85, Math.PI);
      }
      for (const z of [-2.4, -1.3, 0.9, 2.0]) place(g, bookshelf('Ash'), 5.7, z, -Math.PI / 2);
      for (const x of [2.4, 3.5, 4.6]) place(g, bookshelf('Ash'), x, -4.2);
      const [px, pz] = anchors.pod;
      const r = rug('#cdbd9f', 1.5);
      r.position.x = px; r.position.z = pz;
      g.add(r);
      place(g, armchair('#7d8c5c'), px - 0.7, pz, Math.PI * 0.4);
      place(g, armchair('#c8a13a'), px + 0.7, pz, -Math.PI * 0.4);
      place(g, plant(), px, pz + 1.6);
      return g;
    },
  },
  'edu-lecture': {
    build(anchors) {
      const g = new THREE.Group();
      place(g, stage(5, 2, 'Ash'), 0, anchors.stageZ);
      for (const z of anchors.rows) {
        for (let i = 0; i < 8; i++) {
          place(g, taskChair(feltMat('#41586e')), -3.85 + i * 1.1, z, 0);
        }
      }
      place(g, plant(), -4.9, 3.6);
      place(g, plant(), 4.9, 3.6);
      return g;
    },
  },
};

/**
 * Build a scenario's furniture. Returns null for an unknown key, so a room
 * whose builder has been removed still renders as a bare shell.
 */
export function buildScenario(key) {
  const builder = BUILDERS[key];
  const data = SCENARIOS[key];
  if (!builder || !data) return null;
  const g = builder.build(data.anchors);
  g.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return g;
}

export const hasScenario = (key) => !!BUILDERS[key];
