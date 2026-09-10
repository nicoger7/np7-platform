"use client";

import { useCallback, useEffect, useState } from "react";
import PromoGallery, { type PromoDesignRow } from "@/components/admin/promo-gallery";
import PromoStudio from "@/components/admin/promo-studio";
import { usePromoFonts } from "@/components/admin/use-promo-fonts";
import { defaultPromoState, type PromoState } from "@/lib/promo-template";

/**
 * Promo Studio, in two rooms.
 *
 * The page used to open in the editor with a design already loaded, which asks
 * the wrong question first: not "what do I want to change" but "which of my
 * graphics is this". So the overview is the page, and the editor is somewhere
 * you go. Nico: "make it a tile view (before being in the editor). Then i can
 * click into one and edit it. or go back to the overview."
 *
 * The list lives here rather than in either room, because both act on it: the
 * overview renames, duplicates and archives, and the editor's Save has to make
 * the tile behind it change. Keeping one copy is the only way those agree.
 *
 * Creating from an experience is not a second code path. It opens the editor
 * blank with its own "From edition" menu already down, so there is exactly one
 * implementation of "fill this poster in from an edition" and it is the one
 * that was already there.
 */
type Session = { key: number; id: string | null; state: PromoState; fromEdition: boolean };

export default function PromoWorkspace() {
  const [designs, setDesigns] = useState<PromoDesignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const { fonts, ready } = usePromoFonts();
  void ready; // re-render so thumbnails redraw once the real faces are in

  const loadDesigns = useCallback(async () => {
    try {
      const d = await fetch("/api/admin/promo/designs").then((r) => r.json());
      setDesigns(Array.isArray(d) ? d : []);
    } catch {
      /* the studio works without persistence; an empty wall beats a dead page */
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred by a tick, the way the other admin lists do it: the first fetch
  // belongs after the commit, not inside it.
  useEffect(() => { const t = setTimeout(loadDesigns, 0); return () => clearTimeout(t); }, [loadDesigns]);

  // A fresh `key` on every open, so React rebuilds the editor rather than
  // trying to reconcile one design's undo history onto another's.
  const openDesign = (d: PromoDesignRow) => {
    const state: PromoState = {
      ...d.state,
      // Designs saved before the gradient layer existed have no gradient at all.
      gradient: d.state.gradient ?? { ...defaultPromoState().gradient!, visible: false },
      // The row's name wins. Renaming from a tile PATCHes the column and not
      // the artwork, so opening a renamed design and pressing Save would
      // otherwise put the old name straight back.
      name: d.name || d.state.name,
    };
    setSession({ key: Date.now(), id: d.id, state, fromEdition: false });
  };
  const openNew = (fromEdition: boolean) =>
    setSession({ key: Date.now(), id: null, state: defaultPromoState(), fromEdition });

  const rename = async (d: PromoDesignRow, name: string) => {
    // Optimistic: a rename that only appears after a round trip reads as a
    // rename that did not take, and people type it again.
    setDesigns((list) => list.map((x) => (x.id === d.id ? { ...x, name } : x)));
    await fetch(`/api/admin/promo/designs/${d.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    loadDesigns();
  };

  const duplicate = async (d: PromoDesignRow) => {
    await fetch("/api/admin/promo/designs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${d.name} copy`, format: d.format, state: d.state }),
    }).catch(() => {});
    loadDesigns();
  };

  const archive = async (d: PromoDesignRow) => {
    setDesigns((list) => list.filter((x) => x.id !== d.id));
    await fetch(`/api/admin/promo/designs/${d.id}`, { method: "DELETE" }).catch(() => {});
    loadDesigns();
  };

  if (session) {
    return (
      <PromoStudio
        key={session.key}
        initialState={session.state}
        initialId={session.id}
        openEditionPickerOnMount={session.fromEdition}
        onBack={() => setSession(null)}
        onSaved={loadDesigns}
      />
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold admin-heading mb-1">Promo Studio</h1>
      <p className="text-sm mb-4" style={{ color: "var(--admin-text-muted,#666)" }}>
        Announcement graphics in the NP7 look. Open one to edit it, or start a new one from an experience.
      </p>
      <PromoGallery
        designs={designs}
        fonts={fonts}
        loading={loading}
        onOpen={openDesign}
        onNew={() => openNew(false)}
        onNewFromEdition={() => openNew(true)}
        onRename={rename}
        onDuplicate={duplicate}
        onDelete={archive}
      />
    </>
  );
}
