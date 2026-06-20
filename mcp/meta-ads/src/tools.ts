import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaApiError, MetaClient } from "./meta-client.js";

/** Render any value as a pretty-printed JSON text result. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Turn a thrown error into a readable, non-throwing tool result. */
function fail(err: unknown) {
  const e = err as MetaApiError;
  const detail =
    e instanceof MetaApiError
      ? { message: e.message, code: e.code, subcode: e.subcode, type: e.type, fbtrace_id: e.fbtraceId, http_status: e.httpStatus }
      : { message: (err as Error)?.message ?? String(err) };
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Meta API call failed:\n${JSON.stringify(detail, null, 2)}` }],
  };
}

/** Shared, intentionally loose targeting schema — hints common keys, allows the rest. */
const targetingSchema = z
  .object({
    geo_locations: z.any().optional(),
    excluded_geo_locations: z.any().optional(),
    age_min: z.number().int().min(13).max(65).optional(),
    age_max: z.number().int().min(13).max(65).optional(),
    genders: z.array(z.number().int()).optional(),
    locales: z.array(z.number().int()).optional(),
    interests: z.any().optional(),
    behaviors: z.any().optional(),
    flexible_spec: z.any().optional(),
    exclusions: z.any().optional(),
    custom_audiences: z.any().optional(),
    excluded_custom_audiences: z.any().optional(),
    publisher_platforms: z.array(z.string()).optional(),
    facebook_positions: z.array(z.string()).optional(),
    instagram_positions: z.array(z.string()).optional(),
    device_platforms: z.array(z.string()).optional(),
  })
  .passthrough();

const promotedObjectSchema = z
  .object({
    page_id: z.string().optional(),
    pixel_id: z.string().optional(),
    custom_event_type: z.string().optional(),
    application_id: z.string().optional(),
    object_store_url: z.string().optional(),
  })
  .passthrough();

export function registerTools(server: McpServer, client: MetaClient): void {
  // ─────────────────────────────────────────────────────────────────────────
  // READ TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "get_account_info",
    {
      title: "Get ad account info",
      description:
        "Fetch the configured ad account: name, status, currency, timezone, balance, amount spent, spend cap. Use this first to confirm credentials work.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.get(client.account, {
          fields:
            "name,account_status,currency,timezone_name,balance,amount_spent,spend_cap,business_name,disable_reason",
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_pages",
    {
      title: "List Facebook Pages",
      description:
        "List Facebook Pages available to this token (publishing identity for ads). If empty, set META_PAGE_ID manually from Business Settings → Pages.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.get("me/accounts", { fields: "id,name,category,tasks", limit: 100 });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "List campaigns",
      description: "List campaigns in the ad account with budget, objective and status.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).optional(),
        effective_status: z
          .array(z.string())
          .optional()
          .describe('Optional filter, e.g. ["ACTIVE","PAUSED"].'),
      },
    },
    async ({ limit, effective_status }) => {
      try {
        const data = await client.get(`${client.account}/campaigns`, {
          fields:
            "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,special_ad_categories,created_time",
          limit: limit ?? 50,
          effective_status,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_adsets",
    {
      title: "List ad sets",
      description: "List ad sets, optionally scoped to one campaign.",
      inputSchema: {
        campaign_id: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ campaign_id, limit }) => {
      try {
        const node = campaign_id ? `${campaign_id}/adsets` : `${client.account}/adsets`;
        const data = await client.get(node, {
          fields:
            "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,bid_strategy,targeting,start_time,end_time",
          limit: limit ?? 50,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_ads",
    {
      title: "List ads",
      description: "List ads, optionally scoped to one ad set.",
      inputSchema: {
        adset_id: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ adset_id, limit }) => {
      try {
        const node = adset_id ? `${adset_id}/ads` : `${client.account}/ads`;
        const data = await client.get(node, {
          fields: "id,name,adset_id,status,effective_status,creative,created_time",
          limit: limit ?? 50,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_insights",
    {
      title: "Get performance insights",
      description:
        "Performance metrics at account/campaign/adset/ad level. Defaults to the account, last 30 days.",
      inputSchema: {
        object_id: z.string().optional().describe("Campaign/adset/ad id. Omit for the whole account."),
        level: z.enum(["account", "campaign", "adset", "ad"]).optional(),
        date_preset: z
          .string()
          .optional()
          .describe('e.g. "today", "last_7d", "last_30d", "this_month", "maximum".'),
        time_range: z
          .object({ since: z.string(), until: z.string() })
          .optional()
          .describe('Explicit {since:"YYYY-MM-DD", until:"YYYY-MM-DD"} overrides date_preset.'),
        fields: z.string().optional(),
        breakdowns: z.string().optional().describe('e.g. "age,gender" or "publisher_platform".'),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ object_id, level, date_preset, time_range, fields, breakdowns, limit }) => {
      try {
        const data = await client.get(`${object_id ?? client.account}/insights`, {
          level: level ?? "account",
          fields:
            fields ??
            "impressions,reach,clicks,spend,ctr,cpc,cpm,frequency,actions,cost_per_action_type",
          date_preset: time_range ? undefined : date_preset ?? "last_30d",
          time_range,
          breakdowns,
          limit: limit ?? 100,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "search_targeting",
    {
      title: "Search targeting options",
      description:
        "Search interests, behaviors, geo locations, or locales for building a targeting spec. Returns ids + audience sizes.",
      inputSchema: {
        type: z.enum(["adinterest", "adTargetingCategory", "adgeolocation", "adlocale"]),
        query: z.string(),
        targeting_class: z
          .string()
          .optional()
          .describe('For adTargetingCategory: "interests" | "behaviors" | "life_events" | "industries" ...'),
        location_types: z
          .array(z.string())
          .optional()
          .describe('For adgeolocation, e.g. ["country","region","city","zip"].'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ type, query, targeting_class, location_types, limit }) => {
      try {
        const data = await client.get("search", {
          type,
          q: query,
          class: targeting_class,
          location_types,
          limit: limit ?? 25,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_targeting_estimate",
    {
      title: "Estimate audience reach",
      description:
        "Delivery estimate (daily/monthly reach) for a targeting spec + optimization goal. Use to check an audience is well-sized before creating an ad set.",
      inputSchema: {
        optimization_goal: z.string().describe('e.g. "LINK_CLICKS", "OFFSITE_CONVERSIONS", "LEAD_GENERATION".'),
        targeting: targetingSchema,
      },
    },
    async ({ optimization_goal, targeting }) => {
      try {
        const data = await client.get(`${client.account}/delivery_estimate`, {
          optimization_goal,
          targeting_spec: targeting,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE TOOLS — everything is created PAUSED. There is intentionally no tool
  // that sets status to ACTIVE; launching is done by a human in Ads Manager.
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "create_campaign",
    {
      title: "Create campaign (PAUSED)",
      description:
        "Create a PAUSED campaign. Leave budgets unset to budget at the ad-set level; set a budget here for campaign budget optimization (CBO).",
      inputSchema: {
        name: z.string(),
        objective: z.enum([
          "OUTCOME_AWARENESS",
          "OUTCOME_TRAFFIC",
          "OUTCOME_ENGAGEMENT",
          "OUTCOME_LEADS",
          "OUTCOME_SALES",
          "OUTCOME_APP_PROMOTION",
        ]),
        special_ad_categories: z
          .array(z.string())
          .optional()
          .describe('Default []. Use e.g. ["HOUSING"],["EMPLOYMENT"],["CREDIT"] only if legally required.'),
        daily_budget: z.number().int().optional().describe("Minor units (cents). Campaign-level CBO."),
        lifetime_budget: z.number().int().optional().describe("Minor units (cents). Campaign-level CBO."),
        bid_strategy: z
          .enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"])
          .optional(),
      },
    },
    async ({ name, objective, special_ad_categories, daily_budget, lifetime_budget, bid_strategy }) => {
      try {
        const data = await client.post(`${client.account}/campaigns`, {
          name,
          objective,
          status: "PAUSED",
          special_ad_categories: special_ad_categories ?? [],
          daily_budget,
          lifetime_budget,
          bid_strategy,
        });
        return ok({ ...data, _note: "Created PAUSED. Review and launch in Ads Manager." });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_adset",
    {
      title: "Create ad set (PAUSED)",
      description:
        "Create a PAUSED ad set under a campaign with targeting, budget and schedule. Use get_targeting_estimate first to sanity-check audience size.",
      inputSchema: {
        campaign_id: z.string(),
        name: z.string(),
        optimization_goal: z.string(),
        billing_event: z.string().describe('Usually "IMPRESSIONS" or "LINK_CLICKS".'),
        targeting: targetingSchema,
        daily_budget: z.number().int().optional().describe("Minor units (cents). Omit if using campaign CBO."),
        lifetime_budget: z.number().int().optional().describe("Minor units (cents). Requires end_time."),
        bid_amount: z.number().int().optional().describe("Minor units (cents). Required for some bid strategies."),
        bid_strategy: z
          .enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"])
          .optional(),
        start_time: z.string().optional().describe("ISO 8601."),
        end_time: z.string().optional().describe("ISO 8601. Required with lifetime_budget."),
        promoted_object: promotedObjectSchema.optional(),
        destination_type: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const data = await client.post(`${client.account}/adsets`, {
          ...args,
          status: "PAUSED",
        });
        return ok({ ...data, _note: "Created PAUSED. Review and launch in Ads Manager." });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_creative",
    {
      title: "Create ad creative",
      description:
        "Create a link ad creative (object_story_spec). Provide image_hash, or image_url to upload first. page_id defaults to META_PAGE_ID.",
      inputSchema: {
        name: z.string(),
        link: z.string().url(),
        message: z.string().optional().describe("Primary text."),
        headline: z.string().optional().describe("Bold title under the image."),
        description: z.string().optional(),
        image_hash: z.string().optional(),
        image_url: z.string().url().optional().describe("Uploaded to the account if image_hash is absent."),
        call_to_action_type: z.string().optional().describe('e.g. "LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL".'),
        page_id: z.string().optional(),
        instagram_actor_id: z.string().optional(),
      },
    },
    async ({ name, link, message, headline, description, image_hash, image_url, call_to_action_type, page_id, instagram_actor_id }) => {
      try {
        const pageId = page_id ?? client.pageId;
        if (!pageId) {
          return fail(new Error("No page_id provided and META_PAGE_ID is not set."));
        }
        let hash = image_hash;
        if (!hash && image_url) {
          hash = (await client.uploadImageFromUrl(image_url)).hash;
        }
        const object_story_spec: Record<string, unknown> = {
          page_id: pageId,
          instagram_actor_id,
          link_data: {
            link,
            message,
            name: headline,
            description,
            image_hash: hash,
            call_to_action: call_to_action_type
              ? { type: call_to_action_type, value: { link } }
              : undefined,
          },
        };
        const data = await client.post(`${client.account}/adcreatives`, {
          name,
          object_story_spec,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_ad",
    {
      title: "Create ad (PAUSED)",
      description: "Create a PAUSED ad linking an ad set to an existing creative.",
      inputSchema: {
        adset_id: z.string(),
        name: z.string(),
        creative_id: z.string(),
      },
    },
    async ({ adset_id, name, creative_id }) => {
      try {
        const data = await client.post(`${client.account}/ads`, {
          name,
          adset_id,
          creative: { creative_id },
          status: "PAUSED",
        });
        return ok({ ...data, _note: "Created PAUSED. Review and launch in Ads Manager." });
      } catch (err) {
        return fail(err);
      }
    },
  );
}
