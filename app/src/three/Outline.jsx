// Selection markers, shared by the ceiling scene and the focus editor.
//
// They live here rather than in BaffleSet because the focus editor draws the
// same fin marker over the same geometry — and a marker that is derived twice
// is a marker that drifts off the thing it is pointing at.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Selection outline. EdgesGeometry rather than a wireframe box, which would
 * draw the triangle diagonals too.
 */
export function BoxOutline({ l, h, w, position = [0, 0, 0], color, opacity }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(l, h, w)), [l, h, w])
  useEffect(() => () => geo.dispose(), [geo]) // BRIEF §7: dispose on unmount
  return (
    <lineSegments geometry={geo} position={position} raycast={() => {}}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
    </lineSegments>
  )
}

/**
 * A marker on the fin currently selected inside the set.
 *
 * Its Z has to be derived exactly the way buildBaffleSet lays fins out, or the
 * marker drifts off the fin it is meant to be pointing at.
 */
export function FinHighlight({ item, extent, depth, index }) {
  const p = item.params
  // across-the-run width is the fin's thickness either way: the catalogue
  // thickness for a parametric set, the model fin's for a rebuilt run
  const unitW = p.model ? (p.sizeMm?.w ?? 0) : p.thickness
  const pitchM = (p.spacing + unitW) / 1000
  const span = (Math.max(1, p.count | 0) - 1) * pitchM
  const ov = p.finOverrides?.[index] ?? {}
  const z = -span / 2 + index * pitchM + (ov.offsetMm ?? 0) / 1000
  const drop = ov.drop ?? p.drop
  return (
    <BoxOutline
      l={extent.length * 1.02}
      h={depth * 1.08}
      w={Math.max(unitW / 1000, 0.02) * 1.6}
      position={[0, -drop - depth / 2, z]}
      color="#ffffff"
      opacity={0.9}
    />
  )
}
