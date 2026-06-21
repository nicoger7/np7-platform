"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string; template_key: string | null; to_email: string; subject: string | null;
  status: string; error: string | null; created_at: string | null; sent_at: string | null;
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
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

      {loading ? <p className="text-sm admin-faint">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm admin-faint">No emails yet.</p>
      ) : (
        <div className="grid gap-1.5">
          {rows.map((r) => (
            <div key={r.id} className="admin-surface admin-border border rounded-lg px-4 py-2.5 flex items-center gap-3 text-[13px]">
              <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TONE[r.status] ?? "bg-gray-500/15 text-gray-400"}`}>{r.status}</span>
              <span className="shrink-0 admin-faint w-[150px] truncate font-mono text-[11px]">{r.template_key ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate admin-heading">{r.subject ?? "—"}</span>
              <span className="shrink-0 admin-muted truncate max-w-[180px]">{r.to_email}</span>
              <span className="shrink-0 admin-faint text-[11px]">{r.created_at ? new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
