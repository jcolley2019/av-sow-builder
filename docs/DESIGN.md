# SOW Generator — Design System

The visual contract for the whole app. Phases 3 and 4 should "follow docs/DESIGN.md".
Tokens live in `src/index.css` (CSS variables) and are wired into `tailwind.config.js`.
shadcn components are restyled **through** these tokens, so anything built with them
inherits the system automatically.

## Thesis & signature

An internal **engineering instrument** for an AV/UC presales engineer — precise, calm,
document-aware. Not marketing, not a generic SaaS dashboard.

**Signature — tool/paper duality:** the app chrome is a quiet dark "instrument panel"
(left, input/controls); the SOW preview is a warm light "paper" sheet (right) that mimics
the Word `.docx` the tool produces. The element that crosses the seam is the **equipment
model number** — always set in the mono face, on both the dark tables and the cream page.
It is the recurring material of the interface.

## Palette (one accent only — EOS red)

Dark instrument surfaces:
- `--background` desk `#0F1115` · `--panel` `#161A20` · `--raised` `#1E242C`
- `--border` hairline `#2A313B`
- text `--foreground` `#E6E9EE` · `--muted-foreground` `#9AA4B2`

Accent (sparingly — primary actions, active state, focus ring only; never large fills):
- `--primary` `#C8102E` · `--primary-hover` `#E11D3A` · on-accent text `#FFFFFF`
- `--ring` `#E11D3A` · `--destructive` quieter red `#C42E3F` (low-emphasis delete controls)

Paper surface (SOW preview — mimics the .docx):
- `--paper` `#FBFAF7` · `--paper-ink` `#1A1A1A` · `--paper-muted` `#6B6862` · `--paper-hairline` `#E4E0D8`

Rule: red is the *only* hue. State/badges (OFE vs NEW) are distinguished by fill vs outline,
never by a second color.

## Type

- UI / body — **Geist Sans** (fallback Inter, system-ui). Base 14px / 1.5.
- Display, all numerics, and **all equipment model numbers** — **Geist Mono**
  (fallback JetBrains Mono). Use the `<Model>` component or `font-mono tabular`.
- Paper pane body — **Calibri** (real Calibri on Windows; self-hosted **Carlito**,
  a metric-identical clone, as fallback). The only mono on paper = model numbers.
- Self-hosted via `@fontsource/*` (no external requests). Family vars: `--font-sans`,
  `--font-mono`, `--font-paper`.

Scale (Tailwind `text-*`, line-heights paired in config):
`xs 12 · sm 13 · base 14 · md 16 · lg 18 · xl 22 · 2xl 28`.
Weights: 400 body · 500 labels/buttons · 600 titles · 700 paper document title.
**Eyebrow** = `.eyebrow` (Geist Mono, 11px, uppercase, 0.14em tracking, muted) — small
stamped labels like text on rack gear. No 01/02 numbering except real sequences
(e.g. the SOW section spine).

## Spacing, radius, elevation

- Spacing on a 4px grid (Tailwind defaults). Panels `p-6`, dense table cells `p-1`.
- Radius: `--radius` 8px → `lg 8 / md 6 / sm 4`. Consistent and small.
- **Hairline borders over shadows.** The one allowed shadow is `shadow-page` on the paper
  sheet (a page lifted off the desk). `shadow-panel` is a hairline-weight bottom rule.

## Layout

Two-pane workspace: `lg:grid-cols-[1fr_1.08fr]`, left = dark instrument, right = paper.
The paper pane is `lg:sticky` so it stays in view while you work the BOM. Below `lg` the
panes **stack vertically**. Tables scroll horizontally (`overflow-x-auto`). Sticky top bar,
app name in the mono face.

## Motion

Minimal and purposeful: a single fade/slide (`opacity 0→1, y 6→0`, 0.3s ease-out) on content
load only. No decorative animation. `prefers-reduced-motion: reduce` disables all
transitions/animations globally (index.css) and skips the load animation
(`useReducedMotion`).

## Quality floor

Responsive to mobile · visible keyboard focus (red ring on shadcn controls, red outline
elsewhere) · reduced-motion respected · AA contrast on text (foreground/muted on dark,
ink/muted on paper all ≥ 4.5:1).
