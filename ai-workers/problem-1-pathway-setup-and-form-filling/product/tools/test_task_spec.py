#!/usr/bin/env python3
"""Tests for task-spec.py (LR-106). Made-up fixtures in a temp folder; standard library only, US$0.
Run: python3 -I product/tools/test_task_spec.py"""
import pathlib, subprocess, sys, tempfile, unittest

HERE = pathlib.Path(__file__).resolve().parent
BACKLOG = """# Backlog

| # | Area | Item | Source · waits on · decisions | Done when |
|---|---|---|---|---|
| FO-1 | screens | **A list**<br>• sorted newest first | **Source:** P-1 · **decisions:** P-2 | Browser check: the newest row is first; check_fo1.ts exits 0 |
| FO-2 | screens | No check yet | **Source:** P-1 | - |
"""
DECISIONS = "| ID | Date | Decision |\n|---|---|---|\n| P-1 | 1 Nov | Lists show the newest first. |\n| P-2 | 2 Nov | Dates in IST. |\n"


class TaskSpec(unittest.TestCase):
    def run_spec(self, row):
        d = pathlib.Path(self.tmp.name)
        return subprocess.run([sys.executable, "-I", str(HERE / "task-spec.py"), row, "--backlog", str(d / "B.md"),
                               "--decisions", str(d / "D.md"), "--trace", str(d / "T.md"), "--requirements", str(d / "req")],
                              capture_output=True, text=True)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = pathlib.Path(self.tmp.name)
        (d / "B.md").write_text(BACKLOG); (d / "D.md").write_text(DECISIONS); (d / "T.md").write_text("# trace\n")
        (d / "req").mkdir(); (d / "req" / "AG-01-x.md").write_text("# AG-01\n")

    def tearDown(self):
        self.tmp.cleanup()

    def test_spec_has_done_when_first_then_row_and_decisions_in_words(self):
        r = self.run_spec("FO-1")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = r.stdout
        self.assertLess(out.index("## Done when"), out.index("## Item"))
        self.assertIn("check_fo1.ts exits 0", out)
        self.assertIn("• sorted newest first", out)          # <br> becomes a new line
        self.assertIn("Lists show the newest first.", out)   # P-1, from Source, in words
        self.assertIn("Dates in IST.", out)                  # P-2, named in the row only, in words too

    def test_row_without_done_when_is_refused(self):
        r = self.run_spec("FO-2")
        self.assertEqual(r.returncode, 1)
        self.assertIn("no Done when", r.stderr)

    def test_unknown_row(self):
        self.assertEqual(self.run_spec("FO-9").returncode, 2)


if __name__ == "__main__":
    unittest.main()
