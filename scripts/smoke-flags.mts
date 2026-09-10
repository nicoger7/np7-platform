/**
 * Which flag a place flies.
 *
 * Two things went wrong here and both are checked below. Tenerife was written
 * into the Spain row, so a Canarian trip flew the Spanish flag; and the whole
 * list was code, so correcting that needed a deploy. It is now a bundled list
 * plus an admin-managed one that overrides it, which is only useful if the
 * override actually wins.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-flags.mts
 */
import { existsSync } from "node:fs";
import { BUNDLED_FLAGS, flagFromLocation, flagSrc, type FlagRule } from "@/lib/experience-tile";

let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${note ? "  — " + note : ""}`);
  if (!ok) failed++;
};

/* ── 1. The Canaries are not Spain, on a tile. ────────────────────────────── */
{
  const cases: [string, string | null][] = [
    ["Tenerife, Canary Islands", "ic"],
    ["El Medano, Teneriffa", "ic"],
    ["Fuerteventura, Spain", "ic"],   // the island beats the country
    ["Barcelona, Spain", "es"],
    ["Alacati, Turkey", "tr"],
    ["Bonaire, Caribbean", "bq"],
    ["Avon, Hatteras Island, NC", "us"],
    ["Somewhere nobody has been", null],
    ["", null],
  ];
  for (const [where, code] of cases) {
    const got = flagFromLocation(where);
    check(`"${where || "(nothing)"}" flies ${code ?? "no flag"}`, (got?.code ?? null) === code, got ? got.name : "no match");
  }
}

/* ── 2. An added flag wins, and the most specific added flag wins. ────────── */
{
  const custom: FlagRule[] = [
    { code: "za", name: "South Africa", src: "https://media.np-seven.com/flags/za.png", match: ["south africa", "cape town"] },
    { code: "lgb", name: "Langebaan", src: "https://media.np-seven.com/flags/lgb.png", match: ["langebaan"] },
    { code: "es-tf", name: "Tenerife", src: "https://media.np-seven.com/flags/tenerife.png", match: ["tenerife"] },
  ];
  const za = flagFromLocation("Cape Town, South Africa", custom);
  check("a flag added in the admin answers for a place the code never knew", za?.code === "za", za?.name ?? "no match");
  check("…and brings its own artwork", flagSrc(za!) === "https://media.np-seven.com/flags/za.png");

  // The one that caught the first version of this out. "south africa" is the
  // LONGER keyword, so longest-wins handed a lagoon with its own flag the
  // national one. Locations read narrow to broad, so position is the test.
  const lang = flagFromLocation("Langebaan, South Africa", custom);
  check("the most specific flag wins, and specific means EARLIEST in the location", lang?.code === "lgb", lang?.name ?? "no match");
  check("…broad still wins when nothing narrower is named", flagFromLocation("Somewhere, South Africa", custom)?.code === "za");
  check("…and it is position, not order in the list", flagFromLocation("Cape Town, South Africa", custom)?.code === "za");

  const tf = flagFromLocation("El Medano, Tenerife", custom);
  check("an added flag overrides the bundled list without editing it", tf?.code === "es-tf", tf?.name ?? "no match");
  check(
    "…and with none added, the bundled answer is unchanged",
    flagFromLocation("El Medano, Tenerife")?.code === "ic",
  );
  check("an empty custom list changes nothing", flagFromLocation("Alacati, Turkey", [])?.code === "tr");
  check("a bundled flag still resolves to its file", flagSrc("ic") === "/flags/ic.svg");
}

/* ── 3. Every bundled code has a file behind it. ──────────────────────────── */
{
  // A rule pointing at a flag nobody committed renders as a broken image on a
  // poster, which is the sort of thing you find out from Instagram.
  for (const f of BUNDLED_FLAGS) {
    check(`${f.name} has artwork at ${flagSrc(f.code)}`, existsSync(`public${flagSrc(f.code)}`));
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
