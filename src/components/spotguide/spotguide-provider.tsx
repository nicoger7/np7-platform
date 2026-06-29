"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AuthModal } from "@/components/shared/auth-modal";
import type { RatingSummary, ForecastTally } from "@/lib/spotguide";

type SpotMine = { ratings?: Record<string, number>; model?: string };

type Ctx = {
  loggedIn: boolean;
  mineDest: Record<string, number> | null;
  mineSpot: (spotId: string) => SpotMine | undefined;
  /** Open the free-signup modal; resolves the member into a logged-in state. */
  needAuth: () => void;
  saveSpot: (spotId: string, ratings: Record<string, number>) => Promise<RatingSummary | null>;
  voteForecast: (spotId: string, model: string) => Promise<ForecastTally[] | null>;
  saveDest: (ratings: Record<string, number>) => Promise<RatingSummary | null>;
};

const SpotguideCtx = createContext<Ctx | null>(null);
export function useSpotguide(): Ctx {
  const c = useContext(SpotguideCtx);
  if (!c) throw new Error("useSpotguide must be used inside <SpotguideProvider>");
  return c;
}

export function SpotguideProvider({ destId, initialLoggedIn = false, children }: { destId: string; initialLoggedIn?: boolean; children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(initialLoggedIn);
  const [mineDest, setMineDest] = useState<Record<string, number> | null>(null);
  const [mineSpots, setMineSpots] = useState<Record<string, SpotMine>>({});
  const [auth, setAuth] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/portal/spotguide/mine?dest=${destId}`)
      .then((r) => r.json())
      .then((d) => { setLoggedIn(!!d.loggedIn); if (d.loggedIn) { setMineDest(d.dest ?? null); setMineSpots(d.spots ?? {}); } })
      .catch(() => {});
  }, [destId]);
  useEffect(() => { load(); }, [load]);

  const needAuth = useCallback(() => setAuth(true), []);

  async function post(url: string, body: unknown) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) { setAuth(true); return null; }
    if (!r.ok) return null;
    return r.json();
  }

  const saveSpot = async (spotId: string, ratings: Record<string, number>) => {
    const j = await post("/api/portal/spotguide/rate", { target: "spot", id: spotId, ratings });
    if (!j) return null;
    setMineSpots((m) => ({ ...m, [spotId]: { ...m[spotId], ratings: j.mine } }));
    return j.summary as RatingSummary;
  };
  const voteForecast = async (spotId: string, model: string) => {
    const j = await post("/api/portal/spotguide/forecast", { spotId, model });
    if (!j) return null;
    setMineSpots((m) => ({ ...m, [spotId]: { ...m[spotId], model: j.mine } }));
    return j.tally as ForecastTally[];
  };
  const saveDest = async (ratings: Record<string, number>) => {
    const j = await post("/api/portal/spotguide/rate", { target: "destination", id: destId, ratings });
    if (!j) return null;
    setMineDest(j.mine);
    return j.summary as RatingSummary;
  };

  return (
    <SpotguideCtx.Provider value={{ loggedIn, mineDest, mineSpot: (id) => mineSpots[id], needAuth, saveSpot, voteForecast, saveDest }}>
      {children}
      {auth && (
        <AuthModal
          initialMode="register"
          title="Join NP7 — free"
          subtitle="It takes a few seconds — then rate spots and unlock every guide."
          onClose={() => setAuth(false)}
          onLoggedIn={() => { setAuth(false); load(); }}
        />
      )}
    </SpotguideCtx.Provider>
  );
}
