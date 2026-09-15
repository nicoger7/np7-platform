"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";

/**
 * "I haven't sent this yet": the way out of a transfer nobody started.
 *
 * Press Pay by bank transfer, read the account number, then think better of it,
 * and until now that was the end: the link row sits at `awaiting`, the whole
 * platform reads it as money in the air, and every Pay button is gone for the
 * fourteen days it takes the sweep to notice nothing arrived. A guest who
 * changed their mind, fat-fingered the amount or would rather use a card had no
 * way to pay us at all.
 *
 * THE WORDING IS THE FEATURE. They are not cancelling a payment, they are
 * telling us they never made one, and those are different admissions: the first
 * sounds like something with consequences, the second is just true. So nothing
 * here says cancel, refund or undo, and the one thing the guest most needs to
 * hear is said before they commit rather than after: if the money does turn up
 * it still counts. A guest frightened out of pressing this goes back to being
 * stuck, and a guest who thinks pressing it destroys a transfer they already
 * sent will send a second one.
 *
 * Deliberately two taps. Not because it is dangerous (the route touches nothing
 * at Stripe, and the IBAN stays live) but because the sentence in between is
 * the reassurance, and a one-tap link has nowhere to put it.
 */
export function NotSent({ bookingId, linkId }: { bookingId: string; linkId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    const r = await mutate(`/api/portal/bookings/${bookingId}/pay/not-sent`, { method: "POST", body: { linkId } });
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    /* The panel, the hero and the Pay button are all derived from this row on
       the server, so the page has to be re-read rather than patched here. Left
       busy meanwhile: the refresh is what makes the button come back, and a
       second press before it lands would only earn a 409. */
    router.refresh();
  }

  if (!open) {
    return (
      <p className="mt-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] font-semibold text-[#a08a5c] hover:text-[#7d5609] underline decoration-[#e3c48a] underline-offset-2 transition-colors"
        >
          I haven&apos;t sent this yet
        </button>
      </p>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#f0dcb4]">
      <p className="text-[12.5px] text-[#8a6a2a] leading-snug">
        {/* Deliberately does NOT list methods. It used to promise "by card, by
            bank or from your invoice", and inside the EEA the card is excluded
            on purpose, which is the whole reason the transfer exists. Naming a
            card to the exact guests who will never be shown one is the sort of
            small lie that costs more than it saves. */}
        We&apos;ll put this payment back so you can pay whenever suits you, from your trip page or from
        your invoice. And if it turns out you did send it, it still reaches us and still counts towards
        your trip, so nothing is lost either way.
      </p>
      {error && <p className="text-[12.5px] text-[#b4472a] leading-snug mt-2">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-[#9a6a12] hover:bg-[#7d5609] disabled:opacity-60 text-white text-[12.5px] font-bold transition-colors"
        >
          {busy ? "Putting it back…" : "Yes, I haven't sent it"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(""); }}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-white hover:bg-[#fffdf7] disabled:opacity-60 text-[#8a6a2a] text-[12.5px] font-bold border border-[#e3c48a] transition-colors"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
