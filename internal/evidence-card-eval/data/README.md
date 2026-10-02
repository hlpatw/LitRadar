# data/ — provenance & artifacts

| File | Produced by | Committed? | Notes |
|------|-------------|-----------|-------|
| `model_run.status.json` | hand-written | yes | Currently `NOT_EXECUTED`; no LLM key available. |
| `corpus_snapshot.staging.json` | `src/export_staging_readonly.py` | operator drop-in | Read-only GET export of staging metadata+abstracts. Not present in this commit (no headless token). |
| `sample_manifest.json` | `src/sample.py` | yes, once snapshot exists | The stable 50-paper stratified sample with provenance + seed. |
| `cards/gold/*.json` | human annotators | yes (over time) | Gold standard cards. |
| `cards/model/*.json` | LLM run | yes, if model run | Extracted cards. Absent until a model run happens. |

## Provenance chain
`snapshot sha256` → recorded in manifest → manifest `paper_id`s select cards → cards evaluated.
Re-running `sample.py` with the same `--seed` on the same snapshot bytes reproduces the same
`sample_manifest.json` (modulo `generated_at`).
