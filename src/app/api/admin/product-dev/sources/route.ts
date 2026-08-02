import { NextRequest } from "next/server";
import { PD_ENTITIES, pdList, pdCreate } from "@/lib/product-dev-api";

const CFG = PD_ENTITIES.sources;

export async function GET(request: NextRequest) {
  return pdList(CFG, request);
}

export async function POST(request: NextRequest) {
  return pdCreate(CFG, request);
}
