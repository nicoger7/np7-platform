-- Migration 067: Cloudflare R2 CDN base URL per company
-- ─────────────────────────────────────────────────────────────────────────
-- Stores the public CDN base URL of the Cloudflare R2 bucket (e.g.
-- https://media.np-seven.com). All new media uploads use this URL when set;
-- leave blank to fall back to Supabase Storage. Additive + idempotent.

alter table company_settings
  add column if not exists media_cdn_url text;

comment on column company_settings.media_cdn_url is
  'Base URL of the Cloudflare R2 bucket CDN (e.g. https://media.np-seven.com). Used for all new media uploads. Leave blank to fall back to Supabase Storage.';
