"use client";

import { useState } from "react";
import { installPreviewFetch } from "@/lib/preview-client";

/**
 * Mounted once in the portal layout. Renders nothing; its only job is to tag
 * portal fetches while the admin preview iframe is open, so client-loaded data
 * (add-ons, gallery, progression…) resolves as the previewed member rather
 * than silently as the admin.
 *
 * Installed during the first render rather than in an effect: a child's fetch
 * can fire before the parent's effects run, and the add-ons request is exactly
 * that kind of early call.
 */
export function PreviewBridge() {
  useState(() => {
    installPreviewFetch();
    return null;
  });
  return null;
}
