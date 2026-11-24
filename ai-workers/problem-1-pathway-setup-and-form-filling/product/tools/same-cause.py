#!/usr/bin/env python3
"""Same cause twice (A351 B1, founder 24 Nov): the second failed merge-queue batch in 12 h with the same suite and the same
first FAIL line is one ACT in the Lead's check, naming both runs, the pull requests in both, and the newest batch that passed
whole (main's last result for the suite). Report only: it holds, ejects and re-runs nothing.
  red     a suite row "FAIL" (not retried) or "failed twice" in a failed shard of a finished, failed ci run of a batch; a
          suite that passed on its retry is retry-watch.py's. Key = suite + its first try's words, ids in them made alike.
  once    suites that first share a cause at the same two runs are one ACT; a cause that fired is an info line with its
          count and the pull requests in every one of its runs, until 12 h pass without it.
  whole   runs and logs not read yet (at most JOBS a check, and about SECONDS) are an ACT, and nothing is judged from half a run.
Members and the batches ahead come from merge-queue-causes.py's own readers. State: <dir>/same-cause.json (read logs, fired
causes); missing or unreadable is an ACT and 12 h are read again. Reads only, US$0. Exit 0; lead-watch.sh counts the ACTs.
   python3 -I product/tools/same-cause.py --state DIR [--fixture FILE] [--now 2026-11-24T02:05:00Z]
Test: check-same-cause.sh, on the seven csdl3 batches of 24 Nov (real rows)."""
import argparse, importlib.util, json, os, re, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = "expat-ready/xpatready"; HOURS, JOBS, SECONDS = 12, 16, 20
spec = importlib.util.spec_from_file_location("mqc", os.path.join(HERE, "merge-queue-causes.py"))
mqc = importlib.util.module_from_spec(spec); spec.loader.exec_module(mqc)
Z = "%Y-%m-%dT%H:%M:%SZ"
ROW = re.compile(r"\| (check_[A-Za-z0-9_.-]+) \| (FAIL|failed twice) \| [^|]*\| (.*?) \|\s*$", re.M)
ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{20,}|\b[0-9a-f]{12,}\b|\b\d{4}-\d\d-\d\d(?:T[\d:.]+Z?)?")


def ist(s):
    return (datetime.strptime(s, Z) + timedelta(hours=5, minutes=30)).strftime("%d %b %H:%M IST")


def keys(log):
    out = {}
    for s, _, why in ROW.findall(log):
        out[s] = ID.sub("#", re.split(r" · (?:1st try|not retried)", why)[0].strip())
    return out


def api(path, raw=False):
    tok = os.environ.get("GITHUB_TOKEN") or subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["curl", "-sSL", "--fail", "--max-time", "40", "-H", "@-", f"https://api.github.com/repos/{REPO}/{path}"],
                       input=f"Authorization: Bearer {tok}\n", capture_output=True, text=True, errors="replace")   # the token on stdin, never in ps
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "GitHub read failed").splitlines()[-1][:100])
    return r.stdout if raw else json.loads(r.stdout)


def paged(path, field):
    out = []
    for n in range(1, 11):
        got = api(f"{path}{'&' if '?' in path else '?'}per_page=100&page={n}")[field]
        out += got
        if len(got) < 100:
            return out
    raise RuntimeError(f"{field}: more than 1000")


def batch(w):
    """One finished failed run → {run, batch, start, end, prs} (prs: its members and those ahead)."""
    p = api(f"pulls?state=all&head=expat-ready:{w['head_branch']}")
    p = p[0] if p else {"number": 0, "title": "", "body": ""}
    prs = mqc.members(p["title"].split(": ", 1)[-1]) + mqc.ahead(p["body"])
    return {"run": w["id"], "batch": p["number"], "start": w["run_started_at"], "end": w["updated_at"], "prs": sorted(set(prs))}


def live(st, since):
    """Runs whose every failed shard was read, and what is left; main's newest whole green batch."""
    budget, end = JOBS, time.time() + SECONDS
    runs = [w for w in paged(f"actions/workflows/ci.yml/runs?status=failure&created=%3E={since}", "workflow_runs") if w["head_branch"].startswith("mergify/")]
    left = unread = 0
    for w in sorted(runs, key=lambda x: x["updated_at"]):
        r = st["runs"].setdefault(str(w["id"]), {})
        if r.get("done") and r.get("end") == w["updated_at"]:
            continue
        if time.time() > end or budget <= 0:
            unread += 1; continue
        if r.get("end") != w["updated_at"] or "jobs" not in r:      # first seen, or run again since: its parts are listed once
            r.clear(); r.update(batch(w), jobs=[j["id"] for j in paged(f"actions/runs/{w['id']}/jobs", "jobs") if j["conclusion"] == "failure" and j["name"].startswith("shard")])
        jobs = r["jobs"]
        todo = [str(j) for j in jobs if str(j) not in st["logs"]][:budget if time.time() < end else 0]; budget -= len(todo)
        with ThreadPoolExecutor(8) as pool:
            got = list(pool.map(lambda i: (i, keys(api(f"actions/jobs/{i}/logs", raw=True))), todo))
        st["logs"].update(got)
        missing = [j for j in jobs if str(j) not in st["logs"]]
        left += len(missing)
        if not missing:
            r["fails"] = {}
            for j in jobs:
                r["fails"].update(st["logs"].pop(str(j)))
            r["done"] = True
    g = [w for w in api("actions/workflows/ci.yml/runs?status=success&per_page=30")["workflow_runs"] if w["head_branch"].startswith("mergify/")]
    g = max(g, key=lambda w: w["updated_at"], default=None)
    return (left, unread), ({"run": g["id"], "end": g["updated_at"]} if g else None)


def main():
    a = argparse.ArgumentParser(); a.add_argument("--state", required=True); a.add_argument("--fixture"); a.add_argument("--now"); o = a.parse_args()
    now = (datetime.fromisoformat(o.now.replace("Z", "+00:00")) if o.now else datetime.now(timezone.utc)).astimezone(timezone.utc)
    since = (now - timedelta(hours=HOURS)).strftime(Z); f = os.path.join(o.state, "same-cause.json"); os.makedirs(o.state, exist_ok=True)
    why, st = "", {"runs": {}, "logs": {}, "fired": {}}
    try:
        st = json.load(open(f))
        if not all(isinstance(st[k], dict) for k in ("runs", "logs", "fired")):
            raise ValueError
    except FileNotFoundError:
        why = "missing"
    except Exception as e:
        why, st = f"unreadable ({type(e).__name__})", {"runs": {}, "logs": {}, "fired": {}}
    if why:
        print(f"ACT   same cause: memory {why}: {f}; the last {HOURS} h are read again")
    (left, unread), green = (0, 0), None
    if o.fixture:
        d = json.load(open(o.fixture)); green = d.get("green")
        for r in d["runs"]:
            if r["end"] <= now.strftime(Z):
                st["runs"][str(r["run"])] = {**r, "done": True}
    else:
        try:
            (left, unread), green = live(st, since)
        except Exception as e:
            print(f"ACT   same cause: not read ({type(e).__name__}: {str(e)[:100]}): judged on what was read before")
    st["runs"] = {k: r for k, r in st["runs"].items() if r.get("end", "9") >= since}
    runs = sorted((r for r in st["runs"].values() if r.get("done")), key=lambda r: r["end"])
    by = {}
    for r in runs:
        for s, w in r["fails"].items():
            by.setdefault(f"{s} · {w}", []).append(r)
    shared = {k: rs for k, rs in by.items() if len({r["run"] for r in rs}) > 1}
    fired = {k: v for k, v in st["fired"].items() if k in by}      # a cause with no red run in 12 h is forgotten
    new = {}
    for k, rs in shared.items():
        if k not in fired:
            new.setdefault((rs[0]["run"], rs[1]["run"]), []).append(k)
        fired[k] = len(rs)
    for (x, y), ks in sorted(new.items()):
        one, two = (next(r for r in runs if r["run"] == i) for i in (x, y)); both = sorted(set(one["prs"]) & set(two["prs"]))
        g = f"run {green['run']}, {ist(green['end'])}" if green else "none read"
        print(f"ACT   same cause: {len(ks)} failure{'s' * (len(ks) > 1)} alike in batch #{one['batch']} (run {one['run']}, {ist(one['end'])}) and #{two['batch']} (run {two['run']}, {ist(two['end'])}); "
              f"pull requests in both: {' '.join('#%d' % p for p in both) or 'none'}; newest batch green whole: {g}: " + " | ".join(k[:110] for k in sorted(ks)[:3])
              + (f" | and {len(ks) - 3} more" if len(ks) > 3 else ""))
    old = [k for k in shared if not any(k in ks for ks in new.values())]
    print(f"same cause {len(runs)} failed batches in {HOURS} h, {len(shared)} failures seen in two or more" + (f", {len(old)} already told" if old else "") )
    if left or unread:
        print(f"ACT   same cause: {left} red parts and {unread} whole failed batches not read yet (at most {JOBS} parts, about {SECONDS} s a check): the next check reads on")
    for k in sorted(old, key=lambda k: -len(shared[k]))[:5]:
        every = sorted(set.intersection(*(set(x["prs"]) for x in shared[k])))
        print(f"      again  {len(shared[k])} runs, in every one: {' '.join('#%d' % p for p in every) or 'no pull request'}: {k[:130]}")
    st["fired"] = fired; tmp = f"{f}.{os.getpid()}"
    json.dump(st, open(tmp, "w")); os.replace(tmp, f)


try:
    main()
except (Exception, SystemExit) as e:   # said, never a silent pass
    print(f"ACT   same cause: not measured ({type(e).__name__}: {str(e)[:120]})")
