"use client";

import { useState } from "react";
import { PitchRecorder } from "@/components/experience/pitch-recorder";

/**
 * The public Signature Trips application. Guest-friendly (no account): who you
 * are + phone + level + what you want, plus a short pitch recorded in-browser.
 * On submit we create the application, then PUT the pitch straight to R2 via the
 * presigned URL the server hands back. The pitch is optional but encouraged.
 */
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Semi-Pro", "Pro", "Not sure yet"];

export function SignatureApply() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [level, setLevel] = useState("");
  const [wants, setWants] = useState("");
  const [motivation, setMotivation] = useState("");
  const [media, setMedia] = useState<{ blob: Blob; kind: "video" | "audio" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setErr("");
    if (!name.trim() || !email.trim()) { setErr("Please add your name and email."); return; }
    setBusy(true);
    try {
      const baseType = media ? (media.blob.type.split(";")[0] || (media.kind === "video" ? "video/webm" : "audio/webm")) : null;
      setPhase("Sending your application…");
      const res = await fetch("/api/signature/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), phone: phone.trim() || null,
          level: level || null, wants: wants.trim() || null, motivation: motivation.trim() || null,
          media: media && baseType ? { kind: media.kind, contentType: baseType } : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Something went wrong — please try again."); return; }

      if (media && baseType && j.uploadUrl) {
        setPhase("Uploading your pitch…");
        const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": baseType }, body: media.blob }).catch(() => null);
        if (!put || !put.ok) setErr("Your application is in, but the pitch upload failed — I may reach out for it.");
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally { setBusy(false); setPhase(""); }
  }

  const card = "rounded-2xl border border-[#ecdcbb] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(120,90,20,0.05)]";
  const label = "text-[12px] font-black uppercase tracking-[0.16em] text-[#b0791e]";
  const input = "w-full rounded-xl border border-[#d8e3e6] px-3.5 py-3 text-[15px] outline-none focus:border-[#f0a500] transition-colors";

  if (done) {
    return (
      <div className="rounded-2xl border border-[#bfe6d7] bg-[#f1faf5] p-8 text-center">
        <div className="text-4xl mb-2">🤙</div>
        <h2 className="text-[22px] font-black text-[#00374a]">Thank you, {name.split(/\s+/)[0] || "there"}!</h2>
        <p className="text-[14.5px] text-[#5a6b72] mt-2 max-w-[440px] mx-auto leading-relaxed">Your application is in. These trips are small and hand-picked — if there&apos;s a fit, I&apos;ll reach out to you personally. 🌊</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className={label}>About you</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <input className={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
        <p className="text-[13px] text-[#5a6b72] mt-1.5 mb-3 leading-relaxed">I hand-pick every rider for these trips, so I&apos;d love to hear from you directly. <strong className="text-[#00374a]">Record a short video or voice note</strong> — who you are, your windsurf story, and why this trip. This matters more than anything else.</p>
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
      <p className="text-[12px] text-[#a58a5e] text-center">Private — your application &amp; pitch go straight to Nico. No spam, ever.</p>
    </div>
  );
}
