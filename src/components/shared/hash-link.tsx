"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A link to a place ON THIS PAGE has to be a plain <a>. next/link cannot do it.
 *
 * Next only performs the fragment scroll when the hash CHANGES. The check is
 * `url.hash !== oldUrl.hash` (next/dist/client/components/segment-cache/
 * navigation.js), and it gates the one branch that sets forceScroll and a fresh
 * scroll ref. With the same hash already in the address bar, navigation falls
 * through to the default branch, no segment is newly navigated, and
 * handlePotentialScroll bails on `!scrollRef.current` before it ever reaches
 * domNode.scrollIntoView(). Instrumented: 0 calls on a dead click, 1 on a live
 * one. No error, no warning, the click is simply eaten.
 *
 * Which made the whole landing page feel broken, because the site's own header
 * points at /experience#experiences. Arriving through the nav put the hash in
 * the URL before the visitor clicked anything, so every CTA on the page below
 * was already dead on the first press: "Explore experiences", "Find your week",
 * "Find your trip", "Book a trip", "Reserve my spot". Press again and still
 * nothing, for ever, because the hash never changes again.
 *
 * A plain <a> hands it back to the browser, which jumps to a fragment whether
 * or not the URL already names it.
 *
 * So: same page, plain <a>. Different page, keep next/link, because that is a
 * real navigation and a full document load for it would be a waste.
 */
export function HashLink({
  href,
  children,
  ...rest
}: { href: string; children: React.ReactNode } & Omit<React.ComponentPropsWithoutRef<"a">, "href">) {
  const pathname = usePathname();
  const [path, hash] = splitHash(href);
  // Hash-only ("#packages"), or pointing at the page we are already on.
  const samePage = !!hash && (path === "" || path === pathname);
  if (samePage) return <a href={`#${hash}`} {...rest}>{children}</a>;
  return <Link href={href} {...rest}>{children}</Link>;
}

function splitHash(href: string): [string, string] {
  const i = href.indexOf("#");
  if (i < 0) return [href, ""];
  return [href.slice(0, i), href.slice(i + 1)];
}
