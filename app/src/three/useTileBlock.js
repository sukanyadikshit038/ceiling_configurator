// Turning a tile block's parameters into three.js objects, in one place.
//
// Two views build the same block: the ceiling scene and the focus editor. Each
// needs its own Object3D — an Object3D has exactly one parent, so a shared one
// would be silently stolen by whichever view mounted last — but they must be
// built by the same code, or the block you focus is not the block you placed.
//
// The tile counterpart of useBaffleGroup.js, and it exists for the same reason.

import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  loadTileModel, tileModel, tileModelId, subscribeTileModel, tileFinish, tileFinishOf,
  tileTextileTexture, tileIsFabric, loadGridSupport, gridSupport,
} from '../lib/tiles.js'
import { subscribeTextile } from '../lib/textiles.js'
import { TILE_BACK_FINISH } from '../lib/catalog.js'
import { maxAnisotropy } from '../lib/gpu.js'

/**
 * The tile block, loaded once and shared. Null while it loads or if it failed.
 *
 * Keyed on the SPEC, not the range: Wood Classic is four files now — 600x600
 * and 1200x600, each in a 15 mm and a 24 mm tee — so a hook keyed on the range
 * would hand every one of them whichever model happened to load first.
 */
export function useTileModel(params) {
  const id = tileModelId(params)
  const [model, setModel] = useState(() => tileModel(id))
  useEffect(() => {
    setModel(tileModel(id))
    const off = subscribeTileModel(() => setModel(tileModel(id)))
    if (id) loadTileModel(params)
    // The rod is one file for every range, so it is fetched alongside the first
    // block that needs it and shared by all of them. It fires the same
    // listeners when it lands, which is what re-renders a block that was drawn
    // before it arrived.
    loadGridSupport()
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return model
}

/**
 * A private copy of the block, with one material PER TILE.
 *
 * Cloned rather than shared: an Object3D has exactly one parent, so two placed
 * blocks would silently steal the model from each other. clone() shares the
 * GEOMETRY, which is the expensive part and identical between blocks.
 *
 * One material per tile rather than one for the block, because a tile can be
 * given its own finish. Twelve MeshStandardMaterials cost nothing — what would
 * cost something is twelve copies of a 1024² texture, and those are not copied:
 * the finish cache hands the same Texture to every tile wearing the same pair.
 *
 * `pickable` is what separates the two callers. On the ceiling a click belongs
 * to the block — it selects it, or drags it — and one invisible box owns that,
 * so the tiles must not intercept. In the focus editor the tile IS the thing
 * being clicked.
 */
export function useTileBlock(model, { pickable = false, cols = 1, rows = 1 } = {}) {
  // The rod, once it exists. Held in state rather than read inside the memo so
  // that a block built BEFORE it landed is rebuilt when it does — the model
  // listeners hand back the same model object, so React would bail out of the
  // memo and the corners would stay empty until something else changed.
  const [support, setSupport] = useState(() => gridSupport())
  useEffect(() => {
    if (support) return undefined
    let live = true
    loadGridSupport().then((got) => { if (live && got) setSupport(got) })
    return () => { live = false }
  }, [support])

  return useMemo(() => {
    if (!model) return null

    // A file holding ONE tile is repeated into a field; one that already holds a
    // block is drawn as it came. The count is measured, not assumed: Univic
    // Strip is 12 tiles in its file and repeating it would repeat a ceiling.
    const single = (model.count ?? 1) === 1
    const nx = single ? Math.max(1, cols | 0) : 1
    const nz = single ? Math.max(1, rows | 0) : 1

    // The MODULE, in metres — rail centre to rail centre. This is the whole
    // point of the field: laid at the module the copies share the rail on each
    // seam, which is what a real grid does and what the 100 mm placement grid
    // cannot express.
    const mx = (model.moduleMm?.x ?? model.tileMm?.x ?? 600) / 1000
    const mz = (model.moduleMm?.z ?? model.tileMm?.z ?? 600) / 1000

    const object = new THREE.Group()
    object.name = 'CeilingTileField'
    const rods = new THREE.Group()
    rods.name = 'CeilingTileFieldRods'
    const faces = []
    const materials = []

    // A tile is finished on ONE side. The loader has already grouped each
    // panel's triangles — room-facing first — so the mesh wears the finish
    // below and the board above and around the edges.
    //
    // FRONT-side now, both of them. It used to be double-sided to rescue Univic
    // Strip, whose panel is wound inside out; that mesh is flipped on load
    // instead, and the flag was also what painted the veneer over the top of
    // every box model.
    const newFaceMat = () => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0,
      side: THREE.FrontSide,
    })

    // Two board materials for the whole field — the board never varies per
    // tile, so twelve tiles are twelve face materials and two backs.
    //
    // Which one a panel USES is decided by the groups the loader made, measured
    // off the geometry. A board has a genuine top and edges facing OUTWARD, so
    // they take the front-side one; a panel with no top gets a third group over
    // the finish's own triangles, drawn from behind. Giving a box the back-side
    // material would cull its top and let you see into the tile.
    const board = (side) => new THREE.MeshStandardMaterial({
      name: side === THREE.BackSide ? 'TileBackPlane' : 'TileBack',
      color: new THREE.Color(TILE_BACK_FINISH.hex),
      roughness: TILE_BACK_FINISH.roughness,
      metalness: TILE_BACK_FINISH.metalness,
      side,
    })
    const backMat = board(THREE.FrontSide)
    const backPlaneMat = board(THREE.BackSide)

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        // Centred on the group's origin, because TileSet positions the block by
        // its footprint centre.
        const dx = (i - (nx - 1) / 2) * mx
        const dz = (j - (nz - 1) / 2) * mz
        const copy = model.object.clone()
        copy.position.set(dx, 0, dz)

        // READING ORDER across the whole field — row then column — so "tile 7"
        // is the same tile every session and a per-tile override stays put.
        const base = (j * nx + i) * (model.count ?? 1)

        const drop = []
        copy.traverse((o) => {
          if (!o.isMesh) return
          if (o.userData.tileFace) {
            const idx = base + (o.userData.tileIndex ?? 0)
            const mat = newFaceMat()
            // Group 0 is the face the room sees, group 1 the board. A box puts
            // its top and edges in group 1; a plane puts the same triangles
            // there, seen from behind.
            // Three slots, and the third is only ever grouped for a panel with
            // no top of its own: the board on the reverse of the finish.
            o.material = [mat, backMat, backPlaneMat]
            materials[idx] = mat
            faces[idx] = o
            if (!pickable) o.raycast = () => {}
            return
          }
          // Each grid line drawn ONCE. The near rails belong to the neighbour
          // that already drew them; only the field's own edge keeps them.
          const side = o.userData.railSide
          if (single && ((side === 'x-' && i > 0) || (side === 'z-' && j > 0))) {
            drop.push(o)
            return
          }
          // Rails and tile bodies are never the subject of a click, even where
          // the tiles are: picking one would select a tile the pointer is not
          // over.
          o.raycast = () => {}
        })
        for (const o of drop) o.parent?.remove(o)
        object.add(copy)

      }
    }

    // ---- the suspension --------------------------------------------------
    //
    // FOUR RODS FOR THE BLOCK, one at each corner — never four per tile. A
    // field of twenty tiles hangs from the corners of the field, not from
    // eighty rods, and this used to clone the file's rods inside the loop above
    // where a field would have done exactly that.
    //
    // Univic Strip is the exception and keeps its own: its file already
    // contains four, positioned where that ceiling puts them, and it is a
    // single block rather than a field — so there is nothing to place and
    // nothing to repeat.
    if (model.rods?.children.length) {
      const r = model.rods.clone()
      r.traverse((o) => { if (o.isMesh) o.raycast = () => {} })
      rods.add(r)
    } else if (support?.mesh) {
      // The corners of the FIELD, which is where the perimeter tees meet and
      // where a hanger actually goes. The field spans nx by nz modules about
      // the origin, so its corners are half of that out on each axis.
      const hx = (nx * mx) / 2
      const hz = (nz * mz) / 2
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        // clone() shares the GEOMETRY and the material — one 46,000-triangle
        // rod is uploaded once however many corners, blocks or ceilings wear
        // it. What each copy owns is a transform.
        const rod = support.mesh.clone()
        rod.position.set(sx * hx, 0, sz * hz)
        rods.add(rod)
      }
    }

    return {
      object,
      faces,
      materials,
      backMat,
      backPlaneMat,
      rods: rods.children.length ? rods : null,
      // What the rods measure AS MODELLED, so TileSet can scale them to the
      // drop that was actually asked for. The file's own number where the file
      // brought its own rods, the Grid Support's where it did not.
      rodHeight: model.rods?.children.length ? (model.rodHeight ?? 0) : (support?.height ?? 0),
      // How many tiles this field actually draws, so a caller never has to
      // multiply cols by rows and hope it agrees.
      count: faces.length,
    }
  }, [model, support, pickable, cols, rows])
}

/**
 * Puts each tile's finish on its own material.
 *
 * Resolved per tile through tileFinishOf, so a tile with an override wears it
 * and every other tile follows the block. The textures come from the shared
 * cache, so a block of twelve tiles in one finish uploads ONE texture, and an
 * accent tile adds a second rather than a twelfth.
 */
export function useTileFinishes(block, params, tileMm) {
  const size = params?.size ?? null
  const wood = params?.wood ?? null
  const perforation = params?.perforation ?? null
  const textile = params?.textile ?? null
  // Which KIND of face this range has. A veneer is two photographs multiplied
  // together and cached per size; a fabric is a crop of one CDN sheet. They are
  // different enough to be different branches and alike enough to share the
  // grouping, the liveness guard and the materials.
  const fabric = tileIsFabric(params)
  // A stable string, so the effect re-runs when an override changes but not on
  // every render that happens to rebuild the object.
  const overrideKey = JSON.stringify(params?.tileOverrides ?? {})
  // Bumped when a fabric sheet finishes downloading. A tile that asked for one
  // before it landed has nothing to paint yet, and without this it would keep
  // its base colour until something else happened to re-render it — the same
  // subscription the fins use, for the same reason.
  const [sheets, setSheets] = useState(0)
  useEffect(() => subscribeTextile(() => setSheets((n) => n + 1)), [])

  useEffect(() => {
    if (!block || !size) return undefined
    if (!(fabric ? textile : wood)) return undefined
    let live = true

    // One request per DISTINCT finish, not per tile: twelve tiles in one finish
    // would otherwise queue the same 2.7 MB download twelve times over.
    const wanted = new Map() // finish key -> [tile indices]
    block.materials.forEach((_, i) => {
      const f = tileFinishOf(
        { wood, perforation, textile, tileOverrides: JSON.parse(overrideKey) }, i,
      )
      const k = fabric ? `t:${f.textile}` : `${f.wood}|${f.perforation ?? ''}`
      if (!wanted.has(k)) wanted.set(k, { finish: f, indices: [] })
      wanted.get(k).indices.push(i)
    })

    for (const { finish, indices } of wanted.values()) {
      const coming = fabric
        // NOT cached here, deliberately. The crop is a clone and costs nothing;
        // the download behind it is already deduped inside lib/textiles. Caching
        // the clone would be worse than useless — retainTextiles can free the
        // sheet under it, and a cache would then hand out a crop of a texture
        // that no longer exists.
        ? tileTextileTexture(finish.textile, { tileMm })
        : tileFinish(size, finish.wood, finish.perforation, { tileMm })
      coming.then((tex) => {
        // The block may have been deselected, replaced or unmounted while the
        // panels were downloading — a wood plus a perforation is not instant,
        // and painting onto a material nobody holds any more is how a disposed
        // material gets used.
        if (!live || !tex) return
        tex.anisotropy = maxAnisotropy()
        for (const i of indices) {
          const mat = block.materials[i]
          if (!mat) continue
          mat.map = tex
          // The FINISH decides how the face takes light, not the model. 0.72 is
          // a lacquered veneer and it is what every tile used to get, fabric
          // included — which put a lacquer highlight across a cloth ceiling.
          // Set on every paint rather than at build time, so a block switched
          // from one range to the other is corrected rather than left sheeny.
          mat.roughness = fabric ? 0.95 : 0.72
          mat.needsUpdate = true
        }
      })
    }

    return () => { live = false }
  }, [block, size, wood, perforation, textile, fabric, overrideKey, sheets, tileMm?.x, tileMm?.z])

  // The textures are cached and shared between blocks, so they are NOT disposed
  // here — only the materials this block owns are.
  useEffect(() => () => block?.materials.forEach((m) => m?.dispose()), [block])
}
