-- DropForeignKey
ALTER TABLE "KnowledgeBase" DROP CONSTRAINT "KnowledgeBase_deptId_fkey";

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Dept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
