import { useRef, useState, useSyncExternalStore } from 'react'
import {
  FABRICS, subscribe, addFabric, removeFabric, fabricURL, MAX_BYTES,
} from '../lib/fabrics.js'
import { initFabricTextures, forgetFabricTexture } from '../lib/textures.js'
import { Button, Field, Slider, Note, Empty } from './bits.jsx'

/**
 * Fabrics the user has added, stored in their own browser.
 *
 * Deliberately blunt about the trade-off: this replaces the server-backed
 * upload the old build had, because the app is served as static files from S3
 * and there is nothing to POST to. A fabric here is private to this browser.
 */
export default function FabricManager({ onClose }) {
  const fabrics = useSyncExternalStore(subscribe, () => FABRICS, () => FABRICS)
  const fileRef = useRef()
  const [pending, setPending] = useState(null) // { file, name, scale }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setError(null)
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_BYTES / 1024 / 1024} MB.`)
      return
    }
    setPending({
      file,
      name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      scale: 0.5,
      preview: URL.createObjectURL(file),
    })
  }

  const save = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await addFabric(pending.file, { name: pending.name, scale: pending.scale })
      // the material builder reads decoded textures, so load it before the
      // swatch can be picked — otherwise the first use renders the fallback
      await initFabricTextures()
      URL.revokeObjectURL(pending.preview)
      setPending(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const drop = async (f) => {
    if (!confirm(`Remove “${f.name}”? Sets using it fall back to their family's first colour.`)) return
    forgetFabricTexture(f.id)
    await removeFabric(f.id)
  }

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center bg-scrim/60 p-6" onClick={onClose}>
      <div
        className="max-h-full w-[560px] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="font-display text-[14px] font-bold text-txt">Fabrics</h2>
            <p className="mt-0.5 text-[11px] text-txt-3">
              Appear under Designer Textiles · stored in this browser only
            </p>
          </div>
          <Button variant="outline" className="h-8 px-3" onClick={onClose}>Close</Button>
        </header>

        <div className="space-y-4 p-5">
          <Note tone="warn">
            A fabric added here stays on this machine, in this browser. It is not shared with
            anyone, does not travel with an exported layout, and is lost if site data is cleared.
            Fabrics everyone should see belong in the repo as files, like the Wood Classic veneers.
          </Note>

          {!pending ? (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} className="hidden" />
              <Button variant="outline" className="h-9 w-full" onClick={() => fileRef.current?.click()}>
                Choose an image…
              </Button>
              <Note>Tileable PNG, JPEG or WebP, up to {MAX_BYTES / 1024 / 1024} MB.</Note>
            </>
          ) : (
            <div className="space-y-3.5 rounded-lg border border-line bg-fill p-4">
              <div
                className="h-28 w-full rounded-md ring-1 ring-line"
                style={{ backgroundImage: `url(${pending.preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
              <Field label="Name">
                <input
                  value={pending.name}
                  maxLength={60}
                  onChange={(e) => setPending({ ...pending, name: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-txt outline-none focus:border-accent/60"
                />
              </Field>
              <Field
                label="Physical size of one tile"
                hint={`${pending.scale.toFixed(2)} m`}
                help="How large one repeat of the image is in the real world. This is what makes the weave read at the right scale on a fin."
              >
                <Slider min={0.1} max={3} step={0.05} value={pending.scale} onChange={(scale) => setPending({ ...pending, scale })} />
              </Field>
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="solid" className="h-8" onClick={save} disabled={busy}>
                  {busy ? 'Adding…' : 'Add fabric'}
                </Button>
                <Button
                  variant="outline"
                  className="h-8"
                  onClick={() => { URL.revokeObjectURL(pending.preview); setPending(null) }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && <Note tone="bad">{error}</Note>}

          <div>
            <h3 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-txt-3">
              In this browser
            </h3>
            {!fabrics.length ? (
              <Empty>No fabrics yet.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {fabrics.map((f) => (
                  <div key={f.id} className="overflow-hidden rounded-lg border border-line bg-fill">
                    <div
                      className="h-20 w-full"
                      style={{ backgroundImage: `url(${fabricURL(f.id)})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    />
                    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] text-txt">{f.name}</div>
                        <div className="text-[10px] text-txt-3">tile {Number(f.scale).toFixed(2)} m</div>
                      </div>
                      <Button variant="danger" className="h-6 shrink-0 px-2" onClick={() => drop(f)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
