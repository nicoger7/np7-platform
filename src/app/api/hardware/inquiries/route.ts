import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

import { rateLimited, LIMITS } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
  const tooMany = await rateLimited(req, { name: "hw-inquiry", policy: LIMITS.write });
  if (tooMany) return tooMany;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { product_id, name, email, message, phone } = body as {
    product_id?: unknown;
    name?: unknown;
    email?: unknown;
    message?: unknown;
    phone?: unknown;
  };

  if (
    !product_id ||
    typeof product_id !== "string" ||
    !name ||
    typeof name !== "string" ||
    !name.trim() ||
    !email ||
    typeof email !== "string" ||
    !email.trim()
  ) {
    return NextResponse.json(
      { error: "product_id, name, and email are required" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { error } = await sb.from("hw_inquiries").insert({
    product_id,
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    message: message && typeof message === "string" ? message.trim() : null,
    phone: phone && typeof phone === "string" ? phone.trim() : null,
    status: "new",
  });

  if (error) {
    console.error("hw_inquiries insert error:", error);
    return NextResponse.json({ error: "Failed to save enquiry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
