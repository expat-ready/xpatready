#!/usr/bin/env python3
"""Runs that never started (OS-52, design/os-backlog.md; full-power #158; P-339b). A run that ends `startup_failure` ran no
job: usually its workflow file is broken (a YAML or expression error, a bad reusable workflow, a refused permission), so
every later run of that workflow fails the same way and its check never reports. Nothing showed it before: queue-depth.py
counts it as a failure, the board only colours it. Here each workflow with one or more such runs created since --since is
one ACT: the workflow, how many, the newest run's link and branch.
Reads GitHub's Actions runs (created since --since, newest first, at most 10 pages of 100); a read that fails or is cut
short is an ACT and what was read is still judged. Reads only, US$0. Exit 0; lead-watch.sh counts the ACT lines.
  python3 -I product/tools/startup-failures.py --since 2026-11-25T05:00:00Z
Env: STARTUP_GH (stand-in gh, for tests). Test: check-startup-failures.sh."""
import argparse, json, os, re, shlex, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES, PER = 10, 100


def clean(s, n=80):
    s = re.sub(r"[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2066-\u2069]+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[:n - 1] + "…"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--since", required=True); a = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", a.since):
        print(f"ACT   startup failures: --since {clean(a.since, 30)} is not an ISO UTC time: not read"); return 0
    gh = shlex.split(os.environ.get("STARTUP_GH") or f"bash {shlex.quote(os.path.join(HERE, 'gh.sh'))}")
    runs, out, whole = [], [], True
    for page in range(1, PAGES + 1):
        r = subprocess.run(gh + ["api", f"repos/{{owner}}/{{repo}}/actions/runs?created=%3E%3D{a.since}&per_page={PER}&page={page}"],
                           capture_output=True, text=True, timeout=90)
        try:
            assert r.returncode == 0
            got = json.loads(r.stdout).get("workflow_runs")
            assert isinstance(got, list)
        except Exception:
            out.append(f"ACT   startup failures: runs page {page} unreadable ({clean(r.stderr or r.stdout, 60)}): some runs not judged"); whole = False; break
        runs += got
        if len(got) < PER:
            break
    else:
        out.append(f"ACT   startup failures: more than {PAGES * PER} runs since {a.since}: the oldest not judged"); whole = False
    bad = {}
    for x in runs:
        if isinstance(x, dict) and x.get("conclusion") == "startup_failure" and (x.get("created_at") or "") >= a.since:
            bad.setdefault(x.get("name") or x.get("path") or "?", []).append(x)
    for name in sorted(bad):
        rs = sorted(bad[name], key=lambda x: x.get("created_at") or "", reverse=True); new = rs[0]
        out.append(f"ACT   startup failure: workflow {clean(name, 50)} ({clean(new.get('path'), 60)}): {len(rs)} run(s) since {a.since} ran no job; "
                   f"newest {clean(new.get('html_url'), 90)} on {clean(new.get('head_branch'), 50)}: read its file (YAML, expressions, permissions)")
    out.append(f"startup failures: {sum(len(v) for v in bad.values())} run(s) in {len(bad)} workflow(s) of {len(runs)} runs since {a.since}"
               + ("" if whole else " (read cut short)"))
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
