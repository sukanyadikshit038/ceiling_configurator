# legacy/ — the pre-restructure app

The original single-page AcoustiConfig build: vanilla ES modules, three.js from a
CDN import map, an imperative DOM UI and a hand-rolled Node file server. It is
kept here for one reason only.

**It is the porting source for ceiling tiles and clouds.** Those two product
families are fully implemented here and not yet in `app/`:

| what | where |
|---|---|
| Tile grid builder, per-tile overrides, runners | `js/products.js` — `buildTileGrid`, `tileTexture` |
| Cloud shapes, edges, Series patterns | `js/products.js` — `buildCloud`, `cloudMaterial`, `cloudShapePath` |
| Embossed baffle layouts 1–5, cloud layouts 1–6 | `js/layouts.js` |
| Inspiration presets (11 staged scenes) | `js/layouts.js` — `INSPIRATIONS` |
| Cinematic walkthrough recorder (dev tool) | `js/walkthrough.js` |

Everything else has been ported into `app/` and improved there — the catalogue,
the procedural textures, the furnished rooms, the baffle builder.

Nothing here runs as part of the current app, nothing imports from it, and it is
excluded from the build. **Delete this directory once tiles and clouds have
landed in `app/`** — git history keeps it either way (`git show 899c1f7:js/products.js`).

Two things in here were already broken before the restructure and were not
carried over:

- `Start AcoustiConfig.bat` points at `C:\Users\sukanya.d\Documents\AcoustiConfig`,
  which is not where this repo lives.
- `serve.js` exposes `/__export`, `/__video`, `/__asset` and `/__shot`, which
  write files to disk. They are localhost-gated, but they shipped in the same
  server as the app. `app/` has no server at all — it is static files.
