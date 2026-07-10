import Link from "next/link";
import { listSurveys } from "@/lib/surveys";
import { NewSurveyButton } from "@/components/admin/new-survey-button";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-[#eef3f4] text-[#6a7a80]",
  open: "bg-[#e1f5ee] text-[#0f6e56]",
  closed: "bg-[#fde7e3] text-[#a5432a]",
};
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function AdminSurveysPage() {
  const surveys = await listSurveys();

  return (
    <div className="max-w-[900px]">
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <h1 className="text-2xl font-black tracking-[-0.02em] text-[#0a2a33]">Trip interest surveys</h1>
        <NewSurveyButton />
      </div>
      <p className="text-[13.5px] text-[#6a7a80] mb-6 max-w-[560px]">Hidden, invite-only surveys — hand-pick members and send them a secret link to gauge demand for a special (non-public) trip.</p>

      {surveys.length === 0 ? (
        <div className="rounded-2xl border border-[#e7ddcb] bg-white p-10 text-center">
          <p className="text-[15px] font-bold text-[#0a2a33]">No surveys yet</p>
          <p className="text-[13.5px] text-[#6a7a80] mt-1">Create one, set the spots &amp; weeks, then invite members.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {surveys.map((s) => (
            <Link key={s.id} href={`/admin/surveys/${s.id}`} className="flex items-center gap-4 rounded-xl border border-[#e7ddcb] bg-white px-4 py-3.5 hover:border-[#0aa3c7] transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-[#0a2a33] truncate">{s.title}</p>
                <p className="text-[12.5px] text-[#9aa6ac] mt-0.5">Created {fmt(s.created_at)}</p>
              </div>
              <span className="shrink-0 text-[13px] text-[#6a7a80] tabular-nums">{s.responded}<span className="text-[#b6c2c7]">/{s.invited}</span> replied</span>
              <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_CLASS[s.status] ?? STATUS_CLASS.draft}`}>{s.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
