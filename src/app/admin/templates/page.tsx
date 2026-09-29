import { TemplateActions } from "@/components/templates/TemplateActions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/forms/definitions";
import { can } from "@/lib/security/authz";
import { listTemplates } from "@/lib/templates/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const actor = await requireActorOrRedirect("/admin/templates");
  const { archived } = await searchParams;
  const templates = await listTemplates(actor, archived === "1");
  const canManage = can(actor.role, "templates:manage");

  return (
    <div className="space-y-6 fade-in">
      <PageHeader
        eyebrow="Templates"
        title="Form templates"
        description="Complete questionnaires you can start a campaign from. Templates are separate from campaign versions: using one clones its questions into a new draft."
        actions={
          <a href={archived === "1" ? "/admin/templates" : "/admin/templates?archived=1"} className="btn-secondary btn-sm">
            {archived === "1" ? "Hide archived" : "Show archived"}
          </a>
        }
      />

      {templates.length === 0 ? (
        <EmptyState title="No templates yet." description="Open any campaign's Versions tab and choose “Save as template” to create one." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => {
            const questions = Array.isArray(t.questionsJson) ? (t.questionsJson as Array<{ text?: string; type?: string }>) : [];
            return (
              <li key={t.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl text-orizenn-ink">{t.name}</h2>
                    <p className="hint mt-1">
                      {questions.length} questions · updated {formatDateTime(t.updatedAt)}
                    </p>
                    {t.description ? <p className="mt-2 text-sm text-orizenn-muted">{t.description}</p> : null}
                  </div>
                  {t.archived ? <StatusBadge status="ARCHIVED" /> : null}
                </div>
                <ol className="mt-4 flex-1 space-y-1.5">
                  {questions.slice(0, 5).map((q, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="font-mono text-[11px] text-orizenn-subtle">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate text-orizenn-ink">{q.text}</span>
                      <span className="hint shrink-0">{q.type ? QUESTION_TYPE_LABELS[q.type as QuestionType] ?? q.type : ""}</span>
                    </li>
                  ))}
                  {questions.length > 5 ? <li className="hint">+{questions.length - 5} more</li> : null}
                </ol>
                {canManage ? (
                  <div className="mt-4 border-t border-orizenn-border pt-4">
                    <TemplateActions template={{ id: t.id, name: t.name, description: t.description, archived: t.archived }} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
