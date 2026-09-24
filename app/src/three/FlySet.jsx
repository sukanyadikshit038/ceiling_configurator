// One placed Fly.
//
// Picking and dragging are CloudSet's, wholesale — a Fly behaves like anything
// else once it is down. Two things are its own:
//
//   the WINGS take the finish, and nothing else does. A cloud is one panel with
//   two sides; a Fly is four or eight separate pieces of felt on a hardware
//   frame, and the frame is steel. So the fabric goes on the meshes build-fly
//   flagged and the rest keeps the grey it was built with.
//
//   the SUSPENSION is drawn, not scaled. A Fly's own suspension is modelled —
//   a fixing, a rod, a bracket, stacked, with the frame threaded through it —
//   and it reaches the top of the assembly, so at a drop of zero it touches the
//   slab. At any other drop the whole thing moves down and nothing bridges the
//   gap: four rods stopping in mid-air under an empty ceiling, which is what
//   "the model is not touching the ceiling" was.
//
//   A cloud scales its wire because a cloud HAS one wire. This has a stack of
//   separate parts, and stretching those in place would pull them away from each
//   other. So the assembly stays rigid and an extension is drawn above it, at
//   the four points the model itself hangs from — see hangersOf in lib/fly.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore, useAccent } from '../lib/store.js'
import { BoxOutline } from './Outline.jsx'
import { footprint, pointToCell } from '../lib/grid.js'
import {
  loadFlyModel, flyModel, subscribeFlyModel, flyFor, flyExtent, flyWingTexture,
  FLY_WING,
} from '../lib/fly.js'
import { subscribeTextile, panelFor } from '../lib/textiles.js'
import { maxAnisotropy } from '../lib/gpu.js'

/** The Fly for a size, loaded once and shared. */
function useFly(size) {
  const entry = size != null ? flyFor(size) : null
  const id = entry?.id ?? null
  const [model, setModel] = useState(() => (id ? flyModel(id) : null))
  useEffect(() => {
    setModel(id ? flyModel(id) : null)
    const off = subscribeFlyModel(() => setModel(id ? flyModel(id) : null))
    if (id) loadFlyModel(id)
    return off
  }, [id])
  return model
}

/**
 * A private copy, with the wings on one material of their own.
 *
 * Cloned because an Object3D has one parent and two placed Flys would steal the
 * model from each other. ONE material for all the wings rather than one each:
 * they are the same cloth at the same crop, so a second material would be a
 * second upload of the same thing and a second chance for them to disagree.
 *
 * The hardware keeps the grey build-fly gave it and is never touched.
 */
function useFlyParts(model) {
  return useMemo(() => {
    if (!model) return null
    const object = model.object.clone(true)
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95, metalness: 0,
    })
    const wings = []
    object.traverse((o) => {
      if (!o.isMesh) return
      o.raycast = () => {}
      if (o.userData?.flyWing) { o.material = wingMat; wings.push(o) }
    })
    return { object, wingMat, wings }
  }, [model])
}

export default function FlySet({ item, g }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const selectedIds = useStore((s) => s.selectedIds)
  const tool = useStore((s) => s.tool)
  const select = useStore((s) => s.select)
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
  const model = useFly(item.params.size)
  const parts = useFlyParts(model)

  // Bumped when a fabric sheet lands. A Fly placed before its cloth downloaded
  // has nothing to paint yet, and without this it would sit on its fallback
  // colour until something else happened to re-render it.
  const [sheets, setSheets] = useState(0)
  useEffect(() => subscribeTextile(() => setSheets((n) => n + 1)), [])

  const colour = item.params.colour

  useEffect(() => {
    if (!parts) return undefined
    // The shade's flat colour first, so a Fly reads as the right colour while
    // its sheet is still coming rather than flashing white. The panel map knows
    // the hex; there is no swatch family to ask, because Fly's ten shades are
    // ten of the 275 rather than a range of their own.
    const hex = panelFor(colour)?.hex ?? '#c9c9c9'
    parts.wingMat.color.set(hex)
    parts.wingMat.map = null
    parts.wingMat.needsUpdate = true
    if (!colour) return undefined

    let live = true
    flyWingTexture(colour, { wing: FLY_WING }).then((tex) => {
      // The Fly may have been replaced or unmounted while the sheet was
      // downloading; painting onto a material nobody holds is how a disposed
      // one gets used.
      if (!live || !tex || !parts.wingMat) return
      tex.anisotropy = maxAnisotropy()
      parts.wingMat.map = tex
      // White underneath, or the dye would be multiplied by itself.
      parts.wingMat.color.set('#ffffff')
      parts.wingMat.needsUpdate = true
    })
    return () => { live = false }
  }, [parts, colour, sheets])

  useEffect(() => () => parts?.wingMat.dispose(), [parts])

  const fp = footprint(item, g)
  const x = g.originX + (fp.i0 + fp.ci / 2) * g.pitch
  const z = g.originZ + (fp.j0 + fp.cj / 2) * g.pitch

  const plan = flyExtent(item.params)
  const extent = model?.extent ?? { x: plan.length, y: 0.363, z: plan.width }
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
    select(item.id, {
      additive: !!(e.nativeEvent?.shiftKey ?? e.shiftKey),
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
      {/* The rod from the slab down to the assembly. Drawn at the fixing's own
          section, so it reads as the same rod continuing rather than a
          different part arriving. Nothing at all at a drop of zero, where the
          model already touches. */}
      {parts && drop > 0.001 && model?.hangers?.map((h, i) => (
        <mesh key={i} position={[h.x, -drop / 2, h.z]}>
          <boxGeometry args={[h.w, drop, h.d]} />
          <meshStandardMaterial color="#9a9a9a" roughness={0.55} metalness={0.35} />
        </mesh>
      ))}

      {parts && (
        <group position={[0, -drop, 0]}>
          <primitive object={parts.object} />
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
