// Where does a Fly's suspension actually start and stop?
//
// Reported as "the model is not touching the ceiling", with the gap circled.
// The gap is the drop: build-fly puts the assembly's top at y = 0 and FlySet
// hangs the whole thing 350 mm lower with nothing bridging it. Whether that is
// wrong depends on what the topmost parts ARE — if they are droppers, they are
// the suspension and should reach the slab like a cloud's wire.
//
// Reads the lightened .glb and writes nothing.

import fs from 'node:fs'
import path from 'node:path'
import '../scripts/build-manifest.mjs'
import * as THREE from 'three'

const DIR = path.resolve('public/models/Fly/corrected')
const pad = (s, n) => String(s).padEnd(n)
const mm = (v) => (v * 1000).toFixed(0)

for (const file of fs.readdirSync(DIR).filter((f) => /\.glb$/i.test(f)).sort()) {
  const b = fs.readFileSync(path.join(DIR, file))
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new Promise((res, rej) => {
    new GLTFLoader().parse(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)
  })
  const root = gltf.scene
  root.updateMatrixWorld(true)
  const whole = new THREE.Box3().setFromObject(root)

  console.log(`\n=== ${file} ===`)
  console.log(`  overall y  ${mm(whole.min.y)} .. ${mm(whole.max.y)} mm  (top should be 0)`)

  const parts = []
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const bb = new THREE.Box3().setFromObject(o)
    const s = bb.getSize(new THREE.Vector3())
    parts.push({
      name: o.name, wing: !!o.userData?.flyWing,
      y0: bb.min.y, y1: bb.max.y,
      w: Math.max(s.x, s.z), h: s.y,
      // tall against its own width is a dropper, the same test clouds use
      slim: s.y > Math.max(s.x, s.z) * 1.5,
    })
  })

  // Everything in the top 40% of the assembly, which is where a dropper lives.
  const cut = whole.max.y - (whole.max.y - whole.min.y) * 0.4
  const high = parts.filter((p) => p.y1 > cut).sort((a, b) => b.y1 - a.y1)
  console.log(`\n  parts reaching the top 40% (above ${mm(cut)} mm)`)
  console.log(`  ${pad('part', 16)} ${pad('y range mm', 20)} ${pad('w x h mm', 18)} slim?`)
  for (const p of high.slice(0, 10)) {
    console.log(`  ${pad(p.name, 16)} ${pad(`${mm(p.y0)} .. ${mm(p.y1)}`, 20)}`
      + ` ${pad(`${mm(p.w)} x ${mm(p.h)}`, 18)} ${p.slim ? 'DROPPER' : ''}`)
  }

  // The droppers as a set: how tall are they, and do they all reach the top?
  const droppers = parts.filter((p) => p.slim && p.y1 > cut)
  if (droppers.length) {
    const top = Math.max(...droppers.map((p) => p.y1))
    const bottom = Math.min(...droppers.map((p) => p.y0))
    console.log(`\n  ${droppers.length} droppers, ${mm(bottom)} .. ${mm(top)} mm`)
    console.log(`  tallest ${mm(Math.max(...droppers.map((p) => p.h)))} mm`)
    console.log(`  they ${Math.abs(top - whole.max.y) < 1e-6 ? 'DO' : 'do NOT'} reach the top of the assembly`)
  } else {
    console.log('\n  no slim parts at the top — nothing that reads as a dropper')
  }

  const wings = parts.filter((p) => p.wing)
  console.log(`  wings hang ${mm(Math.min(...wings.map((p) => p.y0)))}`
    + ` .. ${mm(Math.max(...wings.map((p) => p.y1)))} mm`)
}
