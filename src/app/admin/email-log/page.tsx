"use client";

import { useEffect, useRef, useState } from "react";

type Row = {
  id: string; template_key: string | null; to_email: string; subject: string | null;
  status: string; error: string | null; created_at: string | null; sent_at: string | null;
  opened_at?: string | null; last_event?: string | null;
};

const TONE: Record<string, string> = {
  sent: "bg-green-500/15 text-green-500",
  failed: "bg-red-500/15 text-red-400",
  skipped: "bg-gray-500/15 text-gray-400",
  queued: "bg-amber-500/15 text-amber-400",
};

export default function EmailLogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * "Sent" and "arrived" are different events, and only the first was easy to
   * see. A bounce already showed a red badge, but finding it meant scrolling
   * 149 rows — so after a send nobody discovered the one address that failed.
   */
  const [view, setView] = useState<"all" | "problem" | "opened" | "delivered">("all");
  /*
   * "Did the guest get the mail?" is the question this page exists to answer,
   * and until now answering it meant scrolling. The log only grows — every
   * booking mail, every reminder, every campaign send lands here — so by next
   * season the one address someone is asking about is a thousand rows down.
   */
  const [q, setQ] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // hover preview: which row, and where to pin the floating panel. The panel is
  // INTERACTIVE (scrollable) — it stays open while the mouse is on the row OR
  // the panel, and hides on a short delay so you can travel between the two.
  const [preview, setPreview] = useState<{ id: string; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPreview = (id: string, clientY: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const h = 480, pad = 16;
    setPreview({ id, top: Math.min(Math.max(clientY - h / 3, pad), window.innerHeight - h - pad) });
  };
  const keepPreview = () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  const hidePreview = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPreview(null), 220);
  };

  useEffect(() => {
    fetch("/api/admin/email-log").then((r) => r.json()).then((d) => setRows(d.rows ?? [])).finally(() => setLoading(false));
  }, []);

  async function sendTest() {
    setTesting(true); setTestMsg(null);
    try {
      const res = await fetch("/api/admin/email/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testTo.trim() }) });
      const json = await res.json();
      setTestMsg(res.ok ? { ok: true, text: `Sent! Check ${testTo} (and spam). From ${json.from}.` } : { ok: false, text: json.error ?? "Failed to send." });
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <h1 className="text-2xl font-bold admin-heading">Email Log</h1>
      <p className="text-sm admin-muted mt-1 mb-5">Every email the system has sent (or skipped). Useful for trust &amp; debugging. Add a <code className="text-[12px]">RESEND_API_KEY</code> to actually deliver — until then sends are logged as &ldquo;skipped&rdquo;.</p>

      {/* Connectivity test — confirm Resend + sender domain before the cron goes live */}
      <div className="admin-surface admin-border border rounded-xl p-4 mb-6">
        <p className="text-xs font-bold admin-heading mb-1">Send a test email</p>
        <p className="text-[12px] admin-muted mb-3">Verifies your Resend key + sender domain work. Sends straight through Resend (not logged here).</p>
        <div className="flex flex-wrap gap-2">
          <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm admin-input admin-border border outline-none" style={{ backgroundColor: "var(--admin-input-bg)" }} />
          <button onClick={sendTest} disabled={testing || !testTo.trim()} className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] transition-colors">{testing ? "Sending…" : "Send test"}</button>
        </div>
        {testMsg && <p className={`text-[12px] mt-2 ${testMsg.ok ? "text-green-500" : "text-red-400"}`}>{testMsg.text}</p>}
      </div>

      {(() => {
        const problem = (r: Row) => r.status === "failed" || r.last_event === "bounced" || r.last_event === "complained";
        const counts = {
          all: rows.length,
          problem: rows.filter(problem).length,
          delivered: rows.filter((r) => r.last_event === "delivered" || r.last_event === "opened" || r.opened_at).length,
          opened: rows.filter((r) => !!r.opened_at).length,
        };
        return (
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {([
              ["all", "Everything"],
              ["problem", "Didn't arrive"],
              ["delivered", "Delivered"],
              ["opened", "Opened"],
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${
                  view === k ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"
                    : k === "problem" && counts.problem > 0 ? "text-red-400 border border-red-400/40"
                    : "admin-muted hover:admin-heading"}`}
                style={view === k || (k === "problem" && counts.problem > 0) ? undefined : { border: "1px solid var(--admin-border)" }}>
                {label} <span className={view === k ? "opacity-70" : "admin-faint"}>{counts[k]}</span>
              </button>
            ))}
          </div>
        );
      })()}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by address, subject or template…"
        className="w-full max-w-sm px-3 py-2 mb-4 rounded-lg text-sm admin-input admin-border border outline-none focus:border-[var(--admin-accent)]"
        style={{ backgroundColor: "var(--admin-input-bg)" }}
      />

      {loading ? <p className="text-sm admin-faint">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm admin-faint">No emails yet.</p>
      ) : (
        <div className="grid gap-1.5">
          {rows.filter((r) => {
            const problem = r.status === "failed" || r.last_event === "bounced" || r.last_event === "complained";
            if (view === "problem" && !problem) return false;
            if (view === "opened" && !r.opened_at) return false;
            if (view === "delivered" && !(r.last_event === "delivered" || r.last_event === "opened" || r.opened_at)) return false;
            const needle = q.trim().toLowerCase();
            if (!needle) return true;
            return `${r.to_email} ${r.subject ?? ""} ${r.template_key ?? ""}`.toLowerCase().includes(needle);
          }).map((r) => (
            <div
              key={r.id}
              className="admin-surface admin-border border rounded-lg px-4 py-2.5 flex items-center gap-3 text-[13px] cursor-pointer hover:border-[var(--admin-accent)]/50 transition-colors"
              title="Hover to preview · click to open full size"
              onMouseEnter={(e) => showPreview(r.id, e.clientY)}
              onMouseLeave={hidePreview}
              onClick={() => window.open(`/api/admin/email-log/${r.id}/preview`, "_blank")}
            >
              <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TONE[r.status] ?? "bg-gray-500/15 text-gray-400"}`}>{r.status}</span>
              {/* Resend delivery events (webhook): opened wins; bounce/spam scream */}
              {(r.last_event === "bounced" || r.last_event === "complained") ? (
                <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-400" title="Resend delivery event">{r.last_event}</span>
              ) : r.opened_at ? (
                <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-green-500/15 text-green-500" title={`Opened ${new Date(r.opened_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}>opened</span>
              ) : r.last_event === "delivered" ? (
                <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--admin-accent)]/15 text-[#0aa3c7]" title="Resend confirmed delivery">delivered</span>
              ) : null}
              <span className="shrink-0 admin-faint w-[150px] truncate font-mono text-[11px]">{r.template_key ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate admin-heading">{r.subject ?? "—"}</span>
              <span className="shrink-0 admin-muted truncate max-w-[180px]">{r.to_email}</span>
              <span className="shrink-0 admin-faint text-[11px]">{r.created_at ? new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* floating hover preview — re-rendered from the logged variables.
          Interactive: move the mouse onto it to scroll the whole email. */}
      {preview && (
        <div
          className="hidden md:block fixed right-6 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{ top: preview.top, width: 380, height: 480, border: "1px solid var(--admin-border)", backgroundColor: "#fff" }}
          onMouseEnter={keepPreview}
          onMouseLeave={hidePreview}
        >
          <iframe title="Email preview" src={`/api/admin/email-log/${preview.id}/preview`} sandbox="" className="w-full h-full bg-white" />
        </div>
      )}
    </div>
  );
}
