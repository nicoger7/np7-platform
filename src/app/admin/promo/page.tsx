"use client";

import PromoWorkspace from "@/components/admin/promo-workspace";

/**
 * The heading moved into the workspace: the overview and the editor are two
 * different rooms and a fixed page title above both of them was a third thing
 * competing for the same strip of screen. The editor needs every pixel it can
 * get for the artboard.
 */
export default function PromoPage() {
  return (
    <div className="max-w-[1400px]">
      <PromoWorkspace />
    </div>
  );
}
