// AcoustiConfig — 3D ceiling acoustics configurator.
// Scene bootstrap, room build, placement/drag/selection, undo, save/load.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildItem, disposeItemGroup, defaultParams, itemLabel } from './products.js';
import { buildPreset, buildInspiration, baffleLayoutSpecs, cloudLayoutSpecs } from './layouts.js';
import { buildScenario, SCENARIOS } from './furniture.js';
import { initSceneLibrary, loadScene, getSceneCached } from './scenes.js';
import { carpetTexture, plasterTexture, stripedCarpetTexture, initTextureLibrary, initWoodLibrary } from './textures.js';
import { initUI, refreshUI, setHint } from './ui.js';

const SAVE_KEY = 'acousticonfig.design.v2'; // v1 saves predate the catalog structure

const state = {
  room: { w: 12, l: 9, h: 3.4 },
  items: [],
  selectedIds: [],
  selectedTile: null, // {id, key} — a single tile inside the selected tile grid
  selectedFin: null,  // {id, index} — a single fin inside the selected baffle set
  placing: null,
  snap: true,
  grid: true,
  nextId: 1,
  scenario: null, // furniture/context dressing from an inspiration preset
  sceneId: null,  // imported GLB environment replacing the room shell
};

// ---------- renderer / scene ----------
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#14171c');
// image-based ambient: gives materials proper specular response instead of
// flat lambert shading — the single biggest realism lever for PBR materials
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 150);

// ceiling products are seen from below, so the ground/bounce terms matter most
// (intensities rebalanced down since scene.environment now adds ambient)
const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc9bd, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dd, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.3);
scene.add(fill);
// floor bounce aimed up at the ceiling — this is what actually lights the products
const bounce = new THREE.DirectionalLight(0xfff6e8, 0.75);
scene.add(bounce);
scene.add(bounce.target);

// ---------- room ----------
let roomGroup = null;
let gridLines = null;
let scenarioGroup = null;
let sceneGroup = null;

// imported GLB environment — replaces the procedural room shell
function attachSceneGroup(group) {
  if (sceneGroup) scene.remove(sceneGroup); // cached, never disposed here
  sceneGroup = group;
  if (sceneGroup) scene.add(sceneGroup);
}

async function setScene(id) {
  pushUndo();
  // built-in procedural environments share the dropdown via an 'sc:' prefix
  if (id && id.startsWith('sc:')) {
    const key = id.slice(3);
    if (!SCENARIOS[key]) return;
    state.sceneId = null;
    attachSceneGroup(null);
    Object.assign(state.room, SCENARIOS[key].room);
    setScenario(key);
    buildRoom();
    rebuildAllItems();
    setView('orbit');
    uiRefresh();
    setHint('Built-in scene loaded — add products from the left, or pick an Inspiration');
    return;
  }
  state.sceneId = id || null;
  if (!state.sceneId) {
    setScenario(null);
    attachSceneGroup(null);
    buildRoom();
    rebuildAllItems();
    uiRefresh();
    setHint('Default room restored');
    return;
  }
  setHint('Loading scene…', true);
  const sc = await loadScene(state.sceneId);
  if (!sc) {
    state.sceneId = null;
    setHint('Scene failed to load — check the file in /scenes');
    uiRefresh();
    return;
  }
  setScenario(null);
  Object.assign(state.room, sc.room);
  attachSceneGroup(sc.group);
  buildRoom();
  rebuildAllItems();
  setView('orbit');
  uiRefresh();
  setHint(`<b>Scene loaded</b> — ${sc.room.w} × ${sc.room.l} m, ceiling detected at ${sc.room.h} m. Products place on its ceiling`);
}

function setScenario(key) {
  if (scenarioGroup) {
    scene.remove(scenarioGroup);
    disposeItemGroup(scenarioGroup);
    scenarioGroup = null;
  }
  state.scenario = key || null;
  if (state.scenario) {
    scenarioGroup = buildScenario(state.scenario);
    if (scenarioGroup) scene.add(scenarioGroup);
    else state.scenario = null;
  }
}

function buildGridLines(w, l, h) {
  const pts = [];
  const step = 0.6;
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, h - 0.01, -l / 2, x, h - 0.01, l / 2);
  for (let z = -l / 2; z <= l / 2 + 1e-6; z += step) pts.push(-w / 2, h - 0.01, z, w / 2, h - 0.01, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9aa2aa, transparent: true, opacity: 0.32 }));
}

function buildRoom() {
  if (roomGroup) {
    roomGroup.traverse(o => {
      if (o.isMesh || o.isLine) {
        o.geometry.dispose();
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    scene.remove(roomGroup);
  }
  const { w, l, h } = state.room;
  const decor = (state.scenario && SCENARIOS[state.scenario]?.decor) || {};
  roomGroup = new THREE.Group();

  // an imported scene brings its own shell — keep only the setting-out grid
  if (state.sceneId) {
    gridLines = buildGridLines(w, l, h);
    gridLines.visible = state.grid;
    roomGroup.add(gridLines);
    scene.add(roomGroup);
    sun.position.set(w * 0.45, h + 5, l * 0.3);
    const extS = Math.max(w, l) * 0.75;
    sun.shadow.camera.left = -extS;
    sun.shadow.camera.right = extS;
    sun.shadow.camera.top = extS;
    sun.shadow.camera.bottom = -extS;
    sun.shadow.camera.updateProjectionMatrix();
    fill.position.set(-w * 0.4, h * 0.9, -l * 0.5);
    bounce.position.set(w * 0.15, 0, l * 0.1);
    bounce.target.position.set(0, h, 0);
    return;
  }

  const carpet = (decor.floorTex === 'striped' ? stripedCarpetTexture() : carpetTexture()).clone();
  carpet.repeat.set(w, l);
  carpet.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ map: carpet, color: decor.floor || '#ffffff', roughness: 0.98 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  const plaster = plasterTexture().clone();
  plaster.repeat.set(w / 2, l / 2);
  plaster.needsUpdate = true;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  roomGroup.add(ceiling);

  // walls face inward, so the room reads as a dollhouse from outside
  const wallMat = new THREE.MeshStandardMaterial({ color: decor.wall || '#e2e5e8', roughness: 0.95 });
  const mkWall = (width, rotY, x, z) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, h), wallMat);
    wall.rotation.y = rotY;
    wall.position.set(x, h / 2, z);
    wall.receiveShadow = true;
    roomGroup.add(wall);
  };
  mkWall(w, 0, 0, -l / 2);
  mkWall(w, Math.PI, 0, l / 2);
  mkWall(l, Math.PI / 2, -w / 2, 0);
  mkWall(l, -Math.PI / 2, w / 2, 0);

  // a door, for scale
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.05),
    new THREE.MeshStandardMaterial({ color: 0x6f7478, roughness: 0.8 }));
  door.position.set(w / 4, 2.05 / 2, -l / 2 + 0.01);
  roomGroup.add(door);

  gridLines = buildGridLines(w, l, h);
  gridLines.visible = state.grid;
  roomGroup.add(gridLines);

  scene.add(roomGroup);

  sun.position.set(w * 0.45, h + 5, l * 0.3);
  const ext = Math.max(w, l) * 0.75;
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = h + 25;
  sun.shadow.camera.updateProjectionMatrix();
  fill.position.set(-w * 0.4, h * 0.9, -l * 0.5);
  bounce.position.set(w * 0.15, 0, l * 0.1);
  bounce.target.position.set(0, h, 0);
}

// ---------- items ----------
const groups = new Map(); // id -> THREE.Group
const selectionHelpers = new Map(); // id -> BoxHelper

function removeHelper(id) {
  const helper = selectionHelpers.get(id);
  if (!helper) return;
  scene.remove(helper);
  helper.geometry.dispose();
  helper.material.dispose();
  selectionHelpers.delete(id);
}

function refreshHelper(id) {
  removeHelper(id);
  const g = groups.get(id);
  if (!g) return;
  const helper = new THREE.BoxHelper(g, 0x24d0a8);
  helper.material.depthTest = false;
  scene.add(helper);
  selectionHelpers.set(id, helper);
}

function clampItem(item, g) {
  if (item.type === 'tiles') return; // the grid spans the whole room by design
  const box = new THREE.Box3().setFromObject(g);
  const halfW = state.room.w / 2 - 0.03;
  const halfL = state.room.l / 2 - 0.03;
  let dx = 0, dz = 0;
  if (box.max.x - box.min.x <= halfW * 2) {
    if (box.min.x < -halfW) dx = -halfW - box.min.x;
    else if (box.max.x > halfW) dx = halfW - box.max.x;
  }
  if (box.max.z - box.min.z <= halfL * 2) {
    if (box.min.z < -halfL) dz = -halfL - box.min.z;
    else if (box.max.z > halfL) dz = halfL - box.max.z;
  }
  if (dx || dz) {
    item.x += dx;
    item.z += dz;
    g.position.x = item.x;
    g.position.z = item.z;
  }
}

function syncItem(item) {
  const old = groups.get(item.id);
  if (old) {
    scene.remove(old);
    disposeItemGroup(old);
  }
  const g = buildItem(item, state.room);
  groups.set(item.id, g);
  scene.add(g);
  clampItem(item, g);
  if (state.selectedIds.includes(item.id)) refreshHelper(item.id);
  return g;
}

function removeItemGroup(id) {
  const g = groups.get(id);
  if (!g) return;
  scene.remove(g);
  disposeItemGroup(g);
  groups.delete(id);
  removeHelper(id);
}

function rebuildAllItems() {
  for (const id of [...groups.keys()]) removeItemGroup(id);
  for (const item of state.items) syncItem(item);
}

function getSelectedItems() {
  return state.selectedIds.map(id => state.items.find(i => i.id === id)).filter(Boolean);
}

function getSelected() {
  return getSelectedItems()[0] || null;
}

function uiRefresh() {
  refreshUI(state, getSelectedItems(), state.selectedTile, state.selectedFin);
}

function setSelection(ids) {
  const valid = [...new Set(ids)].filter(id => state.items.some(i => i.id === id));
  state.selectedIds = valid;
  if (state.selectedTile && !valid.includes(state.selectedTile.id)) state.selectedTile = null;
  if (state.selectedFin && !valid.includes(state.selectedFin.id)) state.selectedFin = null;
  for (const id of [...selectionHelpers.keys()]) {
    if (!valid.includes(id)) removeHelper(id);
  }
  for (const id of valid) {
    if (!selectionHelpers.has(id)) refreshHelper(id);
  }
  uiRefresh();
}

function selectItem(id) {
  setSelection(id == null ? [] : [id]);
}

function toggleSelect(id) {
  setSelection(state.selectedIds.includes(id)
    ? state.selectedIds.filter(x => x !== id)
    : [...state.selectedIds, id]);
}

// ---------- undo ----------
const undoStack = [];
let changeOpen = false;

function snapshot() {
  return JSON.stringify({ room: state.room, items: state.items, nextId: state.nextId, scenario: state.scenario, sceneId: state.sceneId });
}

function pushUndo(snap = snapshot()) {
  undoStack.push(snap);
  if (undoStack.length > 40) undoStack.shift();
}

function beginChange() {
  if (!changeOpen) {
    pushUndo();
    changeOpen = true;
  }
}
window.addEventListener('pointerup', () => { changeOpen = false; });

function restore(snapStr) {
  const data = JSON.parse(snapStr);
  state.room = data.room;
  state.items = data.items;
  state.nextId = data.nextId ?? (Math.max(0, ...data.items.map(i => i.id)) + 1);
  const keep = state.selectedIds.filter(id => state.items.some(i => i.id === id));
  setScenario(data.scenario ?? null);
  state.sceneId = data.sceneId ?? null;
  if (!state.sceneId) {
    attachSceneGroup(null);
  } else {
    const cached = getSceneCached(state.sceneId);
    if (cached) attachSceneGroup(cached.group);
    else {
      // lazy-load (e.g. Load after a fresh page start); room dims came from the snapshot
      const want = state.sceneId;
      loadScene(want).then(sc => {
        if (sc && state.sceneId === want) attachSceneGroup(sc.group);
      });
    }
  }
  buildRoom();
  rebuildAllItems();
  setSelection(keep);
}

function undo() {
  const snap = undoStack.pop();
  if (!snap) {
    setHint('Nothing to undo');
    return;
  }
  restore(snap);
  setHint('Undone');
}

// ---------- CRUD ----------
function addItem(type, x, z, params, rotY = 0) {
  pushUndo();
  const item = { id: state.nextId++, type, x, z, rotY, params: params ?? defaultParams(type) };
  state.items.push(item);
  syncItem(item);
  selectItem(item.id);
  return item;
}

function updateSelected(patch, opts = {}) {
  const item = getSelected();
  if (!item) return;
  if (opts.commit) pushUndo();
  if (patch.params) Object.assign(item.params, patch.params);
  if ('rotY' in patch) item.rotY = patch.rotY;
  if ('x' in patch) item.x = patch.x;
  if ('z' in patch) item.z = patch.z;
  syncItem(item);
  if (opts.commit) uiRefresh();
}

function deleteSelected() {
  const sel = getSelectedItems();
  if (!sel.length) return;
  pushUndo();
  const ids = new Set(sel.map(i => i.id));
  state.items = state.items.filter(i => !ids.has(i.id));
  for (const id of ids) removeItemGroup(id);
  setSelection([]);
  setHint(sel.length === 1 ? `${itemLabel(sel[0])} removed` : `${sel.length} items removed`);
}

function duplicateSelected() {
  const sel = getSelectedItems().filter(it => it.type !== 'tiles');
  if (!sel.length) {
    if (getSelectedItems().length) setHint('The tile ceiling already fills the room — nothing to duplicate');
    return;
  }
  pushUndo();
  const newIds = [];
  for (const it of sel) {
    const copy = {
      id: state.nextId++, type: it.type, rotY: it.rotY,
      x: it.x + 0.5, z: it.z + 0.5,
      params: structuredClone(it.params),
    };
    state.items.push(copy);
    syncItem(copy);
    newIds.push(copy.id);
  }
  setSelection(newIds);
  setHint(sel.length === 1 ? 'Duplicated' : `${sel.length} items duplicated`);
}

// Tiles the whole selection: every grid cell (except the original) gets a
// copy of every selected item, so a multi-selected cluster repeats as a unit.
function arraySelected(rows, cols, sx, sz) {
  const sel = getSelectedItems().filter(it => it.type !== 'tiles');
  if (!sel.length) {
    if (getSelectedItems().length) setHint('The tile ceiling already fills the room — arrays apply to baffles and clouds');
    return;
  }
  rows = Math.min(15, Math.max(1, Math.floor(rows) || 1));
  cols = Math.min(15, Math.max(1, Math.floor(cols) || 1));
  const copies = (rows * cols - 1) * sel.length;
  if (copies <= 0) return;
  if (copies > 400) {
    setHint(`That array would add ${copies} items — reduce rows/columns or the selection`);
    return;
  }
  pushUndo();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      for (const it of sel) {
        const clone = {
          id: state.nextId++, type: it.type, rotY: it.rotY,
          x: it.x + c * sx, z: it.z + r * sz,
          params: structuredClone(it.params),
        };
        state.items.push(clone);
        syncItem(clone);
        n++;
      }
    }
  }
  setHint(`Added ${n} cop${n === 1 ? 'y' : 'ies'} in a ${rows} × ${cols} array`);
}

function applyPreset(key) {
  pushUndo();
  const specs = buildPreset(key, state.room);
  for (const s of specs) {
    if (s.type === 'tiles') {
      // one grid per room — re-applying a tile preset updates the existing grid
      const existing = state.items.find(i => i.type === 'tiles');
      if (existing) {
        existing.params = structuredClone(s.params);
        syncItem(existing);
        continue;
      }
    }
    const item = { id: state.nextId++, ...s };
    state.items.push(item);
    syncItem(item);
  }
  selectItem(null);
  setHint(`Preset added — ${specs.length} product${specs.length === 1 ? '' : 's'} placed`);
}

function setRoom(patch) {
  Object.assign(state.room, patch);
  buildRoom();
  rebuildAllItems();
}

function clearAll() {
  if (!state.items.length && !state.scenario && !state.sceneId) return;
  pushUndo();
  for (const id of [...groups.keys()]) removeItemGroup(id);
  state.items = [];
  if (state.scenario || state.sceneId) {
    setScenario(null);
    state.sceneId = null;
    attachSceneGroup(null);
    buildRoom();
  }
  selectItem(null);
  setHint('Scene cleared — <b>Ctrl+Z</b> to undo');
}

// ---------- tile-level edits & catalog layout appliers ----------
function updateTile(patch) {
  const st = state.selectedTile;
  if (!st) return;
  const item = state.items.find(i => i.id === st.id);
  if (!item) return;
  pushUndo();
  const ov = { ...(item.params.overrides || {}) };
  ov[st.key] = { ...(ov[st.key] || {}), ...patch };
  item.params.overrides = ov;
  syncItem(item);
  uiRefresh();
}

function resetTile() {
  const st = state.selectedTile;
  if (!st) return;
  const item = state.items.find(i => i.id === st.id);
  if (!item) return;
  pushUndo();
  const ov = { ...(item.params.overrides || {}) };
  delete ov[st.key];
  item.params.overrides = ov;
  syncItem(item);
  uiRefresh();
}

// per-fin edits inside a baffle set (spec: "user can select individual
// baffles and change colours or any parameters")
function updateFin(patch, commit = true) {
  const sf = state.selectedFin;
  if (!sf) return;
  const item = state.items.find(i => i.id === sf.id);
  if (!item || item.type !== 'baffles') return;
  if (commit) pushUndo();
  const ov = { ...(item.params.finOverrides || {}) };
  ov[sf.index] = { ...(ov[sf.index] || {}), ...patch };
  item.params.finOverrides = ov;
  syncItem(item);
  if (commit) uiRefresh();
}

// "select by count": pick a fin/blade by its number from the panel
function selectFin(index) {
  const sel = getSelected();
  if (!sel || sel.type !== 'baffles') return;
  state.selectedFin = index == null ? null : { id: sel.id, index };
  uiRefresh();
}

function resetFin() {
  const sf = state.selectedFin;
  if (!sf) return;
  const item = state.items.find(i => i.id === sf.id);
  if (!item) return;
  pushUndo();
  const ov = { ...(item.params.finOverrides || {}) };
  delete ov[sf.index];
  item.params.finOverrides = ov;
  syncItem(item);
  uiRefresh();
}

// Embossed baffle layouts 1-5: rebuild the embossed sets into the chosen composition
function applyBaffleLayout(n) {
  const sel = getSelected();
  if (!sel || sel.type !== 'baffles') return;
  pushUndo();
  const base = { ...sel.params, layout: n };
  const ids = new Set(state.items.filter(i => i.type === 'baffles' && i.params.btype === 'embossed').map(i => i.id));
  state.items = state.items.filter(i => !ids.has(i.id));
  for (const id of ids) removeItemGroup(id);
  const newIds = [];
  for (const s of baffleLayoutSpecs(n, base, state.room)) {
    const item = { id: state.nextId++, ...s };
    state.items.push(item);
    syncItem(item);
    newIds.push(item.id);
  }
  setSelection(newIds.slice(0, 1));
  setHint(`Embossed baffle layout ${n} applied — <b>Ctrl+Z</b> to undo`);
}

// Cloud layouts 1-6: replace the selected cloud with an arrangement around it
function applyCloudLayout(n) {
  const sel = getSelected();
  if (!sel || sel.type !== 'clouds') return;
  pushUndo();
  const base = { ...sel.params };
  const cx = sel.x, cz = sel.z;
  state.items = state.items.filter(i => i.id !== sel.id);
  removeItemGroup(sel.id);
  const ids = [];
  for (const s of cloudLayoutSpecs(n, base, cx, cz, state.room)) {
    const item = { id: state.nextId++, ...s };
    state.items.push(item);
    syncItem(item);
    ids.push(item.id);
  }
  setSelection(ids.slice(0, 1));
  setHint(`Cloud layout ${n} placed — <b>Ctrl+Z</b> to undo`);
}

// Inspiration presets stage a full scene: room size, furniture context and
// a single-product acoustic layout designed for that setting.
function applyInspiration(key) {
  const insp = buildInspiration(key);
  if (!insp) return;
  pushUndo();
  cancelPlacing();
  for (const id of [...groups.keys()]) removeItemGroup(id);
  state.items = [];
  Object.assign(state.room, SCENARIOS[insp.scenario].room);
  setScenario(insp.scenario);
  buildRoom();
  for (const s of insp.items(state.room)) {
    const item = { id: state.nextId++, ...s };
    state.items.push(item);
    syncItem(item);
  }
  setSelection([]);
  setView('orbit');
  setHint(`<b>${insp.label}</b> — ${insp.blurb}. <b>Ctrl+Z</b> restores your previous scene`);
}

function toggleGrid() {
  state.grid = !state.grid;
  if (gridLines) gridLines.visible = state.grid;
  uiRefresh();
}

function toggleSnap() {
  state.snap = !state.snap;
  uiRefresh();
}

function save() {
  localStorage.setItem(SAVE_KEY, snapshot());
  setHint('Design saved in this browser');
}

function load() {
  const s = localStorage.getItem(SAVE_KEY);
  if (!s) {
    setHint('No saved design found');
    return;
  }
  pushUndo();
  restore(s);
  setHint('Saved design loaded');
}

function screenshot() {
  renderer.render(scene, camera);
  renderer.domElement.toBlob(blob => {
    if (!blob) return setHint('Screenshot failed');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'acousticonfig.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setHint('Screenshot exported as PNG');
  });
}

// ---------- views ----------
function setView(name) {
  const { w, l, h } = state.room;
  // imported scenes have real exterior shells — spawn inside the open area
  const v = state.sceneId ? getSceneCached(state.sceneId)?.view : null;
  if (name === 'orbit') {
    if (v) {
      camera.position.set(v.ex, 1.7, v.ez);
      controls.target.set(v.cx, h * 0.72, v.cz);
    } else {
      camera.position.set(w * 0.42, 1.8, l * 0.6);
      controls.target.set(0, h * 0.7, 0);
    }
  } else if (name === 'look up') {
    if (v) {
      // step 30% in from the eye toward the centre, look up at the ceiling
      camera.position.set(v.ex + (v.cx - v.ex) * 0.3, 1.2, v.ez + (v.cz - v.ez) * 0.3);
      controls.target.set(v.cx, h * 0.96, v.cz);
    } else {
      camera.position.set(0, 1.2, l * 0.38);
      controls.target.set(0, h * 0.95, -l * 0.2);
    }
  } else if (name === 'plan') {
    camera.position.set(0, h + Math.max(w, l) * 0.85, l * 0.02);
    controls.target.set(0, h, 0);
  }
  controls.update();
}

// ---------- placement / picking / drag ----------
let ghost = null;

function startPlacing(type) {
  cancelPlacing();
  if (type === 'tiles') {
    // one grid per room: it fills the ceiling, so there is nothing to place
    const existing = state.items.find(i => i.type === 'tiles');
    if (existing) {
      selectItem(existing.id);
      setHint('Ceiling tile grid selected — settings on the left · click any tile to edit it individually');
    } else {
      addItem('tiles', 0, 0);
      setHint('Ceiling tile grid added — it fills the whole ceiling · click any tile to edit it individually');
    }
    return;
  }
  state.placing = type;
  ghost = buildItem({ id: -1, type, params: defaultParams(type), x: 0, z: 0, rotY: 0 }, state.room);
  ghost.traverse(o => {
    if (o.isMesh) {
      const m = o.material.clone();
      m.transparent = true;
      m.opacity = 0.55;
      m.userData.shared = false;
      o.material = m;
      o.castShadow = false;
    }
  });
  ghost.visible = false;
  scene.add(ghost);
  selectItem(null);
  setHint(`Placing <b>${itemLabel({ type })}</b> — click the ceiling to place · <b>Shift-click</b> places several · <b>Esc</b> cancels`, true);
}

function cancelPlacing() {
  state.placing = null;
  if (ghost) {
    scene.remove(ghost);
    disposeItemGroup(ghost);
    ghost = null;
  }
  setHint('');
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ceilPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -state.room.h);
const planeHit = new THREE.Vector3();
let drag = null;
let downInfo = null;

function setPointerFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
}

function ceilingPoint() {
  ceilPlane.constant = -state.room.h;
  return raycaster.ray.intersectPlane(ceilPlane, planeHit) ? planeHit : null;
}

function snapVal(v) {
  return state.snap ? Math.round(v / 0.25) * 0.25 : v;
}

function pickItem() {
  const hits = raycaster.intersectObjects([...groups.values()], true);
  for (const hit of hits) {
    let o = hit.object;
    const tileKey = hit.object.userData.tileKey || null;
    const finIndex = hit.object.userData.finIndex ?? null;
    while (o && o.userData.itemId == null) o = o.parent;
    if (o) return { item: state.items.find(i => i.id === o.userData.itemId) || null, tileKey, finIndex };
  }
  return { item: null, tileKey: null, finIndex: null };
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  setPointerFromEvent(e);
  if (state.placing) {
    const pt = ceilingPoint();
    if (pt) {
      const type = state.placing;
      addItem(type, snapVal(pt.x), snapVal(pt.z));
      if (!e.shiftKey) {
        cancelPlacing();
        setHint('Placed. <b>Drag</b> to move · <b>R</b> rotates · <b>Del</b> removes · properties on the left');
      }
    }
    return;
  }
  const { item, tileKey, finIndex } = pickItem();
  if (item) {
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    if (e.ctrlKey || e.metaKey) {
      // Ctrl-click adds to / removes from the selection; no drag starts
      toggleSelect(item.id);
      return;
    }
    // grabbing an item already in a multi-selection drags the whole group
    if (!state.selectedIds.includes(item.id)) selectItem(item.id);
    if (item.type === 'baffles') {
      const next = finIndex != null ? { id: item.id, index: finIndex } : null;
      if ((next && (!state.selectedFin || state.selectedFin.id !== next.id || state.selectedFin.index !== next.index))
        || (!next && state.selectedFin)) {
        state.selectedFin = next;
        uiRefresh();
      }
    }
    if (item.type === 'tiles') {
      // the grid is room-wide and doesn't drag; clicking picks a single tile
      state.selectedTile = tileKey ? { id: item.id, key: tileKey } : null;
      uiRefresh();
      return;
    }
    const pt = ceilingPoint();
    drag = {
      anchor: item, moved: false, snapUndo: snapshot(),
      offX: pt ? item.x - pt.x : 0,
      offZ: pt ? item.z - pt.z : 0,
      entries: getSelectedItems().filter(it => it.type !== 'tiles').map(it => ({ item: it, x0: it.x, z0: it.z })),
    };
  } else {
    downInfo = { x: e.clientX, y: e.clientY, ctrl: e.ctrlKey || e.metaKey };
  }
}

function onPointerMove(e) {
  setPointerFromEvent(e);
  if (state.placing && ghost) {
    const pt = ceilingPoint();
    if (pt) {
      ghost.visible = true;
      ghost.position.set(snapVal(pt.x), state.room.h, snapVal(pt.z));
    }
    return;
  }
  if (drag) {
    const pt = ceilingPoint();
    if (!pt) return;
    // snap the grabbed item, translate the rest by the same delta so the
    // group keeps its relative layout
    const anchor0 = drag.entries.find(en => en.item.id === drag.anchor.id);
    const dx = snapVal(pt.x + drag.offX) - anchor0.x0;
    const dz = snapVal(pt.z + drag.offZ) - anchor0.z0;
    drag.moved = true;
    for (const en of drag.entries) {
      const g = groups.get(en.item.id);
      if (!g) { // an item in the drag group was removed out from under us
        drag = null;
        controls.enabled = true;
        return;
      }
      en.item.x = en.x0 + dx;
      en.item.z = en.z0 + dz;
      g.position.x = en.item.x;
      g.position.z = en.item.z;
      clampItem(en.item, g);
      selectionHelpers.get(en.item.id)?.update();
    }
  }
}

function onPointerUp(e) {
  if (drag) {
    if (drag.moved) pushUndo(drag.snapUndo);
    drag = null;
  } else if (downInfo) {
    // plain click on empty ceiling clears the selection; Ctrl-click doesn't
    if (Math.abs(e.clientX - downInfo.x) < 5 && Math.abs(e.clientY - downInfo.y) < 5
      && !state.placing && !downInfo.ctrl) {
      setSelection([]);
    }
    downInfo = null;
  }
  controls.enabled = true; // ends drag and Ctrl-click gestures alike
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
}

// register BEFORE OrbitControls so we can disable it ahead of its own handlers
renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.4;
controls.maxDistance = 60;

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (drag) return; // shortcuts would mutate state out from under an active drag
  if (e.key === 'Escape') {
    if (state.placing) cancelPlacing();
    else if (state.selectedTile || state.selectedFin) {
      state.selectedTile = null;
      state.selectedFin = null;
      uiRefresh();
    } else selectItem(null);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected();
  } else if (!e.ctrlKey && e.key.toLowerCase() === 'r') {
    const sel = getSelectedItems();
    if (sel.length) {
      pushUndo();
      for (const it of sel) {
        it.rotY = ((it.rotY || 0) + 15) % 360;
        syncItem(it);
      }
      uiRefresh();
    }
  } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
  } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  }
});

// ---------- resize / loop ----------
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// ---------- boot ----------
const api = {
  startPlacing, applyPreset, updateSelected, beginChange, arraySelected,
  deleteSelected, duplicateSelected, setRoom, setView, toggleGrid, toggleSnap,
  save, load, clearAll, undo, screenshot, selectItem, addItem, setSelection, toggleSelect,
  applyInspiration, updateTile, resetTile, applyBaffleLayout, applyCloudLayout,
  setScene, updateFin, resetFin, selectFin,
};

await initTextureLibrary();
await initWoodLibrary();
const { initModelLibrary } = await import('./models.js');
await initModelLibrary();
await initSceneLibrary(); // manifest only — scene files lazy-load on selection
// pick up textures uploaded in the admin tab when the user comes back
window.addEventListener('focus', () => { initTextureLibrary(); });

initUI(api);
buildRoom();
resize();
setView('orbit');
applyPreset('showroom');
undoStack.length = 0; // the starter scene is the baseline, not an undoable step
document.getElementById('loading').remove();
window.__appReady = true;
// dev/QA hook — lets tooling drive the scene headlessly
window.__acfg = { renderer, scene, camera, controls, state, api, resize, THREE };
setHint('Welcome — <b>drag</b> to orbit, <b>scroll</b> to zoom, <b>right-drag</b> to pan. Click a product to edit it · <b>Ctrl-click</b> selects several at once.');
