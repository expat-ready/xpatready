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
      "batch_branch_prefix": "mergify/merge-queue/", "escalate_after_min": 120, "queued_label": "queued",
      "parked_label": "parked", "parked_max_days": 7}
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
            "open_prs": [pr(1, labels=[LAB, "queued"], approved=30), pr(2, updated=15),
                         pr(3, head="mergify/merge-queue/abc", updated=5, ci=5)],
            "merged_prs": [{"number": 9, "merged_at": ago(20), "approved_at": ago(50)}],
            "batches": [{"number": 8, "created_at": ago(40), "closed_at": ago(20), "first_check_started_at": ago(35),
                         "last_check_at": ago(21)}],
            "nightly_runs": [{"id": 1, "created_at": hb.iso(datetime(2026, 11, 19, 20, 25, tzinfo=timezone.utc)),
                              "status": "completed", "conclusion": "success", "event": "schedule", "url": None}]}


def shifted(f, minutes):
    """The same facts minutes later: every time moves with the clock, so only what the test changes changes."""
    f = copy.deepcopy(f); mv = lambda x: hb.iso(hb.t(x) + timedelta(minutes=minutes)) if x else x
    f["now"], f["main_merges"] = mv(f["now"]), [mv(x) for x in f["main_merges"]]
    for coll in ("open_prs", "merged_prs", "batches", "nightly_runs"):
        for x in f[coll]:
            for k in [k for k in x if k.endswith("_at")]:
                x[k] = mv(x[k])
    return f


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
                  pr(4, updated=100, ci=30, ci_state="PENDING"),   # waiting on CI that moves
                  pr(4, updated=100, labels=[LAB, "queued"], approved=100),  # in the queue (queue-stuck's job)
                  pr(4, head="lead/2026-11-17-x", updated=100),    # the Lead's records branch
                  pr(4, head="dependabot/npm/x", updated=100),
                  pr(4, updated=60 * 30)):                         # dormant: idle over 24 h, reported only
            f = base(); f["main_merges"] = [ago(5)]; f["open_prs"].append(p)
            r = self.run_(f)
            self.assertNotIn("stalled-lane", ids(r), p)
        self.assertIn("dormant-lanes", [x["id"] for x in r["report"]])

    def test_red_or_never_posting_ci_is_a_stall_not_the_queue(self):
        f = base(); f["main_merges"] = [ago(5)]
        f["open_prs"].append(pr(4, labels=[LAB], approved=300, updated=100, ci=100, ci_state="FAILURE"))
        f["open_prs"].append(pr(5, updated=300, ci=200, ci_state="PENDING"))   # a status that never posts
        r = self.run_(f)
        self.assertEqual(ids(r), ["stalled-lane"])
        self.assertEqual(r["alarm_state"].keys(), {"stalled-lane #4", "stalled-lane #5"})
        self.assertEqual(r["counts"]["queued"], 1)

    # parked (founder, 19 Nov 07:1x-07:2x IST): a valid "Parked:" note keeps a PR out of stalled-lane; else parked-expired.
    def parked(self, note, n=4, updated=300):
        p = pr(n, updated=updated, ci=updated, labels=["parked"])
        p["parked_comments"] = [{"body": "Looks good", "created_at": ago(500)}] + (
            [{"body": note, "created_at": ago(60)}] if note else [])
        f = base(); f["open_prs"].append(p)
        return self.run_(f)

    def test_a_validly_parked_pr_is_no_stalled_lane_and_is_listed(self):
        r = self.parked("Parked: Wave 2 row (P-707)\nOwner: the tech lead\nResume: 2026-11-25")
        self.assertNotIn("stalled-lane", ids(r)); self.assertNotIn("parked-expired", ids(r))
        line = [x["why"] for x in r["report"] if x["id"] == "parked"]
        self.assertTrue(line and "#4 (resume 25 Nov, the tech lead)" in line[0], r["report"])

    def test_parked_expired_or_without_a_valid_note_is_flagged(self):
        for note, why in (("Parked: Wave 2\nOwner: the tech lead\nResume: 2026-11-19", "parked, expired"),
                          (None, "no \"Parked:\" comment"),
                          ("Parked: Wave 2\nResume: 2026-11-25", "lacks Owner:"),
                          ("Parked: Wave 2\nOwner: the tech lead\nResume: 2026-11-30", "over 7 days"),
                          ("Parked: Wave 2\nOwner: the tech lead\nResume: 2026-02-31", "not a date")):
            r = self.parked(note)
            a = [x for x in r["alarms"] if x["id"] == "parked-expired"]
            self.assertTrue(a and "#4" in a[0]["why"] and why in a[0]["why"], (note, r["alarms"]))
            self.assertEqual(a[0]["keys"], ["parked-expired #4"])
            self.assertNotIn("stalled-lane", ids(r), note)   # one alarm per parked PR, not two

    def test_a_bold_or_crlf_note_counts_and_an_excluded_branch_is_never_flagged(self):
        r = self.parked("**Parked:** Wave 2\r\n**Owner:** the tech lead\r\n**Resume:** 2026-11-25")
        self.assertNotIn("parked-expired", ids(r)); self.assertIn("parked", [x["id"] for x in r["report"]])
        p = pr(5, head="lead/2026-11-19-x", updated=300, labels=["parked"]); p["parked_comments"] = []
        f = base(); f["open_prs"].append(p)
        self.assertNotIn("parked-expired", ids(self.run_(f)))

    def test_the_seven_days_count_from_the_notes_ist_date(self):
        # 18 Nov 19:00 UTC is 19 Nov 00:30 IST: resume 26 Nov is 7 days on (valid), though 8 by the UTC date.
        n = hb.parked_note([{"body": "Parked: x\nOwner: the tech lead\nResume: 2026-11-26",
                             "created_at": "2026-11-18T19:00:00Z"}], NOW, 7)
        self.assertTrue(n["ok"], n)

    def test_the_parked_label_alone_without_the_note_never_hides_a_pr(self):
        r = self.parked(None, updated=20)   # even an active PR: the label needs its note
        self.assertIn("parked-expired", ids(r))

    def test_approved_but_unmergeable_prs_never_fire_queue_alarms(self):
        f = base(); f["main_merges"] = [ago(300)]; f["open_prs"] = f["open_prs"][1:2]   # nothing queued, quiet night
        f["open_prs"] += [pr(6, draft=True, labels=[LAB, "queued"], approved=200, updated=20),
                          pr(7, labels=[LAB], approved=200, updated=20, ci=20, ci_state="PENDING")]   # not queued
        f["open_total"] = 80   # and a partial read is reported
        r = self.run_(f)
        self.assertEqual((ids(r), "partial-open" in [x["id"] for x in r["report"]]), ([], True))

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
        f["main_merges"] = [f["now"]]
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

    # red only on a change -----------------------------------------------------------------------------------------
    def chain(self, *steps):
        """Runs one after another, each fed the previous result (the artifact): [(minutes from NOW, facts)] → results."""
        out, prev = [], None
        for m, f in steps:
            f = shifted(f, m); f["previous"] = prev
            prev = hb.evaluate(f, HB); out.append(prev)
        return out

    def stalled(self):
        f = base(); f["open_prs"].append(pr(4, updated=100, ci=95)); return f

    def test_new_alarm_red_then_still_open_green_then_escalated_once(self):
        r = self.chain((0, self.stalled()), (30, self.stalled()), (60, self.stalled()), (130, self.stalled()),
                       (160, self.stalled()))
        self.assertEqual([x["red"] for x in r], [True, False, False, True, False])
        self.assertEqual(r[0]["red_reasons"], ["new: stalled-lane #4"])
        self.assertEqual(r[1]["still_open"], ["stalled-lane #4"])
        self.assertTrue(all(x["running"] == "no" for x in r))      # the board still shows the open alarm
        self.assertIn("open over 120 min", r[3]["red_reasons"][0])

    def test_a_second_stall_is_new_and_a_cleared_one_comes_back_new(self):
        two = self.stalled(); two["open_prs"].append(pr(5, updated=100, ci=95))
        r = self.chain((0, self.stalled()), (30, two), (60, base()), (90, self.stalled()))
        self.assertEqual([x["red"] for x in r], [True, True, False, True])
        self.assertEqual(r[1]["red_reasons"], ["new: stalled-lane #5"])
        self.assertEqual(r[2]["alarm_state"], {})

    def test_conformance_and_no_previous_state_are_always_red(self):
        bad = {"enforced": "no", "items": [{"id": "settings.deny", "status": "fail"}]}
        f = shifted(base(), 30); f["previous"] = hb.evaluate(base(), HB, bad)
        r = hb.evaluate(f, HB, bad)
        self.assertTrue(r["red"]); self.assertEqual(r["red_reasons"], ["conformance (always red)"])
        r = hb.evaluate(self.stalled(), HB)   # no previous result: every alarm is new
        self.assertTrue(r["red"]); self.assertFalse(r["previous_read"])

    def test_window_carries_over(self):
        r = self.chain((0, self.stalled()), (30, base()), (90, base()), (120, self.stalled()), (150, base()))
        self.assertEqual([x["green_streak_h"] for x in r], [0.0, 0.0, 1.0, 0.0, 0.0])
        self.assertEqual(r[2]["hours_since_last_alarm"], 1.5)
        self.assertEqual(r[4]["longest_green_today_h"], 1.0)
        self.assertIsNone(hb.evaluate(base(), HB)["hours_since_last_alarm"])   # none seen yet

    def test_missed_beats_restart_the_streak(self):
        r = self.chain((0, base()), (30, base()), (60, base()), (240, base()))
        self.assertEqual([x["green_streak_h"] for x in r], [0.0, 0.5, 1.0, 0.0])
        self.assertTrue(r[3]["missed_beats"]); self.assertEqual(r[3]["gap_since_previous_min"], 180)
        self.assertFalse(r[2]["missed_beats"])

    def test_longest_today_restarts_at_ist_midnight(self):
        f = shifted(base(), 690)                                        # 23:30 IST
        first = hb.evaluate(f, HB)
        g = shifted(f, 60)                                              # 00:30 IST, the next day
        g["previous"] = dict(first, clear_since=hb.iso(datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)),
                             longest_green_today_h=11.5)
        r = hb.evaluate(g, HB)
        self.assertEqual(r["green_streak_h"], 7.0)
        self.assertEqual(r["longest_green_today_h"], 0.5)   # the new IST day counts from 00:00

    # follow-ups of #2081: a read error keeps the window; read_previous; the P95 sample paged ---------------------
    def test_a_read_error_keeps_the_alarm_state_and_todays_best(self):
        r = self.chain((0, base()), (60, base()), (90, self.stalled()))      # an hour green, then a stall (mailed)
        prev = dict(r[-1], longest_green_today_h=3.0)
        err = hb.carry_on_error(prev, NOW + timedelta(minutes=120))
        self.assertEqual((err["red"], err["longest_green_today_h"]), (True, 3.0))
        self.assertIn("stalled-lane #4", err["alarm_state"])
        f = shifted(self.stalled(), 150); f["previous"] = dict(err, checked_at=hb.iso(NOW + timedelta(minutes=120)))
        nxt = hb.evaluate(f, HB)
        self.assertFalse(nxt["red"])                                  # the stall is not new again after the error
        self.assertEqual(nxt["still_open"], ["stalled-lane #4"])
        self.assertEqual(nxt["hours_since_last_alarm"], 0.0)          # it is still open
        self.assertEqual(hb.carry_on_error(None, NOW)["alarm_state"].keys(), {"read-error"})

    def fake(self, answers):
        """Stand-ins for api() and curl(): answers maps a URL fragment to a value (or a function of the request)."""
        seen, real = [], (hb.api, hb.curl)
        def api(method, url, body=None):
            seen.append((method, url, body))
            for frag, v in answers.items():
                if frag in url or (body and frag in body["query"]):
                    return v(body) if callable(v) else v
            raise LookupError(url)
        def curl(args, what):
            seen.append(("curl", args[-1], None)); answers["download"](args[args.index("-o") + 1])
        hb.api, hb.curl = api, curl
        self.addCleanup(lambda: setattr(hb, "api", real[0]) or setattr(hb, "curl", real[1]))
        return seen

    def test_read_previous_takes_the_newest_artifact_not_this_runs(self):
        import zipfile
        def download(path):
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("heartbeat.json", json.dumps({"alarm_state": {"x": {}}}))
        arts = {"artifacts": [{"workflow_run": {"id": 9}, "expired": False, "archive_download_url": "u/own"},
                              {"workflow_run": {"id": 8}, "expired": True, "archive_download_url": "u/old"},
                              {"workflow_run": {"id": 7}, "expired": False, "archive_download_url": "u/prev"}]}
        seen = self.fake({"actions/artifacts?name=pipeline-heartbeat": arts, "download": download})
        self.assertEqual(hb.read_previous("o/r", 9), {"alarm_state": {"x": {}}})
        self.assertEqual(seen[-1][:2], ("curl", "u/prev"))
        self.fake({"actions/artifacts": {"artifacts": []}, "download": download})
        self.assertIsNone(hb.read_previous("o/r", 9))              # first run: nothing yet
        self.fake({"actions/artifacts": arts, "download": lambda path: open(path, "w").close()})
        self.assertIsNone(hb.read_previous("o/r", 9))              # a broken zip is no state, never a crash

    def test_the_p95_sample_pages_back_past_24_hours(self):
        def page(n, age, more):
            return {"data": {"repository": {"recent": {"pageInfo": {"hasNextPage": more, "endCursor": f"c{n}"},
                "nodes": [{"number": n, "headRefName": "claude/x", "createdAt": ago(age + 60), "closedAt": ago(age),
                           "mergedAt": ago(age), "updatedAt": ago(age), "timelineItems": {"nodes": []},
                           "commits": {"nodes": []}}]}}}}
        pages = iter([page(1, 60, True), page(2, 600, True), page(3, 1500, True), page(4, 1600, True)])
        main = {"data": {"repository": {"defaultBranchRef": {"target": {"history": {"nodes": []}}},
                                        "open": {"totalCount": 0, "nodes": []}}}}
        seen = self.fake({"actions/artifacts": {"artifacts": []}, "download": None, "nightly.yml": {"workflow_runs": []},
                          "$after": lambda body: next(pages), "defaultBranchRef": main})
        os.environ["GITHUB_REPOSITORY"] = "o/r"; self.addCleanup(os.environ.pop, "GITHUB_REPOSITORY")
        f = hb.collect(HB, NOW, None, ctx := {})
        self.assertEqual([p["number"] for p in f["merged_prs"]], [1, 2, 3])   # page 3 reaches past 24 h: stop
        self.assertTrue(f["recent_complete"])
        self.assertEqual([b["variables"].get("after") for m, u, b in seen if b and "$after" in b["query"]],
                         [None, "c1", "c2"])
        self.assertEqual(ctx["previous"], None)
        pages = iter([page(1, 60, True), page(2, 600, True)])
        clock = iter([0, 0, 200, 200])                                     # the second page comes back slowly
        real_mono = hb.time.monotonic; hb.time.monotonic = lambda: next(clock)
        self.addCleanup(setattr, hb.time, "monotonic", real_mono)
        f = hb.collect(HB, NOW)
        self.assertEqual(([p["number"] for p in f["merged_prs"]], f["recent_complete"]), ([1, 2], False))
        self.assertIn("partial-sample", [x["id"] for x in hb.evaluate(f, HB)["report"]])

    def test_collect_reads_a_parked_prs_notes_over_two_pages_from_trusted_authors_only(self):
        node = {"number": 4, "isDraft": False, "headRefName": "claude/x", "createdAt": ago(900), "updatedAt": ago(300),
                "labels": {"nodes": [{"name": "parked"}]}, "timelineItems": {"nodes": []}, "commits": {"nodes": []}}
        main = {"data": {"repository": {"defaultBranchRef": {"target": {"history": {"nodes": []}}},
                                        "open": {"totalCount": 1, "nodes": [node]}}}}
        last = {"data": {"repository": {"recent": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": []}}}}
        note = lambda who, d: {"body": f"Parked: Wave 2\nOwner: the tech lead\nResume: {d}", "created_at": ago(60),
                               "author_association": who}
        page1 = [{"body": "ok", "created_at": ago(800), "author_association": "MEMBER"}] * 100
        seen = self.fake({"actions/artifacts": {"artifacts": []}, "download": None, "nightly.yml": {"workflow_runs": []},
                          "$after": last, "defaultBranchRef": main,
                          "issues/4/comments?per_page=100&page=1": page1,
                          "issues/4/comments?per_page=100&page=2": [note("COLLABORATOR", "2026-11-25"),
                                                                    note("NONE", "2026-11-19")]})
        os.environ["GITHUB_REPOSITORY"] = "o/r"; self.addCleanup(os.environ.pop, "GITHUB_REPOSITORY")
        f = hb.collect(HB, NOW)
        cs = f["open_prs"][0]["parked_comments"]
        self.assertEqual(len(cs), 101)                       # both pages read; the outsider's newer note dropped
        self.assertEqual(sum(1 for m, u, b in seen if "/comments" in u), 2)
        r = hb.evaluate(f, HB)
        self.assertNotIn("parked-expired", ids(r)); self.assertIn("parked", [x["id"] for x in r["report"]])

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
        f = hb.facts_from(g, runs, HB, NOW, {"alarm_state": {}})
        self.assertEqual(f["main_merges"], [ago(20)])                       # merge commits only
        self.assertEqual(f["open_prs"][0]["approved_at"], ago(40))          # the latest approval label
        self.assertEqual(f["open_prs"][0]["last_ci_at"], ago(45))
        self.assertEqual(f["merged_prs"], [{"number": 7, "merged_at": ago(20), "approved_at": ago(80)}])  # before merge
        b = {x["number"]: x for x in f["batches"]}
        self.assertEqual(b[8]["first_check_started_at"], ago(50))   # ci's first job, not label-guard's
        self.assertEqual(b[8]["last_check_at"], ago(26))
        self.assertIn(3, b)                                                  # an open batch PR is progress
        self.assertEqual((f["nightly_runs"][0]["url"], f["previous"]), ("u", {"alarm_state": {}}))
        self.assertEqual(self.run_(f)["counts"]["open_prs"], 2)

    # the command ----------------------------------------------------------------------------------------------------
    def test_command_exit_codes_and_files(self):
        d = tempfile.mkdtemp(prefix="hb-")
        man = os.path.join(d, "m.json")
        with open(man, "w") as fh:
            json.dump({"heartbeat": HB}, fh)
        facts = os.path.join(d, "f.json")
        f = shifted(base(), (datetime.now(timezone.utc) - NOW).total_seconds() / 60)   # the command uses the clock
        f["nightly_runs"][0]["created_at"] = f["now"]   # whatever the hour, tonight's nightly exists
        with open(facts, "w") as fh:
            json.dump(f, fh)
        cmd = [sys.executable, "-I", os.path.join(HERE, "pipeline-heartbeat.py"), "--manifest", man, "--facts", facts,
               "--json", os.path.join(d, "out.json")]
        p = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        with open(os.path.join(d, "out.json")) as fh:
            self.assertEqual(json.load(fh)["running"], "yes")
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
        with open(path) as fh:
            real = json.load(fh)["heartbeat"]
        self.assertEqual(set(HB), set(real) - {"note", "red_rule"})   # the tool reads exactly these keys
        self.assertEqual(ids(hb.evaluate(base(), real)), [])


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    n = r.testsRun; f = len(r.failures) + len(r.errors)
    print(f"{n - f} passed, {f} failed")
    sys.exit(1 if f else 0)
