-- Data migration: prefix Menu.title with 'page.' to store full i18n keys
-- This eliminates the frontend magic prefix coupling ($t(`page.${title}`) → $t(title))
UPDATE "Menu" SET title = 'page.' || title WHERE title IS NOT NULL AND title != '' AND title NOT LIKE 'page.%';
