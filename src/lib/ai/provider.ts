import { AppError } from "@/lib/api/errors";
import { StubAIProvider } from "./stub";
import type { AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * Resolve the configured provider (PRD §90). Only the deterministic stub ships
 * in V1; a vendor implementation plugs in here behind the same interface and
 * is selected with AI_PROVIDER=<name>.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const name = (process.env.AI_PROVIDER ?? "stub").toLowerCase();
  switch (name) {
    case "stub":
    case "":
      cached = new StubAIProvider();
      return cached;
    default:
      throw new AppError(
        "AI_UNAVAILABLE",
        `AI provider "${name}" is not configured. Set AI_PROVIDER=stub or add a provider implementation.`,
        503,
      );
  }
}

/** Test seam. */
export function setAIProviderForTests(provider: AIProvider | null): void {
  cached = provider;
}
