import { useEffect, useMemo } from 'react'
import { buildScenario } from '../lib/furniture.js'
import { getScenario } from '../lib/scenarios.js'
import { getRoom } from '../lib/rooms.js'
import { buildShell, disposeShell } from '../lib/shell.js'

/**
 * A procedural furnished room: the shell plus its scenario's furniture.
 *
 * Same contract as the GLB Room — scenery only, never a placement target — so
 * the two are interchangeable from Scene.jsx's point of view.
 */
export default function ProceduralRoom({ room, visible = true, hideCeiling = false, hideFloor = false }) {
  const built = useMemo(() => {
    const decor = getScenario(room.scenario)?.decor ?? {}
    // The shell is built from the room's OWN ceiling, never the working zone.
    // A zone is an area on the ceiling, not a resize of the building: following
    // it would shrink the walls while the furniture stayed where it was
    // authored, leaving desks standing outside the room.
    const shell = buildShell(getRoom(room.id) ?? room, decor)
    const furniture = buildScenario(room.scenario)
    if (furniture) {
      // furniture is decoration; it must not intercept placement clicks
      furniture.traverse((o) => { if (o.isMesh) o.raycast = () => {} })
      shell.add(furniture)
    }
    return shell
  }, [room])

  // built in a memo, so it has to be freed when that memo is replaced
  useEffect(() => () => disposeShell(built), [built])

  useEffect(() => {
    built.traverse((o) => {
      if (!o.isMesh) return
      if (o.userData.isCeilingQuad) o.visible = !hideCeiling
      if (o.userData.isFloorQuad) o.visible = !hideFloor
    })
  }, [built, hideCeiling, hideFloor])

  return <primitive object={built} visible={visible} />
}
