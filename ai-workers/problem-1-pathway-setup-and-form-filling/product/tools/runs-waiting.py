#!/usr/bin/env python3
"""Actions runs waiting for a machine (B206 part 1, P-751, P-738 (3)): only runs created under 6 hours ago count.

Measured 20 Nov 10:2x IST: both Mac runners online and idle, yet the check said "4 waiting for a machine"; the four were
runs queued since 12 Nov (43098053168, 43098053155, 43098053395, 43098053377) that no machine will take. They are listed
apart on one "stale" line, never counted and never cancelled (P-371: never cancel a CI run; the Lead decides).

Input: GitHub's /repos/{repo}/actions/runs?status=queued&per_page=100 JSON, from --runs FILE (tests) or read with gh.
Output: two lines for lead-watch.sh, or --json for the constraint section (part 4) and the board.
  python3 product/tools/runs-waiting.py [--runs FILE] [--now ISO] [--json] [--save FILE (the --json form, beside the lines)]
Test: check-runs-waiting.sh. US$0, read-only.
"""
import json, subprocess, sys
from datetime import datetime, timedelta, timezone

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
                   + (f", since {since.strftime('%-d %b')}" if since else "") + ": "
                   + " ".join(str(s["id"]) for s in m["stale"]))
    if m["total_queued"] and m["total_queued"] > m["read"]:
        out.append(f"warn  {m['total_queued']} queued runs, only the newest {m['read']} read")
    return out


def main(argv):
    a = {"--runs": None, "--now": None, "--save": None}; js = "--json" in argv
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
    if a["--save"]:
        with open(a["--save"], "w") as f:
            json.dump(m, f)
    if "error" in m:
        print(json.dumps(m) if js else f"runs  waiting for a machine: not measured ({m['error'][:80]})")
        return 0
    print(json.dumps(m) if js else "\n".join(lines(m)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
