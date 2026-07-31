import { NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Member shopping cart — stub.
 *
 * The hardware shop has no cart/orders backend yet (no add-to-cart, products
 * table is empty). This returns an empty cart so the portal badge + cart page
 * render today and swap to live data later without any UI change.
 */
export async function GET() {
  const auth = await requirePortalApi({ allowPreview: true });
  if (!auth.ok) return auth.res;
  return NextResponse.json({ items: [], count: 0, currency: "EUR", subtotal: 0 });
}
