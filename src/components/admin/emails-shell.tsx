"use client";

import { useState } from "react";

/**
 * Two audiences, two tabs.
 *
 * Everything in this hub was mail to guests, so the page never had to say so.
 * Now that NP7's own people get mail too, the first question on opening the
 * screen is "whose mail am I looking at?" — and that question deserves the
 * top of the page, above the lifecycle flow and the previews, rather than a
 * section buried under twenty-odd guest templates (Nico, 21 Sep 2026: "can we
 * make in emails in admin a sub-tab in the top... customers, team").
 */
export function EmailsShell({ customers, team }: { customers: React.ReactNode; team: React.ReactNode }) {
  const [tab, setTab] = useState<"customers" | "team">("customers");
  const btn = (on: boolean) =>
    `px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${
      on ? "bg-[#0aa3c7] text-white" : "admin-muted hover:admin-heading"
    }`;
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-5" role="tablist" aria-label="Who the mail is for">
        <button type="button" role="tab" aria-selected={tab === "customers"} onClick={() => setTab("customers")} className={btn(tab === "customers")}>
          Customers
        </button>
        <button type="button" role="tab" aria-selected={tab === "team"} onClick={() => setTab("team")} className={btn(tab === "team")}>
          Team
        </button>
      </div>
      {tab === "customers" ? customers : team}
    </>
  );
}
