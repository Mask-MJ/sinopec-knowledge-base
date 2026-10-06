-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branch" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "reportType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyReport_userId_createdAt_idx" ON "WeeklyReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

