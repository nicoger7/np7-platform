"use client";

import { useState } from "react";

/**
 * The signup that used to be a picture of a signup.
 *
 * What stood here was a <form> with no action and no handler, holding an input
 * with no `name`, inside a server component. Pressing Subscribe reloaded the
 * page and threw the address away, and because the reload looked like success
 * nobody found out. This one talks to /api/newsletter and, just as importantly,
 * SAYS what happened either way.
 */
export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("done");
        setMessage(json.message || "Check your inbox and confirm the link we just sent.");
      } else {
        setState("error");
        setMessage(json.error || "That didn't go through. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("That didn't go through. Please check your connection and try again.");
    }
  }

  if (state === "done") {
    return (
      <p className="text-[14px] text-white/85 leading-snug" role="status">
        <strong className="text-white">Almost there.</strong> {message}
      </p>
    );
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-label="Your email address"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          placeholder="your@email.com"
          className="flex-1 min-w-0 px-5 py-3 rounded-full text-[14px] bg-white/10 text-white placeholder-white/45 border border-white/20 focus:outline-none focus:border-white/50"
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="shrink-0 px-6 py-3 rounded-full text-[14px] font-bold text-[#00374a] bg-[#ffc42e] hover:bg-[#ffce52] disabled:opacity-60 transition-colors"
        >
          {state === "busy" ? "Sending…" : "Subscribe"}
        </button>
      </div>
      {state === "error" && (
        <p className="text-[12.5px] text-[#ffc42e]" role="alert">{message}</p>
      )}
    </form>
  );
}
