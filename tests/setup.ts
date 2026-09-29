import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";

// Load .env so integration tests can find DATABASE_URL; unit tests don't need it.
config({ quiet: true });

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.AI_PROVIDER ??= "stub";
