import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createPrismaClient } from "../../src/database.js";
import { createApp } from "../../src/app.js";
import { demoNeedsReset, seedDemo, wipe, DemoSeedRefusedError } from "../../src/demo/seed.js";
const secret = "demo-test-secret-".repeat(3);
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must identify a disposable test database.");

test("demo seed builds a coherent plant history and one-click demo sign-in works", async () => {
  const db = createPrismaClient(url);
  try {
    const now = new Date("2026-11-24T10:30:00Z"); // 13:30 Istanbul, day slot
    // Integration suites share the database; force wipes their leftover accounts.
    const result = await seedDemo(db, { now, language: "en", force: true });
    assert.equal(result.users, 7);
    assert.ok(result.shifts >= 60 && result.entries > 50);
    const active = await db.shift.findMany({ where: { status: "ACTIVE" }, include: { user: true } });
    assert.equal(active.length, 1); assert.equal(active[0]!.user.email, "operator@demo.local");
    assert.equal(active[0]!.scheduledStart, "08:00");
    assert.equal(await db.operationEntry.count({ where: { createdAt: { gt: now } } }), 0);
    const open = await db.operationEntry.count({ where: { closedAt: null, kind: { in: ["TASK", "VALVE", "ATTENTION"] } } });
    assert.equal(open, 8);
    assert.deepEqual((await db.equipment.findMany({ orderBy: { code: "asc" } })).map(unit => unit.status), ["ACTIVE", "MAINTENANCE", "ACTIVE"]);
    assert.equal(await demoNeedsReset(db, 24, new Date(now.getTime() + 23 * 3_600_000)), false);
    assert.equal(await demoNeedsReset(db, 24, new Date(now.getTime() + 24 * 3_600_000)), true);

    const closed = createApp(db, secret);
    assert.deepEqual((await request(closed).get("/demo").expect(200)).body, { enabled: false });
    await request(closed).post("/demo/login").send({ role: "worker" }).expect(404);

    const app = createApp(db, secret, { demo: true });
    assert.deepEqual((await request(app).get("/demo").expect(200)).body, { enabled: true });
    await request(app).post("/demo/login").send({ role: "admin" }).expect(400);
    const login = await request(app).post("/demo/login").send({ role: "manager" }).expect(200);
    assert.equal(login.body.user.role, "MANAGER");
    // Demo passwords are random and never usable for password sign-in.
    await request(app).post("/login").send({ email: "manager@demo.local", password: "password" }).expect(401);
    const summary = await request(app).get("/operations/summary").set("Authorization", `Bearer ${login.body.token}`).expect(200);
    assert.equal(summary.body.counts.total, 8);
    await request(app).get("/healthz").expect(200, { status: "ok" });

    await db.user.create({ data: { email: "real@example.com", name: "Real", password: "unused" } });
    await assert.rejects(seedDemo(db, { now }), DemoSeedRefusedError);
    assert.equal(await db.user.count({ where: { email: "real@example.com" } }), 1);
  } finally {
    // Leave the shared test database as the other suites expect it: no demo records, units unreported.
    await db.$transaction(tx => wipe(tx));
    await db.equipment.updateMany({ data: { status: "UNKNOWN", note: "", version: 0, updatedAt: null } });
    await db.$disconnect();
  }
});
