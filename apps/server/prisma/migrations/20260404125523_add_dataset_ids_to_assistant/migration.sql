-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "datasetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
