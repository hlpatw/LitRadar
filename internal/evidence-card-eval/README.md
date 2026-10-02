# Offline Abstract Evidence-Card Evaluation

Branch: `eval/abstract-evidence-cards` (based on `d6b3286`).
This directory is **offline/internal only**. It reads a read-only staging snapshot, never
talks to the running app, and ships no UI. No production/staging DB writes.

## Purpose
Evaluate how well an LLM can extract ten evidence-bearing fields from **abstracts only**,
on a reproducibly stratified sample of 50 papers.

## Corpus (real, committed this workstream)
- Snapshot: `data/corpus_snapshot.json`, staging commit `d6b3286…`, exported 2026-10-02.
- Raw file SHA-256: `4c23afbedbb66890c96238de3a9a0a273024ff13fc611f314101ca4d1bb582bb`.
- 175 papers = 7 ready Crossref sources x 25. **97 have abstracts; 78 are missing abstracts.**

| Source | papers | with abstract | missing | in main 50 |
|---|---|---|---|---|
| Applied Psycholinguistics | 25 | 25 | 0 | 13 |
| Cognition | 25 | 0 | 25 | 0 (excluded) |
| First Language | 25 | 24 | 1 | 12 |
| Journal of Child Language | 25 | 23 | 2 | 12 |
| Journal of Memory and Language | 25 | 0 | 25 | 0 (excluded) |
| Bilingualism: Language and Cognition | 25 | 25 | 0 | 13 |
| Language Acquisition | 25 | 0 | 25 | 0 (excluded) |
| **Total** | **175** | **97** | **78** | **50** |

## Sampling policy (decided)
- **Main evaluation set = 50 papers drawn ONLY from the 97 abstract-bearing papers**,
  stratified by source (largest-remainder proportional to each source's abstract count).
  Papers without an abstract cannot be extracted, so they never enter G2/G3/G5 accuracy.
- Sources with zero abstracts (Cognition, JML, Language Acquisition) are excluded from the
  main set and listed in `excluded_sources_no_abstract`.
- The 78 missing-abstract papers are reported in `missing_abstract_report`; a seeded
  `unknown_robustness_subset_optional` (20) tests forced abstention (G4) ONLY. It does not
  take slots from the main 50.
- Seed `20261003`. Stable selection digest `selection_sha256` =
  `97db71274ebe1a72bd77a6b6385c9be318dac12b65f4d4f76db50cf25dfd09c8`
  (hashes the selected paper_id+doi list; independent of `generated_at`).

## Layout
```
internal/evidence-card-eval/
  README.md / prompt.md / annotation_template.md / gates.md
  schemas/corpus_snapshot.schema.json, evidence_card.schema.json
  src/
    export_staging_readonly.py  # authenticated GET-only exporter (operator, refresh snapshot)
    validate_snapshot.py        # structural schema check
    sample.py                   # abstract-only stratified sampler
    evaluate.py                 # scores cards vs gold; prints gates
    common.py
  data/
    corpus_snapshot.json        # the real read-only export (committed)
    sample_manifest.json        # the official 50-paper manifest (committed)
    metrics.json                # evaluator output (currently NOT_EXECUTED)
    model_run.status.json       # model run status = NOT_EXECUTED
    cards/model/  cards/gold/   # cards (empty until run/annotation)
  tests/
```

## Run
```powershell
python src/validate_snapshot.py --snapshot data/corpus_snapshot.json
python src/sample.py --snapshot data/corpus_snapshot.json --out data/sample_manifest.json --seed 20261003
python -m unittest discover -s tests -p "test_*.py"
python src/evaluate.py --snapshot data/corpus_snapshot.json --manifest data/sample_manifest.json `
  --model-dir data/cards/model --gold-dir data/cards/gold --out data/metrics.json
```

## Status (this commit)
- Snapshot validated; official 50-paper manifest generated (seed 20261003).
- **Model run: NOT_EXECUTED** — no authorized LLM API key present. No cards fabricated.
  Evaluator reports `status=NOT_EXECUTED`, gates `NOT_RUN`.
- Next (when a model API exists): extract cards into `data/cards/model/`, human-gold into
  `data/cards/gold/`, then re-run `evaluate.py`.

## No-fabrication rule
If the model is not run, `evaluate.py` emits `NOT_EXECUTED` and gates `NOT_RUN`.
Do not hand-write cards to fill the 50 slots.
