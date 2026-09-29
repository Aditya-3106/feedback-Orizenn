import { describe, expect, it } from "vitest";
import {
  MIN_RESPONSES_FOR_INSIGHT,
  bucketize,
  completionRate,
  describeShare,
  percent,
  round,
  weightedAverage,
  weightedMax,
  weightedMedian,
  weightedMin,
  weightedTotal,
} from "@/lib/analytics/metrics";
import { PRD_RATING_COUNTS } from "../fixtures";

describe("metrics (PRD §89, §109, §129)", () => {
  describe("percent", () => {
    it("rounds to whole percents by default", () => {
      expect(percent(4, 10)).toBe(40);
      expect(percent(1, 3)).toBe(33);
      expect(percent(2, 3)).toBe(67);
    });

    it("supports extra digits", () => {
      expect(percent(1, 3, 1)).toBe(33.3);
      expect(percent(1, 8, 2)).toBe(12.5);
    });

    it("returns 0 for an empty whole instead of NaN", () => {
      expect(percent(0, 0)).toBe(0);
      expect(percent(5, 0)).toBe(0);
    });
  });

  describe("round", () => {
    it("rounds to one digit by default", () => {
      expect(round(4.04)).toBe(4);
      expect(round(4.05)).toBe(4.1);
      expect(round(3.14159, 2)).toBe(3.14);
      expect(round(2.5, 0)).toBe(3);
    });
  });

  describe("weighted helpers with the PRD §109 example (10 responses)", () => {
    it("total = 10", () => {
      expect(weightedTotal(PRD_RATING_COUNTS)).toBe(10);
    });

    it("average = 4.0", () => {
      expect(weightedAverage(PRD_RATING_COUNTS)).toBe(4);
    });

    it("median = 4", () => {
      expect(weightedMedian(PRD_RATING_COUNTS)).toBe(4);
    });

    it("min / max ignore values with zero count", () => {
      expect(weightedMin(PRD_RATING_COUNTS)).toBe(2);
      expect(weightedMax(PRD_RATING_COUNTS)).toBe(5);
    });
  });

  describe("weightedAverage / weightedMedian edge cases", () => {
    it("return null when there are no answers", () => {
      expect(weightedAverage([])).toBeNull();
      expect(weightedMedian([])).toBeNull();
      expect(weightedAverage([{ value: 3, count: 0 }])).toBeNull();
      expect(weightedMin([])).toBeNull();
      expect(weightedMax([{ value: 1, count: 0 }])).toBeNull();
    });

    it("average rounds to two decimals", () => {
      expect(weightedAverage([{ value: 1, count: 1 }, { value: 2, count: 2 }])).toBe(1.67);
    });

    it("median averages the two middle values for an even split", () => {
      expect(weightedMedian([{ value: 1, count: 2 }, { value: 3, count: 2 }])).toBe(2);
    });

    it("median is unaffected by input order", () => {
      const shuffled = [{ value: 3, count: 2 }, { value: 1, count: 1 }, { value: 2, count: 1 }];
      expect(weightedMedian(shuffled)).toBe(2.5);
    });

    it("median of a single value", () => {
      expect(weightedMedian([{ value: 7, count: 5 }])).toBe(7);
    });
  });

  describe("completionRate", () => {
    it("returns a whole percent", () => {
      expect(completionRate(8, 10)).toBe(80);
      expect(completionRate(1, 3)).toBe(33);
    });

    it("returns null when nothing was started", () => {
      expect(completionRate(0, 0)).toBeNull();
    });
  });

  describe("bucketize", () => {
    it("returns [] for no data", () => {
      expect(bucketize([])).toEqual([]);
      expect(bucketize([{ value: 4, count: 0 }])).toEqual([]);
    });

    it("collapses a single distinct value into one bucket", () => {
      expect(bucketize([{ value: 7, count: 3 }])).toEqual([{ label: "7", from: 7, to: 7, count: 3 }]);
    });

    it("uses one bucket per value for a handful of integers, sorted ascending", () => {
      const buckets = bucketize([
        { value: 30, count: 2 },
        { value: 10, count: 1 },
        { value: 20, count: 1 },
      ]);
      expect(buckets.map((b) => b.label)).toEqual(["10", "20", "30"]);
      expect(buckets.map((b) => b.count)).toEqual([1, 1, 2]);
    });

    it("falls back to equal-width ranges when there are many distinct values", () => {
      const values = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, count: 1 }));
      const buckets = bucketize(values);
      expect(buckets).toHaveLength(6);
      expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(12);
      expect(buckets[0].from).toBe(1);
      expect(buckets[5].to).toBe(12);
      for (const b of buckets) expect(b.label).toMatch(/^[\d.]+–[\d.]+$/);
    });

    it("respects maxBuckets", () => {
      const values = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, count: 1 }));
      expect(bucketize(values, 3)).toHaveLength(3);
    });
  });

  describe("describeShare", () => {
    it("cites count, total and percent", () => {
      expect(describeShare(4, 10)).toBe("4 of 10 respondents (40%)");
      expect(describeShare(1, 4, "students")).toBe("1 of 4 students (25%)");
    });
  });

  it("MIN_RESPONSES_FOR_INSIGHT is 5 (PRD §43, §100)", () => {
    expect(MIN_RESPONSES_FOR_INSIGHT).toBe(5);
  });
});
