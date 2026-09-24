import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execFile } from 'child_process'
// From its own dependency-free module, NOT from build-manifest: anything a
// Vite config imports becomes a config dependency, and build-manifest reaches
// src/lib/tiles.js — which made every edit to the tile module restart the dev
// server and blank the page. See scripts/model-files.mjs.
import { isModelFile } from './scripts/model-files.mjs'

// base '/ceiling/' mirrors production (BRIEF §4): the app is served from the
// S3 bucket behind CloudFront's /ceiling/* behavior. Running dev on the same
// base means a wrong asset path shows up here, not after the first deploy.

/**
 * Keeps public/models/manifest.json in step with the model folders.
 *
 * A browser cannot list a directory, so "drop a file in and it appears in the
 * app" needs a generated manifest. Rebuilt on dev-server start, whenever a
 * model file is added/removed/replaced, and once before every production build
 * — so the folders stay the single source of truth.
 */
function modelManifest() {
  const ROOT = path.resolve('public/models')
  let building = false
  let queued = false

  /**
   * Run the scanner in a CHILD PROCESS, not by importing it.
   *
   * Importing it was subtly wrong in a way that cost an afternoon. The import
   * was cache-busted with a query, so edits to the scanner itself were picked
   * up — but the scanner imports src/lib/models.js and src/lib/modelFins.js,
   * and those are NOT cache-busted. Node keeps them for the life of the
   * process, so a dev server left running since breakfast regenerated the
   * manifest with breakfast's code: measurements silently reverted, warnings
   * silently disappeared, and the file on disk disagreed with the source in the
   * same repository.
   *
   * A child process has no cache to be stale. It costs a few hundred
   * milliseconds on a file drop, which is nothing next to not being able to
   * trust the output.
   */
  const run = (why) => new Promise((resolve) => {
    if (building) { queued = true; resolve(); return }
    building = true
    execFile(
      process.execPath,
      [path.resolve('scripts/build-manifest.mjs')],
      { cwd: process.cwd() },
      (err, stdout, stderr) => {
        const tail = String(stdout).trim().split('\n').pop() ?? ''
        if (err) console.error('  [models] manifest failed:', String(stderr).trim() || err.message)
        else console.log(`  [models] ${why}: ${tail.trim()}`)
        building = false
        if (queued) { queued = false; run('follow-up change') }
        resolve()
      },
    )
  })

  return {
    name: 'model-manifest',
    async buildStart() { await run('scanned') },
    configureServer(server) {
      server.watcher.add(ROOT)
      const onChange = (f) => { if (isModelFile(f)) run(`${path.basename(f)} changed`) }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
      server.watcher.on('change', onChange)
    },
  }
}

export default defineConfig({
  base: '/ceiling/',
  plugins: [react(), modelManifest()],
  // three's loaders treat these as binary assets, not modules
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.fbx'],
  // host: true binds every interface, not just loopback, so the app is reachable
  // from a phone or another machine on the same network at http://<lan-ip>:5190/ceiling/
  server: { port: 5190, strictPort: true, host: true },
  // A built bundle can be looked at without stopping the dev server, which is
  // the only way to check a change against production output while someone is
  // still working in the app.
  preview: { port: 5191, strictPort: true, host: true },
})
