import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { setMaxAnisotropy } from '../lib/gpu.js'
import Room from './Room.jsx'
import ProceduralRoom from './ProceduralRoom.jsx'
import CeilingGrid from './CeilingGrid.jsx'
import BaffleSet from './BaffleSet.jsx'
import TileSet from './TileSet.jsx'
import CloudSet from './CloudSet.jsx'
import FlySet from './FlySet.jsx'
import Dimensions from './Dimensions.jsx'
import { useStore } from '../lib/store.js'
import { gridOf } from '../lib/grid.js'
import { viewsFor, cameraGoal } from '../lib/views.js'

/**
 * Eases the camera to the requested preset, then stops steering it — and owns
 * the turntable flag.
 *
 * `autoRotate` is set here rather than passed to OrbitControls as a prop,
 * because the two write the same camera every frame and would otherwise fight.
 * Measured on the plan -> eye move: with the spin suppressed the camera lands
 * exactly on the preset in 53 frames; with it left running the camera closes to
 * ~0.2 m and then orbits at that radius indefinitely, so the arrival test never
 * fires and the rig keeps steering forever. (It happens to converge on the plan
 * preset, which sits on the polar axis where an azimuthal step barely moves
 * you — which is exactly why this cannot be left to chance.)
 *
 * Owning the flag in one place means a preset move always wins and the spin
 * picks up again the moment the camera arrives.
 */
function CameraRig({ view, room, spin }) {
  const { camera, controls } = useThree()
  const want = useRef(null)
  const views = useMemo(() => viewsFor(room), [room])

  useEffect(() => { want.current = { ...views[view] } }, [view, views])

  useFrame(() => {
    if (!controls) return
    const w = want.current
    if (!w) {
      controls.autoRotate = spin
      return
    }
    controls.autoRotate = false
    // Recomputed per frame so the framing uses the live aspect — the panel
    // widths and the window can both change while the camera is still moving.
    const goal = new THREE.Vector3(...cameraGoal(w, camera))
    camera.position.lerp(goal, 0.12)
    controls.target.lerp(new THREE.Vector3(...w.target), 0.12)
    controls.update()
    if (camera.position.distanceTo(goal) < 0.01) want.current = null
  })
  return null
}

/**
 * Ceiling products are seen from below, so the terms that matter are ambient
 * and bounce, not a key light. Two soft sources sit under the slab so baffle
 * undersides are never black.
 */
function Lights({ room }) {
  const y = room.ceiling.y
  const w = room.ceiling.maxX - room.ceiling.minX
  const d = room.ceiling.maxZ - room.ceiling.minZ
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc9bd', 0.95]} />
      <ambientLight intensity={0.32} />
      <pointLight position={[-w * 0.22, y - 0.35, -d * 0.22]} intensity={9} distance={Math.max(12, w)} decay={2} color="#fff4e6" />
      <pointLight position={[w * 0.22, y - 0.35, d * 0.22]} intensity={9} distance={Math.max(12, w)} decay={2} color="#eaf1ff" />
      <directionalLight position={[w * 0.3, y + 4, d * 0.4]} intensity={0.5} />
    </>
  )
}

function Loader() {
  return (
    <Html center>
      <div className="font-display text-xs tracking-wide text-txt-2">Loading scene…</div>
    </Html>
  )
}

/**
 * While Space is held, left-drag pans instead of orbiting.
 *
 * OrbitControls reads `mouseButtons` at pointerdown, so flipping it here is
 * enough — a drag already in flight keeps whatever it started as, which is the
 * behaviour you want. The canvas cursor changes too, otherwise the mode is
 * invisible until you try it.
 */
function SpacePan() {
  const spacePan = useStore((s) => s.spacePan)
  const controls = useThree((s) => s.controls)
  const domElement = useThree((s) => s.gl.domElement)

  useEffect(() => {
    if (!controls) return undefined
    const previous = controls.mouseButtons.LEFT
    controls.mouseButtons.LEFT = spacePan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    domElement.style.cursor = spacePan ? 'grab' : ''
    return () => {
      controls.mouseButtons.LEFT = previous
      domElement.style.cursor = ''
    }
  }, [controls, domElement, spacePan])

  return null
}

/** Paints the store's background colour onto the renderer. */
function Background() {
  const background = useStore((s) => s.background)
  const scene = useThree((st) => st.scene)
  useEffect(() => { scene.background = new THREE.Color(background) }, [scene, background])
  return null
}

function Contents({ view, spin }) {
  const room = useStore((s) => s.room())
  const items = useStore((s) => s.items)
  const showRoom = useStore((s) => s.showRoom)
  const g = useMemo(() => gridOf(room), [room])
  const preset = viewsFor(room)[view]
  const hideCeiling = !!preset?.hideCeiling
  const hideFloor = !!preset?.hideFloor

  return (
    <>
      <Background />
      <SpacePan />
      <CameraRig view={view} room={room} spin={spin} />
      <Lights room={room} />
      <Suspense fallback={<Loader />}>
        {room.kind === 'glb'
          ? <Room room={room} visible={showRoom} hideCeiling={hideCeiling} hideFloor={hideFloor} />
          : <ProceduralRoom room={room} visible={showRoom} hideCeiling={hideCeiling} hideFloor={hideFloor} />}
        <CeilingGrid g={g} />
        {items.map((it) => {
          if (it.type === 'tiles') return <TileSet key={it.id} item={it} g={g} />
          if (it.type === 'clouds') return <CloudSet key={it.id} item={it} g={g} />
          if (it.type === 'fly') return <FlySet key={it.id} item={it} g={g} />
          return <BaffleSet key={it.id} item={it} g={g} />
        })}
        {/* After the sets, so the figures sit over them rather than under. */}
        <Dimensions g={g} />
      </Suspense>
      <OrbitControls
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={0.4}
        maxDistance={40}
        target={[0, room.ceiling.y * 0.8, 0]}
        /* one revolution in ~40 s: slow enough to read the ceiling, fast
           enough that a client does not think it has stalled. The flag itself
           is driven by CameraRig, not passed as a prop. */
        autoRotateSpeed={1.5}
      />
    </>
  )
}

// Left rendering while the focus editor covers it, deliberately. Suspending
// this canvas with frameloop="never" is tempting and wrong: r3f drives every
// canvas from ONE global rAF loop that cancels itself the moment no root wants
// a frame. Pausing this root in the same commit that mounts the focus canvas
// hits exactly that window — the loop stops before the new root is active, and
// nothing restarts it, so the focus editor opens onto a black viewport.
export default function Scene({ view, spin }) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]} // BRIEF §7 pixel-ratio cap
      camera={{ fov: 55, near: 0.05, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        state.gl.outputColorSpace = THREE.SRGBColorSpace
        state.gl.toneMapping = THREE.ACESFilmicToneMapping
        state.gl.toneMappingExposure = 1.05
        // filtering quality is a property of the hardware, not a guess
        setMaxAnisotropy(state.gl.capabilities.getMaxAnisotropy())
        if (import.meta.env.DEV) window.__r3f = state
      }}
    >
      <Contents view={view} spin={spin} />
    </Canvas>
  )
}
