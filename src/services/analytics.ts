import { Prisma, type EquipmentStatus, type PrismaClient } from "../generated/prisma/client.js";
import { RequestError } from "./shift-query.js";

export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = typeof ANALYTICS_PERIODS[number];
const HOUR = 3_600_000, DAY = 24 * HOUR;
const units = ["GT1", "GT2", "ST"] as const;
const statuses = ["ACTIVE", "MAINTENANCE", "INACTIVE", "UNKNOWN"] as const satisfies readonly EquipmentStatus[];
const board = Prisma.sql`ARRAY['TASK','VALVE','ATTENTION']::"EntryKind"[]`;
// Timestamps are stored as UTC without zone; convert to plant-local time for calendar grouping.
const local = (column: Prisma.Sql) => Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;
const localDate = (time: Date) => new Date(time.getTime() + 3 * HOUR).toISOString().slice(0, 10);

export function analyticsPeriod(query: Record<string, unknown>): AnalyticsPeriod {
  const keys = Object.keys(query);
  const value = query.days ?? "30";
  if (keys.some(key => key !== "days") || typeof value !== "string" || !ANALYTICS_PERIODS.map(String).includes(value)) {
    throw new RequestError("ANALYTICS_INVALID", 400);
  }
  return Number(value) as AnalyticsPeriod;
}

async function windowStats(db: Prisma.TransactionClient, from: Date, to: Date) {
  const [row] = await db.$queryRaw<Array<{ opened: bigint; important: bigint; closed: bigint; median: number | null }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "OperationEntry" WHERE kind = ANY(${board}) AND "createdAt" >= ${from} AND "createdAt" < ${to}) AS opened,
      (SELECT COUNT(*) FROM "OperationEntry" WHERE kind = ANY(${board}) AND priority = 'HIGH' AND "createdAt" >= ${from} AND "createdAt" < ${to}) AS important,
      (SELECT COUNT(*) FROM "OperationEntry" WHERE kind = ANY(${board}) AND "closedAt" >= ${from} AND "closedAt" < ${to}) AS closed,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 3600)
         FROM "OperationEntry" WHERE kind = ANY(${board}) AND "closedAt" >= ${from} AND "closedAt" < ${to}) AS median`);
  const backlog = await db.operationEntry.count({ where: { kind: { in: ["TASK", "VALVE", "ATTENTION"] }, createdAt: { lt: to }, OR: [{ closedAt: null }, { closedAt: { gte: to } }] } });
  return { opened: Number(row!.opened), important: Number(row!.important), closed: Number(row!.closed),
    medianCloseHours: row!.median === null ? null : Math.round(Number(row!.median) * 10) / 10, backlog };
}

/** Share of the window each unit spent in each status, from the status change log. */
async function availability(db: Prisma.TransactionClient, from: Date, to: Date) {
  const span = to.getTime() - from.getTime();
  return Promise.all(units.map(async code => {
    const before = await db.equipmentChange.findFirst({ where: { equipmentCode: code, createdAt: { lt: from } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { toStatus: true } });
    const changes = await db.equipmentChange.findMany({ where: { equipmentCode: code, createdAt: { gte: from, lt: to } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { toStatus: true, createdAt: true } });
    const time: Record<EquipmentStatus, number> = { ACTIVE: 0, MAINTENANCE: 0, INACTIVE: 0, UNKNOWN: 0 };
    let status: EquipmentStatus = before?.toStatus ?? "UNKNOWN", since = from.getTime();
    for (const change of changes) { time[status] += change.createdAt.getTime() - since; status = change.toStatus; since = change.createdAt.getTime(); }
    time[status] += to.getTime() - since;
    const share = Object.fromEntries(statuses.map(key => [key, Math.round((time[key] / span) * 1000) / 10])) as Record<EquipmentStatus, number>;
    return { code, share, transitions: changes.length };
  }));
}

export async function analytics(prisma: PrismaClient, days: AnalyticsPeriod, now = new Date()) {
  const to = now, from = new Date(now.getTime() - days * DAY), previousFrom = new Date(from.getTime() - days * DAY);
  return prisma.$transaction(async db => {
    const [current, previous] = [await windowStats(db, from, to), await windowStats(db, previousFrom, from)];
    const dailyRows = await db.$queryRaw<Array<{ day: string; opened: bigint; closed: bigint }>>(Prisma.sql`
      WITH events AS (
        SELECT to_char(${local(Prisma.sql`"createdAt"`)}, 'YYYY-MM-DD') AS day, 1 AS opened, 0 AS closed FROM "OperationEntry"
          WHERE kind = ANY(${board}) AND "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL
        SELECT to_char(${local(Prisma.sql`"closedAt"`)}, 'YYYY-MM-DD'), 0, 1 FROM "OperationEntry"
          WHERE kind = ANY(${board}) AND "closedAt" >= ${from} AND "closedAt" < ${to})
      SELECT day, SUM(opened)::bigint AS opened, SUM(closed)::bigint AS closed FROM events GROUP BY day`);
    const byDay = new Map(dailyRows.map(row => [row.day, row]));
    const daily = [];
    // Every plant-local calendar day the window touches, including the partial first and last day.
    for (let time = from.getTime(), last = localDate(to); localDate(new Date(time)) <= last; time += DAY) {
      const day = localDate(new Date(time)), row = byDay.get(day);
      daily.push({ day, opened: Number(row?.opened ?? 0), closed: Number(row?.closed ?? 0) });
    }
    const open = await db.operationEntry.findMany({ where: { kind: { in: ["TASK", "VALVE", "ATTENTION"] }, closedAt: null }, select: { createdAt: true, responsibleTeam: true, priority: true } });
    const aging = [{ key: "lt1d", max: DAY }, { key: "d1to3", max: 3 * DAY }, { key: "d3to7", max: 7 * DAY }, { key: "gt7d", max: Infinity }]
      .map(bucket => ({ key: bucket.key, count: 0, max: bucket.max }));
    const teams = new Map<string, number>();
    for (const item of open) {
      const age = now.getTime() - item.createdAt.getTime();
      aging.find(bucket => age < bucket.max)!.count++;
      const team = item.responsibleTeam.trim();
      teams.set(team, (teams.get(team) ?? 0) + 1);
    }
    const heatRows = await db.$queryRaw<Array<{ weekday: number; slot: number; count: bigint }>>(Prisma.sql`
      SELECT EXTRACT(ISODOW FROM ${local(Prisma.sql`"createdAt"`)})::int AS weekday,
        (EXTRACT(HOUR FROM ${local(Prisma.sql`"createdAt"`)})::int / 8) AS slot, COUNT(*) AS count
      FROM "OperationEntry" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1, 2`);
    const heatmap = Array.from({ length: 7 }, (_, day) => Array.from({ length: 3 }, (_, slot) =>
      Number(heatRows.find(row => row.weekday === day + 1 && row.slot === slot)?.count ?? 0)));
    // Deltas are only meaningful when records already existed for the whole previous window.
    const first = await db.operationEntry.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const comparable = Boolean(first && first.createdAt.getTime() <= previousFrom.getTime() + DAY);
    return {
      days, from, to, current, previous, comparable, daily,
      availability: await availability(db, from, to),
      aging: aging.map(({ key, count }) => ({ key, count })),
      teams: [...teams].map(([team, count]) => ({ team, count })).sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)),
      heatmap
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
