-- AlterTable
ALTER TABLE "Assistant" ALTER COLUMN "frequencyPenalty" SET DEFAULT 0;

-- 订正历史数据。这 11 条记录建于 frequency_penalty 事故修复之前，业务库一直是 0.7；
-- 当时只改了 RAGFlow 侧的 dialog 表。助手更新走「先写业务库、再整体 PUT 给 RAGFlow」，
-- 所以前端把 0.7 回显出来、用户随手保存一次，就会把它推回 RAGFlow，让长答案再次解码崩溃。
UPDATE "Assistant" SET "frequencyPenalty" = 0 WHERE "frequencyPenalty" <> 0;
