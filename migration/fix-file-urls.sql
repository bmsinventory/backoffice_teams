-- Run on the NEW Postgres instance, AFTER data has been imported (pg_dump --data-only)
-- and AFTER migrate-storage.mjs has copied the files over.
--
-- IMPL_ATTACHMENTS.file_url stores the FULL public URL (old domain baked in), not just
-- the storage path — so every existing attachment link points at the old project until
-- this runs. See docs/src/services/impl-tracker.service.js:236.
--
-- Replace the two placeholders below, then run:
--   psql "$NEW_DATABASE_URL" -f fix-file-urls.sql

\set old_domain 'https://zsxllqiygochmldmtpgc.supabase.co'
\set new_domain 'https://REPLACE-WITH-NEW-DOMAIN'

BEGIN;

UPDATE "IMPL_ATTACHMENTS"
SET file_url = replace(file_url, :'old_domain', :'new_domain')
WHERE file_url LIKE :'old_domain' || '%';

-- Sanity check: should return 0 rows once this is safe to commit.
SELECT id, file_url FROM "IMPL_ATTACHMENTS" WHERE file_url LIKE :'old_domain' || '%';

COMMIT;

-- Note: primary keys in this schema are client-generated TEXT ids (see uid() in
-- docs/src/utils/string.util.js), not serial/identity columns — there is no sequence
-- to reset after a data-only import, unlike a typical auto-increment schema.
