#!/usr/bin/env python3
"""Unit tests for tools/cockpit-data.py (P-596, spec §6.3). Standard library unittest; jsonschema for the contract.
Every expected number below is worked by hand from the fixture snapshot tools/fixtures/cockpit/snapshot/ (taken
2026-11-20 12:00 IST = 06:30 UTC); the working is written next to each assertion.
Run: python3 -m unittest product/tools/test_cockpit_data.py   (or: python3 product/tools/test_cockpit_data.py)"""
import importlib.util, json, os, re, shutil, subprocess, sys, tempfile, unittest
from unittest import mock
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cockpit_data", os.path.join(HERE, "cockpit-data.py"))
cd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cd)
FIX = os.path.join(HERE, "fixtures", "cockpit", "snapshot")
NOW = datetime(2026, 11, 20, 6, 30, tzinfo=timezone.utc)          # = meta.taken_at, 12:00 IST
CKP = "files/" + cd.REL + "/MVP-CHECKLIST.md"


def jread(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def snap_with(changes=None, drop=()):
    """A temporary copy of the fixture snapshot with some files replaced (text or JSON object) or removed."""
    d = tempfile.mkdtemp(prefix="cockpit-fix-")
    shutil.copytree(FIX, d, dirs_exist_ok=True)
    for rel, v in (changes or {}).items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(v if isinstance(v, str) else json.dumps(v))
    for rel in drop:
        os.remove(os.path.join(d, rel))
    return d


def fixture_history():
    s = cd.Snap(FIX)
    return cd.read_history(s.file("cockpit/history.jsonl"))


def run(snapdir=FIX, now=NOW, history=None, rec=None, note="not checked: test"):
    s = cd.Snap(snapdir)
    comp = cd.compute_board(s, now, fixture_history() if history is None else history, rec, note)
    return s, comp


class Parsers(unittest.TestCase):
    def test_cell_ids_ranges_and_boundaries(self):
        self.assertEqual(cd.cell_ids("C7.1 Works; BK-10, BK-16, BK-22 to BK-24"), ["BK-10", "BK-16", "BK-22", "BK-23", "BK-24"])
        self.assertEqual(cd.cell_ids("PF-4 (In PR #1744), PF-4b, PF-4s"), ["PF-4", "PF-4b", "PF-4s"])
        self.assertEqual(cd.cell_ids("PF-L (libraries); **none yet**"), ["PF-L"])
        self.assertEqual(cd.cell_ids("C8.2 Partial; BK-17, B5-filings"), ["BK-17", "B5-filings"])   # B5-filings is a BACKLOG row
        self.assertEqual(cd.cell_ids("FO-6v (held, P-561); QA-449"), ["FO-6v"])                   # decision and bug ids are not rows

    def test_r1_title_token_match(self):
        self.assertTrue(cd.title_has("runtime: PF-3 — platform tables", "PF-3"))
        self.assertTrue(cd.title_has("screens: C7.6 — BK-18 (QA-448)", "BK-18"))   # anywhere in the title (R1)
        self.assertFalse(cd.title_has("runtime: PF-4t — x", "PF-4"))
        self.assertFalse(cd.title_has("runtime: PF-4b — x", "PF-4"))
        self.assertFalse(cd.title_has("forms: BK-18 — x", "BK-1"))
        self.assertFalse(cd.title_has("runtime: XPF-4 — x", "PF-4"))
        self.assertTrue(cd.title_has("runtime: PF-4. done", "PF-4"))
        self.assertTrue(cd.is_records({"title": "lead: STATE trim (records only)", "labels": []}))
        self.assertTrue(cd.is_records({"title": "qa: retests", "labels": [{"name": "records"}]}))
        self.assertFalse(cd.is_records({"title": "lead: tool", "labels": []}))

    def test_r1_records_pr_never_counts(self):
        pulls = jread(os.path.join(FIX, "github/pulls.json"))
        pulls[0]["title"] = "runtime: PF-1 — first platform part (records only)"
        _, c = run(snap_with({"github/pulls.json": pulls}))
        self.assertNotIn(1, {r["map"] for r in c["rows"] if r["built"]})     # PF-1 has no other PR: row 1 is not built
        self.assertEqual(c["pace"]["merged_changes"]["value"], 7)

    def test_brief_id_never_matches_a_longer_id(self):
        self.assertEqual(cd.brief_id("FO-1a.md"), "FO-1a")
        self.assertEqual(cd.brief_id("FO-2-sales.md"), "FO-2")
        self.assertEqual(cd.brief_id("FO-55.md"), "FO-55")       # the glob FO-5*.md would have counted it for FO-5
        self.assertIsNone(cd.brief_id("README.md"))

    def test_git_blob_sha_equals_git(self):
        self.assertEqual(cd.git_blob_sha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a")

    def test_needs_you_drops_decided_asks(self):
        asks, _, _ = cd.state_needs(cd.Snap(FIX).file("STATE.md"))
        self.assertEqual([a["id"] for a in asks], ["A2"])   # A1 decided, A3 done

    def test_works_counts_m4(self):
        caps = cd.parse_caps(cd.Snap(FIX).text("files_main/qa/CAPABILITIES.md"))
        self.assertEqual(cd.works_count(caps), (2, 4))       # C6.2, C7.1 Works; C7.2 Partial; C9.1 M4; Parked row left out


class Pace(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s, cls.c = run()

    def test_changes_per_day(self):
        # Change dates (IST): PF-1 14, PF-2 16 (15 Nov 20:00 UTC), PF-4 16, PF-3 18 (#103, the id anywhere, R1), FO-4 18 (#118),
        # BK-1 10, BK-2 13, BK-3 20; BK-4 is not cited (R5); FO-5's merge is after taken_at.
        # §11 R8: 13 Nov is day 1, so 20 Nov is day 8; window 13..20 Nov: 1+1+0+2+0+2+0+1 = 7 → 7/8 = 0.875 → 0.88 (round half to even, R8b)
        y = self.c["pace"]["changes_per_day"]
        self.assertEqual((y["value"], y["window_days"], y["merged_in_window"]), (0.88, 8, 7))
        self.assertEqual(self.c["pace"]["merged_changes"]["value"], 8)

    def test_remaining_scope(self):
        # shaped rows 1,2,4,6,7,8: unmerged part FO-1 = 1; not shaped: row 3 (PF-4 merged) 3-1 = 2, row 5: 3 → 5; total 6
        r = self.c["pace"]["remaining"]
        self.assertEqual((r["value"], r["shaped_unmerged"], r["unshaped_rows"], r["unshaped_estimate"]), (6, 1, 2, 5))
        self.assertNotIn("flags_bk_unmerged", r)
        self.assertEqual(r["label"], "estimate: 2 unspecified capabilities × 3 (P-586 (4), to be settled 19 Nov)")

    def test_built_and_proven(self):
        built = {r["map"]: r["built"] for r in self.c["rows"] if r["built"]}
        self.assertEqual(built, {1: "2026-11-14", 2: "2026-11-18", 7: "2026-11-20", 8: "2026-11-18"})
        self.assertEqual(self.c["pace"]["built"]["value"], 4)
        self.assertEqual(self.c["pace"]["built"]["built_before"]["maps"], [6])
        self.assertIsNone(self.c["pace"]["proven"]["value"])
        self.assertIn("no qa id column", self.c["pace"]["proven"]["reason"])

    def test_burnup(self):
        b = self.c["burnup"]
        self.assertEqual(b["days"][0], "2026-11-13")
        self.assertEqual(b["built"], [0, 1, 1, 1, 1, 3, 3, 4])
        self.assertEqual(b["scope"], [None, None, None, None, None, 8, 8, 8])   # history lines 18, 19 Nov; today 8
        self.assertEqual(b["x_end"], "2026-12-03")                               # H1's 3 Dec is later than the 85% date                               # later of H1 to (3 Dec) and the 85% date

    def test_forecast_inputs_and_pinned_dates(self):
        f = self.c["forecast"]
        self.assertEqual(f["counts"], [1, 1, 0, 2, 0, 2, 0, 1])                   # R8: 13..20 Nov only, never before 13 Nov
        self.assertEqual(f["days"][0], "2026-11-13")
        self.assertEqual(f["sample"], "Release 1 changes merged per day, 8 days from 13 Nov")
        # pinned under seed 596 (regression; the deterministic cases below are worked by hand)
        self.assertEqual((f["p50"]["value"], f["p85"]["value"]), ("2026-11-27", "2026-11-30"))

    def test_no_committed_date_line_and_grey_light(self):
        p = self.c["pace"]
        self.assertIsNone(p["changes_needed_per_day"]["value"])
        self.assertEqual(p["changes_needed_per_day"]["reason"], "not measured: no committed date yet (set 2026-11-19)")
        self.assertEqual(p["light"]["state"], "grey")

    def test_committed_date_light_and_x(self):
        base = json.loads(cd.Snap(FIX).file("cockpit/plan.json"))

        def with_h1(**kw):
            pl = json.loads(json.dumps(base))
            pl["dates"][0].update(kw)
            return run(snap_with({"files/" + cd.REL + "/cockpit/plan.json": pl}))[1]["pace"]
        p = with_h1(kind="committed", date="2026-12-08", date_to="2026-12-10", tolerance_days=0)
        self.assertEqual(p["changes_needed_per_day"]["value"], 0.3)        # 6 ÷ 20 days (20 Nov → 10 Dec)
        self.assertEqual(p["light"]["state"], "green")                     # 30 Nov ≤ 10 Dec
        self.assertEqual(with_h1(kind="committed", date="2026-11-27", date_to=None, tolerance_days=0)["light"]["state"], "amber")  # 30 Nov ≤ 27 Nov + 7
        self.assertEqual(with_h1(kind="committed", date="2026-11-20", date_to=None, tolerance_days=0)["light"]["state"], "red")
        self.assertEqual(with_h1(kind="committed", date="2026-12-10", date_to=None)["light"]["state"], "grey")   # no tolerance yet

    def test_r2_under_five_days_not_measured(self):
        _, c = run(now=datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc))
        self.assertIsNone(c["pace"]["changes_per_day"]["value"])
        self.assertEqual(c["pace"]["changes_per_day"]["reason"], "not measured yet: needs 5 days of Release 1 history, from 17 Nov (4 so far)")   # 13-16 Nov (R8)
        for k in ("p50", "p85"):    # R2: no reference class
            self.assertIsNone(c["forecast"][k]["value"])
            self.assertEqual(c["forecast"][k]["reason"], "not measured yet: fewer than 5 days of Release 1 history (from 17 Nov)")
        # Release 1 changes by 16 Nov 12:00 IST, per IST day 13..16 Nov: 13 BK-2, 14 PF-1, 16 PF-2 and PF-4
        self.assertEqual(c["forecast"]["counts"], [1, 1, 0, 2])
        self.assertEqual(c["pace"]["light"]["state"], "grey")

    def test_all_zero_window(self):
        pulls = [p for p in jread((os.path.join(FIX, "github/pulls.json"))) if not p.get("merged_at")
                 or p["merged_at"] < "2026-11-06T00:00:00Z"]
        _, c = run(snap_with({"github/pulls.json": pulls}))
        self.assertEqual(c["forecast"]["counts"], [0] * 8)
        self.assertIsNone(c["forecast"]["p85"]["value"])
        self.assertEqual(c["forecast"]["p85"]["reason"], "not measured: no merges in the window")
        self.assertEqual(c["pace"]["light"]["state"], "red")

    def test_zero_history(self):
        _, c = run(history=[])
        self.assertEqual(c["burnup"]["scope"], [None] * 7 + [8])
        self.assertTrue(all(i["ok"] for i in c["trust"]["invariants"]))
        self.assertIsNone(c["history_prev"])


class MonteCarlo(unittest.TestCase):
    def test_constant_throughput_is_exact(self):
        # 2 a day, 8 to do: every run needs exactly 4 days → 20 Nov + 4 = 24 Nov for both
        self.assertEqual(cd.monte_carlo([2] * 14, 8, date(2026, 11, 20)), {"p50": "2026-11-24", "p85": "2026-11-24", "reason": None})

    def test_nothing_remaining(self):
        self.assertEqual(cd.monte_carlo([1] * 14, 0, date(2026, 11, 20))["p85"], "2026-11-20")

    def test_cap_beyond_a_year(self):
        self.assertEqual(cd.monte_carlo([0] * 13 + [1], 1000, date(2026, 11, 20), runs=200)["p85"], "beyond 1 year")

    def test_same_seed_same_dates(self):
        a = cd.monte_carlo([0, 1, 2, 0, 3] + [1] * 9, 30, date(2026, 11, 20))
        self.assertEqual(a, cd.monte_carlo([0, 1, 2, 0, 3] + [1] * 9, 30, date(2026, 11, 20)))


class Capacity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s, cls.c = run()
        cls.k = cls.c["capacity"]

    def test_lanes_ready_room(self):
        # pushed since 05:00 UTC, not main, queue or a Lead's records branch (R8): claude/bk-6 (06:00) → 1; lead/fixture left out
        self.assertEqual(self.k["lanes_working"]["value"], 1)
        # briefs: FO-2, FO-4, FO-55, BK-6. FO-4 is merged (#118); FO-55 has no BACKLOG row (and is never FO-5's brief);
        # FO-2 and BK-6 wait on nothing → ready
        self.assertEqual(self.k["ready_rows"]["rows"], ["FO-2", "BK-6"])
        self.assertEqual(self.k["ready_rows"]["not_ready"], [])
        self.assertEqual(self.k["room"]["value"], 3)         # max_lanes 4 − 1

    def test_queues_and_constraint(self):
        st = self.k["stages"]
        self.assertEqual((st["review"]["count"]["value"], st["review"]["wait_h"]["value"]), (1, 3.5))   # #105, head 03:00 UTC
        self.assertEqual((st["merge"]["count"]["value"], st["merge"]["wait_h"]["value"]), (1, 0.5))     # #116, labelled 06:00
        self.assertEqual(st["qa"]["count"]["value"], 4)       # built rows 1, 2, 7, 8, none qa Works
        self.assertEqual(self.k["constraint"]["stage"], "unknown")
        self.assertEqual(self.k["constraint"]["line"], "Constraint unknown: qa wait not measured.")

    def test_age(self):
        # cycle days (14 days, app, not records): 1,0.5,1,2,1,1,1,1,0.333,1,1 → sorted, nearest rank 85% = 10th = 1.0
        self.assertEqual(self.k["age"]["p85_days"]["value"], 1.0)
        self.assertEqual(self.k["cycle_median_days"]["value"], 1.0)
        ages = {i["pr"]: (i["age_d"], i["older"], i["amber"]) for i in self.k["age"]["items"]}
        self.assertEqual(ages, {105: (1.92, True, False), 115: (19.27, True, True), 116: (1.02, True, False)})
        self.assertEqual(self.k["age"]["older"]["value"], 3)
        self.assertEqual(self.k["wip"]["value"], 3)
        self.assertEqual(self.k["light"]["state"], "amber")
        self.assertEqual([i["pr"] for i in self.k["idle"]], [105, 115, 116])

    def test_constraint_rules(self):
        lim = {"review": (1.0, 1), "merge": (None, 0), "qa": (None, 0)}
        self.assertEqual(cd.constraint(2, 3, 1, lim, False, 0)["line"], "2 lanes working · 3 rows ready with nobody on them → could add 1 lanes.")
        self.assertEqual(cd.constraint(2, 3, None, lim, False, 0)["add"], None)
        self.assertEqual(cd.constraint(2, 3, 5, {"review": (2.5, 1), "merge": (0.2, 1), "qa": (None, 0)}, False, 0)["line"],
                         "More lanes won't help now: the constraint is review (wait 2.5 h).")
        self.assertEqual(cd.constraint(2, 0, 5, {"review": (None, 0), "merge": (None, 0), "qa": (None, 0)}, False, 0)["stage"], "none")
        self.assertEqual(cd.constraint(2, 3, 5, lim, True, 2)["stage"], "unknown")

    def test_qa_column_makes_proven_and_qa_wait(self):
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| Map | Capability | Module | BACKLOG rows | Status |",
                                                           "| Map | Capability | Module | BACKLOG rows | Status | qa id |")
        ck = ck.replace("| 1 | Cap one | Platform | PF-1 | Merged |", "| 1 | Cap one | Platform | PF-1 | Merged | C7.1 |")
        ck = ck.replace("| 6 | Cap six | Case side | C6.2 Works | qa Works\\* |", "| 6 | Cap six | Case side | C6.2 Works | qa Works\\* | C6.2 |")
        _, c = run(snap_with({CKP: ck}))
        proven = {r["map"]: r["proven"] for r in c["rows"] if r["proven"]}
        self.assertEqual(proven, {1: "2026-11-18", 6: "2026-11-15"})   # C7.1 Works from bbb222 (18 Nov), C6.2 from aaa111
        self.assertEqual(c["pace"]["proven"]["value"], 2)
        # qa waits: rows 2 and 8 (built 18 Nov 00:00 IST → 60 h), 7 (12 h); 60/24 = 2.5 > review 3.5/2 = 1.75 → qa
        self.assertEqual(c["capacity"]["stages"]["qa"]["wait_h"]["value"], 60.0)
        self.assertEqual(c["capacity"]["constraint"]["line"], "More lanes won't help now: the constraint is qa (wait 60.0 h).")


class Top3OrgToday(unittest.TestCase):
    def test_top3_ok(self):
        _, c = run()
        self.assertEqual(c["top3"]["cards"]["today"]["state"], "ok")
        self.assertEqual(c["top3"]["cards"]["month"]["needs_you"], "A2")

    def test_top3_missing_stale_example(self):
        _, c = run(snap_with(drop=["lead-input.json"]))
        self.assertEqual({k: v["state"] for k, v in c["top3"]["cards"].items()}, {"today": "missing", "week": "missing", "month": "missing"})
        self.assertEqual(c["top3"]["cards"]["today"]["text"], "Lead has not updated this")
        li = jread((os.path.join(FIX, "lead-input.json")))
        li["as_of"] = "2026-11-20T09:00:00+05:30"          # 3 h old
        _, c2 = run(snap_with({"lead-input.json": li}))
        self.assertEqual(c2["top3"]["cards"]["week"]["why"], "Lead input 3.0 h old (limit 2 h)")
        li["as_of"], li["example"] = "2026-11-20T11:30:00+05:30", True
        _, c3 = run(snap_with({"lead-input.json": li}))
        self.assertTrue(c3["top3"]["example"])

    def test_org_cross_check(self):
        _, c = run()
        seen = {l["name"]: l["seen"] for l in c["org"]["lanes"]}
        self.assertEqual(seen, {"FO-1 lane": "both", "BK-6 lane": "both", "FO-4 lane": "reported only", "qa lane": "reported only",
                                "claude/fo-7": "measured only"})   # the done lane is left out
        self.assertEqual([l["name"] for l in c["org"]["leads"]], ["Lead 50", "Lead B"])

    def test_working_today(self):
        _, c = run()
        w = c["working_today"]
        self.assertEqual(w["groups"], ["B", "C"])
        self.assertEqual(w["rows"]["4"], {"kind": "pr", "prs": [105], "class": "measured"})
        self.assertEqual(w["rows"]["8"]["kind"], "reported")
        self.assertEqual(w["line"], "Working today on: B. The firm as our customer, C. Enquiries")


class TrustAndInvariants(unittest.TestCase):
    def test_invariants_hold_on_fixture(self):
        _, c = run()
        self.assertEqual([i["name"] for i in c["trust"]["invariants"] if not i["ok"]], [])

    def test_mapping_correction(self):
        h = fixture_history()
        h[-1]["audit"]["built"] = 5                               # yesterday 5, today 3, same checklist → broken
        _, c = run(history=h)
        bad = [i["name"] for i in c["trust"]["invariants"] if not i["ok"]]
        self.assertEqual(bad, ["Cumulative built falls only with a scope or mapping change"])
        h[-1]["audit"]["checklist_sha"] = "0" * 40                 # the checklist changed: a mapping change line, no break
        _, c2 = run(history=h)
        self.assertTrue(all(i["ok"] for i in c2["trust"]["invariants"]))
        self.assertTrue(any(n.startswith("Mapping or scope change: built 5") for n in c2["trust"]["notes"]))

    def test_duplicate_row_and_two_states(self):
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| 3 | Cap three |", "| 2 | Cap two again | Platform | PF-2 | Merged |\n| 3 | Cap three |")
        _, c = run(snap_with({CKP: ck}))
        inv = {i["name"]: i for i in c["trust"]["invariants"]}
        self.assertFalse(inv["Capabilities unique"]["ok"])
        self.assertIn("2 (Shaped / Merged)", inv["Capabilities unique"]["detail"])
        self.assertEqual(c["pace"]["rows_total"]["value"], 8)          # counted once
        _, c0 = run()
        self.assertEqual([{k: x[k] for k in ("map", "checklist", "computed", "kind")} for x in c0["trust"]["status_disagreements"]],
                         [{"map": 2, "checklist": "Shaped", "computed": "built", "kind": "checklist behind"},
                          {"map": 8, "checklist": "Shaped", "computed": "built", "kind": "checklist behind"}])
        self.assertEqual(c0["trust"]["status_explained"], [])

    def test_banner_cause_ready_rows_follow_r3b_r3c(self):
        """Board v63 item 3: the live banner "ready rows 7 vs 8" came from three places where the board's dependency reading
        left the spec the check follows (live snapshot 15 Nov 14:22 IST, every BACKLOG row given a brief: board 90, check 93; now 93 and 93)."""
        ids = {"PF-4", "PF-14", "FO-5", "AG-9"}
        # R3b: "Done when:" written inline in a cell runs to the segment end; a "waits on" inside it is never a dependency (FO-5r)
        self.assertEqual(cd.row_deps("| FO-5r | x | Done when: a page. P-561 waits on stream 4's A45 comparison. · Source: P-561 |"), ([], []))
        # ... until a labelled "Waits on:" field starts again
        self.assertEqual(cd.row_deps("| X | Done when: tests pass. Waits on: PF-4 merged |"), (["PF-4"], []))
        # R3c: a bracket the clause end (";") cut open runs to the clause end (PF-11)
        self.assertEqual(cd.row_deps("| PF-11 | **waits on:** PF-4 (merged), PF-14, FO-5 (`FilesPort` real adapter; the fake works) |"),
                         (["PF-4", "PF-14", "FO-5"], []))
        # R3: a requirement id with two dashes (AG-17-62) is not a row unless BACKLOG has it (X-20's "after approval (AG-17-62 ...")
        self.assertEqual(cd.row_deps("| X-20 | LMIA after approval (AG-17-62 to -68), inspection pack (AG-17-53) |", ids), ([], []))
        self.assertEqual(cd.row_deps("| X | **waits on:** AG-17-62 |", ids | {"AG-17-62"}), (["AG-17-62"], []))
        self.assertEqual(cd.row_deps("| X | **waits on:** AG-17-62 |", ids), ([], []))

    def test_records_differ_carry_their_cause(self):
        # fixture rows 2 and 8: every part merged by an app PR, checklist still Shaped: "checklist behind", with the PR numbers
        c = run()[1]["trust"]["status_disagreements"]
        self.assertTrue(all(x["kind"] == "checklist behind" and "#" in x["cause"] for x in c))
        # a cell naming an open item beside merged parts is explained, not "records differ" (live map 99)
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| FO-4 | Shaped |", "| FO-4; model choice open (founder) | Shaped |")
        t = run(snap_with({CKP: ck}))[1]["trust"]
        self.assertEqual([x["map"] for x in t["status_disagreements"]], [2])
        self.assertEqual([(x["map"], x["kind"]) for x in t["status_explained"]], [(8, "open item")])
        # a part merged only by a PR with no app code: explained (live maps 11 and 16, PF-7 #1713)
        pulls = jread(os.path.join(FIX, "github/pulls.json"))
        for p in pulls:
            if p.get("merged_at") and cd.title_has(p["title"] or "", "PF-1"):
                p["files_app"] = False
        t = run(snap_with({"github/pulls.json": pulls}))[1]["trust"]
        self.assertIn((1, "no app code"), [(x["map"], x["kind"]) for x in t["status_explained"]])

    def test_missing_backlog_id_and_works_row(self):
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| 8 | Cap eight | Front office | FO-4 | Shaped |", "| 8 | Cap eight | Front office | FO-4, ZZ-1, FO-99 | Shaped |")
        ck = ck.replace("C6.2 Works | qa Works", "C7.2 Partial | qa Works")
        _, c = run(snap_with({CKP: ck}))
        inv = {i["name"]: i for i in c["trust"]["invariants"]}
        self.assertEqual(inv["Every id a Shaped row cites exists in BACKLOG (R4)"]["detail"], "missing in BACKLOG.md: FO-99 (row 8), ZZ-1 (row 8)")
        self.assertFalse(inv["Every qa Works row names a qa capability that reads Works on main"]["ok"])

    def test_reconcile_compare(self):
        _, c = run()
        k = c["keys"]
        theirs = {"numbers": {n: {"value": v} for n, v in k.items() if not n.startswith("mc_")},
                  "mc_inputs": {"daily_counts": k["mc_daily_counts"], "remaining_scope": k["mc_remaining_scope"]}}
        self.assertEqual(cd.reconcile_compare(k, theirs, None)["state"], "agree")
        t2 = json.loads(json.dumps(theirs))
        plus = lambda n: (date.fromisoformat(k["forecast_p85_date"]) + timedelta(days=n)).isoformat()
        r7 = cd.reconcile_compare(k, theirs, None)
        self.assertEqual(r7["compared"], 55)                                  # R7: the contract's 11 numbers + mc_inputs' two + P-602's eight + v53's six + v63's eight + P-636's Proven + P-644's 13 Flow counts + A133's 4
        t2["numbers"]["forecast_p85_date"]["value"] = plus(1)                 # +1 day: agrees
        self.assertEqual(cd.reconcile_compare(k, t2, None)["state"], "agree")
        t2["numbers"]["forecast_p85_date"]["value"] = plus(2)                 # +2 days: disagrees
        t2["numbers"]["built_rows"]["value"] = 5
        r = cd.reconcile_compare(k, t2, None)
        self.assertEqual((r["state"], r["banner"]), ("disagree", "Numbers disagree: built_rows, forecast_p85_date"))
        r0 = cd.reconcile_compare(k, None, "not checked: tools/cockpit-reconcile.py is absent")
        self.assertEqual((r0["state"], r0["banner"]), ("not checked", "Numbers not checked"))

    def test_reconcile_absent_or_failing(self):
        self.assertEqual(cd.run_reconcile(FIX, "/nonexistent/cockpit-reconcile.py"), (None, "not checked: tools/cockpit-reconcile.py is absent"))
        bad = os.path.join(tempfile.mkdtemp(), "r.py")
        with open(bad, "w") as f:
            f.write("import sys; sys.exit(4)\n")
        out, note = cd.run_reconcile(FIX, bad)
        self.assertIsNone(out)
        self.assertTrue(note.startswith("not checked: the reconciliation exited 4"))


class Rulings(unittest.TestCase):
    def test_r3_dependency_clauses(self):
        self.assertEqual(cd.row_deps("| X | a | b · *Waits on:* PF-4 merged · c |"), (["PF-4"], []))
        self.assertEqual(cd.row_deps("| X | text, waits on FO-1a; the rest |"), (["FO-1a"], []))
        self.assertEqual(cd.row_deps("| X | **waits on:** contract v0 · decisions: none |"), ([], ["contract v0"]))
        self.assertEqual(cd.row_deps("| X | **waits on:** nothing · decisions: none (licences: no counsel) |"), ([], []))
        self.assertEqual(cd.row_deps("| X | Waits on `ClientMergePort` for the client part only |"),
                         ([], ["for client part only"]))

    def test_r3b_tighter_clause(self):
        # filler words, punctuation and #numbers never block
        self.assertEqual(cd.row_deps("| X | **waits on:** PF-4 and PF-4b, both merged (PR #1744) · decisions: none |"), (["PF-4", "PF-4b"], []))
        self.assertEqual(cd.row_deps("| X | **waits on:** FO-9b (merged rows) · y |"), (["FO-9b"], []))
        self.assertEqual(cd.row_deps("| X | **waits on:** PF-4 (the guard sets the firm), FO-1a · z |"), (["PF-4", "FO-1a"], []))
        # a labelled field ends the clause
        self.assertEqual(cd.row_deps("| X | **waits on:** PF-3 decisions: the founder's account |"), (["PF-3"], []))
        # "after": ids only when a row id is within its next 3 tokens; leftover text never blocks
        self.assertEqual(cd.row_deps("| X | runs right after FO-7a merged. More |"), (["FO-7a"], []))
        self.assertEqual(cd.row_deps("| X | **(after the Bake; from #1612)** text |"), ([], []))
        self.assertEqual(cd.row_deps("| X | schema baton after it moves on to the end, FO-5 |"), ([], []))   # FO-5 is 7 tokens on

    def test_r3c_brackets_backticks_filler_and_done_when(self):
        self.assertEqual(cd.row_deps("| X | **waits on:** FO-5 (`FilesPort`), PF-14 (the day-15 job) · d |"), (["FO-5", "PF-14"], []))
        self.assertEqual(cd.row_deps("| X | waits on: nobody; no |"), ([], []))
        self.assertEqual(cd.row_deps("| X | waits on PF-3 (contract v0 first) |"), (["PF-3"], []))         # ids in brackets still count
        hdr = ["", "#", "Area", "Item", "Done when (beyond the standard)", "Source · waits on · decisions", ""]
        line = "| FO-2 | lane | **Row** | a pack check; waits on the demo | src · **waits on:** PF-1 · decisions: none |"
        self.assertEqual(cd.row_deps(cd.dep_text(line, hdr)), (["PF-1"], []))   # the Done-when "waits on the demo" is not read
        self.assertEqual(cd.row_deps(line), (["PF-1"], ["demo"]))
        bl = cd.parse_backlog("## Rows\n| # | Area | Item | Done when | Source |\n|---|---|---|---|---|\n" + line + "\n")
        self.assertEqual(cd.row_deps(bl["deps"]["FO-2"]), (["PF-1"], []))

    def test_r3d_ids_in_brackets_and_map_numbers(self):
        self.assertEqual(cd.row_deps("| X | **waits on:** the port (`PF-24`) and (FO-9b) · d |"), (["PF-24", "FO-9b"], ["port"]))
        self.assertEqual(cd.row_deps("| X | **waits on:** map rows 48 and 49, FO-2 · d |"), (["FO-2"], []))
        self.assertEqual(cd.row_deps("| X | waits on map 62; z |"), ([], []))
        self.assertEqual(cd.row_deps("| X | waits on the map of fees; z |"), ([], ["map of fees"]))   # "map" without numbers still blocks
        hdr = ["", "#", "Area", "Item", "Done when", "Source · waits on · decisions", ""]
        self.assertEqual(cd.row_deps(cd.dep_text("| PF-9 | a | b | c | src · **waits on:** PF-4 · decisions: none |", hdr)), (["PF-4"], []))   # last column read

    def test_r3_non_id_dependency_blocks_ready(self):
        bl = cd.Snap(FIX).file("BACKLOG.md")
        bl = bl.replace("| FO-2 | lane | **Row FO-2:** a fixture row · **waits on:** nothing ·",
                        "| FO-2 | lane | **Row FO-2:** a fixture row · **waits on:** contract v0 ·")
        bl = bl.replace("**Row BK-6:** a fixture row; brief: briefs/BK-6 · **waits on:** nothing",
                        "**Row BK-6:** a fixture row; brief: briefs/BK-6 · *Waits on:* FO-1 merged")
        self.assertIn("contract v0", bl)
        self.assertIn("FO-1 merged", bl)
        _, c = run(snap_with({"files/" + cd.REL + "/BACKLOG.md": bl}))
        q = c["capacity"]["ready_rows"]
        self.assertEqual(q["rows"], [])
        self.assertEqual(q["not_ready"], [{"id": "FO-2", "waits_on": [], "non_id": ["contract v0"]},
                                          {"id": "BK-6", "waits_on": ["FO-1"], "non_id": []}])

    def test_release1_capability_rows_read_by_both_scripts(self):
        # 16 Nov board: invariant "every qa Works row names a qa capability that reads Works on main" failed on rows 2 and 9,
        # proven by R1.2 and R1.9, because both parsers read only C rows; the R1 table has a Status column and no M column
        r1 = ("\n## Release 1\n\n| # | Map row: capability | Module | Status | Tested on | Done when |\n|---|---|---|---|---|---|\n"
              "| R1.2 | 2 Database | Platform | Works | abc | fixture |\n| R1.3 | 3 Files | Platform | Not built | abc | fixture |\n")
        caps = cd.Snap(FIX).text("files_main/qa/CAPABILITIES.md") + r1
        spec_r = importlib.util.spec_from_file_location("cockpit_reconcile_t", os.path.join(HERE, "cockpit-reconcile.py"))
        rc = importlib.util.module_from_spec(spec_r)
        spec_r.loader.exec_module(rc)
        board = {k: v["status"] for k, v in cd.parse_caps(caps).items()}
        check = {k: v[1] for k, v in rc.parse_capabilities(caps).items()}
        self.assertEqual(board, check)
        self.assertEqual((board["R1.2"], board["R1.3"], cd.parse_caps(caps)["R1.2"]["m"]), ("Works", "Not built", ""))
        self.assertEqual(cd.works_count(cd.parse_caps(caps)), cd.works_count(cd.parse_caps(caps[:-len(r1)])))   # Works count unchanged
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| 6 | Cap six | Case side | C6.2 Works | qa Works\\* |",
                                                            "| 6 | Cap six | Case side | R1.2 Works | qa Works\\* |")
        self.assertIn("R1.2 Works", ck)
        d = snap_with({"files_main/qa/CAPABILITIES.md": caps, CKP: ck})
        out, note = cd.run_reconcile(d, os.path.join(HERE, "cockpit-reconcile.py"))
        self.assertIsNone(note)
        _, c = run(d, rec=out, note=None)
        inv = [i for i in c["trust"]["invariants"] if i["name"].startswith("Every qa Works row")][0]
        self.assertTrue(inv["ok"], inv)
        self.assertEqual((c["trust"]["state"], c["trust"]["diffs"]), ("agree", []), c["trust"]["diffs"])

    def test_bold_first_cell_is_a_backlog_row_in_both_scripts(self):
        # 16 Nov board 7: "Numbers disagree: ready_rows" board 7, check 8. BACKLOG row FO-7mv is written "| **FO-7mv** |";
        # the board read only a plain first cell, so it never saw the row; the check removes "**" and "`" (one rule, FORMULAS.md
        # › BACKLOG rows). A bold or backticked first cell is the same row in both scripts.
        for mark in ("**", "`"):
            bl = cd.Snap(FIX).file("BACKLOG.md").replace("| FO-2 | lane |", "| %sFO-2%s | lane |" % (mark, mark))
            self.assertIn("| %sFO-2%s |" % (mark, mark), bl)
            self.assertIn("FO-2", cd.parse_backlog(bl)["lines"])
            d = snap_with({BLP: bl})
            out, note = cd.run_reconcile(d, os.path.join(HERE, "cockpit-reconcile.py"))
            self.assertIsNone(note)
            _, c = run(d, rec=out, note=None)
            self.assertIn("FO-2", c["capacity"]["ready_rows"]["rows"])
            self.assertEqual((c["trust"]["state"], c["trust"]["diffs"]), ("agree", []), c["trust"]["diffs"])

    def test_r1b_ready_counts_any_merged_pr(self):
        # BK-5's only PR (#112) is not app code: not a change (R1b), but merged for readiness, so a row waiting on it is ready
        bl = cd.Snap(FIX).file("BACKLOG.md").replace("**Row BK-6:** a fixture row; brief: briefs/BK-6 · **waits on:** nothing",
                                                    "**Row BK-6:** a fixture row; brief: briefs/BK-6 · **waits on:** BK-5")
        self.assertIn("waits on:** BK-5", bl)
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| BK-1 to BK-3 |", "| BK-1 to BK-3, BK-5 |")
        _, c = run(snap_with({"files/" + cd.REL + "/BACKLOG.md": bl, CKP: ck}))
        self.assertEqual(c["capacity"]["ready_rows"]["rows"], ["FO-2", "BK-6"])
        self.assertEqual(c["pace"]["merged_changes"]["value"], 8)              # BK-5 is cited but has no app-code merge
        self.assertNotIn(7, {r["map"] for r in c["rows"] if r["built"]})       # so row 7 is not built

    def test_r4_missing_id_in_unshaped_row_is_a_part(self):
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| FO-2, FO-3 named only | Not shaped |", "| FO-2, FO-3 named only; FO-77 | Not shaped |")
        _, c = run(snap_with({CKP: ck}))
        self.assertTrue(all(i["ok"] for i in c["trust"]["invariants"]))
        self.assertEqual(c["pace"]["remaining"]["value"], 6)                  # row 5: still 3 - 0 merged parts

    def test_r5b_counts_exactly_the_cited_bk_ids(self):
        # the cited BK ids are BK-1, BK-2, BK-3 (row 7's range); BK-4 (#110), BK-5 and BK-6 are in BACKLOG but not cited
        _, c = run()
        r1 = {x for r in c["rows"] for x in r["ids"] if x.startswith("BK-")}
        self.assertEqual(r1, {"BK-1", "BK-2", "BK-3"})
        self.assertEqual(c["pace"]["merged_changes"]["value"], 8)            # BK-1 (10 Nov) counts as merged, outside the window

    def test_r5_bake_rows_count_only_when_cited(self):
        _, c = run()
        self.assertEqual(c["pace"]["merged_changes"]["value"], 8)             # BK-4 (#110) is merged but not cited
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| BK-1 to BK-3 |", "| BK-1 to BK-4 |")
        _, c2 = run(snap_with({CKP: ck}))
        self.assertEqual(c2["pace"]["merged_changes"]["value"], 9)

    def test_r6_health_exception(self):
        ex = [{"bug": "QA-9", "decision": "P-358", "reason": "the ruling: does not hold C6.2"}]
        s = cd.Snap(snap_with({"files/" + cd.REL + "/cockpit/health-exceptions.json": ex}))
        comp = cd.compute_board(s, NOW, fixture_history(), None, "not checked: test")
        h = cd.health(s, NOW, comp, s.j("lead-input.json"))
        six = h["items"][5]
        self.assertEqual(six["state"], "green")
        self.assertIn("QA-9 excluded by P-358", six["detail"])
        self.assertEqual(six["excluded"], ["QA-9 excluded by P-358"])


class ReviewFixes(unittest.TestCase):
    def test_r8_lead_branches_never_lanes(self):
        br = jread(os.path.join(FIX, "github/branches_recent.json")) + [{"name": "lead-b-front-office", "sha": "8" * 40, "pushed_at": "2026-11-20T06:15:00Z"}]
        _, c = run(snap_with({"github/branches_recent.json": br}))
        self.assertEqual(c["capacity"]["lanes_working"]["names"], ["claude/bk-6"])

    def test_push_after_taken_at_is_not_a_lane(self):
        # 14 Nov 19:1x IST: two lanes pushed during a 97 s collection; the board said 14, reconcile 12 (frozen snapshot, P-596)
        br = jread(os.path.join(FIX, "github/branches_recent.json")) + [{"name": "claude/late-push", "sha": "9" * 40, "pushed_at": "2026-11-20T06:31:00Z"}]
        _, c = run(snap_with({"github/branches_recent.json": br}))
        self.assertEqual(c["capacity"]["lanes_working"]["names"], ["claude/bk-6"])

    def test_r8_parked_prs_leave_the_queues(self):
        d = jread(os.path.join(FIX, "github/open_prs_detail.json"))
        d[2]["head_committed_at"] = "2026-11-12T06:00:00Z"            # #116: no push for 8 days → parked
        _, c = run(snap_with({"github/open_prs_detail.json": d}))
        k = c["capacity"]
        self.assertEqual([x["pr"] for x in k["parked"]], [116])
        self.assertEqual(k["stages"]["merge"]["count"]["value"], 0)
        self.assertEqual(k["wip"]["value"], 3)                          # still an open app PR

    def test_m5_org_prefix_and_row_match(self):
        li = jread(os.path.join(FIX, "lead-input.json"))
        for x in li["sessions"]:
            if x["name"] == "BK-6 lane":
                x["reports_to"] = "Lead 50 (tech lead)"
            if x["name"] == "FO-1 lane":
                x["pr"] = None                                         # found by its row id in #105's title
        _, c = run(snap_with({"lead-input.json": li}))
        lanes = {l["name"]: l for l in c["org"]["lanes"]}
        self.assertEqual(lanes["BK-6 lane"]["reports_key"], "Lead 50")
        self.assertEqual((lanes["FO-1 lane"]["seen"], lanes["FO-1 lane"]["pr"]), ("both", 105))
        self.assertEqual(sorted(l["name"] for l in c["org"]["lanes"]), ["BK-6 lane", "FO-1 lane", "FO-4 lane", "claude/fo-7", "qa lane"])

    def test_health_1_words_and_nightly(self):
        s, c = run()
        h = cd.health(s, NOW, c, s.j("lead-input.json"))
        self.assertEqual(h["items"][0]["detail"], "1 passed, 1 skipped on main's head (main's head passed the merge queue); newest nightly success")
        ni = {"conclusion": "cancelled", "created_at": "2026-11-19T21:00:00Z", "previous": {"conclusion": "cancelled", "created_at": "2026-11-18T21:00:00Z"}}
        s2 = cd.Snap(snap_with({"github/main_nightly.json": ni}))
        c2 = cd.compute_board(s2, NOW, fixture_history(), None, "x")
        self.assertEqual(cd.health(s2, NOW, c2, s2.j("lead-input.json"))["items"][0]["state"], "amber")


class Health(unittest.TestCase):
    def states(self, snapdir=FIX, rec=None, note="not checked: test"):
        s, c = run(snapdir, rec=rec, note=note)
        h = cd.health(s, NOW, c, s.j("lead-input.json"))
        return h, {i["id"]: i["state"] for i in h["items"]}

    def test_fixture_health(self):
        h, st = self.states()
        # 1 green (checks and nightly green) · 2 page · 3 green (oldest unmerged 10 h) · 4 green · 5 green (1.5 %/h, 0.5 h old)
        # 6 red (QA-9 Major on C6.2, Works, first seen 17 Nov 10:00 IST = 74 h) · 7 amber (not checked, #115 age, org "?")
        self.assertEqual(st, {1: "green", 2: "page", 3: "green", 4: "green", 5: "green", 6: "red", 7: "amber"})
        self.assertEqual(h["light"], "red")
        six = h["items"][5]
        self.assertEqual((six["detail"], six["owner"]), ("open Major or Critical bugs on capabilities marked proven, older than 48 h: QA-9",
                                                  "current Lead (builders and qa fix)"))
        self.assertEqual(six["bugs"][0]["id"], "QA-9")

    def test_lead_input_missing_stale_hot(self):
        _, st = self.states(snap_with(drop=["lead-input.json"]))
        self.assertEqual(st[5], "amber")
        li = jread((os.path.join(FIX, "lead-input.json")))
        li["as_of"] = "2026-11-20T09:00:00+05:30"
        self.assertEqual(self.states(snap_with({"lead-input.json": li}))[1][5], "amber")
        li["as_of"], li["burn_pct_per_h"] = "2026-11-20T11:30:00+05:30", 3.5
        self.assertEqual(self.states(snap_with({"lead-input.json": li}))[1][5], "red")

    def test_disagreement_turns_item_7_red(self):
        _, c = run()
        theirs = {"numbers": {"built_rows": {"value": 99}}}
        _, st = self.states(rec=theirs, note=None)
        self.assertEqual(st[7], "red")

    def test_records_lag_and_failed_guard(self):
        meta = jread((os.path.join(FIX, "meta.json")))
        meta["extra"]["state_branch_oldest_unmerged_at"] = "2026-11-18T12:00:00+05:30"   # 48 h
        gr = jread((os.path.join(FIX, "github/guard_runs.json")))
        gr[1]["conclusion"] = "failure"
        _, st = self.states(snap_with({"meta.json": meta, "github/guard_runs.json": gr}))
        self.assertEqual((st[3], st[4]), ("red", "red"))

    def test_item_6_reads_main_bugs_not_the_records_copy(self):
        # 16 Nov: the Lead's records copy of qa/BUGS.md was 6 days old and listed bugs closed on main (QA-383, QA-162) as open;
        # the qa lane writes bugs on main, so item 6 reads files_main/qa/BUGS.md when the snapshot has it
        rec = cd.Snap(FIX).file("qa/BUGS.md")
        self.assertEqual(self.states()[1][6], "red")                       # records copy: QA-9 open, 74 h old
        closed_on_main = "\n".join(ln for ln in rec.splitlines() if "| QA-9 |" not in ln) + "\n"
        h, st = self.states(snap_with({"files_main/qa/BUGS.md": closed_on_main}))
        self.assertEqual(st[6], "green")
        self.assertIsNone(h["items"][5]["action"])

    def test_every_item_not_green_says_what_to_do_and_who(self):
        # 16 Nov (founder: "a lot of red health stuff ... it doesn't show me anything"): amber items carry an action too
        for d in (FIX, snap_with(drop=["lead-input.json", "github/guard_runs.json"])):
            h, _ = self.states(d)
            for i in h["items"]:
                if i["state"] in ("red", "amber"):
                    self.assertTrue(i["action"] and i["owner"], i)
                if i["state"] == "green":
                    self.assertIsNone(i["action"], i)

    def test_records_lag_counts_files_main_never_had_not_commits(self):
        # 16 Nov: board 7 said "1,114 commits on lead/… not on main" although records reach main as one rebuilt commit on a
        # fresh branch (P-505). Old rule: rev-list main..branch. New rule: files whose branch version main never had.
        g = tempfile.mkdtemp(prefix="cockpit-git-")
        def git(*a, at="2026-11-10T10:00:00+05:30"):
            env = dict(os.environ, GIT_AUTHOR_DATE=at, GIT_COMMITTER_DATE=at, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@e",
                       GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@e", GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
            return subprocess.run(["git", "-C", g, *a], capture_output=True, text=True, env=env, check=True).stdout.strip()
        def put(name, text):
            with open(os.path.join(g, name), "w") as f:
                f.write(text)
        git("init", "-q", "-b", "main")
        put("STATE.md", "s0\n"); put("BACKLOG.md", "b0\n"); git("add", "-A"); git("commit", "-qm", "base")
        git("checkout", "-qb", "lead")
        put("STATE.md", "s1\n"); git("commit", "-qam", "lead 1", at="2026-11-11T10:00:00+05:30")
        put("BACKLOG.md", "b1\n"); git("commit", "-qam", "lead 2", at="2026-11-12T10:00:00+05:30")
        git("checkout", "-q", "main")                         # records rebuilt on main: same content, a different commit
        put("STATE.md", "s1\n"); put("BACKLOG.md", "b1\n"); git("commit", "-qam", "records rebuilt on main", at="2026-11-13T10:00:00+05:30")
        put("app.ts", "x\n"); git("add", "-A"); git("commit", "-qm", "app change", at="2026-11-13T11:00:00+05:30")
        git("checkout", "-q", "lead")
        put("STATE.md", "s2\n"); git("commit", "-qam", "lead 3", at="2026-11-14T10:00:00+05:30")
        old_root, cd.ROOT = cd.ROOT, g
        try:
            self.assertEqual(git("rev-list", "--count", "main..lead"), "3")          # what the old rule reported
            n, oldest, files = cd.records_lag("lead", "main")
            self.assertEqual((n, [f["path"] for f in files]), (1, ["STATE.md"]))   # BACKLOG's b1 is on main; STATE's s2 is not
            self.assertEqual(cd.parse_iso(oldest), cd.parse_iso("2026-11-14T10:00:00+05:30"))
            put("STATE.md", "s1\n"); git("commit", "-qam", "lead 4: back to main's version", at="2026-11-14T12:00:00+05:30")
            self.assertEqual(cd.records_lag("lead", "main")[:2], (0, None))
        finally:
            cd.ROOT = old_root


class Contract(unittest.TestCase):
    def test_cli_on_fixture_valid_and_amber_banner_without_reconcile(self):
        out = tempfile.mkdtemp()
        r = subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"),
                            "--from-snapshot", FIX, "--offline", "--no-history-write", "--reconcile", "/nonexistent/r.py"],
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stderr)
        d = jread((os.path.join(out, "data.json")))
        self.assertEqual(cd.validate(d, os.path.join(cd.P, "cockpit", "data.schema.json")), [])
        self.assertEqual((d["trust"]["state"], d["trust"]["banner"]), ("not checked", "Numbers not checked"))   # amber, never green (R2-6)
        self.assertEqual(d["summary"]["works"]["v"], [2, 4])
        self.assertEqual(d["freshness"]["records_copy"]["sha"], "123456789")       # the records sha, not main's (review Minor 4)
        self.assertIsNone(d["lead_queue"]["count"]["v"])                          # offline: PR questions not measured (Minor 5)
        self.assertTrue(d["lead_queue"]["count"]["reason"].startswith("not measured"))
        self.assertEqual([a["id"] for a in d["needs_you"]["asks"]], ["A2"])
        self.assertEqual(d["needs_you"]["count"]["v"], 1)                         # A2 only; "Nothing open." is not an item (P-602 (1))
        self.assertEqual(d["summary"]["needs_you"]["v"], 1)
        self.assertNotIn("pr_questions", d["needs_you"])
        self.assertEqual(d["pace"]["delivery_24h"]["plan_pct_used"]["value"], 12)
        self.assertIsNone(d["healing"]["questions"]["v"])                         # the older Factory figure agrees: not measured
        self.assertEqual(d["needs_you"]["count"]["class"], "parsed")
        self.assertEqual(d["lead_queue"]["count"]["class"], "measured")

    def test_schema_refuses_missing_lineage_and_null_without_reason(self):
        out = tempfile.mkdtemp()
        subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"),
                        "--from-snapshot", FIX, "--offline", "--no-history-write", "--reconcile", "/nonexistent/r.py"],
                       capture_output=True, text=True, timeout=300)
        d = jread((os.path.join(out, "data.json")))
        sch = os.path.join(cd.P, "cockpit", "data.schema.json")
        d1 = json.loads(json.dumps(d))
        del d1["pace"]["built"]["sha"]
        self.assertTrue(cd.validate(d1, sch))
        d2 = json.loads(json.dumps(d))
        del d2["pace"]["proven"]["reason"]
        self.assertTrue(cd.validate(d2, sch))
        d3 = json.loads(json.dumps(d))
        del d3["quality"]["review_rounds"]["reason"]                # a legacy number (v/src) is walked too
        self.assertTrue(cd.validate(d3, sch))
        # board v53: the top numbers and the capability table are part of the contract
        self.assertEqual((d["top_numbers"]["works_today"]["value"], d["top_numbers"]["lanes"]["started"]["value"]), (1, 4))
        for path in (("top_numbers", "works_today", "by_size"), ("top_numbers", "lanes", "idle", "class"), ("capability_table", "not_mapped", "src")):
            dx = json.loads(json.dumps(d))
            o_ = dx
            for k in path[:-1]:
                o_ = o_[k]
            del o_[path[-1]]
            self.assertTrue(cd.validate(dx, sch), path)
        dx = json.loads(json.dumps(d))
        dx["top_numbers"]["works_today"]["target"] = 12              # the founder's target is 10 (A68)
        self.assertTrue(cd.validate(dx, sch))
        dx = json.loads(json.dumps(d))
        dx["capability_table"]["rows"][0]["size"] = "XL"             # only S, M, L or not shaped
        self.assertTrue(cd.validate(dx, sch))
        dx = json.loads(json.dumps(d))
        dx["top_numbers"]["rules_caught"] = {}                       # rules stay internal (A70): not in the top strip
        self.assertTrue(cd.validate(dx, sch))

    def test_history_one_line_per_day(self):
        p = os.path.join(tempfile.mkdtemp(), "history.jsonl")
        h = fixture_history()
        cd.write_history(p, h, {"day": "2026-11-20", "rows": 8, "n": 1})
        cd.write_history(p, h, {"day": "2026-11-20", "rows": 8, "n": 2})       # the day's last refresh replaces the earlier line
        with open(p) as f:
            lines = [json.loads(x) for x in f]
        self.assertEqual([x["day"] for x in lines], ["2026-11-18", "2026-11-19", "2026-11-20"])
        self.assertEqual(lines[-1]["n"], 2)

    def test_lineage_on_every_new_number(self):
        _, c = run()
        for k in ("changes_needed_per_day", "changes_per_day", "built", "proven", "rows_total", "remaining", "merged_changes"):
            n = c["pace"][k]
            self.assertTrue(all(n.get(x) for x in ("src", "sha", "as_of", "class")), k)
        for k, n in c["pace"]["delivery_24h"].items():
            if isinstance(n, dict) and "value" in n:
                self.assertTrue(all(n.get(x) for x in ("src", "sha", "as_of", "class")), k)
                self.assertTrue(n["value"] is not None or n.get("reason"), k)

    def test_schema_refuses_needs_you_with_pr_questions(self):
        out = tempfile.mkdtemp()
        subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"),
                        "--from-snapshot", FIX, "--offline", "--no-history-write", "--reconcile", "/nonexistent/r.py"],
                       capture_output=True, text=True, timeout=300)
        d = jread(os.path.join(out, "data.json"))
        sch = os.path.join(cd.P, "cockpit", "data.schema.json")
        d1 = json.loads(json.dumps(d))
        d1["needs_you"]["pr_questions"] = []                           # P-602 (1): PR questions never sit in Needs you
        self.assertTrue(cd.validate(d1, sch))
        d2 = json.loads(json.dumps(d))
        del d2["pace"]["delivery_24h"]["rows_needed_per_day"]["reason"]   # a null without its reason
        self.assertTrue(cd.validate(d2, sch))
        d3 = json.loads(json.dumps(d))
        d3["pace"]["delivery_24h"]["pct_per_change"]["class"] = "measured"   # the percent is Lead-typed: reported
        self.assertTrue(cd.validate(d3, sch))


class NeedsSplit(unittest.TestCase):
    """P-602 (1) and review M2: Needs you counts the founder's own items; PR questions go to the tech lead's queue."""
    Q = [{"n": 1755, "title": "forms: FO-13", "age_h": 2.0, "src": "x"}, {"n": 1761, "title": "forms: FO-5", "age_h": 0.5, "src": "x"}]
    LIN = {"parsed": ("123456789", "2026-11-20T12:00:00+05:30"), "measured": ("abcdef012", "2026-11-20T12:00:00+05:30")}

    def ask(self, rid, text="a", status="open"):
        return {"id": rid, "ask": text, "status": status, "src": "STATE.md › Founder asks", "names": cd.item_ids(f"{rid} {text} {status}")}

    def test_pr_questions_leave_needs_you(self):
        needs, lq = cd.needs_split([self.ask("A67")], None, None, self.Q, True, "STATE.md", "GitHub", self.LIN)
        self.assertEqual(needs["count"]["v"], 1)
        self.assertNotIn("pr_questions", needs)
        self.assertEqual((lq["count"]["v"], [q["n"] for q in lq["items"]]), (2, [1755, 1761]))

    def test_for_the_founder_counts_each_open_f_id(self):
        needs, _ = cd.needs_split([], "F2, F8 open (demo looks); F14-F19 ruled; word for word in `history/x.md`.", None, [], True, "s", "g", self.LIN)
        self.assertEqual((needs["count"]["v"], needs["for_founder"]["open_ids"]), (2, ["F2", "F8"]))
        self.assertEqual(cd.needs_split([], "Nothing open.", None, [], True, "s", "g")[0]["count"]["v"], 0)
        self.assertEqual(cd.open_f_ids("F3 open; F4-F6 open but decided"), ["F3"])

    def test_waiting_line_counts_only_new_ids(self):
        pointer = "today's items are in hand-over item 0; the 13 Nov line word for word in `history/x.md`."
        needs, _ = cd.needs_split([self.ask("A5", "A39 waits on F15's two branches")], "F2, F8 open", pointer, [], True, "s", "g", self.LIN)
        self.assertEqual((needs["count"]["v"], needs["waiting_line"]["new_ids"]), (3, []))   # 1 ask + F2, F8; the pointer counts 0
        self.assertEqual(needs["waiting_line"]["v"], pointer)                                # still shown behind the click
        needs2, _ = cd.needs_split([self.ask("A5", "A39 waits on F15's two branches")], "F2, F8 open",
                                   "F15's branch deletes and F8 and A70 still need his word", [], True, "s", "g", self.LIN)
        self.assertEqual((needs2["count"]["v"], needs2["waiting_line"]["new_ids"]), (4, ["A70"]))   # F15 and F8 already counted

    def test_counts_carry_full_lineage_and_offline_queue(self):
        needs, lq = cd.needs_split([], None, None, [], False, "s", "g", self.LIN)
        self.assertEqual({k: needs["count"][k] for k in ("class", "sha", "as_of")},
                         {"class": "parsed", "sha": "123456789", "as_of": "2026-11-20T12:00:00+05:30"})
        self.assertEqual((lq["count"]["v"], lq["count"]["class"], lq["count"]["sha"]), (None, "measured", "abcdef012"))
        self.assertTrue(lq["count"]["reason"].startswith("not measured"))


ULP = "files/" + cd.REL + "/cockpit/usage-log.tsv"
UL_HDR = "time_ist\tweekly_pct\taccount\tby\n"
FIXLOG = cd.Snap(FIX).file("cockpit/usage-log.tsv")


def ul(*rows):
    """A usage log: rows of (time, pct, account); by = Lead 50."""
    return UL_HDR + "".join(f"{t}\t{p}\t{a}\tLead 50\n" for t, p, a in rows)


def day19(hm):
    return f"2026-11-19T{hm}:00+05:30"


def day20(hm):
    return f"2026-11-20T{hm}:00+05:30"


class Delivery24h(unittest.TestCase):
    """P-602 (4): plan % per merged change and per row at qa Works; window 19 Nov 12:00 to 20 Nov 12:00 IST (taken_at)."""
    def d(self, changes=None):
        return run(snap_with(changes))[1]["pace"]["delivery_24h"] if changes else run()[1]["pace"]["delivery_24h"]

    def test_normal_case(self):
        x = self.d()
        # fixture log: 19 Nov 10:00 25 (before the window) · 13:00 28 · 18:00 33 · 20 Nov 09:00 37 · 11:30 40 · 12:30 43 (after taken_at)
        # → 5 + 4 + 3 = 12 over 13:00 → 11:30 (22.5 h)
        u = x["plan_pct_used"]
        self.assertEqual((u["value"], u["class"], u["at_least"], u["as_of"]), (12, "reported", False, day20("11:30")))
        self.assertEqual(x["span"], {"from": day19("13:00"), "to": day20("11:30"), "hours": 22.5, "basis": "readings"})
        # BK-3 #109 merged 20 Nov 08:30 IST (inside the span); PF-3 #111 on 19 Nov is not its first merge; FO-5 after taken_at
        self.assertEqual((x["changes_merged"]["value"], x["changes_merged"]["ids"]), (1, ["BK-3"]))
        self.assertEqual((x["pct_per_change"]["value"], x["pct_per_change"]["class"], x["pct_per_change"]["as_of"]), (12.0, "reported", day20("11:30")))
        # row 6 reads qa Works from the checklist commit of 20 Nov 07:30 IST (Merged before): reached inside the span and the 24 h
        self.assertEqual((x["works_rows"]["value"], x["works_rows"]["maps"]), (1, [6]))
        self.assertEqual(x["pct_per_works_row"]["value"], 12.0)
        self.assertEqual((x["rows_done_per_day"]["value"], x["rows_done_per_day"]["maps"]), (1, [6]))
        self.assertEqual(x["rows_needed_per_day"]["reason"], "not measured: no committed date yet (set 2026-11-19)")
        self.assertEqual(x["rows_needed_per_day"]["rows_left"], 7)

    def test_short_span_and_deliveries_counted_over_it(self):
        # readings 05:00 → 11:00 (6 h): BK-3 (08:30) is inside the span; per-delivery figures are not measured under 20 h
        x = self.d({ULP: ul((day20("05:00"), 20, "A1"), (day20("11:00"), 26, "A1"))})
        self.assertEqual((x["span"]["hours"], x["plan_pct_used"]["value"], x["changes_merged"]["value"]), (6.0, 6, 1))
        self.assertIsNone(x["pct_per_change"]["value"])
        self.assertEqual(x["pct_per_change"]["reason"], "not measured: the readings cover only 6 h of 24")
        self.assertEqual(x["pct_per_works_row"]["reason"], "not measured: the readings cover only 6 h of 24")
        # readings 19 Nov 12:05 → 20 Nov 08:25 (20.3 h): BK-3 (08:30) falls after the last reading → not counted
        y = self.d({ULP: ul((day19("12:05"), 20, "A1"), (day20("08:25"), 26, "A1"))})
        self.assertEqual((y["changes_merged"]["value"], y["pct_per_change"]["reason"]), (0, "no Release 1 changes merged (6% of a weekly plan used)"))

    def test_window_and_span_edges(self):
        # a reading exactly at the window's start (taken_at − 24 h) is outside; one exactly at taken_at is inside
        x = self.d({ULP: ul((day19("12:00"), 10, "A1"), (day19("12:30"), 12, "A1"), (day20("12:00"), 20, "A1"))})
        self.assertEqual((x["plan_pct_used"]["value"], [r["pct"] for r in x["plan_pct_used"]["readings"]]), (8, [12, 20]))
        self.assertEqual(x["span"]["hours"], 23.5)
        # a merge exactly at the span's end counts, one exactly at its start does not: BK-3 merged 20 Nov 08:30 IST
        end = self.d({ULP: ul((day19("12:30"), 10, "A1"), (day20("08:30"), 20, "A1"))})
        self.assertEqual((end["span"]["hours"], end["changes_merged"]["value"], end["pct_per_change"]["value"]), (20.0, 1, 10.0))
        start = self.d({ULP: ul((day20("08:30"), 10, "A1"), (day20("11:30"), 20, "A1"))})
        self.assertEqual(start["changes_merged"]["value"], 0)

    def test_two_accounts_in_the_window(self):
        x = self.d({ULP: ul((day19("13:00"), 28, "A1"), (day19("14:00"), 30, "A1"), (day19("15:00"), 5, "A2"), (day19("18:00"), 9, "A2"),
                            (day20("09:00"), 31, "A1"), (day20("11:00"), 33, "A1"))})
        u = x["plan_pct_used"]
        self.assertEqual((u["value"], u["at_least"], len(u["breaks"])), (8, True, 2))   # A1 2 + A2 4 + A1 2; switches add nothing
        self.assertTrue(u["src"].startswith("at least "))
        self.assertEqual((x["pct_per_change"]["value"], x["pct_per_change"]["at_least"]), (8.0, True))

    def test_a_falling_reading_is_a_reset(self):
        x = self.d({ULP: ul((day19("13:00"), 90, "A1"), (day19("18:00"), 97, "A1"), (day20("05:00"), 2, "A1"), (day20("10:00"), 6, "A1"))})
        self.assertEqual(x["plan_pct_used"]["value"], 11)                # 7 + 4, never 7 − 95 + 4
        self.assertIn("fell 97% to 2%", x["plan_pct_used"]["breaks"][0])

    def test_a_small_fall_is_a_reset_too(self):
        x = self.d({ULP: ul((day19("13:00"), 40, "A1"), (day19("18:00"), 45, "A1"), (day20("09:00"), 43, "A1"), (day20("11:30"), 47, "A1"))})
        self.assertEqual((x["plan_pct_used"]["value"], x["plan_pct_used"]["at_least"]), (9, True))   # 5 + 4; the 2-point fall adds nothing
        self.assertIn("fell 45% to 43%", x["plan_pct_used"]["breaks"][0])

    def test_two_readings_with_the_same_time(self):
        x = self.d({ULP: ul((day20("10:00"), 30, "A1"), (day20("10:00"), 32, "A1"))})
        self.assertEqual((x["plan_pct_used"]["value"], x["span"]["hours"]), (2, 0.0))     # file order on a tie
        self.assertEqual(x["pct_per_change"]["reason"], "not measured: the readings cover only 0 h of 24")

    def test_fewer_than_two_readings(self):
        x = self.d({ULP: ul((day19("10:00"), 25, "A1"), (day20("11:30"), 40, "A1"))})
        self.assertIsNone(x["plan_pct_used"]["value"])
        self.assertEqual(x["plan_pct_used"]["reason"],
                         "not measured: 1 weekly-plan reading(s) in the last 24 h, needs 2 (tools/usage-log.sh at each check)")
        self.assertEqual(x["pct_per_change"]["reason"], x["plan_pct_used"]["reason"])
        self.assertEqual(x["span"]["basis"], "24 h")                     # no readings: deliveries over the whole window
        self.assertIsNone(self.d({ULP: ul((day19("13:00"), 50, "A1"), (day19("14:00"), 2, "A2"))})["plan_pct_used"]["value"])

    def test_zero_merges(self):
        pulls = jread(os.path.join(FIX, "github/pulls.json"))
        for p in pulls:
            if p["number"] == 109:
                p["merged_at"] = "2026-11-18T03:00:00Z"                  # BK-3 now merged before the window
        x = self.d({"github/pulls.json": pulls})
        self.assertEqual(x["changes_merged"]["value"], 0)
        self.assertIsNone(x["pct_per_change"]["value"])
        self.assertEqual(x["pct_per_change"]["reason"], "no Release 1 changes merged (12% of a weekly plan used)")

    def test_malformed_lines_left_out_and_listed(self):
        log = FIXLOG + "2026-11-20T10:00:00+05:30\tabc\tA1\tLead 50\n2026-11-20T10:10:00+05:30\t38\tA1\n" \
                       "20 Nov 10:20\t39\tA1\tLead 50\n2026-11-20T10:30:00\t39\tA1\tLead 50\n"
        s, c = run(snap_with({ULP: log}))
        u = c["pace"]["delivery_24h"]["plan_pct_used"]
        self.assertEqual(u["value"], 12)                                 # the good lines only
        self.assertEqual([b["line"] for b in u["bad_lines"]], [8, 9, 10, 11])
        self.assertIn("not a whole number", u["bad_lines"][0]["why"])
        self.assertIn("3 fields", u["bad_lines"][1]["why"])
        self.assertIn("is not ISO", u["bad_lines"][2]["why"])
        self.assertIn("no UTC offset", u["bad_lines"][3]["why"])
        self.assertTrue(any(n.startswith("usage-log.tsv: lines left out") for n in c["trust"]["notes"]))
        self.assertEqual(cd.parse_usage_log("2026-11-20T10:00:00+05:30\t101\tA1\tL\n")[1][0]["line"], 1)   # over 100
        self.assertEqual(cd.parse_usage_log("2026-11-20T10:00:00+05:30\t0050\tA1\tL\n")[1][0]["line"], 1)  # 4 digits

    def test_one_rule_for_done_and_needed(self):
        # qa id column: row 1 is proven when C7.1 first reads Works (bbb222, moved to 20 Nov 06:30 IST); row 6 reads qa Works
        # from the checklist commit of 20 Nov 07:30 IST. Both reached qa Works inside the span and the 24 h.
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| Map | Capability | Module | BACKLOG rows | Status |",
                                                           "| Map | Capability | Module | BACKLOG rows | Status | qa id |")
        ck = ck.replace("| 1 | Cap one | Platform | PF-1 | Merged |", "| 1 | Cap one | Platform | PF-1 | Merged | C7.1 |")
        hist = '{"sha": "aaa111", "date": "2026-11-15T03:00:00Z"}\n{"sha": "bbb222", "date": "2026-11-20T01:00:00Z"}\n'
        pl = json.loads(cd.Snap(FIX).file("cockpit/plan.json"))
        pl["dates"][0].update(kind="committed", date="2026-12-08", date_to="2026-12-10")
        plp = "files/" + cd.REL + "/cockpit/plan.json"
        x = self.d({CKP: ck, "git/capabilities_main.jsonl": hist, plp: pl})
        self.assertEqual((x["works_rows"]["value"], x["works_rows"]["maps"]), (2, [1, 6]))
        self.assertEqual(x["pct_per_works_row"]["value"], 6.0)
        self.assertEqual(x["rows_done_per_day"]["maps"], [1, 6])
        # 8 Build rows; rows 1 (proven) and 6 (Status) are at qa Works → 6 left ÷ 20 days (20 Nov → 10 Dec)
        self.assertEqual((x["rows_needed_per_day"]["value"], x["rows_needed_per_day"]["rows_left"]), (0.3, 6))
        x0 = self.d({plp: pl})                                           # no qa column: the Status alone, for both
        self.assertEqual((x0["rows_done_per_day"]["value"], x0["rows_needed_per_day"]["value"]), (1, 0.35))

    def test_checklist_history_missing(self):
        x = self.d({"git/checklist_records.jsonl": ""})
        self.assertIsNone(x["works_rows"]["value"])
        self.assertIn("earlier versions", x["works_rows"]["reason"])
        self.assertIsNone(x["rows_done_per_day"]["value"])
        self.assertEqual(x["pct_per_works_row"]["reason"], x["works_rows"]["reason"])

    def test_reconcile_agrees_on_the_fixtures(self):
        rec = os.path.join(HERE, "cockpit-reconcile.py")
        pl = json.loads(cd.Snap(FIX).file("cockpit/plan.json"))
        pl["dates"][0].update(kind="committed", date="2026-12-10", date_to=None)
        variants = [FIX,
                    snap_with({"files/" + cd.REL + "/cockpit/plan.json": pl,
                               ULP: ul((day19("13:00"), 90, "A1"), (day19("18:00"), 97, "A1"), (day20("05:00"), 2, "A1"), (day20("10:00"), 6, "A2"))}),
                    snap_with({ULP: ul((day20("05:00"), 20, "A1"), (day20("11:00"), 26, "A1"))}),
                    snap_with({ULP: ul((day19("12:30"), 10, "A1"), (day20("08:30"), 20, "A1"))}),
                    snap_with({ULP: ul((day19("13:00"), 10, "A1"), (day20("11:00"), "0050", "A1"))})]   # 4 digits: left out by both
        for d in variants:
            out, note = cd.run_reconcile(d, rec)
            self.assertIsNone(note)
            _, c = run(d, rec=out, note=None)
            self.assertEqual((c["trust"]["state"], c["trust"]["compared"], c["trust"]["diffs"]), ("agree", 55, []))   # 36 + P-644's 13 Flow counts + A133's 4 + A134's 2


BLP = "files/" + cd.REL + "/BACKLOG.md"
CK1 = "git/checklist_records/ck0001.md"


class TopNumbers(unittest.TestCase):
    """Board v53 (A69, amended by A70): Works today against 10 with S/M/L, plan % per Works capability, lanes working against
    started, capability sizes and requirements, rules caught inside Health item 4. The IST day of taken_at is 20 Nov:
    [20 Nov 00:00 IST = 19 Nov 18:30Z, 20 Nov 12:00 IST]."""
    def tn(self, changes=None, **kw):
        return run(snap_with(changes) if changes else FIX, **kw)[1]

    def test_size_rule_counts_backlog_rows(self):
        r = lambda ids, st="Shaped": {"ids": ids, "status": st}
        self.assertEqual([cd.cap_size(r(x)) for x in (["A-1"], ["A-1", "A-2"], ["A-1", "A-2", "A-3"], ["A-1", "A-2", "A-3", "A-4"], [])],
                         ["S", "M", "M", "L", "not shaped"])
        self.assertEqual(cd.cap_size(r(["A-1", "A-1"])), "S")                 # distinct ids
        self.assertEqual(cd.cap_size(r(["A-1", "A-2"], "Not shaped")), "not shaped")
        self.assertEqual(cd.cap_size(r(["A-1"], "Not shaped yet")), "not shaped")    # one rule in both scripts: starts "Not shaped"
        c = self.tn()
        # map 1 PF-1 S · 2 PF-2, PF-3 M · 3 Not shaped · 4 FO-1 S · 5 Not shaped · 6 no backlog row (C6.2 only) · 7 BK-1..3 M · 8 FO-4 S
        self.assertEqual({x["map"]: x["size"] for x in c["capability_table"]["rows"]},
                         {1: "S", 2: "M", 3: "not shaped", 4: "S", 5: "not shaped", 6: "not shaped", 7: "M", 8: "S"})
        self.assertEqual(c["capability_table"]["by_size"]["value"], {"S": 3, "M": 2, "L": 0, "not shaped": 3})

    def test_works_today_on_the_fixture_and_missing_size(self):
        w = self.tn()["top_numbers"]["works_today"]
        # row 6 reads qa Works from ck0002 (20 Nov 02:00Z = 07:30 IST); before the day (ck0001, 17 Nov) it read Merged.
        # Row 6 cites no backlog row: its size is "not shaped", never inferred.
        self.assertEqual((w["value"], w["maps"], w["class"], w["target"]), (1, [6], "parsed", 10))
        self.assertEqual(w["by_size"], {"S": 0, "M": 0, "L": 0, "not shaped": 1})
        self.assertEqual(w["window"], {"from": "2026-11-20T00:00:00+05:30", "to": "2026-11-20T12:00:00+05:30"})

    def test_works_today_size_mix(self):
        # rows 7 (now BK-1 to BK-4: L) and 8 (FO-4: S) also reach qa Works today; ck0002 already shows them Merged/Shaped
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| BK-1 to BK-3 | Merged |", "| BK-1 to BK-4 | qa Works |") \
            .replace("| FO-4 | Shaped |", "| FO-4 | qa Works |")
        w = self.tn({CKP: ck})["top_numbers"]["works_today"]
        self.assertEqual((w["value"], w["maps"]), (3, [6, 7, 8]))
        self.assertEqual(w["by_size"], {"S": 1, "M": 0, "L": 1, "not shaped": 1})

    def test_day_window_edges(self):
        ck2 = cd.Snap(FIX).text("git/checklist_records/ck0002.md")
        def at(when):
            return self.tn({"git/checklist_records.jsonl": '{"sha": "ck0001", "date": "2026-11-17T00:00:00Z"}\n'
                            '{"sha": "ckx", "date": "%s"}\n' % when, "git/checklist_records/ckx.md": ck2})
        late = at("2026-11-19T18:29:59Z")                                   # 19 Nov 23:59:59 IST: yesterday
        self.assertEqual(late["top_numbers"]["works_today"]["value"], 0)
        self.assertEqual(late["pace"]["delivery_24h"]["rows_done_per_day"]["value"], 1)   # still inside the rolling 24 h
        self.assertEqual(at("2026-11-19T18:30:00Z")["top_numbers"]["works_today"]["maps"], [6])   # 00:00:00 IST: today
        self.assertEqual(at("2026-11-20T06:30:00Z")["top_numbers"]["works_today"]["maps"], [6])   # at taken_at: counted
        none = self.tn({"git/checklist_records.jsonl": '{"sha": "ck0002", "date": "2026-11-20T02:00:00Z"}\n'})
        w = none["top_numbers"]["works_today"]                               # history starts after midnight: not measured
        self.assertEqual((w["value"], w["by_size"]), (None, None))
        self.assertIn("earlier versions", w["reason"])

    def test_zero_works_reads_no_works_yet(self):
        c = self.tn({CK1: cd.Snap(FIX).text("git/checklist_records/ck0002.md")})   # row 6 already qa Works on 17 Nov
        t = c["top_numbers"]
        self.assertEqual(t["works_today"]["value"], 0)
        self.assertIsNone(t["pct_per_works"]["value"])                         # never infinity
        self.assertEqual(t["pct_per_works"]["reason"], "no Works yet: 12% used")
        self.assertEqual((t["pct_per_change"]["value"], t["pct_per_works"]["class"]), (12.0, "reported"))
        self.assertEqual(t["pct_per_works"], c["pace"]["delivery_24h"]["pct_per_works_row"])
        self.assertEqual(self.tn()["top_numbers"]["pct_per_works"]["value"], 12.0)   # 12% ÷ 1 capability (row 6)

    def test_lanes_working_started_idle(self):
        L = self.tn()["top_numbers"]["lanes"]
        # working: claude/bk-6 (pushed 30 min before taken_at). Started: FO-1, BK-6, FO-4 and qa lanes (Old lane is done).
        # Idle: FO-1 (claude/fo-1 pushed 3.5 h ago), FO-4 and qa (no branch found).
        self.assertEqual((L["working"]["value"], L["started"]["value"], L["idle"]["value"]), (1, 4, 3))
        self.assertEqual((L["working"]["class"], L["started"]["class"], L["idle"]["class"]), ("measured", "reported", "reported"))
        self.assertEqual(L["idle"]["names"], ["FO-1 lane", "FO-4 lane (no branch found)", "qa lane (no branch found)"])
        br = jread(os.path.join(FIX, "github/branches_recent.json"))
        next(b for b in br if b["name"] == "claude/fo-1")["pushed_at"] = "2026-11-20T05:30:00Z"
        L2 = self.tn({"github/branches_recent.json": br})["top_numbers"]["lanes"]
        self.assertEqual((L2["working"]["value"], L2["idle"]["value"]), (2, 2))
        li = jread(os.path.join(FIX, "lead-input.json"))
        li["as_of"] = "2026-11-20T09:00:00+05:30"
        L3 = self.tn({"lead-input.json": li})["top_numbers"]["lanes"]
        self.assertEqual((L3["started"]["value"], L3["started"]["reason"]), (None, "not measured: Lead input 3.0 h old (limit 2 h)"))
        self.assertIsNone(L3["idle"]["value"])
        L4 = run(snap_with(drop=["lead-input.json"]))[1]["top_numbers"]["lanes"]
        self.assertEqual((L4["working"]["value"], L4["started"]["reason"]), (1, "not measured: no Lead input"))

    def test_requirements_column(self):
        self.assertEqual(cd.source_ids("| x | Source: AG-4-16, SA11-D8; P-574 |"), ["AG-4-16", "SA11-D8", "P-574"])
        self.assertEqual(cd.source_ids("· Source: P-579; Code SOR/2022-128 s. 24(2)(a) (laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, "
                                       "read 13 Nov 2026; Unconfirmed: no counsel) |"), ["P-579"])
        self.assertEqual(cd.source_ids("Source: AG-4-16, AG-4-16; AG-4-17/AG-4-18 (rev (2) AG-5-10) MVP-CHECKLIST.md, P-1."),
                         ["AG-4-16", "AG-4-17", "AG-4-18", "P-1"])          # once each; "/" splits; nested brackets gone; a file name is no id
        self.assertEqual(cd.source_ids("| a · Source: AG-1-1 · waits on: PF-2 |"), ["AG-1-1"])   # the field ends at the next "·"
        self.assertEqual(cd.source_ids("Source: E-signature research, a P-decision id, AG-2-8a, AG05-D4"), ["AG-2-8a", "AG05-D4"])
        self.assertEqual([cd.req_section(x) for x in ("AG-4-16", "SA-11-25", "SA11-D8", "P-574", "NFR5-14")], ["AG-4", "SA-11", "SA11", "P", "NFR5"])
        bl = cd.Snap(FIX).file("BACKLOG.md").replace("**Row PF-1:** a fixture row", "**Row PF-1:** a fixture row · Source: AG-4-16, SA-11-25; P-574") \
            .replace("**Row PF-3:** a fixture row", "**Row PF-3:** a fixture row · Source: AG-4-17, AG-4-16 (see AG-9-9)")
        bl = bl.replace("| PF-4 | lane | **Row PF-4:** a fixture row · **waits on:** nothing · decisions: none | done when it passes |",
                        "| PF-4 | lane | **Row PF-4:** a fixture row | done when Source: AG-7-7 is read |")   # Done when is never read
        t = self.tn({BLP: bl})["capability_table"]
        rows = {x["map"]: x for x in t["rows"]}
        self.assertEqual(rows[1]["req_by_section"], {"AG-4": ["AG-4-16"], "SA-11": ["SA-11-25"], "P": ["P-574"]})
        self.assertEqual(rows[2]["req"], ["AG-4-17", "AG-4-16"])               # the union over PF-2 and PF-3; bracketed id left out
        self.assertEqual((t["not_mapped"]["value"], t["not_mapped"]["maps"]), (6, [3, 4, 5, 6, 7, 8]))

    def test_rules_caught_fold_into_health_item_4(self):
        def h4(changes=None, drop=()):
            s, c = run(snap_with(changes, drop))
            return c["rules_caught"], next(i for i in cd.health(s, NOW, c, s.j("lead-input.json"))["items"] if i["id"] == 4)
        rc, it = h4()
        # fixture: the label-guard comment at 19 Nov 23:59:59 IST is yesterday; the other quotes it mid-text; the CI failure is a suite
        self.assertEqual([rc[k]["value"] for k in ("label_guard_removals", "ci_rule_failures", "breaches_found", "push_guard_refusals")], [0, 0, 0, 0])
        self.assertEqual(it["state"], "green")
        self.assertTrue(it["detail"].endswith("; rules caught today: none"))
        cm = jread(os.path.join(FIX, "github/issue_comments_today.json"))
        cm["comments"].append({"id": 9004, "pr": 116, "created_at": "2026-11-19T18:30:00Z", "bot": True, "head": "**Label guard:** `review: approved` removed."})
        cm["comments"].append({"id": 9006, "pr": 118, "created_at": "2026-11-20T02:00:00Z", "bot": False,
                               "head": "**Label guard:** a person typing the guard's words"})   # not the guard: never counted
        cm["comments"].append({"id": 9005, "pr": 118, "created_at": "2026-11-20T06:31:00Z", "bot": True, "head": "**Label guard:** after taken_at"})
        ci = jread(os.path.join(FIX, "github/ci_failed_runs_today.json"))
        ci["runs"] += [{"id": 502, "attempt": 2, "created_at": "2026-11-20T03:00:00Z", "head_branch": "claude/fo-7", "prs": [116],
                        "failed_steps": [{"job": "ci", "step": "notes check 1 of 2, rules files (check-docs.sh)"}]},
                       {"id": 503, "attempt": 1, "created_at": "2026-11-20T04:00:00Z", "head_branch": "claude/fo-1", "prs": [105],
                        "failed_steps": [{"job": "shard (1)", "step": "rules files, decision impact, graph, official PDFs"}]},
                       {"id": 504, "attempt": 1, "created_at": "2026-11-19T18:00:00Z", "head_branch": "x", "prs": [],
                        "failed_steps": [{"job": "ci", "step": "notes check 1 of 2, rules files (check-docs.sh)"}]}]
        li = jread(os.path.join(FIX, "lead-input.json"))
        li["breaches_found"] = 1
        rc, it = h4({"github/issue_comments_today.json": cm, "github/ci_failed_runs_today.json": ci, "lead-input.json": li})
        self.assertEqual((rc["label_guard_removals"]["value"], rc["label_guard_removals"]["prs"]), (1, [116]))   # 00:00 IST counts
        self.assertEqual(rc["ci_rule_failures"]["value"], 1)                     # 502 (check-docs step); 504 is yesterday
        self.assertEqual(rc["ci_bundle_failures"]["value"], 1)                   # 503: shard 1's rules-files step (17 commands)
        self.assertEqual(it["state"], "amber")
        self.assertIn("rules caught today: label-guard removals 1 (#116); check-docs CI failures 1 (#116); "
                      "rules-and-tools CI step failures (check-docs.sh + 16 other checks) 1 (#105); breaches found (Lead-reported) 1", it["detail"])
        self.assertEqual(it["class"], "measured")
        li3 = jread(os.path.join(FIX, "lead-input.json"))
        li3["breaches_found"] = 2
        rc, it = h4({"lead-input.json": li3})                                  # lit by a Lead-reported count alone
        self.assertEqual((it["state"], it["class"]), ("amber", "reported"))
        li4 = jread(os.path.join(FIX, "lead-input.json"))
        li4["as_of"] = "2026-11-20T09:00:00+05:30"
        rc, it = h4({"lead-input.json": li4})
        self.assertIn("breaches found: not updated: Lead input 3.0 h old (limit 2 h)", it["detail"])
        rc, it = h4(drop=["github/issue_comments_today.json"])
        self.assertEqual((rc["label_guard_removals"]["value"], it["state"]), (None, "amber"))
        self.assertIn("not measured: label-guard removals: not measured: the PR comments of today were not read", it["detail"])
        li2 = jread(os.path.join(FIX, "lead-input.json"))
        del li2["push_guard_refusals"]
        rc, it = h4({"lead-input.json": li2})
        self.assertEqual(rc["push_guard_refusals"]["reason"], "not reported: Lead input has no push_guard_refusals")
        self.assertEqual(it["state"], "green")                                  # a Lead-reported gap is said, not lit
        self.assertIn("(push guard refusals: not reported: Lead input has no push_guard_refusals)", it["detail"])

    def test_rest_fallback_branches(self):
        act = [{"ref": "refs/heads/claude/pf-9", "activity_type": "branch_creation", "after": "a1", "timestamp": "2026-11-20T04:30:00Z"},
               {"ref": "refs/heads/claude/fo-1", "activity_type": "push", "after": "b1", "timestamp": "2026-11-20T03:00:00Z"},
               {"ref": "refs/heads/claude/fo-1", "activity_type": "force_push", "after": "b2", "timestamp": "2026-11-20T05:00:00+00:00"},
               {"ref": "refs/heads/claude/gone", "activity_type": "push", "after": "c1", "timestamp": "2026-11-20T05:00:00Z"},
               {"ref": "refs/heads/claude/old", "activity_type": "push", "after": "d1", "timestamp": "2026-11-19T05:00:00Z"},
               {"ref": "refs/heads/claude/fo-7", "activity_type": "branch_deletion", "after": "0", "timestamp": "2026-11-20T05:00:00Z"},
               {"ref": "refs/tags/v1", "activity_type": "push", "after": "e1", "timestamp": "2026-11-20T05:00:00Z"}]
        got = cd.branches_from_activity(act, {"claude/pf-9", "claude/fo-1", "claude/old", "claude/fo-7"}, NOW - timedelta(hours=24))
        # a first push (branch_creation) counts; the newest push per branch; deleted, old, deletion events and tags do not
        self.assertEqual(sorted((x["name"], x["sha"]) for x in got), [("claude/fo-1", "b2"), ("claude/pf-9", "a1")])

    def test_reconcile_checks_the_new_counts(self):
        rec = os.path.join(HERE, "cockpit-reconcile.py")
        ck = cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| BK-1 to BK-3 | Merged |", "| BK-1 to BK-4 | qa Works |")
        bl = cd.Snap(FIX).file("BACKLOG.md").replace("**Row BK-2:** a fixture row", "**Row BK-2:** a fixture row · Source: AG-5-1 (x)")
        cm = jread(os.path.join(FIX, "github/issue_comments_today.json"))
        cm["comments"].append({"id": 9004, "pr": 116, "created_at": "2026-11-19T18:30:00Z", "bot": True, "head": "**Label guard:** removed"})
        cm["comments"].append({"id": 9006, "pr": 118, "created_at": "2026-11-20T02:00:00Z", "bot": False, "head": "**Label guard:** typed"})
        ci = jread(os.path.join(FIX, "github/ci_failed_runs_today.json"))
        ci["runs"].append({"id": 502, "attempt": 1, "created_at": "2026-11-20T03:00:00Z", "head_branch": "b", "prs": [1],
                           "failed_steps": [{"job": "ci", "step": "notes check 1 of 2, rules files (check-docs.sh)"}]})
        for d in (snap_with({CKP: ck, BLP: bl, "github/issue_comments_today.json": cm, "github/ci_failed_runs_today.json": ci}),
                  snap_with({CK1: cd.Snap(FIX).text("git/checklist_records/ck0002.md")}),
                  snap_with({BLP: cd.Snap(FIX).file("BACKLOG.md").replace("**Row BK-1:** a fixture row", "**Row BK-1:** x · Source: (rev (2) AG-5-10)")
                             .replace("| FO-4 | lane | **Row FO-4:** a fixture row · **waits on:** PF-1 · decisions: none | done when it passes |",
                                      "| FO-4 | lane | **Row FO-4:** x · Source: MVP-CHECKLIST.md | done when Source: AG-7-7 |")
                             .replace("**Row PF-1:** a fixture row", "**Row PF-1:** x · Source: AG-4-16/AG-4-17"),
                             CKP: cd.Snap(FIX).file("MVP-CHECKLIST.md").replace("| C6.2 Works | qa Works\\* |", "| C6.2 Works; FO-1 | qa Works\\* |")}),
                  snap_with(drop=["github/issue_comments_today.json", "github/ci_failed_runs_today.json"])):
            out, note = cd.run_reconcile(d, rec)
            self.assertIsNone(note)
            _, c = run(d, rec=out, note=None)
            self.assertEqual((c["trust"]["state"], c["trust"]["diffs"]), ("agree", []), c["trust"]["diffs"])
        k = c["keys"]
        self.assertEqual((k["label_guard_removals_today"], k["ci_rule_failures_today"], k["ci_bundle_failures_today"]), (None, None, None))
        theirs = {"numbers": {"works_today": {"value": 5}}}
        self.assertEqual(cd.reconcile_compare(k, theirs, None)["banner"], "Numbers disagree: works_today")

class UsageLogScript(unittest.TestCase):
    """tools/usage-log.sh: refusals, names with a tab, a file with no final newline."""
    SH = os.path.join(HERE, "usage-log.sh")

    def call(self, args, f, by="Lead 50"):
        env = dict(os.environ, USAGE_LOG_FILE=f, USAGE_LOG_BY=by)
        return subprocess.run(["bash", self.SH] + args, capture_output=True, text=True, env=env, timeout=60)

    def test_appends_one_line_and_refuses_bad_input(self):
        f = os.path.join(tempfile.mkdtemp(), "u.tsv")
        self.assertEqual(self.call(["66", "A1"], f).returncode, 0)
        for bad in (["x", "A1"], ["101", "A1"], ["-3", "A1"], ["12.5", "A1"], ["1000", "A1"], ["50", "A 1"], ["50"]):
            self.assertEqual(self.call(bad, f).returncode, 2, bad)
        r = self.call(["50", "A1"], f, by="Lead\t50")
        self.assertEqual(r.returncode, 2)
        self.assertIn("tab or a line break", r.stderr)
        readings, bad = cd.parse_usage_log(open(f).read())
        self.assertEqual(([(x["pct"], x["account"], x["by"]) for x in readings], bad), ([(66, "A1", "Lead 50")], []))
        self.assertRegex(readings[0]["time"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30$")

    def test_file_with_no_final_newline(self):
        f = os.path.join(tempfile.mkdtemp(), "u.tsv")
        with open(f, "w") as fh:
            fh.write(UL_HDR + "2026-11-14T15:45:00+05:30\t53\tA1\tLead 45")       # no final newline
        self.assertEqual(self.call(["60", "A1"], f).returncode, 0)
        readings, bad = cd.parse_usage_log(open(f).read())
        self.assertEqual(([x["pct"] for x in readings], bad), ([53, 60], []))


class TeamByComponent(unittest.TestCase):
    """Board v57 (founder 15 Nov 10:2x IST): the Team tab's org view by component (FORMULAS.md › Team by component)."""
    ROWS = [{"map": 24, "cap": "Each firm's own web address", "module": "Platform", "ids": ["PF-24w"]},
            {"map": 41, "cap": "Booking", "module": "Front office (booking)", "ids": ["FO-3h"]},
            {"map": 60, "cap": "Rules", "module": "configurator", "ids": ["XY-1"]}]
    # the real BACKLOG shape of a join-and-walk row: no prefix rule, the map row is named in the Area cell (review M2)
    BL = {"J-24": "| J-24 | join and walk (map row 24; P-606) | **Join and walk for map row 24** |",
          "J-38": "| J-38 | join and walk (map row 38, 41; P-606) | x |"}

    def test_component_mapping(self):
        f = lambda row, role=None, given=None: cd.component_of(row, role, given, self.ROWS, self.BL)[0]
        self.assertEqual(f("PF-4b"), "platform")
        self.assertEqual(f("FO-1a"), "front_office")
        self.assertEqual(f("FO-7t"), "client_money")              # FO-7* before FO
        self.assertEqual(f("FO-7mv"), "client_money")
        self.assertEqual(f("AS-2c"), "front_office")              # the client copy: Lead B's (BACKLOG)
        self.assertEqual(f("AS-2cs"), "front_office")
        self.assertEqual(f("AS-1m"), "case_side")                 # the configurator's AS rows: the release holder's (review M1)
        self.assertEqual(f("AS-2d1"), "case_side")
        self.assertEqual(f("CS-W1"), "case_side")
        self.assertEqual(f("BK-17"), "case_side")
        self.assertEqual(f("AUD-1a"), "audit")
        self.assertEqual(f("CI-1"), "pipeline")
        self.assertEqual(f("TR-1"), "pipeline")
        self.assertEqual(f("Q-c613-6a"), "qa")
        self.assertEqual(f("J-24"), "platform")                   # no prefix rule: map row 24 named in its Area cell → Module Platform
        self.assertEqual(f("J-38"), "front_office")               # row 38 is not in the checklist; row 41 is (Front office)
        self.assertEqual(f("XY-1"), "case_side")                  # cited by map row 60, Module "configurator"
        self.assertIsNone(f("J-99"))                              # no BACKLOG line: not mapped
        self.assertEqual(f("retests"), "qa")                      # row text
        self.assertEqual(f("pipeline speed-up"), "pipeline")
        self.assertIsNone(f("something else"))                    # not mapped, never guessed
        self.assertEqual(f("PF-4", role="qa"), "qa")               # role before prefix
        self.assertEqual(f(None, role="desk"), "strategy_desk")
        self.assertEqual(f("PF-4", given="Client money"), "client_money")   # Lead input component wins, by name
        self.assertEqual(f("PF-4", given="client_money"), "client_money")   # or by id
        self.assertEqual(f("PF-4", given="no such part"), "platform")       # an unknown name falls back to the prefix
        self.assertEqual(cd.component_of("FO-7t")[1], "row prefix FO-7")

    def test_fixture_org_view(self):
        s, comp = run()
        K = comp["org"]["components"]
        self.assertEqual([c["id"] for c in K["items"]],
                         ["platform", "front_office", "client_money", "case_side", "audit", "pipeline", "qa", "strategy_desk"])
        by = {c["id"]: c for c in K["items"]}
        lanes = {l["name"]: l for c in K["items"] for l in c["lanes"]}
        # FO-1 lane: Lead input row FO-1, PR #105 head pushed 3.5 h before 12:00 IST → 08:30 IST, behind (over 90 min), map row 4 cites FO-1
        fo1 = lanes["FO-1 lane"]
        self.assertEqual((fo1["component"], fo1["owner"], fo1["kind"], fo1["pr"]), ("front_office", "Lead B", "cloud", 105))
        self.assertEqual(fo1["last_push_at"], "2026-11-20T08:30+05:30")
        self.assertEqual(fo1["behind"], "no push for 3.5 h (GitHub)")
        self.assertEqual(fo1["maps"], [{"map": 4, "cap": "Cap four"}])
        # BK-6 lane: branch claude/bk-6 pushed 30 min ago → 11:30 IST, not behind; BK → Case side, the tech Lead's
        bk6 = lanes["BK-6 lane"]
        self.assertEqual((bk6["component"], bk6["owner"], bk6["behind"], bk6["last_push_at"]), ("case_side", "Lead 50", None, "2026-11-20T11:30+05:30"))
        # a lane GitHub alone shows: its row from the PR title "runtime: FO-7 — …" → Client money
        g = lanes["claude/fo-7"]
        self.assertEqual((g["seen"], g["row"], g["component"], g["owner"]), ("measured only", "FO-7", "client_money", "Lead B"))
        self.assertEqual(lanes["qa lane"]["component"], "qa")
        self.assertNotIn("Old lane", lanes)                       # state done: not a lane
        self.assertEqual(by["front_office"]["maps"], [4, 8])      # FO-1 → row 4, FO-4 → row 8
        self.assertEqual(by["front_office"]["behind"], 1)
        self.assertEqual(by["front_office"]["escalation"], ["the lane", "Lead B", "Lead 50 (tech Lead)",
                                                            "the founder (only for money, a lower bar or a day or more)"])
        self.assertEqual(len(by["case_side"]["escalation"]), 3)   # the tech Lead's own: lane → tech Lead → founder
        self.assertEqual(by["audit"]["owner"]["name"], "Lead 50")         # AUD rows are the release holder's (BACKLOG; review M1)
        self.assertEqual((K["tech_lead"], K["lead_b"], K["standbys"]), ("Lead 50", "Lead B", ["Lead 51"]))
        self.assertEqual(K["unmapped"], [])
        self.assertIn("Client money: FO-7", K["prefix_legend"])           # the page shows the data's legend, never its own

    def test_release_holder_rows(self):
        bl = ("* **The release holder's rows (now copied below):** AUD-1a, AUD-1b; AS-1m, AS-2e; CS-D1.\n"
              "| AUD-1a | schema | the release holder's rows mentioned in a table row do not count |\n")
        self.assertEqual(cd.release_holder_ids(bl), {"AUD-1a", "AUD-1b", "AS-1m", "AS-2e", "CS-D1"})

    def test_lead_input_component_owner_and_idle(self):
        li = jread(os.path.join(FIX, "lead-input.json"))
        for x in li["sessions"]:
            if x["name"] == "FO-4 lane":
                x.update({"component": "Audit", "owner": "Lead 99", "idle_min": 120})
        li["sessions"].append({"name": "Odd lane", "kind": "mac", "role": "builder", "state": "running", "row": "misc work", "idle_min": 5})
        li["sessions"] = [x for x in li["sessions"] if x.get("role") != "lead-b"]
        s, comp = run(snap_with({"lead-input.json": li}))
        K = comp["org"]["components"]
        by = {c["id"]: c for c in K["items"]}
        fo4 = next(l for l in by["audit"]["lanes"] if l["name"] == "FO-4 lane")
        self.assertEqual((fo4["owner"], fo4["owner_how"], fo4["component_how"]), ("Lead 99", "Lead input owner", "Lead input component"))
        self.assertEqual(fo4["behind"], "idle 120 min (Lead input)")       # no push measured: the reported idle time decides
        self.assertEqual([l["name"] for l in K["unmapped"]], ["Odd lane"])
        self.assertIsNone(K["unmapped"][0]["behind"])
        self.assertIsNone(by["platform"]["owner"]["name"])                 # no Lead B session: not reported, with a reason
        self.assertIn("no Lead B session", by["platform"]["owner"]["reason"])


class Tooltips(unittest.TestCase):
    """Board v57: the explain block (one tooltip per number; window and n from the data; FORMULAS.md › Tooltips)."""
    @classmethod
    def setUpClass(cls):
        out = tempfile.mkdtemp()
        r = subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"),
                            "--from-snapshot", FIX, "--offline", "--no-history-write"], capture_output=True, text=True, timeout=300)
        assert r.returncode == 0, r.stderr
        cls.d = jread(os.path.join(out, "data.json"))
        cls.E = cls.d["explain"]

    def test_every_entry_complete(self):
        for k, e in self.E.items():
            for f in ("label", "what", "window", "n", "n_of", "read", "src", "class"):
                self.assertIn(f, e, k)
            self.assertIn(e["class"], ("measured", "parsed", "reported"), k)
            if e["n"] is None:
                self.assertTrue(e.get("n_reason"), k)                    # missing data: not measured, with the reason

    def test_window_and_n_from_the_data(self):
        E, d = self.E, self.d
        # pace: 7 Release 1 changes merged in the 8 IST days 13-20 Nov (Pace tests above)
        self.assertEqual((E["pace.changes_per_day"]["n"], E["pace.changes_per_day"]["window"]),
                         (7, "IST days from 13 Nov to 20 Nov, at most the last 14 (8 days)"))
        self.assertEqual(E["forecast.p85"]["n"], 8)                       # 8 daily counts sampled
        self.assertEqual(E["strip.release1"]["n"], 8)                     # 8 Build rows in the fixture checklist
        # cycle times: app PRs merged 6-20 Nov 12:00 IST: #101-104, #107-111, #114, #118 = 11 (#119 merged after taken_at)
        self.assertEqual(E["capacity.cycle_median_days"]["n"], 11)
        self.assertEqual(d["capacity"]["cycle_median_days"]["n"], 11)
        self.assertEqual(E["capacity.p85_days"]["n"], 11)
        self.assertEqual(E["capacity.older"]["n"], 3)                     # open app PRs: #105, #115, #116
        self.assertIsNone(E["capacity.qa.wait_h"]["n"])                   # the value is not measured, so no sample (review M3)
        self.assertEqual(E["capacity.review.wait_h"]["n"], 1)            # #105, its head commit time read
        # offline: merged PRs, nightly and CI runs not read → not measured, never 0 (review M4)
        self.assertIsNone(d["pipeline"]["deploy_freq"]["v"])
        self.assertIsNone(E["pipeline.deploy_freq"]["n"])
        self.assertIsNone(d["healing"]["healed_prs"]["v"])
        self.assertIsNone(E["healing.healed_prs"]["n"])
        self.assertIsNone(E["pipeline.restore_h"]["n"])
        self.assertIsNone(d["merges_per_day"]["v"])                      # 14 days of 0 would be a guess
        self.assertIsNone(E["improving.app_merges"]["n"])
        self.assertTrue(d["pipeline"]["change_fail"]["reason"].startswith("not measured: the nightly runs"))
        self.assertNotIn("None", json.dumps(E))                           # no "None" in any tooltip text
        self.assertNotIn("band", E["quality.demotions"])                  # a net-fall proxy: the compass band does not govern it (review M5)
        self.assertEqual(E["vsm.queue.wait_h"]["window"], "flow-measure's runs read")
        self.assertEqual(E["strip.health"]["n"], 7)
        self.assertEqual(E["capacity.ready_rows"]["n"], len([b for b in jread(os.path.join(FIX, "briefs.json")) if b in cd.parse_backlog(cd.Snap(FIX).file("BACKLOG.md"))["lines"]]))
        self.assertEqual(E["pace.plan_pct_used"]["n"], 4)                 # 4 usage-log readings in the 24 h
        self.assertEqual(E["health.1"]["n"], 2)                           # main_checks.json: 2 check runs
        self.assertEqual(E["strip.plan_use"]["class"], "reported")
        self.assertIn("3% or less an hour", E["strip.plan_use"]["band"])  # RULES compass, P-440
        self.assertIn("10 or more", E["pace.rows_done_per_day"]["band"])
        self.assertIsNone(E["quality.review_rounds"]["n"])                # not measured, never guessed
        self.assertIsNone(E["pipeline.queue_wait_min"]["n"])              # flow-measure not run
        self.assertTrue(E["pipeline.queue_wait_min"]["n_reason"].startswith("tools/flow-measure.py not run yet"))
        self.assertEqual(E["team.front_office.lanes"]["n"], 2)

    def test_counts_above_zero_list_their_items(self):
        """16 Nov (founder on a phone: a count with nothing behind it): every strip and top-strip count above 0 that is a
        list of things says what is behind it, and Needs you lists each item it counts."""
        E, d = self.E, self.d
        for k in ("strip.release1", "strip.health", "strip.next_date"):
            self.assertTrue(E[k].get("behind"), k)
        self.assertEqual(len(E["strip.health"]["behind"]), len(d["health"]["items"]))
        built = [r for r in d["build_rows"] if r.get("built")]
        self.assertEqual(sum(1 for z in E["strip.release1"]["behind"] if " — built " in z), min(len(built), 40))
        ny = d["summary"]["needs_you"]["v"]
        self.assertEqual(len(E["strip.needs_you"].get("behind") or []), ny)
        self.assertTrue(E["strip.needs_you"]["todo"])
        lanes = (d.get("top_numbers") or {}).get("lanes") or {}
        if (lanes.get("working") or {}).get("value"):
            self.assertIn("top.lanes", E)
            self.assertTrue(any(z.startswith("working: ") for z in E["top.lanes"]["behind"]))

    def test_needs_lines_one_per_item(self):
        ny = {"items": [{"id": "A9", "line": "pick the logo", "by": "2026-11-20"}, {"id": "F3", "line": "sign the lease"}]}
        self.assertEqual(cd.needs_lines(ny), ["A9: pick the logo — by 2026-11-20", "F3: sign the lease"])
        self.assertEqual(cd.needs_lines({}), [])

    def test_page_stale_banner_and_panel_order(self):
        """A view left open says plainly it is old and to reload (amber from 45 min); the strip keeps the data time in IST;
        a panel shows what to do and what is behind it before the method; an open strip panel survives the minute redraw."""
        html = open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8").read()
        self.assertIn("old: reload</b>", html)
        self.assertIn('id="fresh"', html)
        self.assertIn("<b>Data '+g+'</b>", html)
        self.assertLess(html.index("<b>What to do:</b> '+esc(e.todo)"), html.index("<dt>Counts</dt>"))
        self.assertIn("if(i>=0){var nb=s.querySelectorAll(\".ib\")[i];if(nb)tipShow(nb);}", html)
        self.assertIn("flex-wrap:nowrap;overflow-x:auto", html)            # one row of tabs on a phone
        # page-made counts list their items on tap (data-items)
        self.assertIn('querySelectorAll("[data-tip],[data-info],[data-nm],[data-items]")', html)
        self.assertEqual(html.count("mineR.map(riskLine)"), 1)              # "Who must act: You" lists Needs you items and your risks

    def test_later_open_part_is_not_merged_p639(self):
        """P-639 (16 Nov, qa #1950): a merged "PF-5 part 1" is not PF-5 while BACKLOG names a later part of it. Pass
        case: every named part merged (or one PR for the whole id). Fail case: a later part still open."""
        bl = ("| PF-5 | api | sign-up | b | c |\nThe trial end moves to PF-5 part 2; invoices are PF-5 parts 3 and 4.\n"
              "FO-7ts parts 1–2 cover the ledger; FO-7mv (part 1) is the list.\n")
        self.assertEqual(cd.backlog_parts(bl), {"PF-5": {"2", "3", "4"}, "FO-7ts": {"1", "2"}, "FO-7mv": {"1"}})
        self.assertEqual(cd.title_part("runtime: PF-5 part 1 — sign-up", "PF-5"), ["1"])
        self.assertEqual(cd.title_part("runtime: PF-5 parts 1 and 2", "PF-5"), ["1", "2"])
        self.assertIsNone(cd.title_part("runtime: PF-5 — sign-up", "PF-5"))
        self.assertIsNone(cd.title_part("runtime: PF-5s part 1", "PF-5"))                          # another id
        p1 = [("2026-11-15T10:00:00Z", 101, ["1"])]
        self.assertEqual(cd.merged_when(p1, {"2", "3", "4"}), (None, ["2", "3", "4"]))           # fail: later parts open
        allp = p1 + [("2026-11-16T10:00:00Z", 102, ["2"]), ("2026-11-16T11:00:00Z", 103, ["3", "4"])]
        self.assertEqual(cd.merged_when(allp, {"2", "3", "4"}), (("2026-11-16T11:00:00Z", 103), []))  # pass: dated by the last part
        self.assertEqual(cd.merged_when(p1, set()), (("2026-11-15T10:00:00Z", 101), []))       # pass: no other part named
        whole = [("2026-11-14T09:00:00Z", 99, None)]
        self.assertEqual(cd.merged_when(whole, set()), (("2026-11-14T09:00:00Z", 99), []))     # pass: the whole id, no part named
        self.assertEqual(cd.merged_when(whole, {"2"}), (("2026-11-14T09:00:00Z", 99), []))     # pass: shipped whole, a mentioned part does not hold it
        self.assertEqual(cd.merged_when(whole + p1, {"2"}), (None, ["2"]))                      # fail: shipped in parts, a whole-id PR does not close part 2
        # the independent check follows the same rule: map 1 (PF-1, PF-2) is built until PF-2 is only merged as part 1
        spec = importlib.util.spec_from_file_location("cockpit_reconcile_p639", os.path.join(HERE, "cockpit-reconcile.py"))
        rc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rc)
        P = "files/ai-workers/problem-1-pathway-setup-and-form-filling/product/"
        base = rc._fixture("2026-11-20T12:00:00+05:30")
        built = lambda mem: rc.compute(rc.Snapshot(mem=mem))["numbers"]["built_rows"]["value"]
        self.assertEqual(built(base), 2)
        pulls = json.loads(base["github/pulls.json"])
        for p in pulls:
            if p["number"] in (2, 3):
                p["title"] = p["title"].replace("PF-2", "PF-2 part 1")
        bl2 = base[P + "BACKLOG.md"] + "\nPF-2 part 2 is the rest.\n"
        self.assertEqual(built(dict(base, **{"github/pulls.json": json.dumps(pulls), P + "BACKLOG.md": bl2})), 1)   # fail case
        pulls.append(dict(pulls[1], number=40, title="runtime: PF-2 part 2 — rest", merged_at="2026-11-19T22:00:00Z"))
        self.assertEqual(built(dict(base, **{"github/pulls.json": json.dumps(pulls), P + "BACKLOG.md": bl2})), 2)   # pass case
        whole_only = dict(base, **{P + "BACKLOG.md": bl2})                                     # PF-2 shipped whole, a part 2 mentioned
        self.assertEqual(built(whole_only), 2)                                                    # pass: shipped whole (PF-4b, FO-3 on 16 Nov)

    def test_part_patterns_agree_in_both_scripts(self):
        """P-639: the two scripts read parts with the same pattern (they are written apart, so a test keeps them in step)."""
        src = open(os.path.join(HERE, "cockpit-reconcile.py"), encoding="utf-8").read()
        rx = re.search(r'part_rx = r"(.+)"', src).group(1)
        self.assertTrue(cd.PART_MENTION.pattern.endswith(rx))

    def test_first_screen_p636(self):
        """P-636 (founder 16 Nov): six answers in three words. Proven comes from qa's file on main only, Built = all parts
        merged or qa passed, and every answer has its explanation with what is behind it."""
        f = self.d["first"]
        self.assertEqual(set(f), {"words", "release", "today", "needs", "stuck", "choke", "health", "rule", "proven_lines", "stuck_now", "enforced"})   # A133, A134, CK-3
        self.assertIn("Only Proven counts as delivered", f["words"])
        R = f["release"]
        self.assertEqual(R["planned"], 8)                                    # 8 Build rows in the fixture checklist
        self.assertIsNone(R["proven"])                                       # the fixture's qa file has no R1 rows: not measured, never 0
        self.assertEqual(R["state"], "not measured")
        for k in ("first.release", "first.today", "first.needs", "first.stuck", "first.choke"):
            self.assertIn(k, self.E)
        self.assertEqual(f["today"]["state"], "not set")                     # no today_goal in the fixture Lead input
        self.assertTrue(f["choke"]["stage"])

    def test_first_screen_rules_on_a_small_case(self):
        d = {"freshness": {"generated_at": "2026-11-16T04:48:07Z"}, "capability_table": {"rows": [{"map": m, "cap": f"cap {m}"} for m in (1, 2, 3, 4)]},
             "build_rows": [{"map": 1, "built": "2026-11-14"}, {"map": 2, "built": None}, {"map": 3, "built": "2026-11-15"}, {"map": 4, "built": None}],
             "pace": {"committed_date": "2026-11-29"}, "forecast": {"p50": {"value": None}},
             "needs_you": {"items": [{"id": "A1", "line": "pick", "by": None, "src": "STATE"}]},
             "risks": {"items": [{"id": "C5", "risk": "no test", "owner": "founder", "trigger_date": "2026-11-16", "mitigation": "book it", "status": "open"},
                                 {"id": "C12", "risk": "no hosting", "owner": "founder", "trigger_date": None, "mitigation": "open it", "status": "open"},
                                 {"id": "C2", "risk": "walls", "owner": "tech lead", "trigger_date": "2026-11-10", "mitigation": "x", "status": "open"}]},
             "health": {"light": "red", "items": []}, "value_stream": {"stages": [{"id": "queue", "name": "Merge queue", "count": {"v": 1}}]},
             "top_numbers": {}, "lead_queue": {}, "top3": {}}
        f = cd.first_screen(d, {2: "Works", 3: "Not built", 1: "Partial"}, {"today_goal": {"proven": 3, "by": "2026-11-17T08:00:00+05:30"}}, "Lead input")
        R = f["release"]
        self.assertEqual((R["planned"], R["built"], R["proven"], R["waiting"]), (4, 3, 1, 2))   # built 1, 3 by parts + 2 by qa's pass
        self.assertEqual(R["unlisted_ids"], [4])
        self.assertEqual(R["qa_not_built_ids"], [])                                               # no qa test after the merge: Built, awaiting qa
        self.assertEqual((R["days_left"], R["need_per_day"], R["state"]), (13, 0.2, "on track"))  # 3 left in 13 days; 1 proven in 4 days
        self.assertEqual((f["today"]["short"], f["today"]["state"]), (2, "at risk"))
        # Lead 74's 09:15 input sent today_goal as words: shown as not set with the words, never a crash
        w = cd.first_screen(d, {2: "Works", 3: "Not built", 1: "Partial"}, {"today_goal": "30 Proven by 08:00 IST 18 Nov"}, "Lead input")["today"]
        self.assertEqual((w["state"], w["goal"]), ("not set", None))
        self.assertIn("30 Proven by 08:00 IST 18 Nov", w["why"])
        # review #2099: a number, a list, or a dict whose proven is words: not set with what was sent, never a crash
        for tg, shown in ((30, "30"), (["30"], "['30']"), ({"proven": "30 by 08:00"}, "30 by 08:00"), ({"proven": True}, "True")):
            w = cd.first_screen(d, {2: "Works", 3: "Not built", 1: "Partial"}, {"today_goal": tg}, "Lead input")["today"]
            self.assertEqual((w["state"], w["goal"]), ("not set", None), tg)
            self.assertIn(shown, w["why"], tg)
        w = cd.first_screen(d, {2: "Works", 3: "Not built", 1: "Partial"}, {"today_goal": {"proven": "3", "by": "2026-11-17T08:00:00+05:30"}}, "Lead input")["today"]
        self.assertEqual(w["goal"], 3)                                                         # a number sent as digits still counts
        self.assertEqual([x["id"] for x in f["needs"]["items"]], ["A1", "C5"])                   # dated today; C12 later; C2 not the founder's
        self.assertEqual([x["id"] for x in f["needs"]["later"]], ["C12"])
        self.assertEqual((f["choke"]["stage"], f["choke"]["count"]), ("Built, waiting for qa", 2))
        self.assertIsNone(cd.first_screen(d, {}, None, "x")["release"]["proven"])
        st = R["stage"]                                                       # A115: one stage per capability, the furthest first
        self.assertEqual((st["2"], st["1"], st["3"], st["4"]), ("proven", "built", "built", "planned"))
        # P-639 (Lead 66): qa's verdict decides. Row 3 reads Not built: tested after its last part merged, it is In
        # progress (qa found it unfinished); merged after qa's last test, it stays Built (awaiting qa).
        rows_after = [dict(r) for r in d["build_rows"]]
        rows_after[2].update(built_at="2026-11-15T10:00:00Z", qa_tested_at="2026-11-15T12:00:00Z")
        f2 = cd.first_screen(dict(d, build_rows=rows_after), {2: "Works", 3: "Not built", 1: "Partial"}, None, "x")["release"]
        self.assertEqual((f2["stage"]["3"], f2["qa_not_built_ids"], f2["built"]), ("in progress", [3], 2))   # fail case
        rows_after[2].update(qa_tested_at="2026-11-15T09:00:00Z")
        f3 = cd.first_screen(dict(d, build_rows=rows_after), {2: "Works", 3: "Not built", 1: "Partial"}, None, "x")["release"]
        self.assertEqual((f3["stage"]["3"], f3["qa_not_built_ids"], f3["built"]), ("built", [], 3))          # pass case: awaiting qa
        self.assertEqual(sum(R["stage_counts"].values()), R["planned"])
        self.assertEqual(f["needs"]["items"][1]["unblocks"], "the launch gate")                     # no trigger in the case: the gate
        self.assertEqual(cd.nocode("Engage counsel (P-541, founder) before the gate P-589"), "Engage counsel before the gate")
        self.assertNotIn("2026-11-16", f["needs"]["items"][1]["why"])

    def test_page_a115_two_views_stages_and_steps(self):
        """A115 (founder 16 Nov): four stage colours defined in light and both dark blocks; his view and a collapsed
        tech-lead section; info buttons in his view only where data-keep marks them; each step a status he can change."""
        html = open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8").read()
        for tok in ("--st-planned:", "--st-progress:", "--st-built:", "--st-proven:"):
            self.assertEqual(html.count(tok), 3, tok)                          # light, dark by system, dark by choice
        self.assertIn('<details class="techsec" id="tech">', html)
        self.assertIn('if(el.closest("#mine")&&!el.closest("[data-keep]"))return;', html)
        for opt in ('value="todo">To do', 'value="done">Done', 'value="not_now">Not now', 'value="talk">Talk to the Lead'):
            self.assertIn(opt, html)
        self.assertIn('return {status:a.answer==="done"?"done":"not_now",at:a.at};', html)  # old Done / Not today entries still read
        self.assertNotIn('data-ans="not_today"', html)

    def test_page_keys_all_in_explain(self):
        html = open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8").read()
        import re
        keys = set()
        for m in re.findall(r'T\("([^"]+)"\)|"(?:[a-z]+\.[a-z_0-9.]+)"(?=\)|,"|\))', html):
            keys.update(m.split())
        keys.update(k for m in re.findall(r'N\([^;]*?,"([a-z0-9_.]+)"\)', html) for k in [m])
        keys.update(re.findall(r',(?:null|B|"[^"]*"),"([a-z]+\.[a-z0-9_.]+)"\)', html))
        keys.update(re.findall(r'"",\s*"([a-z]+\.[a-z0-9_.]+)"\)', html))
        dyn = {"health.": [str(i) for i in range(1, 8)], "improving.": list(self.d["improving"]["trends"]),
               "team.": [c["id"] + ".lanes" for c in self.d["org"]["components"]["items"]],
               "vsm.": [st["id"] + x for st in self.d["value_stream"]["stages"] for x in (".count", ".wait_h")]}
        for pre, tails in dyn.items():
            self.assertIn('T("' + pre + '"+', html.replace('T("vsm."+g.id+".count vsm."+g.id+".wait_h")', 'T("vsm."+x)'), pre)
            keys.update(pre + t for t in tails)
        sections = ("strip", "pace", "forecast", "capacity", "health", "factory", "vsm", "team", "quality", "pipeline", "healing",
                    "improving", "resources", "building")       # the explain block's key families (FORMULAS.md › Tooltips)
        keys = {k for k in keys if re.match(r"^[a-z]+\.[a-z0-9_]+(\.[a-z0-9_]+)?$", k) and k.split(".")[0] in sections}
        cond = {"pace.changes_needed_per_day", "pace.ratio", "pace.built_before"}   # only when the data has them
        missing = sorted(k for k in keys if k not in self.E and k not in cond)
        self.assertEqual(missing, [])
        self.assertGreater(len(keys), 90)

    def test_schema_refuses_null_n_without_reason_and_unknown_component(self):
        sch = os.path.join(cd.P, "cockpit", "data.schema.json")
        self.assertEqual(cd.validate(self.d, sch), [])
        d1 = json.loads(json.dumps(self.d))
        del d1["explain"]["quality.review_rounds"]["n_reason"]
        self.assertTrue(cd.validate(d1, sch))
        d2 = json.loads(json.dumps(self.d))
        d2["org"]["lanes"][0]["component"] = "marketing"
        self.assertTrue(cd.validate(d2, sch))
        d3 = json.loads(json.dumps(self.d))
        del d3["explain"]["strip.health"]["window"]
        self.assertTrue(cd.validate(d3, sch))
        d4 = json.loads(json.dumps(self.d))
        d4["org"]["components"]["items"] = d4["org"]["components"]["items"][::-1]   # the component order is part of the contract
        self.assertTrue(cd.validate(d4, sch))


class NeedsYouOnlyHis(unittest.TestCase):
    """Board v61 (founder 15 Nov: "Needs you must show only what is needed from him"): an ask counts only when its status
    asks for his word or act; each item has one line and the date it names (FORMULAS.md › Needs you)."""
    STATE = ("## Founder asks\n| # | Ask (IST) | Status |\n|---|---|---|\n"
             "| A83 | library kept current | refresh the 2 behind |\n"                                   # the Lead's work: not his
             "| A84 | info icons on every page | open: v61 lane |\n"                                     # a lane's work: not his
             "| A85 | pick the launch firm | answered; nothing waits |\n"
             "| A5, A7 | earlier asks | done or superseded (Lead 52, 15 Nov; nothing waits on him); row in `history/x.md` |\n"   # STATE.md 15 Nov
             "| A88 | rename | no longer needs his word |\n"
             "| A86 | account switch | built the script; waits on the founder's word by 17 Nov |\n"
             "| A87 | budget | **Lead 54:** sized two options | needs his decision before 2026-11-19 |\n"   # 4 cells: the last is the status
             "\n## For the founder (P-390)\nF3 open: choose the demo firm by 21 Nov; F4 ruled\n")

    def test_only_items_that_need_him_with_line_and_date(self):
        asks, forf, wait = cd.state_needs(self.STATE, date(2026, 11, 15))
        self.assertEqual([a["id"] for a in asks], ["A86", "A87"])
        self.assertEqual((asks[0]["line"], asks[0]["by"]), ("waits on the founder's word by 17 Nov", "2026-11-17"))
        self.assertEqual((asks[1]["line"], asks[1]["by"]), ("needs his decision before 2026-11-19", "2026-11-19"))
        needs, _ = cd.needs_split(asks, forf, wait, [], True, "STATE.md", "g", today=date(2026, 11, 15))
        self.assertEqual(needs["count"]["v"], 3)                            # A86, A87, F3
        self.assertEqual([(i["id"], i["by"]) for i in needs["items"]], [("A86", "2026-11-17"), ("A87", "2026-11-19"), ("F3", "2026-11-21")])
        self.assertEqual(needs["items"][2]["line"], "F3 open: choose the demo firm by 21 Nov")
        self.assertTrue(all(i["line"] and "\n" not in i["line"] for i in needs["items"]))

    def test_nothing_open_and_dates(self):
        asks, forf, wait = cd.state_needs("## Founder asks\n| # | Ask | Status |\n|---|---|---|\n| A1 | x | open: v61 lane |\n", date(2026, 11, 15))
        needs, _ = cd.needs_split(asks, forf, wait, [{"n": 1, "title": "q", "age_h": 1, "src": "x"}], True, "s", "g")
        self.assertEqual((needs["count"]["v"], needs["items"]), (0, []))   # a PR question never makes an item
        self.assertIsNone(cd.due_date("no date here"))
        self.assertEqual(cd.due_date("by 3 Jan", date(2026, 11, 15)), "2027-01-03")   # the year after, not ten months back
        html = open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8").read()
        self.assertIn("Nothing needed from you", html)

    def test_fixture_keeps_a2_with_its_line(self):
        _, d = TooltipsData.data()
        self.assertEqual([(i["id"], i["line"]) for i in d["needs_you"]["items"]], [("A2", "waiting on the founder's word")])


class TooltipsData:
    _d = None

    @classmethod
    def data(cls):
        if cls._d is None:
            out = tempfile.mkdtemp()
            r = subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"),
                                "--from-snapshot", FIX, "--offline", "--no-history-write"], capture_output=True, text=True, timeout=300)
            assert r.returncode == 0, r.stderr
            cls._d = jread(os.path.join(out, "data.json"))
        return cls._d["explain"], cls._d


class EarlyBandAndLeading(unittest.TestCase):
    """Board v61 (founder A78, P-609): the early estimate band before the measured forecast, and three daily leading numbers."""
    D16 = datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc)

    def test_band_before_the_forecast(self):
        # 16 Nov 12:00 IST: full IST days 13-15 Nov merged 1, 1, 0 (Pace tests); 9 changes left.
        # low = 16 Nov + ceil(9 / 1) = 25 Nov; high = 16 Nov + ceil(9 / (2/3)) = 16 + 14 = 30 Nov
        e = run(now=self.D16)[1]["pace"]["early_band"]
        self.assertEqual((e["value"], e["confidence"], e["n"], e["counts"], e["remaining"]),
                         ({"low": "2026-11-25", "high": "2026-11-30"}, "low", 3, [1, 1, 0], 9))
        self.assertEqual(e["window"], "full IST days 13 Nov to 15 Nov (3 days)")
        self.assertIn("÷ the best full IST day", e["src"])

    def test_band_gives_way_to_the_forecast_and_needs_a_merge(self):
        e = run()[1]["pace"]["early_band"]                                   # 20 Nov: 8 days, the Monte Carlo forecast stands
        self.assertIsNone(e["value"])
        self.assertEqual(e["reason"], "replaced by the measured forecast (Monte Carlo, from 17 Nov)")
        pulls = [p for p in jread(os.path.join(FIX, "github/pulls.json")) if not p.get("merged_at") or p["merged_at"] < "2026-11-06T00:00:00Z"]
        e0 = run(snap_with({"github/pulls.json": pulls}), now=self.D16)[1]["pace"]["early_band"]
        self.assertIsNone(e0["value"])
        self.assertEqual(e0["reason"], "not measured: no Release 1 change merged on a full IST day yet")

    def test_committed_date_carried(self):
        pl = json.loads(cd.Snap(FIX).file("cockpit/plan.json"))
        pl["dates"][0].update(kind="committed", date="2026-11-29", date_to=None)
        e = run(snap_with({"files/" + cd.REL + "/cockpit/plan.json": pl}), now=self.D16)[1]["pace"]["early_band"]
        self.assertEqual(e["committed"], "2026-11-29")

    def test_parts_and_capabilities_daily(self):
        L = run()[1]["pace"]["leading"]
        # 20 Nov: last full IST day 19 Nov merged 0 parts; today BK-3 (1). Built rows 4 (1: 14, 2 and 8: 18, 7: 20 Nov).
        p, c = L["parts_merged"], L["caps_all_parts"]
        self.assertEqual((p["value"], p["day"], p["today_so_far"]), (0, "2026-11-19", 1))
        self.assertEqual([x["count"] for x in p["series"]], [1, 1, 0, 2, 0, 2, 0, 1])
        self.assertEqual((c["value"], c["new_on_day"], c["today_so_far"], c["rows_total"]), (4, 0, 1, 8))
        self.assertEqual([x["count"] for x in c["series"]], [0, 1, 0, 0, 0, 2, 0, 1])

    def test_first_verdict_share(self):
        # fixture: every capability already has its status in the oldest version (15 Nov): no first verdict is known
        v = run()[1]["pace"]["leading"]["first_verdict_works_pct"]
        self.assertIsNone(v["value"])
        self.assertTrue(v["reason"].startswith("not measured"))
        # add C9.2, absent on 15 Nov and Works on 18 Nov (first verdict Works); C9.1 Not built until 19 Nov, then Partial.
        # C7.1 Partial (15) to Works (18) is not a first verdict. 2 first verdicts, 1 Works: 50%; on 19 Nov 1 verdict, 0 Works.
        base = os.path.join(FIX, "git/capabilities_main")
        a, b = open(os.path.join(base, "aaa111.md")).read(), open(os.path.join(base, "bbb222.md")).read()
        b2 = b + "| C9.2 | 9 Next | Another row | M4 | Works | abc | fixture |\n"
        c3 = b2.replace("| M4 | Not built |", "| M4 | Partial |")
        jl = ('{"sha": "aaa111", "date": "2026-11-15T03:00:00Z"}\n{"sha": "bbb222", "date": "2026-11-18T05:00:00Z"}\n'
              '{"sha": "ccc333", "date": "2026-11-19T05:00:00Z"}\n')
        d = snap_with({"git/capabilities_main.jsonl": jl, "git/capabilities_main/bbb222.md": b2, "git/capabilities_main/ccc333.md": c3})
        v = run(d)[1]["pace"]["leading"]["first_verdict_works_pct"]
        self.assertEqual((v["value"], v["works"], v["n"], v["ids"], v["day_n"], v["day_works"]), (50, 1, 2, ["C9.1", "C9.2"], 1, 0))

    def test_first_verdict_share_r1_apart(self):
        # Lead 64, 16 Nov: the Release 1 (R) share is its own number beside the C share, never mixed
        base = os.path.join(FIX, "git/capabilities_main")
        a, b = open(os.path.join(base, "aaa111.md")).read(), open(os.path.join(base, "bbb222.md")).read()
        r1 = "\n| # | Map row: capability | Module | Status | Tested on | Done when |\n|---|---|---|---|---|---|\n"
        a2 = a + r1 + "| R1.2 | 2 Database | Platform | Not built | abc | x |\n| R1.3 | 3 Files | Platform | Not built | abc | x |\n"
        b2 = b + r1 + "| R1.2 | 2 Database | Platform | Works | abc | x |\n| R1.3 | 3 Files | Platform | Partial | abc | x |\n"
        jl = '{"sha": "aaa111", "date": "2026-11-15T03:00:00Z"}\n{"sha": "bbb222", "date": "2026-11-18T05:00:00Z"}\n'
        d = snap_with({"git/capabilities_main.jsonl": jl, "git/capabilities_main/aaa111.md": a2, "git/capabilities_main/bbb222.md": b2})
        c = run(d)[1]
        r, cc = c["pace"]["leading"]["first_verdict_works_pct_r1"], c["pace"]["leading"]["first_verdict_works_pct"]
        self.assertEqual((r["value"], r["works"], r["n"], r["ids"]), (50, 1, 2, ["R1.2", "R1.3"]))
        self.assertFalse([x for x in (cc.get("ids") or []) if x.startswith("R")])     # never mixed into the C share
        self.assertIsNone(run()[1]["pace"]["leading"]["first_verdict_works_pct_r1"]["value"])

    def test_each_behind_an_explain_entry_with_window_and_n(self):
        E, d = TooltipsData.data()
        self.assertEqual((E["pace.early_band"]["n"], E["pace.early_band"]["window"]), (7, "full IST days 13 Nov to 19 Nov (7 days)"))
        self.assertEqual(E["pace.leading_parts"]["n"], 0)
        self.assertIn("IST day 2026-11-19", E["pace.leading_parts"]["window"])
        self.assertEqual(E["pace.leading_caps"]["n"], 8)
        self.assertEqual(E["pace.leading_fv"]["n"], 0)                    # no first verdict since 13 Nov: n 0, the share not measured
        self.assertIsNone(d["pace"]["leading"]["first_verdict_works_pct"]["value"])
        html = open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8").read()
        for k in ("pace.early_band", "pace.leading_parts", "pace.leading_caps", "pace.leading_fv"):
            self.assertIn('"' + k + '"', html)


class WhatsNew(unittest.TestCase):
    """G-5 (P-611): the weekly what's-new box. The fixture is taken Fri 20 Nov 12:00 IST (ISO week 2026-W47: Monday 16 Nov,
    so amber from Mon 16 Nov 12:00 IST = 06:30 UTC, red from Tue 17 Nov 12:00 IST)."""
    WN = "files/" + cd.REL + "/cockpit/whats-new.json"

    def file(self, week="2026-W47", at="2026-11-16T10:00:00+05:30", **kw):
        d = {"week": week, "checked_at": at, "checked_by": "Lead 55", "installed_version": "2.1.325", "newest_version": "2.1.325",
             "new_items": [{"title": "A", "date": "2026-11-13", "source": "https://code.claude.com/docs/en/changelog", "adopt": "yes", "why": "w"},
                           {"title": "B", "date": "2026-11-12", "source": "https://code.claude.com/docs/en/changelog", "adopt": "no", "why": "w"},
                           {"title": "C", "date": "2026-11-09", "source": "https://code.claude.com/docs/en/changelog", "adopt": "yes", "why": "w"}],
             "actions": [{"what": "x", "owner": "lead", "row": "G-5"}]}
        d.update(kw)
        return d

    def wn(self, f, now):
        s, comp = run(snap_with({} if f is None else {self.WN: f}), now=now)
        return comp

    def test_checked(self):
        comp = self.wn(self.file(), NOW)
        w = comp["whats_new"]
        self.assertEqual((w["week"], w["state"], w["checked"], w["light"]["state"]), ("2026-W47", "checked", True, "green"))
        self.assertEqual(w["adopt_yes"]["value"], 2)                       # A and C are yes; B is no
        self.assertEqual((w["adopt_yes"]["sha"], w["adopt_yes"]["class"]), ("123456789", "parsed"))
        self.assertEqual(len(w["items"]), 3)
        self.assertTrue(next(i for i in comp["trust"]["invariants"] if i["name"].startswith("whats-new"))["ok"])

    def test_unchecked_amber_after_monday_noon(self):
        mon_1201 = datetime(2026, 11, 16, 6, 31, tzinfo=timezone.utc)     # Mon 16 Nov 12:01 IST
        w = self.wn(self.file(week="2026-W46", at="2026-11-15T13:02:55+05:30"), mon_1201)["whats_new"]
        self.assertEqual((w["state"], w["checked"], w["light"]["state"]), ("unchecked", False, "amber"))
        self.assertIsNone(w["adopt_yes"]["value"])                         # not checked this week: no count, never 0
        self.assertIn("the file is for 2026-W46", w["adopt_yes"]["reason"])
        mon_1159 = datetime(2026, 11, 16, 6, 29, tzinfo=timezone.utc)     # before Monday 12:00 IST: grey, not yet due
        self.assertEqual(self.wn(self.file(week="2026-W46", at="2026-11-15T13:02:55+05:30"), mon_1159)["whats_new"]["light"]["state"], "grey")

    def test_unchecked_red_after_tuesday_noon(self):
        w = self.wn(self.file(week="2026-W46", at="2026-11-15T13:02:55+05:30"), NOW)["whats_new"]      # Fri 20 Nov
        self.assertEqual((w["state"], w["light"]["state"]), ("unchecked", "red"))
        tue_1159 = datetime(2026, 11, 17, 6, 29, tzinfo=timezone.utc)
        self.assertEqual(self.wn(self.file(week="2026-W46", at="2026-11-15T13:02:55+05:30"), tue_1159)["whats_new"]["light"]["state"], "amber")

    def test_missing_reads_not_checked_never_zero(self):
        comp = self.wn(None, NOW)                                          # the fixture has no whats-new.json
        w = comp["whats_new"]
        self.assertEqual((w["state"], w["checked"], w["light"]["state"]), ("missing", False, "red"))
        self.assertIsNone(w["adopt_yes"]["value"])
        self.assertTrue(w["adopt_yes"]["reason"].startswith("not checked"))
        self.assertTrue(next(i for i in comp["trust"]["invariants"] if i["name"].startswith("whats-new"))["ok"])   # missing is not a broken record

    def test_broken_file_breaks_the_invariant_and_is_not_checked(self):
        bad = self.file(checked_at="2026-11-10T10:00:00+05:30",
                        new_items=[{"title": "A", "date": "13 Nov", "source": "http://x", "adopt": "maybe", "why": "w"}])
        comp = self.wn(bad, NOW)
        w = comp["whats_new"]
        self.assertEqual((w["state"], w["items"]), ("unchecked", []))
        self.assertFalse(next(i for i in comp["trust"]["invariants"] if i["name"].startswith("whats-new"))["ok"])
        self.assertIn("not in week 2026-W47", " ".join(w["problems"]))
        self.assertEqual(self.wn("{not json", NOW)["whats_new"]["state"], "invalid")
        self.assertIsNone(cd.build_explain(dict(TooltipsData.data()[1], whats_new=self.wn("{not json", NOW)["whats_new"]))["whats_new.box"]["n"])

    def test_cli_schema_and_explain_with_the_committed_file(self):
        f = jread(os.path.join(cd.P, "cockpit", "whats-new.json"))
        self.assertEqual((f["week"], f["checked_by"]), ("2026-W46", "Lead 55"))
        out = tempfile.mkdtemp()
        sd = snap_with({self.WN: f})
        r = subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"), "--from-snapshot", sd,
                            "--offline", "--no-history-write", "--now", "2026-11-15T14:00:00+05:30"], capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stderr)
        d = jread(os.path.join(out, "data.json"))
        w = d["whats_new"]
        self.assertEqual((w["state"], w["adopt_yes"]["value"], len(w["items"]), len(w["actions"])), ("checked", 8, 16, 3))
        self.assertEqual(d["explain"]["whats_new.box"]["n"], 16)
        with open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8") as f:
            self.assertIn('"whats_new.box"', f.read())


class ReviewRounds(unittest.TestCase):
    """ENF-782b (P-782 (3)): the review-rounds slot is filled from flow-measure.py's cached answer, never guessed."""
    def test_slot_reads_flow_measure(self):
        out = tempfile.mkdtemp(); os.makedirs(os.path.join(out, "cache"))
        with open(os.path.join(out, "cache", "flow-measure.json"), "w") as f:
            json.dump({"_as_of": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                       "review_rounds": {"n": 31, "median": 1, "mean": 2.03, "over_2": 9, "over_2_share": 29.0}}, f)
        r = subprocess.run([sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(out, "data.json"),
                            "--from-snapshot", FIX, "--offline", "--no-history-write"], capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stderr)
        d = jread(os.path.join(out, "data.json"))
        q = d["quality"]["review_rounds"]
        self.assertEqual((q["v"], q["n"], q["over_2_share"]), (1, 31, 29.0))
        self.assertIn("review_rounds.median", q["src"])
        self.assertEqual(d["explain"]["quality.review_rounds"]["n"], 31)


BROWSER_CHECK = r"""// board v61 scripted check: click-only info buttons on every tab, 375 px, axe light and dark
const { chromium } = require('playwright');
const fs = require('fs');
const [,, url, axePath, shot] = process.argv;
const axe = fs.readFileSync(axePath, 'utf8');
const TABS = ['overview', 'caps', 'team', 'factory', 'launch', 'library', 'details'];
const isOn = (p) => p.$eval('#tip', (e) => e.classList.contains('on'));
(async () => {
  const b = await chromium.launch(); const fails = []; const out = [];
  for (const scheme of ['light', 'dark']) for (const w of [1280, 375]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 }, colorScheme: scheme });
    await p.goto(url); await p.waitForSelector('.tabs button');
    const tag = `${scheme} ${w}`;
    if (await p.$('#srcbar')) fails.push(`${tag}: source bar still there`);
    for (const t of TABS) {
      await p.click(`.tabs button[data-tab="${t}"]`); await p.waitForTimeout(150);
      const panel = `.tabpanel[data-panel="${t}"]`;
      const r = await p.evaluate((panel) => {
        const P = document.querySelector(panel), vis = (e) => e.getClientRects().length > 0;
        const all = [...document.querySelectorAll('.ib')];
        const marked = [...document.querySelectorAll('[data-tip],[data-info]')].filter((e) => (P.contains(e) || !e.closest('.tabpanel')) && vis(e));
        const noBtn = marked.filter((e) => {
          if (e.hasAttribute('data-nm') && e.parentElement.closest('[data-tip],[data-info]')) return false;
          return !all.some((x) => (x._els || []).includes(e));
        }).map((e) => e.outerHTML.slice(0, 90));
        return { titles: document.querySelectorAll('#body [title], #strip [title], svg title').length,
                 btns: P.querySelectorAll('.ib').length, noBtn, sw: document.documentElement.scrollWidth, iw: innerWidth,
                 bad: all.filter((x) => x.tagName !== 'BUTTON' || !x.getAttribute('aria-label') || !x.hasAttribute('aria-expanded')).length };
      }, panel);
      out.push(`${tag} ${t}: ${r.btns} buttons`);
      if (r.titles) fails.push(`${tag} ${t}: ${r.titles} hover titles`);
      if (!r.btns) fails.push(`${tag} ${t}: no info button`);
      if (r.noBtn.length) fails.push(`${tag} ${t}: ${r.noBtn.length} marks without a button: ${r.noBtn.slice(0, 3).join(' | ')}`);
      if (r.bad) fails.push(`${tag} ${t}: ${r.bad} buttons without aria`);
      if (r.sw > r.iw) fails.push(`${tag} ${t}: horizontal scroll ${r.sw} > ${r.iw}`);
      // hovering and tapping the number show nothing
      const nums = await p.$$(`${panel} [data-tip]:not(.tile):not(.kpi), ${panel} [data-info]`);
      let num = null; for (const n of nums) if (await n.isVisible()) { num = n; break; }
      if (num) {
        await num.scrollIntoViewIfNeeded(); await num.hover(); await p.waitForTimeout(100);
        if (await isOn(p)) fails.push(`${tag} ${t}: hover opened the panel`);
        await num.click({ force: true, position: { x: 1, y: 1 } }); await p.waitForTimeout(50);
        if (await isOn(p)) fails.push(`${tag} ${t}: tapping the number opened the panel`);
      }
      let btn = null; for (const x of await p.$$(`${panel} .ib`)) if (await x.isVisible()) { btn = x; break; }
      if (!btn) { fails.push(`${tag} ${t}: no visible button`); continue; }
      await btn.scrollIntoViewIfNeeded(); await btn.click();
      const txt = await p.$eval('#tip', (e) => e.textContent);
      if (!await isOn(p) || txt.length < 10) fails.push(`${tag} ${t}: click did not open the panel`);
      if (await btn.getAttribute('aria-expanded') !== 'true') fails.push(`${tag} ${t}: aria-expanded not true`);
      if (await p.evaluate(() => document.documentElement.scrollWidth) > w) fails.push(`${tag} ${t}: horizontal scroll with the panel open`);
      if (scheme === 'light' && w === 375 && t === 'overview' && shot) await p.screenshot({ path: shot });
      await p.addScriptTag({ content: axe });
      const res = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target));
      if (res.length) fails.push(`${tag} ${t}: axe ${res.join('; ')}`);
      await btn.click(); if (await isOn(p)) fails.push(`${tag} ${t}: second click did not close`);
      await btn.focus(); await p.keyboard.press('Enter');
      if (!await isOn(p)) fails.push(`${tag} ${t}: Enter did not open`);
      await p.keyboard.press('Escape');
      if (await isOn(p)) fails.push(`${tag} ${t}: Esc did not close`);
      if (!await btn.evaluate((x) => document.activeElement === x)) fails.push(`${tag} ${t}: focus not back on the button`);
      await btn.click(); await p.mouse.click(w - 5, 5);
      if (await isOn(p)) fails.push(`${tag} ${t}: click outside did not close`);
    }
    await p.close();
  }
  await b.close();
  console.log(out.filter((x) => x.startsWith('light 1280')).join('\n'));
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'OK: every tab, light and dark, 1280 and 375');
  process.exit(fails.length ? 1 : 0);
})();
"""


class BehaviourPartsCustomer(unittest.TestCase):
    """Board v63 (P-613, P-615): parts merged of all Release 1 parts; the founder's behaviour numbers; the Customer box.
    Fixture, today 20 Nov IST: STATE Founder asks A1-A3 undated, A4-A6 '19 Nov asks', A7 '(20 Nov, typed)', A8 '(18 Nov, spoken)';
    git/rules_log.jsonl r1 19 Nov 09:30, r2 20 Nov 01:30, r3 19 Nov 00:30, r4 20 Nov 08:30 IST; DECISIONS P-5 (12 Nov) to P-9 (20 Nov);
    checklist section C: C1 Not started, C2 counsel Not started, C3 Done, C4 counsel Done."""

    def test_parts_merged_of_all_parts(self):
        # parts cited: PF-1, PF-2, PF-3, PF-4, FO-1, FO-2, FO-3, BK-1, BK-2, BK-3, FO-4 = 11. Merged non-records PR titles name
        # PF-1, PF-2, PF-3, PF-4, BK-1, BK-2, BK-3 and FO-4 (app or not, R1b) = 8; FO-1 is only in an open PR.
        pm = run()[1]["pace"]["parts_merged"]
        self.assertEqual((pm["value"], pm["total"]), (8, 11))
        self.assertNotIn("FO-1", pm["ids"])

    def test_records_pr_never_counts_a_part(self):
        pulls = jread(os.path.join(FIX, "github/pulls.json"))
        for p in pulls:
            if p.get("merged_at") and "FO-4" in (p["title"] or ""):
                p["title"] += " (records only)"
        self.assertEqual(run(snap_with({"github/pulls.json": pulls}))[1]["pace"]["parts_merged"]["value"], 7)

    def test_founder_asks_a_day(self):
        a = run()[1]["behaviour"]["founder_asks_day"]
        # 19 Nov: A4-A6 = 3; today 20 Nov: A7 = 1; 18 Nov: A8 = 1; A1-A3 undated (3). Mean 14-19 Nov = (1 + 3) / 6 = 0.7
        self.assertEqual((a["value"], a["day"], a["today_so_far"], a["undated"], a["mean_7d"]), (3, "2026-11-19", 1, 3, 0.7))
        self.assertEqual([x["count"] for x in a["series"]], [0, 0, 0, 0, 1, 3, 1])
        self.assertIsNone(run(snap_with(drop=["files/" + cd.REL + "/STATE.md"]))[1]["behaviour"]["founder_asks_day"]["value"])
        # review Major 1: the fixture table is split by a blank line after A3 (live STATE.md after A82); both scripts read past it,
        # an impossible day ("31 Nov") is no date, and a repeated id counts once
        st = cd.Snap(FIX).file("STATE.md").replace("| A8 | 18:0x (18 Nov, spoken) older | done |\n",
                                                   "| A8 | 18:0x (18 Nov, spoken) older | done |\n| A4, A9 | 19 Nov again; 31 Nov typo | done |\n")
        d = snap_with({"files/" + cd.REL + "/STATE.md": st})
        self.assertEqual(run(d)[1]["behaviour"]["founder_asks_day"]["value"], 4)          # A4-A6 and A9
        rec = json.loads(subprocess.run([sys.executable, "-I", os.path.join(HERE, "cockpit-reconcile.py"), d],
                                        capture_output=True, text=True, timeout=300).stdout)["numbers"]
        self.assertEqual(rec["founder_asks_day"]["value"], 4)
        self.assertIsNone(cd.day_of("31 Nov typo; 40 Decisions", date(2026, 11, 20)))

    def test_rules_changes_a_day(self):
        r = run()[1]["behaviour"]["rules_changes_day"]
        self.assertEqual((r["value"], r["today_so_far"]), (2, 2))          # r1, r3 on 19 Nov; r2, r4 on 20 Nov
        r0 = run(snap_with(drop=["git/rules_log.jsonl"]))[1]["behaviour"]["rules_changes_day"]
        self.assertIsNone(r0["value"])
        self.assertTrue(r0["reason"].startswith("not measured"))

    def test_target_changes_a_week(self):
        t = run()[1]["behaviour"]["target_changes_week"]
        # P-9 (date) and P-7 (count, second bold part) count; P-8 kept; P-6 names a target with no date or count; P-5 is 12 Nov
        self.assertEqual((t["value"], t["ids"], t["window"]), (2, ["P-9", "P-7"], {"from": "2026-11-14", "to": "2026-11-20"}))
        self.assertEqual(cd.target_changes("| P-1 | 1 Nov | **Release 1 target: 24 Nov.** |", date(2026, 11, 20))[0]["day"], "2026-11-01")
        # the date must sit in the target's own clause (live P-549: "... the target's shape accepted, ... on Monday 16 Nov")
        self.assertEqual(cd.target_changes("| P-2 | 13 Nov | **Pause (his decisions: the target's shape accepted, a test on Monday 16 Nov).** |",
                                           date(2026, 11, 20)), [])

    def test_customer_box(self):
        c = run()[1]["customer"]
        self.assertIsNone(c["first_firm"]["value"])
        self.assertTrue(c["first_firm"]["reason"].startswith("not measured"))
        self.assertIsNone(c["journey_walked"]["value"])
        self.assertEqual((c["launch_done"]["value"], c["launch_done"]["total"], c["launch_done"]["ids"]), (2, 4, ["C3", "C4"]))
        self.assertEqual((c["counsel_open"]["value"], c["counsel_open"]["ids"]), (1, ["C2"]))
        pl = json.loads(cd.Snap(FIX).file("cockpit/plan.json"))
        pl["first_firm"] = {"name": "Client A", "date": "2026-12-01"}
        f = run(snap_with({"files/" + cd.REL + "/cockpit/plan.json": pl}))[1]["customer"]["first_firm"]
        self.assertEqual(f["value"], {"name": "Client A", "date": "2026-12-01"})

    def test_reconcile_agrees_on_the_eight_new_keys(self):
        rec = json.loads(subprocess.run([sys.executable, "-I", os.path.join(HERE, "cockpit-reconcile.py"), FIX],
                                        capture_output=True, text=True, timeout=300).stdout)["numbers"]
        want = {"parts_merged": 8, "parts_total": 11, "founder_asks_day": 3, "rules_changes_day": 2, "target_changes_week": 2,
                "launch_done": 2, "launch_total": 4, "counsel_open": 1}
        self.assertEqual({k: rec[k]["value"] for k in want}, want)
        self.assertEqual({k: run()[1]["keys"][k] for k in want}, want)

    def test_each_has_an_info_entry_and_a_page_key(self):
        E, d = TooltipsData.data()
        self.assertEqual((E["pace.parts_merged"]["n"], E["behaviour.asks"]["n"], E["customer.launch"]["n"]), (11, 3, 4))
        self.assertIsNone(E["customer.firm"]["n"])
        self.assertTrue(E["customer.firm"]["n_reason"].startswith("not measured"))
        html = open(os.path.join(cd.P, "cockpit", "index.html"), encoding="utf-8").read()
        for k in ("pace.parts_merged", "behaviour.asks", "behaviour.rules", "behaviour.targets", "customer.firm", "customer.journey",
                  "customer.counsel", "customer.launch"):
            self.assertIn('"' + k + '"', html)


@unittest.skipUnless(os.environ.get("AXE_JS") and shutil.which("node"), "browser check: set AXE_JS to axe.min.js (axe-core 4.10) and have Playwright for node")
class InfoIconsInBrowser(unittest.TestCase):
    """Board v61 item 1 (founder 15 Nov: "an icon ... when I click on the icon, then only it should work ... on all the pages"):
    on every tab, light and dark, 1280 and 375 px: no hover title or source bar; every marked number or block has a <button>
    with aria-label and aria-expanded; hover and tapping the number show nothing; click opens, second click, Esc (focus back)
    and a click outside close; no sideways scroll; axe 0 serious or critical with the panel open.
    Run: AXE_JS=<path>/axe.min.js NODE_PATH=$(npm root -g) python3 -m pytest -q product/tools/test_cockpit_data.py -k Browser"""
    def test_every_tab(self):
        site = tempfile.mkdtemp()
        shutil.copy(os.path.join(cd.P, "cockpit", "index.html"), site)
        for now in ("2026-11-16T12:00:00+05:30", None):          # with the early band (16 Nov) and after it (20 Nov)
            args = [sys.executable, os.path.join(HERE, "cockpit-data.py"), "--out", os.path.join(site, "data.json"),
                    "--from-snapshot", FIX, "--offline", "--no-history-write"] + (["--now", now] if now else [])
            self.assertEqual(subprocess.run(args, capture_output=True, timeout=300).returncode, 0)
            js = os.path.join(site, "check.js")
            with open(js, "w", encoding="utf-8") as f:
                f.write(BROWSER_CHECK)
            srv = subprocess.Popen([sys.executable, "-m", "http.server", "8762", "-d", site], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                import time
                time.sleep(1)
                r = subprocess.run(["node", js, "http://localhost:8762/index.html", os.environ["AXE_JS"]], capture_output=True, text=True, timeout=600)
            finally:
                srv.terminate()
            self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])


class LeadWatchBoard(unittest.TestCase):
    """B201 + P-639: the 30-minute check prints the board's own Today card and Stuck panel and checks them against the source."""
    CAPS = ("| ID | Capability | Module | Status | Main |\n|---|---|---|---|---|\n| R1.2 | 2 Database | Platform | Works | x |\n"
            "| R1.7 | 7 Roles | Platform | Not built | x |\n")
    TODAY = {"goal": 10, "by_text": "08:00 IST 17 Nov", "proven": 1, "short": 9, "waiting": 1}
    LQ = {"what": "2 pull requests wait for the Lead's answer", "items": ["#11 a (1 h)", "#12 b (4.5 h)"], "since": "oldest 4.5 h", "next": "answer each"}
    IDLE = {"what": "3 lanes idle (no push in 90 min)", "items": ["x", "y", "z"], "since": "over 90 min", "next": "wake or close each"}

    NOW = datetime(2026, 11, 16, 6, 0, tzinfo=timezone.utc)

    def board(self, stuck, today=None):
        return {"freshness": {"generated_at": "2026-11-16T05:30:00Z"},
                "first": {"today": today or self.TODAY, "release": {"waiting_ids": [7], "proven_ids": [2]}, "stuck": stuck}}

    def lines(self, d, prs=(), caps=CAPS, **kw):
        return cd.watch_lines(d, list(prs), caps, now=self.NOW, **kw)

    def test_two_stuck_entries_two_act_lines_oldest_first(self):
        out = self.lines(self.board([self.LQ, self.IDLE]), [{"number": 11}, {"number": 12}], self.CAPS)
        acts = [x for x in out if x.startswith("ACT   stuck: ")]
        self.assertEqual(len(acts), 2)
        self.assertTrue(acts[0].startswith("ACT   stuck: 2 pull requests wait for the Lead's answer — #12 b (4.5 h); #11 a (1 h)"), acts[0])
        self.assertTrue(acts[1].endswith("— next: wake or close each"), acts[1])
        self.assertIn("board vs source: 3 checked · 0 disagree · not checked here: 3 lanes idle (no push in 90 min)", out)

    def test_empty_stuck_no_act(self):
        out = self.lines(self.board([]), [], self.CAPS)
        self.assertFalse([x for x in out if x.startswith("ACT")], out)

    def test_today_line_is_the_today_card(self):
        self.assertEqual(cd.watch_today_line(self.TODAY), "today  1 of 10 Proven by 08:00 IST 17 Nov, 9 short, 1 Built waiting for qa")
        self.assertIn("no proving goal set", cd.watch_today_line({"goal": None, "proven": 1, "waiting": 0}))

    def test_board_says_waits_source_says_merged(self):
        out = self.lines(self.board([self.LQ]), [{"number": 11}], self.CAPS, pr_state=lambda n: {12: "merged"}.get(n))
        dis = [x for x in out if x.startswith("ACT   board vs source disagree")]
        self.assertEqual(dis, ["ACT   board vs source disagree: #12 waits for the Lead's answer — board says open and waiting, "
                               "source says merged — fix the script or the board row"])

    def test_not_built_item_that_qa_reads_works(self):
        nb = {"what": "1 Built capabilities that qa's file still reads Not built", "items": ["R1.2 Database"], "next": "qa"}
        out = self.lines(self.board([nb]), [], self.CAPS)
        self.assertTrue(any("disagree: R1.2 reads Not built — board says Not built, source says qa reads Works" in x for x in out), out)

    def test_stale_or_undated_board_is_an_act(self):
        d = dict(self.board([]), freshness={"generated_at": "2026-11-16T01:00:00Z"})
        self.assertTrue(self.lines(d)[1].startswith("ACT   board data 5.0 h old (over 2 h): refresh the board"), self.lines(d))
        self.assertFalse([x for x in cd.watch_lines(d, [], self.CAPS, now=datetime(2026, 11, 16, 2, 0, tzinfo=timezone.utc)) if x.startswith("ACT")])
        self.assertTrue(any(x.startswith("ACT   board data has no generated_at") for x in self.lines(dict(self.board([]), freshness={}))))
        self.assertTrue(any(x.startswith("ACT   board data has no generated_at") for x in
                            self.lines(dict(self.board([]), freshness={"generated_at": "2026-11-16T05:30:00"}))))   # no timezone: age not known

    def test_empty_qa_file_is_not_checked_never_a_disagree(self):
        out = self.lines(self.board([]), caps="\n")
        self.assertFalse([x for x in out if "disagree:" in x], out)
        self.assertIn("not checked here: Today (qa/CAPABILITIES.md on main not read)", out[-1])

    def test_proven_ids_checked_not_a_second_count(self):
        caps = self.CAPS + "| R1.50 | 50 Extra | Platform | Works | x |\n"      # an R1 row outside the plan: not a disagree
        self.assertFalse([x for x in self.lines(self.board([]), caps=caps) if "disagree" in x and x.startswith("ACT")])
        d = self.board([]); d["first"]["release"]["proven_ids"] = [7]
        self.assertTrue(any("Today Proven — board says 1, source says qa does not read Works for R1.7" in x for x in self.lines(d)))

    def test_failed_or_capped_lookup_is_not_checked(self):
        lq = dict(self.LQ, items=[f"#{n} x (1 h)" for n in range(20, 26)])
        calls = []
        out = self.lines(self.board([lq]), pr_state=lambda n: calls.append(n))
        self.assertEqual(len(calls), cd.WATCH_LOOKUPS)
        self.assertFalse([x for x in out if "disagree" in x and x.startswith("ACT")], out)
        self.assertIn("#20, #21, #22, #23, #24, #25 not open and state not read", out[-1])

    def test_by_time_reads_like_the_board(self):
        self.assertIn("by 17 Nov, 08:00 IST,", cd.watch_today_line({"goal": 10, "by": "2026-11-17T02:30:00Z", "proven": 1, "short": 9, "waiting": 1}))

    def test_real_first_screen_output(self):
        """The check reads first_screen's own output (now on main, P-636): its Stuck entries become ACT lines one for one,
        the today line carries the Today card's numbers, and qa's file on main agrees with it."""
        d = {"freshness": {"generated_at": "2026-11-16T05:30:00Z"}, "capability_table": {"rows": [{"map": m, "cap": f"cap {m}"} for m in (1, 2, 3, 4)]},
             "build_rows": [{"map": 1, "built": "2026-11-14"}, {"map": 2, "built": None}, {"map": 3, "built": "2026-11-15"}, {"map": 4, "built": None}],
             "pace": {"committed_date": "2026-11-29"}, "forecast": {"p50": {"value": None}}, "needs_you": {"items": []}, "risks": {"items": []},
             "health": {"light": "green", "items": []}, "value_stream": {"stages": []}, "top3": {},
             "top_numbers": {"lanes": {"idle": {"names": ["FO-1 lane"], "src": "x"}}},
             "lead_queue": {"items": [{"n": 11, "title": "a", "age_h": 1.0}, {"n": 12, "title": "b", "age_h": 3.0}], "src": "x"}}
        r1 = {2: "Works", 3: "Not built", 1: "Partial"}
        d["first"] = cd.first_screen(d, r1, {"today_goal": {"proven": 3, "by": "2026-11-17T08:00:00+05:30"}}, "Lead input")
        caps = "| ID | Capability | Module | Status | Main |\n|---|---|---|---|---|\n" + "".join(f"| R1.{m} | {m} x | P | {st} | x |\n" for m, st in r1.items())
        out = self.lines(d, [{"number": 11}, {"number": 12}], caps=caps)
        self.assertEqual(len([x for x in out if x.startswith("ACT   stuck: ")]), len(d["first"]["stuck"]))
        self.assertGreaterEqual(len(d["first"]["stuck"]), 3)                       # idle lanes, Lead queue, qa reads Not built, unlisted
        T = d["first"]["today"]
        self.assertIn(f"today  {T['proven']} of {T['goal']} Proven by 17 Nov, 08:00 IST, {T['short']} short, {T['waiting']} Built waiting for qa", out)
        self.assertTrue(any(x.startswith("ACT   stuck: 2 pull requests wait for the Lead's answer — #12 b (3.0 h); #11 a (1.0 h)") for x in out), out)
        self.assertFalse([x for x in out if "disagree:" in x], out)

    def test_board_without_first_screen(self):
        self.assertEqual(cd.watch_panels({}), (None, None))
        self.assertEqual(len(cd.watch_lines({})), 1)


class Flow(unittest.TestCase):
    """P-644 (Lead 69, 16 Nov): the Flow box's counts, lights and forecast (FORMULAS.md › Flow)."""
    IST_ = cd.IST

    def at(self, s):
        return datetime.fromisoformat(s).replace(tzinfo=self.IST_).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def small(self, parts=None):
        a = self.at
        rows = [{"map": 1, "built": "2026-11-17", "built_at": a("2026-11-17T08:00"), "qa_tested_at": a("2026-11-17T10:00")},
                {"map": 2, "built": "2026-11-15", "built_at": a("2026-11-15T10:00"), "qa_tested_at": a("2026-11-16T09:00")},
                {"map": 3, "built": "2026-11-16", "built_at": a("2026-11-16T20:00"), "qa_tested_at": a("2026-11-16T10:00")},
                {"map": 4, "built": None, "built_at": None, "qa_tested_at": a("2026-11-14T10:00")},
                {"map": 5, "built": "2026-11-14", "built_at": a("2026-11-14T13:00"), "qa_tested_at": a("2026-11-16T13:00")}]
        qa = {1: "Works", 2: "Partial", 3: "Not built", 4: "Works", 5: "Works"}
        part_at = parts if parts is not None else {
            "A-1": a("2026-11-17T09:00"), "B-1": a("2026-11-16T11:00"), "C-1": a("2026-11-15T11:00"),
            "D-1": a("2026-11-14T11:00"), "E-1": a("2026-11-14T12:00")}
        since = {1: a("2026-11-17T10:00"), 5: a("2026-11-16T13:00")}       # row 4 was listed already reading Works: no date
        now = datetime(2026, 11, 17, 6, 30, tzinfo=timezone.utc)           # 12:00 IST
        return cd.flow_counts(rows, qa, part_at, 10, since, now)

    def test_counts_pass_and_fail_cases(self):
        f = self.small()
        self.assertEqual(f["days"], ["2026-11-14", "2026-11-15", "2026-11-16"])
        self.assertEqual((f["flow_rows_built_24h"], f["flow_rows_built_3d"]), (2, [1, 1, 1]))     # rows 1 and 3 (20:00 the evening before)
        self.assertEqual(f["built_24h_maps"], [1, 3])
        self.assertEqual((f["flow_parts_24h"], f["flow_parts_3d"], f["flow_parts_left"]), (1, [2, 1, 1], 5))   # B-1 is 25 h old
        self.assertEqual((f["flow_works_24h"], f["flow_works_3d"]), (2, [0, 0, 1]))   # row 4 (listed already Works) never counts as new
        self.assertEqual(f["works_24h_maps"], [1, 5])
        self.assertEqual(f["flow_prove_lag_h"], 25.0)                       # median of 2 h (row 1) and 48 h (row 5)
        # fail case: row 2 was tested by qa after its parts merged and reads Partial: In progress, not waiting
        # pass case: row 3 merged after qa's last test: Built, waiting for qa, 16 h old
        self.assertEqual((f["waiting"], f["flow_awaiting"], f["flow_awaiting_oldest_h"]), ([3], 1, 16.0))
        # all 101 proven = the later of: 5 ids left at 4/3 (mean), 2 (best), 1 (worst) a day, plus ceil(25 / 24) = 2 days
        # from built to proven (23, 22, 24 Nov); and 2 rows not proven at 1/3 (mean), 1 (best), 0 (worst) a day
        # (23 Nov, 19 Nov, no date). Review M1: proving at qa's own rate, not only building
        self.assertEqual((f["build_done"], f["prove_done"]), ("2026-11-23", "2026-11-23"))
        self.assertEqual((f["flow_forecast"], f["flow_forecast_best"], f["flow_forecast_worst"]), ("2026-11-23", "2026-11-22", None))
        self.assertEqual(f["today_counts"], {"rows": 1, "parts": 1, "works": 1})

    def test_today_is_the_ist_day_and_the_week_starts_monday(self):
        # Lead 70 (A133): Tuesday 17 Nov 12:00 IST. Row 3 (16 Nov 20:00) is in the last 24 h but not today; row 5 (proven
        # Monday 16 Nov) is in this week but not today
        f = self.small()
        self.assertEqual((f["flow_rows_built_today"], f["flow_rows_built_24h"]), (1, 2))
        self.assertEqual((f["flow_parts_today"], f["flow_works_today"], f["flow_works_week"], f["week_start"]), (1, 1, 2, "2026-11-16"))
        self.assertEqual((f["built_today_maps"], f["works_today_maps"]), ([1], [1]))
        b = self.box(f)
        self.assertEqual((b["Build"]["big"], b["Prove"]["big"]), ("1 row built today", "1 row proven today"))
        self.assertIn("Last 24 h: 2 rows built, 1 part merged", b["Build"]["lines"])

    def test_three_proven_lines(self):
        # A133: three plain lines in place of "11 of 10 proven", each with its light
        f = self.small()
        d = {"lineage": {"taken_at": "2026-11-17T06:30:00Z"}, "first": {"release": {"target": "2026-11-29", "need_per_day": 0.2}}}
        L = {x["key"]: x for x in cd.proven_lines(d, f)}
        self.assertEqual(L["today"]["text"], "Today (IST day): 1 proven of 10 (floor 7, P-644)")
        self.assertEqual(L["week"]["text"], "This week (Mon to Sun IST): 2 proven of 70")
        self.assertEqual(L["overall"]["text"], "Overall: 3 of 5 proven; 29 Nov needs about 0.2 a day; at the current pace, all proven about 23 Nov")
        self.assertEqual((L["today"]["light"], L["week"]["light"], L["overall"]["light"]), ("red", "red", "green"))
        self.assertIn("for the 2 days so far", L["week"]["src"])                # 10 a day for Mon and Tue: 20 green, 14 amber
        f2 = dict(f, flow_works_week=8)                                     # Tuesday: under 10 for Monday alone, 7 or more
        self.assertEqual({x["key"]: x for x in cd.proven_lines(d, f2)}["week"]["light"], "amber")
        late = dict(f, flow_forecast="2026-12-03")
        self.assertEqual({x["key"]: x for x in cd.proven_lines(d, late)}["overall"]["light"], "amber")   # up to 7 days after
        self.assertEqual({x["key"]: x for x in cd.proven_lines(d, dict(f, flow_forecast=None))}["overall"]["light"], "red")
        nq = dict(f, no_qa=True, flow_works_today=None, flow_works_week=None)
        self.assertEqual([x["light"] for x in cd.proven_lines(d, nq)], ["grey", "grey", "grey"])

    def test_midnight_monday_and_sunday(self):
        # review m5: the IST day and the Monday-start week at the edges (both scripts read taken_at the same way)
        a = self.at
        rows = [{"map": 1, "built": "2026-11-22", "built_at": a("2026-11-22T23:50"), "qa_tested_at": None},
                {"map": 2, "built": "2026-11-23", "built_at": a("2026-11-23T00:05"), "qa_tested_at": None}]
        qa = {1: "Works", 2: "Works"}
        since = {1: a("2026-11-22T23:50"), 2: a("2026-11-23T00:05")}       # Sunday 23:50, Monday 00:05
        mon = cd.flow_counts(rows, qa, {}, 2, since, datetime.fromisoformat(a("2026-11-23T00:10").replace("Z", "+00:00")))
        self.assertEqual((mon["week_start"], mon["flow_works_today"], mon["flow_works_week"], mon["flow_rows_built_today"]), ("2026-11-23", 1, 1, 1))
        sun = cd.flow_counts(rows[:1], {1: "Works"}, {}, 1, {1: a("2026-11-16T00:00")}, datetime.fromisoformat(a("2026-11-22T23:55").replace("Z", "+00:00")))
        self.assertEqual((sun["week_start"], sun["flow_works_week"]), ("2026-11-16", 1))   # Monday 16 Nov 00:00 counts
        sun2 = cd.flow_counts(rows[:1], {1: "Works"}, {}, 1, {1: a("2026-11-15T23:59")}, datetime.fromisoformat(a("2026-11-22T23:55").replace("Z", "+00:00")))
        self.assertEqual(sun2["flow_works_week"], 0)                         # Sunday 15 Nov 23:59 is last week

    def test_week_light_early_in_the_day(self):
        # review m1: at 00:10 on Tuesday, 10 proven on Monday is on target, not red
        self.assertEqual((cd.week_light(10, 2), cd.week_light(8, 2), cd.week_light(6, 2)), ("green", "amber", "red"))
        self.assertEqual((cd.week_light(10, 1), cd.week_light(60, 7), cd.week_light(None, 3)), ("green", "green", "grey"))

    def test_a_day_without_a_part_gives_no_worst_date(self):
        a = self.at
        f = self.small({"A-1": a("2026-11-14T09:00"), "B-1": a("2026-11-16T11:00")})
        self.assertEqual((f["flow_parts_3d"], f["flow_forecast_worst"]), ([1, 0, 1], None))
        self.assertIsNotNone(f["flow_forecast"])
        self.assertIsNone(self.small({})["flow_forecast"])                  # no part merged in 3 days: no date

    def box(self, fc, mm=25, fp=5.0, waits=(4, 5, 6), lanes=(18, 20), burn=2.4, disk=12, ci_error=None):
        d = {"lineage": {"taken_at": "2026-11-17T06:30:00Z"},
             "pipeline": {"queue_wait_min": {"v": mm, "p90": 70, "src": "flow-measure"}, "change_fail": {"batch_fail": {"v": fp}}},
             "resources": {"burn_pct_per_h": {"v": burn}, "weekly_pct": {"v": 80}, "disk_free_gb": {"v": disk}}}
        li = {"lanes_running": lanes[0], "lane_slots": lanes[1]} if lanes else {}
        ci = {"error": ci_error} if ci_error else {"queued_runs": 3, "runs_sampled": 2, "runs_in_3h": 2,
                                                  "job_waits": [{"min": w, "still_queued": False} for w in waits]}
        return {L["name"]: L for L in cd.flow_box(d, fc, li, "Lead input", ci)["lights"]}

    def test_lights_against_their_targets(self):
        f = self.small()
        b = self.box(f)
        self.assertEqual((b["Build"]["light"], b["Prove"]["light"], b["Merge"]["light"], b["Resources"]["light"]), ("red", "red", "green", "green"))
        self.assertEqual(self.box(f, mm=45)["Merge"]["light"], "amber")     # median over 30 min
        self.assertEqual(self.box(f, fp=25.0)["Merge"]["light"], "red")     # failed batches 20% or more
        self.assertEqual(self.box(f, waits=(40, 50))["Merge"]["light"], "red")   # a test machine after 30 min
        self.assertEqual(self.box(f, disk=5)["Resources"]["light"], "red")  # under P-644's 7 GB floor
        self.assertEqual(self.box(f, lanes=(12, 20))["Resources"]["light"], "amber")
        nm = self.box(f, ci_error="offline", lanes=None)
        self.assertIn("not measured: offline", " ".join(nm["Merge"]["lines"]))
        self.assertIn("Lanes: not measured", " ".join(nm["Resources"]["lines"]))
        g = {k: v for k, v in f.items()}
        g.update({"flow_rows_built_today": 10, "flow_works_today": 11, "flow_prove_lag_h": 30.0})
        bb = self.box(g)
        self.assertEqual((bb["Build"]["light"], bb["Prove"]["light"]), ("green", "amber"))   # proving on count, but slower than 12 h
        g.update({"flow_works_today": 12, "flow_prove_lag_h": None})
        self.assertEqual(self.box(g)["Prove"]["light"], "amber")            # review 2 m2: built to proven not measured is not green
        g.update({"flow_prove_lag_h": 12.0, "flow_awaiting_oldest_h": 3.0})
        self.assertEqual(self.box(g)["Prove"]["light"], "green")            # 12 h or less
        g.update({"flow_rows_built_today": 7})
        self.assertEqual(self.box(g)["Build"]["light"], "amber")            # the floor
        self.assertEqual(cd.flow_light(None, None), "grey")
        self.assertEqual(cd.flow_light("green", None), "amber")              # never green while a part is not measured (review m4)
        self.assertEqual(self.box(f, mm=None)["Merge"]["light"], "amber")
        self.assertIn("this snapshot has no CI reading", " ".join(cd.flow_box({"lineage": {}}, f, {}, "x", None)["lights"][2]["lines"]))

    def test_forecast_sentence(self):
        # review 2 m1: the founder reads one plain sentence; the build date has no lag in it; the total is the planned rows
        fl = cd.flow_box({"lineage": {}}, self.small(), {}, "x", None)["forecast"]
        self.assertEqual(fl, "All 5 rows proven about 23 Nov. Building: the last part merges about 21 Nov (1.3 parts a day), and rows are "
                             "proven about 2 days after they are built. Proving: the 2 rows left, at qa's 0.33 rows a day, about 23 Nov. "
                             "Best 22 Nov; worst no date (a day with nothing merged or proven).")

    def test_forecast_sentence_when_all_done(self):
        f = self.small()
        f.update({"flow_parts_left": 0, "to_prove": 0, "flow_forecast": "2026-11-17", "flow_forecast_best": "2026-11-17", "flow_forecast_worst": "2026-11-17"})
        fl = cd.flow_box({"lineage": {}}, f, {}, "x", None)["forecast"]
        self.assertIn("Building: every part has merged", fl)
        self.assertIn("Proving: every row is proven.", fl)
        g = self.small()
        g["flow_parts_3d"] = [1, 1, 1]
        self.assertIn("(1 part a day)", cd.flow_box({"lineage": {}}, g, {}, "x", None)["forecast"])

    def test_no_qa_rows_leaves_build_measured(self):
        # review m6: with no Release 1 row in qa's file, Prove and the forecast are not measured; Build still is, on both sides
        out, note = cd.run_reconcile(FIX, os.path.join(HERE, "cockpit-reconcile.py"))
        _, c = run(FIX, rec=out, note=None)
        self.assertEqual((c["keys"]["flow_rows_built_24h"], c["keys"]["flow_works_24h"], c["keys"]["flow_forecast"]), (1, None, None))
        self.assertEqual((out["numbers"]["flow_rows_built_24h"]["value"], out["numbers"]["flow_works_24h"]["value"]), (1, None))
        drop = snap_with(drop=["files_main/qa/CAPABILITIES.md"])
        o2, _ = cd.run_reconcile(drop, os.path.join(HERE, "cockpit-reconcile.py"))
        _, c2 = run(drop, rec=o2, note=None)
        self.assertFalse([x for x in c2["trust"]["diffs"] if x["name"].startswith("flow_")], c2["trust"]["diffs"])

    def test_qa_history_rules_in_both_scripts(self):
        # review m7: the history scan, through both scripts. 20 Nov 12:00 IST; days 17, 18, 19 Nov.
        hdr = "\n## Release 1\n\n| # | Map row: capability | Module | Status | Tested on | Done when |\n|---|---|---|---|---|---|\n"
        row = lambda n, st: (f"| R1.{n} | {n} Cap |\n" if st is None else f"| **R1.{n}** | {n} Cap | Platform | {st[2:]} | abc | fixture |\n"
                             if st.startswith("**") else f"| R1.{n} | {n} Cap | Platform | {st} | abc | fixture |\n")
        base = cd.Snap(FIX).text("files_main/qa/CAPABILITIES.md")
        v = {"r1v1": ("2026-11-15T03:00:00Z", {1: "Works", 2: "Partial", 7: "Not built", 8: "Partial"}),   # row 1: listed already Works
             "r1v2": ("2026-11-18T08:00:00Z", {1: "Works", 2: "Works", 7: "Not built", 8: "Works"}),      # rows 2 and 8 Works
             "r1v3": ("2026-11-19T01:00:00Z", {1: "Works", 2: "Works", 7: "Not built", 8: "**Partial"}),  # row 8 falls back (bold id)
             "r1v3b": ("2026-11-19T02:00:00Z", {1: "Works", 2: "Works", 8: "Partial"}),                   # row 7 not listed: skipped
             "r1v3c": ("2026-11-19T03:00:00Z", {1: "Works", 2: "Works", 7: "Not built", 8: None}),       # row 8 short line
             "r1v4": ("2026-11-20T00:00:00Z", {1: "Works", 2: "Works", 7: "Not built", 8: "Works"}),      # row 8 again: date resets
             "r1v5": ("2026-11-20T04:00:00Z", {1: "Works", 2: "Works", 7: "Partial (retested)", 8: "Works"})}   # row 7 tested after built
        files = {"git/capabilities_main.jsonl": "\n".join(json.dumps({"sha": k, "date": d}) for k, (d, _) in v.items()) + "\n"}
        for k, (_, st) in v.items():
            files[f"git/capabilities_main/{k}.md"] = base + hdr + "".join(row(n, x) for n, x in st.items())
        files["files_main/qa/CAPABILITIES.md"] = files["git/capabilities_main/r1v5.md"]
        d = snap_with(files)
        out, note = cd.run_reconcile(d, os.path.join(HERE, "cockpit-reconcile.py"))
        self.assertIsNone(note)
        _, c = run(d, rec=out, note=None)
        k = c["keys"]
        self.assertEqual((k["flow_works_24h"], k["flow_works_3d"]), (1, [0, 1, 0]))      # row 8 (20 Nov 05:30 IST); row 2 on 18 Nov
        self.assertEqual(k["flow_prove_lag_h"], 22.0)                                    # 2 h (row 2) and 42 h (row 8, from its new date)
        self.assertEqual((k["flow_awaiting"], k["flow_awaiting_oldest_h"]), (0, None))   # row 7: qa read Partial after its part merged
        self.assertIsNotNone(k["flow_forecast_best"])
        self.assertFalse([x for x in c["trust"]["diffs"] if x["name"].startswith("flow_")], c["trust"]["diffs"])
        for n in cd.FLOW_KEYS:
            self.assertEqual(out["numbers"][n]["value"], k[n], n)
        # the four IST-day counts, exact (20 Nov is a Friday: the week runs from Monday 16 Nov)
        self.assertEqual((k["flow_works_today"], k["flow_works_week"]), (1, 2))   # row 8 today; rows 2 (18 Nov) and 8 this week

    def test_both_scripts_agree_on_the_fixture(self):
        out, note = cd.run_reconcile(FIX, os.path.join(HERE, "cockpit-reconcile.py"))
        self.assertIsNone(note)
        _, c = run(FIX, rec=out, note=None)
        for k in cd.FLOW_KEYS:
            self.assertIn(k, out["numbers"], k)
            self.assertIn(k, c["keys"], k)
        self.assertEqual((c["trust"]["state"], c["trust"]["diffs"]), ("agree", []), c["trust"]["diffs"])
        t = json.loads(json.dumps(out))
        t["numbers"]["flow_awaiting"]["value"] = (t["numbers"]["flow_awaiting"]["value"] or 0) + 1
        self.assertEqual(cd.reconcile_compare(c["keys"], t, None)["diffs"][0]["name"], "flow_awaiting")   # a one-off difference is caught


class Enforced(unittest.TestCase):
    """CK-3 (founder A151, A154; checks brief): two lines; machines write them; a heartbeat over 45 min old is never yes."""
    T = "2026-11-18T07:00:00Z"
    CONF = {"enforced": "yes", "checked_at": "2026-11-18T12:25:00+05:30", "counts": {"pass": 31, "fail": 0, "pending": 0, "unchecked": 4},
            "checked": 31, "manifest_version": "1.1.0", "items": [], "ref": "abc123456789"}

    def lines(self, conf=None, hb=None):
        return {x["key"]: x for x in cd.enforcement_lines({"lineage": {"taken_at": self.T}}, conf, hb)["lines"]}

    def run_(self, at, concl="success"):
        return {"id": 9, "conclusion": concl, "created_at": at, "updated_at": at, "html_url": "https://github.com/o/r/actions/runs/9"}

    def test_not_measured(self):
        L = self.lines({"error": "the set-up check is not on main yet"}, {"error": "the heartbeat workflow is not on main yet"})
        self.assertEqual([(x["light"], x["text"]) for x in L.values()],
                         [("grey", "Set-up enforced: not measured"), ("grey", "Pipeline running: not measured")])
        self.assertIn("not on main yet", L["pipeline"]["src"])
        nothing = self.lines(dict(self.CONF, checked=0, enforced="yes"), None)["setup"]       # nothing checked is not yes
        self.assertEqual((nothing["light"], nothing["text"]), ("grey", "Set-up enforced: not measured"))
        self.assertEqual(self.lines("garbage", "garbage")["setup"]["light"], "grey")      # wrong types never crash

    def test_setup_from_board_run(self):
        L = self.lines(self.CONF, {"error": "x"})
        self.assertEqual((L["setup"]["light"], L["setup"]["text"]), ("green", "Set-up enforced: yes · last checked 12:25 IST (31 of 31 items)"))
        bad = dict(self.CONF, enforced="no", counts={"pass": 29, "fail": 2}, items=[{"area": "ci", "id": "ci.gate", "status": "fail", "expected": "ci", "found": "none"}])
        b = self.lines(bad, None)["setup"]
        self.assertEqual((b["light"], b["text"][:22]), ("red", "Set-up enforced: no · "))
        self.assertEqual(b["items"], ["ci ci.gate: fail (expected ci, found none)"])
        old = self.lines(dict(self.CONF, checked_at="2026-11-18T10:00:00+05:30"), None)["setup"]       # 120 min old: stale
        self.assertEqual((old["light"], old["text"][:33]), ("amber", "Set-up enforced: unknown (stale) "))

    def test_pipeline(self):
        hb = {"run": self.run_("2026-11-18T06:40:00Z"), "heartbeat": {"running": "yes", "green_streak_h": 6.5, "alarms": []},
              "conformance": dict(self.CONF, checked_at="2026-11-18T12:10:00+05:30", checked=33, counts={"pass": 33, "fail": 0})}
        L = self.lines(self.CONF, hb)
        self.assertEqual((L["pipeline"]["light"], L["pipeline"]["text"]), ("green", "Pipeline running: yes · last heartbeat 12:10 IST · green streak 6.5 h"))
        self.assertEqual(L["setup"]["text"], "Set-up enforced: yes · last checked 12:10 IST (33 of 33 items)")   # the heartbeat's own check first
        self.assertEqual(L["setup"]["link"], "https://github.com/o/r/actions/runs/9")
        red = self.lines(None, {"run": self.run_("2026-11-18T06:40:00Z", "failure"),
                                "heartbeat": {"running": "no", "alarms": [{"id": "A1", "why": "no merge for 95 min"}]}})["pipeline"]
        self.assertEqual((red["light"], red["text"], red["items"]), ("red", "Pipeline running: no · last heartbeat 12:10 IST", ["A1: no merge for 95 min"]))
        # review #2141: a successful run alone is never yes (an unchanged open alarm ends green); a failed one is no
        only = self.lines(None, {"run": self.run_("2026-11-18T06:40:00Z"), "artifact_error": "download failed"})["pipeline"]
        self.assertEqual((only["light"], only["text"]), ("amber", "Pipeline running: unknown · last heartbeat 12:10 IST"))
        self.assertIn("download failed", only["src"])
        self.assertIn("does not prove", only["src"])
        failed = self.lines(None, {"run": self.run_("2026-11-18T06:40:00Z", "failure")})["pipeline"]
        self.assertEqual((failed["light"], failed["text"]), ("red", "Pipeline running: no · last heartbeat 12:10 IST"))
        no_hb = self.lines(None, {"run": self.run_("2026-11-18T06:40:00Z"), "heartbeat": {"running": "no", "green_streak_h": 3}})["pipeline"]
        self.assertEqual((no_hb["light"], no_hb["text"]), ("red", "Pipeline running: no · last heartbeat 12:10 IST"))   # no streak on a no
        stale = self.lines(self.CONF, dict(hb, run=self.run_("2026-11-18T06:00:00Z")))   # 60 min old
        self.assertEqual((stale["pipeline"]["light"], stale["pipeline"]["text"]), ("amber", "Pipeline running: unknown (stale) · last heartbeat 11:30 IST"))
        self.assertEqual(stale["setup"]["text"], "Set-up enforced: yes · last checked 12:25 IST (31 of 31 items)")   # stale heartbeat: the board's own check


    def test_edge_and_odd_inputs(self):
        edge = self.lines(None, {"run": self.run_("2026-11-18T06:15:00Z"), "heartbeat": {"running": "yes"}})["pipeline"]   # exactly 45 min: fresh
        self.assertEqual(edge["light"], "green")
        past = self.lines(None, {"run": self.run_("2026-11-18T06:14:00Z"), "heartbeat": {"running": "yes"}})["pipeline"]   # 46 min: stale
        self.assertEqual(past["light"], "amber")
        # the heartbeat's own check is stale though its run is fresh: the board's own fresh check is shown
        hb = {"run": self.run_("2026-11-18T06:16:00Z"), "heartbeat": {"running": "yes"},
              "conformance": dict(self.CONF, checked_at="2026-11-18T11:43:00+05:30")}
        s = self.lines(self.CONF, hb)["setup"]
        self.assertEqual((s["light"], s["text"]), ("green", "Set-up enforced: yes · last checked 12:25 IST (31 of 31 items)"))
        n0 = len(cd.ERRORS)
        for conf, h in [(dict(self.CONF, counts=[1]), None), (dict(self.CONF, checked_at="2026-11-18T12:25:00"), None),
                        (None, {"run": "x"}), (None, {"run": self.run_("not a time")}),
                        (None, {"run": self.run_("2026-11-18T06:40:00Z"), "heartbeat": {"running": "yes", "alarms": "x"}})]:
            out = cd.enforcement_lines({"lineage": {"taken_at": self.T}}, conf, h)     # never a crash
            self.assertEqual(len(out["lines"]), 2)
        naive = self.lines(dict(self.CONF, checked_at="2026-11-18T12:25:00"), None)["setup"]   # a time with no zone is stale, never yes
        self.assertEqual(naive["light"], "amber")
        del cd.ERRORS[n0:]

    def test_crash_gives_grey_lines(self):
        n0 = len(cd.ERRORS)
        out = cd.enforcement_lines({"lineage": {"taken_at": 5}}, self.CONF, None)          # a taken_at that is not a time
        self.assertEqual([(x["light"], x["text"]) for x in out["lines"]], [("grey", "Set-up enforced: not measured"), ("grey", "Pipeline running: not measured")])
        self.assertTrue(any(e.startswith("enforced:") for e in cd.ERRORS[n0:]))
        del cd.ERRORS[n0:]

    class GH:
        def __init__(self, runs=None, err=None, arts=None):
            self.runs, self.err, self.arts, self.urls, self.token = runs, err, arts, [], "t"
        def get(self, url, raw=False):
            self.urls.append(url)
            if self.err:
                raise RuntimeError(self.err)
            return {"workflow_runs": self.runs} if "/workflows/" in url else {"artifacts": self.arts or []}
        def count(self, url):
            self.urls.append(url)

    def test_heartbeat_read(self):
        self.assertEqual(cd.heartbeat_read(self.GH(err="GET x failed: 404 Not Found"))["error"], "the heartbeat workflow is not on main yet")
        self.assertEqual(cd.heartbeat_read(self.GH(runs=[]))["error"], "the heartbeat workflow has not finished a run yet")
        old = (cd.NOW - timedelta(minutes=60)).isoformat()
        g = self.GH(runs=[self.run_(old)])
        out = cd.heartbeat_read(g)
        self.assertEqual((out["run"]["id"], len(g.urls)), (9, 1))                          # stale: no artifact read
        new = (cd.NOW - timedelta(minutes=5)).isoformat()
        g = self.GH(runs=[self.run_(new)], arts=[{"name": "pipeline-heartbeat", "expired": True, "archive_download_url": "u"}])
        self.assertEqual(cd.heartbeat_read(g)["artifact_error"], "the run has no pipeline-heartbeat artifact")   # expired counts as none
        self.assertEqual(cd.heartbeat_read(self.GH(runs=[self.run_("not a time")]))["run"]["id"], 9)          # odd time: no crash, no download
        # OS-83: an event run's artifact (pipeline-heartbeat-event) is read by the board too; another name is not
        for name, want in (("pipeline-heartbeat-event", True), ("something-else", False)):
            g = self.GH(runs=[self.run_(new)], arts=[{"name": name, "expired": False, "archive_download_url": "u"}])
            with mock.patch.object(cd.subprocess, "run", return_value=mock.Mock(returncode=1, stderr=b"x")):
                out = cd.heartbeat_read(g)
            self.assertEqual(out["artifact_error"].startswith("artifact download failed"), want, (name, out))


class PrListCache(unittest.TestCase):
    """Lead 75, 17 Nov: the PR list is cached; a run reads the open PRs and the closed PRs updated since the last read."""
    def pr(self, n, state, upd):
        return {"number": n, "title": f"t{n}", "state": state, "draft": False, "created_at": "2026-11-01T00:00:00Z", "updated_at": upd,
                "merged_at": upd if state == "closed" else None, "closed_at": None, "labels": [{"name": "x"}],
                "head": {"ref": f"b{n}", "sha": "s"}, "base": {"ref": "main"}}

    class FakeGH:
        def __init__(self, pages):
            self.pages, self.urls = pages, []
        def get(self, url, raw=False):
            self.urls.append(url)
            for k, v in self.pages.items():
                if url.startswith(k):
                    return v
            raise AssertionError(url)

    def test_bad_cache_reads_in_full(self):
        # review #2113: a cut or bad cache file reads the list in full with a note, never stops the run; no .tmp is left behind
        tmp = tempfile.mkdtemp()
        open(os.path.join(tmp, "prs.json"), "w").write('{"read_at": "2026-11-1')
        n0 = len(cd.ERRORS)
        g = self.FakeGH({"/pulls?state=all": [self.pr(1, "open", "2026-11-16T00:00:00Z")]})
        self.assertEqual([x["number"] for x in cd.pr_list(g, tmp)], [1])
        self.assertTrue(any("cache unreadable" in e for e in cd.ERRORS[n0:]))
        self.assertEqual(sorted(os.listdir(tmp)), ["prs.json"])
        open(os.path.join(tmp, "prs.json"), "w").write('[1, 2]')                       # parses but is not an object
        self.assertEqual([x["number"] for x in cd.pr_list(g, tmp)], [1])
        del cd.ERRORS[n0:]

    def test_full_then_incremental(self):
        tmp = tempfile.mkdtemp()
        old_now = cd.NOW
        try:
            cd.NOW = datetime(2026, 11, 17, 6, 0, tzinfo=timezone.utc)
            g = self.FakeGH({"/pulls?state=all": [self.pr(3, "open", "2026-11-16T00:00:00Z"), self.pr(2, "closed", "2026-11-10T00:00:00Z"),
                                                  self.pr(1, "closed", "2026-11-02T00:00:00Z")]})
            got = cd.pr_list(g, tmp)
            self.assertEqual([x["number"] for x in got], [3, 2, 1])
            self.assertEqual(len(g.urls), 1)                                  # no cache: the full read
            cd.NOW = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)        # a day later: #3 merged, #4 opened, #2's title edited
            p2 = dict(self.pr(2, "closed", "2026-11-17T12:00:00Z"), title="new")
            g = self.FakeGH({"/pulls?state=open": [self.pr(4, "open", "2026-11-18T01:00:00Z")],
                             "/pulls?state=closed": [self.pr(3, "closed", "2026-11-18T02:00:00Z"), p2, self.pr(1, "closed", "2026-11-02T00:00:00Z")]})
            got = {x["number"]: x for x in cd.pr_list(g, tmp)}
            self.assertEqual(sorted(got), [1, 2, 3, 4])
            self.assertEqual((got[3]["state"], got[2]["title"], got[1]["title"]), ("closed", "new", "t1"))
            self.assertEqual(len(g.urls), 2)                                  # one page of open PRs, one of closed: not every page
            self.assertTrue(all(k in got[4] for k in ("labels", "head", "base", "merged_at")))
            cd.NOW = datetime(2026, 11, 26, 6, 0, tzinfo=timezone.utc)        # over 7 days since the full read: full again
            g = self.FakeGH({"/pulls?state=all": [self.pr(4, "closed", "2026-11-20T00:00:00Z")]})
            self.assertEqual([x["number"] for x in cd.pr_list(g, tmp)], [4])
        finally:
            cd.NOW = old_now
            shutil.rmtree(tmp)


class StuckNow(unittest.TestCase):
    """A134 (founder 23:3x IST 16 Nov via Lead 70): four lines that say what is stuck right now (FORMULAS.md › Stuck now)."""
    META = {"taken_at": "2026-11-20T12:00:00+05:30", "main_at": "2026-11-20T05:15:00Z"}      # 75 min before taken_at
    AP = [{"number": 11, "title": "a", "labeled_at": "2026-11-20T05:00:00Z"},                   # 90 min: over 60
          {"number": 12, "title": "b", "labeled_at": "2026-11-20T05:45:00Z"},                   # 45 min: not yet
          {"number": 13, "title": "c", "labeled_at": None}]                                     # no label event: not counted

    def test_counts(self):
        c = cd.stuck_counts(self.META, self.AP)
        self.assertEqual((c["stuck_main_gap_min"], c["stuck_approved_over_60"]), (75, 1))
        self.assertEqual(c["approved_old"], [{"number": 11, "title": "a", "min": 90}])
        n = cd.stuck_counts({"taken_at": self.META["taken_at"]}, {"error": "offline"})
        self.assertEqual((n["stuck_main_gap_min"], n["stuck_approved_over_60"], n["approved_reason"]), (None, None, "not measured: offline"))

    def lines(self, ci=None, li=None, meta=None, ap=None):
        sc = cd.stuck_counts(meta or self.META, self.AP if ap is None else ap)
        return {x["key"]: x for x in cd.stuck_now({"lineage": {"taken_at": "2026-11-20T06:30:00Z"}}, sc, ci, li or {}, "Lead input")["lines"]}

    def test_lines_and_lights(self):
        L = self.lines(ci={"queued_runs": 31}, li={"stuck_sessions": [{"title": "next forms", "state": "Awaiting input"}], "stuck_sessions_at": "2026-11-20T06:00:00Z"})
        self.assertEqual(list(L), ["merge", "queue", "sessions", "approved"])                  # four lines, in the asked order
        self.assertEqual((L["merge"]["text"], L["merge"]["light"]), ("Last merge to main: 75 min ago", "red"))   # over 60
        self.assertEqual((L["queue"]["text"], L["queue"]["light"]), ("Actions runs waiting for a machine: 31", "red"))   # over 30
        self.assertEqual((L["sessions"]["text"], L["sessions"]["light"]), ("Sessions stuck (awaiting input, failed, blocked, or idle with work left and no push for 90 min): 1: next forms (Awaiting input)", "red"))
        self.assertIn("per the Lead's check of claude.ai/code at 20 Nov 11:30 IST, 30 min before this data", L["sessions"]["src"])
        self.assertEqual((L["approved"]["text"], L["approved"]["light"]), ("Approved, not merged for over 60 min: 1: #11 (90 min); waiting for CI machines (31 runs queued)", "red"))   # queue red: the reason added
        ok = self.lines(ci={"queued_runs": 4}, li={"stuck_sessions": [], "stuck_sessions_at": "2026-11-20T06:00:00Z"},
                        meta={"taken_at": "2026-11-20T12:00:00+05:30", "main_at": "2026-11-20T06:20:00Z"}, ap=[])
        self.assertEqual([x["light"] for x in ok.values()], ["green", "green", "green", "green"])
        nm = self.lines()
        self.assertEqual((nm["queue"]["light"], nm["sessions"]["light"], nm["sessions"]["text"]), ("grey", "grey", "Sessions stuck (awaiting input, failed, blocked, or idle with work left and no push for 90 min): not reported"))
        self.assertEqual(self.lines(ci={"queued_runs": 20})["queue"]["light"], "amber")
        # review #2099: a red queue adds no reason when no approved PR is over 60 min, or when the approved reading is missing
        none_old = self.lines(ci={"queued_runs": 31}, ap=[])["approved"]
        self.assertNotIn("waiting for CI machines", none_old["text"])
        miss = self.lines(ci={"queued_runs": 31}, ap={"error": "offline"})["approved"]
        self.assertEqual(miss["light"], "grey")
        self.assertNotIn("waiting for CI machines", miss["text"])
        # review m2, m3: an empty list from an old check, or with a time that has no zone or does not parse, is amber, never green
        for at in ("2026-11-20T04:00:00Z", "2026-11-20T11:00:00", "23:40 IST", "2026-11-20T11:20:00+05:30"):
            got = self.lines(li={"stuck_sessions": [], "stuck_sessions_at": at})["sessions"]["light"]
            self.assertEqual(got, "green" if at.endswith("+05:30") else "amber", at)
        # Lead 73: each listed session shows its reason after its state; a time that is not a string is amber, never an error
        r = self.lines(li={"stuck_sessions": [{"title": "Manitoba read", "state": "blocked", "reason": "Claude in Chrome not connected"}, {"title": "PF-8r", "state": "Awaiting input"}],
                           "stuck_sessions_at": 1763358000})["sessions"]
        self.assertEqual((r["text"], r["light"], r["items"]), ("Sessions stuck (awaiting input, failed, blocked, or idle with work left and no push for 90 min): 2: "
                          "Manitoba read (blocked: Claude in Chrome not connected); PF-8r (Awaiting input)", "red",
                          ["Manitoba read (blocked: Claude in Chrome not connected)", "PF-8r (Awaiting input)"]))
        self.assertIn("a time not given", r["src"])
        self.assertEqual(self.lines(li={"stuck_sessions": [], "stuck_sessions_at": ["x"]})["sessions"]["light"], "amber")
        # the reason goes only with a red queue line (20 queued is amber: no reason)
        self.assertEqual(self.lines(ci={"queued_runs": 20})["approved"]["text"], "Approved, not merged for over 60 min: 1: #11 (90 min)")
        # review m4: a merge after the snapshot time reads 0, not -1
        self.assertEqual(cd.stuck_counts({"taken_at": "2026-11-20T12:00:00+05:30", "main_at": "2026-11-20T06:30:30Z"}, [])["stuck_main_gap_min"], 0)

    def test_both_scripts_agree(self):
        meta = json.loads(cd.Snap(FIX).text("meta.json"))
        meta["main_at"] = "2026-11-20T05:15:00Z"
        d = snap_with({"meta.json": meta, "github/approved_open.json": self.AP})
        out, note = cd.run_reconcile(d, os.path.join(HERE, "cockpit-reconcile.py"))
        self.assertIsNone(note)
        _, c = run(d, rec=out, note=None)
        self.assertEqual((c["keys"]["stuck_main_gap_min"], c["keys"]["stuck_approved_over_60"]), (75, 1))
        self.assertEqual((out["numbers"]["stuck_main_gap_min"]["value"], out["numbers"]["stuck_approved_over_60"]["value"]), (75, 1))
        self.assertFalse([x for x in c["trust"]["diffs"] if x["name"].startswith("stuck_")], c["trust"]["diffs"])
        # review m6: no main_at and an error object, end to end: not measured on both sides, no difference
        d2 = snap_with({"github/approved_open.json": {"error": "offline"}})
        o2, _ = cd.run_reconcile(d2, os.path.join(HERE, "cockpit-reconcile.py"))
        _, c2 = run(d2, rec=o2, note=None)
        self.assertEqual((c2["keys"]["stuck_main_gap_min"], c2["keys"]["stuck_approved_over_60"]), (None, None))
        self.assertEqual((o2["numbers"]["stuck_main_gap_min"]["value"], o2["numbers"]["stuck_approved_over_60"]["value"]), (None, None))
        self.assertFalse([x for x in c2["trust"]["diffs"] if x["name"].startswith("stuck_")], c2["trust"]["diffs"])


class MainChecks(unittest.TestCase):
    """CI-PRE (P-731): a PR's full run is a workflow_dispatch run of ci.yml on main's head; its checks are not main's."""
    def test_a_full_runs_checks_are_left_out_of_mains(self):
        runs = [{"name": "ci", "conclusion": "failure", "details_url": "https://github.com/o/r/actions/runs/55/job/1"},     # a PR's red full run
                {"name": "nightly", "conclusion": "failure", "details_url": "https://github.com/o/r/actions/runs/66/job/2"},  # main's own run
                {"name": "mergify", "conclusion": "success", "details_url": None}]                                             # not an Actions run
        self.assertEqual([c["name"] for c in cd.main_checks(runs, {"55"})], ["nightly", "mergify"])   # 3 - 1 full-run check
        self.assertEqual(len(cd.main_checks(runs, set())), 3)                                         # no full run: all 3 kept


if __name__ == "__main__":
    unittest.main()
