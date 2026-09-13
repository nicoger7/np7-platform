/**
 * /admin/bank is /admin/payments now.
 *
 * Nico, 2026-09-13: "bank and payments are one thing basically." The feed that
 * used to live here is the first view of the Payments page; nothing was
 * removed, only the second door. A 308 rather than a soft redirect, so a
 * bookmark, a link in a cost line and a browser's history all learn the new
 * address once and stop asking.
 */
import { permanentRedirect } from "next/navigation";

export default function BankPage() {
  permanentRedirect("/admin/payments");
}
