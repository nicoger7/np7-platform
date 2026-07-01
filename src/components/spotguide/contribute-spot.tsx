"use client";

import { SpotguideProvider } from "./spotguide-provider";
import { AddSpot } from "./add-spot";

/** Index-level "add a spot anywhere" — a destination picker (or name a new
    area). Wrapped in its own provider so login / the signup modal work. */
export function ContributeSpot({ destinations, accent = "#00afdb" }: { destinations: { id: string; name: string }[]; accent?: string }) {
  return (
    <SpotguideProvider destId="">
      <AddSpot destinations={destinations} accent={accent} />
    </SpotguideProvider>
  );
}
