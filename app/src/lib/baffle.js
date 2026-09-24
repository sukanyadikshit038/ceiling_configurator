// Builds a baffle set from catalogue parameters.
//
// Pure three.js: no React, no store. Given the parameters the workbook defines
// — type, thickness, width, length, spacing, count, finish — this returns a
// Group of fins hung from y = 0, which is the ceiling plane. The caller
// positions it.
//
// The set is ONE item in the document but many fins on screen, so a fin can be
// selected and recoloured individually (`params.finOverrides`, keyed by index)
// while quantities still count fins, not sets.

import * as THREE from 'three'
import { MM, COLOUR_FAMILIES, parseWidth, finPitch, baffleExtent } from './catalog.js'
import {
  catalogTexture, realWood, fabricTexture, fabricMeta, WOOD_SHEET,
} from './textures.js'
import { textileSheet, loadTextileSheet, TEXTILE_SHEET, TEXTILE_FIT } from './textiles.js'
import { surfaceTexture as colourCoreSurface } from './colourCore.js'
import { ombreSurface } from './colourCoreOmbre.js'

// ---------------------------------------------------------------------------
// shared hardware materials — flagged so disposal skips them
// ---------------------------------------------------------------------------

const shared = (m) => { m.userData.shared = true; return m }

export const WIRE_MAT = shared(new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.6 }))

/**
 * What a fin wears while its finish is not ready to be shown.
 *
 * Only reached by a parametric fin, which has no material of its own to fall
 * back to — an imported one keeps the file's. Deliberately a plain neutral and
 * not an approximation of the finish being waited for: a stand-in that looks
 * like the answer is worse than one that obviously is not, because it reads as
 * the finished article and then changes under you.
 */
export const UNFINISHED_MAT = shared(new THREE.MeshStandardMaterial({
  color: 0x9a968e, roughness: 0.92, metalness: 0,
}))

// ---------------------------------------------------------------------------
// finishes
// ---------------------------------------------------------------------------

const swatchOf = (family, code) =>
  COLOUR_FAMILIES[family]?.swatches.find((s) => s.code === code) ??
  COLOUR_FAMILIES[family]?.swatches[0] ?? {}

/**
 * Every finish kind this builder knows how to draw.
 *
 * Exported so the suite can hold it against COLOUR_FAMILIES. A family whose
 * kind is missing here does not fail — it falls through the switch below to
 * `felt` and renders as procedural speckle in roughly the right colour, which
 * reads as "the texture is wrong" rather than "the texture is missing". That is
 * exactly what Colour Core did until this list existed.
 */
export const FINISH_KINDS = new Set([
  'wood', 'concrete', 'ombre', 'textile', 'felt', 'colour-core', 'colour-core-ombre',
  // Cloud Series artwork. A CLOUD family — the image is a picture of one panel
  // face and is placed by lib/cloudSeries against the panel's own projection,
  // so nothing here draws it. It is in this list anyway, and answered below,
  // because the list's whole job is that no family falls through the switch
  // into procedural speckle. Asked for on a baffle it gives a plain board in
  // the design's colour, which is honest: there is no fin-shaped artwork.
  'print',
])

/**
 * A material for a catalogue finish. Always returns a fresh material with its
 * own cloned texture, because repeat/offset are per-fin — except for Colour
 * Core, which is a shared photograph and must not be cloned.
 */
/**
 * Solid PET (and solid VMT): the colour, and nothing else.
 *
 * No map, no relief. A solid-coloured PET baffle is a plain coloured board, and
 * the range is sold as colours — Arabian Spice, Marigold, Pomegranate — not as
 * a material you are meant to read the surface of.
 *
 * There were two goes at drawing that surface before this, and both were worse
 * than the flat colour they replaced: the first was a 1%-contrast speckle
 * stretched 3.3:1 across the fin, the second a fibre mat whose octaves were
 * stretched 3:1 and came out looking like wood. Neither was the thing to fix.
 * The whole of the finish is `color`.
 *
 * Roughness 0.96 because PET felt is very matte, and that is a property of the
 * material rather than a texture on it.
 */
function feltFinMaterial(hex) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.96, metalness: 0 })
}

export function finishMaterial(
  family, colour,
  { repeatX = 1, repeatY = 1, flip = false, lengthMm, depthMm, finIndex = 0 } = {}
) {
  let tex = null
  let rough = 0.92

  // A photographed ombré panel: the same slot, cropped so the fade runs the
  // length of the fin, and mirrored for the alternating layout. Mirroring is a
  // second VIEW of the one panel — clones share their source, so the twin costs
  // a small JS object and no GPU memory (measured on three 0.183: two Texture
  // objects, one WebGLTexture).
  if (COLOUR_FAMILIES[family]?.kind === 'colour-core-ombre') {
    const got = ombreSurface(colour, { lengthMm, depthMm, mirror: flip })
    if (got) {
      const mat = new THREE.MeshStandardMaterial({ map: got.texture, roughness: 0.9, metalness: 0 })
      mat.userData.sharedMap = got.shared
      return mat
    }
    // Nothing decoded yet, and NOTHING IS PAINTED ON IN THE MEANTIME. There is
    // no thumbnail in this range, and the obvious stand-in — drawing the fade
    // from the two hexes — was worse than nothing: it looks like the finished
    // article, so the baffle appears to be done and then visibly changes when
    // the photograph lands. Null here, and the caller keeps whatever the fin
    // already had until there is something real to show.
    return null
  }

  // Colour Core fabric is a photographed panel, held once on the GPU
  // (lib/colourCore). It carries its own true-scale crop, and it takes no flip:
  // a repeating weave looks the same mirrored, so there would be nothing to
  // see for the trouble.
  if (COLOUR_FAMILIES[family]?.kind === 'colour-core') {
    const got = colourCoreSurface(colour, { lengthMm, depthMm })
    if (got) {
      const mat = new THREE.MeshStandardMaterial({ map: got.texture, roughness: 0.9, metalness: 0 })
      mat.userData.sharedMap = got.shared // the panel belongs to colourCore, not to us
      return mat
    }
    // nothing decoded yet, not even a thumbnail: the flat colour still reads
    const sw = swatchOf(family, colour)
    return new THREE.MeshStandardMaterial({ color: sw.hex ?? '#b0aca3', roughness: 0.9, metalness: 0 })
  }

  // A SHEET family — Designer Textile — is a photographed panel a fin is cut
  // out of, exactly like a veneer. Handled here as well as in buildBaffleSet so
  // that every caller gets it: a run built from an imported model goes through
  // this function and nothing else, and used to land in the generic branch
  // below.
  //
  // That branch is why this matters. It drew a PROCEDURAL twill on the shade's
  // flat hex and then stretched it by repeatX — 2400/500 by 200/500 on a normal
  // fin, which is a 12:1 squash. That is the distortion, and it showed both
  // before a panel landed and permanently on a model run.
  if (COLOUR_FAMILIES[family]?.sheet) {
    const sheet = textileSheet(colour)
    if (sheet) {
      return sheetFinMaterial(
        sheet.tex, TEXTILE_SHEET, lengthMm ?? 2400, depthMm ?? 150, finIndex, flip, 0.95,
        TEXTILE_FIT
      )
    }
    // Not here yet — so the flat shade colour, and NOT a woven stand-in. The
    // same call Colour Core makes for the same reason: a placeholder weave at
    // the wrong scale reads as a fault, where a flat colour reads as a colour.
    loadTextileSheet(colour)
    const sw = swatchOf(family, colour)
    return new THREE.MeshStandardMaterial({
      color: sw?.hex ?? '#b0aca3', roughness: 0.95, metalness: 0,
    })
  }

  // a fabric the user uploaded into their own browser
  if (typeof colour === 'string' && colour.startsWith('fabric:')) {
    const id = colour.slice(7)
    const meta = fabricMeta(id)
    const src = meta && fabricTexture(id)
    if (src) {
      tex = src.clone()
      const s = meta.scale || 0.5
      tex.repeat.set(repeatX / s, repeatY / s)
    }
    // a missing fabric (cleared site data, another machine) falls through to
    // the family's own swatch rather than rendering nothing
  }

  if (!tex) {
    const fam = COLOUR_FAMILIES[family] ?? COLOUR_FAMILIES['pet-solid']
    const sw = swatchOf(family, colour)
    // Felt leaves before the switch because it wears no texture at all, and
    // every path below ends on a `map`. The generic tail would put one there.
    if (fam.kind === 'felt') return feltFinMaterial(sw?.hex ?? '#b0aca3')
    // And a printed finish, for the same reason and one more: its artwork is a
    // picture of a CLOUD PANEL, drawn to that panel's outline. There is no
    // fin-shaped version of it, so a fin wears the design's colour flat rather
    // than a crop of a hexagon.
    if (fam.kind === 'print') {
      return new THREE.MeshStandardMaterial({
        color: sw?.hex ?? '#b0aca3', roughness: 0.88, metalness: 0,
      })
    }
    switch (fam.kind) {
      case 'wood':
        tex = catalogTexture({ kind: 'wood', base: sw.base, grain: sw.grain, code: sw.code })
        rough = 0.55
        break
      case 'concrete':
        tex = catalogTexture({ kind: 'concrete', hex: sw.hex })
        rough = 0.85
        break
      case 'ombre':
        tex = catalogTexture({ kind: 'ombre', from: sw.from, to: sw.to })
        break
      case 'textile':
        tex = catalogTexture({ kind: 'textile', hex: sw.hex })
        break
      default:
        tex = catalogTexture({ kind: 'felt', hex: sw.hex })
    }
    tex = tex.clone()
    tex.repeat.set(repeatX, repeatY)
  }

  if (flip) {
    tex.repeat.x = -Math.abs(tex.repeat.x)
    tex.offset.x = 1
  }
  tex.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0 })
}

/**
 * Real veneer, applied the way production cuts it: a fin is a vertical strip
 * taken along the sheet's grain, and each successive fin takes the next strip
 * across the sheet — so neighbouring fins vary the way a real run does.
 */
function realWoodFinMaterial(code, lengthMM, depthMM, finIndex, flip) {
  const rw = realWood(code)
  if (!rw) return null
  return sheetFinMaterial(rw.tex, WOOD_SHEET, lengthMM, depthMM, finIndex, flip, 0.6)
}

/**
 * A fin cut from a photographed SHEET — veneer or fabric, the same arithmetic.
 *
 * The sheet is stored rotated so its length runs along U, so a fin is
 * repeat.x = its length over the sheet's, and repeat.y one strip of the width.
 * Successive fins step one strip across, the way successive cuts do.
 */
function sheetFinMaterial(sheetTex, sheet, lengthMM, depthMM, finIndex, flip, roughness, fit = 'strip') {
  const tex = sheetTex.clone()
  if (fit === 'panel') {
    // The WHOLE panel on this one fin. Not to scale — a 1200 mm sheet across a
    // 200 mm fin is a 6:1 squash — but every fin then carries the entire
    // photograph rather than one cut out of it. See TEXTILE_FIT.
    tex.repeat.set(flip ? -1 : 1, 1)
    tex.offset.set(flip ? 1 : 0, 0)
    tex.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0 })
  }
  const repX = (lengthMM * MM) / sheet.h // along the length of the sheet
  const repY = Math.min(1, (depthMM * MM) / sheet.w) // strip width
  tex.repeat.set(flip ? -repX : repX, repY)
  const strips = Math.max(1, Math.floor(1 / repY))
  tex.offset.set(flip ? repX : 0, (finIndex % strips) * repY)
  tex.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0 })
}

/**
 * A Designer Textile fin.
 *
 * Null while the sheet is still coming — 275 panels on a CDN cannot all be
 * held, so one is fetched the first time it is worn and the fin falls back to
 * its flat shade colour until it lands. Rougher than a veneer, because woven
 * fabric is.
 */
function textileFinMaterial(code, lengthMM, depthMM, finIndex, flip) {
  const sheet = textileSheet(code)
  if (!sheet) { loadTextileSheet(code); return null }
  return sheetFinMaterial(
    sheet.tex, TEXTILE_SHEET, lengthMM, depthMM, finIndex, flip, 0.95, TEXTILE_FIT
  )
}

/** The finish for one fin, honouring type, family and mirroring. */
function finMaterial(p, flip) {
  if (p.btype === 'embossed') {
    const sw = swatchOf(p.family, p.colour)
    const tex = catalogTexture({ kind: 'embossc', code: 'EM-A', hex: sw.hex || '#41586e' }).clone()
    tex.repeat.set(p.length / 600, 1)
    if (flip) { tex.repeat.x = -Math.abs(tex.repeat.x); tex.offset.x = 1 }
    tex.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 })
  }
  const { a, b } = parseWidth(p.width)
  const isOmbre = COLOUR_FAMILIES[p.family]?.kind === 'ombre'
  return finishMaterial(p.family, p.colour, {
    // an ombre grades once along the whole fin, so it must not repeat
    repeatX: isOmbre ? 1 : (p.length * MM) / 0.5,
    repeatY: Math.max(1, (Math.max(a, b) * MM) / 0.5),
    flip,
    // a photographed panel is cropped to the fin at true scale, so it needs the
    // fin's real dimensions rather than a repeat count
    lengthMm: p.length,
    depthMm: Math.max(a, b),
  })
}

// ---------------------------------------------------------------------------
// fin geometry
// ---------------------------------------------------------------------------

/** Extruded profiles are built in shape space; remap their UVs to 0..1. */
function normalizeProfileUV(geo, L, maxD) {
  const uv = geo.attributes.uv
  if (!uv) return
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / L + 0.5, uv.getY(i) / maxD + 1)
  }
  uv.needsUpdate = true
}

/**
 * One fin: length along X, depth hanging down (−Y), thickness in Z.
 * Blade shapes are extruded profiles; everything else is a box.
 */
export function finGeometry(p) {
  const L = p.length * MM
  const t = p.thickness * MM
  const { a, b } = parseWidth(p.width)
  const dA = a * MM
  const dB = b * MM
  const maxD = Math.max(dA, dB)

  if (p.btype === 'blade' && p.shape === 'flow') {
    // depth undulates 75..300 mm along the run
    const lo = 0.075
    const hi = 0.3
    const shape = new THREE.Shape()
    shape.moveTo(-L / 2, 0)
    const steps = 24
    for (let i = 0; i <= steps; i++) {
      const x = -L / 2 + (i / steps) * L
      const d = lo + (hi - lo) * (0.5 + 0.5 * Math.sin((i / steps) * Math.PI * 2 - Math.PI / 2))
      shape.lineTo(x, -d)
    }
    shape.lineTo(L / 2, 0)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
    normalizeProfileUV(geo, L, hi)
    geo.translate(0, 0, -t / 2)
    return { geo, maxDepth: hi }
  }

  if (p.btype === 'blade' && p.shape === 'tapered') {
    const shape = new THREE.Shape()
    shape.moveTo(-L / 2, 0)
    shape.lineTo(-L / 2, -dA)
    shape.lineTo(L / 2, -dB)
    shape.lineTo(L / 2, 0)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
    normalizeProfileUV(geo, L, maxD)
    geo.translate(0, 0, -t / 2)
    return { geo, maxDepth: maxD }
  }

  const geo = new THREE.BoxGeometry(L, dA, t)
  geo.translate(0, -dA / 2, 0)
  return { geo, maxDepth: dA }
}

// ---------------------------------------------------------------------------
// the set
// ---------------------------------------------------------------------------

/**
 * Build a baffle set hanging from y = 0.
 *
 * Fins run along X and are spread along Z; the group's origin is the top of the
 * suspension, so the caller only has to place it on the ceiling plane. Each fin
 * mesh carries `userData.finIndex` so a single fin can be picked.
 */
export function buildBaffleSet(p) {
  const g = new THREE.Group()
  const t = p.thickness * MM
  const pitch = finPitch(p)
  const count = Math.max(1, p.count | 0)
  const span = (count - 1) * pitch
  const L = p.length * MM

  const matA = finMaterial(p, false)
  const matB = p.mirror === 'alternate' ? finMaterial(p, true) : matA
  const wireGeo = new THREE.CylinderGeometry(0.005, 0.005, Math.max(0.01, p.drop), 6)

  // profile shapes mirror at the MESH so the renderer flips winding for us;
  // baking scale(-1) into the geometry would render fins inside-out
  const geoMirrors = p.btype === 'blade' && (p.shape === 'tapered' || p.shape === 'flow')
  const overrides = p.finOverrides ?? {}
  const ovMats = new Map()
  let sharedGeo = null

  for (let i = 0; i < count; i++) {
    const z = -span / 2 + i * pitch
    const ov = overrides[i]
    // A HALF TURN ON ONE FIN, composed with whatever the run's Pattern already
    // does to it.
    //
    // XOR rather than override, because "turn this fin round" means reverse it
    // from where it is: flipping a fin that Alternate has already mirrored puts
    // it back in line with its neighbours, which is what somebody looking at it
    // is asking for.
    //
    // It goes through the SAME mirror machinery the Pattern uses — scale.x for
    // a profile that varies along the fin, the material's flip for a finish
    // that runs one way — so a turned fin looks exactly like an alternated one
    // rather than nearly like it. A half turn about Y is that mirror for a fin
    // symmetric across its own thickness, which every one of these is.
    //
    // `rotDeg` is the field the model builder already reads; one idea, one
    // name. Only a half turn is offered, so anything else is ignored here
    // rather than half-applied.
    const turned = Math.abs((ov?.rotDeg ?? 0) % 360) === 180
    const mirrored = (p.mirror === 'alternate' && i % 2 === 1) !== turned
    const finP = ov ? { ...p, ...ov } : p
    const drop = finP.drop ?? p.drop

    // A fin with dimensions of its own needs geometry of its own; the rest
    // share one.
    //
    // THICKNESS AND LENGTH JOIN WIDTH HERE. finGeometry reads all three, and
    // finP above already merges the override in — but only a width override
    // used to reach this branch, so a fin given its own thickness or length was
    // merged, measured, and then handed the SET's geometry. The override looked
    // ignored because the only thing that still read it was the maths.
    const ownGeo = !!ov && (ov.width !== undefined
      || ov.thickness !== undefined || ov.length !== undefined)
    let geo
    if (ownGeo) {
      geo = finGeometry(finP).geo
    } else {
      if (!sharedGeo) sharedGeo = finGeometry(p).geo
      geo = sharedGeo
    }

    const family = ov?.family ?? p.family
    const colour = ov?.colour ?? p.colour
    const { a: wa, b: wb } = parseWidth(finP.width)
    const flip = mirrored && !geoMirrors

    let mat
    if (p.btype !== 'embossed' && COLOUR_FAMILIES[family]?.kind === 'wood' && realWood(colour)) {
      mat = realWoodFinMaterial(colour, finP.length, Math.max(wa, wb), i, flip)
    } else if (p.btype !== 'embossed' && COLOUR_FAMILIES[family]?.sheet) {
      // A textile is a sheet too. Null until the panel arrives, and the branches
      // below then give it the shade's flat colour to wear meanwhile.
      mat = textileFinMaterial(colour, finP.length, Math.max(wa, wb), i, flip)
    }
    if (!mat) {
      // Only where a sheet did not supply one. Written as a guard rather than
      // an `else if` chain because a textile whose panel has not arrived yet
      // falls through to here for its flat shade colour, and an `else` would
      // have overwritten a sheet material that HAD arrived.
      if (ov && (ov.colour || ov.family)) {
        const key = `${family}|${colour}|${flip}`
        if (!ovMats.has(key)) ovMats.set(key, finMaterial(finP, flip))
        mat = ovMats.get(key)
      } else {
        mat = flip ? matB : matA
      }
    }

    const fin = new THREE.Mesh(geo, mat ?? matA ?? UNFINISHED_MAT)
    if (mirrored && geoMirrors) fin.scale.x = -1
    fin.position.set(0, -drop, z)
    fin.userData.finIndex = i
    fin.castShadow = true
    fin.receiveShadow = true
    g.add(fin)

    // suspension wires
    const finWireGeo = drop === p.drop ? wireGeo : new THREE.CylinderGeometry(0.005, 0.005, Math.max(0.01, drop), 6)
    for (const sx of [-L * 0.4, L * 0.4]) {
      const wire = new THREE.Mesh(finWireGeo, WIRE_MAT)
      wire.position.set(sx, -drop / 2, z)
      wire.raycast = () => {} // hardware is not a pick target
      // tagged with its fin so a view showing one fin can hide the rest of the
      // run wholesale, suspension included
      wire.userData.finIndex = i
      g.add(wire)
    }
  }

  g.userData.extent = baffleExtent(p)
  return g
}

/** Free everything a built set owns, skipping shared hardware materials. */
export function disposeGroup(g) {
  g.traverse((o) => {
    if (!o.isMesh) return
    if (!o.geometry.userData.shared) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m || m.userData.shared) continue
      // `sharedMap` means the material is ours to free but its texture is not.
      // Colour Core panels are owned by lib/colourCore, which holds exactly one
      // and hands the same instance to every fin wearing that finish. Freeing
      // it here pulled it out from under the group being built to replace this
      // one — three.js then re-uploaded it, which is what the flicker was.
      if (!m.userData.sharedMap) m.map?.dispose()
      m.dispose()
    }
  })
}
