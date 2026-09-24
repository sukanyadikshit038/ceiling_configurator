import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore, useAccent } from '../lib/store.js'
import { useBaffleGroup } from './useBaffleGroup.js'
import { BoxOutline, FinHighlight } from './Outline.jsx'
import { footprint, pointToCell } from '../lib/grid.js'

/**
 * One placed baffle set.
 *
 * The geometry is built from catalogue parameters (lib/baffle.js, via
 * useBaffleGroup) and rebuilt whenever they change; the three.js resources it
 * owns are disposed when it is replaced or unmounted, which is what keeps a
 * long session from degrading.
 *
 * Picking and dragging go through an invisible box sized to the set's
 * footprint, so a click lands on the set even between its fins. Double-clicking
 * opens the set on its own in the focus editor, where the fins can be reached
 * one at a time without the rest of the ceiling in the way.
 */
export default function BaffleSet({ item, g }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const selectedIds = useStore((s) => s.selectedIds)
  const selectedFin = useStore((s) => s.selectedFin)
  const tool = useStore((s) => s.tool)
  const select = useStore((s) => s.select)
  const selectFin = useStore((s) => s.selectFin)
  const askFocus = useStore((s) => s.askFocus)
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

  const { group, extent, depth, effectiveDrop, dropOffset } = useBaffleGroup(item.params)

  const fp = footprint(item, g)
  const x = g.originX + (fp.i0 + fp.ci / 2) * g.pitch
  const z = g.originZ + (fp.j0 + fp.cj / 2) * g.pitch

  const boxH = effectiveDrop + depth
  const boxY = -boxH / 2

  // --- drag on the ceiling plane -------------------------------------------
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -g.y), [g.y])

  const cellUnder = (e) => {
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(dragPlane, hit)) return null
    return pointToCell(hit.x, hit.z, g)
  }

  const onDown = (e) => {
    if (spacePan) return // the camera owns this drag
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
    // a click that landed on a fin picks that fin — for a rebuilt model run as
    // well as a parametric set; both tag their blades with a fin index
    const finIndex = e.object?.userData?.finIndex
    if (finIndex != null) selectFin(finIndex)
    if (tool === 'obstruct') return
    const c = cellUnder(e)
    if (!c) return
    drag.current = { di: item.cell[0] - c[0], dj: item.cell[1] - c[1] }
    // Where it was, and one undo step for the whole drag — see beginDrag.
    beginDrag(item.id)
    if (controls) controls.enabled = false // orbit must not fight the drag
    e.target.setPointerCapture?.(e.pointerId)
    document.body.style.cursor = 'grabbing'
  }

  const onMove = (e) => {
    if (!drag.current) return
    e.stopPropagation()
    const c = cellUnder(e)
    if (!c) return
    // Through the store, so the snap is one rule in one place, and one undo
    // step per drag rather than one per cell crossed. The grid counts
    // millimetres now, so an unsnapped drag would land wherever the pointer is.
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

  const onDoubleClick = (e) => {
    if (spacePan || tool === 'obstruct') return
    e.stopPropagation()
    // a double-click ends as a drag of zero cells; clear it so the modal does
    // not open on top of a drag that never got its pointerup
    drag.current = null
    endDrag()
    if (controls) controls.enabled = true
    document.body.style.cursor = ''
    askFocus(item.id)
  }

  return (
    <group position={[x, g.y, z]} rotation={[0, ((item.rot ?? 0) * Math.PI) / 180, 0]}>
      {group && (
        <group position={[0, dropOffset, 0]}>
          <primitive object={group} />
        </group>
      )}

      {(selected || hovered) && (
        <BoxOutline
          l={extent.length} h={boxH} w={extent.width} position={[0, boxY, 0]}
          color={selected ? accent : '#ffffff'}
          opacity={selected ? 1 : 0.35}
        />
      )}

      {selected && selectedFin?.index != null && (
        <FinHighlight item={item} extent={extent} depth={depth} index={selectedFin.index} />
      )}

      {/* One pick target covering the whole set, so clicks between fins land.
          Preview omits it entirely rather than adding handlers that decline:
          with no pick target there is no hover cursor and no swallowed camera
          drag either, so a drag that starts on a baffle orbits the room. */}
      {!preview && (
      <mesh
        position={[0, boxY, 0]}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={onDoubleClick}
        onPointerOver={(e) => {
          if (spacePan) return
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}
      >
        <boxGeometry args={[extent.length, boxH, extent.width]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      )}
    </group>
  )
}
