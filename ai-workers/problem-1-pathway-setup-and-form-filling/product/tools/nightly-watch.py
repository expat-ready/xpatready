#!/usr/bin/env python3
"""The newest scheduled nightly must be green (E1, P-772, P-651; enforcement plan 21 Nov, audit item 2).

Measured 21 Nov: the scheduled nightly of 20 Nov (44656287758) ended "cancelled" (3 of 8 parts cut at 59 min) and the one
of 19 Nov (44440440980) "failure", and no check said so: main went two nights without a full test. lead-watch.sh now
prints one ACT line when the newest finished scheduled nightly is not green, naming the parts that were not, and one when
no scheduled nightly started in 30 h (GitHub dropped the schedule after the org move, 18 Nov). Hand-started runs
(workflow_dispatch: re-tests of named capabilities) never count. A run still going is said, and the one before it judged.

Input: GitHub's /repos/{repo}/actions/workflows/nightly.yml/runs?event=schedule JSON, from --runs FILE (tests) or gh;
the judged run's /jobs JSON, from --jobs FILE (tests) or gh (only when it is not green).
  python3 product/tools/nightly-watch.py [--runs FILE] [--jobs FILE] [--now ISO]
Output: lines for lead-watch.sh; exit 0 always (lead-watch counts the ACT lines). An unreadable answer is a "warn" line,
never a green verdict. Test: check-nightly-watch.sh. US$0, read-only: it never re-runs or cancels a run (P-371).
"""
import json, subprocess, sys
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))   # times as the Lead reads them (P-302)
MISSED_H = 30   # the cron is daily (20:23 UTC); no scheduled start in 30 h means a night was skipped
RUNS = "repos/{owner}/{repo}/actions/workflows/nightly.yml/runs?event=schedule&per_page=5"


def parse(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def ist(d):
    return d.astimezone(IST).strftime("%-d %b %H:%M IST") if d else "?"


def gh_json(path):
    tools = __file__.rsplit("/", 1)[0]
    p = subprocess.run(["bash", f"{tools}/gh.sh", "api", path], capture_output=True, text=True, timeout=60)
    if p.returncode != 0:   # gh prints GitHub's error body on stdout too: never read it as green
        raise ValueError(f"gh api exit {p.returncode}: {(p.stdout or p.stderr).strip()[:120]}")
    return json.loads(p.stdout)


def bad_parts(jobs_doc):
    """'suites (3) cancelled 59 min' for each job that ended neither success nor skipped."""
    out = []
    for j in (jobs_doc or {}).get("jobs") or []:
        c = j.get("conclusion")
        if c in ("success", "skipped") or j.get("status") != "completed":
            continue
        s, e = parse(j.get("started_at")), parse(j.get("completed_at"))
        out.append(f"{j.get('name', '?')} {c}" + (f" {round((e - s).total_seconds() / 60)} min" if s and e else ""))
    return out


def judge(runs_doc, now, jobs_for):
    """Lines for lead-watch.sh. jobs_for(run_id) returns the run's jobs JSON (or raises)."""
    if not (isinstance(runs_doc, dict) and isinstance(runs_doc.get("workflow_runs"), list)):
        raise ValueError("no workflow_runs in the answer: " + str(runs_doc.get("message") if isinstance(runs_doc, dict) else type(runs_doc).__name__)[:120])
    runs = [r for r in runs_doc["workflow_runs"] if r.get("event") == "schedule"]
    runs.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    out = []
    newest = parse(runs[0].get("created_at")) if runs else None
    if newest is None or now - newest >= timedelta(hours=MISSED_H):
        out.append(f"ACT   nightly: no scheduled run started in {MISSED_H} h (newest {ist(newest)}): the schedule may be dropped; "
                   "re-register the cron in nightly.yml or start it by hand (Run workflow on main)")
    going = [r for r in runs if r.get("status") != "completed"]
    done = [r for r in runs if r.get("status") == "completed"]
    if going:
        out.append(f"night nightly {going[0].get('id')} started {ist(parse(going[0].get('created_at')))} is still running")
    if not done:
        if runs:
            out.append("night no finished scheduled nightly in the newest 5")
        return out
    r = done[0]; rid = r.get("id"); c = r.get("conclusion")
    when = ist(parse(r.get("created_at"))); sha = (r.get("head_sha") or "")[:9]
    if c == "success":
        out.append(f"night nightly of {when} green on {sha} (run {rid})")
        return out
    try:
        parts = bad_parts(jobs_for(rid))
        detail = "; ".join(parts) if parts else "no failed job named"
    except Exception as e:   # the verdict stands without the parts
        detail = f"parts not read ({str(e)[:60]}...)"
    out.append(f"ACT   nightly of {when} ended {c} on {sha} (run {rid}): {detail}: main had no full test that night; "
               "read the run, fix or quarantine the red suite, or give the parts more room (nightly.yml)")
    return out


def main(argv):
    a = {"--runs": None, "--jobs": None, "--now": None}
    for i, x in enumerate(argv):
        if x in a and i + 1 < len(argv):
            a[x] = argv[i + 1]
    now = parse(a["--now"]) if a["--now"] else datetime.now(timezone.utc)
    jobs_for = (lambda rid: json.load(open(a["--jobs"]))) if a["--jobs"] else \
        (lambda rid: gh_json(f"repos/{{owner}}/{{repo}}/actions/runs/{int(rid)}/jobs?per_page=100"))
    try:
        doc = json.load(open(a["--runs"])) if a["--runs"] else gh_json(RUNS)
        lines = judge(doc, now, jobs_for)
    except Exception as e:   # unreadable is "not measured", never green and never a traceback
        lines = [f"warn  nightly: not measured ({str(e)[:100]})"]
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
