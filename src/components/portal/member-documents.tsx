"use client";

import { useEffect, useState } from "react";

type DocumentType =
  | "proforma_invoice"
  | "deposit_invoice"
  | "downpayment_invoice"
  | "final_invoice"
  | "booking_confirmation"
  | "credit_note"
  | "sicherungsschein"
  | "other";

interface BookingDocument {
  id: string;
  type: DocumentType;
  invoice_number: string | null;
  title: string | null;
  amount: number | null;
  currency: string | null;
  issued_at: string | null;
  status: string;
  signedUrl: string;
}

const TYPE_LABELS: Record<DocumentType, string> = {
  proforma_invoice: "Payment details (pro-forma)",
  deposit_invoice: "Deposit invoice",
  downpayment_invoice: "Down-payment invoice",
  final_invoice: "Final invoice",
  booking_confirmation: "Booking confirmation",
  credit_note: "Credit note",
  sicherungsschein: "Insolvency-protection certificate",
  other: "Document",
};

function fmtMoney(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null;
  const cur = currency ?? "EUR";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: cur }).format(amount);
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function MemberDocuments({ bookingId }: { bookingId: string }) {
  const [docs, setDocs] = useState<BookingDocument[] | null>(null);

  useEffect(() => {
    fetch(`/api/portal/bookings/${bookingId}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BookingDocument[] | null) => {
        if (Array.isArray(data)) setDocs(data.filter((d) => d.status !== "void"));
      })
      .catch(() => setDocs([]));
  }, [bookingId]);

  // Still loading — render nothing to avoid layout shift
  if (docs === null) return null;

  // No documents yet
  if (docs.length === 0) {
    return (
      <p className="text-[12.5px] text-[#9aa6ac] mt-3 pt-3 border-t border-[#f3ede2]">
        Your invoice will appear here once issued.
      </p>
    );
  }

  return (
    <div className="mt-1 pt-3 border-t border-[#f3ede2] space-y-1">
      {docs.map((doc) => {
        const label = TYPE_LABELS[doc.type] ?? "Document";
        const invoiceNumber = doc.invoice_number;
        const amountStr = fmtMoney(doc.amount, doc.currency);
        const dateStr = fmtDate(doc.issued_at);

        const sub = [invoiceNumber, amountStr, dateStr].filter(Boolean).join(" · ");

        return (
          <a
            key={doc.id}
            href={doc.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 py-2.5 group"
          >
            <span className="shrink-0 w-9 h-9 rounded-lg bg-[#00afdb]/10 text-[#00afdb] grid place-items-center">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 18 15 15" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-[#00374a] group-hover:text-[#00afdb] transition-colors">
                {label}
              </span>
              {sub && <span className="block text-[12px] text-[#9aa6ac]">{sub}</span>}
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-[#00afdb] opacity-0 group-hover:opacity-100 transition-opacity">
              Download
            </span>
          </a>
        );
      })}
    </div>
  );
}
