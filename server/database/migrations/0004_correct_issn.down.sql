-- Roll back the Language Acquisition ISSN correction.
UPDATE journals
SET issn = '1048-6928'
WHERE issn = '1048-9223';
