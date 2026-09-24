// What the GPU we ended up on can actually do.
//
// Anisotropy is the one that matters here. A baffle fin is long, thin and
// almost always seen at a grazing angle, so its texture is minified far harder
// along one axis than the other — a photographed weave on a 200-pixel-tall fin
// can be 60 texels deep per pixel vertically and 7 horizontally. Plain
// mipmapping picks one level for both and either blurs the fin to mush or, at
// the level below, lets the weave beat against the pixel grid as moiré.
//
// Anisotropic filtering is the fix, and the useful limit is the hardware's, not
// a number picked in advance. It is read once from the renderer and kept here
// because the texture builders have no renderer to ask.

let max = 4 // until a renderer says otherwise — the old hardcoded value

/** Called from each Canvas once its renderer exists. */
export function setMaxAnisotropy(n) {
  if (Number.isFinite(n) && n > 0) max = Math.max(max, Math.floor(n))
  return max
}

export const maxAnisotropy = () => max
