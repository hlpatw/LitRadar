# Offline Abstract Evidence-Card Evaluation

Branch: `eval/abstract-evidence-cards` (based on `d6b3286`).
This directory is **offline/internal only**. It reads a read-only staging snapshot, never
talks to the running app, and ships no UI. No production/staging DB writes.

## Purpose
Evaluate how well an LLM can extract ten evidence-bearing fields from **abstracts only**,
on a reproducibly stratified sample of 50 papers across the 7 ready Crossref sources on
staging (frame confirmed live: 7 sources x 25 papers = 175).

## Layout
```
internal/evidence-card-eval/
  README.md                      # this file
  prompt.md                      # LLM extraction prompt (prompt-abstract-v1)
  annotation_template.md         # human gold-annotation instructions + CSV quick-sheet
  gates.md                       # pass/fail gate definitions
  schemas/
    corpus_snapshot.schema.json  # read-only export format
    evidence_card.schema.json    # versioned card output (v1.0.0)
  src/
    export_staging_readonly.py   # authenticated GET-only exporter (operator)
    sample.py                    # deterministic stratified 50-paper sampler
    evaluate.py                  # scores cards vs gold; prints gates
    common.py                    # shared constants/helpers
  data/
    corpus_snapshot.staging.json # (operator-produced; git-ignored content)
    sample_manifest.json         # (produced by sample.py from the snapshot)
    model_run.status.json        # model run status (currently NOT_EXECUTED)
    cards/model/                 # model-extracted cards (not present yet)
    cards/gold/                  # human gold cards
  tests/                         # stdlib unittest, no deps
```

## Status (this commit)
- Sampler, schema, prompt, annotation template, evaluator, gates, tests: **built and tested**.
- Live corpus snapshot: **not exported** in this environment (paper-list endpoints need a
  logged-in session; no token was available headlessly).
- Model run: **NOT_EXECUTED** — no authorized LLM API key present. No cards fabricated.
  See `data/model_run.status.json`.

## Reproduce the pipeline (operator, read-only)
```powershell
# 1) Export staging metadata + abstracts (GET only; needs an authenticated bearer token).
$env:LITRADAR_STAGING_TOKEN = "<your staging bearer token>"
python src/export_staging_readonly.py --out data/corpus_snapshot.staging.json

# 2) Sample 50 papers deterministically (offline).
python src/sample.py --snapshot data/corpus_snapshot.staging.json --out data/sample_manifest.json --seed 20261003

# 3) Human annotate 50 abstracts -> data/cards/gold/<paper_id>.json (see annotation_template.md).

# 4) (Only if a model API is available) extract cards -> data/cards/model/<paper_id>.json.

# 5) Evaluate.
python src/evaluate.py --snapshot data/corpus_snapshot.staging.json `
  --manifest data/sample_manifest.json `
  --model-dir data/cards/model --gold-dir data/cards/gold --out data/metrics.json
```

## Tests
```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```

## Sampling contract
- Frame = papers whose source is one of the 7 ready sources.
- Allocation = largest-remainder proportional to per-source size; leftover seats tie-broken
  by source_id ascending.
- Within stratum = pool sorted by (normalized DOI, paper_id), then a per-stratum seeded RNG
  (`random.Random(f"{seed}|{source_id}")`) draws k. Same snapshot + seed => identical manifest.
- The manifest records the snapshot sha256, staging commit, seed, and per-source allocation.

## No-fabrication rule
If the model is not run, `evaluate.py` emits `status=NOT_EXECUTED` and gates `NOT_RUN`.
Do not hand-write cards to fill the 50 slots.
