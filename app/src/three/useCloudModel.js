// Loading a cloud, giving it its own materials, and putting a finish on it.
//
// Pulled out of CloudSet so the focus view can show exactly the same cloud
// rather than a second implementation of one. The finish alone is three
// branches — a flat colour, a photographed fabric, a printed design — and each
// has been wrong at least once; having two copies of that would mean fixing
// each fault twice and finding out about the second copy later.
//
// Nothing here knows where the cloud is on a ceiling. That is the caller's.

import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  loadCloudModel, cloudModel, subscribeCloudModel, cloudFor,
  cloudIsFabric, cloudIsSeries, cloudPanelTexture, cloudExtent,
} from '../lib/clouds.js'
import { subscribeTextile } from '../lib/textiles.js'
import {
  loadCloudSeriesTexture, splitSeriesSwatch, seriesHex, subscribeCloudSeries,
} from '../lib/cloudSeries.js'
import { maxAnisotropy } from '../lib/gpu.js'
import { getSwatch } from '../lib/catalog.js'

/** The cloud for a shape and size, loaded once and shared. */
export function useCloud(shape, size) {
  const entry = shape && size ? cloudFor(shape, size) : null
  const id = entry?.id ?? null
  const [model, setModel] = useState(() => (id ? cloudModel(id) : null))
  useEffect(() => {
    setModel(id ? cloudModel(id) : null)
    const off = subscribeCloudModel(() => setModel(id ? cloudModel(id) : null))
    if (id) loadCloudModel(id)
    return off
  }, [id])
  return model
}

/**
 * A private copy, with the face and the back on materials of their own.
 *
 * Cloned because an Object3D has one parent and two placed clouds would steal
 * the model from each other — which is as true of the focus view as of the
 * ceiling, since both can be showing the same cloud at once.
 *
 * TWO materials. The panel and its cap are the two sides of one board and for a
 * colour or a cloth they agree; they part company for a printed design, because
 * printing is done to a FACE. One shared material could not express that.
 */
export function useCloudParts(model) {
  return useMemo(() => {
    if (!model) return null
    const object = model.object.clone()
    const wires = model.wires?.children.length ? model.wires.clone() : null
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.85, metalness: 0,
    })
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.85, metalness: 0,
    })
    const painted = []
    object.traverse((o) => {
      if (!o.isMesh) return
      o.raycast = () => {}
      if (!o.userData.cloudPanel) return
      o.material = o.userData.cloudRole === 'cap' ? capMat : panelMat
      painted.push(o)
    })
    wires?.traverse((o) => { if (o.isMesh) o.raycast = () => {} })
    return { object, wires, painted, panelMat, capMat, wireHeight: model.wireHeight ?? 0 }
  }, [model])
}

/**
 * Put the specified finish on a cloud's panel and cap.
 *
 * Three of them.
 *
 *   a solid colour  a hex out of an authored family. Nothing to fetch.
 *   a fabric        a photographed 1200 x 2800 sheet off the CDN, cropped to
 *                   this cloud's own plan, so it arrives late and the flat
 *                   swatch colour stands in until it does.
 *   Cloud Series    a printed design, one image for this design, shape and
 *                   colour, laid on the face whole. Also arrives late, and also
 *                   stands on its own colour meanwhile — measured off the
 *                   image, so the stand-in is the panel's real colour.
 *
 * The cap follows the panel for the first two, because they are two sides of
 * one board. For a print it does not.
 */
export function useCloudFinish(parts, params) {
  // Bumped when a sheet or an image lands. A cloud that asked for one before it
  // had downloaded has nothing to paint yet, and without these it would sit on
  // its fallback colour until something else happened to re-render it.
  const [sheets, setSheets] = useState(0)
  useEffect(() => subscribeTextile(() => setSheets((n) => n + 1)), [])
  const [prints, setPrints] = useState(0)
  useEffect(() => subscribeCloudSeries(() => setPrints((n) => n + 1)), [])

  const family = params.family ?? 'cloud-solid'
  const fabric = cloudIsFabric(params)
  const series = cloudIsSeries(params)
  const plan = cloudExtent(params)
  const shape = params.shape
  const colour = params.colour

  useEffect(() => {
    if (!parts) return undefined
    const sw = getSwatch(family, colour)

    // --- Cloud Series ----------------------------------------------------
    if (series) {
      const bits = splitSeriesSwatch(colour)
      const hex = (bits && seriesHex(bits.design, shape, bits.colour)) ?? sw?.hex ?? '#c9c9c9'
      // The back face, and the colour the front wears until its image lands.
      parts.capMat.color.set(hex)
      parts.capMat.map = null
      parts.capMat.roughness = 0.85
      parts.capMat.needsUpdate = true
      parts.panelMat.color.set(hex)
      parts.panelMat.map = null
      // A printed board is a shade flatter than a painted one, not cloth.
      parts.panelMat.roughness = 0.88
      parts.panelMat.needsUpdate = true
      if (!bits || !shape) return undefined
      let live = true
      loadCloudSeriesTexture(bits.design, shape, bits.colour).then((tex) => {
        // The cloud may have been replaced or unmounted while the image was
        // downloading; painting onto a material nobody holds is how a disposed
        // one gets used.
        if (!live || !tex || !parts.panelMat) return
        tex.anisotropy = maxAnisotropy()
        parts.panelMat.map = tex
        // White underneath, or the artwork would be multiplied by its own
        // average colour and come out twice as dark.
        parts.panelMat.color.set('#ffffff')
        parts.panelMat.needsUpdate = true
      })
      return () => { live = false }
    }

    // --- a flat colour ----------------------------------------------------
    parts.panelMat.color.set(fabric ? '#ffffff' : (sw?.hex ?? '#c9c9c9'))
    parts.capMat.color.set(sw?.hex ?? '#c9c9c9')
    parts.capMat.map = null
    parts.capMat.roughness = fabric ? 0.95 : 0.85
    parts.capMat.needsUpdate = true
    if (!fabric) {
      parts.panelMat.map = null
      // 0.85 is a painted board. Cloth is not.
      parts.panelMat.roughness = 0.85
      parts.panelMat.needsUpdate = true
      return undefined
    }

    // --- a fabric ---------------------------------------------------------
    let live = true
    // The hex first, so the cloud reads as the right colour while the sheet is
    // still coming rather than flashing white.
    parts.panelMat.color.set(sw?.hex ?? '#c9c9c9')
    parts.panelMat.roughness = 0.95
    parts.panelMat.needsUpdate = true
    cloudPanelTexture(colour, { plan }).then((tex) => {
      if (!live || !tex || !parts.panelMat) return
      tex.anisotropy = maxAnisotropy()
      parts.panelMat.map = tex
      // White underneath, or the dye would be multiplied by itself.
      parts.panelMat.color.set('#ffffff')
      parts.panelMat.needsUpdate = true
      // The back is the same cloth, and shares the crop.
      parts.capMat.map = tex
      parts.capMat.color.set('#ffffff')
      parts.capMat.needsUpdate = true
    })
    return () => { live = false }
  }, [parts, family, fabric, series, shape, colour, plan.length, plan.width, sheets, prints])

  useEffect(() => () => {
    parts?.panelMat.dispose()
    parts?.capMat.dispose()
  }, [parts])
}
