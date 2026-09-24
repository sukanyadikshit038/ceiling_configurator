// One cloud, alone, on a plain backdrop.
//
// The third of these, and the simplest, because a cloud has no parts to reach
// into. There is no solo toggle, no per-part editor and nothing to click: a
// cloud is one panel, and the answer to "which bit of it" is "all of it".
//
// It is worth having anyway, and more so since the Cloud Series artwork
// arrived. The ceiling scene answers "does this layout work in the room", where
// a 1200 mm cloud at four metres is a coin; this answers "is this the right
// finish" — a watercolour wash or a sunburst is a thing you have to get close
// to before you can say.
//
// The backdrop is the ceiling scene's background colour, so a finish judged
// here is judged against what it will sit against there.

import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { setMaxAnisotropy } from '../lib/gpu.js'
import { useStore, useAccent } from '../lib/store.js'
import { BoxOutline } from './Outline.jsx'
import { useCloud, useCloudParts, useCloudFinish } from './useCloudModel.js'

/**
 * Lighting for a single object rather than a room.
 *
 * TileFocusView's rig, unchanged, and for its reason: all directional, so it
 * reads correctly on an object of any size, and the upward-facing fill matters
 * most because a cloud is seen from below and its face would otherwise be the
 * darkest thing on screen.
 */
function FocusLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc9bd', 0.9]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={0.4} />
      <directionalLight position={[-4, 1, -3]} intensity={0.3} color="#eaf1ff" />
      <directionalLight position={[0, -5, 2]} intensity={0.55} color="#fff4e6" />
    </>
  )
}

/** Frames the cloud, then leaves the camera alone until Reset view asks. */
function FitCamera({ boxRef, resetKey }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  useEffect(() => {
    if (!controls) return
    const { l, w, h, target: aim } = boxRef.current
    const target = new THREE.Vector3(...aim)
    const tanV = Math.tan(((camera.fov * Math.PI) / 180) / 2)
    const tanH = tanV * camera.aspect
    const dist = Math.max(h / 2 / tanV, Math.max(l, w) / 2 / tanH) * 1.6

    // Below and to one side, looking up — how a ceiling is actually seen. The
    // same shallow elevation a tile block gets, and for the same reason: a
    // cloud panel is nearly flat, and from directly underneath it would read as
    // an outline with no depth to it.
    const dir = new THREE.Vector3(0.35, -0.82, 0.45).normalize()
    camera.position.copy(target).addScaledVector(dir, dist)
    camera.near = Math.max(0.005, dist / 800)
    camera.far = dist * 40
    camera.updateProjectionMatrix()

    controls.target.copy(target)
    controls.minDistance = dist * 0.08
    controls.maxDistance = dist * 6
    controls.update()
  }, [controls, camera, boxRef, resetKey])

  return null
}

function Contents({ item, resetKey }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const background = useStore((s) => s.background)
  const scene = useThree((s) => s.scene)

  const model = useCloud(item.params.shape, item.params.size)
  const parts = useCloudParts(model)
  useCloudFinish(parts, item.params)

  useEffect(() => { scene.background = new THREE.Color(background) }, [scene, background])

  const extent = model?.extent ?? { x: 1.2, y: 0.04, z: 1.2 }
  const boxH = Math.max(0.02, extent.y)
  const drop = Math.max(0, item.params.drop ?? 0)

  // The whole thing INCLUDING its wire, because the drop is part of what is
  // being judged here — a cloud at 480 and one at 1200 are different objects in
  // a room, and framing only the panel would hide the difference.
  const wholeH = boxH + drop
  const boxRef = useRef({ l: 1, w: 1, h: 1, target: [0, 0, 0] })
  boxRef.current = {
    l: extent.x,
    w: extent.z,
    h: wholeH,
    // Aimed at the middle of panel-plus-wire rather than at the panel, so the
    // slab end of the wire is in shot instead of off the top.
    target: [0, -drop / 2, 0],
  }

  return (
    <>
      <FocusLights />
      <FitCamera boxRef={boxRef} resetKey={resetKey} />

      {/* The slab the cloud hangs from, so the drop reads as a height rather
          than as the object floating. A thin disc, wider than the cloud, at
          y = 0 — which is where the loader puts the top of the panel's wire. */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[Math.max(extent.x, extent.z) * 3, Math.max(extent.x, extent.z) * 3]} />
        <meshStandardMaterial color="#d8d2c6" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {parts ? (
        <group position={[0, -drop, 0]}>
          <primitive object={parts.object} />
          {/* Scaled to the drop, exactly as the ceiling scene scales it. */}
          {parts.wires && parts.wireHeight > 0 && (
            <group scale={[1, drop / parts.wireHeight, 1]}>
              <primitive object={parts.wires} />
            </group>
          )}
        </group>
      ) : (
        <Html center>
          <div className="font-display text-xs tracking-wide text-txt-2">Loading the model…</div>
        </Html>
      )}

      {/* The cloud is the subject and there is nothing to pick out of it, so it
          is always the thing outlined — the same green it gets on the ceiling. */}
      <BoxOutline
        l={extent.x} h={boxH} w={extent.z} position={[0, -drop - boxH / 2, 0]}
        color={accent} opacity={1}
      />

      <OrbitControls makeDefault enablePan enableDamping dampingFactor={0.08} />
    </>
  )
}

export default function CloudFocusView({ item, resetKey }) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.01, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        state.gl.outputColorSpace = THREE.SRGBColorSpace
        state.gl.toneMapping = THREE.ACESFilmicToneMapping
        state.gl.toneMappingExposure = 1.05
        setMaxAnisotropy(state.gl.capabilities.getMaxAnisotropy())
        if (import.meta.env.DEV) window.__cloudFocusR3f = state
      }}
    >
      <Contents item={item} resetKey={resetKey} />
    </Canvas>
  )
}
