import { NextRequest } from "next/server";
import { PD_ENTITIES, pdList, pdCreate } from "@/lib/product-dev-api";

const CFG = PD_ENTITIES.layups;

export async function GET(request: NextRequest) {
  return pdList(CFG, request);
}

// POST — the unique (project_id, mold_id, construction_id) constraint is what
// makes the mold↔construction matrix real, so a duplicate here surfaces as a
// Postgres 23505 and is meant to: that pair already has a build sheet.
export async function POST(request: NextRequest) {
  return pdCreate(CFG, request);
}
