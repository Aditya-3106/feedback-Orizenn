import type { ReactNode } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { requireActorOrRedirect } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireActorOrRedirect("/admin");
  return <AdminShell actor={actor}>{children}</AdminShell>;
}
