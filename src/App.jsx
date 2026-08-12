import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api`;

const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const pct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const fmtDate = (d) => { if (!d) return "—"; const dt = new Date(d); const dd = String(dt.getUTCDate()).padStart(2,"0"); const mm = String(dt.getUTCMonth()+1).padStart(2,"0"); return `${dd}/${mm}/${dt.getUTCFullYear()}`; };

const apiFetch = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
};

const Badge = ({ children, color }) => {
  const colors = { green: ["#dcfce7","#166534"], blue: ["#dbeafe","#1e40af"], amber: ["#fef3c7","#92400e"], red: ["#fee2e2","#991b1b"], gray: ["#f3f4f6","#374151"] };
  const [bg, fg] = colors[color] || colors.gray;
  return <span style={{ background: bg, color: fg, padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
};

const INDEX_LABELS = { nifty50: "Nifty 50", midcap150: "Nifty Midcap 150", smallcap250: "Nifty Smallcap 250" };

const Card = ({ title, value, sub, accent }) => (
  <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", border: "1px solid #e5e7eb", flex: "1 1 155px", minWidth: 155 }}>
    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{title}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: accent || "#111", marginTop: 3 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{sub}</div>}
  </div>
);

const StockAutocomplete = ({ value, onChange, style }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);
  const cacheRef = useRef({});

  const open = suggestions.length > 0;

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSuggestions([]);
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const el = listRef.current.children[highlighted];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  const fetchSuggestions = useCallback(async (query) => {
    if (!query) { setSuggestions([]); return; }
    const upper = query.toUpperCase();
    if (cacheRef.current[upper]) { setSuggestions(cacheRef.current[upper]); return; }
    setLoading(true);
    try {
      const results = await apiFetch(`/stocks/search?q=${encodeURIComponent(upper)}`);
      cacheRef.current[upper] = results;
      setSuggestions(results);
    } catch (err) {
      console.error("Stock search error:", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (val) => {
    const upper = val.toUpperCase();
    onChange(upper);
    setHighlighted(-1);
    clearTimeout(debounceRef.current);
    if (upper.length >= 1) debounceRef.current = setTimeout(() => fetchSuggestions(upper), 350);
    else setSuggestions([]);
  };

  const handleKey = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); onChange(suggestions[highlighted].symbol); setSuggestions([]); setHighlighted(-1); }
    else if (e.key === "Escape") { setSuggestions([]); setHighlighted(-1); }
  };

  const select = (symbol) => { onChange(symbol); setSuggestions([]); setHighlighted(-1); };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input style={style} value={value} onChange={e => handleChange(e.target.value)} onKeyDown={handleKey} placeholder="Type stock symbol..." autoComplete="off" />
      {loading && <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#6b7280", pointerEvents: "none" }}>⟳</div>}
      {open && (
        <div ref={listRef} style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, minWidth: "100%", zIndex: 9999, background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.15)" }}>
          {suggestions.map((s, i) => (
            <div key={s.symbol}
              onMouseDown={(e) => { e.preventDefault(); select(s.symbol); }}
              onMouseEnter={() => setHighlighted(i)}
              style={{ padding: "8px 12px", cursor: "pointer", background: i === highlighted ? "#eff6ff" : "#fff", borderBottom: i < suggestions.length - 1 ? "1px solid #f3f4f6" : "none" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: i === highlighted ? "#1e40af" : "#111" }}>{s.symbol}</span>
              <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function resolvePortfolio(trades, cmp) {
  const groups = {};
  trades.forEach(t => {
    const k = `${t.client_name}||${t.stock_symbol}`;
    if (!groups[k]) groups[k] = { client: t.client_name, stock: t.stock_symbol, buys: [], sells: [] };
    const dateStr = typeof t.date === "string" ? t.date.slice(0, 10) : t.date;
    if (t.type === "BUY") groups[k].buys.push({ ...t, date: dateStr, remainQty: t.quantity });
    else groups[k].sells.push({ ...t, date: dateStr });
  });
  const resolved = [];
  Object.values(groups).forEach(g => {
    g.buys.sort((a, b) => a.date.localeCompare(b.date));
    g.sells.sort((a, b) => a.date.localeCompare(b.date));
    let realizedPL = 0, totalSoldQty = 0;
    const matchDetails = [];
    const sellRemain = g.sells.map(s => ({ ...s, remaining: s.quantity }));
    const consume = (sell, sameDayOnly) => {
      for (let buy of g.buys) {
        if (sell.remaining <= 0) break;
        if (buy.remainQty <= 0) continue;
        if (sameDayOnly && buy.date !== sell.date) continue;
        const matched = Math.min(buy.remainQty, sell.remaining);
        buy.remainQty -= matched;
        sell.remaining -= matched;
        const pl = (sell.price - buy.price) * matched;
        realizedPL += pl;
        totalSoldQty += matched;
        matchDetails.push({ buyDate: buy.date, buyPrice: buy.price, sellDate: sell.date, sellPrice: sell.price, qty: matched, pl, intraday: sameDayOnly });
      }
    };
    // Pass 1: match same-day (intraday) buy↔sell pairs first, so an intraday
    // round-trip is booked against that day's buy, not older delivery holdings.
    sellRemain.forEach(sell => consume(sell, true));
    // Pass 2: FIFO the remaining sells against oldest remaining buys.
    sellRemain.forEach(sell => consume(sell, false));
    const holdingLots = g.buys.filter(b => b.remainQty > 0);
    const netQty = holdingLots.reduce((s, b) => s + b.remainQty, 0);
    const totalBuys = g.buys.reduce((s, b) => s + b.quantity, 0);
    let status = totalSoldQty === 0 ? "holding" : netQty === 0 ? "fully_booked" : "partially_booked";
    const avgBuyPrice = netQty > 0 ? holdingLots.reduce((s, b) => s + b.price * b.remainQty, 0) / netQty : 0;
    const investedHolding = netQty > 0 ? holdingLots.reduce((s, b) => s + b.price * b.remainQty, 0) : 0;
    const currentVal = netQty * (cmp[g.stock] || 0);
    const unrealizedPL = currentVal - investedHolding;
    resolved.push({ client: g.client, stock: g.stock, status, netQty, totalBuys, totalSells: totalSoldQty, avgBuyPrice, investedHolding, currentVal, unrealizedPL, realizedPL, totalPL: realizedPL + unrealizedPL, cmp: cmp[g.stock] || 0, matchDetails, holdingLots });
  });
  return resolved;
}

// ── P&L-over-time helpers (realized bars + unrealized line) ────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const todayIso = () => { const d = new Date(); return isoOf(d.getFullYear(), d.getMonth(), d.getDate()); };
const fmtCompact = (v) => {
  const s = v < 0 ? "-" : "", a = Math.abs(v);
  if (a >= 1e7) return s + "₹" + (a / 1e7).toFixed(a >= 1e8 ? 0 : 1) + "Cr";
  if (a >= 1e5) return s + "₹" + (a / 1e5).toFixed(a >= 1e6 ? 0 : 1) + "L";
  if (a >= 1e3) return s + "₹" + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
  return s + "₹" + Math.round(a);
};

function makePriceAsOf(dailyPrices, cmp) {
  const sorted = {};
  Object.entries(dailyPrices || {}).forEach(([sym, m]) => {
    sorted[sym] = Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  });
  return (sym, target) => {
    const arr = sorted[sym];
    if (!arr || arr.length === 0) return cmp[sym] ?? null;
    if (target >= arr[arr.length - 1][0]) return cmp[sym] ?? arr[arr.length - 1][1];
    let res = null;
    for (let i = 0; i < arr.length; i++) { if (arr[i][0] <= target) res = arr[i][1]; else break; }
    return res;
  };
}

// Remaining holding lots per symbol as of a date (FIFO, intraday-first), using only trades on/before that date
function holdingsAsOf(trades, dateIso) {
  const groups = {};
  trades.forEach(t => {
    const d = String(t.date).slice(0, 10);
    if (d > dateIso) return;
    if (!groups[t.stock_symbol]) groups[t.stock_symbol] = { buys: [], sells: [] };
    if (t.type === "BUY") groups[t.stock_symbol].buys.push({ price: Number(t.price), date: d, remainQty: t.quantity });
    else groups[t.stock_symbol].sells.push({ date: d, quantity: t.quantity });
  });
  const held = {};
  Object.entries(groups).forEach(([sym, g]) => {
    g.buys.sort((a, b) => a.date.localeCompare(b.date));
    const sells = g.sells.map(s => ({ ...s, remaining: s.quantity })).sort((a, b) => a.date.localeCompare(b.date));
    const consume = (sell, sameDay) => {
      for (const b of g.buys) {
        if (sell.remaining <= 0) break;
        if (b.remainQty <= 0) continue;
        if (sameDay && b.date !== sell.date) continue;
        const m = Math.min(b.remainQty, sell.remaining);
        b.remainQty -= m; sell.remaining -= m;
      }
    };
    sells.forEach(s => consume(s, true));
    sells.forEach(s => consume(s, false));
    held[sym] = g.buys.filter(b => b.remainQty > 0).map(b => ({ price: b.price, qty: b.remainQty }));
  });
  return held;
}

function unrealizedAsOf(trades, dateIso, priceAsOf) {
  const held = holdingsAsOf(trades, dateIso);
  let u = 0;
  Object.entries(held).forEach(([sym, lots]) => {
    const px = priceAsOf(sym, dateIso);
    if (px == null) return;
    lots.forEach(l => { u += (px - l.price) * l.qty; });
  });
  return u;
}

function realizedInRange(portfolio, startIso, endIso) {
  let r = 0;
  portfolio.forEach(p => p.matchDetails.forEach(m => {
    const sd = String(m.sellDate).slice(0, 10);
    if (sd >= startIso && sd <= endIso) r += m.pl;
  }));
  return r;
}

function computePnlSeries(filteredTrades, portfolio, dailyPrices, cmp, year, quarter, month) {
  const priceAsOf = makePriceAsOf(dailyPrices, cmp);
  const tIso = todayIso();
  const clamp = (d) => (d > tIso ? tIso : d);
  const points = [];
  const monthPoint = (m) => {
    const start = isoOf(year, m, 1), end = isoOf(year, m, lastDayOfMonth(year, m));
    points.push({
      label: MONTHS[m], sub: String(year), startIso: start, endIso: end,
      realized: realizedInRange(portfolio, start, end),
      unrealized: unrealizedAsOf(filteredTrades, clamp(end), priceAsOf),
    });
  };
  if (month !== "All") {
    const m = month, ld = lastDayOfMonth(year, m);
    [[1, 7], [8, 14], [15, 21], [22, ld]].forEach(([a, b]) => {
      const start = isoOf(year, m, a), end = isoOf(year, m, b);
      points.push({
        label: `${a}–${b}`, sub: `${MONTHS[m]} ${year}`, startIso: start, endIso: end,
        realized: realizedInRange(portfolio, start, end),
        unrealized: unrealizedAsOf(filteredTrades, clamp(end), priceAsOf),
      });
    });
  } else if (quarter !== "All") {
    const qm = (quarter - 1) * 3;
    [qm, qm + 1, qm + 2].forEach(monthPoint);
  } else {
    for (let m = 0; m < 12; m++) monthPoint(m);
  }
  return points;
}

function PnlComboChart({ points }) {
  const [hover, setHover] = useState(-1);
  const W = 760, H = 300, ML = 58, MR = 16, MT = 18, MB = 40;
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const vals = points.flatMap(p => [p.realized, p.unrealized]);
  let vmax = Math.max(0, ...vals), vmin = Math.min(0, ...vals);
  if (vmax === vmin) { vmax += 1; vmin -= 1; }
  const pad = (vmax - vmin) * 0.08; vmax += pad; vmin -= pad;
  const yOf = (v) => MT + plotH * (vmax - v) / (vmax - vmin);
  const zeroY = yOf(0);
  const band = plotW / points.length;
  const cx = (i) => ML + band * (i + 0.5);
  const barW = Math.min(band * 0.5, 46);
  // y ticks (~5)
  const ticks = [];
  const nT = 5;
  for (let i = 0; i <= nT; i++) ticks.push(vmin + (vmax - vmin) * i / nT);
  const linePts = points.map((p, i) => `${cx(i)},${yOf(p.unrealized)}`).join(" ");
  const C_BAR = "#2563eb", C_LINE = "#d97706";
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={ML} x2={W - MR} y1={yOf(t)} y2={yOf(t)} stroke={Math.abs(t) < 1e-6 ? "#cbd5e1" : "#f1f5f9"} strokeWidth={Math.abs(t) < 1e-6 ? 1.5 : 1} />
            <text x={ML - 8} y={yOf(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{fmtCompact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const y = yOf(p.realized), h = Math.abs(y - zeroY);
          const top = p.realized >= 0 ? y : zeroY;
          return (
            <g key={i}>
              <rect x={cx(i) - barW / 2} y={top} width={barW} height={Math.max(h, 0.5)} rx="3" fill={C_BAR} opacity={hover === -1 || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
        <polyline points={linePts} fill="none" stroke={C_LINE} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={cx(i)} cy={yOf(p.unrealized)} r={hover === i ? 5.5 : 4} fill="#fff" stroke={C_LINE} strokeWidth="2.5" />
        ))}
        {points.map((p, i) => (
          <g key={i}>
            <text x={cx(i)} y={H - MB + 16} textAnchor="middle" fontSize="10.5" fill="#475569" fontWeight="600">{p.label}</text>
            <rect x={ML + band * i} y={MT} width={band} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} style={{ cursor: "pointer" }} />
          </g>
        ))}
      </svg>
      {hover >= 0 && (
        <div style={{
          position: "absolute", left: `${((hover + 0.5) / points.length) * 100}%`, top: 0,
          transform: `translateX(${hover > points.length / 2 ? "-105%" : "5%"})`,
          background: "#0f172a", color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 11,
          pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(0,0,0,.18)", zIndex: 5,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{points[hover].label}{points[hover].sub ? ` · ${points[hover].sub}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C_BAR, display: "inline-block" }} />
            Realized: <b>{fmt(points[hover].realized)}</b>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ width: 9, height: 2, background: C_LINE, display: "inline-block" }} />
            Unrealized: <b>{fmt(points[hover].unrealized)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_CLIENT_FORM = { name: "", phone: "", email: "", joining_date: "" };
const EMPTY_TRADE_FORM = { client_id: "", stock_symbol: "", type: "BUY", quantity: "", price: "", date: "", notes: "" };

export default function App() {
  const [clients, setClients] = useState([]);
  const [trades, setTrades] = useState([]);
  const [dailyPrices, setDailyPrices] = useState({});
  const [pnlYear, setPnlYear] = useState(null);
  const [pnlQuarter, setPnlQuarter] = useState("All");   // "All" | 1..4
  const [pnlMonth, setPnlMonth] = useState("All");        // "All" | 0..11
  const [cmp, setCmp] = useState({});
  const [appLoading, setAppLoading] = useState(true);
  const [appError, setAppError] = useState("");

  const [view, setView] = useState("dashboard");
  const [filterClient, setFilterClient] = useState("All");

  // Client form
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT_FORM);
  const [editingClientId, setEditingClientId] = useState(null);
  const [clientSaving, setClientSaving] = useState(false);

  // Trade form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_TRADE_FORM);
  const [editingId, setEditingId] = useState(null);
  const [tradeSaving, setTradeSaving] = useState(false);

  // Prices
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [showRawLog, setShowRawLog] = useState(false);
  const toggleRow = (k) => setExpandedRows(p => ({ ...p, [k]: !p[k] }));
  const [sortCol, setSortCol] = useState("total");
  const [sortDir, setSortDir] = useState("desc");
  const setSort = (col) => {
    if (sortCol === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const loadData = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([
        apiFetch("/clients"),
        apiFetch("/trades"),
      ]);
      setClients(c);
      setTrades(t);
      const initCmp = {};
      t.forEach(tr => { if (!initCmp[tr.stock_symbol]) initCmp[tr.stock_symbol] = Number(tr.price); });
      setCmp(prev => ({ ...initCmp, ...prev }));
      const stocks = [...new Set(t.map(tr => tr.stock_symbol))];
      if (stocks.length > 0) {
        apiFetch(`/prices/history?symbols=${stocks.join(",")}`).then(hp => setDailyPrices(hp)).catch(() => {});
      }
    } catch (e) {
      setAppError("Cannot connect to backend. Is the server running on port 8000?");
    } finally {
      setAppLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clientNames = useMemo(() => ["All", ...clients.map(c => c.name)], [clients]);
  const filteredTrades = useMemo(() => filterClient === "All" ? trades : trades.filter(t => t.client_name === filterClient), [trades, filterClient]);
  const portfolio = useMemo(() => resolvePortfolio(filteredTrades, cmp), [filteredTrades, cmp]);
  const holdings = useMemo(() => portfolio.filter(p => p.netQty > 0), [portfolio]);
  const allStocks = useMemo(() => [...new Set(trades.map(t => t.stock_symbol))], [trades]);
  const positions = useMemo(() => {
    const val = (p) => {
      switch (sortCol) {
        case "client": return p.client;
        case "company": return p.stock;
        case "qty": return p.netQty;
        case "realized": return p.realizedPL;
        case "unrealized": return p.netQty > 0 ? p.unrealizedPL : 0;
        case "status": return p.status;
        default: return p.totalPL;
      }
    };
    return [...portfolio].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return sortDir === "asc" ? c : -c;
    });
  }, [portfolio, sortCol, sortDir]);
  const pnlTotals = useMemo(() => ({
    realized: portfolio.reduce((s, p) => s + p.realizedPL, 0),
    unrealized: portfolio.reduce((s, p) => s + (p.netQty > 0 ? p.unrealizedPL : 0), 0),
  }), [portfolio]);
  const pnlYears = useMemo(() => {
    const ys = new Set(filteredTrades.map(t => Number(String(t.date).slice(0, 4))));
    return [...ys].sort();
  }, [filteredTrades]);
  const effYear = pnlYear ?? (pnlYears[pnlYears.length - 1] ?? new Date().getFullYear());
  const pnlChartData = useMemo(
    () => computePnlSeries(filteredTrades, portfolio, dailyPrices, cmp, effYear, pnlQuarter, pnlMonth),
    [filteredTrades, portfolio, dailyPrices, cmp, effYear, pnlQuarter, pnlMonth]
  );

  const stats = useMemo(() => {
    const totalRealizedPL = portfolio.reduce((s, p) => s + p.realizedPL, 0);
    const totalUnrealizedPL = portfolio.reduce((s, p) => s + p.unrealizedPL, 0);
    const totalPL = totalRealizedPL + totalUnrealizedPL;
    const totalInvested = portfolio.reduce((s, p) => s + p.investedHolding, 0) + portfolio.reduce((s, p) => s + p.matchDetails.reduce((ss, m) => ss + m.buyPrice * m.qty, 0), 0);
    const totalReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
    const realizedTrades = portfolio.flatMap(p => p.matchDetails);
    const wins = realizedTrades.filter(m => m.pl > 0).length;
    const winRate = realizedTrades.length > 0 ? (wins / realizedTrades.length) * 100 : 0;
    let maxDD = 0, peak = 0, running = 0;
    realizedTrades.sort((a, b) => a.sellDate.localeCompare(b.sellDate)).forEach(m => { running += m.pl; if (running > peak) peak = running; const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0; if (dd > maxDD) maxDD = dd; });
    const currentVal = holdings.reduce((s, h) => s + h.currentVal, 0);
    return { totalRealizedPL, totalUnrealizedPL, totalPL, totalInvested, totalReturn, winRate, maxDD, currentVal };
  }, [portfolio, holdings]);

  // Money-weighted Nifty benchmark: each deposit priced at the Nifty close on its own date.
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkState, setBenchmarkState] = useState("idle");
  useEffect(() => {
    const client = clients.find(c => c.name === filterClient);
    if (!client) { setBenchmark(null); setBenchmarkState(filterClient === "All" ? "all" : "idle"); return; }
    const pv = stats.currentVal + Number(client.cash_balance || 0);
    if (!(pv > 0)) { setBenchmark(null); setBenchmarkState("idle"); return; }
    let cancelled = false;
    setBenchmarkState("loading");
    apiFetch(`/benchmark?client_id=${client.id}&portfolio_value=${pv}`)
      .then(b => { if (!cancelled) { setBenchmark(b); setBenchmarkState("ok"); } })
      .catch(() => { if (!cancelled) { setBenchmark(null); setBenchmarkState("nodata"); } });
    return () => { cancelled = true; };
  }, [clients, filterClient, stats.currentVal]);

  const refreshPrices = useCallback(async () => {
    if (allStocks.length === 0) return;
    setPriceLoading(true);
    setPriceError("");
    try {
      const prices = await apiFetch(`/prices?symbols=${allStocks.join(",")}`);
      if (Object.keys(prices).length > 0) { setCmp(prev => ({ ...prev, ...prices })); setLastRefreshed(new Date()); }
      else setPriceError("No prices returned. Try again.");
    } catch { setPriceError("Failed to fetch prices. Try again."); }
    finally { setPriceLoading(false); }
  }, [allStocks]);

  // Without this, holdings stay valued at last TRADE price while the index side is live.
  const pricesPrimed = useRef(false);
  useEffect(() => {
    if (!pricesPrimed.current && allStocks.length > 0) { pricesPrimed.current = true; refreshPrices(); }
  }, [allStocks, refreshPrices]);

  // ── Client CRUD ──────────────────────────────────────────────────────────────

  const openAddClient = () => { setClientForm(EMPTY_CLIENT_FORM); setEditingClientId(null); setShowClientForm(true); };
  const openEditClient = (c) => { setClientForm({ name: c.name, phone: c.phone || "", email: c.email || "", joining_date: c.joining_date ? String(c.joining_date).slice(0, 10) : "" }); setEditingClientId(c.id); setShowClientForm(true); };
  const cancelClientForm = () => { setShowClientForm(false); setEditingClientId(null); setClientForm(EMPTY_CLIENT_FORM); };

  const handleSaveClient = async () => {
    if (!clientForm.name.trim()) return;
    setClientSaving(true);
    try {
      if (editingClientId) {
        const updated = await apiFetch(`/clients/${editingClientId}`, { method: "PUT", body: JSON.stringify(clientForm) });
        setClients(prev => prev.map(c => c.id === editingClientId ? updated : c));
      } else {
        const created = await apiFetch("/clients", { method: "POST", body: JSON.stringify(clientForm) });
        setClients(prev => [created, ...prev]);
      }
      cancelClientForm();
    } catch (e) { alert(e.message); }
    finally { setClientSaving(false); }
  };

  const handleDeleteClient = async (id) => {
    if (!window.confirm("Delete this client? All their trades will also be deleted.")) return;
    try {
      await apiFetch(`/clients/${id}`, { method: "DELETE" });
      setClients(prev => prev.filter(c => c.id !== id));
      setTrades(prev => prev.filter(t => t.client_id !== id));
    } catch (e) { alert(e.message); }
  };

  // ── Trade CRUD ───────────────────────────────────────────────────────────────

  const openAddTrade = () => { setForm(EMPTY_TRADE_FORM); setEditingId(null); setShowForm(true); };
  const cancelForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_TRADE_FORM); };

  const startEdit = (t) => {
    setForm({ client_id: t.client_id, stock_symbol: t.stock_symbol, type: t.type, quantity: String(t.quantity), price: String(t.price), date: typeof t.date === "string" ? t.date.slice(0, 10) : t.date, notes: t.notes || "" });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleSaveTrade = async () => {
    if (!form.client_id || !form.stock_symbol || !form.quantity || !form.price || !form.date) return;
    if (form.type === "SELL") {
      const baseTradeList = editingId ? trades.filter(t => t.id !== editingId) : trades;
      const clientTrades = baseTradeList.filter(t => t.client_id === form.client_id && t.stock_symbol === form.stock_symbol.toUpperCase());
      const res = resolvePortfolio(clientTrades, cmp);
      const net = res.length > 0 ? res[0].netQty : 0;
      if (Number(form.quantity) > net) { alert(`Cannot sell ${form.quantity}. Only ${net} shares held.`); return; }
    }
    setTradeSaving(true);
    const payload = { ...form, stock_symbol: form.stock_symbol.toUpperCase(), quantity: Number(form.quantity), price: parseFloat(form.price) };
    try {
      if (editingId) {
        const updated = await apiFetch(`/trades/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setTrades(prev => prev.map(t => t.id === editingId ? updated : t));
      } else {
        const created = await apiFetch("/trades", { method: "POST", body: JSON.stringify(payload) });
        setTrades(prev => [...prev, created]);
      }
      if (form.type === "BUY" && !cmp[form.stock_symbol.toUpperCase()]) setCmp(prev => ({ ...prev, [form.stock_symbol.toUpperCase()]: parseFloat(form.price) }));
      setForm(f => ({ ...EMPTY_TRADE_FORM, client_id: f.client_id }));
      setShowForm(false);
      setEditingId(null);
    } catch (e) { alert(e.message); }
    finally { setTradeSaving(false); }
  };

  const handleDeleteTrade = async (id) => {
    if (!window.confirm("Delete this trade?")) return;
    try {
      await apiFetch(`/trades/${id}`, { method: "DELETE" });
      setTrades(prev => prev.filter(t => t.id !== id));
    } catch (e) { alert(e.message); }
  };

  const inp = { padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff", color: "#111" };
  const btnP = { padding: "7px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
  const btnS = { padding: "7px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" };
  const btnD = { padding: "7px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
  const th = { textAlign: "left", padding: "8px 6px", fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" };
  const td = { padding: "8px 6px", fontSize: 13 };

  const MiniBar = ({ label, val, max, color }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
        <span style={{ fontWeight: 600 }}>{label}</span><span style={{ color: "#6b7280" }}>{pct(val)}</span>
      </div>
      <div style={{ background: "#f3f4f6", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(Math.abs(val) / (max || 1) * 100, 100)}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
    </div>
  );

  const RefreshButton = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button onClick={refreshPrices} disabled={priceLoading} style={{ ...btnP, padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, opacity: priceLoading ? 0.7 : 1 }}>
        <span style={{ display: "inline-block", animation: priceLoading ? "spin 1s linear infinite" : "none", fontSize: 14 }}>{priceLoading ? "⟳" : "↻"}</span>
        {priceLoading ? "Fetching live prices..." : "Refresh Prices (NSE)"}
      </button>
      {lastRefreshed && !priceLoading && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>● Live — {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
      {priceError && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>{priceError}</span>}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (appLoading) return <div style={{ textAlign: "center", padding: 80, fontSize: 15, color: "#6b7280" }}>Loading portfolio data…</div>;
  if (appError) return <div style={{ textAlign: "center", padding: 80 }}><div style={{ fontSize: 15, color: "#dc2626", fontWeight: 700 }}>{appError}</div></div>;

  const views = ["dashboard", "clients", "portfolio", "trades", "benchmark"];

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", maxWidth: 960, margin: "0 auto", padding: "16px 12px", color: "#111" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>Portfolio Tracker</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>Benchmarks: Nifty 50 · Midcap 150 · Smallcap 250 • FIFO Cost Basis • NSE Live Prices</p>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {views.map(v => (
            <button key={v} onClick={() => setView(v)} style={{ ...btnS, padding: "5px 12px", fontSize: 12, textTransform: "capitalize", background: view === v ? "#2563eb" : "transparent", color: view === v ? "#fff" : "#374151", borderColor: view === v ? "#2563eb" : "#d1d5db" }}>{v}</button>
          ))}
        </div>
      </div>

      {view !== "clients" && (
        <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Client:</span>
          {clientNames.map(c => (
            <button key={c} onClick={() => setFilterClient(c)} style={{ padding: "3px 11px", borderRadius: 20, border: "1px solid #d1d5db", fontSize: 11, cursor: "pointer", fontWeight: 600, background: filterClient === c ? "#1e40af" : "transparent", color: filterClient === c ? "#fff" : "#374151", borderColor: filterClient === c ? "#1e40af" : "#d1d5db" }}>{c}</button>
          ))}
        </div>
      )}

      {/* ── CLIENTS TAB ─────────────────────────────────────────────────────── */}
      {view === "clients" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Clients</h3>
            <div style={{ display: "flex", gap: 6 }}>
              {showClientForm && <button onClick={cancelClientForm} style={btnS}>Cancel</button>}
              {!showClientForm && <button onClick={openAddClient} style={btnP}>+ Add Client</button>}
            </div>
          </div>

          {showClientForm && (
            <div style={{ background: editingClientId ? "#fffbeb" : "#fff", borderRadius: 12, padding: 14, border: `1px solid ${editingClientId ? "#fbbf24" : "#e5e7eb"}`, marginBottom: 14 }}>
              {editingClientId && <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>Editing Client</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
                <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Name *</label>
                  <input style={inp} value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))} placeholder="Client name" /></div>
                <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Phone</label>
                  <input style={inp} value={clientForm.phone} onChange={e => setClientForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
                <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Email</label>
                  <input style={inp} value={clientForm.email} onChange={e => setClientForm(p => ({ ...p, email: e.target.value }))} placeholder="client@email.com" /></div>
                <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Joining Date *</label>
                  <input type="date" style={inp} value={clientForm.joining_date} onChange={e => setClientForm(p => ({ ...p, joining_date: e.target.value }))} /></div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button onClick={handleSaveClient} disabled={clientSaving} style={{ ...btnP, background: editingClientId ? "#d97706" : "#2563eb", opacity: clientSaving ? 0.7 : 1 }}>{clientSaving ? "Saving…" : editingClientId ? "Save Changes" : "Add Client"}</button>
                <button onClick={cancelClientForm} style={btnS}>Cancel</button>
              </div>
            </div>
          )}

          {clients.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>No Clients Yet</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Add your first client to start tracking trades.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Name","Email","Phone","Joining Date","Trades",""].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>{clients.map(c => {
                  const tradeCount = trades.filter(t => t.client_id === c.id).length;
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ ...td, color: "#6b7280" }}>{c.email || "—"}</td>
                      <td style={{ ...td, color: "#6b7280" }}>{c.phone || "—"}</td>
                      <td style={td}>{c.joining_date ? fmtDate(c.joining_date) : "—"}</td>
                      <td style={td}><Badge color="blue">{tradeCount} trade{tradeCount !== 1 ? "s" : ""}</Badge></td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <button onClick={() => openEditClient(c)} title="Edit" style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✎</button>
                        <button onClick={() => handleDeleteClient(c.id)} title="Delete" style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── DASHBOARD TAB ────────────────────────────────────────────────────── */}
      {view === "dashboard" && (<>
        <div style={{ marginBottom: 14 }}><RefreshButton /></div>
        {trades.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>No trades yet</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Add clients first, then log trades in the Trades tab.</div>
          </div>
        ) : (<>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Card title="Total P&L" value={fmt(stats.totalPL)} sub={pct(stats.totalReturn)} accent={stats.totalPL >= 0 ? "#16a34a" : "#dc2626"} />
            <Card title="Realized P&L" value={fmt(stats.totalRealizedPL)} accent={stats.totalRealizedPL >= 0 ? "#16a34a" : "#dc2626"} />
            <Card title="Unrealized P&L" value={fmt(stats.totalUnrealizedPL)} accent={stats.totalUnrealizedPL >= 0 ? "#16a34a" : "#dc2626"} />
            <Card title="Current Value" value={fmt(stats.currentVal)} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {benchmarkState === "ok" ? (<>
              <Card title="Your Return" value={pct(benchmark.portfolio_return_pct)}
                    sub={`XIRR ${benchmark.portfolio_xirr_pct}% · on ${fmt(benchmark.net_invested)} invested`}
                    accent={benchmark.portfolio_return_pct >= 0 ? "#16a34a" : "#dc2626"} />
              <Card title="Nifty 50 — same timing" value={pct(benchmark.benchmark_return_pct)}
                    sub={`XIRR ${benchmark.benchmark_xirr_pct}% · ${fmt(benchmark.benchmark_value)}`}
                    accent="#6b7280" />
              <Card title="Alpha" value={pct(benchmark.alpha_pct_pp)}
                    sub={`XIRR ${benchmark.alpha_xirr_pp >= 0 ? "+" : ""}${benchmark.alpha_xirr_pp} pp · ${fmt(benchmark.portfolio_value - benchmark.benchmark_value)}`}
                    accent={benchmark.alpha_pct_pp >= 0 ? "#16a34a" : "#dc2626"} />
            </>) : (<>
              <Card title="Your Return" value={pct(stats.totalReturn)} sub="on cost basis"
                    accent={stats.totalReturn >= 0 ? "#16a34a" : "#dc2626"} />
              <Card title="Nifty 50" value="—"
                    sub={benchmarkState === "all" ? "select a client" : benchmarkState === "loading" ? "loading…" : "no deposits recorded"}
                    accent="#6b7280" />
              <Card title="Alpha" value="—" sub="needs deposit dates" accent="#6b7280" />
            </>)}
            <Card title="Win Rate" value={stats.winRate.toFixed(0) + "%"} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Realized vs Unrealized P&L</h3>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#475569" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#2563eb" }} />Realized (bars)</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: "#d97706" }} />Unrealized (line)</span>
              </div>
            </div>
            {(() => {
              const selS = { padding: "5px 8px", fontSize: 12, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, cursor: "pointer" };
              const qm = pnlQuarter === "All" ? null : (pnlQuarter - 1) * 3;
              const monthOpts = qm === null ? [0,1,2,3,4,5,6,7,8,9,10,11] : [qm, qm + 1, qm + 2];
              return (
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>View:</span>
                  <select style={selS} value={effYear} onChange={e => setPnlYear(Number(e.target.value))}>
                    {(pnlYears.length ? pnlYears : [effYear]).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select style={selS} value={pnlQuarter} onChange={e => {
                    const q = e.target.value === "All" ? "All" : Number(e.target.value);
                    setPnlQuarter(q);
                    if (q !== "All" && pnlMonth !== "All") { const s = (q - 1) * 3; if (pnlMonth < s || pnlMonth > s + 2) setPnlMonth("All"); }
                  }}>
                    <option value="All">All quarters</option>
                    {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                  <select style={selS} value={pnlMonth} onChange={e => setPnlMonth(e.target.value === "All" ? "All" : Number(e.target.value))}>
                    <option value="All">All months</option>
                    {monthOpts.map(m => <option key={m} value={m}>{MONTHS[m]}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    {pnlMonth !== "All" ? "weekly" : pnlQuarter !== "All" ? "3 months" : "12 months"}
                  </span>
                </div>
              );
            })()}
            {pnlChartData.length > 0 ? <PnlComboChart points={pnlChartData} /> :
              <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No data for this period.</div>}
          </div>
        </>)}
      </>)}

      {/* ── PORTFOLIO TAB ────────────────────────────────────────────────────── */}
      {view === "portfolio" && (() => {
        const totalVal = holdings.reduce((s, h) => s + h.currentVal, 0);
        const totalInvested = holdings.reduce((s, h) => s + h.investedHolding, 0);
        return (<>
          <div style={{ marginBottom: 14 }}><RefreshButton /></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Card title="Active Holdings" value={holdings.length + " stocks"} />
            <Card title="Total Invested" value={fmt(totalInvested)} />
            <Card title="Current Value" value={fmt(totalVal)} />
          </div>
          {holdings.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>No Active Holdings</div>
            </div>
          ) : (<>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Client","Stock","Net Qty","Avg Buy","CMP","Invested","Current Value","Weight"].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const weight = totalVal > 0 ? (h.currentVal / totalVal * 100) : 0;
                    return (<tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={td}>{h.client}</td><td style={{ ...td, fontWeight: 700 }}>{h.stock}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{h.netQty}</td><td style={td}>{fmt(h.avgBuyPrice)}</td>
                      <td style={td}>{fmt(h.cmp)}</td><td style={td}>{fmt(h.investedHolding)}</td>
                      <td style={td}>{fmt(h.currentVal)}</td><td style={td}>{weight.toFixed(1) + "%"}</td>
                    </tr>);
                  })}
                  <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                    <td style={td}>Total</td><td style={td} /><td style={td} /><td style={td} /><td style={td} />
                    <td style={td}>{fmt(totalInvested)}</td><td style={td}>{fmt(totalVal)}</td><td style={td}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb", marginTop: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Portfolio Allocation</h3>
              {holdings.map((h, i) => {
                const w = totalVal > 0 ? (h.currentVal / totalVal * 100) : 0;
                const colors = ["#2563eb","#16a34a","#f59e0b","#dc2626","#8b5cf6","#ec4899","#06b6d4"];
                return (<div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>{h.client} — {h.stock}</span>
                    <span style={{ color: "#6b7280" }}>{w.toFixed(1)}% • {fmt(h.currentVal)}</span>
                  </div>
                  <div style={{ background: "#f3f4f6", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${w}%`, height: "100%", background: colors[i % colors.length], borderRadius: 4 }} />
                  </div>
                </div>);
              })}
            </div>
          </>)}
        </>);
      })()}

      {/* ── TRADES TAB ──────────────────────────────────────────────────────── */}
      {view === "trades" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Trade Log</h3>
          <div style={{ display: "flex", gap: 6 }}>
            {showForm && <button onClick={cancelForm} style={btnS}>Cancel</button>}
            {!showForm && <button onClick={openAddTrade} style={btnP} disabled={clients.length === 0}>+ Add Trade</button>}
          </div>
        </div>

        {clients.length === 0 && !showForm && (
          <div style={{ background: "#fefce8", borderRadius: 10, padding: "10px 14px", border: "1px solid #fde68a", marginBottom: 12, fontSize: 12, color: "#92400e" }}>
            Add at least one client before logging trades.
          </div>
        )}

        {showForm && (
          <div style={{ background: editingId ? "#fffbeb" : "#fff", borderRadius: 12, padding: 14, border: `1px solid ${editingId ? "#fbbf24" : "#e5e7eb"}`, marginBottom: 14 }}>
            {editingId && <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>Editing Trade</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, overflow: "visible" }}>
              <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Client *</label>
                <select style={inp} value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Type *</label>
                <select style={inp} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></div>
              <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Stock * <span style={{ fontWeight: 400, color: "#9ca3af" }}>(NSE)</span></label>
                <StockAutocomplete value={form.stock_symbol} onChange={v => setForm(p => ({ ...p, stock_symbol: v }))} style={inp} /></div>
              <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Quantity *</label>
                <input type="number" style={inp} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} /></div>
              <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Price *</label>
                <input type="number" step="0.01" style={inp} value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} /></div>
              <div><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Date *</label>
                <input type="date" style={inp} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Notes</label>
                <input style={inp} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" /></div>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={handleSaveTrade} disabled={tradeSaving} style={{ ...btnP, background: editingId ? "#d97706" : "#2563eb", opacity: tradeSaving ? 0.7 : 1 }}>{tradeSaving ? "Saving…" : editingId ? "Save Changes" : "Add Trade"}</button>
              <button onClick={cancelForm} style={btnS}>Cancel</button>
              <span style={{ fontSize: 11, color: "#6b7280" }}>SELL validates against FIFO holdings</span>
            </div>
          </div>
        )}

        {/* Company-grouped positions: one row per company → Realised / Unrealised P&L, expand for lots */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Card title="Realized P&L" value={fmt(pnlTotals.realized)} accent={pnlTotals.realized >= 0 ? "#16a34a" : "#dc2626"} />
          <Card title="Unrealized P&L" value={fmt(pnlTotals.unrealized)} accent={pnlTotals.unrealized >= 0 ? "#16a34a" : "#dc2626"} />
          <Card title="Total P&L" value={fmt(pnlTotals.realized + pnlTotals.unrealized)} accent={(pnlTotals.realized + pnlTotals.unrealized) >= 0 ? "#16a34a" : "#dc2626"} />
        </div>

        {positions.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>No trades yet</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {[
                  { label: "", key: null, align: "left" },
                  ...(filterClient === "All" ? [{ label: "Client", key: "client", align: "left" }] : []),
                  { label: "Company", key: "company", align: "left" },
                  { label: "Qty Held", key: "qty", align: "right" },
                  { label: "Realized P&L", key: "realized", align: "right" },
                  { label: "Unrealized P&L", key: "unrealized", align: "right" },
                  { label: "Total P&L", key: "total", align: "right" },
                  { label: "Status", key: "status", align: "right" },
                ].map((col, i) => (
                  <th key={i} onClick={col.key ? () => setSort(col.key) : undefined}
                      style={{ ...th, textAlign: col.align, cursor: col.key ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                    {col.label}
                    {col.key && <span style={{ marginLeft: 4, fontSize: 10, color: sortCol === col.key ? "#2563eb" : "#cbd5e1" }}>{sortCol === col.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {positions.map((p) => {
                  const k = `${p.client}||${p.stock}`;
                  const open = expandedRows[k];
                  const statusMap = { holding: ["Holding", "blue"], partially_booked: ["Partial", "amber"], fully_booked: ["Booked", "green"] };
                  const [sLabel, sColor] = statusMap[p.status] || ["—", "gray"];
                  return (
                    <Fragment key={k}>
                      <tr onClick={() => toggleRow(k)} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: open ? "#f8fafc" : "transparent" }}>
                        <td style={{ ...td, width: 24, color: "#6b7280" }}>{open ? "▾" : "▸"}</td>
                        {filterClient === "All" && <td style={{ ...td, color: "#6b7280" }}>{p.client}</td>}
                        <td style={{ ...td, fontWeight: 700 }}>{p.stock}</td>
                        <td style={{ ...td, textAlign: "right" }}>{p.netQty > 0 ? p.netQty : "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600, color: p.realizedPL >= 0 ? "#16a34a" : "#dc2626" }}>{p.totalSells > 0 ? fmt(p.realizedPL) : "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600, color: p.unrealizedPL >= 0 ? "#16a34a" : "#dc2626" }}>{p.netQty > 0 ? fmt(p.unrealizedPL) : "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: p.totalPL >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(p.totalPL)}</td>
                        <td style={{ ...td, textAlign: "right" }}><Badge color={sColor}>{sLabel}</Badge></td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={filterClient === "All" ? 8 : 7} style={{ padding: "0 0 10px", background: "#f8fafc" }}>
                            <div style={{ padding: "8px 14px" }}>
                              {p.matchDetails.length > 0 && (<>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", margin: "4px 0 4px" }}>BOOKED (realised lots · FIFO)</div>
                                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                                  <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                    {["Buy Date", "Buy Avg", "Sell Date", "Sell Avg", "Qty", "P&L"].map((h, i) => <th key={h} style={{ ...th, fontSize: 10, textAlign: i < 4 ? "left" : "right" }}>{h}</th>)}
                                  </tr></thead>
                                  <tbody>{p.matchDetails.map((m, mi) => (
                                    <tr key={mi} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                      <td style={{ ...td, fontSize: 12 }}>{fmtDate(m.buyDate)}{m.intraday && <span style={{ marginLeft: 5, fontSize: 9, color: "#f59e0b", fontWeight: 700 }}>INTRADAY</span>}</td>
                                      <td style={{ ...td, fontSize: 12 }}>{fmt(m.buyPrice)}</td>
                                      <td style={{ ...td, fontSize: 12 }}>{fmtDate(m.sellDate)}</td>
                                      <td style={{ ...td, fontSize: 12 }}>{fmt(m.sellPrice)}</td>
                                      <td style={{ ...td, fontSize: 12, textAlign: "right" }}>{m.qty}</td>
                                      <td style={{ ...td, fontSize: 12, textAlign: "right", fontWeight: 600, color: m.pl >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(m.pl)}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              </>)}
                              {p.holdingLots.length > 0 && (<>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", margin: "4px 0 4px" }}>OPEN (still held · live price {fmt(p.cmp)})</div>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead><tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                    {["Buy Date", "Buy Avg", "Qty", "CMP", "Unrealized P&L"].map((h, i) => <th key={h} style={{ ...th, fontSize: 10, textAlign: i < 2 ? "left" : "right" }}>{h}</th>)}
                                  </tr></thead>
                                  <tbody>{p.holdingLots.map((b, bi) => (
                                    <tr key={bi} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                      <td style={{ ...td, fontSize: 12 }}>{fmtDate(b.date)}</td>
                                      <td style={{ ...td, fontSize: 12 }}>{fmt(b.price)}</td>
                                      <td style={{ ...td, fontSize: 12, textAlign: "right" }}>{b.remainQty}</td>
                                      <td style={{ ...td, fontSize: 12, textAlign: "right" }}>{fmt(p.cmp)}</td>
                                      <td style={{ ...td, fontSize: 12, textAlign: "right", fontWeight: 600, color: (p.cmp - b.price) >= 0 ? "#16a34a" : "#dc2626" }}>{fmt((p.cmp - b.price) * b.remainQty)}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Raw editable trade log (collapsible) */}
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setShowRawLog(v => !v)} style={{ ...btnS, fontSize: 12 }}>
            {showRawLog ? "▾ Hide raw trade log" : "▸ Show raw trade log (edit / delete)"}
          </button>
          {showRawLog && (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Client","Type","Stock","Qty","Price","Date","Notes",""].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>{[...filteredTrades].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => {
                  const isEditing = editingId === t.id;
                  return (<tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6", background: isEditing ? "#fffbeb" : "transparent" }}>
                    <td style={td}>{t.client_name}</td>
                    <td style={td}><Badge color={t.type === "BUY" ? "green" : "red"}>{t.type}</Badge></td>
                    <td style={{ ...td, fontWeight: 700 }}>{t.stock_symbol}</td>
                    <td style={td}>{t.quantity}</td>
                    <td style={td}>{fmt(t.price)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                    <td style={{ ...td, color: "#6b7280", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.notes || "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button onClick={() => startEdit(t)} title="Edit" style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✎</button>
                      <button onClick={() => handleDeleteTrade(t.id)} title="Delete" style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                    </td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* ── BENCHMARK TAB ───────────────────────────────────────────────────── */}
      {view === "benchmark" && (() => {
        const bmk = benchmarkState === "ok" ? benchmark : null;
        const ixCard = (key) => {
          const ix = bmk?.indices?.[key];
          if (!ix) return <Card key={key} title={INDEX_LABELS[key]} value="—" sub="needs deposit dates" accent="#6b7280" />;
          return <Card key={key} title={ix.label} value={pct(ix.return_pct)}
            sub={`XIRR ${ix.xirr_pct}%${ix.alpha_pct_pp != null ? ` · you ${ix.alpha_pct_pp >= 0 ? "+" : ""}${ix.alpha_pct_pp} pp` : ""}`}
            accent={ix.alpha_pct_pp != null ? (ix.alpha_pct_pp >= 0 ? "#16a34a" : "#dc2626") : "#6b7280"} />;
        };
        return (<>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Card title="Amount Invested" value={fmt(bmk ? bmk.net_invested : stats.totalInvested)}
                  sub={bmk ? "deposits − withdrawals" : "cost basis"} />
            <Card title="Current Value" value={fmt(bmk ? bmk.portfolio_value : stats.currentVal)}
                  sub={bmk ? "holdings + cash" : "holdings"} />
            <Card title="Unrealized P&L" value={fmt(stats.totalUnrealizedPL)}
                  accent={stats.totalUnrealizedPL >= 0 ? "#16a34a" : "#dc2626"} />
            <Card title="Realized P&L" value={fmt(stats.totalRealizedPL)}
                  accent={stats.totalRealizedPL >= 0 ? "#16a34a" : "#dc2626"} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Card title="Your Return" value={pct(bmk ? bmk.portfolio_return_pct : stats.totalReturn)}
                  sub={bmk ? `XIRR ${bmk.portfolio_xirr_pct}%` : "on cost basis"}
                  accent={(bmk ? bmk.portfolio_return_pct : stats.totalReturn) >= 0 ? "#16a34a" : "#dc2626"} />
            {["nifty50", "midcap150", "smallcap250"].map(ixCard)}
          </div>
          {bmk && (
            <div style={{ background: bmk.alpha_pct_pp >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 12, padding: 16, border: `1px solid ${bmk.alpha_pct_pp >= 0 ? "#bbf7d0" : "#fecaca"}`, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Alpha Generated vs Nifty 50</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: bmk.alpha_pct_pp >= 0 ? "#16a34a" : "#dc2626", marginTop: 4 }}>{pct(bmk.alpha_pct_pp)}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Portfolio {pct(bmk.portfolio_return_pct)} vs Nifty {pct(bmk.benchmark_return_pct)} · {fmt(bmk.portfolio_value - bmk.benchmark_value)} ahead</div>
            </div>
          )}
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Summary Report</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
              <div><span style={{ color: "#6b7280" }}>Your Return:</span><br /><strong style={{ color: (bmk ? bmk.portfolio_return_pct : stats.totalReturn) >= 0 ? "#16a34a" : "#dc2626" }}>{pct(bmk ? bmk.portfolio_return_pct : stats.totalReturn)}</strong></div>
              <div><span style={{ color: "#6b7280" }}>Your XIRR:</span><br /><strong>{bmk ? `${bmk.portfolio_xirr_pct}%` : "—"}</strong></div>
              {bmk && ["nifty50", "midcap150", "smallcap250"].map(k => bmk.indices?.[k] && (
                <div key={k}><span style={{ color: "#6b7280" }}>{bmk.indices[k].label}:</span><br />
                  <strong>{pct(bmk.indices[k].return_pct)}</strong>
                  <span style={{ color: bmk.indices[k].alpha_pct_pp >= 0 ? "#16a34a" : "#dc2626", fontSize: 12 }}>
                    {" "}(you {bmk.indices[k].alpha_pct_pp >= 0 ? "+" : ""}{bmk.indices[k].alpha_pct_pp} pp)
                  </span>
                </div>
              ))}
              <div><span style={{ color: "#6b7280" }}>Win Rate:</span><br /><strong>{stats.winRate.toFixed(0)}%</strong></div>
              <div><span style={{ color: "#6b7280" }}>Max Drawdown:</span><br /><strong style={{ color: "#dc2626" }}>{pct(-stats.maxDD)}</strong></div>
              <div><span style={{ color: "#6b7280" }}>{bmk ? "Net Deposits:" : "Total Invested:"}</span><br /><strong>{fmt(bmk ? bmk.net_invested : stats.totalInvested)}</strong></div>
            </div>
          </div>
        </>);
      })()}
    </div>
  );
}
