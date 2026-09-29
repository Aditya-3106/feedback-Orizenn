import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` does not need a database, so the URL is optional here.
 * This lets CI/Vercel install and build without DATABASE_URL being present.
 * Commands that do need it (migrate, db seed, studio) fail with Prisma's own
 * clear error if neither variable is set.
 */
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(url ? { datasource: { url } } : {}),
});
