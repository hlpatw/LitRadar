-- 0000_base.down.sql
-- DATA-PRESERVING BY DEFAULT. We never drop the core user tables on an adopted DB:
-- a down migration must not destroy journals/papers/users/notes data that pre-existed
-- the migrator (legacy-38 / production-64 / hand-provisioned prod).
--
-- Exact teardown is allowed ONLY when _schema_meta proves this disposable DB was built
-- entirely by the migrator (base_install_mode = 'created_by_migrator'). Any other
-- verdict (adopted_legacy, or marker missing / table absent) is a no-op so pre-existing
-- user data and relations are never lost. Drop order is child -> parent; CASCADE covers
-- FK stragglers.
DO $$
DECLARE
  install_mode text;
BEGIN
  IF to_regclass('public._schema_meta') IS NOT NULL THEN
    SELECT value INTO install_mode FROM _schema_meta WHERE key = 'base_install_mode';
  END IF;

  IF install_mode = 'created_by_migrator' THEN
    DROP TABLE IF EXISTS
      user_settings,
      user_notes,
      reading_checklist,
      user_favorites,
      users,
      papers,
      journals
    CASCADE;
    -- Provenance table goes too: the whole base is being torn down on this throwaway DB.
    DROP TABLE IF EXISTS _schema_meta CASCADE;
  END IF;
  -- else: adopted_legacy / unknown / marker absent -> deliberately do nothing. Reset the
  -- whole schema by hand if you really want to; the migrator will never do it for a live DB.
END $$;
