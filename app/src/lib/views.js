// Camera presets for the ceiling scene.
//
// Pure geometry: no React, no three.js. That is what lets the framing be
// checked headlessly, which matters because "the camera ends up somewhere
// wrong" is a fault you cannot see in a diff and can only see in a picture.

// Short labels on purpose: these are four buttons in a crowded bar, and the
// full names ("Ceiling plan", "From below") wrap to two lines the moment the
// window narrows.
export const VIEW_NAMES = { eye: 'Eye', corner: 'Corner', plan: 'Plan', bottom: 'Below' }

/**
 * Camera presets, derived from the room rather than hardcoded.
 *
 * Eye and corner sit INSIDE the room looking *along* the ceiling: standing
 * directly under a baffle fills the frame with one object and reads as nothing.
 * Plan looks straight down with the slab hidden — the reflected ceiling plan
 * architects lay out in. Below is the same plan from underneath, with the floor
 * dropped instead of the slab: the whole ceiling at once, seen the way the room
 * sees it, which is the only view where the drop reads as depth.
 */
export function viewsFor(room) {
  const c = room.ceiling
  const w = c.maxX - c.minX
  const d = c.maxZ - c.minZ
  const h = c.y
  return {
    eye: {
      pos: [w * 0.26, 1.5, d * 0.42],
      target: [-w * 0.1, h * 0.9, -d * 0.1],
    },
    corner: {
      pos: [w * 0.36, 1.1, d * 0.46],
      target: [0, h, 0],
    },
    plan: {
      // A fallback height, used only if the camera's real fov/aspect are not
      // available. `fit` is what actually frames it — see CameraRig.
      pos: [0, h + Math.max(w, d) * 0.78, d * 0.02],
      target: [0, h, 0],
      hideCeiling: true,
      fit: { w, d },
    },
    // The plan again, taken from underneath.
    //
    // Fitting the whole ceiling from inside the room is not possible — from the
    // floor of a 3.2 m room you see about 3 m of a 14 m ceiling — so the camera
    // drops below the floor exactly as plan view climbs above the slab, and
    // `hideFloor` drops the floor the way plan drops the ceiling. Walls do not
    // occlude from dead below any more than they do from dead above.
    //
    // The small z offset is the same trick plan view uses: dead-on vertical is
    // the polar singularity, where the view direction and the camera's up
    // vector are parallel and the orbit has no azimuth left to speak of.
    bottom: {
      pos: [0, h - Math.max(w, d) * 0.78, d * 0.02],
      target: [0, h, 0],
      hideFloor: true,
      fit: { w, d },
      fitBelow: true,
    },
  }
}

/**
 * How far above the ceiling the camera must sit to frame the whole of it.
 *
 * A fixed multiple of the room's larger side does not work: the viewport's
 * aspect decides which side is the binding constraint. A 14 x 10 m ceiling in a
 * near-square viewport needs 13 m of height to fit its WIDTH, where the depth
 * would have been happy at 9.6 — so a height picked from the depth crops the
 * plan, which is the one view whose whole job is showing the ceiling entire.
 */
export function planHeight(fit, camera, margin = 1.08) {
  const vFov = (camera.fov * Math.PI) / 180
  const tanV = Math.tan(vFov / 2)
  const tanH = tanV * camera.aspect
  return Math.max(fit.d / 2 / tanV, fit.w / 2 / tanH) * margin
}

/**
 * Where the camera has to sit for a preset, given the live camera.
 *
 * A preset with `fit` is framed rather than placed: its own `pos.y` is only a
 * fallback for when fov/aspect are not known yet. `fitBelow` frames the same
 * rectangle from the other side — the below view is the plan view with the
 * distance's sign flipped, and nothing else about it differs.
 */
export function cameraGoal(preset, camera) {
  const [x, y, z] = preset.pos
  if (!preset.fit) return [x, y, z]
  const distance = planHeight(preset.fit, camera)
  return [x, preset.target[1] + (preset.fitBelow ? -distance : distance), z]
}
