"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Environments ────────────────────────────────────────────────────────────

type Environment = "experience" | "hardware" | "product-dev";

const environments: { id: Environment; label: string; shortLabel: string; color: string }[] = [
  { id: "experience", label: "NP7 Experience", shortLabel: "Experience", color: "#0aa3c7" },
  { id: "hardware", label: "NP7 Hardware", shortLabel: "Hardware", color: "#f59e0b" },
  { id: "product-dev", label: "Product Development", shortLabel: "Product Dev", color: "#8b5cf6" },
];

// ─── Navigation per environment ──────────────────────────────────────────────

const navByEnv: Record<Environment, { label: string; items: { label: string; href: string; icon: string }[] }[]> = {
  experience: [
    {
      label: "OPERATIONS",
      items: [
        { label: "Experiences", href: "/admin/experiences", icon: "compass" },
        { label: "Bookings", href: "/admin/bookings", icon: "inbox" },
        { label: "Contacts", href: "/admin/contacts", icon: "users" },
        { label: "Hotel Rooms", href: "/admin/hotel-rooms", icon: "bed" },
        { label: "Packages", href: "/admin/packages", icon: "box" },
        { label: "Components", href: "/admin/components", icon: "puzzle" },
        { label: "To-Dos", href: "/admin/todos", icon: "checklist" },
      ],
    },
    {
      label: "WEBSITE",
      items: [
        { label: "File Storage", href: "/admin/images", icon: "image" },
        { label: "Event Content", href: "/admin/content", icon: "layers" },
        { label: "Member Management", href: "/admin/members", icon: "person" },
        { label: "Blog", href: "/admin/blog", icon: "pen" },
        { label: "Destinations", href: "/admin/destinations", icon: "compass" },
      ],
    },
    {
      label: "TEAM",
      items: [
        { label: "Employees", href: "/admin/team", icon: "person" },
        { label: "Hours Log", href: "/admin/hours-log", icon: "clock" },
      ],
    },
    {
      label: "FINANCE",
      items: [
        { label: "Payments", href: "/admin/payments", icon: "receipt" },
        { label: "Experience Costs", href: "/admin/exp-costs", icon: "receipt" },
        { label: "Vendors", href: "/admin/vendors", icon: "building" },
      ],
    },
    {
      label: "AUTOMATION",
      items: [
        { label: "Pipeline Rules", href: "/admin/pipeline-rules", icon: "flow" },
        { label: "Task Rules", href: "/admin/task-rules", icon: "rules" },
        { label: "Email Templates", href: "/admin/email-templates", icon: "mail" },
      ],
    },
  ],
  hardware: [
    {
      label: "HARDWARE",
      items: [
        { label: "Products", href: "/admin/products", icon: "box" },
        { label: "Orders", href: "/admin/orders", icon: "truck" },
      ],
    },
  ],
  "product-dev": [
    {
      label: "PRODUCT DEV",
      items: [
        { label: "Boards", href: "/admin/boards", icon: "layers" },
        { label: "Reviews", href: "/admin/reviews", icon: "star" },
        { label: "Analytics", href: "/admin/analytics", icon: "chart" },
      ],
    },
  ],
};

const sharedNavTop = {
  label: "HOME",
  items: [
    { label: "Dashboard", href: "/admin", icon: "grid" },
  ],
};

const sharedNavBottom = {
  label: "GENERAL",
  items: [
    { label: "Images", href: "/admin/images", icon: "image" },
  ],
};

// ─── Icons ───────────────────────────────────────────────────────────────────

const icons: Record<string, React.ReactNode> = {
  grid: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  image: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  compass: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" />
    </svg>
  ),
  inbox: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  ),
  box: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  truck: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  layers: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  star: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  chart: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  puzzle: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 01-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 10-3.214 3.214c.446.166.855.497.925.968a.979.979 0 01-.276.837l-1.61 1.61a2.404 2.404 0 01-1.705.707 2.402 2.402 0 01-1.704-.706l-1.568-1.568a1.026 1.026 0 00-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 11-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 00-.289-.877l-1.568-1.568A2.402 2.402 0 011.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 103.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0112 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 113.237 3.237c-.464.18-.894.527-.967 1.02z" />
    </svg>
  ),
  bed: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4v16" />
      <path d="M2 8h18a2 2 0 012 2v10" />
      <path d="M2 17h20" />
      <path d="M6 8v9" />
    </svg>
  ),
  receipt: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  ),
  building: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  ),
  person: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  chartline: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  checklist: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" />
      <polyline points="3 12 4 13 6 11" />
      <polyline points="3 18 4 19 6 17" />
    </svg>
  ),
  flow: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9" />
      <line x1="12" y1="9" x2="12" y2="15" />
    </svg>
  ),
  rules: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="18" y2="18" />
    </svg>
  ),
  mail: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  pen: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
};

// ─── Themes ──────────────────────────────────────────────────────────────────

const themes = {
  dark: {
    "--admin-bg": "#0a0a0a",
    "--admin-sidebar": "#111111",
    "--admin-border": "rgba(255,255,255,0.06)",
    "--admin-text": "#ffffff",
    "--admin-text-muted": "rgba(255,255,255,0.4)",
    "--admin-text-faint": "rgba(255,255,255,0.2)",
    "--admin-surface": "rgba(255,255,255,0.04)",
    "--admin-surface-hover": "rgba(255,255,255,0.06)",
    "--admin-active": "rgba(255,255,255,0.08)",
    "--admin-input-bg": "rgba(255,255,255,0.04)",
    "--admin-input-border": "rgba(255,255,255,0.08)",
    "--admin-logo-filter": "invert(1)",
  },
  light: {
    "--admin-bg": "#f5f5f5",
    "--admin-sidebar": "#ffffff",
    "--admin-border": "rgba(0,0,0,0.08)",
    "--admin-text": "#111111",
    "--admin-text-muted": "rgba(0,0,0,0.45)",
    "--admin-text-faint": "rgba(0,0,0,0.2)",
    "--admin-surface": "rgba(0,0,0,0.03)",
    "--admin-surface-hover": "rgba(0,0,0,0.05)",
    "--admin-active": "rgba(0,0,0,0.06)",
    "--admin-input-bg": "rgba(0,0,0,0.03)",
    "--admin-input-border": "rgba(0,0,0,0.1)",
    "--admin-logo-filter": "invert(0)",
  },
} as const;

type Theme = keyof typeof themes;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [theme, setTheme] = useState<Theme>("dark");
  const [env, setEnv] = useState<Environment>("experience");
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const envMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("np7-admin-theme") as Theme | null;
    if (savedTheme && themes[savedTheme]) setTheme(savedTheme);
    const savedEnv = localStorage.getItem("np7-admin-env") as Environment | null;
    if (savedEnv && navByEnv[savedEnv]) setEnv(savedEnv);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (envMenuRef.current && !envMenuRef.current.contains(e.target as Node)) {
        setEnvMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("np7-admin-theme", next);
  }

  function switchEnv(newEnv: Environment) {
    setEnv(newEnv);
    localStorage.setItem("np7-admin-env", newEnv);
    setEnvMenuOpen(false);
    router.push("/admin");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const vars = themes[theme];
  const activeEnvConfig = environments.find((e) => e.id === env)!;
  // File Storage lives under WEBSITE for the experience env; keep the shared
  // bottom section only for envs that don't include it.
  const sections = env === "experience"
    ? [sharedNavTop, ...navByEnv[env]]
    : [sharedNavTop, ...navByEnv[env], sharedNavBottom];

  return (
    <div
      className="min-h-screen flex"
      style={{
        ...Object.fromEntries(Object.entries(vars)),
        backgroundColor: "var(--admin-bg)",
        color: "var(--admin-text)",
      }}
    >
      {/* Sidebar */}
      <aside
        className="w-56 flex flex-col"
        style={{
          backgroundColor: "var(--admin-sidebar)",
          borderRight: "1px solid var(--admin-border)",
        }}
      >
        {/* Logo + Environment switcher */}
        <div className="p-4" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <div className="flex items-center gap-2.5 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-logo.png"
              alt="NP7"
              className="h-5 w-auto"
              style={{ filter: "var(--admin-logo-filter)" }}
            />
            <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: "var(--admin-text-faint)" }}>
              ADMIN
            </span>
          </div>

          {/* Environment dropdown */}
          <div className="relative" ref={envMenuRef}>
            <button
              onClick={() => setEnvMenuOpen(!envMenuOpen)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors"
              style={{
                backgroundColor: "var(--admin-surface)",
                border: "1px solid var(--admin-border)",
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: activeEnvConfig.color }}
              />
              <span className="text-xs font-medium flex-1 truncate" style={{ color: "var(--admin-text)" }}>
                {activeEnvConfig.label}
              </span>
              <svg
                className="w-3 h-3 flex-shrink-0 transition-transform"
                style={{
                  color: "var(--admin-text-faint)",
                  transform: envMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {envMenuOpen && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50 shadow-xl"
                style={{
                  backgroundColor: "var(--admin-sidebar)",
                  border: "1px solid var(--admin-border)",
                }}
              >
                {environments.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => switchEnv(e.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor: e.id === env ? "var(--admin-active)" : "transparent",
                    }}
                    onMouseEnter={(ev) => {
                      if (e.id !== env) ev.currentTarget.style.backgroundColor = "var(--admin-surface-hover)";
                    }}
                    onMouseLeave={(ev) => {
                      ev.currentTarget.style.backgroundColor = e.id === env ? "var(--admin-active)" : "transparent";
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: e.color }}
                    />
                    <span className="text-xs font-medium" style={{ color: "var(--admin-text)" }}>
                      {e.label}
                    </span>
                    {e.id === env && (
                      <svg
                        className="w-3 h-3 ml-auto"
                        style={{ color: e.color }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4">
          {sections.map((section) => (
            <div key={section.label}>
              <div
                className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.15em]"
                style={{ color: "var(--admin-text-faint)" }}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: active ? "var(--admin-active)" : "transparent",
                        color: active ? "var(--admin-text)" : "var(--admin-text-muted)",
                        fontWeight: active ? 500 : 400,
                      }}
                    >
                      {icons[item.icon]}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs truncate" style={{ color: "var(--admin-text-faint)" }}>
              {user.email}
            </span>
            <button
              onClick={toggleTheme}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ backgroundColor: "var(--admin-surface)" }}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--admin-text-muted)" }}>
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--admin-text-muted)" }}>
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs transition-colors"
            style={{ color: "var(--admin-text-muted)" }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
