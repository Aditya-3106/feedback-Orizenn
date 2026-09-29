import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/primitives";
import { logoutAction } from "@/actions/auth";
import type { Actor } from "@/lib/security/authz";
import { can } from "@/lib/security/authz";
import { SidebarNav, type NavItem } from "./Sidebar";

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/campaigns", label: "Campaigns", icon: "list" },
  { href: "/admin/templates", label: "Templates", icon: "layers" },
  { href: "/admin/students", label: "Students", icon: "users" },
  { href: "/admin/exports", label: "Exports", icon: "download" },
];

export function AdminShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  const items = can(actor.role, "settings:manage") ? [...NAV, { href: "/admin/settings", label: "Settings", icon: "settings" as const }] : NAV;
  return (
    <div className="min-h-screen bg-orizenn-bg">
      <header className="sticky top-0 z-20 border-b border-orizenn-border bg-orizenn-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 md:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <Wordmark />
            <span className="hidden text-sm text-orizenn-subtle sm:inline">Feedback Intelligence</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm text-orizenn-ink">{actor.name || actor.email}</div>
              <div className="mono-label">{actor.role.replace("_", " ")}</div>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-orizenn-border bg-orizenn-surface px-3 py-4 md:flex">
          <SidebarNav items={items} variant="sidebar" />
          <div className="mt-auto px-2.5 pb-2">
            <div className="mono-label">Workspace</div>
            <div className="mt-1 truncate text-sm text-orizenn-muted">Orizenn</div>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      <SidebarNav items={items} variant="bottom" />
    </div>
  );
}
