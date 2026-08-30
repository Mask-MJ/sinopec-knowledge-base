-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "deptId" INTEGER,
ADD COLUMN     "permission" TEXT NOT NULL DEFAULT 'me';

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Dept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
