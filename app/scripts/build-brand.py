"""Derive the UI brand assets from the supplied logo files.

    python scripts/build-brand.py

INPUTS, never written to:
    public/univicoustic-logo.png   the full lockup, wordmark over a strapline
    public/favicon.png             the UV/ monogram

OUTPUTS, all regenerated:
    public/brand/wordmark.png           the wordmark alone, trimmed
    public/brand/wordmark-reversed.png  the same, dark ink lifted for dark UI
    public/brand/mark.png               the monogram, trimmed
    public/brand/mark-reversed.png      the same, lifted

WHY DERIVE ANYTHING AT ALL. Two reasons, and neither is taste.

The strapline. The supplied lockup sets "MAKES SOUND SENSE" at about a third the
wordmark's height. In a 56 px top bar the wordmark can be 18 px, which puts the
strapline near 7 px — present but unreadable. A logo too small to read is worse
than one that stops at the wordmark, so the header takes the wordmark band only.

The dark theme. The logo is two colours: a near-black and the brand orange. On
#0e1116 the black is gone and the wordmark reads as a floating "V/". The obvious
fix is a CSS filter, and `invert(1) hue-rotate(180deg)` does lift the ink — but
it also drags #ef4935 to #ff725e. That is a brand colour being altered to solve
a legibility problem, which is not a trade anybody would agree to if asked. So
the reversal is done here instead, on the ink only, and the orange is asserted
untouched before anything is written.
"""

import os
import sys
import collections

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('Pillow and numpy are needed: pip install pillow numpy')

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
PUB = os.path.join(APP, 'public')
OUT = os.path.join(PUB, 'brand')

BRAND_ORANGE = (0xef, 0x49, 0x35)
LIFTED_INK = (0xf2, 0xf4, 0xf6)   # not pure white: matches the UI's own off-white

# How wide the derived files are. Roughly 3x the largest place each is shown, so
# they stay crisp on a retina screen without shipping the 5417 px original.
WORDMARK_PX = 640
MARK_PX = 192


def trim(im):
    """Crop to the ink. The supplied files carry a lot of transparent margin."""
    a = np.asarray(im)
    ys, xs = np.nonzero(a[..., 3] > 8)
    return im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def bands(im):
    """The horizontal ink bands, top to bottom. The lockup has two: wordmark,
    then strapline."""
    on = np.asarray(im)[..., 3] > 8
    rows = on.any(axis=1)
    out, start = [], None
    for i, lit in enumerate(rows):
        if lit and start is None:
            start = i
        if not lit and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(rows) - 1))
    return out


def reverse_ink(im):
    """Lift the dark ink to near-white; leave anything saturated alone.

    Keyed on SATURATION, not on a hex. The wordmark's ink is #221e1f and the
    monogram's is pure #000000 — a distance test tuned to the first silently
    missed the second, and produced a "reversed" monogram identical to the
    original. Dark and colourless is the thing they have in common.
    """
    a = np.asarray(im).astype(np.float32).copy()
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    ink = (mx < 140) & (sat < 0.35)
    a[ink, 0], a[ink, 1], a[ink, 2] = LIFTED_INK
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def shrink(im, w):
    if im.width <= w:
        return im
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def solid_colours(im):
    """The fully-opaque pixel colours and their share, commonest first."""
    a = np.asarray(im.convert('RGBA'))
    solid = a[a[..., 3] > 240][:, :3]
    if not len(solid):
        return []
    c = collections.Counter(map(tuple, solid))
    return [(k, n / len(solid)) for k, n in c.most_common()]


def check_orange(original, reversed_, name):
    """THE GATE. The reversal must lift the ink and leave the brand orange
    exactly where it was — same hex, same share of the image."""
    o = dict(solid_colours(original))
    r = dict(solid_colours(reversed_))
    share_o = o.get(BRAND_ORANGE, 0)
    share_r = r.get(BRAND_ORANGE, 0)
    hexs = '#%02x%02x%02x' % BRAND_ORANGE
    if share_o == 0:
        sys.exit(f'{name}: {hexs} is not in the source at all — is this the right file?')
    if abs(share_o - share_r) > 0.005:
        sys.exit(f'{name}: the brand orange moved. {share_o * 100:.1f}% before, '
                 f'{share_r * 100:.1f}% after. The reversal is touching it.')
    # And the ink really did lift, or the "reversed" file is just a copy.
    dark_after = sum(s for c, s in solid_colours(reversed_) if max(c) < 140)
    if dark_after > 0.02:
        sys.exit(f'{name}: {dark_after * 100:.1f}% of the reversed file is still dark — '
                 'the ink was not lifted. See reverse_ink: is the new ink saturated?')
    return share_o


def build():
    for f in ('univicoustic-logo.png', 'favicon.png'):
        if not os.path.isfile(os.path.join(PUB, f)):
            sys.exit(f'missing input: public/{f}')
    os.makedirs(OUT, exist_ok=True)

    lockup = Image.open(os.path.join(PUB, 'univicoustic-logo.png')).convert('RGBA')
    rows = bands(lockup)
    if len(rows) < 2:
        print('note: the lockup has one ink band, so there is no strapline to drop')
        top, bottom = rows[0]
    else:
        top, bottom = rows[0]
        s0, s1 = rows[1]
        print(f'  lockup: wordmark y{top}-{bottom}, strapline y{s0}-{s1} '
              f'({(s1 - s0 + 1) / (bottom - top + 1):.0%} of the wordmark height — dropped)')

    pad = 12
    wordmark = shrink(trim(lockup.crop((0, max(0, top - pad), lockup.width,
                                        min(lockup.height, bottom + pad)))), WORDMARK_PX)
    mark = shrink(trim(Image.open(os.path.join(PUB, 'favicon.png')).convert('RGBA')), MARK_PX)

    total = 0
    for im, name in ((wordmark, 'wordmark'), (mark, 'mark')):
        rev = reverse_ink(im)
        share = check_orange(im, rev, name)
        for img, fn in ((im, f'{name}.png'), (rev, f'{name}-reversed.png')):
            path = os.path.join(OUT, fn)
            img.save(path)
            kb = os.path.getsize(path) / 1024
            total += kb
            print(f'  {fn:24} {img.width}x{img.height}  {kb:5.1f} KB')
        print(f'     brand orange held at {share:.1%} of the ink, both variants')

    print(f'\n{total:.0f} KB in public/brand — the supplied files are untouched')


if __name__ == '__main__':
    build()
