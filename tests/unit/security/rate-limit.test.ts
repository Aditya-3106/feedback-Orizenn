import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientIpFromHeaders, hashRequestIdentifier, resetRateLimits } from "@/lib/security/rate-limit";

const T0 = 1_760_000_000_000;

describe("checkRateLimit (sliding window)", () => {
  beforeEach(() => resetRateLimits());

  it("allows `limit` hits then blocks with a positive retryAfterMs", () => {
    const opts = { limit: 3, windowMs: 1000 };
    expect(checkRateLimit("k", opts, T0)).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(checkRateLimit("k", opts, T0 + 10)).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(checkRateLimit("k", opts, T0 + 20)).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });
    const blocked = checkRateLimit("k", opts, T0 + 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(970);
  });

  it("blocked calls do not consume the window", () => {
    const opts = { limit: 1, windowMs: 1000 };
    checkRateLimit("k", opts, T0);
    checkRateLimit("k", opts, T0 + 500);
    // Still only the original hit at T0 counts; it expires at T0 + 1000.
    expect(checkRateLimit("k", opts, T0 + 999).allowed).toBe(false);
    expect(checkRateLimit("k", opts, T0 + 1000).allowed).toBe(true);
  });

  it("the window slides: old hits expire individually", () => {
    const opts = { limit: 2, windowMs: 1000 };
    checkRateLimit("k", opts, T0);
    checkRateLimit("k", opts, T0 + 600);
    expect(checkRateLimit("k", opts, T0 + 900).allowed).toBe(false);
    // First hit expired, second still inside the window → exactly one slot free.
    expect(checkRateLimit("k", opts, T0 + 1000)).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });
    expect(checkRateLimit("k", opts, T0 + 1100).allowed).toBe(false);
    expect(checkRateLimit("k", opts, T0 + 1600).allowed).toBe(true);
  });

  it("keys are independent", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit("a", opts, T0).allowed).toBe(true);
    expect(checkRateLimit("b", opts, T0).allowed).toBe(true);
    expect(checkRateLimit("a", opts, T0 + 1).allowed).toBe(false);
  });

  it("resetRateLimits clears every bucket", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    checkRateLimit("k", opts, T0);
    expect(checkRateLimit("k", opts, T0 + 1).allowed).toBe(false);
    resetRateLimits();
    expect(checkRateLimit("k", opts, T0 + 2).allowed).toBe(true);
  });

  it("defaults `now` to the current time", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    expect(checkRateLimit("live", opts).allowed).toBe(true);
    expect(checkRateLimit("live", opts).allowed).toBe(true);
    expect(checkRateLimit("live", opts).allowed).toBe(false);
  });
});

describe("hashRequestIdentifier (PRD §83)", () => {
  const day1 = new Date("2026-09-29T10:00:00Z");
  const day2 = new Date("2026-09-30T10:00:00Z");

  it("is 32 lowercase hex characters and deterministic for the same day + ip", () => {
    const h = hashRequestIdentifier("203.0.113.9", day1);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(hashRequestIdentifier("203.0.113.9", new Date("2026-09-29T23:59:59Z"))).toBe(h);
  });

  it("differs by ip and by day, and never contains the raw ip", () => {
    const h = hashRequestIdentifier("203.0.113.9", day1);
    expect(hashRequestIdentifier("203.0.113.10", day1)).not.toBe(h);
    expect(hashRequestIdentifier("203.0.113.9", day2)).not.toBe(h);
    expect(h).not.toContain("203");
  });

  it("tolerates a missing ip", () => {
    expect(hashRequestIdentifier(null, day1)).toMatch(/^[0-9a-f]{32}$/);
    expect(hashRequestIdentifier(undefined, day1)).toBe(hashRequestIdentifier(null, day1));
    expect(hashRequestIdentifier(null, day1)).not.toBe(hashRequestIdentifier("203.0.113.9", day1));
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first x-forwarded-for entry", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " 198.51.100.7 , 10.0.0.1", "x-real-ip": "10.0.0.2" }))).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});
