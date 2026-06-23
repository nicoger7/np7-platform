"use client";

import { useEffect, useState } from "react";
import type { EffectiveAccess } from "./access";

/**
 * The current admin's effective access (from /api/admin/me), for client
 * components that need to hide in-page tabs/links the role can't reach.
 * `null` while loading or for legacy tier members → callers treat null as
 * "no extra restriction" (tier owners/managers see the full set anyway).
 */
export function useAccess(): EffectiveAccess | null {
  const [access, setAccess] = useState<EffectiveAccess | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setAccess(d?.access ?? null); })
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return access;
}
