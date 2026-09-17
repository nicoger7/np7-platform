"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";

/**
 * "Your invoice needs your address", asked of the guest who never presses Pay.
 *
 * Everyone who goes through Stripe is asked on the Checkout page itself and
 * never sees this. The guest who ignores the button and transfers straight off
 * the invoice is the remaining gap, and they are not a small one: the bank
 * details are printed on every invoice precisely so they can.
 *
 * So this is four fields and a reason, and the reason is simply true: their
 * invoice has to carry an address (§14 UStG above 250 euro) and theirs does
 * not. It is not a profile form and must not grow into one. The full one is
 * two clicks away under Account, where it has always been, and nobody went.
 *
 * It only appears while NP7 is actually asking this guest for money and their
 * trip has not been. A guest who owes nothing is not chased for paperwork, and
 * a covered group guest is never invoiced at all, so neither is shown it; that
 * is decided on the server, in the page, where the money is already worked out.
 *
 * Whatever is on the contact is prefilled, so a guest missing only their
 * postcode adds a postcode rather than retyping an address we already hold.
 */
export function BillingAddressAsk({
  address, postalCode, city, country, preview, companyName, vatId,
}: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  /** An admin looking at the member's page. The profile route deliberately
   *  refuses to impersonate on a write, so a save here would land on the
   *  ADMIN's own contact. Disabled rather than hidden, so the preview shows
   *  what the member is being asked. */
  preview?: boolean;
  companyName?: string | null;
  vatId?: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    billing_address: address ?? "",
    billing_postal_code: postalCode ?? "",
    billing_city: city ?? "",
    billing_country: country ?? "",
    company_name: companyName ?? "",
    vat_id: vatId ?? "",
  });
  // Shown only when asked for: most guests are private and a company box on a
  // payment screen invites the question "am I supposed to have one?".
  const [business, setBusiness] = useState(!!(companyName || vatId));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f, v: string) => { setF((s) => ({ ...s, [k]: v })); setError(null); };

  async function save() {
    if (preview) return;
    // Named, not just "fill in the form": a guest who left one box empty should
    // be told which one rather than made to hunt for it.
    const missing = [
      !f.billing_address.trim() && "street and number",
      !f.billing_postal_code.trim() && "postcode",
      !f.billing_city.trim() && "city",
      !f.billing_country.trim() && "country",
    ].filter(Boolean) as string[];
    if (missing.length) { setError(`Still needed: ${missing.join(", ")}.`); return; }

    setBusy(true);
    setError(null);
    // mutate(), so a 401 from an expired session cannot end in a green tick
    // over an address that was never saved.
    const res = await mutate("/api/portal/profile", { method: "PUT", body: f });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    // The page decides whether to ask at all, so it has to look again.
    router.refresh();
  }

  if (done) {
    return (
      <p className="text-[12.5px] font-semibold text-green-600 mb-4">
        ✓ Saved. Your invoices will show it from now on.
      </p>
    );
  }

  const field = "w-full px-3 py-2 rounded-lg border border-[#dce3e6] text-[13.5px] text-[#00374a] placeholder:text-[#b4c0c5] focus:outline-none focus:border-[#00afdb] focus:ring-1 focus:ring-[#00afdb]";
  const label = "block text-[11px] font-bold tracking-[0.08em] uppercase text-[#9aa6ac] mb-1";

  return (
    <div className="mb-4 rounded-2xl border border-[#f0e6d6] bg-[#fffaf3] p-4">
      <p className="text-[13px] font-bold text-[#00374a]">Your invoice needs your address</p>
      <p className="text-[12.5px] text-[#6a7a80] leading-snug mt-0.5 max-w-[56ch]">
        German invoices over 250 euro have to show the address they are made out to, and yours
        does not have one yet. Four fields, once, and every invoice for this trip prints properly.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-3.5">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="ba-street">Street and number</label>
          <input id="ba-street" className={field} value={f.billing_address} disabled={preview}
            onChange={(e) => set("billing_address", e.target.value)} placeholder="Graskamp 8" autoComplete="street-address" />
        </div>
        <div>
          <label className={label} htmlFor="ba-postcode">Postcode</label>
          <input id="ba-postcode" className={field} value={f.billing_postal_code} disabled={preview}
            onChange={(e) => set("billing_postal_code", e.target.value)} placeholder="24217" autoComplete="postal-code" />
        </div>
        <div>
          <label className={label} htmlFor="ba-city">City</label>
          <input id="ba-city" className={field} value={f.billing_city} disabled={preview}
            onChange={(e) => set("billing_city", e.target.value)} placeholder="Schönberg" autoComplete="address-level2" />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="ba-country">Country</label>
          <input id="ba-country" className={field} value={f.billing_country} disabled={preview}
            onChange={(e) => set("billing_country", e.target.value)} placeholder="Germany" autoComplete="country-name" />
        </div>
        <div className="sm:col-span-2">
          {!business ? (
            <button type="button" onClick={() => setBusiness(true)}
              className="text-[12.5px] font-semibold text-[#00afdb] hover:underline">
              My company is paying
            </button>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="ba-company">Company</label>
                <input id="ba-company" className={field} value={f.company_name} disabled={preview}
                  onChange={(e) => set("company_name", e.target.value)} placeholder="The name the invoice is made out to" autoComplete="organization" />
              </div>
              <div>
                <label className={label} htmlFor="ba-vat">VAT number (optional)</label>
                <input id="ba-vat" className={field} value={f.vat_id} disabled={preview}
                  onChange={(e) => set("vat_id", e.target.value)} placeholder="DE123456789" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3.5">
        <button onClick={save} disabled={busy || !!preview}
          title={preview ? "Disabled in the admin preview" : undefined}
          className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-colors">
          {busy ? "Saving…" : "Save address"}
        </button>
        {preview && <span className="text-[12px] text-[#7d8b91]">Saving is disabled while you are looking at this as the member.</span>}
        {error && <span className="text-[12.5px] text-[#b4472a]">{error}</span>}
      </div>
    </div>
  );
}
