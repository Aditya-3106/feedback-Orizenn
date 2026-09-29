"use client";

import { useState } from "react";
import { Notice } from "@/components/ui/primitives";
import { EXPORT_TYPES, EXPORT_TYPE_LABELS, type ExportType } from "@/lib/validation/export";

interface Options {
  college: string[];
  branch: string[];
  year: string[];
  projectType: string[];
}

export function ExportForm({
  campaignId,
  options,
  versions,
}: {
  campaignId: string;
  options: Options;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
}) {
  const [type, setType] = useState<ExportType>("FULL_WORKBOOK");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "COMPLETED" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ fileName: string; rows: number } | null>(null);

  const set = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  async function generate() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const cleaned = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
      const res = await fetch(`/api/campaigns/${campaignId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, filters: cleaned }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "The export couldn't be generated.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "export.xlsx";
      const rows = Number(res.headers.get("X-Export-Rows") ?? 0);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone({ fileName, rows });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The export couldn't be generated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="label mb-2">What to export</legend>
        {EXPORT_TYPES.map((t) => (
          <label key={t} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${type === t ? "border-orizenn-blue bg-orizenn-blue-soft/40" : "border-orizenn-border"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-orizenn-ink">{EXPORT_TYPE_LABELS[t].title}</span>
              <span className="hint">{EXPORT_TYPE_LABELS[t].description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="label mb-1">Filters</legend>
        <p className="hint">The workbook contains exactly the filtered dataset. Leave everything blank for all completed responses.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Version">
            <select className="input" value={filters.versionId ?? ""} onChange={(e) => set("versionId", e.target.value)}>
              <option value="">Current published</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} · {v.status.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className="input" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className="input" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value)} />
          </Field>
          {(["college", "branch", "year", "projectType"] as const).map((k) =>
            options[k].length ? (
              <Field key={k} label={k === "projectType" ? "Project type" : k.charAt(0).toUpperCase() + k.slice(1)}>
                <select className="input" value={filters[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
                  <option value="">Any</option>
                  {options[k].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null,
          )}
          <Field label="Response status">
            <select className="input" value={filters.status ?? "COMPLETED"} onChange={(e) => set("status", e.target.value)}>
              {["COMPLETED", "IN_PROGRESS", "ABANDONED", "INVALID"].map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orizenn usage">
            <select className="input" value={filters.usage ?? ""} onChange={(e) => set("usage", e.target.value)}>
              <option value="">Any</option>
              <option value="VERIFIED">Verified</option>
              <option value="NOT_VERIFIED">Not verified</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={generate} aria-busy={busy}>
          {busy ? "Generating…" : "Generate Export"}
        </button>
        <span className="hint">Format: Excel (.xlsx)</span>
      </div>

      {error ? (
        <Notice tone="danger" title="The export couldn't be generated." action={<button type="button" className="btn-secondary btn-sm" onClick={generate}>Try Again</button>}>
          {error}
        </Notice>
      ) : null}
      {done ? (
        <Notice tone="success" title="Export ready.">
          {done.fileName} · {done.rows} {done.rows === 1 ? "row" : "rows"}. Your browser has downloaded the file.
        </Notice>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
