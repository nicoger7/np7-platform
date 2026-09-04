"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminEnv } from "@/app/admin/env-context";

/**
 * The old address, kept so nothing 404s.
 *
 * "/admin/finance" read like one set of books for the whole of NP7, and it
 * never was: it showed whichever company the sidebar happened to be in. Every
 * budget now lives under the company it belongs to, and this sends you to the
 * one you are looking at.
 */
export default function LegacyFinanceRedirect() {
  const router = useRouter();
  const env = useAdminEnv();
  useEffect(() => {
    router.replace(env === "hardware" ? "/admin/performance/finance" : "/admin/experience/finance");
  }, [router, env]);
  return <p className="p-6 text-sm admin-muted">Taking you to the right company&rsquo;s budget…</p>;
}
