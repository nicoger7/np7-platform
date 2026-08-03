"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { effectiveCanEdit } from "@/lib/access";
import { useAccess } from "@/lib/use-access";
import {
  COURSE_ICONS, ROUTE_HINT_SUGGESTIONS, courseColor, freshness,
  type LearningCourse, type LearningLesson,
} from "@/lib/learning";

type Bundle = LearningCourse & {
  lessons: LearningLesson[];
  roles: { id: string; name: string }[];
  members: { id: string; name: string }[];
};

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm";
const labelClass = "block text-xs font-medium admin-muted mb-1";

export default function CourseEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const access = useAccess();
  const canAuthor = !!access && effectiveCanEdit(access, "/api/admin/learning/courses");

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"course" | "lessons">("course");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [course, setCourse] = useState<Partial<LearningCourse>>({});
  const [lessons, setLessons] = useState<LearningLesson[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Partial<LearningLesson>>({});

  useEffect(() => {
    fetch(`/api/admin/learning/courses/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Bundle | null) => {
        if (d) { setBundle(d); setCourse(d); setLessons(d.lessons ?? []); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  function selectLesson(l: LearningLesson) {
    setSelected(l.id);
    setLesson({ ...l, takeaways: Array.isArray(l.takeaways) ? l.takeaways : [] });
  }

  async function saveCourse(patch?: Partial<LearningCourse>) {
    setSaving(true); setError("");
    const body = patch ?? {
      title: course.title, slug: course.slug, summary: course.summary, description: course.description,
      icon: course.icon, status: course.status, required: course.required, role_ids: course.role_ids,
      owner_id: course.owner_id, review_every_days: course.review_every_days,
    };
    const res = await fetch(`/api/admin/learning/courses/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setCourse((c) => ({ ...c, ...json }));
    else setError(json.error || "Couldn't save.");
    setSaving(false);
  }

  async function addLesson() {
    setError("");
    const res = await fetch("/api/admin/learning/lessons", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: id, title: "New lesson" }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Couldn't add a lesson."); return; }
    const created: LearningLesson = await res.json();
    setLessons((ls) => [...ls, created]);
    selectLesson(created);
    setTab("lessons");
  }

  async function saveLesson() {
    if (!selected) return;
    setSaving(true); setError("");
    const res = await fetch(`/api/admin/learning/lessons/${selected}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: lesson.title, slug: lesson.slug, summary: lesson.summary, body: lesson.body,
        video_url: lesson.video_url, minutes: Number(lesson.minutes) || 3, status: lesson.status,
        route_hint: lesson.route_hint, takeaways: lesson.takeaways ?? [],
      }),
    });
    if (res.ok) {
      const saved: LearningLesson = await res.json();
      setLessons((ls) => ls.map((l) => (l.id === saved.id ? saved : l)));
      setLesson({ ...saved, takeaways: Array.isArray(saved.takeaways) ? saved.takeaways : [] });
    } else {
      setError((await res.json().catch(() => ({}))).error || "Couldn't save that lesson.");
    }
    setSaving(false);
  }

  async function deleteLesson() {
    if (!selected || !confirm("Archive this lesson? Reading history stays intact.")) return;
    const res = await fetch(`/api/admin/learning/lessons/${selected}`, { method: "DELETE" });
    if (res.ok) { setLessons((ls) => ls.filter((l) => l.id !== selected)); setSelected(null); }
    else setError((await res.json().catch(() => ({}))).error || "Couldn't archive that lesson.");
  }

  async function moveLesson(i: number, dir: -1 | 1) {
    const next = [...lessons];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setLessons(next);
    await fetch("/api/admin/learning/reorder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "lesson", ids: next.map((l) => l.id) }),
    });
  }

  /** Images live wherever they already live — File Storage, R2, a YouTube
   *  thumbnail. Asking for the URL keeps one upload pipeline in the product
   *  instead of two, and the editor's Source view can still do anything fancier. */
  function insertImage() {
    const url = window.prompt("Image URL (copy it from File Storage)");
    if (!url) return;
    setLesson((l) => ({ ...l, body: `${l.body ?? ""}<p><img src="${url.replace(/"/g, "&quot;")}" alt="" /></p>` }));
  }

  if (loading) return <div className="py-16 text-center text-sm admin-faint">Loading…</div>;
  if (!bundle) return <div className="py-16 text-center text-sm admin-faint">That course is gone.</div>;
  if (access && !canAuthor) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm admin-muted mb-3">You can read the Academy, but editing it isn&apos;t part of your role.</p>
        <Link href="/admin/learning" className="text-sm text-[var(--admin-accent)] font-semibold">← Back to the Academy</Link>
      </div>
    );
  }

  const color = courseColor(course.icon);
  const f = freshness(course.reviewed_at ?? null, course.review_every_days ?? 180);
  const takeaways = (lesson.takeaways as string[] | undefined) ?? [];

  return (
    <div className="max-w-4xl">
      <Link href="/admin/learning/manage" className="text-xs admin-faint hover:text-[var(--admin-accent)] transition-colors">← Manage courses</Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-1 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h1 className="text-2xl font-bold admin-heading truncate">{course.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 text-[11px] admin-faint" title={`Review every ${course.review_every_days} days`}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
            {f.label}
          </span>
          <button onClick={() => saveCourse({ reviewed_at: new Date().toISOString() })} className="admin-btn admin-btn-ghost">
            Still true
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-5">
        {([["course", "Course"], ["lessons", `Lessons (${lessons.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={tab === k
              ? { backgroundColor: "var(--admin-active)", color: "var(--admin-text)" }
              : { color: "var(--admin-text-muted)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>}

      {tab === "course" ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={course.title ?? ""} onChange={(e) => setCourse({ ...course, title: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Web address</label>
              <input className={inputClass} value={course.slug ?? ""} onChange={(e) => setCourse({ ...course, slug: e.target.value })} />
            </div>
          </div>

          <div>
            <label className={labelClass}>One line — what this track is for</label>
            <input className={inputClass} maxLength={140} value={course.summary ?? ""}
              onChange={(e) => setCourse({ ...course, summary: e.target.value })}
              placeholder="Every screen you actually touch, one short lesson each." />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Colour &amp; kind</label>
              <select className={inputClass} value={course.icon ?? ""} onChange={(e) => setCourse({ ...course, icon: e.target.value })}>
                <option value="">—</option>
                {COURSE_ICONS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={inputClass} value={course.status ?? "draft"} onChange={(e) => setCourse({ ...course, status: e.target.value as LearningCourse["status"] })}>
                <option value="draft">Draft — nobody sees it</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Review every (days)</label>
              <input type="number" min={30} className={inputClass} value={course.review_every_days ?? 180}
                onChange={(e) => setCourse({ ...course, review_every_days: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Owner — who keeps this true</label>
              <select className={inputClass} value={course.owner_id ?? ""} onChange={(e) => setCourse({ ...course, owner_id: e.target.value || null })}>
                <option value="">—</option>
                {bundle.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Who has to read it</label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm admin-heading cursor-pointer" style={{ border: "1px solid var(--admin-input-border)", backgroundColor: "var(--admin-input-bg)" }}>
                <input type="checkbox" checked={!!course.required} onChange={(e) => setCourse({ ...course, required: e.target.checked })} />
                On the onboarding path
              </label>
            </div>
          </div>

          {course.required && (
            <div>
              <label className={labelClass}>…for these roles (none ticked = everyone)</label>
              <div className="flex flex-wrap gap-2">
                {bundle.roles.map((r) => {
                  const on = (course.role_ids ?? []).includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setCourse({
                        ...course,
                        role_ids: on ? (course.role_ids ?? []).filter((x) => x !== r.id) : [...(course.role_ids ?? []), r.id],
                      })}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={on
                        ? { backgroundColor: color, color: "#0a0a0a" }
                        : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}
                    >
                      {r.name}
                    </button>
                  );
                })}
                {bundle.roles.length === 0 && <span className="text-xs admin-faint">No roles defined yet — this will apply to everyone.</span>}
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Intro — what this track is, and how to use it</label>
            <RichTextEditor value={course.description ?? ""} onChange={(html) => setCourse({ ...course, description: html })}
              placeholder="Why this track exists, and how to read it…" minHeight={180} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => saveCourse()} disabled={saving} className="admin-btn admin-btn-primary">
              {saving ? "Saving…" : "Save course"}
            </button>
            <button onClick={addLesson} className="admin-btn admin-btn-ghost">Add a lesson</button>
            {course.status === "published" && course.slug && (
              <Link href={`/admin/learning/${course.slug}`} className="text-xs admin-faint hover:text-[var(--admin-accent)] transition-colors ml-auto">
                See it as the team does →
              </Link>
            )}
          </div>
        </div>
      ) : selected ? (
        <div className="space-y-5">
          <button onClick={() => setSelected(null)} className="text-xs admin-faint hover:text-[var(--admin-accent)] transition-colors">← All lessons</button>

          <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]">
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={lesson.title ?? ""} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Minutes</label>
              <input type="number" min={1} max={30} className={inputClass} value={lesson.minutes ?? 3}
                onChange={(e) => setLesson({ ...lesson, minutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={inputClass} value={lesson.status ?? "draft"} onChange={(e) => setLesson({ ...lesson, status: e.target.value as LearningLesson["status"] })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
          {(lesson.minutes ?? 3) > 7 && (
            <p className="-mt-3 text-[11px] text-amber-500">
              Over seven minutes is where people stop finishing. Two lessons usually beat one long one.
            </p>
          )}

          <div>
            <label className={labelClass}>One line — what this lesson answers</label>
            <input className={inputClass} maxLength={140} value={lesson.summary ?? ""} onChange={(e) => setLesson({ ...lesson, summary: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Video — paste a YouTube or Vimeo link</label>
              <input className={inputClass} value={lesson.video_url ?? ""} onChange={(e) => setLesson({ ...lesson, video_url: e.target.value })}
                placeholder="https://youtu.be/…" />
            </div>
            <div>
              <label className={labelClass}>Where it happens in the admin</label>
              <input className={inputClass} list="np7-route-hints" value={lesson.route_hint ?? ""}
                onChange={(e) => setLesson({ ...lesson, route_hint: e.target.value })} placeholder="/admin/bookings" />
              <datalist id="np7-route-hints">
                {ROUTE_HINT_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>The lesson</label>
              <button onClick={insertImage} className="text-[11px] font-semibold admin-faint hover:text-[var(--admin-accent)] transition-colors">+ Image</button>
            </div>
            <RichTextEditor value={lesson.body ?? ""} onChange={(html) => setLesson({ ...lesson, body: html })}
              placeholder="Open Bookings → find the guest → hit Confirm…" minHeight={320} />
          </div>

          <div>
            <label className={labelClass}>You should now be able to… (up to three)</label>
            <div className="space-y-2">
              {takeaways.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inputClass} value={t}
                    onChange={(e) => setLesson({ ...lesson, takeaways: takeaways.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button onClick={() => setLesson({ ...lesson, takeaways: takeaways.filter((_, j) => j !== i) })}
                    className="text-xs admin-faint hover:text-red-400 px-2">✕</button>
                </div>
              ))}
              {takeaways.length < 3 && (
                <button onClick={() => setLesson({ ...lesson, takeaways: [...takeaways, ""] })}
                  className="text-xs font-semibold text-[var(--admin-accent)]">+ Add one</button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] admin-faint">Not a quiz — the thing they should be able to do afterwards.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <button onClick={saveLesson} disabled={saving} className="admin-btn admin-btn-primary mt-3">
              {saving ? "Saving…" : "Save lesson"}
            </button>
            <button onClick={deleteLesson} className="admin-btn admin-btn-ghost mt-3 text-red-400">Archive lesson</button>
          </div>
        </div>
      ) : (
        <div>
          {lessons.length === 0 ? (
            <p className="py-12 text-center text-sm admin-faint">No lessons yet.</p>
          ) : (
            <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--admin-border)" }}>
              {lessons.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < lessons.length - 1 ? "1px solid var(--admin-border)" : undefined }}>
                  <button onClick={() => selectLesson(l)} className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-medium admin-heading truncate">{l.title}</span>
                    <span className="block text-[11px] admin-faint">
                      {l.minutes} min · {l.status === "published" ? "published" : "draft"}
                      {l.route_hint ? ` · ${l.route_hint}` : ""}
                    </span>
                  </button>
                  <button onClick={() => moveLesson(i, -1)} disabled={i === 0} className="text-xs admin-faint disabled:opacity-25" title="Move up">↑</button>
                  <button onClick={() => moveLesson(i, 1)} disabled={i === lessons.length - 1} className="text-xs admin-faint disabled:opacity-25" title="Move down">↓</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addLesson} className="admin-btn admin-btn-primary">Add a lesson</button>
        </div>
      )}
    </div>
  );
}
