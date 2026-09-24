import { useEffect, useState } from 'react'
import Scene from './three/Scene.jsx'
import TopBar from './ui/TopBar.jsx'
import LeftPanel from './ui/LeftPanel.jsx'
import RightPanel from './ui/RightPanel.jsx'
import FabricManager from './ui/FabricManager.jsx'
import FocusModal from './ui/FocusModal.jsx'
import FocusChooser from './ui/FocusChooser.jsx'
import { useStore } from './lib/store.js'

export default function App({ startup = null }) {
  const [view, setView] = useState('eye')
  // Turntable: orbits horizontally around the current target, keeping the
  // camera's height and distance. Camera state, so it sits next to `view`
  // rather than in the store, which holds the document and panel state.
  const [spin, setSpin] = useState(false)
  const [fabricsOpen, setFabricsOpen] = useState(false)

  // Hold Space to pan. Kept apart from the shortcut handler below because it
  // needs a keyup and a blur as well — alt-tabbing away while Space is held
  // never delivers the keyup, and the app would be stuck in pan mode forever.
  useEffect(() => {
    const typing = (t) =>
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

    const down = (e) => {
      if (e.code !== 'Space' || typing(e.target)) return
      e.preventDefault() // Space would otherwise scroll the page
      useStore.getState().setSpacePan(true)
    }
    const up = (e) => {
      if (e.code !== 'Space') return
      useStore.getState().setSpacePan(false)
    }
    const release = () => useStore.getState().setSpacePan(false)

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      release()
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      // never hijack typing in a field
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.code === 'Space') return // handled above

      const s = useStore.getState()

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return s.undo()
      }
      if (e.key === 'Escape') {
        if (s.focusAsk) return s.cancelFocusAsk()
        if (s.focusId) return s.closeFocus()
        if (fabricsOpen) return setFabricsOpen(false)
        return s.selectFin(null) ?? s.select(null)
      }

      const id = s.selectedId
      if (!id || e.ctrlKey || e.metaKey) return
      // The item shortcuts all act on the ceiling behind the focus editor —
      // nudging a set you cannot see move, or deleting the one you are editing.
      // Undo above stays available; these do not.
      if (s.focusId) return

      const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (nudge) { e.preventDefault(); return s.move(id, nudge[0], nudge[1]) }

      const k = e.key.toLowerCase()
      if (k === 'r') { e.preventDefault(); return s.rotate(id) }
      if (k === 'd') { e.preventDefault(); return s.duplicate(id) }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return s.remove(id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fabricsOpen])

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar
        view={view} setView={setView}
        spin={spin} setSpin={setSpin}
        onOpenFabrics={() => setFabricsOpen(true)}
        /* What happened to a configuration in the address bar, if there was
           one. A prop rather than a field on the store: it is a fact about how
           this session STARTED, not part of the document, and putting it in the
           store would mean something that has to be cleared. */
        startup={startup}
      />
      <div className="relative flex min-h-0 flex-1">
        <LeftPanel />
        <main className="relative min-w-0 flex-1">
          <Scene view={view} spin={spin} />
        </main>
        <RightPanel />
        {fabricsOpen && <FabricManager onClose={() => setFabricsOpen(false)} />}
        <FocusChooser />
        <FocusModal />
      </div>
    </div>
  )
}
