-- Bound ordered board previews without scanning historical notes/closed work.
CREATE INDEX "OperationEntry_open_board_order"
ON "OperationEntry" ("priority" DESC, "createdAt" DESC, "id" DESC)
WHERE "closedAt" IS NULL AND "kind" IN ('TASK', 'VALVE', 'ATTENTION');
