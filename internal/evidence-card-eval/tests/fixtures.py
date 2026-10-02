"""Shared synthetic fixtures for offline tests (clearly NOT real staging data)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from common import READY_SOURCES  # noqa: E402


def make_synthetic_snapshot(papers_per_source: int = 25) -> dict:
    """Build a fake 7x25=175 snapshot. Tags every paper so tests never confuse it with staging."""
    papers = []
    for s in READY_SOURCES:
        for i in range(papers_per_source):
            pid = f"{s['source_id'][:8]}-paper-{i:03d}"
            papers.append({
                "paper_id": pid,
                "doi": f"10.0000/synth.{s['issn']}.{i:03d}",
                "source_id": s["source_id"],
                "title": f"[SYNTHETIC FIXTURE] {s['name']} paper {i}",
                "abstract_text": f"This study reports a synthetic abstract for paper {i}. "
                                 f"Participants N=40. Materials were in English.",
                "published_date": "2024-01-01",
            })
    return {
        "snapshot_version": "1.0.0",
        "source": {"base_url": "fixture://", "method": "authenticated_read_only_get"},
        "staging_commit": "fixture",
        "exported_at": "2026-01-01T00:00:00Z",
        "ready_sources": [{"source_id": s["source_id"], "name": s["name"],
                           "issn": s["issn"], "paper_count": papers_per_source}
                          for s in READY_SOURCES],
        "papers": papers,
    }


def make_realistic_snapshot() -> dict:
    """Mirror the real staging abstract gap: sources 3,5,6 have NO abstracts; others do."""
    snap = make_synthetic_snapshot(25)
    no_abs = {READY_SOURCES[i]["source_id"] for i in (2, 4, 6)}  # Cognition-ish, JML-ish, LangAcq-ish
    for p in snap["papers"]:
        if p["source_id"] in no_abs:
            p["abstract_text"] = None
    return snap

