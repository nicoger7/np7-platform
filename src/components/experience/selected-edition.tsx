"use client";

import { createContext, useContext, useState } from "react";

/**
 * The week (edition) the visitor has selected in the booking block, shared with
 * the rest of the trip page — so sections further down (the crew, and anything
 * else that differs per week) follow the same choice instead of being stuck on
 * the default week.
 *
 * Falls back gracefully: with no provider (or no selection yet) consumers just
 * use their own default.
 */
type Ctx = { id: string | null; setId: (id: string) => void };

const SelectedEditionCtx = createContext<Ctx>({ id: null, setId: () => {} });

export function SelectedEditionProvider({ initialId, children }: { initialId: string | null; children: React.ReactNode }) {
  const [id, setId] = useState<string | null>(initialId);
  return <SelectedEditionCtx.Provider value={{ id, setId }}>{children}</SelectedEditionCtx.Provider>;
}

export function useSelectedEdition(): Ctx {
  return useContext(SelectedEditionCtx);
}
