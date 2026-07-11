"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AuthModal } from "@/components/shared/auth-modal";
import type { RatingSummary, ForecastTally } from "@/lib/spotguide";

export type SpotFacts = { ratings: Record<string, number>; level: string | null; conditions: string[]; wind_window: Record<string, string> };
type SpotMine = { ratings?: Record<string, number>; model?: string; level?: string | null; conditions?: string[]; wind_window?: Record<string, string> };

type Ctx = {
  loggedIn: boolean;
  mineDest: Record<string, number> | null;
  mineSpot: (spotId: string) => SpotMine | undefined;
  /** Open the auth modal; defaults to "register" (join), pass "login" for returning members. */
  needAuth: (mode?: "login" | "register") => void;
  saveSpot: (spotId: string, facts: SpotFacts) => Promise<boolean>;
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
  const [auth, setAuth] = useState<false | "login" | "register">(false);

  const load = useCallback(() => {
    fetch(`/api/portal/spotguide/mine?dest=${destId}`)
      .then((r) => r.json())
      .then((d) => { setLoggedIn(!!d.loggedIn); if (d.loggedIn) { setMineDest(d.dest ?? null); setMineSpots(d.spots ?? {}); } })
      .catch(() => {});
  }, [destId]);
  useEffect(() => { load(); }, [load]);

  const needAuth = useCallback((mode: "login" | "register" = "register") => setAuth(mode), []);

  async function post(url: string, body: unknown) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) { setAuth("register"); return null; }
    if (!r.ok) return null;
    return r.json();
  }

  const saveSpot = async (spotId: string, facts: SpotFacts) => {
    const j = await post("/api/portal/spotguide/rate", { target: "spot", id: spotId, ...facts });
    if (!j) return false;
    setMineSpots((m) => ({ ...m, [spotId]: { ...m[spotId], ratings: j.mine.ratings, level: j.mine.level, conditions: j.mine.conditions, wind_window: j.mine.wind_window } }));
    return true;
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
          initialMode={auth}
          title={auth === "login" ? "Welcome back" : "Join NP7 — free"}
          subtitle={auth === "login" ? "Log in to rate spots and unlock every guide." : "It takes a few seconds — then rate spots and unlock every guide."}
          onClose={() => setAuth(false)}
          onLoggedIn={() => { setAuth(false); load(); }}
        />
      )}
    </SpotguideCtx.Provider>
  );
}
