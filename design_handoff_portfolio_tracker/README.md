# Handoff: Portfolio Tracker UI redesign

## Overview
A visual redesign of the existing Portfolio Tracker app (React + Vite frontend, FastAPI + PostgreSQL backend, live NSE prices via Yahoo Finance, money-weighted index benchmark). All five existing views are covered: **Dashboard, Clients, Portfolio, Trades, Benchmark**.

Nothing about the data layer, API surface, routing or business logic changes. This is a presentation-layer replacement inside `src/App.jsx`.

## About the design files
`Portfolio Tracker v3.dc.html` (with its runtime `support.js`) is a **design reference created in HTML** — a prototype showing intended look and behaviour. It is not production code to paste in.

The task is to **recreate this design inside the existing React app**, view by view, using the app's current state, helpers and API calls. The prototype contains its own mock data and a JS re-implementation of the app's FIFO resolver purely so the numbers on screen are self-consistent; **discard all of it** and bind to the real `clients`, `trades`, `cmp`, `dailyPrices`, `benchmark` state already present in `App.jsx`.

Open the HTML file in a browser to interact with it (tab switching, client filter, expandable FIFO rows, index switcher, sortable tables all work).

## Fidelity
**High fidelity.** Final colours, typography, spacing, radii, shadows and interaction states. Recreate pixel-accurately using the values in the Design Tokens section.

## Source of truth mapping

| Design view | Replaces in `src/App.jsx` |
| --- | --- |
| Dashboard | `{view === "dashboard" && (...)}` — the `Card` grid and `PnlComboChart` block |
| Clients | `{view === "clients" && (...)}` — client table + `EMPTY_CLIENT_FORM` form |
| Portfolio | `{view === "portfolio" && (() => {...})}` — holdings table from `resolvePortfolio` |
| Trades | `{view === "trades" && (...)}` — positions table with FIFO expansion + raw trade log |
| Benchmark | `{view === "benchmark" && (() => {...})}` — index cards + alpha panel |
| Shell / nav | The header block around line 677 (title, "Nifty 50 · Midcap 150 · Smallcap 250 · FIFO cost basis · NSE live prices") |
| Per-view backdrop | `VIEW_BG` / `ViewBackdrop` — replaced by the background-art recipes below |
| Card component | `Card` (line ~68) — restyle in place; the prop signature `{title, value, sub, accent, tone}` is unchanged |
| Panel styles | `PANEL` (line ~55) |

## Design tokens

Keep the existing `:root` block in `index.html` — the redesign is built on those tokens and only adds to them.

### Colours (unchanged, already in `index.html`)
| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f6f7f9` | page ground |
| `--surface` | `#ffffff` | cards, tables |
| `--ink` | `#0f172a` | primary text, active nav fill |
| `--ink-2` | `#475569` | secondary text, table body cells |
| `--ink-3` | `#94a3b8` | labels, column headers, meta |
| `--line` | `#e8ecf1` | card borders, table rules |
| `--accent` | `#2563eb` | interactive, primary buttons, chart bars |
| `--good` | `#15803d` | positive P&L |
| `--bad` | `#dc2626` | negative P&L |

### Additions
| Name | Value | Use |
| --- | --- | --- |
| `--row-rule` | `#f2f4f8` | between table rows (lighter than `--line`) |
| `--table-head` | `#fafbfd` | table header band |
| `--row-hover` | `#f7f9fc` | row hover (already in `index.html`) |
| `--amber` | `#d97706` | unrealized line in the combo chart |

### Symbol chip tints
Eight pairs, assigned by `(symbol.charCodeAt(0) + symbol.length) % 8` — background / foreground:
`#EFF6FF/#1D4ED8`, `#ECFEFF/#0E7490`, `#ECFDF5/#047857`, `#FFF7ED/#C2410C`, `#FDF2F8/#BE185D`, `#F5F3FF/#6D28D9`, `#F1F5F9/#334155`, `#FEF2F2/#B91C1C`

### Typography
Two families, both Google Fonts:
- **Plus Jakarta Sans** (400/500/600/700/800) — all prose, labels, headings.
- **IBM Plex Sans** (400/500/600/700) with `font-variant-numeric: tabular-nums; letter-spacing:-.01em` — **every number**: currency, quantities, percentages, dates, XIRR. This is what makes columns align.

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Role | Size / weight / tracking |
| --- | --- |
| Hero figure (Dashboard total P&L) | 46px / 600 / -.03em / IBM Plex Sans |
| Hero heading (other views) | 34px / 800 / -.03em |
| Hero eyebrow | 11.5px / 700 / .11em / uppercase / `rgba(255,255,255,.55)` |
| Hero sub-line | 13.5px / 400 / `rgba(255,255,255,.72)` |
| Card label | 11.5px / 700 / .05em / uppercase / `--ink-3` |
| Card value | 23px / 600 / -.02em / IBM Plex Sans |
| Card sub | 11.5px / `--ink-3` |
| Panel title | 14.5px / 700 |
| Table column header | 10.5px / 700 / .07em / uppercase / `--ink-3` |
| Table cell | 13px (13.5px on Clients) |
| Nested FIFO header | 10px / 700 / .06em |
| Nested FIFO cell | 12px / IBM Plex Sans |
| Sidebar nav item | 13.5px / 500 (600 when active) |

### Spacing, radius, shadow
- Page padding `24px 30px 44px`; sidebar `20px 14px`; gap between panels `20px`; card grid gap `14px`.
- Table row padding `13px 22px` (Clients `14px 22px`, raw log `12px 22px`); header band `12px 22px`.
- Radii: hero `24px`, panels/tables `18px`, cards `16px`, chips `9px`, buttons/inputs `10–11px`, pills `99px`.
- Shadows: cards `0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)`; card hover `0 2px 4px rgba(15,23,42,.04), 0 8px 20px -6px rgba(15,23,42,.14)` with `translateY(-1px)`; panels `0 1px 2px rgba(15,23,42,.04)`.

## Shell layout

`display:grid; grid-template-columns:246px 1fr; min-height:100vh`. Body carries the canvas colour — **do not** put a background on the grid wrapper, it will paint over the view artwork.

**Sidebar** (`#fff`, `1px solid --line` right border, `20px 14px`, flex column, `gap:20px`):
1. Brand — 32px `10px`-radius tile, `linear-gradient(135deg,#2563EB,#0EA5E9)`, white "P"; title 14.5px/700; sub-line "FIFO · NSE live" 10.5px/600 `--ink-3`.
2. Nav — five items (Dashboard ◇, Clients ◉, Portfolio ▤, Trades ⇄, Benchmark ◈). Item `10px 11px`, radius `10px`, hover `#F4F6F9`. Active: solid `--ink` fill, white 600 label. Bind to the existing `view` state.
3. Client filter — "CLIENT FILTER" label (10.5px/700/.09em/`--ink-3`), then "All clients" plus one row per client: 6px colour dot, name 12.5px/600, trade count right-aligned in IBM Plex Sans. Active row `#EFF6FF` with `1px solid #BFDBFE`. Bind to the existing `filterClient` state.
4. Footer card (`margin-top:auto`) — "Prices last refreshed" + `lastRefreshed`, and a full-width `--accent` "Refresh prices" button wired to the existing price-refresh handler.

## Per-view background artwork

Each view root is `position:relative; isolation:isolate; display:flex; flex-direction:column; gap:20px`, with `margin:-24px -30px 0; padding:24px 30px 0` so the art bleeds to the edges. The art is **the element's own `background-image`** (a layered gradient stack), not an absolutely-positioned child — this was the one implementation trap: a child layer gets painted over by ancestor backgrounds, an element background never does.

Common ring set (substitute the view's ring colour `R` and glow `G`):
```css
background-image:
  radial-gradient(circle at 92% 13%, transparent 337px, rgba(R,.15) 338px 341px, transparent 342px),
  radial-gradient(circle at 92% 13%, transparent 227px, rgba(R,.13) 228px 231px, transparent 232px),
  radial-gradient(circle at 92% 13%, transparent 137px, rgba(R,.12) 138px 141px, transparent 142px),
  radial-gradient(760px 580px at 97% 2%, rgba(G), transparent 68%),
  <texture layer>,
  linear-gradient(180deg, <tint> 0px, rgba(246,247,249,0) 780px);
background-repeat: no-repeat,no-repeat,no-repeat,no-repeat,<tex-repeat>,no-repeat;
background-size: 100% 1240px,100% 1240px,100% 1240px,100% 1240px,<tex-size>,100% 100%;
```

| View | Ring `R` | Glow `G` | Texture | repeat / size | Tint |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `37,99,235` | `59,130,246,.20` | `repeating-linear-gradient(90deg,rgba(37,99,235,.055) 0 1px,transparent 1px 74px)` | `repeat-x` / `74px 720px` | `#E6EEFF` |
| Clients | `124,58,237` | `167,139,250,.22` | `radial-gradient(rgba(124,58,237,.13) 1.6px,transparent 1.7px)` | `repeat` / `36px 36px` | `#F1EBFF` |
| Portfolio | `13,148,136` | `45,212,191,.22` | `repeating-linear-gradient(0deg,rgba(13,148,136,.06) 0 2px,transparent 2px 28px)` | `repeat-y` / `660px 28px` | `#E3F6F1` |
| Trades | `217,119,6` | `252,211,77,.26` | `repeating-linear-gradient(118deg,rgba(217,119,6,.075) 0 2px,transparent 2px 32px)` | `repeat` / `100% 760px` | `#FFF1DF` |
| Benchmark | `8,145,178` | `34,211,238,.22` | two layers: `linear-gradient(rgba(8,145,178,.06) 1px,transparent 1px)` + `linear-gradient(90deg,rgba(8,145,178,.06) 1px,transparent 1px)` | `repeat,repeat` / `58px 58px,58px 58px` | `#E2F5FD` |

This replaces `VIEW_BG` / `ViewBackdrop` entirely.

## Hero bands

Every view opens with a full-width band: `border-radius:24px; padding:28-32px 32-34px; color:#fff; position:relative; overflow:hidden`, with 2–4 absolutely-positioned decorative children (radial blobs, outline rings, a grid or stripe mask) inside it.

| View | Gradient |
| --- | --- |
| Dashboard | `linear-gradient(135deg,#070E24 0%,#152C6B 52%,#2563EB 100%)` |
| Clients | `linear-gradient(135deg,#17082E 0%,#4C1D95 52%,#7C3AED 100%)` |
| Portfolio | `linear-gradient(135deg,#03201F 0%,#08544C 55%,#0D9488 100%)` |
| Trades | `linear-gradient(135deg,#241203 0%,#7C3E06 55%,#D97706 100%)` |
| Benchmark | `linear-gradient(135deg,#04121F 0%,#0B4A63 52%,#0891B2 100%)` |

Hero content is eyebrow → headline → sub-line on the left, with a stat block, action button or sparkline on the right. Meta items in the Dashboard hero need `white-space:nowrap` so "+12.3 pp" never breaks; the row wraps between items only.

## Screens

### 1. Dashboard
**Purpose:** portfolio-wide P&L at a glance, plus performance against the index.

- Hero: eyebrow `TOTAL P&L · <client scope>`; 46px total P&L; green pill `▲ <return>% on cost`; meta row Invested / Current / Nifty 50 same timing / Alpha; 280×100 sparkline on the right (`flex:none`).
- **Eight cards, 4-up grid** — exact titles, from existing `stats` and `benchmark`: Total P&L, Realized P&L, Unrealized P&L, Current Value, Your Return, Nifty 50 — same timing, Alpha, Win Rate. Each has a 3×13px accent bar left of the label; value coloured `--good`/`--bad` where signed. Keep the existing `benchmark == null` fallbacks ("—", "needs deposit dates").
- **Combo chart panel** — title "Realized vs Unrealized P&L", legend "Realized (bars)" `#2563eb` / "Unrealized (line)" `#d97706`, and a segmented All/Q1–Q4 control on the right. Chart 280px tall: `--accent` bars (`#F87171` when negative) with `rx:3`, amber 2.5px line with 4px white-stroked dots, three `#EEF1F6` gridlines, `#CBD5E1` zero line, 10px month labels. Feed it the existing `computePnlSeries` output; keep `pnlYear`/`pnlQuarter`/`pnlMonth` state and the hover tooltip from `PnlComboChart`.

### 2. Clients
**Purpose:** CRUD over clients.

- Hero: "N under management", sub-line "<trades> trades booked · <value> combined value", white "+ Add client" button (`#4C1D95` text).
- Inline form panel (toggled by `showClientForm`), `1px solid #DDD6FE` border: four fields in a 4-up grid — Name, Email, Phone, Joining date — then dark "Save client" + outlined "Cancel". Field: `10px 12px`, radius 10px, `1px solid #E1E6EE`, focus `border-color:#2563EB; box-shadow:0 0 0 3px rgba(37,99,235,.16)`.
- Table columns `1.7fr 1.6fr 1.1fr 1fr .7fr .5fr`: **Name** (32px initials tile in the symbol tint + 600 name), **Email**, **Phone**, **Joining Date** (both IBM Plex Sans 12.5px), **Trades** (right, 600), actions ("Edit" `--accent`, "Delete" `--bad`).

### 3. Portfolio
**Purpose:** current holdings and weights.

- Hero: "N active holdings", sub-line "Invested … · Current …", and an Unrealized P&L stat block on the right in a translucent white panel.
- Table columns `1.2fr 1.1fr .7fr .8fr .8fr 1fr 1fr 1.1fr` → **Client, Stock, Net Qty, Avg Buy, CMP, Invested, Current Value, Weight** (matches `resolvePortfolio` output exactly; the Client column only renders when `filterClient === "All"`).
- Stock cell: 78×34 logo chip + symbol (see Company logos below).
- Weight cell: 54×5px track `#EEF1F6` with a fill in the row's tint foreground at `weight × 2.2` (capped 100%), then the percentage right-aligned with `min-width:44px`.

### 4. Trades
**Purpose:** FIFO position detail and the raw ledger.

- Hero: "N trades, FIFO matched", sub-line "Realized … · Unrealized … · Win rate …", white "+ Add trade" button.
- **Positions panel** — hint "Click a row to see FIFO lot matching". Columns `1.1fr .7fr .8fr .8fr 1fr 1fr 1fr .5fr` → Stock (78×34 logo chip + symbol, client name 11px beneath), Net Qty, Avg Buy, CMP, Realized P&L, Unrealized P&L, Total P&L, caret ▼/▲. Signed columns take `--good`/`--bad`; Total is weight 700. Show "—" where `totalSells === 0` / `netQty === 0`, as the current code does. Keep the existing sortable header behaviour (`sortCol`/`sortDir`).
- **Expanded row** — background `#FAFBFD`, padding `16px 22px 18px 62px`, holding up to two sub-tables driven by `matchDetails` and `holdingLots`:
  - "FIFO MATCHED (REALIZED)" — Buy Date, Buy Avg, Sell Date, Sell Avg, Qty, P&L
  - "OPEN LOTS (UNREALIZED)" — Buy Date, Buy Avg, Qty, CMP, Unrealized P&L
- **Raw trade log panel** — All / BUY / SELL segmented filter; columns Client, Type (pill: BUY `#EFF6FF/#1D4ED8`, SELL `#FFF7ED/#C2410C`), Stock, Qty, Price, Date, Notes ("—" when empty), Edit.

### 5. Benchmark
**Purpose:** money-weighted performance against the three indices.

- Hero: headline "Ahead of <index> by N pp" (or "Behind"), sub-line "Each deposit priced at the index close on its own date · XIRR N%", and a three-way index switcher (Nifty 50 / Nifty Midcap 150 / Nifty Smallcap 250) as white-on-translucent pills — bind to `INDEX_LABELS`.
- Four cards: Amount Invested, Current Value, Unrealized P&L, Realized P&L.
- Three index cards: index name, "you ±N pp" chip (green `#ECFDF3` / red `#FEF2F2`), 26px return, "XIRR N% · ₹value", and a progress bar of index return relative to portfolio return.
- Comparison chart panel: portfolio (solid `--accent`, filled) vs index (dashed `#94A3B8`), 280px, "rebased to ₹100 at first deposit".
- Alpha banner: `#ECFDF3` on `1px solid #CDEEDA` with a 4px `--good` left bar; 34px alpha figure; "Portfolio X% vs index Y% · ₹Z ahead"; footer strip with Your XIRR, each index XIRR with its "(you ±N pp)", and Win rate.

## Company logos

Portfolio and Trades show the real company mark in a **wide logo chip**, not a square abbreviation tile. Indian listed-company marks are mostly horizontal wordmarks (HDFC Bank is ~5.7:1), so a 32px square renders them illegibly small — the chip is landscape for that reason.

- Chip: `78 × 34px`, radius `8px`, `background:#fff`, `1px solid #E8ECF1`, `padding:7px`, `box-sizing:border-box`, `overflow:hidden`, flex-centred.
- Inside: `<img style="max-width:100%;max-height:100%;object-fit:contain;display:block">`.
- **Fallback:** when no logo is mapped for the symbol, render the same 78×34 chip filled with the symbol tint (background/foreground pair) and the 3-letter abbreviation at 11px/700/.04em. Branch on presence of a URL — do **not** render an `<img>` with an empty/unknown `src` and rely on `onError`.

### Logo sources
Clearbit's logo API is **discontinued** (every request 404s) — don't use it. Favicon services (Google s2, DuckDuckGo, gstatic, unavatar) return 16–48px for most of these domains and look soft when scaled. The mocks use Wikimedia SVG files, which are vector and render crisply at any size:

| Symbol | URL |
| --- | --- |
| RELIANCE | `https://en.wikipedia.org/wiki/Special:FilePath/Reliance_Industries.svg?width=512` |
| TCS | `https://commons.wikimedia.org/wiki/Special:FilePath/Tata_Consultancy_Services_Logo.svg?width=512` |
| BEL | `https://en.wikipedia.org/wiki/Special:FilePath/Bharat_Electronics_logo.svg?width=512` |
| HDFCBANK | `https://commons.wikimedia.org/wiki/Special:FilePath/HDFC_Bank_Logo.svg?width=512` |
| INFY | `https://commons.wikimedia.org/wiki/Special:FilePath/Infosys_logo.svg?width=512` |
| ICICIBANK | `https://commons.wikimedia.org/wiki/Special:FilePath/ICICI_Bank_Logo.svg?width=512` |
| TATAMOTORS | `https://commons.wikimedia.org/wiki/Special:FilePath/Tata_Motors_Logo.svg?width=512` |
| LT | `https://commons.wikimedia.org/wiki/Special:FilePath/Larsen-%26-Toubro-Logo.svg?width=512` |

Note the two hosts: files on `en.wikipedia.org` are locally-uploaded (non-free) logos and are **not** on Commons — the URL host matters per symbol. `Special:FilePath` 302-redirects to `upload.wikimedia.org`, and the redirect does not send permissive CORS headers, so these URLs work in an `<img src>` but **cannot** be read into a `<canvas>` or fetched client-side.

**For production, download these once and self-host them** (`public/logos/RELIANCE.svg`, …) with a static `SYMBOL_LOGOS` map, or add a `logo_path TEXT` column to an instruments table. That removes the runtime third-party dependency, survives a file being renamed on Wikimedia, and lets you normalise padding and trim whitespace per mark. Company logos are trademarks — use them only to identify the holding, and honour any takedown request.

## Interactions & behaviour
- Nav, client filter, index switcher, quarter filter, type filter: instant, no transition.
- Cards: `transform .18s ease, box-shadow .18s ease` lift on hover.
- Table rows: `background-color .12s ease` to `#f7f9fc`; position rows are `cursor:pointer` and toggle the FIFO panel.
- Buttons: `.15s ease` colour transitions, `translateY(.5px)` on active (already in `index.html`).
- Focus: keep the existing `:focus-visible` accent ring — do not regress to the browser default.
- Preserve every existing loading/error path: `appLoading`, `appError`, `priceLoading`, `priceError`, `benchmarkState`, and the FIFO sell validation on the trade form.

## State
No new state is required. The design maps onto what `App.jsx` already holds: `view`, `filterClient`, `clients`, `trades`, `cmp`, `dailyPrices`, `benchmark`, `benchmarkState`, `sortCol`/`sortDir`, `expandedRows`, `showForm`/`form`/`editingId`, `showClientForm`/`clientForm`/`editingClientId`, `pnlYear`/`pnlQuarter`/`pnlMonth`, `priceLoading`, `lastRefreshed`.

Two additions if you want them: an index selector on the Benchmark view (currently all three indices render at once) and a `typeFilter` for the raw trade log.

## Known open bug (unrelated to this redesign)
`SESSION_SUMMARY.md` records the stock autocomplete dropdown not being visible. The likely cause is the same class of problem hit while building this design: an ancestor with a background or a clipping context painting over an absolutely-positioned child. Check for `overflow:hidden` on the form's grid container and render the dropdown in a portal attached to `document.body` with `position:fixed` coordinates from `getBoundingClientRect()`.

## Assets
No image assets. Icons are text glyphs (◇ ◉ ▤ ⇄ ◈ ▲ ▼). Company logos are fetched at runtime from Wikimedia as described above — self-host them in production. Charts are hand-built inline SVG — no charting library is required, though Recharts would be a reasonable substitution if you prefer.

## Files in this bundle
- `Portfolio Tracker v3.dc.html` — the design prototype. Open it in a browser; all five views are interactive.
- `support.js` — the runtime the prototype needs. Required for the HTML to render; not part of the handoff deliverable.
