/**
 * The loyalty ladder's public face — pure data, importable from client
 * components without dragging server-only modules into the bundle.
 *
 * Perks per tier (Nico, 2026-08-22):
 *   Crew   = selected trip discounts + early access to new weeks
 *   Legend = the same, plus Signature Trip invitations, plus the right to pass
 *            the Crew discount to a friend.
 * Discount VALUES stay per-experience in exp_tier_perks (migration 169).
 */
export const TIER_STEPS = [
  { key: "rider" as const, label: "Rider", min: 1 },
  { key: "crew" as const, label: "Crew", min: 2 },
  { key: "legend" as const, label: "Legend", min: 4 },
];

export const TIER_PERKS: Record<"rider" | "crew" | "legend", string[]> = {
  rider: ["Your crew, photos & progress in the member area"],
  crew: ["Member discounts on selected trips", "Early access to new weeks"],
  legend: [
    "Member discounts on selected trips",
    "Early access to new weeks",
    "Signature Trip invitations",
    "Pass your Crew discount to a friend",
  ],
};
