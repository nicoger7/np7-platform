"use client";

/**
 * Remembers the admin accounts used in THIS browser so the team can switch
 * between them without re-typing a password (e.g. owner ↔ a test photographer
 * role). We cache each account's Supabase session tokens in localStorage and
 * swap them with `auth.setSession` — same storage the SSR client already uses
 * for the active session, just keyed per account. Cleared on full log-out.
 */

const KEY = "np7-admin-accounts";

export type StoredAccount = {
  id: string;
  email: string;
  name?: string | null;
  access_token: string;
  refresh_token: string;
  ts: number; // last seen, ms
};

function read(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as StoredAccount[]) : [];
    return Array.isArray(arr) ? arr.filter((a) => a && a.id && a.refresh_token) : [];
  } catch {
    return [];
  }
}

function write(list: StoredAccount[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

/** Upsert the account by id (newest tokens win), most-recent first. */
export function rememberAccount(acc: Omit<StoredAccount, "ts">) {
  if (!acc.id || !acc.refresh_token) return;
  const list = read().filter((a) => a.id !== acc.id);
  write([{ ...acc, ts: Date.now() }, ...list]);
}

/** All remembered accounts, most-recent first. */
export function listAccounts(): StoredAccount[] {
  return read().sort((a, b) => b.ts - a.ts);
}

export function forgetAccount(id: string) {
  write(read().filter((a) => a.id !== id));
}

export function forgetAllAccounts() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
