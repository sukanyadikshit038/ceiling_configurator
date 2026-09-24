import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { getRoom } from '../lib/rooms.js'

/**
 * A GLB room shell.
 *
 * It is scenery only: it must never take part in placement raycasts, so every
 * mesh is raycast-disabled and the ceiling plane in CeilingGrid.jsx is the sole
 * placement target (BRIEF §6). That is what keeps snapping predictable no
 * matter what furniture happens to be under the cursor.
 */
export default function Room({ room, visible = true, hideCeiling = false, hideFloor = false }) {
  const { scene } = useGLTF(room.model)

  const cloned = useMemo(() => {
    const root = scene.clone(true)

    // The manifest measured this room in CORRECTED units and CENTRED on the
    // origin. Both have to be replayed on the mesh before anything is compared
    // against those numbers:
    //   unitScale — some exports come out 1000x too small or too large
    //   offset    — a room need not be modelled at the origin, but the grid,
    //               the cameras and the saved cell coordinates all are
    const unitScale = room.unitScale ?? 1
    const offset = room.offset ?? { x: 0, z: 0 }
    if (unitScale !== 1) root.scale.setScalar(unitScale)
    root.position.set(offset.x, 0, offset.z)
    root.updateMatrixWorld(true)

    root.traverse((o) => {
      if (!o.isMesh) return
      o.raycast = () => {} // scenery is not clickable
      o.castShadow = false
      o.receiveShadow = true
      // A source ceiling quad would z-fight the grid overlay. Flag it so plan
      // view can drop it and let the placement plane stand in.
      // matched against the height measured from the FILE, not the working
      // zone — a zone set 400 mm lower would stop finding the quad at all
      const slabY = (getRoom(room.id) ?? room).ceiling.y
      const b = new THREE.Box3().setFromObject(o)
      const flat = Math.abs(b.max.y - b.min.y) < 1e-3
      if (flat && Math.abs(b.min.y - slabY) < 1e-3) o.userData.isCeilingQuad = true
      // and the floor, for the view that looks up through it. Rooms are
      // normalised with the floor at y = 0, which is what makes this findable.
      if (flat && Math.abs(b.min.y) < 1e-3) o.userData.isFloorQuad = true
    })
    return root
  }, [scene, room])

  // In plan view the slab is what you are looking through, so drop just that
  // quad — walls are short enough never to occlude from directly above. Below
  // view is the same trade the other way up.
  useEffect(() => {
    cloned.traverse((o) => {
      if (!o.isMesh) return
      if (o.userData.isCeilingQuad) o.visible = !hideCeiling
      if (o.userData.isFloorQuad) o.visible = !hideFloor
    })
  }, [cloned, hideCeiling, hideFloor])

  return <primitive object={cloned} visible={visible} />
}

/** Warm the cache so the first room switch is not a cold load. */
export const preloadRoom = (url) => useGLTF.preload(url)
