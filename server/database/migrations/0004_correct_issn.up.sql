-- Correct the Language Acquisition ISSN seed.
-- 0003 seeded '1048-6928', but Crossref registers the journal under
-- '1048-9223' (print) / '1532-7817' (online). The wrong ISSN made the
-- Crossref works API return 404 for this source. This is a data correction,
-- not a deletion: the journal row and its UUID are preserved.
UPDATE journals
SET issn = '1048-9223'
WHERE issn = '1048-6928';
