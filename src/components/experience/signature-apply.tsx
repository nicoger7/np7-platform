"use client";

import { useState } from "react";
import { PitchRecorder } from "@/components/experience/pitch-recorder";
import type { ApplicationStatus } from "@/lib/signature";

/**
 * The Signature Trips application. Everyone fills it in straight (pitch-first, no
 * upfront wall). Members are verified on submit; guests submit with their email
 * and get a magic login link — clicking it confirms their account AND makes the
 * application "real" (a fake email never verifies = the barrier). Existing
 * members can log in first. One live application per person; status shows in
 * their portal.
 */
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Semi-Pro", "Pro", "Not sure yet"];

export function SignatureApply({ loggedIn = false, prefill, existing }: {
  loggedIn?: boolean;
  prefill?: { name: string | null; email: string | null; phone: string | null } | null;
  existing?: { status: ApplicationStatus } | null;
}) {
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [level, setLevel] = useState("");
  const [wants, setWants] = useState("");
  const [motivation, setMotivation] = useState("");
  const [media, setMedia] = useState<{ blob: Blob; kind: "video" | "audio" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<false | "sent" | "verify" | "already">(false);
  const [sentEmail, setSentEmail] = useState("");

  const card = "rounded-2xl border border-[#ecdcbb] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(120,90,20,0.05)]";
  const label = "text-[12px] font-black uppercase tracking-[0.16em] text-[#b0791e]";
  const input = "w-full rounded-xl border border-[#d8e3e6] px-3.5 py-3 text-[15px] outline-none focus:border-[#f0a500] transition-colors";

  async function submit() {
    setErr("");
    if (!loggedIn && (!name.trim() || !email.trim())) { setErr("Please add your name and email."); return; }
    setBusy(true);
    try {
      const baseType = media ? (media.blob.type.split(";")[0] || (media.kind === "video" ? "video/webm" : "audio/webm")) : null;
      setPhase("Sending your application…");
      const res = await fetch("/api/signature/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null, email: email.trim() || null,
          phone: phone.trim() || null, level: level || null,
          wants: wants.trim() || null, motivation: motivation.trim() || null,
          media: media && baseType ? { kind: media.kind, contentType: baseType } : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) { setDone("already"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      if (!res.ok) { setErr(j.error || "Something went wrong — please try again."); return; }

      if (media && baseType && j.uploadUrl) {
        setPhase("Uploading your pitch…");
        const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": baseType }, body: media.blob }).catch(() => null);
        if (!put || !put.ok) setErr("Your pitch upload failed — but your application is in; we may reach out for it.");
      }
      if (j.needsVerification) { setSentEmail(j.email || email.trim()); setDone("verify"); }
      else setDone("sent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally { setBusy(false); setPhase(""); }
  }

  // ── already applied (verified) ──
  if (existing) {
    const line = existing.status === "accepted" ? "You're accepted 🎉 — we'll reach out with the details."
      : existing.status === "shortlisted" ? "You've been shortlisted 🎉 — we'll be in touch."
      : "Your application is in and under review.";
    return (
      <div className="rounded-2xl border border-[#bfe6d7] bg-[#f1faf5] p-8 text-center">
        <div className="text-3xl mb-2">✦</div>
        <h2 className="text-[21px] font-black text-[#00374a]">You&apos;ve applied</h2>
        <p className="text-[14.5px] text-[#5a6b72] mt-2 max-w-[440px] mx-auto leading-relaxed">{line} You can see the status any time in your account.</p>
        <a href="/account" className="inline-block mt-5 rounded-full bg-[#00afdb] text-white text-[13.5px] font-bold px-6 py-3 hover:bg-[#15c0ec] transition-colors">Go to your account</a>
      </div>
    );
  }

  // ── done states ──
  if (done === "verify") {
    return (
      <div className="rounded-2xl border border-[#f4c99a] bg-[#fff8ef] p-8 text-center">
        <div className="text-4xl mb-2">📩</div>
        <h2 className="text-[21px] font-black text-[#00374a]">One last step — check your email</h2>
        <p className="text-[14.5px] text-[#5a6b72] mt-2 max-w-[460px] mx-auto leading-relaxed">
          We sent a login link to <strong className="text-[#00374a]">{sentEmail}</strong>. Click it to confirm your NP7 account — that&apos;s what makes your application real and lets you track it. Nothing counts until you do. 🌊
        </p>
      </div>
    );
  }
  if (done) {
    return (
      <div className="rounded-2xl border border-[#bfe6d7] bg-[#f1faf5] p-8 text-center">
        <div className="text-4xl mb-2">🤙</div>
        <h2 className="text-[22px] font-black text-[#00374a]">{done === "already" ? "You've already applied" : `Thank you, ${(prefill?.name || name).split(/\s+/)[0] || "there"}!`}</h2>
        <p className="text-[14.5px] text-[#5a6b72] mt-2 max-w-[440px] mx-auto leading-relaxed">
          {done === "already"
            ? "Your application is with us and under review — you can see its status in your account. If there's a fit, we'll reach out personally. 🌊"
            : "Your application is in, and it's now in your account under review. If there's a fit, we'll reach out to you personally. 🌊"}
        </p>
        <a href="/account" className="inline-block mt-5 rounded-full bg-[#00afdb] text-white text-[13.5px] font-bold px-6 py-3 hover:bg-[#15c0ec] transition-colors">Go to your account</a>
      </div>
    );
  }

  // ── the form (everyone) ──
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <p className={label}>About you</p>
          {!loggedIn && <a href="/account/login?next=/signature" className="text-[12.5px] font-bold text-[#00849e] hover:underline shrink-0">Already have an account? Log in →</a>}
        </div>
        {loggedIn ? (
          <div className="mt-2">
            <p className="text-[15.5px] font-black text-[#00374a]">{prefill?.name || "Your account"}</p>
            {prefill?.email && <p className="text-[13px] text-[#8a97a0]">{prefill.email}</p>}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <input className={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <input className={input} placeholder="Phone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <select className={input} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Your windsurf level…</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className={card}>
        <p className={label}>What you&apos;re after</p>
        <p className="text-[13px] text-[#8a97a0] mt-1 mb-2.5">Where do you dream of going, and what would make the trip perfect for you?</p>
        <textarea className={`${input} min-h-[90px] resize-y`} placeholder="In your words…" value={wants} onChange={(e) => setWants(e.target.value)} />
      </div>

      <div className={card}>
        <p className={label}>Your pitch <span className="text-[#c3b9a6] font-bold normal-case tracking-normal text-[12px]">— the important bit</span></p>
        <p className="text-[13px] text-[#5a6b72] mt-1.5 mb-3 leading-relaxed">We hand-pick every rider for these trips, so we&apos;d love to hear from you directly. <strong className="text-[#00374a]">Record a short video or voice note</strong> — who you are, your windsurf story, and why this trip. This matters more than anything else.</p>
        <PitchRecorder onChange={setMedia} accent="#f47b20" />
        <div className="mt-3">
          <p className="text-[12px] font-bold text-[#8a97a0] mb-1.5">Prefer to write it? (optional)</p>
          <textarea className={`${input} min-h-[70px] resize-y`} placeholder="A few lines about you…" value={motivation} onChange={(e) => setMotivation(e.target.value)} />
        </div>
      </div>

      {err && <p className="text-[13px] text-[#c0392b] font-semibold">{err}</p>}
      <button type="button" onClick={submit} disabled={busy}
        className="w-full rounded-full text-white text-[15.5px] font-black py-4 disabled:opacity-60 transition-transform hover:-translate-y-0.5 shadow-[0_12px_30px_rgba(240,123,32,0.26)]"
        style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
        {busy ? (phase || "Sending…") : "Send my application"}
      </button>
      <p className="text-[12px] text-[#a58a5e] text-center">{loggedIn ? "Private — your application & pitch go straight to the NP7 team." : "We'll email you a link to confirm — that makes your application real. No spam, ever."}</p>
    </div>
  );
}
