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

  useEffect(() => {
    fetch("/api/admin/email-log").then((r) => r.json()).then((d) => setRows(d.rows ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <h1 className="text-2xl font-bold admin-heading">Email Log</h1>
      <p className="text-sm admin-muted mt-1 mb-6">Every email the system has sent (or skipped). Useful for trust &amp; debugging. Add a <code className="text-[12px]">RESEND_API_KEY</code> to actually deliver — until then sends are logged as &ldquo;skipped&rdquo;.</p>

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
