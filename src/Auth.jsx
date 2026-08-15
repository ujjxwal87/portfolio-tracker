import { useEffect, useState } from "react";
import { login, changePassword } from "./api";

/** The split collapses well before the app's own 767px break — the art panel needs real width. */
const NARROW_Q = "(max-width: 900px)";
function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_Q).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_Q);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

// Same treatment as the dashboard hero: concentric rings, 74px stripe texture, blue wash.
const ART_BG = {
  backgroundColor: "#0B1330",
  backgroundRepeat: "no-repeat,no-repeat,no-repeat,no-repeat,repeat-x,no-repeat",
  backgroundSize: "100% 1240px,100% 1240px,100% 1240px,100% 1240px,74px 100%,100% 100%",
  backgroundImage: [
    "radial-gradient(circle at 86% 10%, transparent 337px, rgba(147,197,253,.16) 338px 341px, transparent 342px)",
    "radial-gradient(circle at 86% 10%, transparent 227px, rgba(147,197,253,.15) 228px 231px, transparent 232px)",
    "radial-gradient(circle at 86% 10%, transparent 137px, rgba(147,197,253,.14) 138px 141px, transparent 142px)",
    "radial-gradient(760px 580px at 96% -4%, rgba(59,130,246,.38), transparent 68%)",
    "repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 74px)",
    "linear-gradient(135deg,#070E24 0%,#152C6B 52%,#2563EB 100%)",
  ].join(","),
};

const Logo = ({ size = 38 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.32, display: "grid",
                placeItems: "center", background: "linear-gradient(135deg,#2563EB,#0EA5E9)",
                color: "#fff", fontSize: size * 0.45, fontWeight: 800, flex: "none",
                boxShadow: "0 6px 18px -6px rgba(14,165,233,.8)" }}>E</div>
);

const Wordmark = ({ dark }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
    <Logo />
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.02em",
                    color: dark ? "#fff" : "var(--ink)" }}>Eros Financial Service</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".11em", textTransform: "uppercase",
                    color: dark ? "rgba(255,255,255,.5)" : "var(--ink-3)" }}>Wealth tracker</div>
    </div>
  </div>
);

/** Portfolio vs Nifty, drawn not measured — this is decoration on a page with no session yet. */
const ProofChart = () => (
  <div style={{ marginTop: 34, borderRadius: 18, padding: "18px 20px 8px",
                background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)" }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase",
                    color: "rgba(255,255,255,.55)" }}>Performance since first investment</div>
      <div style={{ display: "flex", gap: 14, fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <span style={{ width: 14, height: 2.5, background: "#60A5FA", borderRadius: 2 }} />Portfolio</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <span style={{ width: 14, height: 0, borderTop: "2.5px dashed rgba(255,255,255,.55)" }} />Nifty 50</span>
      </div>
    </div>
    <svg viewBox="0 0 520 172" style={{ width: "100%", height: 150, display: "block", marginTop: 6 }}
         preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity=".42" />
          <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[42, 86, 130].map(y => (
        <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="rgba(255,255,255,.10)" strokeWidth="1" />
      ))}
      <path d="M0,150 C40,142 60,120 90,124 S140,96 170,104 S220,70 250,80 S300,52 330,44 S390,60 420,38 S486,26 520,16 L520,172 L0,172 Z" fill="url(#pfFill)" />
      <path d="M0,152 C50,148 70,138 100,140 S160,124 190,128 S250,110 280,112 S340,96 370,100 S440,86 470,80 S510,74 520,70"
            fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeDasharray="6 5" />
      <path d="M0,150 C40,142 60,120 90,124 S140,96 170,104 S220,70 250,80 S300,52 330,44 S390,60 420,38 S486,26 520,16"
            fill="none" stroke="#93C5FD" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="516" cy="16" r="4" fill="#fff" />
    </svg>
  </div>
);

const ArtPanel = () => (
  <div style={{ ...ART_BG, position: "relative", overflow: "hidden", color: "#fff",
                padding: "44px 46px", display: "flex", flexDirection: "column" }}>
    <Wordmark dark />
    <div style={{ marginTop: 46, maxWidth: 430 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".11em", textTransform: "uppercase",
                    color: "rgba(255,255,255,.55)" }}>Wealth tracker</div>
      <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.1, marginTop: 12 }}>
        Your wealth, in one clear view.
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.72)", marginTop: 14 }}>
        Holdings, gains and returns in one place — measured against the market, updated through the day.
      </div>
    </div>
    <ProofChart />
    <div style={{ marginTop: "auto" }} />
  </div>
);

/** Split shell: art beside the form on desktop, form alone under a compact brand bar when narrow. */
function AuthShell({ children }) {
  const narrow = useNarrow();
  return (
    <div style={{ minHeight: "100vh", background: "#EEF1F5", display: "grid", placeItems: "center",
                  padding: narrow ? 16 : 24, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: narrow ? 440 : 1180, borderRadius: 20, overflow: "hidden",
                    display: "grid", gridTemplateColumns: narrow ? "1fr" : "1.18fr 1fr",
                    minHeight: narrow ? 0 : 700, background: "#fff",
                    boxShadow: "0 2px 6px rgba(15,23,42,.06), 0 30px 70px -30px rgba(15,23,42,.35)" }}>
        {narrow
          ? <div style={{ ...ART_BG, padding: "22px 24px" }}><Wordmark dark /></div>
          : <ArtPanel />}
        <div style={{ display: "grid", placeItems: "center", padding: narrow ? "28px 24px 32px" : "44px 52px",
                      background: "#fff" }}>
          <div style={{ width: "100%", maxWidth: 352 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 10.5, fontWeight: 700, color: "#94A3B8",
  textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6,
};

/** Inline styles can't express :focus, so the ring is driven by local state. */
function TextField({ label, trailing, style, ...props }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input {...props} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
               style={{ width: "100%", boxSizing: "border-box",
                        padding: trailing ? "11px 62px 11px 13px" : "11px 13px",
                        borderRadius: 10, border: `1px solid ${focus ? "#2563EB" : "#E1E6EE"}`,
                        boxShadow: focus ? "0 0 0 3px rgba(37,99,235,.16)" : "none",
                        fontFamily: "inherit", fontSize: 13.5, color: "var(--ink)", outline: "none",
                        background: "#fff", ...style }} />
        {trailing}
      </div>
    </div>
  );
}

const PwToggle = ({ shown, onClick }) => (
  <button type="button" onClick={onClick} tabIndex={-1}
          style={{ position: "absolute", right: 8, border: "none", background: "none", cursor: "pointer",
                   fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "#2563EB", padding: "6px" }}>
    {shown ? "Hide" : "Show"}
  </button>
);

const primaryBtn = {
  width: "100%", marginTop: 18, padding: "12px 18px", borderRadius: 11, border: "none",
  background: "#2563EB", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5,
  cursor: "pointer", boxShadow: "0 10px 24px -12px rgba(37,99,235,.9)",
};
const noteStyle = { fontSize: 12.5, fontWeight: 600, marginTop: 14, lineHeight: 1.45 };

const Heading = ({ title, sub }) => (<>
  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>{title}</div>
  <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 6, lineHeight: 1.5 }}>{sub}</div>
</>);

/** The shared demo account. Its password is handed out by the advisor, never shown here. */
const GUEST_USERNAME = "guest";

const MODES = [
  { key: "client", label: "Client", caption: "Sign in to your portfolio",
    hint: "Forgot your password? Ask your advisor to reset it." },
  { key: "admin", label: "Admin", caption: "Advisor sign-in",
    hint: "Full access to every client's book." },
  { key: "guest", label: "Guest", caption: "Sample portfolios, real performance",
    hint: "Anonymised client data. Enter the demo password you were given." },
];

export function LoginScreen({ onSignedIn, notice }) {
  const [mode, setMode] = useState("client");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isGuestMode = mode === "guest";
  const active = MODES.find(m => m.key === mode);

  const switchMode = (key) => {
    setMode(key);
    setError("");
    setPassword("");
    setShowPw(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const user = isGuestMode ? GUEST_USERNAME : username.trim();
    if (!user || !password) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await login(user, password));
    } catch (err) {
      setError(err.message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Heading title={active.caption}
                 sub="Signed sessions expire after idle time — you may be asked again." />

        <div style={{ display: "flex", gap: 3, background: "#F1F4F8", padding: 3, borderRadius: 10,
                      margin: "22px 0 20px" }}>
          {MODES.map(m => {
            const on = mode === m.key;
            return (
              <button key={m.key} type="button" onClick={() => switchMode(m.key)} style={{
                flex: 1, padding: "9px 6px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: on ? 700 : 600,
                background: on ? "#fff" : "transparent", color: on ? "var(--ink)" : "#94A3B8",
                boxShadow: on ? "0 1px 3px rgba(15,23,42,.14)" : "none",
              }}>{m.label}</button>
            );
          })}
        </div>

        {notice && !error && (
          <div style={{ ...noteStyle, marginTop: 0, marginBottom: 16, color: "var(--amber)" }}>{notice}</div>
        )}

        {!isGuestMode && (
          <TextField key="username" label="Username" autoFocus autoCapitalize="none" autoCorrect="off"
                     placeholder="rohan.mehta" value={username}
                     onChange={e => setUsername(e.target.value)} />
        )}
        <TextField key={`pw-${mode}`} label={isGuestMode ? "Demo password" : "Password"}
                   type={showPw ? "text" : "password"} autoFocus={isGuestMode} placeholder="••••••••"
                   value={password} onChange={e => setPassword(e.target.value)}
                   trailing={<PwToggle shown={showPw} onClick={() => setShowPw(v => !v)} />} />

        <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? .7 : 1 }}>
          {busy ? "Signing in…" : isGuestMode ? "View sample portfolios" : "Sign in"}
        </button>
        {error && <div style={{ ...noteStyle, color: "var(--bad)" }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 12px" }}>
          <span style={{ flex: 1, height: 1, background: "#EEF1F5" }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", color: "#C3CCD8" }}>SECURED</span>
          <span style={{ flex: 1, height: 1, background: "#EEF1F5" }} />
        </div>
        <div style={{ fontSize: 11.5, color: "#94A3B8", textAlign: "center", lineHeight: 1.5 }}>
          {active.hint}
        </div>
      </form>
    </AuthShell>
  );
}

/** Shown full-screen when must_change_password is set — no way past it but to set a new one. */
export function ChangePasswordScreen({ user, forced, onDone, onCancel }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      await changePassword(current, next);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const type = showPw ? "text" : "password";
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Heading title={forced ? `Welcome, ${user?.name || user?.username}` : "Change your password"}
                 sub={forced
                   ? "This is a temporary password. Set one only you know to continue."
                   : "Pick something at least 8 characters long."} />
        <div style={{ height: 22 }} />
        <TextField label={forced ? "Temporary password" : "Current password"} type={type} autoFocus
                   value={current} onChange={e => setCurrent(e.target.value)}
                   trailing={<PwToggle shown={showPw} onClick={() => setShowPw(v => !v)} />} />
        <TextField label="New password" type={type} value={next}
                   onChange={e => setNext(e.target.value)} />
        <TextField label="Confirm new password" type={type} value={confirm}
                   onChange={e => setConfirm(e.target.value)} />
        <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? .7 : 1 }}>
          {busy ? "Saving…" : "Save password"}
        </button>
        {error && <div style={{ ...noteStyle, color: "var(--bad)" }}>{error}</div>}
        {!forced && (
          <button type="button" onClick={onCancel}
                  style={{ width: "100%", marginTop: 10, padding: "11px 18px", borderRadius: 11,
                           border: "1px solid var(--line)", background: "#fff", fontFamily: "inherit",
                           color: "var(--ink-2)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        )}
      </form>
    </AuthShell>
  );
}
