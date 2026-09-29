"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { updateDraftMetaAction } from "@/actions/forms";
import {
  addQuestionAction,
  addQuestionsAction,
  deleteQuestionAction,
  duplicateQuestionAction,
  reorderQuestionsAction,
  updateQuestionAction,
} from "@/actions/questions";
import { Flash, useFlash } from "@/components/ui/client";
import { EmptyState, Notice } from "@/components/ui/primitives";
import type { FieldErrors } from "@/lib/api/errors";
import { estimateMinutes, type QuestionDefinition } from "@/lib/forms/definitions";
import type { QuestionDraftInput } from "@/lib/validation/question";
import { AIQuestionGenerator } from "./AIQuestionGenerator";
import { PublishDialog } from "./PublishDialog";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionList } from "./QuestionList";

const NEW_QUESTION: QuestionDraftInput = {
  text: "New question",
  type: "RATING",
  required: true,
  validation: { min: 1, max: 5 },
  analytics: { displayPriority: 100, showInSummary: true },
  options: [],
};

export function FormBuilder({
  campaignId,
  campaignName,
  campaignGoal,
  version,
  initialQuestions,
  canPublish,
  canUseAI,
  publicBaseUrl,
}: {
  campaignId: string;
  campaignName: string;
  campaignGoal: string;
  version: { id: string; versionNumber: number; introText: string | null };
  initialQuestions: QuestionDefinition[];
  canPublish: boolean;
  canUseAI: boolean;
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const { message, flash } = useFlash();
  const [questions, setQuestions] = useState(initialQuestions);
  const [selectedId, setSelectedId] = useState<string | null>(initialQuestions[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors | undefined>();
  const [dirty, setDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [intro, setIntro] = useState(version.introText ?? "");
  const [introSaved, setIntroSaved] = useState(version.introText ?? "");
  /** Bumped after every persisted change so the editor remounts with normalized server state. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const selected = questions.find((q) => q.id === selectedId) ?? null;

  const guardDirty = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("You have unsaved changes to this question. Discard them?");
  }, [dirty]);

  async function addBlank() {
    if (!guardDirty()) return;
    setSaving(true);
    const r = await addQuestionAction(version.id, campaignId, NEW_QUESTION);
    setSaving(false);
    if (!r.success) return flash({ tone: "danger", text: r.error.message });
    setQuestions((qs) => [...qs, r.data]);
    setSelectedId(r.data.id);
    setDirty(false);
  }

  async function save(draft: QuestionDraftInput) {
    if (!selected) return;
    setSaving(true);
    setServerErrors(undefined);
    const r = await updateQuestionAction(selected.id, campaignId, draft);
    setSaving(false);
    if (!r.success) {
      setServerErrors(r.error.fields ?? { _form: [r.error.message] });
      return;
    }
    setQuestions((qs) => qs.map((q) => (q.id === r.data.id ? r.data : q)));
    setDirty(false);
    setRevision((n) => n + 1);
    flash({ tone: "success", text: "Question saved." });
  }

  async function remove() {
    if (!selected) return;
    setSaving(true);
    const r = await deleteQuestionAction(selected.id, campaignId);
    setSaving(false);
    if (!r.success) throw new Error(r.error.message);
    const idx = questions.findIndex((q) => q.id === selected.id);
    const next = questions.filter((q) => q.id !== selected.id).map((q, i) => ({ ...q, position: i }));
    setQuestions(next);
    setSelectedId(next[Math.min(idx, next.length - 1)]?.id ?? null);
    setDirty(false);
  }

  async function duplicate() {
    if (!selected) return;
    setSaving(true);
    const r = await duplicateQuestionAction(selected.id, campaignId);
    setSaving(false);
    if (!r.success) return flash({ tone: "danger", text: r.error.message });
    const idx = questions.findIndex((q) => q.id === selected.id);
    const next = [...questions];
    next.splice(idx + 1, 0, r.data);
    setQuestions(next.map((q, i) => ({ ...q, position: i })));
    setSelectedId(r.data.id);
    setDirty(false);
  }

  async function reorder(orderedIds: string[]) {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const previous = questions;
    setQuestions(orderedIds.map((id, i) => ({ ...byId.get(id)!, position: i })));
    const r = await reorderQuestionsAction(version.id, campaignId, orderedIds);
    if (!r.success) {
      setQuestions(previous);
      flash({ tone: "danger", text: r.error.message });
    }
  }

  async function addMany(drafts: QuestionDraftInput[]) {
    const r = await addQuestionsAction(version.id, campaignId, drafts);
    if (!r.success) throw new Error(r.error.message);
    setQuestions((qs) => [...qs, ...r.data]);
    setSelectedId(r.data[0]?.id ?? selectedId);
    flash({ tone: "success", text: `${r.data.length} ${r.data.length === 1 ? "question" : "questions"} added.` });
  }

  async function saveIntro() {
    const r = await updateDraftMetaAction(version.id, campaignId, { introText: intro.trim() || null });
    if (r.success) {
      setIntroSaved(intro);
      flash({ tone: "success", text: "Intro saved." });
    } else flash({ tone: "danger", text: r.error.message });
  }

  const minutes = estimateMinutes(questions);

  return (
    <div className="space-y-4">
      <Flash message={message} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mono-label">
            <Link href={`/admin/campaigns/${campaignId}`} className="hover:text-orizenn-ink">
              {campaignName}
            </Link>{" "}
            / draft v{version.versionNumber}
          </div>
          <h1 className="mt-1 font-display text-3xl text-orizenn-ink">Form builder</h1>
          <p className="hint mt-1">
            {questions.length} {questions.length === 1 ? "question" : "questions"} · ~{minutes} min · changes save per question
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUseAI ? (
            <button type="button" className="btn-secondary" onClick={() => setAiOpen(true)}>
              Ask AI
            </button>
          ) : null}
          <Link href={`/admin/campaigns/${campaignId}/preview?version=${version.id}`} className="btn-secondary" onClick={(e) => { if (!guardDirty()) e.preventDefault(); }}>
            Preview
          </Link>
          {canPublish ? (
            <button type="button" className="btn-primary" onClick={() => { if (guardDirty()) setPublishOpen(true); }} disabled={questions.length === 0}>
              Publish
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="card flex flex-col p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="mono-label">Questions</span>
            <button type="button" className="btn-primary btn-sm" onClick={addBlank} disabled={saving}>
              + Add
            </button>
          </div>
          {questions.length === 0 ? (
            <p className="hint px-1 py-4">No questions yet. Add one or ask AI.</p>
          ) : (
            <QuestionList
              questions={questions}
              selectedId={selectedId}
              onSelect={(id) => {
                if (id === selectedId || guardDirty()) {
                  setSelectedId(id);
                  setDirty(false);
                  setServerErrors(undefined);
                }
              }}
              onReorder={reorder}
              disabled={saving}
            />
          )}
          <div className="mt-4 border-t border-orizenn-border pt-3">
            <label htmlFor="intro" className="mono-label">
              Form intro
            </label>
            <textarea id="intro" rows={3} className="input mt-1 text-xs" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="We want to understand what your experience actually looked like." maxLength={600} />
            <button type="button" className="btn-ghost btn-sm mt-1" onClick={saveIntro} disabled={intro === introSaved}>
              Save intro
            </button>
          </div>
        </aside>

        <section className="card p-5">
          {selected ? (
            <QuestionEditor key={`${selected.id}:${revision}`} question={selected} index={questions.findIndex((q) => q.id === selected.id)} saving={saving} serverErrors={serverErrors} onSave={save} onDelete={remove} onDuplicate={duplicate} onDirtyChange={setDirty} />
          ) : questions.length === 0 ? (
            <EmptyState compact title="Start with a question." description="Add a question manually or describe your goal and let AI suggest a first draft. Every suggestion is reviewed before it is added." action={<div className="flex gap-2"><button type="button" className="btn-primary" onClick={addBlank}>Add question</button>{canUseAI ? <button type="button" className="btn-secondary" onClick={() => setAiOpen(true)}>Ask AI</button> : null}</div>} />
          ) : (
            <Notice tone="info">Select a question to edit it.</Notice>
          )}
        </section>
      </div>

      {canUseAI ? <AIQuestionGenerator open={aiOpen} onClose={() => setAiOpen(false)} versionId={version.id} defaultGoal={campaignGoal} onAdd={addMany} /> : null}
      {canPublish ? (
        <PublishDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          campaignId={campaignId}
          campaignName={campaignName}
          versionId={version.id}
          versionNumber={version.versionNumber}
          questions={questions}
          publicBaseUrl={publicBaseUrl}
          onSelectQuestion={(id) => {
            setSelectedId(id);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
