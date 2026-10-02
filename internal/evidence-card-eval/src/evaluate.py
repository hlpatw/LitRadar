#!/usr/bin/env python3
"""Offline evaluator: score model evidence cards against human gold annotations.

Metrics produced (per paper field):
  * per-field accuracy     -- does the model agree with gold on the unknown? decision AND,
                              when known, does the value match by the field comparator?
  * evidence localization  -- for every non-unknown model field, is evidence_sentence a
                              verbatim substring (whitespace-normalized) of the abstract?
  * numeric accuracy       -- on numeric fields (sample_size), exact number match.
  * appropriate-unknown    -- abstention recall (gold unknown -> model unknown) and
                              false-unknown rate (gold known -> model unknown).

If no model cards are present, the evaluator reports status=NOT_EXECUTED and emits NO
fabricated numbers. It never invents cards.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    EVIDENCE_FIELDS,
    NUMERIC_FIELDS,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    load_json,
    normalize_ws,
    write_json,
)

# Gate thresholds (authoritative copy lives in gates.md).
GATES = {
    "evidence_localization_min": 0.95,
    "numeric_accuracy_min": 0.90,
    "abstention_recall_min": 0.90,
    "false_unknown_rate_max": 0.10,
    "per_field_accuracy_min": 0.70,  # only enforced when a field has >= PER_FIELD_MIN_N examples
    "per_field_min_n": 10,
}


def tokens(s) -> set[str]:
    if s is None:
        return set()
    if isinstance(s, list):
        s = " ".join(str(x) for x in s)
    return set(re.findall(r"[a-z0-9]+", str(s).lower()))


def primary_number(v):
    if isinstance(v, (int, float)):
        return int(v)
    m = re.search(r"\d+", str(v))
    return int(m.group(0)) if m else None


def values_match(field: str, gold_value, model_value) -> bool:
    if field in NUMERIC_FIELDS:
        g, m = primary_number(gold_value), primary_number(model_value)
        if g is None or m is None:
            return False
        return g == m
    gt, mt = tokens(gold_value), tokens(model_value)
    if not gt or not mt:
        return False
    inter = len(gt & mt)
    f1 = 2 * inter / (len(gt) + len(mt))
    return f1 >= 0.5


def evaluate(snapshot: dict, manifest: dict, model_dir: Path, gold_dir: Path) -> dict:
    abstract_by_paper = {p["paper_id"]: (p.get("abstract_text") or "") for p in snapshot.get("papers", [])}

    gold_files = sorted(gold_dir.glob("*.json")) if gold_dir.exists() else []
    model_files = sorted(model_dir.glob("*.json")) if model_dir.exists() else []

    result = {
        "evaluator_version": SCHEMA_VERSION,
        "prompt_version": PROMPT_VERSION,
        "status": "ok",
        "n_model_cards": len(model_files),
        "n_gold_cards": len(gold_files),
    }

    if not model_files:
        result["status"] = "NOT_EXECUTED"
        result["note"] = (
            "No model evidence cards found under model-dir. Model run was not executed; "
            "no metrics are fabricated. See data/model_run.status.json."
        )
        result["gates"] = {
            "G1_plumbing": "NOT_RUN",
            "G2_evidence_localization": "NOT_RUN",
            "G3_numeric_accuracy": "NOT_RUN",
            "G4_appropriate_unknown": "NOT_RUN",
            "G5_per_field_accuracy": "NOT_RUN",
        }
        return result

    gold_by_paper = {p.stem: load_json(p) for p in gold_files}

    per_field = {f: {"n": 0, "correct": 0} for f in EVIDENCE_FIELDS}
    loc_total = 0
    loc_ok = 0
    num_total = 0
    num_ok = 0
    gold_abstain = 0
    model_correct_abstain = 0
    gold_known = 0
    false_unknown = 0

    for mf in model_files:
        card = load_json(mf)
        pid = card.get("paper_id") or mf.stem
        gold = gold_by_paper.get(pid)
        abstract = normalize_ws(abstract_by_paper.get(pid, ""))
        mfields = card.get("fields", {})

        for f in EVIDENCE_FIELDS:
            mv = mfields.get(f)
            if mv is None:
                continue
            # Evidence localization (model's own claim must trace to the abstract).
            if not mv.get("unknown", False):
                loc_total += 1
                ev = normalize_ws(mv.get("evidence_sentence", ""))
                if ev and ev in abstract:
                    loc_ok += 1

            if gold is None:
                continue  # no gold -> cannot score value accuracy
            gv = gold["fields"][f]
            per_field[f]["n"] += 1

            g_unknown = bool(gv.get("unknown", False))
            m_unknown = bool(mv.get("unknown", False))

            if g_unknown:
                gold_abstain += 1
                if m_unknown:
                    model_correct_abstain += 1
                    per_field[f]["correct"] += 1
                # else: model invented a value where gold says absent -> incorrect
            else:
                gold_known += 1
                if m_unknown:
                    false_unknown += 1
                else:
                    if values_match(f, gv.get("value"), mv.get("value")):
                        per_field[f]["correct"] += 1
                    if f in NUMERIC_FIELDS:
                        num_total += 1
                        if values_match(f, gv.get("value"), mv.get("value")):
                            num_ok += 1

    field_acc = {}
    for f in EVIDENCE_FIELDS:
        n = per_field[f]["n"]
        field_acc[f] = {"n_gold": n, "accuracy": (per_field[f]["correct"] / n) if n else None}

    localization = (loc_ok / loc_total) if loc_total else None
    numeric_accuracy = (num_ok / num_total) if num_total else None
    abstention_recall = (model_correct_abstain / gold_abstain) if gold_abstain else None
    false_unknown_rate = (false_unknown / gold_known) if gold_known else None

    result["metrics"] = {
        "per_field_accuracy": field_acc,
        "evidence_localization": localization,
        "evidence_localization_detail": {"checked": loc_total, "passed": loc_ok},
        "numeric_accuracy": numeric_accuracy,
        "numeric_detail": {"checked": num_total, "passed": num_ok},
        "appropriate_unknown": {
            "abstention_recall": abstention_recall,
            "false_unknown_rate": false_unknown_rate,
            "gold_abstain": gold_abstain,
            "gold_known": gold_known,
            "model_correct_abstain": model_correct_abstain,
            "false_unknown": false_unknown,
        },
    }

    def ge(x, thr):
        return x is not None and x >= thr

    def le(x, thr):
        return x is not None and x <= thr

    gates = {
        "G1_plumbing": "PASS",  # snapshot+manifest+cards loaded without error
        "G2_evidence_localization": ("PASS" if ge(localization, GATES["evidence_localization_min"]) else "FAIL"),
        "G3_numeric_accuracy": ("PASS" if ge(numeric_accuracy, GATES["numeric_accuracy_min"]) else "FAIL"),
        "G4_appropriate_unknown": (
            "PASS"
            if ge(abstention_recall, GATES["abstention_recall_min"])
            and le(false_unknown_rate, GATES["false_unknown_rate_max"])
            else "FAIL"
        ),
        "G5_per_field_accuracy": "PASS",
    }
    # G5: fail any field that has enough examples but low accuracy.
    for f in EVIDENCE_FIELDS:
        row = field_acc[f]
        if row["n_gold"] >= GATES["per_field_min_n"] and (row["accuracy"] or 0) < GATES["per_field_accuracy_min"]:
            gates["G5_per_field_accuracy"] = "FAIL"
    result["gates"] = gates
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="Score model evidence cards against gold (offline).")
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--gold-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    snapshot = load_json(Path(args.snapshot))
    manifest = load_json(Path(args.manifest))
    res = evaluate(snapshot, manifest, Path(args.model_dir), Path(args.gold_dir))
    write_json(Path(args.out), res)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
