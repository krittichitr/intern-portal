BEGIN;

-- Stop concurrent writes between checking existing rows and adding the constraint.
LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE;

-- Never silently assign privileges to an unmapped account.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "users" WHERE "role_id" IS NULL) THEN
        RAISE EXCEPTION 'User role backfill is required before enforcing role_id NOT NULL';
    END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

COMMIT;
