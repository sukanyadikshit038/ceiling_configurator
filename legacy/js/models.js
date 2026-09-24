// Real product 3D models (FBX) — loaded from /models/manifest.json.
// Parts are extracted by node name, baked to world space, converted from
// millimetres to metres and centred, then shared as template geometries.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const MODEL_LIBRARY = []; // {id, name} for the UI
const cache = new Map();         // id -> { parts: { name: { geometry, size } } }

export async function initModelLibrary() {
  let list;
  try {
    const res = await fetch('/models/manifest.json');
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return; // no model library available
  }
  const loader = new FBXLoader();
  for (const entry of list) {
    if (cache.has(entry.id)) continue;
    try {
      const obj = await loader.loadAsync('/models/' + entry.file);
      obj.updateWorldMatrix(true, true);
      // entry.scale converts baked world units to metres (FBX exports often
      // carry a unit conversion in the root transform — verify per model)
      const scale = entry.scale ?? 0.001;
      const parts = {};
      for (const [part, nodeName] of Object.entries(entry.parts || {})) {
        const node = obj.getObjectByName(nodeName);
        if (!node) continue;
        let mesh = null;
        node.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) continue;
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geo.scale(scale, scale, scale);
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
        geo.computeBoundingBox();
        geo.userData.shared = true; // template geometry — never dispose per-item
        const size = new THREE.Vector3();
        geo.boundingBox.getSize(size);
        parts[part] = { geometry: geo, size };
      }
      if (Object.keys(parts).length) {
        cache.set(entry.id, { parts });
        MODEL_LIBRARY.push({ id: entry.id, name: entry.name });
      }
      // whole-model template: every mesh baked to world space, recentred so
      // the assembly hangs from its top (y = 0 at the ceiling)
      if (entry.assembly) {
        const asmParts = [];
        const box = new THREE.Box3();
        obj.traverse(o => {
          if (!o.isMesh) return;
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          geo.scale(scale, scale, scale);
          geo.computeBoundingBox();
          box.union(geo.boundingBox);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          asmParts.push({ geometry: geo, color: '#' + (mats[0].color?.getHexString() || 'c6c6c6') });
        });
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        const topY = box.max.y;
        for (const ap of asmParts) {
          ap.geometry.translate(-cx, -topY, -cz);
          ap.geometry.userData.shared = true;
        }
        const size = new THREE.Vector3();
        box.getSize(size);

        // identify blade units so single baffles can be selected & recoloured:
        // a blade is the long thin slab; clips/rods adopt the nearest blade's
        // unit index (sorted left→right across the assembly)
        for (const ap of asmParts) {
          ap.geometry.computeBoundingBox();
          const bb = ap.geometry.boundingBox;
          ap.size = new THREE.Vector3();
          bb.getSize(ap.size);
          ap.center = new THREE.Vector3();
          bb.getCenter(ap.center);
          const maxDim = Math.max(ap.size.x, ap.size.y, ap.size.z);
          const minDim = Math.min(ap.size.x, ap.size.y, ap.size.z);
          ap.isBlade = maxDim > 1.2 && minDim < 0.06 && ap.size.y > 0.05;
        }
        const bladeParts = asmParts.filter(p2 => p2.isBlade).sort((a, b) => a.center.x - b.center.x);
        bladeParts.forEach((p2, i) => { p2.unit = i; });
        const pitch = bladeParts.length > 1
          ? (bladeParts[bladeParts.length - 1].center.x - bladeParts[0].center.x) / (bladeParts.length - 1)
          : 1;
        for (const ap of asmParts) {
          if (ap.unit !== undefined) continue;
          let best = null, bestD = pitch * 0.6;
          for (const bp of bladeParts) {
            const d = Math.abs(ap.center.x - bp.center.x);
            if (d < bestD) { bestD = d; best = bp; }
          }
          ap.unit = best ? best.unit : null;
        }
        // planar UVs on blades (grain along the blade's long axis) so real
        // veneers and catalog finishes map correctly on override
        for (const bp of bladeParts) {
          const bb = bp.geometry.boundingBox;
          const pos = bp.geometry.attributes.position;
          const uv = new Float32Array(pos.count * 2);
          const alongZ = bp.size.z >= bp.size.x;
          for (let i = 0; i < pos.count; i++) {
            const u = alongZ
              ? (pos.getZ(i) - bb.min.z) / (bp.size.z || 1)
              : (pos.getX(i) - bb.min.x) / (bp.size.x || 1);
            uv[i * 2] = u;
            uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bp.size.y || 1);
          }
          bp.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }

        cache.set(entry.id + '-assembly', { assembly: { parts: asmParts, size, units: bladeParts.length } });
        MODEL_LIBRARY.push({ id: entry.id + '-assembly', name: entry.name + ' — full assembly' });
      }
    } catch (e) {
      console.warn('Model load failed:', entry.id, e);
    }
  }
}

export function getModel(id) {
  return cache.get(id) || null;
}
