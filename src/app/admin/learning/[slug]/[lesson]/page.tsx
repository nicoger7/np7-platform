"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { courseColor, type LearningCourse, type LearningLesson } from "@/lib/learning";
import { LessonBody, VideoEmbed } from "../../lesson-body";

type LessonRow = LearningLesson & { completed: boolean };
type Payload = { course: LearningCourse; lessons: LessonRow[] };

/**
 * One lesson, and nothing else on the screen.
 *
 * The whole course arrives in a single fetch (bodies included — a lesson is five
 * minutes long), so prev/next is instant and a coach who loses signal walking
 * down to the water can still read the rest of the track.
 */
export default function LessonPage({ params }: { params: Promise<{ slug: string; lesson: string }> }) {
  const { slug, lesson: lessonSlug } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/learning/read?course=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const lessons = data?.lessons ?? [];
  const idx = lessons.findIndex((l) => l.slug === lessonSlug);
  const lesson = idx >= 0 ? lessons[idx] : null;

  // "Opened" is written once, silently. It is the only signal in the system that
  // nobody has to claim, which makes it the honest one.
  useEffect(() => {
    if (!lesson) return;
    fetch("/api/admin/learning/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lesson.id, opened: true }),
    }).catch(() => {});
  }, [lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleComplete() {
    if (!lesson) return;
    const next = !lesson.completed;
    setSaving(true);
    // Optimistic: ticking a box should never feel like a network request.
    setData((d) => d && { ...d, lessons: d.lessons.map((l) => (l.id === lesson.id ? { ...l, completed: next } : l)) });
    const res = await fetch("/api/admin/learning/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lesson.id, completed: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setData((d) => d && { ...d, lessons: d.lessons.map((l) => (l.id === lesson.id ? { ...l, completed: !next } : l)) });
    }
    setSaving(false);
  }

  if (loading) return <div className="py-16 text-center text-sm admin-faint">Loading…</div>;
  if (!data?.course || !lesson) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm admin-faint mb-3">That lesson isn&apos;t published.</p>
        <Link href="/admin/learning" className="text-sm text-[var(--admin-accent)] font-semibold">← Back to the Academy</Link>
      </div>
    );
  }

  const course = data.course;
  const color = courseColor(course.icon);
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const takeaways = Array.isArray(lesson.takeaways) ? lesson.takeaways : [];

  return (
    <div className="max-w-2xl pb-24 lg:pb-0">
      <Link href={`/admin/learning/${course.slug}`} className="inline-flex items-center gap-1.5 text-xs admin-faint mb-4 hover:text-[var(--admin-accent)] transition-colors">
        ← {course.title}
      </Link>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}22`, color }}>
          {lesson.minutes} min
        </span>
        <span className="text-[11px] admin-faint">Lesson {idx + 1} of {lessons.length}</span>
      </div>
      <h1 className="text-2xl font-bold admin-heading leading-tight mb-1.5">{lesson.title}</h1>
      {lesson.summary && <p className="text-sm admin-muted mb-6">{lesson.summary}</p>}

      <VideoEmbed url={lesson.video_url} />

      {lesson.body ? <LessonBody html={lesson.body} /> : <p className="text-sm admin-faint">This one hasn&apos;t been written yet.</p>}

      {lesson.route_hint && (
        <Link
          href={lesson.route_hint}
          className="mt-6 flex items-center gap-2 rounded-xl px-4 py-3 transition-colors"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
        >
          <span className="text-xs admin-muted flex-1">
            This is the page it happens on — <span className="admin-heading font-semibold">{lesson.route_hint}</span>
          </span>
          <span className="text-sm shrink-0" style={{ color }}>→</span>
        </Link>
      )}

      {takeaways.length > 0 && (
        <div className="mt-6 rounded-xl p-4 sm:p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider admin-faint mb-3">You should now be able to</p>
          <ul className="space-y-2">
            {takeaways.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-sm admin-heading leading-snug">
                <span className="shrink-0 mt-[3px]" style={{ color }}>•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] admin-faint">Not a test. If one of these doesn&apos;t land, ask — that&apos;s the lesson&apos;s fault, not yours.</p>
        </div>
      )}

      {/* Desktop actions sit in the flow; on a phone they ride the bottom of the
          screen, because the thing you do after reading shouldn't need a scroll. */}
      <div className="hidden lg:flex items-center gap-3 mt-8 pt-6" style={{ borderTop: "1px solid var(--admin-border)" }}>
        <Actions lesson={lesson} color={color} saving={saving} onToggle={toggleComplete} course={course} next={next} prev={prev} />
      </div>
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 px-4 py-3"
        style={{ backgroundColor: "var(--admin-sidebar)", borderTop: "1px solid var(--admin-border)" }}
      >
        <Actions lesson={lesson} color={color} saving={saving} onToggle={toggleComplete} course={course} next={next} prev={prev} />
      </div>
    </div>
  );
}

function Actions({
  lesson, color, saving, onToggle, course, next, prev,
}: {
  lesson: LessonRow;
  color: string;
  saving: boolean;
  onToggle: () => void;
  course: LearningCourse;
  next: LessonRow | null;
  prev: LessonRow | null;
}) {
  return (
    <>
      {prev && (
        <Link href={`/admin/learning/${course.slug}/${prev.slug}`} className="admin-btn admin-btn-ghost shrink-0" title={prev.title} aria-label="Previous lesson">←</Link>
      )}
      <button
        onClick={onToggle}
        disabled={saving}
        className="admin-btn flex-1 lg:flex-none"
        style={lesson.completed
          ? { backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }
          : { backgroundColor: color, color: "#0a0a0a" }}
      >
        {lesson.completed ? "✓ Got it — undo" : "I've got this"}
      </button>
      {next ? (
        <Link href={`/admin/learning/${course.slug}/${next.slug}`} className="admin-btn admin-btn-ghost flex-1 lg:flex-none justify-center">
          Next →
        </Link>
      ) : (
        <Link href={`/admin/learning/${course.slug}`} className="admin-btn admin-btn-ghost flex-1 lg:flex-none justify-center">
          Done
        </Link>
      )}
    </>
  );
}
