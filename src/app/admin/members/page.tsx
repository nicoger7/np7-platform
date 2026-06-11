"use client";

export default function MembersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold admin-heading mb-1">Member Management</h1>
      <p className="text-sm admin-muted mb-10">Website member accounts and access</p>

      <div
        className="rounded-xl p-10 text-center max-w-[560px]"
        style={{ border: "1px dashed var(--admin-border)" }}
      >
        <svg className="w-10 h-10 admin-faint mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
        <p className="text-sm font-medium admin-heading mb-1">In build</p>
        <p className="text-xs admin-faint">
          Member accounts, login access, and membership tiers will be managed here.
        </p>
      </div>
    </div>
  );
}
