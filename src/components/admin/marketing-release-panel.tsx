"use client";

/**
 * Who on this trip may appear in an ad.
 *
 * Sits above the memories uploader because that is where the photos are, and
 * therefore where the question actually gets asked. Reading it off the booking
 * list one row at a time is how a face ends up in a campaign it was never
 * cleared for.
 *
 * Names both sides on purpose. A count alone ("3 of 12 cleared") tells you
 * nothing when you are looking at a photo of two people and need to know
 * whether THOSE two are the cleared ones.
 */

type Guest = { id: string; name: string; may_use_in_marketing?: boolean };

export function MarketingReleasePanel({ bookings }: { bookings: Guest[] }) {
  if (bookings.length === 0) return null;

  const cleared = bookings.filter((b) => b.may_use_in_marketing);
  const not = bookings.filter((b) => !b.may_use_in_marketing);

  return (
    <div className="rounded-xl admin-tablecard mb-5 px-5 py-4" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-[13px] font-bold admin-heading">Who may appear in an ad</h3>
        <span className="text-[11px] admin-faint">
          {cleared.length} of {bookings.length} gave permission
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-green-400 mb-1.5">Cleared</p>
          {cleared.length === 0 ? (
            <p className="text-xs admin-faint">Nobody yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {cleared.map((b) => (
                <li key={b.id} className="text-xs admin-muted">{b.name}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] uppercase admin-faint mb-1.5">No permission on file</p>
          {not.length === 0 ? (
            <p className="text-xs admin-faint">Nobody. The whole week is cleared.</p>
          ) : (
            <ul className="space-y-0.5">
              {not.map((b) => (
                <li key={b.id} className="text-xs admin-faint">{b.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-[11px] admin-faint mt-3.5 leading-relaxed">
        Guests give this themselves in their trip page, and can take it back at any time. It is not something
        the office can tick on their behalf. It covers only their own personal photos, so a &quot;Everyone&quot; shot of
        the whole week is never cleared by it: those belong to no single booking, and every face on one would
        have to be cleared separately.
      </p>
    </div>
  );
}
