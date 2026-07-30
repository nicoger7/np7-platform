"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AuthModal } from "@/components/shared/auth-modal";
import { hasAuthCookie } from "@/lib/has-auth-cookie";
import type { RatingSummary, ForecastTally } from "@/lib/spotguide";
import type { PublicSpot } from "@/lib/spotguide-data";

export type SpotFacts = { ratings: Record<string, number>; levels: string[]; conditions: string[]; infrastructure: string[]; wind_window: Record<string, string> };
type SpotMine = { ratings?: Record<string, number>; model?: string; level?: string | null; levels?: string[]; conditions?: string[]; infrastructure?: string[]; wind_window?: Record<string, string> };

type Ctx = {
  loggedIn: boolean;
  mineDest: Record<string, number> | null;
  mineSpot: (spotId: string) => SpotMine | undefined;
  /** Pending spots only THIS viewer may see (own +, for team, everyone's).
   *  The page is CDN-cached, so these arrive here instead of in the server render. */
  pendingSpots: PublicSpot[];
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
  const [pendingSpots, setPendingSpots] = useState<PublicSpot[]>([]);
  const [auth, setAuth] = useState<false | "login" | "register">(false);

  // Every spotguide page mounted this and asked the server "who am I?" — a
  // function invocation on the busiest public route, for an answer that is
  // already knowable client-side for the ~everyone who is anonymous.
  //   · no auth cookie (and the server didn't say otherwise) ⇒ provably a guest
  //   · destId "" (the index-level provider) ⇒ /mine has no ratings to return
  //     for it anyway, so the cookie IS the whole answer
  // A real member on a destination page still fetches — they have ratings to load.
  const load = useCallback(() => {
    if (!initialLoggedIn && !hasAuthCookie()) { setLoggedIn(false); return; }
    if (!destId) { setLoggedIn(true); return; }
    fetch(`/api/portal/spotguide/mine?dest=${destId}`)
      .then((r) => r.json())
      .then((d) => {
        setLoggedIn(!!d.loggedIn);
        if (d.loggedIn) {
          setMineDest(d.dest ?? null);
          setMineSpots(d.spots ?? {});
          setPendingSpots(Array.isArray(d.pendingSpots) ? d.pendingSpots : []);
        }
      })
      .catch(() => {});
  }, [destId, initialLoggedIn]);
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
    setMineSpots((m) => ({ ...m, [spotId]: { ...m[spotId], ratings: j.mine.ratings, level: j.mine.level, levels: j.mine.levels, conditions: j.mine.conditions, infrastructure: j.mine.infrastructure, wind_window: j.mine.wind_window } }));
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
    // the rate API wraps it ({ mine: { ratings } }) while GET /mine returns the flat
    // record — unwrap so the rater sees the member's rating and shows "✓ rated /
    // Update" instead of a fresh empty form.
    setMineDest(j.mine?.ratings ?? null);
    return j.summary as RatingSummary;
  };

  return (
    <SpotguideCtx.Provider value={{ loggedIn, mineDest, mineSpot: (id) => mineSpots[id], pendingSpots, needAuth, saveSpot, voteForecast, saveDest }}>
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
