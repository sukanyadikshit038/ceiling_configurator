// One baffle set, alone, on a plain backdrop.
//
// The ceiling scene answers "does this layout work in the room". This answers
// "is this set right" — so everything else is gone: no room, no slab, no grid,
// no other items, and no dragging. Just the set, big enough to pick one fin
// out of.
//
// The backdrop is the ceiling scene's background colour, so a finish judged
// here is judged against what it will sit against there. The geometry comes
// from the same hook that scene uses, so the set here is the set you placed,
// not a second interpretation of the same parameters.

import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { setMaxAnisotropy } from '../lib/gpu.js'
import { useStore, useAccent } from '../lib/store.js'
import { useBaffleGroup } from './useBaffleGroup.js'
import { showOnlyFin } from '../lib/modelFins.js'
import { BoxOutline, FinHighlight } from './Outline.jsx'

/**
 * Lighting for a single object rather than a room.
 *
 * All directional, deliberately: a directional light has no position falloff,
 * so the same rig reads correctly on a 1 m set and a 5 m one. The point lights
 * the ceiling scene uses would need their intensity retuned per set size.
 * The upward-facing fill is the important one — these are ceiling products, and
 * the face you actually see is the underside.
 */
function FocusLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc9bd', 0.9]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 5]} intensity={0.45} />
      <directionalLight position={[-4, 1, -3]} intensity={0.3} color="#eaf1ff" />
      <directionalLight position={[0, -5, 2]} intensity={0.5} color="#fff4e6" />
    </>
  )
}

/**
 * Frames the set, and then leaves the camera alone.
 *
 * It deliberately does NOT refit when the set changes size: dragging the count
 * or drop slider would otherwise yank the camera on every step. The dimensions
 * are read through a ref for exactly that reason — they must not be effect
 * dependencies. "Reset view" bumps `resetKey` when the framing is wanted back.
 */
function FitCamera({ boxRef, resetKey }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  useEffect(() => {
    if (!controls) return
    const { l, w, h, target: aim } = boxRef.current
    const target = new THREE.Vector3(...aim)

    // Same reasoning as the ceiling plan view: which side is the binding
    // constraint depends on the viewport's aspect, so both are tested.
    const tanV = Math.tan(((camera.fov * Math.PI) / 180) / 2)
    const tanH = tanV * camera.aspect
    const dist = Math.max(h / 2 / tanV, Math.max(l, w) / 2 / tanH) * 1.7

    // below and to one side, looking up: how the set is seen from the floor
    const dir = new THREE.Vector3(0.52, -0.45, 0.78).normalize()
    camera.position.copy(target).addScaledVector(dir, dist)
    camera.near = Math.max(0.005, dist / 800)
    camera.far = dist * 40
    camera.updateProjectionMatrix()

    controls.target.copy(target)
    controls.minDistance = dist * 0.1
    controls.maxDistance = dist * 6
    controls.update()
  }, [controls, camera, boxRef, resetKey])

  return null
}

/**
 * Where a fin sits along its run, in the group's own coordinates.
 *
 * Derived exactly the way the two builders lay fins out, for the same reason
 * the fin marker is: a subject the camera aims at slightly off the thing it is
 * meant to be framing is worse than no framing at all.
 */
function finOffset(p, index) {
  const unitW = p.model ? (p.sizeMm?.w ?? 0) : p.thickness
  const pitch = (p.spacing + unitW) / 1000
  const span = (Math.max(1, p.count | 0) - 1) * pitch
  const ov = p.finOverrides?.[index] ?? {}
  return { z: -span / 2 + index * pitch + (ov.offsetMm ?? 0) / 1000, thickness: unitW / 1000 }
}

function Contents({ item, resetKey }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const selectedFin = useStore((s) => s.selectedFin)
  const selectFinOf = useStore((s) => s.selectFinOf)
  const focusSolo = useStore((s) => s.focusSolo)
  const background = useStore((s) => s.background)
  const scene = useThree((s) => s.scene)

  const { group, extent, depth, effectiveDrop, dropOffset } = useBaffleGroup(item.params)

  // the ceiling scene's backdrop, not one of its own: a finish judged against a
  // different background is a finish judged wrong
  useEffect(() => { scene.background = new THREE.Color(background) }, [scene, background])

  const boxH = effectiveDrop + depth
  const count = Math.max(1, item.params.count | 0)
  const finIndex = selectedFin?.id === item.id ? selectedFin.index : null
  const finSelected = finIndex != null
  // Shrinking the run can leave the selection pointing past the last fin. Show
  // the whole set rather than an empty frame.
  const solo = focusSolo && finSelected && finIndex < count

  // In solo the subject is one fin, sitting where it sits in the run — so the
  // camera aims at it rather than at the middle of a set that is not drawn.
  // The offset is in the group's coordinates, and the group is turned by the
  // set's rotation, so it turns with it: (0, z) about Y is (z sin, z cos).
  const targetY = -(effectiveDrop + depth / 2)
  const off = solo ? finOffset(item.params, finIndex) : null
  const rad = ((item.rot ?? 0) * Math.PI) / 180
  const boxRef = useRef({ l: 1, w: 1, h: 1, target: [0, -0.5, 0] })
  boxRef.current = solo
    ? {
      l: extent.length,
      w: Math.max(off.thickness, 0.02),
      h: Math.max(boxH, 0.2),
      target: [off.z * Math.sin(rad), targetY, off.z * Math.cos(rad)],
    }
    : {
      l: extent.length,
      w: extent.width,
      h: Math.max(boxH, 0.2),
      target: [0, targetY, 0],
    }

  // Solo takes every part belonging to another fin out of the scene rather than
  // building a different object: the fin you inspect is then literally the fin
  // in the run, with the finish, drop and hardware it actually has.
  useEffect(() => {
    showOnlyFin(group, solo ? finIndex : null)
  }, [group, solo, finIndex])

  useEffect(() => () => { document.body.style.cursor = '' }, [])

  const pickFin = (e) => {
    const index = e.object?.userData?.finIndex
    if (index == null) return
    e.stopPropagation()
    selectFinOf(item.id, index)
  }

  return (
    <>
      <FocusLights />
      <FitCamera boxRef={boxRef} resetKey={`${resetKey}|${solo ? finIndex : 'all'}`} />

      <group rotation={[0, ((item.rot ?? 0) * Math.PI) / 180, 0]}>
        {group ? (
          // Handlers go on a wrapping group, not on the fins: that registers
          // the group for picking while `e.object` stays the mesh actually hit,
          // which is what carries the fin index.
          <group
            position={[0, dropOffset, 0]}
            onPointerDown={pickFin}
            onPointerOver={(e) => {
              if (e.object?.userData?.finIndex == null) return
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => { document.body.style.cursor = '' }}
          >
            <primitive object={group} />
          </group>
        ) : (
          <Html center>
            <div className="font-display text-xs tracking-wide text-txt-2">Loading the model…</div>
          </Html>
        )}

        {solo ? null : finSelected ? (
          <FinHighlight item={item} extent={extent} depth={depth} index={selectedFin.index} />
        ) : (
          // nothing picked out of the run means the whole set is the subject,
          // and it is outlined as one — the same green it gets on the ceiling
          <BoxOutline
            l={extent.length} h={boxH} w={extent.width} position={[0, -boxH / 2, 0]}
            color={accent} opacity={1}
          />
        )}
      </group>

      {/* no slab to rise through any more, so the set turns freely */}
      <OrbitControls makeDefault enablePan enableDamping dampingFactor={0.08} />
    </>
  )
}

export default function FocusView({ item, resetKey }) {
  const selectFinOf = useStore((s) => s.selectFinOf)
  const focusSolo = useStore((s) => s.focusSolo)

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.01, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      /* Clicking past the set drops the fin selection — except in solo, where
         that fin IS the view: a stray click while orbiting would otherwise put
         the whole run back on screen. */
      onPointerMissed={() => { if (!focusSolo) selectFinOf(item.id, null) }}
      onCreated={(state) => {
        state.gl.outputColorSpace = THREE.SRGBColorSpace
        state.gl.toneMapping = THREE.ACESFilmicToneMapping
        state.gl.toneMappingExposure = 1.05
        // filtering quality is a property of the hardware, not a guess
        setMaxAnisotropy(state.gl.capabilities.getMaxAnisotropy())
        if (import.meta.env.DEV) window.__focusR3f = state
      }}
    >
      <Contents item={item} resetKey={resetKey} />
    </Canvas>
  )
}
