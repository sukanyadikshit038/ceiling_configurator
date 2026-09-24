// One tile block, alone, on a plain backdrop.
//
// The tile counterpart of FocusView. The ceiling scene answers "does this
// layout work in the room"; this answers "is this ceiling right" — so the room,
// the slab, the grid and every other item are gone, and the block is big enough
// to pick one tile out of.
//
// The backdrop is the ceiling scene's background colour, so a finish judged
// here is judged against what it will sit against there.

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { setMaxAnisotropy } from '../lib/gpu.js'
import { useStore, useAccent } from '../lib/store.js'
import { BoxOutline } from './Outline.jsx'
import { useTileModel, useTileBlock, useTileFinishes } from './useTileBlock.js'

/**
 * Lighting for a single object rather than a room.
 *
 * All directional, for the same reason FocusView's is: a directional light has
 * no distance falloff, so one rig reads correctly on a block of any size. The
 * upward-facing fill is the important one — a ceiling tile is seen from below
 * and its face would otherwise be the darkest thing on screen.
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

/** Frames the block, then leaves the camera alone until Reset view asks. */
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

    // Below and to one side, looking up — how a ceiling is actually seen. A
    // block is nearly flat, so the elevation is shallower than a baffle set's:
    // from far underneath it would read as a rectangle with no depth at all.
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

/** A ring around the tile being worked on, drawn just below its face. */
function TileHighlight({ block, index }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const geo = useMemo(() => {
    const face = block?.faces?.[index]
    if (!face) return null
    face.geometry.computeBoundingBox()
    const b = face.geometry.boundingBox
    const s = b.getSize(new THREE.Vector3())
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(s.x, Math.max(s.y, 0.004), s.z))
    const c = b.getCenter(new THREE.Vector3())
    g.translate(c.x, c.y - 0.002, c.z)
    return g
  }, [block, index])

  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <lineSegments geometry={geo} raycast={() => {}}>
      <lineBasicMaterial color={accent} transparent opacity={1} depthTest={false} />
    </lineSegments>
  )
}

function Contents({ item, resetKey }) {
  // The selection colour follows the theme; see lib/theme.js.
  const accent = useAccent()
  const selectedFin = useStore((s) => s.selectedFin)
  const selectFinOf = useStore((s) => s.selectFinOf)
  const focusSolo = useStore((s) => s.focusSolo)
  const background = useStore((s) => s.background)
  const scene = useThree((s) => s.scene)

  const model = useTileModel(item.params)
  const block = useTileBlock(model, {
    pickable: true, cols: item.params.cols ?? 1, rows: item.params.rows ?? 1,
  })
  useTileFinishes(block, item.params, model?.tileMm)

  useEffect(() => { scene.background = new THREE.Color(background) }, [scene, background])

  const size = model?.size ?? { x: 5.1, y: 0.05, z: 3.9 }
  const boxH = Math.max(0.02, size.y)
  // The rods are part of the product, so they are shown here too — scaled to the
  // block's own drop, exactly as the ceiling scene scales them. Hidden in solo:
  // the subject there is one tile, and a rod belonging to the block would rise
  // out of a frame that no longer contains the block.
  const rodSpan = Math.max(0, (item.params.drop ?? 0) - (model?.faceOffset ?? 0))
  const count = block?.faces?.length ?? 0
  const tileIndex = selectedFin?.id === item.id ? selectedFin.index : null
  // Re-exporting the model with fewer tiles can leave a selection pointing past
  // the last one. Show the whole block rather than an empty frame.
  const picked = tileIndex != null && tileIndex < count
  const solo = focusSolo && picked

  // In solo the subject is one tile, sitting where it sits in the block, so the
  // camera aims at it rather than at the middle of a block that is not drawn.
  const boxRef = useRef({ l: 1, w: 1, h: 1, target: [0, 0, 0] })
  const faceBox = useMemo(() => {
    const face = block?.faces?.[picked ? tileIndex : -1]
    if (!face) return null
    face.geometry.computeBoundingBox()
    return face.geometry.boundingBox.clone()
  }, [block, picked, tileIndex])

  boxRef.current = solo && faceBox
    ? {
      l: faceBox.max.x - faceBox.min.x,
      w: faceBox.max.z - faceBox.min.z,
      h: Math.max(boxH, 0.08),
      target: faceBox.getCenter(new THREE.Vector3()).toArray(),
    }
    : {
      l: size.x,
      w: size.z,
      // The rods stand above the block, so the frame has to allow for them or
      // raising the drop walks them out of shot.
      h: Math.max(boxH + rodSpan, 0.08),
      target: [0, (rodSpan - boxH) / 2, 0],
    }

  // Solo hides every OTHER tile and the grid rather than building a different
  // object, so the tile you inspect is literally the tile in the block, with the
  // finish it actually has.
  useEffect(() => {
    if (!block) return
    block.object.traverse((o) => {
      if (!o.isMesh) return
      o.visible = !solo || o.userData.tileIndex === tileIndex
    })
  }, [block, solo, tileIndex])

  useEffect(() => () => { document.body.style.cursor = '' }, [])

  const pickTile = (e) => {
    const index = e.object?.userData?.tileIndex
    if (index == null) return
    e.stopPropagation()
    selectFinOf(item.id, index)
  }

  return (
    <>
      <FocusLights />
      <FitCamera boxRef={boxRef} resetKey={`${resetKey}|${solo ? tileIndex : 'all'}`} />

      <group rotation={[0, ((item.rot ?? 0) * Math.PI) / 180, 0]}>
        {block?.rods && block.rodHeight > 0 && !solo && rodSpan > 0 && (
          <group scale={[1, rodSpan / block.rodHeight, 1]}>
            <primitive object={block.rods} />
          </group>
        )}

        {block ? (
          // Handlers on a wrapping group, not on the tiles: that registers the
          // group for picking while `e.object` stays the mesh actually hit,
          // which is what carries the tile index.
          <group
            onPointerDown={pickTile}
            onPointerOver={(e) => {
              if (e.object?.userData?.tileIndex == null) return
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => { document.body.style.cursor = '' }}
          >
            <primitive object={block.object} />
          </group>
        ) : (
          <Html center>
            <div className="font-display text-xs tracking-wide text-txt-2">Loading the model…</div>
          </Html>
        )}

        {solo ? null : picked ? (
          <TileHighlight block={block} index={tileIndex} />
        ) : (
          // Nothing picked out of the block means the block is the subject, and
          // it is outlined as one — the same green it gets on the ceiling.
          <BoxOutline
            l={size.x} h={boxH} w={size.z} position={[0, -boxH / 2, 0]}
            color={accent} opacity={1}
          />
        )}
      </group>

      <OrbitControls makeDefault enablePan enableDamping dampingFactor={0.08} />
    </>
  )
}

export default function TileFocusView({ item, resetKey }) {
  const selectFinOf = useStore((s) => s.selectFinOf)
  const focusSolo = useStore((s) => s.focusSolo)

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.01, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      /* Clicking past the block drops the tile selection — except in solo, where
         that tile IS the view: a stray click while orbiting would otherwise put
         the whole block back on screen. */
      onPointerMissed={() => { if (!focusSolo) selectFinOf(item.id, null) }}
      onCreated={(state) => {
        state.gl.outputColorSpace = THREE.SRGBColorSpace
        state.gl.toneMapping = THREE.ACESFilmicToneMapping
        state.gl.toneMappingExposure = 1.05
        setMaxAnisotropy(state.gl.capabilities.getMaxAnisotropy())
        if (import.meta.env.DEV) window.__tileFocusR3f = state
      }}
    >
      <Contents item={item} resetKey={resetKey} />
    </Canvas>
  )
}
