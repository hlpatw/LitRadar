#!/usr/bin/env python3
"""Deterministic stratified sampler: pick 50 papers across the 7 ready sources.

Reproducibility contract:
  * Frame = papers in the corpus_snapshot whose source_id is one of the 7 ready sources.
  * Allocation = largest-remainder (Hamilton) proportional to per-source frame size;
    leftover seats tie-broken by source_id ascending (fully deterministic, no RNG).
  * Within a stratum, papers are sorted by a STABLE key (normalized DOI, then paper_id),
    then k are drawn with a per-stratum seeded RNG (seeded as f"{seed}|{source_id}").
  => Given the same snapshot bytes and the same seed, the manifest is bit-for-bit stable.

This script makes NO network calls. It reads a snapshot file the exporter already wrote.
"""
from __future__ import annotations

import argparse
import datetime as dt
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
    sha256_obj,
    sha256_text,
    write_json,
)

DEFAULT_SEED = 20261003
TARGET_N = 50


def stable_key(paper: dict) -> tuple:
    """Sort key independent of DB row order: normalized DOI, then paper_id."""
    return (normalize_doi(paper.get("doi")), paper.get("paper_id", ""))


def allocate(frame_counts: dict[str, int], target: int, source_order: list[str]) -> dict[str, int]:
    """Largest-remainder proportional allocation. Returns {source_id: k}."""
    total = sum(frame_counts.values())
    if total == 0:
        raise SystemExit("frame is empty; cannot allocate")
    exact = {s: target * frame_counts[s] / total for s in source_order}
    base = {s: int(exact[s] // 1) for s in source_order}
    allocated = sum(base.values())
    leftovers = target - allocated
    # Largest remainder; ties broken by source_id ascending (source_order is pre-sorted).
    order = sorted(source_order, key=lambda s: (-exact[s] % 1.0, s))
    i = 0
    while leftovers > 0:
        s = order[i % len(order)]
        # Never ask for more papers than exist in the stratum.
        if base[s] < frame_counts[s]:
            base[s] += 1
            leftovers -= 1
        i += 1
        if i > target * len(source_order) + 10:
            raise SystemExit("allocation did not converge")
    return base


def build_manifest(snapshot: dict, seed: int, target_n: int) -> dict:
    ready_ids = {s["source_id"] for s in READY_SOURCES}
    papers = [p for p in snapshot.get("papers", []) if p.get("source_id") in ready_ids]
    if not papers:
        raise SystemExit(
            "snapshot has no papers from the 7 ready sources. "
            "Run src/export_staging_readonly.py first (authenticated read-only)."
        )

    by_source: dict[str, list[dict]] = {}
    for p in papers:
        by_source.setdefault(p["source_id"], []).append(p)

    source_order = sorted(by_source.keys())
    frame_counts = {s: len(by_source[s]) for s in source_order}
    alloc = allocate(frame_counts, target_n, source_order)

    source_meta = {s["source_id"]: s for s in READY_SOURCES}
    selected = []
    for s in source_order:
        pool = sorted(by_source[s], key=stable_key)
        k = alloc[s]
        # Per-stratum seeded draw: reproducible and independent of pool list order.
        import random

        rng = random.Random(f"{seed}|{s}")
        chosen = rng.sample(pool, k)
        chosen.sort(key=stable_key)
        for p in chosen:
            selected.append(p)

    selected.sort(key=lambda p: (p["source_id"], stable_key(p)))

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
            "has_abstract": bool(abstract),
        })

    allocation_rows = [
        {
            "source_id": s,
            "source_name": source_meta.get(s, {}).get("name"),
            "frame_n": frame_counts[s],
            "allocated_k": alloc[s],
        }
        for s in source_order
    ]

    return {
        "manifest_version": SCHEMA_VERSION,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "seed": seed,
        "target_n": target_n,
        "actual_n": len(manifest_papers),
        "fields_extracted": EVIDENCE_FIELDS,
        "allocation_method": "largest_remainder_proportional",
        "tie_break": "source_id ascending for leftover seats",
        "within_stratum_sampling": "rng.sample over pool sorted by (normalized_doi, paper_id); rng seeded f'{seed}|{source_id}'",
        "frame": {
            "total_ready_papers": sum(frame_counts.values()),
            "ready_source_count": len(frame_counts),
            "base_url": STAGING_BASE_URL,
        },
        "snapshot_provenance": {
            "snapshot_sha256": sha256_obj(snapshot),
            "staging_commit": snapshot.get("staging_commit"),
            "exported_at": snapshot.get("exported_at"),
        },
        "allocation": allocation_rows,
        "papers": manifest_papers,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Stratified 50-paper sampler (offline, deterministic).")
    ap.add_argument("--snapshot", required=True, help="path to corpus_snapshot.staging.json")
    ap.add_argument("--out", required=True, help="path to write sample_manifest.json")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--n", type=int, default=TARGET_N)
    args = ap.parse_args()

    snapshot = load_json(Path(args.snapshot))
    manifest = build_manifest(snapshot, args.seed, args.n)
    write_json(Path(args.out), manifest)
    print(f"wrote {args.out}")
    print(f"  n={manifest['actual_n']} seed={args.seed} frame={manifest['frame']['total_ready_papers']}")
    for row in manifest["allocation"]:
        print(f"  {row['source_name']:<38} frame={row['frame_n']:>3} k={row['allocated_k']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
