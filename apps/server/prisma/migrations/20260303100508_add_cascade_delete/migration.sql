-- DropForeignKey
ALTER TABLE "Dept" DROP CONSTRAINT "Dept_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Menu" DROP CONSTRAINT "Menu_parentId_fkey";

-- CreateTable
CREATE TABLE "Assistant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "description" TEXT,
    "modelName" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "topP" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "presencePenalty" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "frequencyPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 512,
    "similarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "keywordsSimilarityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "topN" INTEGER NOT NULL DEFAULT 6,
    "topK" INTEGER NOT NULL DEFAULT 1024,
    "emptyResponse" TEXT,
    "opener" TEXT,
    "prompt" TEXT,
    "assistantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Assistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "description" TEXT,
    "embeddingModel" TEXT NOT NULL,
    "permission" TEXT,
    "chunkMethod" TEXT NOT NULL DEFAULT 'naive',
    "parserConfig" JSONB,
    "datasetId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1,
    "createBy" TEXT NOT NULL,
    "updateBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deptId" INTEGER,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dept" ADD CONSTRAINT "Dept_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Dept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Dept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
