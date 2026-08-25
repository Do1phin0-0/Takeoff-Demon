# Takeoff-Demon — DESIGN.md

Source of truth: `public/theme.css` (applied across `index.html`, `takeoff.html`, `takeoffs.html`, `reports.html`, `contracts.html`) and `public/favicon.svg`. This document describes what is built, not an aspiration — if `theme.css` changes, update this file in the same commit.

---

## 1. Visual Theme & Atmosphere

A working tool for construction estimators, not a marketing site. The tone is quiet, technical, and evidence-first: dark ground, one accent color, monospace type throughout. Nothing glows, nothing floats, nothing claims more polish than the feature underneath it has earned. Confidence and status are shown as small colored pills, not badges or celebratory UI — this app's whole job is to make an estimator trust a number, and trust comes from legibility, not decoration.

Think: a calibration tool's readout, not a SaaS landing page.

---

## 2. Color Palette & Roles

Dark mode only (`color-scheme: dark`). One accent, semantic status colors, no gradients.

| Token | Hex / value | Role |
|---|---|---|
| `--bg` | `#16171c` | Page background |
| `--bg-panel` | `#1a1b21` | Cards, panels, result boxes |
| `--bg-input` | `#1c1d23` | Form inputs |
| `--border` | `#24262d` | Default hairline borders |
| `--border-soft` | `#2a2c33` | Input/button borders, steps |
| `--text` | `#e6e6e4` | Body text |
| `--text-dim` | `#c9cacb` | Secondary body text |
| `--text-muted` | `#8a8d93` | Meta text, hints |
| `--text-faint` | `#5c5f66` | Timestamps, breadcrumb nav, disabled-adjacent |
| `--accent` | `#e2664f` | The single brand color — coral/rust. Primary buttons, links, active states, calibration UI |
| `--accent-strong` | `#f08972` | Hover state of accent |
| `--accent-contrast` | `#16171c` | Text on top of accent-filled elements |
| `--accent-bg` | `rgba(226,102,79,.12)` | Faint accent wash (rarely used) |
| `--green` | `#6fbf85` / bg `rgba(111,191,133,.12)` | Approved / ok / done |
| `--amber` | `#d3a25c` / bg `rgba(211,162,92,.12)` | Medium confidence / corrected / warning |
| `--red` | `#e5646a` / bg `rgba(229,100,106,.12)` | Low/invalid confidence / error |

**Rule:** one accent color for the whole app. Green/amber/red are reserved exclusively for confidence and review-status semantics — never used decoratively. Headline/value text (`#f2f2f0`) is the only off-palette color, used once for the largest number on a card (`.value`, `.stat .n`, `h1`).

---

## 3. Typography Rules

Single font family, no pairing: `'JetBrains Mono', ui-monospace, 'SF Mono', monospace` — everywhere, including body copy. This is deliberate, not a placeholder: the app is full of numbers, coordinates, and confidence values, and mono keeps them aligned and legible. No serif, no display sans.

| Element | Size | Weight | Notes |
|---|---|---|---|
| `h1` | 1.7rem | 600 | `letter-spacing: -0.01em`, color `#f2f2f0` |
| `h2` | 1rem | 600 | Section headers |
| `h3` | 0.95rem | 600 | Card sub-headers |
| Body | 1rem (browser default via `body`) | 400 | `line-height: 1.65` |
| `.hint` | 0.82rem | 400 | `line-height: 1.7`, `--text-muted` |
| `.value` (big number) | 1.3rem | 700 | `#f2f2f0`; unit suffix drops to 0.85rem/500/`--text-muted` |
| `.stat .n` | 1.5rem | 700 | Report tile numbers |
| Pills / badges | 0.75–0.8rem | 600 | `letter-spacing: 0.01em` |

---

## 4. Component Stylings

**Buttons** — `padding: 0.55rem 1rem`, `border-radius: 6px`, no border. Primary = `--accent` fill / `--accent-contrast` text, hovers to `--accent-strong`. Secondary (`.secondary`) = transparent fill, `--border-soft` outline, `--text-dim` text, hovers to accent-colored text + border, fill stays transparent. Disabled = `opacity: .45`, `cursor: not-allowed`. No shadows, no scale/transform on interaction.

**Inputs / selects / textareas** — `padding: 0.55rem 0.7rem`, `border-radius: 6px`, `1px solid --border-soft`, `--bg-input` fill, mono font. Focus = border flips to `--accent`, no glow/ring. File inputs use a dashed border instead of solid.

**Cards** (`.batch-card`, `.card`, `.contract-card`, `.done-card`) — `1px solid --border`, `border-radius: 8px`, `padding: 1.1rem 1.2rem`, `--bg-panel` fill. One flat elevation level — no shadow, no nested cards. `.done-card` swaps the border to `--green` to signal completion; that is the only card-level color override in the system.

**Status/confidence pills** — `border-radius: 20px` (full pill), `padding: 0.15rem 0.55rem`, `font-size: 0.75rem/600`. Always a semantic-color pairing: text color + matching `-bg` wash from Section 2. Never gray/neutral.

**Step indicator** (`.step`) — pill-shaped, `border: 1px solid --border-soft`, muted text by default; `.active` fills with accent, `.done` outlines in green.

**Tables** (`reports.html`) — no vertical rules, `1px solid --border` row dividers only, header row in `--text-muted`/600. Flagged rows (`tr.warn`) tint text red, not the whole row background.

---

## 5. Layout Principles

- Single-column, narrow measure. Body content is centered via `margin: 0 auto` with generous top padding (`2.5rem`) and larger bottom padding (`4rem`) so the last card never crowds the viewport edge.
- Cards stack vertically with `margin-bottom: 1.1rem` — no grid, no multi-column layouts anywhere in the app. Estimators are scanning one takeoff or one report row at a time, not comparing tiles.
- `.controls`, `.actions`, `.steps`, `.stats` all use `display: flex; gap: 0.5–0.85rem; flex-wrap: wrap` — flexible row groups that reflow rather than break.
- No max-width grid system, no breakpoint scale defined yet — the app has not needed one. Add one only when a real layout breaks, per the anti-inflation rule in `CLAUDE.md` §6.2.

---

## 6. Depth & Elevation

Flat by design. One border weight (`1px`), one radius scale (`6px` controls / `8px` cards / `20px` pills), zero box-shadows anywhere in `theme.css`. Hierarchy comes from color and border, not elevation. This matches the app's own epistemics: nothing here should look more "elevated" or trustworthy than its actual confidence score says it is.

---

## 7. Do's and Don'ts

**Do:**
- Reuse the existing tokens (`var(--accent)`, `var(--text-muted)`, etc.) — never hardcode a hex that duplicates one already in `:root`.
- Keep confidence/status colors (green/amber/red) reserved for their semantic meaning only.
- Keep mono type everywhere; don't introduce a second family for "friendliness."
- Keep new components flat (border + radius), matching the existing card/pill/button language.

**Don't:**
- Don't add gradients, glows, glassmorphism, or shadows — none exist today and none are needed.
- Don't use green/amber/red decoratively (e.g. a "fun" accent chip) — it will be misread as a confidence or status signal.
- Don't introduce a second accent color. One accent, whole app (see `design-taste-frontend` skill §4.2, Color Consistency Lock).
- Don't stack cards inside cards. Current depth is exactly one level.
- Don't add motion/animation for its own sake — nothing in the current UI moves, and a calibration/tracing tool benefits from stillness, not micro-interactions.

---

## 8. Responsive Behavior

Not yet systematized. No `@media` breakpoints exist in `theme.css` today; the flex-wrap layout groups (Section 5) degrade reasonably on narrow viewports but haven't been verified below typical laptop width. `takeoff.html`'s canvas has an explicit fullscreen mode (`#canvasWrap:fullscreen`) for the tracing surface, using the Fullscreen API with a webkit-prefixed fallback — that's the one deliberately responsive/adaptive surface in the app. Treat "mobile support" as **not built** (per `CLAUDE.md` §8) until breakpoints are added and tested.

---

## 9. Agent Prompt Guide

When asked to build or extend UI for this app, use this palette and these tokens verbatim — don't invent new ones:

```
Background:      #16171c (page)  /  #1a1b21 (panel)  /  #1c1d23 (input)
Borders:         #24262d (default)  /  #2a2c33 (soft/input)
Text:            #e6e6e4 (body)  /  #c9cacb (dim)  /  #8a8d93 (muted)  /  #5c5f66 (faint)  /  #f2f2f0 (headline/value only)
Accent:          #e2664f (default)  /  #f08972 (hover)  — used on accent-fill: #16171c text
Status:          green #6fbf85 (ok/approved) · amber #d3a25c (medium/corrected) · red #e5646a (low/error)
Font:            'JetBrains Mono', ui-monospace, 'SF Mono', monospace — everywhere
Radius:          6px controls, 8px cards, 20px pills
Elevation:       none — 1px borders only, no shadows
```

Example prompt: *"Build a [new page/component] for Takeoff-Demon using its existing DESIGN.md — dark ground `#16171c`, one accent `#e2664f`, JetBrains Mono throughout, flat 1px-bordered cards at 8px radius, confidence/status pills in green/amber/red only. Reuse the CSS custom properties from `public/theme.css`, don't invent new tokens."*
