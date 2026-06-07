"use client";

import { useState, useEffect } from "react";

interface Stats {
  experiences: number;
  bookings: number;
  contacts: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ experiences: 0, bookings: 0, contacts: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [expRes, bookRes, contactRes] = await Promise.all([
        fetch("/api/admin/experiences"),
        fetch("/api/admin/bookings"),
        fetch("/api/admin/contacts?limit=1"),
      ]);

      const experiences = await expRes.json();
      const bookings = await bookRes.json();
      const contacts = await contactRes.json();

      setStats({
        experiences: Array.isArray(experiences) ? experiences.length : 0,
        bookings: Array.isArray(bookings) ? bookings.length : 0,
        contacts: contacts.count || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--admin-text-muted)" }} className="text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8" style={{ color: "var(--admin-text)" }}>
        Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: "var(--admin-surface)",
            border: "1px solid var(--admin-border)",
          }}
        >
          <p
            className="text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Experiences
          </p>
          <p className="text-3xl font-black" style={{ color: "var(--admin-text)" }}>
            {stats.experiences}
          </p>
        </div>

        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: "var(--admin-surface)",
            border: "1px solid var(--admin-border)",
          }}
        >
          <p
            className="text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Bookings
          </p>
          <p className="text-3xl font-black" style={{ color: "var(--admin-text)" }}>
            {stats.bookings}
          </p>
        </div>

        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: "var(--admin-surface)",
            border: "1px solid var(--admin-border)",
          }}
        >
          <p
            className="text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Contacts
          </p>
          <p className="text-3xl font-black" style={{ color: "var(--admin-text)" }}>
            {stats.contacts}
          </p>
        </div>
      </div>
    </div>
  );
}
