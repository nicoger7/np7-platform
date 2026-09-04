import { NextRequest } from "next/server";
import { duplicateRow } from "@/lib/duplicate";
import { requireAdminGate } from "@/lib/admin-auth";
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  return duplicateRow("vendors", id);
}
