import {
  ANALYTICS_TYPES,
  QUESTION_TYPES,
  allowedAnalyticsTypes,
  isChoiceType,
  type FormDefinition,
} from "./definitions";

export interface PublishIssue {
  questionId?: string;
  message: string;
}

/**
 * Deterministic pre-publish validation (PRD §24, §77). Returns a list of
 * actionable issues; an empty list means the draft can be published.
 */
export function checkPublishable(
  form: Pick<FormDefinition, "questions"> & { campaign: { name: string } },
): PublishIssue[] {
  const issues: PublishIssue[] = [];

  if (!form.campaign.name?.trim()) {
    issues.push({ message: "Campaign needs a name." });
  }

  if (form.questions.length === 0) {
    issues.push({ message: "Add at least one question before publishing." });
    return issues;
  }

  const positions = new Set<number>();
  const keys = new Set<string>();

  form.questions.forEach((q, index) => {
    const label = `Question ${index + 1}`;

    if (!(QUESTION_TYPES as readonly string[]).includes(q.type)) {
      issues.push({ questionId: q.id, message: `${label}: unsupported question type "${q.type}".` });
    }
    if (!(ANALYTICS_TYPES as readonly string[]).includes(q.analyticsType)) {
      issues.push({ questionId: q.id, message: `${label}: invalid analytics type.` });
    } else if (!allowedAnalyticsTypes(q.type).includes(q.analyticsType)) {
      issues.push({
        questionId: q.id,
        message: `${label}: analytics type "${q.analyticsType}" does not apply to ${q.type}.`,
      });
    }

    if (q.text.trim().length < 3) {
      issues.push({ questionId: q.id, message: `${label}: question text is too short.` });
    }

    if (positions.has(q.position)) {
      issues.push({ questionId: q.id, message: `${label}: duplicate position ${q.position}.` });
    }
    positions.add(q.position);

    if (keys.has(q.key)) {
      issues.push({ questionId: q.id, message: `${label}: duplicate question key "${q.key}".` });
    }
    keys.add(q.key);

    if (isChoiceType(q.type)) {
      if (q.options.length < 2) {
        issues.push({ questionId: q.id, message: `${label}: choice questions need at least 2 options.` });
      }
      const values = new Set<string>();
      for (const o of q.options) {
        if (values.has(o.value)) {
          issues.push({ questionId: q.id, message: `${label}: duplicate option value "${o.value}".` });
        }
        values.add(o.value);
        if (!o.label.trim()) {
          issues.push({ questionId: q.id, message: `${label}: an option has no label.` });
        }
      }
    }

    const v = q.validation ?? {};
    if (q.type === "RATING") {
      const min = v.min ?? 1;
      const max = v.max ?? 5;
      if (min < 1 || max > 10 || max <= min) {
        issues.push({ questionId: q.id, message: `${label}: rating range must be within 1–10 and ascending.` });
      }
    }
    if (q.type === "SCALE") {
      const min = v.min ?? 0;
      const max = v.max ?? 10;
      if (max - min < 2) {
        issues.push({ questionId: q.id, message: `${label}: scale needs at least 3 points.` });
      }
    }
    if (v.minLength != null && v.maxLength != null && v.minLength > v.maxLength) {
      issues.push({ questionId: q.id, message: `${label}: minimum length exceeds maximum length.` });
    }
    if (v.min != null && v.max != null && v.min > v.max) {
      issues.push({ questionId: q.id, message: `${label}: minimum exceeds maximum.` });
    }
    if (q.comparableKey && !/^[a-z0-9_]+$/.test(q.comparableKey)) {
      issues.push({ questionId: q.id, message: `${label}: comparable key may only contain a–z, 0–9 and _.` });
    }
  });

  // Comparable keys must be unique inside a version.
  const comparable = new Map<string, number>();
  for (const q of form.questions) {
    if (!q.comparableKey) continue;
    comparable.set(q.comparableKey, (comparable.get(q.comparableKey) ?? 0) + 1);
  }
  for (const [key, count] of comparable) {
    if (count > 1) {
      issues.push({ message: `Comparable key "${key}" is used by ${count} questions in this version.` });
    }
  }

  return issues;
}
