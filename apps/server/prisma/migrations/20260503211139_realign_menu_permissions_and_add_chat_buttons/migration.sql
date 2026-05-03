-- Data migration: realign Menu.permission to AutoPermission format
-- and add missing button menus for general assistant + chat sessions.
--
-- Background:
--   `@AutoPermission()` generates `<module>:<resource>:<action>` from the route
--   path (RouterModule registers prefixes `knowledge-base` and `assistant`).
--   The original seed (commit 6d7b64b) wrote legacy strings such as
--   `document:upload` / `assistant:create`, which never match the generated
--   codes — so on already-deployed databases, common-role users get 403 on
--   every protected endpoint.
--   Commit 0659c56 fixed the seed for fresh deployments and added an idempotent
--   `syncCommonRolePermissions` step at boot, but `syncCommonRolePermissions`
--   only connects existing menus to the common role; it does not rewrite stale
--   permission strings nor create the new `/dashboard/chat` button menus.
--
-- This migration brings already-deployed databases up to par by:
--   1. Renaming the legacy `/dashboard/map` menu to `/dashboard/chat` if
--      stuck on the pre-e4d5313 layout.
--   2. Rewriting Menu.permission from legacy strings to AutoPermission codes.
--   3. Inserting the new button menus required by:
--        - knowledge base retrieval
--        - assistant chat sessions / completions
--        - general assistant (under /dashboard/chat)
--   4. Connecting all newly-aligned button menus to the common role.
--
-- Idempotent: every INSERT uses NOT EXISTS, every UPDATE is keyed on the legacy
-- value. Safe to re-run.

BEGIN;

-- ─── 1. Rename /dashboard/map → /dashboard/chat (pre-e4d5313 deployments) ───
UPDATE "Menu"
SET path = '/dashboard/chat',
    name = '通用聊天',
    title = 'page.dashboard.chat',
    icon = 'i-ant-design:message-outlined'
WHERE path = '/dashboard/map';

-- ─── 2. Rewrite legacy permission strings to AutoPermission codes ───
UPDATE "Menu" SET permission = 'knowledge-base:documents:create' WHERE permission = 'document:upload';
UPDATE "Menu" SET permission = 'knowledge-base:documents:update' WHERE permission = 'document:update';
UPDATE "Menu" SET permission = 'knowledge-base:documents:delete' WHERE permission = 'document:delete';
UPDATE "Menu" SET permission = 'knowledge-base:parse:create'     WHERE permission = 'document:parse';
UPDATE "Menu" SET permission = 'knowledge-base:parse:delete'     WHERE permission = 'document:stop-parse';

-- ─── 3. Insert missing button menus (idempotent via NOT EXISTS) ─────────────

-- 3a. /knowledgeBase: retrieval button
INSERT INTO "Menu" (name, type, permission, "parentId")
SELECT '检索分块', 'button', 'knowledge-base:retrieval:create', m.id
FROM "Menu" m
WHERE m.path = '/knowledgeBase'
  AND NOT EXISTS (
    SELECT 1 FROM "Menu" c
    WHERE c."parentId" = m.id AND c.permission = 'knowledge-base:retrieval:create'
  );

-- 3b. /assistant: session + completion buttons
INSERT INTO "Menu" (name, type, permission, "parentId")
SELECT v.name, 'button', v.permission, m.id
FROM "Menu" m
CROSS JOIN (VALUES
  ('会话-创建', 'assistant:sessions:create'),
  ('会话-更新', 'assistant:sessions:update'),
  ('会话-删除', 'assistant:sessions:delete'),
  ('助手对话', 'assistant:completions:create')
) AS v(name, permission)
WHERE m.path = '/assistant'
  AND NOT EXISTS (
    SELECT 1 FROM "Menu" c
    WHERE c."parentId" = m.id AND c.permission = v.permission
  );

-- 3c. /dashboard/chat: general assistant + session + completion buttons
INSERT INTO "Menu" (name, type, permission, "parentId")
SELECT v.name, 'button', v.permission, m.id
FROM "Menu" m
CROSS JOIN (VALUES
  ('使用通用助手', 'assistant:general:create'),
  ('通用助手对话', 'assistant:completions:create'),
  ('通用助手会话-创建', 'assistant:sessions:create'),
  ('通用助手会话-更新', 'assistant:sessions:update'),
  ('通用助手会话-删除', 'assistant:sessions:delete')
) AS v(name, permission)
WHERE m.path = '/dashboard/chat'
  AND NOT EXISTS (
    SELECT 1 FROM "Menu" c
    WHERE c."parentId" = m.id AND c.permission = v.permission
  );

-- ─── 4. Connect aligned button menus to the common role ─────────────────────
-- Note: SeedService.syncCommonRolePermissions also performs this connect at
-- every app boot, but doing it here makes the migration self-contained and
-- avoids a 403 window between `migrate deploy` and the next app start.
INSERT INTO "_MenuToRole" ("A", "B")
SELECT m.id, r.id
FROM "Menu" m
CROSS JOIN "Role" r
WHERE r.value = 'common'
  AND (
    m.path IN (
      '/dashboard',
      '/dashboard/analytics',
      '/dashboard/workspace',
      '/dashboard/chat',
      '/knowledgeBase',
      '/knowledgeBase/detail/:id',
      '/assistant',
      '/assistant/chat/:id'
    )
    OR m.permission IN (
      'knowledge-base:documents:create',
      'knowledge-base:documents:update',
      'knowledge-base:documents:delete',
      'knowledge-base:parse:create',
      'knowledge-base:parse:delete',
      'knowledge-base:retrieval:create',
      'assistant:sessions:create',
      'assistant:sessions:update',
      'assistant:sessions:delete',
      'assistant:completions:create',
      'assistant:general:create'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "_MenuToRole" mr
    WHERE mr."A" = m.id AND mr."B" = r.id
  );

COMMIT;
