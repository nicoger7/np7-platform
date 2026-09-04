"use client";

import { useState } from "react";

/**
 * Ask about the business.
 *
 * Deliberately inert. There is no API key yet, so rather than a box that looks
 * alive and fails on the first question, this says what it will be able to
 * answer and that it is not switched on. Nothing here fakes a reply, and no
 * request leaves the page.
 *
 * When the key arrives the only change is a real endpoint behind `ask`: the
 * questions below are the shape of what it needs to be able to answer, which is
 * also the acceptance test.
 */

const EXAMPLES = [
  "What does one Slalom board cost us landed, and what does it sell for?",
  "When is the cash low point next year, and what causes it?",
  "How much of the 2027 plan is committed rather than expected?",
  "What did we spend on the Rockstar fin so far, against what we planned?",
  "Which supplier are we most exposed to?",
];

export function BusinessChat({ entityName, year }: { entityName?: string | null; year: number }) {
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="fin-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="fin-title">
            Ask about the business
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle"
                  style={{ background: "var(--fin-inset)", color: "var(--admin-text-faint)" }}>
              Not active yet
            </span>
          </h3>
          <p className="fin-sub mt-0.5 max-w-prose">
            It will answer from the real numbers in here: the plan, what has actually been booked,
            the roadmap and the suppliers{entityName ? `, for ${entityName}` : ""} in {year}.
            Waiting on an API key.
          </p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="fin-sub px-2 py-1">
          {open ? "Hide" : "What will it answer?"}
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled
          placeholder="Ask a question about the numbers…"
          aria-label="Ask about the business (not active yet)"
          className="flex-1 admin-input border rounded-lg px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button disabled
                className="px-4 py-2 text-sm font-semibold rounded-lg admin-btn-primary opacity-40 cursor-not-allowed">
          Ask
        </button>
      </div>

      {open && (
        <div className="mt-4 fin-rule pt-3">
          <p className="fin-label mb-2">Questions it is being built to answer</p>
          <ul className="flex flex-col gap-1.5">
            {EXAMPLES.map((q) => (
              <li key={q} className="text-[12.5px] admin-muted flex gap-2">
                <span className="admin-faint">·</span>{q}
              </li>
            ))}
          </ul>
          <p className="fin-sub mt-3">
            If one of these is not the sort of thing you would ask, say so. This list is what it will
            be measured against, so it is worth being the right list.
          </p>
        </div>
      )}
    </div>
  );
}
