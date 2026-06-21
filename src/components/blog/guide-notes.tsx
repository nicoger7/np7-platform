import { supabase } from "@/lib/supabase";
import { GUIDE_NOTE_SCOPE } from "@/lib/blog-templates";
import { getCommunityAuthors, type AuthorBadge } from "@/lib/portal-data";
import { LevelBadge } from "@/components/shared/level-badge";
import { SpotNoteForm } from "./spot-note-form";

type GuideNote = { author_name: string | null; body: string; contact_id: string | null };

/**
 * "Community tips" — a guide-level community notes section shown at the foot of
 * EVERY guide (technique, gear, spotguide). Lists approved member tips and an
 * add-a-tip form, reusing the spot-notes pipeline: guide-level notes are stored
 * with spot_name = GUIDE_NOTE_SCOPE, submitted via /api/portal/spot-notes, and
 * moderated at /admin/blog/notes. Bylines are enriched with the member's public
 * profile (avatar, level + verified skills on hover) when they opted in.
 */
export async function GuideNotes({ blogPostId, slug, accent }: { blogPostId: string; slug: string; accent: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("exp_blog_spot_notes")
    .select("author_name, body, contact_id")
    .eq("blog_post_id", blogPostId)
    .eq("spot_name", GUIDE_NOTE_SCOPE)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  const notes = (data ?? []) as GuideNote[];
  const authors: Record<string, AuthorBadge> = await getCommunityAuthors(notes.map((n) => n.contact_id), "spot_notes").catch(() => ({}));

  return (
    <section className="rounded-2xl border border-[#ece3d3] bg-[#fdfaf3] p-6 sm:p-7">
      <h2 className="flex items-center gap-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#00374a] mb-1">
        <span className="inline-block w-6 h-[3px] rounded-full" style={{ backgroundColor: accent }} />
        Community tips
      </h2>
      <p className="text-[13.5px] text-[#6a7a80] mb-4">
        Tips from the NP7 crew. Got one? Add it below — we review every tip before it shows.
      </p>

      {notes.length > 0 && (
        <ul className="space-y-3.5">
          {notes.map((n, i) => {
            const a = n.contact_id ? authors[n.contact_id] : undefined;
            const who = a?.displayName || n.author_name || "Member";
            return (
              <li key={i} className="flex gap-3">
                {a?.avatarUrl ? (
                  <span className="shrink-0 w-9 h-9 rounded-full bg-cover bg-center ring-1 ring-[#00374a]/5" style={{ backgroundImage: `url('${a.avatarUrl}')` }} aria-hidden="true" />
                ) : (
                  <span className="shrink-0 w-9 h-9 rounded-full grid place-items-center text-[12.5px] font-bold ring-1 ring-[#00374a]/5" style={{ backgroundColor: `${accent}1a`, color: accent }} aria-hidden="true">
                    {(a?.initials || who[0]).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                    <span className="font-bold text-[#00374a] text-[14px] leading-tight">{who}</span>
                    {a?.username && <span className="text-[12px] text-[#9aa6ac] leading-tight">@{a.username}</span>}
                    {a?.level && <LevelBadge level={a.level} verified={!!a.levelVerified} skills={a.skills ?? []} align="left" />}
                  </div>
                  <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mt-1">{n.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SpotNoteForm slug={slug} spotName={GUIDE_NOTE_SCOPE} accent={accent} />
    </section>
  );
}
