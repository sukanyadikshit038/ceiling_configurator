// The room shell for a procedural room: floor, ceiling, walls and a door.
//
// Pure three.js. Walls face inward so the room reads as a dollhouse from
// outside — you can orbit out and still see in, which matters because the
// camera is not locked to the interior.
//
// Like every other room, this is scenery: nothing here is a placement target.
// CeilingGrid.jsx owns the one plane raycasts hit.

import * as THREE from 'three'
import { carpetTexture, stripedCarpetTexture, plasterTexture } from './textures.js'

const DOOR_W = 0.95
const DOOR_H = 2.05

/**
 * Build the shell for a room, in world space with the floor at y = 0 and the
 * plan centred on the origin.
 *
 * `decor` comes from the scenario: wall/floor tint and which carpet to use.
 */
export function buildShell(room, decor = {}) {
  const w = room.ceiling.maxX - room.ceiling.minX
  const l = room.ceiling.maxZ - room.ceiling.minZ
  const h = room.ceiling.y
  const g = new THREE.Group()
  g.name = 'RoomShell'

  const carpet = (decor.floorTex === 'striped' ? stripedCarpetTexture() : carpetTexture()).clone()
  carpet.repeat.set(w, l)
  carpet.needsUpdate = true
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ map: carpet, color: decor.floor || '#ffffff', roughness: 0.98 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  // Below view looks up THROUGH here, so it has to be droppable — the same
  // reason the ceiling quad is flagged for plan view.
  floor.userData.isFloorQuad = true
  g.add(floor)

  const plaster = plasterTexture().clone()
  plaster.repeat.set(w / 2, l / 2)
  plaster.needsUpdate = true
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 })
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  ceiling.userData.isCeilingQuad = true
  g.add(ceiling)

  const wallMat = new THREE.MeshStandardMaterial({ color: decor.wall || '#e2e5e8', roughness: 0.95 })
  const wall = (width, rotY, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), wallMat)
    m.rotation.y = rotY
    m.position.set(x, h / 2, z)
    m.receiveShadow = true
    g.add(m)
  }
  wall(w, 0, 0, -l / 2)
  wall(w, Math.PI, 0, l / 2)
  wall(l, Math.PI / 2, -w / 2, 0)
  wall(l, -Math.PI / 2, w / 2, 0)

  // a door, purely so the space has a human scale reference
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W, DOOR_H),
    new THREE.MeshStandardMaterial({ color: 0x6f7478, roughness: 0.8 })
  )
  door.position.set(w / 4, DOOR_H / 2, -l / 2 + 0.01)
  g.add(door)

  g.traverse((o) => { if (o.isMesh) o.raycast = () => {} })
  return g
}

/** Free a shell's geometry and materials. */
export function disposeShell(g) {
  g.traverse((o) => {
    if (!o.isMesh) return
    o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      m.map?.dispose()
      m.dispose()
    }
  })
}
