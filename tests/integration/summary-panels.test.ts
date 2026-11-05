import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "../../src/database.js";
import { Prisma, type OperationEntry } from "../../src/generated/prisma/client.js";
import { summaryPanels } from "../../src/services/summary-panels.js";
import { handoverSummary } from "../../src/services/handover-summary.js";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must identify a disposable test database.");

test("batched summary panels preserve limits, ties, priority, closed-item filters, fields and transaction snapshots", async () => {
  const db = createPrismaClient(url, { measureQueries: true });
  const user = await db.user.create({ data: { name: "Panel Operator", email: `${randomUUID()}@example.invalid`, password: "private-hash" } });
  const entries: OperationEntry[] = [];
  const read = () => db.$transaction(tx => summaryPanels(tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  try {
    assert.deepEqual(await read(), { important: [], openItems: [], recent: [], tasks: [], valves: [], attention: [] });
    for (const kind of ["TASK", "VALVE", "ATTENTION", "EVENT", "NOTE"] as const) {
      for (let i = 0; i < 14; i++) entries.push(await db.operationEntry.create({ data: {
        authorId: user.id, kind, priority: i % 3 === 0 ? "HIGH" : "NORMAL", title: `${kind} ${i}`,
        description: `Description ${kind} ${i}`, equipmentCode: i % 2 ? "GT1" : null,
        createdAt: new Date(Date.UTC(2020, 0, 1, 0, Math.floor(i / 2))),
        closedAt: i % 4 === 0 ? new Date("2020-01-02") : null,
        workStatus: i % 2 ? "IN_PROGRESS" : "WAITING", responsibleTeam: "Maintenance", nextStep: `Inspect ${i}`, workVersion: i
      } }));
    }
    const actual = await read();
    const newest = (a: OperationEntry, b: OperationEntry) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
    const workOrder = (a: OperationEntry, b: OperationEntry) => Number(b.priority === "HIGH") - Number(a.priority === "HIGH") || newest(a, b);
    const open = entries.filter(row => !row.closedAt && ["TASK", "VALVE", "ATTENTION"].includes(row.kind));
    const expected = {
      important: open.filter(row => row.priority === "HIGH").sort(newest).slice(0, 5),
      openItems: [...open].sort(workOrder).slice(0, 8),
      recent: entries.filter(row => ["EVENT", "NOTE"].includes(row.kind)).sort(newest).slice(0, 5),
      tasks: open.filter(row => row.kind === "TASK").sort(workOrder).slice(0, 5),
      valves: open.filter(row => row.kind === "VALVE").sort(workOrder).slice(0, 5),
      attention: open.filter(row => row.kind === "ATTENTION").sort(workOrder).slice(0, 5)
    };
    const fields = ["id", "title", "description", "kind", "priority", "equipmentCode", "createdAt", "workStatus", "responsibleTeam", "nextStep", "workVersion"] as const;
    for (const panel of Object.keys(expected) as Array<keyof typeof expected>) {
      assert.deepEqual(actual[panel], expected[panel].map(row => Object.fromEntries(fields.map(field => [field, row[field]]))), panel);
      for (const row of actual[panel]) assert.ok(row.createdAt instanceof Date);
    }
    assert.equal(Object.values(actual).flat().length, 33);
    const summary = await db.$transaction(tx => handoverSummary(tx, user.id), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    assert.equal(summary.counts.total, open.length);
    assert.equal(summary.counts.important, open.filter(row => row.priority === "HIGH").length);
    assert.equal(summary.tasks[0]!.nextStep, actual.tasks[0]!.nextStep);
    assert.deepEqual(summary.tasks[0]!.updates, []);
    assert.ok(!JSON.stringify(summary).includes("private-hash"));

    const target = actual.tasks[0]!;
    await db.$transaction(async tx => {
      await tx.operationRevision.findUniqueOrThrow({ where: { id: 1 } }); // Establish the snapshot.
      await db.operationEntry.update({ where: { id: target.id }, data: { nextStep: "Concurrent change" } });
      assert.equal((await summaryPanels(tx)).tasks.find(row => row.id === target.id)!.nextStep, target.nextStep);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    assert.equal((await read()).tasks.find(row => row.id === target.id)!.nextStep, "Concurrent change");
  } finally {
    await db.operationEntry.deleteMany({ where: { authorId: user.id } });
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
});
