import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, after } from "next/server";
import { isActiveTeamMember } from "@/lib/admin-auth";
import { promoteProformaIfPaid } from "@/lib/invoices/promote";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
  return user;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = getServiceClient();

  const { data, error } = await admin
    .from("exp_payments")
    .select("*")
    .eq("booking_id", id)
    .order("received_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ payments: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const admin = getServiceClient();

  let { data, error } = await admin
    .from("exp_payments")
    .insert({ ...body, booking_id: id })
    .select()
    .single();

  // Pre-migration-054 fallback: drop the invoice link if the column is missing.
  if (error && /document_id/.test(error.message || "")) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { document_id: _docId, ...rest } = body;
    ({ data, error } = await admin
      .from("exp_payments")
      .insert({ ...rest, booking_id: id })
      .select()
      .single());
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Money landed → if it covers the pro-forma, the real tax invoice is issued,
  // allocations move over, the pro-forma is voided and the customer gets the
  // invoice by email. Background + best-effort: recording never blocks on it.
  after(() => promoteProformaIfPaid(id).catch((e) =>
    console.error("proforma promotion failed", e instanceof Error ? e.message : e)
  ));

  return Response.json({ payment: data });
}
