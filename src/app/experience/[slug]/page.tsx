import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await supabase
    .from("exp_experiences")
    .select("title, description, location")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!data) return { title: "Experience Not Found" };

  return {
    title: `${data.title} — NP7 Experience`,
    description: data.description || `NP7 Experience in ${data.location}`,
  };
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  return `${s.toLocaleDateString("en-US", opts)} — ${e.toLocaleDateString("en-US", opts)}`;
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;

  const { data: experience } = await supabase
    .from("exp_experiences")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!experience) notFound();

  // Fetch packages for this experience
  const { data: packages } = await supabase
    .from("exp_packages")
    .select("*")
    .eq("experience_id", experience.id)
    .neq("status", "hidden")
    .order("sort_order");

  const spotsLeft = (experience.max_spots ?? 0) - (experience.spots_taken ?? 0);

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/96 backdrop-blur-lg border-b border-[#ebebeb]">
        <div className="max-w-[1200px] mx-auto px-8 h-[68px] flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-[#111] text-white w-9 h-9 rounded-[9px] flex items-center justify-center text-[13px] font-black">
              NP7
            </div>
          </Link>
          <div className="flex bg-[#f7f7f7] rounded-lg p-[3px] gap-0.5">
            <Link
              href="/experience"
              className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold bg-[#111] text-white"
            >
              Experience
            </Link>
            <Link
              href="/hardware"
              className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold text-[#777] hover:text-[#111] transition-colors"
            >
              Hardware
            </Link>
          </div>
          <nav className="hidden md:flex gap-7 ml-auto">
            <Link
              href="/experience"
              className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors"
            >
              ← All Experiences
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[60vh] flex items-end bg-[#111]">
        {experience.hero_image && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${experience.hero_image}')` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        <div className="relative max-w-[1200px] mx-auto px-8 pb-16 pt-32 w-full">
          <p className="text-[11px] font-bold tracking-[0.25em] text-white/60 mb-3">
            {experience.location?.toUpperCase()}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-[-0.035em] mb-4">
            {experience.title}
          </h1>
          {experience.date_start && experience.date_end && (
            <p className="text-[15px] text-white/60 mb-2">
              {formatDateRange(experience.date_start, experience.date_end)}
            </p>
          )}
          <div className="flex items-center gap-4 mt-4">
            {spotsLeft > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                {spotsLeft} spots left
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-400">
                <span className="w-2 h-2 bg-red-400 rounded-full" />
                Fully booked
              </span>
            )}
            {experience.price && (
              <span className="text-[15px] font-bold text-white">
                from &euro;{Number(experience.price).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-20">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-16">
            {/* Main content */}
            <div>
              <h2 className="text-2xl font-black tracking-[-0.02em] mb-6">
                About this experience
              </h2>
              <p className="text-base text-[#555] leading-relaxed mb-10">
                {experience.description}
              </p>

              {experience.whats_included &&
                experience.whats_included.length > 0 && (
                  <>
                    <h3 className="text-lg font-extrabold mb-4">
                      What&apos;s included
                    </h3>
                    <ul className="space-y-2.5 mb-10">
                      {experience.whats_included.map(
                        (item: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 text-[15px] text-[#555]"
                          >
                            <span className="text-[#0aa3c7] mt-0.5">✓</span>
                            {item}
                          </li>
                        )
                      )}
                    </ul>
                  </>
                )}

              {experience.cancellation_policy && (
                <>
                  <h3 className="text-lg font-extrabold mb-4">
                    Cancellation Policy
                  </h3>
                  <p className="text-sm text-[#777] leading-relaxed">
                    {experience.cancellation_policy}
                  </p>
                </>
              )}
            </div>

            {/* Sidebar */}
            <div>
              <div className="sticky top-24 bg-[#f7f7f7] rounded-2xl p-8">
                <h3 className="text-lg font-extrabold mb-6">
                  {packages && packages.length > 0
                    ? "Choose your package"
                    : "Interested?"}
                </h3>

                {packages && packages.length > 0 ? (
                  <div className="space-y-4 mb-6">
                    {packages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className="bg-white rounded-xl p-5 border border-[#ebebeb]"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-[15px]">{pkg.name}</h4>
                          {pkg.price && (
                            <span className="text-[15px] font-bold">
                              &euro;
                              {Number(pkg.price).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {pkg.description && (
                          <p className="text-[13px] text-[#777] mb-3">
                            {pkg.description}
                          </p>
                        )}
                        {pkg.includes && pkg.includes.length > 0 && (
                          <ul className="space-y-1">
                            {pkg.includes.map(
                              (item: string, i: number) => (
                                <li
                                  key={i}
                                  className="text-[12px] text-[#999] flex items-center gap-2"
                                >
                                  <span className="text-[#0aa3c7]">✓</span>
                                  {item}
                                </li>
                              )
                            )}
                          </ul>
                        )}
                        {pkg.deposit && (
                          <p className="text-[11px] text-[#999] mt-3">
                            Deposit: &euro;{Number(pkg.deposit).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                <Link
                  href={`mailto:experience@np-seven.com?subject=Inquiry: ${experience.title}`}
                  className="block w-full text-center px-7 py-3.5 rounded-full text-[13px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_16px_rgba(10,163,199,0.25)] hover:bg-[#087a95] transition-colors"
                >
                  Get in touch
                </Link>
                <p className="text-[11px] text-[#999] text-center mt-3">
                  We&apos;ll get back to you within 24 hours
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#111] text-white/50 pt-16 pb-6 border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="border-t border-white/[0.06] pt-5 text-[11px] text-white/25">
            &copy; 2026 NP7 Experience. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
