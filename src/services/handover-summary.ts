import { shiftChanges } from "./shift-changes.js";
import { updatePreviews, emptyUpdates } from "./operation-updates.js";
import { summaryPanels } from "./summary-panels.js";
import type { Prisma } from "../generated/prisma/client.js";
const boardKinds = ["VALVE", "ATTENTION", "TASK"] as const;
export async function handoverSummary(tx: Prisma.TransactionClient, userId: number) {
  const revision = await tx.operationRevision.findUniqueOrThrow({ where: { id: 1 } });
  const equipment = await tx.equipment.findMany({ where: { code: { in: ["GT1", "GT2", "ST"] } }, orderBy: { code: "asc" }, include: { updatedBy: { select: { id: true, name: true } } } });
  const groups = await tx.operationEntry.groupBy({ by: ["kind", "priority"], where: { closedAt: null, kind: { in: [...boardKinds] } }, _count: true });
  const counts = { total: 0, important: 0, VALVE: 0, ATTENTION: 0, TASK: 0 };
  for (const group of groups) { counts.total += group._count; if (group.priority === "HIGH") counts.important += group._count; counts[group.kind as typeof boardKinds[number]] += group._count; }
  const { important, openItems, recent, tasks, valves, attention } = await summaryPanels(tx);
  const shift = await tx.shift.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
  const receipt = shift ? await tx.handoverRead.findFirst({ where: { userId, shiftId: shift.id }, orderBy: [{ revision: "desc" }, { id: "desc" }], select: { id: true, revision: true, readAt: true } }) : null;
  const previews = await updatePreviews(tx, [...important, ...openItems, ...recent, ...tasks, ...valves, ...attention].map(item => item.id));
  const enrich = (items: typeof openItems) => items.map(item => ({ ...item, ...(previews.get(item.id) ?? emptyUpdates) }));
  const changes = await shiftChanges(tx);
  return { changes, revision: revision.version, equipment, counts, important: enrich(important), openItems: enrich(openItems), recent: enrich(recent), tasks: enrich(tasks), valves: enrich(valves), attention: enrich(attention), activeShiftId: shift?.id ?? null, receipt };
}
