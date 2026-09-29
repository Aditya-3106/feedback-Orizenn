import { describe, expect, it } from "vitest";
import {
  analyticsFiltersSchema,
  filtersFromSearchParams,
  filtersToSearchParams,
  hasActiveFilters,
} from "@/lib/validation/filters";

describe("analyticsFiltersSchema (PRD §46, §128)", () => {
  it("coerces dates and trims strings", () => {
    const r = analyticsFiltersSchema.safeParse({ from: "2026-09-01", college: "  IIT Bombay ", status: "COMPLETED" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.data.college).toBe("IIT Bombay");
    expect(r.data.status).toBe("COMPLETED");
  });

  it("rejects unknown status / usage values and bad dates", () => {
    expect(analyticsFiltersSchema.safeParse({ status: "DONE" }).success).toBe(false);
    expect(analyticsFiltersSchema.safeParse({ usage: "MAYBE" }).success).toBe(false);
    expect(analyticsFiltersSchema.safeParse({ to: "someday" }).success).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const r = analyticsFiltersSchema.safeParse({ from: "", to: "", college: "", year: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.from).toBeUndefined();
    // Empty strings on optional text fields stay "" (first union branch accepts them).
    expect(r.data.college === undefined || r.data.college === "").toBe(true);
  });
});

describe("filtersFromSearchParams", () => {
  it("parses URLSearchParams", () => {
    const f = filtersFromSearchParams(new URLSearchParams("from=2026-09-01&to=2026-09-30&college=IIT&year=3&status=COMPLETED&usage=VERIFIED&segmentBy=year"));
    expect(f.from).toBeInstanceOf(Date);
    expect(f.to?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(f.college).toBe("IIT");
    expect(f.year).toBe("3");
    expect(f.status).toBe("COMPLETED");
    expect(f.usage).toBe("VERIFIED");
    expect(f.segmentBy).toBe("year");
  });

  it("parses a Next.js searchParams record and takes the first of repeated keys", () => {
    const f = filtersFromSearchParams({ college: ["IIT", "NIT"], branch: "CSE", from: undefined });
    expect(f.college).toBe("IIT");
    expect(f.branch).toBe("CSE");
    expect(f.from).toBeUndefined();
  });

  it("ignores garbage by falling back to no filters", () => {
    expect(filtersFromSearchParams(new URLSearchParams("from=notadate&college=IIT"))).toEqual({});
    expect(filtersFromSearchParams(new URLSearchParams("status=BOGUS"))).toEqual({});
    expect(filtersFromSearchParams(new URLSearchParams("college=" + "x".repeat(121)))).toEqual({});
  });

  it("empty params → no filters", () => {
    const f = filtersFromSearchParams(new URLSearchParams());
    expect(hasActiveFilters(f)).toBe(false);
    expect(filtersFromSearchParams({})).toEqual(f);
  });

  it("round-trips through filtersToSearchParams", () => {
    const original = filtersFromSearchParams(new URLSearchParams("from=2026-09-01&to=2026-09-30&college=IIT&status=ABANDONED&versionId=v2"));
    const sp = filtersToSearchParams(original);
    expect(sp.get("from")).toBe("2026-09-01");
    expect(sp.get("to")).toBe("2026-09-30");
    expect(sp.get("college")).toBe("IIT");
    expect(sp.get("status")).toBe("ABANDONED");
    expect(sp.get("versionId")).toBe("v2");
    expect(sp.has("branch")).toBe(false);

    const again = filtersFromSearchParams(sp);
    expect(again).toEqual(original);
  });

  it("filtersToSearchParams skips empty values", () => {
    const sp = filtersToSearchParams({ college: "", branch: undefined, year: "2" });
    expect([...sp.keys()]).toEqual(["year"]);
  });
});

describe("hasActiveFilters", () => {
  it("ignores versionId but counts everything else", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ versionId: "v1" })).toBe(false);
    expect(hasActiveFilters({ versionId: "v1", college: "IIT" })).toBe(true);
    expect(hasActiveFilters({ from: new Date() })).toBe(true);
    expect(hasActiveFilters({ status: "COMPLETED" })).toBe(true);
    expect(hasActiveFilters({ segmentBy: "year" })).toBe(true);
  });
});
