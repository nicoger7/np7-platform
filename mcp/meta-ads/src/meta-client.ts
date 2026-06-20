import { appSecretProof, type MetaConfig } from "./config.js";

/** Meta error codes that are safe to retry (rate limits + transient server errors). */
const RETRYABLE_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80004]);
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const MIN_REQUEST_GAP_MS = 200;

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly type?: string,
    readonly fbtraceId?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

type Params = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Thin, transport-agnostic wrapper over the Meta Graph / Marketing API.
 *
 * Deliberately small: tools build the field/param objects and this client just
 * signs, sends, backs off on rate limits, and surfaces clean errors. Objects
 * and arrays in params are JSON-encoded the way Graph expects.
 */
export class MetaClient {
  private readonly base: string;
  private lastRequestAt = 0;

  constructor(private readonly cfg: MetaConfig) {
    this.base = `https://graph.facebook.com/${cfg.apiVersion}`;
  }

  /** The ad account node, e.g. `act_123456789`. */
  get account(): string {
    return this.cfg.adAccountId;
  }

  get pageId(): string | undefined {
    return this.cfg.pageId;
  }

  get apiVersion(): string {
    return this.cfg.apiVersion;
  }

  get<T = any>(node: string, params: Params = {}): Promise<T> {
    return this.request<T>("GET", node, params);
  }

  post<T = any>(node: string, params: Params = {}): Promise<T> {
    return this.request<T>("POST", node, params);
  }

  private auth(): URLSearchParams {
    const auth = new URLSearchParams();
    auth.set("access_token", this.cfg.accessToken);
    if (this.cfg.appSecret) {
      auth.set("appsecret_proof", appSecretProof(this.cfg.accessToken, this.cfg.appSecret));
    }
    return auth;
  }

  private static encode(params: Params): URLSearchParams {
    const out = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      out.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    return out;
  }

  private async throttle(): Promise<void> {
    const gap = Date.now() - this.lastRequestAt;
    if (gap < MIN_REQUEST_GAP_MS) await sleep(MIN_REQUEST_GAP_MS - gap);
    this.lastRequestAt = Date.now();
  }

  /** Inspect Business-Use-Case headers; pause briefly if we're near a limit. */
  private async respectUsageHeaders(res: Response): Promise<void> {
    const header =
      res.headers.get("x-business-use-case-usage") ||
      res.headers.get("x-ad-account-usage") ||
      res.headers.get("x-app-usage");
    if (!header) return;
    try {
      const parsed = JSON.parse(header);
      const peak = (obj: Record<string, unknown>): number => {
        let max = 0;
        for (const v of Object.values(obj)) {
          if (typeof v === "number") max = Math.max(max, v);
          else if (Array.isArray(v)) for (const item of v) max = Math.max(max, peak(item));
          else if (v && typeof v === "object") max = Math.max(max, peak(v as Record<string, unknown>));
        }
        return max;
      };
      if (peak(parsed) >= 75) await sleep(2000);
    } catch {
      /* header not JSON — ignore */
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    node: string,
    params: Params,
    attempt = 0,
  ): Promise<T> {
    await this.throttle();

    const url = new URL(`${this.base}/${node.replace(/^\//, "")}`);
    for (const [k, v] of this.auth()) url.searchParams.set(k, v);

    let body: URLSearchParams | undefined;
    if (method === "GET") {
      for (const [k, v] of MetaClient.encode(params)) url.searchParams.set(k, v);
    } else {
      body = MetaClient.encode(params);
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        body,
        headers: body
          ? { "content-type": "application/x-www-form-urlencoded" }
          : undefined,
      });
    } catch (err) {
      // Network error — retry with backoff.
      if (attempt < MAX_RETRIES) {
        await sleep(2 ** attempt * 1000);
        return this.request<T>(method, node, params, attempt + 1);
      }
      throw new MetaApiError(`Network error calling Meta: ${(err as Error).message}`);
    }

    await this.respectUsageHeaders(res);

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new MetaApiError(
        `Non-JSON response from Meta (HTTP ${res.status}): ${text.slice(0, 300)}`,
        undefined,
        undefined,
        undefined,
        undefined,
        res.status,
      );
    }

    if (json?.error || !res.ok) {
      const e = json?.error ?? {};
      const code: number | undefined = e.code;
      const retryable =
        RETRYABLE_HTTP_STATUS.has(res.status) ||
        (code !== undefined && RETRYABLE_ERROR_CODES.has(code)) ||
        e.is_transient === true;

      if (retryable && attempt < MAX_RETRIES) {
        await sleep(2 ** attempt * 1000);
        return this.request<T>(method, node, params, attempt + 1);
      }

      throw new MetaApiError(
        e.message || `Meta API error (HTTP ${res.status})`,
        code,
        e.error_subcode,
        e.type,
        e.fbtrace_id,
        res.status,
      );
    }

    return json as T;
  }

  /** Upload an image from a public URL and return its `image_hash`. */
  async uploadImageFromUrl(imageUrl: string): Promise<{ hash: string; url: string }> {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      throw new MetaApiError(`Could not fetch image_url (HTTP ${resp.status}): ${imageUrl}`);
    }
    const bytes = Buffer.from(await resp.arrayBuffer()).toString("base64");
    const result = await this.post<{ images: Record<string, { hash: string; url: string }> }>(
      `${this.account}/adimages`,
      { bytes },
    );
    const first = Object.values(result.images ?? {})[0];
    if (!first?.hash) throw new MetaApiError("Image upload succeeded but no hash returned.");
    return first;
  }
}
