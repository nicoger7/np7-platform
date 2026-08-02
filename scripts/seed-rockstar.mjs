/**
 * Seed the NP7 Rockstar Fin build sheet — the R&D knowledge that currently only
 * exists in a supplier's emails and a JPEG of a layup diagram.
 *
 * Run:  node --env-file=.env.local scripts/seed-rockstar.mjs
 * Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *        (migration 129 must be applied first)
 *
 * Safe to re-run: every write is keyed on a natural key (project slug, material
 * slug, construction code, mold name, the layup's construction+mold pair, ply
 * index, step number) and upserts, so running it twice changes nothing.
 *
 * It finishes by printing the ply table back COLOUR-CODED. Check that against
 * the original diagram before building anything on top of it: the per-ply
 * MATERIAL is the one field transcribed by eye from the drawing's colours —
 * the template refs and lengths are exact, the colours are a human reading.
 */
import { createClient } from "@supabase/supabase-js";

const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Missing env:", missing.join(", ")); process.exit(1); }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const die = (label, error) => { if (error) { console.error(`✗ ${label}:`, error.message); process.exit(1); } };

/** Find-or-create keyed on a natural key, then patch the rest. */
async function upsert(table, match, row) {
  let q = db.from(table).select("*");
  for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v);
  const { data: found, error: findErr } = await q.maybeSingle();
  die(`find ${table}`, findErr);
  if (found) {
    const { data, error } = await db.from(table).update({ ...row, updated_at: new Date().toISOString() }).eq("id", found.id).select().single();
    die(`update ${table}`, error);
    return data;
  }
  const { data, error } = await db.from(table).insert({ ...match, ...row }).select().single();
  die(`insert ${table}`, error);
  return data;
}

// ─── Sources ─────────────────────────────────────────────────────────────────
// Bodies are the supplier's own words. Anything extracted below cites one of
// these, and when a structured field and the body disagree, the body wins.

const SOURCES = [
  {
    external_ref: "rockstar/phil-intro",
    title: "Phil → Ralph: CNC prepreg cutting + heated press? Mold set, procedure, commissioning",
    confidence: "supplier_claim",
    body: "Do you have CNC equipment suitable for cutting prepreg materials? Do you have a heated hydraulic press? If so, we will supply the complete set of molds together with a detailed step-by-step manufacturing procedure. I can also assist you with setting up and commissioning the complete production process, including the supply of CNC cutting equipment and/or a heated press, if required. We look forward to receiving your quotation for the high-end carbon version.",
  },
  {
    external_ref: "rockstar/phil-process",
    title: "Phil → Ralph: constructions, molds, layup 357, press parameters",
    confidence: "varies_by_supplier",
    body: [
      "We currently produce three versions: 1. 100% fiberglass  2. Fiberglass/carbon hybrid, with a very high proportion of fiberglass  3. Carbon version, with a very high proportion of carbon.",
      "We use three molds with different specific thicknesses: 8.3 mm, 8.6 mm, 9.1 mm. The carbon version is manufactured using the thinner molds, namely the 8.3 mm and 8.6 mm molds. The fiberglass and fiberglass/carbon versions are manufactured exclusively using the thickest mold, namely the 9.1 mm mold. Each mold is associated with a specific layup.",
      "For the purpose of preparing the quotation, we will use a 38 cm carbon fin with an 8.6 mm thickness as the reference product.",
      "The 8.6 mm layup uses four prepreg material references, with an epoxy resin content of approximately 40–45%: 350 g/m² plain-weave fiberglass; 200 g/m² plain-weave carbon fiber; 200 g/m² unidirectional carbon fiber; 200 g/m² biaxial carbon fiber.",
      "All layers are cut on our CNC cutting tables using either a drag knife or an oscillating knife. We use 25 mm-thick aluminum molds fitted with alignment pins.",
      "This first stage produces the fin blade, which is then cut to the size specified in the customer's order. The blade is cured in a heated press under a pressure of approximately 8 to 10 metric tons, at a temperature of 120–130°C, for approximately 1 hour and 30 minutes. These parameters may vary depending on the recommendations of your own prepreg supplier.",
      "The second stage consists of molding the Tuttle base after the blade has been trimmed and deburred. Particular care must be taken to maintain the specified rake and fore-and-aft position of the blade. The Tuttle base mold will be supplied. This stage is carried out using liquid resin and dry reinforcement fabrics that have been cut beforehand.",
    ].join("\n\n"),
  },
  {
    external_ref: "rockstar/phil-tuttle",
    title: "Phil → Ralph: Tuttle head molding, step by step (+7 photos)",
    confidence: "supplier_claim",
    body: [
      "Here is the detail to mold the tuttle head. See the pics in attached.",
      "1- prepare the mold to revive the blade",
      "2- cut the blade than asy just on the mold",
      "3- protect the blade with tape to avoid extra resin",
      "4- cut a layer of carbon200g + fiberglass 2x600g",
      "5- Place the « tacos » in the mold then add forged carbon mixed into an epoxy resin",
      "6- out the blade inside the mixture then wait 6h at 30deg.",
      "7- unmold the fin then clean the jonction",
    ].join("\n"),
  },
];

// ─── The 18 plies of layup 357 ───────────────────────────────────────────────
// [ply_index, template_ref, length_cm, material slug, stack]
//
// Read straight off "NP7 8.6 CARBON LAYUP 357". Two things a summary would
// destroy and which are therefore load-bearing here:
//   * template '7' repeats on plies 5 and 6 at DIFFERENT lengths, and '9' spans
//     plies 8–11 across 32/30/36/33 — it is a cut-template id, not a quantity.
//   * ply 10 jumps back UP to 36 cm after ply 9's 30 cm. That is the second
//     stack starting, which is why `stack` is a column and not an inference.
//     ⚠ The a/b split is inferred from that reset — confirm it with Phil.
const PLIES = [
  [1,  "1",  37,   "carbon-plain-200", "a"],
  [2,  "3",  37,   "carbon-plain-200", "a"],
  [3,  "5",  36.8, "glass-plain-350",  "a"],
  [4,  "4",  36.9, "carbon-biax-200",  "a"],
  [5,  "7",  36,   "carbon-ud-200",    "a"],
  [6,  "7",  35,   "carbon-ud-200",    "a"],
  [7,  "8",  33,   "carbon-biax-200",  "a"],
  [8,  "9",  32,   "carbon-ud-200",    "a"],
  [9,  "9",  30,   "carbon-ud-200",    "a"],
  [10, "9",  36,   "glass-plain-350",  "b"],
  [11, "9",  33,   "glass-plain-350",  "b"],
  [12, "12", 29,   "glass-plain-350",  "b"],
  [13, "12", 25,   "glass-plain-350",  "b"],
  [14, "12", 22,   "carbon-ud-200",    "b"],
  [15, "12", 21,   "glass-plain-350",  "b"],
  [16, "13", 16,   "glass-plain-350",  "b"],
  [17, "14", 12,   "glass-plain-350",  "b"],
  [18, "14", 9,    "glass-plain-350",  "b"],
];

async function main() {
  // Project
  const project = await upsert("pd_projects", { slug: "rockstar-fin" }, {
    name: "NP7 Rockstar Fin",
    kind: "fin",
    status: "tooling",
    summary: "Windsurf slalom/freerace fin with a Tuttle box base. Three constructions across three blade molds; the blade is pressed long and trimmed to the ordered size.",
  });
  console.log(`✓ project ${project.name}`);

  // Sources
  const sourceByRef = {};
  for (const s of SOURCES) {
    const row = await upsert("pd_sources", { project_id: project.id, external_ref: s.external_ref }, {
      kind: "email", title: s.title, author_name: "Phil", recipient: "Ralph",
      confidence: s.confidence, body: s.body,
    });
    sourceByRef[s.external_ref] = row.id;
  }
  console.log(`✓ ${SOURCES.length} sources`);

  // Constructions — Rockstar is the carbon fin. Glass and hybrid run only on the
  // 9.1 mold, which is a different model (seeded separately at the end).
  const constructions = {};
  for (const [i, c] of [
    ["carbon", "Carbon", "Very high proportion of carbon (no percentage was ever quoted)."],
  ].entries()) {
    const [code, name, description] = c;
    const row = await upsert("pd_constructions", { project_id: project.id, code }, {
      name, description, sort_order: i + 1, source_id: sourceByRef["rockstar/phil-process"],
    });
    constructions[code] = row.id;
  }
  console.log("✓ 1 construction (carbon)");

  // Molds — the two thin blade molds plus the supplied Tuttle base mold.
  const molds = {};
  for (const [name, dim] of [["8.3", 8.3], ["8.6", 8.6]]) {
    const row = await upsert("pd_molds", { project_id: project.id, name }, {
      kind: "blade", key_dimension_mm: dim,
      key_dimension_label: "profile thickness at thickest point",
      plate_material: "aluminium", plate_thickness_mm: 25, has_alignment_pins: true,
      status: "in_use", source_id: sourceByRef["rockstar/phil-process"],
    });
    molds[name] = row.id;
  }
  const tuttle = await upsert("pd_molds", { project_id: project.id, name: "Tuttle base" }, {
    kind: "base", key_dimension_mm: null, key_dimension_label: "n/a",
    plate_material: "aluminium", status: "planned",
    notes: "Supplied by the partner. Stage-2 wet layup: liquid resin + pre-cut dry fabrics.",
    source_id: sourceByRef["rockstar/phil-tuttle"],
  });
  molds["tuttle"] = tuttle.id;
  console.log("✓ 3 molds (8.3, 8.6, Tuttle base)");

  // Materials were seeded by migration 129 — look up their ids by slug.
  const { data: materialRows, error: matErr } = await db.from("pd_materials").select("id,slug,name,diagram_color");
  die("read pd_materials", matErr);
  const materials = Object.fromEntries(materialRows.map((m) => [m.slug, m]));
  if (!materials["carbon-ud-200"]) { console.error("✗ pd_materials is empty — apply migration 129 first."); process.exit(1); }

  // Build sheets. TWO rows: the Rockstar is the CARBON fin, and carbon runs on
  // the two thinner molds only.
  //
  // Phil's email lists three constructions across three molds, but he was
  // describing his whole production line, not this model — the 9.1 mold, and
  // the fiberglass and hybrid constructions that run exclusively on it, belong
  // to a DIFFERENT NP7 model. They are seeded as their own project below rather
  // than being deleted, because the knowledge is real; it just isn't Rockstar.
  const MATRIX = [
    { construction: "carbon", mold: "8.3", name: "NP7 8.3 CARBON LAYUP", ref: null, reference: false },
    { construction: "carbon", mold: "8.6", name: "NP7 8.6 CARBON LAYUP 357", ref: "357", reference: true },
  ];
  const layups = {};
  for (const m of MATRIX) {
    const row = await upsert("pd_layups",
      { project_id: project.id, construction_id: constructions[m.construction], mold_id: molds[m.mold] },
      {
        name: m.name, ref: m.ref, revision: 1, is_reference: m.reference,
        resin_pct_min: 40, resin_pct_max: 45,
        geometry: m.reference ? { rake_deg: 6, back_end_mm: 27, blade_length_cm: 38 } : {},
        source_id: sourceByRef["rockstar/phil-process"],
      });
    layups[`${m.construction}/${m.mold}`] = row.id;
  }
  console.log(`✓ ${MATRIX.length} build sheets (carbon × both thin molds)`);

  // The 18 plies of 357.
  const layup357 = layups["carbon/8.6"];
  for (const [idx, templateRef, lengthCm, slug, stack] of PLIES) {
    if (!materials[slug]) { console.error(`✗ unknown material slug: ${slug}`); process.exit(1); }
    await upsert("pd_layup_plies", { layup_id: layup357, ply_index: idx }, {
      material_id: materials[slug].id, template_ref: templateRef, length_cm: lengthCm, stack,
    });
  }
  console.log(`✓ ${PLIES.length} plies on layup 357`);

  // Process stages.
  const stage1 = await upsert("pd_processes", { project_id: project.id, stage_order: 1 }, {
    name: "Blade — prepreg press", method: "prepreg_press",
    summary: "Cut, lay up and press the blade long; it is trimmed to the ordered size afterwards.",
    source_id: sourceByRef["rockstar/phil-process"],
  });
  const stage2 = await upsert("pd_processes", { project_id: project.id, stage_order: 2 }, {
    name: "Tuttle head — wet layup", method: "wet_layup",
    summary: "Mold the Tuttle base onto the trimmed, deburred blade using liquid resin and pre-cut dry fabrics.",
    source_id: sourceByRef["rockstar/phil-tuttle"],
  });

  const STAGE1_STEPS = [
    { title: "Cut all plies on the CNC table", equipment: "CNC cutting table — drag or oscillating knife" },
    { title: "Lay up into the 25 mm aluminium mold on the alignment pins" },
    {
      title: "Heated press cure",
      equipment: "heated hydraulic press",
      pressure_t_min: 8, pressure_t_max: 10, temp_c_min: 120, temp_c_max: 130, duration_min: 90,
      body: "Approximately 8 to 10 metric tons, 120–130 °C, approximately 1 h 30. These parameters may vary depending on the recommendations of your own prepreg supplier.",
    },
    {
      title: "Trim the blade to the ordered length, deburr",
      body: "One pressed blade feeds many fin sizes — the 38 cm reference is a quoting basket, not a constraint.",
    },
  ];

  const STAGE2_STEPS = [
    { title: "Prepare the mold to receive the blade", body: "prepare the mold to revive the blade" },
    {
      title: "Cut the blade, then assemble on the mold",
      body: "cut the blade than asy just on the mold",
      critical: true, tolerance_target: 6, tolerance_unit: "deg",
      tolerance_note: "Maintain the specified rake (6°) AND the fore-and-aft position of the blade.",
    },
    { title: "Tape the blade to stop resin creep", body: "protect the blade with tape to avoid extra resin" },
    {
      title: "Cut the base reinforcement",
      body: "cut a layer of carbon200g + fiberglass 2x600g",
      materials: [
        { material_id: materials["carbon-plain-200-dry"].id, qty_note: "1 layer" },
        { material_id: materials["glass-600-dry"].id, qty_note: "2 × 600 g" },
      ],
    },
    {
      title: "Place the «tacos» and pack with forged carbon in epoxy",
      body: "Place the « tacos » in the mold then add forged carbon mixed into an epoxy resin",
      materials: [
        { material_id: materials["forged-carbon"].id, qty_note: "mixed into epoxy" },
        { material_id: materials["epoxy-wet"].id },
      ],
    },
    {
      title: "Insert the blade and cure",
      body: "out the blade inside the mixture then wait 6h at 30deg.",
      temp_c_min: 30, temp_c_max: 30, duration_min: 360,
    },
    { title: "Unmold and clean the junction", body: "unmold the fin then clean the jonction" },
  ];

  for (const [processId, steps, sourceRef] of [
    [stage1.id, STAGE1_STEPS, "rockstar/phil-process"],
    [stage2.id, STAGE2_STEPS, "rockstar/phil-tuttle"],
  ]) {
    for (const [i, s] of steps.entries()) {
      await upsert("pd_process_steps", { process_id: processId, step_no: i + 1 }, {
        ...s, materials: s.materials ?? [], source_id: sourceByRef[sourceRef],
      });
    }
  }
  console.log(`✓ 2 process stages, ${STAGE1_STEPS.length + STAGE2_STEPS.length} steps`);

  // ── The 9.1 model ───────────────────────────────────────────────────────────
  // Phil's fiberglass and hybrid constructions run exclusively on the 9.1 mold,
  // and that is a different NP7 model. Seeded as its own project so the tooling
  // and construction knowledge survives, with the name left explicitly TBC —
  // inventing a product name would be worse than leaving it obviously unfilled.
  const thick = await upsert("pd_projects", { slug: "np7-fin-9-1" }, {
    name: "NP7 fin — 9.1 mold (model name TBC)",
    kind: "fin",
    status: "concept",
    summary: "The fiberglass and fiberglass/carbon constructions from Phil's line, which run exclusively on the 9.1 mm mold. Split out of the Rockstar project: Rockstar is the carbon fin on the 8.3 and 8.6 molds.",
  });
  const thickSources = {};
  // Cobra is a second manufacturer being briefed on this model — a different
  // conversation from Phil's, so it is its own source rather than an edit to his.
  const cobra = await upsert("pd_sources", { project_id: thick.id, external_ref: "rockstar/cobra-brief" }, {
    kind: "email", title: "Nico → Cobra (Thomas): thick-mold model brief, layups 931 + 921, TT and DTT boxes",
    author_name: "Nico", recipient: "Thomas / Team Cobra", confidence: "quoted",
    body: [
      "Can you advise us on the timeline and process? Looking forward to receive quotes, both on production and sampling.",
      "@Team Cobra, nice to meet you. Feel free to suggest production process improvements, where they make sense (e.g. wet vs prepreg etc.). We will always consider good suggestions.",
      "For artwork or designs - do you have templates that are easy for you to work with?",
      "Sorry for adding another CC. - it's Christian, who's partnering with us for the NP7 project. Want to keep him a bit in the loop. We have an NDA between us for this project already.",
    ].join("\n\n"),
    notes: "Attachments: GLASS LAYUP 931 and GLASS/CARB LAYUP 921 diagrams, plus 37 NP7 TT BOX (27 mm, 84°) and 44 NP7 DTT BOX (20 mm, 86°) drawings. Christian is under NDA on this project.",
  });
  thickSources["rockstar/cobra-brief"] = cobra.id;
  for (const s of SOURCES) {
    const row = await upsert("pd_sources", { project_id: thick.id, external_ref: s.external_ref }, {
      kind: "email", title: s.title, author_name: "Phil", recipient: "Ralph",
      confidence: s.confidence, body: s.body,
    });
    thickSources[s.external_ref] = row.id;
  }
  const thickConstructions = {};
  for (const [i, c] of [
    ["glass", "100% fiberglass", null],
    ["glass_carbon", "Fiberglass/carbon hybrid", "Very high proportion of fiberglass (no percentage was ever quoted)."],
  ].entries()) {
    const [code, name, description] = c;
    const row = await upsert("pd_constructions", { project_id: thick.id, code }, {
      name, description, sort_order: i + 1, source_id: thickSources["rockstar/phil-process"],
    });
    thickConstructions[code] = row.id;
  }
  const mold91 = await upsert("pd_molds", { project_id: thick.id, name: "9.1" }, {
    kind: "blade", key_dimension_mm: 9.1,
    key_dimension_label: "profile thickness at thickest point",
    plate_material: "aluminium", plate_thickness_mm: 25, has_alignment_pins: true,
    status: "in_use", source_id: thickSources["rockstar/phil-process"],
  });
  // GLASS 770 only appears on the thick model's sheets, so it joins the catalog
  // here rather than in migration 129's seed.
  const glass770 = await upsert("pd_materials", { slug: "glass-770" }, {
    name: "770 g/m² fiberglass", fibre: "glass", form: "prepreg", weave: "plain", gsm: 770,
    default_orientation: "0/90", diagram_color: "#F7941E", notes: "Diagram colour: orange",
  });
  materials["glass-770"] = glass770;

  // The two thick-mold stacks. Same 14 lengths — 921 is 931 with the first two
  // glass plies swapped for ±45° carbon, which is exactly what "hybrid" means
  // here and is visible at a glance once the sheets sit side by side.
  const THICK_LENGTHS = [37, 37, 36.8, 36.9, 35.5, 33, 36, 32, 26, 25, 21, 17, 12, 7];
  // Stack b starts at ply 7 — 33 cm then back up to 36, the same reset the 8.6 has.
  const thickStack = (i) => (i < 6 ? "a" : "b");
  const GLASS_931 = THICK_LENGTHS.map((len, i) => [i + 1, len, i === 5 || i === 8 ? "glass-770" : "glass-plain-350", thickStack(i)]);
  const HYBRID_921 = GLASS_931.map(([n, len, slug, st]) => [n, len, n <= 2 ? "carbon-plain-200" : slug, st]);

  const thickSheets = [
    { code: "glass", name: "NP7 GLASS LAYUP 931", ref: "931", plies: GLASS_931 },
    { code: "glass_carbon", name: "NP7 GLASS/CARB LAYUP 921", ref: "921", plies: HYBRID_921 },
  ];
  for (const s of thickSheets) {
    const row = await upsert("pd_layups",
      { project_id: thick.id, construction_id: thickConstructions[s.code], mold_id: mold91.id },
      {
        name: s.name, ref: s.ref, revision: 1, resin_pct_min: 40, resin_pct_max: 45,
        // Rake and back end are recorded per SIZE, not here — the 37 TT and the
        // 44 DTT run 84°/27 mm and 86°/20 mm off the same stack. See the note
        // printed at the end of this script.
        geometry: {},
        source_id: thickSources["rockstar/cobra-brief"],
      });
    for (const [idx, len, slug, st] of s.plies) {
      await upsert("pd_layup_plies", { layup_id: row.id, ply_index: idx }, {
        material_id: materials[slug].id, length_cm: len, stack: st,
      });
    }
  }
  console.log(`✓ 9.1 model: 2 constructions, 1 mold, 2 build sheets, ${GLASS_931.length * 2} plies`);

  // Sizes — the Cobra drawings. Rake stored as rake; the drawings state the
  // trailing-edge angle (90° − rake), kept verbatim in notes.
  for (const [i, s] of [
    { label: "37 NP7 TT BOX", length_cm: 37, box: "TT", rake_deg: 6, back_end_mm: 27, notes: "Drawing states 84°." },
    { label: "44 NP7 DTT BOX", length_cm: 44, box: "DTT", rake_deg: 4, back_end_mm: 20, notes: "Drawing states 86°." },
  ].entries()) {
    await upsert("pd_project_sizes", { project_id: thick.id, label: s.label }, {
      ...s, sort_order: i + 1, source_id: thickSources["rockstar/cobra-brief"],
    });
  }
  console.log("✓ 2 sizes on the 9.1 model (37 TT, 44 DTT)");

  // ── The transcription checksum ──────────────────────────────────────────────
  // Print the ply table back in the diagram's own colours. Hold this next to the
  // original drawing: the lengths and template refs came from text and are
  // exact, but the MATERIAL of each ply was read off a colour by eye.
  console.log("\n  NP7 8.6 CARBON LAYUP 357 — check this against the original diagram");
  console.log("  (the material column is the one transcribed by eye)\n");

  const hex = (h) => {
    const n = parseInt((h || "#888888").slice(1), 16);
    return `\x1b[48;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m  \x1b[0m`;
  };
  const longest = Math.max(...PLIES.map((p) => p[2]));
  let prevStack = null;
  for (const [idx, templateRef, lengthCm, slug, stack] of PLIES) {
    if (prevStack !== null && stack !== prevStack) {
      console.log(`     ${"─".repeat(58)}  ← stack ${prevStack} ends, ${stack} begins`);
    }
    prevStack = stack;
    const bar = "█".repeat(Math.max(1, Math.round((lengthCm / longest) * 28)));
    console.log(
      `  ${String(idx).padStart(2)} ${hex(materials[slug].diagram_color)} ` +
      `${bar.padEnd(28)} ${String(lengthCm).padStart(5)} cm  tpl ${String(templateRef).padEnd(3)} ${materials[slug].name}`
    );
  }
  console.log("\n  Note ply 9 → 10: 30 cm then back up to 36 cm. That reset is the second stack,");
  console.log("  not a typo. If Phil says the a/b split is wrong, fix `stack` before anything");
  console.log("  else is built on it.\n");

  console.log("  ⚠ MODELLING GAP, not seeded: rake and back end are per SIZE, not per layup.");
  console.log("    37 NP7 TT BOX  → 27 mm back end, 84° (rake 6°)");
  console.log("    44 NP7 DTT BOX → 20 mm back end, 86° (rake 4°)");
  console.log("    Both come off the same stack, so pd_layups.geometry can't hold them. They");
  console.log("    need a sizes table (length, box type, rake, back end) hanging off the");
  console.log("    project — left out rather than flattened into the wrong row.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
