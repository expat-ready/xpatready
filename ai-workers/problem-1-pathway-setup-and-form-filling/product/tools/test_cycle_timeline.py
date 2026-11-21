#!/usr/bin/env python3
"""Tests for cycle-timeline.py (ENF-783b, P-783 (2), A244). Runs the tool as `python3 -I` on the Sample plan in
fixtures/cycle-timeline/ with GitHub answered from a file and a fixed clock. US$0, no network.
  python3 -I product/tools/test_cycle_timeline.py
"""
import os
import re
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
FX = os.path.join(HERE, "fixtures", "cycle-timeline")


def run(now="2026-11-21T11:40+05:30", plan="plan.json", fixture="github.json"):
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "cycle-timeline.py"), "--plan", os.path.join(FX, plan),
                        "--fixture", os.path.join(FX, fixture), "--capabilities", os.path.join(FX, "CAPABILITIES.md"),
                        "--now", now], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def line(out, r1):
    return next(l for l in out.splitlines() if re.search(r"\s%s\s" % re.escape(r1), l))


class CycleTimeline(unittest.TestCase):
    def setUp(self):
        self.rc, self.out, self.err = run()

    def test_prints_fifteen_rows_split_8_and_7(self):
        self.assertEqual(self.rc, 0, self.err)
        rows = [l for l in self.out.splitlines() if re.match(r"^  \S+\s+R1\.\d+\s", l)]
        self.assertEqual(len(rows), 15, self.out)
        self.assertIn("First 8 by 19:00 — 2 of 8 proven", self.out)
        self.assertIn("Next 7 by 07:00 — 0 of 7 proven", self.out)
        self.assertIn("Cycle 21 Nov 07:00 → 22 Nov 07:00 IST · now 11:40 IST · proven 2 of 15", self.out)
        print(self.out)

    def test_proven_rows_are_ticked_first(self):
        first = self.out.split("First 8")[1].splitlines()[1:3]
        self.assertTrue(all("✅" in l and "· proven" in l for l in first), first)

    def test_every_open_row_has_eta_step_waits_and_verdict(self):
        for l in self.out.splitlines():
            if re.match(r"^  \S+\s+R1\.\d+\s", l) and "✅" not in l:
                self.assertRegex(l, r" · waits on .+ · (on time|late by .+|no ETA)", l)

    def test_steps_from_pr_states(self):
        self.assertIn("qa proof (merged #13) · waits on qa", line(self.out, "R1.42"))
        self.assertIn("merge queue #14", line(self.out, "R1.49"))
        self.assertIn("approved, not queued #15", line(self.out, "R1.32"))
        self.assertIn("building #17 (draft)", line(self.out, "R1.47"))      # #16 merged, #17 draft: the open part leads
        self.assertIn("review #18 · waits on reviewer Approve", line(self.out, "R1.108"))
        self.assertIn("no open PR (#22 closed unmerged)", line(self.out, "R1.13"))
        self.assertIn("labelled #24 · waits on Mergify to queue it", line(self.out, "R1.3"))

    def test_mergify_eta_plus_proof_minutes_in_ist(self):
        self.assertTrue(line(self.out, "R1.49").lstrip().startswith("~13:02"), line(self.out, "R1.49"))   # 06:32 UTC +5:30 +60
        self.assertIn("merge ~12:02", line(self.out, "R1.49"))

    def test_lead_overrides_win(self):
        self.assertIn("waits on PF-12b2 to be shaped", line(self.out, "R1.4"))
        self.assertTrue(line(self.out, "R1.10").lstrip().startswith("09:30"))

    def test_on_time_and_late(self):
        self.assertIn("on time", line(self.out, "R1.49"))
        self.assertIn("no ETA", line(self.out, "R1.108"))
        self.assertIn("ETA 09:30 passed", line(self.out, "R1.10"))
        rc, out, _ = run(now="2026-11-21T19:45+05:30")      # past 19:00: unproven first-8 rows are late
        self.assertIn("late by 45 min", line(out, "R1.4"))
        self.assertTrue(line(out, "R1.19").endswith("on time"), line(out, "R1.19"))   # ~20:40 is before 07:00's deadline

    def test_a_passed_eta_turns_late_after_the_deadline(self):
        rc, out, _ = run(now="2026-11-22T06:50+05:30")
        self.assertIn("late by 11h50m", line(out, "R1.4 "))       # no ETA, 19:00 passed
        self.assertIn("on time (ETA 09:30 passed", line(out, "R1.10"))   # 07:00 not yet reached
        rc, out, _ = run(now="2026-11-21T20:00+05:30")
        self.assertIn("late by 1h00m", line(out, "R1.49"))         # Mergify ~13:02 passed, 19:00 passed, unproven

    def test_github_down_stops_after_one_failure(self):
        sys.path.insert(0, HERE)
        import importlib.util
        spec = importlib.util.spec_from_file_location("ct", os.path.join(HERE, "cycle-timeline.py"))
        ct = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ct)
        calls = []
        gh = ct.GitHub.__new__(ct.GitHub)
        gh.token, gh.down = "x", None
        real = ct.subprocess.run
        ct.subprocess.run = lambda *a, **k: (calls.append(1), real(["false"], capture_output=True, text=True))[1]
        try:
            for n in (1, 2, 3):
                with self.assertRaises(OSError):
                    gh.pull(n)
        finally:
            ct.subprocess.run = real
        self.assertEqual(len(calls), 1)

    def test_07_00_deadline_is_the_cycle_end(self):
        rc, out, _ = run(now="2026-11-22T06:59+05:30")
        self.assertIn("no ETA", line(out, "R1.24"))
        self.assertNotIn("late", line(out, "R1.24"))

    def test_stale_plan_is_flagged(self):
        rc, out, _ = run(now="2026-11-22T08:00+05:30")
        self.assertIn("ACT   cycle-plan.json is for the cycle starting 2026-11-21 07:00, not 2026-11-22", out)

    def test_unreadable_plan_exits_2(self):
        rc, out, err = run(plan="missing.json")
        self.assertEqual(rc, 2)
        self.assertIn("plan unreadable", err)

    def test_real_plan_parses(self):
        import json
        with open(os.path.join(HERE, "..", "cycle-plan.json"), encoding="utf-8") as f:
            plan = json.load(f)
        self.assertTrue(plan["rows"])
        self.assertTrue(all(r["by"] in ("19:00", "07:00") and r["r1"].startswith("R1.") for r in plan["rows"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
