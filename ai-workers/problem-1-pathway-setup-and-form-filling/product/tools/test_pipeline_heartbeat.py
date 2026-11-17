#!/usr/bin/env python3
"""Tests for tools/pipeline-heartbeat.py (CK-2): each alarm fires and does not fire on hand-made facts, the report-only
P95 waits, the green-streak counts, the GraphQL answer read into facts, and the command's exit code. Standard library
only; no network, US$0. The thresholds are the manifest's when present, else the same values written here.
Run: python3 -I product/tools/test_pipeline_heartbeat.py   (check-pipeline-heartbeat.sh runs it in check-guards.sh)"""
import copy, importlib.util, json, os, subprocess, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pipeline_heartbeat", os.path.join(HERE, "pipeline-heartbeat.py"))
hb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hb)

HB = {"workflow": "pipeline-heartbeat.yml", "every_min": 30, "timeout_min": 5, "no_merge_min": 90,
      "queue_no_progress_min": 60, "queue_wait_p95_min": 60, "batch_wait_p95_min": 15, "stalled_lane_min": 90,
      "stalled_lane_max_age_h": 24, "lane_branch_excluded_prefixes": ["mergify/", "dependabot/", "lead/"],
      "nightly_workflow": "nightly.yml", "nightly_by_ist": "04:00", "approved_label": "review: approved",
      "batch_branch_prefix": "mergify/merge-queue/"}
NOW = datetime(2026, 11, 20, 6, 30, tzinfo=timezone.utc)  # 12:00 IST
LAB = "review: approved"


def ago(m):
    return hb.iso(NOW - timedelta(minutes=m))


def pr(n, head="claude/x", draft=False, labels=(), updated=10, ci=None, ci_state="SUCCESS", approved=None):
    return {"number": n, "draft": draft, "head": head, "labels": list(labels), "updated_at": ago(updated),
            "approved_at": ago(approved) if approved is not None else None, "ci_state": ci_state,
            "last_ci_at": ago(ci) if ci is not None else None}


def base():
    """A healthy pipeline: a merge 20 min ago, a batch checking, one queued PR approved 30 min ago, one active lane,
    tonight's nightly, earlier heartbeats green."""
    return {"now": hb.iso(NOW), "main_merges": [ago(20), ago(70)],
            "open_prs": [pr(1, labels=[LAB], approved=30), pr(2, updated=15),
                         pr(3, head="mergify/merge-queue/abc", updated=5, ci=5)],
            "merged_prs": [{"number": 9, "merged_at": ago(20), "approved_at": ago(50)}],
            "batches": [{"number": 8, "created_at": ago(40), "closed_at": ago(20), "first_check_started_at": ago(35),
                         "last_check_at": ago(21)}],
            "heartbeat_runs": [{"id": i, "created_at": ago(30 * i), "status": "completed", "conclusion": "success",
                                "event": "schedule", "url": None} for i in range(1, 9)],
            "nightly_runs": [{"id": 1, "created_at": hb.iso(datetime(2026, 11, 19, 20, 25, tzinfo=timezone.utc)),
                              "status": "completed", "conclusion": "success", "event": "schedule", "url": None}]}


def ids(res):
    return [a["id"] for a in res["alarms"]]


class Heartbeat(unittest.TestCase):
    def run_(self, f, conformance=None, hbc=HB):
        return hb.evaluate(f, hbc, conformance)

    def test_healthy_pipeline_is_green(self):
        r = self.run_(base())
        self.assertEqual(ids(r), [])
        self.assertEqual(r["running"], "yes")
        self.assertEqual(r["counts"]["queued"], 1)

    # no-merge -------------------------------------------------------------------------------------------------------
    def test_no_merge_fires_when_an_approved_pr_waited_over_90(self):
        f = base(); f["main_merges"] = [ago(120)]; f["open_prs"][0]["approved_at"] = ago(100)
        self.assertIn("no-merge", ids(self.run_(f)))

    def test_no_merge_quiet_when_approval_is_fresh_or_nothing_is_approved(self):
        f = base(); f["main_merges"] = [ago(300)]; f["open_prs"][0]["approved_at"] = ago(30)
        f["batches"][0].update(created_at=ago(25), closed_at=None, last_check_at=ago(5))
        self.assertNotIn("no-merge", ids(self.run_(f)))   # approved 30 min ago after a quiet night
        f = base(); f["main_merges"] = [ago(300)]; f["open_prs"][0]["labels"] = []
        self.assertNotIn("no-merge", ids(self.run_(f)))   # nothing approved: no merge expected

    # queue-stuck ----------------------------------------------------------------------------------------------------
    def test_queue_stuck_fires_without_batch_progress_for_60(self):
        f = base(); f["main_merges"] = [ago(80)]; f["open_prs"][0]["approved_at"] = ago(75)
        f["open_prs"] = f["open_prs"][:2]   # no open batch PR
        f["batches"][0].update(created_at=ago(200), closed_at=ago(70), last_check_at=ago(70))
        self.assertIn("queue-stuck", ids(self.run_(f)))
        self.assertNotIn("no-merge", ids(self.run_(f)))   # 80 min: under 90

    def test_queue_stuck_quiet_while_a_batch_checks_or_for_drafts(self):
        f = base(); f["main_merges"] = [ago(80)]; f["open_prs"][0]["approved_at"] = ago(75)
        self.assertNotIn("queue-stuck", ids(self.run_(f)))   # the open batch PR #3 checked 5 min ago
        f["open_prs"] = f["open_prs"][:2]; f["batches"][0].update(closed_at=ago(70), last_check_at=ago(70))
        f["open_prs"][0]["draft"] = True
        self.assertNotIn("queue-stuck", ids(self.run_(f)))   # a draft is not queued

    # stalled-lane ---------------------------------------------------------------------------------------------------
    def test_stalled_lane_fires_after_90_idle(self):
        f = base(); f["open_prs"].append(pr(4, updated=100, ci=95))
        r = self.run_(f)
        self.assertIn("stalled-lane", ids(r))
        self.assertIn("#4", [a for a in r["alarms"] if a["id"] == "stalled-lane"][0]["why"])

    def test_stalled_lane_quiet_cases(self):
        for p in (pr(4, updated=100, ci=30),                       # CI activity 30 min ago
                  pr(4, updated=100, ci_state="PENDING"),          # waiting on CI
                  pr(4, updated=100, labels=[LAB], approved=100),  # in the queue (queue-stuck's job)
                  pr(4, head="lead/2026-11-17-x", updated=100),    # the Lead's records branch
                  pr(4, head="dependabot/npm/x", updated=100),
                  pr(4, updated=60 * 30)):                         # dormant: idle over 24 h, reported only
            f = base(); f["main_merges"] = [ago(5)]; f["open_prs"].append(p)
            r = self.run_(f)
            self.assertNotIn("stalled-lane", ids(r), p)
        self.assertIn("dormant-lanes", [x["id"] for x in r["report"]])

    # nightly --------------------------------------------------------------------------------------------------------
    def test_nightly_missing_after_four_ist(self):
        f = base(); f["nightly_runs"][0]["created_at"] = hb.iso(datetime(2026, 11, 18, 20, 25, tzinfo=timezone.utc))
        self.assertIn("nightly", ids(self.run_(f)))   # yesterday's run only
        f["nightly_runs"] = []
        self.assertIn("nightly", ids(self.run_(f)))
        f["nightly_runs"] = [dict(base()["nightly_runs"][0], event="workflow_dispatch")]
        self.assertIn("nightly", ids(self.run_(f)))   # a dispatched run is not the scheduled nightly

    def test_nightly_not_due_before_four_ist(self):
        f = base(); f["nightly_runs"] = []
        f["now"] = hb.iso(datetime(2026, 11, 19, 22, 0, tzinfo=timezone.utc))   # 03:30 IST
        for k in ("main_merges",):
            f[k] = [f["now"]]
        self.assertNotIn("nightly", ids(self.run_(f)))
        f["now"] = hb.iso(datetime(2026, 11, 19, 22, 31, tzinfo=timezone.utc))  # 04:01 IST
        self.assertIn("nightly", ids(self.run_(f)))

    # conformance ----------------------------------------------------------------------------------------------------
    def test_conformance_failure_is_an_alarm(self):
        ok = {"enforced": "yes", "items": [{"id": "settings.deny", "status": "pass"}]}
        bad = {"enforced": "no", "items": [{"id": "settings.deny", "status": "fail"}]}
        self.assertNotIn("conformance", ids(self.run_(base(), ok)))
        r = self.run_(base(), bad)
        self.assertIn("conformance", ids(r))
        self.assertIn("settings.deny", r["alarms"][0]["why"])

    # report only ----------------------------------------------------------------------------------------------------
    def test_p95_waits_are_reported_never_red(self):
        f = base()
        f["merged_prs"] = [{"number": i, "merged_at": ago(10), "approved_at": ago(10 + w)} for i, w in
                           enumerate([5, 10, 20, 30, 40, 50, 55, 58, 59, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 200])]
        f["batches"] = [{"number": 8, "created_at": ago(60), "closed_at": None, "first_check_started_at": ago(40),
                         "last_check_at": ago(5)}]
        r = self.run_(f)
        self.assertEqual(ids(r), [])
        q = {x["id"]: x for x in r["report"]}
        self.assertEqual(q["queue_wait_p95_min"]["value"], 70.0)   # nearest rank: 19th of 20 sorted
        self.assertTrue(q["queue_wait_p95_min"]["over"])
        self.assertEqual(q["batch_wait_p95_min"]["value"], 20.0)
        self.assertTrue(q["batch_wait_p95_min"]["over"])
        self.assertEqual(hb.p95([]), None)
        self.assertEqual(hb.p95([3]), 3)

    # the window -----------------------------------------------------------------------------------------------------
    def test_green_streak_and_hours_since_alarm(self):
        f = base()
        f["heartbeat_runs"][3]["conclusion"] = "failure"          # 120 min ago
        f["heartbeat_runs"][1]["conclusion"] = "cancelled"        # replaced by a newer run: left out
        r = self.run_(f)
        self.assertEqual(r["hours_since_last_alarm"], 2.0)
        self.assertEqual(r["green_streak_h"], 1.5)                 # first green after the red: 90 min ago
        self.assertEqual(r["longest_green_today_h"], 1.5)          # 240 → 150 min ago and 90 min ago → now: both 1.5 h
        r = self.run_(f, {"enforced": "no", "items": [{"id": "x", "status": "fail"}]})
        self.assertEqual((r["green_streak_h"], r["hours_since_last_alarm"]), (0.0, 0.0))

    def test_no_red_seen(self):
        r = self.run_(base())
        self.assertIsNone(r["hours_since_last_alarm"])
        self.assertEqual(r["green_streak_h"], 4.0)                 # the oldest run seen: 240 min ago
        self.assertEqual(r["longest_green_today_h"], 4.0)          # all since 08:00 IST today

    def test_own_run_is_not_counted_twice(self):
        f = base(); f["heartbeat_runs"].insert(0, {"id": 77, "created_at": ago(1), "status": "in_progress",
                                                   "conclusion": None, "event": "schedule", "url": None})
        r = hb.evaluate(f, HB, None, own_run_id=77)
        self.assertEqual(r["runs_seen"], 8)

    # reading GitHub's answer ----------------------------------------------------------------------------------------
    def test_facts_from_graphql(self):
        lab = lambda m, n=LAB: {"createdAt": ago(m), "label": {"name": n}}
        g = {"data": {"repository": {
            "defaultBranchRef": {"target": {"history": {"nodes": [
                {"committedDate": ago(5), "parents": {"totalCount": 1}},
                {"committedDate": ago(20), "parents": {"totalCount": 2}}]}}},
            "open": {"nodes": [
                {"number": 1, "isDraft": False, "headRefName": "claude/a", "createdAt": ago(300), "updatedAt": ago(30),
                 "labels": {"nodes": [{"name": LAB}]}, "timelineItems": {"nodes": [lab(90), lab(40), lab(35, "x")]},
                 "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": "SUCCESS"},
                                                   "checkSuites": {"nodes": [{"updatedAt": ago(50)}, {"updatedAt": ago(45)}]}}}]}},
                {"number": 3, "isDraft": True, "headRefName": "mergify/merge-queue/z", "createdAt": ago(10),
                 "updatedAt": ago(9), "labels": {"nodes": []}, "timelineItems": {"nodes": []},
                 "commits": {"nodes": [{"commit": {"statusCheckRollup": None, "checkSuites": {"nodes": []}}}]}}]},
            "recent": {"nodes": [
                {"number": 7, "headRefName": "claude/b", "createdAt": ago(500), "closedAt": ago(20), "mergedAt": ago(20),
                 "timelineItems": {"nodes": [lab(80), lab(10)]}, "commits": {"nodes": []}},
                {"number": 8, "headRefName": "mergify/merge-queue/y", "createdAt": ago(60), "closedAt": ago(25),
                 "mergedAt": None, "timelineItems": {"nodes": []},
                 "commits": {"nodes": [{"commit": {"checkSuites": {"nodes": [
                     {"updatedAt": ago(26), "workflowRun": {"workflow": {"name": "ci"}},
                      "checkRuns": {"nodes": [{"startedAt": ago(50)}]}},
                     {"updatedAt": ago(30), "workflowRun": {"workflow": {"name": "label-guard"}},
                      "checkRuns": {"nodes": [{"startedAt": ago(59)}]}}]}}}]}},
                {"number": 6, "headRefName": "claude/c", "createdAt": ago(500), "closedAt": ago(30), "mergedAt": None,
                 "timelineItems": {"nodes": []}, "commits": {"nodes": []}}]}}}}
        runs = [{"id": 5, "created_at": ago(30), "status": "completed", "conclusion": "success", "event": "schedule",
                 "html_url": "u"}]
        f = hb.facts_from(g, runs, [], HB, NOW)
        self.assertEqual(f["main_merges"], [ago(20)])                       # merge commits only
        self.assertEqual(f["open_prs"][0]["approved_at"], ago(40))          # the latest approval label
        self.assertEqual(f["open_prs"][0]["last_ci_at"], ago(45))
        self.assertEqual(f["merged_prs"], [{"number": 7, "merged_at": ago(20), "approved_at": ago(80)}])  # before merge
        b = {x["number"]: x for x in f["batches"]}
        self.assertEqual(b[8]["first_check_started_at"], ago(50))   # ci's first job, not label-guard's
        self.assertEqual(b[8]["last_check_at"], ago(26))
        self.assertIn(3, b)                                                  # an open batch PR is progress
        self.assertEqual(f["heartbeat_runs"][0]["url"], "u")
        self.assertEqual(self.run_(f)["counts"]["open_prs"], 2)

    # the command ----------------------------------------------------------------------------------------------------
    def test_command_exit_codes_and_files(self):
        d = tempfile.mkdtemp(prefix="hb-")
        man = os.path.join(d, "m.json"); json.dump({"heartbeat": HB}, open(man, "w"))
        facts = os.path.join(d, "f.json")
        f = base(); f["now"] = hb.iso(datetime.now(timezone.utc))   # the command uses the clock; facts are relative
        shift = datetime.now(timezone.utc) - NOW
        def mv(s):
            return hb.iso(hb.t(s) + shift) if s else s
        for k in ("main_merges",):
            f[k] = [mv(x) for x in f[k]]
        for coll in ("open_prs", "merged_prs", "batches", "heartbeat_runs", "nightly_runs"):
            for x in f[coll]:
                for k, v in list(x.items()):
                    if k.endswith("_at"):
                        x[k] = mv(v)
        f["nightly_runs"][0]["created_at"] = f["now"]   # whatever the hour, tonight's nightly exists
        json.dump(f, open(facts, "w"))
        cmd = [sys.executable, "-I", os.path.join(HERE, "pipeline-heartbeat.py"), "--manifest", man, "--facts", facts,
               "--json", os.path.join(d, "out.json")]
        p = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(json.load(open(os.path.join(d, "out.json")))["running"], "yes")
        conf = os.path.join(d, "missing.json")
        p = subprocess.run(cmd + ["--conformance", conf], capture_output=True, text=True)
        self.assertEqual(p.returncode, 1, p.stdout)   # an unreadable conformance result is an alarm, never green
        self.assertIn("ALARM conformance", p.stdout)
        os.remove(facts)
        p = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)              # cannot read: red
        self.assertIn("read-error", p.stdout)

    def test_real_manifest_thresholds(self):
        path = os.path.join(HERE, "..", "design", "engineering-approved-setup.json")
        if not os.path.exists(path):
            self.skipTest("no manifest in this copy (check-guards' throwaway copy holds tools/ only)")
        real = json.load(open(path))["heartbeat"]
        self.assertEqual(set(HB) - {"note"}, set(real) - {"note"})   # the tool reads exactly these keys
        self.assertEqual(ids(hb.evaluate(base(), real)), [])


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    n = r.testsRun; f = len(r.failures) + len(r.errors)
    print(f"{n - f} passed, {f} failed")
    sys.exit(1 if f else 0)
