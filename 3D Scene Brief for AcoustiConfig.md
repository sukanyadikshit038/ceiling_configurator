# 3D Scene Brief — AcoustiConfig Configurator

Guidelines for preparing room/setup models for the AcoustiConfig ceiling configurator.
Follow these and a scene will load correctly first time — right size, right position,
camera inside the room, products mounting on the correct ceiling.

## 1. Scope of the model

- **One room / one zone per file.** The configurator treats each file as a single space.
  A large facility (gym + studios + reception) should be split into separate files.
- **Interior only.** Delete site context, neighbouring rooms, external landscaping and
  anything the camera will never see from inside.
- **No roof cavity above the ceiling.** Model the interior ceiling (soffit) the viewer
  sees; delete the structural roof, plenum and rooftop equipment above it. This keeps
  files light and stops dark voids showing through ceiling-grid gaps.
- **No ceiling acoustic products in the model.** Leave the ceiling bare — the
  configurator places our baffles/tiles/clouds on it. Existing lighting can stay if it
  hugs the soffit.
- **No cameras or lights in the export.** The configurator has its own lighting rig.

## 2. Dimensions, units, origin

- **Real-world scale, exported in metres** (millimetres acceptable — tell us which).
- **Preferred footprint: up to ~15 × 25 m** per file. Larger works, but controls and
  lighting are tuned for interior rooms.
- **Ceiling height between 2.6 m and 6 m** (typical 2.8–4 m).
- **Walkable floor exactly at elevation 0.** No kerbs/plinths under the whole model —
  the current gym file sits 0.39 m high, which we correct automatically but shouldn't
  have to.
- **Model centred on the origin in plan** (0,0 in the middle of the room).
- The ceiling the products mount on should be a **clean, flat, continuous plane** —
  free of hangers, wires and clutter at that level.

## 3. Materials & textures (the step that failed last time)

- In 3ds Max, run **Rendering → Scene Converter → convert V-Ray materials to
  Physical/Standard materials BEFORE exporting.** Raw V-Ray materials export as black
  "fallback" materials (this happened with the Workout Room file — every surface came
  through black and we had to substitute a clay finish).
- **Embed textures** (GLB embeds automatically; FBX: tick *Embed Media*).
- **Verify before sending:** open the exported file in a glTF viewer —
  https://gltf-viewer.donmccurdy.com (drag & drop) or Windows 3D Viewer. If it looks
  black/wrong there, it will look wrong in the configurator too.

## 4. Geometry budget

- **≤ ~1.5 million triangles** per scene, **≤ 100 materials.** Collapse modifiers,
  use ProOptimizer (~50%) on heavy furniture/equipment, and instance repeated objects.
- Delete unseen detail (screws, internals of equipment, double shells).
- V-Ray proxies (.vrmesh) must be converted to editable meshes before export or they
  will be missing.

## 5. Naming (helps automatic detection)

- Name the major elements: `Floor`, `Ceiling`, `Walls`, and logical groups for
  furniture/equipment. Avoid thousands of anonymous `Object001` nodes where practical.

## 6. Delivery format

- **Preferred: glTF Binary (.glb)** — single file, textures embedded
  (3ds Max 2023+: File → Export → glTF).
- Acceptable: **FBX** with Embed Media ✓, units set, triangulate ✓.
- Target **≤ 150 MB** per file.
- File naming: `<setup-name>.glb`, e.g. `workout-room.glb`, `office-open-plan.glb`.

## Quick checklist before sending

- [ ] One room, interior only, no roof cavity, no site context
- [ ] Metres, real scale, floor at 0, centred on origin
- [ ] Ceiling flat & bare (2.6–6 m), no acoustic products in it
- [ ] V-Ray → Standard materials converted, textures embedded
- [ ] Checked in a glTF viewer — colours/textures visible
- [ ] ≤ 1.5 M triangles, ≤ 100 materials, proxies collapsed
- [ ] Exported as .glb (or FBX + Embed Media), ≤ 150 MB
