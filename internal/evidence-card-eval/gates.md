# Evaluation Gates

`evaluate.py` computes these gates. A run is green only when every gate is PASS.
Thresholds are the source of truth in `src/evaluate.py:GATES`; mirrored here for reviewers.

| Gate | What it checks | Pass condition |
|------|----------------|----------------|
| **G1 plumbing** | Snapshot + manifest + model cards load; manifest has exactly the target N papers, allocated across the 7 ready sources; cards are well-formed. | Loads without error. |
| **G2 evidence localization** | Every non-unknown model field's `evidence_sentence` is a verbatim (whitespace-normalized) substring of the abstract. | `evidence_localization >= 0.95`. |
| **G3 numeric accuracy** | On numeric fields (`sample_size`), the extracted number matches gold. | `numeric_accuracy >= 0.90`. |
| **G4 appropriate-unknown** | Model abstains when the abstract is silent (`abstention_recall`) and does not over-ask (`false_unknown_rate`). | `abstention_recall >= 0.90` AND `false_unknown_rate <= 0.10`. |
| **G5 per-field accuracy** | No field that is adequately annotated collapses. | Every field with `n_gold >= 10` has `accuracy >= 0.70`. |

## Metric definitions
- **per-field accuracy**: (gold decision matches model decision on `unknown`, AND values agree by the
  field comparator) / fields with gold. Numeric fields compare primary numbers; other fields use a
  transparent token-overlap proxy (F1 >= 0.5) for free text, flagged for human adjudication.
- **evidence localization**: non-unknown fields whose evidence sentence appears verbatim in the abstract.
- **numeric accuracy**: exact number match on `sample_size`.
- **appropriate-unknown**:
  - `abstention_recall` = (gold unknown AND model unknown) / gold unknown.
  - `false_unknown_rate` = (gold known AND model unknown) / gold known.

## Status discipline
- If no model cards exist, status = `NOT_EXECUTED` and all gates = `NOT_RUN`.
  **No gate is auto-passed and no metric is fabricated.**
- Free-text value match is a proxy; disagreements on `research_question`, `main_findings`,
  `author_conclusion`, `author_limitations` must be human-adjudicated before release.
