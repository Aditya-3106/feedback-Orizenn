import { z } from "zod";

const optionalStr = z
  .string()
  .trim()
  .max(120)
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.date({ error: "Invalid date." }).optional(),
);

/** Dashboard / response explorer / export filters (PRD §46, §128). */
export const analyticsFiltersSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  college: optionalStr,
  branch: optionalStr,
  year: optionalStr,
  projectType: optionalStr,
  status: z.enum(["COMPLETED", "IN_PROGRESS", "ABANDONED", "INVALID"]).optional(),
  usage: z.enum(["UNKNOWN", "NOT_VERIFIED", "VERIFIED"]).optional(),
  /** Restrict to a specific form version; defaults to the current published version. */
  versionId: optionalStr,
  /** Segment questions by a DROPDOWN/SINGLE_CHOICE question id or respondent field. */
  segmentBy: optionalStr,
});

export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;

export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): AnalyticsFilters {
  const get = (k: string) => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const parsed = analyticsFiltersSchema.safeParse({
    from: get("from"),
    to: get("to"),
    college: get("college"),
    branch: get("branch"),
    year: get("year"),
    projectType: get("projectType"),
    status: get("status"),
    usage: get("usage"),
    versionId: get("versionId"),
    segmentBy: get("segmentBy"),
  });
  return parsed.success ? parsed.data : {};
}

export function filtersToSearchParams(f: AnalyticsFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  }
  return sp;
}

export function hasActiveFilters(f: AnalyticsFilters): boolean {
  return Object.entries(f).some(([k, v]) => k !== "versionId" && v !== undefined);
}
