#!/usr/bin/env python3
"""Unit tests for tools/merge-queue-causes.py (B194): how a failed batch is read and classified. No network.
Run: python3 -m unittest product/tools/test_merge_queue_causes.py"""
import importlib.util, os, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("mqc", os.path.join(HERE, "merge-queue-causes.py"))
mqc = importlib.util.module_from_spec(spec); spec.loader.exec_module(mqc)

def batch(n, created, members, ahead=(), suites=(), jobs=("shard 1",)):
    return {"n": n, "created": created, "members": list(members), "ahead": list(ahead), "suites": list(suites), "jobs": list(jobs)}

def life(merged=True, pushes=()):
    return {"merged": merged, "files": [], "pushed_after": lambda ts: any(mqc.t(p) > mqc.t(ts) for p in pushes)}

class Read(unittest.TestCase):
    def test_members_and_ahead(self):
        self.assertEqual(mqc.members("checking #1808 + #1810 together on main (53596ff), stacked on 4 pull requests ahead"), [1808, 1810])
        self.assertEqual(mqc.members("merged #1822: screens: FO-4 (beside FO-2 part 1, #1813)"), [1822])
        body = "### Queued ahead of this batch\n\n- [#1834](/x) + [#1818](/x)\n- [#1823](/x)\n\n<details>[#9](/x)"
        self.assertEqual(mqc.ahead(body), [1834, 1818, 1823])

    def test_suites_failed_twice_retried_and_not_retried(self):
        log = ("| check_fo7a_money_schema.ts | FAIL | 33 s | exit 1 |\n"
               "retries: 2 · passed on retry: check_a.ts · failed twice: check_b.cjs (one retry per failed suite)\n")
        self.assertEqual(mqc.suites(log), (["check_b.cjs", "check_fo7a_money_schema.ts"], ["check_a.ts"]))

class Classify(unittest.TestCase):
    A = batch(1, "2026-11-15T12:45:00Z", [10, 11], suites=["check_x.ts"])

    def test_cascade_same_suite_stacked_on_an_earlier_failure(self):
        b = batch(2, "2026-11-15T12:53:00Z", [20], ahead=[11], suites=["check_x.ts"])
        self.assertEqual(mqc.classify(b, [self.A, b], {})[0], "cascade")

    def test_broke_when_a_member_pushed_after_the_failure(self):
        later = {10: life(), 11: life(pushes=["2026-11-15T13:40:00Z"])}
        self.assertEqual(mqc.classify(self.A, [self.A], later), ("broke", "new push after the failure on #11"))

    def test_flaky_when_members_merged_unchanged(self):
        later = {10: life(pushes=["2026-11-15T12:00:00Z"]), 11: life()}   # a push before the batch does not count
        self.assertEqual(mqc.classify(self.A, [self.A], later)[0], "flaky")

    def test_never_merged_is_a_break(self):
        self.assertEqual(mqc.classify(self.A, [self.A], {10: life(), 11: life(merged=False)})[0], "broke")

    def test_a_different_suite_ahead_is_not_a_cascade(self):
        b = batch(2, "2026-11-15T12:53:00Z", [20], ahead=[11], suites=["check_y.ts"])
        self.assertEqual(mqc.classify(b, [self.A, b], {20: life()})[0], "flaky")

if __name__ == "__main__":
    unittest.main()
