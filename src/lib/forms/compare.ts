import type { QuestionDefinition } from "./definitions";

export interface VersionDiff {
  added: QuestionDefinition[];
  removed: QuestionDefinition[];
  changed: Array<{ before: QuestionDefinition; after: QuestionDefinition; fields: string[] }>;
  unchanged: Array<{ before: QuestionDefinition; after: QuestionDefinition }>;
  /** Comparable keys present in both versions (valid for metric comparison, PRD §39, §131). */
  comparable: Array<{ key: string; before: QuestionDefinition; after: QuestionDefinition }>;
}

function identityKey(q: QuestionDefinition): string {
  return q.comparableKey ? `ck:${q.comparableKey}` : `k:${q.key}`;
}

function changedFields(a: QuestionDefinition, b: QuestionDefinition): string[] {
  const fields: string[] = [];
  if (a.text !== b.text) fields.push("text");
  if (a.type !== b.type) fields.push("type");
  if (a.required !== b.required) fields.push("required");
  if ((a.description ?? "") !== (b.description ?? "")) fields.push("description");
  if ((a.category ?? "") !== (b.category ?? "")) fields.push("category");
  if (a.analyticsType !== b.analyticsType) fields.push("analyticsType");
  const ao = a.options.map((o) => `${o.value}:${o.label}`).join("|");
  const bo = b.options.map((o) => `${o.value}:${o.label}`).join("|");
  if (ao !== bo) fields.push("options");
  if (JSON.stringify(a.validation ?? {}) !== JSON.stringify(b.validation ?? {})) fields.push("validation");
  return fields;
}

/**
 * Compare two versions. Questions are matched by comparable key first, then
 * by stable question key. Wording changes never create a false "comparable"
 * match: only explicit comparable keys (or an unchanged key) count.
 */
export function compareVersions(
  before: readonly QuestionDefinition[],
  after: readonly QuestionDefinition[],
): VersionDiff {
  const beforeMap = new Map(before.map((q) => [identityKey(q), q]));
  const afterMap = new Map(after.map((q) => [identityKey(q), q]));

  const diff: VersionDiff = { added: [], removed: [], changed: [], unchanged: [], comparable: [] };

  for (const [id, b] of afterMap) {
    const a = beforeMap.get(id);
    if (!a) {
      diff.added.push(b);
      continue;
    }
    const fields = changedFields(a, b);
    if (fields.length) diff.changed.push({ before: a, after: b, fields });
    else diff.unchanged.push({ before: a, after: b });

    if (a.comparableKey && a.comparableKey === b.comparableKey && a.type === b.type) {
      diff.comparable.push({ key: a.comparableKey, before: a, after: b });
    }
  }

  for (const [id, a] of beforeMap) {
    if (!afterMap.has(id)) diff.removed.push(a);
  }

  return diff;
}
