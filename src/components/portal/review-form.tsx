"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Member review submission. Star rating + quote, name/country prefilled from
 * the contact (/api/portal/me), and an optional photo picked from the trip's
 * gallery. Submits to POST /api/portal/reviews → lands as `pending` for admin
 * approval in /admin/guest-reviews.
 */
export function ReviewForm({ bookingId, gallery }: { bookingId: string; gallery: string[] }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // prefill name + country from the signed-in member
  useEffect(() => {
    fetch("/api/portal/me").then((r) => r.json()).then((d) => {
      if (d?.loggedIn) {
        setName([d.firstName, d.lastName].filter(Boolean).join(" "));
        setCountry(d.country ?? "");
      }
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!quote.trim()) { setError("Please share a few words about your trip."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/portal/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          rating,
          quote: quote.trim(),
          author_name: name.trim() || undefined,
          author_country: country.trim() || undefined,
          photo_url: photoUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Something went wrong — please try again."); setBusy(false); return; }
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-5">
          <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h2 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mb-2">Thank you!</h2>
        <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6 max-w-md mx-auto">
          Your review has been submitted. We&apos;ll give it a quick look and it may appear on the trip page soon.
        </p>
        <button onClick={() => router.push(`/account/bookings/${bookingId}`)}
          className="px-7 py-3.5 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">
          Back to my trip
        </button>
      </div>
    );
  }

  const field = "w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]";
  const label = "block text-[12px] font-bold tracking-[0.14em] uppercase text-[#00afdb] mb-2";

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-7 space-y-6">
      {/* rating */}
      <div>
        <span className={label}>Your rating</span>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
              className="p-0.5 transition-transform hover:scale-110">
              <svg className="w-9 h-9" viewBox="0 0 24 24"
                fill={(hover || rating) >= n ? "#f5a623" : "none"}
                stroke={(hover || rating) >= n ? "#f5a623" : "#d8c9a8"} strokeWidth="1.5" strokeLinejoin="round">
                <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9.9l6.9-.8z" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* quote */}
      <div>
        <label className={label} htmlFor="quote">Your review</label>
        <textarea id="quote" value={quote} onChange={(e) => setQuote(e.target.value)} rows={5}
          placeholder="What made the week special? The coaching, the spot, the crew, the vibe…"
          className={`${field} resize-none leading-relaxed`} />
      </div>

      {/* name + country */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="country">Country</label>
          <input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Germany" autoComplete="country-name" className={field} />
        </div>
      </div>

      {/* photo picker */}
      {gallery.length > 0 && (
        <div>
          <span className={label}>Add one of your trip photos <span className="text-[#9aa6ac] font-medium normal-case tracking-normal">(optional)</span></span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {gallery.map((src) => {
              const selected = photoUrl === src;
              return (
                <button key={src} type="button" onClick={() => setPhotoUrl(selected ? null : src)}
                  className={`relative aspect-square rounded-xl bg-cover bg-center transition-all ${selected ? "ring-3 ring-[#00afdb] ring-offset-2" : "hover:opacity-90 opacity-95"}`}
                  style={{ backgroundImage: `url('${src}')` }} aria-pressed={selected} aria-label="Choose this photo">
                  {selected && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00afdb] grid place-items-center">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-red-500">{error}</p>}

      <button type="submit" disabled={busy}
        className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
        {busy ? "Submitting…" : "Submit my review"}
      </button>
      <p className="text-[12px] text-[#9aa6ac] text-center leading-relaxed">
        Your review is sent to our team first and may be featured on the trip page.
      </p>
    </form>
  );
}
