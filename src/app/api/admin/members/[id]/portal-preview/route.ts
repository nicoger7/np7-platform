import { NextResponse } from "next/server";
import { requireTeamMember, getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { getMemberBookings, getMemberProfile } from "@/lib/portal-data";
import { bookingStatus, fmtDates, money } from "@/lib/portal-status";

// GET /api/admin/members/:id/portal-preview — the data the member sees on their
// /account home, rendered read-only inside admin (Member view tab). Reuses the
// exact portal data functions so it stays faithful. Prices are redacted for roles
// without the money grant (same as the rest of Member Management).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;

  const access = await getRequestAccess();
  const showMoney = !access || effectiveCanSeeField(access, "money");

  const [bookings, profile] = await Promise.all([
    getMemberBookings(id).catch(() => []),
    getMemberProfile(id).catch(() => null),
  ]);

  const trips = bookings.map((b) => {
    const chip = bookingStatus(b);
    return {
      id: b.id,
      title: b.experience?.title ?? "Your trip",
      dateLabel: fmtDates(b.edition?.date_start, b.edition?.date_end),
      pkgName: b.pkg?.name ?? null,
      priceLabel: showMoney ? (money(b.agreed_price, b.experience?.currency) ?? "—") : null,
      statusLabel: chip.label,
      statusTone: chip.tone,
      tile: b.edition?.hero_image ?? b.experience?.hero_image ?? null,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profile as any;
  const name: string | null = p?.name ?? null;
  return NextResponse.json({
    member: {
      name,
      firstName: (name || "").split(" ")[0] || "there",
      handle: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      level: p?.self_level ?? p?.level ?? null,
      city: p?.display_city ?? null,
      hasLogin: !!p?.auth_user_id,
    },
    trips,
    bannerImage: trips.find((t) => t.tile)?.tile ?? null,
  });
}
