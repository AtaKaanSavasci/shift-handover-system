-- Emails are case-insensitive: store them lowercase and enforce it, so "Ali@x.com" and
-- "ali@x.com" cannot become two accounts. Fails loudly if such duplicates already exist.
UPDATE "User" SET "email" = lower("email") WHERE "email" <> lower("email");
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));

-- The Handover, Log and Report tables were never used by the application.
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- DropForeignKey
ALTER TABLE "Handover" DROP CONSTRAINT "Handover_fromUserId_fkey";

-- DropForeignKey
ALTER TABLE "Handover" DROP CONSTRAINT "Handover_shiftId_fkey";

-- DropForeignKey
ALTER TABLE "Handover" DROP CONSTRAINT "Handover_toUserId_fkey";

-- DropForeignKey
ALTER TABLE "Log" DROP CONSTRAINT "Log_shiftId_fkey";

-- DropForeignKey
ALTER TABLE "Log" DROP CONSTRAINT "Log_userId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_shiftId_fkey";

-- DropTable
DROP TABLE "Handover";

-- DropTable
DROP TABLE "Log";

-- DropTable
DROP TABLE "Report";

-- CreateIndex
CREATE INDEX "EquipmentChange_equipmentCode_createdAt_idx" ON "EquipmentChange"("equipmentCode", "createdAt");

-- CreateIndex
CREATE INDEX "OperationEntry_title_idx" ON "OperationEntry" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "OperationEntry_description_idx" ON "OperationEntry" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "OperationEntry_closeNote_idx" ON "OperationEntry" USING GIN ("closeNote" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "OperationPhoto_entryId_idx" ON "OperationPhoto"("entryId");

-- CreateIndex
CREATE INDEX "Shift_userId_startTime_id_idx" ON "Shift"("userId", "startTime" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Shift_startTime_id_idx" ON "Shift"("startTime" DESC, "id" DESC);

