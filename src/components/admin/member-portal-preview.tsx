"use client";

import { useEffect, useState } from "react";

const SECTIONS: { key: string; label: string; path: string }[] = [
  { key: "home", label: "Home", path: "/account" },
  { key: "trips", label: "My trips", path: "/account/trips" },
  { key: "progress", label: "Progress", path: "/account/level" },
  { key: "vouchers", label: "Gift vouchers", path: "/account/vouchers" },
  { key: "profile", label: "Profile", path: "/account/profile" },
  { key: "account", label: "Account", path: "/account/settings" },
];

/**
 * "Member view" — renders the member's REAL portal (every page/tab they have) in a
 * read-only iframe. An admin-only `view-as` cookie makes the portal pages resolve
 * as this member, but only on navigations (Sec-Fetch-Dest document/iframe) — never
 * on API fetches — so nothing can be mutated. The cookie is cleared on exit.
 */
export function MemberPortalPreview({ contactId }: { contactId: string }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(false);
  const [path, setPath] = useState(SECTIONS[0].path);

  useEffect(() => {
    let alive = true;
    setReady(false); setErr(false); setPath(SECTIONS[0].path);
    fetch(`/api/admin/members/${contactId}/view-as`, { method: "POST" })
      .then((r) => { if (alive) (r.ok ? setReady(true) : setErr(true)); })
      .catch(() => { if (alive) setErr(true); });
    return () => {
      alive = false;
      // End the preview — clear the view-as cookie (best-effort; 30-min TTL backstop).
      fetch(`/api/admin/members/${contactId}/view-as`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [contactId]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded" style={{ background: "rgba(245,158,11,0.12)", color: "#d98a04" }}>Read-only preview</span>
        <span className="text-xs admin-faint">Exactly what this member sees — every page, live data. Actions are disabled.</span>
      </div>

      {/* Quick-jump between the member's sections (their own nav is also inside the frame). */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setPath(s.path)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={path === s.path
              ? { background: "var(--admin-accent)", color: "var(--admin-accent-contrast)", border: "1px solid transparent" }
              : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden border bg-[#fff7ec]" style={{ borderColor: "var(--admin-border)" }}>
        {err ? (
          <p className="text-sm admin-faint text-center py-16">Couldn&apos;t start the preview. Try reopening this tab.</p>
        ) : !ready ? (
          <p className="text-sm admin-faint text-center py-16">Loading their member area…</p>
        ) : (
          <iframe
            key={contactId}
            src={path}
            title="Member portal preview"
            className="w-full block"
            style={{ height: "78vh", colorScheme: "light", border: "none" }}
          />
        )}
      </div>
    </div>
  );
}
