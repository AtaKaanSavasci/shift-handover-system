-- Manager-editable units and an admin panel (accounts, temporary passwords, audit log).
-- Additive only: no codes, entries or status history change.

ALTER TABLE "Equipment"
  ADD COLUMN "description" VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The original plant units stay active, ordered and described; any codes left over from the
-- withdrawn October catalog stay hidden, as they are today, by being archived.
UPDATE "Equipment" SET "sortOrder" = 1, "description" = 'Gaz türbini' WHERE code = 'GT1' AND "description" = '';
UPDATE "Equipment" SET "sortOrder" = 2, "description" = 'Gaz türbini' WHERE code = 'GT2' AND "description" = '';
UPDATE "Equipment" SET "sortOrder" = 3, "description" = 'Buhar türbini' WHERE code = 'ST' AND "description" = '';
UPDATE "Equipment" SET "name" = code WHERE "name" = '';
UPDATE "Equipment" SET "archivedAt" = CURRENT_TIMESTAMP WHERE code NOT IN ('GT1', 'GT2', 'ST');

ALTER TABLE "User"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "targetType" VARCHAR(20) NOT NULL,
    "targetId" VARCHAR(40) NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
