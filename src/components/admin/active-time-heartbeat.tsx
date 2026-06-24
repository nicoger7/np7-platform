"use client";

import { useEffect } from "react";

/**
 * Tracks the signed-in member's *active* time in the admin. While the tab is
 * focused and there's been activity in the last 5 min, it pings the server every
 * ~3 min; the server accumulates the gaps (idle excluded). Renders nothing.
 * No-ops gracefully if the active-time table isn't there yet.
 */
const PING_MS = 3 * 60 * 1000;   // heartbeat cadence
const IDLE_MS = 5 * 60 * 1000;   // mirror the server idle window

export function ActiveTimeHeartbeat() {
  useEffect(() => {
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events: (keyof DocumentEventMap)[] = ["mousemove", "keydown", "scroll", "click", "pointerdown"];
    events.forEach((e) => document.addEventListener(e, bump, { passive: true }));

    const localDate = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity > IDLE_MS) return; // idle → don't count
      fetch("/api/admin/active-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDate() }),
        keepalive: true,
      }).catch(() => {});
    };

    ping(); // establish today's row / last_ping_at on load
    const id = setInterval(ping, PING_MS);
    return () => { clearInterval(id); events.forEach((e) => document.removeEventListener(e, bump)); };
  }, []);

  return null;
}
