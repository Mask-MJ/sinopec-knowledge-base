-- Data migration: register the front-end portal pages as menus.
--
-- Background:
--   The client route guard (`userStore.hasAccess`) only lets a user into paths
--   that exist in the Menu table and are linked to one of the user's roles.
--   The new front-end pages `/portal` (landing page after login) and `/qa`
--   (knowledge base Q&A for regular users) therefore need Menu rows, otherwise
--   every user is bounced to the first sidebar menu or /403.
--
--   Both rows are top-level, hidden from the admin sidebar (hideInMenu) and
--   from the admin tab bar (hideInTab). Admin users (User.isAdmin) receive all
--   menus from MenuService.findAll, so only the common role needs linking.
--   SeedService.syncCommonRolePermissions performs the same link at every boot
--   via COMMON_ROLE_MENU_PATHS; doing it here avoids a window between
--   `migrate deploy` and the next app start.
--
-- Idempotent: INSERTs use NOT EXISTS, safe to re-run.

BEGIN;

-- ─── 1. Insert the two menus (idempotent via NOT EXISTS on path) ────────────
INSERT INTO "Menu" (name, title, path, icon, type, "hideInMenu", "hideInTab", "order")
SELECT v.name, v.title, v.path, v.icon, 'menu', true, true, 0
FROM (VALUES
  ('门户',     'page.portal.title', '/portal', 'i-ant-design:home-outlined'),
  ('物探智问', 'page.portal.qa',    '/qa',     'i-ant-design:message-outlined')
) AS v(name, title, path, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM "Menu" m WHERE m.path = v.path
);

-- ─── 2. Connect them to the common role ─────────────────────────────────────
INSERT INTO "_MenuToRole" ("A", "B")
SELECT m.id, r.id
FROM "Menu" m
CROSS JOIN "Role" r
WHERE r.value = 'common'
  AND m.path IN ('/portal', '/qa')
  AND NOT EXISTS (
    SELECT 1 FROM "_MenuToRole" mr
    WHERE mr."A" = m.id AND mr."B" = r.id
  );

COMMIT;
