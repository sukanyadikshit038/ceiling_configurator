// One placed block of ceiling tiles.
//
// The tile counterpart of BaffleSet: same picking box, same drag, same
// selection outline, so a tile block behaves like everything else on the
// ceiling. What differs is underneath — a baffle set is built from catalogue
// numbers, a tile block is a file, and the only thing the configurator changes
// about it is what the tile faces are wearing.
//
// Double-clicking opens the focus editor, the same as a baffle set: a block is
// twelve tiles and any of them can be given its own finish, so there is a part
// to reach in there just as a run has fins.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore, useAccent } from '../lib/store.js'
import { BoxOutline } from './Outline.jsx'
import { footprint, pointToCell } from '../lib/grid.js'
import { useTileModel, useTileBlock, useTileFinishes } from './useTileBlock.js'

export default function TileSet({ item, g }) {
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
  const askFocus = useStore((s) => s.askFocus)
  const spacePan = useStore((s) => s.spacePan)
  const preview = useStore((s) => s.preview)

  const controls = useThree((s) => s.controls)
  const [hovered, setHovered] = useState(false)
  const drag = useRef(null)

  const selected = selectedIds.includes(item.id)
  const model = useTileModel(item.params)
  // Not pickable here: on the ceiling a click belongs to the BLOCK, and the
  // invisible box below owns it. Tiles are picked in the focus editor.
  const block = useTileBlock(model, {
    pickable: false, cols: item.params.cols ?? 1, rows: item.params.rows ?? 1,
  })
  useTileFinishes(block, item.params, model?.tileMm)

  const fp = footprint(item, g)
  const x = g.originX + (fp.i0 + fp.ci / 2) * g.pitch
  const z = g.originZ + (fp.j0 + fp.cj / 2) * g.pitch

  // The outline follows what was actually loaded rather than the nominal size,
  // so a re-exported file with one more tile in it is outlined correctly
  // instead of being outlined at the size this code was written against.
  const size = model?.size ?? { x: fp.ci * g.pitch, y: 0.05, z: fp.cj * g.pitch }
  const boxH = Math.max(0.02, size.y)
  // How far below the slab the block hangs, measured to the TILE FACE — which
  // is how a suspended ceiling is quoted, and is not the same as the top of the
  // assembly: 57 mm of grid sits above the tiles on this file. The model is
  // normalised with its top at y = 0, so the translation is the void the user
  // asked for LESS that overhang, floored at zero — at which point the grid is
  // flush with the slab and cannot rise further.
  //
  // The outline and the pick target take it too, or a hung block is selected by
  // clicking where it used to be.
  const faceOffset = model?.faceOffset ?? 0
  const drop = Math.max(0, (item.params.drop ?? 0) - faceOffset)
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
    // Through the store: a tile lands on its own MODULE, which is what lets two
    // of them share a tee. One undo step per drag, not one per cell crossed.
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
    // A double-click ends as a drag of zero cells; clear it so the modal does
    // not open on top of a drag that never got its pointerup.
    drag.current = null
    endDrag()
    if (controls) controls.enabled = true
    document.body.style.cursor = ''
    askFocus(item.id)
  }

  return (
    <group position={[x, g.y, z]} rotation={[0, ((item.rot ?? 0) * Math.PI) / 180, 0]}>
      {block && (
        <group position={[0, -drop, 0]}>
          <primitive object={block.object} />
          {/* The rods rise from the top of the block to the slab. The file hangs
              them 2,928 mm — the height that ceiling happened to be modelled at
              — so they are scaled to the drop actually asked for. At a drop of
              zero the block is against the slab and they scale to nothing,
              which is the right answer rather than a special case. */}
          {block.rods && block.rodHeight > 0 && (
            <group scale={[1, drop / block.rodHeight, 1]}>
              <primitive object={block.rods} />
            </group>
          )}
        </group>
      )}

      {(selected || hovered) && (
        <BoxOutline
          l={size.x} h={boxH} w={size.z} position={[0, midY, 0]}
          color={selected ? accent : '#ffffff'}
          opacity={selected ? 1 : 0.35}
        />
      )}

      {/* One pick target over the whole block, so a click lands on it wherever
          it falls — including on a rail, which is part of the block and not a
          thing to be selected on its own. Preview omits it entirely: with no
          pick target there is no swallowed camera drag. */}
      {!preview && (
        <mesh
          position={[0, midY, 0]}
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
          <boxGeometry args={[size.x, boxH, size.z]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
