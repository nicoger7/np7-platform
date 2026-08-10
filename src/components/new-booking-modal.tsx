"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ContactPicker, ContactLite } from "@/components/contact-picker";
import { editionOptionLabel, editionSortKey } from "@/lib/edition-label";
import { composeBookingName } from "@/lib/booking-name";
import { SearchSelect } from "@/components/admin/search-select";

interface Exp { id: string; title: string; code: string | null }
interface Ed { id: string; experience_id: string; year: number | null; label: string | null; date_start: string | null; date_end: string | null }

/** Create a booking: experience → edition → participant (search/create) → go. */
export function NewBookingModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [experiences, setExperiences] = useState<Exp[]>([]);
  const [editions, setEditions] = useState<Ed[]>([]);
  const [expId, setExpId] = useState("");
  const [edId, setEdId] = useState("");
  const [contact, setContact] = useState<ContactLite | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()),
    ]).then(([exps, eds]) => {
      const list = Array.isArray(exps) ? exps : exps.experiences || [];
      setExperiences(list.map((e: Record<string, string>) => ({ id: e.id, title: e.title, code: e.code ?? null })));
      setEditions(Array.isArray(eds) ? eds : []);
    });
  }, []);

  // "Week I" gibt es in mehreren Jahren — sortiert nach Jahr und immer mit
  // Jahr + Zeitraum beschriftet, sonst ist das Dropdown mehrdeutig.
  const edOptions = (expId ? editions.filter((e) => e.experience_id === expId) : [])
    .slice()
    .sort((a, b) => editionSortKey(a).localeCompare(editionSortKey(b)));
  const exp = experiences.find((e) => e.id === expId);
  const ed = editions.find((e) => e.id === edId);
  // One naming rule for every door into a booking. This modal had its own,
  // reversed: "NP7 Experience Alacati 2026 — Luis Marina García-Barón" landed in
  // a list where every other row on the same week reads
  // "Andreas Burmeister — Alacati 2026". composeBookingName() is what the
  // website reserve/register flows and the edition quick-add already use, and it
  // matches the rows imported from Notion.
  const autoName = exp && contact
    ? composeBookingName({ contactName: contact.name, experienceTitle: exp.title, editionLabel: ed?.label, year: ed?.year })
    : "";

  async function create() {
    if (!expId || !contact) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experience_id: expId,
        edition_id: edId || null,
        contact_id: contact.id,
        name: autoName || contact.name,
        status: "lead",
      }),
    });
    setCreating(false);
    if (res.ok) {
      const b = await res.json();
      router.push(`/admin/bookings/${b.id}`);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed to create booking");
    }
  }

  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[480px] rounded-2xl p-6" style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border)" }}>
        <h2 className="text-lg font-bold admin-heading mb-4">New Booking</h2>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Experience *</label>
            <SearchSelect
              value={expId || null}
              onChange={(v) => { setExpId(v ?? ""); setEdId(""); }}
              options={experiences.map((e) => ({ value: e.id, label: e.title }))}
              placeholder="Select experience…" searchPlaceholder="Search experiences…" allowClear={false}
            />
          </div>

          <div>
            <label className={labelClass}>Edition <span className="admin-faint">(optional)</span></label>
            <SearchSelect
              value={edId || null}
              onChange={(v) => setEdId(v ?? "")}
              options={edOptions.map((e) => ({ value: e.id, label: editionOptionLabel(e) }))}
              placeholder="No specific edition" clearLabel="No specific edition" searchPlaceholder="Search editions…" disabled={!expId}
            />
          </div>

          <div>
            <label className={labelClass}>Participant *</label>
            <ContactPicker
              value={contact?.id ?? null}
              display={contact}
              onChange={(_id, c) => setContact(c)}
              allowCreate
              placeholder="Search or create a contact…"
            />
          </div>

          {autoName && (
            <p className="text-xs admin-faint">Booking name: <span className="admin-muted font-medium">{autoName}</span></p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={create} disabled={!expId || !contact || creating} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">
            {creating ? "Creating…" : "Create booking"}
          </button>
          <button onClick={onClose} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}
