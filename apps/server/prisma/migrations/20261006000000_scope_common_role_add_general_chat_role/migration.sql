-- Data migration: limit the common role to the front pages and move the
-- general chat page into a new opt-in role.
--
-- Background:
--   Requirement (UI review 2026-09-05): regular users only use the front pages
--   (/portal, /qa) — no knowledge base upload, no admin dashboard, no general
--   chat, no chat assistants. General chat stays available to whoever an admin
--   assigns the new `general-chat` role. Admin users (User.isAdmin) still get
--   every menu from MenuService.findAll and are unaffected.
--
--   The API guard (PermissionsGuard) only checks button permission codes, not
--   which page a button hangs under. The codes /qa needs (assistant:sessions:*,
--   assistant:completions:create) used to exist only under /dashboard/chat and
--   /assistant, so /qa gets its own copies here and common is linked to those.
--
--   SeedService.syncRolePermissions performs the same links at every boot
--   (append-only, buttons limited to the role's own pages); doing it here also
--   removes the old links, which the append-only sync never does, and avoids a
--   window between `migrate deploy` and the next app start.
--
--   Only links under /dashboard, /knowledgeBase and /assistant are removed from
--   common; anything else an admin attached to common by hand is kept.
--
--   On a fresh database migrations run before the first boot seed, and
--   SeedService.seedInitialIfEmpty skips the whole seed once any Role exists.
--   Every INSERT here is therefore gated on the common role existing (i.e. the
--   database was already seeded); on a fresh database this migration is a
--   no-op and SEED_ROLES / SEED_MENUS create the same rows.
--
-- Idempotent: INSERTs use NOT EXISTS / ON CONFLICT, the DELETE only matches
-- rows that still exist, safe to re-run.

BEGIN;

-- ─── 1. Give /qa its own chat buttons (idempotent via parent + permission) ─
INSERT INTO "Menu" (name, type, permission, "parentId")
SELECT v.name, 'button', v.permission, qa.id
FROM (VALUES
  ('物探智问会话-创建', 'assistant:sessions:create'),
  ('物探智问会话-更新', 'assistant:sessions:update'),
  ('物探智问会话-删除', 'assistant:sessions:delete'),
  ('物探智问对话',      'assistant:completions:create')
) AS v(name, permission)
CROSS JOIN "Menu" qa
WHERE qa.path = '/qa'
  AND EXISTS (SELECT 1 FROM "Role" WHERE value = 'common')
  AND NOT EXISTS (
    SELECT 1 FROM "Menu" m
    WHERE m."parentId" = qa.id AND m.permission = v.permission
  );

-- ─── 2. Link /qa's buttons to common before removing the old copies ────────
INSERT INTO "_MenuToRole" ("A", "B")
SELECT m.id, r.id
FROM "Menu" m
JOIN "Menu" qa ON qa.id = m."parentId" AND qa.path = '/qa'
CROSS JOIN "Role" r
WHERE r.value = 'common'
  AND m.type = 'button'
  AND m.permission IN (
    'assistant:sessions:create',
    'assistant:sessions:update',
    'assistant:sessions:delete',
    'assistant:completions:create'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "_MenuToRole" mr
    WHERE mr."A" = m.id AND mr."B" = r.id
  );

-- ─── 3. Unlink common from the admin pages and their buttons ───────────────
WITH admin_page AS (
  SELECT id FROM "Menu"
  WHERE path IN ('/dashboard', '/knowledgeBase', '/assistant')
     OR path LIKE '/dashboard/%'
     OR path LIKE '/knowledgeBase/%'
     OR path LIKE '/assistant/%'
)
DELETE FROM "_MenuToRole" mr
USING "Role" r, "Menu" m
WHERE mr."B" = r.id
  AND r.value = 'common'
  AND mr."A" = m.id
  AND (
    m.id IN (SELECT id FROM admin_page)
    OR m."parentId" IN (SELECT id FROM admin_page)
    OR (
      m.type = 'button'
      AND (m.permission LIKE 'knowledge-base:%'
           OR m.permission = 'assistant:general:create')
    )
  );

-- ─── 4. Create the general-chat role ───────────────────────────────────────
-- ON CONFLICT also covers an admin-made role already named 通用聊天: the role
-- is then not created and step 5 links nothing, instead of failing the deploy.
INSERT INTO "Role" (name, value, "order", "updatedAt")
SELECT '通用聊天', 'general-chat', 3, now()
WHERE EXISTS (SELECT 1 FROM "Role" WHERE value = 'common')
ON CONFLICT DO NOTHING;

-- ─── 5. Link general-chat to /dashboard, /dashboard/chat and its buttons ───
INSERT INTO "_MenuToRole" ("A", "B")
SELECT m.id, r.id
FROM "Menu" m
LEFT JOIN "Menu" p ON p.id = m."parentId"
CROSS JOIN "Role" r
WHERE r.value = 'general-chat'
  AND (
    m.path IN ('/dashboard', '/dashboard/chat')
    OR (
      m.type = 'button'
      AND p.path = '/dashboard/chat'
      AND m.permission IN (
        'assistant:general:create',
        'assistant:completions:create',
        'assistant:sessions:create',
        'assistant:sessions:update',
        'assistant:sessions:delete'
      )
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "_MenuToRole" mr
    WHERE mr."A" = m.id AND mr."B" = r.id
  );

COMMIT;
