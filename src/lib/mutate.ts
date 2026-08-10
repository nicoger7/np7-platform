"use client";

/**
 * Every write goes through here, because the alternative kept shipping.
 *
 * The pattern that caused it is easy to write and impossible to see in review:
 *
 *     await fetch(url, { method: "PATCH", body });
 *     setSaved(true);                       // ← always runs
 *
 * `fetch` only rejects on a NETWORK failure. A 401 from an expired session, a
 * 403 from a role, a 400 from a bad column — all of those RESOLVE, so the line
 * below runs and the UI reports success. An audit of this codebase found 33 of
 * them: primary Save buttons, permission revocations, privacy toggles, a
 * member's "request sent" confirmation for something nobody received.
 *
 * `mutate()` never throws and never lies. It returns a discriminated result, so
 * the compiler makes you look at `ok` before you can reach `data` — the check
 * you would otherwise forget becomes the check you cannot skip.
 */

export type MutateResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/** Human, actionable, and specific about the case that actually happens most. */
function messageFor(status: number, serverMessage?: string): string {
  if (status === 401 || status === 403) {
    return "Your session has expired. Open a new tab, log in again, then try once more — nothing you typed is lost.";
  }
  if (status === 0) return "No connection — check your network and try again. Nothing you typed is lost.";
  if (status === 409) return serverMessage || "That conflicts with something already saved. Reload and try again.";
  if (status >= 500) return serverMessage || "The server had a problem. Nothing was saved — please try again.";
  return serverMessage || `That didn't save (error ${status}). Nothing you typed is lost.`;
}

/**
 * Fetch a JSON write and force the caller to handle failure.
 *
 * Body is serialised for you when you pass a plain object — the header is the
 * other thing everyone forgets.
 */
export async function mutate<T = unknown>(
  url: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<MutateResult<T>> {
  const { body, headers, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...(headers ?? {}) },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    if (!res.ok) {
      // A 401 usually returns an HTML login page, not JSON — parsing must not
      // become a second, different failure.
      const j = await res.json().catch(() => null);
      return { ok: false, status: res.status, error: messageFor(res.status, (j as { error?: string } | null)?.error) };
    }
    const data = (await res.json().catch(() => null)) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: messageFor(0) };
  }
}

/**
 * The admin's blunt reporter.
 *
 * An alert is not elegant, and it is the right trade here: an admin write that
 * fails quietly costs an evening of re-entered work, while an alert costs one
 * click. Member-facing surfaces should render the message inline instead —
 * `mutate()` hands it to them either way.
 */
export function reportFailure(r: { ok: false; error: string }): false {
  if (typeof window !== "undefined") window.alert(r.error);
  return false;
}

/** `if (!(await saved(mutate(...)))) return;` — check and report in one line. */
export async function saved<T>(p: Promise<MutateResult<T>>): Promise<boolean> {
  const r = await p;
  return r.ok ? true : reportFailure(r);
}
