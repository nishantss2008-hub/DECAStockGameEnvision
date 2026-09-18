# Buccaneer Exchange mobile kit (KIT.md)

Canonical markup for `docs/design/canvas/_kit/mobile-kit.css`. MOBILE.md is the spec (tokens §2, type §3, layout §4,
components §5); this file shows how to draw it so every iPhone artboard matches. The snippets are generated from the
same markup that renders the component sheets `MobileTokens.dc.html`, `MobileBars.dc.html` and `MobileLists.dc.html`,
and every class used here and on those sheets was checked against the CSS when the kit was built (2026-09-14).

Copy rules: labels, InfoTips, explain sentences, banners and buttons below are COPY.md text (or the MOBILE.md §7.0
proposed phone copy), verbatim. Numbers are BRIEF §7. Replace them with your screen's data, never with new wording.

## 0. Rules for every artboard

1. **Helmet:** keep `<script src="./support.js"></script>`, load only Cinzel Decorative, paste `mobile-kit.css` unchanged
   into `<style>`. Put screen-only layout in inline styles or in a second small `<style>` after the kit. Never rename kit classes.
2. **Root:** one `<div>` whose width equals the frame, with an explicit background:
   `class="phone"` (light), `class="phone dark"` (dark), `class="phone hull"` (Sign in, ceremonies), `class="phone is-se"` (375×667).
3. **No device chrome:** y 0-59 and the bottom 34px stay plain background (SE: y 0-20, no bottom inset). No time, signal, battery,
   camera shape or home indicator.
4. **Fixed chrome on 393×852** (MOBILE §4.3): top bar row 59-103 `.at-topbar` · large title 107-148 · status line 150-170 ·
   first content 182 `.after-title` · floating Buy/Sell 698-748 `.at-float` over `.edge-fade` · tab bar 768-830 `.at-tabbar` ·
   toast top 111 `.at-toast` · collapsed glass strip 0-103 `.at-bar-strip`. Content column: `.screen` (16px margins, 100px bottom
   padding; `.has-float` adds 66px). On `.phone.is-se` the same classes move to the SE coordinates (bar row 20-64, content 64,
   toast 72, floating Buy/Sell 527-577, tab bar 597-659 at 343 wide, large sheet top 30, keypad keys 44).
5. **Full-scroll frames** (taller than 852): draw content continuously, draw fixed chrome once inside the first 852px, add `.fold`.
6. **Type:** the system font comes from `.phone` / `.bx`; use `.t-*` classes. Cinzel only through `.brand`, 22px or larger, never numbers.
7. **Numbers:** tabular figures are on by default inside `.phone`; true minus `−` (U+2212); `Ð` with 2 decimals; never truncate a number.
8. **Signed values:** sign + triangle SVG + colour, always (`.chg`, `.pill-change`). Rank moves and signed text on glass use `.chg.is-neutral`.
9. **Explain + compare:** every metric label gets a `.qmark` with `aria-label="What is {label} ({term})?"` (COPY §0.4). ExplainRows
   show the everyday sentence and "Rest of {sector}: …" (the peers, never this company). Dense lists use one "?" in the column header that opens "What these
   numbers mean". No verdicts, no good/bad colours on fundamentals, no buy/sell advice, no health score before the reveal.
10. **Colour placement** (MOBILE §2.5): `--label-3` never on fills, tint-soft or glass · gain/loss text only on opaque surfaces or
    inside a ChangePill · text on glass only `--label`, `--label-2`, `--tint-strong`, `--destructive-strong` · no red for "Not placed".
11. **Glass** (`.glass`) only on the tab bar, collapsed bar strip, bar buttons, menus and toasts. Sheets, action sheets, alerts,
    cards, rows, banners and charts are opaque. At most 3 glass elements on screen.
12. **Targets 44×44:** `.bar-btn`, `.bar-avatar`, `.qmark`, `.sheet-close`, `.step-circle`, `.search-clear`, `.toast-close` are 44px boxes;
    `.btn-md`, `.btn-sm` (also 44 wide at least), `.chip`, `.list-link`, `.stepper-half`, `.seg-item`, `.switch` and the `.status-line`
    button carry invisible 44px hit areas. The `.qmark` has a 0-tall margin box, so it never makes a label line taller: a KeyValueRow
    stays 44, a PositionSummary cell 64 and the StockHeader 141. Keep 8px between targets.
14. **Spacing utilities** (`.mt-*`, `.gap-*`) sit last in the CSS, so `class="btn … mt-24"` and `class="card mt-8"` really get the margin.
13. **Canonical HTML:** close every element (including `<path></path>`), quote every attribute, write `&amp;` for "&" in text and URLs,
    no `<script>` blocks, no emoji or dingbats.

## 1. Frame skeletons

### 1.1 Tab root, 393×852 (complete file)
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&amp;display=swap">
  <style>
    /* paste docs/design/canvas/_kit/mobile-kit.css here, unchanged */
  </style>
</helmet>
<div class="phone" style="width: 393px; height: 852px; background: var(--bg-grouped);">
  <!-- 0-59: plain safe-area background. No status bar, camera shape or home indicator. -->
  <div class="at-topbar">
    <header class="topbar">
      <div class="topbar-lead"></div>
      <div class="topbar-trail"><button class="bar-btn glass" type="button" aria-label="Trade"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg></button><button class="bar-avatar" type="button" aria-label="Account"><span class="crest c32 crew-hull" aria-hidden="true">SW</span></button></div>
    </header>
  </div>
  <main class="screen">
    <h1 class="large-title">Portfolio</h1>
    <button class="status-line" type="button"><span class="status-dot is-open" aria-hidden="true"></span><span>Market open · 37:17:42 left · Session 2 of 8</span></button>
    <div class="after-title">
      <!-- first content at y 182 -->
    </div>
  </main>
  <div class="at-tabbar">
    <nav class="tabbar glass" aria-label="Main">
      <a class="tab is-selected" href="#" aria-current="page"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect x="2" y="6" width="20" height="14" rx="2"></rect></svg><span class="tab-label">Portfolio</span></a>
      <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="m19 9-5 5-4-4-3 3"></path></svg><span class="tab-label">Markets</span></a>
      <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18h-5"></path><path d="M18 14h-8"></path><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"></path><rect x="10" y="6" width="8" height="4" rx="1"></rect></svg><span class="tab-label">News</span></a>
      <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg><span class="tab-label">Standings</span></a>
      <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"></path><path d="M22 10v6"></path><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"></path></svg><span class="tab-label">Learn</span></a>
    </nav>
  </div>
  <!-- 818-852: plain safe-area background -->
</div>
</x-dc>
</body>
</html>
```

Tab roots: trailing Trade (Portfolio only) + crew avatar; large title; status line "Market open · 37:17:42 left · Session 2 of 8";
phase banner (if not live) at y 182; content; tab bar with the current tab selected.

### 1.2 Full-scroll frame
```html
<div class="phone" style="width: 393px; height: 1540px; background: var(--bg-grouped);">
  <div class="at-topbar">…top bar row…</div>
  <main class="screen">…content continues past 852…</main>
  <div class="at-tabbar">…tab bar, drawn once at y 768…</div>
  <div class="fold"><span class="fold-label">fold · 852 (tab bar is fixed)</span></div>
</div>
```

### 1.3 Pushed screen (expanded)
```html
<div class="phone" style="width: 393px; height: 852px; background: var(--bg-grouped);">
  <div class="at-topbar">
    <header class="topbar">
  <div class="topbar-lead"><button class="bar-btn glass" type="button" aria-label="Back to Portfolio"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button></div>
  <div class="topbar-trail"><div class="bar-capsule glass"><button class="bar-btn" type="button" aria-label="Sort positions"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg></button><button class="bar-btn" type="button" aria-label="What these numbers mean"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></div></div>
</header>
  </div>
  <main class="screen">
    <h1 class="large-title">Positions</h1>
    <div class="after-title">…</div>
  </main>
  <div class="at-tabbar">…Portfolio selected…</div>
</div>
```

### 1.4 Scrolled state (collapsed bar)
```html
<div class="phone" style="width: 393px; height: 852px; background: var(--bg-grouped);">
  <main class="screen">…content scrolled up, passing under the bar…</main>
  <div class="at-bar-strip">
    <header class="bar-strip glass">
      <div class="topbar">
        <div class="topbar-lead"></div>
        <div class="topbar-center" aria-hidden="true"><span class="bar-title">Portfolio</span><span class="bar-subtitle">Open · 37:17:42</span></div>
        <div class="topbar-trail"><button class="bar-btn on-glass" type="button" aria-label="Trade"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg></button><button class="bar-avatar" type="button" aria-label="Account"><span class="crest c32 crew-hull" aria-hidden="true">SW</span></button></div>
      </div>
    </header>
  </div>
  <div class="at-tabbar">…</div>
</div>
```

### 1.5 Dark, hull and SE roots
```html
<!-- Dark artboard: add class="dark" on the root. var(--bg-grouped) then resolves to #0B0D0C. -->
<div class="phone dark" style="width: 393px; height: 852px; background: var(--bg-grouped);">…</div>
<!-- Hull screen (Sign in, ceremonies): dark tokens + sea-glass glow in both appearances -->
<div class="phone hull" style="width: 393px; height: 852px; background: radial-gradient(120% 60% at 85% 0%, rgba(95,163,154,.18), transparent 60%), #111412;">…</div>
<!-- iPhone SE compression frame: the same placement classes move to the SE safe areas (top 20, bottom 0):
     bar row 20-64 · content from 64 · toast 72 · floating Buy/Sell 527-577 · tab bar 597-659 (343 wide) · large sheet top 30 · keys 44 -->
<div class="phone is-se" style="width: 375px; height: 667px; background: var(--bg-grouped);">
  <div class="at-topbar">…</div>
  <main class="screen">…</main>
  <div class="at-tabbar">…</div>
</div>
```

## 2. Icons

Original inline SVGs drawn to lucide shapes on a 24 grid. `.ic` sets stroke 1.75, round caps and `currentColor`; size with
`s12 s14 s17 s18 s20 s22 s28 s36 s44`, weight with `w2 w225 w25`. Paste the SVG inline where it is used (no `<use>` sprites:
the canvas editor and PNG export need real elements). Never SF Symbols, never emoji.

| Name | Used for |
|---|---|
| `briefcase` | Portfolio tab, Welcome row, empty positions |
| `chart-line` | Markets tab |
| `newspaper` | News tab |
| `trophy` | Standings tab |
| `graduation-cap` | Learn tab |
| `chevron-left` | Back |
| `chevron-right` | row chevron (14px, stroke 2.5) |
| `chevron-down` | menu buttons ("Show: Total gain") |
| `search` | SearchField |
| `x` | Close, clear, dismiss |
| `circle-question-mark` | InfoTip "?" |
| `star` | watchlist |
| `ellipsis` | More options |
| `arrow-left-right` | Trade toolbar button, Trading basics |
| `arrow-up-down` | Positions sort |
| `list-filter` | Activity filter |
| `minus` | steppers |
| `plus` | steppers |
| `delete` | keypad Delete |
| `triangle-alert` | not placed, problems (never red) |
| `circle-plus` | bought, swipe Buy |
| `circle-minus` | sold, swipe Sell |
| `pause` | Paused banner |
| `anchor` | Lobby banner |
| `wifi-off` | Offline banner |
| `lock` | Trading disabled |
| `clock` | Stale banner, Welcome row |
| `flag` | Final session, ended |
| `play` | How to play |
| `book-open` | How the game works |
| `compass` | 5 questions, Welcome row, hull empty state |
| `eye` | Show password |
| `check` | menu checkmark, Back online |
| `rotate-cw` | Reload |
| `coins` | Earnings tag |
| `cloud-lightning` | Storm tag |
| `globe` | Whole market tag |
| `users` | host Crews tab |
| `gauge` | host Control tab |
| `megaphone` | host News tab |
| `scroll-text` | host Tape tab |
| `chart-candlestick` | host Market tab |

```html
<!-- briefcase -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect x="2" y="6" width="20" height="14" rx="2"></rect></svg>
<!-- chart-line -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>
<!-- newspaper -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18h-5"></path><path d="M18 14h-8"></path><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"></path><rect x="10" y="6" width="8" height="4" rx="1"></rect></svg>
<!-- trophy -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
<!-- graduation-cap -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"></path><path d="M22 10v6"></path><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"></path></svg>
<!-- chevron-left -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
<!-- chevron-right -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
<!-- chevron-down -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
<!-- search -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
<!-- x -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
<!-- circle-question-mark -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>
<!-- star -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.57-4.46 6.32-.92z"></path></svg>
<!-- ellipsis -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
<!-- arrow-left-right -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg>
<!-- arrow-up-down -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg>
<!-- list-filter -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M7 12h10"></path><path d="M10 18h4"></path></svg>
<!-- minus -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>
<!-- plus -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
<!-- delete -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5a2 2 0 0 0-1.34.52l-6.33 5.74a1 1 0 0 0 0 1.48l6.33 5.74A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"></path><path d="m12 9 6 6"></path><path d="m18 9-6 6"></path></svg>
<!-- triangle-alert -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
<!-- circle-plus -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>
<!-- circle-minus -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path></svg>
<!-- pause -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect></svg>
<!-- anchor -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22V8"></path><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path><circle cx="12" cy="5" r="3"></circle></svg>
<!-- wifi-off -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h.01"></path><path d="M8.5 16.43a5 5 0 0 1 7 0"></path><path d="M5 12.86a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.86a10 10 0 0 0-2-1.52"></path><path d="M2 8.82a15 15 0 0 1 4.18-2.64"></path><path d="M22 8.82a15 15 0 0 0-11.29-3.76"></path><path d="m2 2 20 20"></path></svg>
<!-- lock -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
<!-- clock -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
<!-- flag -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg>
<!-- play -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l14 9-14 9z"></path></svg>
<!-- book-open -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>
<!-- compass -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-1.8 5.41a2 2 0 0 1-1.27 1.27l-5.41 1.8 1.8-5.41a2 2 0 0 1 1.27-1.27z"></path></svg>
<!-- eye -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"></path><circle cx="12" cy="12" r="3"></circle></svg>
<!-- check -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
<!-- rotate-cw -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
<!-- coins -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path><path d="M7 6h1v4"></path><path d="m16.71 13.88.7.71-2.82 2.82"></path></svg>
<!-- cloud-lightning -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97"></path><path d="m13 12-3 5h4l-3 5"></path></svg>
<!-- globe -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
<!-- users -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
<!-- gauge -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path></svg>
<!-- megaphone -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>
<!-- scroll-text -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12h-5"></path><path d="M15 8h-5"></path><path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"></path></svg>
<!-- chart-candlestick -->
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v4"></path><rect x="7" y="9" width="4" height="6" rx="1"></rect><path d="M9 15v2"></path><path d="M17 3v2"></path><rect x="15" y="5" width="4" height="8" rx="1"></rect><path d="M17 13v3"></path><path d="M3 3v16a2 2 0 0 0 2 2h16"></path></svg>
```

## 3. Atoms: signed change, triangle, crest, "?"
```html
<!-- Signed change: sign + triangle + colour (true minus U+2212) -->
<span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð1.90 (+2.31%)</span>
<span class="chg is-down"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M0 .5h8L4 7.5Z"></path></svg>−Ð1,110.00</span>
<span class="chg is-flat">0.00%</span>
<!-- On glass or for rank moves: keep sign + triangle, use label-2 -->
<span class="chg is-up is-neutral"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+2.31%</span>

<!-- Triangle only (8px beside 11-15px text; add s10 beside 17px and larger) -->
<svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg> <svg class="tri s10" viewBox="0 0 8 8" aria-hidden="true"><path d="M0 .5h8L4 7.5Z"></path></svg>

<!-- Crest monogram: sizes c28 c32 c36 c44 c52 c64; sector class or crew-hull -->
<span class="crest c36 sec-shipping" aria-hidden="true">KR</span>
<span class="crest c32 crew-hull" aria-hidden="true">SW</span>

<!-- "?" InfoTip trigger: 22px glyph in a 44x44 button, straight after its label -->
<span class="label-q"><span>Account value</span><button class="qmark" type="button" aria-label="What is Account value (total account value)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span>
<!-- variants: add s17 (statement tables), s28 (column header chip), is-open (inline expanded), no-pull (no negative margins) -->
```

## 4. Components

### 5.1 TabBar
Glass capsule 361×62, radius 31, padding 4 · five items 70.6 wide · platter 54 tall (`--platter`) · icon 24 at 8px from the item
top (stroke 2.25 when selected) over Caption 2 11/13 (500, 600 selected) · selected colour `--tint-strong`, others `--label-2` ·
News count badge (`--prominent`/`--on-prominent`, 2px glass ring) only while News is closed · never hides on scroll.
```html
<nav class="tabbar glass" aria-label="Main">
  <a class="tab is-selected" href="#" aria-current="page"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect x="2" y="6" width="20" height="14" rx="2"></rect></svg><span class="tab-label">Portfolio</span></a>
  <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="m19 9-5 5-4-4-3 3"></path></svg><span class="tab-label">Markets</span></a>
  <a class="tab" href="#" aria-label="News, new news about your holdings"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18h-5"></path><path d="M18 14h-8"></path><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"></path><rect x="10" y="6" width="8" height="4" rx="1"></rect></svg><span class="tab-label">News</span><span class="tab-badge" aria-hidden="true">1</span></a>
  <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg><span class="tab-label">Standings</span></a>
  <a class="tab" href="#"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"></path><path d="M22 10v6"></path><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"></path></svg><span class="tab-label">Learn</span></a>
</nav>

<!-- states: add is-pressed or is-focus to a .tab · Solid bars: add is-solid next to glass · landscape rail: add is-rail -->
<nav class="tabbar is-rail glass" aria-label="Main">…</nav>
```

### 5.2 LargeTitleNavBar
Bar row 44 (`.topbar`, 16px sides) · 44×44 buttons, 20px icons at stroke 2 · expanded: leading glass circle, trailing buttons share one
`.bar-capsule.glass` · collapsed: `.bar-strip.glass` 0-103 with a 0.5px separator edge, `.bar-btn.on-glass` buttons, inline title
(Headline) + subtitle (Caption 1, `--label-2`, `aria-hidden`) · Back is a chevron with `aria-label="Back to {title}"`, never the word.

Expanded tab root (title and status line sit inside `.screen`):
```html
<header class="topbar">
  <div class="topbar-lead"></div>
  <div class="topbar-trail"><button class="bar-btn glass" type="button" aria-label="Trade"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg></button><button class="bar-avatar" type="button" aria-label="Account"><span class="crest c32 crew-hull" aria-hidden="true">SW</span></button></div>
</header>
<h1 class="large-title">Markets</h1>
<button class="status-line" type="button"><span class="status-dot is-open" aria-hidden="true"></span><span>Market open · 37:17:42 left · Session 2 of 8</span></button>
```
Expanded pushed (company page: Star + More share one capsule):
```html
<header class="topbar">
  <div class="topbar-lead"><button class="bar-btn glass" type="button" aria-label="Back to Markets"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button></div>
  <div class="topbar-trail"><div class="bar-capsule glass"><button class="bar-btn" type="button" aria-pressed="false" aria-label="Add KRKN to watchlist"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.57-4.46 6.32-.92z"></path></svg></button><button class="bar-btn" type="button" aria-label="More options"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg></button></div></div>
</header>
```
Collapsed pushed:
```html
<header class="bar-strip glass">
  <div class="topbar">
    <div class="topbar-lead"><button class="bar-btn on-glass" type="button" aria-label="Back to Markets"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button></div>
    <div class="topbar-center" aria-hidden="true"><span class="bar-title">KRKN</span><span class="bar-subtitle">Ð84.12 · <span class="chg is-up is-neutral"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+2.31%</span></span></div>
    <div class="topbar-trail"><button class="bar-btn on-glass" type="button" aria-label="Add KRKN to watchlist"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.57-4.46 6.32-.92z"></path></svg></button><button class="bar-btn on-glass" type="button" aria-label="More options"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg></button></div>
  </div>
</header>
```
Collapsed with pinned search (Markets):
```html
<header class="bar-strip glass">
  <div class="topbar">
    <div class="search is-pinned w-full"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><span class="search-text">Search 25 companies</span></div>
    <div class="topbar-trail" style="margin-left: 8px;"><button class="bar-avatar" type="button" aria-label="Account"><span class="crest c32 crew-hull" aria-hidden="true">SW</span></button></div>
  </div>
</header>
```

### 5.3 SearchField
40px capsule on `--fill` (36px `.is-pinned` on `--fill-on-glass`) · 17px icon and placeholder in `--label-2` · caret `--tint` ·
clear = 17px `--label-3` circle in a 44px target · Cancel (Body, `--tint`) appears while focused · no results = EmptyState.
```html
<div class="search" role="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><span class="search-text">Search 25 companies</span></div>
<div class="search-row"><div class="search" role="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><span class="search-text"><span class="search-caret"></span></span></div><button class="search-cancel" type="button">Cancel</button></div>
<div class="search-row"><div class="search" role="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><span class="search-text is-typed">kra<span class="search-caret"></span></span><button class="search-clear" type="button" aria-label="Clear search"><span><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></span></button></div><button class="search-cancel" type="button">Cancel</button></div>
<!-- no results: EmptyState in a card (COPY §12 empty.search) -->
<div class="card"><div class="empty"><svg class="ic empty-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><p class="empty-title">No companies match “kraq”</p><p class="empty-body">Try a symbol like KRKN or part of a company name.</p></div></div>
```

### 5.4 InsetGroupedList
Card `--cell` (in sheets `.is-elevated`), radius 24, `overflow: clip` · prominent header Headline + optional "See all" 8px above
the card · plain header Footnote `--label-2` at x + 16 · footer Footnote `--label-2` 8px below · 0.5px separators inset 16, or to
the text after a leading element (`sep-56` crest 28, `sep-57` tile, `sep-60` 32px circle, `sep-64` crest 36, `sep-96` standings),
none after the last row · `.list + .list` = 32px.
```html
<section class="list" aria-label="Positions">
  <div class="list-header"><h2 class="list-title">Positions</h2><a class="list-link" href="#">See all 7</a></div>
  <ul class="card" role="list">
    <li class="row row-holding"><span class="crest c36 sec-shipping" aria-hidden="true">KR</span><div class="row-main"><span class="row-title">KRKN</span><span class="row-sub">3,000 shares</span></div><div class="row-trail"><span class="row-value">Ð252,360.00</span><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð31,860.00 (+14.45%)</span></div></li>
    <li class="row row-holding"><span class="crest c36 sec-banking" aria-hidden="true">PR</span><div class="row-main"><span class="row-title">PRYL</span><span class="row-sub">800 shares</span></div><div class="row-trail"><span class="row-value">Ð169,920.00</span><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð22,720.00 (+15.43%)</span></div></li>
  </ul>
</section>

<section class="list" aria-label="Display">
  <div class="list-header is-plain"><h2 class="list-title">Display</h2></div>
  <ul class="card" role="list">
    <li class="row row-toggle"><span class="row-title is-body">Solid bars</span><span class="switch is-off" role="switch" aria-checked="false" aria-label="Solid bars"></span></li>
  </ul>
  <p class="list-footer">Turns off see-through bars. Use it if text on the bars is hard to read.</p>
</section>
<!-- inside a sheet: <ul class="card is-elevated" role="list"> -->
```

### 5.5 ListRow variants
All rows: min height 44, padding 11 16, gap 12, pressed `.is-pressed` (`--fill-2`), focus `.is-focus` (2px inset `--focus` ring), chevron only
when the row navigates. Padding is 11, not the 12 in MOBILE §5.5's intro: 11 + 22 + 11 keeps every one-line Body row at the 44 its table
lists (12 gives 46). Measured: KeyValue, Disclosure, Action and Toggle rows 44 · Disclosure with subtitle 60 · Standing 60 · Stock, Holding
and Activity 64 · Metrics 76 · Position 88 · Explain 90.

**StockRow · 64** (Markets movers, search results)
```html
<li class="row row-stock"><span class="crest c36 sec-arms" aria-hidden="true">CN</span><div class="row-main"><span class="row-title">CNBR</span><span class="row-sub">Cannonbright Foundries</span></div><svg class="spark" viewBox="0 0 48 20" aria-hidden="true"><path class="spark-open" d="M0 18.0H48"></path><path class="plot-line is-up" d="M0.0 18.0L5.3 15.9L10.7 17.5L16.0 13.2L21.3 11.1L26.7 12.7L32.0 8.4L37.3 5.2L42.7 6.8L48.0 2.0"></path></svg><div class="row-trail"><span class="row-value">Ð102.66</span><span class="pill-change is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+6.12%</span></div></li>
```
**HoldingRow · 64** (Portfolio top 5)
```html
<li class="row row-holding"><span class="crest c36 sec-shipping" aria-hidden="true">KR</span><div class="row-main"><span class="row-title">KRKN</span><span class="row-sub">3,000 shares</span></div><div class="row-trail"><span class="row-value">Ð252,360.00</span><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð31,860.00 (+14.45%)</span></div></li>
```
**PositionRow · 88** (Positions)
```html
<li class="row row-position"><span class="crest c36 sec-shipping" aria-hidden="true">KR</span><div class="row-main">
      <div class="row-line"><span class="row-title">KRKN</span><span class="row-value">Ð252,360.00</span></div>
      <div class="row-line"><span class="row-sub">Kraken Shipping Lines</span><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð31,860.00 (+14.45%)</span></div>
      <div class="row-line"><span class="row-sub">3,000 shares · paid Ð73.50</span><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð5,700.00</span></div>
    </div></li>
```
**CompanyMetricsRow · 76 + column header · 36** (Markets › All companies; header is opaque and sticky)
```html
<div class="metrics-head"><button class="qmark s28" type="button" aria-label="What these columns mean" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button><span>Company size</span><span>Sales growth</span><span>Profit margin</span><span>Price vs. profit</span><span>Debt vs. equity</span></div>
<ul class="card" role="list">
  <li class="row row-metrics"><div class="metrics-l1"><span class="crest c28 sec-shipping" aria-hidden="true">KR</span><span class="row-title">KRKN</span><span class="row-sub spacer">Kraken Shipping Lines</span><span class="row-value">Ð84.12</span><span class="pill-change is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+2.31%</span></div><div class="metrics-cells"><span>Ð20.36B</span><span>7.2%</span><span>14.0%</span><span>17.8</span><span>0.62</span></div></li>
</ul>
```
**KeyValueRow · 44** (Balances, order detail, ticket preview)
```html
<li class="row row-kv"><span class="label-q"><span>Fee (0.10%)</span><button class="qmark" type="button" aria-label="What is Trading fee (commission)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="kv-value">Ð42.06</span></li>
```
**KeyValueRow with inline InfoTip** (inside sheets: the "?" expands in place, no second sheet)
```html
<li class="row row-kv has-expand">
  <div class="kv-line"><span class="label-q"><span>Fee (0.10%)</span><button class="qmark is-open" type="button" aria-label="What is Trading fee (commission)?" aria-expanded="true"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="kv-value">Ð42.06</span></div>
  <div class="infotip-inline">
    <p><b>What it is:</b> A charge on every buy and every sell, set by the host as a percent of the order value (0.10% by default).</p>
    <p><b>Why it matters:</b> Fees come out of your account win or lose, so trading back and forth adds up quickly.</p>
    <p><b>Usually a good sign when</b> your expected gain is much larger than the fee, but the fee is charged even on losing trades.</p>
  </div>
</li>
```
**ExplainRow · 88+** (Key stats, Financials). Label + "?", value, everyday sentence, peer comparison. Use "Rest of the market: …" when the
sector has fewer than 3 companies. No colour on the value.
```html
<li class="row row-explain"><div class="explain-head"><span class="label-q"><span class="explain-label">Price vs. profit</span><button class="qmark" type="button" aria-label="What is Price vs. profit (P/E ratio)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="explain-value">17.8</span></div><p class="explain-sentence">You pay Ð17.80 for every Ð1 of yearly profit.</p><p class="explain-avg">Sector average: 22.1</p></li>
```
**DisclosureRow · 44 / 60**
```html
<li class="row row-disclosure sep-57"><span class="icon-tile"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg></span><div class="row-main"><span class="row-title is-body">How the game works</span></div><svg class="ic row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></li>
<li class="row row-disclosure"><div class="row-main"><span class="row-title is-body">Price vs. profit</span></div><span class="row-detail">P/E ratio</span><svg class="ic row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></li>
<li class="row row-disclosure has-sub"><div class="row-main"><span class="row-title is-body">Crown lifts tariffs across the Spanish Main</span><span class="row-sub">Whole market · 12:48</span></div><svg class="ic row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></li>
```
**ActivityRow · 64**
```html
<li class="row row-activity"><span class="icon-circle"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg></span><div class="row-main"><span class="row-title is-body">Bought 500 KRKN</span><span class="row-sub is-ter">Tick 1,284 · 14:02:30</span></div><div class="row-trail"><span class="row-value is-regular">−Ð42,102.06</span><span class="row-sub">Filled</span></div><svg class="ic row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></li>
<!-- sell: circle-minus · not placed: triangle-alert, status "Not placed" (never loss red) -->
```
**StandingRow · 60** (your row `.is-you` with the You pill before the value; padding 8 keeps it 60; ChangePill over the rank move in `--label-2`, not gain/loss)
```html
<li class="row row-standing"><span class="rank">2</span><span class="crest c32 crew-hull" aria-hidden="true">TC</span><div class="row-main"><span class="row-title is-body">Tortuga Capital</span><span class="row-sub num">Ð1,097,700.00</span></div><div class="row-trail"><span class="pill-change is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+9.77%</span><span class="move" aria-label="up 1 place"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>1</span></div></li>
<li class="row row-standing is-you"><span class="rank">3</span><span class="crest c32 crew-hull" aria-hidden="true">SW</span><div class="row-main"><span class="row-title is-body">Saltwind Traders</span><span class="row-sub num"><span class="pill-you">You</span>Ð1,084,219.55</span></div><div class="row-trail"><span class="pill-change is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+8.42%</span><span class="move" aria-label="down 1 place"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M0 .5h8L4 7.5Z"></path></svg>1</span></div></li>
```
**ToggleRow · 44** and **ActionRow · 44**
```html
<li class="row row-toggle"><span class="row-title is-body">Solid bars</span><span class="switch is-on" role="switch" aria-checked="true" aria-label="Solid bars"></span></li>
<!-- off: is-off · styled fallback (Chromebooks, iOS below 17.4): add is-fallback -->
<li class="row row-action">Clear recent searches</li>
<li class="row row-action is-destructive">Sign out</li>
```
**Large text (root 23px):** two-column rows stack
```html
<!-- wrap the list in class="type-xxxl" only for large-text specimens; add is-stacked to the row -->
<div class="type-xxxl">
  <ul class="card" role="list">
    <li class="row row-stock is-stacked"><span class="crest c36 sec-shipping" aria-hidden="true">KR</span><div class="row-main"><span class="row-title">KRKN</span><span class="row-sub">Kraken Shipping Lines</span></div><div class="row-trail"><span class="row-value">Ð84.12</span><span class="pill-change is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+2.31%</span></div></li>
    <li class="row row-explain is-stacked"><div class="explain-head"><span class="label-q"><span class="explain-label">Price vs. profit</span><button class="qmark" type="button" aria-label="What is Price vs. profit (P/E ratio)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="explain-value">17.8</span></div><p class="explain-sentence">You pay Ð17.80 for every Ð1 of yearly profit.</p><p class="explain-avg">Sector average: 22.1</p></li>
  </ul>
</div>
```

### 5.6 SegmentedControl
Track `--fill`, 32px (`.is-lg` 36px for Buy | Sell), padding 2 · thumb `--segment-thumb` with `--on-segment-thumb` label, shadow
0 1px 3px rgba(0,0,0,.18) · Footnote 13/18, 600 selected, 500 others · text only, 2-5 segments, each 56px or wider · each segment has a
44px tall invisible hit area · never for app sections.
```html
<div class="seg is-lg" role="radiogroup" aria-label="Order side"><span class="seg-item is-selected" role="radio" aria-checked="true">Buy</span><span class="seg-item" role="radio" aria-checked="false">Sell</span></div>
<div class="seg" role="radiogroup" aria-label="Markets view"><span class="seg-item is-selected" role="radio" aria-checked="true">Basics</span><span class="seg-item" role="radio" aria-checked="false">Price</span><span class="seg-item" role="radio" aria-checked="false">Value</span><span class="seg-item" role="radio" aria-checked="false">Health</span><span class="seg-item" role="radio" aria-checked="false">Analysts</span></div>
<!-- item states: is-selected · is-pressed · is-disabled (+ aria-disabled) · track focus: add is-focus to .seg -->
```

### 5.7 Buttons
Capsules · `.btn-lg` 50 (Headline, padding 0 20) · `.btn-md` 34 (Subhead 600, 0 14) · `.btn-sm` 28 (Footnote 600, 0 10) · `.btn-block`
fills 361 in sheets and footers · styles `.btn-prominent` (one per view) `.btn-buy` `.btn-sell` `.btn-tinted` `.btn-tinted-sell`
`.btn-gray` (`.on-grouped` on the page) `.btn-plain` `.btn-destructive` `.btn-destructive-tinted` (host End game only) ·
states `.is-pressed` `.is-disabled` (+ `aria-disabled` and a visible reason nearby) `.is-loading` (spinner + changed label, `aria-busy`)
`.is-focus` · floating company-page pair: Tinted Sell x 16-192 + Buy x 201-377 in `.at-float` over `.edge-fade`.
```html
<button class="btn btn-prominent btn-lg btn-block" type="button"><span>Preview order</span></button>
<button class="btn btn-buy btn-lg" type="button"><span>Buy</span></button>
<button class="btn btn-tinted-sell btn-lg" type="button"><span>Sell</span></button>
<button class="btn btn-tinted btn-md" type="button"><span>Open in Learn</span></button>
<button class="btn btn-gray btn-md" type="button"><span>Trade again</span></button>
<button class="btn btn-plain btn-md" type="button"><span>Edit order</span></button>
<button class="btn btn-destructive btn-md" type="button"><span>Sign out</span></button>
<button class="btn btn-destructive-tinted btn-lg" type="button"><span>End game…</span></button>
<button class="btn btn-tinted btn-sm" type="button"><span>Use max (2,949 shares)</span></button>
<!-- states -->
<button class="btn btn-prominent btn-lg is-pressed" type="button"><span>Preview order</span></button>
<button class="btn btn-prominent btn-lg is-disabled" type="button" aria-disabled="true"><span>Preview order</span></button>
<button class="btn btn-buy btn-lg btn-block is-loading" type="button" aria-busy="true"><svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56"></path></svg><span>Placing order…</span></button>
<button class="btn btn-prominent btn-lg is-focus" type="button"><span>Preview order</span></button>
<!-- glass bar button over content --> <button class="bar-btn glass" type="button" aria-label="Trade"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg></button>
<!-- 44px icon circle --> <button class="btn btn-gray btn-circle" type="button" aria-label="Close"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>
```

### 5.8 Sheet
Always opaque `--elevated` + `--float-shadow`, over `.scrim` (`.is-info` for explanations; `.is-second`, z 75, for an action sheet or
alert shown over a sheet, such as "Discard this order?" over the ticket) · large: top 69, radius 24 top corners ·
medium: inset 8, height 426, radius 32 · content height: `.is-content` with an inline top · header 56 with a 44px `--fill` Close ·
grabber 36×5 `--control-off` in a 64×44 button, only on resizable sheets · `.sheet-footer` pins the primary button.
```html
<!-- draw the presenting screen first, then: -->
<div class="scrim"></div>
<section class="sheet is-large" role="dialog" aria-modal="true" aria-label="Buy KRKN">
  <div class="sheet-header"><button class="sheet-close" type="button" aria-label="Close"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button><h2 class="sheet-title">Buy KRKN</h2><span class="sheet-spacer"></span></div>
  <div class="sheet-body">
    …
  </div>
  <div class="sheet-footer"><button class="btn btn-prominent btn-lg btn-block" type="button"><span>Preview order</span></button></div>
</section>
```
```html
<div class="scrim is-info"></div>
<section class="sheet is-medium" role="dialog" aria-modal="true" aria-label="Market open">
  <button class="sheet-grabber" type="button" aria-label="Resize sheet" aria-expanded="false"></button>
  <div class="sheet-header"><span class="sheet-spacer"></span><h2 class="sheet-title">Market open</h2><button class="sheet-close" type="button" aria-label="Close"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>
  <div class="sheet-body">…</div>
</section>
<!-- content-height sheet (InfoTip, Crew card): class="sheet is-content" with an inline top, e.g. style="top: 360px;" -->
<!-- single-view sheets: leading Cancel / trailing Done → <button class="sheet-action is-done" type="button">Done</button> -->
```

### 5.9 InfoTip sheet and "What these numbers mean"
Opens at content height so all three blocks show without dragging · title Title 2 bold (label) · term Subhead `--label-2` · blocks
What it is / Why it matters / Usually a good sign when… (COPY §2 glossary) · Tinted medium "Open in Learn".
```html
<div class="scrim is-info"></div>
<section class="sheet is-content" role="dialog" aria-modal="true" aria-label="Price vs. profit" style="top: 318px;">
  <div class="sheet-header"><span class="sheet-spacer"></span><button class="sheet-close" type="button" aria-label="Close"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>
  <div class="infotip">
    <h2 class="infotip-title">Price vs. profit</h2>
    <p class="infotip-term">P/E ratio</p>
    <div class="infotip-block"><h3 class="infotip-h">What it is</h3><p class="infotip-p">P/E, short for price-to-earnings, is the share price divided by yearly profit per share. Earnings is another word for profit.</p></div>
    <div class="infotip-block"><h3 class="infotip-h">Why it matters</h3><p class="infotip-p">It shows what you pay for each Ð1 of profit, so you can compare prices fairly. A Ð50 share with Ð5 of profit per share has a P/E of 10.</p></div>
    <div class="infotip-block"><h3 class="infotip-h">Usually a good sign when…</h3><p class="infotip-p">it is lower than similar companies, but a very low P/E can mean investors expect trouble.</p></div>
    <button class="btn btn-tinted btn-md mt-24" type="button"><span>Open in Learn</span></button>
  </div>
</section>
```
```html
<section class="sheet is-large" role="dialog" aria-modal="true" aria-label="What these columns mean">
  <div class="sheet-header"><button class="sheet-close" type="button" aria-label="Close"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button><h2 class="sheet-title">What these columns mean</h2><span class="sheet-spacer"></span></div>
  <div class="sheet-body">
    <div class="help-item">
      <h3 class="list-title">Company size (market cap)</h3>
      <div class="infotip-inline">
        <p><b>What it is:</b> The value of all of a company's shares added together: the share price times the number of shares.</p>
        <p><b>Why it matters:</b> Size puts other numbers in context: bigger companies usually have bigger sales and profits, so compare margins and growth too.</p>
        <p><b>Usually a good sign when</b> its size is backed by real profits, but being big does not protect a company from falling prices.</p>
      </div>
      <a class="list-link" href="#">Open in Learn</a>
    </div>
    <!-- one .help-item per column shown -->
  </div>
</section>
```

### 5.10 Menu
Glass, radius 28, min width 220 · rows 44 Body · checkmark column for choice menus · icons on every item of a group or none ·
group separator 8px `--fill-2` · destructive items last in `--destructive-strong`.
```html
<div class="menu glass" role="menu" aria-label="Sort positions">
  <div class="menu-item" role="menuitemradio" aria-checked="true"><span class="menu-check"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg></span>Value</div>
  <div class="menu-item" role="menuitemradio" aria-checked="false"><span class="menu-check"></span>Total gain %</div>
  <div class="menu-item" role="menuitemradio" aria-checked="false"><span class="menu-check"></span>Session change</div>
  <div class="menu-item" role="menuitemradio" aria-checked="false"><span class="menu-check"></span>Name</div>
</div>

<div class="menu glass" role="menu" aria-label="More options">
  <div class="menu-item" role="menuitem">Read a company in 5 questions<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-1.8 5.41a2 2 0 0 1-1.27 1.27l-5.41 1.8 1.8-5.41a2 2 0 0 1 1.27-1.27z"></path></svg></div>
  <div class="menu-item" role="menuitem">Add to watchlist<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.57-4.46 6.32-.92z"></path></svg></div>
  <div class="menu-sep" role="separator"></div>
  <!-- destructive items go last, in destructive-strong (host example) -->
  <div class="menu-item is-destructive" role="menuitem">End game…<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg></div>
</div>
```

### 5.11 ActionSheet and Alert
Action sheet: opaque, inset 8 (bottom 42 = 34 + 8), radius 28, title Footnote 600 `--label-2`, actions 56 (destructive first), separate Cancel
capsule 8px below. Over a sheet use `.scrim.is-second` so the sheet dims too.
Alert (host only): 300 wide, padding 20, radius 28, `--glass-solid` surface, left-aligned title and message, 44px capsule buttons.
```html
<!-- drawn over the Trade sheet, so it gets the second scrim (z 75) that also dims the sheet -->
<div class="scrim is-second"></div>
<div class="action-sheet" role="dialog" aria-modal="true" aria-label="Discard this order?" style="position: absolute; left: 8px; right: 8px; bottom: 42px; z-index: 80;">
  <div class="as-group">
    <div class="as-header"><p class="as-title">Discard this order?</p></div>
    <div class="as-action is-destructive" role="button">Discard order</div>
  </div>
  <div class="as-cancel" role="button">Keep editing</div>
</div>
```
```html
<div class="scrim"></div>
<div class="alert" role="alertdialog" aria-modal="true" aria-label="End the game now?" style="position: absolute; left: 46px; top: 280px; z-index: 80;">
  <h2 class="alert-title">End the game now?</h2>
  <p class="alert-msg">Trading closes for good, holdings are valued at closing prices, and the market reveal opens. This can't be undone.</p>
  <div class="alert-field">END</div>
  <div class="alert-buttons"><button class="btn btn-gray" type="button"><span>Cancel</span></button><button class="btn btn-destructive-tinted is-disabled" type="button" aria-disabled="true"><span>End game</span></button></div>
</div>
```

### 5.12 Toast and Banner
Toast: glass capsule at y 111 (never over the collapsed bar), min 52, 22px icon, Callout text, `--tint-strong` action, 44px Close.
Banner: inline card radius 24, padding 16, 22px icon, Headline title (+ flavor in `--label-2`), Subhead body, optional small button.
Never red backgrounds. Ended banner is a hull card: add `dark` with `is-ended`.
```html
<div class="at-toast">
  <div class="toast glass" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg><span class="toast-text">Update ready</span><button class="toast-action" type="button">Reload</button><button class="toast-close" type="button" aria-label="Dismiss"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>
</div>
<div class="toast glass" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg><span class="toast-text">Back online</span><button class="toast-close" type="button" aria-label="Dismiss"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>
<div class="toast glass" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"></path><circle cx="12" cy="12" r="3"></circle></svg><span class="toast-text">Saltwind Traders: Meet the market marked finished.</span><button class="toast-action" type="button">Undo</button><button class="toast-close" type="button" aria-label="Dismiss"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>
```
```html
<div class="banner is-paused" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect></svg><div class="banner-main"><p class="banner-title">Trading paused <span class="flavor">· Becalmed</span></p><p class="banner-body">The host paused the market at tick 1,284. You can preview orders, but you can't place them until trading resumes.</p></div></div>
<div class="banner" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22V8"></path><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path><circle cx="12" cy="5" r="3"></circle></svg><div class="banner-main"><p class="banner-title">Market not open yet <span class="flavor">· Anchored in port</span></p><p class="banner-body">Trading opens when the host starts the game. You can research companies and preview orders now.</p></div></div>
<div class="banner is-ended dark" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg><div class="banner-main"><p class="banner-title">Game ended <span class="flavor">· Anchors dropped</span></p><p class="banner-body">Trading is closed for this game. See the final standings and the market reveal.</p><button class="btn btn-prominent btn-sm" type="button"><span>See final results</span></button></div></div>
<div class="banner" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h.01"></path><path d="M8.5 16.43a5 5 0 0 1 7 0"></path><path d="M5 12.86a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.86a10 10 0 0 0-2-1.52"></path><path d="M2 8.82a15 15 0 0 1 4.18-2.64"></path><path d="M22 8.82a15 15 0 0 0-11.29-3.76"></path><path d="m2 2 20 20"></path></svg><div class="banner-main"><p class="banner-title">You're offline</p><p class="banner-body">Prices and standings will update when you reconnect.</p></div></div>
<div class="banner" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg><div class="banner-main"><p class="banner-title">Prices may be out of date</p><p class="banner-body">The last price update was 2 minutes ago. Wait a moment, or tap Reload.</p><button class="btn btn-tinted btn-sm" type="button"><span>Reload</span></button></div></div>
<div class="banner" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg><div class="banner-main"><p class="banner-title">Final session <span class="flavor">· Land in sight</span></p><p class="banner-body">This is the last of 8 sessions. The game ends in 6:00:00.</p></div></div>
<div class="banner" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><div class="banner-main"><p class="banner-title">Trading turned off for your crew</p><p class="banner-body">The host has turned off trading for your crew. You can still research companies and view your account.</p></div></div>
```

### 5.13 Chart card, Sparkline, AllocationBar, RangeBar
Card `--cell` radius 24 padding 16 · summary sentence (Subhead `--label-2`, also the screen-reader summary) · plot 220 company /
180 portfolio / 160 dispatch (`.chart-plot`, `.h220`, `.h160`) · line 2px gain if last ≥ reference else loss · area line colour 14% → 0 ·
dashed reference 1px 4 4 `--chart-baseline` with a text label · y labels trailing Caption 1 `--label-3` · range control under the plot.
Gradient ids must be unique in each file. Session times: session 2 began at 09:20 (48-hour game, 6-hour sessions, 37:17:42 left at 14:02:30).
```html
<div class="chart-card">
  <p class="chart-summary">Up 2.31% this session. Range Ð81.90 to Ð84.60.</p>
  <div class="chart-plot h220" role="slider" aria-label="KRKN price chart" aria-valuetext="14:02:30, 84.12 doubloons">
    <svg viewBox="0 0 329 220" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="krkn-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-gain" stop-opacity=".14"></stop><stop offset="1" class="stop-gain" stop-opacity="0"></stop></linearGradient></defs>
      <path class="plot-ref" d="M0 184.8H276"></path>
      <path d="M0 184.8L11.5 193.5L23 204.4L34.5 208L46 197.1L57.5 179L69 182.6L80.5 157.2L92 135.4L103.5 142.7L115 120.9L126.5 99.1L138 106.4L149.5 77.3L161 59.2L172.5 41L184 22.9L195.5 12L207 26.5L218.5 37.4L230 33.8L241.5 51.9L253 55.6L264.5 42.5L276 46.8L276 220L0 220Z" fill="url(#krkn-area)"></path>
      <path class="plot-line is-up" d="M0 184.8L11.5 193.5L23 204.4L34.5 208L46 197.1L57.5 179L69 182.6L80.5 157.2L92 135.4L103.5 142.7L115 120.9L126.5 99.1L138 106.4L149.5 77.3L161 59.2L172.5 41L184 22.9L195.5 12L207 26.5L218.5 37.4L230 33.8L241.5 51.9L253 55.6L264.5 42.5L276 46.8"></path>
    </svg>
    <span class="chart-ref-label" style="top: 184.8px;">Session open</span>
    <span class="chart-y" style="top: 12px;">Ð84.60</span>
    <span class="chart-y" style="top: 110px;">Ð83.25</span>
    <span class="chart-y" style="top: 208px;">Ð81.90</span>
  </div>
  <div class="chart-x" style="padding-right: 53px;"><span>09:20</span><span>11:41</span><span>14:02</span></div>
  <div class="seg" role="radiogroup" aria-label="Chart range"><span class="seg-item" role="radio" aria-checked="false">1H</span><span class="seg-item is-selected" role="radio" aria-checked="true">6H</span><span class="seg-item" role="radio" aria-checked="false">24H</span><span class="seg-item" role="radio" aria-checked="false">All</span></div>
</div>
<!-- scrubbing: add inside the svg, then replace the StockHeader price and change lines with "Ð84.06 · 14:01:30 · tick 1,282" (illustrative) -->
<!-- <path class="scrub-rule" d="M241.5 0V220"></path><circle class="scrub-dot is-up" cx="241.5" cy="51.2" r="4"></circle> -->
```
```html
<!-- Sparkline 48x20 (StockRow) -->
<svg class="spark" viewBox="0 0 48 20" aria-hidden="true"><path class="spark-open" d="M0 18.0H48"></path><path class="plot-line is-up" d="M0.0 18.0L5.3 15.9L10.7 17.5L16.0 13.2L21.3 11.1L26.7 12.7L32.0 8.4L37.3 5.2L42.7 6.8L48.0 2.0"></path></svg>

<!-- AllocationBar: 12px, 2px gaps; legend in order (KRKN and SALT share the Shipping fill) -->
<div class="alloc" role="img" aria-label="Where your money is: KRKN 23.3%, PRYL 15.7%, ASTR 13.5%, MRED 11.9%, CJST 5.7%, SALT 4.2%, CRSD 2.9%, cash 22.9%">
  <span class="alloc-seg sec-shipping" style="flex: 23.3 1 0;"></span><span class="alloc-seg sec-banking" style="flex: 15.7 1 0;"></span><span class="alloc-seg sec-maps" style="flex: 13.5 1 0;"></span><span class="alloc-seg sec-arms" style="flex: 11.9 1 0;"></span><span class="alloc-seg sec-provisions" style="flex: 5.7 1 0;"></span><span class="alloc-seg sec-shipping" style="flex: 4.2 1 0;"></span><span class="alloc-seg sec-relics" style="flex: 2.9 1 0;"></span><span class="alloc-seg is-cash" style="flex: 22.9 1 0;"></span>
</div>
<div class="alloc-legend" aria-hidden="true">
  <span class="alloc-key"><span class="alloc-swatch sec-shipping"></span>KRKN<span class="num">23.3%</span></span>
  <span class="alloc-key"><span class="alloc-swatch sec-banking"></span>PRYL<span class="num">15.7%</span></span>
  <span class="alloc-key"><span class="alloc-swatch is-cash"></span>Cash<span class="num">22.9%</span></span>
</div>

<!-- RangeBar: session range, 4px track, 8px marker at (84.12 − 81.90) ÷ (84.60 − 81.90) = 82.2% -->
<div class="range" aria-hidden="true"><span class="range-track"></span><span class="range-marker" style="left: 82.2%;"></span></div>
<div class="range-labels"><span>Ð81.90</span><span>Ð84.60</span></div>
```

### 5.14 StockHeader
Crest 44 · name Title 2 bold over "KRKN · Shipping & Salvage" · price Large Title bold · change line Subhead semibold + "?" · "As of" Footnote
`--label-3` + "?". Measured 141px tall, matching MOBILE §7.7 (y 111-252).
```html
<div class="stock-header" aria-label="Kraken Shipping Lines, 84.12 doubloons, up 2.31 percent this session">
  <div class="sh-top"><span class="crest c44 sec-shipping" aria-hidden="true">KR</span><div><h1 class="sh-name">Kraken Shipping Lines</h1><p class="sh-sub">KRKN · Shipping &amp; Salvage</p></div></div>
  <p class="sh-price">Ð84.12</p>
  <div class="sh-change"><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð1.90 (+2.31%)</span><span class="sh-when">this session</span><button class="qmark" type="button" aria-label="What is Change this session (session change)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></div>
  <div class="sh-asof"><span>As of tick 1,284 · 14:02:30</span><button class="qmark" type="button" aria-label="What is Price update (market tick)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></div>
</div>
```

### 5.15 PositionSummary
Cells 64 tall (label Footnote + "?" over value Headline). "+Ð31,860.00 (+14.45%)" cannot fit one line in a 180px cell, so the percent wraps
and that grid row is 86 tall; the card is 214 + 44 footer, so push later sections down (MOBILE §7.0) rather than shrinking the value.
```html
<section class="list" aria-label="Your position">
  <div class="list-header"><h2 class="list-title">Your position</h2></div>
  <div class="card">
    <div class="pos-grid">
      <div class="pos-cell"><span class="pos-label">Shares owned<button class="qmark" type="button" aria-label="What is Share of a company (shares of stock)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="pos-value">3,000</span></div>
      <div class="pos-cell"><span class="pos-label">Current value<button class="qmark" type="button" aria-label="What is Money invested (market value of holdings)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="pos-value">Ð252,360.00</span></div>
      <div class="pos-cell"><span class="pos-label">Avg. price paid<button class="qmark" type="button" aria-label="What is Average price paid (average cost)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="pos-value">Ð73.50</span></div>
      <div class="pos-cell"><span class="pos-label">Total gain/loss<button class="qmark" type="button" aria-label="What is Total gain/loss (total return)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="pos-value"><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð31,860.00</span> <span class="chg is-up">(+14.45%)</span></span></div>
      <div class="pos-cell"><span class="pos-label">Session change<button class="qmark" type="button" aria-label="What is Change this session (session change)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="pos-value"><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+Ð5,700.00</span></span></div>
      <div class="pos-cell"><span class="pos-label">Share of account<button class="qmark" type="button" aria-label="What is Share of account (% of account)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="pos-value">23.3%</span></div>
    </div>
    <div class="pos-footer" style="box-shadow: inset 0 .5px 0 var(--separator);"><span>Cash available to trade: Ð248,349.55</span><button class="qmark" type="button" aria-label="What is Cash available to trade (buying power)?" aria-haspopup="dialog"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></div>
  </div>
</section>
<!-- not owned: one row <li class="row">You don't own any KRKN yet</li> above the same footer -->
```

### 5.16 Trade ticket (Entry)
Large sheet, header X + "Buy KRKN" · quote row 40 · Buy | Sell 36 · Shares | Doubloons 32 × 220 · amount 48/56 with 44px step circles ·
helper Subhead `--label-2` · chips 36 · summary box `--elevated-cell` radius 16 · keypad 3×4, keys 48 tall, gap 4, digits Title 1
regular, pressed = 64px `--fill` circle · Preview order in `.sheet-footer`. Measured on 393×852: the share-of-account footnote wraps to two lines,
so the summary box is 116 (MOBILE §7.10 lists 94) and the keypad ends at y 737; the pinned footer button sits at 768-818, still clear.
```html
<!-- inside .sheet.is-large, below the header -->
<div class="sheet-body">
  <div class="ticket-quote">
    <span class="crest c32 sec-shipping" aria-hidden="true">KR</span>
    <div class="quote-side"><span class="t-headline num">Ð84.12</span><span class="t-footnote t-em"><span class="chg is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+2.31%</span> <span style="font-weight: 400; color: var(--label-2);">this session</span></span></div>
    <div class="quote-side is-end"><span class="label-q t-footnote" style="color: var(--label-2);">Cash available<button class="qmark s17" type="button" aria-label="What is Cash available to trade (buying power)?" aria-expanded="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></span><span class="t-subhead t-em num">Ð248,349.55</span></div>
  </div>
  <div class="mt-12"><div class="seg is-lg" role="radiogroup" aria-label="Order side"><span class="seg-item is-selected" role="radio" aria-checked="true">Buy</span><span class="seg-item" role="radio" aria-checked="false">Sell</span></div></div>
  <div class="mt-8" style="width: 220px; margin-left: auto; margin-right: auto;"><div class="seg" role="radiogroup" aria-label="Order by"><span class="seg-item is-selected" role="radio" aria-checked="true">Shares</span><span class="seg-item" role="radio" aria-checked="false">Doubloons</span></div></div>
  <div class="amount-row mt-16"><button class="step-circle" type="button" aria-label="Decrease shares"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg></button><span class="amount">500</span><button class="step-circle" type="button" aria-label="Increase shares"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></button></div>
  <p class="amount-helper">≈ Ð42,102.06 with fee</p>
  <div class="chips mt-12" style="justify-content: center;"><span class="chip">10</span><span class="chip">50</span><span class="chip">100</span><span class="chip">Max</span></div>
  <div class="summary-box mt-12">
    <div class="summary-line"><span>Total cost</span><span class="num t-em">Ð42,102.06</span></div>
    <div class="summary-line"><span>Cash after</span><span class="num">Ð206,247.49</span></div>
    <p class="label-q t-footnote" style="margin: 4px 0 0; color: var(--label-2);">This order would make KRKN 27.2% of your account.<button class="qmark s17" type="button" aria-label="What is Share of account (% of account)?" aria-expanded="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button></p>
  </div>
  <div class="keypad mt-12"><button class="key" type="button">1</button><button class="key" type="button">2</button><button class="key" type="button">3</button><button class="key" type="button">4</button><button class="key is-pressed" type="button">5</button><button class="key" type="button">6</button><button class="key" type="button">7</button><button class="key" type="button">8</button><button class="key" type="button">9</button><span class="key" aria-hidden="true"></span><button class="key" type="button">0</button><button class="key" type="button" aria-label="Delete"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5a2 2 0 0 0-1.34.52l-6.33 5.74a1 1 0 0 0 0 1.48l6.33 5.74A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"></path><path d="m12 9 6 6"></path><path d="m18 9-6 6"></path></svg></button></div>
</div>
<!-- Doubloons mode: the blank key becomes "." · Preview order sits in .sheet-footer -->

<!-- problem box replaces the summary box; Preview order is disabled -->
<div class="problem-box" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg><div><p class="t-subhead t-em" style="margin: 0;">Not enough cash</p><p class="t-subhead" style="margin: 2px 0 0;">This order is Ð88,466.93 more than your cash available to trade (Ð248,349.55). Lower the shares or amount, or use the most you can afford.</p><button class="btn btn-tinted btn-sm mt-8" type="button"><span>Use max (2,949 shares)</span></button></div></div>
```

### 5.17 SwipeActions
Positions rows only · Sell (`--loss`) and Buy (`--gain`) 76px each, icon 20 over Caption 1 600 in `--on-side` · content shifted −152px.
```html
<li class="swipe">
  <div class="swipe-actions"><span class="swipe-action is-sell"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path></svg>Sell</span><span class="swipe-action is-buy"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>Buy</span></div>
  <div class="swipe-content"><div class="row row-position no-sep">…PositionRow content…</div></div>
</li>
```

### 5.18 EmptyState and 5.19 Skeleton
```html
<div class="card">
  <div class="empty"><svg class="ic empty-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect x="2" y="6" width="20" height="14" rx="2"></rect></svg><p class="empty-title">No positions yet</p><p class="empty-body">You haven't bought any shares. Research a company, then place a small order to get started.</p><button class="btn btn-tinted btn-md" type="button"><span>Open Markets</span></button><p class="empty-flavor">The hold is empty.</p></div>
</div>
<!-- hull variant -->
<div class="empty is-hull dark"><svg class="ic empty-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-1.8 5.41a2 2 0 0 1-1.27 1.27l-5.41 1.8 1.8-5.41a2 2 0 0 1 1.27-1.27z"></path></svg><p class="empty-title">The market reveal isn't open yet</p><p class="empty-body">It opens when the game ends. Until then, the health scores stay hidden.</p><p class="empty-flavor">The fog hasn't lifted.</p></div>
```
```html
<div class="card" aria-busy="true">
  <span class="sr-only">Loading prices…</span>
  <div class="row row-stock"><span class="skel skel-circle" style="width: 36px; height: 36px;"></span><div class="row-main gap-4"><span class="skel skel-line" style="width: 60%;"></span><span class="skel skel-line" style="width: 40%;"></span></div><span class="skel skel-title is-shimmer" style="width: 72px;"></span></div>
</div>
<span class="skel skel-block" style="height: 180px;"></span>
```

### 5.20 Badge, pill, chip
ChangePill min 64×26 · TagPill 22 (never on a tint-soft row) · YouPill 22 · CountBadge 18 · StatusDot 8 beside its text · Chip 36.
```html
<span class="pill-change is-up"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .5 8 7.5H0Z"></path></svg>+6.12%</span> <span class="pill-change is-down"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M0 .5h8L4 7.5Z"></path></svg>−3.46%</span> <span class="pill-change is-flat">0.00%</span>
<span class="pill-tag"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path><path d="M7 6h1v4"></path><path d="m16.71 13.88.7.71-2.82 2.82"></path></svg>Earnings</span> <span class="pill-tag">You own this</span>
<span class="pill-you">You</span> <span class="badge-count">1</span>
<span class="hstack gap-8"><span class="status-dot is-open" aria-hidden="true"></span>Market open</span>
<div class="chips"><span class="chip">10</span><span class="chip">50</span><span class="chip">100</span><span class="chip">Max</span></div>
<span class="chip on-grouped">Cursed Relics <span class="chg is-down"><svg class="tri" viewBox="0 0 8 8" aria-hidden="true"><path d="M0 .5h8L4 7.5Z"></path></svg>−3.46%</span></span>
```

### 5.21 Crest, 5.22 Medallion and Podium, 5.23 WaxSeal
Crest letters are system 600 at 0.36 × diameter with a gold ring; always `aria-hidden` with the name next to it. Medallions and podium
live on hull screens only; rank sits under the metal. The wax seal is ornament only: crimson (Voyage complete) or brass (order filled).
```html
<span class="crest c28 sec-shipping" aria-hidden="true">KR</span><span class="crest c44 sec-shipping" aria-hidden="true">KR</span><span class="crest c64 crew-hull" aria-hidden="true">SW</span>
<!-- sector classes: sec-shipping sec-banking sec-maps sec-arms sec-relics sec-hospitality sec-provisions sec-livestock sec-marque · crews: crew-hull -->
```
```html
<div class="hull" style="padding: 24px 12px 0; border-radius: 24px;">
<div class="podium" aria-label="Final standings: 1 Queen Anne's Revenue, 2 Tortuga Capital, 3 Saltwind Traders">
  <div class="podium-col"><div class="medal m80 is-silver" aria-hidden="true"><span class="crest c52 crew-hull" aria-hidden="true">TC</span></div><p class="medal-rank">2</p><p class="podium-name">Tortuga Capital</p><p class="podium-value">Ð1,142,905.30</p><div class="podium-step h72"></div></div>
  <div class="podium-col"><div class="medal m96 is-gold" aria-hidden="true"><span class="crest c64 crew-hull" aria-hidden="true">QA</span></div><p class="medal-rank">1</p><p class="podium-name">Queen Anne's Revenue</p><p class="podium-value">Ð1,187,420.66</p><div class="podium-step h96"></div></div>
  <div class="podium-col"><div class="medal m80 is-bronze" aria-hidden="true"><span class="crest c52 crew-hull" aria-hidden="true">SW</span></div><p class="medal-rank">3</p><p class="podium-name">Saltwind Traders</p><p class="podium-value">Ð1,104,630.18</p><div class="podium-step h56"></div></div>
</div>
</div>
```
```html
<svg class="seal s64 is-brass" viewBox="0 0 64 64" aria-hidden="true"><path class="seal-disc" d="M32.00 4.44Q39.22 0.37 43.70 7.71Q52.72 6.01 53.69 14.70Q60.94 18.06 58.11 26.04Q65.00 32.00 58.69 38.09Q60.72 45.83 53.17 48.88Q52.43 57.61 44.01 56.94Q39.38 64.33 32.00 58.84Q24.80 63.55 20.07 56.78Q11.47 57.74 11.16 48.62Q2.20 46.35 5.36 38.08Q-0.28 32.00 5.07 25.85Q1.98 17.54 10.87 15.15Q12.02 6.95 20.09 7.28Q24.69 -0.02 32.00 4.44Z"></path><path class="seal-rim" d="M32.00 4.44Q39.22 0.37 43.70 7.71Q52.72 6.01 53.69 14.70Q60.94 18.06 58.11 26.04Q65.00 32.00 58.69 38.09Q60.72 45.83 53.17 48.88Q52.43 57.61 44.01 56.94Q39.38 64.33 32.00 58.84Q24.80 63.55 20.07 56.78Q11.47 57.74 11.16 48.62Q2.20 46.35 5.36 38.08Q-0.28 32.00 5.07 25.85Q1.98 17.54 10.87 15.15Q12.02 6.95 20.09 7.28Q24.69 -0.02 32.00 4.44Z"></path><circle class="seal-ring" cx="32" cy="32" r="20"></circle><path class="seal-rose" d="M32.00 18.00L32.99 29.60L37.30 26.70L34.40 31.01L46.00 32.00L34.40 32.99L37.30 37.30L32.99 34.40L32.00 46.00L31.01 34.40L26.70 37.30L29.60 32.99L18.00 32.00L29.60 31.01L26.70 26.70L31.01 29.60Z"></path><circle class="seal-rose" cx="32" cy="32" r="1.8"></circle></svg>
<svg class="seal s120 is-crimson" viewBox="0 0 64 64" aria-hidden="true"><path class="seal-disc" d="M32.00 4.44Q39.22 0.37 43.70 7.71Q52.72 6.01 53.69 14.70Q60.94 18.06 58.11 26.04Q65.00 32.00 58.69 38.09Q60.72 45.83 53.17 48.88Q52.43 57.61 44.01 56.94Q39.38 64.33 32.00 58.84Q24.80 63.55 20.07 56.78Q11.47 57.74 11.16 48.62Q2.20 46.35 5.36 38.08Q-0.28 32.00 5.07 25.85Q1.98 17.54 10.87 15.15Q12.02 6.95 20.09 7.28Q24.69 -0.02 32.00 4.44Z"></path><path class="seal-rim" d="M32.00 4.44Q39.22 0.37 43.70 7.71Q52.72 6.01 53.69 14.70Q60.94 18.06 58.11 26.04Q65.00 32.00 58.69 38.09Q60.72 45.83 53.17 48.88Q52.43 57.61 44.01 56.94Q39.38 64.33 32.00 58.84Q24.80 63.55 20.07 56.78Q11.47 57.74 11.16 48.62Q2.20 46.35 5.36 38.08Q-0.28 32.00 5.07 25.85Q1.98 17.54 10.87 15.15Q12.02 6.95 20.09 7.28Q24.69 -0.02 32.00 4.44Z"></path><circle class="seal-ring" cx="32" cy="32" r="20"></circle><path class="seal-rose" d="M32.00 18.00L32.99 29.60L37.30 26.70L34.40 31.01L46.00 32.00L34.40 32.99L37.30 37.30L32.99 34.40L32.00 46.00L31.01 34.40L26.70 37.30L29.60 32.99L18.00 32.00L29.60 31.01L26.70 26.70L31.01 29.60Z"></path><circle class="seal-rose" cx="32" cy="32" r="1.8"></circle></svg>
```

### 5.24 Stepper and 5.25 Toggle
```html
<div class="stepper" role="group" aria-label="Fine adjust"><button class="stepper-half is-disabled" type="button" aria-label="Decrease" aria-disabled="true"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg></button><button class="stepper-half" type="button" aria-label="Increase"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></button></div>
<button class="step-circle" type="button" aria-label="Increase shares"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></button>
```
```html
<span class="switch is-on" role="switch" aria-checked="true" aria-label="Solid bars"></span>
<span class="switch is-off" role="switch" aria-checked="false" aria-label="Solid bars"></span>
<span class="switch is-off is-fallback" role="switch" aria-checked="false" aria-label="Keep crews and passwords"></span>
```

## 5. Class index (every class in mobile-kit.css)

**1. Tokens (MOBILE §2.6)**  
`contrast-more` `dark` `hull` `light`

**2. Base and utilities**  
`bg-2` `bg-cell` `bg-elevated` `bg-elevated-cell` `bg-grouped` `bg-plain` `brand` `bx` `hstack` `mono` `nowrap` `num` `spacer` `sr-only` `trunc` `vstack` `w-full`

**3. Type (MOBILE §3.3, default Large size)**  
`c-accent` `c-destructive` `c-destructive-strong` `c-gain` `c-gold` `c-label` `c-label-2` `c-label-3` `c-loss` `c-tint` `c-tint-strong` `t-amount` `t-body` `t-callout` `t-caption1` `t-caption2` `t-em` `t-footnote` `t-headline` `t-large-title` `t-medium` `t-subhead` `t-title1` `t-title2` `t-title3` `type-xxxl`

**4. Icons, triangles, signed changes (MOBILE §3.4, §5 intro)**  
`chg` `ic` `ic-fill` `is-down` `is-flat` `is-neutral` `is-up` `s10` `s12` `s14` `s17` `s18` `s20` `s22` `s28` `s36` `s44` `tri` `w2` `w225` `w25`

**5. Frame skeleton (MOBILE §4.3, §11.1; no drawn status bar or home indicator)**  
`at-bar-strip` `at-float` `at-tabbar` `at-toast` `at-topbar` `edge-fade` `fold` `fold-label` `has-float` `is-plain` `is-se` `phone` `safe-top` `screen`

**6. TabBar (MOBILE §5.1)**  
`is-focus` `is-pressed` `is-rail` `is-selected` `tab` `tab-badge` `tab-label` `tabbar`

**7. LargeTitleNavBar (MOBILE §5.2)**  
`after-title` `bar-avatar` `bar-btn` `bar-capsule` `bar-strip` `bar-subtitle` `bar-title` `glass` `is-idle` `is-open` `is-paused` `large-title` `on-glass` `status-dot` `status-line` `topbar` `topbar-center` `topbar-lead` `topbar-trail`

**8. SearchField (MOBILE §5.3)**  
`is-pinned` `is-typed` `search` `search-cancel` `search-caret` `search-clear` `search-row` `search-text`

**9. InsetGroupedList (MOBILE §5.4)**  
`card` `is-elevated` `list` `list-footer` `list-header` `list-link` `list-title`

**10. ListRow variants (MOBILE §5.5)**  
`explain-avg` `explain-head` `explain-label` `explain-sentence` `explain-value` `has-sub` `icon-circle` `icon-tile` `is-body` `is-destructive` `is-highlighted` `is-regular` `is-secondary` `is-stacked` `is-strong` `is-ter` `is-you` `kv-value` `label-q` `metrics-cells` `metrics-head` `metrics-l1` `move` `no-sep` `rank` `row` `row-action` `row-activity` `row-chevron` `row-detail` `row-disclosure` `row-explain` `row-holding` `row-kv` `row-lead` `row-line` `row-main` `row-metrics` `row-position` `row-standing` `row-stock` `row-sub` `row-title` `row-toggle` `row-trail` `row-value` `sep-16` `sep-56` `sep-57` `sep-60` `sep-64` `sep-96`

**11. SegmentedControl (MOBILE §5.6)**  
`is-disabled` `is-lg` `seg` `seg-item`

**12. Buttons (MOBILE §5.7)**  
`btn` `btn-block` `btn-buy` `btn-circle` `btn-destructive` `btn-destructive-tinted` `btn-glass` `btn-gray` `btn-lg` `btn-md` `btn-plain` `btn-prominent` `btn-sell` `btn-sm` `btn-tinted` `btn-tinted-sell` `is-loading` `on-grouped` `spinner`

**13. Chips, pills and badges (MOBILE §5.20)**  
`badge-count` `chip` `chips` `pill-change` `pill-tag` `pill-you`

**14. InfoTip trigger and sheet (MOBILE §5.9)**  
`has-expand` `help-item` `infotip` `infotip-block` `infotip-h` `infotip-inline` `infotip-p` `infotip-term` `infotip-title` `kv-line` `no-pull` `qmark`

**15. Sheet (MOBILE §5.8): opaque, never glass**  
`is-content` `is-done` `is-info` `is-large` `is-medium` `is-second` `is-static` `scrim` `sheet` `sheet-action` `sheet-body` `sheet-close` `sheet-footer` `sheet-grabber` `sheet-header` `sheet-spacer` `sheet-title`

**16. Menu (MOBILE §5.10): glass**  
`menu` `menu-check` `menu-item` `menu-sep`

**17. ActionSheet and Alert (MOBILE §5.11): opaque**  
`action-sheet` `alert` `alert-buttons` `alert-field` `alert-msg` `alert-title` `as-action` `as-cancel` `as-group` `as-header` `as-message` `as-title`

**18. Toast and Banner (MOBILE §5.12)**  
`banner` `banner-body` `banner-main` `banner-title` `flavor` `is-ended` `toast` `toast-action` `toast-close` `toast-text`

**19. Chart card, sparkline, allocation, range (MOBILE §5.13)**  
`alloc` `alloc-key` `alloc-legend` `alloc-seg` `alloc-swatch` `chart-card` `chart-plot` `chart-ref-label` `chart-summary` `chart-x` `chart-y` `h160` `h220` `is-cash` `plot-compare` `plot-line` `plot-ref` `range` `range-labels` `range-marker` `range-track` `scrub-dot` `scrub-rule` `spark` `spark-open` `stop-gain` `stop-loss`

**20. StockHeader (MOBILE §5.14)**  
`sh-asof` `sh-change` `sh-name` `sh-price` `sh-sub` `sh-top` `sh-when` `stock-header`

**21. PositionSummary (MOBILE §5.15)**  
`pos-cell` `pos-footer` `pos-grid` `pos-label` `pos-value`

**22. Trade ticket: quote, amount, keypad, summary (MOBILE §5.16, §7.10)**  
`amount` `amount-helper` `amount-row` `is-end` `key` `keypad` `problem-box` `quote-side` `summary-box` `summary-line` `ticket-quote`

**23. Stepper (MOBILE §5.24)**  
`step-circle` `stepper` `stepper-half`

**24. SwipeActions (MOBILE §5.17)**  
`is-buy` `is-sell` `swipe` `swipe-action` `swipe-actions` `swipe-content`

**25. EmptyState (MOBILE §5.18) and Skeleton (§5.19)**  
`empty` `empty-body` `empty-flavor` `empty-icon` `empty-title` `is-hull` `is-shimmer` `skel` `skel-block` `skel-circle` `skel-line` `skel-title`

**26. Crest monogram (MOBILE §5.21)**  
`c28` `c32` `c36` `c44` `c52` `c64` `crest` `crew-hull` `sec-arms` `sec-banking` `sec-hospitality` `sec-livestock` `sec-maps` `sec-marque` `sec-provisions` `sec-relics` `sec-shipping`

**27. Medallion / Podium (MOBILE §5.22)**  
`h56` `h72` `h96` `is-bronze` `is-gold` `is-silver` `m80` `m96` `medal` `medal-rank` `podium` `podium-col` `podium-name` `podium-step` `podium-value`

**28. WaxSeal (MOBILE §5.23): ornament only, aria-hidden**  
`is-brass` `is-crimson` `s120` `s64` `seal` `seal-disc` `seal-rim` `seal-ring` `seal-rose`

**29. Toggle (MOBILE §5.25)**  
`is-fallback` `is-off` `is-on` `switch`

**30. Glass (MOBILE §2.4): floating chrome only, solid fallback first**  
`is-contrast` `is-solid` `solid-bars`

**31. Component-sheet documentation layout (Mobile system canvas page only)**  
`ds` `ds-above` `ds-aside` `ds-col` `ds-colhead` `ds-colnote` `ds-cols` `ds-coltitle` `ds-desc` `ds-h` `ds-head` `ds-item` `ds-kicker` `ds-label` `ds-meta` `ds-ref` `ds-sec` `ds-title` `is-left` `is-right`

**32. Spacing utilities (last, so they win over component margins and gaps)**  
`gap-12` `gap-16` `gap-2` `gap-4` `gap-8` `mt-12` `mt-16` `mt-2` `mt-24` `mt-32` `mt-4` `mt-8`

Classes in the CSS that no snippet above uses (available for screens): `as-message` `at-float` `bg-2` `bg-cell` `bg-elevated` `bg-elevated-cell` `bg-grouped` `bg-plain` `brand` `btn-glass` `btn-sell` `bx` `c-accent` `c-destructive` `c-destructive-strong` `c-gain` `c-gold` `c-label` `c-label-2` `c-label-3` `c-loss` `c-tint` `c-tint-strong` `contrast-more` `edge-fade` `gap-12` `gap-16` `gap-2` `h160` `has-float` `ic-fill` `is-contrast` `is-highlighted` `is-idle` `is-secondary` `is-solid` `is-static` `is-strong` `mono` `mt-2` `mt-32` `mt-4` `no-pull` `nowrap` `plot-compare` `row-lead` `s12` `s14` `s18` `s20` `s22` `s36` `s44` `safe-top` `sec-hospitality` `sec-livestock` `sec-marque` `sep-16` `sep-56` `sep-60` `sep-64` `sep-96` `solid-bars` `stop-loss` `t-amount` `t-body` `t-callout` `t-caption1` `t-caption2` `t-large-title` `t-medium` `t-title1` `t-title2` `t-title3` `trunc` `vstack` `w2` `w225` `w25`

## 6. Before you finish an artboard

- Rendered at the frame size and at 2x on the densest area; no wraps in buttons, tabs, pills, titles or numbers; nothing clipped.
- Fixed chrome at the §4.3 coordinates; fold line on tall frames; no drawn status bar or home indicator.
- Light and dark read correctly; glass only on floating chrome; sheets opaque.
- Every metric has its "?"; every ExplainRow has its sentence and average; signed values have sign + triangle + colour.
- Copy is verbatim COPY.md / MOBILE §7.0; data is BRIEF §7; no film, franchise or character names, no alcohol words in UI copy.
