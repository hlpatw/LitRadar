import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "tests"))

from sample import build_manifest  # noqa: E402
from fixtures import make_synthetic_snapshot  # noqa: E402


class SampleTests(unittest.TestCase):
    def setUp(self):
        self.snap = make_synthetic_snapshot(25)

    def test_target_n_and_strata(self):
        m = build_manifest(self.snap, seed=20261003, target_n=50)
        self.assertEqual(m["actual_n"], 50)
        self.assertEqual(m["frame"]["total_ready_papers"], 175)
        self.assertEqual(m["frame"]["ready_source_count"], 7)
        # allocation sums to 50
        self.assertEqual(sum(r["allocated_k"] for r in m["allocation"]), 50)
        # each source contributes between 7 and 8 (uniform 25/25/... x50)
        for r in m["allocation"]:
            self.assertIn(r["allocated_k"], (7, 8))

    def test_doi_based_keys_and_no_dupes(self):
        m = build_manifest(self.snap, seed=20261003, target_n=50)
        dois = [p["doi_normalized"] for p in m["papers"]]
        self.assertEqual(len(dois), len(set(dois)))
        self.assertEqual(len(dois), 50)
        for p in m["papers"]:
            self.assertTrue(p["doi_normalized"].startswith("10.0000/"))

    def test_reproducible_same_seed(self):
        a = build_manifest(self.snap, seed=20261003, target_n=50)
        b = build_manifest(self.snap, seed=20261003, target_n=50)
        # strip volatile timestamp before comparison
        a.pop("generated_at"); b.pop("generated_at")
        self.assertEqual(a, b)

    def test_different_seed_changes_selection(self):
        a = {p["paper_id"] for p in build_manifest(self.snap, seed=1, target_n=50)["papers"]}
        b = {p["paper_id"] for p in build_manifest(self.snap, seed=2, target_n=50)["papers"]}
        self.assertNotEqual(a, b)

    def test_provenance_recorded(self):
        m = build_manifest(self.snap, seed=20261003, target_n=50)
        self.assertEqual(m["seed"], 20261003)
        self.assertTrue(m["snapshot_provenance"]["snapshot_sha256"])
        self.assertIn("allocation_method", m)


if __name__ == "__main__":
    unittest.main()
