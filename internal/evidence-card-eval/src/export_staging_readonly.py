#!/usr/bin/env python3
"""Read-only exporter: pull staging paper metadata + abstracts into an offline snapshot.

HARD SAFETY CONTRACT (read this before running):
  * Issues HTTP GET requests ONLY. No POST / PATCH / DELETE. No sync triggers.
  * Requires an already-authenticated bearer token in env LITRADAR_STAGING_TOKEN.
    The token is never printed and never written to disk.
  * Writes exactly ONE file (the snapshot) locally. Writes nothing to staging.
  * Staging paper list endpoints require a logged-in session; obtain the token by
    logging in through the official UI and copying the bearer token your browser uses.
    This script will not register, create, or mutate any account/row.

Usage:
    set LITRADAR_STAGING_TOKEN=...        # PowerShell: $env:LITRADAR_STAGING_TOKEN="..."
    python src/export_staging_readonly.py --out data/corpus_snapshot.staging.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import READY_SOURCES, SCHEMA_VERSION, STAGING_BASE_URL, write_json  # noqa: E402

PAGE_SIZE = 100


def _get_json(base: str, path: str, token: str):
    url = base + path
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description="Authenticated read-only staging paper export.")
    ap.add_argument("--out", required=True)
    ap.add_argument("--base-url", default=STAGING_BASE_URL)
    args = ap.parse_args()

    token = os.environ.get("LITRADAR_STAGING_TOKEN", "").strip()
    if not token:
        print("ERROR: set LITRADAR_STAGING_TOKEN to an authenticated bearer token.", file=sys.stderr)
        return 2

    base = args.base_url.rstrip("/")
    version = _get_json(base, "/api/version", token)

    ready_ids = {s["source_id"] for s in READY_SOURCES}
    papers = []
    source_counts = []
    for s in READY_SOURCES:
        sid = s["source_id"]
        page = 1
        while True:
            resp = _get_json(
                base,
                f"/api/sources/{sid}/papers?page={page}&pageSize={PAGE_SIZE}",
                token,
            )
            items = resp.get("items", [])
            for it in items:
                papers.append({
                    "paper_id": it["id"],
                    "doi": it.get("doi"),
                    "source_id": it.get("journalId") or sid,
                    "title": it.get("title"),
                    "abstract_text": it.get("abstractText"),
                    "published_date": it.get("publishedDate"),
                    "authors": it.get("authors"),
                    "url": it.get("url"),
                })
            total = resp.get("total", 0)
            if page * PAGE_SIZE >= total:
                break
            page += 1
        source_counts.append({
            "source_id": sid,
            "name": s["name"],
            "issn": s["issn"],
            "paper_count": sum(1 for p in papers if p["source_id"] == sid),
        })

    snapshot = {
        "snapshot_version": SCHEMA_VERSION,
        "source": {
            "base_url": base,
            "method": "authenticated_read_only_get",
            "exported_by": os.environ.get("USERNAME") or "operator",
        },
        "staging_commit": version.get("commit"),
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ready_sources": source_counts,
        "papers": papers,
    }
    write_json(Path(args.out), snapshot)
    print(f"wrote {args.out}")
    print(f"  staging_commit={snapshot['staging_commit']} papers={len(papers)}")
    for row in source_counts:
        print(f"  {row['name']:<38} papers={row['paper_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
