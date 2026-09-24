// The two themes, and the one colour the 3D scene has to be told about.
//
// Everything in the DOM themes itself: the tokens in index.css are declared
// twice, once on :root and once under [data-theme='dark'], so switching the
// attribute repaints every panel, border and label without React doing
// anything. Three.js cannot read a CSS variable, so the selection colour — the
// outline on a selected set, the marquee, the focus wire — has to be handed
// over as a literal.
//
// That is the ONLY colour the scene takes from the theme. The room, the
// ceiling, the lighting and every product finish are deliberately untouched:
// they are the thing being visualised, not the interface around it, and a
// panel's colour has to be the colour it will actually be.
//
// The placement ghost used to be on that list and is not any more — see
// PLACE_COLOUR.

export const THEMES = ['light', 'dark']

/**
 * The selection colour, per theme.
 *
 * Light is the wall configurator's coral, dark is the teal this app shipped
 * with. Both are the same value as `--accent` in index.css — stated twice,
 * which is a duplication worth accepting: the alternative is reading a CSS
 * variable out of the document on every frame, and the two only diverge if
 * somebody edits one and not the other, which the guard in verify catches.
 */
export const SELECT_COLOUR = {
  light: '#D65757',
  dark: '#24d0a8',
}

/**
 * The placement ghost: can this go here, or not.
 *
 * NOT the selection colour, and deliberately not themed.
 *
 * The ghost took `accent` for "it fits", which read as green for as long as the
 * accent was the teal this app shipped with. Adopting the wall configurator's
 * palette made the accent a coral — so "it fits" and "it does not" were both
 * red and the ghost had stopped saying anything at all. Reported as: the
 * shadow is red either way.
 *
 * A yes/no signal is information, not branding, so it does not follow the
 * brand colour anywhere. One green and one red serve both themes, because the
 * scene the ghost sits on does not change with the theme either.
 *
 * `no` is the same red the masked-out cells are painted in, from here rather
 * than written twice: a cell you cannot build on and a placement that will be
 * refused are the same fact, and they should not be able to drift apart.
 */
export const PLACE_COLOUR = {
  // A leaf green rather than a mint one. The first pick sat 21 degrees off the
  // dark theme's teal accent, which is close enough that a selected set and a
  // ghost would have read as the same signal on a dark scene. This is 42
  // degrees off the teal and 124 off the coral, so it collides with neither.
  ok: '#3cb043',
  no: '#e06c5a',
}

/**
 * What the ceiling is judged against.
 *
 * Asked for as white, grey and dark grey. Spread across the range rather than
 * bunched: a picker whose options all read the same is a picker with one
 * option. The colour input beside them takes anything at all, which is why
 * gridLineColour below derives its answer instead of pairing with these three.
 *
 * White is an off-white. A true #ffffff canvas sits flush against the sidebar,
 * which is also white in the light theme, and takes the edge off a pale panel
 * being judged on it.
 *
 * HERE RATHER THAN IN THE PANEL so the store's default can be asserted to be
 * one of them. A session opening on a colour the picker does not offer shows a
 * picker with nothing selected, which reads as broken.
 */
export const BACKGROUNDS = [
  { name: 'White', hex: '#f4f6f8' },
  { name: 'Grey', hex: '#9aa0a6' },
  { name: 'Dark grey', hex: '#3c4147' },
]

/**
 * The setting-out grid's line colour, for a given background.
 *
 * DERIVED, not picked from a pair. It used to be one of two fixed greys chosen
 * by a luminance threshold, which works at the ends and fails in the middle:
 * on a mid grey the "light" grey is almost the background's own lightness and
 * the grid disappears into it. Shifting the BACKGROUND itself toward black or
 * white by a fixed amount keeps the same separation wherever it lands, and
 * takes a tint from the background rather than laying slate over beige.
 *
 * sRGB luminance rather than the linear value three.js would hand back, because
 * the question is how light the background LOOKS, not how much light it emits.
 *
 * The background is user-set and the picker offers a custom colour, so this has
 * to hold for anything — not only the three presets.
 */
export function gridLineColour(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  // Anything unreadable keeps the old mid grey rather than throwing: a grid is
  // not worth failing a render over.
  if (!m) return '#8b95a1'
  const n = parseInt(m[1], 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  // Toward black on a light background, toward white on a dark one. Not the
  // same distance either way: a light line has to travel less to read.
  const to = lum > 0.5 ? 0 : 255
  const k = lum > 0.5 ? 0.55 : 0.45
  return '#' + rgb
    .map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, '0'))
    .join('')
}

/** Put the theme on <html>, which is what the token blocks key off. */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return theme
  const next = THEMES.includes(theme) ? theme : THEMES[0]
  // Light is the default block on :root, so it carries no attribute — an
  // explicit data-theme="light" would work too, but leaving it off means the
  // markup says what is unusual rather than restating the default.
  if (next === 'light') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = next
  return next
}
