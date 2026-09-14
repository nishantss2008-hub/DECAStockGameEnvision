# Buccaneer Exchange — Mobile Design System and Screen Blueprint (MOBILE.md)

**Date:** 2026-09-14 · **Status:** Draft for canvas round 2 and the React build · **Priority:** phones first
(user, 2026-09-14: "prioritize mobile web app design using Apple UI style. students will be using this on mobile.")

This file is the single source of truth for the phone experience. It guides the static canvas
artboards (`docs/design/canvas/iPhone*.dc.html`, 393×852 iPhone frames) and the React code in `web/`.

| Companion | What it still owns |
|---|---|
| `docs/design/BRIEF.md` | Black Pearl palette (§2), data conventions (§4), voice (§5), sample data (§7), canvas file format (§8), beginner-first rules (§9) |
| `docs/superpowers/specs/2026-09-14-buccaneer-exchange-v2-design.md` | Features, data model, API, engine |
| `docs/design/COPY.md` | Every beginner-facing word. This file points to COPY keys; proposed phone-only copy is listed in §7.0 and is not final until it lands in COPY.md |

**How sure each number is** (same legend as the research):
**[A]** published by Apple (HIG, developer docs, WWDC, Newsroom).
**[B]** long-standing UIKit value or a community measurement of iOS 26/27; verify against the iOS 27 UI kit.
**[C]** third-party report, or our own web proposal.
CSS px = iOS pt when the viewport meta has `width=device-width`.

## 0. Decisions this file makes (amending BRIEF and spec)

| # | Decision | Replaces |
|---|---|---|
| D1 | **Five always-visible tabs:** Portfolio · Markets · News · Standings · Learn. Trade is not a tab; it is a sheet opened from company pages, holding rows and a Portfolio toolbar button. Research merges into Markets. There is no global header, so BRIEF §6's "header keeps cash chip" becomes: cash is shown on the Portfolio tile, in the Trade sheet quote row and under "Your position" on every company page (§7.7). | BRIEF §6 mobile bar (Summary, Markets, Trade, Dispatches, Standings) and mobile cash chip; spec §10 `MobileTabBar` |
| D2 | **Appearance follows the system light/dark setting.** There is still no in-app theme toggle. | Spec §1 non-goal "dark-mode toggle" (still a non-goal); BRIEF "one fixed theme" |
| D3 | **System font stack for all UI and numbers.** IBM Plex Sans/Mono retired. Cormorant SC retired from the app (spec §10 `Eyebrow` becomes the §5.4 section header). Cinzel Decorative stays for the wordmark and ceremony titles only. Icons are lucide at stroke 1.75 (2.25 selected) instead of BRIEF's 1.5, so they hold up next to system text at Dynamic Type sizes. | BRIEF §3; BRIEF §4 icon stroke |
| D4 | **Type sizes follow iOS Dynamic Type** (Large Title 34 … Caption 2 11) and scale with the phone's Text Size setting. | BRIEF §3 sizes (32/20–24/14/12) |
| D5 | **Glass only on small floating chrome** (tab bar, collapsed top bar, bar buttons, menus, toasts) at 85% tint. Sheets, action sheets, alerts, lists, charts and tickets stay opaque, because sheets hold the reading-heavy explanations and a half-screen blur is the most expensive case on older phones and Chromebooks (§2.4). | BRIEF panel shadows on phone |
| D6 | **Trade ticket = one large sheet** with a built-in keypad: Entry → Preview → Placing → Filled / Needs attention. No swipe-to-submit. | Spec §10 "full-screen sheet" (compatible) |
| D7 | **Tab-scoped routes** (`/markets/company/KRKN`) with redirects from the spec routes. Move to a React Router data router. | Spec §10 route table (kept as redirects) |
| D8 | **Breakpoints:** phone layout below 744px wide, plus any landscape viewport ≤500px tall (side rail). Sidebar split view at ≥744px. | BRIEF §6 "<600px" |
| D9 | **Library:** our own plain-CSS components + `@base-ui/react@1.8.0` for sheet, dialog, menu, toast, popover behaviour. No iOS UI kit. | New |

---

## 1. Principles

1. **Phone first.** Every screen is designed at 393×852 before any wider layout. Wider layouts
   rearrange the same features (HIG Layout: "layout changes, functionality doesn't") [A].
2. **Apple HIG structure, our own look.** Use the platform's structure: tab bar for navigation
   (never actions), large titles that collapse, inset grouped lists, sheets with detents, one
   primary action per view, 44pt targets. Borrow the design *language*; never copy Apple's apps,
   SF Symbols, SF Pro, logos, or the Stocks/Wallet screen layouts. Apple's names for its materials and
   features ("Liquid Glass", "Dynamic Island", "SF") appear only in this document as references, never in
   UI copy, file names shipped to students, or marketing.
3. **Black Pearl is the brand layer.** The platform supplies structure. Black Pearl supplies colour,
   material and ceremony: hull near-black, tarnished brass tint, sea-glass accent, parchment ledger,
   crest roundels, wax seal.
4. **Theme in the frame, never in the figures** (BRIEF Rule #1, mapped to iOS layers):

   | BRIEF layer | On the phone | Examples |
   |---|---|---|
   | Hull (fully themed) | Full-bleed hull screens and ceremony moments, in both appearances | Sign in, "Sails up" market-open moment, order-filled seal, Voyage complete, loading compass, app icon |
   | Rigging (light theme) | Floating chrome and small brand marks | Tab bar platter (brass), segmented thumb (hull), crest roundels, sea-glass status dot, brass tint on links |
   | Ledger (no theme) | Content layer: system type, semantic colours, no ornaments | Lists, quotes, tickets, statements, chart plots, inputs |

5. **Beginner first: explain + compare** (BRIEF §9). Every metric shows a plain label, a "?" that
   explains it, an everyday sentence and the sector average. No verdicts, no good/bad colours on
   fundamentals; gain/loss colour is only for price changes.
6. **Never colour alone.** Signed values use sign + SVG triangle + colour (BRIEF §4). States use
   shape, weight or text as well as colour.
7. **Live, calm data.** Prices update every tick with an "as of" stamp. No pull-to-refresh, no
   ticker animation, no announcements for every tick.
8. **Recover, don't scold.** Problems appear inline with a one-tap fix. Alerts only for
   irreversible actions (HIG Alerts [A]; design principle "Agency" [A]).

---

## 2. Appearance and colour

### 2.1 Behaviour

- Follow `prefers-color-scheme` (Safari 12.1+/iOS 13+). Declare
  `<meta name="color-scheme" content="light dark">` so form controls, scrollbars and autofill match.
- No toggle. Hull screens (Sign in, ceremonies) are dark in both appearances and set
  `color-scheme: dark` on their own root.
- Every custom colour has light, dark and increased-contrast values (HIG Color [A]).
- **Solid bars:** Safari cannot report Reduce Transparency (`prefers-reduced-transparency`
  is unsupported, WebKit bug 175497 [BCD]). Account › Display has a per-device "Solid bars"
  switch (localStorage) that makes all glass opaque. A 3-line inline script in `<head>` reads it and
  sets `html[data-solid-bars]` before first paint, so bars never flash translucent. Glass also goes
  opaque under `prefers-contrast: more`, `prefers-reduced-transparency: reduce` (Chrome/Chromebooks)
  and when `backdrop-filter` is unsupported.

### 2.2 Semantic tokens (Black Pearl mapped onto iOS roles)

Hex values marked *new* are derived for the phone; all others are BRIEF §2 tokens.
Contrast ratios are WCAG 2.2 and come from the script in §2.5. "Cell" is the list-row surface;
"grouped" is the page behind inset cards; "2nd" is the secondary surface (light `#EFECE3`
sheet background, dark `#232A26` cell inside a sheet).

| Role (CSS var) | iOS equivalent | LIGHT | DARK | Use |
|---|---|---|---|---|
| `--bg-grouped` | systemGroupedBackground | `#E6E3D9` paper | `#0B0D0C` *new* abyss | Page behind inset cards, tab roots |
| `--bg` | systemBackground | `#F8F6F0` sheet | `#0B0D0C` | Plain (non-grouped) screens |
| `--bg-2` | secondarySystemBackground | `#EFECE3` sheet-alt | `#1A1F1C` chrome-2 | Secondary panels, sheet backgrounds (light) |
| `--cell` | secondarySystemGroupedBackground | `#F8F6F0` | `#1A1F1C` | List rows, cards, chart card |
| `--elevated` | elevated grouped background (sheets, popovers) | `#EFECE3` | `#1A1F1C` | Sheet background |
| `--elevated-cell` | elevated secondary grouped | `#F8F6F0` | `#232A26` chrome-3 | Rows inside sheets |
| `--label` | label | `#161816` ink | `#E4E8E2` on-chrome | Primary text |
| `--label-2` | secondaryLabel | `#454A45` ink-2 | `#9FB0A8` on-chrome-2 | Secondary text, section headers, placeholders |
| `--label-3` | tertiaryLabel | `#5F645C` *new* (ink-3 darkened) | `#8A9A93` *new* | Timestamps, "as of", captions (≥4.5:1 on opaque surfaces only). **Never on `--fill`, `--tint-soft` or glass** (4.0–4.4:1 there, §2.5) |
| `--label-4` | quaternaryLabel | `rgba(22,24,22,.22)` | `rgba(228,232,226,.20)` | Disabled glyphs and disabled segment labels only (exempt from contrast); never information |
| `--separator` | separator (hairline) | `#D9D4C6` rule | `#34403A` chrome-line | 0.5px row separators (decorative) |
| `--control-off` | opaqueSeparator (3:1 boundary) | `#857F70` *new* | `#6E7C75` *new* | Switch off track, sheet grabber, sign-in card edge, control outlines that must be seen (≥3:1 on every surface incl. dark `--elevated-cell`) |
| `--fill` | systemFill | `rgba(69,64,48,.10)` | `rgba(159,176,168,.16)` | Search field, gray buttons, segmented track, stepper. Text on it: `--label` or `--label-2` only |
| `--fill-on-glass` | — | `rgba(69,64,48,.10)` | `rgba(0,0,0,.25)` *new* | Search capsule pinned in the collapsed glass bar (dark `--fill` there drops `--label-2` to 3.9:1) |
| `--fill-2` | secondarySystemFill | `rgba(69,64,48,.06)` | `rgba(159,176,168,.10)` | Pressed row, skeleton |
| `--tint` | tint / accentColor (**gold**) | `#735B2A` *new* brass-deep | `#DDBE72` gold-bright | Links, bar-button glyphs, "See all", chevron actions, switch on (opaque surfaces) |
| `--tint-strong` | — | `#5A4720` *new* | `#DDBE72` | Any tint-coloured text on glass (selected tab icon + label, toast action, Cancel in the pinned search) and every Tinted-button label (light `--tint` on `--tint-soft` over paper is 4.41:1) |
| `--destructive-strong` | — | `#862B1F` *new* | `#EE9A89` | Destructive menu items on glass (light `--destructive` on glass is 4.22:1) |
| `--tint-soft` | tinted button fill | `rgba(184,149,74,.18)` | `rgba(221,190,114,.16)` | Tinted buttons (label `--tint-strong`), Paused banner, your Standings row; selected tab platter is `--platter` (.22 light). Text on it: `--label`, `--label-2`, `--tint-strong` only |
| `--prominent` / `--on-prominent` | filled button | `#1A1F1C` / `#DDBE72` | `#DDBE72` / `#111412` | The one primary action per view |
| `--accent` | secondary accent (**sea-glass**) | `#2F6F68` link | `#5FA39A` sea-glass | Focus ring, info links, "market open" text accents (opaque surfaces only; never text on glass) |
| `--accent-dot` | — | `#5FA39A` | `#5FA39A` | Market-open dot (decorative; text always says the status) |
| `--gain` | systemGreen (as text) | `#1B7150` | `#7FD3B0` gain-on-chrome | Up, Buy. As text only on opaque surfaces or inside a ChangePill; light gain on `--fill`/`--tint-soft` over paper is 3.97/4.08:1 |
| `--loss` | systemRed (as text) | `#A63A2B` | `#EE9A89` loss-on-chrome | Down, Sell. Same placement rule as `--gain` (4.29/4.40:1 on fills over paper) |
| `--gain-fill` | — | `#DFEEE6` | `#173B2D` *new* | Change pill background (up) |
| `--loss-fill` | — | `#F3E0DB` | `#43231E` *new* | Change pill background (down), tinted Sell |
| `--on-side` | — | `#F8F6F0` | `#0B0D0C` | Label on filled Buy/Sell buttons |
| `--destructive` | systemRed (destructive role) | `#A63A2B` | `#EE9A89` | Sign out, Discard order, End game. Same hue as loss, never used for non-destructive errors |
| `--seal-crimson` | — | `#8E1F1A` seal | `#8E1F1A` | Wax seal ornament ONLY |
| `--seal-brass` | — | `#B8954A` gold (+ `#DDBE72` highlight) | same | Seal ring, medallions, crest ring, ornaments ONLY |
| `--segment-thumb` / `--on-segment-thumb` | segmented thumb | `#1A1F1C` / `#DDBE72` | `#9FB0A8` / `#0B0D0C` | Selected segment (BRIEF: "chrome-2 selected segments") |
| `--glass` | Liquid Glass (regular) | `rgba(248,246,240,.85)` | `rgba(17,20,18,.85)` | Floating layer only (§2.4) |
| `--scrim` | dimming view | `rgba(0,0,0,.35)` modal · `.20` info | `rgba(0,0,0,.55)` · `.35` | Behind sheets, alerts |
| `--focus` | — | `#2F6F68` | `#5FA39A` | 2px focus-visible ring |
| `--chart-baseline` | — | `#80683A` gold-dim (4.91:1) | `#B8954A` (5.92:1) | Dashed start/reference line |

Crest roundel fills stay as BRIEF §2 in both appearances (text `#F8F6F0` passes 5.41–9.51:1 on
every sector fill; Shipping `#2F6F68` is the lowest).

**Why brass-deep and not gold for light tint:** gold `#B8954A` is 2.61:1 on `#F8F6F0` and sea-glass
`#5FA39A` is 2.70:1; both fail as text. Apple's own systemGreen `#34C759` (2.22:1) and systemRed
`#FF383C` (3.57:1) also fail as small text on white, so we never use them.

### 2.3 Increased contrast (`@media (prefers-contrast: more)`)

Glass becomes opaque (`#F8F6F0` light, `#111412` dark) with a 1px `--control-off` border, and
(ratios re-checked by the reviewer script, §2.5):

| Role | LIGHT | ratio on cell / grouped | DARK | ratio on cell / 2nd |
|---|---|---|---|---|
| `--control-off` | `#6B6558` | 5.36 / 4.51 (non-text) | `#8A9A93` | 5.67 / 4.98 (non-text) |
| `--tint-strong` | `#5A4720` | 8.24 / 6.94 | `#EDD493` | 11.49 / 10.09 |
| `--label-2` | `#33372F` | 11.24 / 9.46 | `#C4D0CA` | 10.52 / 9.24 |
| `--label-3` | `#454A45` | 8.38 / 7.05 | `#A9B7B0` | 8.03 / 7.05 |
| `--tint` | `#5A4720` | 8.24 / 6.94 | `#EDD493` | 11.49 / 10.09 |
| `--accent` | `#1F5751` | 7.65 / 6.44 | `#8CCBC1` | 9.09 / 7.99 |
| `--gain` | `#0F5A3E` | 7.61 / 6.41 (6.86 on fill) | `#A3E6C8` | 11.71 / 8.65 on fill |
| `--loss` | `#862B1F` | 8.17 / 6.87 (6.93 on fill) | `#F7B8AA` | 9.86 / 8.27 on fill |
| `--separator` | `#BFB8A6` | — | `#4A5A52` | — |

### 2.4 Materials (glass)

HIG Materials [A]: Liquid Glass is a floating layer for controls and navigation; never in the
content layer, never glass on glass. iOS 27 made glass more tinted with firmer edges [A Newsroom, C reviews].

| Property | LIGHT | DARK |
|---|---|---|
| Tint | `rgba(248,246,240,.85)` | `rgba(17,20,18,.85)` |
| Filter | `blur(20px) saturate(160%)` (+ `-webkit-` prefix) | same |
| Inner highlight | `inset 0 0 0 0.5px rgba(255,255,255,.55)` | `inset 0 0 0 0.5px rgba(228,232,226,.10)` |
| Outer edge | `0 0 0 0.5px rgba(22,24,22,.10)` | `0 0 0 0.5px rgba(0,0,0,.60)` |
| Shadow (floating) | `0 8px 24px rgba(22,24,22,.12)` | `0 8px 24px rgba(0,0,0,.45)` |
| Fallback (no backdrop-filter, Solid bars, contrast more) | `#F8F6F0` | `#111412` |

Rules:
- Allowed on: TabBar, collapsed LargeTitleNavBar strip, expanded-state bar buttons, menus, toasts.
- **Opaque, not glass:** every sheet (medium and large), action sheets, alerts and the pinned "your crew"
  row in Standings. Reasons: (1) the InfoTip, Crew and Market status sheets are reading surfaces for
  beginners, and a scrim-dimmed busy page behind 85% glass drops tinted text below 4.5:1 (light
  "Open in Learn" 3.80:1, action-sheet destructive 4.22:1); (2) a half-screen `backdrop-filter` is the
  costliest blur case on iPhone SE and low-end Chromebooks; (3) a sheet over Standings would otherwise
  be the 4th blur layer (top bar + pinned row + tab bar + sheet). Sheets use `--elevated` with
  `--float-shadow`; the pinned row uses `--cell` with `--float-shadow`.
- At most **3 simultaneous** `backdrop-filter` elements on screen (hard cap 4, reached only when a menu
  opens while a toast shows). Blur ≤20px.
- Never on list rows, cards, chart cards, sheets, the trade ticket body, or anything that scrolls.
- **Text on glass** may use only `--label`, `--label-2`, `--tint-strong` and `--destructive-strong`;
  fields inside glass use `--fill-on-glass`. `--label-3`, `--accent`, `--tint`, `--destructive`,
  `--gain` and `--loss` as text on glass fall to 3.8–4.4:1 over worst-case content (§2.5). The
  collapsed-bar subtitle is `--label-2`.
- 85% tint keeps the permitted roles legible even when blur is off and content underneath is the
  worst case (§2.5).
- During push/pop view transitions the named bars are captured with their `backdrop-filter` (CSS View
  Transitions 1 copies it onto `::view-transition-group`); if the device spike (§9.9) shows flicker or
  dropped frames, add `html[data-nav] .glass { background: var(--glass-solid); backdrop-filter: none }`
  for the 500ms transition.
- Mount glass elements as siblings of the route outlet, never inside an element with `opacity<1`,
  `filter`, `transform` animation or `will-change` (Filter Effects 2 "Backdrop Root" [FE2]).

### 2.5 Contrast computation (run on 2026-09-14; revised by adversarial review the same day)

All permitted text pairings are ≥4.5:1 and non-text boundaries are ≥3:1, in light and dark. "Permitted"
matters: the placement rules in §2.2 and §2.4 (no `--label-3` on fills, tints or glass; no coloured
change text on fills over paper; only four text roles on glass) are what keep every pairing above 4.5:1.
A reviewer re-derived every ratio with an independent script (unrounded compositing, extra surfaces,
black/white worst cases) and found the original table correct but incomplete; the failures it found are
listed as forbidden pairs below and were fixed with `--tint-strong`, `--destructive-strong`,
`--fill-on-glass`, a lighter dark `--control-off` and opaque sheets.

```js
// WCAG 2.2 contrast for MOBILE.md tokens (v2). Run: node mobile-contrast.mjs
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = ([r, g, b, a], base) => base.map((c, i) => Math.round([r, g, b][i] * a + c * (1 - a))); // alpha composite
const T = {
  light: { bg: '#E6E3D9', cell: '#F8F6F0', sheet: '#EFECE3', label: '#161816', sec: '#454A45', ter: '#5F645C',
    tint: '#735B2A', tintStrong: '#5A4720', accent: '#2F6F68', gain: '#1B7150', loss: '#A63A2B', destructiveStrong: '#862B1F',
    gainFill: '#DFEEE6', lossFill: '#F3E0DB', prominent: '#1A1F1C', onProminent: '#DDBE72', onSide: '#F8F6F0',
    controlOff: '#857F70', glass: [248, 246, 240, 0.85], worstUnder: '#111412', platter: [184, 149, 74, 0.22],
    tintSoft: [184, 149, 74, 0.18], fill: [69, 64, 48, 0.10], fillOnGlass: [69, 64, 48, 0.10], elevCell: '#F8F6F0' },
  dark: { bg: '#0B0D0C', cell: '#1A1F1C', sheet: '#232A26', label: '#E4E8E2', sec: '#9FB0A8', ter: '#8A9A93',
    tint: '#DDBE72', tintStrong: '#DDBE72', accent: '#5FA39A', gain: '#7FD3B0', loss: '#EE9A89', destructiveStrong: '#EE9A89',
    gainFill: '#173B2D', lossFill: '#43231E', prominent: '#DDBE72', onProminent: '#111412', onSide: '#0B0D0C',
    controlOff: '#6E7C75', glass: [17, 20, 18, 0.85], worstUnder: '#F8F6F0', platter: [221, 190, 114, 0.16],
    tintSoft: [221, 190, 114, 0.16], fill: [159, 176, 168, 0.16], fillOnGlass: [0, 0, 0, 0.25], elevCell: '#232A26' },
};
for (const [mode, t] of Object.entries(T)) {
  const c = k => rgb(t[k]);
  console.log(`\n${mode.toUpperCase()}  role  on cell  on grouped bg  on 2nd surface`);
  for (const k of ['label', 'sec', 'ter', 'tint', 'tintStrong', 'accent', 'gain', 'loss'])
    console.log(k.padEnd(10), cr(c(k), c('cell')).toFixed(2), cr(c(k), c('bg')).toFixed(2), cr(c(k), c('sheet')).toFixed(2));
  const glass = over(t.glass, rgb(t.worstUnder)), plat = over(t.platter, glass);   // glass over worst-case content
  const extra = {
    'gain on gainFill': cr(c('gain'), c('gainFill')), 'loss on lossFill': cr(c('loss'), c('lossFill')),
    'onProminent on prominent': cr(c('onProminent'), c('prominent')),
    'Buy label on gain': cr(c('onSide'), c('gain')), 'Sell label on loss': cr(c('onSide'), c('loss')),
    'tintStrong on tintSoft (cell)': cr(c('tintStrong'), over(t.tintSoft, c('cell'))),
    'tintStrong on tintSoft (grouped bg)': cr(c('tintStrong'), over(t.tintSoft, c('bg'))),
    'secondary on fill (placeholder, grouped bg)': cr(c('sec'), over(t.fill, c('bg'))),
    'secondary on fill (elevated cell)': cr(c('sec'), over(t.fill, c('elevCell'))),
    'label on glass (worst case)': cr(c('label'), glass), 'secondary on glass (worst case)': cr(c('sec'), glass),
    'selected tab tintStrong on platter (worst case)': cr(c('tintStrong'), plat),
    'tintStrong on glass (toast action, worst case)': cr(c('tintStrong'), glass),
    'destructiveStrong on glass (worst case)': cr(c('destructiveStrong'), glass),
    'secondary on fillOnGlass (pinned search, worst case)': cr(c('sec'), over(t.fillOnGlass, glass)),
    'controlOff vs cell (non-text, >=3)': cr(c('controlOff'), c('cell')),
    'controlOff vs grouped bg (non-text, >=3)': cr(c('controlOff'), c('bg')),
    'controlOff vs 2nd surface (grabber, non-text, >=3)': cr(c('controlOff'), c('sheet')),
    'controlOff vs hull #111412 (sign-in card edge)': cr(c('controlOff'), rgb('#111412')),
    'accent focus ring vs cell (non-text, >=3)': cr(c('accent'), c('cell')),
    'accent focus ring vs glass (non-text, >=3)': cr(c('accent'), glass),
    // pairs the rules FORBID (kept so nobody re-introduces them)
    'x ter on fill over grouped bg': cr(c('ter'), over(t.fill, c('bg'))),
    'x ter on fill over 2nd surface': cr(c('ter'), over(t.fill, c('sheet'))),
    'x gain on fill over grouped bg': cr(c('gain'), over(t.fill, c('bg'))),
    'x tint on tintSoft over grouped bg': cr(c('tint'), over(t.tintSoft, c('bg'))),
    'x ter on glass (worst case)': cr(c('ter'), glass), 'x accent on glass (worst case)': cr(c('accent'), glass),
    'x tint on glass (worst case)': cr(c('tint'), glass), 'x loss on glass (worst case)': cr(c('loss'), glass),
    'x secondary on fill on glass (worst case)': cr(c('sec'), over(t.fill, glass)),
    'x secondary on fill over tintSoft over 2nd ("You" pill as TagPill)': cr(c('sec'), over(t.fill, over(t.tintSoft, c('sheet')))),
  };
  for (const [k, v] of Object.entries(extra)) console.log(k.padEnd(58), v.toFixed(2));
}
```

Output:

| Pair | LIGHT | DARK |
|---|---|---|
| `--label` on cell / grouped / 2nd | 16.52 / 13.90 / 15.11 | 13.48 / 15.73 / 11.84 |
| `--label-2` on cell / grouped / 2nd | 8.38 / 7.05 / 7.67 | 7.36 / 8.59 / 6.47 |
| `--label-3` on cell / grouped / 2nd | 5.61 / 4.72 / 5.13 | 5.67 / 6.61 / 4.98 |
| `--tint` on cell / grouped / 2nd | 5.96 / 5.02 / 5.46 | 9.30 / 10.85 / 8.17 |
| `--tint-strong` on cell / grouped / 2nd | 8.24 / 6.94 / 7.54 | 9.30 / 10.85 / 8.17 |
| `--accent` on cell / grouped / 2nd | 5.41 / 4.55 / 4.95 | 5.72 / 6.68 / 5.03 |
| `--gain` on cell / grouped / 2nd | 5.51 / 4.64 / 5.04 | 9.43 / 11.00 / 8.28 |
| `--loss` on cell / grouped / 2nd | 5.96 / 5.01 / 5.45 | 7.65 / 8.93 / 6.72 |
| gain on gain-fill (change pill) | 4.97 | 6.97 |
| loss on loss-fill (change pill) | 5.06 | 6.42 |
| on-prominent on prominent (primary button, "You" pill, News badge) | 9.30 | 10.31 |
| Buy label on gain / Sell label on loss | 5.51 / 5.96 | 11.00 / 8.93 |
| tint-strong on tint-soft (tinted button on a card / on paper) | 7.09 / 6.10 | 6.59 / 8.08 |
| label-2 on fill (placeholder over paper / inside a sheet row) | 6.04 / 7.12 | 6.66 / 4.78 |
| label on glass over worst-case content (`#111412` / `#F8F6F0`) | 12.03 | 9.84 |
| label-2 on glass, worst case (unselected tab label, bar subtitle) | 6.10 | 5.37 |
| tint-strong on selected platter, worst case | 5.25 | 4.80 |
| tint-strong on glass, worst case (toast action, Cancel) | 6.00 | 6.79 |
| destructive-strong on glass, worst case (menu item) | 5.95 | 5.59 |
| label-2 on fill-on-glass, worst case (pinned search placeholder) | 5.25 | 6.46 |
| control-off vs cell / grouped / 2nd (non-text) | 3.69 / 3.11 / 3.38 | 3.82 / 4.46 / 3.36 |
| control-off vs hull `#111412` (sign-in card edge) | 4.65 | 4.24 |
| focus ring vs cell / vs glass (non-text) | 5.41 / 3.94 | 5.72 / 4.18 |
| **Forbidden** (fails in at least one appearance): label-3 on fill over paper / over 2nd | 4.04 / 4.38 | 5.13 / 3.68 |
| **Forbidden:** gain on fill over paper (gray chip) · tint on tint-soft over paper | 3.98 · 4.41 | 8.53 · 8.08 |
| **Forbidden:** label-3 · accent · tint · loss as text on glass | 4.08 · 3.94 · 4.34 · 4.34 | 4.14 · 4.18 · 6.79 · 5.59 |
| **Forbidden:** label-2 on plain `--fill` inside glass · label-2 TagPill on a tint-soft row | 5.25 · 5.68 | 3.99 · 3.43 |

Hull (dark tokens, independent script): on-chrome-2 `#9FB0A8` on `#111412` 8.17 (6.25 on the glow) · label-3
`#8A9A93` 6.29 (4.82 on the glow, so footers stay out of the top-right glow) · gold `#B8954A` 6.57 · crest text
`#F8F6F0` on sector fills 5.41–9.51 and on crew hull `#232A26` 13.58. The sign-in field card `#1A1F1C` on the
hull is only 1.11:1, so it gets a 1px `--control-off` edge (4.24:1).

Increased-contrast values in §2.3 were re-derived and match to two decimals.

Decorative only (colour never carries meaning alone): sea-glass dot on paper 2.27:1, hairline
separators 1.37:1 (light) and 1.54:1 (dark).

### 2.6 CSS token block (`web/src/theme/tokens.css`)

`color-scheme: dark` on an element only changes form controls and scrollbars; it does **not** switch
custom properties. So the dark list is written twice: once under the media query (system dark) and once
under `.dark` (hull screens, which are dark in both appearances, and static dark artboards). A vitest in
`web/src/theme/tokens.test.ts` parses the file and fails if the two dark lists differ.
(`light-dark()` would avoid the copy but needs Safari 17.5+, and §9.8 supports iOS 16.4+.)

```css
:root {
  color-scheme: light dark;
  --bg-grouped:#E6E3D9; --bg:#F8F6F0; --bg-2:#EFECE3; --cell:#F8F6F0; --elevated:#EFECE3; --elevated-cell:#F8F6F0;
  --label:#161816; --label-2:#454A45; --label-3:#5F645C; --label-4:rgba(22,24,22,.22);
  --separator:#D9D4C6; --control-off:#857F70; --fill:rgba(69,64,48,.10); --fill-2:rgba(69,64,48,.06); --fill-on-glass:rgba(69,64,48,.10);
  --tint:#735B2A; --tint-strong:#5A4720; --tint-soft:rgba(184,149,74,.18); --platter:rgba(184,149,74,.22);
  --prominent:#1A1F1C; --on-prominent:#DDBE72; --accent:#2F6F68; --accent-dot:#5FA39A; --focus:#2F6F68;
  --gain:#1B7150; --loss:#A63A2B; --gain-fill:#DFEEE6; --loss-fill:#F3E0DB; --on-side:#F8F6F0;
  --destructive:#A63A2B; --destructive-strong:#862B1F;
  --segment-thumb:#1A1F1C; --on-segment-thumb:#DDBE72; --chart-baseline:#80683A;
  --seal-crimson:#8E1F1A; --seal-brass:#B8954A; --seal-highlight:#DDBE72;
  --glass:rgba(248,246,240,.85); --glass-solid:#F8F6F0; --glass-edge:inset 0 0 0 .5px rgba(255,255,255,.55),0 0 0 .5px rgba(22,24,22,.10);
  --float-shadow:0 8px 24px rgba(22,24,22,.12); --scrim:rgba(0,0,0,.35); --scrim-info:rgba(0,0,0,.20);
}
/* DARK LIST — keep the two copies identical (tokens.test.ts) */
@media (prefers-color-scheme: dark) { :root {
  --bg-grouped:#0B0D0C; --bg:#0B0D0C; --bg-2:#1A1F1C; --cell:#1A1F1C; --elevated:#1A1F1C; --elevated-cell:#232A26;
  --label:#E4E8E2; --label-2:#9FB0A8; --label-3:#8A9A93; --label-4:rgba(228,232,226,.20);
  --separator:#34403A; --control-off:#6E7C75; --fill:rgba(159,176,168,.16); --fill-2:rgba(159,176,168,.10); --fill-on-glass:rgba(0,0,0,.25);
  --tint:#DDBE72; --tint-strong:#DDBE72; --tint-soft:rgba(221,190,114,.16); --platter:rgba(221,190,114,.16);
  --prominent:#DDBE72; --on-prominent:#111412; --accent:#5FA39A; --focus:#5FA39A;
  --gain:#7FD3B0; --loss:#EE9A89; --gain-fill:#173B2D; --loss-fill:#43231E; --on-side:#0B0D0C;
  --destructive:#EE9A89; --destructive-strong:#EE9A89;
  --segment-thumb:#9FB0A8; --on-segment-thumb:#0B0D0C; --chart-baseline:#B8954A;
  --glass:rgba(17,20,18,.85); --glass-solid:#111412; --glass-edge:inset 0 0 0 .5px rgba(228,232,226,.10),0 0 0 .5px rgba(0,0,0,.60);
  --float-shadow:0 8px 24px rgba(0,0,0,.45); --scrim:rgba(0,0,0,.55); --scrim-info:rgba(0,0,0,.35);
} }
.dark, .hull {
  color-scheme: dark;
  --bg-grouped:#0B0D0C; --bg:#0B0D0C; --bg-2:#1A1F1C; --cell:#1A1F1C; --elevated:#1A1F1C; --elevated-cell:#232A26;
  --label:#E4E8E2; --label-2:#9FB0A8; --label-3:#8A9A93; --label-4:rgba(228,232,226,.20);
  --separator:#34403A; --control-off:#6E7C75; --fill:rgba(159,176,168,.16); --fill-2:rgba(159,176,168,.10); --fill-on-glass:rgba(0,0,0,.25);
  --tint:#DDBE72; --tint-strong:#DDBE72; --tint-soft:rgba(221,190,114,.16); --platter:rgba(221,190,114,.16);
  --prominent:#DDBE72; --on-prominent:#111412; --accent:#5FA39A; --focus:#5FA39A;
  --gain:#7FD3B0; --loss:#EE9A89; --gain-fill:#173B2D; --loss-fill:#43231E; --on-side:#0B0D0C;
  --destructive:#EE9A89; --destructive-strong:#EE9A89;
  --segment-thumb:#9FB0A8; --on-segment-thumb:#0B0D0C; --chart-baseline:#B8954A;
  --glass:rgba(17,20,18,.85); --glass-solid:#111412; --glass-edge:inset 0 0 0 .5px rgba(228,232,226,.10),0 0 0 .5px rgba(0,0,0,.60);
  --float-shadow:0 8px 24px rgba(0,0,0,.45); --scrim:rgba(0,0,0,.55); --scrim-info:rgba(0,0,0,.35);
  color: var(--label);
}
.hull { /* Sign in + ceremonies: dark tokens (above) plus the hull glow */
  background: radial-gradient(120% 60% at 85% 0%, rgba(95,163,154,.18), transparent 60%), #111412; }

/* Increased contrast (§2.3). Light values, then dark values for both dark selectors. */
@media (prefers-contrast: more) {
  :root { --label-2:#33372F; --label-3:#454A45; --tint:#5A4720; --tint-strong:#5A4720; --accent:#1F5751; --focus:#1F5751;
    --gain:#0F5A3E; --loss:#862B1F; --destructive:#862B1F; --separator:#BFB8A6; --control-off:#6B6558; }
  .dark, .hull { --label-2:#C4D0CA; --label-3:#A9B7B0; --tint:#EDD493; --tint-strong:#EDD493; --accent:#8CCBC1; --focus:#8CCBC1;
    --gain:#A3E6C8; --loss:#F7B8AA; --destructive:#F7B8AA; --destructive-strong:#F7B8AA; --separator:#4A5A52; --control-off:#8A9A93; }
}
@media (prefers-contrast: more) and (prefers-color-scheme: dark) {
  :root { --label-2:#C4D0CA; --label-3:#A9B7B0; --tint:#EDD493; --tint-strong:#EDD493; --accent:#8CCBC1; --focus:#8CCBC1;
    --gain:#A3E6C8; --loss:#F7B8AA; --destructive:#F7B8AA; --destructive-strong:#F7B8AA; --separator:#4A5A52; --control-off:#8A9A93; }
}

.glass { background: var(--glass-solid); box-shadow: var(--glass-edge), var(--float-shadow); }
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: var(--glass); -webkit-backdrop-filter: blur(20px) saturate(160%); backdrop-filter: blur(20px) saturate(160%); }
}
@media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
  .glass { background: var(--glass-solid); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: inset 0 0 0 1px var(--control-off); }
}
html[data-solid-bars] .glass { background: var(--glass-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
```

---

## 3. Typography

### 3.1 Decision

- **System font for everything the student reads:** labels, numbers, buttons, charts, tickets,
  statements. It is the font the phone already uses, it renders SF on iPhone and Roboto on Android
  and Chromebooks, it follows Dynamic Type, and it costs zero font downloads.
  Apple's font licence forbids embedding SF Pro [A Fonts]; `system-ui`/`-apple-system` uses the
  device's own copy without bundling it [A WebKit].
- **Cormorant SC is dropped on phone (and in the app generally).** Reasons, for legibility:
  1. Small-caps serif at 13–14px with .12em tracking has a low x-height and thin strokes; on a
     phone at arm's length, in a bright classroom, it is the least legible text on screen.
  2. iOS section headers are sentence-case system text (iOS 26 change [C]); all-caps eyebrows read as
     a website, not an app, and they slow reading for beginners (BRIEF §9.10 reading level).
  3. It cannot join Dynamic Type scaling cleanly and adds a font download to every screen.
  The "rigging" role moves to colour and marks (brass platter, hull segmented thumb, crest roundels).
- **Cinzel Decorative 700 stays, only for:** the wordmark (Sign in lockup, app icon art, Account
  sheet footer) and ceremony titles ("Sails up", "Voyage complete", "Anchors dropped"), always
  ≥22px, never for numbers, never wraps (`white-space:nowrap`; the Sign in lockup is two deliberate lines).
  Load it only on hull routes with a `text=` subset:
  `https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&text=ABEGSVXabcdeghilmnoprstuvxy%20&display=swap`
  (covers "Buccaneer Exchange", "BX", "Sails up", "Voyage complete", "Anchors dropped"; extend when a ceremony title changes).
  For the shipped app, download that subset once and self-host it as `/assets/cinzel-deco-700-subset.woff2`
  (SIL Open Font License permits this) with `font-display: swap`: the service worker precaches it, so the
  Sign in and ceremony screens keep their wordmark offline and on school networks that block
  `fonts.googleapis.com`, and ledger routes still load 0 font bytes.

### 3.2 Stacks

```css
--font-ui: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, Menlo, Consolas, "Roboto Mono", monospace; /* order numbers only, e.g. BX-7Q2F9K; ui-monospace already resolves to the device's own mono face on Apple devices, so no Apple font is named or bundled */
--font-brand: "Cinzel Decorative", Georgia, "Times New Roman", serif;
```
`letter-spacing: normal` for the system font (the OS applies optical sizing and tracking).
Never use period-prefixed internal font names [A WebKit].

### 3.3 Dynamic Type scale (web, default "Large" size) [A HIG Typography]

Root: `html { font-size: 106.25% }` (17px) everywhere; on iOS `font: -apple-system-body` sets
the root to the user's Text Size (§3.5). `rem` = Body. Clamp bounds are Apple's xSmall and AX5 sizes,
so titles do not explode at accessibility sizes.

| Token | Size/leading px | Weight (emphasized) | CSS `font-size` | Used for |
|---|---|---|---|---|
| `--t-large-title` | 34/41 | 400 (**700**) | `clamp(31px, 2rem, 60px)` | Tab root titles, account value, stock price |
| `--t-title-1` | 28/34 | 400 (**700**) | `clamp(25px, 1.647rem, 58px)` | Order filled, results headings, glossary term |
| `--t-title-2` | 22/28 | 400 (**700**) | `clamp(19px, 1.294rem, 56px)` | Company name, sheet titles, standings header |
| `--t-title-3` | 20/25 | 400 (**600**) | `clamp(17px, 1.176rem, 55px)` | Empty-state titles, fill recap |
| `--t-headline` | 17/22 | 600 | `1rem` | Row titles (tickers), section headers, bar titles, buttons |
| `--t-body` | 17/22 | 400 (600) | `1rem` | Body text, values, inputs |
| `--t-callout` | 16/21 | 400 (600) | `.941rem` | Toast text |
| `--t-subhead` | 15/20 | 400 (600) | `.882rem` | Status line, explain sentences, change lines |
| `--t-footnote` | 13/18 | 400 (600) | `max(12px,.765rem)` | Secondary row lines, footers, change pills |
| `--t-caption-1` | 12/16 | 400 (600) | `max(11px,.706rem)` | Axis labels, tags |
| `--t-caption-2` | 11/13 | 400 (600) | `max(11px,.647rem)` | Tab labels (cap 13px), column headers |
| `--t-amount` (display) | 48/56 | 600 | `clamp(40px, 2.824rem, 64px)` | Trade ticket amount only |

Line-height: use the leading ratio (`41/34` etc.) as a unitless value so it scales.
Minimum text is 11px [A]. Avoid Ultralight/Thin/Light [A].

### 3.4 Numbers

- `font-variant-numeric: tabular-nums lining-nums` on every number, everywhere (BRIEF §4).
- Right-align numeric columns and their headers; true minus `−` (U+2212); `Ð` + 2 decimals.
- SVG triangles: 8px beside 11–15px text, 10px beside 17px+, `aria-hidden="true"`.
- Large figures (account value, price) never wrap; if they overflow at big text sizes they drop to
  Title 1 before truncating. Never truncate a number.

### 3.5 Web Dynamic Type

```css
html { font-size: 106.25%; -webkit-text-size-adjust: 100%; }
@supports (font: -apple-system-body) and (-webkit-touch-callout: none) {
  html { font: -apple-system-body; font-family: var(--font-ui); } /* iOS only; macOS Safari has no Dynamic Type */
}
```
Everything else in `rem`/`em`. Inputs: `font-size: max(16px, 1rem)` so iOS never zooms on focus.
At ≥ xxxLarge (root ≥23px) rows switch to their stacked variants (§5.5).

**Large-text rules (root ≥23px, up to AX5 = 53px root):**
- Every height in §4–§7 is a **min-height**, never a fixed `height` (buttons, rows, tiles, segmented controls,
  keypad keys, cards). Only the tab bar keeps its 62px height (labels capped at 13px, §5.1).
- SegmentedControls with more than 3 segments (Markets `Basics | Price | Value | Health | Analysts`, News
  filters) become a menu button "View: Basics ▾" / "Show: All ▾", because five 72px segments cannot hold
  17–31px labels.
- Trade sheet: the body scrolls under a pinned footer (Preview / Place order); keypad digits cap at 34px and
  keys grow to fit; the "fits without scrolling" SE layout (§7.10) applies only at default sizes.
- Two-tile rows (Portfolio cash + rank) stack to one column.

---

## 4. Layout

### 4.1 Reference frame and devices [A archived HIG Layout, July 2026]

| Device class | Viewport (pt) | Safe area top / bottom | Role |
|---|---|---|---|
| **iPhone 16 / 15 (reference)** | **393×852** | 59 / 34 | All artboards |
| iPhone 17 / 17 Pro | 402×874 | 62 / 34 | Test |
| iPhone 17 Pro Max | 440×956 | 62 / 34 | Test (20px margins) |
| iPhone SE 2nd/3rd gen | 375×667 | 20 / 0 | Test (compression rules) |
| iPhone Duo outer 5.4" / landscape phones | short-wide | varies | Side rail (§4.5) |

Always read `env(safe-area-inset-*)`; the numbers above are for drawing only.

### 4.2 Spacing, margins, radii

- **Margins:** 16px when viewport width <420px; 20px at ≥420px (Air, Plus, Pro Max) [B].
  `--margin: 16px; @media (min-width:420px){ --margin: 20px }`, applied as
  `max(var(--margin), env(safe-area-inset-left))`.
- **Spacing steps:** 2, 4, 8, 12, 16, 20, 24, 32, 44.
- **Section rhythm:** 8px between large-title block and first content; 32px between sections
  that have headers (header sits 8px above its card); 24px between headerless groups.
- **Radii (shapes are concentric: inner = outer − padding, min 8)** [A WWDC25-356]:

| Token | px | Where |
|---|---|---|
| `--r-card` | 24 | Inset grouped cards, chart card, banners, news cards [C: iOS 26 lists ≈22–26] |
| `--r-inner` | 16 | Cards nested in cards (8px padding), summary box in ticket |
| `--r-tile` | 8 | 29px leading icon squares |
| `--r-sheet-medium` | 32 | Inset medium sheets (8px from edges) |
| `--r-sheet-large` | 24 | Large sheet top corners |
| `--r-alert` | 28 | Alerts, action sheets, menus |
| capsule | h/2 | Buttons, tab bar, segmented control, pills, search field, stepper |

### 4.3 Fixed chrome on 393×852 (drawing coordinates, y from top)

| Element | y | Height | Notes |
|---|---|---|---|
| Status bar | 0–59 | 59 | Artboards draw time "14:02" and generic signal/battery shapes (no Apple glyphs) |
| Top bar row (buttons, inline title) | 59–103 | 44 | Buttons 44×44 at x=16 (leading) and ending at x=377 (trailing), 8px between |
| Large title | 107–148 | 41 | x=16, Large Title bold |
| Status line | 150–170 | 20 | Subhead, 8px dot |
| First content | 182 | — | |
| Floating Buy/Sell buttons (company page) | 698–748 | 50 | Two capsules, 8px above a 20px edge fade |
| **Tab bar capsule** | **768–830** | **62** | x 16–377; bottom = `max(8px, env(safe-area-inset-bottom) − 12px)` → 22px on this device |
| Home indicator zone | 818–852 | 34 | Artboards draw a 139×5 capsule at y 839 in `--label` |

Content bottom padding on tab screens: `calc(62px + max(8px, env(safe-area-inset-bottom) − 12px) + 16px)`
(= 100px here); +66px on screens with floating Buy/Sell buttons.

### 4.4 Hit targets [A HIG Accessibility]

- Every tappable thing ≥44×44px; absolute floor 28×28 for dense secondary controls (column-header "?",
  chips inside cards) with 12px clearance.
- Small visuals (22px "?" glyph, 32px avatar, 36px chips, 32/36px segmented controls, 34px medium and 28px
  small buttons) get invisible hit padding via `::before { inset: -N }` up to 44px, and the layout reserves
  that space (no overlapping hit areas).
- Spacing between adjacent targets ≥8px; leave ~24px around unbezeled controls near screen edges.
- Indicators that look tappable but are not (walkthrough step dots, Final results page dots, allocation legend
  swatches) are `aria-hidden` decoration; the adjacent Back/Next buttons do the work.
- Never nest interactive elements: a "?" button, a chip link or a swipe action is never inside a row or card
  link. Cards that open as a whole use a stretched `::after` on their title link, and inner controls sit above
  it with `position: relative; z-index: 1`.

### 4.5 Breakpoints and adaptive layouts

| Condition (CSS) | Layout |
|---|---|
| `(max-width: 743px)` and not the rail condition | **Phone:** floating tab bar, one column, sheets from bottom |
| `(orientation: landscape) and (max-height: 500px)` | **Rail:** tab bar becomes a 72px vertical glass rail at the leading edge (inside `safe-area-inset-left`), 5 icon+label items centred; content column max 600px; sheets become centred 540px-wide panels. Matches Apple's iPhone Duo guidance to move bars to the side on short, wide displays [A HIG Duo] |
| `(min-width: 744px) and (min-height: 501px)` | **Split view (secondary):** 280px sidebar (solid `--bg-2`, same 5 sections + Trade button + crew row); content column max 672px; ≥1024px adds a 360px list column beside the detail (Markets list ↔ company page; Positions ↔ company). Trade opens as a 420px right-side panel. InfoTips become popovers that open on tap, click or focus for every pointer type (hover-open is an extra under `(hover: hover)`, never the only way). School Chromebooks (1366×768, browser viewport ≈1366×650) land here |
| Host console | Regular-width first; phone gets its own 5 tabs (§6.6) |

Avoid fixed widths, prefer even column counts, keep key numbers away from the horizontal centre on
foldables [A HIG Duo]. Safari has no viewport-segments API; don't rely on it [BCD].

### 4.6 Z-order

content 0 · sticky section headers 10 · top bar 20 · floating Buy/Sell 30 · tab bar 40 · toast 50 ·
scrim 60 · sheet 70 · second scrim (action sheet or alert over a sheet) 75 · menu/action sheet/alert 80.
While any scrim is shown, everything beneath it (page, top bar, tab bar) gets `inert` so VoiceOver swipes and
Tab cannot reach it. Closed overlays are removed (`display:none`), not
hidden with opacity, because Safari 26 tints its bars from fixed elements near the edges [C WebKit-301756].

---

## 5. Components

Implementation home: `web/src/components/ui/<Name>.tsx` + co-located `<Name>.css`. "Library" says what
supplies behaviour; styling is always ours. Icons are lucide-react 1.46.0 (ISC), 24px grid, stroke 1.75
(2.25 when selected), always paired with text in navigation (BRIEF §4).

### 5.1 TabBar (glass)

- **Anatomy:** `<nav aria-label="Main">` glass capsule → 5 `NavLink` items, each icon (24px) over label.
  Selected item sits on a capsule **platter** (`--platter`). Optional count badge on News.
  Icons: Portfolio `Briefcase`, Markets `ChartLine`, News `Newspaper`, Standings `Trophy`, Learn `GraduationCap`.
- **Sizes:** capsule 62px tall, radius 31, inset 16px (20 at ≥420px) from the sides; padding 4px;
  items share width equally (70.6px on 393). Platter = item − 4px inset, 54px tall, capsule.
  Icon 24px at 8px from item top; label Caption 2 11/13 (medium; semibold when selected), capped at
  13px at large text sizes (labels truncate with the full name in `aria-label`). Badge: min 18×18,
  radius 9, Caption 2 semibold, `--prominent` fill with `--on-prominent` text (hull pill with gold number,
  9.30/10.31:1; not red, because red is the loss/destructive colour and would read as "bad news"), 2px ring of the glass tint,
  anchored at icon top-right (+10px, −4px). [B: 62pt capsule, Forum-796299; C: web proposal]
- **States:** default (icon + label `--label-2`) · selected (platter, icon stroke 2.25 + label
  `--tint-strong`, `aria-current="page"`) · pressed (platter at 50% appears, scale .96, 100ms) ·
  focus-visible (2px `--focus` ring inside the item, radius 27) · keyboard open (`display:none`) ·
  rail (landscape) · sidebar (split view).
- **Behaviour:** never hides except under full-screen modals and while a text field has focus; **never
  minimizes on scroll** (beginners need visible labels; HIG "keep the tab bar visible" [A]; avoids the
  iOS 26 fixed-bar jump bug [WebKit-297779]). Tap a different tab → its remembered stack. Tap the active
  tab on a pushed screen → pop to root. Tap it at root → scroll to top (instant under reduced motion).
  Badge only on News, only for dispatches about companies you own; cleared when News is opened.
- **Web:** `position: fixed`, sibling of the outlet, `view-transition-name: tabbar`. Hide it only for
  text entry, not for every `input`: the segmented controls use native radios and Account uses a
  checkbox switch, and focusing those must not make the tab bar vanish:
  `html:has(:is(input:is(:not([type]),[type=text],[type=search],[type=password],[type=email],[type=number]):not([inputmode=none]),textarea):focus) .tabbar { display:none }`.
  Wrap the rule in `@media (pointer: coarse)` so Chromebooks used with a trackpad and hardware keyboard keep
  the bar while searching (a Chromebook in tablet mode reports a coarse pointer and gets the rule).
- **Library:** none.

### 5.2 LargeTitleNavBar (collapsing top bar)

- **Anatomy:** fixed top bar row (44px, under `safe-area-inset-top`): leading slot (Back), centre
  inline title (Headline) + optional subtitle (Caption 1), trailing slot (≤2 buttons or 1 button + avatar).
  In content: large title (Large Title bold) + status line (Subhead `--label-2`, 8px `--accent-dot`)
  + optional banner.
- **Sizes:** bar buttons 44×44 circles (icon 20px, stroke 2); avatar = 32px crest in a 44px target.
  Large title x=16, max 1 line (titles <15 characters [A]); status line 1 line, truncates at the end.
- **States:**
  - *Expanded* (at top): bar has no background; the leading button is a glass circle and the trailing buttons share
    **one** glass capsule (e.g. Star + More = 88×44), so the company page uses 2 blur layers plus the tab bar (3,
    within the §2.4 cap) instead of 4.
  - *Collapsed* (large title's bottom has passed under the bar): bar strip (safe area + 44) becomes
    glass with a 0.5px `--separator` bottom edge (iOS 27 "hard" edge [C DFN-27]); buttons switch to
    plain `--fill-on-glass` circles (no glass on glass); inline title fades in (150ms); subtitle (`--label-2`) shows
    "Open · 37:17:42". The inline title is `aria-hidden="true"` (the large title stays the one `<h1>`).
  - *With pinned search* (Markets): collapsed row holds the search capsule instead of the title (§5.3).
  - *Pushed screen:* Back (`ChevronLeft`, `aria-label="Back to {previous title}"`, never the word "Back" on screen [A]).
- **Web:** IntersectionObserver on a sentinel under the large title with
  `rootMargin: calc(-1 * (env(safe-area-inset-top) + 44px))` → toggles `data-collapsed`. The status line
  is a button that opens the Market status sheet. `view-transition-name: topbar`. While the iOS keyboard
  is open the layout viewport does not shrink and a fixed top bar can scroll out of view; translate the bar
  by `visualViewport.offsetTop` (same listener as `--kb`, §9.4) so the pinned search stays visible.
- **Library:** none.

### 5.3 SearchField

- **Anatomy:** capsule field → leading `Search` icon 17px (`--label-2`) · `<input type="search">` · Clear
  button (`X` in a 17px `--label-3` circle, 44px target) once text exists · "Cancel" plain text button
  (Body, `--tint`; `--tint-strong` when pinned in the glass bar) to the right while focused [A WWDC26-292 anatomy].
- **Sizes:** 40px tall inline (content style, `--fill` background) [C]; 36px when pinned into the
  collapsed bar (`--fill-on-glass` background); text 17px (never below 16px); Cancel slides in and the field
  shrinks (250ms `--ease-snappy`).
- **States:** idle · focused (tab bar hidden; recent searches shown inline, ≤5, each with a trailing 44px
  "Remove {ticker}" `X` button, plus "Clear" in the section header; no swipe-only delete) · typing (results update on every keystroke; ticker, name, sector, price, change
  pill) · no results (EmptyState "No companies match “{query}”", COPY §12 `empty.search`) · pinned.
- **Web:** `enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"`;
  results are a normal list of links; a polite live region says "{n} results" after 500ms idle.
  Recents in localStorage per crew.
- **Library:** none.

### 5.4 InsetGroupedList

- **Anatomy:** section = optional header → card (`--cell`, `--r-card`, `overflow: clip`; not `hidden`, which
  makes the card a scroll container and breaks `position: sticky` headers inside it; Safari 16+) of rows →
  optional footer. Rows separated by 0.5px hairlines; no separator after the last row.
- **Header variants:**
  - *Prominent* (content sections): Headline 17/22 `--label`, x = margin; optional trailing "See all" /
    "See all 7" (Body `--tint`, 44px target). E.g. "Positions", "Key stats".
  - *Plain* (forms, settings): Footnote 13/18 `--label-2`, sentence case, x = margin + 16.
- **Footer:** Footnote 13/18 `--label-2`, x = margin + 16, 8px below the card.
- **Separators:** inset 16px from the card's leading edge, or aligned to the text when there is a
  leading element (16 + element + 12, e.g. 64px for a 36px crest); trailing inset 0. Draw with
  `box-shadow: inset 0 -0.5px var(--separator)` (1 device pixel on 2x/3x screens).
- **Web:** `<section aria-labelledby>` + `<ul role="list">`; headers are real `<h2>`.
- **Library:** none.

### 5.5 ListRow variants

All rows: min height 44, padding 12px 16px, pressed state `--fill-2` (100ms in, 250ms out),
focus-visible 2px inset `--focus` ring following the card radius on first/last rows. A chevron
(`ChevronRight` 14px, stroke 2.5, `--label-3`) appears **only** when the row navigates [A].

| Variant | Height | Anatomy (left → right) | Used on |
|---|---|---|---|
| **StockRow** | 64 | Crest 36 · ticker (Headline) over name (Footnote `--label-2`, truncates) · sparkline 48×20 (session, stroke 1.5, gain/loss/`--label-3`, dashed session-open line) · value (Body semibold, tabular) over ChangePill | Markets movers, search results, Price view |
| **HoldingRow** | 64 | Crest 36 · ticker over "3,000 shares" (Footnote) · value (Body semibold) over change text (Footnote semibold, sign + triangle + colour) for the chosen "Show" metric | Portfolio (top 5) |
| **PositionRow** | 88 | Crest 36 · L1 ticker … value · L2 name … total gain "▲ +Ð31,860.00 (+14.45%)" · L3 "3,000 shares · paid Ð73.50" … session "▲ +Ð5,700.00" (no "sh"/"avg" abbreviations, BRIEF §9.10; the Positions header "?" explains each line, §7.4) | Positions |
| **CompanyMetricsRow** | 76 | L1 crest 28 · ticker · name (truncates) … price · ChangePill · L2 five right-aligned Footnote tabular cells, 20% width each | Markets › All companies (Basics/Value/Health/Analysts) |
| **KeyValueRow** | 44 | Label (Body) + optional InfoTip … value (Body tabular, `--label` or `--label-2`) | Balances, order detail, ticket preview, game rules |
| **ExplainRow** | ≥88 | L1 label (Subhead semibold) + InfoTip … value (Headline tabular) · L2 sentence (Subhead) · L3 "Sector average: 22.1", or "Market average: 21.4" when the sector has fewer than 3 companies (COPY §3.2 `averageLine`; Footnote `--label-3`). No colour judgement | Key stats, Financials |
| **DisclosureRow** | 44 / 60 with subtitle | Optional 29px icon tile (`--r-tile`, `--tint-soft` bg, 18px `--tint` icon) · title (Body) over subtitle (Footnote) · detail (Body `--label-2`) · chevron | Learn, Account, host quick actions |
| **ActivityRow** | 64 | 32px icon circle (`--fill`: `CirclePlus` buy, `CircleMinus` sell, `TriangleAlert` not placed, all `--label`) · "Bought 500 KRKN" (Body) over "Tick 1,284 · 14:02:30" (Footnote `--label-3`) · "−Ð42,102.06" (Body tabular) over status (Footnote `--label-2`) · chevron | Activity, Portfolio recent |
| **StandingRow** | 60 | Rank (Headline tabular, 28px column) · crest 32 · crew (Body) + "You" pill over value (Footnote `--label-2`) · ChangePill · movement "▲1" (Caption 1 `--label-2`, triangle + number, `aria-label="up 1 place"`; rank moves are not price changes, so no gain/loss colour). Your row has `--tint-soft` background and its "You" pill is `--prominent`/`--on-prominent` (a gray TagPill on the tinted row is 3.43:1 in dark) | Standings |
| **ToggleRow** | 44 | Title (Body) · native switch (§5.25) | Account › Display, host settings |
| **ActionRow** | 44 | Title in `--tint` or `--destructive` (Body), leading-aligned | Sign out, Clear recent searches |

**Large text (root ≥23px):** two-column rows stack: trailing values move under the title, left-aligned;
CompanyMetricsRow line 2 becomes "label value" pairs, two per line; ExplainRow value moves under the label.

### 5.6 SegmentedControl

- **Anatomy:** capsule track (`--fill`) → equal-width segments (text only, never icons + text [A]) →
  sliding thumb (`--segment-thumb`, capsule, shadow `0 1px 3px rgba(0,0,0,.18)`).
- **Sizes:** 32px tall (36px for Buy | Sell in the ticket); track padding 2; thumb radius = (h−4)/2;
  labels Footnote 13/18, semibold selected / medium unselected; ≤5 segments on phone [A]; min segment 56px.
- **Colours:** selected label `--on-segment-thumb` (light: gold-bright on hull, 9.30:1; dark: abyss on
  mist, 8.59:1); unselected `--label-2`. Thumb vs track (non-text) 11.12:1 light on paper, 12.05:1 in a sheet;
  6.66:1 dark on the page, 5.44:1 in a sheet (reviewer script).
- **States:** default · pressed segment (label 60% opacity) · disabled segment (`--label-4`, `aria-disabled`) ·
  focus-visible (ring around track) · dragging thumb (follows finger, snaps on release).
- **Web:** `<fieldset>` + visually hidden native radios + `<label>`s (arrow keys for free); thumb moves with
  `transform` and `--ease-snappy` 400ms; instant under reduced motion.
- **Uses:** Portfolio chart range `1H 6H 24H All`; Markets list view `Basics | Price | Value | Health | Analysts`;
  News `All | My holdings | Watchlist`; Standings `Total return | This session`; ticket `Buy | Sell`,
  `Shares | Doubloons`. Never for app sections.
- **Library:** none.

### 5.7 Buttons

| Style | Background / label | Use |
|---|---|---|
| **Prominent** | `--prominent` / `--on-prominent` | The one primary action per view: Sign in, Preview order, Done, Start the walkthrough |
| **Buy** | `--gain` / `--on-side` | Buy on company page; Place order (buy) |
| **Sell** | `--loss` / `--on-side` | Place order (sell) |
| **Tinted** | `--tint-soft` / `--tint-strong` | Fix buttons ("Use max (2,949 shares)"), "Open in Learn", EmptyState actions (`--tint` label would be 4.41:1 on paper) |
| **Tinted Sell** | `--loss-fill` / `--loss` | Sell on company page (secondary beside Buy) |
| **Gray** | `--fill` / `--label` | Secondary actions ("Trade again", "View activity"), chips inside cards and sheets. Chips placed directly on `--bg-grouped` (Markets sector chips) use `--cell` with a 0.5px `--separator` edge instead, so coloured change text inside them stays ≥4.5:1 |
| **Plain** | none / `--tint` | "Edit order", "See all", "Skip for now" |
| **Destructive plain** | none / `--destructive` | Sign out row, Discard order |
| **Destructive tinted** | `--loss-fill` / `--loss` | Host "End game…" only (the student app has no destructive buttons outside action sheets) |
| **Glass** | `.glass` / `--label` | Bar buttons over content (expanded state) |

- **Sizes (all capsules):** large 50px (Headline, padding 0 20), medium 34px (Subhead semibold,
  padding 0 14), small 28px (Footnote semibold, padding 0 10) [B]. Large buttons in sheets and footers
  fill the width inside the margins (361px on 393). Hit area ≥44 via `::before`.
- **States:** default · pressed (scale .97; background `filter: brightness(.92)` light / `1.12` dark; 100ms) ·
  disabled (background `--fill`, label `--label-3`; keep focusable with `aria-disabled="true"` and a
  visible reason nearby) · loading (17px spinner + changed label, e.g. COPY §9 `buttons.placing`
  "Placing order…", width locked, `aria-busy="true"`) · focus-visible (2px `--focus` ring, 2px offset).
- **Rules:** verbs in title style ("Preview order"); 1–2 prominent buttons per view; destructive is never the
  prominent style [A]; no full-bleed edge-to-edge buttons.
- **Web:** `<button type="button">`, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`.

### 5.8 Sheet (detents, grabber)

- **Anatomy:** scrim → sheet surface → grabber (resizable sheets only) → header row (leading Close `X` or
  Back, centred title, optional trailing action) → scroll area (`overscroll-behavior: contain`) →
  optional pinned footer (primary button).
- **Detents:** *medium* = 50% of the dynamic viewport height; *large* = top at
  `env(safe-area-inset-top) + 10px`. Medium sheets are inset 8px from sides and bottom with
  `--r-sheet-medium`; dragged to large they attach to the side edges with `--r-sheet-large` top corners
  [A WWDC25-323/356 behaviour; C numbers]. **Every sheet surface is opaque `--elevated` + `--float-shadow`**
  (§2.4: no glass on reading surfaces). Explanation sheets (InfoTip, Crew card, Market status) open at
  the smaller of their content height and *large*, so "Usually a good sign when…" is never hidden below a
  medium detent on a 667px iPhone SE; the grabber appears only when content is taller than medium.
- **Grabber:** 36×5 capsule, 6px from top, `--control-off` (≥3:1 non-text; iOS's faint quaternary grabber is
  1.6:1); it is a `<button aria-label="Resize sheet" aria-expanded>` with a 64×44 hit area centred on the top
  edge (clear of the 44px Close button); tap cycles medium ↔ large [A].
- **Header:** 56px; Close is a 44px `--fill` circle with `X`; Cancel leading / Done trailing for single-view
  sheets; never Cancel + Done + Back together [A].
- **Dismiss:** swipe down (release velocity >0.5 px/ms or travel >30% of sheet height), tap scrim (medium
  sheets only), Close, Esc, and browser/Android Back or the Home Screen app's edge swipe-back (sheets live in
  the URL, §6.5). If the student typed anything, confirm with an action sheet [A]. A `popstate` cannot be
  cancelled, so when Back arrives while the ticket is dirty the app immediately re-pushes the sheet entry and
  shows "Discard this order?"; while Placing it re-pushes silently. A sheet opened from a cold deep link (no
  earlier entry in this app) closes with `navigate(basePath, { replace: true })`, never `history.back()`,
  so Close never leaves the app.
- **Accessibility:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` the title; everything behind the
  scrim (page, bars) gets `inert` because VoiceOver on iOS does not reliably honour `aria-modal` alone; focus
  moves to the title on open and returns to the trigger on close (§10).
- **Rules:** one sheet at a time; inside a sheet, "?" explanations expand inline (§5.9); the page behind
  does not scale (avoids Backdrop Root and repaint cost); `max-height: calc(100dvh - env(safe-area-inset-top) - 8px)`.
  Keyboard: footer rides above it using `--drawer-keyboard-inset`.
- **Catalogue:**

| Sheet | Detents | Scrim | Header |
|---|---|---|---|
| Trade | large only (not resizable, no grabber) | `--scrim` | X / title / — ; Back on later steps |
| InfoTip explainer | medium ↔ large | `--scrim-info` | title / X |
| Crew card | medium ↔ large | `--scrim-info` | title / X |
| Market status | medium | `--scrim-info` | title / X |
| Account | large | `--scrim` | title / Done |
| Welcome (first sign-in) | large | `--scrim` | none (buttons at bottom) |
| Host Fire news | large | `--scrim` | Cancel / title / Publish |

- **Library:** `@base-ui/react/drawer` (snapPoints, swipe dismiss, focus trap, `VirtualKeyboardProvider`);
  fallback after the device spike fails: `@radix-ui/react-dialog@1.1.23` + ~200 lines of pointer-drag code.

### 5.9 Popover / InfoTip (bottom sheet on phone)

- **Trigger:** 22px `CircleQuestionMark` (lucide alias `CircleHelp`), `--label-2`, 44×44 target, placed right after the
  label. `aria-label="What is {label} ({term})?"` (COPY §0.4), `aria-haspopup="dialog"`.
- **Coverage rule (BRIEF §9.2):** every on-screen metric whose COPY §1 row has a `glossary` id gets a tap path
  to its explanation on touch: either its own "?" beside the label, or, where rows are dense links (Markets
  list, Positions rows, Results scorecard, statement tables), one "?" in the section or column header that
  opens a **"What these numbers mean" sheet** listing every metric currently shown, each with its three lines
  and an "Open in Learn" link. A "?" is never nested inside a row or card link (§4.4). Nothing opens on hover
  alone, at any width.
- **Phone (compact width):** HIG says avoid popovers in compact width [A]; open the InfoTip sheet (content height, up to large):
  title Title 2 bold = `label`; subtitle Subhead `--label-2` = `term`; three blocks, each heading Subhead
  semibold + body Body: **What it is** / **Why it matters** / **Usually a good sign when…** (COPY §2 glossary
  fields, the last rendered with its lead-in); footer Tinted medium button "Open in Learn".
- **Inside a sheet (ticket preview):** no second sheet. Tapping "?" expands the row in place (height
  animates 200ms; three Subhead lines; `aria-expanded`); the "?" gets a `--tint-soft` circle while open.
- **Regular width (≥744px, any pointer):** 320px popover with arrow; opens on tap, click or focus; with
  `(hover: hover)` it also opens after a 150ms hover. `@base-ui/react/popover`.
- **States:** closed · open · (inline) expanded · focus-visible.

### 5.10 Menu (pull-down and long-press)

- Glass panel, `--r-alert`, min width 220, rows 44px Body `--label`; group separators 8px `--fill-2` bars; ≤3 groups;
  icons on all items in a group or none; destructive items last in `--destructive-strong` (text on glass, §2.4) [A].
  Springs from its trigger (scale .9 → 1 from the trigger corner, `--ease-snappy`).
- Uses: Positions sort (`ArrowUpDown`: Value, Total gain %, Session change, Name); Activity filter
  (`ListFilter`: All, Buys, Sells, Needs attention); company page More (`Ellipsis`: Read a company in
  5 questions, Add to watchlist / Remove); row long-press (Buy, Sell, View company). Every menu action
  exists elsewhere in the UI [A].
- **Library:** `@base-ui/react/menu`; long-press is our pointer timer (§8.3).

### 5.11 ActionSheet and Alert

- **Action sheet (confirmation):** bottom-anchored opaque `--elevated` panel (not glass, §2.4) inset 8px, `--r-alert`,
  over its own scrim (z 75 when shown above a sheet); optional title
  (Footnote semibold `--label-2`, one line) and message; action rows 56px (Body; destructive first,
  `--destructive`); separate Cancel capsule (56px, semibold `--label`) 8px below. Tap outside = Cancel.
  Uses: "Discard this order?", "Sign out of Saltwind Traders?".
- **Alert:** centred, 300px wide, `--r-alert`, padding 20, glass-solid surface; title Headline left-aligned
  (≤2 lines), message Subhead left-aligned, buttons 44px capsules in a row (Cancel gray leading, default
  trailing) or stacked if either label >12 characters [A iOS 26 alert style]. Initial focus on Cancel.
  Student app uses **no alerts** in normal play. Host uses one: End game (typed "END").
- **Library:** `@base-ui/react/alert-dialog`; action sheet = `@base-ui/react/dialog` with our layout.

### 5.12 Toast and Banner

- **Toast (transient, floating):** glass capsule just below the top bar row:
  `top: calc(env(safe-area-inset-top) + 44px + 8px)`, so it never overlaps the collapsed glass bar (no glass on
  glass); width up to 361, min 52px, padding 10 16; 22px icon + Callout text `--label` (≤2 lines) + optional
  plain action in `--tint-strong`. `role="status"`. Info toasts stay ≥6s and pause while touched or focused;
  toasts with an action stay until dismissed and their action is reachable by Tab/F6 and VoiceOver; swipe up
  or a 44px Close `X` dismisses (no swipe-only dismissal). Uses: "Update ready · Reload" (PWA), "Back online", "Walkthrough hidden · Undo".
  Order results never rely on a toast (they live in the ticket and Activity).
- **Banner (inline, in content):** card under the large title/status line, `--r-card`, padding 16:
  22px icon · title Headline · body Subhead · optional small button. Phase banners use COPY §9 `banners` /
  §12 `phases`:
  - Paused (`Pause`, `--tint-soft` bg): "Trading paused · Becalmed" + body.
  - Lobby (`Anchor`, `--cell`), Ended (hull card with `class="dark"` so its body text uses the dark tokens, gold title
    "Game ended · Anchors dropped" + "See final results").
  - Offline (`WifiOff`, `--cell`): COPY §12 `errors.offline`. Trading disabled (`Lock`, `--cell`).
  - Stale (`Clock`, `--cell`): COPY §12 `errors.stale` with a small Tinted **Reload** button. A Home Screen app
    has no browser reload and pull-to-refresh is off (§8.3), so "refresh the page" needs this button
    (phone body text: `COPY-TBD mobile.staleBody`). The same Reload button appears on `errors.pageLoad`.
  - Final session (`Flag`, `--cell`): COPY §12 `phases.finalSession`, shown once per device when the last
    session starts.
  Never red backgrounds. Small buttons inside a `--tint-soft` banner use the Tinted style (`--tint-strong` label, 5.46:1).
- **Library:** `@base-ui/react/toast` for toasts; banners are plain components.

### 5.13 Chart card with scrubbing

- **Anatomy:** card (`--cell`, `--r-card`, padding 16) → summary sentence (Subhead `--label-2`, the text a
  screen reader also hears) → plot → x labels → range SegmentedControl.
- **Sizes:** plot 220px (company), 180px (portfolio), 160px (dispatch mini chart), full card width
  (inner 329px on 393). Y labels trailing, Caption 1 tabular `--label-3`, 3 ticks; x labels start/middle/end.
- **Marks:** line 2px, colour = `--gain` if last ≥ reference else `--loss`; area gradient line colour 14% → 0;
  dashed reference line 1px `4 4` in `--chart-baseline` (portfolio: Ð1,000,000.00 start; company: session
  open Ð82.22); optional Pirate Composite compare line 1.5px dashed `--chart-baseline` (portfolio).
  Axis range follows the data [A HIG Charts].
- **Scrub:** the whole plot is the target [A]. `touch-action: pan-y`; a horizontal drag >6px starts scrubbing
  (vertical scroll still works). Vertical rule 1px `--label` at 40%, 8px dot with 2px `--cell` ring; the
  StockHeader price/change lines are replaced by the scrubbed value and "14:01:30 · tick 1,282"; release
  restores. Critical numbers are always visible without scrubbing [A].
- **Keyboard/VoiceOver:** plot is `role="slider"` with `aria-valuetext="14:01:30, 84.06 doubloons"`; ←/→ step one
  point, Home/End jump; summary in `aria-describedby`. Two-finger range compare: not in v2 (conflicts with pinch zoom).
- **States:** loading (skeleton plot) · not enough history (COPY §12 `empty.chart`) · scrubbing · paused (flat
  line continues, "Clock stopped while paused").
- **Library:** custom SVG (spec §10 `AreaChart`, `Sparkline`). Also **AllocationBar** (12px stacked capsule of
  holdings + cash, sector crest colours, labelled legend below) and **RangeBar** (session range, 4px track,
  8px marker) live here.

### 5.14 StockHeader

- Crest 44 · name Title 2 bold (2 lines max) over "KRKN · Shipping & Salvage" (Footnote `--label-2`) →
  price Large Title bold tabular → change line Subhead semibold with triangle ("▲ +Ð1.90 (+2.31%)" + " this
  session" in `--label-2` regular + "?" for `sessionChange`) → "As of tick 1,284 · 14:02:30" (Footnote `--label-3`,
  "?" for `tick`, since "tick" is game jargon a first-timer will not know).
- Collapsed bar shows title "KRKN" and subtitle "Ð84.12 · ▲ +2.31%".
- Price flash on tick: value background `--gain-fill`/`--loss-fill` fades out over 300ms (not under reduced motion).
- `aria-label` on the price block: "Kraken Shipping Lines, 84.12 doubloons, up 2.31 percent this session"
  (VoiceOver reads "84 point 1 2 doubloons"; the spike in §9.9 confirms).

### 5.15 PositionSummary

- Prominent header "Your position" → card with a 2-column grid, 3 rows × 64px; each cell: label Footnote
  `--label-2` (+ InfoTip) over value Headline tabular. Hairline between rows and between columns.
- KRKN: Shares owned 3,000 · Current value Ð252,360.00 · Avg. price paid Ð73.50 · Total gain/loss
  ▲ +Ð31,860.00 (+14.45%) · Session change ▲ +Ð5,700.00 · Share of account 23.3% (labels: COPY §1.3 `position.*` short).
- Not owned: one row "You don't own any KRKN yet" (COPY §9 `lines.youOwnNone`). Large text: one column.
- Card footer (always, owned or not): "Cash available to trade: Ð248,349.55" (Footnote `--label-2` + "?",
  COPY §1.3 `portfolio.cashAvailable`). This is the phone's replacement for BRIEF §6's header cash chip, so a
  student sees their cash before tapping Buy.

### 5.16 TradeTicket sheet flow

- **Steps:** (0 Choose a company, only when opened from Portfolio) → **Entry** → **Preview** → **Placing** →
  **Filled** | **Needs attention**. One large sheet; steps replace content with a 250ms cross-slide
  (fade under reduced motion); header leading control is X on Entry, Back on Preview and Needs attention,
  none on Placing and Filled.
- **Keypad:** 3×4 grid (1–9, bottom row: blank or "." in Doubloons mode, 0, `Delete`), keys 48px tall
  (44 on SE), gap 4, digits Title 1 regular `--label`, pressed = 64px `--fill` circle behind the digit.
  Keys are `<button>`s ("Delete" labelled). The amount field is a real `<input inputmode="none">` so hardware
  keyboards type into it and the iOS keyboard never covers the ticket; the formatted amount is announced
  politely after 500ms idle. `inputmode="none"` has a patchy WebKit history (support removed and restored;
  iOS can still show the input accessory bar or scroll the sheet on focus), so it is a device-spike item
  (§9.9). **Fallback if the spike fails:** the amount becomes a non-focusable `<output>` inside
  `role="group" aria-label="Amount"`, the keypad and steppers are the only on-screen input, and a `keydown`
  listener on the sheet accepts digits, ".", Backspace and Enter from Chromebook/hardware keyboards.
  VoiceOver users use the labelled keypad either way; the amount's `aria-describedby` points at the helper
  line ("≈ Ð42,102.06 with fee").
- **Stepper:** split variant — `Minus`/`Plus` 44px `--fill` circles either side of the amount; ±1 share or ±Ð100.
- **Quick chips:** 36px gray capsules; Buy: 10 · 50 · 100 · Max; Sell: 25% · 50% · All (COPY §9 `chips`).
- **Validation:** live, inline, no alerts; Preview disabled until valid; fix buttons fill the amount (COPY §9 `ticket-errors`).
- **Idempotency:** `clientOrderId` created on Preview; retries reuse it; Placing disables dismiss and Back.
- Full blueprint: §7.10.

### 5.17 SwipeActions

- **Where:** Positions rows only (trailing: **Sell** `--loss`/`--on-side`, **Buy** `--gain`/`--on-side`, 76px each,
  icon 20px over Caption 1 label).
- **Behaviour:** custom pointer events; `touch-action: pan-y`; `user-select: none; -webkit-user-select: none` on
  the row so a long press never starts text selection; horizontal intent when |dx| > 10 and angle <30°;
  release past 50% of action width snaps open; no full-swipe commit; one open row at a time; tap
  elsewhere or scroll closes. Opening the action opens the Trade sheet (not a trade).
- **Alternatives (WCAG 2.2 SC 2.5.7/2.5.1 [W3C]):** the same actions exist as tap targets — long-press menu, and
  Buy/Sell on the company page the row opens. Hidden from VoiceOver (the row link leads to the buttons).
- **Library:** none (no maintained library; react-swipeable-list last published 2024-10).

### 5.18 EmptyState

- Centred in its card or screen: icon 44px `--label-3` (lucide, or the compass ornament on hull variant) ·
  title Title 3 semibold · body Subhead `--label-2`, max 280px · optional medium Tinted button · optional flavor
  (Footnote `--label-3`). Copy from COPY §12 `empty.*` (e.g. positions: "No positions yet" + action).
- Hull variant (results not open yet): hull card, gold Title 3, flavor "The fog hasn't lifted."

### 5.19 Skeleton loading

- Same geometry as the loaded view (rows, chart, header numbers as 60%-width bars), `--fill-2` shapes,
  radius = the element's radius. Shimmer: 1.2s linear gradient sweep; reduced motion: static at 60% opacity.
- Appears after 150ms (avoid flashes); container `aria-busy="true"` + visually hidden COPY §12 `loading.*` title.
- Hull screens use the compass loader (spec `Loader`), rotating 360° / 2s; reduced motion: static + text.

### 5.20 Badge / Pill

| Kind | Size | Style |
|---|---|---|
| **ChangePill** | min 64×26, radius 13, padding 0 8 | Footnote semibold tabular + 8px triangle; up `--gain-fill`/`--gain`; down `--loss-fill`/`--loss`; flat `--fill`/`--label-2` "0.00%" no arrow |
| **TagPill** | 22px, radius 11, padding 0 8 | Caption 1 semibold `--label-2` on `--fill`; optional 12px icon. "You own this", news type (Earnings, Storm…) with icon. Never on a `--tint-soft` row (3.43:1 dark) |
| **YouPill** | 22px, radius 11, padding 0 8 | Caption 1 semibold `--on-prominent` on `--prominent` (9.30/10.31:1). "You" in Standings and the crew sheet |
| **CountBadge** | min 18×18, radius 9 | Caption 2 semibold `--on-prominent` on `--prominent` (not red: red means loss/destructive) |
| **StatusDot** | 8×8 | `--accent-dot` (open), `--tint` (paused), `--label-3` (lobby/ended); always next to status text |
| **Chip** (tappable) | 36px (44px hit), capsule | Gray button style inside cards/sheets; on `--bg-grouped` use `--cell` + 0.5px `--separator` edge (§5.7). Sector chips "Cursed Relics ▼ −3.46%" (change text `--loss` on `--cell`, 5.96:1) |

### 5.21 Crest monogram

- Circle; sizes 28 / 32 / 36 / 44 / 64. Fill = sector colour (BRIEF §2); crews use hull `#232A26`.
- Letters: company = first two letters of the ticker ("KR"); crew = host-set initials ("SW").
  System font 600, size = 0.36 × diameter, `letter-spacing: .02em`, `#F8F6F0`.
- Ring: `inset 0 0 0 max(1.5px, 0.045×d) rgba(221,190,114,.85)` + `0 1px 2px rgba(0,0,0,.2)`.
- `aria-hidden="true"`; the name is always adjacent. Never emoji (BRIEF §4).

### 5.22 Medallion / Podium

- **Medallion:** 96px (1st), 80px (2nd/3rd) circle; radial gradients — gold `#DDBE72 → #B8954A`, silver
  `#D5DBD7 → #8E9893`, bronze `#C9925E → #80583A`; 3px inner ring 25% black; crew crest (64/52) centred.
  Rank number sits **below** as Title 3 (never on the metal).
- **Podium:** three hull steps (`#1A1F1C`, 1px `#B8954A` top rule) heights 96 / 72 / 56 in order 2-1-3;
  crew name Subhead + value Footnote tabular under each. Hull screen only.
- Motion: steps rise 600ms `--ease-bouncy`, stagger 80ms; reduced motion: appear with a 150ms fade.

### 5.23 WaxSeal

- SVG, 64px (order filled) or 120px (Voyage complete). 14-lobe irregular disc `--seal-crimson`, inner ring
  `#6E1814`, embossed original compass rose at `rgba(255,255,255,.18)`, brass rim highlight 1px `--seal-brass`.
- Ornament only: never carries data, `aria-hidden="true"`.
- Motion: scale 1.15 → 1 + fade in, 250ms `--ease-snappy`; reduced motion: fade only.

### 5.24 Stepper (quantity)

- **Joined** (settings, host): 100×36 capsule, `--fill`, two halves with `Minus`/`Plus` 17px `--label`, 0.5px
  separator; each half 44px tall hit area; disabled half at min/max uses `--label-4` [A: pairs with a field when big changes are likely].
- **Split** (ticket): §5.16. No press-and-hold repeat (no timing-based input).
- Buttons announce "Decrease shares" / "Increase shares"; the value is a separate field.

### 5.25 Toggle

- Native `<input type="checkbox" switch>` in list rows only [A HIG Toggles]: Safari 17.4+ draws the system
  switch, exposes `role=switch`, announces On/Off, and plays the iOS 18+ haptic [A WebKit-switch].
  `accent-color: var(--tint)`.
- Fallback (Chromium/Chromebooks, Firefox, and iOS below 17.4): detect with `'switch' in HTMLInputElement.prototype`
  and set `html[data-no-native-switch]` so the custom styles never fight Safari's native drawing; add
  `role="switch"` to the input (Chromium otherwise announces a checkbox). 51×31 track radius 15.5, 27px thumb
  `#FFFFFF` with `0 2px 4px rgba(0,0,0,.2)`; on = `--tint`; off = `--fill` with 1.5px `--control-off` inner border
  (light 3.69:1 on a cell; dark 3.82:1 on a cell, 3.36:1 on a sheet row). State also shown by thumb position.

---

## 6. Information architecture

### 6.1 Tabs (exactly five, always visible)

| # | Label | Icon | Root screen (large title) | Why |
|---|---|---|---|---|
| 1 | Portfolio | `Briefcase` | Portfolio: account value, chart, cash, rank, top positions, recent activity | Balance first (Wallet pattern); home for "Track it" |
| 2 | Markets | `ChartLine` | Markets: search, composite, sectors, movers, watchlist, All companies research list | Research and discovery in one place; 25 companies don't need two tabs |
| 3 | News | `Newspaper` | News: dispatches with "What this means" | Plain label (BRIEF §5); "Dispatches" becomes flavor |
| 4 | Standings | `Trophy` | Standings: your gap, leaderboard | One tap to rank (trading-game research) |
| 5 | Learn | `GraduationCap` | Learn: How to play, guide, 5 questions, trading basics, glossary | BRIEF §9.4 requires a visible Learn |

Trade is not a tab (HIG: tab bars navigate, toolbars act [A]). No "More" tab.

### 6.2 Push stacks (each tab keeps its own history)

| Tab | Pushed screens |
|---|---|
| Portfolio | Positions · Activity › Order detail · Balances · Company › Financials / All stats |
| Markets | Sector list · Company › Financials / All stats · Search results (inline, not pushed) |
| News | Dispatch detail · Company |
| Standings | Final results (full-screen, after the game ends) |
| Learn | Guide chapter (How the game works, 5 questions, Trading basics) · Glossary term · Company (from "See it on a company") |

The **Company page** is one shared screen pushed inside whichever tab opened it, so switching tabs never
loses a student's place.

### 6.3 Sheets and full-screen views

- **Sheets:** Trade, InfoTip, Crew card, Market status, Account, Welcome (first sign-in), Discard/Sign-out action sheets (§5.8).
- **Full screen:** Sign in (before auth, not a modal); Final results (shown once automatically when the game ends,
  reopened from the Standings banner); "Sails up" market-open moment (1.2s, only when the phase changes to live
  while the app is open; skipped under reduced motion; never shown over an open sheet or a focused field,
  where the status line and banner change instead; it does not take focus, and a tap dismisses it).
- **Trade opens from:** floating Buy/Sell on every company page · Portfolio toolbar `ArrowLeftRight` "Trade"
  (starts on "Choose a company") · Positions swipe actions and long-press menus · Markets row long-press ·
  `/trade/:ticker` links. **Never from News** ("View CNBR" only — explain, never nudge).

### 6.4 Where things live

| Thing | Location |
|---|---|
| Learn guide + glossary | Learn tab |
| "?" explanations | InfoTip sheet everywhere; inline inside sheets; "What these numbers mean" sheet for dense lists (§5.9); "Open in Learn" jumps to the term |
| Cash available to trade | Portfolio tile · company page "Your position" footer · Trade sheet quote row · Balances (replaces BRIEF §6's header cash chip) |
| Walkthrough | Welcome sheet on first sign-in → 3-step card at the top of Portfolio. Reopen: Learn › How to play, and Account › How to play. Once skipped, never shown automatically again [A Onboarding] |
| Account | Crew avatar (top right of all five tab roots) → Account sheet |
| Sign out | Last group of the Account sheet → confirmation action sheet |
| Game rules, Solid bars, Text size help, Add to Home Screen | Account sheet |
| Market status details | Tap the status line under any large title → Market status sheet |
| Watchlist | Star button on the company page; "Watchlist" section on Markets; News filter |
| Final results | Standings banner after end; `/standings/results` |
| Spec §10 Treemap, VolumeBars, DataTable | Desktop/split view only. Phone: sector chips + Sector list (Treemap), All stats "Volume" row (VolumeBars), CompanyMetricsRows (DataTable) |
| Host crew management (create, reset password, trading on/off, remove) | Host Crews tab (§7.18) |

### 6.5 Routes and deep links (react-router-dom 6.30 data router)

| Path | Screen | Notes |
|---|---|---|
| `/login` | Sign in | Redirects to `?next=` after auth |
| `/portfolio` | Portfolio | `/` redirects here |
| `/portfolio/positions` | Positions | |
| `/portfolio/activity` | Activity | `?filter=buys\|sells\|attention` |
| `/portfolio/activity/:orderId` | Order detail | e.g. `/portfolio/activity/BX-7Q2F9K` |
| `/portfolio/balances` | Balances | |
| `/portfolio/company/:ticker` | Company (Portfolio stack) | |
| `/markets` | Markets | `?view=basics\|price\|value\|health\|analysts&sort=&sector=`; `#companies` scrolls to the list |
| `/markets/sector/:sectorId` | Sector list | |
| `/markets/company/:ticker` | Company (Markets stack) | |
| `/:tab/company/:ticker/financials` | Financials | tab ∈ portfolio, markets, news, learn |
| `/:tab/company/:ticker/stats` | All stats | |
| `/news` | News | `?filter=holdings\|watchlist` |
| `/news/:newsId` | Dispatch detail | |
| `/news/company/:ticker` | Company (News stack) | |
| `/standings` | Standings | `?view=session` |
| `/standings/results` | Final results | `?page=1..5` |
| `/learn` | Learn | |
| `/learn/guide`, `/learn/five-questions`, `/learn/basics` | Guide chapters | |
| `/learn/glossary/:termId` | Glossary term | e.g. `/learn/glossary/peRatio` |
| `/learn/company/:ticker?highlight=:termId` | Company (Learn stack) with the row highlighted | |

**Sheets are search params on the current URL** (so browser/Android Back closes them):
`?sheet=trade&ticker=KRKN&side=buy` · `?sheet=term&id=peRatio` · `?sheet=account` · `?sheet=crew&id=:crewId` ·
`?sheet=status` · `?sheet=welcome` · `?sheet=help&set=markets-basics` ("What these numbers mean"; `set` ∈
markets-basics/price/value/health/analysts, positions, results-scorecard, statements-income/balance/cashflow).
Opening pushes one history entry; steps inside a sheet use `replace`. Back while the ticket is dirty or placing
is handled in §5.8. Markets segment labels are short forms of COPY §3.2 `research.views` ("Value" = Valuation,
"Health" = Financial health) plus a phone-only "Price" view (`COPY-TBD mobile.views`).

**Redirects from spec §10 routes:** `/` → `/portfolio` · `/positions` → `/portfolio/positions` · `/activity` →
`/portfolio/activity` · `/trade/:ticker?` → `/markets/company/:ticker?sheet=trade&side=buy` (no ticker →
`/portfolio?sheet=trade`) · `/research` → `/markets?view=basics#companies` · `/research/:ticker` →
`/markets/company/:ticker/financials` · `/trade/:ticker?tab=financials` (spec's own research redirect) →
`/markets/company/:ticker/financials` · `/trade/:ticker?tab=analysts|dispatches|crew` → `/markets/company/:ticker`
scrolled to that section · `/news` stays · `/results` → `/standings/results`.

Tab memory: last path per tab in `sessionStorage`; restored when the tab is tapped.

### 6.6 Host

Host area keeps spec routes `/admin`, `/admin/crews`, `/admin/market`, `/admin/news`, `/admin/tape`, `/admin/audit`.
On phone it has its own tab bar: **Control** `Gauge` · **Crews** `Users` · **Market** `ChartCandlestick` ·
**News** `Megaphone` · **Tape** `ScrollText`. Audit lives in Control's More menu. Projector view is desktop only.

---

## 7. Screen blueprints

### 7.0 Conventions

- Coordinates are for the 393×852 artboard; "full scroll" frames continue below 852 (§11.1). Heights are
  min-heights at the default text size (§3.5): if the render check shows a section overflowing, push later
  sections down and extend the frame rather than clipping or shrinking text.
- Every blueprint obeys the §5.9 coverage rule: each metric has a tap path to its explanation. The "?" marks
  listed below are the required ones, not the only ones.
- Copy pointers: `COPY §x key` = existing COPY.md text; `COPY-TBD mobile.key` = proposed phone copy below,
  to be added to COPY.md (not final). Numbers are BRIEF §7 unless marked *illustrative*.
- Every tab root: status bar → top bar (trailing crew avatar "SW") → large title → status line
  "● Market open · 37:17:42 left · Session 2 of 8" (COPY §12 `phases.live.pill` + `countdown` +
  `COPY-TBD mobile.statusLine`) → phase banner if not live → content → tab bar.

**Proposed phone copy (`COPY-TBD mobile.*`)**

```yaml
tabs: { portfolio: "Portfolio", markets: "Markets", news: "News", standings: "Standings", learn: "Learn" }
statusLine: "{pill} · {timeLeft} left · Session {session} of 8"
statusLineCollapsed: "Open · {timeLeft}"
trade: "Trade"
chooseCompany: "Choose a company"
yourHoldings: "Your holdings"
allCompanies: "All companies"
searchCompanies: "Search {n} companies"
searchTerms: "Search {n} terms"
recent: "Recent"
seeAll: "See all"
seeAllCount: "See all {n}"
show: { label: "Show", totalGain: "Total gain", session: "Session", pctOfAccount: "% of account" }
vsComposite: "vs Pirate Composite {pts} points"   # COPY §1.2 note: write "pts" out as "points"
sinceStart: "since the game began"                 # COPY §0.5 rule 8 wording
thisSession: "this session"
biggestMoves: "Biggest moves this session"
up: "Up"
down: "Down"
columnsHelp: "What these columns mean"
numbersHelp: "What these numbers mean"
views: { price: "Price" }                  # phone-only Markets view; others are COPY §3.2 research.views short forms
chartSummaryTotal: "Up {pct} since the game began"      # "Down {pct} …" when negative
chartSummarySession: "Up {pct} this session. Range {low} to {high}."
pricesFooter: "Prices update every {tickSeconds} seconds · as of {time}"
swipeHint: "Swipe a row for Buy and Sell, or open the company."
standingsFooter: "Ranked by account value."
signInFlavor: "Trade the Spanish Main"
signInFields: { crew: "Crew name", password: "Password", show: "Show password", hide: "Hide password" }
signInButton: { idle: "Sign in", loading: "Signing in…" }
helpHost: "Trouble? Ask your host."
removeRecent: "Remove {ticker}"
toasts: { updateReady: "Update ready", reload: "Reload", backOnline: "Back online", walkthroughHidden: "Walkthrough hidden", undo: "Undo" }
staleBody: "The last price update was {ago} ago. Wait a moment, or tap Reload."   # replaces "refresh the page" on phone
marketClosedFix: "Open Markets"           # COPY §9 ticket-errors.market_closed.fix on phone
offlineReason: "You're offline"           # disabled Preview/Place reason (same words as COPY §12 errors.offline.title)
newsFlavor: "Dispatches from the Spanish Main"
viewTicker: "View {ticker}"             # replaces COPY §4 news-extra.tradeLink on phone
standingsPlace: "You're {ordinal} of {n}"
standingsBehind: "{gap} behind {crew}"
standingsLead: "You're in the lead by {gap}"
done: "Done"
discard: { title: "Discard this order?", confirm: "Discard order", keep: "Keep editing" }
signOut: { row: "Sign out", title: "Sign out of {crew}?", confirm: "Sign out" }
welcome:
  title: "Welcome aboard, {crew}"
  rows:
    - "You start with {startingCash} in cash."
    - "Prices update every {tickSeconds} seconds for the whole game."
    - "Healthier companies tend to do better over time, but news and luck matter."
  start: "Start the walkthrough"
  skip: "Skip for now"
homeScreen:
  row: "Add to Home Screen"
  tipIos: "Tap Share, then Add to Home Screen. You'll sign in once more there."   # iOS Home Screen apps don't share Safari's storage
  tipAndroid: "Open the browser menu, then tap Install app."
  tipChromebook: "Select the install icon at the right end of the address bar."
solidBars: { row: "Solid bars", footer: "Turns off see-through bars. Use it if text on the bars is hard to read." }
textSize:
  row: "Text size"
  footerIos: "The app follows your iPhone's Text Size in Settings › Display & Brightness."
  footerOther: "Use your browser's zoom to make text bigger. On a Chromebook, press Ctrl and +.
walkthroughMobile:                        # phone variants of COPY §5 steps
  research: { body: "Open Markets, pick a company, and compare its profit, sales growth and debt with its sector average.", action: "Open Markets", route: "/markets" }
  order: { body: "On a company page, tap Buy, enter a few shares, preview the cost and fee, then place the order.", action: "Pick a company", route: "/markets" }
  track: { title: "Track it on Portfolio", body: "Portfolio shows your account value, your cash and how each holding has changed since you bought it.", action: "Open Portfolio", route: "/portfolio" }
emptyPositionsAction: "Open Markets"      # COPY §12 empty.positions.action on phone
watchlistEmptyBody: "Tap the star on a company page to follow it here."
```
Also update COPY §6 `where` strings for phone paths ("Markets › All companies › Basics", "Company page › Financials").

### 7.1 Sign in (full screen, hull, both appearances) — `/login`

| # | Section | Content | Copy / data |
|---|---|---|---|
| 1 | Hull ground | `#111412` + sea-glass radial glow top right; faint original compass-rose line art (8% gold) behind the lockup | — |
| 2 | Lockup (y 107–243) | 56px compass rose in `#B8954A`; "Buccaneer" / "Exchange" Cinzel Decorative 36px `#DDBE72`, centred, two lines; 1px gold rule 64px | Wordmark |
| 3 | Flavor | Subhead `#9FB0A8` centred | COPY-TBD `mobile.signInFlavor` "Trade the Spanish Main" |
| 4 | Card (y 275–379) | Inset grouped (dark tokens) with a 1px `--control-off` edge (the `#1A1F1C` card is 1.11:1 on the hull without it; 4.24:1 with it): row "Crew name" field (52px, visible label, `autocomplete=username`, `autocapitalize=none`); row "Password" (52px, visible label, `current-password`, `Eye`/`EyeOff` 44px toggle with `aria-pressed` and label "Show password") | `mobile.signInFields` |
| 5 | Helper (y 387–405) | Footnote `#9FB0A8` | COPY §12 `signIn.help` |
| 6 | Button (y 421–471) | Large Prominent "Sign in" (dark: `#DDBE72` bg, `#111412` label); loading "Signing in…" | `mobile.signInButton` |
| 7 | Error (replaces helper) | `TriangleAlert` 17px + Subhead message, both `#E4E8E2`, in a `role="alert"` region; both fields get `aria-invalid="true"` + `aria-describedby` the message, and a 1px `#EE9A89` inner border (boundary hint; the text carries the meaning). Focus returns to Crew name | COPY §12 `signIn.error` |
| 7b | Trading off (after sign-in) | Same slot as the error, `Lock` icon | COPY §12 `signIn.disabled` |
| 8 | Footer (bottom, above safe area) | Footnote `#8A9A93` (outside the top-right glow, where it would drop to 4.82:1) | COPY §12 `signIn.footer` |

Top-aligned so the keyboard (~336px) never covers the button on 852 or on SE 667 (lockup shrinks to 28px, compass hidden).
After first sign-in in a browser tab (not standalone): one-time Add to Home Screen tip toast with the platform's
wording (`COPY-TBD mobile.homeScreen.tipIos` / `tipAndroid` / `tipChromebook`; only iOS warns about signing in again).
The hull screen sets `html { background:#111412 }` while mounted so Safari 26's bar tint matches (§9.2).

### 7.2 Welcome sheet + walkthrough card (first sign-in) — `/portfolio?sheet=welcome`

- **Welcome sheet (large):** crest 64 "SW" · Title 1 bold "Welcome aboard, Saltwind Traders" · three rows
  (28px `--tint` icons `Briefcase`, `Clock`, `Compass` + Body): "You start with Ð1,000,000.00 in cash." /
  "Prices update every 30 seconds for the whole game." / "Healthier companies tend to do better over time,
  but news and luck matter." → Large Prominent "Start the walkthrough" → Plain "Skip for now" (COPY-TBD `mobile.welcome`).
- **Walkthrough card** (top of Portfolio content, y 182–358, `--cell`, `--r-card`): TagPill "Getting started" ·
  Title 3 "Your first trade in 3 steps" · "Step 1 of 3" (Footnote) · step title Headline + body Subhead ·
  3 step dots (8px, `--tint` current, `aria-hidden`; "Step 1 of 3" carries the meaning) · buttons: Tinted "Open Markets", Plain "Back"/"Next" · Plain
  "Got it, hide this" · link "Open the Learn guide" (COPY §5 + `mobile.walkthroughMobile`).
- Each step's action opens the real screen and shows one inline tip card beside the control it describes
  (Markets Basics header; company Buy button; Portfolio positions). One tip per session at most.

### 7.3 Portfolio (tab root) — `/portfolio`

Frame 393×1540 (full scroll; was 1480 before the review fixed the chart card height). Trailing bar buttons: Trade
(`ArrowLeftRight` glass circle, `aria-label="Trade"`, x 281–325) and avatar (x 333–377).

| # | y | Section | Content and data | Copy |
|---|---|---|---|---|
| 1 | 107–170 | Large title + status line | "Portfolio" · "● Market open · 37:17:42 left · Session 2 of 8" | `mobile.tabs.portfolio`, `mobile.statusLine` |
| 2 | 182–311 | Summary (on page, no card) | "Account value" + ? · **Ð1,084,219.55** (Large Title bold) · "▲ +Ð8,510.00 (+0.79%) this session" + ? (`sessionChange`) · "▲ +Ð84,219.55 (+8.42%) since the game began" + ? (`totalGain`) (Subhead semibold gain) · "vs Pirate Composite +3.56 points" + ? (`index`) (Footnote `--label-3`) | COPY §1.3 `portfolio.accountValue.short`, `mobile.thisSession`, `mobile.sinceStart`, `mobile.vsComposite` |
| 3 | 327–627 | Chart card (300px: 16 pad + 20 summary + 8 + 180 plot + 4 + 16 x labels + 8 + 32 segmented + 16 pad) | Summary "Up 8.42% since the game began" (one line; the long form is already in section 2) · 180px plot, dashed Ð1,000,000.00 baseline labelled "Starting cash", dashed Composite line labelled "Pirate Composite" (labels, not colour, tell the lines apart) · x labels · `1H 6H 24H All` (All selected) | `mobile.chartSummaryTotal` |
| 4 | 643–731 | Two tiles (176.5×88 each, `--r-card`, padding 12 16) | "Cash available" ? · Ð248,349.55 · "22.9% of account" │ "Rank" · "3 of 14" · "Standings" + chevron (tile is a link; the cash tile is not, so its "?" is not nested) | COPY §1.4 `ticket.cashAvailable.short` ("Cash available to trade" wraps to 2 lines in a 144px tile), §1.3 `portfolio.rank` |
| 5 | 747–1137 | Positions (prominent header + "See all 7") | "Show: Total gain ▾" menu chip + ? for the metric currently shown, right of header; 5 HoldingRows: KRKN Ð252,360.00 ▲ +Ð31,860.00 (+14.45%) · PRYL Ð169,920.00 ▲ +Ð22,720.00 (+15.43%) · ASTR Ð146,550.00 ▲ +Ð9,550.00 (+6.97%) · MRED Ð128,600.00 ▲ +Ð12,600.00 (+10.86%) · CJST Ð61,770.00 ▲ +Ð3,270.00 (+5.59%) | `mobile.seeAllCount`, `mobile.show` |
| 6 | 1153–1375 | Recent activity (header + "See all") | 3 ActivityRows (*illustrative, consistent with BRIEF avg costs*): "Bought 1,000 CRSD" −Ð38,038.00 Filled · "Bought 2,500 SALT" −Ð44,544.50 Filled · "Buy 300 CNBR" "Not placed · Price moved" | COPY §1.3 `activity.*`, §9 `ticket-errors.price_moved.title` |
| 7 | 1391–1409 | Footer | "Prices update every 30 seconds · as of 14:02:30" (Footnote centred) | `mobile.pricesFooter` |
| — | 768–830 | Tab bar | Portfolio selected | |

States: loading = skeletons of rows 2–6 · empty holdings = EmptyState in section 5 (COPY §12 `empty.positions`,
action "Open Markets") · paused = Paused banner at y 182 pushes content down · walkthrough card first sessions (§7.2).
At 852 the fold shows the value, the chart, both tiles and the top of the Positions header above the tab bar.

### 7.4 Positions — `/portfolio/positions`

| # | Section | Content |
|---|---|---|
| 1 | Top bar + large title | Back (to Portfolio) · large title "Positions" (collapses like a tab root, no status line) · trailing `ArrowUpDown` sort menu (Value, Total gain %, Session change, Name) and a `CircleQuestionMark` bar button → "What these numbers mean" sheet (`?sheet=help&set=positions`: Current value, Total gain/loss, Shares owned, Average price paid, Change this session) |
| 2 | Summary strip (card, 3 columns) | Invested Ð835,870.00 · Unrealized ▲ +Ð74,170.00 · Session ▲ +Ð8,510.00 (COPY §1.3 short labels + ?) |
| 3 | Allocation card (header "Where your money is" + ? for `pctOfAccount`) | AllocationBar 12px with 2px `--cell` gaps between segments (KRKN and SALT share the Shipping fill, so gaps and the in-order legend, not colour, separate them): KRKN 23.3% · PRYL 15.7% · ASTR 13.5% · MRED 11.9% · CJST 5.7% · SALT 4.2% · CRSD 2.9% · Cash 22.9% (rounded; legend in two columns, sector crest colours, cash = `--fill`) |
| 4 | Positions card | 7 PositionRows (88px) in value order; CRSD shows ▼ −Ð6,930.00 (−18.24%) and session ▼ −Ð1,110.00 in `--loss`. Swipe: Sell/Buy; long-press menu; tap → company |
| 5 | Footer | "Swipe a row for Buy and Sell, or open the company." (`mobile.swipeHint`) |

Frame 393×1180 (light).

### 7.5 Activity, Order detail, Balances — `/portfolio/activity`, `/:orderId`, `/balances`

**Activity** (frame 393×1060; state *after* the BRIEF §7 500 KRKN fill): large title "Activity" · trailing `ListFilter`
(All, Buys, Sells, Needs attention) · section "Session 2" (plain header): ActivityRows "Bought 500 KRKN" · "Tick 1,284 ·
14:02:30" · −Ð42,102.06 · Filled (BRIEF §7 fill); then *illustrative* history rows · section "Session 1" · last group: DisclosureRow
"Balances" → Balances. Not-placed rows use `TriangleAlert` in `--label` (never loss red) and status "Not placed".

**Order detail** (frame 393×1000): title "Order" · header card: CirclePlus 44 · "Bought 500 KRKN" Title 2 ·
"Filled" TagPill · KeyValue card (COPY §1.3 `activity.*` display labels; "?" on every row whose COPY row has a
glossary id): Time of trade 14:02:30 · Price update number (tick) 1,284 ? · Order number `BX-7Q2F9K` (mono) ·
Action Buy ? · Shares 500 · Fill price Ð84.12 ? · Order value Ð42,060.00 · Fee (0.10%) Ð42.06 ? · Cash in or out
−Ð42,102.06 · Price nudge "under 0.01%" ? · Cash after Ð206,247.49 ? · Footnote "Same as the preview estimate"
(COPY §9 `lines.filledVsPreviewSame`) · Plain "View KRKN" button. (BRIEF §7: the 500 KRKN order fills at Ð84.12 on
tick 1,284; the earlier Ð84.15 / tick 1,285 draft contradicted it. Orders fill immediately, so there is no
separate "placed" timeline.)

**Balances** (pushed, 393×852): KeyValue card with ? on each: Cash Ð248,349.55 · Invested Ð835,870.00 · Unrealized
▲ +Ð74,170.00 · Realized ▲ +Ð10,049.55 · Fees paid Ð1,240.33 · Trades 23 (COPY §1.3 `portfolio.*` display labels);
footer "Account value Ð1,084,219.55 = cash + invested."

### 7.6 Markets (tab root) — `/markets`

Frame 393×1880 (full scroll; 25 × 76px rows cannot fit, so the artboard draws the first 6 CompanyMetricsRows and a
Caption "+ 19 more companies" row before the footer), plus a scrolled 393×852 state.

| # | Section | Content and data | Copy |
|---|---|---|---|
| 1 | Title + status | "Markets" · status line | `mobile.tabs.markets` |
| 2 | Search (inline, pins into the bar when collapsed) | "Search 25 companies" | `mobile.searchCompanies` |
| 3 | Composite card (`--r-card`, 148px: 16 + 18 + 22 + 34 + 20 + 20 + 16; the earlier 104px could not hold five lines) | "Whole-market index" Footnote + ? · "Pirate Composite" Headline · **1,048.62** Title 1 bold tabular · "▲ +8.71 (+0.84%) this session" · "▲ +4.86% since the game began" · 96×32 sparkline trailing | COPY §1.5 `market.composite`, `mobile.sinceStart` |
| 4 | Breadth line | "14 rising · 11 falling · 0 unchanged" (Footnote, with ?) | COPY §1.5 `market.breadth` (values from Markets.dc.html) |
| 5 | Sectors (header "Industry groups" + ? for `index` sector index; horizontal scroll, 36px `--cell` chips with 0.5px `--separator` edge, 16px leading inset, snap; the scroller is a `<ul>` with visible chips reachable by Tab and VoiceOver swipe) | Values from `canvas/Markets.dc.html`: Parrot & Livestock ▲ +3.05% · Naval Arms ▲ +2.05% · Shipping & Salvage ▲ +1.21% · Maps & Instruments ▲ +0.59% · Treasure Banking ▲ +0.33% · Cartography & Navigation ▼ −0.08% · Provisions ▼ −0.42% · Letters of Marque ▼ −0.63% · Tortuga Hospitality ▼ −1.55% · Cursed Relics ▼ −3.46% → Sector list | COPY §1.5 `market.sectorIndex` |
| 6 | Biggest moves (prominent header) | Two stacked cards (side-by-side is too narrow for StockRows): "Up" card 3 StockRows CNBR Ð102.66 +6.12% · LVTH Ð57.03 +4.48% · PRRT Ð22.30 +3.05%; "Down" card CRSD Ð31.07 −3.46% · MLSM Ð158.20 −2.44% · TRTG Ð27.55 −2.10% | `mobile.biggestMoves`, `mobile.up/down` |
| 7 | Watchlist (only if non-empty) | StockRows; empty = one row with COPY `mobile.watchlistEmptyBody` | COPY §12 `empty.watchlist.title` |
| 8 | All companies (`#companies`) | Sticky SegmentedControl `Basics \| Price \| Value \| Health \| Analysts` (48px row) + sticky 2-line column header (36px: "Company size · Sales growth · Profit margin · Price vs. profit · Debt vs. equity", Caption 2 semibold, right-aligned, one 28px "?" with 44px hit area → "What these columns mean" sheet for the current view, `?sheet=help&set=markets-basics`), both on opaque `--bg-grouped` with a 0.5px separator (sticky headers over scrolling rows are never translucent) + sort/filter menu button; 25 CompanyMetricsRows. KRKN: Ð84.12 ▲ +2.31% / Ð20.36B · 7.2% · 14.0% · 17.8 · 0.62. At large text the segmented control becomes "View: Basics ▾" (§3.5) | COPY §1.2 `fundamentals.*.short`, `mobile.columnsHelp`, COPY §3.2 `research.helper` as section footer, COPY §3.2 `research.views[*].help` as the one-line caption under the view control |
| 9 | Footer | "Prices update every 30 seconds · as of 14:02:30" | `mobile.pricesFooter` |

Scrolled state (393×852): collapsed bar holds the search capsule + avatar (59–103); sticky segmented 103–151;
column header 151–187; rows below. Search focused state (`iPhoneSearch`): Cancel visible, "Recent" (KRKN, CNBR,
PRRT); typing "kra" matches ticker or name prefixes and shows one result, KRKN Kraken Shipping Lines.
Fundamentals for companies other than KRKN are not in BRIEF; artboards use `—` for them except KRKN.
**Open data conflict:** BRIEF §7 lists KRKN P/E 17.9 and EPS Ð4.71 (= Ð1.14B profit ÷ 242.0M shares), while COPY
§0.6/§3.1/§6 use P/E 17.8 and EPS Ð4.73 and claim BRIEF agrees. This file follows COPY (17.8, Ð4.73) everywhere;
BRIEF and COPY must be reconciled before artboards are drawn.

### 7.7 Company page (shared) — `/markets/company/KRKN`

Frame 393×2440 (full scroll). Top bar: Back (x 16–60) · one trailing glass capsule (x 281–377) holding Star (281–325,
`aria-label="Add KRKN to watchlist"`, `aria-pressed`) and More `Ellipsis` (333–377, `aria-label="More options"`).

| # | y | Section | Content and data | Copy |
|---|---|---|---|---|
| 1 | 111–252 | StockHeader | Crest "KR" 44 (Shipping `#2F6F68`) · "Kraken Shipping Lines" · "KRKN · Shipping & Salvage" · **Ð84.12** · "▲ +Ð1.90 (+2.31%) this session" ? · "As of tick 1,284 · 14:02:30" ? | COPY §1.1 `company.*`, §9 `lines.priceAsOf` |
| 2 | 264–604 | Chart card | "Up 2.31% this session. Range Ð81.90 to Ð84.60." · 220px plot with dashed session-open Ð82.22 labelled "Session open" · `1H 6H 24H All` | `mobile.chartSummarySession` |
| 3 | 620–868 | Your position | §5.15 grid (each label + ?) + footer "Cash available to trade: Ð248,349.55" ? | COPY §1.3 `position.*`, `portfolio.cashAvailable` |
| 4 | 884–1496 | Key stats: Basics (header + "See all stats") | ExplainRows (COPY §3.1 examples, sector averages from COPY `example-company`): Company size Ð20.36B "All of its shares together are worth Ð20.36B at the current price." Sector average: Ð9.84B · Sales growth 7.2% "Sales grew about 7% a year over the last 3 years." Sector average: 4.9% · Profit margin 14.0% "It keeps Ð14 of profit from every Ð100 of sales." Sector average: 10.0% · Price vs. profit 17.8 "You pay Ð17.80 for every Ð1 of yearly profit." Sector average: 22.1 · Debt vs. equity 0.62 "It has Ð0.62 of debt for every Ð1 of owner equity (what it owns minus what it owes)." Sector average: 0.95 · RangeBar row "Session range Ð81.90 – Ð84.60" ? | COPY §3.1, §3.2 `averageLine.sector` |
| 5 | 1512–1676 | Financials preview | "Sales grew from Ð6.61B in 2022 to Ð8.14B in 2025. Profit grew too, from Ð0.94B to Ð1.14B." · 4-bar mini chart 64px (sales bars, profit ticks) · DisclosureRow "See financials" | COPY §3.2 `statementSummaries.example` |
| 6 | 1692–1836 | Analyst view (header + ? for `analystRating`; "price target" + ? for `priceTarget`) | "Analyst view: Buy. Their price target of Ð96.00 is 14.1% above the current price." · caution Footnote (always visible, not behind a tap) | COPY §3.2 `analystCard` |
| 7 | 1852–1976 | News about KRKN | Macro dispatch row "Crown lifts tariffs across the Spanish Main" · Whole market · 12:48 (BRIEF has no KRKN-specific dispatch) · "See all news" | COPY §4 |
| 8 | 1992–2126 | About | 3 lines from company description data; "Read a company in 5 questions" DisclosureRow → Learn | COPY §3.2 `research.fiveQuestionsPanel` |
| 9 | 2142–2256 | Your KRKN activity | Latest KRKN order rows or "No KRKN orders yet" | COPY §12 `empty.orders` |
| — | 698–748 | Floating actions | Owned: Tinted Sell (x 16–192) + Buy (x 201–377), both large capsules, shadow `--float-shadow`, 20px `--bg-grouped` edge fade behind. Not owned: one Buy full width. Paused, lobby or trading turned off: both open the ticket in preview-only mode (COPY §9 `banners`). Ended: replaced by one Prominent "See final results" | COPY §9 `buttons.buy/sell` |
| — | 768–830 | Tab bar | Markets selected | |

Dark scrub artboard (393×852): dark tokens, finger at 14:01:30, header shows "Ð84.06 · 14:01:30 · tick 1,282"
(*illustrative scrub value*), vertical rule on the plot.

**All stats** (pushed, 393×1100): KeyValueRows with ? : Past-year range Ð58.40 – Ð91.20 · Volume 184,200 ·
Shares 242.0M · Float 201.3M · Price vs. future profit 15.9 · Profit per share Ð4.73 · Dividend yield 1.9% ·
Payout 34% · Swings vs. market 1.12 (*illustrative*, COPY example-company).

### 7.8 Financials — `/markets/company/KRKN/financials`

Frame 393×1760. Large title "Financials", subtitle "KRKN · Kraken Shipping Lines".

1. Summary sentence (Subhead): COPY §3.2 `statementSummaries.example`.
2. Bar chart card (200px): sales FY22–FY25 Ð6.61B, Ð7.18B, Ð7.74B, Ð8.14B with profit Ð0.94B, Ð1.03B, Ð1.09B,
   Ð1.14B overlaid; tap a bar shows both values; x labels 2022–2025.
3. "Read a company in 5 questions" groups (prominent headers = COPY §6 `question`; tip as footer). Every metric
   below is a full ExplainRow (label + ?, value, everyday sentence, "Sector average: …"); "avg" is shorthand in
   this blueprint only and never appears on screen:
   - Is it making money? — Profit margin 14.0% (avg 10.0%) · Return on equity 18.2% "It earned Ð18.20 of profit for every Ð100 of owner equity." (avg 11.6%) · Free cash flow Ð0.96B (avg Ð0.38B)
   - Is it growing? — Sales growth 7.2% (avg 4.9%)
   - Can it handle its debts? — Debt vs. equity 0.62 (avg 0.95) · Bill coverage 1.84 "It has Ð1.84 of short-term money for every Ð1 of bills due within a year." (avg 1.35)
   - Is the price reasonable for its profits? — Price vs. profit 17.8 (avg 22.1) · Price vs. core profit 10.0 (avg 16.4)
   - What is the news saying? — DisclosureRow "News about KRKN"
4. Statements: segmented `Income | Balance | Cash flow`; horizontally scrolling table in its own
   `overflow-x:auto` card: sticky first column 132px (metric names = COPY §1.2 `short`, Footnote; each name is a
   44px-tall `<button>` with a trailing 17px "?" glyph that opens that term's InfoTip sheet, so every statement
   line has an explanation on touch), year columns 88px headed "2022"…"2025" (never "FY2025", COPY §1.2 rendering
   note; Footnote tabular, right-aligned), latest year column `--label` semibold. Real `<table>` with
   `<th scope="row|col">`; the scroller has `tabindex="0"`, `role="region"` and `aria-label="Income statement, scrolls
   sideways"` so Chromebook keyboard users can scroll it; a right-edge fade shows there is more. Values from
   `ResearchReport.dc.html` / COPY example-company.

### 7.9 Market status sheet (medium) — `?sheet=status`

Title "Market open" + flavor "Sails up" (COPY §12 `phases.live`) · **37:17:42 left** Large Title tabular ·
"Session 2 of 8 · ends in 1:17:42" · 8-segment session bar (segment 2 current, `--accent-dot`) ·
"Tick 1,284 of 5,760 · 22.3% · as of 14:02:30" (COPY §1.5 `header.tickStamp`) · body COPY §12 `phases.live.body`
("Prices update every 30 seconds.") · DisclosureRow "How the game works" → Learn guide. "Session" and "Tick" each
have an inline-expand "?" (inside a sheet, §5.9). Opaque `--elevated` surface. Dark artboard.

### 7.10 Trade sheet — `?sheet=trade&ticker=KRKN&side=buy`

**Entry (393×852, light, over the dimmed company page):**

| y | Element | Content |
|---|---|---|
| 69 | Sheet top | Large, `--elevated`, radius 24 |
| 75–119 | Header | X (fill circle) · "Buy KRKN" Headline centred |
| 127–167 | Quote row | Crest 32 · "Ð84.12" Headline + "▲ +2.31% this session" Footnote gain │ right: "Cash available" Footnote `--label-2` + inline-expand ? / "Ð248,349.55" Subhead semibold (COPY §1.4 `ticket.cashAvailable.short`) |
| 179–215 | Buy \| Sell | 36px segmented (Buy selected) |
| 223–255 | Shares \| Doubloons | 32px segmented, 220px wide, centred (COPY §9 `buttons.shares/amount`) |
| 271–327 | Amount | Minus circle · **500** (`--t-amount`) · Plus circle |
| 327–347 | Helper | "≈ Ð42,102.06 with fee" (Subhead `--label-2`) |
| 359–395 | Chips | 10 · 50 · 100 · Max |
| 407–501 | Summary box (`--elevated-cell`, `--r-inner`) | "Total cost" Ð42,102.06 · "Cash after" Ð206,247.49 · Footnote "This order would make KRKN 27.2% of your account." + inline-expand ? that shows COPY §9 `explain.positionLimit` (COPY §1.4 shorts, §9 `lines.shareOfAccount`) |
| 513–717 | Keypad | 4×3, 48px keys |
| 729–779 | Button | Large Prominent "Preview order" (COPY §9 `buttons.preview`) |

Doubloons mode (dark artboard): amount "Ð5,000.00" with "." key; helper "≈ 59 shares · Ð31.96 stays as cash"
(COPY §9 `lines.amountModeBuy`); Total cost Ð4,968.04 (value Ð4,963.08 + fee Ð4.96); Cash after Ð243,381.51.

**Inline problems** (Preview disabled; problem box replaces the summary box; `TriangleAlert` 20px `--label`;
title Subhead semibold; message Subhead; Tinted small fix button):
- Not enough cash (amount 4,000, total Ð336,816.48): COPY §9 `ticket-errors.insufficient_funds` example + fix "Use max (2,949 shares)".
- Position limit (host limit 25%, 500 shares): `position_limit` example + fix "Use 222".
- Paused: Paused banner at top of the sheet (COPY §9 `banners.paused`); Preview still works, Place disabled with the
  banner as its visible reason (`aria-describedby`). Offline: same pattern with `mobile.offlineReason`.
- The problem box is a polite live region (announced after 500ms idle); the fix button is the next Tab stop after the steppers.

**Preview (393×852):** header Back · "Preview order" · recap Body 2 lines "Buy 500 shares of KRKN (Kraken Shipping Lines)
at about the current price." (COPY §9 `lines.previewRecapBuy`; the earlier "at market" was unexplained jargon) ·
KeyValue card (9 rows, each with inline-expand ?). BRIEF §9.8 requires the ticket to explain itself, so four rows
carry an **always-visible** Footnote `--label-2` sub-line instead of hiding it behind the "?": Est. price Ð84.12
("Buys right away at about the current price.", `explain.marketOrderBuy`) · Price impact "under 0.01%"
("This order is small for KRKN, so the nudge is under 0.01%.", `explain.priceImpactTiny`) · Order value Ð42,060.00 ·
Fee (0.10%) Ð42.06 ("0.10% charged on every trade.", `explain.fee`) · **Total cost Ð42,102.06** (semibold) · Cash after
Ð206,247.49 · Shares after 3,500 · % after 27.2% ("A buy can't put more than 50% of your account into one company.",
`explain.positionLimit`) · Avg. price after Ð75.02 · notes Footnote: "Priced at tick 1,284 · 14:02:30" +
`lines.estimatedNote`. The body scrolls (≈470px card); a pinned footer holds Large **Buy**-style "Place order"
(y 713–763) and Plain "Edit order" (767–811), so at 852 the last rows and notes sit just under the footer's top edge. If a new tick arrives: values update in place with
"Updated for tick 1,285" (Footnote `--accent`); a move >2% sends the student back to Entry with the
`price_moved` message.

**Placing:** button shows spinner + "Placing order…" (`aria-busy`, focus stays on it); header Back hidden; swipe-dismiss
and system Back disabled (§5.8); one indicator only.

**Filled (393×852):** WaxSeal 64 (y 135–199) · "Order filled" Title 1 (receives focus) · "Bought 500 KRKN at Ð84.12" Title 3 ·
KeyValue card (BRIEF §7 fill): Order value Ð42,060.00 · Fee Ð42.06 · Total cost Ð42,102.06 · Cash after Ð206,247.49 ·
Footnote "Same as the preview estimate" (COPY §9 `lines.filledVsPreviewSame`) · "Order # BX-7Q2F9K · tick 1,284" (mono) ·
flavor "Fair winds." (COPY §9 `lines.filledFlavor`) · Gray medium (34px, 44px hit) "View activity" + "Trade again" side by side (y 664–698) ·
Large Prominent "Done" (713–763). Announced politely: COPY §9 `lines.filledBuy` filled in.

**Needs attention (dark, 393×852):** header Back · 72px `--fill` circle with `TriangleAlert` 36px `--label` ·
"Price moved" Title 2 · message Body: COPY §9 `price_moved.example` · Large Prominent "Review updated order" ·
Gray "Close". Other codes use the same layout with their COPY title/message/fix (`network` fix "Place order again";
`market_closed` fix becomes "Open Markets", `mobile.marketClosedFix`, because Research lives in Markets on the phone).
Logged in Activity as "Not placed".

**Discard (light):** swipe down or X after typing → action sheet "Discard this order?" · [Discard order] (destructive) ·
[Keep editing] (Cancel) (`mobile.discard`).

**Choose a company (from Portfolio Trade button):** header X · "Trade" · SearchField "Search 25 companies" ·
"Your holdings" (7 StockRows) · "All companies" A–Z · tapping a row pushes Entry inside the sheet (header Back).
This is the one sheet with a text field: its results list is sized with `--kb` on iOS and `dvh` on Chrome (§9.4)
so the keyboard never hides the first results.

**SE 375×667:** sheet top 30; keys 44px; quote row 36px; summary box shows Total cost + share-of-account only;
helper merges into the chips row; everything fits without scrolling at the default text size (larger sizes scroll, §3.5).

### 7.11 News (tab root) — `/news`

Frame 393×1500. Title "News" + status line · Footnote flavor "Dispatches from the Spanish Main"
(`mobile.newsFlavor`) · SegmentedControl `All | My holdings | Watchlist` (COPY §4 `news-extra.filters`) · cards:

| Card | Line 1 (TagPill + time) | Headline (Headline, ≤3 lines) | What this means (Footnote semibold label + Subhead) | Chips |
|---|---|---|---|---|
| 1 | `Earnings` · 14:01 | Cannonbright Foundries posts blowout quarterly doubloons | COPY §4 earnings.bullish | "CNBR ▲ +6.12% since the news" |
| 2 | `Storm` · 13:36 · "You own this" | Cursed Doubloon Relics loses two ships to a gale off Nassau | storm.bearish | "CRSD ▼ −3.46% since the news" |
| 3 | `Whole market` · 12:48 | Crown lifts tariffs across the Spanish Main | macro.bullish | "11 companies · Composite ▲ +0.61%" |
| 4 | `Merger` · 11:20 | Leviathan Logistics agrees to buy a rival fleet at a premium | merger.bullish | "LVTH ▲ +4.48% since the news" |
| 5 | `Rules` · 10:05 | Maelstrom Maritime Insurance fined for mispriced policies | regulatory.bearish | "MLSM ▼ −2.44% since the news" |

Cards: `--cell`, `--r-card`, padding 16, 12px gaps; the headline is the link to the dispatch and a stretched `::after`
makes the whole card tappable; chips are sibling links raised above it (never a link inside a link, §4.4) and open
the company. Chip change text is `--gain`/`--loss` on `--fill` over `--cell` (4.68/5.05:1 light).
Type TagPills carry an icon + text (not colour). Sentiment shown as text "Good news" / "Bad news" (COPY §4 `sentiment.short`).
Empty: COPY §12 `empty.news` / `newsFiltered`. Badge rule: §5.1.

**Dispatch detail (dark, 393×1100):** Back · TagPill + "14:01 · tick 1,282" (*illustrative tick*) · Title 2 headline ·
body Body · "What this means" card · per-company card: crest, name, 160px mini chart from price at the news to now,
"▲ +6.12% since the news" + ? (COPY §4 `news-extra.sinceReportHelp`), Plain "View CNBR" (`mobile.viewTicker`). No Buy
button. Macro dispatches add "Composite" + ? (`index`) on their "11 companies · Composite ▲ +0.61%" line.

### 7.12 Standings (tab root) — `/standings`

Frame 393×1220. Title "Standings" + status line.

1. Header card: crest "SW" 44 · "You're 3rd of 14" Title 2 · "Ð13,480.45 behind Tortuga Capital" Subhead `--label-2` (`mobile.standings*`).
2. SegmentedControl `Total return | This session`.
3. List (StandingRows): 1 Queen Anne's Revenue Ð1,120,804.10 +12.08% · 2 Tortuga Capital Ð1,097,700.00 +9.77% ·
   **3 Saltwind Traders "You" Ð1,084,219.55 +8.42%** (row `--tint-soft`) · 4 The Salty Ledger Ð1,051,002.33 +5.10% ·
   5 Doubloon Dynasty Ð986,600.00 −1.34% · 6 Kraken Kapital Ð979,410.75 −2.06% · 7 Compass & Coin Ð961,120.40 −3.89%
   · footer "14 crews · Ranked by account value." with ? for `totalGain` (`mobile.standingsFooter`; rows 8–14 not in
   BRIEF). Movement arrows *illustrative* (▲1 Tortuga, ▼1 Saltwind, others —), `--label-2`, never gain/loss colour.
4. This session view re-sorts: Tortuga +1.40% · Queen Anne's +0.94% · Saltwind +0.79% · Kraken Kapital +0.33% ·
   Salty Ledger −0.20% · Doubloon Dynasty −0.85% · Compass & Coin −1.02%.
5. Pinned "You" row: when your row scrolls off, an opaque copy (`--cell` + `--float-shadow`, not glass, §2.4) pins at
   y 698–758 above the tab bar; it is `aria-hidden` because the real row stays in the list for VoiceOver.
6. After end: hull banner "Game ended · Anchors dropped" + small Prominent "See final results".

Crew sheet (medium, 393×852): crest 64 · "Tortuga Capital" Title 2 · "Rank 2 of 14" · sparkline 329×64 · KeyValue:
Account value Ð1,097,700.00 · Total return ▲ +9.77% · This session ▲ +1.40% · % cash 31.4% (*illustrative*) ·
Holdings 6 (*illustrative*) (COPY §1.5 `standings.*`). Rows with a glossary id (Account value, Total return, This
session, % cash, Holdings) get inline-expand "?" (inside a sheet, §5.9). Opaque `--elevated`, content-height detent.

### 7.13 Final results (full screen, 5 pages) — `/standings/results`

Chrome: X (top leading, glass), page dots (centre, 8px, `aria-hidden`; a visually hidden "Page 2 of 5" is announced),
Back/Next buttons at the bottom (44px, gray/prominent); horizontal swipe also pages; reduced motion replaces slides
and the podium rise with fades.
**Paging is route-based, not a scroll-snap carousel:** each page is `?page=n` with normal document scroll. A
horizontal scroll-snap container would make every page an inner vertical scroller (pages are 852 to 1,900px tall,
so short pages would inherit the tallest page's height), break Safari's toolbar collapse and status-bar tap to top,
and fight the edge swipe-back. A horizontal swipe is detected with the §5.17 pointer logic (`touch-action: pan-y`,
|dx| > 40 and angle < 30°) and calls `navigate('?page=n±1', { replace: true, viewTransition: true })`; Back/Next do
the same, so the gesture always has a button alternative.
Data: `canvas/FinalReckoning.dc.html` with the crew renamed **Saltwind Traders**; copy COPY §10.

| Page | Appearance | Content |
|---|---|---|
| 1 Voyage complete | Hull | WaxSeal 120 · "Voyage complete" Cinzel 32px gold · Podium (drawn 2-1-3, but DOM and reading order 1-2-3): 1 Queen Anne's Revenue Ð1,187,420.66 +18.74% · 2 Tortuga Capital Ð1,142,905.30 +14.29% · 3 Saltwind Traders Ð1,104,630.18 +10.46% · "Your crew finished 3rd of 14" |
| 2 Your crew | Light | Final value, return, rank; "Your crew's research grade" + ? (`researchGrade`, COPY §10 `researchGrade.body` shown as visible text under the grade) B (health 71 + ? for the health score; market average 61; winner 82); holdings table (KRKN 29.8% 84 A · PRYL 20.6% 74 B · ASTR 17.9% 69 B · MRED 15.8% 58 C · CJST 6.9% 47 D · SALT 5.6% 52 C · CRSD 3.4% 81 A); COPY §10 `researchGrade.rankNote` |
| 3 Market reveal | Light, full scroll 393×1900 | COPY §10 intro · sort menu (Health score, Luck, Actual return) + a "?" → "What these numbers mean" sheet (`set=results-scorecard`: COPY §10 `table.help` for health score, grade, expected, actual, luck, plus the four `labels.*.meaning`) · 25 rows (artboard draws the first 12): crest, ticker, health score + grade TagPill, drivers line (COPY §10 pillars), "Expected +15.20% · Actual +19.60% · Luck +4.40 points" (never "pts"), result label (Compounder…); tap → content-height sheet with pillars |
| 4 Luck vs. research | Dark | COPY §10 `scatter` · 329×280 scatter (`role="img"` with an `aria-label` summary and a "View as list" link to page 3 sorted by Luck); your holdings as filled diamonds, others hollow circles (shape, not just colour); dashed "Typical return" line; callouts "Luckiest: LVTH", "Unluckiest: CRSD"; caption visible under the plot |
| 5 Final standings | Light | Full list of 14 (7 from FinalReckoning) + Large Prominent "Done" |

### 7.14 Learn (tab root), Glossary term, InfoTip sheet — `/learn`

**Learn (393×1560):** title "Learn" + status line · SearchField "Search 74 terms" (`mobile.searchTerms`, n from
COPY §2) · card of DisclosureRows with icon tiles: How to play (`Play`, reopens walkthrough) · How the game works
(`BookOpen`, COPY §7 title) · Read a company in 5 questions (`Compass`, COPY §6) · Trading basics (`ArrowLeftRight`,
COPY §8) · "Glossary" prominent header · letter sections (plain headers "A", "B"…) of 44px DisclosureRows showing
`label` with `term` as detail (e.g. "Price vs. profit" · "P/E ratio"); no side index (HIG: index + chevrons don't mix [A]).
74 terms × 44px is ≈3,300px, so the artboard draws sections A–C and a "…" row. Search with no match: COPY §12
`empty.glossarySearch`.

**Glossary term (dark, 393×852):** Back "Learn" · Title 1 "Price vs. profit" · Subhead "P/E ratio" · three
blocks (What it is / Why it matters / Usually a good sign when…) with COPY §2 `peRatio` text · card "See it on a
company": KRKN ExplainRow "Price vs. profit 17.8 · You pay Ð17.80 for every Ð1 of yearly profit. · Sector average: 22.1"
+ DisclosureRow "Open KRKN" (Learn stack, `?highlight=peRatio`) · "Related terms" chips (Price vs. future profit,
Profit per share, …).

**InfoTip sheet (light, 393×852, content height over the company page):** opaque `--elevated` · "Price vs. profit"
Title 2 · "P/E ratio" · three blocks, all visible without dragging · Tinted "Open in Learn" (`--tint-strong` label) · X.
No grabber at this content height (it appears only when the text is taller than medium).

### 7.15 Account sheet (large) — `?sheet=account`

Header: title "Account" · trailing Done. Content:
1. Crew header: crest "SW" 64 · "Saltwind Traders" Title 2 · "Rank 3 of 14 · Ð1,084,219.55" Subhead.
2. Group: How to play (DisclosureRow, reopens walkthrough) · Game rules (pushes inside the sheet: 48-hour game ·
   price updates every 30 seconds · fee 0.10% · position limit 50% · starting cash Ð1,000,000.00; COPY §7; fee,
   position limit and tick rows have inline-expand "?").
3. Group "Display" (plain header): Solid bars (ToggleRow + footer) · Text size (DisclosureRow → explanation; iOS vs.
   Android/Chromebook wording) (`mobile.solidBars`, `mobile.textSize`).
4. Group: Add to Home Screen (hidden in standalone mode; platform tip) · Reload app (standalone only: a Home Screen app
   has no reload button) · footer "Trouble? Ask your host." (`mobile.helpHost`).
5. Group: Sign out (ActionRow, destructive) → action sheet "Sign out of Saltwind Traders?" [Sign out] [Cancel].
6. Footer: wordmark 22px Cinzel `--tint` · COPY §12 `signIn.footer`.

No account deletion (crews are managed by the host).

### 7.16 Paused, loading, empty, offline states

- **Paused + loading (393×852, light):** Portfolio with Paused banner (COPY §9 `banners.paused`, "at tick 1,284"),
  status line "Trading paused · Clock stopped while paused" (`--tint` dot), skeleton chart and rows.
- **Empty (dark, 393×852):** Portfolio in lobby phase: Lobby banner (COPY §9 `banners.lobby`) + EmptyState positions
  (COPY §12 `empty.positions`, action "Open Markets").
- **Offline:** banner COPY §12 `errors.offline`; Preview/Place disabled with reason "You're offline"; data
  from cache marked "as of {time}". **Stale:** banner COPY §12 `errors.stale` title + `mobile.staleBody` with a
  Reload button (§5.12).

### 7.17 Host Control (host phone) — `/admin`

Dark, 393×1300. Host tab bar (§6.6).
1. Title "Control" + status "LIVE · Market open · Sails up".
2. Hero card: "37:17:42 left" Large Title · "Tick 1,284 of 5,760 · 22.3% complete" + 6px progress bar ·
   "Session 2 of 8" · health "Engine healthy · last tick 3s ago · 0 ticks behind" (Footnote, `--accent-dot`).
3. Large Prominent "Pause trading" (no confirm; becomes "Resume trading") · Large Destructive tinted "End game…"
   (§5.7) → alert with typed END ("Ending locks rankings and reveals scores. This can't be undone." [Cancel] [End game];
   End game stays disabled until the field reads END; the alert rises above the keyboard with `--kb`, §9.4).
4. Quick actions (DisclosureRows): Fire news… · Find a crew… · Trade tape · Audit.
5. Lobby state: settings summary rows (COPY §11) + "Start game"; Ended: "New game…" with keep-crews ToggleRow.

**Fire news sheet (light, large):** Cancel / "Fire news" / — (one publish action only, in the pinned footer) · company
tokens (KRKN, SALT) + "Add company" · impact type menu · direction/size segmented `−50% −25% 0 +25% +50%` + joined
Stepper for fine ±1% (sample set to +8%) · live preview "KRKN Ð84.12 → Ð90.85" · headline field with counter "54/90"
(`aria-describedby`, announced at 80 and 90) · pinned footer Large Prominent "Publish at tick 1,285" (COPY §11).

### 7.18 Host Crews, Market, News, Tape, Settings (host phone)

Spec §2/§8 host features that the phone tab bar (§6.6) must still reach; all dark, list-based, no new components.
- **Crews** (`/admin/crews`): SearchField "Search crews" · "Add crew" Prominent (large sheet: Crew name, Password with
  Show toggle, initials; starting cash shown read-only from settings) · one StandingRow-style row per crew (crest,
  name, value, "Trading off" TagPill when disabled) → **Crew detail** (pushed): KeyValue value/cash/trades · ToggleRow
  "Trading allowed" (`POST /admin/teams/:id/trading`) · ActionRow "Reset password…" (sheet with new password field) ·
  destructive ActionRow "Remove crew…" → action sheet "Remove {crew}? This deletes its login, holdings, history and
  trades." [Remove crew] [Cancel]. Empty: COPY §12 `empty.hostCrews`.
- **Market** (`/admin/market`): host-only list of 25 companies: last price, session %, volume, net crew flow, and the
  hidden quality score, grade, fair value and deviation from `GET /admin/market`. A "Host only: never project this
  screen" banner, because students must not see quality scores during play.
- **News** (`/admin/news`): segmented `Scheduled | Fired` from `GET /admin/news/scheduled` (tick, companies, type,
  headline) + "Fire news…" (sheet above). Empty: COPY §12 `empty.hostNews`.
- **Tape** (`/admin/tape`): live trade rows (tick, crew, Bought/Sold, qty, ticker, fill price, fee), newest first,
  filter menu by crew/ticker; no live-region announcements per trade.
- **Audit** (Control › More › Audit, `/admin/audit`): `GET /admin/logs` rows, plain list.
- **Settings** (Control › Lobby "Edit settings", lobby only; COPY §11): DisclosureRows that open pickers for Game
  length (1h…48h), Starting cash, Fee, Research edge (low/normal/high), Position limit (off/50%/35%/25%), Currency
  name and symbol; locked with COPY §11 `lockedNote` once the game starts. **New game…** (Ended): large sheet with
  ToggleRow "Keep crews" + typed confirm, `POST /admin/game/new`.

---

## 8. Motion and gestures

### 8.1 Tokens

Spring curves sampled from SwiftUI's documented springs (default: response 0.5, damping 1.0; snappy: bounce 0.15;
bouncy: bounce 0.3 [A SwiftUI Animation]) into CSS `linear()` (Safari 17.2+, Chrome 113+):

```css
--ease-spring: linear(0, 0.06, 0.186, 0.329, 0.466, 0.584, 0.682, 0.76, 0.821, 0.868, 0.903, 0.929, 0.949, 0.963, 0.973, 0.981, 1); /* 500ms */
--ease-snappy: linear(0, 0.062, 0.198, 0.356, 0.509, 0.642, 0.75, 0.833, 0.895, 0.938, 0.967, 0.985, 0.996, 1.003, 1.005, 1.006, 1); /* 400ms */
--ease-bouncy: linear(0, 0.059, 0.197, 0.366, 0.535, 0.685, 0.808, 0.902, 0.968, 1.01, 1.034, 1.044, 1.046, 1.041, 1.034, 1.027, 1.019, 1.012, 1.007, 1.003, 1); /* 600ms, ceremonies only */
--ease-fallback: cubic-bezier(.2, .8, .2, 1);
--dur-press: 100ms; --dur-fade: 150ms; --dur-flash: 300ms;
```
`@supports not (transition-timing-function: linear(0, 1))` → `--ease-fallback`.

### 8.2 Transitions

| Moment | Motion | Duration / easing | Reduced motion (`prefers-reduced-motion: reduce`) |
|---|---|---|---|
| Push / pop in a tab | New page slides from right (100% → 0), old moves −30% and dims | 500ms spring (View Transitions) | 150ms cross-fade |
| Tab switch | Instant (iOS behaviour) | 0 | 0 |
| Browser/Home Screen swipe-back | UA animation only; ours disabled when `hasUAVisualTransition` | — | — |
| Sheet present / dismiss | Slides up from bottom; detent snaps | 500ms spring / follows finger | 150ms fade; detents snap instantly |
| Menu / action sheet | Scale .9→1 + fade from the trigger | 400ms snappy | fade 150ms |
| Large title → inline title | Cross-fade + bar glass fades in | 150ms | title cross-fade kept; the bar's glass switches on instantly (HIG: don't animate blur) |
| Segmented thumb, tab platter | Slides | 400ms snappy | instant |
| Button press | Scale .97 | 100ms in / 250ms out | colour change only |
| Price tick | Value background flash fades out | 300ms linear | none |
| Ticket step change | Cross-slide 24px + fade | 250ms spring | fade 150ms |
| Order filled seal | Stamp: scale 1.15→1 + fade | 250ms snappy | fade 150ms |
| "Sails up" moment | Compass rotates 30°, title fades in, auto-dismiss | 1.2s total | skipped; banner only |
| Podium | Steps rise, stagger 80ms | 600ms bouncy | fade 150ms |
| Skeleton shimmer | Gradient sweep | 1.2s loop | static |
| Toast | Drops from below the top bar | 400ms snappy | fade |
| Final results page change | Slide ±24px + fade (View Transition) | 250ms spring | fade 150ms |
| InfoTip inline expand (in sheets) | Height grows | 200ms spring | instant |
| Scroll to top (tab re-tap), `#companies` jump | Smooth scroll | UA smooth | instant (`scroll-behavior: auto` under reduced motion) |
| Row swipe, sheet drag, chart scrub | Follows the finger | direct manipulation | unchanged (user-driven motion); release snaps instantly |

HIG Motion [A]: brief, purposeful, never the only signal, cancellable; under Reduce Motion replace x/y/z motion
with fades, tighten springs, don't animate blur.

### 8.3 Gestures

| Gesture | Where | Web implementation | Non-gesture alternative (WCAG 2.5.7 / 2.5.1) |
|---|---|---|---|
| Tap | Everything | `<button>`/`<a>`, `touch-action: manipulation` | — |
| Vertical scroll + rubber band | All screens | Document scroll (not an inner scroller) so Safari's toolbar minimizes and status-bar tap-to-top works | — |
| Swipe back (edge) | Pushed screens | UA gesture (Safari, and Home Screen apps, which cannot disable it); no custom edge swipe. If it fires while a ticket is dirty or placing, §5.8 re-pushes the sheet | Back button |
| Sheet drag / swipe down | Sheets | Base UI Drawer | Close button, Esc |
| Grabber tap | Resizable sheets | Button cycles detents | itself |
| Chart scrub | Chart plot | Pointer events, `touch-action: pan-y`, 6px horizontal threshold | Keyboard slider; summary text always visible |
| Row swipe | Positions | Custom (§5.17) | Long-press menu; company page buttons |
| Long-press (500ms, cancels if moved >10px) | Positions, Markets rows | Pointer timer; `-webkit-touch-callout: none` on rows; opens Menu anchored to the row | Company page buttons |
| Horizontal page swipe | Final results | Pointer swipe → `?page=` route change (§7.13); not a scroll-snap container | Back/Next buttons |
| Pinch zoom | Anywhere | Never disabled | — |
| Pull to refresh | None | Live data; `overscroll-behavior-y: contain` on body (verify iOS bounce remains) | Reload button on the stale/page-load banners and Account › Reload app (§5.12, §7.15) |
| Haptics | — | Not available on the web except the native switch; never relied on | Visual + text feedback |

---

## 9. PWA and web implementation

### 9.1 Library decision

**Verdict: custom plain-CSS components + headless behaviour from Base UI.** It keeps React 18, react-router, the
plain-CSS token system and Black Pearl, with built-in accessibility and the smallest risk.

| Need | Decision | Package | Why |
|---|---|---|---|
| Sheets / drawers | Adopt (headless) | `@base-ui/react@1.8.0` `/drawer` (MIT) | Snap points, swipe dismiss, focus trap, keyboard inset, React 17–19; monthly releases since 1.0 (Dec 2025) |
| Alert, dialog, menu, toast, popover | Adopt (headless) | `@base-ui/react` `/alert-dialog`, `/dialog`, `/menu`, `/toast`, `/popover` | Shared internals; ≈78 KB gzip for five parts; lazy-loaded |
| Tab bar, top bar, lists, rows, segmented, buttons, keypad, stepper, charts, swipe rows | Custom | — | No kit matches Black Pearl + React 18 |
| Switch | Native | `<input type="checkbox" switch>` | System switch, role, haptic on iOS 18+ |
| Icons | Keep | `lucide-react@1.46.0` (ISC) | Original open-source glyphs, ~0.36 KB per icon |
| Router | Migrate pattern | `react-router-dom@6.30.x` `createBrowserRouter` + `RouterProvider` | `viewTransition` and `ScrollRestoration` need a data router [RR-630]; 7.18.3 optional; avoid 8.x (needs React ≥19.2.7) |
| PWA | Adopt | `vite-plugin-pwa@1.3.0` + `workbox-window@7.4.1`; dev `@vite-pwa/assets-generator@2.0.0` | App-shell precache, update prompt, icon generation |
| Animation | None | CSS + View Transitions | `motion` (46.5 KB) unnecessary |
| **Rejected** | — | Konsta UI 5.4.0 (React 19 ref API, Tailwind v4, no ARIA) · Framework7 9.1.3 (React 19 API, own router, 221 KB) · Ionic React 9.0.3 (99 KB, own page stack, no iOS 26 styling, issue #30466) · vaul 1.1.2 (unmaintained since 2024-12-14) · react-modal-sheet 5.6.0 (no built-in accessibility) · react-swipeable-list 1.10.0 (stale) | |

**Spike first (1 day):** KRKN ticket on Base UI Drawer on iOS 18.x, 26.x, 27 (Safari tab and Home Screen app),
Android Chrome and a Chromebook, keyboard open and closed. Fallback: `@radix-ui/react-dialog@1.1.23` + custom drag.

### 9.2 `web/index.html` head

```html
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#E6E3D9" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0B0D0C" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-title" content="Buccaneer">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>Buccaneer Exchange</title>
  <style>html{background:#E6E3D9}@media (prefers-color-scheme:dark){html{background:#0B0D0C}}</style>
  <script>try{if(localStorage.getItem('bx.solidBars')==='1')document.documentElement.setAttribute('data-solid-bars','')}catch(e){}</script>
</head>
```
- Never `maximum-scale` or `user-scalable=no`.
- `interactive-widget=resizes-content` (Chrome 108+ on Android and ChromeOS; Safari ignores it [Chrome viewport
  resize]) makes the layout viewport and `dvh` shrink when the on-screen keyboard opens, so sheets with fields
  (Choose a company, host Fire news, the End game alert) fit above it on Android phones and Chromebooks in tablet
  mode. iOS keeps using the `--kb` variable (§9.4). The tab bar is already hidden while typing, so it cannot ride
  up on the keyboard.
- The inline script sets Solid bars before first paint (§2.1); the key is per device, not per crew.
- Safari 26 ignores `theme-color` in browser tabs and tints its bars from the html/body background and fixed
  elements near the edges [C WebKit-301756]; installed web apps still use it [BCD]. Keep html/body backgrounds
  explicit and equal to `--bg-grouped` (hull routes set `#111412`).
- `apple-mobile-web-app-status-bar-style` is omitted (`default`) because the app has a light appearance;
  `black-translucent` would force white status text. Verify on iOS 26 and 27 (§9.9).
- Android and ChromeOS installed apps colour their title/status bar from the page's media-aware `theme-color` meta
  once loaded; the manifest's hull `theme_color` only shows on the splash and before first paint.

### 9.3 Manifest and icons

```json
{
  "id": "/", "name": "Buccaneer Exchange", "short_name": "Buccaneer",
  "start_url": "/portfolio?source=homescreen", "scope": "/", "display": "standalone",
  "theme_color": "#111412", "background_color": "#0B0D0C",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
- iOS uses name, short_name, start_url, scope, display, icons (only if no apple-touch-icon), theme_color, id;
  it ignores background_color and orientation [BCD]. Since iOS 26, every Home Screen site opens as a web app,
  manifest or not [A WebKit-26].
- Icon art: hull `#111412` full-bleed square, original gold compass rose with "BX" in Cinzel Decorative; no
  transparency; no Apple glyphs. 180×180 apple-touch-icon; 192, 512, maskable 512 (80% safe zone).
- Home Screen apps don't share storage with Safari (by design [WebKit-181849]): the install tip warns students
  they'll sign in once more.

### 9.4 Base CSS checklist

- [ ] `min-height: 100svh` on page shells; sheets `max-height: calc(100dvh - env(safe-area-inset-top) - 8px)`.
- [ ] Safe areas: top bar `padding-top: env(safe-area-inset-top)`; tab bar bottom §4.3; side padding
  `max(var(--margin), env(safe-area-inset-left/right))` [A WebKit safe-area].
- [ ] Keyboard: hide tab bar on field focus (§5.1); sheet footers use `--drawer-keyboard-inset` or a
  `--kb = max(0, innerHeight − visualViewport.height − visualViewport.offsetTop)` variable recomputed on
  `visualViewport` resize/scroll and on `focusout` (works around the iOS 26.0 offsetTop bug [Forum-800125]).
  The same listener sets `--vv-top = visualViewport.offsetTop` so the fixed top bar can `translateY(var(--vv-top))`
  while the iOS keyboard is open (§5.2). Base UI Drawer's `--drawer-keyboard-inset` (verified in the 1.8.0 package)
  covers sheets; Chrome/ChromeOS get `interactive-widget=resizes-content` (§9.2).
- [ ] Inputs `font-size: max(16px, 1rem)`; `inputmode="numeric"` (shares) / `"decimal"` (Ð) / `"none"` (keypad field);
  `enterkeyhint`.
- [ ] Zoom: never disabled; `-webkit-text-size-adjust: 100%`; `touch-action: manipulation` on controls.
- [ ] Overscroll: `overscroll-behavior: contain` on sheet and horizontal scrollers; body `overscroll-behavior-y: contain`
  (stops Chrome pull-to-refresh).
- [ ] `-webkit-tap-highlight-color: transparent` + explicit `:active` states.
- [ ] Glass per §2.4 (tab bar, top bar, bar buttons, menus, toasts only); closed overlays `display:none`.
- [ ] Cards use `overflow: clip` (not `hidden`) so sticky headers work; sticky headers and sticky table columns
  have opaque backgrounds.
- [ ] Rows with swipe or long-press: `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`.
- [ ] Support floor **iOS 16.4 / Safari 16.4** (last iOS for iPhone 8 and X, common hand-me-down phones) and Chrome
  on ChromeOS within the last 4 releases. Everything newer is progressive: `linear()` easing (17.2) falls back to
  `--ease-fallback`; native `switch` (17.4) to the styled checkbox; View Transitions (18.0) to instant navigation;
  `hasUAVisualTransition` (18) to always running our transition. Required and present in 16.4: `:has()`,
  `dvh/svh`, `inert`, `overflow: clip`, `-webkit-backdrop-filter`, `env()`, `@supports`. Confirm Base UI 1.8.0's
  supported-browser list covers Safari 16.4 during the spike.
- [ ] `@media (display-mode: standalone)` adjustments; in a Safari tab, test that Safari's own floating bottom bar
  doesn't cover the tab bar.
- [ ] Landscape rail and ≥744px sidebar per §4.5.
- [ ] Dynamic Type root per §3.5; stacked row variants at root ≥23px.

### 9.5 Service worker and Firebase

- `vite-plugin-pwa` `generateSW`, `registerType: 'prompt'` (never reload mid-trade; show the "Update ready · Reload" toast
  between screens), `navigateFallback: '/index.html'`, `navigateFallbackDenylist: [/^\/__\//]` (Firebase reserved
  namespace [Firebase-reserved]). Precache the self-hosted Cinzel subset (§3.1) and the icon PNGs.
- No `runtimeCaching` for Firestore, Auth token endpoints or the authority API; unmatched requests go to the network.
- Optional `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` for fast reopen; use snapshot
  `metadata.fromCache` to show "Reconnecting…". **Orders are never queued offline:** Preview/Place disabled while offline or from cache.
- Keep Firestore long-polling auto-detect (default); if listeners stall on school Wi-Fi, set `experimentalForceLongPolling: true`.
- `firebase.json` headers: `Cache-Control: no-cache` for `/index.html`, `/sw.js`, `/manifest.webmanifest`;
  `public, max-age=31536000, immutable` for `/assets/**`.
- Chromebooks: ask school IT to force-install and pin the PWA (Google Admin › Apps & extensions › Add by URL).

### 9.6 Router and transitions

- Migrate `<BrowserRouter>` → `createBrowserRouter` + `RouterProvider`; lazy routes per tab; `<ScrollRestoration>`.
- Push/pop: `<Link viewTransition>` / `navigate(to, { viewTransition: true })`; set `html[data-nav="push"|"pop"]` just before.
- Capture-phase `popstate` listener: if `event.hasUAVisualTransition` (Safari 18+, Chrome 118+) set
  `html[data-nav="ua"]` and CSS `::view-transition-old(root), ::view-transition-new(root) { animation: none }` [MDN-hasUA].
- Tab bar and top bar have `view-transition-name`s so they stay still.

### 9.7 Performance budget

| Metric | Budget | Measure on |
|---|---|---|
| JS for first authenticated view (shell + Portfolio) | ≤220 KB gzip (react 45.5 + router 21.9 + Firebase 101.7 + app ≤50) | Build report; today one 295 KB chunk |
| Each lazy tab route | ≤35 KB gzip | |
| Trade sheet chunk (Base UI drawer + ticket) | ≤60 KB gzip, prefetched on company page idle | |
| CSS total | ≤25 KB gzip | |
| Fonts on ledger routes | 0 bytes; Cinzel subset ≤20 KB only on hull routes | |
| LCP / INP / CLS | ≤2.5 s / ≤200 ms / ≤0.05 | iPhone SE (2nd gen), throttled 4G |
| Scroll | 60 fps with tab bar + collapsed bar glass | iPhone SE; ≤3 backdrop-filters at once |
| Per-tick main-thread work | ≤8 ms; only visible rows re-render (memoized by id) | iPhone SE |
| Firestore listeners | History chunks only for the visible chart range | |

### 9.8 Test matrix

iPhone SE 2nd/3rd gen iOS 18.x (bottom inset 0) · Dynamic Island iPhone on iOS 26.x and 27 · each as Safari tab
and Home Screen app · 402×874 and 440×956 · Android Chrome with gesture nav (Chrome 135+ edge-to-edge) ·
school Chromebook 1366×768 (tab and installed, touch + trackpad, **keyboard only**: Tab/Shift-Tab/Esc/arrow keys
through Markets, a company page and the whole Trade flow) · Chromebook in tablet mode with the on-screen keyboard
(search, Choose a company) · an iPhone on **iOS 16.7** (support floor, §9.4) as Safari tab and Home Screen app ·
Chrome on iOS (WebKit, no Home Screen app) · settings: Reduce Motion, Solid bars (Reduce Transparency is
undetectable in Safari; test `prefers-reduced-transparency` in Chrome), Increase Contrast, Larger Text at 200% and
AX5, Android font size 200%, dark and light, VoiceOver (rotor headings, sheet `inert` background), TalkBack,
ChromeVox.

### 9.9 Verify before locking

- [ ] Open Apple's iOS 27 UI kit (Apple Design Resources) and confirm [B]/[C] numbers: tab bar 62pt capsule,
  list card radius 24, segmented 32, switch size, grabber 36×5, sheet radii. Update this file with verified values.
- [ ] Status bar appearance in the Home Screen app with `default` style on iOS 26/27, light and dark.
- [ ] Base UI Drawer spike (§9.1).
- [ ] `overscroll-behavior-y: contain` on body keeps iOS rubber-banding.
- [ ] VoiceOver pronunciation of "Ð" (it may read "Eth"): accessible labels spell "doubloons" (§10).
- [ ] Keypad amount field: `inputmode="none"` on iOS 16.7, 18, 26 and 27 shows no keyboard, no input accessory bar
  and no scroll jump, and VoiceOver announces it sensibly; otherwise ship the `<output>` + keydown fallback (§5.16).
- [ ] Glass bars during push/pop View Transitions: no flicker or dropped frames on iPhone SE and a Chromebook;
  otherwise solid bars during transitions (§2.4).
- [ ] Home Screen app edge swipe-back while the ticket is dirty: the re-pushed sheet and Discard prompt appear
  without a visible flash (§5.8).
- [ ] Fixed top bar with the iOS keyboard open (Markets search): `--vv-top` keeps the pinned search visible (§5.2).
- [ ] InfoTip sheets open at content height with all three blocks visible on a 375×667 SE at default text size.

---

## 10. Accessibility checklist

**Structure and VoiceOver**
- [ ] Every screen has a unique `<title>` and one `<h1>` (the large title); section headers are `<h2>`; landmarks `<nav>`, `<main>`.
- [ ] Every control has an accessible name; icon-only buttons have `aria-label` ("Trade", "More options", "Add KRKN to watchlist").
- [ ] Decorative art (`WaxSeal`, crests, compass, triangles, sparklines) is `aria-hidden="true"`.
- [ ] Money in accessible names spells the currency: "84.12 doubloons" (VoiceOver may read "Ð" as "Eth");
  signed changes read "up 2.31 percent" / "down 3.46 percent"; the triangle is never announced.
- [ ] Rows are one link with a combined label: "Kraken Shipping Lines, KRKN, 252,360 doubloons, up 14.45 percent since you bought".
- [ ] Charts: summary sentence in the card (visible) and `aria-describedby`; plot is a keyboard slider with
  `aria-valuetext`; series described by meaning, not colour [A HIG Charts]; scatter uses shape.
- [ ] Live data: no live region on ticking prices. Polite announcements only for order results, ticket validation
  after 500ms idle, search result counts, "Back online", phase changes.
- [ ] Tabs: `aria-current="page"`; the News badge adds "new news about your holdings" to the label.
- [ ] Collapsed-bar inline titles, the pinned Standings row and decorative page/step dots are `aria-hidden`
  (their real content exists once elsewhere).
- [ ] No nested interactive elements (no "?" or chip inside a row/card link, §4.4); statement tables are real
  `<table>`s with header cells and a focusable, labelled scroll region.

**Beginner explanations (BRIEF §9)**
- [ ] Every metric with a COPY §1 glossary id has a tap path to its explanation on touch (own "?" or a "What these
  numbers mean" sheet, §5.9); nothing is hover-only at any width.
- [ ] Explanation sheets open at content height so all three InfoTip lines are visible without dragging.
- [ ] The Trade Preview shows the fee, price impact, market order and position limit sentences without a tap (§7.10).

**Focus and sheets**
- [ ] Opening a sheet moves focus to its title (`tabindex="-1"`), traps focus, and Esc closes; closing returns focus to the trigger.
  Everything behind the scrim, including the tab bar, is `inert` (VoiceOver swipe cannot reach it).
- [ ] Focus order follows visual (DOM) order. Trade sheet: Close → title (initial focus) → Cash available "?" →
  Buy/Sell → Shares/Doubloons → steppers and amount field → chips → share-of-account "?" → keypad → problem fix button
  (if any) → Preview order. Preview: Back → title → rows and their "?" buttons → Place order → Edit order. Filled:
  focus moves to "Order filled".
- [ ] Action sheets and alerts focus the Cancel/least destructive option first; the host's typed-END alert focuses
  its text field (End game stays disabled until it reads END).
- [ ] Visible focus ring (2px `--focus`) on every focusable element; never `outline: none` without a replacement.
- [ ] Grabber is a real button; swipe-only interactions all have tap alternatives (§8.3).

**Text size and zoom**
- [ ] iOS Dynamic Type via `-apple-system-body` root; all sizes in rem; tested at AX5 and 200% browser zoom.
- [ ] At root ≥23px rows stack; tab labels cap at 13px but stay readable; nothing clips or truncates a number.
- [ ] Pinch zoom never disabled; content reflows at 320px CSS width (WCAG 1.4.10).

**Colour, contrast, transparency, motion**
- [ ] All text ≥4.5:1 and non-text boundaries ≥3:1 in light, dark and increased contrast (§2.5), including the
  placement rules: no `--label-3` on fills, tints or glass; coloured change text only on opaque surfaces or in
  ChangePills; only `--label`, `--label-2`, `--tint-strong`, `--destructive-strong` as text on glass; grabber and
  switch-off outlines in `--control-off`.
- [ ] Lint: a stylelint rule or unit test flags `color: var(--label-3|--accent|--tint|--gain|--loss)` inside `.glass`
  and `.tint-soft`/`.fill` containers.
- [ ] Signed values: sign + triangle + colour; selected states: shape/weight + colour.
- [ ] `prefers-contrast: more` → IC tokens + opaque glass.
- [ ] Reduce Transparency (undetectable in Safari): glass 85% tint stays legible; "Solid bars" switch available.
- [ ] `prefers-reduced-motion: reduce` → §8.2 fallbacks; no auto-playing ceremony.

**Touch and time**
- [ ] Targets ≥44×44 (28 floor with spacing); no double-tap or long-press-only actions.
- [ ] No time limits for reading: toasts ≥6s, pause on touch or focus, and have a Close button; the ticket never expires
  silently (price re-check explains); the "Sails up" moment never covers an open sheet or takes focus.
- [ ] Orders confirm with a single tap on "Place order" (no drag-to-submit, WCAG 2.5.7).

---

## 11. Artboard inventory (canvas)

### 11.1 Drawing conventions

- File format: BRIEF §8 exactly, with these changes: helmet loads only Cinzel Decorative
  (`https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&amp;display=swap`); body font is the §3.2
  system stack; §2.6 tokens are pasted into `:root`; dark artboards add `class="dark"` on the root div, which picks up
  the `.dark` token list from §2.6 (static, no media query); no scripts. Sheets, action sheets and the pinned
  Standings row are drawn opaque (§2.4).
- Root div width = frame width (393 or 375); explicit background = `--bg-grouped` of its appearance.
- **Status bar** (0–59): time "14:02" (Headline, x 44), generic signal bars and battery drawn as simple rectangles
  at the trailing side (never Apple's status-bar glyphs); a neutral black 125×37 capsule at (134, 11) as the camera
  housing (a generic device silhouette, never labelled or styled as an Apple feature). **Home indicator:**
  139×5 capsule at (127, 839), `--label`.
- **Full-scroll frames** (height >852): draw content continuously; draw fixed chrome (tab bar at y 768–830,
  floating Buy/Sell at 698–748, top bar) **once, at its position within the first 852px**; add a 1px dashed
  `#5FA39A` line at y 852 with a Caption 1 label "fold · 852 (tab bar is fixed)" in a small hull pill at the right.
- Sheets: draw the presenting screen underneath, dimmed with the scrim token.
- Glass: `backdrop-filter` renders in headless Chrome; include the solid fallback colour.
- Render check: BRIEF §8 command with `--window-size=<frame width>,<frame height>`; read the PNG and fix wraps,
  clipping, overlaps.

### 11.2 Screen artboards (canvas page `iphone`, title "iPhone")

Columns step 473px (393 + 80 gap). P0 = first batch.

| File | Frame | Appearance | Screen (§) | x, y | P |
|---|---|---|---|---|---|
| `iPhoneSignIn.dc.html` | 393×852 | Hull | 7.1 | 0, 0 | P0 |
| `iPhoneWelcome.dc.html` | 393×852 | Light | 7.2 sheet | 473, 0 | P1 |
| `iPhoneWalkthrough.dc.html` | 393×852 | Light | 7.2 card on Portfolio | 946, 0 | P1 |
| `iPhonePortfolio.dc.html` | 393×1540 | Light | 7.3 | 1419, 0 | P0 |
| `iPhonePortfolioDark.dc.html` | 393×852 | Dark | 7.3 fold | 1892, 0 | P0 |
| `iPhonePositions.dc.html` | 393×1180 | Light | 7.4 (one row swiped open) | 2365, 0 | P1 |
| `iPhoneActivity.dc.html` | 393×1060 | Light | 7.5 | 2838, 0 | P1 |
| `iPhoneOrderDetail.dc.html` | 393×1000 | Light | 7.5 | 3311, 0 | P1 |
| `iPhoneAccount.dc.html` | 393×852 | Light | 7.15 | 3784, 0 | P1 |
| `iPhoneMarketStatus.dc.html` | 393×852 | Dark | 7.9 | 4257, 0 | P1 |
| `iPhoneMarkets.dc.html` | 393×1880 | Light | 7.6 | 0, 1780 | P0 |
| `iPhoneMarketsScrolled.dc.html` | 393×852 | Light | 7.6 collapsed + sticky list | 473, 1780 | P0 |
| `iPhoneSearch.dc.html` | 393×852 | Dark | 5.3 focused + results | 946, 1780 | P1 |
| `iPhoneCompany.dc.html` | 393×2440 | Light | 7.7 | 1419, 1780 | P0 |
| `iPhoneCompanyScrubDark.dc.html` | 393×852 | Dark | 7.7 scrubbing | 1892, 1780 | P1 |
| `iPhoneAllStats.dc.html` | 393×1100 | Light | 7.7 | 2365, 1780 | P1 |
| `iPhoneFinancials.dc.html` | 393×1760 | Light | 7.8 | 2838, 1780 | P1 |
| `iPhoneInfoSheet.dc.html` | 393×852 | Light | 7.14 InfoTip | 3311, 1780 | P0 |
| `iPhoneNumbersHelpSheet.dc.html` | 393×852 | Light | 5.9 "What these columns mean" (Markets Basics) | 3784, 1780 | P0 |
| `iPhoneTradeEntry.dc.html` | 393×852 | Light | 7.10 Entry | 0, 4460 | P0 |
| `iPhoneTradeDoubloonsDark.dc.html` | 393×852 | Dark | 7.10 Doubloons mode | 473, 4460 | P1 |
| `iPhoneTradeNotEnoughCash.dc.html` | 393×852 | Light | 7.10 inline problem | 946, 4460 | P1 |
| `iPhoneTradePreview.dc.html` | 393×852 | Light | 7.10 Preview | 1419, 4460 | P0 |
| `iPhoneTradeFilled.dc.html` | 393×852 | Light | 7.10 Filled | 1892, 4460 | P0 |
| `iPhoneTradeAttentionDark.dc.html` | 393×852 | Dark | 7.10 price moved | 2365, 4460 | P1 |
| `iPhoneTradeDiscard.dc.html` | 393×852 | Light | 7.10 action sheet | 2838, 4460 | P1 |
| `iPhoneSETradeEntry.dc.html` | 375×667 | Light | 7.10 SE compression | 3311, 4460 | P1 |
| `iPhoneNews.dc.html` | 393×1500 | Light | 7.11 | 0, 5552 | P0 |
| `iPhoneDispatchDark.dc.html` | 393×1100 | Dark | 7.11 detail | 473, 5552 | P1 |
| `iPhoneStandings.dc.html` | 393×1220 | Light | 7.12 | 946, 5552 | P0 |
| `iPhoneStandingsDark.dc.html` | 393×852 | Dark | 7.12 session view + pinned row | 1419, 5552 | P1 |
| `iPhoneCrewSheet.dc.html` | 393×852 | Light | 7.12 crew sheet | 1892, 5552 | P1 |
| `iPhoneResultsVoyage.dc.html` | 393×852 | Hull | 7.13 p1 | 2365, 5552 | P1 |
| `iPhoneResultsCrew.dc.html` | 393×1100 | Light | 7.13 p2 | 2838, 5552 | P1 |
| `iPhoneResultsReveal.dc.html` | 393×1900 | Light | 7.13 p3 | 3311, 5552 | P1 |
| `iPhoneResultsLuckDark.dc.html` | 393×852 | Dark | 7.13 p4 | 3784, 5552 | P1 |
| `iPhoneResultsFinal.dc.html` | 393×1000 | Light | 7.13 p5 | 4257, 5552 | P1 |
| `iPhoneLearn.dc.html` | 393×1560 | Light | 7.14 | 0, 7692 | P0 |
| `iPhoneGlossaryTermDark.dc.html` | 393×852 | Dark | 7.14 | 473, 7692 | P1 |
| `iPhonePausedLoading.dc.html` | 393×852 | Light | 7.16 | 946, 7692 | P1 |
| `iPhoneEmptyDark.dc.html` | 393×852 | Dark | 7.16 | 1419, 7692 | P1 |
| `iPhoneHostControlDark.dc.html` | 393×1300 | Dark | 7.17 | 1892, 7692 | P1 |
| `iPhoneHostFireNews.dc.html` | 393×852 | Light | 7.17 sheet | 2365, 7692 | P1 |
| `iPhoneLandscapeRail.dc.html` | 852×393 | Light | 4.5 rail (Markets list) | 2838, 7692 | P2 |
| `iPadSplitView.dc.html` | 1180×820 | Light | 4.5 split view (Markets list + KRKN) | 3770, 7692 | P2 |
| `iPhoneHostCrewsDark.dc.html` | 393×852 | Dark | 7.18 Crews list + crew detail actions | 5030, 7692 | P2 |

Row y values leave 240px below the tallest frame in the row above (re-derived after the review changed Portfolio to
1540 and Markets to 1880: rows at y 0 / 1780 / 4460 / 5552 / 7692).

### 11.3 Component-sheet artboards (canvas page `mobile-system`, title "Mobile system")

Each sheet shows light and dark side by side (two 560px columns with 40px padding).

| File | Frame | Contents | x, y | P |
|---|---|---|---|---|
| `MobileTokens.dc.html` | 1200×1700 | §2 token swatches with hex and contrast ratio; glass samples over hull and ledger; §3 type ramp with px/weight; spacing and radius scale; motion token table | 0, 0 | P0 |
| `MobileBars.dc.html` | 1200×1400 | TabBar (each tab selected, badge, pressed, rail variant); LargeTitleNavBar expanded/collapsed/pushed/with search; SearchField idle/focused/typing/no results; SegmentedControl (2, 4, 5 segments; disabled); Buttons (all styles × large/medium/small × default/pressed/disabled/loading/focus) | 1320, 0 | P0 |
| `MobileLists.dc.html` | 1200×1700 | InsetGroupedList headers/footers; every ListRow variant (§5.5) incl. large-text stacked versions; SwipeActions open; Badge/Pill set; Crest sizes and sector fills; Stepper (joined, split); Toggle on/off/fallback | 2640, 0 | P0 |
| `MobileOverlays.dc.html` | 1200×1500 | Sheet medium/large with grabber (opaque); InfoTip sheet, "What these numbers mean" sheet and inline expansion; Menu (glass, destructive-strong item); ActionSheet (opaque); Alert (host End game); Toast (glass, below the top bar); Banners (paused, lobby, ended, offline, stale with Reload, final session, trading disabled) | 3960, 0 | P1 |
| `MobileData.dc.html` | 1200×1500 | Chart card idle/scrubbing/loading/empty; Sparkline; AllocationBar; RangeBar; StockHeader; PositionSummary; Keypad + amount; EmptyState (ledger, hull); Skeletons; Medallion/Podium; WaxSeal (64, 120) | 5280, 0 | P1 |

### 11.4 canvas.json

Add pages `{ "id": "iphone", "name": "iPhone" }` and `{ "id": "mobile-system", "name": "Mobile system" }`, register every
file above with its x, y, w, h, and set `"launch": { "view": "canvas", "page": "iphone" }`. Add an annotation on
`iphone` at (0, −200): "Round 2: mobile-first Apple-style system (MOBILE.md). Light and dark follow the phone's
setting. Tab bar is fixed at the bottom of the first 852px; dashed line marks the fold."

### 11.5 Superseded artboards

`MobileSummary.dc.html` and `MobileTrade.dc.html` (390×844, old tab bar with a centre Trade item, stale cash
Ð312,400.18, "41:17:08", old crew name) are superseded by `iPhonePortfolio` and `iPhoneTradeEntry`. Move them to the
`directions` page as history once round 2 lands. `FinalReckoning.dc.html` and `HostConsole.dc.html` still show the
old crew name; fix when the desktop pass is redone.

---

## References

Apple (developer.apple.com unless noted)
- [HIG What's new] https://developer.apple.com/design/whats-new/
- [HIG Design principles] https://developer.apple.com/design/human-interface-guidelines/design-principles
- [HIG iOS] https://developer.apple.com/design/human-interface-guidelines/designing-for-ios
- [HIG Duo] https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo
- [HIG Tab bars] https://developer.apple.com/design/human-interface-guidelines/tab-bars
- [HIG Toolbars] https://developer.apple.com/design/human-interface-guidelines/toolbars
- [HIG Search fields] https://developer.apple.com/design/human-interface-guidelines/search-fields
- [HIG Lists and tables] https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- [HIG Sheets] https://developer.apple.com/design/human-interface-guidelines/sheets
- [HIG Popovers] https://developer.apple.com/design/human-interface-guidelines/popovers
- [HIG Menus] https://developer.apple.com/design/human-interface-guidelines/menus
- [HIG Context menus] https://developer.apple.com/design/human-interface-guidelines/context-menus
- [HIG Action sheets] https://developer.apple.com/design/human-interface-guidelines/action-sheets
- [HIG Alerts] https://developer.apple.com/design/human-interface-guidelines/alerts
- [HIG Segmented controls] https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- [HIG Buttons] https://developer.apple.com/design/human-interface-guidelines/buttons
- [HIG Toggles] https://developer.apple.com/design/human-interface-guidelines/toggles
- [HIG Steppers] https://developer.apple.com/design/human-interface-guidelines/steppers
- [HIG Text fields] https://developer.apple.com/design/human-interface-guidelines/text-fields
- [HIG Typography] https://developer.apple.com/design/human-interface-guidelines/typography
- [HIG Color] https://developer.apple.com/design/human-interface-guidelines/color
- [HIG Dark Mode] https://developer.apple.com/design/human-interface-guidelines/dark-mode
- [HIG Materials] https://developer.apple.com/design/human-interface-guidelines/materials
- [HIG Scroll views] https://developer.apple.com/design/human-interface-guidelines/scroll-views
- [HIG Layout] https://developer.apple.com/design/human-interface-guidelines/layout
- [HIG Layout, archived July 2026] http://web.archive.org/web/20260702060104/https://developer.apple.com/tutorials/data/design/human-interface-guidelines/layout.json
- [HIG Motion] https://developer.apple.com/design/human-interface-guidelines/motion
- [HIG Accessibility] https://developer.apple.com/design/human-interface-guidelines/accessibility
- [HIG VoiceOver] https://developer.apple.com/design/human-interface-guidelines/voiceover
- [HIG Charts] https://developer.apple.com/design/human-interface-guidelines/charts
- [HIG Onboarding] https://developer.apple.com/design/human-interface-guidelines/onboarding
- [HIG Offering help] https://developer.apple.com/design/human-interface-guidelines/offering-help
- [HIG Modality] https://developer.apple.com/design/human-interface-guidelines/modality
- [HIG Feedback] https://developer.apple.com/design/human-interface-guidelines/feedback
- [HIG Loading] https://developer.apple.com/design/human-interface-guidelines/loading
- [HIG Managing accounts] https://developer.apple.com/design/human-interface-guidelines/managing-accounts
- [HIG Gestures] https://developer.apple.com/design/human-interface-guidelines/gestures
- [HIG SF Symbols] https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- [Apple Design Resources] https://developer.apple.com/design/resources/
- [Fonts] https://developer.apple.com/fonts/
- [WWDC25-219] https://developer.apple.com/videos/play/wwdc2025/219/
- [WWDC25-284] https://developer.apple.com/videos/play/wwdc2025/284/
- [WWDC25-323] https://developer.apple.com/videos/play/wwdc2025/323/
- [WWDC25-356] https://developer.apple.com/videos/play/wwdc2025/356/
- [WWDC26-269] https://developer.apple.com/videos/play/wwdc2026/269/
- [WWDC26-278] https://developer.apple.com/videos/play/wwdc2026/278/
- [WWDC26-292] https://developer.apple.com/videos/play/wwdc2026/292/
- [SwiftUI TabBarMinimizeBehavior] https://developer.apple.com/documentation/swiftui/tabbarminimizebehavior
- [SwiftUI PresentationDetent] https://developer.apple.com/documentation/swiftui/presentationdetent
- [UIKit UISheetPresentationController] https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller
- [SwiftUI Animation] https://developer.apple.com/documentation/swiftui/animation/default · https://developer.apple.com/documentation/swiftui/animation/snappy(duration:extrabounce:) · https://developer.apple.com/documentation/swiftui/animation/bouncy(duration:extrabounce:)
- [Forum-796299] https://developer.apple.com/forums/thread/796299
- [Forum-800125] https://developer.apple.com/forums/thread/800125
- [Configuring Web Applications (archive)] https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
- [Newsroom iOS 27] https://www.apple.com/newsroom/2026/09/major-updates-for-apples-software-platforms-are-now-available/
- [Newsroom iPhone Duo] https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/
- [Stocks user guide] https://support.apple.com/guide/iphone/check-stocks-iph1ac0b1bc/ios

WebKit, W3C, MDN, browsers
- [WebKit-26] https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- [WebKit-27 beta] https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/
- [WebKit-switch] https://webkit.org/blog/15054/an-html-switch-control/
- [WebKit system font] https://webkit.org/blog/3709/using-the-system-font-in-web-content/
- [WebKit safe-area] https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- [WebKit storage] https://webkit.org/blog/14403/updates-to-storage-policy/
- [WebKit-181849] https://bugs.webkit.org/show_bug.cgi?id=181849
- [WebKit-297779] https://bugs.webkit.org/show_bug.cgi?id=297779
- [WebKit-301756] https://bugs.webkit.org/show_bug.cgi?id=301756
- [WebKit-175497] https://bugs.webkit.org/show_bug.cgi?id=175497
- [BCD] https://github.com/mdn/browser-compat-data
- [MDN prefers-reduced-transparency] https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency
- [MDN-hasUA] https://developer.mozilla.org/en-US/docs/Web/API/PopStateEvent/hasUAVisualTransition
- [FE2] https://drafts.csswg.org/filter-effects-2/
- [W3C WCAG 2.2 contrast] https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html · https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- [W3C 2.5.7] https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- [W3C 2.5.1] https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html
- [Chrome viewport resize] https://developer.chrome.com/blog/viewport-resize-behavior (`interactive-widget`, Chrome 108+, not WebKit)
- [CSS View Transitions 1] https://www.w3.org/TR/css-view-transitions-1/ (captured elements keep `backdrop-filter` on the group)
- [W3C swipe-back thread] https://lists.w3.org/Archives/Public/public-webapps-github/2022Jun/0288.html (Home Screen web apps on iOS have edge swipe navigation that sites cannot disable)
- [WebKit-193811] https://bugs.webkit.org/show_bug.cgi?id=193811 · [WebKit-188896] https://bugs.webkit.org/show_bug.cgi?id=188896 (`inputmode="none"` history on iOS)
- [W3C 1.4.11] https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html · [W3C 2.5.8] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- [MDN overflow clip] https://developer.mozilla.org/en-US/docs/Web/CSS/overflow (`clip` does not create a scroll container, so sticky still works)
- [Chrome edge-to-edge] https://developer.chrome.com/docs/css-ui/edge-to-edge

Libraries and services
- [RR-630] https://reactrouter.com/6.30.0/components/link
- [Base UI Drawer] https://base-ui.com/react/components/drawer (1.8.0 package verified to ship `drawer/viewport` and the `--drawer-keyboard-inset` CSS variable)
- [vaul] https://github.com/emilkowalski/vaul
- [Konsta changelog] https://github.com/konstaui/konsta/blob/master/CHANGELOG.md
- [Framework7 changelog] https://raw.githubusercontent.com/framework7io/framework7/master/CHANGELOG.md
- [Ionic #30466] https://github.com/ionic-team/ionic-framework/issues/30466
- [vite-plugin-pwa] https://vite-pwa-org.netlify.app/guide/
- [Firebase-reserved] https://firebase.google.com/docs/hosting/reserved-urls
- [Firestore offline] https://firebase.google.com/docs/firestore/manage-data/enable-offline
- [Chromebook force-install] https://support.google.com/chrome/a/answer/9367354?hl=en

Community reports ([C])
- [MacStories iOS 27] https://www.macstories.net/stories/ios-and-ipados-27-review/2/
- [DFN-27] https://designfornative.com/what-designers-need-to-know-about-ios-27/
- [DFN iOS 26 UI] https://designfornative.com/ui-changes-in-ios-26-thats-not-about-liquid-glass/
- [Safari 26 tint] https://1ar.io/updates/safari-26-liquid-glass-web/
- [Dynamic Type on the web] https://furbo.org/2024/07/04/dynamic-type-on-the-web/
- [16px input zoom] https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
- [NN/g bottom sheets] https://www.nngroup.com/articles/bottom-sheet/
