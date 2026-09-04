import { NextRequest } from "next/server";
import { duplicateRow } from "@/lib/duplicate";
import { requireAdminGate } from "@/lib/admin-auth";
// POST /api/admin/products/:id/duplicate — copy a product
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  return duplicateRow("hw_products", id, { nameField: "name" });
}
