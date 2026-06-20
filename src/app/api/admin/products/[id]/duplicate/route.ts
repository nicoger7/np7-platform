import { NextRequest } from "next/server";
import { duplicateRow } from "@/lib/duplicate";

// POST /api/admin/products/:id/duplicate — copy a product
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return duplicateRow("hw_products", id, { nameField: "name" });
}
