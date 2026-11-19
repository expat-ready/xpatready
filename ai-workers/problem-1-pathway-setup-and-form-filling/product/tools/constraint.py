#!/usr/bin/env python3
# Constraint (ENF-738, P-738, 19 Nov): the bottleneck of the merge pipe, measured from GitHub at every Lead check, never
# guessed (19 Nov: a "machine wait" claimed by the Lead measured 0.1 min; the real cause was 8 test parts of 43-60 min).
# Over the last 3 h of ci runs on mergify/merge-queue/* heads: median batch wall time, longest shard job and its suite
# step, longest job wait (created to started), failed batches with their PRs, median approved-to-merged (last
# "review: approved" label to merge) and merges per hour. Then one line: "ACT   constraint: <name> — <number> — <fix>",
# or "constraint: none — ..." (not an ACT: lead-watch.sh counts ACT lines). Checked in this order, first hit wins
# (upstream first: more shards on starved machines would make it worse):
#   machines (job wait > 5 min) › test parts (longest part > 30 min) › faulty PRs reach batches (>= 2 failed batches)
#   › queue capacity (approved-to-merged > 60 min, nothing failing). Others over their line are listed after it.
# GitHub unreadable = an ACT, never a silent pass. GET only, US$0; every call times out at 8 s and none starts after 40 s.
# Usage: python3 -I product/tools/constraint.py [--hours 3] [--facts F | --save-facts F]   Test: check-constraint.sh
import argparse, json, os, re, statistics, subprocess, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

API, LABEL, T0 = os.environ.get("GITHUB_API_URL", "https://api.github.com"), "review: approved", time.time()
WAIT_MIN, PART_MIN, FAILED_N, A2M_MIN, MAX_RUNS, MAX_PRS = 5, 30, 2, 60, 40, 40

def t(s): return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
def mins(a, b): return (t(b) - t(a)).total_seconds() / 60 if a and b else None
def med(xs): return statistics.median(xs) if xs else None
def f(x): return "?" if x is None else f"{x:.1f} min"

def repo():
    if os.environ.get("GITHUB_REPOSITORY"): return os.environ["GITHUB_REPOSITORY"]
    u = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", u) or re.search(r"/git/([^/]+/[^/.]+)", u)
    return m.group(1) if m else sys.exit("constraint: origin is not a github.com URL")

def token():
    if os.environ.get("GITHUB_TOKEN"): return os.environ["GITHUB_TOKEN"]
    try: return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError): return ""

def get(path, tok):
    if time.time() - T0 > 40: raise TimeoutError(f"40 s budget spent before {path}")
    # The token reaches curl on stdin (-H @-), never on its command line, where ps would show it.
    r = subprocess.run(["curl", "-sSL", "--fail", "--max-time", "8", "-H", "@-", "-H", "Accept: application/vnd.github+json",
                        f"{API}/{path}"], input=f"Authorization: Bearer {tok}\n" if tok else "\n", capture_output=True, text=True)
    if r.returncode: raise OSError(f"GET {path.split('?')[0]}: {r.stderr.strip()[:120]}")
    return json.loads(r.stdout)

def fetch(hours):
    R, tok, now = repo(), token(), datetime.now(timezone.utc)
    since = (now - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    runs = get(f"repos/{R}/actions/workflows/ci.yml/runs?per_page=100&created=%3E%3D{since}", tok)["workflow_runs"]
    runs = [r for r in runs if r["head_branch"].startswith("mergify/merge-queue/")][:MAX_RUNS]
    q = urllib.parse.quote(f"repo:{R} is:pr is:merged merged:>={since}")
    merged = get(f"search/issues?q={q}&per_page={MAX_PRS}", tok)["items"][:MAX_PRS]
    with ThreadPoolExecutor(8) as ex:
        jobs = list(ex.map(lambda r: get(f"repos/{R}/actions/runs/{r['id']}/jobs?per_page=100", tok)["jobs"], runs))
        events = list(ex.map(lambda p: get(f"repos/{R}/issues/{p['number']}/events?per_page=100", tok), merged))
    def approved(evs, merged_at):
        ts = [e["created_at"] for e in evs if e["event"] == "labeled" and e.get("label", {}).get("name") == LABEL and e["created_at"] <= merged_at]
        return max(ts) if ts else None
    return {"now": now.isoformat(), "hours": hours,
            "runs": [{k: r[k] for k in ("id", "display_title", "status", "conclusion", "run_started_at", "updated_at")} |
                     {"jobs": [{k: j[k] for k in ("name", "created_at", "started_at", "completed_at")} |
                               {"suite_min": next((mins(s["started_at"], s["completed_at"]) for s in j.get("steps") or []
                                                   if s["name"].startswith("studio suites") and s.get("completed_at")), None)} for j in js]}
                     for r, js in zip(runs, jobs)],
            "merged": [{"number": p["number"], "merged_at": p["pull_request"]["merged_at"],
                        "approved_at": approved(e, p["pull_request"]["merged_at"])} for p, e in zip(merged, events)]}

def members(title):  # "merge queue: checking #1 + #2 together on main (sha), stacked on #3" / "merge queue: merged #1, #2: ..."
    head = re.sub(r"^merge queue:\s*", "", title)
    return re.findall(r"#(\d+)", re.split(r" on main|: ", head)[0])

def report(F):
    now, runs, out = F["now"], F["runs"], []
    wall = [mins(r["run_started_at"], r["updated_at"]) for r in runs if r["status"] == "completed" and r["conclusion"] in ("success", "failure")]
    jobs = [(r, j) for r in runs for j in r["jobs"]]
    waits = [(mins(j["created_at"], j["started_at"] or now), r, j) for r, j in jobs if j["created_at"]]
    parts = [(mins(j["started_at"], j["completed_at"] or now), r, j) for r, j in jobs if j["name"].startswith("shard") and j["started_at"]]
    failed = [r for r in runs if r["conclusion"] == "failure"]
    a2m = [mins(p["approved_at"], p["merged_at"]) for p in F["merged"] if p["approved_at"]]
    w, p = max(waits, key=lambda x: x[0], default=(None,)), max(parts, key=lambda x: x[0], default=(None,))
    m_a2m, h = med(a2m), F["hours"]
    out.append(f"constraint data, last {h} h: {len(runs)} batch runs · median batch {f(med(wall))} ({len(wall)} finished)")
    out.append(f"      longest part {f(p[0])}" + (f" ({p[2]['name']}, run {p[1]['id']}; suite step {f(p[2]['suite_min'])})" if p[0] is not None else ""))
    out.append(f"      longest job wait {f(w[0])}" + (f" ({w[2]['name'][:40]}, run {w[1]['id']})" if w[0] is not None else ""))
    out.append(f"      failed batches {len(failed)}" + "".join(f" · run {r['id']}: #{' #'.join(members(r['display_title'])) or '?'}" for r in failed))
    out.append(f"      approved to merged median {f(m_a2m)} ({len(a2m)} of {len(F['merged'])} merged PRs carried the label) · merges per hour {len(F['merged']) / h:.1f}")
    hits = []
    if w[0] is not None and w[0] > WAIT_MIN: hits.append(("machines", f"job wait {f(w[0])}", "more runners or fewer parallel jobs (GitHub plan, SHARDS)"))
    if p[0] is not None and p[0] > PART_MIN: hits.append(("test parts", f"longest part {f(p[0])} ({p[2]['name']})", "split the longest suite or raise SHARDS"))
    if len(failed) >= FAILED_N: hits.append(("faulty PRs reach batches", f"{len(failed)} failed batches in {h} h", "CI-PRE: full run before the label"))
    if not failed and m_a2m is not None and m_a2m > A2M_MIN: hits.append(("queue capacity", f"approved to merged median {f(m_a2m)}", "more parallel batches"))
    if hits:
        out.append(f"ACT   constraint: {hits[0][0]} — {hits[0][1]} — {hits[0][2]}")
        if hits[1:]: out.append("      also over its line: " + "; ".join(f"{n} ({m})" for n, m, _ in hits[1:]))
    else:
        out.append(f"constraint: none — wait {f(w[0])}, part {f(p[0])}, {len(failed)} failed, approved to merged {f(m_a2m)} — no change")
    return out

def main():
    a = argparse.ArgumentParser(); a.add_argument("--hours", type=int, default=3); a.add_argument("--facts"); a.add_argument("--save-facts")
    a = a.parse_args()
    try:
        F = json.load(open(a.facts)) if a.facts else fetch(a.hours)
    except (OSError, ValueError, KeyError, TimeoutError) as e:
        print(f"ACT   constraint: unreadable — {str(e)[:160]} — read GitHub, then measure again (P-738: never guessed)"); return 1
    if a.save_facts: json.dump(F, open(a.save_facts, "w"), indent=1)
    out = report(F); print("\n".join(out)); return sum(l.startswith("ACT") for l in out)

if __name__ == "__main__":
    sys.exit(main())
