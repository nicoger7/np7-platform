/**
 * lexoffice (Lexware Office) REST client.
 *
 * Deliberately thin: no SDK, plain fetch, and every call degrades to a clear
 * "not configured" instead of throwing, the same way src/lib/stripe.ts does.
 * Nothing in the platform may break because a lexoffice key is missing — the
 * whole integration is a bookkeeping side channel, never a path a guest walks.
 *
 * MULTI-TENANT BY CONSTRUCTION. One lexoffice account is one company. NP7
 * Experience GmbH takes over on 2027-01-01 with its own account, its own key
 * and its own numbering circle, so there is no module-level API key here and no
 * single global client. Every call takes the credentials of the entity it acts
 * for; see ./entities.ts for where those come from.
 *
 * What the live API actually does (probed against the NP7 GmbH account on
 * 2026-09-10, org bcfd62da-3766-4cc6-b1d4-e9993102238f):
 *
 *   - POST /v1/vouchers accepts OUR voucherNumber verbatim. This is the fact
 *     the whole design rests on: NP7 stays the issuer, the NP7-XP series does
 *     not fork, and lexoffice is the archive.
 *   - voucherStatus on create accepts only "unchecked" and "open". "paid",
 *     "paidoff", "voided", "transferred" and "draft" are all rejected with 406.
 *     We could not push a payment even if we wanted to, and we do not want to:
 *     lexoffice's own bank matching only searches unpaid vouchers.
 *   - A duplicate voucherNumber is ACCEPTED. lexoffice does not deduplicate.
 *   - DELETE /v1/vouchers/{id} does not exist (404), and PUT rejects any
 *     voucherStatus field (406) so a voucher cannot be voided through the API
 *     either. A wrong push can only be undone by hand in the lexoffice UI.
 *     That is why the caller side is written to be idempotent twice over.
 *
 * Rate limit is 2 requests per second per organisation. Requests are queued
 * per key so a batch push cannot trip it.
 */

const LEXOFFICE_API = "https://api.lexware.io/v1";

/** Minimum gap between two calls on the same key: 2 req/s, plus headroom. */
const MIN_GAP_MS = 520;

// ─── Rate limiting ────────────────────────────────────────────────────────────

/**
 * One queue per API key, not one global queue.
 *
 * The limit is per organisation, so two entities pushing at once are two
 * independent budgets. A single lane for both would halve each of them for no
 * reason, and a lane per *call site* would not limit anything at all.
 */
const lanes = new Map<string, Promise<unknown>>();

function laneFor(key: string): string {
  // Never key the map on the secret itself — it would sit in memory as a map
  // key and turn up in any heap dump. The tail is unique enough to separate
  // two accounts and useless on its own.
  return key.slice(-8);
}

async function throttled<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const lane = laneFor(key);
  const prev = lanes.get(lane) ?? Promise.resolve();
  const next = prev.then(async () => {
    const out = await fn();
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    return out;
  });
  // Keep the chain alive even when one call rejects, or every later call in
  // the same lane inherits that rejection and the queue jams for good.
  lanes.set(lane, next.catch(() => undefined));
  return next;
}

// ─── Result shape ─────────────────────────────────────────────────────────────

export type LexResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; notConfigured?: true };

function fail<T>(status: number, error: string, notConfigured?: true): LexResult<T> {
  return { ok: false, status, error, ...(notConfigured ? { notConfigured } : {}) };
}

/**
 * Turn lexoffice's error envelope into one readable line.
 *
 * Validation failures come back as {"IssueList":[{"i18nKey":"invalid_value",
 * "source":"voucherStatus",...}]} with an HTTP 406 and no prose at all, so the
 * raw body is the only place the actual cause is written down. Losing it means
 * a failed push in the admin says "406" and nothing else.
 */
function describeError(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as {
      IssueList?: { i18nKey?: string; source?: string; type?: string }[];
      message?: string;
      error_description?: string;
    };
    if (Array.isArray(j.IssueList) && j.IssueList.length) {
      return j.IssueList
        .map((i) => [i.source, i.i18nKey ?? i.type].filter(Boolean).join(": "))
        .join("; ");
    }
    if (j.message) return j.message;
    if (j.error_description) return j.error_description;
  } catch {
    /* not JSON — fall through to the raw text */
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 400) : `HTTP ${status}`;
}

// ─── Core request ─────────────────────────────────────────────────────────────

async function request<T>(
  apiKey: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<LexResult<T>> {
  if (!apiKey) return fail<T>(0, "lexoffice is not configured for this company", true);

  return throttled(apiKey, async () => {
    let res: Response;
    try {
      res = await fetch(`${LEXOFFICE_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      return fail<T>(0, `lexoffice unreachable: ${(e as Error).message}`);
    }

    const text = await res.text().catch(() => "");
    if (!res.ok) return fail<T>(res.status, describeError(res.status, text));
    if (!text) return { ok: true as const, data: undefined as T };
    try {
      return { ok: true as const, data: JSON.parse(text) as T };
    } catch {
      return fail<T>(res.status, "lexoffice returned a body that is not JSON");
    }
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export type LexProfile = {
  organizationId: string;
  companyName: string;
  taxType: string;
  smallBusiness: boolean;
};

/** Who does this key belong to. Used to prove a key is pointed at the company
    we think it is before anything is written into that company's books. */
export function getProfile(apiKey: string | null): Promise<LexResult<LexProfile>> {
  return request<LexProfile>(apiKey, "GET", "/profile");
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export type LexVoucherType = "salesinvoice" | "salescreditnote" | "purchaseinvoice" | "purchasecreditnote";

/** The only two statuses POST /v1/vouchers accepts. Verified live 2026-09-10.
 *  "unchecked" is lexoffice's "zu prüfen" tray and is NOT booked; "open" is
 *  booked and unpaid, which is the state the bank matcher searches. */
export type LexVoucherStatus = "open" | "unchecked";

export type LexVoucherItem = {
  amount: number;
  taxAmount: number;
  taxRatePercent: number;
  categoryId: string;
};

export type LexVoucherInput = {
  type: LexVoucherType;
  voucherStatus: LexVoucherStatus;
  voucherNumber: string;
  voucherDate: string; // YYYY-MM-DD
  dueDate?: string;
  totalGrossAmount: number;
  totalTaxAmount: number;
  taxType: "gross" | "net";
  useCollectiveContact?: boolean;
  contactId?: string;
  /** The margin bookkeeping line. lexoffice calls it `remark`; the UI calls it
      Beschreibung. It is the only field in lexoffice that can carry the link
      from a booking entry to a single trip, which §25 has required per trip
      since 01.01.2022. */
  remark?: string;
  voucherItems: LexVoucherItem[];
};

export type LexVoucherCreated = { id: string; resourceUri: string; version: number };

export function createVoucher(apiKey: string | null, input: LexVoucherInput): Promise<LexResult<LexVoucherCreated>> {
  return request<LexVoucherCreated>(apiKey, "POST", "/vouchers", input);
}

export type LexVoucher = {
  id: string;
  organizationId: string;
  type: LexVoucherType;
  voucherStatus: string;
  voucherNumber: string;
  voucherDate: string;
  totalGrossAmount: number;
  remark?: string;
  files?: string[];
  version: number;
};

export function getVoucher(apiKey: string | null, id: string): Promise<LexResult<LexVoucher>> {
  return request<LexVoucher>(apiKey, "GET", `/vouchers/${id}`);
}

export type LexVoucherListEntry = {
  id: string;
  voucherType: LexVoucherType;
  voucherStatus: string;
  voucherNumber: string;
  voucherDate: string;
  totalAmount: number | null;
  contactName?: string | null;
};

/**
 * Find a voucher by OUR number, in lexoffice itself.
 *
 * The second half of idempotency. The first half is the id we record on the
 * documents row; this covers the case where the push succeeded but the row
 * never got written (a crash between the two calls, a rolled-back deploy, a
 * database restored from before the push). Without it that invoice would be
 * pushed a second time, and since lexoffice happily accepts a duplicate
 * voucherNumber and offers no way to delete or void one through the API, the
 * duplicate would have to be cleaned up by hand in the browser.
 */
export async function findVoucherByNumber(
  apiKey: string | null,
  type: LexVoucherType,
  voucherNumber: string,
): Promise<LexResult<LexVoucherListEntry | null>> {
  const qs = new URLSearchParams({
    voucherType: type,
    voucherStatus: "any",
    voucherNumber,
    size: "25",
  });
  const res = await request<{ content?: LexVoucherListEntry[] }>(apiKey, "GET", `/voucherlist?${qs}`);
  if (!res.ok) return res;
  const hit = (res.data.content ?? []).find((v) => v.voucherNumber === voucherNumber) ?? null;
  return { ok: true, data: hit };
}

// ─── File attachment ──────────────────────────────────────────────────────────

/**
 * Attach the rendered PDF to a voucher.
 *
 * POST /v1/vouchers/{id}/files takes the multipart body directly and answers
 * 202 with the new file id — there is no need for the two-step /v1/files
 * upload the inbound importer uses. Verified live 2026-09-10.
 */
export async function attachVoucherFile(
  apiKey: string | null,
  voucherId: string,
  pdf: Uint8Array,
  filename: string,
): Promise<LexResult<{ id: string }>> {
  if (!apiKey) return fail<{ id: string }>(0, "lexoffice is not configured for this company", true);

  return throttled(apiKey, async () => {
    const form = new FormData();
    form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), filename);
    let res: Response;
    try {
      res = await fetch(`${LEXOFFICE_API}/vouchers/${voucherId}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        body: form,
      });
    } catch (e) {
      return fail<{ id: string }>(0, `lexoffice unreachable: ${(e as Error).message}`);
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) return fail<{ id: string }>(res.status, describeError(res.status, text));
    try {
      return { ok: true as const, data: JSON.parse(text) as { id: string } };
    } catch {
      return fail<{ id: string }>(res.status, "lexoffice returned a body that is not JSON");
    }
  });
}

// ─── Posting categories ───────────────────────────────────────────────────────

export type LexPostingCategory = {
  id: string;
  name: string;
  type: "income" | "outgo";
  contactRequired: boolean;
  splitAllowed: boolean;
  groupName: string;
};

/**
 * The fixed category list. lexoffice does not allow custom categories, which
 * is exactly why the accounting plan says to pick one with the tax adviser and
 * then never vary it: consistency is what lets the practice reclassify the
 * whole year in one move.
 */
export function listPostingCategories(apiKey: string | null): Promise<LexResult<LexPostingCategory[]>> {
  return request<LexPostingCategory[]>(apiKey, "GET", "/posting-categories");
}
