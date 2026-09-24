"""Turn the supplied "Cloud Series" artwork into shippable cloud face textures.

Run from the app directory:

    python scripts/build-cloud-series.py

Needs Pillow (`pip install pillow`). The rest of the build is Node; this one
step is Python because it is the only thing here that resamples pixels, it runs
when new artwork arrives rather than on every build, and Pillow is already on
this machine while sharp is not.

READS the supplied folder and writes nothing back to it. Everything it produces
goes to public/textures/clouds/cloud-series/, plus a manifest the app loads the
same way it loads the wood and tile manifests.

What it does, and why each step is not optional:

  TRIM to the artwork's own bounding box. The shapes are drawn inset in a square
  canvas — the hexagons fill 84% of their width — and the panel's UV projection
  maps the panel's plan box onto the whole image. Ship it untrimmed and every
  hexagon wears a white ring. After trimming, image edge = shape edge = panel
  edge, which is the whole trick.

  TURN the CL-04 and CL-05 triangles a quarter. Those two were drawn pointing
  left; CL-01 and CL-03 point up, and so do the models (apex at max z, measured).
  Baked in here rather than corrected at load, because it is a fact about the
  file and this is the step that owns the files.

  RESAMPLE to MAX_PX on the long side. The supplied set is 518 MB and runs to
  17,067 px for a panel that is never more than about 900 px on screen. This
  brings it to roughly 15 MB for all 64.

The aspect of each trimmed image is checked against the model's own plan
footprint and reported, because a mismatch there is what a white sliver down one
edge of a panel looks like before anyone knows why.
"""

import json
import math
import os
import re
import sys
from datetime import datetime, timezone

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('Pillow and numpy are needed: pip install pillow numpy')

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(APP), 'Cloud Series')
OUT = os.path.join(APP, 'public', 'textures', 'clouds', 'cloud-series')

MAX_PX = 1400
QUALITY = 88

# The picker's thumbnails. Small because there are 64 of them and they are
# decorating a 340 px sidebar: 128 px is two chips wide on a retina screen and
# costs 3.8 KB each, 244 KB for the set. The same order as the 275 Designer
# Textile thumbnails at 0.3 MB, which is the bar this has to meet to be worth
# shipping at all.
THUMB_PX = 128
THUMB_QUALITY = 82

# The folders name the same four shapes two ways; the app names them a third.
SHAPE = {'hexagon': 'hexagon', 'hex': 'hexagon', 'round': 'circle',
         'square': 'square', 'triangle': 'triangle'}
LETTER = {'H': 'hexagon', 'R': 'circle', 'S': 'square', 'T': 'triangle'}
COLOURS = ('Blue', 'Green', 'Red', 'Yellow')

# Designs whose triangle was drawn pointing left instead of up.
TRIANGLE_TURNED = {'CL-04', 'CL-05'}

# A small turn and a zoom, baked into the face, for artwork that is drawn askew
# inside its own artboard.
#
# WHERE THESE NUMBERS COME FROM. They were found by eye, with the temporary
# rotator in the Cloud Series panel (src/lib/uvTune.js), and they are what the
# person looking at the panel chose. The angle the ARTWORK measures is close but
# not the same -- CL-04's outline sits 1.87 deg off square and CL-05's 1.94 deg,
# against the model's own 0.000 deg -- and the measured numbers were offered and
# not taken. So these are a judgement, deliberately, and this comment exists so
# that nobody later "corrects" them back to the measurement and quietly undoes
# somebody's decision.
#
# Only the two designs whose triangle needed turning 90 deg in the first place.
# CL-01 and CL-03 measure -0.01 and +0.07 deg -- square -- and are left alone.
# Every square measures 0.00 and all four hexagons agree, so no other shape is
# in here either.
#
# `scale` is a percentage: 108 draws the artwork 8% bigger on the panel. Some of
# that is paying for the turn -- rotating about the centre pulls the corners
# inside the panel, and covering them again costs about cos+sin, 5% at 3 deg --
# and the rest is judgement. It is baked here rather than left to the renderer
# because a face should be a picture of itself, not a picture plus a correction
# every frame.
FACE_TWEAK = {
    ('CL-04', 'triangle'): {'rot': 2, 'scale': 108},
    ('CL-05', 'triangle'): {'rot': 3, 'scale': 108},
}

# The models' own plan footprints, to check each trimmed image against. From
# public/models/manifest.json — the 1200 mm entry of each shape.
MODEL_ASPECT = {'circle': 1.150 / 1.154, 'hexagon': 1.046 / 1.208,
                'square': 1.166 / 1.170, 'triangle': 1.166 / 1.040}

# The size suffix is optional and spelled three ways across the set —
# "Blue-CL-S-01_1200x1200.jpg", "Blue-CL-H-04-1200x1200.jpg" and plain
# "Blue-CL-H-01.jpg" are all the same kind of thing. It says the artboard was
# drawn at 1200 mm, not that the file is only for 1200 mm panels: one image
# serves all three sizes.
NAME = re.compile(
    r'^(Blue|Green|Red|Yellow)-CL-([HRST])-(\d\d)(?:[-_][0-9x]+)?\.(jpg|jpeg|png)$', re.I)


def _block_mean(rgb, mask, k):
    """Average the INK only, over k x k blocks. Background contributes nothing.

    Averaging the picture flat instead would drag the white background into
    every edge block and the bleed would come out pale — a white halo instead of
    no halo, which is the bug wearing a different hat.
    """
    h, w = mask.shape
    h2, w2 = h // k, w // k
    rgb = rgb[:h2 * k, :w2 * k].astype(np.float32)
    m = mask[:h2 * k, :w2 * k].astype(np.float32)
    rgb = (rgb * m[:, :, None]).reshape(h2, k, w2, k, 3).sum(axis=(1, 3))
    cnt = m.reshape(h2, k, w2, k).sum(axis=(1, 3))
    hit = cnt > 0
    out = np.zeros((h2, w2, 3), np.float32)
    out[hit] = rgb[hit] / cnt[hit][:, None]
    return out, hit


def bleed(im, rounds=48):
    """Push the artwork outward into the white around it — a printer's bleed.

    Needed because the drawing's corners are rounded MORE than the panel's are.
    The image is trimmed to the artwork's bounding box, so the box corners of a
    triangle or a hexagon are white; the panel's own corner reaches further out
    than the drawn one does, samples that white, and the cloud renders with pale
    wedges at its corners. Measured worst on the triangles, where a 60 degree
    corner leaves the biggest gap, and just visible on the hexagons.

    Overscaling the artwork would also cover it, and would quietly shrink every
    design and eat the outer frame of CL-04. This does not touch a single pixel
    the artist drew: only pixels that were background get a colour, and each
    takes it from the nearest drawn pixel, so an overhanging corner picks up the
    colour of the artwork beside it. Which is what a printed panel does.

    The WHOLE background is filled, not a band of it. A band means guessing how
    far the panel overhangs, and the guess has to be right at every corner of
    four shapes; filling all of it cannot be wrong, and costs nothing that
    matters because every pixel it touches was blank. Pixels the artist drew are
    never touched — the mask sees to that — so the design keeps its exact size
    and position on the panel.

    Filled on a PYRAMID rather than by walking the edge outward pixel by pixel:
    the picture is reduced 8:1 averaging the ink only, the walk is done there
    where a corner is 50 steps away rather than 400, and the result is blown
    back up as a soft backdrop with the real artwork laid over it. The backdrop
    is only ever seen in the sliver where the panel reaches past the drawing, so
    soft is exactly what it should be.
    """
    a = np.asarray(im.convert('RGB'), dtype=np.uint8)
    # Background is near-white AND was never drawn on. The same test the trim
    # uses, so the two agree about where the artwork ends.
    ink = ~np.all(a > 243, axis=2)
    if ink.all() or not ink.any():
        return im          # full-bleed artwork, or nothing to work with

    K = 8
    small, filled = _block_mean(a, ink, K)
    out = small.copy()
    for _ in range(max(rounds, sum(small.shape[:2]))):
        empty = ~filled
        if not empty.any():
            break
        moved = False
        # Pull from each of the four neighbours in turn; first one with a
        # colour wins, which is near enough "nearest" at this scale.
        for axis, shift in ((0, 1), (0, -1), (1, 1), (1, -1)):
            src = np.roll(filled, shift, axis=axis)
            # A roll wraps; the wrapped edge must not seed the other side.
            if axis == 0:
                src[0 if shift == 1 else -1, :] = False
            else:
                src[:, 0 if shift == 1 else -1] = False
            take = empty & src
            if not take.any():
                continue
            out[take] = np.roll(out, shift, axis=axis)[take]
            filled |= take
            empty = ~filled
            moved = True
        if not moved:
            break

    back = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB').resize(
        im.size, Image.BICUBIC)
    back.paste(im, (0, 0), Image.fromarray((ink * 255).astype(np.uint8), 'L'))
    return back


def ink_box(im, probe=320):
    """The artwork's own bounding box, found on a small copy.

    "Not white" rather than "not the corner colour": a full-bleed design has no
    background to match, and this way it simply reports the whole frame.
    """
    small = im.convert('RGB')
    small.thumbnail((probe, probe), Image.LANCZOS)
    w, h = small.size
    px = small.load()
    def solid(c):
        return not all(v > 243 for v in c)
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if solid(px[x, y]):
                xs.append(x)
                ys.append(y)
                break
        else:
            continue
        for x in range(w - 1, -1, -1):
            if solid(px[x, y]):
                xs.append(x)
                break
    if not xs:
        return None
    y0, y1 = min(ys), max(ys)
    x0, x1 = min(xs), max(xs)
    # Back to full resolution, rounded outward so nothing is clipped.
    sx, sy = im.width / w, im.height / h
    return (max(0, int(x0 * sx)), max(0, int(y0 * sy)),
            min(im.width, int((x1 + 1) * sx)), min(im.height, int((y1 + 1) * sy)))


def face_tweak(im, rot_deg, scale_pct):
    """
    Bake a turn and a zoom into the face, exactly as the renderer would apply
    them.

    This reproduces three's texture matrix rather than approximating it, so
    that what ships is what somebody saw when they chose the numbers. From
    Matrix3.setUvTransform, with offset 0, repeat k on both axes and centre
    (0.5, 0.5), the shader samples

        u' = 0.5 + k * ( cos*du + sin*dv)
        v' = 0.5 + k * (-sin*du + cos*dv)        du,dv = uv - 0.5

    and k is `repeat`, which runs BACKWARDS from size: drawing the artwork 8%
    bigger means sampling 1/1.08 of it. Same inversion as the slider, same trap.

    v is up and image rows run down, so row r of a height-h image is at
    v = 1 - (r + 0.5)/h. That convention is not free to choose: the loader
    decodes with imageOrientation flipY and sets flipY = false, which together
    put v = 1 at the top of the picture.

    Bilinear, and clamped at the edges like ClampToEdgeWrapping -- though with
    scale above 100 the sampled window sits strictly inside the image and the
    clamp is never reached, which is the other half of why the zoom is there.
    """
    w, h = im.size
    src = np.asarray(im.convert('RGB')).astype(np.float32)
    th = math.radians(rot_deg)
    c, s = math.cos(th), math.sin(th)
    k = 100.0 / float(scale_pct)

    u = (np.arange(w) + 0.5) / w
    v = 1.0 - (np.arange(h) + 0.5) / h
    U, V = np.meshgrid(u, v)
    du, dv = U - 0.5, V - 0.5
    U2 = 0.5 + k * (c * du + s * dv)
    V2 = 0.5 + k * (-s * du + c * dv)

    px = np.clip(U2 * w - 0.5, 0, w - 1)
    py = np.clip((1.0 - V2) * h - 0.5, 0, h - 1)
    x0 = np.floor(px).astype(np.int32); x1 = np.clip(x0 + 1, 0, w - 1)
    y0 = np.floor(py).astype(np.int32); y1 = np.clip(y0 + 1, 0, h - 1)
    fx = (px - x0)[..., None]; fy = (py - y0)[..., None]
    top = src[y0, x0] * (1 - fx) + src[y0, x1] * fx
    bot = src[y1, x0] * (1 - fx) + src[y1, x1] * fx
    return Image.fromarray(np.clip(top * (1 - fy) + bot * fy, 0, 255).astype(np.uint8))


def build(thumbs_only=False, only=None):
    if not os.path.isdir(SRC):
        sys.exit(f'artwork folder not found: {SRC}')
    entries = []
    warnings = []

    for design in sorted(os.listdir(SRC)):
        dpath = os.path.join(SRC, design)
        if not os.path.isdir(dpath) or not design.upper().startswith('CL-'):
            continue
        for folder in sorted(os.listdir(dpath)):
            fpath = os.path.join(dpath, folder)
            if not os.path.isdir(fpath):
                continue
            shape = SHAPE.get(folder.lower())
            if not shape:
                warnings.append(f'{design}/{folder}: unknown shape folder, skipped')
                continue
            # --only rebuilds a named design/shape and MERGES it back, so the
            # other panels keep the bytes they were built with. The alternative
            # is re-encoding 22.7 MB of JPEG through whatever Pillow happens to
            # be installed today to change two of them.
            if only and (design.upper(), shape) not in only:
                continue
            for fn in sorted(os.listdir(fpath)):
                m = NAME.match(fn)
                if not m:
                    continue  # Thumbs.db, .DS_Store, anything under Discarded/
                colour, letter, num = m.group(1), m.group(2).upper(), m.group(3)
                if LETTER[letter] != shape:
                    warnings.append(f'{design}/{folder}/{fn}: name says {LETTER[letter]}')
                if f'CL-{num}' != design.upper():
                    warnings.append(f'{design}/{folder}/{fn}: name says CL-{num}')

                im = Image.open(os.path.join(fpath, fn))
                im = im.convert('RGB')          # drops the one stray alpha channel
                src_px = im.size

                if shape == 'triangle' and design.upper() in TRIANGLE_TURNED:
                    im = im.rotate(-90, expand=True)   # apex left -> apex up

                box = ink_box(im)
                trimmed = False
                if box:
                    bw, bh = box[2] - box[0], box[3] - box[1]
                    # Only when there is a real margin; a full-bleed design must
                    # not lose a row to rounding.
                    if bw < im.width * 0.995 or bh < im.height * 0.995:
                        im = im.crop(box)
                        trimmed = True

                if max(im.size) > MAX_PX:
                    s = MAX_PX / max(im.size)
                    im = im.resize((max(1, round(im.width * s)),
                                    max(1, round(im.height * s))), Image.LANCZOS)

                # Askew artwork, straightened -- but the TURN and the ZOOM
                # part company here, and they have to.
                #
                # The turn is the correction and belongs everywhere.
                #
                # The zoom does not. On the PANEL its job is overfill: the
                # artwork's own outline no longer coincides with the panel's
                # once it has been turned, and pushing it 8% past the edge
                # means the rim always shows artwork rather than the seam where
                # the artwork stopped. Covering a 3 deg turn needs about
                # cos+sin, 5%, so 8% is that with margin. The panel supplies its
                # own outline from geometry, so nothing is lost by overfilling
                # it.
                #
                # On the THUMBNAIL there is no geometry -- the outline IS the
                # picture -- so the same 8% simply cuts the corners off. It did:
                # the tweaked triangles came out with 100% of their bottom edge
                # running off the frame against 87-91% for the two designs that
                # are left alone, and the white margin down from 40% to 36%.
                #
                # So the thumbnail takes the turn at 100%. Measured: white
                # margin 43.0% either way, bottom edge 0.0%, nothing clipped.
                tweak = FACE_TWEAK.get((design.upper(), shape))
                thumb_im = face_tweak(im, tweak['rot'], 100) if tweak else im
                if tweak:
                    im = face_tweak(im, tweak['rot'], tweak['scale'])

                # THE THUMBNAIL, AND IT IS TAKEN HERE FOR A REASON.
                #
                # Here is after the turn and the trim but BEFORE the bleed, and
                # that one line of difference is the whole point of it.
                #
                # The supplied artwork is the panel drawn on white -- a circle
                # in a white square, a triangle with two white corners. The
                # render cannot keep that: bleed() smears the artwork outward so
                # texture filtering never drags white onto the panel's edge, and
                # after it a triangle is a rectangle of triangle-coloured paint.
                # Fine on a mesh, which supplies its own outline; useless as a
                # picture, where the outline is the only thing that says which
                # shape you are looking at.
                #
                # Taken before the bleed the thumbnail keeps the white, so the
                # chip in the picker is the shape itself with the artwork's own
                # anti-aliased edge. Nothing in the app has to know how to draw
                # a hexagon.
                #
                # Same pass as the render, so the two can never disagree about
                # the turn or the trim. A thumbnail built from a second reading
                # of the source would be a second chance to get CL-04's triangle
                # pointing the wrong way.
                trel = f'thumbs/{design.upper()}/{shape}/{colour}.jpg'
                tdest = os.path.join(OUT, trel.replace('/', os.sep))
                os.makedirs(os.path.dirname(tdest), exist_ok=True)
                ts = THUMB_PX / max(thumb_im.size)
                thumb_im.resize((max(1, round(thumb_im.width * ts)),
                                 max(1, round(thumb_im.height * ts))), Image.LANCZOS).save(
                    tdest, 'JPEG', quality=THUMB_QUALITY, optimize=True)
                tbytes = os.path.getsize(tdest)

                if thumbs_only:
                    entries.append({'design': design.upper(), 'shape': shape,
                                    'colour': colour, 'thumb': trel,
                                    'thumbBytes': tbytes})
                    continue

                # After the resize, so the bleed's reach is measured in the
                # pixels that ship rather than in the source's — which runs from
                # 3,402 to 17,067 and would make 48 rounds mean four different
                # things.
                im = bleed(im)

                rel = f'{design.upper()}/{shape}/{colour}.jpg'
                dest = os.path.join(OUT, rel.replace('/', os.sep))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                im.save(dest, 'JPEG', quality=QUALITY, optimize=True,
                        progressive=True, subsampling=1)

                # What the panel averages to, as a hex. Two jobs: the swatch
                # chip in the picker, and the colour the panel wears for the
                # moment between being placed and its JPEG arriving — so a
                # cloud never flashes white or grey on its way to being right.
                raw = im.resize((32, 32), Image.LANCZOS).tobytes()
                n = 32 * 32
                sums = [sum(raw[c::3]) for c in range(3)]
                avg = '#%02x%02x%02x' % tuple(round(v / n) for v in sums)

                aspect = im.width / im.height
                want = MODEL_ASPECT[shape]
                off = abs(aspect - want) / want
                if off > 0.03:
                    warnings.append(
                        f'{rel}: {aspect:.3f} against the model\'s {want:.3f} '
                        f'({off * 100:.1f}% out) — expect a sliver down one edge')

                entries.append({
                    'design': design.upper(), 'shape': shape, 'colour': colour,
                    'file': rel, 'px': list(im.size), 'hex': avg,
                    'bytes': os.path.getsize(dest),
                    'aspect': round(aspect, 4),
                    'modelAspect': round(want, 4),
                    'trimmed': trimmed,
                    'turned': shape == 'triangle' and design.upper() in TRIANGLE_TURNED,
                    'sourcePx': list(src_px),
                    'thumb': trel,
                    'thumbBytes': tbytes,
                    # Stated in the manifest so the correction is visible from
                    # the app rather than only from this file -- and BOTH of
                    # them, because the face and its thumbnail deliberately get
                    # different treatment and a single field would hide that.
                    'tweak': tweak or None,
                    'thumbTweak': {'rot': tweak['rot'], 'scale': 100} if tweak else None,
                })

    if thumbs_only:
        # Merge, never rewrite. The 64 render JPEGs and every measured field in
        # the manifest -- the hex each panel averages to, its byte count, its
        # aspect against the model's -- stay exactly as they were built. A
        # thumbnail pass has no business changing what the panels look like, and
        # re-encoding 22.7 MB of JPEG through a different Pillow than built it
        # is a change whether or not anybody meant one.
        path = os.path.join(OUT, 'manifest.json')
        with open(path, encoding='utf-8') as f:
            manifest = json.load(f)
        by = {(e['design'], e['shape'], e['colour']): e for e in entries}
        for p in manifest['panels']:
            e = by.pop((p['design'], p['shape'], p['colour']), None)
            if e is None:
                warnings.append(f"{p['file']}: no artwork found, left without a thumbnail")
                continue
            p['thumb'] = e['thumb']
            p['thumbBytes'] = e['thumbBytes']
        for k in by:
            warnings.append(f'{k}: thumbnail built for a panel the manifest has no entry for')
        manifest['thumbPx'] = THUMB_PX
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')
        got = [p for p in manifest['panels'] if p.get('thumb')]
        total = sum(p['thumbBytes'] for p in got)
        print(f'{len(got)}/{len(manifest["panels"])} thumbnails, '
              f'{total / 1024:.0f} KB at {THUMB_PX} px')
        if warnings:
            print('\nnotes:')
            for w in warnings:
                print('  ', w)
        else:
            print('no discrepancies')
        return

    if only:
        path = os.path.join(OUT, 'manifest.json')
        with open(path, encoding='utf-8') as f:
            manifest = json.load(f)
        by = {(e['design'], e['shape'], e['colour']): e for e in entries}
        kept = 0
        panels = []
        for p in manifest['panels']:
            e = by.pop((p['design'], p['shape'], p['colour']), None)
            if e is None:
                panels.append(p)
                kept += 1
            else:
                panels.append(e)
        for k, e in sorted(by.items()):
            warnings.append(f'{k}: built but not in the manifest, appended')
            panels.append(e)
        manifest['panels'] = panels
        manifest['faceTweak'] = {f'{d}/{s}': v for (d, s), v in sorted(FACE_TWEAK.items())}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')
        print(f'{len(entries)} panels rebuilt, {kept} left exactly as they were')
        for e in entries:
            print(f"   {e['file']}  {e['px'][0]}x{e['px'][1]}  {e['hex']}  "
                  f"{e['bytes'] / 1024:.0f} KB  tweak {e['tweak']}")
        if warnings:
            print('\nnotes:')
            for w in warnings:
                print('  ', w)
        else:
            print('no discrepancies')
        return

    designs = sorted({e['design'] for e in entries})
    manifest = {
        'version': 1,
        'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'maxPx': MAX_PX,
        'thumbPx': THUMB_PX,
        'faceTweak': {f'{d}/{s}': v for (d, s), v in sorted(FACE_TWEAK.items())},
        'designs': designs,
        'colours': list(COLOURS),
        'panels': entries,
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')

    total = sum(e['bytes'] for e in entries)
    print(f'{len(entries)} panels, {len(designs)} designs {designs}')
    print(f'{total / 1e6:.1f} MB written to {os.path.relpath(OUT, APP)}')
    # Every design should have all four shapes in all four colours.
    for d in designs:
        for shape in ('circle', 'hexagon', 'square', 'triangle'):
            got = {e['colour'] for e in entries if e['design'] == d and e['shape'] == shape}
            if got != set(COLOURS):
                warnings.append(f'{d}/{shape}: has {sorted(got)}')
    if warnings:
        print('\nnotes:')
        for w in warnings:
            print('  ', w)
    else:
        print('no discrepancies')


if __name__ == '__main__':
    # --thumbs-only rereads the artwork and writes thumbs/ alone, leaving the
    # render JPEGs and their measured manifest fields untouched. It is what to
    # run when the thumbnails are the change; a plain run builds both.
    args = sys.argv[1:]
    # --only CL-04/triangle,CL-05/triangle
    sel = None
    for i, a in enumerate(args):
        if a == '--only' and i + 1 < len(args):
            sel = set()
            for bit in args[i + 1].split(','):
                d, _, sh = bit.partition('/')
                sel.add((d.strip().upper(), sh.strip().lower()))
        elif a.startswith('--only='):
            sel = set()
            for bit in a.split('=', 1)[1].split(','):
                d, _, sh = bit.partition('/')
                sel.add((d.strip().upper(), sh.strip().lower()))
    build(thumbs_only='--thumbs-only' in args, only=sel)
