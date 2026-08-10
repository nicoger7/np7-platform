-- ============================================================================
-- 155 — One experience reachable by direct link while the world stays hidden.
--
-- The Experience section is gated whole (SHOW_EXPERIENCE, off in production
-- until launch): every /experience/* URL 404s for anyone who isn't a logged-in
-- team member. But a single event — a clinic sold by a link we hand out — has
-- to work before the rest of the site opens.
--
-- Data, not a hardcoded slug: tick it on the experience and the page answers;
-- untick it and it 404s again. It stays out of the sitemap and off every index
-- either way, because the listing pages are gated by the same flag. So this
-- opens exactly one door, and only for people holding the link.
-- ============================================================================

alter table exp_experiences
  add column if not exists public_by_link boolean not null default false;

comment on column exp_experiences.public_by_link is
  'Reachable at /experience/<slug> by direct link while SHOW_EXPERIENCE is off. Never listed, never in the sitemap. Still requires status=published and website_visible.';
