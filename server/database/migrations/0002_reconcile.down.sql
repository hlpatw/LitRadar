-- 0002_reconcile.down.sql
-- Reverse the 0002 reconciliation (drops added aliases, the inserted topiCS row, and un-archives
-- the rows it archived). The CUNY->HSP identity rename is intentionally left in place: it is a
-- correct correction, and restoring the old name/URL is a content decision, not a schema rollback.
-- topiCS is only removed when this migration actually created it (no papers reference it); if the
-- venue pre-existed as a legacy row, deleting it here would lose user data / relations.

DELETE FROM journals j
WHERE j.name = 'Topics in Cognitive Science'
  AND NOT EXISTS (SELECT 1 FROM papers p WHERE p.journal_id = j.id);

DELETE FROM source_aliases
WHERE alias_name IN (
  'Language and Cognitive Processes',
  'CUNY Conference on Human Sentence Processing',
  'Annual Meeting of the Cognitive Science Society'
);

UPDATE journals SET status = 'active'
WHERE issn = '0169-0965' OR name = 'Annual Meeting of the Cognitive Science Society';
