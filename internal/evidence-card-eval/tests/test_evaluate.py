import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from evaluate import evaluate  # noqa: E402

ABSTRACT = "We tested 40 adults on a self-paced reading task in English."


def card(pid, fields):
    return {
        "schema_version": "1.0.0",
        "paper_id": pid,
        "doi": "10.0000/x",
        "source_id": "s1",
        "source_name": "S",
        "abstract_sha256": "0" * 64,
        "model_version": "test",
        "prompt_version": "prompt-abstract-v1",
        "card_status": "extracted",
        "fields": fields,
    }


def f(value, unknown, evidence=""):
    return {
        "value": value,
        "unknown": unknown,
        "evidence_sentence": evidence,
        "source_level": "abstract",
        "confidence": 0.9,
        "origin": "verbatim" if not unknown else "n/a",
        "char_span": [0, len(evidence)] if evidence else None,
    }


class EvalTests(unittest.TestCase):
    def _snapshot(self):
        return {"papers": [{"paper_id": "p1", "abstract_text": ABSTRACT}]}

    def _write(self, d, obj):
        Path(d).mkdir(parents=True, exist_ok=True)
        p = Path(d) / "p1.json"
        p.write_text(json.dumps(obj), encoding="utf-8")
        return p.parent

    def test_not_executed_when_no_model(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            res = evaluate(self._snapshot(), {}, t / "model", t / "gold")
            self.assertEqual(res["status"], "NOT_EXECUTED")
            self.assertEqual(res["gates"]["G2_evidence_localization"], "NOT_RUN")

    def test_metrics(self):
        gold_fields = {
            "sample_size": f(40, False, "tested 40 adults"),
            "method_paradigm": f("self-paced reading", False, "self-paced reading task"),
            "material_language": f("English", False, "in English"),
            "research_question": f(None, True),
        }
        model_fields = {
            "sample_size": f(40, False, "tested 40 adults"),
            "method_paradigm": f("self-paced reading", False, "self-paced reading task"),
            "material_language": f("English", False, "in English"),
            "research_question": f(None, True),
        }
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            gold = self._write(t / "gold", card("p1", gold_fields))
            model = self._write(t / "model", card("p1", model_fields))
            res = evaluate(self._snapshot(), {}, model, gold)
        self.assertEqual(res["status"], "ok")
        m = res["metrics"]
        self.assertEqual(m["evidence_localization"], 1.0)
        self.assertEqual(m["numeric_accuracy"], 1.0)
        self.assertEqual(m["appropriate_unknown"]["abstention_recall"], 1.0)
        self.assertEqual(m["appropriate_unknown"]["false_unknown_rate"], 0.0)
        self.assertEqual(res["gates"]["G2_evidence_localization"], "PASS")

    def test_bad_evidence_fails_localization(self):
        gold_fields = {"sample_size": f(40, False, "tested 40 adults")}
        # model evidence sentence is NOT in the abstract
        model_fields = {"sample_size": f(40, False, "the participants were forty in number")}
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            gold = self._write(t / "gold", card("p1", gold_fields))
            model = self._write(t / "model", card("p1", model_fields))
            res = evaluate(self._snapshot(), {}, model, gold)
        self.assertEqual(res["metrics"]["evidence_localization_detail"]["passed"], 0)
        self.assertLess(res["metrics"]["evidence_localization"], 1.0)


if __name__ == "__main__":
    unittest.main()
