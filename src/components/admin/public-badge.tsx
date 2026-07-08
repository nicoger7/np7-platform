/**
 * Tiny "this shows on the public website" marker for admin field labels.
 * Use next to any field whose value renders on np-seven.com, so the team
 * always knows what's internal vs. live copy.
 */
export function PublicBadge({ note }: { note?: string }) {
  return (
    <span
      title={note ?? "Shown on the public website"}
      className="ml-1.5 inline-flex items-center gap-1 align-middle rounded-full bg-[#0aa3c7]/12 text-[#0aa3c7] px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.08em] leading-none"
    >
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
      website
    </span>
  );
}
