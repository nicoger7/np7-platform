"use client";

import React from "react";

/**
 * Keeps one broken panel from taking down the page around it.
 *
 * A restricted role opening a booking got Next.js's "This page couldn't load"
 * — the whole route replaced by an error screen, with the bookings list, the
 * edition tabs and everything else gone with it. The loaders were already
 * defensive (a 403 resolves to null rather than throwing), so the throw was
 * happening during RENDER, somewhere in a panel meeting redacted data. Reading
 * the code didn't find it: every candidate was already null-guarded, and it
 * could not be reproduced without that role's session.
 *
 * So rather than keep guessing: a render error here degrades to a message
 * inside the panel, and the page keeps working. And the message carries the
 * actual error text — the thing that was missing all along, because the crash
 * only ever happened on someone else's screen. Next time it says what broke
 * instead of "couldn't load".
 *
 * Deliberately NOT a route-level error.tsx: this pane renders inside both the
 * bookings list and the edition's Bookings tab, and both should survive it.
 */
type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

export class PaneBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Goes to the browser console AND Vercel's logs, so a repeat is traceable
    // without anyone having to screenshot a console.
    console.error("[admin pane] render failed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <p className="text-sm font-bold admin-heading">
          {this.props.label ?? "This panel"} couldn&apos;t be shown
        </p>
        <p className="text-[12.5px] admin-faint mt-1 leading-relaxed">
          The rest of the page still works — go back and pick another, or reload.
          If it keeps happening, send this line to Nico:
        </p>
        <p className="mt-2 text-[11.5px] font-mono admin-muted break-words">
          {this.state.error.message || String(this.state.error)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 text-xs font-bold text-[#0aa3c7] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }
}
