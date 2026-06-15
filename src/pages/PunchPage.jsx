import { useState, useRef, useEffect } from "react";
import { useFunnelAgency } from '../hooks/useFunnelAgency';

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/punch`;

const ACTION_CONFIG = {
  not_clocked_in:   { next: "clock_in",  label: "Clock In",        color: "#10B981", icon: "▶" },
  clocked_in:       { next: "lunch_out", label: "Lunch Out",       color: "#F59E0B", icon: "☕", secondary: { next: "clock_out", label: "Clock Out", color: "#EF4444" } },
  on_lunch:         { next: "lunch_in",  label: "Back from Lunch", color: "#3B82F6", icon: "↩" },
  back_from_lunch:  { next: "clock_out", label: "Clock Out",       color: "#EF4444", icon: "■" },
  clocked_out:      { label: "Done for today", color: "var(--qs-subtle)", done: true },
};

const STATUS_LABELS = {
  not_clocked_in:  "Not clocked in",
  clocked_in:      "Clocked in",
  on_lunch:        "On lunch",
  back_from_lunch: "Back from lunch",
  clocked_out:     "Clocked out",
};

export default function PunchPage() {
  const [screen, setScreen] = useState("pin");   // pin | status | success | error
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [currentStatus, setCurrentStatus] = useState("not_clocked_in");
  const [entry, setEntry] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [lastTime, setLastTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pinRefs = [useRef(), useRef(), useRef(), useRef()];
  const returnTimer = useRef(null);
  const { data: funnelAgency } = useFunnelAgency();
  const brandName = funnelAgency?.brand_name || 'Agency';

  // Auto-focus first PIN box on mount
  useEffect(() => { pinRefs[0].current?.focus(); }, []);

  // Clean up auto-return timer on unmount
  useEffect(() => {
    return () => { if (returnTimer.current) clearTimeout(returnTimer.current); };
  }, []);

  function handlePinInput(i, val) {
    if (!/^\d?$/.test(val)) return;
    const digits = pin.split("");
    digits[i] = val;
    const newPin = digits.join("").slice(0, 4);
    setPin(newPin);
    if (val && i < 3) pinRefs[i + 1].current?.focus();
    if (newPin.length === 4) submitPin(newPin);
  }

  function handlePinKey(i, e) {
    if (e.key === "Backspace" && !pin[i] && i > 0) {
      pinRefs[i - 1].current?.focus();
    }
  }

  async function submitPin(p) {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: "status", pin: p }),
      });
      const data = await res.json();
      if (data.error) { setErrorMsg(data.error); setPin(""); setScreen("pin"); pinRefs[0].current?.focus(); }
      else {
        setEmployeeName(data.name);
        setCurrentStatus(data.currentStatus);
        setEntry(data.entry);
        setScreen("status");
      }
    } catch {
      setErrorMsg("Connection error. Try again.");
      setPin("");
      setScreen("pin");
    } finally {
      setLoading(false);
    }
  }

  async function submitAction(action) {
    setLoading(true);
    try {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action, pin }),
      });
      const data = await res.json();
      if (data.error) { setErrorMsg(data.error); }
      else {
        setLastAction(action);
        setLastTime(data.time);
        setCurrentStatus(data.currentStatus);
        setEntry(data.entry);
        setScreen("success");
        // Auto-return to PIN screen after 4 seconds
        returnTimer.current = setTimeout(() => { setPin(""); setScreen("pin"); pinRefs[0].current?.focus(); }, 4000);
      }
    } catch {
      setErrorMsg("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const actionCfg = ACTION_CONFIG[currentStatus] || ACTION_CONFIG.not_clocked_in;

  const ACTION_LABELS = {
    clock_in: "Clocked In",
    lunch_out: "Lunch Started",
    lunch_in: "Welcome Back",
    clock_out: "Clocked Out",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--qs-dark)", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px 16px", fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Logo / Brand */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--qs-subtle)", fontWeight: 500 }}>{brandName}</div>
      </div>

      {/* PIN Screen */}
      {screen === "pin" && (
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--qs-bright)", marginBottom: 6 }}>Enter Your PIN</div>
          <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 28 }}>4-digit employee code</div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
            {[0,1,2,3].map(i => (
              <input
                key={i}
                ref={pinRefs[i]}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={pin[i] || ""}
                onChange={e => handlePinInput(i, e.target.value)}
                onKeyDown={e => handlePinKey(i, e)}
                style={{
                  width: 56, height: 64, textAlign: "center", fontSize: 28, fontWeight: 700,
                  background: pin[i] ? "var(--qs-elevated)" : "var(--qs-card)",
                  color: "var(--qs-bright)", border: `2px solid ${pin[i] ? "var(--qs-info)" : "var(--qs-border)"}`,
                  borderRadius: 12, outline: "none", fontFamily: "'DM Mono', monospace",
                  transition: "border-color 0.15s",
                }}
              />
            ))}
          </div>

          {loading && <div style={{ fontSize: 13, color: "var(--qs-subtle)" }}>Verifying…</div>}
          {errorMsg && (
            <div style={{ fontSize: 13, color: "var(--qs-danger)", background: "var(--qs-danger-subtle)", borderRadius: 8, padding: "8px 12px" }}>
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Status Screen */}
      {screen === "status" && (
        <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--qs-bright)", marginBottom: 4 }}>
            {employeeName ? `Hi, ${employeeName}` : "Welcome 👋"}
          </div>
          <div style={{ fontSize: 14, color: "var(--qs-subtle)", marginBottom: 28 }}>
            {STATUS_LABELS[currentStatus]}
          </div>

          {/* Today's punch summary */}
          {entry && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 28 }}>
              {[
                { label: "Clock In", val: entry.start_time },
                { label: "Lunch Out", val: entry.lunch_out },
                { label: "Lunch In", val: entry.lunch_in },
                { label: "Clock Out", val: entry.end_time },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "var(--qs-card)", border: "1px solid var(--qs-border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--qs-subtle)", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: val ? "var(--qs-text)" : "var(--qs-border)", fontFamily: "'DM Mono', monospace" }}>
                    {val || "\u2014"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hours so far */}
          {entry?.hours_worked && (
            <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 20 }}>
              {entry.hours_worked}h logged today
            </div>
          )}

          {/* Primary action button */}
          {!actionCfg.done ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => submitAction(actionCfg.next)}
                disabled={loading}
                style={{
                  width: "100%", padding: "16px", borderRadius: 14, border: "none",
                  background: actionCfg.color, color: "#fff", fontSize: 17, fontWeight: 700,
                  cursor: "pointer", opacity: loading ? 0.6 : 1,
                  boxShadow: `0 4px 20px ${actionCfg.color}44`,
                }}>
                {loading ? "\u2026" : `${actionCfg.icon} ${actionCfg.label}`}
              </button>

              {/* Secondary action (Clock Out while clocked in, skipping lunch) */}
              {actionCfg.secondary && (
                <button
                  onClick={() => submitAction(actionCfg.secondary.next)}
                  disabled={loading}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${actionCfg.secondary.color}44`,
                    background: "transparent", color: actionCfg.secondary.color, fontSize: 14, fontWeight: 600,
                    cursor: "pointer", opacity: loading ? 0.6 : 1,
                  }}>
                  {actionCfg.secondary.label} (skip lunch)
                </button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 16, color: "var(--qs-subtle)", fontWeight: 500 }}>You're all done for today</div>
          )}

          {errorMsg && (
            <div style={{ fontSize: 13, color: "var(--qs-danger)", background: "var(--qs-danger-subtle)", borderRadius: 8, padding: "8px 12px", marginTop: 14 }}>
              {errorMsg}
            </div>
          )}

          <button onClick={() => { setPin(""); setScreen("pin"); }} style={{ marginTop: 20, background: "transparent", border: "none", color: "var(--qs-muted)", fontSize: 12, cursor: "pointer" }}>
            &larr; Different employee
          </button>
        </div>
      )}

      {/* Success Screen */}
      {screen === "success" && (
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>&#x2705;</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--qs-bright)", marginBottom: 6 }}>
            {ACTION_LABELS[lastAction]}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--qs-success)", fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
            {lastTime}
          </div>
          {entry?.hours_worked && lastAction === "clock_out" && (
            <div style={{ fontSize: 14, color: "var(--qs-subtle)" }}>{entry.hours_worked}h total today</div>
          )}
          <div style={{ fontSize: 12, color: "var(--qs-muted)", marginTop: 16 }}>Returning to PIN screen…</div>
        </div>
      )}
    </div>
  );
}
