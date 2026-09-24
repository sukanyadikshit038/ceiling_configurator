// Rubber-band selection: drag a rectangle on bare ceiling, get everything it
// touches.
//
// It lives on the ceiling PLANE rather than on the screen, which is the whole
// reason it is here and not in a DOM overlay. The plane is where the footprints
// are — a set's footprint is cells, and cells are a fact about the ceiling, not
// about where the camera happens to be standing. A screen-space rectangle would
// have to be unprojected against a plane anyway, and would select different
// things depending on the angle you happened to be orbiting at.
//
// TOUCHES, not contains. A marquee that only took what it fully enclosed would
// refuse to pick up a run whose far end you could not quite reach, which is the
// case you most want it for.

import { useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, useAccent } from '../lib/store.js'
import { footprint, pointToCell, clampToCeiling } from '../lib/grid.js'

/**
 * How far the pointer has to travel before a press becomes a drag, in metres
 * on the ceiling.
 *
 * Without it every click on bare ceiling is a marquee of zero size, which
 * selects nothing and — worse — would swallow the click that CLEARS the
 * selection. 60 mm is under a finger's wobble and well under a tile.
 */
const SLOP = 0.06

/** The rectangle's own state, and the three handlers the ceiling plane needs. */
export function useMarquee(g) {
  const selectMany = useStore((s) => s.selectMany)
  const select = useStore((s) => s.select)
  const items = useStore((s) => s.items)
  const tool = useStore((s) => s.tool)
  const spacePan = useStore((s) => s.spacePan)
  const armed = useStore((s) => s.marquee)
  // The camera has to let go for the length of the drag, exactly as it does
  // when a set is dragged. Without this OrbitControls takes the whole gesture
  // and the ceiling never sees a pointermove — the band never appears and the
  // view spins instead.
  const controls = useThree((st) => st.controls)

  // The live rectangle, in world metres. Null when nothing is being dragged.
  const [rect, setRect] = useState(null)
  // Where the press landed, whether it has travelled far enough to count, and
  // whether it was additive. A ref rather than state: it changes on every
  // pointermove and none of it needs to paint anything on its own.
  const drag = useRef(null)

  /**
   * The ceiling as an UNBOUNDED plane, and the band held inside the zone.
   *
   * This used to read `e.point`, the intersection with the ceiling MESH — and
   * that mesh is exactly the size of the zone. Drag past its edge and the ray
   * stops hitting it, at which point react-three-fiber delivers the event with
   * the CAPTURED intersection instead: the point where the press landed. So
   * `to` snapped back to `from`, `box(from, from)` had no extent, the
   * stale-sample guard below rejected it, and the band froze where it was
   * until the pointer came back over the ceiling. Measured: the rectangle grew
   * to x1 = 3.28 m and stayed there while the cursor travelled another 200 px,
   * with hoverCell reading the press cell rather than anything under the
   * pointer.
   *
   * An unbounded plane has an intersection wherever the ray is not parallel to
   * it, so the band keeps tracking; clamping to the zone then pins the edge
   * that has run out of ceiling while the other one carries on following. A
   * band drawn out into the room would be offering to select ceiling that is
   * not there.
   *
   * The same unbounded plane the item drag has always used — see BaffleSet.
   */
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -g.y), [g.y])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const at = (e) => {
    // Null only when the ray runs parallel to the ceiling or points away from
    // it — looking along the plane edge-on. There is no sensible answer then,
    // and the caller holds the last one rather than inventing one.
    if (!e.ray?.intersectPlane(plane, hit)) return null
    return clampToCeiling(hit.x, hit.z, g)
  }
  const box = (a, b) => ({
    x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
    z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]),
  })

  // A dev handle on the last gesture, the same way store.js and lib/textiles
  // expose theirs. A marquee is three events deep and none of them leave a
  // trace; without this the only way to ask why a drag selected nothing is to
  // guess.
  const trace = (what, extra) => {
    if (!import.meta.env?.DEV || typeof window === 'undefined') return
    window.__marquee = { ...(window.__marquee ?? {}), [what]: extra, at: Date.now() }
  }

  const start = (e) => {
    // Not armed: this drag belongs to the camera, and the caller clears the
    // selection instead — which is what a click on bare ceiling did before the
    // marquee existed.
    if (!armed || spacePan || tool !== 'select') {
      trace('skipped', { armed, spacePan, tool })
      return
    }
    drag.current = {
      from: at(e),
      moved: false,
      additive: !!(e.nativeEvent?.shiftKey ?? e.shiftKey),
      // What was selected when the drag began, so an additive marquee adds to
      // it rather than replacing it.
      was: useStore.getState().selectedIds,
    }
    trace('start', { from: drag.current.from })
    if (controls) controls.enabled = false
    e.target?.setPointerCapture?.(e.pointerId)
  }

  const move = (e) => {
    const d = drag.current
    if (!d) return
    const to = at(e)
    if (!to) return
    if (!d.moved) {
      const far = Math.abs(to[0] - d.from[0]) > SLOP || Math.abs(to[1] - d.from[1]) > SLOP
      if (!far) return
      d.moved = true
    }
    // Kept on the ref as well as in state. The band the user is looking at IS
    // the selection — so what gets selected has to be the last rectangle DRAWN,
    // not one recomputed from wherever the pointer happened to be when it came
    // up. Those two disagree whenever the up event's intersection is stale, and
    // then the band promises one thing and the selection does another.
    const next = box(d.from, to)
    // A sample that lands exactly back on the press point is a stale reading,
    // not a band of zero size. Ignored rather than allowed to collapse what has
    // already been drawn — the band IS the selection, so a bad last sample
    // would otherwise throw the whole gesture away.
    if (next.x1 > next.x0 || next.z1 > next.z0) {
      d.rect = next
      trace('move', d.rect)
      setRect(d.rect)
    }
  }

  const end = (e) => {
    const d = drag.current
    drag.current = null
    setRect(null)
    if (controls) controls.enabled = true
    if (!d) return
    e?.target?.releasePointerCapture?.(e.pointerId)
    const to = at(e)
    // The rectangle that was last DRAWN, if one was. Only when no move ever
    // arrived — a coarse pointer stream can deliver a down and an up with
    // nothing between — is one built from the up point instead, and then only
    // if it travelled far enough to have been a drag at all.
    const far = !!to
      && (Math.abs(to[0] - d.from[0]) > SLOP || Math.abs(to[1] - d.from[1]) > SLOP)
    const r = d.rect ?? (far ? box(d.from, to) : null)
    // Never travelled: this was a click on bare ceiling, and a click on bare
    // ceiling clears the selection. Shift-clicking it leaves the selection
    // alone, because shift means "keep what I have".
    if (!r) {
      trace('end', { rect: null, to, from: d.from, reason: 'never travelled' })
      if (!d.additive) select(null)
      return
    }
    const hit = itemsIn(r, items, g).map((i) => i.id)
    trace('end', { rect: r, fromMoves: !!d.rect, upPoint: to, from: d.from, hit: hit.length, items: items.length })
    selectMany(d.additive ? [...d.was, ...hit] : hit)
  }

  return { rect, start, move, end }
}

/**
 * Everything whose footprint overlaps the rectangle.
 *
 * Compared in CELLS rather than metres, because the footprint is the truth
 * about what a set occupies — it is what canPlace tests, what the grid reserves
 * and what a rotated run measures to. Converting the rectangle once and
 * comparing integers is also exact, where metres would leave a set on the
 * boundary picked or not depending on floating point.
 */
export function itemsIn(rect, items, g) {
  const [i0, j0] = pointToCell(rect.x0, rect.z0, g)
  const [i1, j1] = pointToCell(rect.x1, rect.z1, g)
  const box = {
    i0: Math.min(i0, i1), j0: Math.min(j0, j1),
    ci: Math.abs(i1 - i0) + 1, cj: Math.abs(j1 - j0) + 1,
  }
  return items.filter((it) => {
    const fp = footprint(it, g)
    return fp.i0 < box.i0 + box.ci && box.i0 < fp.i0 + fp.ci
      && fp.j0 < box.j0 + box.cj && box.j0 < fp.j0 + fp.cj
  })
}

/** The band itself, drawn just under the ceiling so nothing z-fights with it. */
export default function Marquee({ g, rect }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  if (!rect) return null
  const w = Math.max(1e-4, rect.x1 - rect.x0)
  const d = Math.max(1e-4, rect.z1 - rect.z0)
  const x = (rect.x0 + rect.x1) / 2
  const z = (rect.z0 + rect.z1) / 2
  return (
    <group position={[x, g.y - 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh raycast={() => {}}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial
          color={accent} transparent opacity={0.16} depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* An outline as well as a wash: on a busy ceiling the wash alone is hard
          to find, and the edge is what tells you what you are about to catch. */}
      <lineSegments raycast={() => {}}>
        <edgesGeometry args={[new THREE.PlaneGeometry(w, d)]} />
        <lineBasicMaterial color={accent} transparent opacity={0.9} />
      </lineSegments>
    </group>
  )
}
