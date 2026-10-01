-- 0002_reconcile.up.sql
-- Authoritative-workbook reconciliation. Idempotent, natural-keyed, never deletes rows
-- and never changes legacy UUIDs. Superseded sources are set status='archived' (kept adjacent).

-- 1) LCP -> LCN lineage: 'Language and Cognitive Processes' (0169-0965) was renamed to
--    'Language, Cognition and Neuroscience' (2327-3798). Record the former name on the live
--    row and archive the legacy row.
INSERT INTO source_aliases (source_id, alias_name, alias_type, issn, note)
SELECT j.id, 'Language and Cognitive Processes', 'former_name', '0169-0965',
       'Renamed to Language, Cognition and Neuroscience (2016+); same T&F toc/plcp21 lineage.'
FROM journals j
WHERE j.issn = '2327-3798'
  AND NOT EXISTS (
    SELECT 1 FROM source_aliases a
    WHERE a.source_id = j.id AND a.alias_name = 'Language and Cognitive Processes'
  );

UPDATE journals
SET status = 'archived',
    update_frequency = COALESCE(update_frequency, ''),
    description = 'Former name: renamed to Language, Cognition and Neuroscience. Kept for lineage.'
WHERE issn = '0169-0965';

-- 2) CUNY -> HSP lineage: the CUNY Conference on Human Sentence Processing was renamed to the
--    Annual Conference on Human Sentence Processing (HSP) after 2022. Keep the row/UUID, fix
--    identity, record former name.
UPDATE journals
SET name = 'Human Sentence Processing (HSP)',
    abbreviation = 'HSP',
    url = 'https://www.hspsociety.org/conference',
    poll_policy = 'weekly'
WHERE abbreviation = 'CUNY' OR name ILIKE 'CUNY%Human Sentence Processing%';

INSERT INTO source_aliases (source_id, alias_name, alias_type, note)
SELECT j.id, 'CUNY Conference on Human Sentence Processing', 'former_name',
       'Renamed to Annual Conference on Human Sentence Processing (HSP Society) after 2022.'
FROM journals j
WHERE j.abbreviation = 'HSP'
  AND NOT EXISTS (
    SELECT 1 FROM source_aliases a
    WHERE a.source_id = j.id AND a.alias_name = 'CUNY Conference on Human Sentence Processing'
  );

-- 3) CogSci: the seed had two duplicate rows for the same Cognitive Science Society conference.
--    Keep 'CogSci Conference'; archive the generic duplicate and record it as an alias.
UPDATE journals
SET status = 'archived'
WHERE name = 'Annual Meeting of the Cognitive Science Society';

INSERT INTO source_aliases (source_id, alias_name, alias_type, note)
SELECT j.id, 'Annual Meeting of the Cognitive Science Society', 'venue',
       'Duplicate seed row for the same CogSci conference; archived, kept for lineage.'
FROM journals j
WHERE j.abbreviation = 'CogSci' AND j.source_type = 'conference'
  AND NOT EXISTS (
    SELECT 1 FROM source_aliases a
    WHERE a.source_id = j.id AND a.alias_name = 'Annual Meeting of the Cognitive Science Society'
  );

-- 4) Split combined source: Cognitive Science journal vs topiCS (Topics in Cognitive Science).
--    topiCS is a distinct venue with its own cadence; add it as a child venue under the society
--    journal when missing.
INSERT INTO journals (name, abbreviation, source_type, priority, category, url, issn, parent_id, connector_type, poll_policy)
SELECT 'Topics in Cognitive Science', 'topiCS', 'journal', 'P2', '认知科学',
       'https://www.wiley.com/en-ca/topics-in-cognitive-science-p-17568765', '1941-2060',
       j.id, 'crossref', 'monthly'
FROM journals j
WHERE j.issn = '0364-0213'
  AND NOT EXISTS (
    SELECT 1 FROM journals k WHERE k.name = 'Topics in Cognitive Science'
  );
