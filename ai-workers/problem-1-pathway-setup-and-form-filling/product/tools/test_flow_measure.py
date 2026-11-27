#!/usr/bin/env python3
"""Unit tests for tools/flow-measure.py's ENF-782b measures (P-782 (3)): start to Proven, review rounds, first-time proof,
the reverse plan and queue bounces, each on hand-made fixtures with hand-worked answers. No network.
Run: python3 -I product/tools/test_flow_measure.py   (in CI: .github/workflows/cockpit-tests.yml)"""
import importlib.util, json, os, sys, unittest
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("GITHUB_REPOSITORY", "owner/repo")   # no git remote read at import
spec = importlib.util.spec_from_file_location("fm", os.path.join(HERE, "flow-measure.py"))
fm = importlib.util.module_from_spec(spec); spec.loader.exec_module(fm)

U = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
ROW = lambda r, st, tested: f"+| {r} | {r[3:]} Something | Platform | {st} | {tested} | — | done when | note |"
# Three main commits touching qa/CAPABILITIES.md, oldest first (git log --reverse --first-parent -p).
LOG = "\n".join([
    "@@C aaa 2026-11-15T03:00:00+00:00",
    ROW("R1.1", "Not built", "x 14 Nov"), ROW("R1.2", "Works", "x 14 Nov"), ROW("R1.3", "Built, awaiting qa", "x 14 Nov"),
    ROW("R1.4", "Not built", "x 14 Nov"),
    "-| R1.3 | old line | Platform | Not built | x | — | a | b |",
    "@@C bbb 2026-11-20T06:00:00+00:00",
    ROW("R1.3", "Partial", "y 20 Nov"), ROW("R1.4", "Works", "y 20 Nov"),
    "@@C ccc 2026-11-21T02:00:00+00:00",
    ROW("R1.3", "Works", "z 21 Nov"), ROW("R1.2", "Partial", "z 21 Nov"),
])
NOW = U("2026-11-21T06:00")


class History(unittest.TestCase):
    def test_rows_and_statuses_in_order(self):
        h = fm.cap_history(LOG)
        self.assertEqual(sorted(h), ["R1.1", "R1.2", "R1.3", "R1.4"])
        self.assertEqual([e[1] for e in h["R1.3"]], ["Built, awaiting qa", "Partial", "Works"])   # "-" lines never count
        self.assertEqual(h["R1.4"][1][0], U("2026-11-20T06:00"))

    def test_shallow_edge_is_a_baseline_not_a_change(self):
        h = fm.cap_history(LOG, shallow={"aaa"})
        self.assertTrue(h["R1.2"][0][3]); self.assertFalse(h["R1.3"][1][3])

    def test_proven_is_the_start_of_the_current_works_streak(self):
        h = fm.cap_history(LOG)
        self.assertEqual(fm.proven_at(h["R1.3"])[0], U("2026-11-21T02:00"))
        self.assertIsNone(fm.proven_at(h["R1.2"]))   # reopened to Partial: not Proven now
        self.assertIsNone(fm.proven_at(h["R1.1"]))


class StartToProven(unittest.TestCase):
    PRS = [
        {"number": 10, "title": "runtime: R1.3 part 1", "body": "", "created_at": "2026-11-18T06:00:00Z", "head": {"ref": "claude/x"}},
        {"number": 12, "title": "evidence: J-3", "body": "Item: R1.3 (walk)\nSee R1.1 too", "created_at": "2026-11-17T06:00:00Z", "head": {"ref": "c"}},
        {"number": 13, "title": "qa: capability R1.4 Works", "body": "Item: R1.4", "created_at": "2026-11-16T00:00:00Z", "head": {"ref": "q"}},
        {"number": 14, "title": "fix", "body": "Completes: R1.1, R1.4", "created_at": "2026-11-19T06:00:00Z", "head": {"ref": "f"}},
    ]

    def test_pr_rows_only_title_item_and_completes_lines(self):
        self.assertEqual(fm.pr_rows(self.PRS[1]), {"R1.3"})        # "See R1.1 too" is prose, not a link
        self.assertEqual(fm.pr_rows(self.PRS[2]), set())            # qa records PR left out
        self.assertEqual(fm.pr_rows(self.PRS[3]), {"R1.1", "R1.4"})

    def test_first_pr_to_proven_median_and_rows_without_a_pr(self):
        a = fm.start_to_proven(fm.cap_history(LOG), fm.first_prs(self.PRS))
        # R1.3: #12 opened 17 Nov 06:00 → Works 21 Nov 02:00 = 3.8 d; R1.4: #14 19 Nov 06:00 → 20 Nov 06:00 = 1.0 d.
        self.assertEqual([(r["row"], r["pr"], r["days"]) for r in a["rows"]], [("R1.3", 12, 3.8), ("R1.4", 14, 1.0)])
        self.assertEqual(a["median_days"], 2.4)
        self.assertEqual(a["no_pr"], [])

    def test_pr_opened_after_proven_does_not_count(self):
        a = fm.start_to_proven(fm.cap_history(LOG), fm.first_prs(self.PRS[3:] + [{**self.PRS[3], "number": 15, "body": "Item: R1.3", "created_at": "2026-11-21T05:00:00Z"}]))
        self.assertEqual(a["no_pr"], ["R1.3"])

    def test_baseline_works_is_not_timed(self):
        a = fm.start_to_proven(fm.cap_history(LOG, shallow={"bbb"}), fm.first_prs(self.PRS))
        self.assertEqual(a["baseline"], 1); self.assertEqual([r["row"] for r in a["rows"]], ["R1.3"])


class FirstProof(unittest.TestCase):
    def test_first_score_works_share(self):
        # First scores: R1.2 Works (15 Nov), R1.3 Partial (20 Nov), R1.4 Works (20 Nov); R1.1 never scored.
        c = fm.first_proof(fm.cap_history(LOG), since=U("2026-11-20T00:00"))
        self.assertEqual((c["n"], c["works_first"], c["share"]), (3, 2, 66.7))
        self.assertEqual(c["in_window"], [2, 1])


class ReversePlan(unittest.TestCase):
    def test_left_need_net_and_forecast(self):
        d = fm.reverse_plan(fm.cap_history(LOG), NOW, end=U("2026-11-23T06:00"))
        # Works now R1.3, R1.4 (2 of 4); 24 h ago (20 Nov 06:00) Works R1.2, R1.4 → net 0: +1 new (R1.3), 1 reopened (R1.2).
        self.assertEqual((d["works"], d["left"], d["days_left"], d["need_per_day"]), (2, 2, 2.0, 1.0))
        self.assertEqual((d["net_24h"], d["new_24h"], d["reopened_24h"], d["forecast_ist"]), (0, 1, 1, None))

    def test_forecast_from_a_positive_rate(self):
        log = LOG.replace(ROW("R1.2", "Partial", "z 21 Nov"), ROW("R1.1", "Works", "z 21 Nov"))
        d = fm.reverse_plan(fm.cap_history(log), NOW, end=U("2026-11-23T06:00"))
        # Works now R1.2, R1.3, R1.4, R1.1 → 4; 24 h ago R1.2, R1.4 → net +2; 0 left → forecast today.
        self.assertEqual((d["left"], d["net_24h"]), (0, 2))
        self.assertEqual(d["forecast_ist"], "21 Nov 2026")

    def test_shallow_edge_inside_24h_gives_no_rate(self):
        d = fm.reverse_plan(fm.cap_history(LOG, shallow={"ccc"}), NOW)
        self.assertIsNone(d["net_24h"]); self.assertIsNone(d["forecast_ist"])


def comment(body, login="a-person", typ="User"):
    return {"body": body, "user": {"login": login, "type": typ}}


class ReviewRounds(unittest.TestCase):
    def test_count_verdicts_first_line_only_no_bots(self):
        cs = [comment("Reviewer: Approve abc\n\nround 1"), comment("\n**Reviewer:** Changes requested"),
              comment("Lead B: `review: approved` added: Reviewer: Approve on this exact head"),   # not a verdict
              comment("Reviewer: Approve def", login="github-actions[bot]", typ="Bot"), comment("Question for the tech lead")]
        self.assertEqual(fm.verdicts(cs), 2)

    def test_summary_over_two_share(self):
        b = fm.rounds_summary({1: 1, 2: 3, 3: 2, 4: 5, 5: 0})
        self.assertEqual((b["n"], b["median"], b["mean"], b["over_2"], b["over_2_share"], b["none"]), (5, 2, 2.2, 2, 40.0, 1))


def mergify(state, checks=(), code="CHECKS_FAILED", pr=2618, left="2026-11-21T02:53:00.017046+00:00", links=""):
    payload = {"version": 1, "state": state, "left_at": left, "dequeue_reason": {"code": code, "checks": list(checks)}}
    body = f"<!---\nDO NOT EDIT\n-*- Mergify Payload -*-\n{json.dumps(payload)}\n-*- Mergify Payload End -*-\n-->\n\n### Left the queue\n{links}"
    return {"body": body, "user": {"login": "mergify[bot]", "type": "Bot"}, "issue_url": f"https://api.github.com/repos/o/r/issues/{pr}"}


class QueueBounces(unittest.TestCase):
    LINKS = ("- ❌ [`ci`](https://github.com/o/r/actions/runs/44/job/1)\n"
             "- ❌ [`shard (10)`](https://github.com/o/r/actions/runs/44/job/136697022039) ([job log](https://github.com/o/r/actions/runs/44/job/136697022039))\n"
             "- ❌ [`queue-fresh`](https://github.com/o/r/actions/runs/45/job/7)")

    def test_dequeue_read_from_mergify_payload_only(self):
        d = fm.dequeue(mergify("dequeued", ["ci", "shard (10)", "queue-fresh"], links=self.LINKS))
        self.assertEqual(d["pr"], 2618); self.assertEqual(d["reason"], "CHECKS_FAILED")
        self.assertEqual(d["checks"], [("shard (10)", "136697022039"), ("queue-fresh", "7")])
        self.assertIsNone(fm.dequeue(mergify("merged")))
        self.assertIsNone(fm.dequeue({**mergify("dequeued"), "user": {"login": "a-person"}}))   # a pasted payload is not Mergify's

    def test_causes_by_suite_then_job_then_reason(self):
        deqs = [fm.dequeue(mergify("dequeued", ["shard (10)"], pr=1, links=self.LINKS)),
                fm.dequeue(mergify("dequeued", ["shard (10)", "queue-fresh"], pr=2, links=self.LINKS)),
                fm.dequeue(mergify("dequeued", [], code="PR_UPDATED", pr=3)),
                fm.dequeue(mergify("dequeued", ["shard (10)"], pr=1, links=self.LINKS))]   # #1 bounced twice
        e = fm.bounce_causes(deqs, lambda jid: ["check_fo13s_conflict_browser.ts"] if jid == "136697022039" else [])
        self.assertEqual((e["n"], e["prs"]), (4, 3))
        self.assertEqual(e["groups"], [("check_fo13s_conflict_browser.ts", [1, 2]), ("pr updated", [3]), ("queue-fresh", [2])])

    def test_unreadable_log_falls_back_to_the_job(self):
        e = fm.bounce_causes([fm.dequeue(mergify("dequeued", ["shard (10)"], links=self.LINKS))], lambda jid: [])
        self.assertEqual(e["groups"], [("shard (10)", [2618])])


class Kind(unittest.TestCase):
    """The .md shortcut in kind() answers exactly as change-kind.sh (review on #2741: STAND-INS.md is read by a suite)."""
    def setUp(self):
        fm.NOTES_OK.clear(); fm._kind.cache_clear()

    def test_md_a_suite_reads_goes_to_the_script(self):
        calls = []
        real = fm.selects_code
        fm.selects_code = lambda files: calls.append(files) or any(f.endswith("STAND-INS.md") for f in files)
        script = fm.subprocess.run
        fm.subprocess.run = lambda *a, **k: type("R", (), {"stdout": "code\n", "returncode": 0})()
        try:
            stand, note = [f"{fm.P}/product/STAND-INS.md"], [f"{fm.P}/product/reports/x.md"]
            fm.prime_kinds([stand, note])
            self.assertEqual(len(calls), 1)                         # one select-suites call for the batch
            self.assertEqual(fm.kind(stand, cached=False), "code")  # the script decides: not cleared
            self.assertEqual(fm.kind(note, cached=False), "code")   # the batch was not cleared, so it asks the script too
            fm.NOTES_OK.clear(); fm.prime_kinds([note])
            fm.subprocess.run = lambda *a, **k: self.fail("cleared .md must not call the script")
            self.assertEqual(fm.kind(note, cached=False), "notes")
        finally:
            fm.selects_code, fm.subprocess.run = real, script


class LeadLines(unittest.TestCase):
    def test_five_lines_each_with_its_measure(self):
        h = fm.cap_history(LOG)
        m = {"start_to_proven": fm.start_to_proven(h, fm.first_prs(StartToProven.PRS)),
             "review_rounds": {**fm.rounds_summary({1: 1, 2: 3}), "sample": "2 code PRs"},
             "first_proof": fm.first_proof(h, U("2026-11-20T00:00")), "reverse_plan": fm.reverse_plan(h, NOW, end=U("2026-11-23T06:00")),
             "queue_bounces": fm.bounce_causes([], lambda j: [])}
        L = fm.lead_lines(m)
        self.assertEqual(len(L), 5)
        self.assertIn("start→Proven median 2.4 d over 2 rows", L[0])
        self.assertIn("1 of 2 over 2 (50.0%, P-277 limit)", L[1])
        self.assertIn("2 of 3 R1 rows Works on their first qa score (66.7%)", L[2])
        self.assertIn("2 of 4 rows left, 2.0 d", L[3]); self.assertIn("no forecast: net 0 or less", L[3])
        self.assertIn("queue bounces 0 dequeues", L[4])
        self.assertIn("0 with no verdict comment", L[1])

    def test_empty_window_prints_n_a_never_none(self):
        h = fm.cap_history(LOG)
        m = {"start_to_proven": fm.start_to_proven({}, {}), "review_rounds": {**fm.rounds_summary({}), "sample": "0 code PRs"},
             "first_proof": fm.first_proof({}), "reverse_plan": fm.reverse_plan(h, NOW, end=U("2026-11-20T00:00")),
             "queue_bounces": fm.bounce_causes([], lambda j: [])}
        self.assertFalse([l for l in fm.lead_lines(m) if "None" in l])


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    print(f"{'PASS' if r.wasSuccessful() else 'FAIL'} test_flow_measure.py: {r.testsRun} tests, {len(r.failures) + len(r.errors)} failed")
    sys.exit(0 if r.wasSuccessful() else 1)
