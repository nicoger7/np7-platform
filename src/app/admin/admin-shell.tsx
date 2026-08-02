"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { effectiveCanAccess, effectiveCanEnterWorld, type EffectiveAccess, type WorldId } from "@/lib/access";
import { AccountSwitcher } from "@/components/admin/account-switcher";
import { AdminInstallPrompt } from "@/components/pwa/admin-install-prompt";
import { ActiveTimeHeartbeat } from "@/components/admin/active-time-heartbeat";
import { CommandPalette, type PaletteItem } from "@/components/admin/command-palette";
import { AdminEnvContext, type AdminEnv } from "./env-context";

// ─── Environments ────────────────────────────────────────────────────────────

// NOTE: "magazine" is a UI grouping only — deliberately NOT an RBAC world. Roles
// like "NP7 Experience Media" grant the magazine/destinations SECTIONS inside the
// experience world; making magazine a real world would have locked them out.
// Entry is therefore decided by page access (see canEnterEnv).
type Environment = AdminEnv;

// `color` doubles as the admin accent for that world, mirroring the public site:
// Experience = ocean cyan, Hardware = neon lime (black text on it). `accentContrast`
// is the readable text color when the accent is a button/badge background.
const environments: { id: Environment; label: string; shortLabel: string; color: string; accentContrast: string; gradient: string; ownerOnly?: boolean }[] = [
  // gradient = the logo's "sun → sea" warmth (Experience) and each world's own sweep,
  // used for small brand accents in the chrome.
  { id: "experience", label: "NP7 Experience", shortLabel: "Experience", color: "#0aa3c7", accentContrast: "#ffffff", gradient: "linear-gradient(180deg,#ffc42e 0%,#f47b20 50%,#00afdb 100%)" },
  { id: "hardware", label: "NP7 Hardware", shortLabel: "Hardware", color: "#c2ff38", accentContrast: "#0a0a0a", gradient: "linear-gradient(180deg,#c2ff38 0%,#7bdb1e 50%,#ff2e88 100%)" },
  { id: "magazine", label: "Magazine", shortLabel: "Magazine", color: "#f0a500", accentContrast: "#2a1a00", gradient: "linear-gradient(180deg,#ffd97a 0%,#f0a500 50%,#f47b20 100%)" },
  { id: "product-dev", label: "Product Development", shortLabel: "Product Dev", color: "#8b5cf6", accentContrast: "#ffffff", gradient: "linear-gradient(180deg,#a78bfa 0%,#8b5cf6 50%,#6d28d9 100%)" },
  { id: "analytics", label: "Analytics", shortLabel: "Analytics", color: "#10b981", accentContrast: "#06281d", gradient: "linear-gradient(180deg,#34d399 0%,#10b981 50%,#059669 100%)", ownerOnly: true },
];

/** hex (#rgb or #rrggbb) → rgba() with the given alpha. */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ─── Navigation per environment ──────────────────────────────────────────────

type NavItem = { label: string; href: string; icon: string; wip?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navByEnv: Record<Environment, NavGroup[]> = {
  experience: [
    {
      label: "OPERATIONS",
      items: [
        { label: "Experiences", href: "/admin/experiences", icon: "compass" },
        { label: "Ready to sell?", href: "/admin/go-live", icon: "checklist" },
        { label: "Bookings", href: "/admin/bookings", icon: "inbox" },
        { label: "Contacts", href: "/admin/contacts", icon: "users" },
        { label: "Signature Trips", href: "/admin/applications", icon: "star" },
        { label: "Hotel Rooms", href: "/admin/hotel-rooms", icon: "bed" },
        { label: "Hotels", href: "/admin/hotels", icon: "building" },
        { label: "Packages", href: "/admin/packages", icon: "box" },
        { label: "Components", href: "/admin/components", icon: "puzzle" },
      ],
    },
    {
      label: "MEMBERS",
      items: [
        { label: "Member Management", href: "/admin/members", icon: "person" },
        { label: "Member Activity", href: "/admin/member-activity", icon: "flow" },
        { label: "Progress Skills", href: "/admin/skills", icon: "checklist" },
        { label: "Interest Surveys", href: "/admin/surveys", icon: "checklist" },
        { label: "Trip Invites", href: "/admin/invites", icon: "gift" },
      ],
    },
    {
      label: "WEBSITE",
      items: [
        { label: "File Storage", href: "/admin/images", icon: "image" },
        { label: "Event Content", href: "/admin/content", icon: "layers" },
        // also listed under the Magazine env — trip pages AND the Spotguide use it
        { label: "Destinations", href: "/admin/destinations", icon: "compass" },
        { label: "Guest Reviews", href: "/admin/guest-reviews", icon: "star" },
      ],
    },
    {
      label: "MARKETING",
      items: [
        { label: "Campaigns", href: "/admin/campaigns", icon: "mail" },
        // One entry, not two: "Emails" is the catalogue AND the editor now.
        { label: "Emails", href: "/admin/emails", icon: "flow" },
        { label: "Email Log", href: "/admin/email-log", icon: "mail" },
      ],
    },
    {
      label: "FINANCE",
      items: [
        { label: "Payments", href: "/admin/payments", icon: "receipt" },
        { label: "Gift Vouchers", href: "/admin/vouchers", icon: "gift" },
        { label: "Experience Costs", href: "/admin/exp-costs", icon: "chartline" },
        { label: "Vendors", href: "/admin/vendors", icon: "truck" },
      ],
    },
    {
      label: "TEAM",
      items: [
        { label: "Employees", href: "/admin/team", icon: "person" },
        { label: "Roles", href: "/admin/roles", icon: "shield" },
        { label: "Hours Log", href: "/admin/hours-log", icon: "clock" },
      ],
    },
    {
      label: "ADMINISTRATION",
      items: [
        { label: "Waivers", href: "/admin/waivers", icon: "file" },
        { label: "Documents", href: "/admin/documents", icon: "file" },
        { label: "Company Settings", href: "/admin/settings", icon: "cog" },
      ],
    },
  ],
  magazine: [
    {
      label: "MAGAZINE",
      items: [
        { label: "Magazine", href: "/admin/blog", icon: "pen" },
        { label: "Spotguide", href: "/admin/spotguide", icon: "compass" },
        { label: "Destinations", href: "/admin/destinations", icon: "compass" },
      ],
    },
  ],
  hardware: [
    {
      label: "WEBSITE",
      items: [
        { label: "Product Pages", href: "/admin/product-pages", icon: "pen" },
        { label: "File Storage", href: "/admin/images", icon: "image" },
      ],
    },
    {
      label: "CATALOG",
      items: [
        { label: "Products", href: "/admin/products", icon: "box" },
        { label: "Inventory", href: "/admin/inventory", icon: "layers" },
      ],
    },
    {
      label: "SUPPLY",
      items: [
        { label: "Purchasing", href: "/admin/purchasing", icon: "receipt" },
        { label: "Suppliers", href: "/admin/suppliers", icon: "building" },
      ],
    },
    {
      label: "SELLING",
      items: [
        { label: "Orders", href: "/admin/orders", icon: "truck" },
        { label: "Returns", href: "/admin/returns", icon: "inbox" },
      ],
    },
  ],
  "product-dev": [
    {
      label: "PRODUCT DEV",
      items: [
        // Projects lives one level down, not at /admin/product-dev: the active
        // check below is a prefix match, so the parent path would stay lit while
        // you're inside the library. /admin/product-dev redirects here.
        { label: "Projects", href: "/admin/product-dev/projects", icon: "flow" },
        { label: "Media", href: "/admin/product-dev/library", icon: "image" },
      ],
    },
  ],
  analytics: [
    {
      label: "ANALYTICS",
      items: [
        { label: "Visitor behaviour", href: "/admin/analytics", icon: "chart" },
      ],
    },
  ],
};

/**
 * Can this user open an environment?
 *
 * Real RBAC worlds delegate to the role's world grants. "magazine" is a UI-only
 * grouping (its pages still live in the experience world), so it opens for anyone
 * who can reach at least one page inside it — that keeps roles like
 * "NP7 Experience Media" working without touching any role data.
 */
function canEnterEnv(access: EffectiveAccess, id: Environment): boolean {
  if (id === "magazine") {
    return (navByEnv.magazine ?? []).some((g) => g.items.some((i) => effectiveCanAccess(access, i.href)));
  }
  return effectiveCanEnterWorld(access, id as WorldId);
}

const sharedNavTop: NavGroup = {
  label: "HOME",
  items: [
    { label: "Dashboard", href: "/admin", icon: "grid" },
  ],
};

// Always-last items. Archive sits at the very bottom of the menu; File Storage
// joins it only for envs that don't already list it under WEBSITE (experience does).
const archiveItem: NavItem = { label: "Archive", href: "/admin/archive", icon: "archive" };
const fileStorageItem: NavItem = { label: "File Storage", href: "/admin/images", icon: "image" };

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
  gift: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  ),
  archive: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8" />
      <line x1="10" y1="12" x2="14" y2="12" />
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
  shield: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  chartline: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  file: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  ),
  cog: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
    "--admin-bg": "#0a0b0d",
    "--admin-sidebar": "#0f1115",
    "--admin-border": "rgba(255,255,255,0.08)",
    "--admin-border-strong": "rgba(255,255,255,0.14)",
    "--admin-text": "#f3f4f6",
    "--admin-text-muted": "rgba(255,255,255,0.56)",
    "--admin-text-faint": "rgba(255,255,255,0.34)",
    "--admin-surface": "#14161b",
    "--admin-surface-hover": "#191c22",
    "--admin-active": "rgba(10,163,199,0.14)",
    "--admin-accent": "#0aa3c7",
    "--admin-accent-weak": "rgba(10,163,199,0.14)",
    "--admin-input-bg": "#0d0f13",
    "--admin-input-border": "rgba(255,255,255,0.1)",
    "--admin-shadow": "0 10px 30px rgba(0,0,0,0.45)",
    "--admin-logo-filter": "invert(1)",
  },
  light: {
    "--admin-bg": "#f6f7f9",
    "--admin-sidebar": "#ffffff",
    "--admin-border": "rgba(15,23,42,0.09)",
    "--admin-border-strong": "rgba(15,23,42,0.16)",
    "--admin-text": "#0f172a",
    "--admin-text-muted": "rgba(15,23,42,0.55)",
    "--admin-text-faint": "rgba(15,23,42,0.36)",
    "--admin-surface": "#ffffff",
    "--admin-surface-hover": "#f2f4f7",
    "--admin-active": "rgba(10,163,199,0.10)",
    "--admin-accent": "#0aa3c7",
    "--admin-accent-weak": "rgba(10,163,199,0.10)",
    "--admin-input-bg": "#ffffff",
    "--admin-input-border": "rgba(15,23,42,0.12)",
    "--admin-shadow": "0 10px 30px rgba(15,23,42,0.08)",
    "--admin-logo-filter": "invert(0)",
  },
} as const;

type Theme = keyof typeof themes;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminShell({
  user,
  access = { kind: "tier", level: "owner" },
  roleLabel,
  children,
}: {
  user: User;
  access?: EffectiveAccess;
  roleLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [theme, setTheme] = useState<Theme>("dark");
  // Worlds this member may enter (restricted roles see fewer); default to the first.
  const allowedEnvs = environments.filter((e) => canEnterEnv(access, e.id));
  const [env, setEnv] = useState<Environment>(() => (allowedEnvs[0]?.id ?? "experience") as Environment);
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const envMenuRef = useRef<HTMLDivElement>(null);

  // Close the mobile nav drawer whenever the route changes (a link was tapped).
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  // ⌘K / Ctrl+K opens the command palette from anywhere in the admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("np7-admin-theme") as Theme | null;
    if (savedTheme && themes[savedTheme]) setTheme(savedTheme);
    const savedEnv = localStorage.getItem("np7-admin-env") as Environment | null;
    if (savedEnv && navByEnv[savedEnv] && canEnterEnv(access, savedEnv as Environment)) {
      setEnv(savedEnv);
    }
    try {
      const savedCollapsed = JSON.parse(localStorage.getItem("np7-admin-collapsed") || "[]");
      if (Array.isArray(savedCollapsed)) setCollapsed(new Set(savedCollapsed));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      localStorage.setItem("np7-admin-collapsed", JSON.stringify([...next]));
      return next;
    });
  };

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
    // "/admin" is the FINANCE dashboard — analytics deliberately doesn't carry
    // it, so entering that world lands on its own first page instead.
    router.push(newEnv === "analytics" ? (navByEnv.analytics[0]?.items[0]?.href ?? "/admin/analytics") : "/admin");
  }

  async function handleLogout() {
    // Local scope only: clears THIS session but keeps the account's refresh token
    // valid + cached, so logging into another account lets you switch back
    // (the account-switcher's "Forget all" does a full clear).
    await supabase.auth.signOut({ scope: "local" });
    router.push("/admin/login");
    router.refresh();
  }

  const activeEnvConfig = environments.find((e) => e.id === env)!;
  // The admin accent follows the active world (Experience cyan / Hardware lime),
  // so the back-office is branded like the public site.
  const accent = activeEnvConfig.color;
  const accentVars = {
    "--admin-accent": accent,
    "--admin-accent-contrast": activeEnvConfig.accentContrast,
    "--admin-accent-weak": hexA(accent, 0.16),
    "--admin-active": hexA(accent, theme === "dark" ? 0.18 : 0.1),
    "--admin-gradient": activeEnvConfig.gradient,
  };
  const vars = { ...themes[theme], ...accentVars };
  // Archive always sits last; File Storage joins it except on envs that
  // already list it under WEBSITE (experience + hardware).
  const bottomGroup: NavGroup = {
    label: "GENERAL",
    items: ["experience", "hardware"].includes(env) ? [archiveItem] : [fileStorageItem, archiveItem],
  };
  // Analytics is a pure visitor-behaviour world — the shared HOME → Dashboard is
  // the finance dashboard (open revenue, unmatched payments), so it stays out of
  // this environment entirely. Visitor behaviour is its home.
  const allSections = [...(env === "analytics" ? [] : [sharedNavTop]), ...navByEnv[env], bottomGroup];
  // Hide nav the member's role can't reach (middleware enforces it server-side too).
  const sections = allSections
    .map((g) => ({ ...g, items: g.items.filter((i) => effectiveCanAccess(access, i.href)) }))
    .filter((g) => g.items.length > 0);

  // Every destination the member can reach across ALL worlds they may enter —
  // powers the ⌘K palette. De-duped by href (Dashboard/File Storage repeat per world).
  const paletteItems: PaletteItem[] = (() => {
    const out: PaletteItem[] = [];
    const seen = new Set<string>();
    for (const e of environments) {
      if (!canEnterEnv(access, e.id)) continue;
      const groups: NavGroup[] = [
        sharedNavTop,
        ...navByEnv[e.id],
        { label: "GENERAL", items: ["experience", "hardware"].includes(e.id) ? [archiveItem] : [fileStorageItem, archiveItem] },
      ];
      for (const g of groups) {
        for (const it of g.items) {
          if (seen.has(it.href) || !effectiveCanAccess(access, it.href)) continue;
          seen.add(it.href);
          out.push({ label: it.label, href: it.href, group: g.label, env: e.id, envColor: e.color });
        }
      }
    }
    return out;
  })();

  function handlePaletteNavigate(item: PaletteItem) {
    // If the target lives in another world, switch the sidebar to it so the chrome
    // stays consistent with the page you land on.
    if (item.env !== env && navByEnv[item.env as Environment]) {
      setEnv(item.env as Environment);
      localStorage.setItem("np7-admin-env", item.env);
    }
    router.push(item.href);
  }

  return (
    <div
      className="admin-root min-h-screen lg:flex"
      style={{
        ...Object.fromEntries(Object.entries(vars)),
        backgroundColor: "var(--admin-bg)",
        color: "var(--admin-text)",
      }}
    >
      {/* Desktop gets a gentle zoom so the team doesn't squint; never on mobile,
          where it would overflow the viewport. */}
      <style>{`@media (min-width:1024px){.admin-root{zoom:1.1}}`}</style>

      {/* ── Mobile top app bar ── */}
      <header
        className="lg:hidden sticky top-0 z-40 flex items-center gap-2.5 px-4 h-14"
        style={{ backgroundColor: "var(--admin-sidebar)", borderBottom: "1px solid var(--admin-border)" }}
      >
        <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" className="w-9 h-9 -ml-1.5 grid place-items-center rounded-lg" style={{ color: "var(--admin-text)" }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cdn/assets/logos/np7-logo.png" alt="NP7" className="h-4 w-auto" style={{ filter: "var(--admin-logo-filter)" }} />
        <span className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "var(--admin-text-faint)" }}>ADMIN</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--admin-text-muted)" }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeEnvConfig.color }} />
          {activeEnvConfig.shortLabel}
        </span>
      </header>

      {/* ── Scrim behind the mobile drawer ── */}
      {mobileNavOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileNavOpen(false)} aria-hidden />}

      {/* ── Sidebar — off-canvas drawer on mobile, static on desktop ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 lg:sticky lg:top-0 lg:self-start lg:h-[calc(100svh/1.1)] lg:z-auto lg:w-56 flex flex-col transition-transform duration-200 lg:transition-none ${mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
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
              src="/cdn/assets/logos/np7-logo.png"
              alt="NP7"
              className="h-5 w-auto"
              style={{ filter: "var(--admin-logo-filter)" }}
            />
            <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: "var(--admin-text-faint)" }}>
              ADMIN
            </span>
            <button onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="lg:hidden ml-auto w-8 h-8 -mr-1 grid place-items-center rounded-lg" style={{ color: "var(--admin-text-muted)" }}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
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
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: activeEnvConfig.gradient }}
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
                {environments.filter((e) => canEnterEnv(access, e.id)).map((e) => (
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

          {/* Command palette trigger — jump to any page (⌘K) */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="mt-2.5 w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <span className="text-xs">Search…</span>
            <kbd className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-faint)" }}>⌘K</kbd>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {sections.map((section) => {
            const collapsible = section.items.length > 1;
            const isCollapsed = collapsible && collapsed.has(section.label);
            return (
            <div key={section.label}>
              <button
                onClick={() => collapsible && toggleGroup(section.label)}
                className="w-full flex items-center gap-1.5 px-3 mb-1.5 text-[10px] font-bold tracking-[0.15em] group"
                style={{ color: "var(--admin-text-faint)", cursor: collapsible ? "pointer" : "default" }}
              >
                {collapsible && (
                  <svg className="w-3 h-3 transition-transform" style={{ transform: isCollapsed ? "rotate(-90deg)" : "none", opacity: 0.6 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                )}
                <span>{section.label}</span>
              </button>
              <div className="space-y-0.5" style={{ display: isCollapsed ? "none" : "block" }}>
                {section.items.map((item) => {
                  const active = item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      // Every admin page is server-rendered, and an explicit
                      // `prefetch` (=true) makes the router fetch a FULL render
                      // of each visible nav item — ~12 free server renders per
                      // sidebar paint, repeated on every refresh. The default
                      // sends router state only. Cost, not latency, decides here.
                      prefetch={false}
                      className="admin-navlink relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 will-change-transform"
                      style={{
                        backgroundColor: active ? "var(--admin-active)" : "transparent",
                        color: active ? "var(--admin-text)" : "var(--admin-text-muted)",
                        fontWeight: active ? 500 : 400,
                      }}
                    >
                      {/* Active marker — the world's "sun → sea" gradient sliver */}
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: "var(--admin-gradient)" }} />}
                      {icons[item.icon]}
                      <span className="flex-1">{item.label}</span>
                      {item.wip && (
                        <span
                          className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase"
                          title="Under construction"
                          style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}
                        >
                          WIP
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>

        <div className="p-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          {roleLabel && (
            <div className="mb-2 flex items-center gap-1.5" title="Your access role. Change it under Team › Employees.">
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--admin-text-faint)" }}>Viewing as</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--admin-surface)", color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)" }}>{roleLabel}</span>
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <AccountSwitcher currentEmail={user.email ?? ""} currentUserId={user.id} />
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
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-auto">
        <AdminEnvContext.Provider value={env}>{children}</AdminEnvContext.Provider>
      </main>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          items={paletteItems}
          onNavigate={handlePaletteNavigate}
        />
      )}

      {/* "Add NP7 Admin to your home screen" — only for logged-in team members */}
      <AdminInstallPrompt />
      {/* Track active time so Hours Log can suggest logged hours (no-op pre-migration) */}
      <ActiveTimeHeartbeat />
    </div>
  );
}
