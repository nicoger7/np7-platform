# NP7 Meta Ads MCP server

A small, self-contained [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes the Meta (Facebook / Instagram) **Marketing API** as tools an AI agent can call —
so Claude (and the openclaw agent) can read account performance and **draft well-targeted
campaigns** for you.

Built and owned in-house (informed by open-source designs, but no third-party code holds your
ad token). Targets **Graph/Marketing API v25.0** by default.

## Safety model — read this first

- **Everything is created `PAUSED`.** `create_campaign`, `create_adset`, and `create_ad` always
  force `status=PAUSED`. There is **no tool that sets a campaign to `ACTIVE`** — launching (and
  therefore spending) is a human action in [Ads Manager](https://adsmanager.facebook.com).
- **No update/delete tools** in v1. The agent can create drafts and read; it cannot mutate or
  remove existing live objects.
- **Custom-audience upload is intentionally excluded.** Uploading customer emails to build
  audiences has GDPR/consent implications — out of scope until we've cleared the legal/consent
  path. (See [[legal-framework-booking]] context.)
- The HTTP transport **refuses to start without a bearer token**, so a remote ads endpoint is
  never left open.

## Meta-side setup (you do this once — it's the part I can't)

1. **Business Manager** — confirm one exists at <https://business.facebook.com> → Business Settings.
2. **App** — <https://developers.facebook.com> → create a *Business*-type app → add the
   **Marketing API** product → copy **App ID** + **App Secret** (Settings → Basic).
3. **System User token** — Business Settings → Users → **System Users** → create one (Admin) →
   **Add Assets** → assign your **Ad Account** (full control) → **Generate token** → pick your app →
   scopes **`ads_management`, `ads_read`, `business_management`** → generate. *Shown once — save it.*
4. **Ad Account ID** — Business Settings → Accounts → Ad Accounts → the `act_XXXXXXXXX` value.
   (If you don't have one yet, create it + add a payment method first — that's the money side.)
5. **Page ID** — Business Settings → Accounts → Pages → your NP7 Page. Ads need a Page identity.

> For advertising **your own** ad account, an app in **Development** mode + a System User token is
> usually enough to *create* campaigns. Full App Review mainly raises rate limits and lets you
> manage *other* people's accounts — it is **not** a prerequisite to get started.

## Local setup

```bash
cd mcp/meta-ads
npm install
cp .env.example .env     # then fill in the 5 values above
npm run build
npm run doctor           # validates credentials by reading the ad account
```

`.env` is gitignored. Credentials are loaded from `mcp/meta-ads/.env` automatically, regardless
of which directory the server is launched from.

## Connecting from Claude Code (local, stdio)

Already wired in the repo-root [`.mcp.json`](../../.mcp.json):

```json
{ "mcpServers": { "meta-ads": { "command": "node", "args": ["mcp/meta-ads/dist/stdio.js"] } } }
```

Run `npm run build` once (so `dist/` exists), restart Claude Code, and the `meta-ads` tools appear.
No secrets live in `.mcp.json` — they come from `.env`.

## Connecting from the openclaw agent (remote, HTTP)

```bash
# set MCP_BEARER_TOKEN to a long random secret in .env, then:
npm run start:http        # listens on :8787/mcp, requires Authorization: Bearer <token>
```

Point any Streamable-HTTP MCP client at `http://<host>:8787/mcp` with header
`Authorization: Bearer <MCP_BEARER_TOKEN>`. For internet exposure, run it behind TLS (e.g. a
Vercel deployment or a tunnel) — the bearer token guards access but the channel should still be
encrypted. **Deploying this to Vercel is the remaining Phase-2 step.**

## Tools

| Tool | Kind | Notes |
| --- | --- | --- |
| `get_account_info` | read | Confirm credentials; name/currency/balance/spend cap. |
| `list_pages` | read | Find your Page ID. |
| `list_campaigns` / `list_adsets` / `list_ads` | read | Inventory with budgets + status. |
| `get_insights` | read | Metrics by account/campaign/adset/ad, with breakdowns. |
| `search_targeting` | read | Interests, behaviors, geo, locales (ids + audience sizes). |
| `get_targeting_estimate` | read | Delivery/reach estimate — size an audience before building. |
| `create_campaign` | write · **PAUSED** | Objective + optional CBO budget. |
| `create_adset` | write · **PAUSED** | Targeting, budget, schedule, optimization goal. |
| `create_creative` | write | Link creative; uploads `image_url` to an `image_hash` if needed. |
| `create_ad` | write · **PAUSED** | Links an ad set to a creative. |

## Build chain (how a draft campaign is assembled)

`create_campaign` → `create_adset` (with targeting from `search_targeting` /
`get_targeting_estimate`) → `create_creative` → `create_ad`. All structural objects land `PAUSED`;
you review the draft in Ads Manager and flip it live yourself.
