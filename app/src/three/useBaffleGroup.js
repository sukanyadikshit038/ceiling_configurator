// Turning a set's parameters into three.js geometry, in one place.
//
// Two views build the same set: the ceiling scene and the focus editor. Each
// needs its own Object3D — an Object3D has exactly one parent, so a shared one
// would be silently stolen by whichever view mounted last — but they must be
// built by the same code, or the focused set is not the set you placed.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { buildBaffleSet, disposeGroup, finishMaterial } from '../lib/baffle.js'
import { buildModelRun, modelMinDrop, runDropOffset } from '../lib/modelFins.js'
import { baffleExtent, baffleOffsets, parseWidth } from '../lib/catalog.js'
import { subscribe as subscribeModels, ensureLoaded, partsOf, getModelEntry } from '../lib/models.js'
import { subscribe as subscribeColourCore, getVersion as colourCoreVersion } from '../lib/colourCore.js'
import { subscribeTextile, textileVersion } from '../lib/textiles.js'

/**
 * The loaded parts of a manifest model, or null while it loads or if it failed.
 *
 * partsOf returns a stable reference once ready, which is what useSyncExternalStore
 * needs — a fresh object each call would loop forever.
 */
export function useModelParts(modelId) {
  const entry = modelId ? getModelEntry(modelId) : null
  const url = entry?.url ?? null
  const parts = useSyncExternalStore(
    subscribeModels,
    () => (url ? partsOf(url) : null),
    () => null
  )
  useEffect(() => { if (url) ensureLoaded(url, entry?.unitScale ?? null) }, [url, entry?.unitScale])
  return parts
}

/**
 * The geometry for one set, plus the measurements a caller needs to frame and
 * outline it.
 *
 * `group` is null only while an imported model is still loading. It hangs from
 * y = 0 — the ceiling plane — exactly as buildBaffleSet documents, so the
 * caller only has to put it somewhere.
 */
export function useBaffleGroup(params) {
  const modelParts = useModelParts(params.model)

  // A Colour Core panel finishing its download is not a parameter change, but
  // it does change what the material should sample. Reading the version here
  // rebuilds the set when one lands — the same shape as useModelParts.
  const colourCore = useSyncExternalStore(subscribeColourCore, colourCoreVersion, () => 0)
  // And the same for a Designer Textile sheet: 275 panels live on a CDN, so one
  // is fetched the first time it is worn and the set rebuilds when it lands.
  const textile = useSyncExternalStore(subscribeTextile, textileVersion, () => 0)

  // Per-axis scale that takes the authored model to its chosen size.
  const modelScale = useMemo(() => {
    const d = modelParts?.dims ?? getModelEntry(params.model)?.dims
    const sz = params.sizeMm
    if (!d || !sz) return null
    return [sz.l / 1000 / d.length, sz.h / 1000 / d.height, sz.w / 1000 / d.width]
  }, [modelParts, params.model, params.sizeMm])

  // Parametric sets own their geometry and must be disposed. A model's object
  // is owned by the registry and shared between items, so it is CLONED rather
  // than reused: an Object3D can have only one parent, so a second item would
  // otherwise silently steal the first one's — which looks exactly like
  // duplicating an imported model doing nothing at all.
  const group = useMemo(() => {
    if (!params.model) return buildBaffleSet(params)
    if (!modelParts?.object) return null

    // A file that is a run of fins is rebuilt fin by fin, so the count and
    // spacing are the user's rather than the supplier's, and each fin can be
    // configured on its own.
    if (modelParts.finset) {
      return buildModelRun(modelParts.finset, params, (family, colour, i) =>
        finishMaterial(family ?? 'pet-solid', colour, {
          repeatX: Math.max(1, (params.sizeMm?.l ?? 1000) / 500),
          repeatY: Math.max(1, (params.sizeMm?.h ?? 500) / 500),
          // so a SHEET family steps one strip per fin here too, the way a
          // parametric run does — successive cuts from the same panel
          finIndex: i,
          // Alternate mirrored, the same set-level choice a parametric run has
          // honoured all along — buildModelRun already hands the fin's index to
          // this factory, so every other fin takes the finish reversed. On a
          // fade that is the whole point of the setting: the gradient runs one
          // way, then the other.
          //
          // The MATERIAL is mirrored and not the mesh: an imported fin can have
          // a profile of its own, and Baffle Curve's is curved. Mirroring the
          // geometry would zigzag the run.
          flip: params.mirror === 'alternate' && i % 2 === 1,
          // a photographed panel is cropped to the fin at true scale
          lengthMm: params.sizeMm?.l,
          depthMm: params.sizeMm?.h,
        }))
    }

    // Not a run: the file is one object, repeated as whole copies. The scale
    // goes on each COPY, not on a wrapping group — the offsets are already
    // final metres, so scaling around them would multiply the spacing.
    const run = new THREE.Group()
    for (const dz of baffleOffsets(params)) {
      const copy = modelParts.object.clone(true)
      if (modelScale) copy.scale.set(...modelScale)
      copy.position.z = dz
      run.add(copy)
    }
    return run
  }, [params, modelParts, modelScale, colourCore, textile])

  useEffect(() => {
    // A model run shares the registry's geometry and, unless a fin has been
    // given a finish, its materials too — only the node tree is ours. Finishes
    // built for an override are cheap and shared per material cache upstream.
    if (params.model) return undefined
    return () => disposeGroup(group)
  }, [group, params.model])

  const extent = useMemo(() => baffleExtent(params), [params])
  const { a, b } = useMemo(() => parseWidth(params.width), [params.width])

  const depth = params.model
    ? (params.sizeMm?.h ?? 0) / 1000
    : Math.max(a, b) / 1000

  // The drop the renderer actually used, hardware floor included. An outline
  // drawn from the requested drop sits above what it is meant to be outlining.
  //
  // THE DEEPEST FIN, not the set's own height. A fin may hang lower than its
  // set, and a box measured from the set alone stops short of it — the outline
  // cuts through the very fin it is meant to be enclosing, and so does the
  // invisible box that catches the pointer.
  const effectiveDrop = useMemo(() => {
    const floor = params.model && modelParts?.finset
      ? modelMinDrop(modelParts.finset, params.sizeMm)
      : 0
    let deepest = Math.max(params.drop ?? 0, floor)
    const ovs = params.finOverrides ?? {}
    for (const ov of Object.values(ovs)) {
      if (ov?.drop != null) deepest = Math.max(deepest, Math.max(ov.drop, floor))
    }
    return deepest
  }, [params.drop, params.finOverrides, params.model, params.sizeMm, modelParts?.finset])

  // See runDropOffset: only whole-object model copies need the caller to lower
  // them, because only those are not already hanging at their own drop.
  const dropOffset = runDropOffset(params, modelParts?.finset)

  return { group, modelParts, modelScale, extent, depth, effectiveDrop, dropOffset }
}
