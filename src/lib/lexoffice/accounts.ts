/**
 * Which company's books does this document belong in, and what is the key.
 *
 * One lexoffice account is one company. That is not a limitation to work
 * around, it is the shape of the problem: NP7 Experience GmbH takes over on
 * 2027-01-01 with its own account, its own API key and its own numbering
 * circle, and a correction to a 2026 invoice must still come from the old
 * GmbH. So routing is by the DOCUMENT'S OWN issue date against an account's
 * validity window, never by which company happens to be current when someone
 * presses the button. Pushing a 2026 Storno in March 2027 must land in the
 * 2026 books, and this is the file that makes that true.
 *
 * The API key is never in the database. fin_lexoffice_accounts stores the NAME
 * of the environment variable that holds it, so a secret lives where secrets
 * live and rotating one is a deploy rather than an UPDATE on a table any staff
 * member can read.
 */

import { createAdminClient } from "@/lib/supabase";
import { getProfile } from "./client";

export type LexAccount = {
  id: string;
  entity_id: string;
  label: string;
  org_id: string | null;
  env_key: string;
  valid_from: string | null;
  valid_to: string | null;
  sales_category_id: string | null;
  credit_category_id: string | null;
  enabled: boolean;
  note: string | null;
};

/**
 * Read the key for an account out of the environment.
 *
 * Returns null rather than throwing, so every caller degrades to "not
 * configured" the way src/lib/stripe.ts does. A missing key is a normal state
 * here, not an error: the whole integration is off until someone sets one.
 */
export function apiKeyFor(account: Pick<LexAccount, "env_key">): string | null {
  const raw = process.env[account.env_key];
  return raw && raw.trim() ? raw.trim() : null;
}

export function lexofficeConfigured(account: Pick<LexAccount, "env_key"> | null): boolean {
  return !!account && !!apiKeyFor(account);
}

/** Every configured account, newest window first. */
export async function listAccounts(): Promise<LexAccount[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("fin_lexoffice_accounts")
    .select("*")
    .order("valid_from", { ascending: false, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as LexAccount[];
}

const dateOnly = (iso: string) => iso.slice(0, 10);

function windowContains(a: LexAccount, day: string): boolean {
  if (a.valid_from && day < a.valid_from) return false;
  if (a.valid_to && day > a.valid_to) return false;
  return true;
}

export type AccountResolution =
  | { ok: true; account: LexAccount }
  | { ok: false; reason: string };

/**
 * The account a document belongs to.
 *
 * Deliberately strict. There is no "if in doubt use the only account we have"
 * fallback, because the one moment that fallback would fire is the January
 * 2027 changeover, when it would put a document in the wrong company's books
 * and nobody would notice until the year-end. Two matching windows is the same
 * kind of mistake seen earlier, so that refuses too.
 */
export async function accountForDocument(doc: {
  division: string | null;
  issued_at: string | null;
}): Promise<AccountResolution> {
  const division = doc.division || "experience";
  const day = dateOnly(doc.issued_at || new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: entities, error: entErr } = await db
    .from("fin_entities")
    .select("id, key, name, division")
    .eq("division", division);
  if (entErr) return { ok: false, reason: `Could not read the company list: ${entErr.message}` };
  const entityIds = ((entities ?? []) as { id: string }[]).map((e) => e.id);
  if (!entityIds.length) {
    return { ok: false, reason: `No company is registered for the "${division}" division.` };
  }

  const { data, error } = await db
    .from("fin_lexoffice_accounts")
    .select("*")
    .in("entity_id", entityIds);
  if (error) return { ok: false, reason: `Could not read the lexoffice accounts: ${error.message}` };

  const all = (data ?? []) as LexAccount[];
  if (!all.length) {
    return { ok: false, reason: `No lexoffice account is set up for the "${division}" division yet.` };
  }

  const matching = all.filter((a) => windowContains(a, day));
  if (!matching.length) {
    return {
      ok: false,
      reason: `No lexoffice account covers ${day}. A document issued then belongs to a company whose books have not been set up.`,
    };
  }
  if (matching.length > 1) {
    return {
      ok: false,
      reason: `${matching.length} lexoffice accounts both claim ${day} (${matching
        .map((a) => a.label)
        .join(", ")}). Fix the validity windows before pushing, or this document could land in either company's books.`,
    };
  }
  return { ok: true, account: matching[0] };
}

export type ReadinessProblem = { code: string; message: string };

/**
 * Everything that must be true before real money-paper is written into a set
 * of books. Returns the problems, so the admin can show all of them at once
 * rather than one per failed attempt.
 *
 * The category check is the one that looks pedantic and is not. lexoffice has
 * 231 fixed categories and allows no custom ones, so the accounting plan says
 * to pick one with the tax practice and then never vary it: reclassifying a
 * whole year in one move is only possible if every row already agrees. Picking
 * a plausible-looking default here would quietly make that impossible, and
 * "Dienstleistungen an Drittländer" is exactly the plausible-looking one that
 * is wrong (§ 25 Abs. 1 Satz 4 puts the place of supply at NP7's seat, so the
 * trip is taxable in Germany and then exempt, not an untaxed foreign supply).
 */
export async function accountReadiness(account: LexAccount): Promise<ReadinessProblem[]> {
  const problems: ReadinessProblem[] = [];
  if (!account.enabled) {
    problems.push({ code: "disabled", message: `${account.label} is not switched on for pushing yet.` });
  }
  const key = apiKeyFor(account);
  if (!key) {
    problems.push({
      code: "no_key",
      message: `${account.env_key} is not set in this environment, so ${account.label} has no API key.`,
    });
  }
  if (!account.sales_category_id) {
    problems.push({
      code: "no_category",
      message:
        "No posting category has been agreed with the tax practice yet. Which category the trip invoices book to is one of the open questions in the accounting plan, and guessing it would break the one thing the practice needs: that every row is the same.",
    });
  }
  if (key && account.org_id) {
    const prof = await getProfile(key);
    if (!prof.ok) {
      problems.push({ code: "unreachable", message: `lexoffice did not answer for ${account.label}: ${prof.error}` });
    } else if (prof.data.organizationId !== account.org_id) {
      problems.push({
        code: "wrong_org",
        message: `${account.env_key} belongs to "${prof.data.companyName}" (${prof.data.organizationId}), but ${account.label} expects ${account.org_id}. Pushing would put these invoices in the wrong company's books.`,
      });
    }
  }
  return problems;
}
