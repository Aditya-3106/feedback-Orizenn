"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "./primitives";

/** LinkTabs that derive the active tab from the current pathname. */
export function ClientTabs({ items }: { items: Array<{ href: string; label: string; count?: number }> }) {
  const pathname = usePathname();
  // Longest matching href wins so "/x" doesn't shadow "/x/responses".
  const match = [...items].sort((a, b) => b.href.length - a.href.length).find((it) => pathname === it.href || pathname.startsWith(`${it.href}/`));
  return <LinkTabs items={items} current={match?.href ?? pathname} />;
}
