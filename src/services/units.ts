import type { Prisma } from "../generated/prisma/client.js";
import { RequestError } from "./shift-query.js";

type Db = Pick<Prisma.TransactionClient, "equipment">;
/** Codes with special meaning in filters and AI suggestions; never usable as unit codes. */
export const RESERVED_UNIT_CODES = ["GENERAL", "UNKNOWN"];
export const UNIT_CODE = /^[A-Z0-9][A-Z0-9_-]{0,15}$/;
export const unitOrder = [{ sortOrder: "asc" }, { code: "asc" }] satisfies Prisma.EquipmentOrderByWithRelationInput[];
export const unitSummary = { code: true, name: true, description: true } as const;

/** Units shown in status panels and offered for new records, in display order. */
export function activeUnits(db: Db) {
  return db.equipment.findMany({ where: { archivedAt: null }, orderBy: unitOrder, select: unitSummary });
}

/** New entries and status updates may only reference an active unit. */
export async function requireActiveUnit(db: Db, code: unknown) {
  if (typeof code !== "string" || !UNIT_CODE.test(code)) throw new RequestError("Ekipman durumunu kontrol edin.", 400);
  const unit = await db.equipment.findUnique({ where: { code }, select: { archivedAt: true } });
  if (!unit || unit.archivedAt) throw new RequestError("Ekipman durumunu kontrol edin.", 400);
  return code;
}

/** Filters accept any known code, including archived ones, so history stays searchable. */
export async function requireKnownUnit(db: Db, code: string) {
  return UNIT_CODE.test(code) && Boolean(await db.equipment.findUnique({ where: { code }, select: { code: true } }));
}
