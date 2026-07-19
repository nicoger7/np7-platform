"use client";

// QA / iteration page for the auto-branded tiles AND the placement editors.
// Not linked anywhere; 404s in production when the experience surface is hidden.
import { useState } from "react";
import { placeFromLocation, flagFromLocation, type TilePlacement } from "@/lib/experience-tile";
import { TilePlacementEditor, HeroFocusPicker } from "@/components/admin/placement-editors";

const NICO = "/coaches/nico.png";
const SAMPLE_PHOTO = "https://media.np-seven.com/experiences/np7-alacati/action/alacati-experience-action-nico.jpg";
const SAMPLE_LOCATION = "Alacati, Turkey";

export default function TilePreviewPage() {
  const [placement, setPlacement] = useState<TilePlacement>({});
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#f4f7f8] p-6 sm:p-10">
      <div className="max-w-[720px] mx-auto space-y-8">
        <h1 className="text-[#0a2a33] text-2xl font-black">Placement editor — QA harness</h1>

        <section>
          <h2 className="text-[#0a2a33] text-sm font-bold uppercase tracking-[0.12em] mb-3">Card placement</h2>
          <TilePlacementEditor
            content={{
              photo: SAMPLE_PHOTO,
              place: placeFromLocation(SAMPLE_LOCATION).toUpperCase(),
              flag: flagFromLocation(SAMPLE_LOCATION),
              coachName: "Nico Prien",
              coachCutout: NICO,
            }}
            value={placement}
            onChange={setPlacement}
          />
          <pre className="mt-3 text-[11px] text-[#6a7a80] bg-white rounded-lg p-3 overflow-x-auto">{JSON.stringify(placement)}</pre>
        </section>

        <section>
          <h2 className="text-[#0a2a33] text-sm font-bold uppercase tracking-[0.12em] mb-3">Hero focal point</h2>
          <HeroFocusPicker image={SAMPLE_PHOTO} value={focus} onChange={setFocus} />
          <pre className="mt-3 text-[11px] text-[#6a7a80] bg-white rounded-lg p-3">{JSON.stringify(focus)}</pre>
        </section>
      </div>
    </div>
  );
}
