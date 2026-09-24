// What do you want to focus on: the whole baffle, or one fin of it?
//
// Asked on the way in rather than discovered inside. The two are different
// enough — a run hanging in a ceiling versus one unit and its clamps — that
// opening on the wrong one and then finding the switch is a worse first second
// than being asked.

import { useEffect } from 'react'
import { useStore } from '../lib/store.js'
import { baffleLabel, PRODUCT_TYPES } from '../lib/catalog.js'
import { isFinRun } from '../lib/models.js'
import { TILE_SIZES } from '../lib/tiles.js'
import { Button } from './bits.jsx'

function Choice({ title, blurb, onClick, art }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-line bg-fill p-3
                 text-left transition-colors hover:border-accent/50 hover:bg-fill"
    >
      <span className="mt-0.5 shrink-0 text-txt-3 transition-colors group-hover:text-accent">{art}</span>
      <span className="min-w-0">
        <span className="block font-display text-[13px] font-semibold text-txt">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-txt-3">{blurb}</span>
      </span>
    </button>
  )
}

/** Four fins, or one — enough to tell the two options apart at a glance. */
const RUN_ART = (
  <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1" fill="none">
      <path d="M3 2h28" />
      {[6, 13, 20, 27].map((x) => (
        <g key={x}>
          <path d={`M${x} 2v4`} />
          <rect x={x - 2} y="6" width="4" height="16" rx="1" fill="currentColor" fillOpacity="0.22" />
        </g>
      ))}
    </g>
  </svg>
)

const FIN_ART = (
  <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1" fill="none">
      <path d="M3 2h28" strokeOpacity="0.35" />
      <path d="M17 2v4" />
      <rect x="14" y="6" width="6" height="16" rx="1" fill="currentColor" fillOpacity="0.28" />
    </g>
  </svg>
)

/** A block of tiles, and one picked out of it. */
const BLOCK_ART = (
  <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1" fill="none">
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect
          key={`${r}-${c}`} x={4 + c * 9} y={3 + r * 7} width="8" height="6" rx="0.5"
          fill="currentColor" fillOpacity="0.22"
        />
      )))}
    </g>
  </svg>
)

const TILE_ART = (
  <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1" fill="none">
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect
          key={`${r}-${c}`} x={4 + c * 9} y={3 + r * 7} width="8" height="6" rx="0.5"
          strokeOpacity={r === 1 && c === 1 ? 1 : 0.3}
          fill="currentColor" fillOpacity={r === 1 && c === 1 ? 0.45 : 0.08}
        />
      )))}
    </g>
  </svg>
)

export default function FocusChooser() {
  const focusAsk = useStore((s) => s.focusAsk)
  const item = useStore((s) => s.items.find((i) => i.id === s.focusAsk) ?? null)
  const openFocus = useStore((s) => s.openFocus)
  const cancelFocusAsk = useStore((s) => s.cancelFocusAsk)

  const isTile = item?.type === 'tiles'
  // Every block has tiles to pick one out of, so a block always has two answers.
  //
  // Gated on the TYPE first, and that is not belt and braces. `isFinRun` is a
  // baffle predicate — it reads `params.model`, and a cloud has none, so it
  // answers TRUE for anything that is not a baffle. Asked directly it put the
  // "Whole baffle / Single fin" question in front of a hexagon cloud.
  const hasParts = item?.type === 'tiles' || item?.type === 'baffles'
  const run = !!item && hasParts && (isTile || isFinRun(item.params))

  useEffect(() => {
    // The set that was being asked about is gone — an undo, a preset, a delete.
    if (focusAsk && !item) cancelFocusAsk()
    // A question with one possible answer is not a question: a model that is
    // one sculpted object has no fins to pick out, so open it and say nothing.
    else if (item && !run) openFocus(item.id)
  }, [focusAsk, item, run, openFocus, cancelFocusAsk])

  if (!item || !run) return null

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-scrim/60 p-6"
      onClick={cancelFocusAsk}
    >
      <div
        className="w-[380px] rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-line-soft px-5 py-4">
          <h2 className="font-display text-[14px] font-semibold text-txt">Focus on what?</h2>
          <p className="mt-0.5 text-[11px] text-txt-3">
            {isTile ? (
              <>
                {PRODUCT_TYPES.tiles.label}
                {item.params.size && ` · ${TILE_SIZES[item.params.size]?.label}`}
                {' · '}{(item.params.cols ?? 4) * (item.params.rows ?? 3)} tiles
              </>
            ) : (
              <>
                {baffleLabel(item.params)} · {item.params.count} fin
                {item.params.count === 1 ? '' : 's'}
              </>
            )}
          </p>
        </header>

        <div className="space-y-2 px-5 py-4">
          {isTile ? (
            <>
              <Choice
                art={BLOCK_ART}
                title="Whole block"
                blurb="The ceiling as it sits — every tile, with its grid."
                onClick={() => openFocus(item.id)}
              />
              <Choice
                art={TILE_ART}
                title="Single tile"
                blurb="One tile, close up, with the finish it actually has. Opens on the first; switch tiles from the panel."
                onClick={() => openFocus(item.id, { solo: true })}
              />
            </>
          ) : (
            <>
              <Choice
                art={RUN_ART}
                title="Whole baffle"
                blurb="The run as it hangs — every fin, at its spacing and drop."
                onClick={() => openFocus(item.id)}
              />
              <Choice
                art={FIN_ART}
                title="Single fin"
                blurb="One fin with its own clamps and rods. Opens on the first; switch fins from the panel."
                onClick={() => openFocus(item.id, { solo: true })}
              />
            </>
          )}
        </div>

        <footer className="flex justify-end border-t border-line-soft px-5 py-3">
          <Button variant="outline" className="h-7 px-3" onClick={cancelFocusAsk}>Cancel</Button>
        </footer>
      </div>
    </div>
  )
}
