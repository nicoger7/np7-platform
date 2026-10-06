"use client";

import { SpotguideProvider } from "./spotguide-provider";
import { AddSpot, type AddSpotDestination } from "./add-spot";

/** Index-level "add a spot anywhere" — a destination picker (or name a new
    area). Wrapped in its own provider so login / the signup modal work.
    Give each destination its lat/lng and picking it moves the pin map there. */
export function ContributeSpot({ destinations, accent = "#00afdb" }: { destinations: AddSpotDestination[]; accent?: string }) {
  return (
    <SpotguideProvider destId="">
      <AddSpot destinations={destinations} accent={accent} />
    </SpotguideProvider>
  );
}
