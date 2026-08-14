import { useState } from "react";
import { login, changePassword } from "./api";

const shell = {
  minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
  background: "radial-gradient(1100px 520px at 50% -10%, #1e3a8a 0%, #0f172a 58%, #0b1120 100%)",
};
const card = {
  width: "100%", maxWidth: 396, background: "var(--surface)", borderRadius: "var(--r-lg)",
  padding: 30, boxShadow: "0 24px 60px -18px rgba(8,15,35,.55)",
};
const label = {
  display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)",
  textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6,
};
const input = {
  width: "100%", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid #d8dee6",
  fontSize: 13.5, background: "var(--surface)", color: "var(--ink)",
};
const primary = {
  width: "100%", padding: "11px 18px", borderRadius: "var(--r-sm)", border: "none",
  background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
  boxShadow: "0 2px 10px -2px rgba(37,99,235,.55)",
};
const note = { fontSize: 12.5, fontWeight: 600, marginTop: 14, lineHeight: 1.45 };

const Brand = ({ caption }) => (
  <div style={{ textAlign: "center", marginBottom: 24 }}>
    <div style={{ width: 42, height: 42, borderRadius: 13, margin: "0 auto 12px", display: "grid",
                  placeItems: "center", background: "linear-gradient(135deg,#2563EB,#0EA5E9)",
                  color: "#fff", fontWeight: 700, fontSize: 19 }}>E</div>
    <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.02em" }}>Eros Financial Service</div>
    <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{caption}</div>
  </div>
);

const Field = ({ children, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={label}>{children}</label>
    <input style={input} {...props} />
  </div>
);

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isGuestMode = mode === "guest";
  const active = MODES.find(m => m.key === mode);

  const switchMode = (key) => {
    setMode(key);
    setError("");
    setPassword("");
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
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <Brand caption={active.caption} />

        <div style={{ display: "flex", gap: 3, background: "#f1f4f8", padding: 3, borderRadius: 10, marginBottom: 20 }}>
          {MODES.map(m => (
            <button key={m.key} type="button" onClick={() => switchMode(m.key)} style={{
              flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: mode === m.key ? 700 : 500,
              background: mode === m.key ? "var(--surface)" : "transparent",
              color: mode === m.key ? "var(--ink)" : "var(--ink-3)",
              boxShadow: mode === m.key ? "var(--shadow-sm)" : "none",
            }}>{m.label}</button>
          ))}
        </div>

        {notice && !error && (
          <div style={{ ...note, marginTop: 0, marginBottom: 16, color: "var(--amber)" }}>{notice}</div>
        )}

        {!isGuestMode && (
          <Field key="username" autoFocus autoCapitalize="none" autoCorrect="off" value={username}
                 onChange={e => setUsername(e.target.value)}>Username</Field>
        )}
        <Field key={`pw-${mode}`} type="password" autoFocus={isGuestMode} value={password}
               onChange={e => setPassword(e.target.value)}>
          {isGuestMode ? "Demo password" : "Password"}
        </Field>

        <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? .7 : 1, marginTop: 4 }}>
          {busy ? "Signing in…" : isGuestMode ? "View sample portfolios" : "Sign in"}
        </button>
        {error && <div style={{ ...note, color: "var(--bad)" }}>{error}</div>}
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 18, textAlign: "center", lineHeight: 1.5 }}>
          {active.hint}
        </div>
      </form>
    </div>
  );
}

/** Shown full-screen when must_change_password is set — no way past it but to set a new one. */
export function ChangePasswordScreen({ user, forced, onDone, onCancel }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
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

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <Brand caption={forced ? `Welcome, ${user?.name || user?.username}` : "Change your password"} />
        {forced && (
          <div style={{ ...note, marginTop: 0, marginBottom: 16, color: "var(--ink-2)", fontWeight: 500 }}>
            This is a temporary password. Set one only you know to continue.
          </div>
        )}
        <Field type="password" autoFocus value={current}
               onChange={e => setCurrent(e.target.value)}>
          {forced ? "Temporary password" : "Current password"}
        </Field>
        <Field type="password" value={next} onChange={e => setNext(e.target.value)}>New password</Field>
        <Field type="password" value={confirm}
               onChange={e => setConfirm(e.target.value)}>Confirm new password</Field>
        <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? .7 : 1, marginTop: 4 }}>
          {busy ? "Saving…" : "Save password"}
        </button>
        {error && <div style={{ ...note, color: "var(--bad)" }}>{error}</div>}
        {!forced && (
          <button type="button" onClick={onCancel}
                  style={{ width: "100%", marginTop: 10, padding: "10px 18px", borderRadius: "var(--r-sm)",
                           border: "1px solid var(--line)", background: "var(--surface)",
                           color: "var(--ink-2)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
