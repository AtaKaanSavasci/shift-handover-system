import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { getPerformanceLogging } from "../src/config.js";
import { recordDatabaseQuery, requestPerformance, type RequestMetrics } from "../src/performance.js";

test("performance logging is disabled by default and validates its opt-in setting", () => {
  const before = process.env.PERFORMANCE_LOGGING;
  try {
    for (const value of [undefined, "", "false", " FALSE "]) {
      if (value === undefined) delete process.env.PERFORMANCE_LOGGING; else process.env.PERFORMANCE_LOGGING = value;
      assert.equal(getPerformanceLogging(), false);
    }
    process.env.PERFORMANCE_LOGGING = "true"; assert.equal(getPerformanceLogging(), true);
    process.env.PERFORMANCE_LOGGING = "yes"; assert.throws(getPerformanceLogging, /PERFORMANCE_LOGGING/);
  } finally { if (before === undefined) delete process.env.PERFORMANCE_LOGGING; else process.env.PERFORMANCE_LOGGING = before; }
});

test("concurrent request metrics retain independent database timings and exclude private inputs", async () => {
  const metrics: RequestMetrics[] = [], app = express();
  app.use(requestPerformance(value => metrics.push(value), () => ({ total: 2, idle: 0, waiting: 1 })));
  app.use(express.json());
  const router = express.Router();
  router.post("/entries/:id", async (req, res) => {
    const slow = req.params.id === "slow";
    await new Promise(resolve => setTimeout(resolve, slow ? 20 : 1));
    recordDatabaseQuery(slow ? 12 : 3);
    if (slow) recordDatabaseQuery(5);
    res.status(slow ? 201 : 400).json({ private: req.body });
  });
  app.use("/operations", router);
  await Promise.all(["slow", "fast"].map(id => request(app).post(`/operations/entries/${id}?token=private-url-token`)
    .set("Authorization", "Bearer private-auth-token").send({ password: "private-password", title: "private-incident", registrationCode: "private-code" })));
  assert.equal(metrics.length, 2);
  const slow = metrics.find(row => row.status === 201)!, fast = metrics.find(row => row.status === 400)!;
  assert.deepEqual(slow.database, { queries: 2, durationMs: 17 });
  assert.deepEqual(fast.database, { queries: 1, durationMs: 3 });
  for (const row of metrics) {
    assert.equal(row.route, "/operations/entries/:id"); assert.equal(row.completed, true);
    assert.equal(row.method, "POST"); assert.ok(row.durationMs >= 0); assert.ok(row.rssBytes > 0);
    assert.deepEqual(row.pool, { total: 2, idle: 0, waiting: 1 });
  }
  const serialized = JSON.stringify(metrics);
  for (const value of ["slow", "fast", "private-", "password", "Authorization", "registrationCode", "SELECT"]) assert.ok(!serialized.includes(value), value);
});

test("unmatched URLs and static assets are not logged as raw paths; a broken logger cannot break a response", async () => {
  const metrics: RequestMetrics[] = [], app = express();
  app.use(requestPerformance(value => metrics.push(value), () => null));
  app.get("/app/assets/app-hash.js", (_req, res) => res.send("public"));
  await request(app).get("/app/assets/app-hash.js").expect(200);
  await request(app).get("/private-token-in-path?password=hidden").expect(404);
  assert.equal(metrics.length, 1); assert.equal(metrics[0]!.route, "unmatched");
  assert.ok(!JSON.stringify(metrics).includes("private-token"));
  const broken = express(); broken.use(requestPerformance(() => { throw new Error("diagnostic failure"); }, () => null));
  broken.get("/ok", (_req, res) => res.json({ ok: true }));
  await request(broken).get("/ok").expect(200, { ok: true });
});

test("a disconnected response reports once without pretending it completed", async () => {
  const metrics: RequestMetrics[] = [], app = express();
  app.use(requestPerformance(value => metrics.push(value), () => null));
  app.get("/disconnect", (_req, res) => { recordDatabaseQuery(1); res.destroy(); });
  await assert.rejects(request(app).get("/disconnect"));
  assert.equal(metrics.length, 1); assert.equal(metrics[0]!.completed, false);
  assert.deepEqual(metrics[0]!.database, { queries: 1, durationMs: 1 });
});
