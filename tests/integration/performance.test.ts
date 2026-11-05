import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createPrismaClient, databasePoolStats } from "../../src/database.js";
import { createApp } from "../../src/app.js";
import type { RequestMetrics } from "../../src/performance.js";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must identify a disposable test database.");

test("real Prisma timings cover ORM and raw transaction queries without logging values, and the pool closes", async () => {
  const db = createPrismaClient(url, { measureQueries: true }), metrics: RequestMetrics[] = [];
  const secret = "performance-integration-only-".repeat(3);
  const user = await db.user.create({ data: { name: "Private Operator", email: `${randomUUID()}@example.invalid`, password: "private-password-hash" } });
  try {
    const app = createApp(db, secret, { performanceLogger: value => metrics.push(value), analyzer: null });
    const auth = `Bearer ${jwt.sign({ id: user.id }, secret, { expiresIn: "1h" })}`;
    await Promise.all([
      request(app).get("/shifts/current").set("Authorization", auth).expect(200),
      request(app).get("/operations/summary").set("Authorization", auth).expect(200)
    ]);
    assert.equal(metrics.length, 2);
    const shift = metrics.find(row => row.route === "/shifts/current")!, summary = metrics.find(row => row.route === "/operations/summary")!;
    assert.equal(shift.database.queries, 2); assert.ok(summary.database.queries > shift.database.queries);
    assert.ok(shift.database.durationMs > 0); assert.ok(summary.database.durationMs > 0);
    assert.ok(summary.pool && summary.pool.total > 0);
    const serialized = JSON.stringify(metrics);
    for (const value of [secret, auth, user.email, user.password, user.name, "SELECT", "OperationEntry"]) assert.ok(!serialized.includes(value), value);
    const unobserved = createApp(db, secret);
    await request(unobserved).get("/shifts/current").set("Authorization", auth).expect(200);
    assert.equal(metrics.length, 2);
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
  assert.deepEqual(databasePoolStats(db), { total: 0, idle: 0, waiting: 0 });
});
