import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../lib/store.js'
import {
  cellCentre, pointToCell, pointToMask, clampCorner, footprint, maskDims,
  snapCorner, snapStepOf, MASK_M, DRAW_M,
} from '../lib/grid.js'
import { productReady, productCells } from '../lib/store.js'
import Marquee, { useMarquee } from './Marquee.jsx'
import { PLACE_COLOUR, gridLineColour } from '../lib/theme.js'

/** Thin wireframe of the setting-out grid, drawn just under the slab. */
function GridLines({ g }) {
  // The background is user-set — three presets and a colour picker — so the
  // line colour is derived from it rather than chosen from a pair. See
  // gridLineColour: a threshold between two fixed greys reads at the ends and
  // vanishes on a mid grey, which is one of the three presets.
  const background = useStore((s) => s.background)
  const lineColor = useMemo(() => gridLineColour(background), [background])

  const geo = useMemo(() => {
    const pts = []
    const y = g.y - 0.004
    const x1 = g.originX + g.cols * g.pitch
    const z1 = g.originZ + g.rows * g.pitch
    // Drawn at DRAW_M, not at the placement pitch. The grid steps a millimetre
    // now; 7,500 lines across a 7.5 m ceiling is a solid grey wash that says
    // nothing about where anything will land. What is drawn is a ruler, and
    // what a set snaps to is snapStepOf — they were the same number until the
    // pitch had to get fine enough for a 616.56 mm tile module.
    const nx = Math.round((g.cols * g.pitch) / DRAW_M)
    const nz = Math.round((g.rows * g.pitch) / DRAW_M)
    for (let i = 0; i <= nx; i++) {
      const x = g.originX + i * DRAW_M
      pts.push(x, y, g.originZ, x, y, z1)
    }
    for (let j = 0; j <= nz; j++) {
      const z = g.originZ + j * DRAW_M
      pts.push(g.originX, y, z, x1, y, z)
    }
    const bg = new THREE.BufferGeometry()
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return bg
  }, [g])

  return (
    <lineSegments geometry={geo} raycast={() => {}}>
      <lineBasicMaterial color={lineColor} transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  )
}

/** Cells masked out by lights, sprinklers, HVAC or beams. */
/**
 * Every overlay on the ceiling plane is DOUBLE-SIDED, and has to be.
 *
 * They are planes turned to lie flat, which leaves them facing UP — and a
 * material is front-side only unless told otherwise, so from underneath you are
 * looking at the back of one and see nothing. A ceiling is looked at from below
 * essentially always, which made the hover ghost invisible exactly where it was
 * needed and visible only from a view nobody uses.
 */
function ObstructionCells({ g, cells }) {
  if (!cells.length) return null
  return (
    <group>
      {cells.map((k) => {
        // MASK cells, which are MASK_M squares whatever the placement pitch is.
        const [i, j] = k.split(',').map(Number)
        const x = g.originX + (i + 0.5) * MASK_M
        const z = g.originZ + (j + 0.5) * MASK_M
        return (
          <mesh key={k} position={[x, g.y - 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <planeGeometry args={[MASK_M * 0.92, MASK_M * 0.92]} />
            <meshBasicMaterial
              color={PLACE_COLOUR.no} transparent opacity={0.5} depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * Footprint preview under the cursor while placing.
 *
 * Green means it fits, red means it does not — so a rejected click is never a
 * surprise. The shape is read through the same brushShape/footprint maths the
 * placement itself uses.
 *
 * Those two colours are FIXED, not themed. "It fits" used to be the selection
 * accent, which was green only by coincidence — it was teal — and the light
 * palette turned it coral, leaving both answers red and the ghost saying
 * nothing. See PLACE_COLOUR in lib/theme.js.
 */
function Ghost({ g }) {
  const hoverCell = useStore((s) => s.hoverCell)
  const tool = useStore((s) => s.tool)
  const brush = useStore((s) => s.brush)
  const canPlace = useStore((s) => s.canPlace)
  // Nothing to preview from a half-specified brush: a ghost drawn from
  // whatever the fields happen to hold would be a shape nobody chose, and
  // clicking it places nothing.
  if (tool !== 'place' || !hoverCell || !productReady(brush)) return null

  const base = productCells(brush, g.pitch)
  const along = (brush.params.rot ?? 0) === 90 || (brush.params.rot ?? 0) === 270
  const ci = along ? base.cj : base.ci
  const cj = along ? base.ci : base.cj
  // Snapped and clamped exactly as placeAt does it, because this is the promise
  // placeAt then has to keep. It used to clamp the raw hover cell and skip the
  // snap altogether, so the ghost sat under the cursor while the block landed
  // up to half a module away from it.
  const shape = { type: brush.type, params: brush.params }
  const [i0, j0] = clampCorner(
    ...snapCorner(
      hoverCell[0] - Math.floor(ci / 2),
      hoverCell[1] - Math.floor(cj / 2),
      shape, g,
    ),
    ci, cj, g, snapStepOf(shape, g),
  )
  const ok = canPlace({ i0, j0, ci, cj })
  const x = g.originX + (i0 + ci / 2) * g.pitch
  const z = g.originZ + (j0 + cj / 2) * g.pitch

  return (
    <mesh position={[x, g.y - 0.008, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <planeGeometry args={[ci * g.pitch * 0.96, cj * g.pitch * 0.96]} />
      <meshBasicMaterial
        color={ok ? PLACE_COLOUR.ok : PLACE_COLOUR.no} transparent opacity={0.42} depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/**
 * The patch under the currently selected item.
 *
 * GREEN WHERE IT CAN BE, RED WHERE IT CANNOT — the same language the placement
 * ghost speaks, because this is the same question about the same footprint.
 * It used to be drawn in the selection accent, which the light palette made a
 * coral: a selected set sat under a red patch that, next to a ghost using red
 * for "will not go here", read as an error about a set that was perfectly fine.
 *
 * It is green almost always, and that is correct rather than useless: update()
 * turns down any move that would put a set somewhere illegal, so a set that is
 * on the ceiling is on it legally. The red belongs to the one moment the
 * question is live — a drag asking for a spot the set cannot take, where the
 * set stops following the cursor and nothing else on screen explains why.
 *
 * The OUTLINE around the set keeps the accent. That says "this is the one you
 * have hold of", which is identity, not permission, and the two should not be
 * the same colour.
 */
function SelectionHalo({ g }) {
  const blocked = useStore((s) => s.dragBlocked)
  const items = useStore((s) => s.items)
  // EVERY selected item, not just the anchor. The halo is what tells you what
  // a move or a delete is about to take, and a halo under one of four is a
  // halo that lies about the other three.
  const selectedIds = useStore((s) => s.selectedIds)
  const ids = new Set(selectedIds)
  const on = items.filter((i) => ids.has(i.id))
  if (!on.length) return null
  return (
    <>
      {on.map((it) => {
        const fp = footprint(it, g)
        const x = g.originX + (fp.i0 + fp.ci / 2) * g.pitch
        const z = g.originZ + (fp.j0 + fp.cj / 2) * g.pitch
        return (
          <mesh
            key={it.id}
            position={[x, g.y - 0.01, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => {}}
          >
            <planeGeometry args={[fp.ci * g.pitch, fp.cj * g.pitch]} />
            {/* Every selected item, not just the one under the cursor: a
                refused group move is refused as a whole, and colouring one
                member of it would be describing something that did not
                happen to only part of the selection. */}
            <meshBasicMaterial
              color={blocked ? PLACE_COLOUR.no : PLACE_COLOUR.ok}
              transparent opacity={0.35} depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
    </>
  )
}

/**
 * The single placement target.
 *
 * Raycasting hits only this plane — never the room mesh, never furniture —
 * which is what keeps snapping predictable regardless of what is under the
 * cursor (BRIEF §6).
 */
export default function CeilingGrid({ g }) {
  const tool = useStore((s) => s.tool)
  const showGrid = useStore((s) => s.showGrid)
  const obstructions = useStore((s) => s.obstructions)
  const setHoverCell = useStore((s) => s.setHoverCell)
  const placeAt = useStore((s) => s.placeAt)
  const toggleObstruction = useStore((s) => s.toggleObstruction)
  const select = useStore((s) => s.select)
  const spacePan = useStore((s) => s.spacePan)

  const w = g.cols * g.pitch
  const d = g.rows * g.pitch
  const cx = g.originX + w / 2
  const cz = g.originZ + d / 2

  const cellFromEvent = (e) => {
    const [i, j] = pointToCell(e.point.x, e.point.z, g)
    if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return null
    return [i, j]
  }

  /** The same point as a MASK cell — what the obstruction brush paints in. */
  const marqueeArmed = useStore((s) => s.marquee)
  const marquee = useMarquee(g)

  const maskFromEvent = (e) => {
    const [i, j] = pointToMask(e.point.x, e.point.z, g)
    const m = maskDims(g)
    if (i < 0 || j < 0 || i >= m.cols || j >= m.rows) return null
    return [i, j]
  }

  return (
    <group>
      {showGrid && <GridLines g={g} />}
      <ObstructionCells g={g} cells={obstructions} />
      <SelectionHalo g={g} />
      <Ghost g={g} />
      <Marquee g={g} rect={marquee.rect} />

      <mesh
        position={[cx, g.y - 0.002, cz]}
        rotation={[Math.PI / 2, 0, 0]} // faces down, into the room
        onPointerMove={(e) => {
          if (spacePan) return
          e.stopPropagation()
          setHoverCell(cellFromEvent(e))
          marquee.move(e)
        }}
        onPointerOut={() => setHoverCell(null)}
        onPointerUp={(e) => marquee.end(e)}
        onPointerDown={(e) => {
          // Space is held: this drag belongs to the camera, not the ceiling
          if (spacePan) return
          e.stopPropagation()
          const c = cellFromEvent(e)
          if (!c) return
          if (tool === 'place') placeAt(c[0], c[1])
          else if (tool === 'obstruct') {
            const m = maskFromEvent(e)
            if (m) toggleObstruction(m[0], m[1])
          } else if (marqueeArmed) {
            // Armed: a press on bare ceiling starts a MARQUEE. It only becomes
            // one once the pointer has actually travelled — a plain click has
            // to stay a click, and useMarquee is what clears the selection in
            // that case.
            marquee.start(e)
          } else {
            // Not armed: the drag is the camera's, as it was before any of this
            // existed, and the press clears the selection on its own.
            select(null)
          }
        }}
      >
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
