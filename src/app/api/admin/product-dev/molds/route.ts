import { NextRequest } from "next/server";
import { PD_ENTITIES, pdList, pdCreate } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
const CFG = PD_ENTITIES.molds;

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return pdList(CFG, request);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return pdCreate(CFG, request);
}
