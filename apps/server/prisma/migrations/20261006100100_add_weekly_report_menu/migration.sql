-- Data migration: register the front-end /weekly page (weekly report assistant)
-- and its button permissions on already-deployed databases.
--
-- Background:
--   SeedService only creates menus on a fresh database (seedInitialIfEmpty),
--   so existing deployments never pick up the new /weekly entry from
--   seed.data.ts. Its boot-time syncCommonRolePermissions connects existing
--   menus to the common role but does not create them.
--
-- Fresh databases: `migrate deploy` runs before the app boots, when "Role" is
-- still empty. Every INSERT below is guarded by EXISTS (SELECT 1 FROM "Role"),
-- mirroring seedInitialIfEmpty's own check, so it inserts nothing there and the
-- seed creates the menu instead — otherwise /weekly would end up duplicated.
--
-- Dicts (weeklyReport.branch / weeklyReport.type) need no migration:
-- syncSeedDicts creates missing dicts at every boot.
--
-- Idempotent: every INSERT uses NOT EXISTS. Safe to re-run.

BEGIN;

-- ─── 1. /weekly page menu (hidden from the admin sidebar and tab bar) ──────
INSERT INTO "Menu" (name, title, icon, "order", type, path, "hideInMenu", "hideInTab")
SELECT '周报助手', 'page.portal.weekly', 'i-ant-design:file-text-outlined', 0, 'menu', '/weekly', true, true
WHERE EXISTS (SELECT 1 FROM "Role")
  AND NOT EXISTS (SELECT 1 FROM "Menu" WHERE path = '/weekly');

-- ─── 2. Button permissions under /weekly ────────────────────────────────────
INSERT INTO "Menu" (name, type, permission, "parentId")
SELECT v.name, 'button', v.permission, m.id
FROM "Menu" m
CROSS JOIN (VALUES
  ('生成周报', 'weekly-report:reports:create'),
  ('查看周报', 'weekly-report:reports:read'),
  ('删除周报', 'weekly-report:reports:delete')
) AS v(name, permission)
WHERE m.path = '/weekly'
  AND NOT EXISTS (
    SELECT 1 FROM "Menu" c
    WHERE c."parentId" = m.id AND c.permission = v.permission
  );

-- ─── 3. Connect to the common role ──────────────────────────────────────────
-- SeedService.syncCommonRolePermissions repeats this at boot; doing it here
-- closes the 403 window between `migrate deploy` and the next app start.
INSERT INTO "_MenuToRole" ("A", "B")
SELECT m.id, r.id
FROM "Menu" m
CROSS JOIN "Role" r
WHERE r.value = 'common'
  AND (
    m.path = '/weekly'
    OR m.permission IN (
      'weekly-report:reports:create',
      'weekly-report:reports:read',
      'weekly-report:reports:delete'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "_MenuToRole" mr
    WHERE mr."A" = m.id AND mr."B" = r.id
  );

COMMIT;
