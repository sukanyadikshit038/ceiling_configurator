// Generates a single lay-in ceiling tile and the T-bar frame around it.
//
// Written out as a .glb into public/models/ceiling_tiles, so it loads through
// exactly the same path as the supplied models and can be opened in any viewer.
// Run it again to change a dimension — the numbers below are the only place they
// live, and nothing is measured back out of the file.
//
// MILLIMETRES, not metres. glTF convention is metres, but lib/tiles.js scales
// tile models by a hard 0.001 on load because every supplied file is in mm, and
// a model that disagreed with its siblings would come in a thousand times small.
//
// The section, and why each number is where it is:
//
//        ___              bulb: stiffens the web, never seen from the room
//       |   |
//       |   |             web:  carries the tile load up to the hangers
//   ____|___|____
//  |_____________|        flange: the 24 mm you see. The LOWEST thing here, so
//   ####     ####         it hides the last 9.5 mm of tile on each side.
//    tile rests on it
//
// A 600 module reads as 24 mm of grid and 576 mm of tile. The tile is 595 wide:
// wider than the 576 opening, which is what stops it falling through, and it is
// tilted in on installation rather than lowered.

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

// GLTFExporter reaches for FileReader to turn its buffers into a blob. Node has
// Blob but not FileReader, so it is stubbed here the same way build-manifest
// stubs the DOM for FBXLoader — enough for the one path the exporter takes.
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => { this.result = ab; this.onloadend && this.onloadend() })
    }
  }
}
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// ---------------------------------------------------------------------------
// the dimensions — the only place they live
// ---------------------------------------------------------------------------

export const SPEC = {
  module: 600,      // centre to centre of the T-bars
  tile: 595,        // the tile itself; 595 on a 600 module leaves 2.5 mm each side
  tileThick: 15,
  flangeW: 24,      // the width you see from the room
  flangeT: 2.2,
  webW: 1.6,
  gridDepth: 38,    // flange underside up to the top of the bulb
  bulbR: 3,
}

const OUT_DIR = path.join('public', 'models', 'ceiling_tiles')
const OUT_FILE = 'Tile 600x600.glb'

// ---------------------------------------------------------------------------

/**
 * One T-bar, lying along its length, as a single merged geometry.
 *
 * Built at the origin running along X, then the caller turns and places it. The
 * three parts are merged because a bar is one extrusion in the real world and
 * one mesh keeps the classifier's count of "grid pieces" meaningful.
 */
function tbar(length, s) {
  const webH = s.gridDepth - s.flangeT - s.bulbR * 2

  const flange = new THREE.BoxGeometry(length, s.flangeT, s.flangeW)
  flange.translate(0, s.flangeT / 2, 0)

  const web = new THREE.BoxGeometry(length, webH, s.webW)
  web.translate(0, s.flangeT + webH / 2, 0)

  // A cylinder along X: rotated about Z so its axis lies down the bar.
  const bulb = new THREE.CylinderGeometry(s.bulbR, s.bulbR, length, 12)
  bulb.rotateZ(Math.PI / 2)
  bulb.translate(0, s.flangeT + webH + s.bulbR, 0)

  const g = mergeGeometries([flange, web, bulb], false)
  flange.dispose(); web.dispose(); bulb.dispose()
  return g
}

export function buildTileModel(s = SPEC) {
  const root = new THREE.Group()
  root.name = 'Tile600Assembly'

  const half = s.module / 2
  const barLen = s.module + s.flangeW   // overlapping at the corners, as they mitre

  const grid = new THREE.MeshStandardMaterial({
    name: 'Grid', color: 0x9aa1a9, roughness: 0.55, metalness: 0.35,
  })
  const face = new THREE.MeshStandardMaterial({
    name: 'TileFace', color: 0xf2efe9, roughness: 0.78, metalness: 0,
  })

  // --- the frame: four bars on the module lines ----------------------------
  // Named by side so a re-export keeps them identifiable, though nothing
  // downstream reads the names — the classifier sorts by shape.
  for (const [name, along, at] of [
    ['Grid_N', 'x', -half], ['Grid_S', 'x', half],
    ['Grid_W', 'z', -half], ['Grid_E', 'z', half],
  ]) {
    const g = tbar(barLen, s)
    if (along === 'z') g.rotateY(Math.PI / 2)
    g.translate(along === 'x' ? 0 : at, 0, along === 'x' ? at : 0)
    const m = new THREE.Mesh(g, grid)
    m.name = name
    root.add(m)
  }

  // --- the tile: resting ON the flange -------------------------------------
  // Its underside sits at the flange top, which is what puts 9.5 mm of it
  // behind the flange and leaves 576 mm on show.
  const tile = new THREE.BoxGeometry(s.tile, s.tileThick, s.tile)
  tile.translate(0, s.flangeT + s.tileThick / 2, 0)
  const tileMesh = new THREE.Mesh(tile, face)
  tileMesh.name = 'Tile'
  root.add(tileMesh)

  return root
}

// ---------------------------------------------------------------------------

async function main() {
  const s = SPEC
  const root = buildTileModel(s)
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const seen = s.module - s.flangeW
  const hidden = (s.tile - seen) / 2

  console.log(`\n  ${OUT_FILE}`)
  console.log(`    module      ${s.module} x ${s.module} mm`)
  console.log(`    tile        ${s.tile} x ${s.tile} x ${s.tileThick} mm`)
  console.log(`    grid face   ${s.flangeW} mm wide, ${s.gridDepth} mm deep`)
  console.log(`    seen        ${seen} mm of tile + ${s.flangeW} mm of grid = ${seen + s.flangeW}`)
  console.log(`    hidden      ${hidden.toFixed(1)} mm of tile behind each flange`)
  console.log(`    extent      ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`)

  const glb = await new Promise((res, rej) => {
    new GLTFExporter().parse(root, res, rej, { binary: true })
  })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = path.join(OUT_DIR, OUT_FILE)
  fs.writeFileSync(out, Buffer.from(glb))
  console.log(`    written     ${out}  (${(glb.byteLength / 1024).toFixed(0)} KB)\n`)
}

// pathToFileURL, not string surgery: on Windows argv[1] uses backslashes and the
// URL it corresponds to is file:///D:/... — three slashes, forward separators.
if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
