"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/shared/auth-modal";
import { hasAuthCookie } from "@/lib/has-auth-cookie";
import { isFreshAccount, welcomeSeenKey, ADD_SPOT_ANCHOR, SPOTS_ANCHOR } from "@/lib/spotguide-nudge";
import { WelcomeStrip } from "./welcome-strip";
import { openAddSpotForm } from "./add-spot-open";
import type { RatingSummary, ForecastTally, InfraShare } from "@/lib/spotguide";
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
  /** One-tap confirm of a single on-site facility. Returns the fresh tally. */
  toggleInfra: (spotId: string, tag: string) => Promise<{ shares: InfraShare[]; raters: number } | null>;
  saveDest: (ratings: Record<string, number>) => Promise<RatingSummary | null>;
};

const SpotguideCtx = createContext<Ctx | null>(null);
export function useSpotguide(): Ctx {
  const c = useContext(SpotguideCtx);
  if (!c) throw new Error("useSpotguide must be used inside <SpotguideProvider>");
  return c;
}

/** Has this member had their welcome on this device? Storage can throw (private
 *  mode, blocked site data); then we cannot remember past this page, and count
 *  it as seen for the page's life, which is the quieter mistake. */
const seenThisPage = new Set<string>();
function welcomeSeen(userId: string): boolean {
  if (seenThisPage.has(userId)) return true;
  try { return window.localStorage.getItem(welcomeSeenKey(userId)) === "1"; } catch { return false; }
}
function markWelcomeSeen(userId: string) {
  seenThisPage.add(userId);
  try { window.localStorage.setItem(welcomeSeenKey(userId), "1"); } catch { /* remembered for this page only */ }
}

/**
 * Should this viewer get the welcome now? Resolves to their first name (maybe
 * "") or null. `justLoggedIn` skips the account-age test: they signed in here.
 * Anonymous visitors (no auth cookie, nearly everyone) never reach the session
 * read or the name lookup.
 */
async function resolveWelcome(justLoggedIn: boolean): Promise<{ firstName: string } | null> {
  if (!hasAuthCookie()) return null;
  try {
    // loaded on demand, so the provider adds no auth client to a guest's page
    const { createClient } = await import("@/lib/supabase/client");
    const { data } = await createClient().auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    if (!justLoggedIn && !isFreshAccount(user.created_at)) return null;
    if (welcomeSeen(user.id)) return null;
    markWelcomeSeen(user.id); // shown once means once, tapped or not
    const me = await fetch("/api/portal/me").then((r) => r.json()).catch(() => null);
    if (me && me.loggedIn === false) return null;
    return { firstName: typeof me?.firstName === "string" ? me.firstName : "" };
  } catch {
    return null; // a welcome is never worth an error
  }
}

export function SpotguideProvider({ destId, initialLoggedIn = false, accent = "var(--np7-accent, #00afdb)", children }: {
  destId: string; initialLoggedIn?: boolean;
  /** The world's accent, for the welcome strip. The index passes nothing and
   *  gets the CSS variable, which is the same answer, settled in the browser. */
  accent?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
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

  /*
   * The welcome after sign-up (Nico, 6 Oct 2026). Two ways in:
   *   · a password login through this provider's AuthModal (onLoggedIn below)
   *     greets the rider whatever the account's age: they just came in here
   *   · the first page load after a magic link, which is how every NEW account
   *     arrives (sign-up mails a link back to this page). There is no callback
   *     for that, so the account's own age decides (isFreshAccount).
   * Either way once per member and device (resolveWelcome, above).
   */
  const [welcome, setWelcome] = useState<{ firstName: string } | null>(null);
  useEffect(() => {
    let alive = true;
    resolveWelcome(false).then((w) => { if (alive && w) setWelcome(w); });
    return () => { alive = false; };
  }, []);

  /*
   * /spotguide#sg-add-spot opens the add form on arrival. The welcome strip on
   * a destination page and the member home's "Add your home spot" step both
   * land here, so one tap from either ends in an open form, not a scroll hunt.
   * Waits for `loggedIn`: a guest following a shared link should meet the
   * form's own "sign up to add a spot" box, not a form they cannot send.
   */
  useEffect(() => {
    if (!loggedIn) return;
    if (window.location.hash !== `#${ADD_SPOT_ANCHOR}`) return;
    const raf = requestAnimationFrame(() => { openAddSpotForm(); });
    return () => cancelAnimationFrame(raf);
  }, [loggedIn]);

  const closeWelcome = useCallback(() => setWelcome(null), []);
  const welcomeAddSpot = useCallback(() => {
    setWelcome(null);
    // The INDEX form, with its destination picker: a home spot is rarely in the
    // area the rider happened to sign up on, and a destination page's form is
    // fixed to that area.
    if (window.location.pathname === "/spotguide" && openAddSpotForm()) return;
    router.push(`/spotguide#${ADD_SPOT_ANCHOR}`);
  }, [router]);
  const welcomeRate = useCallback(() => {
    setWelcome(null);
    const el = document.getElementById(SPOTS_ANCHOR);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else router.push(`/spotguide#${SPOTS_ANCHOR}`);
  }, [router]);

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
  const toggleInfra = async (spotId: string, tag: string) => {
    const j = await post("/api/portal/spotguide/infra", { spotId, tag });
    if (!j) return null;
    setMineSpots((m) => ({ ...m, [spotId]: { ...m[spotId], infrastructure: j.mine as string[] } }));
    return j.tally as { shares: InfraShare[]; raters: number };
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
    <SpotguideCtx.Provider value={{ loggedIn, mineDest, mineSpot: (id) => mineSpots[id], pendingSpots, needAuth, saveSpot, voteForecast, toggleInfra, saveDest }}>
      {children}
      {auth && (
        <AuthModal
          source="spotguide"
          initialMode={auth}
          title={auth === "login" ? "Welcome back" : "Join NP7 · free"}
          subtitle={auth === "login" ? "Log in to rate spots and unlock every guide." : "It takes a few seconds. Then rate spots and unlock every guide."}
          onClose={() => setAuth(false)}
          onLoggedIn={() => { setAuth(false); load(); resolveWelcome(true).then((w) => { if (w) setWelcome(w); }); }}
        />
      )}
      {welcome && !auth && (
        <WelcomeStrip firstName={welcome.firstName} accent={accent}
          onAddSpot={welcomeAddSpot} onRate={welcomeRate} onClose={closeWelcome} />
      )}
    </SpotguideCtx.Provider>
  );
}
