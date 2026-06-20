"use client";

import { useState } from "react";
import { HW_ACCENT } from "@/lib/hardware/types";

type Props = {
  productId: string;
  productName: string;
};

type Status = "idle" | "loading" | "success" | "error";

export function EnquireForm({ productId, productName }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/hardware/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, name, email, message }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[14px] font-bold border border-white/20 text-white hover:border-white/50 hover:-translate-y-0.5 transition-all"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Enquire about this board
      </button>
    );
  }

  if (status === "success") {
    return (
      <div
        className="rounded-2xl border p-6 text-center max-w-[480px]"
        style={{ borderColor: `${HW_ACCENT}44`, backgroundColor: `${HW_ACCENT}11` }}
      >
        <span className="text-2xl" aria-hidden>✓</span>
        <p className="font-black text-white mt-2 mb-1">Message sent!</p>
        <p className="text-[14px] text-white/60">
          We got your enquiry about <strong className="text-white">{productName}</strong> and will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 max-w-[520px] space-y-4"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.2em] uppercase text-white/40">ENQUIRY</p>
          <p className="text-[16px] font-black text-white">Enquire about this board</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/40 hover:text-white transition-colors mt-0.5"
          aria-label="Close"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[12px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">Email *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">Message</label>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Tell us about your riding style, questions about ${productName}…`}
          className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors resize-none"
        />
      </div>

      {status === "error" && (
        <p className="text-red-400 text-[13px]">Something went wrong — please try again.</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-3.5 rounded-full text-[14px] font-bold text-black transition-all disabled:opacity-60"
        style={{ backgroundColor: HW_ACCENT }}
      >
        {status === "loading" ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
