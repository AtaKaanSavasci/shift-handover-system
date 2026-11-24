import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "../../src/database.js";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/password.js";
const secret = "admin-test-secret-".repeat(3);
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must identify a disposable test database.");

test("managers administer accounts and units with an audit trail; sessions follow account state", async () => {
  const db = createPrismaClient(url), app = createApp(db, secret), tag = randomUUID().slice(0, 8), unitCode = `TEST-${tag.slice(0, 4).toUpperCase()}`;
  const created: number[] = [];
  try {
    const manager = await db.user.create({ data: { email: `manager-${tag}@example.com`, name: "Manager", role: "MANAGER", password: await hashPassword("manager-password-123") } });
    const worker = await db.user.create({ data: { email: `worker-${tag}@example.com`, name: "Worker", password: "unused" } });
    created.push(manager.id, worker.id);
    const bearer = (id: number, v?: number) => `Bearer ${jwt.sign(v === undefined ? { id } : { id, v }, secret, { expiresIn: "1h" })}`;
    const asManager = bearer(manager.id), asWorker = bearer(worker.id);

    await request(app).get("/admin/users").set("Authorization", asWorker).expect(403);
    const list = await request(app).get("/admin/users").set("Authorization", asManager).expect(200);
    assert.ok(list.body.items.some((user: any) => user.id === worker.id && user.active === true && user.password === undefined));

    // Create: a temporary password is returned once and must be changed before anything else.
    await request(app).post("/admin/users").set("Authorization", asManager).send({ email: "bad", name: "X", role: "WORKER" }).expect(400);
    const made = await request(app).post("/admin/users").set("Authorization", asManager).send({ email: `New-${tag}@Example.com`, name: "New Operator", role: "SUPERVISOR" }).expect(201);
    created.push(made.body.user.id);
    assert.equal(made.body.user.email, `new-${tag}@example.com`); assert.equal(made.body.user.mustChangePassword, true);
    assert.match(made.body.temporaryPassword, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    await request(app).post("/admin/users").set("Authorization", asManager).send({ email: `new-${tag}@example.com`, name: "Again", role: "WORKER" }).expect(409);
    const first = await request(app).post("/login").send({ email: `new-${tag}@example.com`, password: made.body.temporaryPassword }).expect(200);
    assert.equal(first.body.user.mustChangePassword, true);
    await request(app).get("/operations/summary").set("Authorization", `Bearer ${first.body.token}`).expect(403, { error: "PASSWORD_CHANGE_REQUIRED" });
    await request(app).post("/account/password").set("Authorization", `Bearer ${first.body.token}`).send({ currentPassword: "wrong", newPassword: "a-brand-new-password" }).expect(400, { error: "PASSWORD_CURRENT_WRONG" });
    await request(app).post("/account/password").set("Authorization", `Bearer ${first.body.token}`).send({ currentPassword: made.body.temporaryPassword, newPassword: "short" }).expect(400);
    const changed = await request(app).post("/account/password").set("Authorization", `Bearer ${first.body.token}`).send({ currentPassword: made.body.temporaryPassword, newPassword: "a-brand-new-password" }).expect(200);
    assert.equal(changed.body.user.mustChangePassword, false);
    await request(app).get("/operations/summary").set("Authorization", `Bearer ${first.body.token}`).expect(401); // the old session is revoked
    await request(app).get("/operations/summary").set("Authorization", `Bearer ${changed.body.token}`).expect(200);

    // Reset revokes sessions; deactivation blocks sign-in and existing tokens; reactivation restores sign-in.
    const reset = await request(app).post(`/admin/users/${made.body.user.id}/reset-password`).set("Authorization", asManager).expect(200);
    await request(app).get("/operations/summary").set("Authorization", `Bearer ${changed.body.token}`).expect(401);
    await request(app).post("/login").send({ email: `new-${tag}@example.com`, password: "a-brand-new-password" }).expect(401);
    await request(app).post("/login").send({ email: `new-${tag}@example.com`, password: reset.body.temporaryPassword }).expect(200);
    await request(app).get("/operations/summary").set("Authorization", asWorker).expect(200);
    await request(app).patch(`/admin/users/${worker.id}`).set("Authorization", asManager).send({ active: false }).expect(200);
    await request(app).get("/operations/summary").set("Authorization", asWorker).expect(401);
    await db.user.update({ where: { id: worker.id }, data: { password: await hashPassword("worker-password-123") } });
    await request(app).post("/login").send({ email: `worker-${tag}@example.com`, password: "worker-password-123" }).expect(403, { error: "ACCOUNT_DISABLED" });
    await request(app).post("/login").send({ email: `worker-${tag}@example.com`, password: "wrong-password-123" }).expect(401);
    await request(app).patch(`/admin/users/${worker.id}`).set("Authorization", asManager).send({ active: true, role: "SUPERVISOR" }).expect(200);
    await request(app).post("/login").send({ email: `worker-${tag}@example.com`, password: "worker-password-123" }).expect(200);
    await request(app).get("/operations/summary").set("Authorization", asWorker).expect(401); // pre-deactivation token stays revoked

    // Guard rails: managers cannot change their own role or state; another manager can deactivate them.
    await request(app).patch(`/admin/users/${manager.id}`).set("Authorization", asManager).send({ role: "WORKER" }).expect(409, { error: "SELF_CHANGE" });
    await request(app).post(`/admin/users/${manager.id}/reset-password`).set("Authorization", asManager).expect(409);
    await request(app).patch(`/admin/users/${worker.id}`).set("Authorization", asManager).send({ role: "MANAGER" }).expect(200);
    const others = await db.user.findMany({ where: { role: "MANAGER", active: true, id: { notIn: [manager.id, worker.id] } }, select: { id: true } });
    await db.user.updateMany({ where: { id: { in: others.map(user => user.id) } }, data: { active: false } });
    try {
      await request(app).patch(`/admin/users/${manager.id}`).set("Authorization", bearer(worker.id, 1)).send({ active: false }).expect(200);
      await request(app).patch(`/admin/users/${worker.id}`).set("Authorization", asManager).send({ role: "WORKER" }).expect(401); // deactivated manager
      await db.user.update({ where: { id: manager.id }, data: { active: true, tokenVersion: 0 } });
      await request(app).patch(`/admin/users/${manager.id}`).set("Authorization", asManager).send({ name: "Manager Renamed" }).expect(200);
    } finally { await db.user.updateMany({ where: { id: { in: others.map(user => user.id) } }, data: { active: true } }); }

    // Units: create, rename, reorder, archive and restore; codes are validated and permanent.
    await request(app).post("/admin/units").set("Authorization", asManager).send({ code: "GENERAL", name: "x" }).expect(400, { error: "UNIT_CODE_INVALID" });
    await request(app).post("/admin/units").set("Authorization", asManager).send({ code: "GT1", name: "Duplicate" }).expect(409, { error: "UNIT_EXISTS" });
    await request(app).post("/admin/units").set("Authorization", asManager).send({ code: unitCode.toLowerCase(), name: "Boiler", description: "Auxiliary boiler" }).expect(201);
    let units = (await request(app).get("/operations/equipment").set("Authorization", asManager).expect(200)).body.items.map((unit: any) => unit.code);
    assert.equal(units.at(-1), unitCode);
    await request(app).post("/operations/entries").set("Authorization", asManager).send({ kind: "NOTE", title: "Boiler note", description: "Started", equipmentCode: unitCode }).expect(201);
    await request(app).patch(`/admin/units/${unitCode}`).set("Authorization", asManager).send({ code: "NEW" }).expect(400);
    await request(app).patch(`/admin/units/${unitCode}`).set("Authorization", asManager).send({ name: "Aux boiler" }).expect(200);
    await request(app).post("/admin/units/order").set("Authorization", asManager).send({ codes: ["GT1"] }).expect(409, { error: "UNIT_ORDER_STALE" });
    await request(app).post("/admin/units/order").set("Authorization", asManager).send({ codes: [unitCode, ...units.filter((code: string) => code !== unitCode)] }).expect(200);
    units = (await request(app).get("/operations/equipment").set("Authorization", asManager).expect(200)).body.items.map((unit: any) => unit.code);
    assert.equal(units[0], unitCode);
    await request(app).patch(`/admin/units/${unitCode}`).set("Authorization", asManager).send({ archived: true }).expect(200);
    assert.equal((await request(app).get("/operations/summary").set("Authorization", asManager).expect(200)).body.equipment.some((unit: any) => unit.code === unitCode), false);
    await request(app).post("/operations/entries").set("Authorization", asManager).send({ kind: "NOTE", title: "Late", description: "x", equipmentCode: unitCode }).expect(400);
    assert.equal((await request(app).get(`/operations/entries?view=history&equipment=${unitCode}`).set("Authorization", asManager).expect(200)).body.total, 1);
    const adminUnits = (await request(app).get("/admin/units").set("Authorization", asManager).expect(200)).body.items;
    assert.deepEqual(adminUnits.filter((unit: any) => unit.code === unitCode).map((unit: any) => [unit.name, Boolean(unit.archivedAt), unit.entries]), [["Aux boiler", true, 1]]);
    await request(app).patch(`/admin/units/${unitCode}`).set("Authorization", asManager).send({ archived: false }).expect(200);

    const log = (await request(app).get("/admin/audit").set("Authorization", asManager).expect(200)).body;
    const actions = log.items.map((item: any) => item.action);
    for (const action of ["USER_CREATED", "PASSWORD_RESET", "USER_DEACTIVATED", "USER_REACTIVATED", "USER_ROLE_CHANGED", "USER_RENAMED", "UNIT_CREATED", "UNIT_UPDATED", "UNITS_REORDERED", "UNIT_ARCHIVED", "UNIT_RESTORED"]) {
      assert.ok(actions.includes(action), action);
    }
    assert.equal(log.items[0].action, "UNIT_RESTORED"); assert.equal(log.items[0].actor.name, "Manager Renamed");
    await request(app).get("/admin/audit?page=0").set("Authorization", asManager).expect(400);
  } finally {
    await db.auditLog.deleteMany({ where: { actorId: { in: created } } });
    await db.operationEntry.deleteMany({ where: { equipmentCode: unitCode } });
    await db.equipment.deleteMany({ where: { code: unitCode } });
    for (const [index, code] of ["GT1", "GT2", "ST"].entries()) await db.equipment.update({ where: { code }, data: { sortOrder: index + 1 } });
    await db.user.deleteMany({ where: { id: { in: created } } });
    await db.$disconnect();
  }
});

test("public demo keeps its sign-in accounts intact and only creates demo-domain users", async () => {
  const db = createPrismaClient(url), app = createApp(db, secret, { demo: true }), tag = randomUUID().slice(0, 8);
  const manager = await db.user.create({ data: { email: `demo-admin-${tag}@demo.local`, name: "Demo admin", role: "MANAGER", password: "unused" } });
  const protectedAccount = await db.user.create({ data: { email: "operator@demo.local", name: "Demo Operator", password: "unused" } });
  try {
    const auth = `Bearer ${jwt.sign({ id: manager.id }, secret, { expiresIn: "1h" })}`;
    await request(app).patch(`/admin/users/${protectedAccount.id}`).set("Authorization", auth).send({ active: false }).expect(403, { error: "DEMO_PROTECTED" });
    await request(app).post(`/admin/users/${protectedAccount.id}/reset-password`).set("Authorization", auth).expect(403);
    await request(app).post("/admin/users").set("Authorization", auth).send({ email: `x-${tag}@example.com`, name: "X", role: "WORKER" }).expect(400, { error: "DEMO_EMAIL" });
    const made = await request(app).post("/admin/users").set("Authorization", auth).send({ email: `x-${tag}@demo.local`, name: "X", role: "WORKER" }).expect(201);
    await db.auditLog.deleteMany({ where: { actorId: manager.id } });
    await db.user.delete({ where: { id: made.body.user.id } });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [manager.id, protectedAccount.id] } } });
    await db.$disconnect();
  }
});
