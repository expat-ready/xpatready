#!/usr/bin/env python3
"""ENF-733 (b): tests of focus-truth.py on Sample fixtures (made-up items, not qa's real statuses). Standard library only.
  python3 -I product/tools/test_focus_truth.py
"""
import os, subprocess, sys, tempfile, unittest

TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "focus-truth.py")

CAPS = """# Capabilities (Sample)
| # | Map row: capability | Module | Status | Tested on |
|---|---|---|---|---|
| R1.1 | 1 Sample proven item | Platform | Works | aaaa 1 Nov |
| R1.2 | 2 Sample half-done item | Platform | Partial | bbbb 1 Nov |
| R1.3 | 3 Sample second proven item | Front office | Works | cccc 1 Nov |
| R1.4 | 4 Sample unbuilt item | Front office | Not built | — |
| R1.5 | 5 Sample listed partial | Front office | Partial | dddd 1 Nov |
"""

HEAD = "# Focus list (Sample)\n\n| Item | Rows a brief may name | Lead | Parts left |\n|---|---|---|---|\n"
STALE = HEAD + "| R1.1 | J-1 | Lead B | J-1 |\n| R1.3, R1.5 | FO-3 | Lead B | FO-3 |\n| R1.4 | PF-4 | Lead B | PF-4 |\n"
CLEAN = HEAD + "| R1.2 | J-2 | Lead B | J-2 |\n| R1.3, R1.5 | FO-3 | Lead B | FO-3 |\n| R1.4 | PF-4 | Lead B | PF-4 |\n"


class FocusTruth(unittest.TestCase):
    def run_tool(self, focus, *extra, caps=CAPS):
        d = tempfile.mkdtemp()
        lp, cp = os.path.join(d, "focus-list.md"), os.path.join(d, "CAPABILITIES.md")
        for path, text in ((lp, focus), (cp, caps)):
            with open(path, "w") as f:
                f.write(text)
        r = subprocess.run([sys.executable, "-I", TOOL, "--list", lp, "--caps", cp, *extra], capture_output=True, text=True)
        self.addCleanup(lambda: [os.remove(lp), os.remove(cp), os.rmdir(d)])
        with open(lp) as f:
            return r.returncode, r.stdout, f.read()

    def test_works_item_flagged_for_drop(self):
        rc, out, _ = self.run_tool(STALE)
        self.assertEqual(rc, 1)
        self.assertIn("drop: proven  R1.1 ", out)
        self.assertNotIn("drop: proven  R1.3", out)   # R1.5 on the same line is Partial: the line stays
        self.assertNotIn("drop: proven  R1.4", out)   # Not built stays

    def test_partial_item_flagged_missing(self):
        rc, out, _ = self.run_tool(STALE)
        self.assertEqual(rc, 1)
        self.assertIn("missing: Partial, not listed  R1.2 2 Sample half-done item", out)
        self.assertNotIn("missing: Partial, not listed  R1.5", out)   # listed (with R1.3)
        self.assertIn("1 proven line(s), 1 Partial item(s) missing", out)

    def test_unlisted_not_built_is_not_missing(self):   # review: only Partial items are "missing"; Not built and Broken are not
        caps = CAPS + "| R1.6 | 6 Sample unlisted unbuilt | Front office | Not built | — |\n| R1.7 | 7 Sample broken | Platform | Broken | — |\n"
        rc, out, _ = self.run_tool(CLEAN, caps=caps)
        self.assertEqual(rc, 0, out)
        self.assertNotIn("R1.6", out)
        self.assertNotIn("R1.7", out)

    def test_caps_not_utf8_exits_2(self):
        d = tempfile.mkdtemp(); cp = os.path.join(d, "c.md"); lp = os.path.join(d, "l.md")
        with open(cp, "wb") as f:
            f.write(b"| R1.1 | \xff\xfe | x | Works | - |\n")
        with open(lp, "w") as f:
            f.write(CLEAN)
        r = subprocess.run([sys.executable, "-I", TOOL, "--list", lp, "--caps", cp], capture_output=True, text=True)
        self.addCleanup(lambda: [os.remove(lp), os.remove(cp), os.rmdir(d)])
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("not UTF-8", r.stdout)

    def test_clean_list_exits_0(self):
        rc, out, _ = self.run_tool(CLEAN)
        self.assertEqual(rc, 0, out)
        self.assertNotIn("drop:", out)
        self.assertNotIn("missing:", out)

    def test_md_prints_corrected_list_and_never_writes(self):
        rc, out, after = self.run_tool(STALE, "--md")
        self.assertEqual(rc, 1)
        self.assertEqual(after, STALE)   # the file is the Lead's: unchanged
        self.assertNotIn("| R1.1 |", out)
        self.assertIn("| R1.3, R1.5 | FO-3 |", out)
        self.assertIn("| R1.2 | - | ? |", out)

    def test_unreadable_caps_exits_2(self):
        rc, out, _ = self.run_tool(CLEAN, caps="no table here\n")
        self.assertEqual(rc, 2)
        self.assertIn("nothing was checked", out)

    def test_empty_list_exits_2_not_a_finding(self):
        rc, out, _ = self.run_tool("")   # e.g. git show of a moved file gave nothing
        self.assertEqual(rc, 2)
        self.assertNotIn("missing:", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
