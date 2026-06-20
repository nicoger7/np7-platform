-- Demo magazine post — Fuerteventura Spotguide
-- Recreated from the old site (nicoprien.com/.../fuerteventura-spotguide-windsurf);
-- images re-hosted in Supabase storage at assets/blog/fuerteventura-windsurf-spot-guide/.
--
-- Self-contained, idempotent, one paste into the Supabase SQL editor:
--   1) ensures the magazine columns exist (same as migrations 015 + 016 — safe to
--      re-run; the canonical schema still lives in those migration files),
--   2) inserts/updates the demo post (on conflict slug do update).
-- Dollar-quoted bodies ($md$ / $json$) so apostrophes need no escaping.

-- 1) columns (idempotent) ---------------------------------------------------
alter table exp_blog_posts add column if not exists excerpt       text;
alter table exp_blog_posts add column if not exists category      text;
alter table exp_blog_posts add column if not exists author        text not null default 'Nico Prien';
alter table exp_blog_posts add column if not exists template      text not null default 'standard';
alter table exp_blog_posts add column if not exists template_data jsonb not null default '{}'::jsonb;
alter table exp_blog_posts add column if not exists world         text not null default 'experience';
alter table exp_blog_posts add column if not exists members_only  boolean not null default true;

-- 2) the post ---------------------------------------------------------------
insert into exp_blog_posts
  (title, slug, status, published_at, author, category, world, template, members_only, cover_image, excerpt, content, template_data)
values (
  'Windsurfing Spot Guide to Fuerteventura',
  'fuerteventura-windsurf-spot-guide',
  'published',
  '2023-08-18T08:00:00Z',
  'Nico Prien',
  'Spotguide',
  'experience',
  'spotguide',
  false, -- public so the full theme is visible; set true to demo the signup gate
  'https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/blog/fuerteventura-windsurf-spot-guide/cover.png',
  $ex$Warm water, wind almost every day, and a coastline with everything from flat-water lagoons to open-ocean waves — here's why Fuerteventura is Europe's ultimate windsurfing playground.$ex$,
  $md$The Canary Islands sit in the Atlantic just off the coast of Africa, right in the path of some of the most reliable trade winds on the planet. For windsurfers, Fuerteventura is the pick of the bunch — warm water, wind almost every day in season, and a coastline with something for every level, from flat-water lagoons to open-ocean wave spots.

![Sandy tracks lead out to the wild spots in the north](https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/blog/fuerteventura-windsurf-spot-guide/el-cotillo-access.png)

## The spots

### North West — the wave playground
Punta Blanca, Majanicho and Mejillones are names every wave sailor knows. Rocky launches and powerful open-ocean swell make this the island's advanced-and-up zone — bring your wave gear and your wits.

![Open-ocean wave riding on the north-west coast](https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/blog/fuerteventura-windsurf-spot-guide/north-west-waves.png)

### North East — Flag Beach & Corralejo
Flag Beach serves up side-onshore wind with reef protection, a friendly playground shared by windsurfers and surfers, while Glass Beach lights up in offshore conditions. Up the road in Corralejo, Waikiki is a sheltered freeride and slalom spot that's perfect for intermediates.

### Sotavento — the lagoon
The jewel of the south. Sotavento's huge tidal lagoon gives beginners and freestylers flat, shallow water, while the open sea outside delivers constant wind for planing and foiling. It's home to the René Egli center and the PWA World Cup.

![Planing across the Sotavento lagoon](https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/blog/fuerteventura-windsurf-spot-guide/sotavento-lagoon.png)

### Risco del Paso & Playa Jandía
South of Sotavento runs a kilometre of sandy shore and turquoise water — Risco del Paso has a rental center and a beach bar, mixing lagoon and waves. Further south, Esquinzo in Playa Jandía is quieter and gustier (the mountains stir the wind), with family-friendly club hotels.$md$,
  $json${
    "spotName": "Fuerteventura",
    "region": "Canary Islands, Spain",
    "bestSeason": "Year-round · peak May–Sep",
    "windDirection": "NE trade winds",
    "waterType": "Mixed",
    "level": "All levels",
    "conditions": "Fuerteventura runs on Atlantic trade winds that build through spring and blow most days through summer — the classic Canarian thermal. Expect side-shore to side-onshore directions at the main beaches, flat water inside the lagoons and real swell on the exposed northern coast. Warm air, warm-ish water and sunshine almost guaranteed.",
    "gettingThere": "Fuerteventura is well connected to most European airports, with return flights typically €200–500 and many carriers taking board bags. There's also a ferry from mainland Spain. Once you're on the island, rent a car (from around €10/day) — the best spots are spread along the coast, and wheels open up everything beyond the resorts.",
    "whereToStay": [
      "Meliá Gorriones — right on Sotavento beach, steps from the lagoon",
      "Innside by Meliá — a higher-end option with a sheltered terrace",
      "Costa Calma to Jandía — apartments, Airbnbs and 5-star hotels",
      "sun+fun — bundled lesson, gear and hotel packages for the area"
    ],
    "ctaUrl": "/experience#experiences",
    "ctaLabel": "See our trips"
  }$json$::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  status = excluded.status,
  published_at = excluded.published_at,
  author = excluded.author,
  category = excluded.category,
  world = excluded.world,
  template = excluded.template,
  members_only = excluded.members_only,
  cover_image = excluded.cover_image,
  excerpt = excluded.excerpt,
  content = excluded.content,
  template_data = excluded.template_data,
  updated_at = now();
