import { Prisma, type OperationEntry } from "../generated/prisma/client.js";

type Preview = Pick<OperationEntry, "id" | "title" | "description" | "kind" | "priority" | "equipmentCode" | "createdAt" |
  "workStatus" | "responsibleTeam" | "nextStep" | "workVersion">;
type Panel = "important" | "openItems" | "recent" | "tasks" | "valves" | "attention";
const columns = Prisma.sql`e.id, e.title, e.description, e.kind, e.priority, e."equipmentCode", e."createdAt",
  e."workStatus", e."responsibleTeam", e."nextStep", e."workVersion"`;

export async function summaryPanels(tx: Prisma.TransactionClient) {
  // Keep each panel's own indexed filter, order and limit, but pay one round trip.
  // At most 33 public preview rows are returned; no full-table result is buffered.
  const rows = await tx.$queryRaw<Array<Preview & { panel: Panel }>>(Prisma.sql`
    SELECT * FROM (
      (SELECT 'important'::text AS panel, ${columns} FROM "OperationEntry" e
        WHERE e."closedAt" IS NULL AND e.kind IN ('TASK', 'VALVE', 'ATTENTION') AND e.priority = 'HIGH'
        ORDER BY e."createdAt" DESC, e.id DESC LIMIT 5)
      UNION ALL
      (SELECT 'openItems', ${columns} FROM "OperationEntry" e
        WHERE e."closedAt" IS NULL AND e.kind IN ('TASK', 'VALVE', 'ATTENTION')
        ORDER BY e.priority DESC, e."createdAt" DESC, e.id DESC LIMIT 8)
      UNION ALL
      (SELECT 'recent', ${columns} FROM "OperationEntry" e WHERE e.kind IN ('EVENT', 'NOTE')
        ORDER BY e."createdAt" DESC, e.id DESC LIMIT 5)
      UNION ALL
      (SELECT 'tasks', ${columns} FROM "OperationEntry" e WHERE e."closedAt" IS NULL AND e.kind = 'TASK'
        ORDER BY e.priority DESC, e."createdAt" DESC, e.id DESC LIMIT 5)
      UNION ALL
      (SELECT 'valves', ${columns} FROM "OperationEntry" e WHERE e."closedAt" IS NULL AND e.kind = 'VALVE'
        ORDER BY e.priority DESC, e."createdAt" DESC, e.id DESC LIMIT 5)
      UNION ALL
      (SELECT 'attention', ${columns} FROM "OperationEntry" e WHERE e."closedAt" IS NULL AND e.kind = 'ATTENTION'
        ORDER BY e.priority DESC, e."createdAt" DESC, e.id DESC LIMIT 5)
    ) previews
    ORDER BY panel,
      CASE WHEN panel IN ('openItems', 'tasks', 'valves', 'attention') THEN priority END DESC,
      "createdAt" DESC, id DESC`);
  const panels: Record<Panel, Preview[]> = { important: [], openItems: [], recent: [], tasks: [], valves: [], attention: [] };
  for (const { panel, ...entry } of rows) panels[panel].push(entry);
  return panels;
}
