#!/usr/bin/env python3
"""Same cause twice (A351 B1, founder 24 Nov): the second failed merge-queue batch in 12 h with the same suite and the same
first FAIL line is one ACT in the Lead's check, naming both runs, the pull requests in both, and the newest batch that passed
whole (main's last result for the suite). Report only: it holds, ejects and re-runs nothing.
  red     a suite row "FAIL" (not retried) or "failed twice" in a failed shard of a finished, failed ci run of a batch; a
          suite that passed on its retry is retry-watch.py's. Key = suite + its first try's FAIL line or error, ids in it made
          alike; a row with neither is counted, never compared. A red part with no suite row at all is an ACT.
  once    suites that first share a cause at the same two runs are one ACT; a cause that fired is an info line with its
          count and the pull requests in every one of its runs, until 12 h pass without it.
  green   the newest batch whose suite parts ran and passed (a batch that skips them, such as records, says nothing).
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
NAMED = re.compile(r"\bFAIL +\S|(?<![\w\[])\w*Error(?: \[\w+\])?: \S|\bSTOPPED after \S")   # a FAIL or STOPPED line, or an error with words; a bare "name: 'TimeoutError'", "STOP the copy" or an empty reason names no cause
ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}(?:-[0-9a-f]*)*|\b[0-9a-f]{12,}\b|\b\d{4}-\d\d-\d\d(?:T[\d:.]+Z?)?")


def ist(s):
    return (datetime.strptime(s, Z) + timedelta(hours=5, minutes=30)).strftime("%d %b %H:%M IST")


def keys(log):
    """{suite: its first try's words} of the red rows; a row that names no cause has empty words; no row at all: {}."""
    out = {}
    for s, what, why in ROW.findall(log):
        w = re.split(r" · not retried", why)[0]
        if what == "failed twice" and " · 1st try " in w:
            w = w.split(" · 1st try ", 1)[1]
        out[s] = ID.sub("#", w.strip()) if NAMED.search(w) else ""
    return out


TOK = []


def api(path, raw=False):
    if not TOK:
        TOK.append(os.environ.get("GITHUB_TOKEN") or subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=20).stdout.strip())
    tok = TOK[0]
    r = subprocess.run(["curl", "-sSL", "--fail", "--max-time", "20", "-H", "@-", f"https://api.github.com/repos/{REPO}/{path}"],
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
    if not p:
        raise RuntimeError(f"no pull request found for batch branch {w['head_branch']}")
    p = p[0]
    prs = mqc.members(p["title"].split(": ", 1)[-1]) + mqc.ahead(p["body"])
    return {"run": w["id"], "batch": p["number"], "start": w["run_started_at"], "end": w["updated_at"], "prs": sorted(set(prs))}


def log(i):
    try:
        return i, keys(api(f"actions/jobs/{i}/logs", raw=True)), ""
    except Exception as e:
        return i, None, str(e)[:60]


def live(st, since):
    """(red parts left, whole runs left, what could not be read), the newest green batch. One unreadable log or run never
    stops the others."""
    budget, end, left, unread, bad = JOBS, time.time() + SECONDS, 0, 0, []
    runs = [w for w in paged(f"actions/workflows/ci.yml/runs?status=failure&created=%3E={since}", "workflow_runs") if w["head_branch"].startswith("mergify/")]
    st["runs"] = {k: r for k, r in st["runs"].items() if k in {str(w["id"]) for w in runs}}    # run again and green, or aged out
    for w in sorted(runs, key=lambda x: x["updated_at"]):
        r = st["runs"].get(str(w["id"]), {})
        if r.get("done") and r.get("end") == w["updated_at"]:
            continue
        if time.time() > end or budget <= 0:
            unread += 1; continue
        try:
            if r.get("end") != w["updated_at"] or "jobs" not in r:      # first seen, or run again since: its parts are listed once
                r = {**batch(w), "jobs": [j["id"] for j in paged(f"actions/runs/{w['id']}/jobs", "jobs") if j["conclusion"] == "failure" and j["name"].startswith("shard")]}
                st["runs"][str(w["id"])] = r
        except Exception as e:
            bad.append(f"run {w['id']}: {str(e)[:60]}"); continue
        todo = [str(j) for j in r["jobs"] if str(j) not in st["logs"] and st["tries"].get(str(j), 0) < 3][:budget if time.time() < end else 0]; budget -= len(todo)
        with ThreadPoolExecutor(8) as pool:
            for i, k, err in pool.map(log, todo):
                if err:
                    st["tries"][i] = st["tries"].get(i, 0) + 1
                else:
                    st["logs"][i] = k
        missing = [j for j in r["jobs"] if str(j) not in st["logs"]]
        dead = [j for j in missing if st["tries"].get(str(j))]; left += len(missing) - len(dead)
        if dead:
            bad.append(f"part {dead[0]}" + (f" and {len(dead) - 1} more" if len(dead) > 1 else "") + f" of run {w['id']}: log not given (3 tries, then left alone)")
        if not missing:
            r["fails"], r["blank"] = {}, 0
            for j in r["jobs"]:
                k = st["logs"].pop(str(j)); r["fails"].update(k); r["blank"] += not k
            r["done"] = True
    keep = {str(j) for r in st["runs"].values() if not r.get("done") for j in r.get("jobs", [])}
    st["logs"] = {k: v for k, v in st["logs"].items() if k in keep}
    green = None
    for n in (1, 2, 3):
        got = api(f"actions/workflows/ci.yml/runs?status=success&created=%3E={since}&per_page=100&page={n}")["workflow_runs"]
        for w in sorted((w for w in got if w["head_branch"].startswith("mergify/")), key=lambda w: w["updated_at"], reverse=True):
            k = str(w["id"])
            if k not in st["ran"]:
                if time.time() > end + SECONDS:
                    break
                st["ran"][k] = any(j["name"].startswith("shard") and j["conclusion"] == "success" for j in paged(f"actions/runs/{k}/jobs", "jobs"))
            if st["ran"][k]:
                green = {"run": w["id"], "end": w["updated_at"]}; break
        if green or len(got) < 100:
            break
    return (left, unread, bad), green


def memory(f):
    try:
        st = json.load(open(f))
        ok = all(isinstance(st.get(k), dict) for k in ("runs", "logs", "fired", "ran", "tries")) and all(
            isinstance(r, dict) and isinstance(r.get("end"), str) and isinstance(r.get("prs"), list) and (not r.get("done") or isinstance(r.get("fails"), dict)) for r in st["runs"].values())
        return (st, "") if ok else (None, "not as written")
    except FileNotFoundError:
        return None, "missing"
    except Exception as e:
        return None, f"unreadable ({type(e).__name__})"


def main():
    a = argparse.ArgumentParser(); a.add_argument("--state", required=True); a.add_argument("--fixture"); a.add_argument("--now"); o = a.parse_args()
    now = (datetime.fromisoformat(o.now.replace("Z", "+00:00")) if o.now else datetime.now(timezone.utc)).astimezone(timezone.utc)
    since = (now - timedelta(hours=HOURS)).strftime(Z); f = os.path.join(o.state, "same-cause.json"); os.makedirs(o.state, exist_ok=True)
    st, why = memory(f)
    st = st or {"runs": {}, "logs": {}, "fired": {}, "ran": {}, "tries": {}}
    if why:
        print(f"ACT   same cause: memory {why}: {f}; the last {HOURS} h are read again")
    (left, unread, bad), green = (0, 0, []), None
    if o.fixture:
        d = json.load(open(o.fixture)); green = d.get("green")
        for r in d["runs"]:
            if r["end"] <= now.strftime(Z):
                st["runs"][str(r["run"])] = {**r, "fails": keys("\n".join(r["rows"])), "rows": [], "done": True}
    else:
        try:
            (left, unread, bad), green = live(st, since)
        except Exception as e:
            print(f"ACT   same cause: not read ({type(e).__name__}: {str(e)[:100]}): judged on what was read before")
    st["runs"] = {k: r for k, r in st["runs"].items() if r.get("end", "9") >= since}
    runs = sorted((r for r in st["runs"].values() if r.get("done")), key=lambda r: r["end"])
    by, nameless = {}, 0
    for r in runs:
        for s, w in r["fails"].items():
            if not w:
                nameless += 1; continue
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
              f"pull requests in both: {' '.join('#%d' % p for p in both) or 'none'}; newest batch whose suites all passed: {g}: " + " | ".join(k[:110] for k in sorted(ks)[:3])
              + (" | and in " + " ".join(k.split(" · ")[0] for k in sorted(ks)[3:]) if len(ks) > 3 else ""))
    old = [k for k in shared if not any(k in ks for ks in new.values())]
    print(f"same cause {len(runs)} failed batches in {HOURS} h, {len(shared)} failures seen in two or more" + (f", {len(old)} already told" if old else "") + (f"; {nameless} red rows name no cause and are not compared" if nameless else "") )
    if left or unread:
        print(f"ACT   same cause: {left} red parts and {unread} whole failed batches not read yet (at most {JOBS} parts, about {SECONDS} s a check): the next check reads on")
    for b in bad[:3]:
        print(f"ACT   same cause: not read: {b}")
    if len(bad) > 3:
        print(f"ACT   same cause: not read: {len(bad) - 3} more")
    blank = [r for r in runs if r.get("blank")]
    if blank:
        print(f"ACT   same cause: {sum(r['blank'] for r in blank)} red parts hold no suite row (set-up, a cut log, or run-suites.sh's table changed): runs " + " ".join(str(r["run"]) for r in blank[:5]))
    for k in sorted(old, key=lambda k: -len(shared[k]))[:5]:
        every = sorted(set.intersection(*(set(x["prs"]) for x in shared[k])))
        print(f"      again  {len(shared[k])} runs, in every one: {' '.join('#%d' % p for p in every) or 'no pull request'}: {k[:130]}")
    if len(old) > 5:
        print(f"      again  {len(old) - 5} more causes")
    st["fired"] = fired; tmp = f"{f}.{os.getpid()}"
    json.dump(st, open(tmp, "w")); os.replace(tmp, f)


try:
    main()
except (Exception, SystemExit) as e:   # said, never a silent pass
    print(f"ACT   same cause: not measured ({type(e).__name__}: {str(e)[:120]})")
