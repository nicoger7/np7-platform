"use client";

import PromoStudio from "@/components/admin/promo-studio";

export default function PromoPage() {
  return (
    <div className="max-w-[1400px]">
      <h1 className="text-2xl font-bold admin-heading mb-1">Promo Studio</h1>
      <p className="text-sm mb-4" style={{ color: "var(--admin-text-muted,#666)" }}>
        Announcement graphics in the NP7 look — edit everything right on the artboard, export 4:5 and 9:16.
      </p>
      <PromoStudio />
    </div>
  );
}
