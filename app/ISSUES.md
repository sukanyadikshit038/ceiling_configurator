# Issues and fixes

A log of faults found in this app and what was done about them. Each entry is
symptom → cause → fix, plus the assertion that now guards it. The point of the
guard column is that most of these were *silent* — they rendered something
plausible rather than failing — so the only thing stopping them coming back is a
test that fails when they do.

`npm run verify` grew from 453 to 932 assertions across this work.

---

## Geometry and rendering

### Imported baffles rendered inside-out

**Symptom** You could see through a fin into its interior, so it looked like it
had no thickness. Correct in other glTF/FBX viewers.

**Cause** `lib/models.js` bakes each node's world matrix into its geometry.
7 of the 39 meshes in `Baffle Curve (1).fbx` carry a *mirrored* transform
(determinant −3.396). Baking a mirror reverses triangle winding. three.js does
compensate for mirrored objects — it flips the renderer's front-face setting
from `matrixWorld.determinant()` — but baking leaves every matrix at identity,
so that check reads +1 and does nothing. Other viewers keep the transform on the
node, which is why only we showed it.

**Fix** `flipWinding()` applied at the bake when the matrix mirrors. Only the
winding is corrected; `applyMatrix4` already puts normals through the normal
matrix, and recomputing them would discard the file's own smoothing.

**Measured** Inside-out triangles 776 → 104 of 49,452. All 672 in the mirrored
meshes corrected; the remaining 104 are wrong in the source file, in meshes with
ordinary transforms.

**Also** `npm run manifest` now reports mirrored meshes per file, because the
right fix is a re-export without negative scale, not a correction on load.

---

### Selection outline floated a drop above the baffles

**Symptom** The green box sat well above the run it was meant to enclose.

**Cause** `buildModelRun` already hangs each fin at its drop, but the renderer
*also* wrapped every model group in a `-drop` offset. Rebuilt runs hung at twice
their drop while the outline was drawn at the true one. Whole-object model
copies do need that offset, which is why it was there.

**Fix** `runDropOffset()` in `lib/modelFins.js` — only whole-object copies are
lowered by the caller.

**Guard** The suite builds a run and measures where the blades land. With the
old rule the fin top reports −0.899 against an expected −0.45.

---

### Hidden fins were still clickable in single-fin view

**Symptom** The cursor became a pointer over apparently empty space, and
clicking there selected a fin that was not on screen.

**Cause** Solo mode hid the other fins with `visible = false`. three.js raycasts
by **layer** and never consults `visible`, so an invisible mesh remains a
perfectly good pick target. R3F does not filter them either.

**Fix** `showOnlyFin()` removes each hidden part's `raycast` along with its
visibility, and restores whatever it had — hardware is already a no-op, so
restoring the wrong thing would have made clamps clickable.

**Guard** Raycasts fired at each fin's position: all pickable initially, only
the chosen one after soloing, all restored after.

---

### Moiré when zooming out

**Symptom** Patterns appeared on the fabric past a certain distance that were
not visible closer in.

**Cause** Texture minification aliasing. A fin is long, thin and seen at a
grazing angle, so its texture is minified far harder along one axis than the
other — roughly 60:1 against 7:1. Every texture in the app was pinned at
`anisotropy = 4`.

**Fix** Anisotropy now comes from `renderer.capabilities.getMaxAnisotropy()`
(typically 16) via `lib/gpu.js`, which both canvases populate. Mipmapping is
explicit on fabric panels: `LinearMipmapLinearFilter`, not the nearest-mip
default that bands at level changes.

**Still open** These are 3402 × 7937 photographs and a fin gets ~20 px of face
at ceiling distance. Downsampled or KTX2 assets — which the panel map's own
warnings recommend — would fix it at the source.

---

### The suspension we draw did not match the one in the model

One complaint — "the rod above the baffle is fatter than the rod in the file" —
that took four passes to actually fix, because each pass corrected a real fault
and left another behind it. Worth writing down as a sequence, since the lesson
is in the sequence.

**1. The extension ignored the file entirely.** It was a flat 12 mm cylinder.
Baffle Curve's wire renders at about 2.4 mm, so the join was plainly a join.

**2. Six rods for three suspensions.** `Standard.fbx` carries a clamp *and* a
hanger at each of three points, millimetres apart, and the renderer extended
every hardware piece — including clamps with no hanger in them. *Fixed* by
extending only pieces that reach the top of the assembly: a clamp has nothing
above it to continue.

**3. The bounding box measured the wrong end of the part.** These hangers taper
hard. Baffle Curve's is a hooked wire modelled as a *single mesh* — 372 mm
across at the hook, 5.4 mm at the top — and `Standard.fbx`'s rod is 73 mm at
its bottom flange against a 22 mm shaft. Worse, the box was also used to decide
*whether* a piece was a rod at all, by asking if it was slender; Baffle Curve's
hook said "no", so that file was treated as having no suspension. *Fixed* by
measuring the cross-section **at the top of the piece**, which is exactly where
the drawn rod takes over.

**4. And then three more, all found only by looking at the render.**

- *A stray vertex read as a strap.* One vertex of the second hook sits at the
  same height as the wire, 10 mm to the side, so the "section" came out 15 mm
  instead of 5 — the back row of rods three times too thick while the front row
  was right. Strays are now trimmed by distance from the **median** point.
  Single-linkage clustering was tried first and is wrong here: a shaft modelled
  with four vertices has neighbours as far apart as the shaft is wide, so any
  threshold that separates the stray also shatters the shaft.
- *The rod stood beside the wire.* A hooked hanger is not symmetric — its box
  centre is 11.8 mm from where the wire leaves the top, further than the rod is
  wide. Position now comes from the measured section, not the box.
- *Right size, wrong transform.* The extension was being scaled uniformly while
  the hanger it continues was scaled per-axis, so the two could not line up at
  any size.

**And one thing that was not a bug in the renderer at all.** Somewhere in the
middle of this the model's *own* clamps and hangers were rebuilt as "fixed
parts" that no longer scaled with the fin — a defensible idea, and not ours to
decide. Resizing a supplier's hardware is a change to the product. Reverted:
the file's own parts are drawn exactly as the file draws them under the fin's
fit, and the only piece we size is the extension we add, which is matched to
them rather than the other way round.

| | drawn before | drawn now | in the file |
|---|---|---|---|
| Baffle Curve, front | 12.00 mm | 2.37 × 3.60 mm | 5.50 × 5.41 mm |
| Baffle Curve, back | 12.00 mm | 2.37 × 3.47 mm | 5.50 × 5.21 mm |
| `Standard` hanger | 12.00 mm | 1.43 × 2.18 mm | 22.16 × 21.80 mm |

Two lessons worth keeping. **A bounding box is a poor instrument for a part that
tapers** — it answers "how big is this?" when the question was "how big is it
*where the other thing meets it*?". And the check that would have caught all
four faults at once is the direct one, which is now the test: put the drawn rod
and the file's own hanger in world space and assert they are **the same rod** —
same thickness, same place, no gap at the join. Every "close enough" version
failed it.

---

### One row of every Baffle Curve run hung wrong

Reported as "one of the sides is not good — the model's own suspension is wide
where it meets the one you add". It was, and the cause was in the file.

`Flow.fbx` hangs each fin on two pieces that are the same mesh, vertex for
vertex — except that **one vertex of one hanger's top ring sits 4.5x further
from the centre than its fifteen neighbours**. The wire is a cone drawn from
that ring down to the one at the bottom, so a single displaced vertex splays one
facet open along its entire length. One row of every run renders with a wire
that juts sideways; the other row is clean. Verified against the untouched
original after it was restored, so it is a fault in the delivered file.

It also poisoned our own measurement: the stray fell inside the slice used to
size the extension rod, which read a 5.2 mm wire as a 15.1 mm strap and drew
that row's rod three times too thick.

**Fix** Straightened on load — the stray is pulled back onto its ring, in
memory. The file on disk is never written, and `npm run manifest` names the
defect so a corrected re-export can be asked for. Both rows now draw within
0.03 mm of each other, where they differed by 6.45 mm.

Three things worth keeping from this one:

- **Statistics over raw vertices lie.** That ring is 16 points stored as 90
  vertices, duplicated unevenly between the faces that meet at each corner. Any
  median or mean taken over the raw list is weighted by triangle topology, and
  a perfectly clean ring measured that way reads as 1.74 out of round. Dedupe
  to distinct positions first.
- **Re-centre before judging shape.** Measured about a first-guess centre, the
  broken ring still read 1.46 out of round after the stray was set aside — the
  stray drags the median with it. Recompute the centre from what is left, then
  test.
- **A silent repair is not a repair.** `analyseFins` runs twice per load by
  design — once to find which way the model is turned, once afterwards in render
  coordinates. The repair happened on the first pass, so the second reported a
  clean file: the fault fixed, invisible, and never raised with the supplier.
  The result is now recorded on the geometry, so it survives the second pass.
  A related trap in the same code: distances measured on that first pass are in
  the file's own units, not metres, so the warning reported "12506.8 mm out". It
  reports a ratio now, which cannot be misread.

---

### A fin disagreed with itself about which way a gradient ran

Reported against the alternating layout: on one baffle the fade ran a-to-b on
one side and b-to-a on the other, and the next baffle did the same in reverse.
The intent is that a baffle fades one way on BOTH its sides, and the next
baffle the other way.

The alternating code was doing its job. The fin was not.

A fin is a slab, and a modeller lays its front and back out as mirror images —
the natural thing to do, and invisible on a weave, a grain or a flat colour.
Measured on the shipped models, the front face has u falling as x rises and the
back has it rising: **the two sides read a texture in opposite directions in the
room**. Both files do it, Baffle Curve across 23 triangles a side and the Blade
across 2. Nothing had ever shown it because nothing directional had been applied
to these shapes before.

Alternating whole fins on top of that cannot help. Each fin already disagreed
with itself, so reversing every second one just moved the disagreement around.

**Fix** — `matchFaceUVs` turns the BACK face round to agree with the front,
once, as the model loads. The front keeps exactly the mapping the file gives it,
so nothing that looked right before changes. Mirroring is about the back face's
own u extent rather than about 1, because a fin's UVs need not fill 0..1 and
mirroring about the wrong axis slides the texture off the fin instead of
reversing it. Where the two faces share vertices it refuses and says so, because
moving a shared vertex would drag the front along with the back.

Two things worth keeping:

- **It has to run after the model is turned.** `analyseFins` is called twice —
  once to work out which way the run lies, once afterwards in final
  coordinates — and this reads the x and z axes, the very ones the quarter turn
  exchanges. Run on the first pass it classified the fin's ENDS as its faces and
  mirrored the wrong vertices: Baffle Curve came out looking fixed while the
  Blade was left untouched and still wrong. It lives in `loadWhole` now, after
  the turn, and the doc comment says why so it does not drift back.
- **A fully welded slab cannot fail this test**, which is why the first attempt
  at a guard test passed for the wrong reason. Shared vertices carry shared UVs,
  so both faces necessarily read the same u against the same x. The case the
  guard exists for is the PARTIAL one — a back face that borrows some of the
  front's vertices and brings its own for the rest — and that is what the
  fixture had to become.

---

### A hanger that was a hook and a point, with nothing between

Reported from the Flow focus view: one row of suspension wires looked fine and
the other was uneven — thick where it left the baffle, converging as it climbed,
thin at the top.

Measured on the rendered geometry, above the fin each hanger has exactly **two
rings**: the hook (1301 vertices, 160 x 40 mm) and the tip (90 vertices,
2.4 x 3.6 mm), 136 mm apart, with **nothing in between**. Thirty-two triangles
per hanger span the whole 412 mm, joining one straight to the other. The file
models no wire at all — it lofts the hook to a point, which draws as a spike.

The two rows differ because the two hooks are different depths, 47.07 mm against
36.88 mm as rendered. Same spike on both; one just starts wider. Nothing we had
changed touched the hooks.

**Fix** The tip ring is brought down to one wire-thickness above the hook, which
turns the loft into a short transition, and the rod the renderer already draws
carries the whole visible length at the wire's own measured thickness. Both rows
then read as the same straight wire. Flow now hands over at 3.99 mm above the fin
instead of 136 mm.

**Left alone where a wire is really modelled.** The test is whether anything sits
near the wire's axis just below the tip. `baffle.fbx` has a ring there 28 mm
across against a 22 mm tip — a rod with a slight taper, and nobody's problem — so
it is untouched and still hands over at 143 mm. Baffle Curve has nothing within
30 mm of its own axis, because the only thing down there is the hook.

One consequence worth knowing: the minimum drop follows the hardware, so a Flow
run can now hang almost against the slab where it was previously held 136 mm off
by geometry that was never a suspension in the first place.

---

### A finish that "applied a related solid colour" instead of itself

Reported first against Blade Tapered, then against Blade Standard: picking a
Colour Core Ombré design painted the baffle one flat colour, close to the
design's own, rather than the fade.

Nothing to do with the finish, and **two different faults with one symptom** —
which is why fixing the first did not fix the second.

**Tapered ships with no UV attribute at all.** A material with a map but no
texture coordinates samples the same texel for every fragment, so the whole fin
takes one colour lifted out of the photograph.

**Standard ships UVs mapped for TILING**: u runs −109.4 to 109.4, which says
"repeat this 219 times along the fin". Every finish here assumes the other
convention — one span of the map across the face, with any repeat set on the
texture afterwards — and a photographed panel is clamped to its edges. Measured,
**22 of its 36 vertices landed outside the panel** and sampled the edge texel.

Both render as one flat colour, and both affect wood, fabric, concrete and the
ombré ranges alike. The ombré is only where it was noticed, because a fade is the
hardest to mistake for a solid.

**Fix** Two steps on load, before anything is measured or drawn:

- `planarFinUV` generates a projection when a file ships none — u along the run,
  v down the face, which is the mapping every finish assumes.
- `normaliseFinUV` rescales a tiling map back to one span, per axis over the
  fin's own extent, so the direction survives and the two faces can still be told
  apart afterwards.

| | vertices landing inside the panel |
|---|---|
| Standard | 14 of 36 → **36 of 36** |
| Tapered | no UVs at all → **36 of 36** |
| Baffle Curve | 288 of 288, untouched |

A mapping that merely does not fill 0..1 is left alone — Baffle Curve's u runs
−0.0006 to 1.0006 and its v covers the middle 44%, which is a mapping somebody
meant rather than a tiling count. Stretching it would change a fin that renders
correctly today. Both files on disk are untouched and `npm run manifest` asks
for corrected exports.

**It also corrected a warning that was wrong.** `matchFaceUVs` returns nothing
for several different reasons — no UVs, one face, welded faces — and the manifest
reported the welded case for all of them. Tapered was therefore described as
"its fin's two faces share vertices", and listed in the suite as a known welded
file. It never was: it simply had no UVs. Generated coordinates come out
agreeing by construction, so it needs no turning round either, and the exception
is gone.

The lesson is narrow and cost an hour: **a function that returns null for four
reasons cannot be reported on as though it returned null for one.** The guess
was plausible, went into a warning, into a test, and into a message to the
client, and stayed wrong until the geometry was looked at directly.

---

## Catalogue and data

### Picking a fin colour did nothing

**Symptom** Every swatch on a single fin painted the same thing.

**Cause** The picker emitted a colour with no family, and the renderer paired it
with the **set's** family. A colour code that family does not publish falls back
to that family's *first* swatch — so every swatch resolved identically.

**Fix** `finFinish()` in `lib/catalog.js` resolves a fin's finish as a
family/colour **pair** — its own, or the set's, or the file's own materials,
never one field from each. The picker emits both together.

---

### Some finish families snapped back to Wood Classic

**Symptom** On a whole set, `pet-solid`, `colour-core-fabric` and `vmt-solid`
reset to Wood Classic; the other four families worked. Fins were unaffected.

**Cause** `reconcile` clamped `family` to the shortlist of the item's `btype`.
An imported model has no catalogue type but still carries one — `vmt` by
default — whose list is those four. Fins escaped because their finish lives in
`finOverrides`, which reconcile does not inspect.

**Fix** A model set reconciles against `MODEL_FIN_FAMILIES`; a catalogue set
against its type's list.

---

### Fin thickness jumped to 100 mm and would not come down

**Symptom** Increasing thickness from 16 mm went straight to 100, then moved
only in 50s and never below.

**Cause** The size control hardcoded `min = 100, step = 50` for all three axes
while the store accepts a thickness down to 5 mm. `−` disabled at 16 ≤ 100, and
`+` clamped 66 up to 100. The same 100 mm floor had already been removed from
the store once for this reason and left in the panel.

**Fix** `MODEL_SIZE_LIMITS` is the single statement of the bounds, used by
`reconcile` **and** the control, so a control can always reach every value the
store accepts. Per-axis steps: 1 mm on thickness, since a 50 mm step cannot
express any catalogue thickness (12/25/40/50/80).

**Guard** For each axis, the floor and ceiling the control offers round-trip
through `reconcile` unchanged.

---

## Colour Core Fabric

The panel map is 57 CloudFront JPEGs of 3–9 MB, each 3402 × 7937 — about
**103 MB of GPU memory once decoded**. `lib/colourCore.js` holds exactly one at
a time: fetched on demand, held as a blob we own, decoded to an ImageBitmap,
wrapped in one `THREE.Texture` and **never cloned** (a clone is a second
upload). The outgoing panel is released only once its replacement has decoded.
The 28 KB thumbnails carry every other surface, so a finish shows the right
colour instantly and sharpens when the panel lands.

### The weave was procedural felt, identical for every selection

**Cause** The branch handling `kind: 'colour-core'` never reached `baffle.js` —
the patch that added it failed partway. The kind fell through the material
builder's `switch` to `default: felt`, which renders procedural speckle at the
swatch hex: right colour, wrong texture, same pattern every time.

**Fix** The branch, plus `FINISH_KINDS` exported from `baffle.js` and held
against every family's `kind`. An unhandled kind now fails loudly instead of
rendering plausibly.

### Flicker when switching to any finish after the first

**Cause** `disposeGroup` frees `m.map` for every material it tears down. That is
right for every other finish, which all clone their texture — but the Colour
Core map *is* the single shared panel. Each rebuild freed it out from under the
group replacing it, and three.js re-uploaded it.

**Fix** `userData.sharedMap` — the group frees the material, not the map.

### One weave shimmered at distance and the other two did not

Reported as: pick any base colour, take the **third** structure (FB-CC-03), pull
the camera back, and past a certain point a pattern appears that is in neither
the cloth nor the photograph. The other two structures stay clean at the same
distance.

Worth writing down mostly for how wrong the first three explanations were.

**"It's the finest weave, so it aliases first."** It is the finest — 4 px thread
pitch against 5 px — and that explains nothing. Simulating the minification
showed FB-CC-03 is *no worse than the others under even shrinking, and better
than FB-CC-01*. File size had been used as a proxy for detail, and it misled.

**"It's direction-dependent."** A fin is long and shallow and always seen at an
angle, so its texture is squashed far harder along one axis than the other, and
sweeping lopsided footprints did separate FB-CC-03 from the rest. The prediction
that falls out of that is that the artefact should change with viewing angle at
a fixed distance. It doesn't — it survives orbiting the camera. Dead.

**"The mip chain bakes it in."** Once aliasing folds high frequency down to low,
that low frequency is real data and every later level keeps it faithfully, which
would explain why it never fades however far back you go. Simulating the actual
halve-by-two chain showed all three structures behave alike. Dead.

**What it actually is** — measured by rendering the real panels through a real
GPU, with the app's own filtering, at the crop and the shapes a fin gets. The
number is the false pattern as a multiple of the cloth's own detail:

| | as-is | 1024 px | **1536 px** | 2048 px |
|---|---|---|---|---|
| FB-CC-01 | 4.27 | 2.86 | **2.55** | 3.30 |
| FB-CC-02 | 4.66 | 4.28 | **3.52** | 5.05 |
| FB-CC-03 | **5.43** | 3.24 | **2.93** | 3.69 |

Two things stack on the third weave. It generates the most false pattern, *and*
its cloth is the smoothest at distance — so there is the least real texture for
the false pattern to hide behind. At the worst distance it measured **6.8x the
real weave detail**, against 2–3x on the other two. One is noticed and two are
not.

**Fix** Decode the panel at 1536 px wide with `createImageBitmap`'s own
resampler, instead of handing the GPU a 27-megapixel photograph and letting it
average blocks of texels every frame. A proper filter applied once, in place of
a crude one applied continuously. FB-CC-03 drops 5.43 → 2.93.

VRAM per panel falls from **144 MB to 29 MB** as a side effect, which is the
thing `npm run manifest` had been warning about since the panels landed.

Two things worth keeping:

- **2048 measured worse than 1024, on every structure.** Whether a weave aliases
  depends on how its thread pitch lines up with the sampling grid, not on how
  much of it there is, so "bigger is safer" is false here. A later well-meant
  bump to 2048 would quietly bring the shimmer back. The constant is pinned with
  its measurements next to it.
- **Simulating a GPU in JavaScript is not the same as measuring one.** The first
  two explanations came from box-filter simulations that looked reasonable and
  pointed the wrong way. Uploading the real texture and reading back real pixels
  took about as long and gave the answer.

---

### Weave drawn 2.3× too coarse

**Cause** The photograph is portrait, so its U axis is the panel's 1200 mm side;
a fin's U runs along its *length*. The fin's length was being mapped onto the
short side.

**Fix** `cropToFin()` turns the texture a quarter turn, putting the panel's
2800 mm side along the fin — also the only orientation where nothing repeats,
since the longest catalogue fin is 2780 mm. With rotation the repeat axes swap,
so the crop is asserted through three's own UV transform rather than by
re-deriving it.

---

### Colour Core Ombré: a header 272 KB in, and a texture no GPU would take

Adding the ombré range turned up two faults in the panel loader that the fabric
range had never triggered.

**The frame header was further in than anyone looks.** The loader reads a JPEG's
header to find its pixel size, so it knows whether to decode smaller — and read
64 KB, which is generous for a header. These panels carry an embedded colour
profile in **four 64 KB APP2 segments**, plus EXIF and a Photoshop block, which
puts the frame header past **272 KB**. The read found nothing, reported "size
unknown", and the loader did the safe-sounding thing: decoded the file as it
came.

That was not safe. These panels are **7382 x 17126**, and 17126 is past
GL_MAX_TEXTURE_SIZE on every GPU (16384 at best, commonly 8192). The texture is
not slow at that size, it is *refused*. The manifest's own warnings said exactly
this and the loader sailed past them because a size it could not read looked the
same to it as a size that was fine.

*Fix* — the reader grows its window (64 KB, 512 KB, the whole file) until the
header turns up or the file runs out. A size it genuinely cannot read still
falls back to decoding as-is, but that is now rare rather than routine.

**The cap was on the wrong dimension.** `panelDecodeOptions` capped WIDTH, at
the size measured for image quality. A panel can be narrow and still far too
tall: 1000 x 20000 passes a width test and is refused by the driver. It now caps
the longest side against the hardware limit as well, and the stronger of the two
reasons wins.

And a smaller trap inside that: scaling by a ratio and rounding the width
afterwards rounds the height back UP over the cap — 1000 x 20000 came out 8200
against a limit of 8192, still refused, having "fixed" it. Both caps are now
expressed as a width and the smaller taken, so the arithmetic cannot creep.

**Result** 7382 x 17126 decodes to 1536 x 3564, and VRAM per panel goes from
**673 MB to 29 MB**. It takes about 7 seconds to arrive, which is the 126
megapixel decode and not the download; downsampled source assets remain the real
fix.

**Also settled while wiring the alternating layout:** a cloned texture SHARES
its source, and three uploads per source — so a mirrored second view of a panel
costs one small JS object and no GPU memory at all. Measured on three 0.183: two
`Texture` objects, one `WebGLTexture`, `info.memory.textures` of 1. The
comment in the loader saying "a clone is a second upload" predated three r151
and had been steering decisions ever since; it is gone.

---

### A design that repainted itself every few seconds

Reported as: pick a Colour Core Ombré design and the baffle goes black, gets
painted, goes black again, on a loop of about six seconds.

Only one panel was held on the GPU at a time. That was right when a panel
decoded to 108 MB — holding two was most of a laptop's texture memory, and the
rule was written deliberately: *one full-resolution panel, ever, released only
once its replacement is ready.*

It stopped being right the moment a ceiling could carry two designs. Each set
asked for its own panel every frame, each request evicted the other's, and
neither ever settled. Reproduced by driving the two requests directly:

    t=0.0   A live, B black       t=5.0   B live, A black
    t=9.3   A live, B black       t=13.6  B live, A black

Four fetches in twenty seconds and climbing. A cache of one thrashes the instant
anything wants two, and every eviction shows on screen as a baffle going black.

**Fix** A budget rather than a slot: 120 MB, least-recently-asked-for evicted
first, never down to zero. Downsampling on the way in had already taken a panel
from 108 MB to about 22, so the new budget holds five or six panels for close to
what a single panel used to cost. The same two requests now fetch twice, hold
both, and stay put.

Beyond five or six distinct designs on one ceiling it will thrash again, and the
honest answer then is smaller assets rather than a bigger number.

Two things worth keeping:

- **The mirrored view had the same fault in miniature.** The reversed twin of a
  panel — a clone, sharing its source, costing no GPU memory — was kept in a
  module-level slot of one. It is stored on the panel now, so it is found again
  for as long as that panel is held and released with it.
- **The eviction policy is a plain function over plain data** (`overBudget`),
  because the thing it replaced could only be exercised by watching it
  misbehave. Six assertions cover it, including the one that matters most: never
  drop the last panel, since a cache of zero re-fetches on the next frame, which
  is the same thrash only worse.

---

## Interface

### Top bar cramped, labels wrapping to two lines

**Cause** Flex children shrink by default until their text wraps.

**Fix** `shrink-0` on buttons so they keep their natural width and the bar
scrolls instead; views collapsed into one segmented control with one-word
labels; brand text and the wall-app label hide progressively at narrow widths.

### Left sidebar text clipped

**Cause** A regression from the above: `whitespace-nowrap` was added to
`Button`'s **base** class, which also applied to the layout-preset cards — the
only buttons whose content is a paragraph rather than a label.

**Fix** Removed. `shrink-0` alone does the top-bar job; a flex item that cannot
shrink keeps its content width without a whitespace rule.

### Ceiling tiles could not be selected at all

**Symptom** Picking Ceiling Tiles from the Product dropdown did nothing.

**Cause** The control was a decoration: `value="baffles"` was hard-coded and its
`onChange` was an empty function with the comment "only baffles are buildable in
this pass". The store's product dispatch existed, but no UI reached it.

**Fix** The dropdown reads `brush.type` and calls `setProduct`. `Select` now
honours `disabled` on an option, so Clouds and Horizon are shown greyed rather
than being selectable routes to a half-built product.

**Guard** `the tile product is no longer marked coming soon`, `clouds and Horizon
still are, because nothing builds them`, `a blank brush for tiles is a TILE
brush, not a baffle one`.

### Placed tile blocks were invisible from the room

**Symptom** A placed block showed as a faint hatch from below and drew properly
only when the camera was above the ceiling. Setting the material to pure red
changed nothing on screen, which ruled out the texture.

**Cause** Measured on the delivered file: of a tile panel's 180 triangles,
**1.35 m² faces up and 0 m² faces down**. Every surface in the panel points at
the slab. A material is `FrontSide` unless told otherwise, so the whole block
was back-face culled from the one angle a ceiling is ever looked at.

Not the same fault as `flipWinding` catches — that fires on a node whose matrix
has a negative determinant, and these panels are not mirrored, they are authored
one-sided.

**Fix** The face material is `DoubleSide`. Flipping the winding instead would
only move the hole to the other side, and the block *is* orbited from above in
the plan views.

**Guard** No unit assertion — this is a property of the supplied file, not of
our code, so `scripts/build-manifest.mjs` reports the parts it found and the
renderer no longer depends on which way they face.

### The dev server restarted on every edit to `lib/tiles.js`

**Symptom** Editing the tile module tore the server down mid-session and blanked
the page: `[vite] src/lib/tiles.js changed, restarting server...`

**Cause** `vite.config.js` imported `isModelFile` from `scripts/build-manifest.mjs`,
which dynamically imports `src/lib/tiles.js` for the tile survey. Everything a
Vite config imports — transitively, dynamic imports included — becomes a config
dependency.

**Fix** `isModelFile` moved to `scripts/model-files.mjs`, a module with no
imports at all. Both the config and the manifest builder read it from there. It
also learned about `ceiling_tiles`, which it had never matched, so dropping a
tile model in now triggers a rebuild the way a baffle does.

### Perforations differ by 10x and the sparse ones are nearly invisible

**Symptom** PF-NC-08 darkens the wood by 0.75%; PF-NC-34 darkens it by 5.7%.

**Cause** Not a bug. Measured across four decode widths, each panel's mean
luminance is CONSTANT — PF-NC-08 reads 253.0 at 512 px and 253.3 at 4096 px —
so the downsample is faithful and is not losing the pattern. The sparse panels
genuinely are 99% white: PF-NC-08 has 0.01% of its area below half brightness
against PF-NC-34's 8.8%.

Worth knowing before anyone reports the faint ones as broken. The individual
holes do blur out at `TILE_PX` (1024 across 600 mm puts a small hole at about
two pixels); raising it to 2048 sharpens them at 4x the memory, which is a
judgement about how the range should read rather than a correctness fix.

### Tile blocks were missing from the schedule

**Symptom** A placed block showed "0 units · 0.0 m² face" and "0% of the ceiling
is under a baffle set".

**Cause** `buildSchedule` and `coveredArea` both opened with
`if (it.type !== 'baffles') continue`.

**Fix** A block is one item and twelve tiles on an order, the same way a set is
one item and N fins. The row carries its own `finishLabel` because the tile
range is not one of `COLOUR_FAMILIES` — looking `WD-NC-33` up there would
silently return that family's first swatch and label every tile the same.

**Guard** `a placed block is twelve tiles on the schedule, not one`, `the line
names both halves of the finish`, `a tile has no run — that is a baffle
measurement`, `and it absorbs on ONE face, the one facing the room`.

### Sets could never be placed closer than the grid let them

**Symptom** Two products could not be brought near each other, and nudging one
toward another moved it in 300 mm jumps.

**Cause** The 300 mm pitch, doing two separate things at once:

* it quantised POSITION, so the smallest nudge was 300 mm; and
* an item RESERVES whole cells, so it hoarded space it did not occupy. A 4-fin
  Blade set is 400 mm wide and reserved 600 — two of them, as close as the grid
  allowed, still sat **200 mm apart** with no way to close it.

**Fix** `DEFAULT_PITCH` is 100 mm. It divides 300 exactly, so every position the
old grid could express is still reachable, and it divides the 600 mm tile module,
so baffles and tiles still share one coordinate system — which is the part of
BRIEF §6 that actually mattered. Measured after the change: the same pair
reserves exactly 400 mm each and sits at a **0 mm** gap. The `Blade field`
preset now packs its rows at 1.90 m against 2.10 m before, with its designed
600 mm gap unchanged — the 200 mm it gained was pure rounding waste.

**Guard** `at 300 mm it reserved 600 — 200 mm of space it does not occupy`,
`at 100 mm it reserves exactly what it occupies`, `two sets side by side were
stuck 200 mm apart at 300 mm`, `and can now touch`.

### Everything that counted in CELLS silently changed meaning with the pitch

**Symptom** None yet — found while changing the pitch, which is the point.

**Cause** A cell was treated as a fixed distance in three places, because for as
long as the pitch never moved it was one:

* `PRESETS` asked for gaps and margins in cells (`{ gap: 2, margin: 1 }`), which
  meant 600 mm and 300 mm at the old pitch and would have meant 200 and 100 at
  the new one — packing every arrangement three times tighter than designed.
* `autoLayout(gapCells)` the same, and the sidebar called it as `autoLayout(2)`.
* `blade-field`'s `vary()` worked out which ROW a set was in with `cj + 2` — the
  field gap, written as a cell count. At 100 mm it read every band as the same
  colour, so the two-colour preset would have come out single-colour.

**Fix** All of them state millimetres and convert at the grid. The field gap is
now one constant that both `field()` and `vary()` read, so they cannot disagree
about it again.

### A saved layout would have reloaded into a third of the ceiling

**Symptom** None shipped — this was fixed in the same change that would have
caused it.

**Cause** Cell indices are pitch-relative. Cell 4 at 300 mm and cell 4 at 100 mm
are 1.2 m apart, so every layout ever exported would have reloaded with its
contents pulled into the top-left third of the ceiling. It would have looked
like a corrupt file rather than a misread one.

**Fix** `toJSON` has always recorded the pitch it used, which is what made this
recoverable. `fromJSON` compares it with the current grid and rescales. Masked
cells SUBDIVIDE rather than move — one 300 mm cell becomes the nine 100 mm cells
it contains, because mapping it to one would leave eight ninths of a light
unmasked while looking as though it had been carried across.

Two unrelated faults surfaced in that same function: it reconciled every item
against the BAFFLE defaults, so a saved tile block reloaded as a baffle set; and
it sized every item with `baffleCells`, so a tile block got a baffle's footprint.

**Guard** `an old-pitch file still loads`, `and its set comes back in the same
place on the ceiling`, `a masked cell becomes the nine it contains`, `a file that
records no pitch is assumed to be ours`. Checked by removing the rescale and
confirming all three fail — the set lands 1.4 m away and the mask stays one cell.

### The tile model is on no module the range is sold in

**Symptom** Asked to offer Wood Classic in 600 x 600 and 1200 x 600.

**Cause** Measured off the delivered file, every tile face is **1264.6 x 1289.0
mm** — neither module. And it is not a setting-out model at all: tile centres
step 1259.0 / 1307.9 / 1300.7 mm along x, so one pair of tiles OVERLAPS by 5.6 mm
while another has a 43 mm gap; the nine clean rails run in one direction only; and they come in three lengths (1324.4 / 1303.9 / 1283.5 mm) for what
should be one extrusion. It is a visual mock-up.

**Fix** Both sizes are offered as a texture change on the geometry as delivered,
which was a deliberate call: the finishes are real and worth seeing now, the
geometry is to be rebuilt from the module later. Every panel therefore renders
about 6% oversize (595 -> 633 mm, 1195 -> 1265 mm), and the tile panel says so on
screen in the same words rather than leaving somebody to measure it off a
screenshot.

How many panels land on a tile is **derived**, not declared —
`tileRepeat(size, tileMm)` divides the tile by the module, giving 2 x 2 for
600 x 600 and 1 x 2 for 1200 x 600 on this file, and the right answer on a model
built to a true module with nothing here to change.

**Guard** `a 600 mm panel repeats 2 x 2 on the delivered tile`, `a 1200 x 600
panel repeats 1 x 2 on it`, `and on a tile built to a true 1200 module it would
be 2 x 2 / 1 x 2`, `600x600 renders about 6% oversize on this model`.

### Filenames said one shape, the pixels said another

**Symptom** Three Wood Classic files in the `1200x600` folder are named
`_1195x1195`.

**Cause** Nothing but the names — every file in that folder is genuinely 2:1
(14291 x 7205 or 7145 x 3602). The FOLDER is the authority and the pixels are
the evidence; the name is decoration, and it was decoration that would have been
believed.

**Fix** The manifest checks each panel's real aspect against the folder it sits
in and reports any that would be stretched. Nothing reads the size out of a
filename.

**Guard** `every 600x600 panel is square`, `and every 1200x600 panel is 2:1,
whatever its name says`, `including the three misnamed _1195x1195 ones`.

### A 2:1 panel was being squashed into a square

**Symptom** Would have shipped: both the composite texture and the picker chips
forced every panel into a square.

**Cause** `tileTexture` built a `size x size` canvas from `woodBmp.width`, and
`makeThumb` passed both `resizeWidth` and `resizeHeight`. Square is right for a
600 x 600 panel and halves the grain of a 1200 x 600 one.

**Fix** Both decode by WIDTH only and keep whatever height the source implies.
Measured live afterwards: 1200 x 600 gives a 1024 x 517 texture at repeat
[1, 2]; 600 x 600 gives 1024 x 1024 at [2, 2].

### "Ceiling tile 600x600" over "1265x1289"

**Symptom** The schedule line contradicted itself.

**Cause** The panel size went into the row NAME, and the table prints the tile's
own dimensions straight after it. The 600 is the panel, the 1265 is the tile it
faces — two different measurements reading as one wrong one.

**Fix** The panel size leads the FINISH instead: `600×600 · WD-NC-05 + PF-NC-34`.
Two blocks differing only in panel size are still two lines on the order.

### A patch script exited partway and left the tile module half-built

**Symptom** The tile focus view compiled, ran, and could not pick a tile. Its
per-tile overrides were never pruned either.

**Cause** One patch applied five edits to `lib/tiles.js` in sequence and aborted
on the third because an anchor had moved. The guard did the right thing — it
raised BEFORE writing, so the file was untouched — but the run also printed a
successful-looking build afterwards, and only the one piece named in the error
was re-applied. The other four, including `userData.tileIndex` (which is the
whole mechanism by which a click names a tile) and the override pruning, were
silently missing.

Nothing failed loudly. The focus view rendered, tiles just were not clickable,
and `reconcileTile` passed junk through.

**Fix** Re-applied as one patch that reports which swaps landed, and caught by
`grep -c` on each expected symbol rather than by reading the exit line. The
lesson is the one already in these notes and it keeps costing: after a patch
script, check the FILE, not the script's output.

**Guard** `an override naming a code that is gone is dropped`, `and a key that is
not a tile index is not kept as one` — both failed against the half-built module
and pass now.

### Tile indices came from the file's own mesh order

**Symptom** Would have shipped: "tile 3" meaning a different tile after any
re-export.

**Cause** The faces come out of the FBX as Object084 upward in no useful
arrangement, and an override keyed by that order would follow the export rather
than the ceiling.

**Fix** The loader sorts faces into reading order — row, then column — with a
tolerance of half a tile, which this file needs: its tile centres step
1259 / 1308 / 1301 mm, so a row is several millimetres out of line and an exact
comparison would split it into three.

### An accent tile was invisible on the order

**Symptom** Would have shipped with the per-tile editor: a block reported twelve
tiles of the block's finish however many of them had been changed.

**Cause** `buildSchedule` read the block's `wood` and `perforation` once and
multiplied by the tile count.

**Fix** It resolves each tile through `tileFinishOf` and groups by what that
tile actually wears. A block with no edits still collapses to one row, because
every tile then resolves to the same pair. Verified in the browser: one edited
tile out of twelve gives lines of 11 and 1.

**Guard** `an edited tile becomes its own line on the order`, `eleven on one line
and one on the other`, `and the total is still twelve tiles`, `and the order
collapses to one line again`.

### The cross-tees and the perimeter frame were being thrown away

**Symptom** Reported from a reference photo: the ceiling has black dividers
running both ways and a border round the outside; ours had only the dividers
running one way.

**Cause** My own classifier, and my own wrong description of the file. It called
a mesh "surrounding ceiling" when its FOOTPRINT covered most of the model, and
dropped it. `vicstripceiling_sneha001` covers the whole model because it IS the
perimeter frame and the tees between the rows.

Measured, having actually looked this time: **98.8% of its 225,920 triangles sit
at grid height**, inside the tiles' own footprint, and its flat surface fills
**11%** of that footprint. A ceiling slab fills its footprint; a frame is mostly
hole. The manifest had been reporting "1 mesh of surrounding ceiling" the whole
time, and an earlier note in this file said the model had no cross-tees. It has
them. I had measured the footprint and inferred the rest.

**Fix** Two changes, because there were two things wrong:

* `flatCoverage()` — a mesh is context only if it spans the model AND fills it.
  The frame comes through as grid, so the model now yields **10 grid pieces**
  rather than nine.
* `clipAbove()` — the frame also carries about 1.2% of its triangles up to
  2.9 m, which is a soffit and would stand up through the room. It is cut at the
  grid plane, a height taken from the rails that are unambiguously rails rather
  than from a constant.

**Guard** `ten grid pieces, including the frame`, `and nothing is mistaken for
surrounding ceiling`, `the frame is the heavy one, and it is kept`.

**Cost** The block is now 400,793 triangles, all of the file, against 174,873
before — the frame alone is 393,000 of them at 39,578 per grid piece against 180
for a tile. It was always in the file; we were discarding most of it. A T-bar is
an extruded profile and a few hundred triangles would draw one, so this is worth
a re-export before more than a couple of blocks go on a ceiling.

### Ceiling tiles had no suspension height, and baffles opened too low

**Symptom** Asked for: a configurable suspension height on ceiling tiles, and a
smaller default.

**Cause** Tiles had no drop at all — a block sat with its top flush on the slab,
so there was nothing to reduce. The only default that existed was the baffle's,
at 450 mm.

**Fix** Tiles take a `drop` defaulting to 150 mm over a 0-1200 mm range, and the
baffle default drops from 450 to 300 mm. New sets only; anything already placed
keeps the height it was given.

Measured to the TILE FACE, not to the top of the assembly. Those differ by 57 mm
on this file — the grid rises further above the tiles than the tiles are thick —
and a suspended ceiling is quoted slab-to-face, so a setting of 150 that produced
a 207 mm void would be a number nobody could check. The offset is measured off
the loaded model rather than written down, and doubles as the floor of the range:
at 57 mm the grid is flush with the slab and cannot rise further, the same
bargain the baffle field makes with its clamps.

**Guard** `a block opens 150 mm below the slab`, `it can be taken all the way to
the soffit`, `and is clamped rather than refused above the range`, `a file from
before the control existed opens at the default, not at zero`, `and a baffle now
opens at 300 mm rather than 450`. Confirmed in the browser by driving the control
and measuring the rendered face against the slab: 200 asked, 200 drawn; 57 asked,
57 drawn.

### The grid plane was measured with a maximum where it needed a median

**Symptom** Introduced and caught in the same session. After the frame mesh
started being kept, a block loaded **2.94 m tall** instead of 65 mm, and its
invisible pick target became a room-height slab.

**Cause** `clipAbove` cuts the frame at the height the grid occupies, and that
height was taken as the MAXIMUM of the grid pieces' tops. The frame is itself one
of the grid pieces and reaches 2.9 m, so the cut line was placed above the very
soffit it existed to remove. Nothing was clipped, and nothing said so — the
render still looked right, because the extra geometry is thin and off to one side.

**Fix** `gridPlaneTop()` takes the MEDIAN. Nine of the ten pieces top out at
51 mm; the median says so and the maximum does not.

**Guard** `nine equal rails put the grid plane just above them`, `and one 2.9 m
outlier among them does not drag it up with it`, `nothing to measure clips
nothing, rather than clipping everything`.

### The suspension rods were being deleted, and I twice said they did not exist

**Symptom** Reported: the rods are not visible on ceiling tiles, and "I can see
them in a model viewer online".

**Cause** Mine, twice over.

The rods are real: four of them, 6.4 mm across, running the full **2,928 mm**
from the grid to the slab, modelled into the same mesh as the perimeter frame.
`clipAbove` removed every triangle with any vertex above the grid plane — which
is exactly a rod's side, one corner on the grid and one at the slab.

Worse was how I justified it. I profiled that mesh by VERTEX height, found
677,176 vertices between 0-150 mm, 584 between 2,850-3,000 mm and **nothing in
between**, and concluded there was nothing there. A plain cylinder has vertices
only at its two ends: the middle 2.8 m of every rod holds no vertex at all. The
scan was measuring the wrong thing and I read its silence as evidence. An earlier
cluster pass had already printed `y 21..2946` for each of four positions — the
right answer — and I talked myself out of it.

**Fix** `splitAtHeight` replaces `clipAbove` and returns BOTH halves: what lies
below the grid plane stays with the block, what reaches above it becomes the
rods. A triangle is assigned by whether it REACHES across, never by where its
vertices sit. The rods are then a group of their own, scaled in Y to the drop —
the file hangs them at 2,928 mm, the height that ceiling happened to be modelled
at, not the height anyone asked for. Measured after: rod tops land on the slab
to within 0 mm at any drop, and at a drop of zero they scale to nothing.

**Guard** `a triangle standing from the grid to the slab is a rod`, `and the one
lying on the grid stays with the grid`, `no vertex of that rod sits anywhere in
the middle of its span` — that last one asserts the property that made the wrong
method wrong, so the reasoning cannot come back either.

**Note for next time.** Twice now I have described this file wrongly from a
measurement that could not see what I was claiming about: first the cross-tees,
now the rods. Both times the measurement was of the wrong quantity, and both
times I reported the conclusion with more confidence than the method carried. A
scan that finds nothing is evidence only if it could have found something.

### Wood Classic now uses the generated tile

**What changed** `TILE_TYPES['wood-classic'].model` points at
`Tile 600x600.glb` instead of the supplied `Wood Classic.fbx`. The block is now
ONE tile rather than 18, because that is what the model is. The FBX is still in
the folder, unused.

**Why it tiles correctly** 595 mm spans 6 cells at the 100 mm pitch, so the
footprint reserves exactly 600 mm — the module. Two placed side by side therefore
sit exactly one module apart, which leaves a 5 mm joint between the tile faces
and overlaps the two 624 mm frames by 24 mm: the T-bar they genuinely share,
not a clash. Asserted, not assumed.

**What it fixes** The panel is drawn at 595 x 595 on a 595 x 595 tile — **0%
distortion**. Every supplied model so far has been 3% under or 6-8% over, because
none of their modules matched a panel the range is sold in. It also needs no
generated UVs (`uvGenerated: 0`), where the FBX needed 18.

**Known mismatch** The Size control still offers 1200 x 600 on a 600 x 600 tile,
which is not a thing that can be built. The on-screen note reports the resulting
distortion honestly, but the option should probably be filtered to the sizes the
chosen tile can actually take.

**Guard** `Wood Classic is one tile`, `of 595 x 595 mm, square`, `and it is the
generated glTF, not the supplied FBX`, `and 6 x 6 at the 100 mm pitch, which is
the 600 module exactly`, `two tiles side by side sit exactly one 600 mm module
apart`, `which leaves a 5 mm joint between the tile faces`, `and the two frames
overlap by exactly one T-bar`.

### A single 600 x 600 tile and its frame, built rather than supplied

**Why** Every tile model so far has come with something wrong in it — no UVs, no
tiles, a module matching no product, 99.94% support steel. A generated one is
exact by construction and costs 23 KB.

`scripts/build-tile-model.mjs` writes `Tile 600x600.glb`. The dimensions live in
one `SPEC` object at the top of that file and nowhere else; run it again to
change one.

    module      600 x 600 mm      centre to centre of the T-bars
    tile        595 x 595 x 15    lay-in, square edge
    grid face   24 mm wide        the line you see from the room
    grid depth  38 mm             flange + web + bulb

The detail the whole thing rests on: **600 = 576 of tile seen + 24 of grid**. The
flange is the LOWEST element, so it hides the last 9.5 mm of tile on each side —
and the tile at 595 is wider than the 576 opening it sits in, which is what stops
it dropping through.

**Two things had to change to accept it**

* `tileEntry` and `loadTileModel` read only FBX. Both now read glTF as well,
  because a tile model can be either.
* **The classifier dropped the tile as surrounding ceiling.** A single tile IS
  most of its own model's footprint and it does fill it, so the coverage test
  called the product its own surroundings and left a model with no tiles in it.
  Context only means anything as something a ceiling is surrounded BY: nothing
  that leaves zero tiles was context, so it is put back and sorted again.

**Guard** `one tile`, `and four bars of frame around it`, `the tile is 595 x 595
mm`, `600 = 576 of tile seen + 24 of grid`, `and the tile is wider than that
opening, so it cannot drop through`, `the frame is the lowest thing in the
assembly`, `a model of nothing but a tile still yields a tile`.

### Wood Classic: a second export arrived with real tiles, and is wired up

**What changed in the file** The re-export splits the single slab into **18
separate tiles**, 3 across by 6 down, each 1157.3 x 40 x 578.0 mm — aspect
2.002:1, on an exactly **1200 mm x-module**. Each tile presents 0.668 m2 to the
room out of a 0.669 m2 footprint, so unlike the Univic Strip file its faces
point the right way and need no DoubleSide rescue.

**What still had to be worked around**

* **No UVs, on any mesh.** A planar set is generated per tile on load — u on x,
  v on z, matching what the Univic Strip file already does (measured: planar,
  R2 = 1.0000). A flat rectangle has one sensible mapping, so nothing is guessed,
  and the file on disk is untouched. 18 of 18 tiles needed it.
* **The classifier required UVs to call something a panel**, which is why this
  file read as zero tiles. The requirement is dropped: a panel is flat and thin,
  and its mapping is generated if missing. Checked against the Univic Strip file,
  where it changes nothing — its rails and frame both fail the flatness test.
* **The frame is 3,544,402 of the file's 3,546,490 triangles** and now hangs 30 mm
  BELOW the tile plane rather than above it, so it is genuinely visible. Kept, as
  asked. It also sets the minimum suspension height: 304 mm, because that is how
  far the frame sits above the tile face.

**The two ranges are now separate** — `TILE_TYPES` carries a model, a block and a
tile size per range, each measured off its own file, and the model cache is keyed
by type. Wood Classic is 3 x 6 of 1157 x 578; Univic Strip keeps its 4 x 3 of
1265 x 1289. Verified loading both at once: different objects, different caches.

**Worth noting** Wood Classic draws a 1195 x 595 panel at 1157 x 578 — **3%
undersize**, against the Univic Strip model's 6-8% over. It is the first tile
model whose module matches a panel the range is actually sold in.

**Guard** `Wood Classic is 3 tiles by 6`, `on a true 1200 mm module`, `and its
tile is 2:1, which is a 1200 x 600 panel`, `Univic Strip keeps its own 4 x 3
block`, `the two ranges are on different files`, `switching type brings the block
of that type with it`.

### The FIRST Wood Classic export had no tiles in it — superseded

**Symptom** A 90 MB `Wood Classic.fbx` was added to `public/models/ceiling_tiles`
to be shown when Wood Classic is selected. Surveying it first was the right
call: it cannot be used as it stands.

**What is actually in it**, measured rather than assumed:

| mesh | triangles | size | down-facing |
|---|---|---|---|
| `Object001` | 2,088 | 3557 x 40 x 3557 mm | 95% of its footprint |
| `Bottom_mounted_panel_Unistrut_…` | 3,544,402 | 3747 x 373 x 3747 mm | 26% |

* **99.94% of the file is Unistrut support framework** sitting ABOVE the ceiling
  plane, where the room cannot see it. The visible ceiling is the other 2,088
  triangles — lighter than a baffle set.
* **Neither mesh has UVs.** A mapped material samples one texel without them, so
  every finish would render as a single flat colour, exactly as the tapered
  baffle did before a planar set was generated for it.
* **It is one slab, not a grid of tiles.** No tile picker, no per-tile finishes,
  no tile count — the features the other tile model supports have nothing to
  act on.
* The classifier reads it BACKWARDS: the flat panel fills its own footprint, so
  the coverage test files it as surrounding ceiling and drops it, while the
  framework is kept as grid. Wiring it up unchanged would show the steelwork and
  hide the ceiling.

**Decision** Parked until a tiled export arrives. Nothing in the app loads it —
`MODEL_FILE` still names the Univic Strip file and nothing at runtime reads the
manifest's `tiles` array, so the file is inert. When it is wired, both meshes are
to be drawn (framework included) — that was asked for explicitly, and it costs
about nine times the Univic Strip block.

**Fix applied** Only to the reporting. A tile model the classifier finds no tiles
in now says so plainly and stops, instead of printing "it carries 1 mesh of
surrounding ceiling ... dropped on load" — a confident sentence about a mesh
nothing had identified, and about a load that never happens. Third time in this
file that a measurement has been reported with more certainty than it earned;
this one at least fails loudly now.

### Clouds: eleven files surveyed, then wired in

**The range** Four shapes at 600 / 900 / 1200, triangle at 900 and 1200 only —
which is what the workbook lists too, so the folder and the catalogue agree
without either being told about the other. Shape comes from the FOLDER and size
from the filename, because ten files are `..._<Shape>_<size>mm.fbx` and the two
triangles are `... 3D Triangle_<size>mm.fbx`, with a space where the rest have an
underscore. Reading the folder sidesteps the inconsistency.

**Each file is one cloud in three parts** — panel, a thin backing plate, and
400-1013 mm of suspension. The panel is the lowest mesh and has real down-facing
area, so unlike the Univic Strip tiles it needs no DoubleSide rescue.

**Three faults, all corrected on load, none written back**

* **The hexagons are mapped for TILING** — u spans 82.7, about 83 repeats, where
  every finish here assumes one span across the face. Rescaled to 0..1.
* **Triangle 1200 has a mirrored mesh**, which bakes wound inside-out. Flipped.
* **The suspension is a different height in every file** — 435, 464, 476, 502,
  504, 706, 742, 756, 895, 951, 1013 mm. That is the height each happened to be
  modelled at, not one anybody chose, so the wire is separated onto its own group
  and scaled to a drop you set, exactly as the ceiling tile rods are.

**The panels do not measure their names, and not by rounding.** Measured on the
largest plan dimension, the eleven run from **6% under** to **13% over** their
nominal size: a "600" square is 583, a "600" circle is 572, and a "600" hexagon
is 677 across its corners. `cloudExtent` therefore reads the model and never the
number in the filename. Thickness varies too — 11.6 to 43.2 mm against the 40 mm
the workbook lists for all of them.

**The finish** A `cloud-solid` family of four flat colours, red / blue / green /
yellow. Authored placeholders for testing, not transcribed from the workbook, and
noted as such in catalog.js — the real values are four hexes away. A flat colour
goes straight onto the material, so clouds need none of the panel-fetching
machinery the baffles and tiles do.

**Guard** `the cloud models are in the manifest`, `and triangle in 900 and 1200
only, as the workbook says`, `a "600" square panel actually measures 583 mm`,
`the panels run from about 6% under their nominal size to 13% over`, `a size the
shape is not made in is dropped`, `changing shape clears a size the new shape has
not got`, `a cloud occupies its MEASURED panel, not its nominal size`.

**Two assertions of mine were wrong before they were right.** I first claimed
"every panel comes in under its nominal size" — triangle-900 is 901 mm, over.
Then "no panel actually measures its nominal size" — triangle-900 is within a
millimetre of 900. Both were characterisations reaching past what I had measured.
The assertion that stands states the range and nothing more.

### Every hexagon cloud hung on a bright green wire

**Symptom** "in hexagon model - the full thing is green". Choosing Red gave a
red hexagon on a green wire; the panel obeyed the colour picker and the
suspension did not.

**Cause** Two separate facts about the supplied FBX, and only together do they
bite. The hexagons ship on `Color_F04` **#99ff32** — a bright green — and in
those files the suspension meshes reference *the same material object* as the
panel. `CloudSet` gives the panel a fresh material so two clouds can be two
colours, and left everything else on what the file shipped. On three of the four
shapes that was harmless grey; on the hexagon it was the green.

Measured across the four shapes before touching anything:

```
Circle     panel __DEFAULT #cccccc              wire Material #2 #808080        separate
Hexagone   panel Color_F04 #99ff32 | _auto_2    wire THE SAME OBJECTS           SHARED
Square     panel Material #24 #808080           wire Material #24 #808080       SHARED
Triangle   panel __DEFAULT #cccccc              wire Fbx Default Material #b8b8b8  separate
```

So the wire had no finish of its own in *any* file — two shapes shared the
panel's, and the other two happened to differ only by accident of authoring. It
had four different appearances because it had never been specified.

**Fix** A wire is one part in one finish, so it is given one:
`CLOUD_WIRE_FINISH` in catalog.js, and a single shared `WIRE_MAT` in clouds.js
that every suspension mesh is built with. #808080 because that is what two of the
four already used; the other two are brought to match. The files are not touched
— the substitution happens on load, as the UV rescale and the winding flip do.

Declared in catalog.js rather than written into the loader for the same reason
`CLAMP_FINISH` is: offering the wire in white or black later should be an edit to
one object, not a hunt through a loader.

**Guard** `the wire finish is declared, not taken from the files`, `and it is the
grey two of the four files already use`, `which is emphatically not the hexagon
green`.

**Checked in the browser**, all eleven models placed at once in the four
colours: eleven panels reading #c0392b / #2266aa / #3f8f4f / #e2b53c, eleven
wires reading `CloudWire #808080`, seven backing plates on their own file greys
(#808080, #b8b8b8), and **not one mesh of 676 in the scene carrying #99ff32 or
#7fff7f**. The hexagon's green now exists only in the file.

### The re-exported hexagon brought the green back, on a new mesh

**Symptom** "i have updated the triangles and hexagones models - the hexagoal
model has green color by default". The wire fix held; the green reappeared on the
panel's back face.

**Cause** The new hexagons are split differently. Measured against the previous
export:

```
hexagon-600/900/1200   meshes 2 -> 3   parts panel 1, plate 0 -> plate 1
triangle-900/1200      meshes 3 -> 4   parts plate 1 -> plate 2
```

The hexagon's back face is now its own mesh. The loader painted the panel and
the wire and left "whatever else there is" on the file's material — and the
hexagon files carry exactly one material for everything, `Color_F04` **#99ff32**.
So the new mesh arrived green. Nothing about the fix was wrong; the file changed
shape underneath an assumption about how many meshes a cloud has.

**The plate bucket was holding two unrelated things.** Measuring where each one
sits, against the panel's own footprint:

```
hexagon 600  Object004   overhang  0.0 mm/side   directly on the panel   <- back FACE
triangle 900 Plane138    overhang  3.1 mm/side   on the panel            <- back FACE
circle  600  Cylinder002 overhang149.3 mm/side   above the panel         <- backing disc
square  600  Mesh003     overhang 77.6 mm/side   above the panel         <- backing disc
triangle 900 Fixture_003 1100 mm wide vs 9008    top of the cable        <- ceiling fixture
```

A back face belongs to the panel and must take its colour. A disc and a fixture
are hardware and must take the steel. One bucket could not do both.

**Fix** `classifyCloudMeshes` now splits them by measurement: a flat mesh on the
panel's own plan footprint is a **cap** and is coloured with the panel; anything
else is **hardware** and is finished with the wire. `CAP_TOLERANCE` is 1%, and
the data is nowhere near it — caps sit at 0.00-0.09%, the nearest bracket at
2.7%, an order of magnitude of clearance either side.

Nothing is left on a file's own material now. `CLOUD_WIRE_FINISH` became
`CLOUD_HARDWARE_FINISH` because it no longer describes only the wire, and on
circle and square the file already puts the wire and the disc on the same
material object — so treating them as one finish is what those files say.

**A second bug the same measurement fixed.** The manifest measured thickness
from the panel mesh alone, so splitting the back face out made every hexagon
report itself thinner: 40.3 -> 36.2 mm on the 1200, 22.6 -> 20.3 on the 600, and
43.2 -> 37.2 on the triangle 900. The panel had not changed. Thickness is now
measured over panel AND cap, and all eleven report exactly what they did before
the re-export.

**Guard** `a hexagon panel has a cap: its back face, on its own footprint`, `and
no hardware at all, so nothing of it is left on the file green`, `a circle has
the opposite: no cap, one overhanging backing disc`, `and a triangle has both,
plus the fixture at the top of its cable`, `the cap tolerance sits between the
two, not near either`, `a panel reports the thickness of its face AND its cap`.

Proved by breaking it in both directions: at 5% the tolerance guard fires before
anything is misclassified, and at 0.02% the triangle's cap is demoted to hardware
and the structural guard catches it.

**Checked in the browser** with all eleven placed in the four colours: 11 panels
and 5 caps painted, each cap the same hex as the panel it belongs to; 8 hardware
meshes and 11 wires on `CloudHardware #808080`; **0 of 35 cloud meshes carrying
#99ff32 or #7fff7f**.

**The lesson, again, is that mesh counts are not a contract.** Two exports of the
same eleven products disagreed about how many meshes a cloud has, and the first
version of this code read the difference as meaning. What survives a re-export is
geometry — where a thing sits and how big it is — so that is what the classifier
reads now.

### Clouds turn 45 degrees; tiles and baffles still turn 90

**Asked for** "make it 45", of the rotation step.

**Why it is not one number for everything.** Rotate was a flat
`(rot + 90) % 360` in the store, shared by all three products, and 45 is only
buildable for one of them:

* a **ceiling tile** block is a lay-in module sitting in a suspended grid. It
  has four orientations and no others.
* a **baffle run** spreads along an axis, and `runLimits` measures the room
  across that axis to decide how many fit. At 45 degrees that is the diagonal,
  which nothing here asks for yet — the run would offer counts the ceiling
  cannot hold.
* a **cloud** hangs off one wire and touches nothing. Any angle is buildable.

So the step became a property of the product, `PRODUCT_TYPES.rotStep`, rather
than a constant in `rotate()`. Clouds 45, everything else 90.

**The footprint was the real work.** `footprint()` expressed rotation as "is it
90 or 270, if so swap ci and cj" — which has no answer at 45. It is now the
axis-aligned box around the turned extent, which is one piece of arithmetic for
every angle:

```
ci' = ci |cos t| + cj |sin t|
cj' = ci |sin t| + cj |cos t|
```

At 0 that is (ci, cj) and at 90 it is (cj, ci), so it reduces EXACTLY to the
swap it replaced and the other two products are untouched. Guarded, because the
reduction is the whole argument: `and the footprint at 90 is still exactly the
swap, not a cell wider`.

**The epsilon in `span()` is not decoration.** `Math.cos(Math.PI / 2)` is
6.1e-17, not 0, so a bare `ceil(ci * 6.1e-17 + cj)` hands every quarter-turned
set one extra cell — a silent off-by-one on every baffle run in the app.

**What it costs.** At 45 degrees this reserves the box around the box, so a
ROUND cloud turned on the diagonal claims about 41% more grid than it needs.
Conservative rather than wrong — it is the same rectangle model the grid uses
everywhere — and a circle is the one shape nobody turns.

**A bug found in the blast radius.** `neighbourGaps` is documented "baffle to
baffle" but tested `type === 'tiles'` and skipped those. That was right until
clouds existed, and then it sent them to `baffleExtent`, which reads baffle
fields a cloud's params do not have. Now stated positively as
`type !== 'baffles'`. A whitelist is wrong about a new product loudly; a
blacklist is wrong quietly.

**Guard** `a cloud turns 45 degrees a press, where the other products turn 90`,
`an unknown type falls back to a quarter turn rather than to zero`, `so one
press puts it on the diagonal`, `and it reserves the box around the turned
panel, not the untouched one`, `which is the diagonal of the square, to a cell`,
`it turns about its centre, within a cell, at 45 as at 90`, `eight presses bring
it back to square on`, `a cloud saved on the diagonal is not straightened on
reload`, `a baffle run still turns a quarter at a time`, `a selected cloud is
offered no baffle dimensions`.

**Checked in the browser**, two squares and two hexagons with one of each pair
turned: in plan the turned ones sit on the diagonal, the untouched ones stay
square to the grid, and a placed hexagon reports rot 45 after one press.

### Four supplied grid models: two sizes x two tee widths

**Given** `Grid_600x600mm _15mm`, `..._24mm`, `Grid_600x1200mm _15mm`, `..._24mm`
and a `Grid Support` to leave alone for now.

**What they are.** Identical structure in all four: five meshes, one `Main Panel`
box inside four `Frame` T-bars, authored at 3.19 m — a ceiling height — in
millimetres. The rail profile is a real tee: a flange at the bottom, a web, a
bulb. The existing classifier reads them correctly with nothing added, through
the single-tile guard written when the generated model went in.

**Measured, and the names are about the PANEL, not the module:**

```
file                       tile          module        flange
600x600  _15mm         600 x  603     617 x  619       15.9
600x600  _24mm         606 x  609     632 x  636       26.6
600x1200 _15mm         600 x 1201    617 x 1216        15.9
600x1200 _24mm         606 x 1199    632 x 1225        26.6
Tile 600x600.glb       595 x  595     600 x  600       24.0   (generated)
```

The generated model measuring its own SPEC exactly — 600 module, 24 mm flange —
is what checked `tileModule` and `railFlange` when they were written.

**The rails sit OUTSIDE the tile rather than under its edges.** Panel plus one
flange is the module, to within a quarter of a millimetre, in all four files. A
real lay-in tile is smaller than its module and rests ON the flanges; these are
600 mm of tile with the grid added around it, so a "600 x 600" tile is on a
617 or 632 mm module depending on the tee.

**This is the one thing that does not work out, and it is visible.** The grid
pitch is 100 mm, so a 632 mm module reserves seven cells — 700 mm — and two
blocks side by side sit 700 mm apart with a **68 mm joint** between them that
the product does not have. Every combination does it:

```
600x600  @15   module  617 -> 700    83 mm joint
600x600  @24   module  632 -> 700    68 mm
1200x600 @15   module 1216 -> 1300   84 mm
1200x600 @24   module 1225 -> 1300   75 mm
```

Not papered over. Rounding down instead would overlap every tile by 30-odd mm
and accumulate 5% of error across a ceiling; insetting the rails half a flange
on load would be inventing product geometry, which is the thing this file exists
to stop. The two real fixes are a model on a true module — tile 584 at 15 mm,
573 at 24 — or a pitch that divides 632. Both are the user's call, so the
measurement is pinned in a guard instead: `which leaves a joint of about 68 mm
the product does not have`.

**The 1200 files are turned a quarter on load.** They run their long axis down
Z; the size is labelled "1200 x 600" and its textures are 2:1 LANDSCAPE, 14291 x
7205, with u on the long edge. Left as they came the grain would land across the
tile and be stretched 2:1 doing it. Turned BEFORE anything is measured, so the
module and the tile ordering come out in the orientation the block is drawn in.
The threshold is a ratio, not `z > x`: the "square" file measures 617 x 619 and
a bare comparison would turn it too.

**Grid is a fifth decision, and only where there is a choice.** Type > Size >
Grid > Base colour > Perforation. Requiring it unconditionally made **Univic
Strip unplaceable** — that range is one file with its frame already in it, so it
was being asked a question with no answers. `tileMissingFields` now asks only of
a range that resolves its model from the manifest.

**Guard** `the four supplied grid models are in the manifest`, `both sizes come
in both widths`, `a "600 x 600" file is a 600 mm PANEL, not a 600 mm module`,
`its module is a flange bigger, because the rails sit outside the tile`, `so a
wider tee makes a wider module for the same named size`, `the 1200 models are
turned so their long axis lands on x`, `while the square ones are left alone,
though they are 2 mm out of square`, `a width no file is made in resolves to
nothing, rather than to a wrong one`, `a range with one model is never asked
which grid it is in`, `so Univic Strip still places with no grid named`.

**Checked in the browser**, one of each of the four placed at once: four
distinct blocks, flanges measuring 15.9 and 26.6 mm in the live scene, both
1200s lying long-axis-along-x with the grain running along them, every face
carrying its texture, and Univic Strip still placing on its own 51 x 39 cells.

`Grid Support.fbx` is scanned and reported as containing no tiles, which is
correct — it is a hanger, not a tile — and it is not offered anywhere.

### The 83 mm joint, and the tile field that closes it

**Symptom** Two tiles placed side by side leave a visible gap, "and it doesnt
close that gap no matter what."

**Measured** module 617 mm; `ceil(617 / 100)` = 7 cells; 7 cells at the 100 mm
pitch = 700 mm; **83 mm of joint**. Dragging cannot help — the next cell is
100 mm away, so two blocks can only ever be 700 mm or 600 mm apart, and 600
would overlap them.

**The models are not at fault, and I said so too weakly the first time.** Laid
one module apart they tile exactly: copy B's left rail lands within **0.000 mm**
of copy A's right rail — one shared tee — with zero drift over ten in a row, and
the gap between tile faces across the seam is one flange, which is the joint a
real ceiling shows. What cannot express 617 mm is the placement grid.

**Fix: a block is now a FIELD of N x M tiles.** The single-tile model is
repeated at the measured module, so inside a field the spacing is the module
itself and the 100 mm grid only decides where the field starts. Verified in the
browser on a 4 x 3: centres at **616.56 mm** exactly, face-to-face **16.09 mm**,
against 700 and 83 before.

Three things fell out of doing it properly:

* **Each grid line is drawn once.** Repeating a tile draws the rail on every
  seam twice, in exactly the same place — double the cost and a z-fight along
  every joint. Rails are tagged in the loader with the edge they sit on, and a
  copy keeps its near rails only on the field's own edge. A 4 x 3 draws **31**
  rail meshes instead of 48; the saving grows with the field.
* **A file that is already a block is not repeated.** Univic Strip holds 12
  tiles, and repeating it would repeat a ceiling. Decided on the measured face
  count in the file, not on the range's name.
* **Changing range drops the tile count.** Univic Strip's 4 x 3 is what its FILE
  holds, not a choice; carried into Wood Classic it arrived as a field nobody
  asked for. `setBrush` clears it on a range change, the same bargain a cloud's
  shape makes with its size — and this is how it was found, because a test that
  had switched ranges started placing 26 x 20 cells.

**What this does not fix** Two SEPARATE fields side by side still meet at the
rounding, because their origins are still cells. Cover an area with one field.
The note under the control says so when the field is 1 x 1.

**Guard** `a field takes the tile count it was asked for`, `and is exactly that
many MODULES across, which is what leaves no joint`, `four tiles in one field
span less than four blocks placed separately`, `the field size is clamped rather
than refused`, `a range whose file is already a block keeps its own tile count`,
`switching range does not inherit the other range tile count`.

### A cell became a millimetre, and the tiles touch

**Asked for** "how about u make the grid 1mm step". Right instinct, and a
coarser one would not have avoided any of the work: the joint is
`ceil(module / pitch) * pitch - module`, and at 5 mm it is still 3.4 mm while
costing the same three subsystems.

```
pitch    600x600 @24mm module 631.63    joint
100 mm   ceil 7 cells  ->  700.00        68.37 mm
  5 mm   ceil 127      ->  635.00         3.37 mm
  1 mm   ceil 632      ->  632.00         0.37 mm
```

**One number was doing four jobs**, and only the first of them wanted to be a
millimetre. Separating them is what made it usable:

* `DEFAULT_PITCH` — 1 mm. What a position can BE.
* `SNAP_M` — 100 mm. What a dragged set lands on. At a millimetre there is no
  snapping at all, and a run of baffles nobody can line up is worse than one
  that steps 100 mm. Tiles override it with their own module, which is the
  whole point: `snapStepOf`.
* `MASK_M` — 100 mm. The obstruction brush. A 1 mm square of "there is a light
  here" is not a statement anyone can paint.
* `DRAW_M` — 100 mm. The lines drawn. 7,500 of them is a grey wash.

**Three things would have made a millimetre grid unusable, all found by
measuring rather than by reasoning:**

* **`canPlace` enumerated the footprint's cells.** A tile block is 632 x 636
  cells now, so every frame of a drag built 401,952 strings. Replaced with
  `maskBlocks`, which costs one comparison PER OBSTRUCTION — better at any
  pitch, and the reason a drag is still smooth.
* **A test masked the whole ceiling cell by cell.** 7500 x 7000 is 52.5 million
  calls into an O(n) `includes`. The suite stopped finishing; that is how this
  was found. In mask cells the same ceiling is 75 x 70.
* **`setCeiling` bounded obstructions against `g.cols`.** Mask cell 179 is
  trivially inside 18,000, so nothing off a shrunken zone was ever dropped
  again. Bounded against `maskDims` now.

**Saved layouts** needed a second number. The mask is no longer pitch-relative,
so `toJSON` records `maskPitch` beside `pitch`, and `fromJSON` rescales the mask
onto MASK_M from whichever it came in on. Without it a file written today, read
back, has every masked cell divided by a hundred and piled in the corner. A file
from before this has no `maskPitch`, which is exactly what marks its mask as
placement cells at the pitch it did record.

**Result, measured in the browser on two SEPARATELY placed tiles:**

```
                  before        after
centre spacing    700.00 mm     632.00 mm   = the module, exactly
face to face       94.20 mm      26.20 mm   = one tee
joint              68.37 mm       0.00 mm
```

**The suite needed a unit migration.** Cell coordinates are the app's
coordinate system and 39 placements were written when a cell was 100 mm. They
say what they always said, through an `at(i, j)` helper — with two that had to
be unpicked by hand, where a value ALREADY in cells was being scaled a second
time and thrown off the ceiling.

**Guard** `a cell is a millimetre`, `and what a dragged set lands on is still
100 mm`, `the mask and the drawn lines stay coarse too`, `a 616.56 mm tile
module lands within half a millimetre of true`, `where at 100 mm it was forced
16 mm out, which is the joint that showed`, `a block reserves its MEASURED
module, to the millimetre`, `two tiles side by side sit ONE MODULE apart, not
one cell-count apart`, `which leaves no joint at all`, `and both sit on a whole
number of modules from each other`, `centres on the clicked cell, snapped to the
100 mm step`, `and lands ON that step, not between two of them`.

### A Temp range, on a module that is actually 600

**Asked for** a temp category using the generated `Tile 600x600.glb`.

**What it is** The model built by `scripts/build-tile-model.mjs`: 300 triangles,
a **true 600 x 600 module**, a 24 mm flange, and 595 mm of tile INSIDE it — a
lay-in tile sitting on its tees, which is what the supplied Grid_* files do not
do. Beside them it is the reference case:

```
                     tile          module      relation
Temp 600x600      595 x 595      600 x 600     tile INSIDE the module
Grid_600x600 _24  606 x 609      632 x 636     tile plus a flange IS the module
```

**Measured, not declared.** `applyTileModels` now records what EVERY tile file
measures, not only the four the (size, grid) picker offers, and a range that
names one file reads its module from there. The declaration in TILE_TYPES is
only the fallback for before the manifest has loaded. A "600 module" that is
really 616 is exactly what this project keeps finding, so nothing gets to state
its own dimensions.

**Three things it is deliberately not offered:**

* **A grid width.** It is one file with one flange, so the control would be
  inert — and an inert control looks broken. `asksGrid` is now "does this range
  resolve its model BY (size, grid)", which also removes the same dead control
  from Univic Strip, where it had been showing since the widths went in.
* **1200 x 600.** The model is square and those textures are 2:1 LANDSCAPE, so
  the size would stretch a wide photograph over a square tile. Types may now
  narrow the size list — `sizesForType` — and one that says nothing still gets
  all of them, so adding a range needs no entry.
* **Anything else.** It takes the same Wood Classic finishes and the same field
  control as everything else.

**What it demonstrates** Two separately placed Temp blocks sit **600.00 mm**
apart, and a 4 x 3 field is **2.400 x 1.800 m** — round numbers, because the
module is round. The same thing in the supplied range is 632 and 2.528.

**Guard** `there is a Temp range and it names the generated model`, `its
geometry is MEASURED off the file, not declared here`, `and unlike the supplied
files its module is a true 600`, `with the tile INSIDE it, the way a lay-in tile
sits on its tees`, `which is what the supplied files do NOT do`, `a Temp block
is placeable without naming a grid`, `and it is offered the 600 x 600 size only,
because the model is square`, `so a 1200 x 600 asked of it is dropped rather
than stretched`, `while Wood Classic is still made in both`, `a 4 x 3 Temp field
is exactly 2.4 x 1.8 m, because the module is round`.

### The finish was on the back of the tiles too

**Symptom** The veneer AND the perforation painted over the top of every tile,
plainly visible the moment anyone looked down at a ceiling in plan.

**Two causes, and the obvious one was not it.** Measured across the three ranges:

```
range           tris   down m2   up m2   shape
Temp             12     0.354    0.354   a solid board, correct winding
Wood Classic     12     0.369    0.369   a solid board, correct winding
Univic Strip    180     0.000    1.350   a panel wound INSIDE OUT
```

* **The boards** carry ONE material over all six faces, so the finish landed on
  the top and the edges as well. Turning off `DoubleSide` would not have fixed
  this: a box's top genuinely faces up and draws either way.
* **Univic Strip** has no down-facing area at all. That is the only reason
  `DoubleSide` was ever set — without it that range is invisible from the room —
  and the flag is what put the veneer on the other two.

**Fix: group the triangles, do not split the mesh.** A `BufferGeometry` carries
`groups`, and a mesh with a material ARRAY draws each with its own. The loader
reorders each panel's index so every room-facing triangle comes first, then adds
the groups; `useTileBlock` hands the mesh `[finish, board, board-reversed]`.
Room-facing is measured per triangle from its own winding — the same test that
diagnosed it — and the reordering is paid once per MODEL, because geometry is
shared by every placed block.

Univic Strip is **flipped** now rather than rescued: zero down-facing area is the
measurable signature of an inside-out mesh, so the loader flips the winding, and
`DoubleSide` is gone from both materials.

**The third group is the part I got wrong first.** I decided "is this a flat
plane" by asking whether any triangles were left over — and Univic Strip has
0.14 m2 of edges, so it was treated as a board and left a hole you could see the
void through from above. The question is not "is there anything left over" but
"is there a TOP": `noTop` is now `up area < 1e-6`, and a panel without one gets
its board drawn on the reverse of the very triangles the finish is on.

I also had the board on `BackSide` for everything at first, which culls a real
box's top — same class of mistake, one shape's rule applied to another.

**The edges take the board deliberately.** The sliver visible in a tee reveal on
a real ceiling is the raw board edge, not the veneer.

**Guard** `a tile panel is a solid board, with a real top as well as a face`,
`so the finish goes on the down-facing triangles only`, `and the panel is
grouped, so one mesh wears two materials`, `the group holding the finish is the
LOWER one`, `the Univic Strip panel arrives with NO down-facing area at all`,
`which is the measurable signature of a mesh wound inside out`, `and after the
flip it faces the room, so it needs no DoubleSide`, `a panel with no top of its
own gets the board on its own reverse`, `while a board, which has one, does not`,
`the board is declared, not a literal in the loader`.

**Not fixed, and not mine** Univic Strip still reads near-black from above: its
own frame mesh is `#0b0b0b` and spans the whole 5.17 x 3.93 m block at the very
top, over the tiles. That is the supplied mock-up, and the range is parked
pending images anyway.

### The perforation was a corner of the panel photo, stretched over the tile

**Symptom** "the perforations are not on the mark" — the pattern sat up and to
the left with a blank band along the bottom and the right.

**I answered the wrong question first.** I read "not on the mark" as "rendering
badly", went and surveyed the source images, and came back with moire, the
200:1 scale range across the twelve patterns, and the prepress marks. All true,
none of it what was asked. The user had to say "u didnt understand me" before I
stated my reading back and got the actual complaint: it is not CENTRED.

**Cause** The supplied Grid_* panels carry a BOX UNWRAP. Measured on the
room-facing triangles:

```
model                       room face samples
Grid_600x600mm _24mm        u 0.000..0.251   v 0.511..1.000
Grid_600x600mm _15mm        u 0.000..0.251   v 0.511..1.000
Tile 600x600.glb            u 0.000..1.000   v 0.000..1.000   (generated)
```

A quarter of the width and half the height — a CORNER of the panel photo,
stretched over the whole tile. `planarTileUV` existed for exactly this but bails
on `if (geometry.attributes.uv) return false`, and these files do ship UVs. They
just ship the wrong ones.

**Fix** The tile face is now given a planar mapping ALWAYS, replacing whatever
the file shipped. A tile finish is a photograph OF THAT PANEL, so laying it on
the panel is planar by definition; there is no unwrap a file could ship that
would be better. Nothing is lost by overwriting, because the only other group is
the board and it carries no map. The generated model already spanned 0..1, so it
is unchanged — which is why it never showed this and the supplied ones did.

**And a second thing that had to go with it.** The perforation files are
PREPRESS SHEETS, not textures: registration crop marks at the four corners and a
printed caption below the panel ("PF-NC-08_595x595"). With the mapping fixed to
0..1 those would land on the ceiling. Measured at the pixel on all twelve, the
marks end at 87 px of 7205, so the sheet is cropped to its middle
1.207%..98.793% before compositing. The WOOD files need none of this — they are
edge-to-edge veneer with no marks, which is why only the perforation is cropped.

**Left alone, and said out loud rather than fixed** The three finest patterns
(PF-NC-07, 08, 12 — holes of 0.25-0.50 mm at 2.8-9.2 mm pitch) darken the wood
by 0.2-1.6%. At 1024 px a hole is under one pixel, so they cannot be resolved
and read as a faint tone. That is physically right — a 0.33 mm hole on a tile
seen from four metres does not read — but it means the picker cannot show a
difference between them. Whether to exaggerate them for the swatch chips is a
product decision, not a bug.

**Guard** `the supplied panel ships a box unwrap, not a panel mapping`, `which
is a CORNER of it, so the finish arrived off-centre`, `remapped planar, the face
spans the whole texture`, `and starts at its corner, so the panel lands square
on the panel`, `the generated model already mapped its face across the whole
texture`, `a perforation sheet is cropped to the panel inside it`.

### 600 and 1200 could not be mixed, so the tiles were re-cut

**Symptom** "if im using only 600x600 tiles its alr, but when i use 600x1200 -
its behaving like this" — a gap between the two sizes that no dragging closed.

**Cause, measured** The two supplied files are not on the same module:

```
24 mm tee    600x600   module  632 x 636
             1200x600  module 1225 x 632
             two 600s = 1264, the 1200 is 1225   ->  39 mm short
             short sides 636 vs 632               ->   4 mm out

15 mm tee    two 600s = 1234, the 1200 is 1216   ->  18 mm short
             short sides 619 vs 617               ->   2 mm out
```

In a real ceiling a 1200 tile IS two 600 modules. In these files it is not. And
on top of that each size was snapping to its OWN module, so a 600 landed on
multiples of 632 and a 1200 on multiples of 1225 — two lattices that essentially
never coincide, which is why the gap looked arbitrary rather than a steady
39 mm.

**Fix: re-cut the geometry rather than work around it.** `scripts/fix-tile-
models.mjs` reads each supplied file, KEEPS its own tee profile and panel — the
geometry is the product and is worth keeping — and rebuilds the setting-out:

```
                        module                 panel              flange
600x600  15mm    616.6 x 619.3  -> 600 x 600   600.5 -> 595.0   15.9 -> 15.0
600x600  24mm    631.6 x 635.7  -> 600 x 600   605.8 -> 595.0   26.6 -> 24.0
1200x600 15mm   1216.3 x 616.6  -> 1200 x 600 1200.7 -> 1195.0  15.9 -> 15.0
1200x600 24mm   1225.5 x 631.6  -> 1200 x 600 1198.6 -> 1195.0  26.6 -> 24.0
```

Also done in the same pass, so the loader no longer has to: the long axis put on
X (the files run it down Z), and a planar UV laid on the panel in place of the
box unwrap.

**The originals are not touched.** Output is a .glb in `ceiling_tiles/corrected/`
and the app prefers it where one exists; delete the folder and the supplied
files come straight back. `npm run fix-tiles` regenerates.

**Why re-cut and not stretch on load.** The alternative was scaling the 1200 by
3.2% so it fitted two 600 slots, which would have drawn a 1237 mm tile while the
schedule quoted 1200 — and what is on screen agreeing with what is on the order
is the rule this app is built on. Re-cutting moves the panel to its NOMINAL 595 /
1195, which is what the filenames claim and what a lay-in tile measures, so the
drawing and the order say the same thing.

**Two things I got wrong building it**, both the same mistake in different
clothes — placing parts in one frame while measuring them in another:

* Rail sides were taken as `Math.sign(centre.x)`. These files are modelled at
  ceiling height and off to one side, so both rails of a pair share a sign and
  landed stacked: the module came out **0.0 mm**. Taken against the tile's own
  centre instead.
* Then the panel was moved to the origin while the rails were moved to the
  model's centre, so they came out **mirrored 1.2 m apart** and the "600 tile"
  measured 3 x 5.8 m. Both go to the origin now.

**Result, in the browser** Two 1200x600 and three 600x600 laid together: edges
meet at x 2400 exactly, z bands at 1800/2400/3000, one continuous ceiling with
single-tee seams and no gap anywhere.

**Guard** `every offered model is one that was re-cut onto a true module`, `a
"600 x 600" is now a 600 mm MODULE, whatever the tee`, `and a "1200 x 600" is
1200 x 600`, `so a long tile is EXACTLY two short ones, which is what lets them
mix`, `the tile sits INSIDE its module, resting on the tees`, `and the flange is
the width the file is named for, not 15.85 or 26.62`, `the re-cut 1200s already
lie long-axis-along-x, so none is turned`.

**Still the right fix** A corrected export from the modeller — rail centres at a
true 600 and 1200. This whole script is a stopgap and is written to be deleted.

### Designer Textile: 275 photographed panels off a CDN

**Given** a URL map — 5 fabrics (FB1-FB5) x 55 shades in 8 colour groups, with
a panel and a thumbnail for each, hosted on CloudFront.

**Inspected before wiring, including against the CDN itself:**

```
275 entries        275 unique keys, 275 unique URLs, all recorded 200/200
55 shades          each keeps the SAME hex across all five fabrics
every fabric       made in all 8 groups, so all 275 combinations exist
thumbnail FB1_Blue_1   fetched: 200, 1059 bytes — exactly the size recorded
panel     FB1_Blue_1   206 on a range request; header says 3401 x 7937
Access-Control-Allow-Origin: *   on both
```

That last line is the one the whole thing rests on. Without it the browser could
not read a panel into a canvas and none of this would be possible.

**It is the veneer path, not a new one.** A panel is a 1200 x 2800 mm SHEET, the
same thing a Wood Classic veneer is, and a fin is a vertical strip cut from it.
Aspect confirms it: 7937/3401 = 2.3337 against 2800/1200 = 2.3333. So the file's
own warning — "these will seam if repeated" — does not bite, because nothing
repeats a sheet. `realWoodFinMaterial` became `sheetFinMaterial` and both
families use it.

**Two numbers shaped the module.** 1,006 MB for the set, so nothing is fetched
up front — the MAP loads at boot and a sheet is pulled the first time something
wears it. And 108 MB for ONE decoded panel, so it is decoded AT A RESIZE via
`createImageBitmap({ resizeWidth })`, which never materialises the 27
megapixels an `<img>` would have held.

The thumbnails are the opposite case: 540 B to 3.8 KB, 0.3 MB for all 275. Small
enough that every swatch in the picker shows the fabric itself rather than its
average colour.

**The eight DT-01..DT-08 codes are gone**, on the user's instruction. They were
invented hexes standing in for a range nobody had yet.

**A picker of its own.** 275 swatches is a wall, not a control, so Designer
Textile gets fabric -> colour group -> shade, the same way Colour Core already
has a picker rather than a grid. One code is still written (`FB1_Blue_2`), so a
saved layout, the schedule and the fin material all keep dealing in one field.

**Guard** `the textile map is read, not invented`, `55 shades, and every one
keeps the same hex across all five fabrics`, `every panel is on the CDN, none
bundled`, `a textile sheet is the same 2800 mm long as a veneer sheet`, `every
fabric is made in every group, so all 275 exist`, `a combination that does not
exist resolves to nothing`, `a panel is identified by one code, which the picker
can take apart`, `and is marked as a SHEET, which is what routes a fin to
strip-cutting`, `the eight placeholder DT codes are gone`.

**What is NOT confirmed, and why.** The picker, the map load and the schedule
were all seen working in the browser, and `loadTextileSheet` was called directly
and did fetch and decode a sheet. But the fin actually WEARING the fabric was
not confirmed end to end: after a long run of edits the dev server was serving
stale, HMR-timestamped copies of these modules — `baffle.js` importing
`textiles.js?t=...` as a second, empty instance, and a probe added to
`buildBaffleSet` never firing even though the served file contained it. That is
a dev-server state problem rather than a code one, and the way to settle it is a
dev-server restart, not more guessing at it.

### Designer Textile came out distorted

**Symptom** The fabric on a fin looked squashed.

**Not the sheet, and not the mapping.** Both checked first: the decoded canvas
is 2390 x 1024, which is 2.334 against the panel's 2800/1200 = 2.333, and the
fins carried `repeat 0.857 x 0.167` stepping one strip per fin — the same
numbers a veneer gets. Dumping the exact rectangle a fin samples gave a clean,
even weave at 0.85 px/mm on both axes. So the strip-cutting path was right all
along.

**It was the OTHER path.** `finishMaterial` had no idea about sheets, so a
Designer Textile reaching it fell into the generic switch on `kind: 'textile'` —
a PROCEDURAL twill drawn on the shade's flat hex, then stretched by the caller's
repeat. On a 2400 x 200 fin that is 4.8 x 0.4: **a 12:1 squash**. Two ways to
see it:

* before the panel landed, which is every set for the first second or two
* permanently on a run built from an imported MODEL, which goes through
  `finishMaterial` and nothing else and so never reached the sheet path at all

**Fix** `finishMaterial` now handles a sheet family itself — the strip when the
panel is there, and the shade's FLAT COLOUR when it is not. Not a woven
stand-in: a placeholder weave at the wrong scale reads as a fault, where a flat
colour reads as a colour. That is the same call Colour Core already makes, and
for the same reason. `finIndex` goes through it now too, so a model run steps
one strip per fin the way a parametric one does.

**Guard** `a sheet family is recognisable from the family object alone`, `and it
is NOT a kind the procedural switch would stretch`.

**The lesson, again** I verified the path I had written and not the path I had
not. The sheet branch in `buildBaffleSet` was correct and I proved it twice;
the bug was in the function I never touched, reached by callers I had not
thought about.

### Fabric sheets: less downscaling, and a bound to pay for it

**Asked for** less downscaling of the Designer Textile panels.

```
             px/mm of cloth   MB decoded
3401 (file)       2.83           108      as delivered
2048              1.71            39      now
1024              0.85            10      where this started
```

**Why not full resolution.** 108 MB a sheet, and a ceiling can wear several at
once — four fabrics would be 430 MB of texture for something seen from four
metres. 2048 doubles the density where it was thinnest: at 0.85 px/mm a thread
was well under a pixel, so what survived was the cloth's tone rather than its
weave.

**The bill had to be bounded before the resolution went up.** Sheets were held
for the life of the session and nothing ever freed one, so at 39 MB each a user
trying a dozen shades on one set would have finished with half a gigabyte of
texture that nothing was wearing. `retainTextiles(keys)` frees anything the keys
do not name, and main.jsx subscribes to the document and calls it whenever the
layout changes — because the DOCUMENT knows what is worn and lib/textiles cannot.

Safe to dispose because a fin holds a CLONE of the texture and a set is rebuilt
and disposed whenever its finish changes; a key still wanted is never in the
list, and a dropped one is simply re-fetched if it comes back.

**Measured in the browser**: three colour changes in a row, and the count stayed
at ONE sheet / 39 MB each time. Unbounded it would have been four sheets and
157 MB. Fins confirmed wearing a 4780 x 2048 map.

**Guard** `a sheet is kept at 2048 across, not the 1024 it started at`, `which is
1.7 px per mm of cloth, where 1024 was 0.85`, `and about 39 MB a sheet, where the
file as delivered is 108`, `so the sheets have to be bounded, and there is a way
to bound them`.

---

## Direction: a field that asked a question and lit its own answer

**Symptom** — "in baffles, the direction is already selected, dont make it like
that." A new baffle brush opened with **Vertical** highlighted under Direction,
while the Place button beside it was still faded and still listed Direction
among the fields outstanding. The panel said chosen; the store said unchosen.

**Cause** — the store was right. `emptyBrushParams()` sets `rot: null`, and
`Direction` is in `REQUIRED`. The panel drew the buttons with `value={p.rot ?? 0}`,
so a null rotation rendered as 0 and 0 is Vertical. Exactly the trap the depth
label fell into with `parseWidth` answering 150 for a width nobody had set: a
read-side default filling in for an absent value that the rest of the app is
carefully treating as absent.

**Fix** — the buttons take `p.rot` itself, and the field carries a `—` hint like
its neighbours. Nothing is lit until somebody picks.

**And the same field, placed, was a dead control.** Direction is one fact under
two names: `item.rot` is what the scene and the grid turn by, `params.rot` is
what the panel shows and what `runLimits` measures the run across. They were
written from opposite ends and never reconciled, so it was wrong BOTH ways:
picking a direction in the right panel patched `params.rot` and turned nothing
at all, and pressing Rotate moved `item.rot` while leaving the panel naming the
old direction and capping the count against the wrong wall. `update()` now
carries whichever one arrives onto the other, and `fromJSON` seats `params.rot`
on the item's rotation so files written before this do not come back disagreeing.

**Rotate steps a quarter turn, so a vertical run reaches 180.** That is the same
axis, and the field offers only 0 and 90 — so two presses used to leave both
buttons dark under a run plainly lying one way. The display folds `% 180`; the
stored angle is untouched.

**Guard** `pressing Rotate moves the direction the panel shows`, `and picking a
direction in the panel actually turns the set`, `so the footprint follows the
panel too, not just the Rotate button`, and — read off the panel's SOURCE,
because a store test cannot see a read-side default — `and the Direction buttons
show nothing chosen until one is`.

---


## Solid PET: two textures, and then no texture

> **Resolved: there is no texture.** "you have to realize there are no textures
> on the baffle — and you dont have to give it a texture in solid colored pet
> finish — give it just the colors." Everything below is the record of two
> passes that both answered a question nobody had asked. The final state is
> `feltFinMaterial(hex)` returning a colour and a roughness, and nothing else.
> Kept because the reasoning in it is exactly the kind that needs catching.

### First pass: it looked like paint, because it was paint

**Symptom** — "solid colored PET finishes are looking low quality on baffles."
A fin in the focus view was one flat slab of colour with no surface at all.

**Cause** — four faults stacked, and all four pushed the same way.

Measured, the felt tile's luminance spread from the 1st to the 99th percentile
was **fifteen levels out of 255** — a standard deviation of 2.8 — and every bit
of it sat at the highest frequency there is. High frequency is the first thing
a mip level destroys, so at any real viewing distance the whole texture averaged
to its mean and the fin rendered as one value.

`catalogTexture` then made it worse while claiming to make it better: its felt
case was `drawImage(feltTexture(hex).image, 0, 0, 512, 512)` on a 256 tile —
a 2x bilinear upscale, commented "reuse felt look at higher res". Measured, that
cost **21% of the contrast** (sd 2.81 to 2.23) and four times the memory, and
added no detail, because an upscale never does.

The mapping squashed what was left. `repeatY: Math.max(1, depth / 500mm)`, and
that clamp is the bug: every fin the catalogue sells is 75 to 300 mm deep, so
**every one of them** had a 500 mm square of felt pulled down into its depth —
3.3:1 on a standard 150. The same shape of fault as the Designer Textile squash,
in a different family.

And there was no relief at all. What you see on felt is light catching fibres,
not a change in the dye, so an albedo-only felt under this scene's fill light
is exactly a flat colour however good the colour map is.

**Fix** — the felt is drawn as a periodic noise FIELD rather than as canvas
strokes, which makes it seamless by construction, and that is what allows the
rest:

* **Low frequencies.** Broad mottle on a 4x4 and 11x11 lattice under three
  octaves of fibre. The mottle is what survives minification and stops a fin
  reading as a painted board from across a room.
* **A relief.** `feltNormal()` — ONE normal map for the whole range, because a
  dye does not reshape a fibre. Not sRGB: a normal map holds vectors, and
  decoding it as colour bends every one of them.
* **True scale.** `feltRepeat(lengthMm, depthMm)` on a 250 mm tile — 512 px is
  2.05 px/mm, the same order as Designer Textile's 1.71. A 2400 x 150 fin shows
  9.6 tiles along and 0.6 across, and 0.6 needs no clamping because the tile
  wraps.
* Roughness 0.96 rather than 0.92. Needled polyester is about as matte as a
  made surface gets.

Two ends needed holding, and they are the same fault mirrored. **Black** at
`#000000`: a purely multiplicative dye leaves it perfectly flat, because zero
times anything is zero, and the whole negative half of the field clipped away
leaving isolated specks. A 9-level floor gives it room to swing — a RENDERING
floor, not a catalogue change; the swatch stays `#000000`. **White** at the
other end had nothing above it, and unheld the pale shades clipped more than
half their texels to flat 255. Brightening is now held to the headroom the dye
actually leaves; darkening never needs holding.

**Measured after**: Pomegranate sd 2.23 to 4.10 and its 1-99 span 11 levels to
18; Graphite sd 5.59, span 26; Black now has structure where it had none.
Marigold's clipping fell from 10.4% of texels to 3.5%, Oat's from 4.6% to 1.5%.

**Cost**: one 1 MB colour map per shade actually worn, plus one 1 MB relief for
the entire range. Confirmed in the browser that clones share their Source, so
fins of different sizes — and pet-solid and vmt-solid together — are still one
upload of each.

Clouds are untouched: `cloud-solid` is `kind: 'felt'` but CloudSet sets a flat
hex on the model's own material and never reaches this path. Furniture does
reach it, and gets the better tile at a finer scale as a side effect.

**Guard** a section of its own: `a felt tile is 250 mm, so 512 px is about 2 px
per mm of cloth`, `a 2400 x 150 fin shows 9.6 tiles along and 0.6 across`, `so a
millimetre of fin is the same millimetres of felt either way`, one per catalogue
depth, `which under the old clamp would have been one tile for five of those
six`, and — read off the source, because a canvas is what would prove the rest
and the harness has none — `the felt tile is generated at its size rather than
upscaled into it`, `and the range shares one relief`, `and the tile wraps`, `and
a felt fin leaves before the generic path, which can carry neither`.

### The first pass came out looking like wood

**Symptom, same day** — "why is there a wooden-y texture on solid colored pet
panel finish on baffles." Long parallel striations down the fin.

**Cause, mine** — `periodicNoise` took a per-axis `Rx, Ry`, and the felt used it
to stretch all three fibre octaves 3:1:

    const fibreA = periodicNoise(96, 32, 73)
    const fibreB = periodicNoise(208, 68, 74)
    const fibreC = periodicNoise(416, 140, 75)

Three ALIGNED octaves of stretched noise is how you draw wood grain. The comment
beside it rationalised the stretch as a machine direction — but a needle-punched
non-woven has no direction you can see; that is what non-woven means. The broad
mottle at 4x4 and 11x11 made it worse: large soft swirls read as figure in a
material, which is the other half of a grain look.

**Fix** — every octave square. The per-axis knob is REMOVED rather than set to 1:
nothing else ever wanted it, and a knob whose only use was a bug is a bug waiting
to come back. Mottle moved finer (7 and 17) and down in weight, fibre up, and the
fibre octaves flattened to 0.37/0.34/0.29 — value noise weighted towards its
lowest octave is cloudy, and felt is granular.

**Measured**: mean |difference| along the tile over the same across it, which is
1.00 for a mat and well off it for a grain — **1.001** on every shade tested.
Contrast rose slightly on the way: Graphite sd 5.59 to 5.89, Oat's 1-99 span 46.

**Guard** `and the mat has no direction, because a non-woven has none to have` —
matched on `periodicNoise(R, seed)` existing AND no three-argument call surviving
anywhere in the file.

**Worth keeping**: I reached for the anisotropy deliberately, wrote a plausible
sentence justifying it, and never looked at the tile on its own — only at fins in
a 3D view where a 150 mm strip is too small to read. One `drawImage` of the tile
into a debug overlay showed it instantly. Look at the texture, not only at the
thing wearing it.

### Third pass: take it all off

**What was actually wanted** — a solid-coloured PET baffle is a plain coloured
board, and the range is sold as COLOURS: Arabian Spice, Marigold, Pomegranate.
Not as a material anybody is meant to read the surface of.

    function feltFinMaterial(hex) {
      return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.96, metalness: 0 })
    }

That is the whole finish. Roughness 0.96 stays, because "very matte" is a
property of the material rather than a texture on it.

**What went with it**: `feltNormal`, `feltRepeat`, `FELT_TILE_M`, and the height
field they needed. `feltTexture` survives, but only as upholstery for the
furniture in the room scenes — a seat wants a cloth; the ceiling product does
not. textures.js says so at the top now, so the next person does not wire it
back into a finish.

**Guard** `a felt finish is built from the swatch hex alone`, `and wears no map
of any kind` — matched against the function BODY, so a `map` elsewhere in
baffle.js cannot stand in for one here — `so it is a colour, a roughness and
nothing else`, `the felt texture that remains is furniture upholstery, not a
finish`, and `and nothing is left over from giving baffles a relief`.

Black is `#000000` again: the 9-level scatter floor went with the texture, so
the catalogue value renders exactly as written.

**Worth keeping**: "low quality" was a report of a symptom, and I read it as a
brief — twice. The first pass measured the texture's contrast and concluded it
needed more; the second measured its directionality and concluded it needed to
be isotropic. Both were answers to "how do I make this texture better", and the
question was "should there be a texture at all". Neither measurement was wrong
and neither was worth taking. **Ask what the product is before improving how it
looks.**

---


## Designer Textile on ceiling tiles

**Asked for** — the fabric range, already on the baffles, on the lay-in tiles
too. Four decisions were put to the user before a line was written, because the
previous item in this file is what happens when they are not:

| | |
|---|---|
| where | its own range in the Type list, beside Wood Classic |
| perforation | none — a fabric face is fabric edge to edge |
| scale | true scale: a tile shows its own millimetres of cloth |
| repeats | every tile the same crop |

**The same assets.** A Designer Textile tile is a crop of the same 1200 x 2800
panel a baffle fin is a strip of, so a tile and a fin in one fabric are the same
cloth at the same size. Nothing new is fetched and nothing new is decoded.

**A field of its own, not a second meaning for `wood`.** A veneer code and a
fabric key are read from different maps — one from the tile finish folders, one
from the CDN panel map — and a single field for both is how a value ends up
validated against the wrong list. `textile` sits beside `wood`, and
`tileMissingFields` asks for whichever the RANGE has: Fabric, or Base colour and
Perforation. Same shape as the Grid field, which Univic Strip is not asked for.

**True scale is a crop, not a fit.** `repeat` below 1 with an offset, which is
what RepeatWrapping already does. Measured in the browser: a 595 tile shows
595 x 595 mm of cloth, a 1195 one shows 1195 x 595, and both share one Source —
one upload however many tiles and whatever their size.

**Three things that would each have been a bug on their own:**

* **The sheet had to be retained.** `retainTextiles` is driven by what the
  document wears, and it only knew about `colour` on a baffle. A tile calls its
  fabric `textile`, so without main.jsx learning that, the sheet would have been
  freed out from under the tile the moment the layout changed — and it would not
  have looked like a missing key, it would have looked like a tile going blank.
  Measured: three fabric changes in a row, one sheet and 39 MB each time.
* **The block had to hear the sheet land.** A tile that asks for a fabric before
  it has downloaded has nothing to paint, and would have sat on its base colour
  until something else re-rendered it. `subscribeTextile`, the same way the fins
  do it.
* **A fabric face is not a lacquered veneer.** Every tile face was built at
  roughness 0.72, which is a satin lacquer, and it put a lacquer sheen across a
  cloth ceiling. The FINISH decides that, not the model, so it is set where the
  map is painted — and set on both branches, so a block switched between ranges
  is corrected rather than left sheeny.

The crop is NOT cached. It is a clone and costs nothing; the download behind it
is already deduped in lib/textiles. A cache would have been worse than useless —
`retainTextiles` can free the sheet under it, and the cache would then hand out
a crop of a texture that no longer exists.

**Guard** a section of its own, sixteen of them: the range exists and Wood
Classic is not one, a fabric tile is asked for a Fabric and never a Perforation
and a veneer tile the other way round, it still chooses a size and a grid, an
unknown key is dropped and a real one survives at either size, the crop
arithmetic at both tile sizes, the crop is centred, the sheet is retained, the
face is matte, and the schedule names the fabric.

**Open**: every tile takes the same crop, as asked. The alternative — successive
tiles taking successive patches, so a large field does not read as one photo
stamped twenty times — is one line in `tileTextileTexture`: an offset that walks
with the tile index instead of a centred constant. The panel holds roughly 2 x 4
distinct 600 crops.

---

## Two lattices on one ceiling

**Symptom** — "when i click on duplicate, they stack good. when i try to
manually move single pieces and try to stack them with the stacks that have been
put by duplicating, there a gap. when i try to move another piece with the single
piece, they stack together good."

Three facts, and together they name the fault exactly: duplicates agree with each
other, dragged blocks agree with each other, and the two families never meet.

**Cause** — `clampCorner` clamped to `cols - ci` and knew nothing about the step.
There is no reason for the far edge of a ceiling to be a multiple of a module: on
a 7.5 m ceiling a 600 mm tile clamps to **6900**, which is eleven and a HALF
modules from the origin. Everything then follows:

* `placeAt` snapped, then clamped — and the clamp UNDID the snap for anything
  dropped near an edge.
* `duplicate` offsets by exactly one footprint from its source, so a source at
  6900 breeds a whole family at 6900 + 600k. Internally consistent, globally
  wrong.
* `dragTo` snapped to a multiple of 600 from cell 0 — the other lattice.

Measured before the fix: **38 of 400 random placements landed off the module**,
every one of them at an edge. After: **0 of 400**, and a drag hard into the far
corner lands at 6600 rather than 6900.

**Fix** — `clampCorner` takes an optional `step`: bound first, then FLOOR onto
the step, because rounding up would put the corner back outside the ceiling it
was just clamped into. Passed from the two snapped paths, `placeAt` and
`dragTo` — and deliberately NOT from `update`, because an arrow-key nudge comes
through there and a nudge that snapped back to where it started would do nothing
at all. `dragTo` therefore does its own bounded snap rather than relying on the
clamp downstream of it.

**And the ghost was lying too.** CeilingGrid clamped the raw hover cell and
skipped the snap altogether, so the preview sat under the cursor while the block
landed up to half a module away from it. It now runs the same two lines placeAt
does — it is a promise placeAt has to keep.

**Guard** a section of its own: the step exists, a ceiling edge need not be on it
(7500 - 600 = 6900, stated as arithmetic so it does not depend on the test room),
a set placed anywhere still lands on its step, a drag into the far corner is held
on the step and a step short of the wall, a Duplicate run from an edge block
shares the lattice a drag uses, an arrow-key nudge still moves one cell, and four
on `clampCorner` itself — stepless unchanged, stepped floors, an on-step corner
untouched, an oversized footprint lands at 0.

---

## I truncated store.js

Not a bug in the app. A bug in how I edit it, and the second time this project
has lost a file to it.

**What happened** — a patch script of the shape

    io.open(path, 'w', encoding='utf-8').write(fn(read(path)))

Python evaluates `io.open(path, 'w')` BEFORE it evaluates the argument, so the
file is truncated to zero and only then does `fn` run — and `fn` raised an
assertion. 1,258 lines gone. `app/src` is not in version control, so there was
nothing to check out.

**Where it was not** — git (untracked), the editor's local history, the harness's
own file-history (it snapshots Edit/Write, and this went through Bash), the dev
server, the browser's loaded module and its network buffer, `dist` source maps
(not enabled), shadow copies (no permission).

**What it was rebuilt from** — the production bundle built 19 minutes earlier,
reformatted with esbuild: complete and current, but minified, so every comment
was gone. The prose came back from a full copy of an older store.js found in a
session transcript, plus the fragments this session had read. **1,254 lines, and
`npm run verify` passes 1,157 with the same 8 pre-existing failures it had
before the loss** — that suite is the only reason a reconstruction could be
trusted at all.

**One thing did not come back**: a dead `if (false) { ... }` block inside
`reconcile` that had held the old per-axis model sizing. The bundler had already
eliminated it, so it was not in the bundle to recover; the comment explaining
that a model is sized BY the catalogue is restored in its place. Nothing live
was lost with it.

**The rule, stated again because stating it was not enough**: never write a file
by opening it for writing before the replacement string exists. Build the new
content, assert on it, then write — or use the editing tool, which snapshots.

---

## Designer Textile: off the tiles, onto the clouds

**Asked for** — "hide the designer textile option on ceiling tiles - and we have
to have it in the clouds."

**Hidden, not deleted.** `TILE_TYPES['designer-textile']` gains `hidden: true`
and the picker lists `tileTypesOffered()` instead of every entry. The range is
otherwise untouched: the crop, the schedule line, the sheet retention and its
sixteen guards are all still here and still run. One word brings it back.

`reconcileTile` still ACCEPTS it, on purpose. A layout saved while the range was
offered has to load and render, not come back as a range this build has never
heard of — hiding a thing from the picker is a statement about what you may
choose, not about what may exist.

**And the third product in one cloth.** A fin is a strip of the 1200 x 2800
sheet, a tile is a patch of it, and a cloud is now a patch too — so all three in
one fabric are the same cloth at the same size. A 1200 cloud shows 1200 mm of it;
a 600 shows half of that on both axes. Measured in the browser: repeat
0.4286 x 1, which is 1200 mm along the sheet and the full 1200 across, because
1200 is all the sheet is.

**A cloud had a `family` field already** — hardcoded to `'cloud-solid'` in
reconcileCloud and never asked about. Making it a real choice was most of the
work, and it is why the sheet retention needed nothing: main.jsx keeps a sheet
whose FAMILY declares `sheet: true`, and a cloud names its fabric `colour`, so
the line that already covered the baffles covers clouds too. The tiles needed
their own line because a tile calls it `textile`.

**Three things that would each have been a bug:**

* **The cap.** Panel and cap share one material — they are the two faces the
  room sees — and only the PANEL's UVs were normalised to 0..1. Fine while the
  material was a flat colour, which has no map to place; the moment it can carry
  a photograph, a cap on the file's own UVs wears the cloth at whatever scale
  the exporter happened to leave behind. `normaliseCloudUV` now runs for both.
* **Roughness.** The panel was built at 0.85, which is a painted board. Cloth is
  not, so the fabric branch sets 0.95 — and the solid branch sets 0.85 back, so
  switching a placed cloud between families corrects it rather than leaving it
  matte.
* **The colour underneath.** A map multiplies by `color`, so the dye would have
  been applied twice. White under a map; the swatch hex while the sheet is still
  downloading, so the cloud reads as the right colour rather than flashing white.

**Verified by comparison rather than by assertion**: a solid green cloud and an
FB2_Green_3 one side by side from below — the first a flat fill, the second
visibly woven.

**Guard** sixteen of its own for the clouds — the family is a real choice, a
fabric key is checked against the panel map and a solid code against the solid
swatches, an unknown family falls back, the outstanding line says Fabric or
Colour as the range dictates, the crop arithmetic at both sizes and against the
tile's, the crop is centred, the cap is mapped, the two roughnesses exist, and
the sheet is retained by family. Four more hold the tile range hidden: it exists,
it is not offered, the three that remain are, and a layout naming it still loads.

---

## Tile thickness — on the order, not on the model

**Asked for** — "add an option to select thickness of the tile (not grid) too —
they wont change the model — just for info. 12, 25, 40."

`TILE_THICKNESSES = [12, 25, 40]`, a field on the tile spec, and that is the
whole of it. It reaches the schedule and NOTHING that is drawn: the supplied
files are one thickness each, and a 40 mm tile renders exactly as a 12 mm one
does. Guarded that way round rather than by testing what it changes — a 40 mm
tile reserves the same cells, measures the same block, resolves the same model
file and wears the same face as a 12 mm one.

**Not the grid, which is the other thickness on this panel.** The 15 and 24 mm
exposed tee IS a different file and DOES change the model. Two fields that both
measure a few millimetres of the same product, one structural and one purely
descriptive, sitting two rows apart — so the panel says "Specification only" on
the one that is, and the field is asked for after the two that pick the model and
before the two that pick the face: what the tile IS, then what it looks like.

**Required, like every other tile field.** A judgment call, stated at the time
and one line to reverse: the brush opens blank so that placing a tile means
placing the one somebody specified, and a thickness that goes on an order is not
a detail to leave blank by accident. Nothing narrows it — a 25 mm board is a
25 mm board whichever tile is cut from it — so it survives a change of size, of
grid and of range untouched.

**It is part of the schedule KEY**, so two thicknesses are two lines. They are
two different things to order, the same way two colours are, and a row that
merged them would be a row nobody could buy from. The dimensions column picks it
up with no work: `595×595×40`.

**Nine existing fixtures had to gain a thickness** before the suite passed again,
which is the requirement doing its job rather than a cost of it — every one of
them was a "fully specified tile" that was no longer fully specified.

**Guard** fourteen: the range is 12/25/40, it is asked for and completes the
spec, it is asked in the right place, the grid is still its own field, an
unlisted thickness is dropped and a listed one survives, it survives a change of
size and grid and range, and then four that it changes nothing drawn — cells,
extent, model id, face — and two that it reaches the order, carried on the row
and splitting it in two.

---

## Grid Support — four rods, on the corners of the group

**Asked for** — "theres a model called grid support, that is basically a
suspension rod. that rod has to be put on the corners of the ceiling tiles
group. there will be no more than 4 rods for a single tile or group of tiles.
they all will be in corners."

**Measured before anything was built.** 343.52 mm long on a 16.45 x 18.99 mm
section, one mesh, 46,126 triangles, material #808080 — and the shape is a
12 x 12 mm socket at one end, a flat plate at the other, and NOTHING between 48
and 333 mm. A plain prismatic shaft has vertices only where it ends, which is
exactly the property `splitAtHeight` already had to know about the Univic Strip
rods, and the reason a height test on vertices calls the middle of a rod empty.

Like every other supplied file it is modelled at ceiling height and off to one
side — (6250, 3710, -1060) mm, lying on Z. So it is re-cut ON LOAD, never in the
file, onto the one contract a tile block already keeps: X/Z centred, base at
y = 0, rising +Y, in metres. That is what lets TileSet scale it by
`drop / rodHeight` without knowing anything about it. Stood up by MEASURING which
axis is longest rather than assuming Z, so a re-export that lands on Y still
works.

**The four-per-group rule was already being broken.** Rod machinery existed for
Univic Strip, whose file contains its own four — but `useTileBlock` cloned them
INSIDE the per-tile loop. Univic Strip is one block rather than a field so it
never showed, and a field of twenty tiles would have hung from eighty rods. The
rods are built once per BLOCK now, after the loop, at the corners of the field:
`±(nx · mx)/2, ±(nz · mz)/2` — which is where the perimeter tees meet and where
a hanger actually goes. A file that brought its own keeps them; everything else
gets four Grid Supports.

**One geometry for every rod on the ceiling.** `clone()` shares geometry and
material, so 46,126 triangles are uploaded once however many corners, blocks or
ceilings wear them. What each copy owns is a transform.

**Which end is up is a named constant**, `GRID_SUPPORT_PLATE_UP`, not a sign
buried in a rotation: the flat plate goes against the soffit and the socket
faces down to the grid, because a plate that wide and that thin is a fixing
plate and a socket is something another part plugs into. One word to turn over
if the product says otherwise.

**Guard** fourteen: the file exists and measures what it measures, it is not at
the origin, its shaft is prismatic, which end is up is stated, four corners at
the right spacing for a 4 x 3 field and for a single tile, no rod is built inside
the per-tile loop, exactly four offsets, a file with its own rods keeps them,
rodHeight follows whichever is drawn, and the rod is stood up by measurement and
registered to the block.

**Open, and worth a decision:**

* **The stretch.** The rod is a fixed 343.5 mm and the drop runs 0-1200 mm, so
  it is scaled on Y like every other suspension in the app — the Univic rods go
  from 2,928 mm to 150 at the default, a 20x compression that has been shipping
  for weeks. But those are plain 6.4 mm cylinders and this one has a socket and
  a plate worth 46,000 triangles, which squash with it. The shaft is prismatic
  and empty between 48 and 333 mm, so keeping the fittings true and stretching
  only the middle is a clean cut — the same trick splitAtHeight already does.
* **The budget.** 46,126 triangles a rod, four a block. A dozen blocks is 2.2M
  triangles of hardware for something seen from four metres. One InstancedMesh
  for every rod on the ceiling would make it one draw call.

---

## Grouping

**Asked for** — group several placed items so they move together, can be edited
together when they are the same product, and delete together. Agreed on top of
that: a NAME and a schedule broken down by it, then duplicate, then rotate.

**Selection had to come first, and there was none.** `selectedId` was a single
string read by every panel, outline and action. Rather than change its type,
`selectedIds` was added beside it and `selectedId` kept as the ANCHOR — the last
thing clicked. Every existing reader works untouched; only what cares about more
than one looks at the list. Both go through one helper, `sel(ids)`, because
keeping them in step by hand across the twenty places that clear a selection is
exactly how they would drift.

**A group is a name; the membership rides on the items.** `groupId` on the item
makes "one item is in one group" true by construction — there is nowhere to
write a second — and makes deleting an item a non-event: the group is whatever
still points at it. The record on the side holds only the name, which is the one
thing a set of ids cannot hold for itself. FLAT, deliberately: nesting doubles
the cost of move, rotate, duplicate, delete and edit, and buys a shape nobody
asked for.

**Clicking one member selects all of it.** That is what grouping means, and it
is what stops every verb below needing a second answer for "the group, or just
this one". A marquee that clips the corner of a zone widens to the whole zone
for the same reason — otherwise the next drag tears it in half.

**What the shape of the problem actually forced:**

* **`canPlace` had to learn to ignore a SET.** It forgave exactly one id. A
  group sliding past its own old position overlaps itself, and a test that can
  only forgive one member refuses every group move but a step into empty
  ceiling.
* **A group moves on the COARSEST step its members allow.** A tile block lands
  on its 600 mm module and a baffle run on 100 mm; the only delta legal for both
  is a multiple of the coarser. Move by 100 and the tile comes off the module
  that the shared tee depends on.
* **Move, rotate and edit are ALL-OR-NOTHING.** Clamping one member into the
  ceiling while the others moved would change the SHAPE of the group, which is
  the one thing a group is. And editing can change a FOOTPRINT — a baffle's
  count, a tile field's columns — so applying through `update()` ten times can
  leave three refused and seven changed. The whole result is built, tested as a
  set, then committed or thrown away.
* **Rotating turns twice.** Each member spins on the spot AND its position
  swings about the group's centre; doing only the first leaves a turned row
  still in a row. A group with no room to swing is refused rather than
  half-turned — guarded, because it looks like a bug and is not.
* **Editing together is gated on `specKey`** — the RANGE, not the
  specification. Eight Blade/Standard runs share a form and can be given a
  colour in one go; a Blade and a VMT do not, and offering one's panel for the
  other would offer options the other has not got.

**Schedule by zone is the part that earns it.** The three verbs are editing
convenience; "Boardroom — 8 units, Ungrouped — 4" is what a client asks for, and
`buildSchedule` merged the whole ceiling into one list. Each section is a whole
schedule built by the same function, so the sections add up to the ceiling
rather than re-slicing it, and the ungrouped come last under their own heading
instead of being folded into the first zone.

**Serialisation**: SCHEMA_VERSION 3. Groups are written as names only, items
carry `groupId`, and a file from before this loads as an ungrouped ceiling
because `raw.groupId ?? null` is all the migration it needs. A group whose
members did not survive the load is dropped and its survivors set free. `groups`
is in `documentOf`, or an undo would bring items back stripped of the group they
were in.

**Two that bit during the build:**

* **An unstable selector.** `useStore((s) => s.selectedItems())` builds a fresh
  array every call, so React never saw the same snapshot twice — "Maximum update
  depth exceeded", a black screen. Subscribed to `items` and `selectedIds`,
  which are stable, and derived through useMemo instead.
* **The marquee has to take the camera.** Without disabling OrbitControls for
  the length of the drag, the gesture goes to the camera and the ceiling never
  sees a pointermove: the view spins and no band appears. The same thing a set
  drag already does. It also judges "did this travel" again at pointerUP, not
  only from the moves seen on the way — a coarse pointer stream can deliver a
  down and an up with nothing between, and a marquee that needed the middle
  would quietly become a click.

**Guard** 44 across five sections: the anchor is always one of the selected or
null, shift-click toggles both ways, a click on bare ceiling clears, selectMany
drops the dead, removing one of several leaves the rest; one item cannot be a
group, joining a second leaves the first, a group below two dissolves; the move
delta is shared and refusals are total, four turns return to the start, a copy is
its own group and moving one leaves the other, delete is one undo step; a change
that will not fit for one member changes none; the file version moved, a round
trip keeps the name, an old file loads ungrouped, an orphan group is dropped; and
the schedule sections add up to the whole ceiling.

**Not built, and named as such**: lock and hide. Agreed as "after".

---

### Box select took the camera's gesture

**Symptom, straight after shipping the marquee** — "i cant rotate the camera,
and it just starts to marquee drag directly."

**Cause, mine.** The marquee claimed every drag on bare ceiling under the Select
tool. Before it existed that drag orbited the view, and nothing replaced it: the
camera simply lost the only gesture most drags are for. Adding a feature that
silently takes an existing one is worse than not adding it.

**Fix** — a toggle, `marquee`, OFF by default. Off, a press clears the selection
and the drag goes to the camera, exactly as before. On, it draws a band. The
button sits under the Select tool because that is what it modifies, and it is
only shown under Select — a drag under Place selects nothing to begin with.
Editor state, so it never reaches a saved file.

**And a real bug the report uncovered.** The band was DRAWN from the pointermoves
but the selection was RECOMPUTED from the point at release. Those are two
answers to one question and they disagree whenever the release sample is stale —
the band promises one rectangle and the selection takes another. The rectangle
last drawn is now the one used, and a sample that lands exactly back on the press
point is ignored rather than allowed to collapse a band that was already drawn.

**What could NOT be verified, and why it is worth writing down.** The harness's
synthetic drag reports the SAME intersection for pointerdown, pointermove and
pointerup — traced and confirmed: `from`, the move point and the release point
came back byte-identical, so the band is a rectangle of zero size and selects
nothing. Dispatching hand-built PointerEvents on the canvas does not reach R3F's
handlers either. So the toggle is verified end to end and the marquee's accuracy
is not: it has to be tried by hand.

That trace is why `window.__marquee` now exists — a DEV handle on the last
gesture, the same shape as `window.__ceiling` and `window.__textiles`. A marquee
is three events deep and none of them leave a trace; without it the only way to
ask why a drag selected nothing is to guess, and guessing is what cost the time.

**Guard** `box select is off to begin with`, `and the existing toggle action
turns it on`, `it never reaches the document`, `and a press does nothing at all
while it is off`, `the selection is the rectangle that was DRAWN, not one
recomputed at release`, and `and with it off a press on bare ceiling still
clears the selection`.

---

### Taking one tile out of a group

**Asked for** — "they are grouped but i also want the functionality to separate
a single tile from that group." Not ungrouping, which dissolves the whole set —
one member out, the rest still a group.

**The hard half was selecting it.** Clicking any member picks up the whole
group, by design; that is what makes "a group moves as one" true without every
verb needing a second answer for "the group, or just this one". So there was no
way to name a single member at all. **Alt-click** reaches past the group to the
one item under the pointer — `select(id, { only: true })` — and everything else
follows from having something to act on.

**And it changed what a drag means.** A member singled out with alt-click drags
ALONE; the whole group selected drags as one. A group is a set of items, not a
rigid body, and the alternative — a member you have deliberately picked out
still dragging the whole zone — would make it impossible to nudge one tile
without first leaving the group.

**`removeFromGroup(ids)`** takes them out and leaves the group standing. The
items do not move: leaving a group is a change of membership, not of place.

**Two bugs found by testing, both mine, both the same shape.**

* **A dissolved group left its survivor pointing at it.** Four places thin a
  group out — a member removed, an item deleted, a zone resized, a member
  poached by another group — and all four dropped the RECORD without freeing the
  last member, leaving a `groupId` naming a group that no longer exists. It
  self-heals on reload, because fromJSON already clears those, but in-session
  `selectedGroup()` answered null for an item that still claimed to be in
  something. One helper now does both halves together: `pruneGroups(items,
  groups)`.
* **And then the helper broke grouping.** `groupSelected` pruned BEFORE putting
  the new group in the list, so pruneGroups saw two items claiming a group it
  had never heard of and set them free — leaving a group record with no members.
  The new group goes in before the prune now. Caught within a minute because the
  next check said "1 group, 0 grouped items", which is a sentence that cannot be
  true.

**Guard** fourteen: a plain click still takes the whole group, alt-click reaches
past it, taking one out leaves the rest grouped and does not move it, nothing is
left pointing at a group that is not there, the second one out dissolves the
group AND frees the survivor, deleting a member of a pair does the same, a brand
new group actually holds its members, no group is ever left with nobody in it,
pruneGroups does both halves on its own, and a singled-out member drags alone
while a whole group drags together.

---

## A lattice per tile size, instead of one per ceiling

**Symptom** — a screenshot with a gap circled: "i cannot put the 600x1200 panel
there, manually, not by duplication." The gap was real, exactly tile-shaped, and
empty. It had already been reported once before, weeks earlier, as "if im using
only 600x600 tiles its alright, but when i use 600x1200 its behaving like this" —
and it was NOT fixed then. What was fixed then was the module measuring 617
instead of 600. This is a different fault wearing the same symptom.

**Cause, and it is fundamental** — `snapStepOf` took the step from the TILE:

    return [round(mod.x / 1000 / pitch), round(mod.z / 1000 / pitch)]

which is a lattice per SIZE rather than one per ceiling. A 600 x 600 tile could
start every 600; a 1200 x 600 only every 1200. So half the positions a field of
600s creates could not be addressed by a 1200 at all — and those are exactly the
positions you want to fill with one.

Measured, and this is the whole bug in two numbers: a corner aimed at cell 1800
snapped to **2400** for the 1200 tile and to **1800** for the 600. 1800 is where
the gap was. The tile was pushed into its neighbour and then refused for
overlapping — so the app reported "will not fit" about a place it had never
actually tried.

It was worse for a TURNED tile, because the step ignored rotation entirely: a
1200 x 600 turned upright has a 600 x 1200 footprint but was still snapped 1200
along X and 600 along Z. Reproduced: a 600-wide, 1200-tall hole with a perfect
600 x 1200 tile aimed at its centre — refused.

**Fix** — the step is the SETTING-OUT module, the smaller of the two axes, the
same on both:

    const n = round(Math.min(mod.x, mod.z) / 1000 / pitch)
    return [n, n]

A real ceiling has one grid and a bigger tile spans more of it: the cross-tee
pitch is what everything lands on, and a 1200 tile occupies two bays. Square,
so rotation needs no special case — a turned tile's footprint swaps, a square
step does not have to.

**Why this cannot make a mess.** Where you may AIM and what may OVERLAP are two
different rules, and `canPlace` still owns the second. A finer step only makes
more LEGAL positions reachable; it can never make an illegal one placeable. Two
1200 tiles half a bay apart still overlap and are still refused.

**Verified in the browser on the reported case**: a 1200-wide hole starting at an
odd 600 now takes a flat tile at [1800, 1200], and a 600-wide, 1200-tall hole
takes a turned one at [1800, 1200]. Both were REFUSED before.

**Guard** nine: both sizes land on the 600 grid, the step is square, a 1200 tile
can address cell 1800 where before the old rule pushed it to 2400, a 600 answers
the same as it always did, two tiles half a bay apart still overlap, two a full
bay apart do not, and the gap from the report takes a tile without touching
either neighbour.

**Worth keeping.** The first report of this was answered by fixing a different
thing that produced the same symptom, and the symptom went away for the case
that was tested. A report that says "this size is fine, that size is not" is
about the DIFFERENCE between the sizes — and the difference here was never the
module's measurement, it was that each size was given a grid of its own.

---

### No suspension height on ceiling tiles

**Asked for** — "there will be no suspension height option in ceiling tiles."

The control is gone from the tile panel. The PROPERTY is not: `drop` still
exists, still defaults to 150 mm, still positions the block and still scales the
corner rods that were added to it two changes ago. Taking away the control is
not the same as taking away the height, and a tile ceiling that hung at zero
would put the grid inside the slab.

A saved file carrying its own drop therefore still loads and still draws at that
height — this removes a question, not a value.

Baffles and clouds keep theirs, because those hang at a height somebody
actually chooses. A lay-in grid does not: it hangs where the ceiling hangs.

**Guard** `a tile block is not asked how far to hang`, `while a baffle and a
cloud still are, because those hang where somebody says`, and `and the drop
still exists and still defaults, so the block hangs and the rods scale`.

### Cloud Series — and the thing that was blocking it

A folder of 64 images arrived: four designs crossed with the four cloud shapes
and four colours. Complete matrix, clean names, no baked lighting, and each
image cut to its shape. CL-02 is absent.

A design is called by its CODE — CL-01, CL-03, CL-04, CL-05 — and by nothing
else. There was briefly a table of invented names for them (Watercolour, Arcs,
Frames, Sunburst) and it was taken out: the codes are what the range is called
and what goes on an order, an invented name is a second name that has to be kept
in step with the first, and a new design cannot appear on its own if somebody
first has to think of a word for it. Guarded, so they do not come back. (For a
reader who has not seen the files: 01 is a watercolour wash, 03 concentric arcs,
04 nested frames, 05 a radial sunburst. That is a description, not a name.)

Putting one on a cloud turned out to be blocked by something nothing had needed
to care about before.

**Not one of the eleven cloud panels has a UV map a picture can go on.** Probed
headless (`scripts/probe-cloud-uv.mjs`, `probe-cloud-uv2.mjs`): fitting a
top-down projection to each face leaves residuals of **0.20 to 0.74** out of a
0..1 range, where a clean projection fits at 0.

| shape | what the file actually does |
|---|---|
| circle | unwrapped radially — the face samples a band `v 0.81..1.00` |
| square | the whole face samples one patch, 12% of the map, and tiles it |
| hexagon | mapped for tiling at ~80 repeats, split across facets |
| triangle | not planar, and the two sizes are mirrored against each other |

Confirmed by putting a labelled four-quadrant grid on all four in the live app:
the circle came out as two flat half-discs with visible spokes, the square solid
green, the triangle smeared into wedges.

`normaliseCloudUV` could not fix this and never claimed to — a rescale preserves
the file's LAYOUT and only moves its range. It was enough while every cloud
finish was a flat colour or a near-uniform cloth. It is not enough for a
picture. **`projectCloudUV` replaces it in the load path**: u across the panel's
width, v across its depth, 0..1 corner to corner of the plan bounding box,
generated on the cloned geometry and never written to the file.

**`v` is oriented by the panel, not by the axis** — and getting that wrong is
what "in triangles you put the texture on the wrong way" was. The first version
mapped v to a fixed axis on the strength of one measurement, of triangle-1200.
The two triangle files are mirrored against each other (determinants **-2061**
and **+1360**), so their points face opposite ways: 1200 at max z, 900 at min z.
The fixed mapping got 1200 right and stood every 900 on its head — the wash
across one corner and bleed over the rest.

Now measured per panel, from the plan AREA rather than the outline: a shape's
area centroid sits away from its point, so a centroid past the middle means the
point is at min z and v runs backwards. Area rather than "which end is
narrower", because the hexagons are a point at BOTH ends — two widths of zero,
which that test cannot tell from a shape with no point at all.

The numbers separate cleanly, which is why a fixed 5% tolerance is safe:

| panel | centroid off centre |
|---|---|
| circle, square, hexagon (nine of them) | **0.00%** |
| triangle-1200 | −13.19% |
| triangle-900 | +13.16% |

Both triangles now put the artwork's point on their own point.

**And then it was still upside down**, because there was a second fault
underneath the first. `Texture.flipY` is **ignored for an ImageBitmap source** —
the flip is a pixel-store setting applied on upload, and an ImageBitmap does not
take that path. The default `flipY = true` was a lie: v = 1 sampled the BOTTOM
of the image, so every design landed inverted. Fixed by flipping at decode,
`createImageBitmap(blob, { imageOrientation: 'flipY' })`, AND setting
`tex.flipY = false` so a browser that does honour it cannot cancel the two out.

Proved with a 64 px image, red top half and blue bottom half, taken through the
loader's exact call: before, a vertex with v = 0.967 rendered BLUE; after, RED —
on the up-pointing 1200 and the down-pointing 900 alike.

**Why three passes of "verified" missed it.** Every check used a
`CanvasTexture`, built in the console from a canvas — and CanvasTexture DOES
honour flipY. The reference grid was right, the POINT/BASE wedge was right, and
neither of them went through the code that ships. A check that does not use the
production path is not a check. Only the triangles showed it; the other three
shapes' artwork is near enough symmetric to hide an inversion completely.

**This also fixes Designer Textiles on clouds**, which was subject to the same
fault: the code crops the sheet to the panel's plan for a true-scale weave, and
with the old UVs the crop could not land where it was meant to. Cloth being
near-uniform is the only reason nobody saw it. Fabric clouds will look different
— they will look right.

**The artwork needed three corrections**, all in
`scripts/build-cloud-series.py`, all reading the supplied folder and writing
nothing back to it:

*Trim.* The shapes are drawn inset — the hexagons fill 84% of their canvas
width. Untrimmed, the projection maps the panel onto a picture with a margin
round it and every hexagon wears a white ring. Trimmed, image edge = shape edge
= panel edge, and every one of the 64 then matches its model's plan footprint to
within **1.05%**.

*Turn.* The CL-04 and CL-05 triangles were drawn pointing LEFT; CL-01 and CL-03
point up, and so do the models.

*Bleed.* The drawn corners are rounded more than the panel's are, so the panel
reaches past the artwork and samples the white behind it — pale wedges at the
corners of every triangle, and just visible on the hexagons. Fixed the way print
does: the whole background is filled outward from the nearest drawn pixel. Not
one pixel the artist drew is touched, so the design keeps its exact size and
position. Done on a pyramid (reduce 8:1 averaging the ink only, walk there, blow
back up as a soft backdrop with the real artwork over it) because a pixel-by-
pixel walk at 1400 px was too slow to reach a corner.

518 MB of source becomes **22.7 MB** across 64 files at 1400 px.

**Shape is not a question.** A swatch code is `CL-01_Blue` — a design and a
colour, and nothing else — because a spec carries one `colour` string and
everything downstream of it takes that string as the finish. Designer Textiles
settled this shape already with `FB1_Blue_2`. The shape comes from the cloud
that was placed; a code carrying its own could say hexagon while sitting on a
circle. It IS in the texture key, because four shapes of a design are four
files and a ceiling of circles must not hold the hexagons.

**The back face is plain.** Printing is something done to a face, so the panel
and its cap are now on two materials where they shared one. They still agree for
a colour and for cloth, which are two sides of one board.

**Guard** a `CLOUD SERIES` section: the projection's corners and direction, the
refusal on a zero-extent panel, the 64-image matrix, the aspect match, the turn,
the trim, the code split, the family, reconcile against a manifest that has not
loaded yet, retain, the two materials, and two designs making two order lines.

**Open** The two triangle MODELS face opposite ways in the room — a 900 and a
1200 placed side by side point at each other. That is the files, not the
texture, and each one wears its design correctly; Rotate turns one to match.
Left alone rather than turning a supplied model.

CL-02 is missing. CL-05's square was drawn with a white border where
the other three are full bleed — trimmed away here, on the assumption it was an
artboard margin rather than a design. The aspect tolerance is set at 1.5%
against a measured worst of 1.05%.


### Layout presets are baffle presets

Asked for as "remove the layout presets section from the clouds product", and
the reason turned out to cover the tiles too.

Every one of the five presets — VMT field, Blade field, Tapered wave, Ombre run,
Perimeter band — builds `defaultBaffleParams()`. There is no cloud preset and no
tile preset. The panel was rendered for all three products regardless, so on
clouds or tiles those buttons did not lay out what you had: `applyPreset`
replaced the whole ceiling with a baffle field and left the product picker still
saying Clouds. Not a preset misbehaving — a preset for one product offered on
another.

Now gated on `PRESET_PRODUCTS = ['baffles']`, a list derived from what the
presets ARE rather than from a judgement about which products deserve them. Add
a product to it when a preset exists that can build one.

The store's `applyPreset` is untouched. Taking away the button is not the same as
taking away the layout: it is still the baffle path, still correct there, and a
future cloud preset will need it.

**Guard** `every preset builds a baffle and nothing else` (checked by running
each preset's own `product()` and looking at what comes out, so a new cloud
preset makes this fail and prompts the list to be updated), plus the gate and
the verb.

### Fly — the fourth product

Two models arrived in `models/Fly`, with ten Designer Textile shades in
`textures/fly`. Nothing picked them up: the manifest scanner reads Cloud,
baffles, ceiling_tiles and rooms, and Fly is none of those.

**What it is.** A pinwheel of fabric-faced wings on a central hub. Each wing is
456 x 585 mm of felt, 81 mm thick.

| | wings | plan | depth |
|---|---|---|---|
| Fly 4 | 4 | 1099 x 1166 mm | 363 mm |
| Fly 8 | 8, two pinwheels end to end | 1099 x 2366 mm | 362 mm |

No wire in either file — a cloud arrives with 400-1000 mm of modelled
suspension and this does not, so the drop is a gap the renderer leaves rather
than a part it scales.

**The blocker was weight.**

| | triangles | file |
|---|---|---|
| a cloud | 6,540 - 12,268 | ≤ 0.7 MB |
| a baffle | 44,592 - 61,314 | ≤ 1.9 MB |
| Fly-4 as delivered | 1,652,970 | 39.5 MB |
| Fly-8 as delivered | 3,133,284 | 73.2 MB |

**97% of it was invisible.** The felt — the entire form anybody sees — is 57k
triangles in Fly-4 and 115k in Fly-8. The rest is CAD hardware: the densest part
is a 12 x 5 x 11 mm bracket carrying **28,606 triangles**, about 60 million per
square metre. Fly-8 took 7,119 ms to parse in the browser.

`scripts/build-fly.mjs` was written to fix that: keep the wings exactly as they
came, replace every other part with its own oriented bounding box. Twelve
triangles for up to 65,502, 28x lighter, 30 ms to parse instead of 7,119.

**It was rejected, and the question that killed it was the right one: "have you
completely replaced the existing frame?"** Yes — 84 of 88 meshes. I had
described it as "simple proxies", which was accurate and far too quiet. Measured
against the parts they stood in for (surface area against bounding-box area,
where a solid box scores 1.0):

| | parts | |
|---|---|---|
| 0.9 - 1.0 | 5 | was effectively a box already |
| 0.7 - 0.9 | 17 | close |
| 0.5 - 0.7 | 20 | loose |
| under 0.5 | **24** | the box is noticeably fatter |

The worst score **0.03**: 900 mm parts under a millimetre thick, drawn as
13 x 20 mm bars. And there was no cheap middle ground — keeping real geometry
for just the badly-approximated parts costs 556k / 1,044k triangles, because the
parts a box flatters least are exactly the ones carrying the triangles.

**Then: simplify, not substitute.** Asked next whether the dense parts could
just be removed. Measured, they cannot — dropping every hardware part under
50 mm saves **9%**, because the weight is not in small hidden brackets but in
the long visible rails. But every heavy part carries EXACTLY 65,501 triangles
whether it is a 13 x 20 mm rail or a 1 x 3 mm wire, which means the count is not
detail at all: a swept surface sampled at a fixed resolution on parts that are
straight extrusions. That is a simplification problem.

`meshoptimizer` was already in node_modules. Hardware only, felt never touched:

| | triangles | file | worst surface moved |
|---|---|---|---|
| Fly 4 | 1,652,970 → 359,560 (4.6x) | 39.5 → 15.4 MB | 0.031 mm |
| Fly 8 | 3,133,284 → 756,728 (4.1x) | 73.2 → 32.3 MB | 0.438 mm |

Parse, measured in the browser: **4,270 ms → 130 ms**.

**Two bugs on the way, and the second is the lesson.**

*Borders.* Left unlocked the simplifier is free to eat the open edges of every
thin shell, which on a 3 mm rail means eating the rail. `LockBorder` costs
triangles (209k → 359k) and keeps the frame.

*A broken compaction wrote NaN into every position.* meshopt's `compactMesh`
remap is not indexed the way the code assumed, and reading past the end of an
attribute gives `undefined`, which a Float32Array stores as NaN. **Every count
still read correctly** — 88 parts, all present, hangs from 4 points, worst
surface lost 5.7% — and the rendered model had no frame and no rods at all. The
bounding-box gate could not see it either, because a collapsed part still spans
the same box.

What caught it was rendering the two side by side and diffing the pixels: 33.7%
of the model's pixels differed. After the fix:

| view | shading differs | silhouette differs |
|---|---|---|
| from below | 0.09% | 0.09% |
| below, angled | 0.13% | 0.07% |
| from above | 0.15% | 0.10% |
| edge on | 0.35% | 0.24% |
| from the side | **0.71%** | 0.21% |

So the gates are now: surface AREA per part (a box cannot see a collapse), an
outright NaN check, the felt asserted identical to the triangle, four hanging
points, and every part present. The build writes nothing unless all of them pass
on both models.

**The earlier decision — ship the frame as modelled**, at 39 and 73 MB — held
for one round. The loader normalises
at run time the way lib/clouds does: bake the world matrix, millimetres to
metres, centred in plan with the top at y = 0. Measured in the browser: 362 ms
to fetch Fly-8 and **4,849 ms to parse** it. The geometry is loaded once and
shared, so ten Flys of one size cost one upload.

The script is kept and still works if this is revisited; nothing calls it, and a
guard fails if a `corrected/` folder reappears — a derived model silently
becoming what loads is exactly the kind of thing that goes unnoticed.

The wings are found by MATERIAL: one material in each file is called "Blue felt"
and the other 77 / 169 are called matNN. That is the only deliberate label in
the file and it marks exactly the right meshes.

**Ten shades, all FB3**, and they are ten of the 275 Designer Textile panels the
baffles and clouds already offer — same shade codes, same 3401 x 7937 sheet — so
a Fly and a baffle in FB3 Rust 4 are the same cloth at the same scale. The files
are named the other way round from the key (`Blue_FB3_2.jpg` for `FB3_Blue_2`).
Because they are on disk they are read from disk: `registerLocalPanels` in
lib/textiles takes a key-to-URL map, so anything wearing one of those ten gets
the local copy — no CDN round trip, no CORS, works offline. Verified by reading
the network log: `textures/fly/.../Rust_FB3_4.jpg`, not CloudFront.

**Face area is the felt, not the footprint.** Four wings are 1.6 m² of cloth
inside a 1.28 m² plan, because they overlap in elevation. Ordering a Fly by the
rectangle it hangs in would under-count the cloth by a fifth, so the schedule
counts `FLY_WING_M2 x wings`.

Quarter turns, not eighths: a Fly is a rectangle, so 45 degrees would leave it
sitting across a grid it cannot be set out on. A cloud turns in eighths because
it is round, hexagonal or square about its own centre.

**Guard** a `FLY` section — the build actually ran, the originals are untouched,
nothing is heavier than about a baffle and a half, the spec is blank until
answered, reconcile, all ten shades exist both as keys and as files, the
footprint and its swap under rotation, the schedule's face area being larger
than its footprint, and a place / save / load round trip.

**It has to touch the ceiling.** Reported straight after, with the gap circled:
four rods stopping in mid-air under an empty slab. A Fly's suspension IS
modelled — a fixing, a rod, a bracket, stacked, with the frame threaded through
it — and it reaches the top of the assembly, so at a drop of zero it touched and
at 350 mm it did not. The first note here said there was no wire in the file;
that was wrong, and it is what made the gap look like a choice.

A cloud scales its wire because a cloud has ONE wire. This has a stack of
separate parts, and stretching those in place would pull them apart from each
other. So the assembly stays rigid and the renderer draws an extension above it,
at the points the model itself hangs from. Those points are read off the
geometry rather than listed — the parts that reach the top are the fixings — and
both models come out at four, x = ±238 mm, on a 13 mm square section, which is
what the extension is drawn as so it reads as the same rod continuing.
Deduplicated on plan position, because a fixing is two nested pieces (13 mm over
10 mm) in one hole and two rods there would z-fight.

Measured at 50, 350, 800 and 2000 mm: four rods, gap to the slab **0** at every
one.

**Open** Fly 8 reports 16 felt meshes for 8 wings and Fly 4 reports 4 for 4 —
the two files draw a wing differently. Recorded as `feltMeshes` rather than
divided by a number that holds for one file.

### A cloud is 40 mm, and hangs where a slider or a keyboard says

**Thickness.** One option, 40 mm, and it comes pre-selected. A field with a
single answer is not a question; clicking it only agrees with it. That is not a
reversal of "do not pre-answer" — Direction had two real choices and this has
none.

The interesting part is that **the models disagree.** The eleven files are drawn
at 11.6, 20, 20.3, 22.6, 26.7, 34, 34.1, 34.9, 39.1, 40.3 and 43.2 mm — no two
sizes alike — and the panel used to end by reporting that measurement. It cannot
say both: one number is orderable and the other is a drawing. Asked, and the
answer was to show 40 and leave the models alone. So the note now gives the
panel's width and depth only, and `thicknessMm` appears nowhere in the UI.

The thickness is in the schedule key, so a second thickness arriving would be a
second order line rather than a silent merge.

**Suspension height** is now a slider over the stepper. Both, because they are
good at different things: 50 to 2000 mm is two millimetres a pixel on a
sidebar-width slider, so sweeping finds "about there" and cannot land on 745,
which is what typing is for. Measured live — the slider set 1.200 m, then typing
745 stored exactly 0.745 while the thumb rested on the nearest step. The value is
the typed one; the slider is an approximate control and does not round it.

Clouds only, as asked. Baffles and Fly keep the plain stepper, and a guard says
so rather than leaving it to look half-converted.

**Guard** a `A CLOUD IS 40 MM` section: the one thickness, that the models
genuinely disagree with it (so nobody later "fixes" the panel by reading it off
a model), that a blank cloud opens with it answered while everything that IS a
question stays unanswered, that reconcile can never null it, that it reaches an
order line, that the panel no longer prints `thicknessMm`, that the control
contains both a slider and a stepper, and that Fly was left alone.

### Focus on a cloud

A cloud got no focus view for a long time, and the reason was written down: it
is one panel, there is nothing in there to pick out, so a view whose whole point
is reaching into a set had nothing to reach for.

That reason was about EDITING and the ask is about LOOKING. At four metres a
1200 mm cloud is a coin; a Cloud Series watercolour or sunburst cannot be judged
from there at all. So it opens straight to the cloud, large, on the ceiling
scene's own background — no solo toggle, no per-part editor, nothing to click.
The panel beside it is the same CloudFields the sidebar uses.

**One cloud, one implementation.** The model, its two materials and its finish
moved out of CloudSet into `src/three/useCloudModel.js`, and both views use
them. The finish alone is three branches — a flat colour, a photographed fabric,
a printed design — and each has been wrong at least once; a second copy would
mean fixing every fault twice and learning about the second copy later. A guard
fails if either view grows its own.

**The bug it shipped with for one build.** `isFinRun` is a BAFFLE predicate:
`!params?.model || ...`. A cloud has no `params.model`, so it answers **true**
for anything that is not a baffle — and the chooser asked it directly. The first
cloud focused was met with "Focus on what? Whole baffle / Single fin" over a
hexagon. Now gated on the product type first, and guarded by asserting that
`isFinRun` still answers true for a cloud, so the gate cannot be quietly removed
as redundant.

Four existing guards broke when the finish moved, which is them working: they
read CloudSet and the code was no longer there. Repointed rather than relaxed.

**Guard** a `FOCUS ON A CLOUD` section — the view exists and the modal opens it,
the cloud panel is what sits beside it, no solo toggle, the button appears on a
cloud and still not on a Fly, the chooser gates on type, and neither view
carries its own copy of the finish.

### Five finishes on an imported model

`MODEL_FIN_FAMILIES` was every family — all eight — on the reasoning that a
shortlist belongs to a catalogue type and an imported model has none. Cut to
five: Solid Coloured PET, Wood Classic, Designer Textiles, Colour Core Fabric,
Colour Core Ombre. Signature Ombre, Solid Colour VMT and Concrete came off.

**Worth having asked.** The screenshot showed five entries with the fifth clipped
at the image edge, and the list it came from has eight — so "keep these" and "the
capture stopped there" looked identical. It was also the only one of five
different finish-family lists in the app that matches those five: VMT offers four
families, Blade and Box three, Embossed two, and none of them is this. Trimming
the wrong one would have left Embossed with a single family and a default naming
a colour nothing publishes.

Nothing is deleted. The three are still real families and the catalogue types
still offer them — Concrete and Signature Ombre on a VMT baffle, Solid Colour
VMT on an Embossed one. Only an imported model may no longer wear one.

A layout saved before the cut is not broken: `reconcile` already falls back to
the first offered family and re-picks a colour that family publishes, so an old
model set on Concrete lands on Solid Coloured PET rather than on a finish nothing
can draw.

**Guard** the list is exactly those five in that order; each of the three is off
the model list AND still a family in its own right AND still offered by the
catalogue type that needs it; and an old set on any of the three falls back to a
real family with a real colour.

### Three finishes on a cloud, and the placeholder retired

"Do the same for clouds" could not be done literally: clouds offered Solid
Colours, Cloud Series and Designer Textiles, and only the last of those is on
the five-family baffle list. So the list went back out with what each family
actually holds, and the answer came back as **Solid Coloured PET, Cloud Series,
Designer Textiles**.

**The placeholder is gone.** `cloud-solid` was four invented hexes — its own
comment read "placeholders for testing the cloud range, not transcribed from the
workbook. Replace the values here when the real range arrives." Solid Coloured
PET is that real range, 44 colours, already doing the job on baffles. A cloud now
opens on it.

**Colour Core was deliberately not added**, though clouds have neither and
baffles have both — that is 163 photographed finishes. Adding them is not a list
change: each would need the same per-panel true-scale crop the fabric already
gets, or it would land at whatever scale the exporter left behind. Left for when
it is asked for properly.

**A saved layout does not lose its colour.** Falling back on family alone would
have left every old cloud on PET with its colour dropped — "Blue" is not a code
PET publishes — so a cloud that had a finish yesterday would open today asking
for one. `LEGACY_CLOUD_COLOURS` maps the four onto their nearest PET colour by
RGB distance, all within 40 of 255:

| was | becomes |
|---|---|
| Red | Marmalade |
| Blue | Prussian Blue |
| Green | Jalapeno |
| Yellow | Old Gold |

Applied only when the spec actually says `cloud-solid`, so a PET colour that
happens to share a name is never rewritten. Verified by loading a v3 file with
`family: 'cloud-solid', colour: 'Blue'` — 1 loaded, 0 dropped, came back as
`pet-solid` / `Prussian Blue`.

**And a signature got simpler.** `reconcileCloud` took the swatch list as an
argument and all four call sites handed it `cloud-solid`'s, whatever family was
actually chosen — harmless only while cloud-solid was the one solid family a
cloud had. It now looks the swatches up from the family itself.

`cloud-colours` — a family with four swatches that nothing offers — was left
alone, as asked. It is still dead.

**Guard** the list is those three in that order, the placeholder is offered
nowhere, the solid range is the real one rather than a four-swatch stand-in, and
each of the four legacy colours migrates to a colour PET actually publishes.

### Designer Textile, colour first

The picker asked for a fabric, then a colour GROUP, then a shade — and the group
step was a filter: pick Blue and the other 47 shades disappeared. Asked to show
them all at once under group headings, which is what `TextileColourPicker` now
does on baffles, clouds and tiles.

**The order inverted too**, and that was the better half of the ask. The range
is five WEAVES crossed with 55 COLOURS and those are not the same kind of
question: the colour is the decision, the weave is a refinement of it. Asking
for the fabric first made the colour a sub-choice of something nobody had an
opinion about yet.

So: all 55 on screen under their eight headings — Grey 10, Neutral 11, Blue 8,
Green 7, Yellow 5, Rust 5, Pink 5, Brown 4 — pick one, and the five weaves
appear beneath it as **thumbnails of that very shade**. Picking Rust_3 fetches
FB1_Rust_3 through FB5_Rust_3, so choosing between weaves is looking at five
pictures of the same colour rather than five letters. They are drawn bigger than
the swatches above, because that is the difference being looked for.

Both directions keep what was already chosen: changing colour keeps the weave,
changing weave keeps the colour. And once a weave is in hand the whole colour
grid is pictured in it — verified live, picking FB4 repainted every swatch as
FB4.

**Clouds followed immediately**, and the guard did its job on the way: it failed
with `clouds moved over without the decision being made` the moment CloudFields
was switched, which is precisely what it was written to say. Updated on purpose
rather than relaxed.

**Tiles followed, and the `textile` path finally got exercised.** A tile writes
its finish under `textile` rather than `colour` — it already has a `wood` and
the two are read from different maps — and that prop existed but no product had
ever used it. Driven live: eight headings, 55 shades, picking Grey_4 wrote
`textile: "FB1_Grey_4"` and created **no** stray `colour` field.

**But it changes nothing anyone can see**, and that is worth knowing rather than
quietly shipping. The Designer Textile TILE RANGE is hidden — asked for earlier
as "hide the designer textile option on ceiling tiles" — so the branch this
picker sits in is not reachable from the Type list. It is reachable the way a
saved layout reaches it, which is how it was tested, and the day the range is
unhidden it will already be the colour-first picker. One word in tiles.js brings
it back.

**TextilePicker is now dead code** — nothing imports it. Left in place rather
than deleted: the new picker is considerably taller, and if that proves annoying
in the sidebar, reverting is one import line per file. Delete it once the height
has been lived with.

**Guard** eight groups and all 55 shades with no filter, every group named and
none empty, a shade offered in every weave it is actually made in, every panel
carrying a thumbnail, and baffles on the new picker while clouds and tiles are
deliberately not.

### Cloud Series is picked colour first, and the designs are pictures

The family asked for the DESIGN and then the colour. Turned round: colour first,
and the design row is thumbnails of the artwork rather than the codes CL-01,
CL-03, CL-04, CL-05.

**The reversal is only sound because the grid is full.** Four designs x four
shapes x four colours, all 64 images present, counted off the manifest rather
than assumed. So picking a colour first never shortens the design row. Both
directions are now asserted (`coloursForShape`, `designsForColour`), because
completeness is a property of the ARTWORK -- it changes when somebody drops a
folder in, not when somebody edits this repo. CL-02 arriving in two colours
would have to narrow the row, not offer a file that is not there.

**The thumbnails could not come from the shipped render.** Two reasons, and the
second is the interesting one.

Size: the renders are 1400 px and 169-528 KB. Four in a sidebar is 1.4 MB of
download and 31 MB of decoded RGBA for four chips an inch wide.

Shape: the render is BLED. `bleed()` smears the artwork outward so texture
filtering never drags white onto the panel's edge, which means a built triangle
has painted corners -- sampled, not assumed: `CL-01/triangle/Blue.jpg` reads
(236,241,245) at top-left. Fine on a mesh, which supplies its own outline;
useless as a picture, where the outline is the only thing that says which shape
you are looking at.

The supplied artwork is the panel drawn ON WHITE. So the thumbnail is taken in
the same pass as the render, after the turn and the trim but BEFORE the bleed --
one line earlier in `build-cloud-series.py` and that is the whole difference. It
keeps the white, and with it the shape's own anti-aliased edge. A triangle cloud
shows triangles; nothing in the app has to know how to draw a hexagon. Taking it
from the same pass rather than from a second reading of the source also means
the two cannot disagree about the turn -- which matters, because pointing
CL-04's triangle the wrong way is the fault this range arrived with.

64 thumbnails at 128 px, 217 KB for the set, 4.9 KB worst. `--thumbs-only`
MERGES into the manifest instead of rewriting it: the render JPEGs and every
measured field stay untouched, verified by mtime (0 of 64 rewritten) and by
diffing the manifest to nothing but the two new keys. Re-encoding 22.7 MB of
JPEG through a different Pillow than built it is a change whether or not
anybody meant one.

**Two things found by testing rather than by reading.**

The design row wrapped 3 + 1. A fixed 64 px tile made four buttons 312 px wide
in a row measuring 237. Now a four-column grid, which divides the width it has
instead of asking for a width it does not: about 51 px a tile, one line.

The colour chip and the design tile could carry the SAME tooltip. The chip was
titled `${from} ${c}` -- the design it happens to be pictured in -- so it read
"CL-01 Red", and the design tile below it reads "CL-01 Red" too. Two controls,
one string, two meanings. A chip is titled by what it chooses. This one broke a
test of mine before it could have confused anybody, which is the only reason it
was found.

**A measurement error worth recording, because it nearly became a bug report.**
`getComputedStyle(btn).backgroundColor` returned a stale value across three
separate probes, and on the strength of it I had concluded the chips were not
restating per design. They were. The raw `style` attribute showed the correct
hex all along, and the four designs' rows match the manifest exactly. React
fibers misled the same way -- `__reactFiber$` can hand back the alternate, whose
props are one render behind. Read the DOM attribute, not the computed style, and
not the fiber.

**Guard** the grid full in both directions and the two lists mirroring each
other; every panel carrying a thumbnail that is a different file from its render
and named for its own design, shape and colour; the set under 400 KB; the turned
triangles turned in the thumbnails too; the picker asking Colour before Design,
showing pictures not codes, on white, contained not cropped, with the code kept
as the caption and the chip titled by its colour. The old guard that pinned
"a design is named by its code" matched the `<Choice>` element that is now gone
-- rewritten to pin the decision (the caption IS the code, nothing maps a design
to a word) rather than the markup that happened to express it.

1503 passing, 8 pre-existing failures. Build clean.

---

### TEMPORARY: a rotator for Cloud Series artwork

Reported: the triangle artwork does not line up with the triangle panel. Built a
dev-only rotator so the angle can be found by eye and read off, because
measuring did not find it.

**What measuring said, so it is not measured again.** The triangle panel's plan
area centroid sits 13.19% off centre along z and 0.0000% off centre along x, so
the apex is on the z axis, the panel is symmetric across x, and this is not a
quarter-turn case that projectCloudUV is mishandling. Its apex test resolves
that panel to v = 1, which is the top of the image, which is where the artwork's
apex is. By every number available it already fits.

I also checked for a MIRROR, since a ceiling panel is seen from underneath and a
top-down UV projection viewed from below would come out handed -- and a mirror
is not reachable by any rotation, which would explain a fault that turning never
cures. It is not that either: projected through the app's own Below camera, the
vertex at u = 0.365 lands at screen x -0.843 and the one at u = 0.635 at -0.762,
so u increases to the RIGHT and the artwork reads as drawn. Ruled out by
projection rather than by looking at it, after a first look through a probe
camera of my own suggested the opposite -- that camera used up = -z, which is
its own handedness and not the app's.

So: instrument, don't theorise further.

**What it is.** `src/lib/uvTune.js` plus a `UvTuner` block in CloudFields.
Angle: slider (-180..180), snaps at 0/90/180/-90, one-degree nudges. Size: a
slider in PERCENT (25..300), snaps at 50/100/200, one-percent nudges. Then
Mirror horizontal, Mirror vertical, Reset, and a selectable report of every
design/shape that is not square.

Mirror is there deliberately: if no angle looks right, the answer is not an
angle. Size likewise -- if the artwork sits correctly at 103%, that is a
measurement of how far past its own edge the image was trimmed, and it belongs
in the build script rather than in a slider.

**The size arithmetic runs backwards, and that is the one sum here that can be
wrong without looking wrong.** `repeat` is how many times the image spans the UV
square, so bigger artwork is a SMALLER repeat: 200% is repeat 0.5. A slider that
scales the wrong way is ten minutes of fighting the tool before anybody suspects
the tool. So it is pulled out into `repeatFor(tune)` -- a pure function, no
texture needed -- and tested: 100 -> 1, 200 -> 0.5, 50 -> 2, and 125% with a
mirror -> -0.8, so the sign carries the flip and the magnitude the size. The
guard was checked by inverting the division and watching three checks fail.

Zero is clamped rather than divided by: `100/0` is Infinity in a repeat, which
is a black panel and no clue why. Every scale in {0, 1, 25, 100, 300, 99999,
NaN, undefined} is asserted to produce a finite repeat.

Per DESIGN and SHAPE, applied to all four colours at once -- the four colours of
a design are one artwork, and nobody wants Blue straight and Red turned.

**It cannot escape.** It sets `rotation`, `center` and `repeat` on the decoded
THREE.Texture -- handles the renderer already reads every frame -- so a reload
forgets everything and no layout can be saved carrying a number that only
existed while somebody was looking for it. Guarded: the component is behind
`import.meta.env.DEV`, the console handle too, it writes nothing to the spec,
and neither useCloudModel nor cloudSeries imports it. Checked against the built
bundle: `Texture rotator` and `uvTune` appear zero times in dist.

**The texture and not the UVs**, because the UVs are one 23,040-vertex buffer
rebuilt per drag, and because the answer -- if it is a quarter or a half turn --
belongs in build-cloud-series.py beside TRIANGLE_TURNED, where pixels get turned
once rather than every frame.

A rotation in UV space is only a true rotation if UV space is square. Here the
images were built to their panels' own aspects and agree within 1% on all four
shapes, worst 1.113 against 1.121, so a 90 deg turn looks like one.

**DELETE** `src/lib/uvTune.js`, the `UvTuner` component, its import, the
`import.meta.env.DEV && <UvTuner .../>` line, and the guard block in verify,
once the angles are baked into the build script.

1517 passing, 8 pre-existing failures. Build clean.

---

### CL-04 and CL-05 triangles were drawn askew; the turn is baked into the face

The rotator found it: CL-05 triangle wanted `rot 3, scale 108%`. Not a quarter
turn and not a mirror, so nothing in the UV projection, the manifest or the
model was wrong -- a few degrees plus a few percent is the signature of artwork
drawn crooked inside its own artboard, because `ink_box` trims to an
axis-aligned box and the box around a tilted triangle is bigger than the
triangle.

**Measured, once there was something to measure.** Convex hull of the artwork's
own outline, edge orientations folded into the shape's symmetry and averaged by
edge length:

| | tilt |
|---|---|
| the MODEL's triangle | 0.000 deg, and symmetric |
| CL-01 artwork | -0.01 deg |
| CL-03 artwork | +0.07 deg |
| CL-04 artwork | **+1.87 deg** |
| CL-05 artwork | **+1.94 deg** |

Every square 0.00, all four hexagons agreeing. The estimator reads ~0.00 on the
two designs nobody has complained about, which is what makes the +1.9 on the
other two worth believing. And the two that are askew are exactly the two the
build already turns 90 deg -- they were drawn pointing left and never squared up.

**The numbers baked are the EYE's, not the measurement's, and that was a
decision.** 1.87/1.94 was offered and declined in favour of CL-04 2 deg and
CL-05 3 deg, both at 108%. Recorded here and in a comment above FACE_TWEAK so
nobody later "corrects" them back to the measurement and quietly undoes it.

Worth knowing about the 108%: most of it is paying for the turn, not reporting
that the artwork is 8% small. Rotating about the centre pulls the corners inside
the panel and covering them again costs about cos+sin -- 5% at 3 deg. This was
said before the choice was made.

**Baked, not applied at runtime**, in `face_tweak()`, which reproduces three's
`Matrix3.setUvTransform` rather than approximating it -- same inversion (`repeat`
is 100/scale, so bigger artwork is a smaller repeat), same v-up row convention
that the flipY decode forces. Applied after the turn and trim and BEFORE the
thumbnail and the bleed, so the picker and the bled rim both see the corrected
face.

**Checked four ways rather than by looking at it.**

1. Reproduction: `face_tweak(old, 3, 108)` against the newly built file, masked
   to inside the shape -- median 1-3, p95 3-9, at JPEG-noise level.
2. The 0.5% tail was traced, not waved away: excluding the shape edge further
   collapses it 52 -> 9 -> 6, so it is the bleed band, which differs by
   construction because the new build bleeds AFTER the warp.
3. Best-fit offset search over +/-3 px: **(0,0)** for both designs. No residual
   shift; the geometry agrees exactly.
4. Direction: re-measuring the tilt after the bake gives CL-04 +1.91 -> **-0.17**
   and CL-05 +1.86 -> **-0.86**. It CANCELS the tilt rather than adding to it,
   and CL-04 now sits square with CL-01 and CL-03. CL-05 at 3 deg overshoots by
   about 0.9 deg; 2 deg would land it at ~+0.14. Said, not acted on.

**Only 16 files moved**, verified by hashing all 128 before and after: 8 renders
and 8 thumbnails, all CL-04/CL-05 triangle. That needed a new `--only
DESIGN/shape` flag which rebuilds a named set and MERGES it into the manifest;
the alternative was re-encoding 22.7 MB of JPEG through whatever Pillow is
installed today in order to change two panels.

**Guard** the manifest's `faceTweak` and the script's `FACE_TWEAK` against each
other -- both sides, because a generated file agreeing with itself is not the
same as agreeing with the file that produced it -- exactly eight tweaked faces
and no others, all four colours of a design treated alike, and the designs that
measure square left alone. Checked by changing CL-05 to 4 deg in the script
alone and watching it fail. The first version of that guard passed for the wrong
reason: a regex escaped through a template literal into `RegExp` matched
nothing. It is a substring test now.

The panel renders with the map at rotation 0 and repeat (1,1) -- the correction
is in the pixels, with nothing left for the renderer to do.

**The thumbnail must NOT get the zoom, and first time round it did.** Caught by
the person looking at the picker, not by me: the tweaked thumbnails had visibly
grown.

The cause was a plausible-sounding line of reasoning -- "the thumbnail should
show what the panel wears" -- so the tweak was applied before the thumbnail was
taken. But the face and its picture have different jobs.

On the PANEL the 8% is OVERFILL. Once the artwork is turned, its own outline no
longer coincides with the panel's, and pushing it 8% past the edge means the rim
always shows artwork rather than the seam where the artwork stopped. Covering a
3 deg turn needs about cos+sin, 5%, so 8% is that with margin. The panel
supplies its own outline from geometry, so overfilling it costs nothing.

On the THUMBNAIL there is no geometry -- the outline IS the picture -- so the
same 8% cropped the corners off:

| thumbnail | bottom edge on the frame | white margin |
|---|---|---|
| CL-01 triangle | 86.7% | 40.0% |
| CL-03 triangle | 91.4% | 39.2% |
| CL-04, with the zoom | 100.0% | 35.8% |
| CL-05, with the zoom | 100.0% | 35.9% |

100% means the base ran clean off the frame. Taking the thumbnail at the turn
and 100% puts it back: bottom edge 0.0% and 1.6%, white margin 41.2% and 41.7%,
in line with the two designs that are left alone.

So the two treatments are now separate and BOTH are stated in the manifest --
`tweak` for the face, `thumbTweak` for the picture -- because a single field
would hide the fact that they differ on purpose. Guarded: same rot, thumb scale
100, face scale 108, and a check that the thumbnail is resized from its own copy
rather than the overfilled one. Checked by pointing the resize back at the
overfilled image and watching it fail. "The thumbnail should match the face" is
a reasonable thing to think while tidying, and it is exactly how this happened
once already.

1534 passing, 8 pre-existing failures. Build clean.

---

### The right panel is summoned by a selection, and floats

Three changes to one component.

**It is not there until something is selected.** The panel exists to edit the
thing you clicked; with nothing clicked it had nothing to say and was spending
312 px of ceiling saying it. Keyed on `selectedIds.length > 0` -- the ids are the
truth and `selectedId` is derived from them, so keying on the anchor or on
`selected()` would tie the panel's existence to a lookup that returns null for
an id the items list has moved past, which is a flicker rather than a decision.

**The Schedule goes with it, deliberately.** It is not about the selection, so
hiding the panel hides the BOM. A second floating panel with its own top-bar
button was offered and declined: quantities are one click away, select any set.
Worth knowing if somebody later asks where the schedule went.

**It floats.** `absolute inset-y-0 right-0`, so the canvas keeps its full width.
This is the part that is not cosmetic: in flow, every appearance and every fold
resized the drawing buffer, which moves the camera framing and re-fits the view.
Measured across expanded / folded / absent, `main` holds at 744 px and the
drawing buffer at 1160x804 -- previously it dropped by the panel's 312.

The cost is real and stated in the component: the right 312 px of ceiling is
covered while the panel is open, and nothing under it can be clicked. That is
what the fold is for.

**The fold is remembered across selections**, which only works because the
component RENDERS NULL rather than being unmounted by its parent -- a component
that draws nothing still keeps its state. So `<RightPanel />` stays
unconditionally mounted in App, and a guard says so: gating it there would reset
the fold on every selection and nobody would connect the two.

z-10, under the fabric manager's z-20 and the focus views' z-30, so the modals
cover it rather than fight it.

**Guard** that it hides on an empty selection and asks the ids rather than the
item; that it is positioned and not a flex child, with both the open panel and
the folded strip floating the same way; that it sits below the modals; that the
fold is component state and the word never appears in store.js, where it would
reach an exported layout; and that App mounts it unconditionally. Checked by
putting it back in the flex flow and by deleting the early return, each time
watching the right guard fail.

Browser-checked through all seven states -- nothing selected, selected, folded,
deselected while folded, reselected (still folded), unfolded -- with `main`
constant throughout.

One consequence not worth fixing: `Selection`'s "Nothing selected" placeholder
is now unreachable in normal use. Left as a fallback for a selection that holds
an id the items list no longer has.

1530 passing, 8 pre-existing failures. Build clean.

---

### Clouds: four fields become dropdowns, and the rotator goes quiet

Shape, Size, Thickness and Finish family were rows of buttons and are now
`<select>`s. Colour and Design are untouched -- those are pickers you choose by
looking, and a list of hex names in a dropdown would be a worse question.

**The swap changes a contract, silently.** `Choice` passed the option's own
value, so a size stayed the NUMBER 1200. A `<select>` hands back
`e.target.value`, which is always a STRING. `cloudFor` compares with `===`
against the manifest:

    cloudFor('triangle', 1200)    -> the model
    cloudFor('triangle', '1200')  -> null

So an uncoerced size would have made every cloud report no model, with nothing
on screen to say why and nothing in the spec looking wrong. Size and thickness
are both `Number(...)` on the way out, and the guard asserts the strictness as
well as the coercion -- the coercion only matters BECAUSE the lookup is strict,
and a guard that checks one without the other is half a guard.

That guard failed first time for a reason worth recording: it sits earlier in
verify than the CLOUDS section, so `CLOUD_MODELS` was still empty and
`cloudFor('triangle', 1200)` was null. It passed the string half and failed the
number half. The block now loads the manifest itself.

**Shape and size start null**, and a `<select>` shows its first option when its
value is empty -- so without a blank entry the panel would have quietly claimed
a circle was chosen while the "still to choose" line above still said Shape.
Both get a disabled `Choose a shape...` first entry. Thickness and Finish
family always have an answer and do not.

**The rotator is off**, not deleted: `SHOW_TUNER = false`, still AND-ed with
`import.meta.env.DEV`. The angles it was built to find are baked into
FACE_TWEAK, but CL-02 is missing from the supplied set and may arrive askew the
same way, and a one-word switch beats rebuilding the tool. Guarded both ways --
that it is false, and that turning it on still cannot reach a customer.

Checked end to end in the browser rather than by reading: picking Triangle then
1200 through the dropdowns wrote `shape: "triangle"` and `size: 1200` (number),
and the panel reported "Triangle 1200: the panel measures 1166 x 1040 mm",
which is `cloudFor` having resolved a real model from what the dropdowns wrote.

1544 passing, 8 pre-existing failures. Build clean.

---

### The dropdown is built, because a native one cannot be styled

The closed control looked like the app and the open list looked like Windows:
wider than the button, square corners, system blue. That is not a CSS problem
with a CSS answer -- a native select popup is drawn by the operating system and
its width, corners, background and spacing are all out of reach.

Chrome 152 is running here and supports `appearance: base-select`, which would
have fixed it in about 25 lines with the real element kept. Offered and
declined: it lands in Chrome and Edge only, and Firefox and Safari would keep
today's look with nothing on screen to say why.

**So the price was paid in full.** Everything the native element did for free is
now written out: opening on arrow keys, walking with arrows, Home and End,
type-ahead with a 750 ms run, Enter and Escape, focus returned to the button,
closing on an outside pointerdown, disabled rows SKIPPED rather than merely
dimmed, the highlight scrolled into view, and combobox/listbox/option roles with
aria-expanded, aria-activedescendant and aria-selected. Each of those has a
guard, because "it looks right" says nothing about any of them.

**Portalled, and that is not decoration.** Both side panels are
`overflow-y-auto`, so a list drawn inside one is clipped by it the moment it is
longer than the room below the button. It renders into document.body at fixed
coordinates taken from the button and follows it on scroll (capture phase, so it
hears the panels) and resize.

**Attached.** Open, the button squares off the edge they share and the list
squares off the matching one; measured 8/8/0/0 on the button against 0/0/8/8 on
the list opening down, mirrored opening up, 8 all round when closed. Same width
to the pixel, and the list is pulled up 1 px so the two borders land on each
other instead of stacking into a double line.

It flips up when there is no room: with the button at 364 in a 460-high
viewport and 60 px below it, the list drew 236-365 -- above, attached, inside
the viewport.

**It hands back the option's own value**, the bargain Choice made and a native
select could not. So the `Number()` on cloud size is belt and braces now rather
than the fix it was for an afternoon; the comment there says so, because a
comment describing a control that no longer exists is worse than none.

**The room list came too.** It was the last native select and used `<optgroup>`;
leaving it would have put an OS popup directly above a styled one in the same
sidebar. `<optgroup>` became a `group` field on each option.

**Two guard bugs, both mine, both worth recording.**

The "no native select" guard passed for nothing at first: `/^\s*<select[\s>]/`
built through a TEMPLATE LITERAL loses its backslashes, because `\s` is not a
valid escape there, so the pattern silently became `^s*<select[s>]`. That is the
second time this exact trap has been sprung in this file. It is now a plain
string scan with no backslashes at all -- nothing to escape, nothing to lose in
transit.

Then it fired on LeftPanel, correctly by its own rules and wrongly in fact: the
comment explaining why the native element is gone wraps so that "<select> in the
app" starts a line. It strips comments before scanning now. A guard that reads
source has to read the code and not the prose about the code.

Both were proved by injecting a real `<select>` and watching the guard name the
file, then removing it and watching the count come back.

1569 passing, 8 pre-existing failures. Build clean.

---

### Solid Coloured PET comes off clouds

`CLOUD_FAMILIES` is `['cloud-series', 'designer-textiles']`. A cloud is printed
or woven; it has no flat colour.

**Not a deletion.** pet-solid is a real 44-colour range and is still offered on
baffles and fins, so the family stays in the catalogue and only this one list
stopped naming it. Both halves are guarded -- gone from clouds, still on baffles
-- because a range disappearing from one product is a list change and from every
product is a deletion, and the difference is invisible from either guard alone.

**What happens to a cloud already saved on it.** It comes back on the printed
range with NO colour, so it reads as unfinished and the panel says "still to
choose: Design". That is asserted rather than left to be found: there is no
sensible mapping from a flat PET colour to a printed artwork or a woven panel,
and inventing one would silently change what somebody specified. Same for the
older cloud-solid placeholder.

**Two branches are now unreachable and both are kept**, with the fact written
where each one is: the solid arm of `reconcileCloud`, and the flat-swatch arm of
the CloudFields render. They are the third arm of a three-way, and a flat range
may come back. `LEGACY_CLOUD_COLOURS` goes inert with them -- kept because it is
four lines, is correct again the moment a solid range returns, and is the only
record of what those four placeholder colours were. Its "is it applied" test is
gone, because it is not; its "are these real PET codes" test stays, because they
are.

**A latent bug fixed in passing:** CloudFields defaulted `family` to the string
`'cloud-solid'`, which stopped being offered two changes ago. Harmless while the
control was a row of buttons and reconcileCloud always set a family -- but
through a `<select>`, a value matching no option renders a blank button. Now
`CLOUD_FAMILIES[0]`.

**And one the guards found, which is the better story.** The mixed-selection
test set a PET colour on a cloud and then did its real work inside `if (y)`.
With PET gone the colour reconciled away, the cloud would not place, and the two
checks inside would have been SKIPPED rather than failed -- a quiet loss the
passing count absorbs. Adding `ok(!!y)` turned the silence into a failure, and
the failure turned out to predate this change entirely: that block never loaded
the cloud manifest, so `sizesFor('square')` was empty and the cloud has never
placed there. Those two checks have been running on nothing for as long as they
have existed. Fixed, and the count went up by more than the guards added.

1575 passing, 8 pre-existing failures. Build clean.

---

### Five cloud layouts, and presets learn which product they place

Hexagon field, Circle drift, Chequer, Centre cluster, Perimeter ring. Each wears
a different Cloud Series design, so the five buttons show the range as well as
the arrangement. The section now sits between Product and the product's fields.

**The reason clouds could not have presets was one word, three times.**
`applyPreset` built `defaultBaffleParams()`, measured with `baffleCells` and
stamped `type: 'baffles'` on the result whatever was asked for. So a cloud
preset would have had its clouds reconciled as baffles, measured as baffles and
stored as baffles. Every preset now carries a `type` and the store follows it.
The four arrangement helpers took `baffleCells` by name too; they take a `cells`
function now, defaulted to it.

**What each one is, beyond the label.** `field` grew a `stagger` option -- odd
rows pushed half a step, and the one that then falls past the margin is DROPPED
rather than allowed to sit in it. `ring` is new: `perimeter` lays two bands,
top and bottom, which is enough for baffles because a baffle run is already
room-length and covers the sides by being long. A cloud is a discrete object, so
an edge treatment has to walk all four sides or it is just two rows. `cluster`
is a fixed quincunx of five -- a feature that grows with the ceiling is a field
with extra steps.

**No preset sets `rot`.** A cloud turns in 45 degree steps and a turned panel's
plan footprint is not the one `cloudCells` reports, so a rotated layout would be
checked for overlaps against the wrong boxes. Deliberate, and written where
somebody would otherwise add it.

**All five use printed artwork rather than Designer Textiles.** A series code is
one of sixteen this repo builds and can be written down with confidence; a
fabric key comes off a CDN manifest, and a stale one reconciles to null and
quietly refuses to place. Guarded: every field of every cloud preset must
survive `reconcileCloud` unchanged, finish included. Proved by putting
`CL-09_Turquoise` in one and watching it report `cloud-hex-field:null`.

**A guard that passed for nothing, twice, and what fixed it.**

The chequer keys its colour on the CELL, because keying on the flat index gives
stripes whenever a row holds an even number of panels. The end-to-end check --
group the placed panels by row, assert no row is all one colour -- cannot see
that bug on this ceiling: the chequer fits five across, five is odd, so an
index-keyed pattern still alternates. Changing `vary` to `colours[i % 2]` and
re-running failed nothing.

The second attempt asked `vary` directly but passed a different `i` per cell --
0, 1, 5, 6 -- which an index-keyed pattern imitates exactly. Also passed.

What works is ONE FIXED INDEX for every call: a cell-keyed pattern still
alternates, an index-keyed one cannot tell the cells apart at all. It now
reports `CL-04_Blue / CL-04_Blue` when the bug is reintroduced. The lesson is
narrow and worth keeping: a test of "depends on X" has to hold everything but X
still.

**Scoped rather than broken:** the imported-model section looped every preset
and asserted each arranges a baffle model. A cloud IS its own model and carries
no `model` field, so cloud presets ignore one by design. That loop now runs on
baffle presets, and the refusal is asserted on its own rather than left implied
by an absence.

1725 passing, 8 pre-existing failures. Build clean. The count jumped by 150
because the existing LAYOUT PRESETS section runs every preset in every room, and
there are five more presets.

---

### The app opens on clouds

`DEFAULT_PRODUCT = 'clouds'` in store.js, and the brush still opens BLANK --
the type, and nothing else decided.

**A constant rather than two literals.** The opening brush is seeded in TWO
places: the store's initial state and `hydrate()`, which re-seeds it once the
room list has been read. Whichever runs last wins, and which that is depends on
whether the room manifest arrived. Guarded that both sites use the constant, and
checked by pointing one back at a literal and watching it fail.

The test suite was unaffected, which is worth knowing rather than assuming:
verify's own `reset()` sets `brush: { type: 'baffles' }` explicitly, so every
baffle test pins its own starting point and none of them depended on the app
default.

**It exposed a stray field, which is the interesting part.** main.jsx ended boot
with

    if (first?.type) useStore.getState().setBrush({ btype: first.type })

-- opening the baffle brush on a type something can actually be built from.
Correct while the app opened on baffles. With clouds as the default it stamped
`btype: 'blade'` onto a CLOUD spec: harmless to the render, because
reconcileCloud ignores a field it does not know, but it rides into an exported
layout and is exactly the sort of stray key somebody later spends an afternoon
accounting for. Caught by reading the opening params rather than by anything
failing.

Guarded on the brush being a baffle. The consequence is stated rather than left
to be discovered: that seeding now never runs at startup, so a baffle brush made
later by setProduct takes the STATIC default from emptyBrushParams() instead of
the registry's first type. Safe only while the two agree -- both are 'blade'
today -- so verify asserts they do. The day a model set arrives whose first type
is something else, a test fails and the seeding gets moved into setProduct,
rather than the panel quietly opening on a type with nothing to build.

**What the app opens on now:** Clouds, blank, with the five cloud layouts
already on screen under the product picker.

1732 passing, 8 pre-existing failures. Build clean.

---

### The layout presets become one dropdown

Five stacked buttons, each carrying a label and a description, become one
Select. The panel goes from about five rows to one.

**A menu of ACTIONS wearing a dropdown**, and that is the one honest problem
with it. Every other Select in this panel shows live state; this one cannot. It
keeps showing the layout that was RUN -- true the instant it runs, stale the
moment a panel is moved or deleted, with no way for it to know. That was chosen
over resetting to the placeholder, because reading back what you last ran is
worth more than a control that never admits to anything. Written into the
component rather than left as a surprise.

**The descriptions were the real question.** Five hints on screen at once was
the one thing the buttons did better, and a preset replaces the whole ceiling,
so reading one BEFORE committing matters. They are now a single line under the
control showing the HIGHLIGHTED layout's hint -- the one being considered right
now, which is the only one anybody reads.

Following the highlight and not the mouse is the point: the keyboard moves it
too, and a hint that only followed hover would be missing exactly when it was
most needed. That needed Select to say which row is under the cursor, so it
grew an optional `onHighlight`, reported from an effect on (open, active) so it
fires when the highlight MOVES rather than on every render. The callback is held
in a ref for the same reason -- an inline arrow is a new function each render,
and depending on its identity would fire the effect constantly.

**The chosen key is derived, not stored.** `mine.some(p => p.key === ran) ? ran
: null`, so switching product drops a key that means nothing there. No stale
value to clear, no effect to forget to write. Checked in the browser: running
Chequer on clouds, switching to baffles, and the control reads "Choose a
layout" again with the five baffle presets under it.

Also checked: re-picking the layout already shown runs it again rather than
being swallowed as "no change" -- 20 placed, then 20 placed.

**Guard** that it is a Select and not one button per preset, that it offers a
blank first entry, that the shown key is filtered by product, that the hint
follows the highlight, and that Select still reports the highlight including
null on close. Each proved by breaking exactly that line and watching the
matching check fail.

1737 passing, 8 pre-existing failures. Build clean.

---

### The wall configurator's theme, over the top of the ink one

`univicoustic-ui-color-theme.md` is a light theme: white surfaces, navy `#344256`
text, one saturated colour (`#D65757` coral), cool blue-grey lines. This app was
dark ink with a teal accent. So it is an INVERSION, not a recolour --
`text-white`, `border-white/10` and `bg-white/[0.08]` cannot survive on a white
background, and had to be rewritten rather than retokenised.

**Both themes are live**, light by default, while the new one is judged. Toggle
in the top bar. Not persisted on purpose: a reload gives the house theme back,
so a fresh load always shows what ships.

**Tokens by ROLE, not by shade.** `surface`, `line`, `txt-2` rather than
`ink-800`, because a token called ink-800 that is white in one theme is a lie in
the other. Declared twice in index.css — `:root` and `[data-theme='dark']` — as
bare HSL components with no `hsl()` wrapper, which is not a style preference:
wrap them and every `bg-accent/15` and `text-txt/70` in the app silently stops
working.

235 utilities rewritten across 23 files, and **two literals kept deliberately**:
the amber "Focus this cloud" button keeps dark text because amber is light in
either theme, and the Cloud Series artwork card keeps `bg-white` because it is
the supplied artwork's own white artboard.

**The scene was left alone, bar one colour.** The room, the ceiling, the
lighting and every product finish are the thing being visualised, not chrome --
a panel's colour has to be the colour it will be. Only the SELECTION colour
follows the theme: outlines, the placement ghost, the marquee, the focus wire.
Twelve literals across nine files.

Three.js cannot read a CSS variable, so that colour is stated a second time in
`lib/theme.js`. The duplication is guarded rather than tolerated: verify
converts `--accent` from HSL and compares it against `SELECT_COLOUR` in both
themes.

**A silent miss worth recording.** The first rewrite pass reported 194
replacements and looked complete. It was not: every rule ending in
`\[0\.0x\]` matched NOTHING, because `]` and the quote after it are both
non-word characters so `` is never a boundary there. Thirteen
`border-white/[0.07]`, ten `bg-white/[0.03]` and the rest were untouched, and
the script reported zero for those rules without complaining. Caught by grepping
for what should no longer exist rather than trusting the count. Second pass with
an explicit lookahead: 41 more.

**Guard** that both themes declare the same token names (one missing from dark is
an element that renders unstyled only in dark, invisible to anyone working in the
house theme); that the values are bare HSL; that the dark theme still IS the ink
palette hex-for-hex; that the light theme is the spec's hex-for-hex; that the
scene colour matches `--accent`; and that exactly two components still name a raw
colour. Each proved by breaking it: dropping `--fill-2` from dark, drifting
`SELECT_COLOUR.light`, and nudging dark `--surface` all failed with the right
message.

1756 passing, 8 pre-existing failures. Build clean.

**Stale:** `brag-output/brag.mp4` was rendered in the dark theme with the teal
accent. It is still a correct video of the app as it was this morning; it is not
the app as it looks now.

---

### The real logo, in both themes

`public/univicoustic-logo.png` (the lockup) and `public/favicon.png` (the UV/
monogram) are now used. The top bar shows the wordmark instead of a gradient
square beside a typeset "UniVicoustic", and the favicon is linked — it had been
sitting in public/ with nothing pointing at it.

**Two things about the supplied files decided the approach.**

THE LOGO IS TWO COLOURS: a near-black (#221e1f in the lockup, pure #000000 in
the monogram) and the brand orange #ef4935. On the dark theme the black is gone
and the wordmark reads as a floating "V/". The obvious fix is a CSS filter, and
`invert(1) hue-rotate(180deg)` does lift the ink — but it also drags the orange
to **#ff725e**. That is a brand colour being altered to solve a legibility
problem, which nobody would agree to if asked. So public/brand/ carries a
reversed variant per asset, lifting the ink only, with the orange left
bit-for-bit.

THE STRAPLINE CANNOT BE USED. The lockup sets "MAKES SOUND SENSE" at 40% of the
wordmark's height. At the 18 px the wordmark gets in a 56 px bar, that is about
7 px — present and unreadable. The header takes the wordmark band only, which
the build script measures and reports rather than assuming.

**scripts/build-brand.py** derives four files from the two supplied ones, which
are never written to. It gates on the thing that would otherwise break
silently: the reversal must leave the brand orange at the same hex and the same
share of the image, AND must actually lift the ink. Both proved by breaking
them — widening the mask reported "the brand orange moved. 6.0% before, 0.0%
after", and disabling it reported "87.2% of the reversed file is still dark".

**A bug the gate was written for, found before it:** the reversal was first
keyed on distance from #221e1f, which silently missed the monogram's pure black
and produced a "reversed" file identical to the original. It is keyed on
saturation now — dark and colourless is what the two inks have in common.

**Left as supplied, and worth a look:** favicon.png is a 512x512 canvas whose
ink occupies only 406x180 in the middle, so in a 16 px browser tab the mark
renders about 12x5 px and reads as a smudge. A tighter crop would fix it, but
that is changing a supplied asset rather than deriving one, so it is flagged
rather than done.

1769 passing, 8 pre-existing failures. Build clean.

---

### Header: two buttons off, and the app finally says which one it is

**Fabrics and Load are hidden**, behind `SHOW_FABRICS` and `SHOW_LOAD` — the
same bargain LeftPanel makes with SHOW_ROOM and friends, so each is one word
from returning and the code behind it still builds. Both take something with
them, and the constants say so rather than leaving it to be discovered:

- The Fabrics button was the ONLY way into FabricManager. That whole screen is
  now unreachable; the component still builds and App still mounts it behind
  `fabricsOpen`.
- Load was the only way to read a saved layout back in. **Export JSON stays**,
  so the app can now write a file it cannot open. That asymmetry is deliberate
  for now, not an oversight, and there is a guard asserting the note explaining
  it is still there.

**The product name moved under the wordmark**, and that fixed a real fault
rather than being decoration. "Ceiling Configurator" was beside the logo behind
`2xl:inline` — so below about 1536 px, which is most windows and was the
screenshot this request came from, the header read only UNIV/COUSTIC and never
said which of the two configurators you were in. Stacked under the wordmark it
is always on and costs no width: at 16 px the wordmark is about 171 px and the
descriptor sets to about 146.

**Asked rather than guessed.** The request was to put "Wall Configurator" below
the logo, on the ceiling app. Two readings — the literal one would have printed
the other product's name on this app's header. Confirmed it meant this app's
own name before touching it.

**Guard** that both buttons are switched off rather than deleted and that the
code behind them survives; that the product name is present and NOT behind a
responsive `hidden`; and that the export/import asymmetry stays written down.
Proved by turning Fabrics back on and by re-hiding the descriptor behind a
breakpoint.

1774 passing, 8 pre-existing failures. Build clean.

---

## One question at a time

Asked for: "in left sidebar - some input fields are affected by previous ones
right - now make it like every field will unlock after previous field is
filled". Greyed but visible, all four products, strict order down the panel.

**The shape of it.** Each product already declares the answers it needs in the
order its panel asks them — `CLOUD_REQUIRED`, `TILE_REQUIRED`, `FLY_REQUIRED`
and baffles' `REQUIRED` — and `missingFields` has always read those to write the
"still to choose" line on Place. So the staircase reads the same lists rather
than a second order written in the panel: `lib/gate.js` turns a spec and its
chain into the question each field is waiting on, and the panel and that line
can never disagree about what is outstanding.

The chains are **effective**, not static. `baffleRequired` drops Shape for a
type that has none, `tileRequired` drops Grid for a range with its frame built
in and swaps Perforation for Fabric on a fabric-faced range, and
`cloudRequired` keeps the Colour/Fabric/Design label swap so the lock reads
"Choose design first" on a Cloud Series cloud. A field can only be gated on a
question its own spec actually asks.

Fields that used to appear once an earlier answer existed — the cloud Size,
the tile Grid, Thickness and the panel grids — are on screen from the start and
locked instead. They made the form grow under the cursor and hid what was going
to be asked for.

---

### A locked dropdown still opened on a real mouse click

**Symptom** Locked fields were dimmed, `inert` was set, the computed
`pointer-events` on the control was `none`, Tab correctly skipped them — and
clicking one with the mouse opened its list anyway.

**Cause** `Field` wraps the whole row in a `<label>`, and `<button>` is a
**labelable** element. A click landing on the label is forwarded to the nested
control as the label's *default action*. It never travels through the inert box,
so neither guard ever sees it. `elementFromPoint` at a locked dropdown's centre
returned the `<label>`, not the button, which is what gave it away.

**Fix** The label refuses the click itself when locked:
`onClick={locked ? (e) => e.preventDefault() : undefined}`.

**Why it hid for so long** A synthetic `.click()` on the button *was* blocked,
because a dispatched event does no hit-testing. Only a click at coordinates can
see this. Every check after that was done with `page.mouse.click`.

---

### A locked block had no way to say what it was waiting for

**Symptom** With a baffle height still to choose, the finish pickers were greyed
out and nothing anywhere on the panel said why.

**Cause** Some answers are not a single `Field` — a cloud's finish is a family,
a colour grid and sometimes a weave, each bringing its own `Field` — so the run
is made inert as a unit. That wrapper was a bare `<div>` and could only ever be
silent. When it was the topmost locked thing, the panel locked with no
explanation on screen.

**Fix** `LockedBlock` in `bits.jsx`, which takes the same `locked` value a field
does and prints the line when it is the one being waited on.

---

### The explanation was handed to a field that was not rendered

**Symptom** Same silence, in a different place: a baffle with no direction
chosen locked everything below it and said nothing.

**Cause** Only the topmost locked field speaks; the rest just dim. The list that
picks it named `mirror` — the Pattern field — which the left sidebar hides for
any finish that does not fade along the fin. The explanation went to a field
that is not on screen.

**Fix** The order lists what *this copy of the panel* renders. Four surfaces
show four different subsets of the baffle panel, and the tile ranges ask
different questions, so `showPattern`, `asksGrid`, `asksTiles` and `fabric` all
gate their own entries.

---

### Naming the field above by hand unlocked a field it should not have

**Cause** `gate('grid')` and "wait for everything above Thickness" look like the
same question. They are not: Univic Strip has its frame built in, so Grid is not
in that range's chain, `findIndex` answers −1, and a field gated on it reads as
free — Thickness open with no Size chosen.

**Fix** `gate.before(ownKey)`, which asks about the field's *own* position.
A field that is not in the chain is not being asked for at all, so it cannot get
stuck. Both behaviours are kept as assertions side by side, because the two
lines still look alike.

---

### A JSX comment rendered as page text

**Cause** Rewriting the tile face section moved a `/* … */` comment from a
position inside a parenthesised expression to a position *between a tag and its
children*, where it is JSX text. It compiled cleanly and would have printed nine
lines of commentary into the sidebar.

**Fix** Back inside `{/* … */}`. The walkthrough now asserts that the sidebar's
text contains no `/*`.

---

### The test was wrong twice before the code was right once

Worth recording, because both failures were of the kind that *passes*.

**"Contiguous tail" is too weak.** Checking that the locked fields are an
unbroken run at the bottom accepts a panel where Thickness stopped waiting on
Shape: the tail is still contiguous and you can answer two questions out of
order. The invariant is stronger and is stated once — *let u be the topmost
field with no answer; field u is open and every field below it is locked.*

**"Answered" read off the DOM was wrong in two ways.** A field with no hint fell
through to *answered*, which is exactly what Shape and Size are — a row of
buttons and no hint — so they read as filled before anything was clicked. And a
Cloud Series design chip puts its accent ring on a `<span>` inside the button,
so looking at the buttons alone read a chosen design as unchosen.

**One walk was not enough.** `clear()` empties the ceiling and leaves the brush
alone, so walking Wood Classic to the end and then switching Type started the
next range with a size, thickness and finish already chosen — every field
reported answered before a click. Each range now walks from a fresh page. That
is also what exercises the two ranges with no Grid, which is where the
`gate.before` fault lives.

**Guard** `lib/gate.js` is unit-tested directly, including that `0` is an answer
and that a key outside the chain is free. The four chains are asserted against
their `missingFields` so the two readers cannot drift, and against the shape
each range actually asks. Source guards hold the label's `preventDefault`,
`LockedBlock`'s message, each panel gating from its own chain, and the
conditional order entries. Proved by reintroducing all five faults and watching
the walkthrough report each one.

---

## The placement ghost was red either way

**Symptom** The footprint preview under the cursor was red whether the set
could be placed or not, so it had stopped telling you anything.

**Cause** A side effect of the theme change, which is why nothing noticed at the
time. The ghost painted "it fits" in the selection accent and "it does not" in
`#e06c5a`. That read correctly for as long as the accent was the teal this app
shipped with — it was never actually green, it was just green *enough*. Adopting
the wall configurator's palette made the accent `#D65757`, a coral, and put both
answers eight degrees apart on the colour wheel.

**Fix** `PLACE_COLOUR` in `lib/theme.js`: `ok: '#3cb043'`, `no: '#e06c5a'`, and
the ghost reads that instead of the accent. Deliberately **not** themed — a
yes/no signal is information, not branding, and the scene it sits on does not
change with the theme either. The selection halo, marquee and focus wire still
follow the accent, because those say "this is selected" rather than "yes" or
"no". The masked-cell red now comes from the same constant, since a cell you
cannot build on and a placement that will be refused are the same fact.

**The green was picked twice.** The first, `#2fb865`, sat 21° from the dark
theme's teal accent — close enough that a selected set and a ghost would read as
the same signal on a dark scene. `#3cb043` is 42° off the teal and 124° off the
coral.

**Guard** That "it fits" is *actually green* and "it does not" *actually red* by
hue, that the two are more than 60° apart, and that neither is within 40° of
either theme's accent — the last one is the fault stated as a rule, since the
bug was the ghost inheriting a colour whose meaning it did not control. Plus
source guards that the ghost no longer reads `accent` at all, that the halo
still does, and that the blocked red is not written out by hand again. Proved by
setting `ok` back to the light accent, which reports "8deg between #D65757 and
#e06c5a".

**Measured on screen** With a circle 600 brush in plan view: free ceiling
`#9dbe82`, overlapping an existing panel `#966e63`.

1827 passing, 8 pre-existing failures.

---

## A configuration in a URL

Asked for: configurations reachable through a URL. Carrying the whole design,
minus the room and the obstruction mask — "we aren't using them either ways" —
and built only when asked for, by a Copy link button, rather than rewriting the
address bar on every placement.

**It also closes something that was open.** Export JSON could write a file, and
with the Load button switched off nothing in the app could read one — noted at
the time as a deliberate asymmetry. A layout comes back in through a link now.
The file half stands: Export still writes a `.json` the UI cannot open.

**What it carries.** The placed sets, their group names, the ceiling zone, and
the pitch the cells are counted in. Nothing else. `toJSON` and `fromJSON`
already existed and are careful — schema version, pitch rescaling, items that
do not fit are dropped and counted — so the link reuses them rather than
inventing a second way to read a document. `sharePayload` omits fields and
renames none, so a decoded payload can be read straight against `toJSON()`.

**The zone is not the room, which is why it stays.** Cells are indices counted
from the ceiling's own corner. Measured: the default zone puts the origin at
(-3.75, -3.5), and changing the ceiling's dimensions moves it. Drop the zone and
every set in the link lands somewhere else, or off the grid and is discarded.
`hydrate()` always sets one, so it is never absent.

**In the fragment, not the query.** A fragment is never sent to a server, and a
configuration is the reader's own work — a query would write it into access
logs, referrer headers and CDN cache keys on every open.

**Size.** Items repeat, so they compress well: a twenty-set preset is about 430
characters and a twenty-eight-set mixed ceiling about 780, against a 2,000
budget that is what survives being pasted into a chat window rather than any
browser limit. A layout over budget still makes a working link and the bar says
so, rather than letting it be truncated somewhere out of sight.

---

### A truncated link took the whole process down

**Symptom** Four assertions for damaged links passed, and then the suite died
three assertions later with `Z_BUF_ERROR: unexpected end of file`.

**Cause** The gzip helper took a writer and never handled its promises:

```js
writer.write(bytes)   // not awaited
writer.close()        // not awaited
```

When the stream errors — which is exactly what a cut-short link does — both
reject. The reader's rejection was caught and turned into "this link is
damaged", so the user-facing behaviour was already right; the writer's
rejection had no handler at all. Unhandled, that kills the process under node
and logs a spurious console error in the browser, *after* the failure has been
reported properly. Which is why it surfaced several tests downstream of the one
that caused it.

**Fix** The write side is pumped into a promise that swallows its own error,
awaited in a `finally`. The reader's rejection is the same fault with the
better message, and it is the one that propagates.

---

### The round-trip guard compared cells and called that identical

**Cause** Caught by breaking the zone on purpose. With the zone dropped from the
payload, the two synthetic guards failed and the store round trip still passed
— because it compared `cell` values, and a cell is an INDEX. It survives
verbatim when the origin has moved underneath it, so every set reported
"identical" while sitting somewhere else on the ceiling.

**Fix** The round trip asserts the zone comes back too, and is laid out in a
non-default zone so there is something to lose. `reset()` clears the override,
and with no zone set the frame is the room's own — the guard would have
round-tripped perfectly and proved nothing.

**Guard** That a link says nothing about the room or the mask; that the zone and
the pitch do travel; that an item drops the `id` and `ci`/`cj` fromJSON makes
again; that encoding is URL-safe and round-trips exactly; that a link made by a
newer build, one cut short, and one that is not a link at all are each refused
with a message a person can act on; and the whole path through the real store —
toJSON out, fromJSON back, link in between. Proved by reintroducing five faults,
including the dangling rejection, which fails by killing the suite exactly as it
did when found.

1860 passing, 8 pre-existing failures.

---

## A selected set looked like an error

**Symptom** Selecting a set put a red patch under it. Reported as: the ghost
should be green when it can go there.

**Cause** The same side effect as the placement ghost, one step later. The halo
under a selection was drawn in the selection accent, which the light palette
made a coral — so once the ghost started using red for "will not go here", a
selected set sat under the refusal colour while being perfectly legally placed.

**Fix** The halo speaks the placement language: `PLACE_COLOUR.ok` / `.no`. It is
the same question about the same footprint, so it should be the same two
colours.

**It is green almost always, and that is correct rather than useless.**
`update()` turns down any move that would put a set somewhere illegal, so a set
that is on the ceiling is on it legally — there is no state in which a resting
selection is invalid. Green there means "this is fine", which is exactly what
was wrong about it being red.

**The red had to be given something to mean**, or "green if it's placeable"
would have been a condition that is never false. A drag MOVES the set live
rather than previewing it, so when the cursor asks for an occupied spot the set
just stops following and nothing said why. `dragBlocked` records that refusal
and the halo turns red for as long as it lasts.

Deliberately NOT refused: a drag past the edge of the ceiling. `clampCorner`
holds the corner inside the grid rather than turning the move down, so the set
stops at the edge and stays green — honest, because the edge is somewhere it
can be.

**The outline keeps the accent.** "This is the one you have hold of" is
identity, not permission, and the two should not be the same colour. Guarded, so
that "make the halo mean placeable" is not later read as "make selection green".

**Four components can drag**, and each clears the refusal wherever it forgets
the drag — which for BaffleSet and TileSet is two places, because a double-click
opens the focus modal on top of a drag that never got its pointerup. The guard
counts: `endDrag()` calls must equal `drag.current = null` assignments, so a new
drag surface cannot be added with only half the wiring.

**Two guards were matching prose rather than code.** The ghost's "no accent"
guard slices up to the next function and so swallowed that function's docblock —
which now talks *about* the accent, and failed a guard on code that does not
touch it. It tests `useAccent` now. And verify's `reset()` did not clear the new
editor state, so a refusal left behind by an earlier section arrived as a red
halo nobody had asked for.

**Verified** with a real mouse drag, in two views because one cannot do both
jobs: Plan for the pixels (the ceiling plane is nearer the camera than the sets
hanging under it, so a press there never grabs one) and Below for the mouse.
Measured at the footprint corner, where the halo shows and the panel does not:
resting `#99ae7c`, refused `#c89883`, released `#99ae7c`.

**Guard** Proved by five reintroductions — the halo back on the accent, a
refusal not recorded, `endDrag` not clearing, one component missing its call,
and "already there" counted as refused.

1886 passing, 8 pre-existing failures.

---

## Box select stuck at the edge of the ceiling

**Symptom** Drag a box select into the edge of the ceiling and the band freezes
there. You have to pull the pointer back over the ceiling before it will move
again.

**Cause** Not what it looked like. The band read `e.point` — the intersection
with the ceiling MESH — and that mesh is exactly the size of the zone. Past its
edge the ray stops hitting it, and react-three-fiber then delivers the event
carrying the CAPTURED intersection instead: **the point where the press
landed**. So the far corner of the rectangle snapped back onto the near one,
`box(from, from)` had no extent, the stale-sample guard threw it away as a bad
reading, and the band kept the last rectangle it had.

**Measured, because two plausible explanations had to be told apart.** The
trace showed the rectangle stopping at `x1 = 3.28 m` and staying there through
another 200 px of pointer travel, with `hoverCell` reading the press cell rather
than anything under the pointer — which is what identified the captured
intersection as the culprit.

**Not the mesh being too small.** A pick plane four times the size moved the
freeze and did not remove it, which ruled out "the events stop arriving" before
any code was changed.

**Fix** Intersect an UNBOUNDED plane through `e.ray`, which is what the item
drag has always done (`BaffleSet`), and clamp the result to the zone with
`clampToCeiling`. A ray has an intersection wherever it is not parallel to the
plane, so the band keeps tracking; the clamp pins the edge that has run out of
ceiling while the other one carries on following. A band drawn out into the room
would be offering to select ceiling that is not there.

Measured after: pinned at `x1 = 3.75 m` — the zone's own edge — while `z1` went
on from 2.24 to 2.86 to 3.49 as the pointer kept moving. No intersection at all
(the ray edge-on to the ceiling) holds the last rectangle rather than collapsing
it.

**Guard** `clampToCeiling` is a pure function in `lib/grid.js` rather than a
closure in the component, so the behaviour is asserted without a renderer: each
edge pinned, and — the point of the whole fix — running out of ceiling in one
axis leaving the other free. Plus source guards that the band tracks an
unbounded plane, clamps to the zone, and never reads `e.point` again. Proved by
putting `e.point` back, which fails three of them.

**Two bad instruments on the way.** A pixel probe looking for the band's
trailing edge reported the same number before and after the fix: it had locked
onto a fixed feature near the ceiling edge, not the band. And the first
reproduction never armed the marquee at all — the Box select toggle is only
rendered under the Select tool, so clicking for it while Place was active found
nothing, and the run measured the selection outline of a band that did not
exist.

**And a third guard matching prose rather than code.** `!/e\.point/` fails on
the file that fixes the fault, because `e.pointerId` contains that string and
the pointer-capture calls sit three lines below. It reads
`/e\.point(?![a-zA-Z])/` now.

1898 passing, 8 pre-existing failures.

---

## A reload emptied the ceiling

Asked for: make the canvas survive a reload.

**Where it is kept.** `localStorage`, not the address bar. A configuration
already travels in a URL, but that link is built ON DEMAND — the address bar is
deliberately left alone while you work. Writing the hash on every placement
would undo that decision, put a history entry behind every click, and re-encode
the document each time a panel moved a cell. So the save is quiet and local:
nothing in the URL, nothing sent anywhere, and it survives a reload, a crash and
closing the tab.

**What it keeps.** The whole document — room, ceiling zone, obstruction mask,
groups, every placed set. A link drops the room and the mask because it is being
handed to somebody else; this is your own session coming back, so there is
nothing to trim. And the BRUSH, which the document does not carry: restoring
twenty panels under a blank panel of fields is the same fault a shared link had,
where the ceiling plainly answers questions the sidebar is still asking. A
session knows what you were setting up, including a spec you had half filled in
and never placed.

**What beats it.** A link in the address bar, which is why the session is read
in an `else`. Following a link means you came to see THAT ceiling, not the one
you were building yesterday.

**Watches the document, not the state.** `hoverCell` changes on every pointer
move; subscribing to everything would serialise the whole ceiling a hundred
times a second while the cursor crosses it. Six references are compared — the
five `toJSON` reads, plus the brush — and each is replaced rather than mutated,
so reference equality is enough. Writes are coalesced at 500 ms and flushed on
`pagehide`, so an edit made just before a reload is not lost inside the window.

**Undo had to be emptied.** `fromJSON` pushes an undo step, and at boot the
state it would return to is an empty ceiling that never existed for the user —
so one press of Undo after a reload would have thrown away everything just
restored. The same applied to opening a link.

**Every way a save can be wrong answers the same:** start empty. No storage,
storage disabled, half-written JSON, an envelope from a future build, something
that is not a document. A save this build cannot read is DROPPED rather than
retried, or the same failure greets you on every reload for ever.

---

### Two tests that lied, in opposite directions

**A same-document navigation is not a reload.** Opening the share link reported
that it had lost to the saved session — but `page.goto` to a URL differing only
in its fragment changes the hash without reloading, so the app never re-booted
and the test read the previous page's state. The link had never been opened at
all. Fixed by going via `about:blank` first.

**A break harness scored on the exit code.** `npm run verify` exits non-zero
because of the eight pre-existing failures, so every break came back "caught"
whether or not anything had failed. Scoring on FRESH failures instead showed
that one of five had not been caught.

**And that one was a guard matching its own commented-out code.** Switching
persistence off by commenting out `keepSession(useStore)` left
`// keepSession(useStore)` behind, which `/keepSession\(useStore\)/` matches
happily — so the guard passed with the whole feature disabled. Anchored to the
start of a line now. Fourth time in this codebase that a guard has matched
prose rather than code; the other three were a comment mentioning `e.point`,
`e.pointerId` containing the string `e.point`, and a wrapped sentence in a
comment block.

**Guard** The round trip, the brush riding along, every malformed save reading
as none, and — the one that matters for performance — that a pointer move does
not write while placing a set does. Proved by five reintroductions, scored on
fresh failures.

1920 passing, 8 pre-existing failures.

---

## A link pasted into an open tab did nothing

**Symptom** Opening a share link in a new tab worked. Pasting the same link
into the address bar of a tab that already had the app open did nothing at all
— no ceiling, no message.

**Cause** Changing only the fragment is a SAME-DOCUMENT navigation. The browser
swaps the hash and does not reload, so boot never runs and nothing ever reads
the link. Found while testing something else: a test reported that a link had
lost to the saved session, and the link had in fact never been opened.

**Fix** A `hashchange` listener in TopBar, which already owns Copy link and the
message line. `history.replaceState` — what Copy link uses — does not fire
hashchange, so the app cannot set this off by writing its own link.

**It asks first, but only when there is something to lose.** A dialog about an
empty ceiling has one sensible answer and is a click in the way. The question
offers Ctrl+Z, and that is a promise the app has to keep: the undo step openDoc
pushes is KEPT here, unlike at boot, because here there IS a ceiling to go back
to. Declining leaves your work alone and says "reload to open the link
instead", because the address bar is then ahead of the screen.

---

### Three callers, one rule about the panel

A document arriving from outside brings no brush, and by this point three
places had to work that out for themselves — boot from a link, boot from a
session, and now a link pasted into an open tab. That is two too many for a
rule that has to be identical in all of them, so it moved into the store as
`openDoc`: `fromJSON`, then the brush — the one the source supplied if it has
one, otherwise the first set on the ceiling.

**Which nearly introduced a regression.** Moving the brush into `openDoc` moved
it EARLIER — before the model seeding in `main.jsx`, which fires on
`brush.type === 'baffles'`. A restored baffle brush satisfies that, so the
seeding would have quietly overwritten the type that came out of the link or
the session with whatever the model registry lists first. The seeding now
stands down once anything has been restored, and a guard says so.

The three guards that had been testing `main.jsx`'s spelling are now
behavioural, driving `openDoc` directly: a document with no brush adopts the
first set, a supplied brush beats the ceiling, and an empty document leaves the
panel alone rather than blanking it.

---

### A guard that passed with the feature switched off

Commenting out `window.addEventListener('hashchange', onHash)` left
`// window.addEventListener('hashchange', onHash)` behind, which the pattern
matched happily. The guard passed with the whole thing disabled. Exactly the
same fault as `keepSession` a few hours earlier, and I had not applied the
lesson to the new guard.

That is five: a docblock mentioning `e.point`; `e.pointerId` containing the
string `e.point`; a sentence wrapped across two comment lines; and twice a
commented-out call matching the pattern meant to prove the call was there —
which is the dangerous direction, because it fails silently in the direction of
"everything is fine".

**Fix** One `codeOf(src)` helper beside `ok()`, which strips comments, used
by every guard that asserts a call is or is not present. The two inline copies
are gone.

**And the break harness was scoring on the exit code**, which is always
non-zero here because of the eight pre-existing failures — so every break came
back "caught" whether anything had failed or not. That is how the `keepSession`
guard went unnoticed in the first place. Scoring on FRESH failures found it.

**Guard** That something listens and stops listening; that it goes through
openDoc; that it asks only when the ceiling has work on it; and that the undo
it promises is not thrown away. Proved by reintroducing five faults, scored on
fresh failures.

1930 passing, 8 pre-existing failures.

---

## A set could not be dragged past its neighbours

Asked for: let a set move THROUGH other sets while it is being dragged, even
where it could not be placed.

**Why it was stuck.** A drag moves the set live rather than previewing it, and
`update()` turns down anything illegal — so the set stopped dead at the first
obstacle. Moving a panel past a row of its neighbours meant moving them out of
the way first.

**Fix** `update()` and `moveGroup()` take a `force`, and nothing but a drag in
progress passes it. The position is checked when the pointer is released.

**Two bounds are NOT lifted**, and they are lifted by different mechanisms,
which is worth knowing before anyone touches this:

- A single set is held inside the grid by `clampCorner`, before `update()` ever
  sees the move.
- A group goes through `moveGroup`, which is not clamped — so it keeps its own
  `onGrid` check even under `force`. Without that, a forced group drag carries
  the whole thing off the ceiling. Proved: with the check moved below the
  `force` shortcut, a two-set group lands at `[10000000, 10000000]`.

**On release**, an illegal position snaps the set back to where the drag
started. Asked for, over dropping it at the last legal spot it passed: where it
lands then depends on the path the cursor took rather than where you let go.

**The halo had to change meaning.** It used to be red when a MOVE WAS REFUSED.
Nothing is refused any more, so it is now red when WHERE IT IS NOW will not do
— which is the same thing to look at and a different thing to compute. It is
the only thing on screen saying the set cannot be left there.

**And drags became undoable, which they were not.** `dragTo` has carried a
comment promising "one undo step per drag rather than one per cell crossed"
for a long time, and nothing was pushing it: every move went through
`{ undoable: false }` and no step was pushed anywhere. `beginDrag` pushes one
now, and `endDrag` takes it back when the drag turns out to have changed
nothing — a click that wobbles should not leave an entry that undoes to itself.

---

### An object literal with two `endDrag` keys

**Symptom** The snap-back did nothing. The guard said the set was still on top
of the other one after release.

**Cause** `endDrag` was defined twice in the store: the small one from the halo
work, and the new one that does the snapping back. In an object literal the
LATER key wins, and the later one was the old no-op. It built and ran without a
word.

**Fix** The old one is gone. Worth remembering for a store this size: adding a
method by pattern-matching on a nearby anchor will happily add a second copy of
something that already exists.

---

### Two harness faults, again

**A break that stopped the suite dead crashed the harness.** Removing the undo
push made verify exit without printing a summary, and the harness indexed
`[-1]` into an empty list and threw — losing the rest of the run. A suite that
does not finish IS a catch; it reads that way now.

**And a guard that did not exist.** The forced group drag was reported as "not
caught" and it was: nothing asserted that a group stays on the ceiling. The
single-set case was covered by `clampCorner` and I had assumed that covered
both. It has its own guard now.

**Guard** That a drag onto an occupied spot is taken rather than refused and
the set really is there; that the halo says so; that releasing snaps it back to
exactly where the drag began; that a drag which changed nothing takes its undo
entry with it; that a drag which moved something is one undo step that undoes;
and that neither a set nor a group can be dragged off the ceiling. Proved by
five reintroductions.

**Verified with a real mouse**, from below so the sets are in front of the
ceiling plane: dragged from `[1200,2900]` straight over a set at `[2700,2900]`
— sitting on top of it, halo red — and out the far side to `[5500,2900]`.

1941 passing, 8 pre-existing failures.

---

## A fin's suspension height was there, under another name

Asked for: in the baffle fin focus view, be able to change the suspension
height of a single fin too.

**It was already possible.** The renderer has always honoured a per-fin drop —
`baffle.js` reads `finP.drop ?? p.drop`, `modelFins` reads
`ov.drop ?? params.drop`, and the outline follows — and the fin panel had a
stepper wired to it.

**What was wrong was the control.** The fin panel called it **"Drop below
slab"**. Every other place in the app calls the same thing **Suspension
height** — the baffle set, the cloud panel, Fly. So somebody looking for
suspension height in the fin panel did not find it, and reasonably concluded it
was not there.

**And it was subtly wrong as well as differently named.** The fin's stepper
carried its own hardcoded `50–1200` with no hardware floor, while the set's
comes from `BAFFLE_SHARED.drop` floored at `modelMinDropMm`. `modelFins` clamps
to the hardware anyway — `Math.max(ov.drop ?? params.drop, hardwareTop)` — so
the fin control could read 50 mm while the fin in front of you hung at the
clamp height. A control showing a number the scene does not use.

**Fix** One `dropRangeMm(p)` and one `DropNote`, exported from BaffleFields and
used by both. The fin's field is now labelled Suspension height, takes the same
range, and carries the same note about the model's clamps. Its hint says whose
number it is showing — `the set's` until the fin has one of its own, then
`this fin` — because a stepper displaying the set's value gives no clue that
changing the set will move this fin too.

**Verified** through the real control: typed 900 into the fin panel inside the
focus view; the override became exactly `{"1":{"drop":0.9}}`, no other fin was
touched, and 4.5% of the focus view's pixels changed — the fin moved.

---

### Four instruments wrong before one was right

Getting a baffle onto the ceiling to test this took four corrections to the
harness, none of them in the app:

- The panel walk **looped on the finish family**, because "answered" was only
  checked for lit buttons and a dropdown has none. A Select is answered when it
  stops saying "Choose…".
- Then it **looped on Direction**, because it never scrolled the control into
  view: the sidebar scrolls, and a click at the coordinates of something below
  the fold lands on whatever is there instead.
- Then the fin panel could not be found, because the regex read `\d` where it
  needed `\d` — a backslash too many, from passing a pattern through a shell
  heredoc into Python into JavaScript. Replaced with `startsWith`, which needs
  no escaping at all.
- Then every click missed, because **the fin panel is rendered twice** — once in
  the right panel and once inside the focus modal covering it — and taking the
  first found the one behind the overlay.

**Guard** That the fin's field is named as it is everywhere else and the old
name is gone; that the range comes from one place and the fin carries no
numbers of its own; that the clamp note travels with the control; and, through
the store, that a drop written to one fin lands on that fin only, leaves the
set alone, and is dropped entirely by Reset to set so the fin follows the set
again. Proved by three reintroductions.

1952 passing, 8 pre-existing failures.

---

## Editing one fin edited all eight

Asked for: in blade baffles, changing the thickness or length of a single fin
should change that fin, not the whole set.

**What was happening.** The "Dimensions & run" panel stayed on screen while a
fin was selected, and its Thickness and Baffle length wrote to the SET. So
changing the thickness of the fin you were looking at changed every fin in the
run. The panel already hid type, shape, spacing and suspension height for
exactly this reason — "fields whose scope contradicts what is being edited" —
and these three had been left in.

**A fin may be bigger than its set**, which was the one thing worth asking
about: the set's reserved footprint comes from `baffleExtent`, and a fin longer
than its set would otherwise cross into a neighbouring set that the grid says is
clear. So the extent is measured fin by fin and covers the biggest one.
Measured: a 1200 mm set with one 2780 mm fin reserves 2780, and reset gives the
1200 back.

**The run keeps its rhythm.** Pitch is still the set's spacing plus the set's
thickness, so a fin with a thickness of its own does not move every other fin —
which is the whole point of editing one fin. A fin thicker than its pitch will
touch its neighbours, and that is the honest consequence of asking for it.

**The extent stays centred.** It reserves to the furthest edge on BOTH sides
rather than measuring one side to the thick fin and the other to a thin one.
Everything downstream places the footprint from the item's cell and reads the
extent as centred on it; a one-sided measurement puts the geometry off its own
footprint. Proved by making it one-sided, which breaks seventeen other
assertions.

---

### Three places knew about a per-fin size and two of them ignored it

The override was already being merged — `baffle.js` builds `finP = { ...p,
...ov }` — and then thrown away:

- **The parametric builder** rebuilt geometry only when `ov.width` was set. A
  fin given its own thickness or length was merged, measured, and then handed
  the SET's shared geometry. The override looked ignored because the only thing
  still reading it was the maths.
- **The model builder** computed one `scale` from the set and used it for every
  fin. Blade is model-backed, so this was the path that mattered for the ask.
- **`baffleExtent`** read `p.length` and `p.sizeMm` once.

Only a fin that actually carries a size is re-derived; everything else takes the
set's `sizeMm` object unchanged, so a document with no size overrides draws and
measures exactly as it did. That is asserted directly: a set with no overrides
must give the OLD formula's answer to the last floating-point bit.

**And one more name for one thing.** The fin panel called face depth "Face
depth" while the set panel called it "Baffle height" — the same fault as
"Drop below slab" a moment earlier. Both are Baffle height now, and each of the
four fin fields says whose number it is showing: `the set's` until the fin has
one of its own, then `this fin`.

**Also offered for models now.** Per-fin face depth used to be hidden behind
`!isModel`, because the scale was the set's. A model fin is scaled from its own
size, so the depth is as adjustable as the other two.

**Guard** That an unvaried set measures exactly as before; that a longer fin
grows the reserved area and a reset gives it back; that a thicker fin widens the
run symmetrically; that the set keeps its own numbers when a fin is edited and
no other fin is touched; that the set panel stops offering dimensions under a
selected fin and the fin panel offers them instead, under the set's names; and
that both builders read the fin's own size. Proved by five reintroductions.

**Verified through the real controls** in the focus view: clicked 25 mm and
2780 mm in the fin panel, the set stayed 12 mm and 1200 mm, the override was
exactly `{"1":{"thickness":25,"length":2780}}`, the footprint went 1200 to 2780,
and 19,486 pixels changed.

1973 passing, 8 pre-existing failures.

---

## A background picker, and a grid that survives it

Asked for: a colour picker for the background, with white, grey and dark grey
to hand, and the grid colour following.

**Most of it already existed** and was switched off. A Display panel with
background swatches and a colour input was turned off "at the client's request
while the sidebar is trimmed", along with the Grid and Room toggles beside it.
The background is asked for back; those two are not — so the background moved
into a panel of its own and Display stays off.

**The presets are the three asked for**, spread across the range rather than
bunched: three options that read the same is one option. White is an off-white,
because a true `#ffffff` canvas sits flush against the sidebar — also white in
the light theme — and takes the edge off a pale panel being judged on it.

**The grid colour had to change, not just follow.** It was one of two fixed
greys picked on a luminance threshold. That reads at the ends and fails in the
middle: on a mid grey the "light" one is almost the background's own lightness
and the grid disappears into it — and mid grey is one of the three presets, so
it is not a corner case. `gridLineColour` shifts the BACKGROUND itself toward
black or white by a fixed amount, which holds anywhere the colour input can
land and takes a tint from the background rather than laying slate over beige.

Measured: `#f4f6f8` gives `#6e6f70`, `#9aa0a6` gives `#45484b`, `#3c4147` gives
`#94979a`. On screen the grid region's spread is 7.7 to 9.9 on all three and on
a custom brown; a grid that had vanished would sit near zero.

**The default background moved**, which was a consequence rather than the ask.
It was a warm beige, chosen because it reads well against the felt colours — but
a session opening on a fourth colour shows a picker with nothing selected, which
reads as broken. It opens on White now, and the beige is one click away in the
colour input.

**And it is kept with the session.** Not in the document and not in a link: a
link carries a layout, not the wall you were standing in front of.

---

### A missing import that the suite could not see

Moving `BACKGROUNDS` out of the panel and into `lib/theme.js` left the panel
referring to a name it no longer had. **The build passed and the suite passed
1973 of them** — esbuild does not resolve free identifiers, and nothing in the
suite renders a component. It would have been a `ReferenceError` on first paint.

Caught by the browser check, which fails on any console error before it looks
at anything else. Worth remembering: for UI work, a green suite says nothing
about whether the thing renders.

**Guard** That three backgrounds are offered under the names asked for and are
spread across the range; that the line colour separates from each of them, from
five custom colours including pure black and white, and specifically that a mid
grey gets a DARK line rather than the old light one; that it takes a tint rather
than choosing from a pair; that bad input falls back rather than throwing; that
the picker is on screen and the trimmed Display toggles stay off; and — the
invariant rather than the hex — that the app opens on a colour the picker
actually offers. Proved by four reintroductions.

1993 passing, 8 pre-existing failures.

---

## Moving a staggered run moved only the box around it

**Symptom** With the fins at different heights, changing the SET's suspension
moved the boundary box and left the baffles where they were.

**Cause** A fin's own drop is stored as an ABSOLUTE height — `ov.drop ??
p.drop` — so raising the set moved only the fins that had no height of their
own. The box is measured from `params.drop`, which did change. A run where
every fin had been given a height stood perfectly still inside a box that rose
around it.

**Fix** The set's suspension is the whole run's. An explicit drop edit shifts
every fin that hangs at a height of its own by the same amount, so the run
moves and the stagger survives. Only an explicit one: reconcile can settle
`drop` as a consequence of something else, and that is not somebody asking to
move the run.

Storing each fin's drop as an OFFSET from the set would say the same thing more
neatly, and would rewrite the meaning of every fin drop already saved in a
session, a link or an exported file. Not worth it for a tidier field.

**The run travels as one, so it stops rather than piling up.** The first
version clamped each fin separately, and raising a staggered run to the limit
stacked every deep fin onto 1.2 m — then moving the set back did not bring the
stagger with it, because the offsets were gone. Now the run goes as far as its
deepest and shallowest fins allow and no further, and the set's own number
reads where it actually got to rather than what was asked for. Refusing the
last few millimetres is a control that appears to stop; the other is a control
that eats your work.

Measured: fins at 300/450/600/750 with the set at 300, asked for 900 — the run
lands at 750 with the fins at 750/900/1050/1200, every gap still 150.

**The box had to change too.** It was measured from the set's own drop, so a
fin hanging lower than its set fell outside it — the outline cut through the
fin it was meant to be enclosing, and so did the invisible box that catches the
pointer. It is measured to the deepest fin now.

---

### A free identifier the build was happy with

`BAFFLE_SHARED` went in without an import. `vite build` passed — esbuild does
not resolve free identifiers — and it would have been a `ReferenceError` the
first time anybody moved a suspension slider. Second time in two changes: the
same thing happened moving `BACKGROUNDS` into `lib/theme.js`.

There is a guard for it now, and it fails in the loudest possible way: without
the import the suite does not finish at all.

---

### Already there: how many fins

Asked for alongside: an option for how many fins a baffle has. **It exists** —
"Baffles in the set", a stepper in the left panel, default 8.

It is greyed until Baffle spacing is answered, which is the staircase working
as specified: the MAXIMUM comes from `runLimits`, which needs the run's length
and spacing to know how many the ceiling will hold. Reported rather than
changed, because unlocking it early means showing a cap computed from blanks —
the thing CountField's own warning note is guarded against.

**Guard** That moving the set moves every fin with it and the gaps between them
survive; that asking for more than the deepest fin allows moves the run as far
as it can rather than collapsing the stagger; that the set reads where the run
got to; that a fin following the set is not quietly given a height of its own;
that an unrelated edit shifts nothing; and that the box is measured to the
deepest fin. Proved by four reintroductions.

2006 passing, 8 pre-existing failures.

---

## Turning one fin round

Asked for: an option to turn a single fin 180 degrees.

**Half of it already existed and was unreachable.** `rotDeg` was in the fin
override, named in `modelFins`' own docblock as part of what an override
carries, and applied there as a Y rotation on the fin's group. Nothing ever
wrote it, and the parametric builder never read it — so it worked on exactly
the sets nobody could reach it from.

**Fix** A Facing control in the fin panel writing `rotDeg` 180 or 0, and the
parametric builder reading it.

**Not called Direction.** At set level Direction is which way the RUN lies, and
two things under one name in one panel is the fault that had Baffle height
calling itself Face depth in this very component. It is Facing, Straight or
Reversed, with the same hint the other fin fields carry: `the run's` until the
fin has one of its own, then `this fin`.

**The parametric builder reverses rather than rotates.** A run already has a
Pattern — Alternate mirrors every second fin, by `scale.x = -1` for a profile
that varies along the fin and by the material's own flip for a finish that runs
one way. A turned fin goes through that same machinery, so it looks exactly
like an alternated one rather than nearly like it. A half turn about Y IS that
mirror for a fin symmetric across its own thickness, which every one of these
is.

**Composed, not substituted.** `(pattern mirrors this fin) XOR (this fin is
turned)`. "Turn this fin round" means reverse it from where it is, so flipping
a fin that Alternate has already mirrored puts it back in line with its
neighbours — which is what somebody looking at it is asking for.

**Verified on a TAPERED blade**, because a half turn is invisible on anything
symmetric: a plain slab looks identical either way round, and a test on one
would have passed whether or not the feature worked. Reversing fin 2 changed
2,911 pixels; setting it back gave a picture **0 pixels** different from the
original.

---

### Two things this turned up that are not fixed

**`setBrush({ shape })` leaves the model behind.** The panel's shape buttons go
through `pickProduct`, which adopts that shape's model file; writing the shape
straight into the brush does not. A tapered blade set that way keeps
`model: 'blade-standard'` and renders as a standard one. It also clears the
width — correctly, since tapered is sold in a different range of depths — which
leaves the spec unplaceable until the panel is filled again. Only reachable
from code, so it is a trap for tooling rather than for a user.

**The dev server had stopped**, and the browser checks fail loudly when it has
— `ERR_CONNECTION_REFUSED` rather than a green run. Worth knowing that the
checks in `scratchpad/cap` all point at the DEV server on 5190, not the preview
build on 5191: they exercise source, not `dist`.

**Guard** That the control exists, writes a half turn, and is not under the set
panel's name for something else; that both builders read it and the parametric
one composes with the Pattern rather than replacing it; and, through the store,
that the turn lands on one fin only, changes nothing about what the set
occupies, and is dropped by Reset to set. Proved by four reintroductions.

2016 passing, 8 pre-existing failures.

---

## Baffle spacing: four buttons, and no way to say 120

Asked for: spacing as options **and** a custom input.

**The store never held spacing to the list.** `reconcile` clamps it to a
RANGE — 50–200 mm for a catalogue run, `MODEL_SPACING`'s 0–2000 for a run of
imported models, because the catalogue's figures are scaled for 25 mm fins and
are far too tight for a metre-wide object. So a gap of 123 mm was always a
legal, storable, renderable value. There was simply no control that could
produce one. The four buttons were not a constraint; they were the whole
vocabulary of a field that understood more.

**Fix** `SpacingField`: the workbook's four as shortcuts, and a stepper over
the real range beneath them.

**The field reads the store's split rather than its own.** `p.model ?
MODEL_SPACING : { min: 50, max: 200 }` is the same expression `reconcile`
uses, deliberately. A control with its own idea of the range offers values the
store then quietly changes — the worst kind of disagreement, because the number
you typed is still on screen when it stops being true.

**Nothing lights up when the value is off the list**, which is right: the
buttons are shortcuts, not the range. The hint above carries the figure either
way, so 123 mm is never a blank-looking field.

**The ceiling caps it above the range.** `runLimits` already knew how far apart
this many fins of this length can sit and still fit; the stepper's maximum is
the lower of that and the range, and **a preset the ceiling cannot take is not
offered at all**. A button that snaps back is worse than no button. When the
room is the binding constraint the panel says so and states the figure —
measured, 24 fins across a 3 m zone offer only 50 and 100, with "this run
allows up to 117 mm between fins" underneath, and typing 9000 lands on exactly
117.

---

### What this turned up

**Every blade run is a model run.** Each blade shape names a model file, so
`p.model` is set and the catalogue's 50–200 never applies to one. The branch is
reached by VMT, Box and Embossed. Worth knowing before reading the range as
"the catalogue's numbers": for the type most people open first, they are not.

**VMT's Colour row is empty until a Series is picked**, where Blade's is not —
Blade's swatches adopt a family on click. Not wrong, but it means VMT cannot be
specified without opening the Series dropdown, and that dropdown renders as a
bare arrow with no words in it until it has an answer.

**The panel-walking test helpers all skipped the field.** Every walker in
`scratchpad/cap` carried `if (body.querySelector('input')) continue` — "has an
input" standing in for "already answered", which was true while every stepper
in a baffle panel had a default. Spacing has an input and starts unanswered, so
the walk stepped over it and no baffle spec could be completed: `placed: false`
across six suites. They now read the hint instead — an em dash is unanswered.
The suites themselves were sound; the shared shortcut inside them was not.

**Guard** That spacing is a field with both a preset row and a stepper, that
the panel renders it, that its two ranges are the store's two, that the ceiling
caps it and filters the presets; through `runLimits`, that a run of one has no
gap to cap and a crowded zone caps below 200; and through the store, that a
value on no list survives placement and further editing. Proved by seven
reintroductions, scored on fresh failures against the 8 that predate this work.

2033 passing, 8 pre-existing failures.

---

## One gap, two names: edge to edge and centre to centre

Asked for: the spacing input branched into two sub-fields.

**They are the same decision one object's width apart.** The workbook quotes
the clear gap between fins; a setting-out drawing quotes the pitch. Somebody
arriving with either figure had to do the arithmetic in their head — and had to
know which of `thickness` or the model's measured width to add, which is not
something the panel was telling them.

**Fix** `SpacingField` now holds two captioned steppers. The workbook's four
presets sit under **Edge to edge**, because they are that measure; **Centre to
centre** is underneath. Setting either moves the other.

**One stored number.** Only the gap is stored; the pitch is derived. Two stored
numbers drift, and once they have drifted nothing on screen says which one the
run was actually built to. `pitchOf` and `gapOf` convert, and the c2c control
reads the first and writes back through the second.

**One definition of the width across a run.** It was written out three
times — in `finPitch`, in `modelPitch`, and again inside `runLimits` — which was
harmless while only the geometry read it. It stopped being harmless the moment
the panel started converting by it: a field that adds a fin's thickness while
the renderer spaces by a model's measured width puts a number on screen that
nothing in the scene measures. `acrossUnitMm` is now that definition, and
`runLimits` reads it. Guarded by asserting the panel's pitch equals
`finPitch`/`modelPitch` for both kinds of run.

**A sub-label is not a `<label>`.** `Field` is already one, and labels do not
nest — an inner one is invalid, and it would also give the control a second
labelable ancestor, which is the exact mechanism that forwarded clicks into
locked fields and took five attempts to find the first time. `SubLabel` is a
span.

**The ceiling caps both, and says both.** 24 fins across a 3 m zone: "this run
allows up to 117 mm edge to edge, 129 mm centre to centre", with both `+`
arrows dead at those figures. Measured through the panel, not asserted about
it.

**Rounding is toward the pitch that exists.** The gap is stored whole, so a
model whose width is not whole cannot reach every pitch. The c2c box therefore
reports the real centre-to-centre rather than the one that was typed — which is
the figure worth trusting, and is within half a millimetre of it. Every
catalogue fin and every model measured so far has a whole-millimetre width, so
the round trip is exact in practice.

**Guard** That both sub-fields exist and are named, that SpacingField holds
exactly two steppers, that the pitch is derived and written back as a gap, that
no second number joined the brush, that one definition of the across-run width
exists and `runLimits` reads it, that a sub-label is not a label; and
arithmetically that a fin measures its thickness, a model its own width, that
the conversion round-trips, that an unanswered gap has no pitch, and that the
pitch the panel shows is the one the geometry spaces by. Proved by eight
reintroductions.

2050 passing, 8 pre-existing failures.

---

## The BOM's face area, and what a set actually takes

Asked for: the ceiling a selected set takes, and the absorptive face gone.

**The face was four different numbers pretending to be one.** Both sides of a
fin, one side of a tile, the measured felt of a Fly, and — for a cloud — the
plan bounding box. Three of those four answered a question the panel was not
asking, and one of them was wrong: measured off the supplied panels, a circle
fills 78.5% of its box, a hexagon 75.0% and a triangle 56.8%, so every
non-square cloud was billed 27%, 33% or 76% high. The Fly row three lines above
it carries a comment warning against exactly that mistake.

**Fix** The face total is gone — stat, note, `unitFaceM2`, `totalFaceM2` and
the `modelQty` caveat that existed only to explain the zero beside a model. In
its place, what a set takes on the ceiling: as the third headline stat, and a
line for the current selection.

**Both figures live in the schedule**, not one there and one in the Selection
panel. They are the same measurement at two scales, and a number reads
differently when it is nowhere near the number it is a part of — "1.38 m²" over
by the Rotate button is a fact about a set, while the same figure under "6% of
the 52.5 m² ceiling is covered" is a fact about the layout. Selecting several
sums them and says so: "2 selected sets take 1.07 m²", because showing one of
them under a plural would be a quiet lie.

**One definition, so the parts add to the whole by construction.** `itemExtent`
switches over the four products and `itemArea` squares it; `coveredArea` is now
nothing but the sum of that. The selection and the schedule cannot tell
different stories about the same set, because there is only one story. Measured
in the browser: two identical sets at 0.54 m² each, total 1.1 m².

**It counts the ZONE, gaps included**, and the panel says so. A run of eight
25 mm fins 100 mm apart is 0.36 m² of fin inside the 1.62 m² it spreads over —
78% air. Reporting the material would be answering a different question: what
the layout has spent is the rectangle, because nothing else can go in it.

---

### The total, audited

The question was whether it was right. Three of the four things that could have
been wrong with it are not:

**The denominator is exact.** The grid counts millimetres, so a 9 × 7 m zone is
9000 × 7000 cells and `g.cols * g.pitch` comes back as 63.000 m² — the zone
itself, with nothing lost to rounding. (This would not have been true at the old
100 mm pitch, where a 5.95 m room would have been measured as 5.90.)

**Nothing is counted twice.** Items cannot overlap: placement refuses it, and so
does a per-fin resize that would grow a set into its neighbour — measured,
growing a fin to 2780 mm against a neighbour leaves the set at 1800 and the
total unchanged.

**A tile block is exact**, being solid and rectangular.

What IS approximate is the same thing the face got wrong: a cloud's area is its
bounding box, so a triangular cloud is counted as covering about twice what it
covers. As a footprint that is defensible — the box is what the grid reserves —
but it is worth knowing before anyone quotes the percentage.

**Guard** That no face survives in the store or the panel, that the headline
stat is the ceiling, that a selection reports its area and its share, that the
total is literally the sum of the per-item number, that a baffle set takes its
run's rectangle and that this exceeds the fins in it, that every product type
answers and an unknown one takes nothing, and that a zone carries its own area
rather than leaving a caller to derive it from a count. Proved by seven
reintroductions.

Evidence lives in three read-only probes: `scripts/probe-cloud-area.mjs`
measures the panels from the supplied files, `scripts/probe-bom.mjs` drives the
real `buildSchedule`, `scripts/probe-covered.mjs` audits the total.

2069 passing, 8 pre-existing failures.

---

## Baffle height: five buttons, three ranges, and no way to type 240

Asked for: an input field for the blade depths. Blade only; Standard typed in
75–300; Tapered "just from 100 to 300, with an appropriate default from the
length chosen".

**The list was the whole offer for two of the three shapes.** Standard had five
buttons, Tapered three range buttons, and Flow — sold as a range rather than a
list — already had a stepper. So the same product on the same tooling could be
set to any depth from 75 to 300 as a Flow and to exactly five as a Standard.

**Fix** Every blade shape gets a `depthRange`, and the published sizes become
shortcut buttons over a stepper instead of the whole offer. Standard 75–300,
Tapered 100–300, Flow unchanged.

**A taper keeps two ends.** This is the part that had to be measured rather
than assumed. `finGeometry` extrudes a tapered blade from `parseWidth`'s two
ends, so storing the typed figure as one number would make a Tapered blade come
out straight — and the set I tested rendered through that parametric path, not
through the model. A custom taper is therefore stored as `"shallow-deep"`, the
format the document already used, with the shallow end at half the deep one.
That rule reproduces 100-200 and 150-300 exactly, two of the three published
profiles.

**The third profile is left alone rather than rewritten.** Half of 225 is
112.5, so putting 125-225 through the rule would quietly turn a chosen profile
into 115-225 — a different fin. `reconcile` exempts a width that the workbook
publishes, but only where the shape tapers: Flow's one listed width IS its
range, and exempting that left `'75-300'` sitting in the document where every
reader since has expected the number 300. Caught by a guard that was already
there.

**Both ends stay inside the range.** Half of a 135 mm deep end is 70, which is
shallower than any tapered blade is made. The range is what the fin lives
between, not just what may be typed into the box, so the shallow end is floored
at the minimum. The cost: a taper asked for near the bottom comes out shallow,
and at exactly 100 it is flat — which is the honest answer to asking for a
tapered blade 100 mm deep when the shallowest published taper is 100-200. If
the deep end should start at 200 instead, that is one number.

**Where a typed depth starts: a twelfth of the fin's length** — 1200 → 100,
1800 → 150, 2400 → 200, 2780 → 230. Three of those four land exactly on sizes
the workbook publishes, which is what makes it a proportion worth defaulting to
rather than an arbitrary one. It is where the first nudge lands, NOT a value
written into the spec: depth stays a question the staircase asks, and a
pre-filled one would drop out of "still to choose" without anyone deciding it.
Flow's starting point moved from a flat 300 to the same rule, so one field has
one behaviour.

**Blade only.** VMT, Box and Embossed keep their lists — nothing was assumed
about ranges I had not been shown, and VMT's widths depend on its thickness,
which is a different question.

**Guard** That the sizes and the range are offered together rather than as
alternatives; that every blade shape has a range and only a taper carries a
second end; that the other three types have none; that the starting point
follows the length and lands on published sizes; that depth is still asked for;
and, through the store, that a standard blade keeps 240, a tapered one becomes
125-250, both ends stay in range, a published profile survives verbatim, and
the two ends of a taper differ. Proved by nine reintroductions.

2093 passing, 8 pre-existing failures.

---

## Dimensions on a switch

Asked for: a button to turn the neighbour distances on and off, on by default.

**Fix** `showMeasures`, a view flag beside `showGrid` and `showRoom`, and a
Measure button in the top bar next to Spin and Preview.

**On by default, so the button is a way OUT.** The question the dimensions
answer — how far apart are these — is the one being asked while a layout is
being set out, and a measurement you have to go and switch on is one you do not
take. Off is for the moment you want to look at the ceiling rather than set it
out.

**Preview still wins.** A client-facing view with setting-out dimensions in it
is not a preview, so the toggle cannot put them back there. The button goes
`disabled` and its tooltip says why, rather than staying live and doing
nothing — and the flag is remembered, so leaving preview gives back the state
you had. (Selecting again is what brings the dimensions back: `setPreview(true)`
clears the selection, as it always has, and there is nothing to measure from
without one.)

**A view flag, not a document one.** It is not in `toJSON`, not in the share
link and not in the session — guarded three ways. A link that arrived with
someone else's dimensions switched off would be answering a question the sender
never asked, and what is ordered does not change either way.

**The switch decides whether they are DRAWN, never what they say.** Guarded by
asserting `neighbourGaps` returns the same gaps with it on and off.

**Guard** That the flag starts on, that the scene reads it and draws nothing
when it is off, that preview overrules it, that the button exists, is dead in
preview, and does not look pressed there; that it is in neither the link, the
session nor the document; and that toggling it changes nothing about the
measurement itself. Proved by seven reintroductions.

2108 passing, 8 pre-existing failures.

---

## Layouts you saved yourself

Asked for: custom presets.

**A built-in preset cannot be one.** It is code — a `product()` recipe and an
`arrange()` that computes positions from the grid it is handed — and that is
exactly what lets "Hexagon field" work in a boardroom and a sports hall without
being written twice. Nobody can type a function into a panel.

**So a saved layout is the other kind of thing:** a snapshot of a ceiling that
existed, carrying every set where it was put. The price is that it cannot adapt
to a room it was not laid out in — stated to the user before they save, and
again in the panel when the saved zone was bigger than the current one, so a
half-placed result is explicable rather than mysterious.

**It lives in the Layout presets dropdown itself** — one list under one
heading, with a disabled `— saved —` row between the two kinds when both are
present. It went through a panel of its own and then a captioned half of this
one before landing here; both were still a second place to look for the same
question, which is what "put it in the same section" meant.

That took solving one thing: the panel was hidden entirely for a product with
no built-in presets, so putting saved layouts in it would have taken somebody's
own work off the screen whenever the list that ships happened to be empty. The
panel is now always rendered and the BUILT-IN ROWS hide instead.

**Which left a dead constant.** `PRESET_PRODUCTS` existed only to gate the
panel; once nothing gated it, the list was read by nothing and survived purely
because a comment still named it — exactly how a free identifier ships. It is
gone, and the built-in half now derives its own visibility from
`mine.length`, which cannot go stale when a preset is written for a new
product. Guarded both ways.

**Stored as the document `toJSON` already writes.** Not a third shape: the same
versioned thing the Save button downloads and the session keeps. A saved layout
is therefore read by the code that already reads documents, is covered by the
round-trip guards that already exist, and carries its own schema version if the
format moves.

**One loop, not two.** `fromJSON` opens a document into the room it names;
`applyLayout` drops one into the room you are already in. Those differ in one
thing — which grid — so the item-building loop came out into `itemsFromDoc`
and the half-placed-group rule into `keepGroups`. Two copies would have drifted
on reconciliation, on rescaling, or on what to do with an item the ceiling
cannot hold.

**It asks before replacing.** The built-in presets replace without asking,
which is fine for a list you cannot add to and less fine for one you can, where
a mis-click costs a ceiling. Only when there is something to lose — replacing
an empty ceiling is not a question. Ctrl+Z undoes it either way.

**A name that is taken is never overwritten**, it is numbered — silently
replacing a saved ceiling because the names matched is loss nobody notices
until later. And the number is stripped before the next one is worked out:
numbering "Studio A (2)" as a base of its own gives "Studio A (2) (2)", and
re-importing compounds it. Measured before it was fixed.

**Import merges, never replaces.** Importing is how a second machine catches
up; replacing would delete whatever that machine had of its own.

---

### Two things this turned up

**A dynamic import gets a different module instance under Vite** — the trap
`store.js` already documents for the store. The browser test drove export and
import through `await import('/ceiling/src/lib/layouts.js')`, got a module whose
`LAYOUTS` was a fresh empty array, exported nothing, and then wrote that nothing
over the real list — wiping the two layouts it had just saved. The round trip is
asserted in `verify.mjs` against a standing-in `localStorage` instead, where
there is only ever one instance. The UI paths stay in the browser, where they
belong.

**Every storage call is wrapped.** `localStorage` throws rather than returning
null in a private window, with site data blocked, and when the quota is full. A
layout list that cannot be saved is a disappointment; a panel that cannot render
because reading it threw is a broken app. Proved by a break: unwrapping the read
does not fail a guard, it stops the suite finishing.

**Guard** That a saved layout is a document and not a third shape; that the
panel is its own and is not hidden with the product-filtered presets; that
opening a document and applying a layout share one loop and one group rule;
and, against a standing-in localStorage, that an empty ceiling is refused, a
taken name is numbered without compounding, renaming cannot collide, export
names its format, import merges and refuses rubbish, delete removes exactly
one, and a reload finds them all again. Proved by nine reintroductions.

**A guard caught a regression in the merge.** The old panel derived the
Select's displayed value, so a baffle preset key stopped being shown once the
product changed; passing the last-run key straight through brought back a
control displaying a row no longer in its own list. The guard that had been
written for the original derivation failed on the new spelling and was right to.

**And the list did not refresh itself.** `LAYOUTS` is mutated in place, so its
identity never changes — and `useSyncExternalStore` compares snapshots with
Object.is, which meant React was told nothing had happened after every save,
delete and import. Saving only appeared to work because the panel set other
state in the same tick; an import, which sets none, left the dropdown showing
the old list. It watches a version counter now.

**One test fault worth recording**, because it cost a debugging round twice: an
option is matched by POSITION, not by its text. The row's `textContent` is
`Studio A✓` — the tick for the selected row is inside it — so an equality match
found nothing, clicked nothing, and looked exactly like the feature being
broken. `applyLayout` driven straight from the store placed 2 of 2, which is
what separated the two.

2139 passing, 8 pre-existing failures.

---

---

## Process notes

**`app/src` is not in version control.** Thirty-odd source files with no history
and no recovery. A `git add` is overdue — one accidental truncation during this
work was recoverable only from an unrelated backup taken earlier.

**Writing files by string replacement is how most of the above happened.** Two
distinct faults came from patch scripts: one that emptied `catalog.js` (a Python
`open(path, 'w')` truncates before it validates its arguments), and one that
threw partway and silently left the Colour Core branch out of `baffle.js`. Read
the file, edit it, read it back.

**The browser preview was unavailable for most of this work** — the pane's
window collapsed to 0×0 and animation frames stopped firing — so verification
moved headless. That turned out to be the useful constraint: the fixes were
pushed into pure modules (`views.js`, `runDropOffset`, `showOnlyFin`,
`cropToFin`, `finFinish`, `MODEL_SIZE_LIMITS`, `FINISH_KINDS`) precisely so they
could be asserted without a renderer. Every one of those guards was checked by
reintroducing the bug and watching it fail.
