@AGENTS.md

# NP7 Platform — Project Context

## What this is
The NP7 digital platform for Nico Prien (GER-7). One Next.js codebase serving:
- **np-seven.com** — Landing/gateway page (currently a placeholder, live)
- **experience.np-seven.com** — NP7 Experience (windsurfing travel trips) — future
- **hardware.np-seven.com** — NP7 Hardware (windsurf fins, boards) — future
- **admin.np-seven.com** — Custom admin panel for the team — future

NP7 Experience and NP7 Hardware are **two separate companies** under the NP7 brand. Data and code are cleanly separated so either entity can be sold independently.

## Architecture decisions
- **No Shopify** — product catalog is small, sales are inquiry-based (customer contacts Nico, pays via bank transfer). Zero transaction fees.
- **No Stripe** — no online payments for now. Can be added later.
- **No Sanity CMS** — we build our own admin panel instead. One system for everything.
- **Notion stays as CRM for now** — the existing customer pipeline in Notion keeps running. Website inquiry forms feed into it. Migration to custom admin happens later.

## Tech stack
- **Framework**: Next.js (App Router) with TypeScript and Tailwind CSS
- **Database**: Supabase (PostgreSQL) — project `np7-platform` in Frankfurt region
- **File storage**: Supabase Storage — bucket `assets` (public), folders: `logos/`, `photos/`
- **Hosting**: Vercel — auto-deploys from GitHub on push to `main`
- **Domain**: np-seven.com (DNS managed in Squarespace, pointed to Vercel)
- **Repo**: github.com/nicoger7/np7-platform (private)

## Branch strategy
- `main` — production (what's live on np-seven.com). Currently just the placeholder page.
- `dev` — development branch with the full site (experience pages, hardware pages, database integration). All ongoing work happens here. Merge to main when ready to go live.

## Supabase details
- **URL**: https://qfdqigumjadvrocxjolx.supabase.co
- **Keys**: stored in `.env.local` (gitignored). Contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- **Also set as environment variables in Vercel** (Settings → Environment Variables)
- **Database tables**: `exp_experiences`, `exp_contacts`, `exp_inquiries`, `exp_blog_posts`, `exp_pages`, `hw_products`, `hw_variants`, `hw_inquiries`, `hw_contacts`, `team_members`
- **Storage bucket**: `assets` (public). Structure:
  ```
  assets/
  ├── logos/
  │   ├── np7-logo.png              (bold NP7 logo, black on transparent — use CSS `invert` for white)
  │   ├── np7-experience-logo.png   (colorful yellow/blue NP7 Experience logo)
  │   └── np7-rockstar-logo-white.png (Rockstar fin logo, white on transparent)
  └── photos/
      ├── hero-bg.jpg               (Nico windsurfing action shot — landing page background)
      └── nico-profile.png          (Nico portrait, cropped square)
  ```

## Current Notion pipeline (NP7 Experience)
The customer booking pipeline lives in Notion with these stages:
Lead → Interested → Enquiring → Contact by phone → Ready to Book → Payment Pending → Downpayment Paid → Create Invoice → Paid → Confirmed → Attended → (or Lost)

Fields per booking: name, agreed price, fly in/out dates, traveling with, downpayment/final invoice sent/received (checkboxes), outstanding amount (formula), WA group, notes.

Current experiences: Turkey (Alacati), Bonaire Week I/II/III, Madagascar, Lake Garda.

## Design direction
Inspired by reedin.com: minimalist, lots of whitespace, monochrome base (black/white/grey), accent color `#0aa3c7` (ocean teal). Premium, clean, not busy. Let photos be the color.

## Important rules for working with Nicolas
- **Nicolas is a coding beginner** — explain everything simply
- **Don't search his Mac for images** — he will tell you which files to use
- **All images go to Supabase Storage** — not local files in the project
- **Keep storage tidy** — clean folder names, check image content before uploading, crop excess padding from PNGs
- **Ask before assuming** — don't guess product names, availability statuses, or business details

## File structure
```
src/
├── app/
│   ├── page.tsx          ← Landing/placeholder page (main branch)
│   ├── layout.tsx        ← Root layout with Inter font
│   ├── globals.css       ← Tailwind + design tokens
│   ├── experience/       ← Experience site pages (dev branch)
│   ├── hardware/         ← Hardware site pages (dev branch)
│   └── admin/            ← Admin panel (dev branch, future)
├── components/           ← Shared UI components (future)
└── lib/
    └── supabase.ts       ← Supabase client (dev branch)
supabase/
└── setup.sql             ← Database schema + seed data
```

## Phased roadmap
1. ✅ Project setup, GitHub, Vercel, Supabase
2. ✅ Placeholder landing page (live on np-seven.com)
3. 🔲 Experience site with database-driven content (on dev branch, partially built)
4. 🔲 Admin panel for content management
5. 🔲 Booking inquiry flow (form → Notion)
6. 🔲 Hardware site with product catalog
7. 🔲 Admin — hardware management
8. 🔲 CRM / pipeline in admin (migrate from Notion)
9. 🔲 Online payments via Stripe (if/when needed)
