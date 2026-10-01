-- 0003_full_catalog.up.sql
-- Bring every source from the authoritative workbook (38 rows, sheet tracking list).
--  * Journals with a real ISSN: connector_type=crossref, connector_status=ready.
--  * Conferences/proceedings/preprints are NOT given a fake crossref ISSN: html/arxiv/acl
--    with connector_status=skeleton until built.
--  * Combined entries split (Cognitive Science vs topiCS; ICIS vs Infancy).
--  * Legacy rows adopted by ISSN/name (UUIDs preserved); unmatched legacy rows archived.
--  * Idempotent.

ALTER TABLE journals ADD COLUMN IF NOT EXISTS connector_status VARCHAR(20) NOT NULL DEFAULT 'ready';

CREATE TEMP TABLE IF NOT EXISTS _catalog(
  name VARCHAR(300), source_type VARCHAR(20), priority VARCHAR(10),
  issn VARCHAR(50), url VARCHAR(500), connector_type VARCHAR(30),
  connector_status VARCHAR(20), poll_policy VARCHAR(20)
);
TRUNCATE _catalog;
INSERT INTO _catalog VALUES
  ('Journal of Memory and Language','journal','P0','0749-596X','https://www.sciencedirect.com/journal/journal-of-memory-and-language','crossref','ready','weekly'),
  ('Cognition','journal','P0','0010-0277','https://www.sciencedirect.com/journal/cognition','crossref','ready','weekly'),
  ('Journal of Child Language','journal','P0','0305-0009','https://www.cambridge.org/core/journals/journal-of-child-language','crossref','ready','weekly'),
  ('First Language','journal','P0','0142-7237','https://journals.sagepub.com/home/fla','crossref','ready','weekly'),
  ('Language Development Research','journal','P0',NULL,'https://ldr.lps.library.cmu.edu/','rss','skeleton','weekly'),
  ('Applied Psycholinguistics','journal','P0','0142-7164','https://www.cambridge.org/core/journals/applied-psycholinguistics','crossref','ready','weekly'),
  ('Language and Cognition','journal','P0','1866-5937','https://www.cambridge.org/core/journals/language-and-cognition','crossref','ready','biweekly'),
  ('AMLaP','conference','P0',NULL,'https://www.amlap.org/','html','skeleton','monthly'),
  ('HSP / CUNY Human Sentence Processing','conference','P0',NULL,'https://www.hspsociety.org/conference','html','skeleton','monthly'),
  ('BUCLD','conference','P0',NULL,'https://www.bu.edu/bucld/','html','skeleton','monthly'),
  ('IASCL Congress','conference','P0',NULL,'https://www.childlanguage.org/our-next-congress','html','skeleton','monthly'),
  ('Bilingualism: Language and Cognition','journal','P1','1366-7289','https://www.cambridge.org/core/journals/bilingualism-language-and-cognition','crossref','ready','biweekly'),
  ('Language Acquisition','journal','P1','1048-6928','https://www.tandfonline.com/journals/hlac20','crossref','ready','biweekly'),
  ('Language Learning','journal','P1','0023-8333','https://onlinelibrary.wiley.com/journal/14679922','crossref','ready','biweekly'),
  ('Studies in Second Language Acquisition','journal','P1','0272-2631','https://www.cambridge.org/core/journals/studies-in-second-language-acquisition','crossref','ready','biweekly'),
  ('Second Language Research','journal','P1','0267-6583','https://journals.sagepub.com/home/slr','crossref','ready','biweekly'),
  ('Developmental Science','journal','P1','1467-7687','https://onlinelibrary.wiley.com/journal/14677687','crossref','ready','biweekly'),
  ('Child Development','journal','P1','0009-3920','https://academic.oup.com/chidev','crossref','ready','biweekly'),
  ('Developmental Psychology','journal','P1','0012-1649','https://www.apa.org/pubs/journals/dev/','crossref','ready','biweekly'),
  ('Journal of Experimental Child Psychology','journal','P1','0022-0965','https://www.sciencedirect.com/journal/journal-of-experimental-child-psychology','crossref','ready','biweekly'),
  ('Language','journal','P2','0097-8507','https://www.cambridge.org/core/journals/language','crossref','ready','monthly'),
  ('Journal of Experimental Psychology: Learning, Memory, and Cognition','journal','P2','0278-7393','https://www.apa.org/pubs/journals/xlm/','crossref','ready','monthly'),
  ('Cognitive Psychology','journal','P2','0010-0285','https://www.sciencedirect.com/journal/cognitive-psychology','crossref','ready','monthly'),
  ('Memory & Cognition','journal','P2','0090-502X','https://link.springer.com/journal/13421','crossref','ready','monthly'),
  ('Psychonomic Bulletin & Review','journal','P2','1069-9384','https://link.springer.com/journal/13423','crossref','ready','monthly'),
  ('Behavior Research Methods','journal','P2','1554-3528','https://link.springer.com/journal/13428','crossref','ready','weekly'),
  ('Cognitive Science','journal','P2','0364-0213','https://onlinelibrary.wiley.com/journal/15516709','crossref','ready','monthly'),
  ('Topics in Cognitive Science','journal','P2','1756-5687','https://onlinelibrary.wiley.com/journal/17568765','crossref','ready','monthly'),
  ('Journal of Speech, Language, and Hearing Research','journal','P2','1092-4388','https://academy.pubs.asha.org/','crossref','ready','monthly'),
  ('Child Language Teaching and Therapy','journal','P2','0265-6590','https://uk.sagepub.com/en-gb/asi/journal/child-language-teaching-and-therapy','crossref','ready','monthly'),
  ('ACL Anthology','proceedings','P3',NULL,'https://aclanthology.org/','acl','skeleton','weekly'),
  ('ACL / EMNLP / NAACL / COLING / CoNLL','conference','P3',NULL,'https://www.aclweb.org/portal/events','acl','skeleton','monthly'),
  ('TACL','journal','P3','2307-3874','https://direct.mit.edu/tacl','crossref','ready','weekly'),
  ('Computational Linguistics','journal','P3','0891-2017','https://aclanthology.org/venues/cl/','crossref','ready','monthly'),
  ('COLM','conference','P3',NULL,'https://colm.cc/','html','skeleton','monthly'),
  ('CogSci','conference','P3',NULL,'https://cognitivesciencesociety.org/cogsci-2026/','html','skeleton','monthly'),
  ('SRCD Biennial Meeting','conference','P3',NULL,'https://www.srcd.org/srcd-events','html','skeleton','monthly'),
  ('ICIS','conference','P3',NULL,'https://infantstudies.org/','html','skeleton','monthly'),
  ('Infancy','journal','P3','1532-7018','https://infantstudies.org/infancy-journal/','crossref','ready','biweekly'),
  ('arXiv cs.CL / stat.ML / q-bio.NC','preprint','P3',NULL,'https://arxiv.org/list/cs.CL/recent','arxiv','skeleton','daily');

INSERT INTO journals (name, source_type, priority, issn, url, connector_type, connector_status, poll_policy, status)
SELECT c.name, c.source_type, c.priority, c.issn, c.url, c.connector_type, c.connector_status, c.poll_policy, 'active'
FROM _catalog c
WHERE NOT EXISTS (
  SELECT 1 FROM journals j
  WHERE j.name = c.name OR (c.issn IS NOT NULL AND j.issn = c.issn)
);

UPDATE journals j
SET source_type = c.source_type,
    priority    = c.priority,
    url         = COALESCE(j.url, c.url),
    connector_type   = c.connector_type,
    connector_status = c.connector_status,
    poll_policy      = c.poll_policy,
    status           = CASE WHEN j.status = 'archived' THEN 'archived' ELSE 'active' END
FROM _catalog c
WHERE j.name = c.name OR (c.issn IS NOT NULL AND j.issn = c.issn);

UPDATE journals SET status = 'archived'
WHERE status = 'active'
  AND name NOT IN (SELECT name FROM _catalog)
  AND (issn IS NULL OR issn NOT IN (SELECT issn FROM _catalog WHERE issn IS NOT NULL));

-- 'ready' means a connector is actually wired and polled NOW. Only the 13-source
-- whitelist is ready; every other crossref-indexed journal is scaffolded (skeleton)
-- so the UI does not mislead. Conferences/preprints/proceedings are already skeleton.
UPDATE journals SET connector_status='skeleton'
WHERE connector_type='crossref' AND status='active'
  AND issn NOT IN ('0749-596X','0010-0277','0142-7164','0305-0009','1366-7289','0023-8333','0272-2631','0267-6583','0097-8507','0364-0213','1069-9384','0090-502X','0278-7393');
