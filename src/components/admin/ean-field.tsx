"use client";

import { useEffect, useState } from "react";
import { ean13Modules, formatEan, validateEan } from "@/lib/hardware/gtin";

/** Scannable EAN-13 rendered straight from the module bits — no dependency. */
export function Barcode({ code, height = 46 }: { code: string; height?: number }) {
  const modules = ean13Modules(code);
  if (!modules) return null;
  const w = 1.6;                       // module width
  const width = modules.length * w;
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]); // taller guard bars
  return (
    <svg width={width} height={height + 12} viewBox={`0 0 ${width} ${height + 12}`} role="img"
      aria-label={`Barcode ${code}`} style={{ background: "#fff", borderRadius: 4, padding: 0 }}>
      {modules.split("").map((m, i) =>
        m === "1" ? (
          <rect key={i} x={i * w} y={2} width={w} height={guards.has(i) ? height + 5 : height} fill="#000" />
        ) : null
      )}
      <text x={width / 2} y={height + 11} textAnchor="middle" fontSize="7" fontFamily="monospace" fill="#000">
        {code}
      </text>
    </svg>
  );
}

type Status = { prefix: string | null; capacity: number; used: number; remaining: number };

/**
 * EAN field with GS1-backed allocation. EANs are never invented — this either
 * issues the next number from NP7's licensed prefix, or validates a code the
 * factory assigned. Assignment needs a saved variant (the number is tied to it).
 */
export function EanField({
  variantId,
  value,
  onChange,
  labelClass,
  inputClass,
}: {
  variantId: string | null;
  value: string;
  onChange: (v: string) => void;
  labelClass: string;
  inputClass: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/gtin").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  const check = value.trim() ? validateEan(value) : null;

  async function assign() {
    if (!variantId) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/variants/${variantId}/ean`, { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error || "Could not assign"); return; }
    onChange(d.ean);
    fetch("/api/admin/gtin").then((r) => r.json()).then(setStatus).catch(() => {});
  }

  return (
    <div>
      <label className={labelClass}>EAN (GS1)</label>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={value}
          placeholder={status?.prefix ? "Assign, or type the factory's code" : "Type the factory's code"}
          onChange={(e) => { onChange(e.target.value); setError(""); }}
        />
        {variantId && !value.trim() && status?.prefix && (
          <button
            type="button"
            onClick={assign}
            disabled={busy}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-40"
          >
            {busy ? "…" : "Assign"}
          </button>
        )}
      </div>

      {/* Live feedback: the check digit is the bit humans get wrong. */}
      {check && !check.valid && <p className="text-[11px] text-red-400 mt-1">{check.reason}</p>}
      {check?.valid && (
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <Barcode code={check.normalized!} />
          <span className="text-[11px] admin-faint font-mono">{formatEan(check.normalized!, status?.prefix?.length)}</span>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}

      {/* Why the Assign button may be missing. */}
      {!status?.prefix && (
        <p className="text-[11px] admin-faint mt-1 leading-relaxed">
          No GS1 prefix yet — register with GS1 Germany, then add it in Company settings to
          auto-assign. EANs can&apos;t be made up: retailers check who owns the number.
        </p>
      )}
      {status?.prefix && !value.trim() && variantId && (
        <p className="text-[11px] admin-faint mt-1">
          {status.remaining.toLocaleString()} of {status.capacity.toLocaleString()} numbers left on prefix {status.prefix}.
        </p>
      )}
      {status?.prefix && !variantId && (
        <p className="text-[11px] admin-faint mt-1">Save the variant first, then assign its EAN.</p>
      )}
    </div>
  );
}
