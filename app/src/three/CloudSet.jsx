// One placed acoustic cloud.
//
// The third product on the ceiling, and the simplest: one panel, one colour, one
// suspension. It borrows BaffleSet's picking and dragging wholesale, because a
// cloud behaves like everything else once it is down.
//
// What is particular to it is the suspension. Each file carries its own wire —
// between 435 and 1013 mm depending on shape and size — and that is the height
// the cloud happened to be modelled at, not one anybody asked for. The wire is
// on its own group and scaled in Y to the drop, exactly as the ceiling tile rods
// are, so a cloud hangs where it is told and its panel stays the size it is.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore, useAccent } from '../lib/store.js'
import { BoxOutline } from './Outline.jsx'
import { footprint, pointToCell } from '../lib/grid.js'
import { cloudExtent } from '../lib/clouds.js'
import { useCloud, useCloudParts, useCloudFinish } from './useCloudModel.js'

export default function CloudSet({ item, g }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const selectedIds = useStore((s) => s.selectedIds)
  const tool = useStore((s) => s.tool)
  const select = useStore((s) => s.select)
  const update = useStore((s) => s.update)
  const dragTo = useStore((s) => s.dragTo)
  // A refusal must not outlive the drag that caused it — see dragBlocked
  // in the store. Called wherever this component forgets the drag.
  const beginDrag = useStore((s) => s.beginDrag)
  const endDrag = useStore((s) => s.endDrag)
  const spacePan = useStore((s) => s.spacePan)
  const preview = useStore((s) => s.preview)

  const controls = useThree((s) => s.controls)
  const [hovered, setHovered] = useState(false)
  const drag = useRef(null)

  const selected = selectedIds.includes(item.id)
  const model = useCloud(item.params.shape, item.params.size)
  const parts = useCloudParts(model)

  // The model, its materials and its finish — all of it shared with the focus
  // view, which shows the same cloud and must not drift from this one.
  useCloudFinish(parts, item.params)

  const fp = footprint(item, g)
  const x = g.originX + (fp.i0 + fp.ci / 2) * g.pitch
  const z = g.originZ + (fp.j0 + fp.cj / 2) * g.pitch

  const extent = model?.extent ?? { x: fp.ci * g.pitch, y: 0.04, z: fp.cj * g.pitch }
  const boxH = Math.max(0.02, extent.y)
  const drop = Math.max(0, item.params.drop ?? 0)
  const midY = -drop - boxH / 2

  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -g.y), [g.y])
  const cellUnder = (e) => {
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(dragPlane, hit)) return null
    return pointToCell(hit.x, hit.z, g)
  }

  const onDown = (e) => {
    if (spacePan) return
    e.stopPropagation()
    // Shift adds to the selection rather than replacing it. The modifier is
    // read off the native event: R3F's synthetic one carries it, but not on
    // every version, and a missing shift silently becomes a plain click.
    select(item.id, {
      additive: !!(e.nativeEvent?.shiftKey ?? e.shiftKey),
      // Alt reaches past the group to this one item — how you pick a single
      // tile out of a zone without taking the zone apart.
      only: !!(e.nativeEvent?.altKey ?? e.altKey),
    })
    if (tool === 'obstruct') return
    const c = cellUnder(e)
    if (!c) return
    drag.current = { di: item.cell[0] - c[0], dj: item.cell[1] - c[1] }
    // Where it was, and one undo step for the whole drag — see beginDrag.
    beginDrag(item.id)
    if (controls) controls.enabled = false
    e.target.setPointerCapture?.(e.pointerId)
    document.body.style.cursor = 'grabbing'
  }

  const onMove = (e) => {
    if (!drag.current) return
    e.stopPropagation()
    const c = cellUnder(e)
    if (!c) return
    // Through the store, so the snap is one rule in one place: a tile lands on
    // its module, everything else on 100 mm. The grid counts millimetres.
    dragTo(item.id, c[0] + drag.current.di, c[1] + drag.current.dj)
  }

  const onUp = (e) => {
    if (!drag.current) return
    e.stopPropagation()
    e.target.releasePointerCapture?.(e.pointerId)
    drag.current = null
    endDrag()
    if (controls) controls.enabled = true
    document.body.style.cursor = 'grab'
  }

  return (
    <group position={[x, g.y, z]} rotation={[0, ((item.rot ?? 0) * Math.PI) / 180, 0]}>
      {parts && (
        <group position={[0, -drop, 0]}>
          <primitive object={parts.object} />
          {/* Scaled to the drop. The file hangs it at whatever height it was
              modelled at — 435 mm on one shape, 1013 on another — and that is
              not a number anybody chose. */}
          {parts.wires && parts.wireHeight > 0 && (
            <group scale={[1, drop / parts.wireHeight, 1]}>
              <primitive object={parts.wires} />
            </group>
          )}
        </group>
      )}

      {(selected || hovered) && (
        <BoxOutline
          l={extent.x} h={boxH} w={extent.z} position={[0, midY, 0]}
          color={selected ? accent : '#ffffff'}
          opacity={selected ? 1 : 0.35}
        />
      )}

      {!preview && (
        <mesh
          position={[0, midY, 0]}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerOver={(e) => {
            if (spacePan) return
            e.stopPropagation()
            setHovered(true)
            document.body.style.cursor = 'grab'
          }}
          onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}
        >
          <boxGeometry args={[extent.x, boxH, extent.z]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
