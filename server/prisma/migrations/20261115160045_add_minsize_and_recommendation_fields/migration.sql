-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_teamId_fkey";

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "minSize" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
