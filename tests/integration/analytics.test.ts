import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createPrismaClient } from "../../src/database.js";
import { createApp } from "../../src/app.js";
import { analytics } from "../../src/services/analytics.js";
import { wipe } from "../../src/demo/seed.js";
const secret = "analytics-test-secret-".repeat(3);
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must identify a disposable test database.");
const HOUR = 3_600_000, DAY = 24 * HOUR;

test("analytics aggregates throughput, close time, availability, aging, teams and shift workload", async () => {
  const db = createPrismaClient(url);
  try {
    await db.$transaction(tx => wipe(tx));
    await db.equipment.updateMany({ data: { status: "UNKNOWN", note: "", version: 0, updatedAt: null } });
    // Tuesday 2026-11-24 13:00 Istanbul (10:00 UTC).
    const now = new Date("2026-11-24T10:00:00Z"), ago = (hours: number) => new Date(now.getTime() - hours * HOUR);
    const user = await db.user.create({ data: { email: "analytics@example.com", name: "Analyst", password: "unused" } });
    const entry = (data: { kind?: "TASK" | "VALVE" | "ATTENTION" | "EVENT"; createdAt: Date; closedAt?: Date; team?: string; priority?: "HIGH" | "NORMAL" }) =>
      db.operationEntry.create({ data: { kind: data.kind ?? "TASK", priority: data.priority ?? "NORMAL", title: "t", description: "d", authorId: user.id,
        createdAt: data.createdAt, responsibleTeam: data.team ?? "", ...(data.closedAt ? { closedAt: data.closedAt, closedById: user.id } : {}) } });
    // Current 7-day window: 3 opened (1 important), 2 closed after 4 h and 10 h -> median 7 h.
    await entry({ createdAt: ago(30), closedAt: ago(26), priority: "HIGH" });
    await entry({ createdAt: ago(60), closedAt: ago(50) });
    await entry({ createdAt: ago(2), team: "Mechanical" });
    await entry({ kind: "EVENT", createdAt: ago(3) }); // logs count toward workload only
    // Opened in the previous window and still open: backlog, previous "opened" and the >7 day bucket.
    await entry({ kind: "VALVE", createdAt: ago(10 * 24), team: "Mechanical" });
    // Previous window: 1 opened and closed after 2 h.
    await entry({ createdAt: ago(9 * 24), closedAt: ago(9 * 24 - 2) });
    // GT2 ran the whole window except a 42 h outage (25% of 168 h) that ended 6 h ago.
    await db.equipmentChange.create({ data: { equipmentCode: "GT2", fromStatus: "UNKNOWN", toStatus: "ACTIVE", note: "", userId: user.id, createdAt: ago(20 * 24) } });
    await db.equipmentChange.create({ data: { equipmentCode: "GT2", fromStatus: "ACTIVE", toStatus: "MAINTENANCE", note: "", userId: user.id, createdAt: ago(48) } });
    await db.equipmentChange.create({ data: { equipmentCode: "GT2", fromStatus: "MAINTENANCE", toStatus: "ACTIVE", note: "", userId: user.id, createdAt: ago(6) } });

    const result = await analytics(db, 7, now);
    assert.deepEqual(result.current, { opened: 3, important: 1, closed: 2, medianCloseHours: 7, backlog: 2 });
    assert.deepEqual(result.previous, { opened: 2, important: 0, closed: 1, medianCloseHours: 2, backlog: 1 });
    assert.equal(result.comparable, false); // earliest record is 10 days old, the previous window starts 14 days ago
    assert.equal(result.daily.length, 8);
    assert.equal(result.daily.at(-1)!.day, "2026-11-24");
    assert.equal(result.daily.reduce((sum, day) => sum + day.opened, 0), 3);
    assert.equal(result.daily.reduce((sum, day) => sum + day.closed, 0), 2);
    const gt2 = result.availability.find(unit => unit.code === "GT2")!;
    assert.deepEqual(gt2.share, { ACTIVE: 75, MAINTENANCE: 25, INACTIVE: 0, UNKNOWN: 0 });
    assert.equal(gt2.transitions, 2);
    assert.equal(result.availability.find(unit => unit.code === "GT1")!.share.UNKNOWN, 100);
    assert.deepEqual(result.aging, [{ key: "lt1d", count: 1 }, { key: "d1to3", count: 0 }, { key: "d3to7", count: 0 }, { key: "gt7d", count: 1 }]);
    assert.deepEqual(result.teams, [{ team: "Mechanical", count: 2 }]);
    // Tuesday (index 1), day slot (08–16) holds the two entries created at 10:00 and 11:00 Istanbul.
    assert.equal(result.heatmap[1]![1], 2);
    assert.equal(result.heatmap.flat().reduce((sum, count) => sum + count, 0), 4);

    // Once records reach back over the whole previous window, deltas become meaningful.
    await entry({ kind: "EVENT", createdAt: ago(15 * 24) });
    assert.equal((await analytics(db, 7, now)).comparable, true);

    const app = createApp(db, secret);
    const auth = `Bearer ${jwt.sign({ id: user.id }, secret, { expiresIn: "1h" })}`;
    await request(app).get("/operations/analytics").expect(401);
    await request(app).get("/operations/analytics?days=14").set("Authorization", auth).expect(400);
    await request(app).get("/operations/analytics?days=7&x=1").set("Authorization", auth).expect(400);
    const response = await request(app).get("/operations/analytics?days=90").set("Authorization", auth).expect(200);
    assert.equal(response.body.days, 90);
    assert.equal(response.body.heatmap.length, 7);
  } finally {
    await db.$transaction(tx => wipe(tx));
    await db.equipment.updateMany({ data: { status: "UNKNOWN", note: "", version: 0, updatedAt: null } });
    await db.$disconnect();
  }
});
