# Human Annotation Template (Gold Standard)

Annotators read the **abstract only** and fill one gold card per sampled paper.
Gold cards live in `data/cards/gold/<paper_id>.json` and MUST conform to
`schemas/evidence_card.schema.json` (set `card_status="human_annotated"`).

## How to annotate
1. Open the paper's abstract from `data/corpus_snapshot.staging.json` (matched by `paper_id`).
2. For each of the 10 fields:
   - If the abstract states it: write the normalized `value`, set `unknown=false`, and copy the
     **exact supporting sentence** into `evidence_sentence` with its `[start,end]` offsets.
   - If the abstract does NOT state it: `value=null`, `unknown=true`, `evidence_sentence=""`,
     `char_span=null`, `origin="n/a"`.
3. `sample_size.value` is a number (participant N). Leave unknown if not reported.
4. Copy evidence verbatim — do not paraphrase in `evidence_sentence`.

## Spreadsheet quick-sheet (optional CSV companion)
An annotator may also fill this CSV; it is later converted to gold JSON. One row per paper.

Columns:
`paper_id, doi, source_name,
research_question, research_question_unknown, research_question_evidence,
method_paradigm, method_paradigm_unknown, method_paradigm_evidence,
sample_population, sample_population_unknown, sample_population_evidence,
sample_size, sample_size_unknown, sample_size_evidence,
material_language, material_language_unknown, material_language_evidence,
independent_variable, independent_variable_unknown, independent_variable_evidence,
dependent_variable, dependent_variable_unknown, dependent_variable_evidence,
main_findings, main_findings_unknown, main_findings_evidence,
author_conclusion, author_conclusion_unknown, author_conclusion_evidence,
author_limitations, author_limitations_unknown, author_limitations_evidence`

Rules for the CSV:
- `*_unknown` = `1` if the abstract does not state the field, else `0`.
- When `*_unknown=1`, leave the value and evidence cells empty.
- Evidence cells must be a copy-pasted substring of the abstract.
