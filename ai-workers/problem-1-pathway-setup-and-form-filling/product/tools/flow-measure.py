#!/usr/bin/env python3
# Flow measure (P-371, 6 Nov): the three numbers the flow fix should move, read from GitHub's runs API, never estimated.
#   1. PR-check machine hours thrown away: hours of jobs in pull-request runs of ci.yml (not merge-queue batches) whose
#      run ended cancelled or failed, over all PR-check hours. P-371's baseline used this definition (59%); target under
#      20%. Split: cancelled, failed, and earlier attempts' failed jobs (a "Re-run failed jobs" keeps the rest).
#      Also: merge-queue batch runs and their failures; the draft "guard" runs on their own (P-371 (1)).
#   2. Records share of merges: merged PRs with no code (tools/change-kind.sh on the PR's files says notes or records:
#      no suite would run); notes only (every file a *.md record or under product/reports/) shown beside it.
#      Target under 20% of merges (the compass).
#   3. Approved-to-merged: from the last "review: approved" label to the merge, per merged PR; target under 1 hour.
#   4-8. Release 1 flow (ENF-782b, P-782 (3)): start to Proven, review rounds, first-time proof, reverse plan, queue
#      bounces; defined at new_measures() below. --lead prints only these, as 5 lines (lead-watch.sh step 5b).
# Read-only (GET only; --lead keeps its answer 30 min in $TMPDIR). Usage:
#   python3 -I product/tools/flow-measure.py --since 2026-11-04T00:00:00Z [--until <time>] [--max-runs 1000] [--json]
#   python3 -I product/tools/flow-measure.py --since today|<time> --lead [--json] [--cache-min 30] [--now <time>]
# Tests: test_flow_measure.py (no network; run by .github/workflows/cockpit-tests.yml). Needs main's history back to
# 14 Nov for measures 4 and 5 (a shallow clone's edge is a baseline, never a change: git fetch --shallow-since=2026-11-13 origin main).
# Auth: GITHUB_TOKEN in GitHub Actions; elsewhere FLOW_TOKEN if set, else none (a cloud session's proxy signs requests).
import argparse, functools, json, os, re, subprocess, sys, statistics, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

def _repo():
    # owner/name from GITHUB_REPOSITORY (Actions) or this clone's origin URL (no names written in project files).
    r = os.environ.get("GITHUB_REPOSITORY")
    if r:
        return r
    u = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", u)
    return m.group(1) if m else sys.exit("flow-measure: no GITHUB_REPOSITORY and origin is not a github.com URL")


REPO = _repo()
API = f"https://api.github.com/repos/{REPO}"
P = "ai-workers/problem-1-pathway-setup-and-form-filling"
TOKEN = os.environ.get("FLOW_TOKEN") or (os.environ.get("GITHUB_TOKEN") if os.environ.get("GITHUB_ACTIONS") == "true" else "")


def get(url, raw=False):
    # The token goes to curl on stdin (-H @-), never on its command line, where ps would show it (as merge-queue-causes.py).
    cmd = ["curl", "-sSL", "--max-time", "60", "--fail-with-body", "-H", "Accept: application/vnd.github+json"] + (["-H", "@-"] if TOKEN else [])
    err = ""
    for wait in (0, 2, 5, 10):   # our own retries: curl's --retry concatenates the bodies of its attempts
        time.sleep(wait)
        r = subprocess.run(cmd + [url], input=f"Authorization: Bearer {TOKEN}\n" if TOKEN else "", capture_output=True, text=True)
        if r.returncode == 0:
            if raw:
                return r.stdout
            try:
                return json.loads(r.stdout)
            except json.JSONDecodeError:
                pass
        err = f"{r.stdout[:300]} {r.stderr[:300]}"
    raise SystemExit(f"GET {url} failed: {err}")


def t(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if s else None


def runs_since(since, until, max_runs):
    out, page = [], 1
    q = f"created=%3E%3D{since.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    if until:
        q = f"created={since.strftime('%Y-%m-%dT%H:%M:%SZ')}..{until.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    while len(out) < max_runs:
        d = get(f"{API}/actions/workflows/ci.yml/runs?per_page=100&page={page}&{q}")
        rs = d.get("workflow_runs", [])
        out += rs
        if len(rs) < 100:
            break
        page += 1
    return out[:max_runs]


def jobs(run):
    js, page = [], 1
    while True:
        d = get(f"{API}/actions/runs/{run['id']}/jobs?filter=all&per_page=100&page={page}")
        js += d.get("jobs", [])
        if len(d.get("jobs", [])) < 100:
            return js
        page += 1


def secs(j):
    a, b = t(j.get("started_at")), t(j.get("completed_at"))
    if not a or not b or j.get("conclusion") == "skipped":
        return 0.0
    return max(0.0, (b - a).total_seconds())


HERE = os.path.dirname(os.path.abspath(__file__))


RISKY_MD = re.compile(rf"(^|/)(sources|code|archive|\.tools)/|^{P}/product/(DECISIONS\.md|decisions/|qa/CAPABILITIES\.md)|^{P}/prototype/(.*/)?prompts/|^{P}/prototype/studio/(api/src|tests/fixtures)/|^{P}/official-sources/")
NOTES_OK = set()   # .md paths select-suites.mjs was asked about in one batch and chose no suite for (prime_kinds)


def _md_only(files):
    return bool(files) and all((f.endswith(".md") or f.startswith(f"{P}/product/reports/")) and not RISKY_MD.search(f) for f in files)


def selects_code(files):
    # select-suites.mjs on these paths: change-kind.sh's "code" test (ALL, or a suite chosen for a reason other than smoke).
    r = subprocess.run(["node", os.path.join(HERE, "select-suites.mjs")], input="\n".join(files) + "\n", capture_output=True, text=True, cwd=os.path.join(HERE, "..", "..", "..", ".."))
    if r.returncode:
        return True   # unknown: let the script decide per PR
    return any(c[0] == "ALL" or (c[0] and (len(c) < 2 or c[1] != "smoke")) for c in (l.split("\t") for l in r.stdout.splitlines()))


def prime_kinds(filesets):
    """One select-suites.mjs call for every .md-only PR's files together (it takes ~2 s a call). When it picks no suite, each
    of those PRs is "notes" exactly as change-kind.sh would say; when it picks one (a .md a suite reads as data, such as
    STAND-INS.md), every such PR goes to change-kind.sh itself."""
    md = sorted({f for fs in filesets if _md_only(fs) for f in fs} - NOTES_OK)
    if md and not selects_code(md):
        NOTES_OK.update(md)


@functools.lru_cache(maxsize=None)
def _kind(files):
    return kind(list(files), cached=False)


def kind(files, cached=True):
    if cached:   # full mode asks twice per PR (records share, review rounds): one answer each
        return _kind(tuple(files))
    # tools/change-kind.sh --files on this checkout: notes, records or code (the same rule CI uses). Its "notes" case is
    # answered here only for .md-only PRs whose files prime_kinds() cleared with select-suites.mjs.
    if _md_only(files) and all(f in NOTES_OK for f in files):
        return "notes"
    r = subprocess.run(["bash", os.path.join(HERE, "change-kind.sh"), "--files"], input="\n".join(files) + "\n", capture_output=True, text=True)
    return r.stdout.strip() or "code"


def pr_facts(n):
    files, page = [], 1
    while True:
        d = get(f"{API}/pulls/{n}/files?per_page=100&page={page}")
        files += [f["filename"] for f in d]
        if len(d) < 100:
            break
        page += 1
    ev, page = [], 1
    while True:
        d = get(f"{API}/issues/{n}/events?per_page=100&page={page}")
        ev += d
        if len(d) < 100:
            break
        page += 1
    labels = [t(e["created_at"]) for e in ev if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == "review: approved"]
    return files, labels


def merged_prs(since, until):
    out, page = [], 1
    while True:
        d = get(f"{API}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page={page}")
        for p in d:
            m = t(p.get("merged_at"))
            if m and m >= since and (not until or m < until) and not p["head"]["ref"].startswith("mergify/"):
                out.append(p)
        if len(d) < 100 or (d and t(d[-1]["updated_at"]) < since):
            return out
        page += 1


# ---- ENF-782b (P-782 (3), founder 21 Nov): five flow measures for Release 1, each from GitHub or the repo, sample named (P-500).
#   a. Start to Proven per R1 row: the first PR that names the row (its title, or an "Item:" / "Completes:" line in its body;
#      records PRs "qa:" and "lead:" left out) opened, to the main commit that last turned the row to Works in
#      qa/CAPABILITIES.md (first-parent history of main: when the change reached main). Rows Works now only.
#   b. Review rounds per PR: comments whose first line starts "Reviewer:" (one verdict each), on the code PRs merged in the
#      window (change-kind.sh code, P-500); share over 2 rounds (P-277's limit).
#   c. First-time proof pass rate: R1 rows whose first qa score (Works, Partial or Broken) was Works.
#   d. Reverse plan: rows not Works now, days to the Release 1 date (29 Nov IST, P-609), proofs needed a day, against the
#      net change of Works rows over the last 24 h, and the IST date that rate reaches all rows.
#   e. Queue bounces: Mergify's own queue comments that ended "dequeued" in the window, by cause: the failing suites read
#      from the failing shard's log (as merge-queue-causes.py), else the failing job, else Mergify's reason.
CAPS = f"{P}/product/qa/CAPABILITIES.md"
IST = timezone(timedelta(hours=5, minutes=30))
RELEASE_END = datetime(2026, 11, 30, tzinfo=IST)   # end of 29 Nov IST (P-609)
SCORES = ("Works", "Partial", "Broken")
ROW = re.compile(r"^\+\| (R1\.\d+) \|[^|]*\|[^|]*\| ([^|]+?) \| ([^|]*?) \|")
TOK = re.compile(r"\bR1\.\d+\b")


def ist(d):
    return d.astimezone(IST).strftime("%d %b %H:%M IST") if d else "?"


def git(*a):
    return subprocess.run(["git", "-C", os.path.join(HERE, "..", "..", "..", ".."), *a], capture_output=True, text=True).stdout


def cap_history(log, shallow=()):
    """`git log --reverse --first-parent --diff-merges=first-parent -p --format='@@C %H %cI' -- CAPABILITIES.md` → per R1 row
    a list of (time, status, tested_on, baseline). A commit at a shallow-clone edge is a baseline: its time is not the change."""
    h, cur, base = {}, None, False
    for line in log.splitlines():
        if line.startswith("@@C "):
            _, sha, when = line.split()
            cur, base = datetime.fromisoformat(when).astimezone(timezone.utc), sha in shallow
            continue
        m = ROW.match(line)
        if m and cur:
            h.setdefault(m.group(1), []).append((cur, m.group(2).strip(), m.group(3).strip(), base))
    return h


def status_at(ev, when):
    s = None
    for e in ev:
        if e[0] > when:
            break
        s = e[1]
    return s


def proven_at(ev):
    """The event that started the row's current Works streak, or None when the row is not Works now."""
    if not ev or ev[-1][1] != "Works":
        return None
    i = len(ev) - 1
    while i > 0 and ev[i - 1][1] == "Works":
        i -= 1
    return ev[i]


def pr_rows(pr):
    if re.match(r"(qa|lead)\b", (pr.get("title") or "").lower()) or (pr.get("head") or {}).get("ref", "").startswith("mergify/"):
        return set()
    s = set(TOK.findall(pr.get("title") or ""))
    for line in (pr.get("body") or "").splitlines():
        if re.match(r"\W*(Item|Items|Completes)\W*:", line):
            s |= set(TOK.findall(line))
    return s


def first_prs(prs):
    out = {}
    for p in prs:
        for r in pr_rows(p):
            c = t(p["created_at"])
            if r not in out or c < out[r][0]:
                out[r] = (c, p["number"])
    return out


def start_to_proven(hist, firsts):
    rows, nopr, base = [], [], []
    for r, ev in hist.items():
        e = proven_at(ev)
        if not e:
            continue
        if e[3]:
            base.append(r); continue
        f = firsts.get(r)
        if not f or f[0] > e[0]:
            nopr.append(r); continue
        rows.append({"row": r, "pr": f[1], "opened": f[0].strftime("%Y-%m-%dT%H:%M:%SZ"), "proven": e[0].strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "days": round((e[0] - f[0]).total_seconds() / 86400, 1)})
    rows.sort(key=lambda x: int(x["row"].split(".")[1]))
    d = [x["days"] for x in rows]
    return {"n": len(rows), "median_days": round(statistics.median(d), 1) if d else None, "rows": rows,
            "no_pr": sorted(nopr, key=lambda r: int(r.split(".")[1])), "baseline": len(base)}


def first_proof(hist, since=None):
    n = ok = 0; win = [0, 0]
    for ev in hist.values():
        e = next((x for x in ev if x[1] in SCORES), None)
        if not e or e[3]:
            continue
        n += 1; ok += e[1] == "Works"
        if since and e[0] >= since:
            win[0] += 1; win[1] += e[1] == "Works"
    return {"n": n, "works_first": ok, "share": round(100 * ok / n, 1) if n else None, "in_window": win}


def reverse_plan(hist, now, end=RELEASE_END):
    works = sum(1 for ev in hist.values() if ev and ev[-1][1] == "Works")
    total = len(hist)
    ago = now - timedelta(hours=24)
    edge = any(e[3] and e[0] >= ago for ev in hist.values() for e in ev) or not any(e[0] <= ago for ev in hist.values() for e in ev)
    before = sum(1 for ev in hist.values() if status_at(ev, ago) == "Works")
    gained = sum(1 for ev in hist.values() if ev and ev[-1][1] == "Works" and status_at(ev, ago) != "Works")
    net = None if edge else works - before
    left = total - works
    days = round(max(0.0, (end - now).total_seconds() / 86400), 1)
    need = round(left / days, 1) if days else None
    fc = (now + timedelta(days=left / net)).astimezone(IST).strftime("%d %b %Y") if net and net > 0 else None
    return {"total": total, "works": works, "left": left, "days_left": days, "need_per_day": need, "net_24h": net,
            "new_24h": None if edge else gained, "reopened_24h": None if edge else gained - net, "forecast_ist": fc,
            "release_ist": (end - timedelta(seconds=1)).strftime("%d %b %Y")}


def verdicts(comments):
    """Reviewer verdict comments: the first non-empty line starts "Reviewer:" (bots never count)."""
    n = 0
    for c in comments:
        if (c.get("user") or {}).get("type") == "Bot" or (c.get("user") or {}).get("login", "").endswith("[bot]"):
            continue
        first = next((l for l in (c.get("body") or "").splitlines() if l.strip()), "")
        n += bool(re.match(r"\W*Reviewer:", first))
    return n


def rounds_summary(per_pr):
    r = sorted(per_pr.values())
    return {"n": len(r), "median": statistics.median(r) if r else None, "mean": round(sum(r) / len(r), 2) if r else None,
            "over_2": sum(x > 2 for x in r), "over_2_share": round(100 * sum(x > 2 for x in r) / len(r), 1) if r else None,
            "none": sum(x == 0 for x in r), "per_pr": per_pr}


PAYLOAD = re.compile(r"-\*- Mergify Payload -\*-\s*(\{.*?\})\s*-\*- Mergify Payload End -\*-", re.S)
JOBLINK = re.compile(r"\[`([^`]+)`\]\(https://github\.com/[^)\s]*/actions/runs/\d+/job/(\d+)\)")


def dequeue(c):
    """A Mergify queue comment that ended "dequeued" → {pr, left_at, reason, checks: [(name, job id)]}, else None."""
    if not (c.get("user") or {}).get("login", "").startswith("mergify"):
        return None
    m = PAYLOAD.search(c.get("body") or "")
    if not m:
        return None
    try:
        d = json.loads(m.group(1))
    except ValueError:
        return None
    if d.get("state") != "dequeued":
        return None
    why = d.get("dequeue_reason") or {}
    names = [x for x in why.get("checks") or [] if x not in ("ci", "@github-actions/ci")]
    jobs = {}
    for name, jid in JOBLINK.findall(c.get("body") or ""):
        jobs.setdefault(name, jid)
    return {"pr": int(re.search(r"/(\d+)$", c.get("issue_url", "/0")).group(1)), "left_at": d.get("left_at"),
            "reason": why.get("code") or "unknown", "checks": [(x, jobs.get(x)) for x in names]}


def bounce_causes(deqs, log_suites):
    """deqs: dequeue() results; log_suites(job id) → failing suite names or []. Each bounced PR counts once per cause."""
    by = {}
    for d in deqs:
        causes = set()
        for name, jid in d["checks"]:
            s = log_suites(jid) if (jid and name.startswith("shard")) else []
            causes |= set(s) if s else {name}
        if not causes:
            causes = {d["reason"].lower().replace("_", " ")}
        for k in causes:
            by.setdefault(k, set()).add(d["pr"])
    groups = sorted(((k, sorted(v)) for k, v in by.items()), key=lambda kv: (-len(kv[1]), kv[0]))
    return {"n": len(deqs), "prs": len({d["pr"] for d in deqs}), "groups": groups}


def _mqc():
    import importlib.util
    spec = importlib.util.spec_from_file_location("mqc", os.path.join(HERE, "merge-queue-causes.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def paged(url, stop=None):
    out, page = [], 1
    while True:
        d = get(f"{url}{'&' if '?' in url else '?'}per_page=100&page={page}")
        out += d
        if len(d) < 100 or (stop and d and stop(d[-1])):
            return out
        page += 1


def new_measures(since, until, now, merged=None, r1_floor="2026-11-14T00:00:00Z"):
    ref = "origin/main" if git("rev-parse", "--verify", "-q", "origin/main").strip() else "HEAD"
    sh = os.path.join(git("rev-parse", "--absolute-git-dir").strip(), "shallow")
    shallow = set(open(sh).read().split()) if os.path.exists(sh) else set()
    log = git("log", "--reverse", "--first-parent", "--diff-merges=first-parent", "-p", "--format=@@C %H %cI", ref, "--", CAPS)
    hist = cap_history(log, shallow)
    floor = t(r1_floor)
    win = f"{ist(since)} .. {ist(until) if until else 'now'}"
    in_win = lambda x: x["left_at"] and since <= datetime.fromisoformat(x["left_at"]).astimezone(timezone.utc) and (not until or datetime.fromisoformat(x["left_at"]).astimezone(timezone.utc) < until)

    def read_prs():   # (a): every PR opened since the R1 floor
        return paged(f"{API}/pulls?state=all&sort=created&direction=desc", stop=lambda p: t(p["created_at"]) < floor)

    waits = None   # --lead only: approved-to-merged minutes of PRs merged in the window (P-798 step age, step-age.py)

    def read_rounds(merged):   # (b): code PRs merged in the window and their verdict comments
        nonlocal waits
        with ThreadPoolExecutor(16) as ex:
            if merged is None:
                ps = merged_prs(since, until)
                facts = list(ex.map(lambda p: pr_facts(p["number"]), ps))   # files and the "review: approved" label times
                merged = [(p, fl) for p, (fl, _) in zip(ps, facts)]
                waits = []
                for p, (_, labels) in zip(ps, facts):
                    before = [x for x in labels if x <= t(p["merged_at"])]
                    if before:
                        waits.append((t(p["merged_at"]) - before[-1]).total_seconds() / 60)
            prime_kinds([f for _, f in merged])
            code = [p for (p, _), k in zip(merged, ex.map(lambda pf: kind(pf[1]), merged)) if k == "code"]
            per = dict(zip([p["number"] for p in code], ex.map(lambda p: verdicts(paged(f"{API}/issues/{p['number']}/comments")), code)))
        b = rounds_summary(per)
        b["sample"] = f"{len(code)} code PRs (change-kind.sh) of {len(merged)} merged {win}"
        return b

    def read_bounces():   # (e): Mergify's dequeued comments in the window; the failing shards' logs read at once
        cs = paged(f"{API}/issues/comments?since={since.strftime('%Y-%m-%dT%H:%M:%SZ')}&sort=updated&direction=asc")
        deqs = [x for x in map(dequeue, cs) if x and in_win(x)]
        mqc = _mqc()
        def suites_of(jid):
            try:
                return jid, mqc.suites(get(f"{API}/actions/jobs/{jid}/logs", raw=True))[0]
            except SystemExit:
                return jid, []
        jids = sorted({j for d in deqs for n, j in d["checks"] if j and n.startswith("shard")})
        with ThreadPoolExecutor(8) as ex:
            logs = dict(ex.map(suites_of, jids))
        e = bounce_causes(deqs, lambda j: logs.get(j, []))
        e["sample"] = f"Mergify queue comments that ended dequeued, left the queue {win}; one per Mergify comment (Mergify starts a new comment on each requeue); suites from the failing shard's log"
        return e

    with ThreadPoolExecutor(3) as ex:
        fp, fb, fe = ex.submit(read_prs), ex.submit(read_rounds, merged), ex.submit(read_bounces)
        prs, b, e = fp.result(), fb.result(), fe.result()
    a = start_to_proven(hist, first_prs([p for p in prs if t(p["created_at"]) >= floor]))
    a["sample"] = f"R1 rows Works on {ref} now; first PR naming the row since {r1_floor[:10]} (title, Item: or Completes: line; qa/lead records PRs left out; a row started before then shows a later start)"
    c = first_proof(hist, since)
    c["sample"] = f"R1 rows with a qa score (Works, Partial or Broken) in {ref}'s qa/CAPABILITIES.md history"
    d = reverse_plan(hist, now)
    d["sample"] = f"all {d['total']} R1 rows on {ref}; rate = net change of Works rows in the 24 h to {ist(now)}"
    out = {"start_to_proven": a, "review_rounds": b, "first_proof": c, "reverse_plan": d, "queue_bounces": e}
    if waits is not None:   # --lead: the full report computes its own approved_to_merged_min (main())
        out["approved_to_merged_min"] = {"n": len(waits), "median": round(statistics.median(waits)) if waits else None}
    return out


def _na(v):
    return "n/a" if v is None else v


def lead_lines(m):
    a, b, c, d, e = ({k2: _na(v) for k2, v in m[k].items()} for k in ("start_to_proven", "review_rounds", "first_proof", "reverse_plan", "queue_bounces"))
    e["groups"] = m["queue_bounces"]["groups"]; a["no_pr"] = m["start_to_proven"]["no_pr"]
    d["forecast_ist"] = m["reverse_plan"]["forecast_ist"]; d["net_24h"] = m["reverse_plan"]["net_24h"]
    g = " · ".join(f"{k} {len(v)}" for k, v in e["groups"][:4]) or "none"
    fc = f"forecast {d['forecast_ist']} IST" if d["forecast_ist"] else ("no forecast: net 24 h not readable" if d["net_24h"] is None else "no forecast: net 0 or less in 24 h")
    return [
        f"flow  start→Proven median {a['median_days']} d over {a['n']} rows (first PR naming the row → last Works on main); {len(a['no_pr'])} Works rows name no PR",
        f"flow  review rounds median {b['median']}, mean {b['mean']}; {b['over_2']} of {b['n']} over 2 ({b['over_2_share']}%, P-277 limit); {b['none']} with no verdict comment ({b['sample']})",
        f"flow  first-time proof {c['works_first']} of {c['n']} R1 rows Works on their first qa score ({c['share']}%); in window {c['in_window'][1]} of {c['in_window'][0]}",
        f"flow  reverse plan {d['left']} of {d['total']} rows left, {d['days_left']} d to {d['release_ist']} → {d['need_per_day']} proofs/day needed; last 24 h net {_na(d['net_24h'])} (+{d['new_24h']} new, {d['reopened_24h']} reopened); {fc}",
        f"flow  queue bounces {e['n']} dequeues of {e['prs']} approved PRs in window: {g}",
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--until")
    ap.add_argument("--max-runs", type=int, default=1000)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--lead", action="store_true", help="only the five ENF-782b measures, as 5 lines for lead-watch.sh")
    ap.add_argument("--now", help="the time measures are read at (tests); default now")
    ap.add_argument("--cache-min", type=int, default=None, help="--lead: reuse an answer this young (default 30)")
    a = ap.parse_args()
    now = t(a.now) if a.now else datetime.now(timezone.utc).replace(microsecond=0)
    if a.since == "today":   # 00:00 IST today, in UTC
        a.since = now.astimezone(IST).replace(hour=0, minute=0, second=0).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    since, until = t(a.since), (t(a.until) if a.until else None)
    if a.lead:
        cache = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"flow-measure-lead-{a.since[:13]}.json")
        age = (time.time() - os.path.getmtime(cache)) / 60 if os.path.exists(cache) else None
        if age is not None and age < (int(os.environ.get("FRESH_MAX_MIN") or 30) if a.cache_min is None else a.cache_min):   # lead-watch.sh: 10 (ENF-803)
            m = json.load(open(cache))
        else:
            m = new_measures(since, until, now)
            m["_as_of"] = ist(now)
            with open(cache + ".tmp", "w") as f:
                json.dump(m, f)
            os.replace(cache + ".tmp", cache)
        if a.json:
            print(json.dumps(m, indent=1)); return
        print("\n".join(lead_lines(m)) + f"  [read {m['_as_of']}, window from {ist(since)}]")
        return

    runs = runs_since(since, until, a.max_runs)
    with ThreadPoolExecutor(16) as ex:
        js = list(ex.map(jobs, runs))
    h = {"pr_total": 0.0, "pr_cancelled": 0.0, "pr_failed": 0.0, "pr_earlier_failed": 0.0, "pr_guard": 0.0, "queue_total": 0.0, "queue_thrown": 0.0, "pr_wall": 0.0, "pr_wall_thrown": 0.0}
    n = {"pr_runs": 0, "pr_cancelled": 0, "pr_failed": 0, "pr_guard_runs": 0, "queue_runs": 0, "queue_failed": 0, "queue_cancelled": 0, "pr_rerun_failed_jobs": 0}
    for r, jl in zip(runs, js):
        if r["status"] != "completed":
            continue
        queue = r["head_branch"].startswith("mergify/") and r["actor"]["login"].startswith("mergify")
        concl = r["conclusion"]
        tot = sum(secs(j) for j in jl) / 3600
        wall = max(0.0, (t(r["updated_at"]) - t(r["run_started_at"])).total_seconds() / 3600) if tot else 0.0
        if tot == 0:
            continue   # a run whose jobs were all skipped (a draft before the fix) used no machine
        if queue:
            n["queue_runs"] += 1; h["queue_total"] += tot
            if concl in ("failure", "cancelled", "timed_out"):
                h["queue_thrown"] += tot; n["queue_failed" if concl != "cancelled" else "queue_cancelled"] += 1
            continue
        n["pr_runs"] += 1; h["pr_total"] += tot; h["pr_wall"] += wall
        if concl in ("cancelled", "failure", "timed_out"):
            h["pr_wall_thrown"] += wall
        # The draft guard (P-371 (1)): a run whose only machine time is the "guard" job.
        if all(secs(j) == 0 or j["name"].startswith("guard") for j in jl):
            n["pr_guard_runs"] += 1; h["pr_guard"] += tot
        if concl == "cancelled":
            n["pr_cancelled"] += 1; h["pr_cancelled"] += tot
        elif concl in ("failure", "timed_out"):
            n["pr_failed"] += 1; h["pr_failed"] += tot
        else:
            # A green (or still-useful) run: only earlier attempts' failed jobs are thrown away.
            last = r.get("run_attempt", 1)
            early = [j for j in jl if j.get("run_attempt", 1) < last and j.get("conclusion") in ("failure", "cancelled")]
            h["pr_earlier_failed"] += sum(secs(j) for j in early) / 3600
            n["pr_rerun_failed_jobs"] += len(early)

    prs = merged_prs(since, until)
    with ThreadPoolExecutor(16) as ex:
        facts = list(ex.map(lambda p: pr_facts(p["number"]), prs))
    prime_kinds([f for f, _ in facts])
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda fl: kind(fl[0]), facts))   # the script's ~2 s calls, 4 at a time; answers cached
    rec = notes = 0; waits = []
    for p, (files, labels) in zip(prs, facts):
        k = kind(files)
        rec += k != "code"; notes += k == "notes"
        m = t(p["merged_at"])
        before = [x for x in labels if x <= m]
        if before:
            waits.append((m - before[-1]).total_seconds() / 60)

    try:
        m = new_measures(since, until, now, merged=[(p, f) for p, (f, _) in zip(prs, facts)])
    except SystemExit as e:   # a GitHub read failed: the older measures still print; the new ones say why
        m = {"new_measures_error": str(e)[:300]}
    thrown = h["pr_cancelled"] + h["pr_failed"] + h["pr_earlier_failed"]
    res = {
        "window": f"{a.since} .. {a.until or 'now'}", "runs_read": len(runs),
        "pr_check_hours": round(h["pr_total"], 1), "thrown_hours": round(thrown, 1),
        "thrown_share": round(100 * thrown / h["pr_total"], 1) if h["pr_total"] else None,
        "cancelled": [n["pr_cancelled"], round(h["pr_cancelled"], 1)], "failed": [n["pr_failed"], round(h["pr_failed"], 1)],
        "earlier_attempt_failed_jobs": [n["pr_rerun_failed_jobs"], round(h["pr_earlier_failed"], 1)],
        "pr_runs": n["pr_runs"], "draft_guard_runs": [n["pr_guard_runs"], round(h["pr_guard"], 2)],
        "queue_runs": n["queue_runs"], "queue_failed": n["queue_failed"], "queue_cancelled": n["queue_cancelled"],
        "queue_hours": round(h["queue_total"], 1), "queue_thrown_hours": round(h["queue_thrown"], 1),
        "merged": len(prs), "records_merged": rec, "notes_merged": notes,
        "pr_run_wall_hours": round(h["pr_wall"], 1), "pr_run_wall_thrown_share": round(100 * h["pr_wall_thrown"] / h["pr_wall"], 1) if h["pr_wall"] else None, "records_share": round(100 * rec / len(prs), 1) if prs else None,
        "approved_to_merged_min": {"n": len(waits), "median": round(statistics.median(waits)) if waits else None,
                                   "p90": round(sorted(waits)[int(0.9 * (len(waits) - 1))]) if waits else None,
                                   "under_1h_share": round(100 * sum(w < 60 for w in waits) / len(waits), 1) if waits else None},
    }
    res.update(m)
    if a.json:
        print(json.dumps(res, indent=1)); return
    w = res["approved_to_merged_min"]
    print(f"Flow measure {res['window']} ({res['runs_read']} ci.yml runs read)")
    print(f"| Number | Value | P-371 target |\n|---|---|---|")
    print(f"| PR-check hours thrown away | {res['thrown_hours']} of {res['pr_check_hours']} h ({res['thrown_share']}%): cancelled {res['cancelled'][0]} runs {res['cancelled'][1]} h, failed {res['failed'][0]} runs {res['failed'][1]} h, earlier attempts' failed jobs {res['earlier_attempt_failed_jobs'][0]} ({res['earlier_attempt_failed_jobs'][1]} h) | under 20% |")
    print(f"| Same, by run wall time (start to end of each run, parts counted once) | {res['pr_run_wall_thrown_share']}% of {res['pr_run_wall_hours']} h | under 20% |")
    print(f"| Draft guard runs | {res['draft_guard_runs'][0]} runs, {res['draft_guard_runs'][1]} h | (P-371 (1)) |")
    print(f"| Merge-queue batches | {res['queue_runs']} runs, {res['queue_failed']} failed, {res['queue_cancelled']} cancelled; {res['queue_thrown_hours']} of {res['queue_hours']} h | (compass: 15% or less thrown) |")
    print(f"| Records share of merges | {res['records_merged']} of {res['merged']} ({res['records_share']}%) no code (change-kind.sh notes or records); notes only {res['notes_merged']} | under 20% |")
    print(f"| Approved to merged | median {w['median']} min, p90 {w['p90']} min, {w['under_1h_share']}% under 1 h (n={w['n']}) | under 1 hour |")
    if "new_measures_error" in m:
        print(f"\nRelease 1 flow (ENF-782b): not read: {m['new_measures_error']}"); return
    print("\nRelease 1 flow (ENF-782b, P-782 (3)); each line's sample in brackets:")
    for line, k in zip(lead_lines(m), ("start_to_proven", "review_rounds", "first_proof", "reverse_plan", "queue_bounces")):
        print(f"- {line[6:]} [{m[k]['sample']}]")
    print("\n| R1 row | first PR | opened (UTC) | Proven on main (UTC) | days |\n|---|---|---|---|---|")
    for r in m["start_to_proven"]["rows"]:
        print(f"| {r['row']} | #{r['pr']} | {r['opened'][:16]} | {r['proven'][:16]} | {r['days']} |")
    if m["start_to_proven"]["no_pr"]:
        print(f"\nWorks rows no PR names (start not measurable): {', '.join(m['start_to_proven']['no_pr'])}")
    print("\n| queue bounce cause | PRs |\n|---|---|")
    for k, v in m["queue_bounces"]["groups"]:
        print(f"| {k} | {len(v)}: {' '.join('#%d' % n for n in v)} |")


if __name__ == "__main__":
    main()
