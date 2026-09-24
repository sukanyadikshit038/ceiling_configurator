// Shared UI primitives, so the panels stay readable and consistent.
// No product knowledge lives here — these are presentation only.

import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { createPortal } from 'react-dom'

export function Panel({ title, right, children, className = '' }) {
  return (
    <section className={`border-b border-line-soft ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-txt-3">
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

export function Button({ active, variant = 'ghost', className = '', ...p }) {
  // Corners belong to the variant, not the base: `highlight` is square, and a
  // `rounded-none` bolted on through className would lose to the base rule —
  // both are border-radius at the same specificity, and Tailwind emits
  // rounded-none first.
  // `shrink-0`: in a flex toolbar the default is for items to shrink until
  // their labels wrap, so a crowded bar turns every two-word button into two
  // lines. Refusing to shrink keeps each one at its natural width and lets the
  // bar overflow — which scrolls — instead of silently reflowing the labels.
  //
  // Deliberately NOT whitespace-nowrap, which is the blunt way to do the same
  // thing and breaks every button whose content is a block of text rather than
  // a label: the layout presets are a title over a description, and nowrap sent
  // those descriptions off the side of the panel.
  const base =
    'inline-flex shrink-0 items-center justify-center gap-1.5 text-[12px] ' +
    'font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed select-none'
  const styles = {
    ghost: 'rounded-md ' + (active
      ? 'bg-accent text-on-accent'
      : 'bg-fill text-txt hover:bg-fill-2 hover:text-txt'),
    solid: 'rounded-md bg-accent hover:bg-accent-600 text-on-accent',
    outline: 'rounded-md border border-line text-txt-2 hover:bg-fill hover:text-txt',
    danger: 'rounded-md bg-danger/15 text-danger hover:bg-danger/25',
    // the one call to action in a panel of grey controls — square, so it does
    // not read as just another pill
    highlight: 'bg-amber-400 text-ink-900 hover:bg-amber-300 font-semibold',
  }
  return <button type="button" className={`${base} ${styles[variant]} ${className}`} {...p} />
}

/**
 * A run of controls locked as ONE thing.
 *
 * Some answers are not a single Field. A cloud's finish is a family, a colour
 * grid and sometimes a weave, and those components bring their own Fields along
 * — so the block is made inert as a unit rather than each one gated.
 *
 * IT HAS TO BE ABLE TO SPEAK. `locked` is the label of the answer it waits on
 * when this is the topmost locked thing on the panel, and `true` when something
 * above it is already explaining. A block that could only ever be silent left a
 * greyed-out run of pickers with no line anywhere saying what they were waiting
 * for — a form that looks broken rather than one that is guiding you. Found by
 * walking the panel and counting the explanations: exactly one, and on the
 * topmost locked thing.
 */
export function LockedBlock({ locked = null, className = 'space-y-3', children }) {
  return (
    <>
      {typeof locked === 'string' && (
        <div className="text-[11px] text-txt-3">Choose {locked.toLowerCase()} first</div>
      )}
      <div
        inert={locked ? true : undefined}
        className={locked ? `pointer-events-none opacity-40 ${className}` : className}
      >
        {children}
      </div>
    </>
  )
}

/**
 * A labelled control, optionally LOCKED until an earlier answer exists.
 *
 * `locked` is the LABEL of the answer being waited for, or null when the field
 * is free — see lib/gate.js. A label rather than a boolean so the field can say
 * what it wants, which is the difference between a form that is guiding you and
 * one that looks broken.
 *
 * Locked means dimmed AND `inert`: pointer-events alone would still leave the
 * control in the tab order, so a keyboard could fill in a field the mouse
 * cannot reach. inert takes it out of the tab order, out of the accessibility
 * tree and out of reach of a click, in one attribute.
 *
 * The hint is replaced rather than joined. A locked field has nothing useful to
 * say about its own value yet, and "mm" beside "Choose a shape first" is noise.
 */
export function Field({ label, hint, help, locked = null, children }) {
  return (
    <label
      className="block"
      title={help || undefined}
      /* THE LABEL HAS TO REFUSE THE CLICK ITSELF.
         inert and pointer-events:none are both on the box below, and both work
         — but a <button> is a LABELABLE element, so a click landing on this
         <label> is forwarded to the nested control as the label's DEFAULT
         ACTION. It never travels through the inert box, so neither guard sees
         it. Measured: elementFromPoint at a locked dropdown's centre returns
         this label, and a real mouse click opened the list with inert and
         pointer-events both confirmed active. A synthetic .click() on the
         button was blocked, which is how it hid — the bug only appears under a
         click that does hit-testing. */
      onClick={locked ? (e) => e.preventDefault() : undefined}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={`text-[11px] font-medium ${locked ? 'text-txt-3' : 'text-txt-2'} ${help ? 'cursor-help underline decoration-dotted underline-offset-2' : ''}`}>
          {label}
        </span>
        {/* A STRING says what it is waiting for; `true` just dims. Only the
            first locked field in a panel carries the message — five fields all
            saying "Choose shape first" is noise, and the one at the top of the
            staircase is the one being read. */}
        {locked
          ? (typeof locked === 'string'
              ? <span className="shrink-0 text-[11px] text-txt-3">Choose {locked.toLowerCase()} first</span>
              : null)
          : hint && <span className="shrink-0 text-[11px] tabular-nums text-txt-3">{hint}</span>}
      </div>
      <div inert={locked ? true : undefined} className={locked ? 'pointer-events-none opacity-40' : ''}>
        {children}
      </div>
    </label>
  )
}

/**
 * A caption for one control inside a Field, where the Field holds more than one.
 *
 * NOT A <label>. Field is already a <label>, and labels do not nest — a nested
 * one is invalid, and it would also give the inner control a second labelable
 * ancestor, which is the exact mechanism that forwarded clicks into locked
 * fields. A span says what it says and forwards nothing.
 */
export function SubLabel({ children, className = '' }) {
  return (
    <span className={`mb-1 block text-[10px] font-medium uppercase tracking-wide text-txt-3 ${className}`}>
      {children}
    </span>
  )
}

/** A row of mutually exclusive options. `cols` keeps long lists from wrapping oddly. */
export function Choice({ options, value, onChange, cols = 3 }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <Button
          key={String(o.value)}
          active={value === o.value}
          disabled={!!o.disabled}
          onClick={() => onChange(o.value)}
          className="h-7 px-0"
          title={o.help || undefined}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * A number you can step or type.
 *
 * This replaced the sliders in the parameter panels. A slider is a good way to
 * sweep a value and a poor way to set one, and every number in these forms is a
 * product dimension somebody already knows: 1800 mm, 13 fins, 155 mm. Dragging
 * to land on those is work, and on a 100–30000 range it is barely possible.
 *
 * While the field has focus it holds the typed text rather than the committed
 * number, so a half-typed "1" on the way to "1800" is not clamped to the
 * minimum under the cursor. Enter and blur commit; Escape and anything
 * unparseable put the real value back.
 *
 * `unit` is a suffix only — the caller does any conversion, so a drop stored in
 * metres is passed and returned here in millimetres and never renders as
 * "0.45" beside a label that says mm.
 */
export function Stepper({
  value, onChange, min = -Infinity, max = Infinity, step = 1,
  unit, decimals = 0, disabled = false,
  // where an unset field lands on its first nudge; the minimum unless told
  startAt,
}) {
  const [draft, setDraft] = useState(null)

  const clamp = (v) => Math.min(max, Math.max(min, v))
  // Round to the shown precision rather than snapping to multiples of the step.
  // Snapping looks tidy and is wrong: a 14.0 m width with a 0.3 m step is not
  // on that grid, so + would take it to 14.4 and - to 13.8, and the number it
  // started on would be unreachable. Stepping moves BY the step from wherever
  // you are; rounding here only keeps the stored value and the displayed one
  // from disagreeing in the sixth decimal.
  const tidy = (v) => +v.toFixed(decimals)
  const shown = (v) => (Number.isFinite(v) ? v.toFixed(decimals) : '')

  const commit = (text) => {
    setDraft(null)
    const n = parseFloat(text)
    if (Number.isNaN(n)) return // Escape-like: the real value is re-rendered
    const next = clamp(tidy(n))
    if (next !== value) onChange(next)
  }

  const bump = (dir) => {
    setDraft(null)
    // An UNSET field shows blank and has no number to step from. The first
    // press commits the starting point rather than adding to nothing — without
    // this, null + step is NaN and the field would commit that.
    if (!Number.isFinite(value)) { onChange(clamp(tidy(startAt ?? min))); return }
    const next = clamp(tidy(value + dir * step))
    if (next !== value) onChange(next)
  }

  const arrow =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fill text-[14px] ' +
    'leading-none text-txt-2 transition-colors hover:bg-fill-2 hover:text-txt ' +
    'disabled:opacity-30 disabled:hover:bg-fill disabled:hover:text-txt-2'

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button" className={arrow} aria-label="Decrease"
        /* the arrows are not tab stops: tabbing through a form should land on
           the value you type into, not on two buttons either side of it */
        tabIndex={-1}
        disabled={disabled || value <= min}
        onClick={() => bump(-1)}
      >
        −
      </button>

      <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-line bg-surface-2 px-2 focus-within:border-accent/60">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? shown(value)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value); e.currentTarget.blur() }
            else if (e.key === 'Escape') { e.preventDefault(); setDraft(null); e.currentTarget.blur() }
            else if (e.key === 'ArrowUp') { e.preventDefault(); bump(1) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1) }
          }}
          className="w-full min-w-0 bg-transparent text-center text-[12px] tabular-nums text-txt outline-none"
        />
        {unit && <span className="ml-1 shrink-0 text-[11px] text-txt-3">{unit}</span>}
      </div>

      <button
        type="button" className={arrow} aria-label="Increase" tabIndex={-1}
        disabled={disabled || value >= max}
        onClick={() => bump(1)}
      >
        +
      </button>
    </div>
  )
}

/**
 * A slider over a Stepper: sweep it, or type the number.
 *
 * Two controls over one value because they are good at different things. A
 * slider finds "about there" in one gesture and cannot be precise across a
 * range this wide — 50 to 2000 mm is two millimetres a pixel — and a typed box
 * is exact but makes you know the number before you start. Having both means
 * neither has to be the only way in.
 *
 * The Stepper underneath already accepts typed entry and nudges by the step, so
 * this adds the sweep and nothing else.
 */
export function SliderStepper({
  value, onChange, min, max, step = 1, unit, decimals = 0, startAt,
}) {
  const safe = Number.isFinite(value) ? value : (startAt ?? min)
  return (
    <div className="space-y-1.5">
      <Slider min={min} max={max} step={step} value={safe} onChange={onChange} />
      <Stepper
        value={value} onChange={onChange}
        min={min} max={max} step={step}
        unit={unit} decimals={decimals} startAt={startAt}
      />
    </div>
  )
}

/** Kept for the fabric tile size, where sweeping against a live preview is the point. */
export function Slider({ min, max, step, value, onChange }) {
  return (
    <input
      type="range"
      min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(+e.target.value)}
      className="w-full accent-accent"
    />
  )
}

/**
 * A dropdown, built rather than borrowed.
 *
 * WHY NOT A <select>. A native select's popup is drawn by the operating system,
 * not by the page: its width, corners, background and spacing cannot be styled
 * at all. So the closed control looked like the rest of the app and the open
 * list looked like Windows — different width, square corners, system blue.
 * There is no CSS that fixes that. Chrome 135+ can opt in with
 * `appearance: base-select`, but Firefox and Safari cannot, and a fix that only
 * lands for some people is a fix that has to be explained forever.
 *
 * WHAT IT COSTS. Everything the native element did for free has to be done
 * here: arrow keys, Home and End, type-ahead, Enter and Escape, focus that
 * comes back to the button, closing on an outside click, skipping disabled
 * rows, and the ARIA that tells a screen reader any of this is happening. That
 * list is the honest price of the look, and it is written out below so nobody
 * has to wonder whether a case was considered or missed.
 *
 * ATTACHED, NOT FLOATING. While open the button's bottom corners square off,
 * the list's top corners square off, the list takes the button's exact width,
 * and it is pulled up a pixel so the two borders land on each other instead of
 * stacking into a double line. One shape.
 *
 * IT IS PORTALLED, AND THAT IS NOT OPTIONAL. Both side panels are
 * `overflow-y-auto`, so a list positioned inside one would be clipped by the
 * scroll container the moment it was longer than the space left below the
 * button. So it renders into document.body at fixed coordinates taken from the
 * button, and follows it on scroll and resize.
 *
 * The value handed to onChange is the OPTION'S OWN VALUE, not a string — the
 * bargain `Choice` made and a native select could not. A size stays the number
 * 1200 rather than arriving as "1200" and failing a strict lookup.
 *
 * An option with an empty value is a PLACEHOLDER: it names the unanswered state
 * on the button and is not offered as a row, because "Choose a shape…" is not
 * a shape. An option may carry `group` to print a heading above it, which is
 * what <optgroup> used to do for the room list.
 */
export function Select({ options, value, onChange, onHighlight, className = '' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [box, setBox] = useState(null)
  const btn = useRef(null)
  const list = useRef(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId()
  // Held in a ref so the effect below can depend on the HIGHLIGHT MOVING rather
  // than on the callback's identity — an inline arrow is a new function every
  // render, and depending on it would fire the effect every render instead of
  // when something changed.
  const highlight = useRef(onHighlight)
  highlight.current = onHighlight

  const rows = options.filter((o) => o.value !== '')
  const placeholder = options.find((o) => o.value === '')
  const chosen = options.find((o) => o.value === value)
  const label = chosen?.label ?? placeholder?.label ?? ''
  const pickable = rows.reduce((a, o, i) => (o.disabled ? a : [...a, i]), [])

  /** Where the list goes: the button's own box, flipped up if it will not fit. */
  const place = () => {
    const b = btn.current?.getBoundingClientRect()
    if (!b) return
    const wanted = Math.min(rows.length * 30 + 8, 260)
    const below = window.innerHeight - b.bottom
    const up = below < wanted && b.top > below
    setBox({
      left: b.left, width: b.width, up,
      // A pixel of overlap, so the button's bottom border and the list's top
      // border are the same line rather than two touching ones.
      top: up ? null : b.bottom - 1,
      bottom: up ? window.innerHeight - b.top - 1 : null,
    })
  }

  useLayoutEffect(() => { if (open) place() }, [open, rows.length])

  useEffect(() => {
    if (!open) return undefined
    // Capture, so it also hears the side panels scrolling — they are the
    // reason the list is portalled in the first place.
    const follow = () => place()
    const away = (e) => {
      if (btn.current?.contains(e.target) || list.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    document.addEventListener('pointerdown', away, true)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
      document.removeEventListener('pointerdown', away, true)
    }
  })

  // Keep the highlighted row on screen when the arrows walk past the edge.
  useEffect(() => {
    if (!open) return
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  /**
   * Tell the caller which row is under the cursor, and null when the list
   * shuts.
   *
   * Optional, and only one caller wants it: the preset panel shows the
   * highlighted layout's description under the control, so it can be read
   * BEFORE committing to a layout that replaces the whole ceiling. Reported
   * from here rather than guessed at from hover handlers outside, because the
   * keyboard moves this highlight too and a hint that only followed the mouse
   * would be missing exactly when it was most needed.
   */
  useEffect(() => {
    highlight.current?.(open && active >= 0 ? rows[active]?.value ?? null : null)
  }, [open, active])

  const commit = (i) => {
    const o = rows[i]
    if (!o || o.disabled) return
    onChange(o.value)
    setOpen(false)
    btn.current?.focus()
  }

  const step = (dir) => {
    if (!pickable.length) return
    const at = pickable.indexOf(active)
    const next = at < 0
      ? (dir > 0 ? pickable[0] : pickable[pickable.length - 1])
      : pickable[(at + dir + pickable.length) % pickable.length]
    setActive(next)
  }

  const show = () => {
    const at = rows.findIndex((o) => o.value === value)
    setActive(at >= 0 && !rows[at].disabled ? at : (pickable[0] ?? -1))
    setOpen(true)
  }

  const onKey = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); return }
    if (e.key === 'Tab') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); return step(1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); return step(-1) }
    if (e.key === 'Home') { e.preventDefault(); return setActive(pickable[0] ?? -1) }
    if (e.key === 'End') { e.preventDefault(); return setActive(pickable[pickable.length - 1] ?? -1) }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return commit(active) }
    // Type-ahead, the one native behaviour people use without noticing. The
    // run resets after three quarters of a second, so "s" then later "q" is two
    // searches rather than a search for "sq".
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      typed.current.text = now - typed.current.at > 750 ? e.key : typed.current.text + e.key
      typed.current.at = now
      const want = typed.current.text.toLowerCase()
      const hit = pickable.find((i) => String(rows[i].label).toLowerCase().startsWith(want))
      if (hit !== undefined) setActive(hit)
    }
  }

  const square = open ? (box?.up ? 'rounded-t-none' : 'rounded-b-none') : ''

  return (
    <>
      <button
        ref={btn}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-o${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border
                    bg-surface-2 px-3 py-2 text-left text-[12px] text-txt outline-none transition-colors
                    ${open ? 'border-accent/60' : 'border-line hover:border-line-strong focus:border-accent/60'}
                    ${square} ${className}`}
      >
        <span className={`truncate ${chosen ? '' : 'text-txt-3'}`}>{label}</span>
        <span className={`shrink-0 text-[9px] leading-none text-txt-3 transition-transform
                          ${open ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>

      {open && box && createPortal(
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          style={{
            position: 'fixed', left: box.left, width: box.width,
            ...(box.up ? { bottom: box.bottom } : { top: box.top }),
          }}
          className={`z-50 max-h-[260px] overflow-y-auto border border-accent/60 bg-surface-2 py-1
                      shadow-[0_12px_28px_-8px_rgba(0,0,0,0.75)]
                      ${box.up ? 'rounded-t-lg rounded-b-none' : 'rounded-b-lg rounded-t-none'}`}
        >
          {rows.map((o, i) => (
            <div key={String(o.value)}>
              {/* A heading when the group changes. What <optgroup> did, and the
                  reason the room list could move off the native element. */}
              {o.group && o.group !== rows[i - 1]?.group && (
                <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-medium uppercase
                                tracking-wider text-txt-3">{o.group}</div>
              )}
              <div
                id={`${id}-o${i}`}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={!!o.disabled || undefined}
                data-active={active === i}
                // The list is exactly as wide as the button, which is the whole
                // point, so a long label truncates -- "Statement Solution
                // (Horizon) - coming soon" does. The full text on hover costs
                // nothing and means the ellipsis never hides something needed.
                title={String(o.label)}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[12px]
                  ${o.disabled
                    ? 'cursor-not-allowed text-txt-3'
                    : active === i ? 'bg-fill-2 text-txt' : 'text-txt'}`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <span className="shrink-0 text-[10px] text-accent">&#10003;</span>}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

export function Stat({ label, value, unit }) {
  return (
    <div className="rounded-lg bg-fill px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.1em] text-txt-3">{label}</div>
      <div className="mt-0.5 font-display text-[17px] font-bold tabular-nums text-txt">
        {value}
        {unit && <span className="ml-1 text-[11px] font-medium text-txt-3">{unit}</span>}
      </div>
    </div>
  )
}

export function Empty({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-[12px] leading-relaxed text-txt-3">
      {children}
    </p>
  )
}

export function Note({ children, tone = 'dim' }) {
  const tones = { dim: 'text-txt-3', warn: 'text-amber-400/80', bad: 'text-danger' }
  return <p className={`text-[11px] leading-relaxed ${tones[tone]}`}>{children}</p>
}
