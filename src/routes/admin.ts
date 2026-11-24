import { randomInt } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { Prisma, Role, type PrismaClient } from "../generated/prisma/client.js";
import { RequestError } from "../services/shift-query.js";
import { RESERVED_UNIT_CODES, UNIT_CODE, unitOrder } from "../services/units.js";
import { hashPassword } from "../password.js";
import { DEMO_DOMAIN, demoAccounts } from "../demo/seed.js";

type Tx = Prisma.TransactionClient;
const userSelect = { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true, createdAt: true } as const;
const protectedDemoEmails = new Set(Object.values(demoAccounts).map(account => account.email));
const invalid = () => new RequestError("ADMIN_INVALID", 400);

function text(value: unknown, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max || value.includes("\0")) throw invalid();
  return value.trim();
}
function only(body: unknown, allowed: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw invalid();
  return body as Record<string, unknown>;
}
function userId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,8}$/.test(value)) throw invalid();
  return Number(value);
}

/** Readable one-time password without ambiguous characters, e.g. "Kp7m-Xq2r-9TzD-wB4n". */
export function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("")).join("-");
}

const audit = (tx: Tx, actorId: number, action: string, targetType: "USER" | "UNIT", targetId: string | number, details: Prisma.InputJsonObject = {}) =>
  tx.auditLog.create({ data: { actorId, action, targetType, targetId: String(targetId), details } });

export function createAdminRouter(prisma: PrismaClient, options: { demo: boolean }) {
  const router = Router();
  const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin." } });

  // In the public demo the three sign-in accounts must keep working for every visitor.
  const guardDemo = (email: string) => { if (options.demo && protectedDemoEmails.has(email)) throw new RequestError("DEMO_PROTECTED", 403); };
  // A plant must always keep at least one active manager.
  async function keepManager(tx: Tx, excluding: number) {
    if (!await tx.user.count({ where: { role: Role.MANAGER, active: true, id: { not: excluding } } })) throw new RequestError("LAST_MANAGER", 409);
  }

  // ---- Users ----
  router.get("/users", async (_req, res) => {
    res.json({ items: await prisma.user.findMany({ select: userSelect, orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }] }) });
  });

  router.post("/users", writeLimit, async (req, res) => {
    const body = only(req.body, ["email", "name", "role"]);
    const email = text(body.email, 3, 254).toLowerCase(), name = text(body.name, 1, 100), role = body.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.values(Role).includes(role as Role)) throw invalid();
    // Demo resets wipe only demo-domain accounts; anything else would block the next reset.
    if (options.demo && !email.endsWith(DEMO_DOMAIN)) throw new RequestError("DEMO_EMAIL", 400);
    const password = temporaryPassword();
    try {
      const user = await prisma.$transaction(async tx => {
        const created = await tx.user.create({ data: { email, name, role: role as Role, password: await hashPassword(password), mustChangePassword: true }, select: userSelect });
        await audit(tx, req.user!.id, "USER_CREATED", "USER", created.id, { email, name, role: created.role });
        return created;
      });
      // The temporary password is shown once and never stored in plain text.
      res.status(201).json({ user, temporaryPassword: password });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new RequestError("Bu email adresi zaten kullanımda.", 409);
      throw error;
    }
  });

  router.patch("/users/:id", writeLimit, async (req, res) => {
    const id = userId(req.params.id), body = only(req.body, ["role", "active", "name"]);
    if (id === req.user!.id && (body.role !== undefined || body.active !== undefined)) throw new RequestError("SELF_CHANGE", 409);
    if (body.role !== undefined && !Object.values(Role).includes(body.role as Role)) throw invalid();
    if (body.active !== undefined && typeof body.active !== "boolean") throw invalid();
    const name = body.name === undefined ? undefined : text(body.name, 1, 100);
    res.json(await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!user) throw new RequestError("USER_NOT_FOUND", 404);
      guardDemo(user.email);
      const role = body.role as Role | undefined, active = body.active as boolean | undefined;
      const leavesManagers = user.role === Role.MANAGER && user.active && ((role && role !== Role.MANAGER) || active === false);
      if (leavesManagers) await keepManager(tx, id);
      const updated = await tx.user.update({ where: { id }, select: userSelect, data: {
        ...(role ? { role } : {}), ...(name ? { name } : {}),
        // Deactivation revokes existing sessions immediately.
        ...(active !== undefined ? { active, ...(active ? {} : { tokenVersion: { increment: 1 } }) } : {})
      } });
      if (role && role !== user.role) await audit(tx, req.user!.id, "USER_ROLE_CHANGED", "USER", id, { email: user.email, from: user.role, to: role });
      if (active !== undefined && active !== user.active) await audit(tx, req.user!.id, active ? "USER_REACTIVATED" : "USER_DEACTIVATED", "USER", id, { email: user.email });
      if (name && name !== user.name) await audit(tx, req.user!.id, "USER_RENAMED", "USER", id, { email: user.email, from: user.name, to: name });
      return updated;
    }));
  });

  router.post("/users/:id/reset-password", writeLimit, async (req, res) => {
    const id = userId(req.params.id);
    if (id === req.user!.id) throw new RequestError("SELF_CHANGE", 409);
    const password = temporaryPassword(), hash = await hashPassword(password);
    const user = await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!user) throw new RequestError("USER_NOT_FOUND", 404);
      guardDemo(user.email);
      const updated = await tx.user.update({ where: { id }, select: userSelect, data: { password: hash, mustChangePassword: true, tokenVersion: { increment: 1 } } });
      await audit(tx, req.user!.id, "PASSWORD_RESET", "USER", id, { email: user.email });
      return updated;
    });
    res.json({ user, temporaryPassword: password });
  });

  // ---- Units ----
  router.get("/units", async (_req, res) => {
    const units = await prisma.equipment.findMany({ orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, ...unitOrder],
      select: { code: true, name: true, description: true, status: true, sortOrder: true, archivedAt: true, createdAt: true, _count: { select: { entries: true } } } });
    res.json({ items: units.map(({ _count, ...unit }) => ({ ...unit, entries: _count.entries })) });
  });

  router.post("/units", writeLimit, async (req, res) => {
    const body = only(req.body, ["code", "name", "description"]);
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!UNIT_CODE.test(code) || RESERVED_UNIT_CODES.includes(code)) throw new RequestError("UNIT_CODE_INVALID", 400);
    const name = text(body.name ?? code, 1, 80), description = text(body.description ?? "", 0, 300);
    const unit = await prisma.$transaction(async tx => {
      if (await tx.equipment.findUnique({ where: { code }, select: { code: true } })) throw new RequestError("UNIT_EXISTS", 409);
      const last = await tx.equipment.aggregate({ _max: { sortOrder: true } });
      const created = await tx.equipment.create({ data: { code, name, description, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await tx.operationRevision.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
      await audit(tx, req.user!.id, "UNIT_CREATED", "UNIT", code, { name, description });
      return created;
    });
    res.status(201).json(unit);
  });

  // Codes are permanent: records and status history reference them. Only name, description and archive state change.
  router.patch("/units/:code", writeLimit, async (req, res) => {
    const code = req.params.code, body = only(req.body, ["name", "description", "archived"]);
    if (typeof code !== "string" || !UNIT_CODE.test(code)) throw invalid();
    if (body.archived !== undefined && typeof body.archived !== "boolean") throw invalid();
    const name = body.name === undefined ? undefined : text(body.name, 1, 80);
    const description = body.description === undefined ? undefined : text(body.description, 0, 300);
    res.json(await prisma.$transaction(async tx => {
      const unit = await tx.equipment.findUnique({ where: { code } });
      if (!unit) throw new RequestError("UNIT_NOT_FOUND", 404);
      const archived = body.archived as boolean | undefined;
      const updated = await tx.equipment.update({ where: { code }, data: {
        ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}),
        ...(archived !== undefined ? { archivedAt: archived ? unit.archivedAt ?? new Date() : null } : {})
      } });
      await tx.operationRevision.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
      const changes: Prisma.InputJsonObject = {
        ...(name !== undefined && name !== unit.name ? { name: { from: unit.name, to: name } } : {}),
        ...(description !== undefined && description !== unit.description ? { description: { from: unit.description, to: description } } : {})
      };
      if (Object.keys(changes).length) await audit(tx, req.user!.id, "UNIT_UPDATED", "UNIT", code, changes);
      if (archived !== undefined && archived !== Boolean(unit.archivedAt)) await audit(tx, req.user!.id, archived ? "UNIT_ARCHIVED" : "UNIT_RESTORED", "UNIT", code, { name: updated.name });
      return updated;
    }));
  });

  router.post("/units/order", writeLimit, async (req, res) => {
    const body = only(req.body, ["codes"]), codes = body.codes;
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > 100 || new Set(codes).size !== codes.length ||
        !codes.every(code => typeof code === "string" && UNIT_CODE.test(code))) throw invalid();
    await prisma.$transaction(async tx => {
      const active = await tx.equipment.findMany({ where: { archivedAt: null }, select: { code: true } });
      if (active.length !== codes.length || !active.every(unit => codes.includes(unit.code))) throw new RequestError("UNIT_ORDER_STALE", 409);
      for (const [index, code] of (codes as string[]).entries()) await tx.equipment.update({ where: { code }, data: { sortOrder: index + 1 } });
      await tx.operationRevision.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
      await audit(tx, req.user!.id, "UNITS_REORDERED", "UNIT", "*", { codes: codes as string[] });
    });
    res.json({ items: await prisma.equipment.findMany({ where: { archivedAt: null }, orderBy: unitOrder }) });
  });

  // ---- Activity log ----
  router.get("/audit", async (req, res) => {
    const page = req.query.page ?? "1";
    if (Object.keys(req.query).some(key => key !== "page") || typeof page !== "string" || !/^[1-9]\d{0,3}$/.test(page)) throw invalid();
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (Number(page) - 1) * 20, take: 20,
        select: { id: true, action: true, targetType: true, targetId: true, details: true, createdAt: true, actor: { select: { id: true, name: true } } } }),
      prisma.auditLog.count()
    ]);
    res.json({ items, total, page: Number(page), pageSize: 20 });
  });
  return router;
}
