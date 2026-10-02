# data/ — provenance & artifacts

| File | Produced by | Committed? | Notes |
|------|-------------|-----------|-------|
| `corpus_snapshot.json` | operator read-only export | yes | 175 papers (7x25), 97 with abstract / 78 missing. File SHA256 `4c23af…`. Staging commit d6b3286. |
| `sample_manifest.json` | `src/sample.py --seed 20261003` | yes | The official 50-paper main set (abstract-only). Stable `selection_sha256` `97db7127…`. |
| `metrics.json` | `src/evaluate.py` | yes | Currently `status=NOT_EXECUTED` (no model cards yet). |
| `model_run.status.json` | hand-written | yes | `NOT_EXECUTED`; records probe + evaluation target. |
| `cards/gold/*.json` | human annotators | yes (over time) | Gold standard cards, one per main-set paper. |
| `cards/model/*.json` | LLM run | yes, if model run | Extracted cards. Absent until a model run happens. |

## Provenance chain
`snapshot file sha256` → recorded in manifest `snapshot_provenance` → manifest `paper_id`s
select cards → cards evaluated. Re-running `sample.py --seed 20261003` on the same snapshot
bytes reproduces the same `selection_sha256` (the file mtime/timestamp differ).

## Missing-abstract policy
The 78 papers without abstracts are NOT in the main 50. They are listed in
`sample_manifest.json` under `missing_abstract_report`, with a seeded
`unknown_robustness_subset_optional` (20) for forced-abstention testing only.
