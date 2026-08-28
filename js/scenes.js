// Imported 3D scene environments (GLB) — replace the procedural room shell.
// Scenes are listed in /scenes/manifest.json and lazy-loaded on first use.
// Exports with broken/fallback materials (black + metallic, no textures) get
// an architectural clay finish so the acoustic products read clearly.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SCENE_LIBRARY = []; // {id, name}
const manifest = new Map();
const cache = new Map(); // id -> {group, room:{w,l,h}}

export async function initSceneLibrary() {
  try {
    const res = await fetch('/scenes/manifest.json');
    if (!res.ok) return;
    for (const entry of await res.json()) {
      manifest.set(entry.id, entry);
      SCENE_LIBRARY.push({ id: entry.id, name: entry.name });
    }
  } catch { /* no scene library */ }
}

const CLAY = new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: 0.9, metalness: 0 });
CLAY.userData.shared = true;

function isFallbackMaterial(m) {
  const c = m.color;
  return !m.map && c && c.r < 0.03 && c.g < 0.03 && c.b < 0.03 && (m.metalness ?? 0) > 0.8;
}

function prepareScene(group) {
  group.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const fixed = mats.map(m => (isFallbackMaterial(m) ? CLAY : m));
    o.material = Array.isArray(o.material) ? fixed : fixed[0];
    o.castShadow = false; // 2M+ verts in the shadow pass would crawl
    o.receiveShadow = true;
  });
}

// interior ceiling = highest surface hit by upward rays from head height,
// sampled at a few spots so a single hanging fixture doesn't fool it
function detectCeiling(group, size) {
  const ray = new THREE.Raycaster();
  let best = 0;
  for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    ray.set(new THREE.Vector3(dx, 0.9, dz), new THREE.Vector3(0, 1, 0));
    const hits = ray.intersectObject(group, true);
    if (hits.length) best = Math.max(best, 0.9 + hits[0].distance);
  }
  if (!best) best = size.y - 0.3;
  return Math.min(Math.max(best, 2.6), size.y - 0.02);
}

// find the biggest open interior area (walkable floor + high ceiling) so the
// camera can spawn INSIDE the model instead of outside its shell
function findInterior(group, size, ceilH) {
  const ray = new THREE.Raycaster();
  const step = Math.min(3, Math.max(1.5, Math.max(size.x, size.z) / 12));
  const open = [];
  for (let x = -size.x / 2 + 1; x <= size.x / 2 - 1; x += step) {
    for (let z = -size.z / 2 + 1; z <= size.z / 2 - 1; z += step) {
      ray.set(new THREE.Vector3(x, 1.2, z), new THREE.Vector3(0, -1, 0));
      const dn = ray.intersectObject(group, true);
      if (!dn.length || dn[0].distance > 1.2) continue; // no floor below
      ray.set(new THREE.Vector3(x, 1.2, z), new THREE.Vector3(0, 1, 0));
      const up = ray.intersectObject(group, true);
      const clearance = up.length ? up[0].distance : 99;
      if (clearance > ceilH - 1.6) open.push([x, z]); // tall, unobstructed cell
    }
  }
  if (!open.length) return null;
  const cx = open.reduce((s, p) => s + p[0], 0) / open.length;
  const cz = open.reduce((s, p) => s + p[1], 0) / open.length;
  // eye = an open cell with clear line-of-sight to the centre, as far back
  // as possible so the first view reads the space (partitions block naïve offsets)
  const target = new THREE.Vector3(cx, ceilH * 0.7, cz);
  const byDist = [...open].sort((a, b) =>
    (Math.hypot(b[0] - cx, b[1] - cz)) - (Math.hypot(a[0] - cx, a[1] - cz)));
  let eye = null;
  for (const [x, z] of byDist) {
    const from = new THREE.Vector3(x, 1.7, z);
    const dir = target.clone().sub(from);
    const dist = dir.length();
    ray.set(from, dir.normalize());
    const hits = ray.intersectObject(group, true);
    if (!hits.length || hits[0].distance > dist - 0.3) { eye = [x, z]; break; }
  }
  if (!eye) eye = byDist[Math.floor(byDist.length / 2)] || [cx, cz + 3];
  return { cx: +cx.toFixed(2), cz: +cz.toFixed(2), ex: +eye[0].toFixed(2), ez: +eye[1].toFixed(2) };
}

export function getSceneCached(id) {
  return cache.get(id) || null;
}

export async function loadScene(id) {
  if (cache.has(id)) return cache.get(id);
  const entry = manifest.get(id);
  if (!entry) return null;
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/scenes/' + entry.file);
    const group = gltf.scene;
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    // floor to y=0, plan-centred at the origin
    group.position.set(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    group.updateWorldMatrix(true, true);
    prepareScene(group);
    const room = {
      w: +size.x.toFixed(2),
      l: +size.z.toFixed(2),
      h: +detectCeiling(group, size).toFixed(2),
    };
    const sc = { group, room, view: findInterior(group, size, room.h) };
    cache.set(id, sc);
    return sc;
  } catch (e) {
    console.warn('Scene load failed:', id, e);
    return null;
  }
}
