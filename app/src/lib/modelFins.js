// Splitting an imported model into its fins and the hardware that hangs them.
//
// A supplier's file is an installation, not a single object: a run of identical
// fins, plus a clamp or two per fin and sometimes a rod above each clamp. To
// configure a fin individually — or to rebuild the run at a different count and
// spacing — those parts have to be told apart.
//
// Getting this wrong is the classic failure here, and it has already happened
// once: the largest group of meshes is NOT the fins. Baffle Curve has 13 fins
// and 26 clamps; baffle.fbx has 8 fins, 24 clamps and 24 rods. Picking by
// popularity would choose the clamps in both.
//
// Two tests do the work, and both are needed:
//
//   longest dimension is horizontal   a fin lies down, a hanger rod stands up.
//                                     Rods are just as slender as fins.
//   aspect ratio >= 10:1              a fin is long and thin. Clamps are chunky
//                                     — 6.5:1 in baffle.fbx, and the curved
//                                     clamps in Baffle Curve fail the first
//                                     test anyway.
//
// Both are ratios, so neither depends on the file's units or the scale it was
// authored at.

import * as THREE from 'three'
import { finFinish, finSizeMm, CLAMP_FINISH } from './catalog.js'

export const FIN_ASPECT = 10

// Suspension drawn between the file's own hardware and the slab. A unit
// cylinder stretched per instance, so every rod shares one geometry.
const ROD_GEO = new THREE.CylinderGeometry(1, 1, 1, 8)
const ROD_RADIUS = 0.006
const ROD_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.6 })
ROD_MAT.userData.shared = true

// One material for every clamp in the scene, from the catalogue. Shared, so
// disposing a run leaves it alone the way it leaves the rod material alone.
const CLAMP_MAT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(CLAMP_FINISH.hex),
  roughness: CLAMP_FINISH.roughness,
  metalness: CLAMP_FINISH.metalness,
})
CLAMP_MAT.userData.shared = true

const sizeOf = (mesh) => {
  mesh.geometry.computeBoundingBox()
  const b = mesh.geometry.boundingBox
  return new THREE.Vector3(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
}

const centreOf = (mesh) => {
  mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox.getCenter(new THREE.Vector3())
}

/** Is this mesh shaped like a fin: lying down, long and thin? */
export function looksLikeFin(size) {
  const horizontal = Math.max(size.x, size.z)
  const smallest = Math.min(size.x, size.y, size.z)
  if (smallest <= 0) return false
  return horizontal >= size.y && horizontal / smallest >= FIN_ASPECT
}

const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q)
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
}

const spanXZ = (pts) => {
  let minX = Infinity; let maxX = -Infinity
  let minZ = Infinity; let maxZ = -Infinity
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ }
}

/**
 * Put a hanger's top ring back into shape — in memory, never on disk.
 *
 * Flow.fbx ships with ONE vertex of ONE hanger's top ring 11.65 mm out, where
 * its fifteen neighbours sit at 2.9 mm. The two hangers are otherwise the same
 * mesh vertex for vertex, so the wire is a cone drawn from that ring down to
 * the one at the bottom, and a single displaced vertex splays one facet open
 * along the whole length of it. One row of every Baffle Curve run renders with
 * a wire that juts sideways; the other row is clean. It is a fault in the
 * delivered file, not in how we draw it — confirmed against the untouched
 * original.
 *
 * The supplier's file is left exactly as sent, and `npm run manifest` reports
 * the defect so a corrected re-export can be asked for.
 *
 * Only an unmistakable stray is moved. Two guards, because a false positive
 * here would deform a part that is simply not round: at most a quarter of the
 * ring may be out of line, and what remains once they are set aside has to be
 * round to within a third, measured about its own centre. A clamp's rectangular
 * top fails the second test by a mile — its corners sit five times further out
 * than its edge midpoints — so nothing happens to it.
 */
export function repairHangerRing(geometry) {
  // What was done to a geometry is a property OF that geometry, so it is
  // recorded there. analyseFins runs twice per load by design — once to work
  // out which way the model is turned, once again afterwards in the
  // coordinates the renderer uses — and the repair happens on the first pass.
  // Without this the second pass finds a ring that is already straight, and
  // reports a clean file. The fault would then be fixed and invisible, which
  // is the worst of both: nobody asks the supplier for a corrected export.
  if ('ringRepair' in geometry.userData) return geometry.userData.ringRepair
  const done = (report) => { geometry.userData.ringRepair = report; return report }

  geometry.computeBoundingBox()
  const b = geometry.boundingBox
  const cut = b.max.y - Math.max((b.max.y - b.min.y) * 0.01, 1e-5)
  const pos = geometry.attributes.position

  // Distinct POSITIONS, not raw vertices. This ring is 16 points stored as 90
  // vertices, duplicated unevenly between the faces that share them, so any
  // statistic taken over the raw list is weighted by how many triangles happen
  // to meet at each corner — enough to throw the centre off and make a clean
  // ring look misshapen.
  const at = new Map()
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < cut) continue
    const key = `${pos.getX(i).toFixed(7)},${pos.getZ(i).toFixed(7)}`
    if (!at.has(key)) at.set(key, { x: pos.getX(i), z: pos.getZ(i), verts: [] })
    at.get(key).verts.push(i)
  }
  const pts = [...at.values()]
  if (pts.length < 8) return done(null)

  // a first, rough centre — a median survives one bad point, a mean does not
  let cx = median(pts.map((q) => q.x))
  let cz = median(pts.map((q) => q.z))
  const radius = (q) => Math.hypot(q.x - cx, q.z - cz)
  const rough = median(pts.map(radius))
  if (!(rough > 0)) return done(null)

  const strays = pts.filter((q) => radius(q) > rough * 2)
  const rest = pts.filter((q) => radius(q) <= rough * 2)
  if (!strays.length || strays.length > pts.length * 0.25 || rest.length < 6) return done(null)

  // Now the real centre, from what is left: the midpoint of its extent, which
  // is what the centre of a ring IS. Re-centring matters — measured about the
  // first guess, a good ring still reads as 1.46 out of round, because the
  // stray drags the median with it.
  cx = (Math.min(...rest.map((q) => q.x)) + Math.max(...rest.map((q) => q.x))) / 2
  cz = (Math.min(...rest.map((q) => q.z)) + Math.max(...rest.map((q) => q.z))) / 2
  const good = rest.map(radius)
  const typical = median(good)
  const spread = Math.max(...good) / Math.min(...good)
  if (!(Math.min(...good) > 0) || spread > 1.35) return done(null)

  const was = Math.max(...strays.map(radius))
  for (const q of strays) {
    const pull = typical / radius(q)
    const x = cx + (q.x - cx) * pull
    const z = cz + (q.z - cz) * pull
    for (const i of q.verts) { pos.setX(i, x); pos.setZ(i, z) }
  }
  pos.needsUpdate = true
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return done({
    moved: strays.length,
    of: pts.length,
    verts: strays.reduce((n, q) => n + q.verts.length, 0),
    // HOW FAR OUT, as a multiple of the ring's own radius — deliberately not a
    // length. This runs on the first of the two analysis passes, before the
    // model is scaled to metres, so any distance recorded here would be in the
    // file's own units and would read as 12506.8 mm the moment someone treated
    // it as metres. A ratio cannot be misread that way, and it is the more
    // useful number anyway: the ring's actual size is already in the manifest.
    ratio: +(was / typical).toFixed(2),
  })
}

/**
 * Where a hanger has no wire modelled at all, stop pretending it has one.
 *
 * Baffle Curve's hanger is a hook and a tip and NOTHING BETWEEN THEM: above the
 * fin there are exactly two rings of geometry, the hook at 160 x 40 mm and the
 * tip at 2.4 x 3.6 mm, 136 mm apart, joined by 32 triangles that each span the
 * whole 412 mm. The file lofts the hook straight to a point. Drawn, that is a
 * spike — fat where it leaves the baffle, converging as it climbs, thin at the
 * ceiling — and because the two hooks are different depths (47 mm and 37 mm)
 * one row of the run looks noticeably chunkier than the other.
 *
 * A real hanger is a hook with a wire of ONE thickness rising out of it. So the
 * tip ring is brought down to just above the hook, which turns the loft into a
 * short transition, and the rod this renderer already draws carries the whole
 * visible length at the wire's own measured thickness. Both rows then read as
 * the same straight wire.
 *
 * Left strictly alone where a wire IS modelled. The test is whether there is
 * any geometry near the wire's axis just below the tip: baffle.fbx's hanger has
 * a ring there 28 mm across against a 22 mm tip, which is a rod with a slight
 * taper and nobody's problem. Baffle Curve has nothing within 30 mm of its own
 * axis, because the only thing down there is the hook.
 *
 * In memory only. The file on disk is never written.
 */
export function shortenHangerToHook(geometry, section) {
  if ('hangerShortened' in geometry.userData) return geometry.userData.hangerShortened
  const done = (r) => { geometry.userData.hangerShortened = r; return r }
  if (!section?.w) return done(null)

  geometry.computeBoundingBox()
  const b = geometry.boundingBox
  const pos = geometry.attributes.position
  const height = b.max.y - b.min.y
  if (!(height > 0)) return done(null)
  const cut = b.max.y - Math.max(height * 0.01, 1e-5)

  const tip = []
  let restTop = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y >= cut) tip.push(i)
    else if (y > restTop) restTop = y
  }
  if (!tip.length || !Number.isFinite(restTop)) return done(null)

  // Is a wire actually modelled? Anything near the wire's own axis, in the band
  // just below the tip, means yes — and then this must not touch it.
  const reach = Math.max(section.w, section.d) * 1.5 // three times the radius
  const band = Math.max(height * 0.02, 1e-5)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y >= cut || y < restTop - band) continue
    if (Math.hypot(pos.getX(i) - section.x, pos.getZ(i) - section.z) <= reach) return done(null)
  }

  // a transition one wire-thickness tall, so the loft is a short taper rather
  // than a zero-height sliver the renderer has to shade
  const newTop = restTop + Math.max(section.w, section.d)
  if (newTop >= b.max.y) return done(null)
  const was = b.max.y
  for (const i of tip) pos.setY(i, newTop)
  pos.needsUpdate = true
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return done({ moved: tip.length, from: +was.toFixed(5), to: +newTop.toFixed(5) })
}

/**
 * The cross-section of a hanger's SHAFT, taken at the top of the piece.
 *
 * The top is where the drawn extension takes over, so it is the section that
 * has to match. Not the bounding box: these hangers taper badly. Baffle Curve's
 * is a hooked wire modelled as one mesh, 372 mm across at the hook and 5.4 mm
 * at the top, and baffle.fbx's rod is 73 mm at its bottom flange against a
 * 22 mm shaft.
 *
 * The slice can catch more than the shaft, and did: Baffle Curve's second
 * hanger puts a SINGLE vertex of the hook at the same height as the wire, 10 mm
 * to the side. That measured the shaft as a 15 mm strap and drew a rod three
 * times too thick on the back row while the front row was right. So strays are
 * trimmed off before the section is measured; a lone corner is not a shaft.
 */
export function shaftSection(geometry) {
  geometry.computeBoundingBox()
  const b = geometry.boundingBox
  const cut = b.max.y - Math.max((b.max.y - b.min.y) * 0.01, 1e-5)
  const pos = geometry.attributes.position
  let pts = []
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) >= cut) pts.push([pos.getX(i), pos.getZ(i)])
  }
  if (!pts.length) return null

  // Drop anything far outside the crowd. Distance from the MEDIAN point, not
  // from the mean or the box: a single stray vertex moves both of those, which
  // is the whole problem. Three times the median distance is well clear of any
  // real section — a circle's vertices all sit at one distance — while the
  // stray that caused this sits at four times it.
  //
  // Single-linkage clustering was the obvious alternative and is wrong here: a
  // shaft modelled with four vertices has neighbours as far apart as the shaft
  // is wide, so any threshold that separates the stray also shatters the shaft.
  for (let pass = 0; pass < 3 && pts.length >= 4; pass++) {
    const cx = median(pts.map((q) => q[0]))
    const cz = median(pts.map((q) => q[1]))
    const away = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cz))
    const typical = median(away)
    if (!(typical > 0)) break
    const keep = pts.filter((q, i) => away[i] <= typical * 3)
    if (keep.length === pts.length || keep.length < 3) break
    pts = keep
  }

  const e = spanXZ(pts)
  if (!(e.w > 0) && !(e.d > 0)) return null
  return {
    x: +((e.minX + e.maxX) / 2).toFixed(5),
    z: +((e.minZ + e.maxZ) / 2).toFixed(5),
    w: +e.w.toFixed(5),
    d: +e.d.toFixed(5),
  }
}

/**
 * Give a fin texture coordinates when its file ships none.
 *
 * Blade Tapered arrived with no UV attribute at all. A material with a map but
 * no UVs samples the same texel for every fragment, so the fin renders in ONE
 * FLAT COLOUR taken from somewhere in the photograph — which looks like the
 * finish being ignored and a plain colour applied in its place. Every textured
 * finish was affected, not just the ombré it was noticed on.
 *
 * A fin is a slab, so a planar projection onto its length and depth is the
 * mapping any of these finishes want: u along the run, v down the face. That is
 * what the ombré crop assumes when it puts the fade along u, and what a weave
 * or a grain assumes for its repeat.
 *
 * Projecting from world x and y also means both faces come out agreeing about
 * which way the texture runs, so the mirror-image problem matchFaceUVs exists
 * for cannot arise on a fin that goes through here.
 *
 * Must run on a model already in its final orientation, for the same reason
 * matchFaceUVs must: it reads x as the length of the fin, and the loader's
 * quarter turn is what makes that true.
 */
export function planarFinUV(geometry) {
  if (geometry.attributes.uv) return null
  const pos = geometry.attributes.position
  if (!pos) return null
  geometry.computeBoundingBox()
  const b = geometry.boundingBox
  const w = b.max.x - b.min.x
  const h = b.max.y - b.min.y
  if (!(w > 0) || !(h > 0)) return null

  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / w
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / h
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return { generated: pos.count }
}

/**
 * Bring a fin's texture coordinates into the 0..1 the finishes assume.
 *
 * Blade Standard's fin is mapped for TILING: its u runs -109.4 to 109.4, which
 * says "repeat this texture 219 times along the fin". Every finish here assumes
 * the opposite convention — one span of the map across the face, with any
 * repeat set on the texture afterwards — and a photographed panel is clamped to
 * its edges, so coordinates that far out sample the edge texel. Measured, 22 of
 * its 36 vertices landed outside the panel, and the fin rendered in one flat
 * colour taken from the edge. It looks exactly like the finish being ignored.
 *
 * Rescaled per axis over the fin's own extent, so the direction of the mapping
 * survives and matchFaceUVs can still tell the two faces apart afterwards.
 *
 * A file already in the right convention is left alone — Baffle Curve's u runs
 * -0.0006 to 1.0006 and its v covers the middle 44% of the map, which is a
 * mapping someone meant, not a tiling count.
 */
export function normaliseFinUV(geometry) {
  const uv = geometry.attributes.uv
  if (!uv || uv.count === 0) return null

  let minU = Infinity; let maxU = -Infinity
  let minV = Infinity; let maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i); const v = uv.getY(i)
    minU = Math.min(minU, u); maxU = Math.max(maxU, u)
    minV = Math.min(minV, v); maxV = Math.max(maxV, v)
  }

  // a little slack, because an honest 0..1 map can round a hair past its ends
  const ok = (lo, hi) => lo >= -0.05 && hi <= 1.05
  if (ok(minU, maxU) && ok(minV, maxV)) return null

  const spanU = maxU - minU
  const spanV = maxV - minV
  if (!(spanU > 0) || !(spanV > 0)) return null

  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - minU) / spanU, (uv.getY(i) - minV) / spanV)
  }
  uv.needsUpdate = true
  return {
    was: { u: [+minU.toFixed(3), +maxU.toFixed(3)], v: [+minV.toFixed(3), +maxV.toFixed(3)] },
    repeats: +Math.max(spanU, spanV).toFixed(1),
  }
}

/**
 * Make a fin's two faces read a texture the same way round in the room.
 *
 * A fin is a slab, and a modeller lays its front and back out as mirror images
 * — which is the natural thing to do and invisible on a weave, a grain or a
 * flat colour. On a GRADIENT it is not invisible at all: Baffle Curve's fin has
 * u falling as x rises on the front and rising on the back, so one side of the
 * baffle fades left-to-right and the other right-to-left. Alternating the fins
 * then makes it worse rather than better, because each fin already disagrees
 * with itself.
 *
 * The intent is that a fin fades one way on BOTH its sides, and the next fin
 * the other way. That needs the two faces to agree first.
 *
 * Only the back is moved, and only when it disagrees: the front keeps exactly
 * the mapping the file gives it, so nothing that looks right today changes.
 * Mirroring is about the back face's own u extent rather than about 1, because
 * a fin's UVs need not fill 0..1 and mirroring about the wrong axis would slide
 * the texture off the fin instead of reversing it.
 *
 * Must run on a model that is already in its final orientation: it reads the
 * x and z axes to tell a face from an end, and those are what the loader's
 * quarter turn exchanges. Called from loadWhole after that turn, never from
 * analyseFins, which runs once before it.
 *
 * Refuses rather than guesses when a vertex is shared between the two faces —
 * moving it would drag the front along with the back. On a slab the faces have
 * opposite normals and so do not share vertices, but a smooth-shaded or welded
 * export could, and a corrupted front face is worse than a mismatched one.
 */
export function matchFaceUVs(geometry) {
  if ('uvFacesMatched' in geometry.userData) return geometry.userData.uvFacesMatched
  const done = (r) => { geometry.userData.uvFacesMatched = r; return r }

  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  if (!pos || !uv) return done(null)
  const index = geometry.index
  const count = index ? index.count : pos.count
  const at = (i) => (index ? index.getX(i) : i)

  const side = { front: { verts: new Set(), sense: 0 }, back: { verts: new Set(), sense: 0 } }
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3()
  const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const n = new THREE.Vector3()

  for (let t = 0; t + 2 < count; t += 3) {
    const i0 = at(t); const i1 = at(t + 1); const i2 = at(t + 2)
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2)
    const area = n.length()
    if (area < 1e-12) continue
    // the fin's two big faces point along z; edges and ends are not our business
    if (Math.abs(n.z) < area * 0.7) continue
    const s = side[n.z > 0 ? 'front' : 'back']
    s.verts.add(i0); s.verts.add(i1); s.verts.add(i2)
    for (const [p0, p1] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const dx = pos.getX(p1) - pos.getX(p0)
      if (Math.abs(dx) < 1e-9) continue
      s.sense += Math.sign((uv.getX(p1) - uv.getX(p0)) / dx)
    }
  }

  const fs2 = Math.sign(side.front.sense)
  const bs = Math.sign(side.back.sense)
  if (!fs2 || !bs) return done(null)          // only one face, or no lengthwise run
  if (fs2 === bs) return done({ moved: 0 })   // already agree; nothing to do

  for (const i of side.back.verts) {
    if (side.front.verts.has(i)) return done(null) // welded; leave well alone
  }

  let lo = Infinity; let hi = -Infinity
  for (const i of side.back.verts) {
    const u = uv.getX(i)
    lo = Math.min(lo, u); hi = Math.max(hi, u)
  }
  for (const i of side.back.verts) uv.setX(i, lo + hi - uv.getX(i))
  uv.needsUpdate = true
  return done({ moved: side.back.verts.size })
}

/**
 * Analyse a normalised model (flat group, metres, top at y = 0, centred).
 *
 * Returns null when nothing in the file looks like a run of fins — a single
 * sculpted object, say. The caller then treats the file as one whole thing,
 * which is what it did before any of this existed.
 */
export function analyseFins(object) {
  if (!object?.children?.length) return null

  const meshes = object.children.filter((o) => o.isMesh && o.geometry?.attributes?.position)
  if (!meshes.length) return null

  const described = meshes.map((mesh) => {
    const size = sizeOf(mesh)
    const centre = centreOf(mesh)
    return { mesh, size, centre, isFinShaped: looksLikeFin(size) }
  })

  // Group the fin-shaped meshes by shape; identical fins share a signature, so
  // the largest such group is the run. A file with two fin profiles keeps the
  // dominant one and leaves the rest as hardware, which is the safe way round:
  // an unrecognised fin still renders, it just is not individually addressable.
  const sig = (d) => [
    d.mesh.geometry.attributes.position.count,
    d.size.x.toFixed(3), d.size.y.toFixed(3), d.size.z.toFixed(3),
  ].join('|')

  const groups = new Map()
  for (const d of described) {
    if (!d.isFinShaped) continue
    const k = sig(d)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(d)
  }
  if (!groups.size) return null

  const finGroup = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  if (finGroup.length < 2) return null // one fin is not a run

  // Which way the fins run is a property of the FINS, not of the file's overall
  // bounding box: Baffle Curve is 4.84 x 4.18 m overall, so the box says
  // nothing, while its fins clearly lie along Z. Read it off a fin.
  const s0 = finGroup[0].size
  const longAxis = s0.x >= s0.z ? 'x' : 'z'
  const spreadAxis = longAxis === 'x' ? 'z' : 'x'

  const fins = [...finGroup].sort((a, b) => a.centre[spreadAxis] - b.centre[spreadAxis])
  const finSet = new Set(fins.map((f) => f.mesh))

  // Everything else is hardware, tied to the fin it sits nearest along the run
  // so it repeats with that fin rather than staying where the file put it.
  const hardware = described
    .filter((d) => !finSet.has(d.mesh))
    .map((d) => {
      let nearest = 0
      let best = Infinity
      fins.forEach((f, i) => {
        const gap = Math.abs(d.centre[spreadAxis] - f.centre[spreadAxis])
        if (gap < best) { best = gap; nearest = i }
      })
      return {
        mesh: d.mesh,
        finIndex: nearest,
        offset: d.centre[spreadAxis] - fins[nearest].centre[spreadAxis],
      }
    })

  const spread = fins.map((f) => f.centre[spreadAxis])
  const authoredPitch = fins.length > 1
    ? (spread[spread.length - 1] - spread[0]) / (fins.length - 1)
    : 0
  const thickness = fins[0].size[spreadAxis]

  // Vertical landmarks of the repeating unit, measured about the FIN's top.
  //
  // The file's own origin is the top of the whole assembly — usually the top of
  // a clamp — so hanging the unit by that origin buries the fin a clamp-height
  // deeper than the drop asked for, and leaves the selection box measuring from
  // the wrong place at both ends. Everything downstream is expressed relative to
  // the fin's top instead.
  const unitHardware = hardware.filter((h) => h.finIndex === 0)
  const finBox = fins[0].mesh.geometry.boundingBox
  const finTopY = finBox.max.y
  let hardwareTopY = finTopY // re-read below if a hanger gets cut back
  for (const h of unitHardware) {
    h.mesh.geometry.computeBoundingBox()
    hardwareTopY = Math.max(hardwareTopY, h.mesh.geometry.boundingBox.max.y)
  }

  // Which pieces are HANGERS, as against the clamps that grip the fin: the ones
  // that reach the top of the assembly. A clamp has nothing above it to
  // continue, so only a hanger gets an extension drawn up to the slab. This
  // model carries a clamp and a hanger at each of three points a few
  // millimetres apart, so extending every piece drew six rods for three
  // suspensions — one of them rising out of a clamp with no hanger in it.
  const topTol = Math.max(1e-4, (hardwareTopY - finTopY) * 0.02)
  const hangers = unitHardware.filter(
    (h) => h.mesh.geometry.boundingBox.max.y >= hardwareTopY - topTol
  )
  const anchors = hangers.length ? hangers : unitHardware

  // Tell the two kinds apart for the renderer: a HANGER carries the fin up to
  // the slab and keeps whatever colour the file gives it, a CLAMP grips the fin
  // and is drawn in the catalogue's clamp finish. Baffle Curve has no separate
  // clamp — its hook is the hanger — so it has none to recolour.
  for (const h of unitHardware) h.isHanger = hangers.includes(h)

  // Each hanger's cross-section AT ITS TOP — the exact height where the drawn
  // rod takes over, so the join is not a step.
  //
  // NOT the bounding box, which measures whichever end of the piece is widest
  // and so reads a tapered hanger as far thicker than the shaft it continues.
  // The box also used to decide WHETHER a piece was a rod, by asking if it was
  // slender, and that read Baffle Curve exactly wrong: its hanger is a hooked
  // wire modelled as one mesh, 372 mm across at the hook and 5.5 mm at the top,
  // so the box said "bracket". The file was treated as having no rod at all and
  // the extension fell back to a flat 12 mm against a wire that renders under 4.
  // A delivered file can carry a broken ring. Repaired before anything is
  // measured, so the section we match our rod to and the wire the viewer
  // actually sees are both the shape the part is meant to be.
  const ringRepairs = []
  anchors.forEach((h, i) => {
    const fixed = repairHangerRing(h.mesh.geometry)
    if (fixed) ringRepairs.push({ hanger: i, ...fixed })
  })

  // Where each shaft sits, as well as how thick it is. A hooked hanger is not
  // symmetric: Baffle Curve's wire leaves the top 11.8 mm from the centre of
  // the hook's bounding box, further than the rod is wide, so an extension
  // placed on the box centre stands beside the wire rather than on it.
  const suspensions = anchors.map((h) => {
    const c = h.mesh.geometry.boundingBox.getCenter(new THREE.Vector3())
    return shaftSection(h.mesh.geometry)
      ?? { x: +c.x.toFixed(5), z: +c.z.toFixed(5), w: 0, d: 0 }
  })

  // With the sections measured off the geometry as delivered, a hanger that
  // has no wire in it can be cut back to its hook — see shortenHangerToHook.
  // Order matters: measuring after the cut would read the section off a stub.
  const hangerCuts = []
  anchors.forEach((h, i) => {
    const cut = shortenHangerToHook(h.mesh.geometry, suspensions[i])
    if (cut) hangerCuts.push({ hanger: i, ...cut })
  })
  // and the assembly is shorter than it was, so how far it reaches is re-read
  if (hangerCuts.length) {
    hardwareTopY = finTopY
    for (const h of unitHardware) {
      h.mesh.geometry.computeBoundingBox()
      hardwareTopY = Math.max(hardwareTopY, h.mesh.geometry.boundingBox.max.y)
    }
  }

  // The narrowest of them, as the file's headline suspension size.
  const suspension = suspensions
    .filter((s) => s.w > 0)
    .sort((a, b) => Math.max(a.w, a.d) - Math.max(b.w, b.d))[0] ?? null

  return {
    count: fins.length,
    // geometry + material of one fin, and the hardware that belongs to it
    unit: {
      fin: fins[0].mesh,
      hardware: unitHardware,
      // y of the fin's top in the file's own coordinates
      finTopY,
      // how far the hardware reaches above the fin's top, before scaling
      hardwareAboveFin: Math.max(0, hardwareTopY - finTopY),
      // the file's own hanger, as a cross-section in the file's metres, taken
      // where the drawn rod meets it; null when none could be measured
      suspension: suspension ? { x: suspension.w, z: suspension.d } : null,
      // one entry per hanger: where along the fin it sits, and how thick it is
      // at the height the drawn rod takes over
      hangers: suspensions,
      // rings straightened on the way in; empty for a well-formed file
      ringRepairs,
      // hangers cut back to their hook because the file modelled no wire
      hangerCuts,
      // Filled in by loadWhole once the model is in its final orientation.
      // It CANNOT be done here: analyseFins runs a first time to work out which
      // way the model is turned, and this reads the x and z axes — the very
      // axes that turn. Run on the first pass it classifies the fin's ENDS as
      // its faces and mirrors the wrong vertices.
      uvFix: null,
      // where along the fin the hardware sits, so suspension rods line up with
      // it — derived from the same list, so the two cannot drift apart
      hardwareX: suspensions.map((s) => s.x),
    },
    fins,
    hardware,
    size: { length: fins[0].size[longAxis], depth: fins[0].size.y, thickness },
    longAxis,
    spreadAxis,
    authoredPitch: +authoredPitch.toFixed(4),
    // edge-to-edge, which is how the workbook and the app both express spacing
    authoredSpacingMm: Math.max(0, Math.round((authoredPitch - thickness) * 1000)),
    spread,
  }
}

/**
 * Where each fin sits along the run, in metres, centred on the item.
 *
 * Takes the count and pitch the user has chosen rather than the file's own, so
 * an authored run of 13 can be rebuilt as 6 or 20 at any spacing.
 */
export function finPositions(count, pitchM) {
  const n = Math.max(1, count | 0)
  const span = (n - 1) * pitchM
  return Array.from({ length: n }, (_, i) => -span / 2 + i * pitchM)
}

/**
 * The shallowest a run may hang before its own clamps push through the slab.
 *
 * The file's hardware sits above the fin, so the drop cannot be less than the
 * height of that hardware at the current scale. Both the renderer and the drop
 * slider read this, so the control cannot offer a value the scene would have to
 * override.
 */
export function modelMinDrop(finset, sizeMm) {
  if (!finset) return 0
  const above = finset.unit?.hardwareAboveFin ?? 0
  const depth = finset.size?.depth || 1
  // hardware rides the fin's own fit, so the height it reaches above the fin is
  // its authored height through the fin's vertical scale
  const sy = sizeMm ? (sizeMm.h / 1000) / depth : 1
  return +(above * sy).toFixed(4)
}

const NO_RAYCAST = () => {}

/** Which fin a part belongs to: the nearest index tagged at or above it. */
function ownerFin(object, root) {
  for (let n = object; n; n = n.parent) {
    const i = n.userData?.finIndex
    if (i != null) return i
    if (n === root) break
  }
  return null
}

/**
 * Show one fin of a built set and take the rest out of the scene entirely.
 * Pass `null` to bring them all back.
 *
 * Works on a rebuilt model run and a parametric set alike: both builders tag
 * their parts with `userData.finIndex` — the fin, and the clamps, rods and
 * wires that hang it — so the whole unit travels together.
 *
 * Hiding is not enough on its own, and this is the trap. three.js raycasts by
 * LAYER and never once looks at `visible`, so an invisible fin stays a
 * perfectly good pick target: the cursor turns to a pointer over what looks
 * like empty space, and a click selects a fin that is not on screen. So the
 * raycast is taken away with the visibility, and handed back with it.
 */
export function showOnlyFin(group, index) {
  if (!group) return
  group.traverse((o) => {
    if (!o.isMesh) return
    const owner = ownerFin(o, group)
    const shown = index == null || owner == null || owner === index
    o.visible = shown
    // remember whatever the part had — some are no-ops already (hardware is
    // never a pick target), and restoring the wrong thing would make them one
    if (o.userData.rayBackup === undefined) o.userData.rayBackup = o.raycast
    o.raycast = shown ? o.userData.rayBackup : NO_RAYCAST
  })
}

/**
 * The y a built group must be placed at by its caller.
 *
 * buildBaffleSet and buildModelRun both hang their own fins at the drop.
 * Whole-object model copies are the exception — baffleOffsets only spreads them
 * in Z — so those alone still need lowering. Dropping every model group, which
 * is what the renderer used to do, hung a rebuilt run at TWICE its drop and
 * left the selection outline floating a whole drop above the baffles.
 */
export function runDropOffset(params, finset) {
  return params?.model && !finset ? -(params.drop ?? 0) : 0
}

/**
 * Build a run of fins from an analysed model.
 *
 * The file's authored positions are not used: one fin and the hardware
 * belonging to it are taken as a repeating unit and laid out at the chosen
 * count and pitch. That is what lets an authored run of 13 become 6 or 20, and
 * it is the same shape of layout the parametric builder produces — fins along
 * X, spread along Z, hanging from y = 0.
 *
 * `overrides` is keyed by fin index: { hidden, colour, family, drop, offsetMm,
 * rotDeg }. `materialFor(family, colour, fin)` supplies a finish when one is
 * asked for; anything not overridden keeps the material the file shipped with.
 */
export function buildModelRun(finset, params, materialFor) {
  const g = new THREE.Group()
  if (!finset) return g

  const count = Math.max(1, params.count | 0)
  const size = params.sizeMm ?? {
    l: finset.size.length * 1000,
    w: finset.size.thickness * 1000,
    h: finset.size.depth * 1000,
  }
  // A fin is scaled from ITS OWN size. One fin may be longer, thicker or
  // deeper than its set — see finSizeMm — and a single scale taken from the
  // set would have merged that override and then drawn every fin the same.
  const scaleOf = (s) => [
    s.l / 1000 / finset.size.length,
    s.h / 1000 / finset.size.depth,
    s.w / 1000 / finset.size.thickness,
  ]
  const scale = scaleOf(size)
  // THE SET'S. Pitch is the rhythm of the run, so a fin with a thickness of its
  // own does not move every other fin — which is the point of editing one fin.
  const pitch = (params.spacing + size.w) / 1000
  const overrides = params.finOverrides ?? {}

  // The unit is recentred on its own fin — in Y as well as X and Z — so
  // scaling and placement act about the fin's TOP, not about wherever the file
  // happened to put its origin. Drop then means the same thing it means for a
  // catalogue set: slab to the top of the fin.
  const ref = finset.fins[0].centre
  const finTopY = finset.unit.finTopY ?? 0

  // How far the file's own hardware reaches above the fin, at this scale. The
  // suspension spans from there to the slab, so the run is never left floating.
  // How far the hardware reaches above the fin — at the HARDWARE's scale, which
  // is no longer the fin's. Left on scale[1] the extension started at a height
  // nothing was actually at, so it either floated or overlapped the clamp.
  const hardwareTopOf = (s) => (finset.unit.hardwareAboveFin ?? 0) * (s.h / 1000 / finset.size.depth)
  const rodXsOf = (s) => ((finset.unit.hardwareX ?? []).length
    ? finset.unit.hardwareX.map((x) => (x - ref.x) * (s.l / 1000 / finset.size.length))
    : [-(s.l / 1000) * 0.4, (s.l / 1000) * 0.4])

  for (const [i, z] of finPositions(count, pitch).entries()) {
    const ov = overrides[i] ?? {}
    if (ov.hidden) continue

    // Only a fin that actually carries a size of its own is measured again.
    // Everything else takes the set's `size` object unchanged, so a document
    // with no size overrides draws exactly as it did.
    const ownSize = ov.length !== undefined || ov.thickness !== undefined || ov.width !== undefined
    const fsize = ownSize ? finSizeMm(params, i) : size
    const fscale = ownSize ? scaleOf(fsize) : scale
    // The clamps sit above the fin at the FIN's vertical scale, and the rods
    // stand at its own length — both follow the fin, not the set.
    const hardwareTop = hardwareTopOf(fsize)
    const rodXs = rodXsOf(fsize)

    // never shallower than the hardware, or the clamps come through the ceiling
    const drop = Math.max(ov.drop ?? params.drop, hardwareTop)
    const fin = new THREE.Group()
    // the unit carries its index, so hiding one hides its clamps and rods too
    fin.userData.finIndex = i
    fin.position.set(0, -drop, z + (ov.offsetMm ?? 0) / 1000)
    if (ov.rotDeg) fin.rotation.y = (ov.rotDeg * Math.PI) / 180

    const scaled = new THREE.Group()
    scaled.scale.set(...fscale)
    fin.add(scaled)

    const unit = new THREE.Group()
    unit.position.set(-ref.x, -finTopY, -ref.z)
    scaled.add(unit)

    // Suspension up to the slab. The file supplies the clamp and, sometimes, a
    // short rod; the plain span from there to the ceiling is drawn here so
    // there is never a gap between the ceiling and what hangs from it.
    const rise = drop - hardwareTop
    if (rise > 0.001) {
      // The extension has to live OUTSIDE the scaled group — its length is the
      // gap up to the slab, which is nothing the model knows — so the fin's own
      // scale is applied to it by hand. Applying exactly that scale, to its
      // cross-section AND its position, is what makes it continuous with the
      // hanger below rather than a rod standing near one.
      //
      // Every earlier version got this wrong somewhere: a flat 12 mm against a
      // wire that renders at 2.4; then the right thickness through the wrong
      // scale; then aligned on the hanger's bounding box, which for a hooked
      // wire is 11.8 mm away from the wire itself.
      const susp = finset.unit.suspension
      const hangers = finset.unit.hangers ?? []
      const anyX = susp ? (susp.x / 2) * fscale[0] : ROD_RADIUS
      const anyZ = susp ? (susp.z / 2) * fscale[2] : ROD_RADIUS
      for (const [n, rx] of rodXs.entries()) {
        const h = hangers[n]
        const rod = new THREE.Mesh(ROD_GEO, ROD_MAT)
        rod.position.set(rx, hardwareTop + rise / 2, h ? (h.z - ref.z) * fscale[2] : 0)
        rod.scale.set(
          h?.w ? (h.w / 2) * fscale[0] : anyX,
          rise,
          h?.d ? (h.d / 2) * fscale[2] : anyZ,
        )
        rod.raycast = () => {}
        fin.add(rod)
      }
    }

    // A fin's own finish, or the whole run's, or the file's materials —
    // resolved as a pair by the catalogue, never mixed field by field.
    const finish = finFinish(params, i)
    // A finish that is not ready yet returns nothing, and the fin keeps the
    // material the FILE gives it rather than being painted with a guess.
    const chosen = finish && materialFor ? materialFor(finish.family, finish.colour, i) : null
    const blade = new THREE.Mesh(finset.unit.fin.geometry, chosen ?? finset.unit.fin.material)
    blade.userData.finIndex = i
    unit.add(blade)

    // The clamps and rods that belong to this fin travel with it, drawn exactly
    // as the file draws them under the fin's own fit — NOT re-scaled by us.
    // Reshaping them to a "real" size is a change to the product's own
    // suspension, which is not ours to make. The only thing we are entitled to
    // size is the extension WE add above them, and that is matched to these
    // rather than the other way round.
    for (const h of finset.unit.hardware) {
      // The clamps are one part in one finish; the files disagree about which,
      // so the catalogue decides. Hangers keep the file's own material.
      const piece = new THREE.Mesh(h.mesh.geometry, h.isHanger ? h.mesh.material : CLAMP_MAT)
      piece.raycast = () => {} // hardware is never a pick target
      unit.add(piece)
    }

    g.add(fin)
  }

  g.userData.isModelRun = true
  return g
}
