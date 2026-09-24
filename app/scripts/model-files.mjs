// Which paths are model files, in a module with NO dependencies.
//
// It lives on its own because vite.config.js imports it, and everything a Vite
// config imports — transitively, dynamic imports included — becomes a config
// dependency that RESTARTS THE DEV SERVER when it changes. Importing this from
// build-manifest.mjs instead pulled in src/lib/tiles.js, which the tile survey
// loads, so every edit to the tile module tore the server down and blanked the
// page mid-session.
//
// Nothing may be imported here. That is the whole point of the file.

/**
 * A model file the manifest is built from.
 *
 * Any depth under the folder, and both separators: the baffles are nested
 * <Type>/<Shape>.fbx, and a regex written for one path segment quietly stopped
 * matching them when that nesting arrived.
 */
export const isModelFile = (p) =>
  /[\\/]public[\\/]models[\\/](rooms|baffles|ceiling_tiles)[\\/].+\.(glb|gltf|fbx)$/i.test(p)
