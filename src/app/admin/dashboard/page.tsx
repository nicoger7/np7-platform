"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DashboardData = {
  experiences: { id: string; title: string; date_start: string | null; spots_taken: number | null; max_spots: number | null; status: string | null }[];
  bookings: { id: string; name: string; status: string | null; created_at: string | null; exp_experiences: { title: string } | null }[];
  contactCount: number;
};

export default function AdminDashboard() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Check auth
      const authRes = await fetch("/api/auth/me");
      if (!authRes.ok) {
        window.location.href = "/admin";
        return;
      }
      const auth = await authRes.json();
      setUser(auth.member);

      // Load dashboard data
      const [expRes, bookRes, contactRes] = await Promise.all([
        fetch("/api/admin/experiences"),
        fetch("/api/admin/bookings"),
        fetch("/api/admin/contacts?limit=1"),
      ]);

      const experiences = await expRes.json();
      const bookings = await bookRes.json();
      const contacts = await contactRes.json();

      setData({
        experiences: Array.isArray(experiences) ? experiences : [],
        bookings: Array.isArray(bookings) ? bookings : [],
        contactCount: contacts.count || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center">
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    lead: "bg-gray-500",
    interested: "bg-blue-500",
    enquiring: "bg-blue-400",
    contact_by_phone: "bg-yellow-500",
    ready_to_book: "bg-orange-500",
    payment_pending: "bg-orange-400",
    downpayment_paid: "bg-emerald-500",
    create_invoice: "bg-emerald-400",
    paid: "bg-green-500",
    confirmed: "bg-green-600",
    attended: "bg-green-700",
    lost: "bg-red-500",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Top bar */}
      <header className="bg-[#111] border-b border-white/[0.06] sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <div className="bg-white text-[#111] w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black">
                NP7
              </div>
            </Link>
            <span className="text-[11px] font-bold tracking-[0.2em] text-white/40">
              ADMIN
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-white/60">
              {user?.name}{" "}
              <span className="text-white/30">({user?.role})</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-[12px] text-white/40 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-[#111] rounded-xl border border-white/[0.06] p-6">
            <p className="text-[11px] font-bold tracking-[0.15em] text-white/30 uppercase mb-2">
              Experiences
            </p>
            <p className="text-3xl font-black text-white">
              {data?.experiences.length || 0}
            </p>
          </div>
          <div className="bg-[#111] rounded-xl border border-white/[0.06] p-6">
            <p className="text-[11px] font-bold tracking-[0.15em] text-white/30 uppercase mb-2">
              Bookings
            </p>
            <p className="text-3xl font-black text-white">
              {data?.bookings.length || 0}
            </p>
          </div>
          <div className="bg-[#111] rounded-xl border border-white/[0.06] p-6">
            <p className="text-[11px] font-bold tracking-[0.15em] text-white/30 uppercase mb-2">
              Contacts
            </p>
            <p className="text-3xl font-black text-white">
              {data?.contactCount || 0}
            </p>
          </div>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Experiences */}
          <div className="bg-[#111] rounded-xl border border-white/[0.06] p-6">
            <h2 className="text-[15px] font-bold text-white mb-4">
              Experiences
            </h2>
            <div className="space-y-3">
              {data?.experiences.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
                >
                  <div>
                    <p className="text-[14px] font-semibold text-white/90">
                      {exp.title}
                    </p>
                    <p className="text-[12px] text-white/30">
                      {exp.date_start
                        ? new Date(exp.date_start).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "TBD"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-white/70">
                      {exp.spots_taken ?? 0}/{exp.max_spots ?? 0}
                    </p>
                    <p className="text-[11px] text-white/30">spots</p>
                  </div>
                </div>
              ))}
              {(!data?.experiences || data.experiences.length === 0) && (
                <p className="text-[13px] text-white/30">No experiences yet</p>
              )}
            </div>
          </div>

          {/* Recent Bookings */}
          <div className="bg-[#111] rounded-xl border border-white/[0.06] p-6">
            <h2 className="text-[15px] font-bold text-white mb-4">
              Recent Bookings
            </h2>
            <div className="space-y-3">
              {data?.bookings.slice(0, 10).map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
                >
                  <div>
                    <p className="text-[14px] font-semibold text-white/90">
                      {booking.name}
                    </p>
                    <p className="text-[12px] text-white/30">
                      {booking.exp_experiences?.title || "—"}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white ${statusColors[booking.status || "lead"] || "bg-gray-500"}`}
                  >
                    {(booking.status || "lead").replace(/_/g, " ")}
                  </span>
                </div>
              ))}
              {(!data?.bookings || data.bookings.length === 0) && (
                <p className="text-[13px] text-white/30">No bookings yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
