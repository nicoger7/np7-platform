"use client";

import { useEffect, useRef } from "react";

/**
 * Records "a human opened this" from the browser, once, after the page has
 * actually rendered.
 *
 * The pages this sits on used to stamp `opened` while serving the GET, which
 * made the metric a lie: a mail gateway pre-fetching the link, a WhatsApp or
 * Slack preview card, any prefetcher, all counted as an open. Same root cause
 * as the login links a scanner was spending before the guest ever clicked.
 * A POST from a mounted client component needs a real browser with JavaScript,
 * which is as close to "a person looked at this" as we can honestly get.
 */
export function StampOpened({ url }: { url: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [url]);
  return null;
}
