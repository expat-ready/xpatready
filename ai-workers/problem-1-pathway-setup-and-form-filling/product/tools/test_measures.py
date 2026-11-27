#!/usr/bin/env python3
"""Tests of measures.py's arithmetic (no network, no git): python3 -I product/tools/test_measures.py"""
import importlib.util, os, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("GITHUB_REPOSITORY", "local/none")
spec = importlib.util.spec_from_file_location("measures", os.path.join(HERE, "measures.py"))
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
U = timezone.utc
T0 = datetime(2026, 11, 20, tzinfo=U); T1 = T0 + timedelta(days=7)
h = lambda n: T0 + timedelta(hours=n)
fails = 0


def check(name, cond, got=""):
    global fails
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f" — {got}"))
    fails += 0 if cond else 1


def m(sha, t, title, app=True, first=None, reverts=()):
    return {"sha": sha, "time": h(t), "pr": None, "title": title, "app": app, "first": h(first) if first is not None else None, "reverts": list(reverts)}


ms = [m("a" * 40, 10, "runtime: R1.1 — a", first=6), m("b" * 40, 20, "records: P-1", app=False, first=19),
      m("c" * 40, 30, "fix(P-214): flaky", app=False, first=28), m("d" * 40, 40, "Revert \"runtime: R1.1 — a\"", first=39, reverts=["a" * 9]),
      m("e" * 40, 50, "screens: R1.2 — QA-12 regression fixed", first=40)]
hist = {"R1.1": [(h(-100), "Partial", "", False), (h(5), "Works", "", False), (h(45), "Partial", "", False), (h(60), "Works", "", False)],
        "R1.2": [(h(-100), "Works", "", True), (h(70), "Broken", "", False)],
        "R1.3": [(h(-50), "Not built", "", False), (h(80), "Works", "", False)]}
usage = [(h(-5), 40, "A1"), (h(10), 50, "A1"), (h(30), 70, "A1"), (h(40), 5, "A1"), (h(60), 10, "A2")]
r = M.compute(ms, hist, usage, T0, T1, runs=[{"conclusion": "success"}, {"conclusion": "failure"}, {"conclusion": "success"}])
check("deployment frequency: 5 merges / 7 days, 3 app code", r["deploys"] == 5 and r["app_deploys"] == 3 and abs(r["deploy_freq"] - 5 / 7) < 1e-9, r)
check("lead time: median of 4,1,2,1,10 h is 2 h; p90 between 4 and 10", r["lead_median_h"] == 2 and 4 < r["lead_p90_h"] <= 10, (r["lead_median_h"], r["lead_p90_h"]))
whats = [f["what"] for f in r["fails"]]
check("failures: the revert, R1.1 Works → Partial, R1.2 Works → Broken", len(whats) == 3 and any(w.startswith("revert of aaaaaaaaa") for w in whats)
      and "R1.1 Works → Partial" in whats and "R1.2 Works → Broken" in whats, whats)
check("change fail rate = 3 failures / 3 app-code deployments", r["cfr"] == 1.0, r["cfr"])
check("recovery: revert 30 h, R1.1 15 h; R1.2 still open", r["recovery_n"] == 2 and r["recovery_median_h"] == 22.5 and r["open_fails"] == ["R1.2 Works → Broken"], (r["recovery_median_h"], r["open_fails"]))
check("rework: the fix, the revert and the QA-12 regression fix = 3 of 5", r["rework_n"] == 3 and abs(r["rework"] - 0.6) < 1e-9, r["rework_n"])
check("works: R1.1 (h5) and R1.3 (h80) newly Works; R1.2's baseline Works is not new", r["newly_works"] == 2, r["newly_works"])
check("works net: start R1.2 Works (1) → end R1.1, R1.3 (2) = +1", r["works_net"] == 1 and r["works_now"] == 2, (r["works_net"], r["works_now"]))
check("tokens: 10 + 20 + 5 (new week) + 10 (new account) = 45% over 2 newly Works", r["tokens"].startswith("22.5% of a weekly plan per newly Works row (45% / 2)"), r["tokens"])
check("deploy job: counts by conclusion", r["deploy_job"] == "failure 1, success 2", r["deploy_job"])
ms3 = [m("f" * 40, 10, "qa: capability R1.45 — Partial, QA-796 open, regression R1.24", app=False, first=9),
       m("g" * 40, 11, "records: qa 1 after-merge — regressions R1.42", app=False, first=10),
       m("h" * 40, 12, "runtime: R1.5 — x", first=11), m("i" * 40, 13, 'Revert "runtime: R1.5 — x"', first=12)]
r3 = M.compute(ms3, {}, [], T0, T1, runs=[])
check("rework: qa and records PRs that mention QA-n or regressions are not rework; the Revert is", r3["rework_n"] == 1, r3["rework_n"])
check("a Revert \"<title>\" PR finds the PR it reverts: one failure, recovered in 1 h", [f["what"] for f in r3["fails"]] == ["revert of hhhhhhhhh"] and r3["recovery_median_h"] == 1, r3["fails"])
r2 = M.compute([], {}, [(h(-50), 10, "A1")], T0, T1, runs="HTTP 403")
check("no readings in the window: tokens unreadable, never 0", r2["tokens"].startswith("unreadable (cockpit/usage-log.tsv has no reading in the window; last"), r2["tokens"])
check("no deployments: change fail rate and rework unreadable, never 0", r2["cfr"] is None and r2["rework"] is None and r2["lead_median_h"] is None, r2)
check("GitHub unreadable: said so", r2["deploy_job"] == "unreadable (HTTP 403)", r2["deploy_job"])
rows = M.read_usage("time_ist\tweekly_pct\taccount\tby\n2026-11-15T11:51:02+05:30\t91\tA1\tLead 55\nbad line\n")
check("usage-log.tsv: the header and bad lines are skipped", len(rows) == 1 and rows[0][1] == 91 and rows[0][2] == "A1", rows)
print(f"test_measures: {'all passed' if not fails else f'{fails} failed'}")
sys.exit(1 if fails else 0)
