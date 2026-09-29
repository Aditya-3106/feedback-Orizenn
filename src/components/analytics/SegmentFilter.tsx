"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils/format";

export interface SegmentFilterOptions {
  college: string[];
  branch: string[];
  year: string[];
  projectType: string[];
}

export interface VersionOption {
  id: string;
  versionNumber: number;
  status: string;
}

export interface SegmentQuestionOption {
  id: string;
  text: string;
}

const FILTER_KEYS = ["from", "to", "college", "branch", "year", "projectType", "usage", "segmentBy"] as const;

const USAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "VERIFIED", label: "Verified users" },
  { value: "NOT_VERIFIED", label: "Not verified" },
  { value: "UNKNOWN", label: "Unknown" },
];

const RESPONDENT_SEGMENTS: Array<{ value: string; label: string }> = [
  { value: "college", label: "College" },
  { value: "branch", label: "Branch" },
  { value: "year", label: "Year" },
  { value: "projectType", label: "Project type" },
];

/**
 * One filter row above everything it scopes (PRD §46). Every control writes to
 * the URL so the server page re-renders the whole dashboard against one slice;
 * while that happens the bar dims instead of flashing a skeleton.
 */
export function SegmentFilter({
  options,
  versions,
  segmentQuestions,
  className,
}: {
  options: SegmentFilterOptions;
  versions: VersionOption[];
  segmentQuestions: SegmentQuestionOption[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const get = (k: string) => searchParams.get(k) ?? "";
  const active = FILTER_KEYS.some((k) => !!searchParams.get(k));

  const navigate = (next: URLSearchParams) => {
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(next);
  };

  const clear = () => {
    const next = new URLSearchParams();
    const versionId = searchParams.get("versionId");
    if (versionId) next.set("versionId", versionId);
    navigate(next);
  };

  return (
    <form
      role="search"
      aria-label="Filter responses"
      onSubmit={(e) => e.preventDefault()}
      className={cn("card flex flex-col gap-3 p-4 transition-opacity", pending && "opacity-60", className)}
      aria-busy={pending}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Field label="From" htmlFor="filter-from">
          <input id="filter-from" type="date" className="input" value={get("from")} max={get("to") || undefined} onChange={(e) => set("from", e.target.value)} />
        </Field>
        <Field label="To" htmlFor="filter-to">
          <input id="filter-to" type="date" className="input" value={get("to")} min={get("from") || undefined} onChange={(e) => set("to", e.target.value)} />
        </Field>
        <SelectField label="College" id="filter-college" value={get("college")} onChange={(v) => set("college", v)} options={options.college.map((v) => ({ value: v, label: v }))} />
        <SelectField label="Branch" id="filter-branch" value={get("branch")} onChange={(v) => set("branch", v)} options={options.branch.map((v) => ({ value: v, label: v }))} />
        <SelectField label="Year" id="filter-year" value={get("year")} onChange={(v) => set("year", v)} options={options.year.map((v) => ({ value: v, label: v }))} />
        <SelectField label="Project type" id="filter-projectType" value={get("projectType")} onChange={(v) => set("projectType", v)} options={options.projectType.map((v) => ({ value: v, label: v }))} />
        <SelectField label="Orizenn usage" id="filter-usage" value={get("usage")} onChange={(v) => set("usage", v)} options={USAGE_OPTIONS} />
        <SelectField
          label="Segment by"
          id="filter-segmentBy"
          value={get("segmentBy")}
          onChange={(v) => set("segmentBy", v)}
          placeholder="None"
          groups={[
            { label: "Respondent", options: RESPONDENT_SEGMENTS },
            { label: "Questions", options: segmentQuestions.map((q) => ({ value: q.id, label: q.text })) },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-orizenn-border pt-3">
        <div className="flex items-center gap-2">
          {versions.length ? (
            <>
              <label htmlFor="filter-version" className="mono-label">
                Version
              </label>
              <select id="filter-version" className="input w-auto py-1.5 text-xs" value={get("versionId")} onChange={(e) => set("versionId", e.target.value)}>
                <option value="">Current published</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} · {titleCase(v.status)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={clear} disabled={!active}>
          Clear filters
        </button>
      </div>
    </form>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mono-label mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  id,
  value,
  onChange,
  options,
  groups,
  placeholder = "All",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  groups?: Array<{ label: string; options: Array<{ value: string; label: string }> }>;
  placeholder?: string;
}) {
  const empty = !options?.length && !groups?.some((g) => g.options.length);
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={empty && !value}>
        <option value="">{placeholder}</option>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups
          ?.filter((g) => g.options.length)
          .map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </Field>
  );
}
