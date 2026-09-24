# UniVicoustic Configurator — UI Colour Theme

A specification for reproducing the visual theme of `configurator.univicoustic.com`
in another wall configurator. Values are extracted from the live codebase, not
approximated.

**Stack it came from:** React + Tailwind CSS + shadcn/ui. The token names below are
shadcn/ui conventions. If the target app uses the same stack, this drops in almost
unchanged. If it does not, use the hex values and the usage rules — those are what
actually define the look.

---

## 1. The short version

If you only take three things:

| | Value | Where it goes |
| --- | --- | --- |
| **Accent** | `#D65757` (muted coral red) | Primary buttons, selected states, links |
| **Primary text** | `#344256` (dark desaturated navy) | Headings, body copy, icons |
| **Background** | `#FFFFFF` (pure white) | Everything behind everything |

The character of this theme is **a near-neutral cool grey interface with a single warm
accent**. There is no second accent colour. Nothing competes with the coral.

---

## 2. Design tokens

Defined as HSL components (space-separated, no `hsl()` wrapper) on `:root`. That format
is required for Tailwind's `<alpha-value>` opacity substitution to work.

```css
:root {
  /* Surfaces */
  --background:            0 0% 100%;        /* #FFFFFF */
  --card:                  0 0% 100%;        /* #FFFFFF */
  --popover:               0 0% 100%;        /* #FFFFFF */

  /* Text */
  --foreground:            215 25% 27%;      /* #344256 */
  --card-foreground:       215 25% 27%;      /* #344256 */
  --popover-foreground:    215 25% 27%;      /* #344256 */
  --muted-foreground:      215 16% 47%;      /* #65758B */

  /* Primary (dark neutral, NOT the brand colour) */
  --primary:               215 25% 27%;      /* #344256 */
  --primary-foreground:    0 0% 100%;        /* #FFFFFF */

  /* Secondary / muted fills */
  --secondary:             210 40% 96.1%;    /* #F1F5F9 */
  --secondary-foreground:  222.2 47.4% 11.2%;/* #0F172A */
  --muted:                 210 40% 96.1%;    /* #F1F5F9 */

  /* Brand accent — the only saturated colour in the UI */
  --accent:                0 61% 59%;        /* #D65757 */
  --accent-foreground:     0 0% 100%;        /* #FFFFFF */
  --accent-hover:          0 47% 52%;        /* #BE4B4B */

  /* Feedback */
  --destructive:           0 84.2% 60.2%;    /* #EF4444 */
  --destructive-foreground:0 0% 98%;         /* #FAFAFA */

  /* Lines and focus */
  --border:                214.3 31.8% 91.4%;/* #E2E8F0 */
  --input:                 214.3 31.8% 91.4%;/* #E2E8F0 */
  --ring:                  215 25% 27%;      /* #344256 */

  --radius: 0.5rem;                          /* 8px */
}
```

### Two things that are easy to get wrong

**`--primary` is not the brand colour.** It is the dark navy-grey, used for text and
default buttons. The coral lives in `--accent`. Swapping these produces a UI that is
aggressively red and looks nothing like the original.

**Only `--accent` and `--accent-hover` need changing to rebrand.** Every accent-coloured
surface in the app derives from those two. That indirection is deliberate — preserve it.

---

## 3. The grey ramp

All interface greys sit on **hue 215 at 16% saturation** — a cool, slightly blue grey.
The only exception is `#344256` at 25% saturation, which is deliberately deeper for
headings.

| Hex | HSL | Used for | Frequency in codebase |
| --- | --- | --- | --- |
| `#344256` | `215 25% 27%` | Headings, primary text, icons | 62 uses |
| `#65758B` | `215 16% 47%` | Body copy, secondary text, captions | 106 uses |
| `#7A899F` | `215 16% 55%` | Tertiary text, inactive icons | 10 uses |
| `#8996A9` | `215 16% 60%` | Placeholder text | 5 uses |
| `#D9DDE3` | `215 16% 87%` | Subtle dividers | 3 uses |
| `#EDEFF2` | `215 16% 94%` | Subtle fills, hover backgrounds | 2 uses |
| `#E2E8F0` | `214 32% 91%` | Standard borders (`--border`) | token |
| `#F1F5F9` | `210 40% 96%` | Muted panel fills (`--secondary`) | token |

**Do not substitute pure greys** (`#888`, `#666`, Tailwind's default `gray-*`). The
consistent blue cast is a large part of why the interface reads as calm rather than
clinical. Tailwind's `slate-*` scale is the closest stock equivalent if you cannot use
custom values.

---

## 4. Accent usage rules

The accent is used sparingly and always means the same thing: **this is actionable, or
this is selected.**

| Context | Treatment |
| --- | --- |
| Primary button | `background: #D65757`, `color: #FFFFFF` |
| Primary button hover | `background: #BE4B4B` |
| Selected swatch / tile | `#D65757` border or ring |
| Text link | `color: #D65757`, underline on hover |
| Icon container | `#D65757` at 10% opacity as background, full-strength icon |
| Focus ring | `#344256` — **not** the accent |

Opacity variants actually used: **4%, 5%, 10%**, for tinted backgrounds behind icons and
selected rows. Anything heavier competes with filled buttons.

**Secondary buttons** are outlined, not filled: transparent background, `#E2E8F0` border,
`#344256` text.

---

## 5. Typography

Included because it materially affects whether the colours read correctly.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@500;700;800&display=swap');

body    { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
h1, h2  { font-family: 'Manrope', sans-serif; }   /* headings only */
```

- **Inter** — all body text, labels, buttons. Weights 400 / 500 / 600.
- **Manrope** — headings. Weights 500 / 700 / 800, usually with tight letter-spacing.

The dark navy `#344256` was chosen against Manrope's geometry. With a heavier or more
contrasty display face it can read as harsh.

---

## 6. Shape and elevation

| Property | Value |
| --- | --- |
| Base radius | `0.5rem` (8px) — `--radius` |
| Large radius | `var(--radius)` → cards, dialogs |
| Small radius | `calc(var(--radius) - 4px)` → 4px, badges and chips |
| Pills | `border-radius: 9999px` → floating buttons only |
| Card border | `1px solid #E2E8F0` |
| Card shadow | Tailwind `shadow-xl` / `shadow-2xl` on floating panels only |

Flat surfaces are the default. Shadow signals **floating above the page** (dialogs,
toasts, the chat button), never mere grouping. Grouping is done with a 1px border.

---

## 7. Dark mode

**There is none.** The Tailwind config declares `darkMode: ["class"]` but no `.dark`
token block exists, so adding the class would produce an unstyled result.

If the target app needs dark mode, it must be designed from scratch. Do not assume
inverted values will work — `#D65757` at 59% lightness loses contrast badly on dark
surfaces and needs lifting to roughly 68–70% lightness to stay legible.

---

## 8. Porting checklist

1. Copy the `:root` block from §2 verbatim.
2. Map your framework's colour utilities to those variables. For Tailwind, wrap each in
   `hsl(var(--token))`, and use `hsl(var(--accent) / <alpha-value>)` for the accent so
   opacity modifiers work.
3. Load Inter and Manrope; set Manrope on headings only.
4. Set base radius to 8px.
5. Replace any pure-grey text colours with the §3 ramp.
6. Audit accent usage — if more than roughly one element per screen area is coral, it is
   being overused.

### Verifying you got it right

Put the two apps side by side and check:

- The interface reads **cool blue-grey**, not warm or neutral grey.
- There is exactly **one** saturated colour on screen.
- Headings are noticeably darker than body text, not merely bolder.
- Buttons and cards are **8px** rounded, not fully pill-shaped or square.

---

## Appendix — complete hex list

```
#FFFFFF   background, card, popover, text on accent
#344256   foreground, primary, ring — headings and primary text
#65758B   muted-foreground — body and secondary text
#7A899F   tertiary text, inactive icons
#8996A9   placeholder text
#D9DDE3   subtle dividers
#E2E8F0   border, input
#EDEFF2   subtle fills
#F1F5F9   secondary, muted panel fills
#0F172A   secondary-foreground
#D65757   ACCENT — primary actions, selected states
#BE4B4B   accent hover
#EF4444   destructive
#FAFAFA   destructive-foreground
```
