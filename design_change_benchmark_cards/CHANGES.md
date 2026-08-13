# Change request: Benchmark tab card layout

Target: `src/App.jsx`, the `{view === "benchmark" && (() => { … })()}` block (around line 1318).

Nothing else changes — no new state, no API changes, no backend work. This is a layout + one derived value.

## What changes

The Benchmark tab currently renders a single 4-up card grid:

```
[ Amount Invested ] [ Current Value ] [ Total P&L ] [ If invested in <index> ]
```

Replace it with three stacked tiers:

```
[ Amount invested — full width, larger figure                            ]
[ Current Value                    ] [ Total P&L                        ]
[ If invested in <index>           ] [ P&L if invested in <index>       ]
```

Why: Amount Invested is the shared cost basis both rows are measured against, so it belongs alone at the top. Rows 2 and 3 use identical column widths, so **Current Value sits directly above the index value and Total P&L directly above the index P&L** — the actual-vs-counterfactual comparison reads vertically. Keep the widths identical; that alignment is the whole point of the layout.

Row 3 is a hypothetical, not real money, so it is styled differently from row 2 (see below).

The alpha banner below the cards is unchanged.

## Tier 1 — Amount invested (full width)

One card spanning the full content width, `display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:18px`.

- Card: `background:var(--surface)`, `1px solid var(--line)`, `border-radius:16px`, `padding:20px 24px`, `box-shadow:0 1px 2px rgba(15,23,42,.04)`.
- Left column:
  - Label row — 3×13px `var(--accent)` rail + `gap:8px` + label `AMOUNT INVESTED` at 11.5px/700/.05em uppercase `var(--ink-3)`.
  - Figure — `className="fig"`, **32px**/600/`-.02em`, `margin-top:9px`. Value: `fmt(bmk ? bmk.net_invested : stats.totalInvested)` (unchanged from the current card).
  - Sub — 11.5px `var(--ink-3)`, `margin-top:5px`: "Net of withdrawals · the cost basis both columns below are measured against".
- Right column: 12px `var(--ink-3)`, `text-align:right`, `max-width:230px`: "Same money, same dates — your portfolio on the left, {sel.label} on the right." Render it only when `sel` exists.

## Tier 2 — Current Value + Total P&L

`display:grid; grid-template-columns:1fr 1fr; gap:14px`. Both cards keep the existing `Card` visual language but with a **26px** value (up from 23px) and `letter-spacing:-.02em`, since there are only two per row.

| Card | Value | Sub | accent | tone |
| --- | --- | --- | --- | --- |
| CURRENT VALUE | `fmt(bmk ? bmk.portfolio_value : stats.currentVal)` | `Live NSE prices · ${holdings.length} open positions` | `var(--accent)` | — (ink) |
| TOTAL P&L | `fmt(stats.totalPL)` | `${pct(stats.totalReturn)} · ${realizedLots} matched lots` | good/bad by sign | good/bad by sign |

## Tier 3 — the counterfactual

Same `1fr 1fr` grid and same internals as tier 2, but the card shell reads as hypothetical:

- `background:#FAFBFD`
- `border:1px dashed #D7DEE8`
- **no box-shadow**
- same `border-radius:16px`, `padding:16px 18px 17px`

Both accent rails are `var(--ink-3)`.

| Card | Value | Sub | tone |
| --- | --- | --- | --- |
| IF INVESTED IN {sel.label} | `fmt(sel.value)` | "Each deposit at that day's index close" | — (ink) |
| P&L IF INVESTED IN {sel.label} | `fmt(indexPL)` | `${pct(sel.return_pct)} · XIRR ${sel.xirr_pct}% · you ${sel.alpha_pct_pp >= 0 ? "+" : ""}${sel.alpha_pct_pp} pp` | good/bad by sign of `indexPL` |

### The one new derived value

`indexPL` — what the client would have made had the same cash gone into the index instead:

```js
const indexPL = sel ? sel.value - (bmk ? bmk.net_invested : stats.totalInvested) : 0;
```

Same net-invested figure as tier 1, so tier 3's P&L is consistent with the card above it. If the backend already returns an absolute gain on the index leg, prefer that field over this subtraction.

### When there is no benchmark

`sel` is null whenever `benchmarkState !== "ok"` (no client selected, no deposits recorded, still loading). In that case keep the current fallback behaviour: render tier 3 as two placeholder cards titled "If invested in the index" / "P&L if invested in the index" with value `"—"` and sub `"needs deposit dates"`. Tiers 1 and 2 still render from `stats`.

Everything is driven by `benchIndex`, so switching the index pill in the hero must relabel and re-value both tier-3 cards — no extra wiring needed beyond reading `sel`.

## Reference

`Portfolio Tracker v3.dc.html` in this folder is the design prototype — open it in a browser and click **Benchmark** in the sidebar to see the target layout. `support.js` must sit beside it for it to render. It is a reference, not code to copy: recreate the layout in `App.jsx` with the app's real state and the existing `Card`/`PANEL` conventions.

Note the prototype paints logo chips with a CSS `background-image` rather than an `<img>` — that is a prototype-runtime workaround only. `LogoChip` in `App.jsx` should keep using `<img>`.
