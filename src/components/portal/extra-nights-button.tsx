"use client";

import { useState } from "react";

export function ExtraNightsButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch("/api/portal/extra-nights", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, message }),
    });
    setBusy(false); setDone(true);
  }

  if (done) {
    return <p className="text-[13.5px] text-green-700 font-semibold">✓ Request sent — we&apos;ll be in touch about your dates.</p>;
  }

  return (
    <>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-[13.5px] font-bold text-[#00afdb] hover:underline">
          Request extra nights / different flight dates →
        </button>
      ) : (
        <div className="space-y-3">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            placeholder="E.g. I'd like to arrive 2 nights earlier (flying in on the 28th)…"
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
