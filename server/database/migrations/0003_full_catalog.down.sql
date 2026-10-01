-- 0003_full_catalog.down.sql
-- Reverse the full-catalog seed. Newly-inserted (empty, unreferenced) catalog rows are
-- removed; legacy/adopted rows and their user-linked data are preserved. The
-- connector_status column is dropped to fully reverse the schema change.

DELETE FROM journals j
WHERE j.name IN (
  'Journal of Memory and Language','Cognition','Journal of Child Language','First Language',
  'Language Development Research','Applied Psycholinguistics','Language and Cognition','AMLaP',
  'HSP / CUNY Human Sentence Processing','BUCLD','IASCL Congress',
  'Bilingualism: Language and Cognition','Language Acquisition','Language Learning',
  'Studies in Second Language Acquisition','Second Language Research','Developmental Science',
  'Child Development','Developmental Psychology','Journal of Experimental Child Psychology',
  'Language','Journal of Experimental Psychology: Learning, Memory, and Cognition',
  'Cognitive Psychology','Memory & Cognition','Psychonomic Bulletin & Review',
  'Behavior Research Methods','Cognitive Science','Topics in Cognitive Science',
  'Journal of Speech, Language, and Hearing Research','Child Language Teaching and Therapy',
  'ACL Anthology','ACL / EMNLP / NAACL / COLING / CoNLL','TACL','Computational Linguistics',
  'COLM','CogSci','SRCD Biennial Meeting','ICIS','Infancy',
  'arXiv cs.CL / stat.ML / q-bio.NC'
)
AND NOT EXISTS (SELECT 1 FROM papers p WHERE p.journal_id = j.id)
AND NOT EXISTS (SELECT 1 FROM source_aliases a WHERE a.source_id = j.id)
AND NOT EXISTS (SELECT 1 FROM source_sync_runs r WHERE r.source_id = j.id);

ALTER TABLE journals DROP COLUMN IF EXISTS connector_status;
