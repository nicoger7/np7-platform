import "server-only";
import { NextRequest } from "next/server";

/**
 * Shared Bearer check for the wind.coach READ endpoints (trips + riders).
 *
 * Same secret as the guide push and the skill webhook, used the way the skill
 * webhook uses it: `Authorization: Bearer <WINDCOACH_WEBHOOK_SECRET>`. These
 * endpoints hand out participant NAMES, so they are server-to-server only —
 * wind.coach proxies them from its own backend and never from a browser.
 *
 * Fails closed: no secret configured, no service.
 */
export function windcoachAuthorized(req: NextRequest): boolean {
  const secret = process.env.WINDCOACH_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
