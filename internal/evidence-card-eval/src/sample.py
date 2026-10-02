#!/usr/bin/env python3
"""Deterministic sampler: pick the main 50-paper EVALUATION set from abstract-bearing papers,
stratified across ready sources that actually have abstracts.

POLICY (decided; documented in README/gates.md):
  * The main evaluation set is drawn ONLY from papers with a non-empty abstract.
    Without an abstract there is nothing to extract, so such papers must not enter the
    extraction-accuracy sample.
  * Papers WITHOUT an abstract are reported separately (coverage + an optional seeded
    unknown-robustness subset). They test forced abstention (G4) only and are NEVER counted
    in G2/G3/G5 extraction accuracy.
  * Sources with zero abstracts contribute 0 to the main set and are listed as excluded.

Reproducibility contract:
  * Frame = abstract-bearing papers in the 7 ready sources.
  * Allocation = largest-remainder (Hamilton) proportional to per-source abstract count;
    leftover seats tie-broken by source_id ascending.
  * Within a stratum, papers are sorted by (normalized DOI, paper_id), then k drawn with a
    per-stratum seeded RNG (f"{seed}|{source_id}|abstract").
  => Same snapshot bytes + same seed => identical manifest (modulo generated_at).

No network calls. Reads a snapshot file the exporter already wrote.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    EVIDENCE_FIELDS,
    READY_SOURCES,
    SCHEMA_VERSION,
    STAGING_BASE_URL,
    load_json,
    normalize_doi,
    sha256_bytes,
    sha256_obj,
    sha256_text,
    write_json,
)

DEFAULT_SEED = 20261003
TARGET_N = 50
UNKNOWN_ROBUSTNESS_N = 20  # optional seeded abstention subset, separate from the 50


def has_abstract(paper: dict) -> bool:
    return bool((paper.get("abstract_text") or "").strip())


def stable_key(paper: dict) -> tuple:
    """Sort key independent of DB row order: normalized DOI, then paper_id."""
    return (normalize_doi(paper.get("doi")), paper.get("paper_id", ""))


def allocate(frame_counts: dict[str, int], target: int, source_order: list[str]) -> dict[str, int]:
    """Largest-remainder proportional allocation. Returns {source_id: k}."""
    total = sum(frame_counts.values())
    if total == 0:
        raise SystemExit("abstract-bearing frame is empty; cannot allocate")
    exact = {s: target * frame_counts[s] / total for s in source_order}
    base = {s: int(exact[s] // 1) for s in source_order}
    leftovers = target - sum(base.values())
    order = sorted(source_order, key=lambda s: (-(exact[s] % 1.0), s))
    i = 0
    guard = 0
    while leftovers > 0:
        s = order[i % len(order)]
        if base[s] < frame_counts[s]:
            base[s] += 1
            leftovers -= 1
        i += 1
        guard += 1
        if guard > target * len(source_order) + 10:
            raise SystemExit("allocation did not converge")
    return base


def build_manifest(snapshot: dict, seed: int, target_n: int,
                   unknown_robustness_n: int = UNKNOWN_ROBUSTNESS_N) -> dict:
    ready_ids = {s["source_id"] for s in READY_SOURCES}
    all_ready = [p for p in snapshot.get("papers", []) if p.get("source_id") in ready_ids]
    if not all_ready:
        raise SystemExit(
            "snapshot has no papers from the 7 ready sources. "
            "Run src/export_staging_readonly.py first (authenticated read-only)."
        )

    eligible = [p for p in all_ready if has_abstract(p)]
    missing = [p for p in all_ready if not has_abstract(p)]

    by_source: dict[str, list[dict]] = {}
    for p in eligible:
        by_source.setdefault(p["source_id"], []).append(p)

    source_order = sorted(by_source.keys())
    frame_counts = {s: len(by_source[s]) for s in source_order}
    alloc = allocate(frame_counts, target_n, source_order)

    source_meta = {s["source_id"]: s for s in READY_SOURCES}

    selected = []
    for s in source_order:
        pool = sorted(by_source[s], key=stable_key)
        rng = random.Random(f"{seed}|{s}|abstract")
        chosen = rng.sample(pool, alloc[s])
        chosen.sort(key=stable_key)
        selected.extend(chosen)
    selected.sort(key=lambda p: (p["source_id"], stable_key(p)))

    selection_digest = sha256_obj([
        {"paper_id": p["paper_id"], "doi": normalize_doi(p.get("doi"))} for p in selected
    ])

    manifest_papers = []
    for slot, p in enumerate(selected, start=1):
        abstract = p.get("abstract_text") or ""
        manifest_papers.append({
            "slot": slot,
            "paper_id": p["paper_id"],
            "doi": p.get("doi"),
            "doi_normalized": normalize_doi(p.get("doi")),
            "source_id": p["source_id"],
            "source_name": source_meta.get(p["source_id"], {}).get("name"),
            "issn": source_meta.get(p["source_id"], {}).get("issn"),
            "title": p.get("title"),
            "abstract_sha256": sha256_text(abstract),
            "has_abstract": True,
        })

    # Coverage across the WHOLE ready frame (eligible draw + excluded sources).
    all_by_source: dict[str, int] = {}
    abs_by_source: dict[str, int] = {}
    for p in all_ready:
        all_by_source[p["source_id"]] = all_by_source.get(p["source_id"], 0) + 1
        if has_abstract(p):
            abs_by_source[p["source_id"]] = abs_by_source.get(p["source_id"], 0) + 1
    coverage_rows = []
    excluded = []
    for s in sorted(all_by_source):
        n = all_by_source[s]
        a = abs_by_source.get(s, 0)
        coverage_rows.append({
            "source_id": s,
            "source_name": source_meta.get(s, {}).get("name"),
            "frame_n": n,
            "with_abstract": a,
            "missing_abstract": n - a,
            "selected_k": alloc.get(s, 0),
        })
        if a == 0:
            excluded.append({
                "source_id": s,
                "source_name": source_meta.get(s, {}).get("name"),
                "reason": "no abstracts in frame -> excluded from main eval set",
            })

    # Optional unknown-robustness subset drawn from the MISSING-abstract pool (seeded).
    miss_sorted = sorted(missing, key=stable_key)
    rng_u = random.Random(f"{seed}|unknown-robustness")
    u_n = min(unknown_robustness_n, len(miss_sorted))
    unknown_subset = rng_u.sample(miss_sorted, u_n)
    unknown_subset.sort(key=stable_key)
    missing_report = {
        "policy": "Papers without abstracts are NOT in the main 50. Coverage lists all of them; "
                  "unknown_robustness_subset_optional tests forced abstention (G4) only.",
        "total_missing_abstract": len(missing),
        "missing_by_source": [
            {"source_id": s, "source_name": source_meta.get(s, {}).get("name"),
             "missing": all_by_source[s] - abs_by_source.get(s, 0)}
            for s in sorted(all_by_source)
        ],
        "missing_papers": [
            {"paper_id": p["paper_id"], "doi": p.get("doi"), "source_id": p["source_id"],
             "source_name": source_meta.get(p["source_id"], {}).get("name"), "title": p.get("title")}
            for p in miss_sorted
        ],
        "unknown_robustness_subset_optional": [
            {"paper_id": p["paper_id"], "doi": p.get("doi"), "source_id": p["source_id"],
             "source_name": source_meta.get(p["source_id"], {}).get("name"), "title": p.get("title")}
            for p in unknown_subset
        ],
    }

    return {
        "manifest_version": SCHEMA_VERSION,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "seed": seed,
        "target_n": target_n,
        "actual_n": len(manifest_papers),
        "selection_sha256": selection_digest,
        "frame_policy": "abstract_only_main_set",
        "fields_extracted": EVIDENCE_FIELDS,
        "allocation_method": "largest_remainder_proportional over abstract-bearing papers",
        "tie_break": "source_id ascending for leftover seats",
        "within_stratum_sampling": "rng.sample over pool sorted by (normalized_doi, paper_id); rng seeded f'{seed}|{source_id}|abstract'",
        "frame": {
            "total_ready_papers": len(all_ready),
            "abstract_bearing_frame": len(eligible),
            "missing_abstract": len(missing),
            "ready_source_count": len(all_by_source),
            "abstract_source_count": len(by_source),
            "base_url": STAGING_BASE_URL,
        },
        "snapshot_provenance": {
            "snapshot_sha256": sha256_obj(snapshot),
            "staging_commit": snapshot.get("staging_commit"),
            "exported_at": snapshot.get("exported_at"),
        },
        "allocation": coverage_rows,
        "excluded_sources_no_abstract": excluded,
        "missing_abstract_report": missing_report,
        "papers": manifest_papers,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Abstract-only stratified 50-paper sampler (offline).")
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--out", required=True, help="main sample_manifest.json")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--n", type=int, default=TARGET_N)
    ap.add_argument("--unknown-n", type=int, default=UNKNOWN_ROBUSTNESS_N)
    args = ap.parse_args()

    raw = Path(args.snapshot).read_bytes()
    snapshot = json.loads(raw.decode("utf-8"))
    manifest = build_manifest(snapshot, args.seed, args.n, args.unknown_n)
    manifest["snapshot_provenance"]["snapshot_file_sha256"] = sha256_bytes(raw)
    write_json(Path(args.out), manifest)
    print(f"wrote {args.out}")
    f = manifest["frame"]
    print(f"  n={manifest['actual_n']} seed={args.seed} "
          f"abstract_frame={f['abstract_bearing_frame']} missing={f['missing_abstract']}")
    for row in manifest["allocation"]:
        print(f"  {row['source_name'][:36]:36} abstract={row['with_abstract']:3} "
              f"missing={row['missing_abstract']:3} selected_k={row['selected_k']}")
    for ex in manifest["excluded_sources_no_abstract"]:
        print(f"  EXCLUDED (no abstract): {ex['source_name']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
