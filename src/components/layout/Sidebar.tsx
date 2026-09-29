"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/format";

export interface NavItem {
  href: string;
  label: string;
  icon: "grid" | "list" | "layers" | "users" | "download" | "settings";
}

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  grid: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  list: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h10" />
    </svg>
  ),
  layers: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 2 2 5l6 3 6-3-6-3Z" />
      <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <circle cx="11.5" cy="6" r="2" />
      <path d="M11 9.5c2 0 3.5 1.3 3.5 3.5" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 2v8m0 0 3-3m-3 3L5 7M2 12v2h12v-2" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  ),
};

export function SidebarNav({ items, variant }: { items: NavItem[]; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  if (variant === "bottom") {
    return (
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-orizenn-border bg-orizenn-surface md:hidden">
        <ul className="grid grid-cols-5">
          {items.slice(0, 5).map((it) => {
            const active = isActive(it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                    active ? "text-orizenn-blue" : "text-orizenn-muted",
                  )}
                >
                  {ICONS[it.icon]}
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5">
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-orizenn-blue-soft font-medium text-orizenn-blue"
                : "text-orizenn-muted hover:bg-orizenn-bg hover:text-orizenn-ink",
            )}
          >
            <span className={active ? "text-orizenn-blue" : "text-orizenn-subtle"}>{ICONS[it.icon]}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
