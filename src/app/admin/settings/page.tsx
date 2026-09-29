import { redirect } from "next/navigation";
import { RoleSelect, UserForm } from "@/components/settings/UserForm";
import { KeyValue, PageHeader, Section } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { can } from "@/lib/security/authz";
import { formatDateTime } from "@/lib/utils/format";
import { getWorkspace, listAuditLog, listUsers } from "@/lib/workspace/service";

export default async function SettingsPage() {
  const actor = await requireActorOrRedirect("/admin/settings");
  if (!can(actor.role, "settings:manage")) redirect("/admin");
  const [workspace, users, log] = await Promise.all([getWorkspace(actor), listUsers(actor), listAuditLog(actor, 40)]);

  return (
    <div className="space-y-6 fade-in">
      <PageHeader eyebrow="Settings" title="Workspace" description="Admins, roles and the audit trail for this workspace." />

      <Section title="Workspace">
        <KeyValue
          items={[
            { label: "Name", value: workspace.name },
            { label: "Slug", value: <span className="font-mono text-xs">{workspace.slug}</span> },
            { label: "Created", value: formatDateTime(workspace.createdAt) },
            { label: "AI provider", value: <span className="font-mono text-xs">{process.env.AI_PROVIDER ?? "stub"}</span> },
          ]}
        />
      </Section>

      <Section title="Team" description="Super admins manage users; admins run campaigns; analysts have read-only access plus export.">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-orizenn-muted">{u.email}</td>
                  <td>
                    <RoleSelect userId={u.id} role={u.role} disabled={u.id === actor.userId} />
                  </td>
                  <td className="text-orizenn-muted">{formatDateTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 border-t border-orizenn-border pt-6">
          <h3 className="mb-3 text-sm font-medium">Add a user</h3>
          <UserForm />
        </div>
      </Section>

      <Section title="Audit log" description="Most recent 40 actions.">
        {log.length === 0 ? (
          <p className="hint">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-orizenn-border text-sm">
            {log.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-mono text-[11px] text-orizenn-blue">{e.action}</span>{" "}
                  <span className="text-orizenn-muted">
                    {e.entityType} · {e.user?.name ?? "system"}
                  </span>
                </span>
                <span className="hint">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
