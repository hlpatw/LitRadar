"""Shared helpers for the offline abstract evidence-card evaluation.

Stdlib-only on purpose: this must run with no network and no pip install.
Everything here is deterministic and has no side effects on the running app.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

# The ten extraction fields, in the fixed order used everywhere (manifest,
# annotation template, evaluator). Renaming one of these is a schema bump.
EVIDENCE_FIELDS = [
    "research_question",
    "method_paradigm",
    "sample_population",
    "sample_size",
    "material_language",
    "independent_variable",
    "dependent_variable",
    "main_findings",
    "author_conclusion",
    "author_limitations",
]

# Fields whose `value` is numeric; the evaluator applies numeric matching here.
NUMERIC_FIELDS = {"sample_size"}

# Fixed sampling frame: the 7 ready Crossref sources on staging at d6b3286.
# Captured read-only from GET /api/sources and /api/sources/:id (public).
# paper_count confirmed = 25 each, 175 total.
READY_SOURCES = [
    {"source_id": "246b61d8-c2bd-4b2c-9ec9-08d0d1dfa78c", "name": "Applied Psycholinguistics", "issn": "0142-7164"},
    {"source_id": "a7d0a236-944f-4dd9-a3c7-30efc249b080", "name": "Cognition", "issn": "0010-0277"},
    {"source_id": "52a698ec-8e16-41cc-a25e-0c82928bf7df", "name": "First Language", "issn": "0142-7237"},
    {"source_id": "e25f5d0d-21ef-4796-bdd2-e880179f2379", "name": "Journal of Child Language", "issn": "0305-0009"},
    {"source_id": "7983cb07-b548-4179-853d-7b8d1d7eed77", "name": "Journal of Memory and Language", "issn": "0749-596X"},
    {"source_id": "1bc71bb8-14b1-4ca7-a6d9-405367ccabed", "name": "Bilingualism: Language and Cognition", "issn": "1366-7289"},
    {"source_id": "3868e8cc-76ef-4aff-aa22-56e45df161ee", "name": "Language Acquisition", "issn": "1048-9223"},
]

STAGING_BASE_URL = "https://eloquent-rebirth-staging.up.railway.app"
BASELINE_COMMIT = "d6b32862b112daa20805057c96e7a4c468b5a52"
PROMPT_VERSION = "prompt-abstract-v1"
SCHEMA_VERSION = "1.0.0"


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write("\n")


def canonical_bytes(obj) -> bytes:
    """Canonical serialization used for content hashing (stable key order)."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_obj(obj) -> str:
    return hashlib.sha256(canonical_bytes(obj)).hexdigest()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def normalize_ws(text: str) -> str:
    """Collapse all whitespace runs to single spaces and trim, for substring checks."""
    return re.sub(r"\s+", " ", text).strip()


def normalize_doi(doi: str | None) -> str:
    if not doi:
        return ""
    d = doi.strip().lower()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    return d.strip()
