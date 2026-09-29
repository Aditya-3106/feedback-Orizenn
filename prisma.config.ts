import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Runtime uses DATABASE_URL (pooled). Migrations use DIRECT_DATABASE_URL when set.
    url: process.env.DIRECT_DATABASE_URL || env("DATABASE_URL"),
  },
});
