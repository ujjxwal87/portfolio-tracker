import { useState, useMemo, useRef, useEffect, useCallback } from "react";

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
    g.sells.forEach(sell => {
      let remaining = sell.quantity;
      for (let buy of g.buys) {
        if (remaining <= 0) break;
        if (buy.remainQty <= 0) continue;
        const matched = Math.min(buy.remainQty, remaining);
        buy.remainQty -= matched;
        remaining -= matched;
        const pl = (sell.price - buy.price) * matched;
        realizedPL += pl;
        totalSoldQty += matched;
        matchDetails.push({ buyDate: buy.date, buyPrice: buy.price, sellDate: sell.date, sellPrice: sell.price, qty: matched, pl });
      }
    });
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

const EMPTY_CLIENT_FORM = { name: "", phone: "", email: "", joining_date: "" };
const EMPTY_TRADE_FORM = { client_id: "", stock_symbol: "", type: "BUY", quantity: "", price: "", date: "", notes: "" };

export default function App() {
  const [clients, setClients] = useState([]);
  const [trades, setTrades] = useState([]);
  const [nifty, setNifty] = useState([]);
  const [monthlyPrices, setMonthlyPrices] = useState({});
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

  const loadData = useCallback(async () => {
    try {
      const [c, t, n] = await Promise.all([
        apiFetch("/clients"),
        apiFetch("/trades"),
        apiFetch("/nifty"),
      ]);
      setClients(c);
      setTrades(t);
      setNifty(n);
      const initCmp = {};
      t.forEach(tr => { if (!initCmp[tr.stock_symbol]) initCmp[tr.stock_symbol] = Number(tr.price); });
      setCmp(prev => ({ ...initCmp, ...prev }));
      // Fire-and-forget: monthly historical prices for benchmark chart
      const stocks = [...new Set(t.map(tr => tr.stock_symbol))];
      if (stocks.length > 0) {
        apiFetch(`/prices/monthly?symbols=${stocks.join(",")}`).then(mp => setMonthlyPrices(mp)).catch(() => {});
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

  const stats = useMemo(() => {
    const totalRealizedPL = portfolio.reduce((s, p) => s + p.realizedPL, 0);
    const totalUnrealizedPL = portfolio.reduce((s, p) => s + p.unrealizedPL, 0);
    const totalPL = totalRealizedPL + totalUnrealizedPL;
    const totalInvested = portfolio.reduce((s, p) => s + p.investedHolding, 0) + portfolio.reduce((s, p) => s + p.matchDetails.reduce((ss, m) => ss + m.buyPrice * m.qty, 0), 0);
    const totalReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
    const nBase = nifty.length > 0 ? nifty[0].value : 0;
    const nEnd  = nifty.length > 0 ? nifty[nifty.length - 1].value : 0;
    const niftyReturn = nBase > 0 ? ((nEnd - nBase) / nBase) * 100 : 0;
    const alpha = totalReturn - niftyReturn;
    const realizedTrades = portfolio.flatMap(p => p.matchDetails);
    const wins = realizedTrades.filter(m => m.pl > 0).length;
    const winRate = realizedTrades.length > 0 ? (wins / realizedTrades.length) * 100 : 0;
    let maxDD = 0, peak = 0, running = 0;
    realizedTrades.sort((a, b) => a.sellDate.localeCompare(b.sellDate)).forEach(m => { running += m.pl; if (running > peak) peak = running; const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0; if (dd > maxDD) maxDD = dd; });
    const currentVal = holdings.reduce((s, h) => s + h.currentVal, 0);
    return { totalRealizedPL, totalUnrealizedPL, totalPL, totalInvested, totalReturn, niftyReturn, alpha, winRate, maxDD, currentVal };
  }, [portfolio, holdings, nifty]);

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
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>Benchmark: Nifty 50 • FIFO Cost Basis • NSE Live Prices</p>
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
            <Card title="Your Return" value={pct(stats.totalReturn)} accent={stats.totalReturn >= 0 ? "#16a34a" : "#dc2626"} />
            <Card title="Nifty 50" value={pct(stats.niftyReturn)} accent="#6b7280" />
            <Card title="Alpha" value={pct(stats.alpha)} accent={stats.alpha >= 0 ? "#16a34a" : "#dc2626"} />
            <Card title="Win Rate" value={stats.winRate.toFixed(0) + "%"} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Performance vs Benchmark</h3>
            <MiniBar label="Your Portfolio" val={stats.totalReturn} max={Math.max(Math.abs(stats.totalReturn), Math.abs(stats.niftyReturn), 1)} color={stats.totalReturn >= 0 ? "#16a34a" : "#dc2626"} />
            <MiniBar label="Nifty 50" val={stats.niftyReturn} max={Math.max(Math.abs(stats.totalReturn), Math.abs(stats.niftyReturn), 1)} color="#6366f1" />
            <MiniBar label="Max Drawdown" val={-stats.maxDD} max={Math.max(stats.maxDD, 1)} color="#f59e0b" />
          </div>
          <div style={{ marginTop: 8 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, borderTop: "2px solid #e5e7eb", paddingTop: 16 }}>P&L Summary</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Client","Stock","Bought","Sold","Avg Buy","Avg Sell","Realized P&L","Unrealized P&L","Total P&L","Status"].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>{portfolio.map((p, i) => {
                  const avgBuyAll = p.totalBuys > 0 ? filteredTrades.filter(t => t.client_name === p.client && t.stock_symbol === p.stock && t.type === "BUY").reduce((s, t) => s + Number(t.price) * t.quantity, 0) / p.totalBuys : 0;
                  const avgSell = p.totalSells > 0 ? p.matchDetails.reduce((s, m) => s + m.sellPrice * m.qty, 0) / p.totalSells : 0;
                  const statusMap = { holding: ["Holding","blue"], partially_booked: ["Partial","amber"], fully_booked: ["Booked","green"] };
                  const [sLabel, sColor] = statusMap[p.status] || ["—","gray"];
                  return (<tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={td}>{p.client}</td><td style={{ ...td, fontWeight: 700 }}>{p.stock}</td>
                    <td style={td}>{p.totalBuys}</td><td style={td}>{p.totalSells > 0 ? p.totalSells : "—"}</td>
                    <td style={td}>{fmt(avgBuyAll)}</td><td style={td}>{p.totalSells > 0 ? fmt(avgSell) : "—"}</td>
                    <td style={{ ...td, fontWeight: 600, color: p.realizedPL >= 0 ? "#16a34a" : "#dc2626" }}>{p.realizedPL !== 0 ? fmt(p.realizedPL) : "—"}</td>
                    <td style={{ ...td, fontWeight: 600, color: p.unrealizedPL >= 0 ? "#16a34a" : "#dc2626" }}>{p.netQty > 0 ? fmt(p.unrealizedPL) : "—"}</td>
                    <td style={{ ...td, fontWeight: 700, color: p.totalPL >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(p.totalPL)}</td>
                    <td style={td}><Badge color={sColor}>{sLabel}</Badge></td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
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

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              {["Client","Type","Stock","Qty","Price","Date","Notes","Status",""].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>{[...filteredTrades].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => {
              const res = portfolio.find(p => p.client === t.client_name && p.stock === t.stock_symbol);
              const statusMap = { holding: ["Holding","blue"], partially_booked: ["Partial","amber"], fully_booked: ["Booked","green"] };
              const [sLabel, sColor] = res ? (statusMap[res.status] || ["—","gray"]) : ["—","gray"];
              const isEditing = editingId === t.id;
              return (<tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6", background: isEditing ? "#fffbeb" : "transparent" }}>
                <td style={td}>{t.client_name}</td>
                <td style={td}><Badge color={t.type === "BUY" ? "green" : "red"}>{t.type}</Badge></td>
                <td style={{ ...td, fontWeight: 700 }}>{t.stock_symbol}</td>
                <td style={td}>{t.quantity}</td>
                <td style={td}>{fmt(t.price)}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                <td style={{ ...td, color: "#6b7280", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.notes || "—"}</td>
                <td style={td}><Badge color={sColor}>{sLabel}</Badge></td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button onClick={() => startEdit(t)} title="Edit" style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✎</button>
                  <button onClick={() => handleDeleteTrade(t.id)} title="Delete" style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                </td>
              </tr>);
            })}</tbody>
          </table>
        </div>
      </>)}

      {/* ── BENCHMARK TAB ───────────────────────────────────────────────────── */}
      {view === "benchmark" && (() => {
        if (nifty.length === 0) return (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>Loading Nifty 50 data…</div>
          </div>
        );
        const monthKeys = nifty.map(n => n.month);
        const parseMonth = (d) => { if (!d) return null; const dt = new Date(d); return `${dt.toLocaleString("en-US",{month:"short"})} ${String(dt.getFullYear()).slice(2)}`; };

        // Nifty return — cumulative from Jan 26 baseline
        const nBase = nifty[0].value;
        const niftyRets = nifty.map(n => ((n.value - nBase) / nBase) * 100);

        // Portfolio return — value on 1st trading day of each month vs total invested
        // A month's data point shows: (value of all holdings at START of that month + sell proceeds) / total buy cost − 1
        // "First non-zero" naturally appears the month AFTER the first trade month.
        const portRets = monthKeys.map((mk, mkIdx) => {
          // Only trades whose month comes BEFORE this month
          const prior = filteredTrades.filter(t => {
            const tm = parseMonth(t.date);
            const tmIdx = monthKeys.indexOf(tm);
            return tmIdx >= 0 && tmIdx < mkIdx;
          });
          if (!prior.some(t => t.type === "BUY")) return 0;

          const totalBuyCost = prior.filter(t => t.type === "BUY").reduce((s, t) => s + t.quantity * Number(t.price), 0);
          if (totalBuyCost <= 0) return 0;

          // FIFO: track remaining lots
          const lots = {};
          [...prior].sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(t => {
            const sym = t.stock_symbol;
            if (t.type === "BUY") {
              if (!lots[sym]) lots[sym] = [];
              lots[sym].push({ qty: t.quantity, price: Number(t.price) });
            } else {
              if (!lots[sym]) return;
              let rem = t.quantity;
              while (rem > 0 && lots[sym].length > 0) {
                if (lots[sym][0].qty <= rem) { rem -= lots[sym][0].qty; lots[sym].shift(); }
                else { lots[sym][0].qty -= rem; rem = 0; }
              }
            }
          });

          // Value of remaining holdings at start of this month (first trading-day price)
          let holdingsValue = 0;
          Object.entries(lots).forEach(([sym, symLots]) => {
            const qty = symLots.reduce((s, l) => s + l.qty, 0);
            if (qty > 0) {
              const price = monthlyPrices?.[sym]?.[mk] ?? cmp[sym] ?? 0;
              holdingsValue += qty * price;
            }
          });

          const sellProceeds = prior.filter(t => t.type === "SELL").reduce((s, t) => s + t.quantity * Number(t.price), 0);
          return ((holdingsValue + sellProceeds - totalBuyCost) / totalBuyCost) * 100;
        });

        const allV = [...niftyRets, ...portRets];
        const yMin = Math.min(...allV, 0) - 3, yMax = Math.max(...allV, 0) + 3;
        const cW = 540, cH = 180, PAD_TOP = 22, PAD_BOT = 40;
        const xOf = (i) => 42 + (monthKeys.length > 1 ? i / (monthKeys.length - 1) : 0.5) * (cW - 62);
        const yOf = (v) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * cH;
        const toXY = (vals) => vals.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
        const nPts = toXY(niftyRets), pPts = toXY(portRets);
        const poly = (pts) => pts.map(p => `${p.x},${p.y}`).join(" ");
        const zeroY = yOf(0);
        const yTicks = []; const step = Math.max(Math.ceil((yMax - yMin) / 5), 1);
        for (let v = Math.ceil(yMin); v <= yMax; v += step) yTicks.push({ v, y: yOf(v) });
        const svgH = cH + PAD_TOP + PAD_BOT;

        return (<>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Portfolio vs Nifty 50 — Cumulative Returns</h3>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280" }}>{monthKeys[0]} – {monthKeys[monthKeys.length - 1]} • {filterClient === "All" ? "All Clients" : filterClient}</p>
            <div style={{ display: "flex", gap: 20, marginBottom: 10, fontSize: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 18, height: 3, background: "#16a34a", borderRadius: 2 }} /><strong style={{ fontSize: 12 }}>Portfolio</strong></span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 18, height: 3, background: "#6366f1", borderRadius: 2 }} /><strong style={{ fontSize: 12 }}>Nifty 50</strong></span>
              {Object.keys(monthlyPrices).length === 0 && filteredTrades.length > 0 && <span style={{ fontSize: 11, color: "#f59e0b" }}>⟳ Loading historical prices…</span>}
            </div>
            <svg viewBox={`0 0 ${cW} ${svgH}`} width="100%" style={{ maxHeight: 300, overflow: "visible" }}>
              {/* Grid lines + Y-axis labels */}
              {yTicks.map((t, i) => (
                <g key={i}>
                  <line x1={42} y1={t.y} x2={cW - 10} y2={t.y} stroke="#e5e7eb" strokeWidth=".5" />
                  <text x={38} y={t.y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{t.v > 0 ? "+" : ""}{t.v}%</text>
                </g>
              ))}
              {/* Zero baseline */}
              <line x1={42} y1={zeroY} x2={cW - 10} y2={zeroY} stroke="#9ca3af" strokeWidth="1" strokeDasharray="4,3" />
              {/* Lines */}
              <polyline points={poly(nPts)} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" opacity=".8" />
              <polyline points={poly(pPts)} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" />
              {/* Nifty dots + labels (below dot) */}
              {nPts.map((p, i) => {
                const v = niftyRets[i];
                const labelY = v >= 0 ? p.y + 15 : p.y - 6;
                return (
                  <g key={"n" + i}>
                    <circle cx={p.x} cy={p.y} r="3" fill="#6366f1" opacity=".8" />
                    {i > 0 && <text x={p.x} y={labelY} textAnchor="middle" fontSize="9" fontWeight="600" fill="#6366f1">{v > 0 ? "+" : ""}{v.toFixed(1)}%</text>}
                  </g>
                );
              })}
              {/* Portfolio dots + labels (above dot) */}
              {pPts.map((p, i) => {
                const v = portRets[i];
                const isZero = Math.abs(v) < 0.01;
                const labelY = v >= 0 ? p.y - 8 : p.y + 15;
                return (
                  <g key={"p" + i}>
                    <circle cx={p.x} cy={p.y} r="3.5" fill={isZero ? "#d1d5db" : v >= 0 ? "#16a34a" : "#dc2626"} />
                    {!isZero && <text x={p.x} y={labelY} textAnchor="middle" fontSize="9" fontWeight="700" fill={v >= 0 ? "#15803d" : "#dc2626"}>{v > 0 ? "+" : ""}{v.toFixed(1)}%</text>}
                  </g>
                );
              })}
              {/* X-axis month labels */}
              {monthKeys.map((mk, i) => (
                <text key={mk} x={xOf(i)} y={svgH - 6} textAnchor="middle" fontSize="10" fill="#374151" fontWeight="600">{mk}</text>
              ))}
            </svg>
          </div>
          <div style={{ background: stats.alpha >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 12, padding: 16, border: `1px solid ${stats.alpha >= 0 ? "#bbf7d0" : "#fecaca"}`, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Alpha Generated vs Nifty 50</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: stats.alpha >= 0 ? "#16a34a" : "#dc2626", marginTop: 4 }}>{pct(stats.alpha)}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Portfolio {pct(stats.totalReturn)} vs Nifty {pct(stats.niftyReturn)}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Summary Report</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
              <div><span style={{ color: "#6b7280" }}>Your Return:</span><br /><strong style={{ color: stats.totalReturn >= 0 ? "#16a34a" : "#dc2626" }}>{pct(stats.totalReturn)}</strong></div>
              <div><span style={{ color: "#6b7280" }}>Nifty 50:</span><br /><strong>{pct(stats.niftyReturn)}</strong></div>
              <div><span style={{ color: "#6b7280" }}>Alpha:</span><br /><strong style={{ color: stats.alpha >= 0 ? "#16a34a" : "#dc2626" }}>{pct(stats.alpha)}</strong></div>
              <div><span style={{ color: "#6b7280" }}>Win Rate:</span><br /><strong>{stats.winRate.toFixed(0)}%</strong></div>
              <div><span style={{ color: "#6b7280" }}>Max Drawdown:</span><br /><strong style={{ color: "#dc2626" }}>{pct(-stats.maxDD)}</strong></div>
              <div><span style={{ color: "#6b7280" }}>Total Invested:</span><br /><strong>{fmt(stats.totalInvested)}</strong></div>
            </div>
          </div>
        </>);
      })()}
    </div>
  );
}
