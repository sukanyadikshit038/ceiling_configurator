// Clear distances from the selected set to its neighbours.
//
// Drawn only in the ceiling scene, only while something is selected, and only
// for sets within MEASURE_RANGE_M. The whole point is answering "how far apart
// are these" without leaving the layout, so anything that turns it into a
// second mode — a tool to pick, a panel to open — would defeat it.
//
// The numbers come from lib/measure.js, which knows no three.js. This file only
// puts them somewhere.

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useStore } from '../lib/store.js'
import { neighbourGaps } from '../lib/measure.js'

const LINE = '#ffd24a'
const DIAG = '#9db4c8'

/**
 * One dimension: a line between the two facing edges, a tick at each end, and
 * the figure.
 *
 * Everything is drawn with depthTest off, the same as the selection outline. A
 * dimension sits on the ceiling plane while the baffles hang below it, so from
 * the room — the angle this is actually read from — a depth-tested line would
 * be behind the very sets it measures between.
 */
function Dimension({ gap, y }) {
  const { from, to, kind, mm } = gap
  const diagonal = kind === 'diagonal'
  const colour = diagonal ? DIAG : LINE

  const geo = useMemo(() => {
    const [x1, z1] = from
    const [x2, z2] = to
    // ticks square to the run, so the ends read as terminators rather than as
    // the line carrying on
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz) || 1
    const tx = (-dz / len) * 0.06
    const tz = (dx / len) * 0.06
    const pts = [
      x1, y, z1, x2, y, z2,
      x1 - tx, y, z1 - tz, x1 + tx, y, z1 + tz,
      x2 - tx, y, z2 - tz, x2 + tx, y, z2 + tz,
    ]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [from, to, y])

  const mx = (from[0] + to[0]) / 2
  const mz = (from[1] + to[1]) / 2

  return (
    <>
      <lineSegments geometry={geo} raycast={() => {}}>
        <lineBasicMaterial color={colour} transparent opacity={diagonal ? 0.75 : 1} depthTest={false} />
      </lineSegments>
      <Html position={[mx, y, mz]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div
          className="select-none whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
          style={{
            background: 'rgba(14,17,22,0.86)',
            color: diagonal ? DIAG : LINE,
            border: `1px solid ${diagonal ? DIAG : LINE}55`,
          }}
          /* A diagonal figure is the shortest distance between two corners, not
             a dimension square to anything. Saying so stops it being read as a
             setting-out size. */
          title={diagonal ? 'corner to corner — the shortest gap, not a square dimension' : undefined}
        >
          {diagonal ? '↖ ' : ''}{mm}
        </div>
      </Html>
    </>
  )
}

export default function Dimensions({ g }) {
  const items = useStore((s) => s.items)
  const selectedId = useStore((s) => s.selectedId)
  const preview = useStore((s) => s.preview)
  const showMeasures = useStore((s) => s.showMeasures)

  const selected = items.find((i) => i.id === selectedId) ?? null
  const gaps = useMemo(
    () => (selected ? neighbourGaps(selected, items, g) : []),
    [selected, items, g]
  )

  // Preview is the client-facing view; a layout tool's measurements are not
  // part of it. The toggle is the other way in — preview still wins over it,
  // because a client-facing view with dimensions on is not a preview.
  if (preview || !showMeasures || !gaps.length) return null

  return (
    <group>
      {gaps.map((gap) => (
        <Dimension key={gap.id} gap={gap} y={g.y - 0.012} />
      ))}
    </group>
  )
}
