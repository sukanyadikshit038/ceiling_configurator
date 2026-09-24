/** @type {import('tailwindcss').Config} */
// Colours are TOKENS now, not shades. Each one resolves to a CSS custom
// property declared twice in src/index.css — once on :root (the light theme,
// transcribed from the wall configurator's spec) and once under
// [data-theme='dark'] (the ink palette this app shipped with). Switching the
// attribute on <html> repaints the whole interface; nothing here changes.
//
// `hsl(var(--x) / <alpha-value>)` rather than a plain var: that is what keeps
// `bg-accent/15` and `text-txt/70` working. A bare var() would make every
// opacity modifier in the app silently do nothing.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      borderRadius: {
        // 8px base, per the spec. `sm` is the spec's calc(radius - 4px).
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',

        line: 'hsl(var(--line) / <alpha-value>)',
        'line-soft': 'hsl(var(--line-soft) / <alpha-value>)',
        'line-strong': 'hsl(var(--line-strong) / <alpha-value>)',

        fill: 'hsl(var(--fill) / <alpha-value>)',
        'fill-2': 'hsl(var(--fill-2) / <alpha-value>)',

        txt: 'hsl(var(--txt) / <alpha-value>)',
        'txt-2': 'hsl(var(--txt-2) / <alpha-value>)',
        'txt-3': 'hsl(var(--txt-3) / <alpha-value>)',

        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          // 600 kept as the hover step so `hover:bg-accent-600` still reads the
          // way it did; it is the spec's --accent-hover in the light theme.
          600: 'hsl(var(--accent-hover) / <alpha-value>)',
        },
        'on-accent': 'hsl(var(--on-accent) / <alpha-value>)',

        danger: 'hsl(var(--danger) / <alpha-value>)',
        scrim: 'hsl(var(--scrim) / <alpha-value>)',

        // FIXED darks, kept deliberately. Not theme tokens — these are for the
        // handful of places that need a dark value in BOTH themes, such as the
        // text on the amber "Focus this cloud" button, which is light in either
        // theme and would lose its text if it followed --on-accent.
        ink: { 900: '#0e1116', 800: '#171b21', 700: '#1e242c', 600: '#2a313a', 500: '#3a424d' },
      },
    },
  },
  plugins: [],
}
