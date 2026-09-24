# UniVicoustic Ceiling Configurator

Lay acoustic ceiling products out on a snapped ceiling grid inside a real room,
then export the layout as structured JSON that quantities come from.

On Windows, double-click **`Start Ceiling Configurator.bat`** in the repository
root. It installs dependencies on first run, starts the dev server and opens the
browser once the server actually answers. Or, from a terminal:

```bash
npm install
npm run dev       # http://localhost:5190/ceiling/
npm run verify    # 2093 headless assertions over the domain layer
npm run manifest  # regenerate public/models/manifest.json by hand
npm run build
```

The dev server runs under `/ceiling/` on purpose: it mirrors production
(BRIEF §4), so a base-path mistake shows up now rather than as a blank white
page after the first CloudFront deploy.

## Assets are not in this repository

A fresh clone will start but render nothing: **the supplied product assets are
deliberately not committed.** They are UniVicoustic's property rather than
code, they come to about 1.1 GB, and git would carry every byte of them
forever — a 91 MB FBX cannot be taken back out of a history once it is pushed.

Copy them in alongside the checkout, in this layout:

```
Cloud Series/                        the printed designs, CL-01/03/04/05
app/public/models/Cloud/             cloud panels, by shape and size
app/public/models/Fly/               Fly 4 and Fly 8
app/public/models/baffles/           Blade
app/public/models/ceiling_tiles/     tile ranges
app/public/textures/baffles/         PET, Colour Core, ombré
app/public/textures/ceiling-tiles/
app/public/textures/clouds/
app/public/textures/fly/
```

Then `npm run manifest` to rebuild `public/models/manifest.json` from what is
actually there — it is generated, never committed, so it always describes the
files in front of it rather than the ones someone else had.

What IS committed is everything that is code: the source, the 2093-assertion
verification suite, the build scripts that derive artwork and manifests from
the supplied files, and the colour maps.

**The suite needs the assets too.** `npm run verify` reads the cloud panels'
measured geometry out of the manifest and stops with a TypeError without it, so
run `npm run manifest` once the files are in place. Measured, not assumed — a
run with the manifest moved aside does not reach its tally line.

## Layout

```
src/lib/       domain — no React, no three.js in the document path
  grid.js        integer cell maths: footprints, snapping, overlap, clamping
  presets.js     one-click layouts, as pure functions of the grid
  modelFins.js   splits an imported file into fins + hardware, rebuilds the run
  catalog.js     config-data.xlsx: types, sizes, colours, schedule expansion
  scenarios.js   declarative data for the procedural rooms (imports nothing)
  rooms.js       room list: procedural + manifest GLBs, one shape for both
  store.js       the document, its actions, and the schedule
  baffle.js      builds a baffle set from catalogue parameters (three.js)
  furniture.js   procedural furniture geometry (three.js)
  shell.js       floor / walls / ceiling for a procedural room (three.js)
  textures.js    canvas finishes, veneer photos, user fabrics (three.js)
  models.js      GLB/FBX loading registry (three.js)
  fabrics.js     user fabric storage, IndexedDB

src/three/     R3F components — read the store, never own state
  Scene.jsx  Room.jsx  ProceduralRoom.jsx  CeilingGrid.jsx  BaffleSet.jsx

src/ui/        panels
  TopBar.jsx  LeftPanel.jsx  RightPanel.jsx  BaffleFields.jsx
  FabricManager.jsx  bits.jsx

scripts/       build-manifest.mjs · verify.mjs
public/models/ rooms/*.glb · baffles/*.fbx · manifest.json (generated)
```

Four rules hold this together. They are the point of the structure, not
decoration:

1. **`lib/grid.js`, `lib/catalog.js`, `lib/scenarios.js`, `lib/rooms.js` and
   `lib/store.js` import no three.js and no React.** That is what makes
   `npm run verify` possible — the rules behind placement, quantities and
   serialisation are tested in Node, with no browser and no mocks. 453
   assertions.
2. **One document drives everything.** The 3D view and the schedule read the
   same `items` array, so they cannot disagree (BRIEF §6).
3. **Raycasts hit exactly one plane.** The room mesh and every piece of
   furniture is `raycast = () => {}`. Snapping stays predictable no matter what
   is under the cursor.
4. **Assets are data.** Nothing about a model is hardcoded — sizes, mesh counts
   and each room's ceiling plane are measured off the file.

## Adding a room or a model

Drop a `.glb`, `.gltf` or `.fbx` into `public/models/rooms/` or
`public/models/baffles/` and it appears in the configurator. No code change, no
restart.

`scripts/build-manifest.mjs` scans both folders and writes `manifest.json`. It
runs when the dev server starts, whenever a file in either folder changes, and
before every build — so the folders are the single source of truth (BRIEF §7).

For a **room** it finds the ceiling plane: the topmost large flat horizontal
surface, sized relative to the model's own footprint so it works for a 6 m
meeting room and a 25 m hall alike. If no such quad exists it falls back to the
model's top face and flags `detected: false`, which the app surfaces as a
warning rather than pretending the number was measured.

It also corrects two export faults that a browser cannot diagnose, **and
reports both** — because the real fix is a corrected re-export:

- **Units.** Over 200 units across is read as millimetres (×0.001); under half a
  metre as a stray 0.001 in the export (×1000).
- **Position.** A room need not be modelled at the origin, but the grid, the
  camera presets and every saved cell coordinate are. The offset that centres
  the ceiling is recorded and replayed on the mesh.

`npm run verify` asserts these hold for *every* room in the folder: a believable
ceiling size and height, centred on the origin, and a usable grid.

### Using a baffle model

A file in `public/models/baffles/` appears in the **Geometry** dropdown, at the
top of *Defaults for new sets* (left panel) and of *Selection* (right panel).
Pick it there instead of "Catalogue baffle (parametric)".

A model is placed as the file authored it — every mesh, its own materials —
sized per axis in metres rather than by catalogue options, because it has no
catalogue length or fin count.

**Count and spacing are capped at what the ceiling can hold.** `update()`
refuses a run that will not fit, and refuses it silently — so an uncapped slider
just snaps back and reads as broken. `runLimits()` computes the largest count
and spacing that actually fit and the sliders stop there, with a note saying so.
Spacing is measured against the count that fits rather than the count currently
set: four copies of a 1.5 m model do not fit a boardroom at any spacing at all,
so "how far apart may these four go" has no answer and reporting 0 mm would
point at the wrong control. A rotated run is measured across the other extent.

**Spacing is a range, offered as four shortcuts.** The workbook publishes 50,
100, 150 and 200 mm edge-to-edge, and those are buttons — but `reconcile` has
only ever clamped spacing to a RANGE, so any figure inside it is legal and the
field carries a stepper for the ones between. The two ranges are the store's
own: 50-200 mm for a catalogue run, `MODEL_SPACING`'s 0-2000 for a run of
models. The ceiling caps both from above, and a preset it cannot take is not
offered rather than offered and refused.

**Blade depth is a range too, offered as published sizes.** Every blade shape
is made between 75 and 300 mm deep, so Standard's five sizes and Tapered's
three profiles are shortcut buttons over a stepper rather than the whole offer.
A typed figure is the fin at its DEEPEST point.

**A taper keeps two ends.** Storing one number would make `parseWidth` answer
the same depth at both, and `finGeometry` extrudes the profile from exactly
those two — so a Tapered blade would come out straight. A custom taper is
stored as `"shallow-deep"` with the shallow end at half the deep one, which
reproduces 100-200 and 150-300 exactly; 125-225 does not sit on that rule, so
`reconcile` leaves a published profile alone rather than rewriting it. Both
ends stay inside the range, which is what the range means.

**The first nudge lands on a twelfth of the fin's length** — 1200 → 100,
1800 → 150, 2400 → 200, 2780 → 230, three of which are sizes the workbook
publishes. It is where the stepper starts, not a value written into the spec:
depth stays a question the staircase asks.

**And it is offered under both names.** Edge to edge is the clear gap the
workbook quotes; centre to centre is the pitch a setting-out drawing quotes.
They differ by what one object measures across the run — `acrossUnitMm`, the
fin's thickness or the model's measured width, which is the same split
`baffleExtent` makes when it chooses a pitch. Only the gap is stored; the pitch
is derived through `pitchOf` and written back through `gapOf`, so the two can
never drift apart and the figure on screen is always the one the scene is built
to.

### Fins inside an imported model

An imported file is an installation, not one object: a run of identical fins,
plus a clamp or two per fin and sometimes a rod above each clamp. `lib/modelFins.js`
tells them apart so a fin can be configured on its own and the run rebuilt at
another count.

**The largest group of meshes is not the fins**, and assuming it is has already
gone wrong once here. Baffle Curve has 13 fins and 26 clamps; baffle.fbx has 8
fins, 24 clamps and 24 rods. Two ratio tests do the work, and both are needed:

| test | what it rejects |
|---|---|
| longest dimension is horizontal | the 24 hanger rods — just as slender, but upright |
| aspect ratio ≥ 10:1 | the clamps — 6.5:1 in baffle.fbx, and the curved ones fail the first test outright |

Neither depends on the file's units or authoring scale. Which way the fins run
is read off a fin too, not off the file's bounding box: Baffle Curve is
4.84 × 4.18 m overall, near enough square, while its fins plainly lie along Z.

The manifest records what it found — fin count, one fin's size, the authored
spacing — measured through the same loader the app renders with, so the two
cannot disagree. **Fin count** and **Spacing** then rebuild the run from one fin
and its hardware, so an authored run of 13 becomes 6 or 20 at any spacing.

**The run hangs by the fin's top, not by the file's origin.** A file's origin is
the top of the whole assembly — usually a clamp — so hanging it there buried the
fin a clamp-height below the drop asked for, left a gap between the slab and
anything hanging from it, and made the selection box miss at both ends: it ran
from the ceiling to 644 mm down while the fins actually spanned 626 to 820 mm.
Recentring the unit on the fin's top fixes all three at once, because it makes
`drop` mean for a model exactly what it means for a catalogue set.

The suspension between the file's own hardware and the slab is drawn — the file
supplies the clamp and sometimes a short rod, and the plain span above it is
parametric, so there is never a gap however deep the run hangs. The drop is
floored at the height of that hardware, in the renderer and on the slider alike:
Baffle Curve at a 50 mm drop used to push its clamps 126 mm through the ceiling.

Click a fin in the 3D view, or pick it by number in the Selection panel, to give
it its own **finish** (any catalogue family, overriding the file's materials),
**drop**, **shift along the run**, **rotation**, or to **hide** it — for a gap
where a light or sprinkler falls. A hidden fin leaves the schedule but stays in
the document, so it comes back. `sizeMm` describes ONE FIN, which is what lets a
model share every piece of maths with a catalogue set: pitch is spacing plus
thickness either way.

**A model is placed as a run, the same as a catalogue set.** Count and spacing
apply to it exactly as they do to fins — N copies spread across the run at a
pitch — so `baffleExtent`, the footprint, the overlap rules and the schedule are
one set of maths for both. The only difference is what one object is: a fin's
width across the run is its thickness, a model's is its measured width, so the
spacing range is wider (0–2000 mm) because a metre-wide object swallows a 100 mm
gap. A model opens as a run of **one** — the file as authored — and the count
slider is right there.

It opens at **`OPENING_LENGTH`, the same length as a catalogue run**, so the two
are comparable on the ceiling from the first click. Proportions are kept, and a
model never opens larger than the ceiling can hold — which matters because
source files are routinely authored for a bigger space than the one being
configured, and the supplied installation FBX is 27.8 m long. Two presets sit
under the size sliders: **1800 mm** returns it to the opening length, **Fit
room** grows it to the largest the ceiling allows.

In the schedule each copy **counts as one unit**, whatever the file contains.
Counting its meshes would be counting the file's authoring, not the product. It
reports the ceiling it takes like anything else — that is a question its box can
answer, unlike which of its surfaces absorb, which is why the schedule no longer
asks.

Filenames with spaces and brackets are fine; the path is URL-encoded.

## What it does

- **Opens on the grid alone** — the 300 mm ceiling grid against a warm beige
  background, no room. The ceiling is the subject; a furnished room around it is
  context you switch ON (Display → Room), not scenery to switch off. It is also
  what makes the background worth setting — eight presets, or any colour, with
  the grid lines flipping between light and dark to stay readable against it.
- **Pick a room** — ten built-in furnished sets, plus any GLB in the models
  folder. The furnished sets are built from primitives, so they cost nothing to
  ship and work offline.
- **Set the ceiling zone** — width, length and height of the area products go
  on. It defaults to the room's own ceiling and can be resized independently:
  the zone is what defines the grid, so it defines what every saved cell
  coordinate means (BRIEF §6 — "author the ceiling as a parametric zone, not
  just a mesh").

  **The room's geometry never follows the zone.** A zone is an area on the
  ceiling, not a resize of the building. Following it would shrink a procedural
  room's walls while its furniture stayed where it was authored — measured at
  2.72 m of desks standing outside the room — and would move a GLB room's slab
  away from the mesh it was measured from. Shrinking a zone drops sets and
  obstructions that no longer fit, reports how many, and one Ctrl+Z restores
  them; the zone is cleared when you change room, because a 15 m zone is not a
  boardroom.
- **Pick baffle parameters** — type (VMT / Blade / Box / Embossed), shape,
  thickness, length, face depth, series and colour, mirroring, fin count,
  spacing, drop and orientation. Every baffle opens at 1800 mm, imported models
  included; the workbook publishes 1200/1800/2400/2780, so that is the nearest
  real product to two metres — see `OPENING_LENGTH` in `lib/catalog.js`. Dependent options cascade the way the
  workbook does: dropping a VMT fin from 80 mm to 25 mm corrects a face depth
  that no longer exists, rather than leaving a product that cannot be ordered,
  and switching type keeps the run roughly its current length instead of jumping
  to the longest in the range.
- **Place** by clicking the ceiling. Sets snap to 300 mm cells and centre on the
  cursor; a green/red ghost shows whether the footprint fits before you commit.
  Overlapping placements are rejected.
- **Move** by dragging, or nudge one cell at a time with the arrow keys. A drag
  is one undo step, not one per cell crossed.
- **Hold Space to pan** — left-drag translates the camera instead of orbiting,
  and the cursor changes so the mode is visible. While Space is held the ceiling
  and the placed sets ignore the pointer entirely, so a pan cannot place a set
  or drag one out of position. Right-drag still pans as well. Releasing Space,
  or the window losing focus, restores orbiting — the blur case matters because
  alt-tabbing away never delivers the keyup.
- **Rotate** 90° in place, **duplicate** into the nearest free slot, **delete**,
  **undo** 40 steps deep.
- **Edit one fin** — in a catalogue set or inside an imported model. Click it in
  the 3D view or pick it by number: finish, drop, shift along the run, rotation,
  or hide it entirely. Each shows as its own line in the schedule, and a hidden
  fin drops out of the quantities.
- **Obstruction mask** — paint cells blocked by lights, sprinklers, HVAC or
  beams. Nothing places on them and auto-fill skips them.
- **Layout presets** — five one-click layouts: VMT field, Blade field (two
  alternating PET colours), Tapered wave, Ombre run and Perimeter band. Each is
  a pure function of the room's grid (`lib/presets.js`), so it scales from a
  boardroom to a sports hall, and each placement goes through the same
  `canPlace()` rules as a hand-placed set — a preset cannot produce an
  overlapping or off-grid layout. A preset replaces the layout and adopts its
  product as the brush; Ctrl+Z restores what was there.

  **With an imported model selected, presets arrange the model instead.** A
  preset is two separable halves: the catalogue recipe it would place, and the
  arrangement — where things go. Only the arrangement is used when a model is on
  the brush, so it keeps its size, drop and its own materials (Blade field does
  not repaint it). The two "run" presets place one room-sized set from the
  catalogue, because a catalogue set grows its own fin count to span the depth;
  a model cannot grow, so the run becomes copies laid end to end. Every preset
  works with every product — the panel says which it is about to arrange.
- **Arrange as array** — repeat the selected set into a rows x columns grid.
  The gap is in **grid cells**, not metres: the legacy version took a metre
  spacing unrelated to the snap grid, so a copy could land between cells. Copies
  that would overlap, hit an obstruction or leave the ceiling are dropped and
  counted.
- **Auto-fill** the ceiling at normal or wide spacing.
- **Schedule / BOM** — fin counts, linear run and the ceiling the layout takes,
  grouped by type, size, finish and colour. It also says what the current
  SELECTION takes, beside the total it is part of and from the same function
  that total sums, so the parts add up to the whole by construction. Select
  several and they are summed, not one of them shown. The area is the RECTANGLE each set reserves,
  gaps included: a run of eight 25 mm fins 100 mm apart is 0.36 m² of fin inside
  the 1.62 m² it occupies, and the 1.62 is what nothing else can be placed in.
- **Three camera presets.** Eye and Corner stand inside the room looking along
  the ceiling. Ceiling plan looks straight down with the slab hidden, at a height
  computed from the camera's live fov and aspect so the whole ceiling is in
  frame — a fixed multiple of the room's larger side crops it, because the
  viewport's aspect decides which side actually binds.
- **Spin** — a turntable toggle in the top bar. Orbits the camera horizontally
  around the current target, holding its height and distance, at roughly one
  revolution per 44 s. Picking a view preset takes precedence and the spin
  resumes on arrival; dragging a set pauses it (OrbitControls stops updating
  while `controls.enabled` is false) and it resumes on release.
- **It survives a reload.** The whole document and the panel you had set up are
  kept in `localStorage` and restored on the next visit — see `lib/session.js`.
  Nothing goes in the URL and nothing is sent anywhere. A link in the address
  bar beats the saved session, because following a link means you came to see
  that ceiling. Clear all empties the saved copy too.
- **Pasting a link into a tab that is already open** works too. Changing only
  the fragment does not reload the page, so the app watches for it; if there
  is work on the ceiling it asks first, and Ctrl+Z puts it back.
- **Copy link** — the whole ceiling in a URL, so a configuration can be handed
  to somebody without sending a file. It goes in the *fragment*, which is never
  sent to a server, and carries the placed sets, their group names, the ceiling
  zone and the pitch its cells are counted in. It deliberately does **not**
  carry the room or the obstruction mask; a link opens in whatever room the
  reader is already in. Measured: a twenty-set layout is about 430 characters
  and a twenty-eight-set mixed ceiling about 780. See `lib/share.js`.
- **Export / Load JSON.** Export writes the full document, mask and scene
  included. Load is switched off (`SHOW_LOAD`), so the file half is still
  one-way — a link is the way a layout comes back in.

- **Background.** White, grey or dark grey, plus a colour picker for anything
  else. The setting-out grid's line colour is derived from whatever it lands
  on — see `gridLineColour` in `lib/theme.js` — so the grid stays readable on
  a mid grey, where a fixed pair of greys does not. The choice is kept with
  the session.
- **Dragging passes through.** A set being dragged moves through other sets
  and through the obstruction mask; the halo under it goes red while it is
  somewhere it could not be left. Let go there and it returns to where the
  drag started. The ceiling edge still bounds it, and the whole drag is one
  undo step.

Shortcuts: `Space`+drag pan, `R` rotate, `D` duplicate, `⌫` delete, arrows
nudge, `Ctrl+Z` undo, `Esc` deselect.

## The saved document

Visualisation and BOM read the same structure — they are not two efforts
(BRIEF §6). A layout is a few KB:

```json
{
  "version": 2,
  "sceneId": "sc:edu-class",
  "ceiling": { "height": 3, "width": 9, "length": 7, "pitch": 0.3,
               "cols": 30, "rows": 23, "custom": false },
  "ceilingOverride": null,
  "obstructions": ["2,2"],
  "items": [
    { "id": "it_…", "type": "baffles", "cell": [8, 6], "rot": 0, "ci": 8, "cj": 3,
      "params": { "btype": "vmt", "thickness": 25, "width": 150, "length": 2400,
                  "family": "wood-classic", "colour": "WD-NC-13", "spacing": 100,
                  "count": 8, "drop": 0.45, "finOverrides": { "1": { "colour": "WD-NC-05" } } } }
  ]
}
```

`cell` is the min-corner of the footprint in grid cells, so overlap tests,
obstruction masking and quantity take-off are all integer arithmetic.
`ceilingOverride` is the zone the layout was drawn on, restored before any item
is measured — otherwise a file would reload onto a different grid than it was
laid out on. Files written before zones existed (version 1) still load. A file
laid out on a different ceiling has its off-grid items **dropped and reported**,
not silently clamped into a pile.

## Decisions worth knowing

- **Baffles are parametric by default; a model file is opt-in.** The workbook
  defines them by thickness, width, length, spacing and count, so the geometry is
  built from those numbers. A file in `public/models/baffles/` is offered
  alongside as a whole model. Either way nothing guesses which mesh in a file is
  "the product" — picking wrong silently drops the thing you cared about, so the
  file is used entire or not at all.
- **A set is one item but many fins.** One document entry, N fins on the
  invoice — so `buildSchedule` expands a set through `finSchedule` rather than
  multiplying it. Per-fin colour overrides split into their own rows, which is
  exactly the case a naive count of items gets wrong.
- **Fin materials are per-fin, not shared.** Real veneer is applied the way
  production cuts it: each fin takes the next vertical strip across the
  1220 × 2800 mm sheet, so neighbouring fins vary the way a real run does.
- **Everything built in a `useMemo` is disposed in an `useEffect` cleanup.**
  Leaked three.js resources are the top cause of "it gets laggy after a while",
  and it does not show up in testing because you only switch scenes twice
  (BRIEF §7).
- **Rooms come in two kinds behind one shape.** `procedural` and `glb` differ
  only in how their geometry arrives; both expose the same `ceiling` plane,
  which is all the grid needs.
- **User fabrics live in the browser.** The app is static files on S3, so there
  is nothing to POST an upload to. IndexedDB keeps a fabric on the machine that
  added it. Fabrics everyone should see belong in the repo as files, the way the
  Wood Classic veneers already are.

## Known gaps

- **Ceiling tiles and clouds are catalogued but not buildable.** Their data is
  in `lib/catalog.js`; their builders are the next pass, ported from
  `../legacy/js/products.js`.
- **FBX textures from 3ds Max do not come through.** three's FBXLoader skips
  `3dsMax|basic|texmap_diffuse` and `3dsMax|maps|texmap_diffuse`, so such a model
  renders in its flat material colours. Exporting with standard/physical
  materials — or as GLB, which embeds textures — is the fix, and is what the 3D
  Scene Brief already asks for.
- **An imported model cannot be recoloured or edited fin by fin.** It is one
  unit with the materials it shipped with. Only parametric sets expose finishes
  and per-fin overrides.
- **`workout-room.glb` is 89 MB and 3.78 M triangles** — over BRIEF §7's 1.5 M
  budget and a slow first load from S3. The manifest reports both on every
  build. Decimation or a re-export is the fix.
- **The bundle is 1.27 MB (358 KB gzipped)**, almost all three.js. Code-splitting
  the loaders would help; they are already dynamically imported.
- **No auth, no analytics, no `vertical: "ceiling"` events** (BRIEF §3.2–3.3).
  The seams are there; the wiring is not.
- **`InstancedMesh` is not used.** At a few hundred sets it should be.
- Layout presets and the inspiration gallery from the old build are not ported.
- Fin materials are not shared between sets, so N identical sets build N
  material sets. Caching by finish is the obvious win when it starts to matter.
