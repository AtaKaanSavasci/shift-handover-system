import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import pg from "pg";
import { recordDatabaseQuery, type PoolStats } from "./performance.js";

const pools = new WeakMap<object, pg.Pool>();

export function databasePoolStats(client: object): PoolStats | null {
  const pool = pools.get(client);
  return pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : null;
}

export function createPrismaClient(connectionString = process.env.DATABASE_URL, options: { measureQueries?: boolean } = {}) {
  if (!connectionString) throw new Error("DATABASE_URL gerekli.");
  const pool = new pg.Pool({ connectionString });
  const client = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    log: options.measureQueries ? [{ level: "query", emit: "event" }] : [] });
  if (options.measureQueries) client.$on("query", event => recordDatabaseQuery(event.duration));
  pools.set(client, pool);
  return client;
}
