// Applies pending Prisma migrations during a Vercel build.
//
// Runs only when a database URL is configured, and only for production
// deployments (VERCEL_ENV=production) so preview builds of unmerged branches
// never alter the production schema. Outside Vercel (VERCEL_ENV unset) it runs
// whenever a URL is present. Set SKIP_MIGRATIONS=1 to opt out.
import { spawnSync } from "node:child_process";

const hasUrl = Boolean(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);
const vercelEnv = process.env.VERCEL_ENV;

if (process.env.SKIP_MIGRATIONS === "1") {
  console.log("[migrate] SKIP_MIGRATIONS=1, skipping prisma migrate deploy.");
  process.exit(0);
}
if (!hasUrl) {
  console.log("[migrate] No DATABASE_URL set, skipping prisma migrate deploy.");
  process.exit(0);
}
if (vercelEnv && vercelEnv !== "production") {
  console.log(`[migrate] VERCEL_ENV=${vercelEnv}, skipping migrations for non-production deploys.`);
  process.exit(0);
}

console.log("[migrate] Running prisma migrate deploy…");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
