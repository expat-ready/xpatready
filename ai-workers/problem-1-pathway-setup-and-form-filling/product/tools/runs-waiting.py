#!/usr/bin/env python3
"""Actions runs waiting for a machine (B206 part 1, P-751, P-738 (3)): only runs created under 6 hours ago count.

Measured 20 Nov 10:2x IST: both Mac runners online and idle, yet the check said "4 waiting for a machine"; the four were
runs queued since 12 Nov (43098053168, 43098053155, 43098053395, 43098053377) that no machine will take. They are listed
apart on one "stale" line, never counted and never cancelled (P-371: never cancel a CI run; the Lead decides).

Input: GitHub's /repos/{repo}/actions/runs?status=queued&per_page=100 JSON, from --runs FILE (tests) or read with gh.
Jobs running now (P-789 (2), founder 22 Nov: the jam line printed a fixed job limit nobody measured): the runs with
status in_progress and, for each, its jobs with status in_progress, counted from the Actions API; --running FILE (tests)
gives {"workflow_runs": [...], "jobs": {"<run id>": {"jobs": [...]}}}. Printed on its own "jobs" line, never a fixed limit.
Output: two lines for lead-watch.sh, or --json for the constraint section (part 4) and the board.
  python3 product/tools/runs-waiting.py [--runs FILE] [--running FILE] [--now ISO] [--json] [--save FILE (the --json form, beside the lines)]
Test: check-runs-waiting.sh. US$0, read-only.
"""
import json, subprocess, sys
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))   # times as the Lead reads them (P-302)
FRESH_H = 6   # older than this, a queued run is stale: no machine took it, and none will by waiting longer


def parse(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def split(runs, now):
    """(fresh, stale): queued runs created under FRESH_H hours before now, and the rest; a run with no readable time is
    fresh (counted, never hidden)."""
    fresh, stale = [], []
    for r in runs or []:
        if r.get("status") not in (None, "queued"):
            continue
        c = parse(r.get("created_at"))
        (stale if c and now - c >= timedelta(hours=FRESH_H) else fresh).append(r)
    return fresh, stale


def measure(doc, now):
    runs = (doc or {}).get("workflow_runs") or []
    fresh, stale = split(runs, now)
    ages = [round((now - c).total_seconds() / 60) for c in (parse(r.get("created_at")) for r in fresh) if c]
    stale.sort(key=lambda r: r.get("created_at") or "")
    return {"fresh": len(fresh), "oldest_fresh_min": max(ages) if ages else None,
            "stale": [{"id": r.get("id"), "created_at": r.get("created_at"), "name": r.get("name")} for r in stale],
            "total_queued": (doc or {}).get("total_count", len(runs)), "read": len(runs)}


def lines(m):
    out = [f"runs  {m['fresh']} Actions run(s) waiting for a machine (created under {FRESH_H} h)"
           + (f", oldest {m['oldest_fresh_min']} min" if m["oldest_fresh_min"] is not None else "")]
    if m["stale"]:
        since = parse(m["stale"][0]["created_at"])
        out.append(f"stale {len(m['stale'])} run(s) queued over {FRESH_H} h, not counted, never cancelled (P-371)"
                   + (f", since {since.astimezone(IST).strftime('%-d %b %H:%M IST')}" if since else "") + ": "
                   + " ".join(str(s["id"]) for s in m["stale"]))
    if m["total_queued"] and m["total_queued"] > m["read"]:
        out.append(f"warn  {m['total_queued']} queued runs, only the newest {m['read']} read")
    return out


def gh_json(path):
    tools = __file__.rsplit("/", 1)[0]
    p = subprocess.run(["bash", f"{tools}/gh.sh", "api", path], capture_output=True, text=True, timeout=60)
    if p.returncode != 0:   # gh prints GitHub's error body on stdout too: never read it as a count
        raise ValueError(f"gh api exit {p.returncode}: {(p.stdout or p.stderr).strip()[:120]}")
    return json.loads(p.stdout)


def running(doc):
    """Jobs running now: jobs with status in_progress across the runs with status in_progress (P-789 (2))."""
    runs = [r for r in (doc or {}).get("workflow_runs") or [] if r.get("status") in (None, "in_progress")]
    jobs = (doc or {}).get("jobs") or {}
    n = 0
    for r in runs:
        j = jobs.get(str(r.get("id")))
        if not isinstance(j, dict) or not isinstance(j.get("jobs"), list):
            raise ValueError(f"jobs of run {r.get('id')} unreadable")
        n += sum(1 for x in j["jobs"] if x.get("status") == "in_progress")
    return {"jobs": n, "runs": len(runs)}


def read_running():
    doc = gh_json("repos/{owner}/{repo}/actions/runs?status=in_progress&per_page=100")
    if not isinstance(doc.get("workflow_runs"), list):
        raise ValueError("no workflow_runs in the in_progress answer")
    doc["jobs"] = {str(r["id"]): gh_json(f"repos/{{owner}}/{{repo}}/actions/runs/{r['id']}/jobs?filter=latest&per_page=100")
                   for r in doc["workflow_runs"]}
    return doc


def running_line(rn):
    if "error" in rn:
        return f"jobs  running now: not measured ({rn['error'][:80]})"
    return f"jobs  {rn['jobs']} job(s) running now across {rn['runs']} in-progress run(s) (measured, Actions API)"


def main(argv):
    a = {"--runs": None, "--running": None, "--now": None, "--save": None}; js = "--json" in argv
    for i, x in enumerate(argv):
        if x in a and i + 1 < len(argv):
            a[x] = argv[i + 1]
    now = parse(a["--now"]) if a["--now"] else datetime.now(timezone.utc)
    try:
        if a["--runs"]:
            doc = json.load(open(a["--runs"]))
        else:
            tools = __file__.rsplit("/", 1)[0]
            p = subprocess.run(["bash", f"{tools}/gh.sh", "api", "repos/{owner}/{repo}/actions/runs?status=queued&per_page=100"],
                               capture_output=True, text=True, timeout=60)
            if p.returncode != 0:   # gh prints GitHub's error body on stdout too: never read it as "0 waiting"
                raise ValueError(f"gh api exit {p.returncode}: {(p.stdout or p.stderr).strip()[:120]}")
            doc = json.loads(p.stdout)
        if not (isinstance(doc, dict) and isinstance(doc.get("workflow_runs"), list)):
            raise ValueError("no workflow_runs in the answer: " + str(doc.get("message") if isinstance(doc, dict) else type(doc).__name__)[:120])
        m = measure(doc, now)
    except Exception as e:   # any unreadable answer is "not measured", never a traceback and never 0
        m = {"error": str(e)[:200]}
    try:   # P-789 (2): measured, never the plan's figure; unreadable is said, never 0
        rn = running(json.load(open(a["--running"])) if a["--running"] else (read_running() if not a["--runs"] else None))
        if rn is None:
            raise ValueError("--runs given without --running")
    except Exception as e:
        rn = {"error": str(e)[:200]}
    if "error" not in m:
        m["running"] = rn
    if a["--save"]:
        with open(a["--save"], "w") as f:
            json.dump(m, f)
    if "error" in m:
        print(json.dumps(m) if js else f"runs  waiting for a machine: not measured ({m['error'][:80]})\n{running_line(rn)}")
        return 0
    print(json.dumps(m) if js else "\n".join(lines(m) + [running_line(rn)]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
