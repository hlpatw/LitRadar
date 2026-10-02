#!/usr/bin/env python3
"""Minimal structural validator for the corpus snapshot (stdlib only, no jsonschema dep).

Checks the invariants the sampler/evaluator rely on: required top-level keys, paper keys,
that every paper references a known ready source, and reports abstract availability.
Exits non-zero on structural problems.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import READY_SOURCES, load_json  # noqa: E402

REQUIRED_TOP = ["snapshot_version", "staging_commit", "ready_sources", "papers"]
REQUIRED_PAPER = ["paper_id", "doi", "source_id", "title", "abstract_text"]


def validate(snapshot: dict) -> list[str]:
    errors = []
    for k in REQUIRED_TOP:
        if k not in snapshot:
            errors.append(f"missing top-level key: {k}")
    ready_ids = {s["source_id"] for s in READY_SOURCES}
    for i, p in enumerate(snapshot.get("papers", [])):
        for k in REQUIRED_PAPER:
            if k not in p:
                errors.append(f"paper[{i}] missing key: {k}")
        if p.get("source_id") not in ready_ids:
            errors.append(f"paper[{i}] source_id {p.get('source_id')!r} not a ready source")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    args = ap.parse_args()
    snap = load_json(Path(args.snapshot))
    errs = validate(snap)
    papers = snap.get("papers", [])
    has = sum(1 for p in papers if (p.get("abstract_text") or "").strip())
    print(f"papers={len(papers)} with_abstract={has} missing={len(papers)-has}")
    if errs:
        for e in errs:
            print("ERROR:", e)
        return 1
    print("schema structural check: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
