-- CreateTable
CREATE TABLE "AssistantAttachment" (
    "fileId" TEXT NOT NULL,
    "assistantId" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantAttachment_pkey" PRIMARY KEY ("fileId")
);

-- CreateIndex
CREATE INDEX "AssistantAttachment_sessionId_userId_idx" ON "AssistantAttachment"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "AssistantAttachment" ADD CONSTRAINT "AssistantAttachment_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantAttachment" ADD CONSTRAINT "AssistantAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
