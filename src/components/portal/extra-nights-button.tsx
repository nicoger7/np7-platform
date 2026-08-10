"use client";

import { useState } from "react";
import { mutate } from "@/lib/mutate";

export function ExtraNightsButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    // "✓ Request sent" used to be printed whatever came back. A guest could
    // type a dietary requirement, see the tick, and arrive to find nobody had
    // ever received it.
    const r = await mutate("/api/portal/extra-nights", { method: "POST", body: { bookingId, message } });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setDone(true);
  }

  if (done) {
    return <p className="text-[13.5px] text-green-700 font-semibold">✓ Request sent — we&apos;ll be in touch.</p>;
  }

  const errorNote = error
    ? <p className="text-[12.5px] text-[#c0392b] mt-2 leading-snug">{error}</p>
    : null;

  return (
    <>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-[13.5px] font-bold text-[#00afdb] hover:underline">
          Any other requests? →
        </button>
      ) : (
        <div className="space-y-3">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            placeholder="Anything else we should know — dietary needs, transfers, a special request…"
            className="w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#00afdb]" />
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] disabled:opacity-60">
              {busy ? "Sending…" : "Send request"}
            </button>
            <button onClick={() => setOpen(false)} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-[#6a7a80] bg-[#f1f5f6]">Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
