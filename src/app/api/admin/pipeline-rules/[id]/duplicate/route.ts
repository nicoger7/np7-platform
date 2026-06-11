import { NextRequest } from "next/server";
import { duplicateRow } from "@/lib/duplicate";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return duplicateRow("pipeline_rules", id);
}
