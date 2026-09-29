import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Single Prisma client for the whole process. Kept behind this module so a
 * Prisma major bump does not spread through the UI (PRD §67).
 *
 * The client is created lazily on first use, not at import time. `next build`
 * imports every route module while collecting page data, and it must not need
 * a database (or crash) just because DATABASE_URL is absent at build time.
 */
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env locally or to your Vercel project's environment variables.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    // Use the real client as the receiver so internal getters and private fields work.
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = PrismaClient;
/** Transaction client type for services that accept either the root client or a tx. */
export type DbOrTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
