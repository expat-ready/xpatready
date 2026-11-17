#!/usr/bin/env python3
"""Pipeline heartbeat (CK-2, founder asks A151 and A154, 17 Nov 2026): is the pipeline moving with nobody watching?

Run every 30 minutes by .github/workflows/pipeline-heartbeat.yml, outside every session. A failed scheduled run makes
GitHub mail the repository owner, so that mail is the alarm. The run is red when any alarm fires (the thresholds are
in design/engineering-approved-setup.json › heartbeat, so they are versioned):
  no-merge     no merge to main for over no_merge_min while a PR carrying the approval label has waited that long;
  queue-stuck  a queued PR (approved, not a draft) with no merge-queue progress (a batch PR opened, closed or checked,
               or a merge to main) for over queue_no_progress_min since it was approved;
  stalled-lane an open lane PR with no push, comment or CI activity for over stalled_lane_min (and under
               stalled_lane_max_age_h, older ones are dormant) that is not waiting on CI and not in the queue;
  nightly      after nightly_by_ist IST, no scheduled nightly run created since 00:00 IST today;
  conformance  the set-up conformance check (CK-1, conformance-check.py) has a failed item;
  read-error   GitHub could not be read (a heartbeat that cannot see is not green).
Report only (never red): P95 queue wait (approval label to merge, PRs merged in the last 24 h) over queue_wait_p95_min,
P95 batch wait (batch PR opened to its first ci job started, last 24 h) over batch_wait_p95_min: the T1 admission trigger.
It also counts the window the founder asked about: hours since the last red heartbeat, the current green streak and
the longest green streak today (IST), from this workflow's own earlier runs.
GitHub reads: two GraphQL queries (merges and open PRs; recent PRs and batches); two REST GETs with the workflow's
GITHUB_TOKEN (this workflow's and nightly's run lists: GraphQL has no run list by workflow file). Read-only, US$0.
  python3 -I product/tools/pipeline-heartbeat.py [--facts FILE | --save-facts FILE] [--conformance FILE]
                                                 [--json FILE] [--md FILE]
Exit 1 when an alarm fires, 0 when green. Tests: product/tools/test_pipeline_heartbeat.py (check-pipeline-heartbeat.sh).
"""
import argparse, json, math, os, subprocess, sys, time
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "design", "engineering-approved-setup.json")
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
IST = timezone(timedelta(hours=5, minutes=30))

QUERY = """query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { target { ... on Commit { history(first: 30) { nodes { committedDate parents { totalCount } } } } } }
    open: pullRequests(states: OPEN, first: 60, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes {
      number isDraft headRefName createdAt updatedAt labels(first: 10) { nodes { name } }
      timelineItems(itemTypes: [LABELED_EVENT], last: 4) { nodes { ... on LabeledEvent { createdAt label { name } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } checkSuites(last: 6) { nodes { updatedAt } } } } } } }
  }
}"""
QUERY_RECENT = """query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    recent: pullRequests(states: [MERGED, CLOSED], first: 30, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes {
      number headRefName createdAt closedAt mergedAt
      timelineItems(itemTypes: [LABELED_EVENT], last: 4) { nodes { ... on LabeledEvent { createdAt label { name } } } }
      commits(last: 1) { nodes { commit { checkSuites(first: 10, filterBy: {appId: 15368}) { nodes { updatedAt
        workflowRun { workflow { name } } checkRuns(first: 1) { nodes { startedAt } } } } } } } } }
  }
}"""


def t(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def iso(d):
    return d.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z") if d else None


def mins(a, b):
    return (b - a).total_seconds() / 60


def hm(d):
    return d.astimezone(IST).strftime("%H:%M IST") if d else "never"


def p95(xs):
    """Nearest-rank 95th percentile (the value 95% of the sample are at or under); None for no sample."""
    if not xs:
        return None
    s = sorted(xs)
    return s[max(0, math.ceil(0.95 * len(s)) - 1)]


# ---- reading GitHub ------------------------------------------------------------------------------------------------
def api(method, url, body=None):
    """One GitHub call through curl (P-363), the token on curl's stdin (-H @-), never on its command line where ps
    would show it. One retry: GitHub answers a busy GraphQL query with a 502 or a cut-off body now and then."""
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        raise RuntimeError("GITHUB_TOKEN not set")
    cmd = ["curl", "-sS", "--fail-with-body", "--max-time", "30", "-X", method, "-H", "@-",
           "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28", url]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", json.dumps(body)]
    for attempt in (1, 2):
        r = subprocess.run(cmd, input=f"Authorization: Bearer {tok}\n", capture_output=True, text=True)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except ValueError:
                why = f"not JSON ({len(r.stdout)} bytes)"
        else:
            why = (r.stderr.strip() or r.stdout.strip())[:200]
            if r.returncode == 22 and "404" in why:
                raise LookupError(f"404 {url}")
        if attempt == 2:
            raise RuntimeError(f"{method} {url.split('?')[0]}: {why}")
        time.sleep(5)


def last_label(items, label, before=None):
    ts = [t(e["createdAt"]) for e in items if e and (e.get("label") or {}).get("name") == label
          and (before is None or t(e["createdAt"]) <= before)]
    return max(ts) if ts else None


def facts_from(gql, hb_runs, nightly_runs, hb, now):
    """The facts the alarms read, from the GraphQL answer and the two run lists (REST shape)."""
    repo = gql["data"]["repository"]
    hist = repo["defaultBranchRef"]["target"]["history"]["nodes"]
    merges = sorted((n["committedDate"] for n in hist if n["parents"]["totalCount"] > 1), reverse=True)
    lab, batch = hb["approved_label"], hb["batch_branch_prefix"]
    open_prs = []
    for p in repo["open"]["nodes"]:
        c = (p["commits"]["nodes"] or [{}])[0].get("commit") or {}
        suites = [s["updatedAt"] for s in (c.get("checkSuites") or {}).get("nodes") or [] if s.get("updatedAt")]
        open_prs.append({"number": p["number"], "draft": p["isDraft"], "head": p["headRefName"],
                         "labels": [x["name"] for x in p["labels"]["nodes"]], "updated_at": p["updatedAt"],
                         "approved_at": iso(last_label(p["timelineItems"]["nodes"], lab)),
                         "ci_state": (c.get("statusCheckRollup") or {}).get("state"),
                         "last_ci_at": max(suites) if suites else None})
    merged, batches = [], []
    for p in repo["recent"]["nodes"]:
        if p["headRefName"].startswith(batch):
            c = (p["commits"]["nodes"] or [{}])[0].get("commit") or {}
            ss = (c.get("checkSuites") or {}).get("nodes") or []
            starts = [r["startedAt"] for s in ss if ((s.get("workflowRun") or {}).get("workflow") or {}).get("name") == "ci"
                      for r in (s.get("checkRuns") or {}).get("nodes") or [] if r.get("startedAt")]
            batches.append({"number": p["number"], "created_at": p["createdAt"], "closed_at": p["closedAt"],
                            "first_check_started_at": min(starts) if starts else None,
                            "last_check_at": max((s["updatedAt"] for s in ss if s.get("updatedAt")), default=None)})
        elif p["mergedAt"]:
            merged.append({"number": p["number"], "merged_at": p["mergedAt"],
                           "approved_at": iso(last_label(p["timelineItems"]["nodes"], lab, t(p["mergedAt"])))})
    # Batch PRs still open are in "open": they count as batches too (opened and checked), never as lanes.
    for p in open_prs:
        if p["head"].startswith(batch):
            batches.append({"number": p["number"], "created_at": None, "closed_at": None,
                            "first_check_started_at": None, "last_check_at": p["last_ci_at"] or p["updated_at"]})
    run = lambda r: {"id": r.get("id"), "created_at": r.get("created_at"), "status": r.get("status"),
                     "conclusion": r.get("conclusion"), "event": r.get("event"), "url": r.get("html_url")}
    return {"now": iso(now), "main_merges": merges, "open_prs": open_prs, "merged_prs": merged, "batches": batches,
            "heartbeat_runs": [run(r) for r in hb_runs], "nightly_runs": [run(r) for r in nightly_runs]}


def collect(hb, now):
    repo = os.environ.get("GITHUB_REPOSITORY") or ""
    if "/" not in repo:
        u = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True, cwd=HERE).stdout
        repo = u.strip().rstrip("/").removesuffix(".git").split("github.com")[-1].lstrip(":/")
    owner, name = repo.split("/", 1)
    gql = {"data": {"repository": {}}}
    for q in (QUERY, QUERY_RECENT):  # two small queries: one big one hit GitHub's resource limit (17 Nov)
        a = api("POST", f"{API}/graphql", {"query": q, "variables": {"owner": owner, "name": name}})
        if a.get("errors") or not a.get("data"):
            raise RuntimeError(f"GraphQL: {(a.get('errors') or [{}])[0].get('message')}")
        gql["data"]["repository"].update(a["data"]["repository"])
    runs = lambda wf, n: api("GET", f"{API}/repos/{repo}/actions/workflows/{wf}/runs?per_page={n}")["workflow_runs"]
    try:
        own = runs(hb["workflow"], 100)
    except LookupError:  # 404 until the workflow is on main (a run from a session before the merge)
        own = []
    return facts_from(gql, own, runs(hb["nightly_workflow"], 5), hb, now)


# ---- the alarms ----------------------------------------------------------------------------------------------------
def evaluate(f, hb, conformance=None, own_run_id=None):
    now = t(f["now"]); alarms, report = [], []
    lab, ex, batch = hb["approved_label"], tuple(hb["lane_branch_excluded_prefixes"]), hb["batch_branch_prefix"]
    last_merge = t(f["main_merges"][0]) if f["main_merges"] else None
    lanes = [p for p in f["open_prs"] if not p["head"].startswith(batch)]
    approved = [p for p in lanes if lab in p["labels"]]
    queued = [p for p in approved if not p["draft"]]

    # no-merge: an approved PR has waited no_merge_min and nothing merged in that time.
    waits = [p for p in approved if mins(max(filter(None, [t(p["approved_at"]), last_merge]), default=now), now)
             > hb["no_merge_min"]]
    if waits:
        alarms.append({"id": "no-merge", "why": f"no merge to main for over {hb['no_merge_min']} min (last merge "
                       f"{hm(last_merge)}) while {len(waits)} approved PR(s) wait: "
                       + ", ".join(f"#{p['number']}" for p in waits[:6])})

    # queue-stuck: a queued PR with no batch progress since it was approved (or since the last progress).
    prog = [last_merge] + [t(b.get(k)) for b in f["batches"] for k in ("created_at", "closed_at", "last_check_at")]
    last_prog = max((x for x in prog if x), default=None)
    stuck = [p for p in queued if mins(max(filter(None, [t(p["approved_at"]), last_prog]), default=now), now)
             > hb["queue_no_progress_min"]]
    if stuck:
        alarms.append({"id": "queue-stuck", "why": f"{len(stuck)} queued PR(s) with no merge-queue progress for over "
                       f"{hb['queue_no_progress_min']} min (last progress {hm(last_prog)}): "
                       + ", ".join(f"#{p['number']}" for p in stuck[:6])})

    # stalled-lane: no push, comment or CI activity for over stalled_lane_min, not waiting on CI, not in the queue.
    stalled, dormant = [], 0
    for p in lanes:
        if p["head"].startswith(ex) or lab in p["labels"] or p["ci_state"] in ("PENDING", "EXPECTED"):
            continue
        idle = mins(max(filter(None, [t(p["updated_at"]), t(p["last_ci_at"])])), now)
        if idle > hb["stalled_lane_max_age_h"] * 60:
            dormant += 1
        elif idle > hb["stalled_lane_min"]:
            stalled.append((p, idle))
    if stalled:
        alarms.append({"id": "stalled-lane", "why": f"{len(stalled)} lane PR(s) with no push, comment or CI for over "
                       f"{hb['stalled_lane_min']} min: " + ", ".join(f"#{p['number']} ({int(i)} min)"
                                                                       for p, i in stalled[:6])})

    # nightly: after nightly_by_ist, a scheduled nightly run created since 00:00 IST today.
    now_ist = now.astimezone(IST); hh, mm = map(int, hb["nightly_by_ist"].split(":"))
    midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    nights = [r for r in f["nightly_runs"] if r["event"] == "schedule" and t(r["created_at"]) >= midnight]
    if now_ist >= midnight.replace(hour=hh, minute=mm) and not nights:
        alarms.append({"id": "nightly", "why": f"no scheduled nightly run since 00:00 IST today (due by "
                       f"{hb['nightly_by_ist']} IST)"})
    elif nights:
        report.append({"id": "nightly", "why": f"nightly {hm(t(nights[0]['created_at']))}: "
                       f"{nights[0]['conclusion'] or nights[0]['status']}"})

    # conformance (CK-1)
    if conformance is not None:
        failed = [i["id"] for i in conformance.get("items", []) if i["status"] == "fail"]
        if failed or conformance.get("enforced") != "yes":
            alarms.append({"id": "conformance", "why": f"set-up conformance: {len(failed)} item(s) fail: "
                           + ", ".join(failed[:6])})

    # report only: the T1 admission trigger
    day = now - timedelta(hours=24)
    qw = [mins(t(p["approved_at"]), t(p["merged_at"])) for p in f["merged_prs"]
          if p["approved_at"] and t(p["merged_at"]) >= day]
    bw = [mins(t(b["created_at"]), t(b["first_check_started_at"])) for b in f["batches"]
          if b["created_at"] and b["first_check_started_at"] and t(b["created_at"]) >= day]
    for key, xs, lim, what in (("queue_wait_p95_min", qw, hb["queue_wait_p95_min"], "queue wait (approved to merged)"),
                               ("batch_wait_p95_min", bw, hb["batch_wait_p95_min"], "batch wait (opened to first ci job)")):
        v = p95(xs)
        report.append({"id": key, "value": None if v is None else round(v, 1), "n": len(xs), "over": bool(v and v > lim),
                       "why": f"P95 {what}: " + ("no sample in 24 h" if v is None else
                                                f"{v:.0f} min over {len(xs)} (limit {lim}){' — OVER: T1 trigger' if v > lim else ''}")})
    if dormant:
        report.append({"id": "dormant-lanes", "why": f"{dormant} open lane PR(s) idle over {hb['stalled_lane_max_age_h']} h"})

    green = not alarms
    window = streaks(f["heartbeat_runs"], now, green, own_run_id)
    return {"check": "pipeline heartbeat (CK-2)", "running": "yes" if green else "no", "checked_at": iso(now),
            "checked_at_ist": now_ist.strftime("%d %b %H:%M IST"), "alarms": alarms, "report": report,
            "counts": {"open_prs": len(f["open_prs"]), "approved": len(approved), "queued": len(queued),
                       "last_merge": iso(last_merge)}, **window}


def streaks(runs, now, green_now, own_id=None):
    """Hours since the last red heartbeat, the current green streak and the longest today (IST), from the earlier
    finished runs of this workflow plus this one. Cancelled or skipped runs (a newer one replaced them) are left out."""
    seq = [(t(r["created_at"]), r["conclusion"] == "success") for r in runs
           if r["status"] == "completed" and r["conclusion"] in ("success", "failure") and r.get("id") != own_id]
    seq = sorted(seq) + [(now, green_now)]
    reds = [x for x, ok in seq if not ok]
    since_red = None if not reds else round((now - reds[-1]).total_seconds() / 3600, 1)
    cur = 0.0
    if green_now:
        first = next((x for x, ok in reversed(seq) if not ok), None)
        start = min((x for x, ok in seq if ok and (first is None or x > first)), default=now)
        cur = round((now - start).total_seconds() / 3600, 1)
    today = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    best, run_start = 0.0, None
    for x, ok in [(x, ok) for x, ok in seq if x >= today]:
        if ok:
            run_start = run_start or x
            best = max(best, (x - run_start).total_seconds() / 3600)
        else:
            run_start = None
    return {"hours_since_last_alarm": since_red, "green_streak_h": cur, "longest_green_today_h": round(best, 1),
            "runs_seen": len(seq) - 1, "history_from": iso(seq[0][0]) if len(seq) > 1 else None}


def markdown(res):
    lines = [f"**Pipeline running: {res['running']}** · checked {res['checked_at_ist']} · green streak "
             f"{res['green_streak_h']} h · longest today {res['longest_green_today_h']} h · hours since last alarm "
             f"{res['hours_since_last_alarm'] if res['hours_since_last_alarm'] is not None else 'none seen'}", ""]
    lines += [f"- ALARM {a['id']}: {a['why']}" for a in res["alarms"]] or ["- no alarm"]
    lines += [f"- report {r['id']}: {r['why']}" for r in res["report"]]
    c = res["counts"]
    lines.append(f"- {c['open_prs']} open PRs, {c['approved']} approved, {c['queued']} queued; last merge to main "
                 f"{hm(t(c['last_merge']))}")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--facts", help="read the facts from FILE instead of GitHub (tests, replays)")
    ap.add_argument("--save-facts", help="also write the facts read from GitHub to FILE")
    ap.add_argument("--conformance", help="CK-1's JSON (conformance-check.py --json); missing file = an alarm")
    ap.add_argument("--manifest", default=MANIFEST)
    ap.add_argument("--json", help="write the result as JSON to FILE")
    ap.add_argument("--md", help="append the markdown to FILE (the job summary)")
    a = ap.parse_args(argv)
    with open(a.manifest, encoding="utf-8") as fh:
        hb = json.load(fh)["heartbeat"]
    conf = None
    if a.conformance:
        try:
            with open(a.conformance, encoding="utf-8") as fh:
                conf = json.load(fh)
        except (OSError, ValueError) as e:
            conf = {"enforced": "no", "items": [{"id": f"conformance result unreadable ({e})", "status": "fail"}]}
    now = datetime.now(timezone.utc)
    try:
        if a.facts:
            with open(a.facts, encoding="utf-8") as fh:
                f = json.load(fh)
        else:
            f = collect(hb, now)
            if a.save_facts:
                with open(a.save_facts, "w", encoding="utf-8") as fh:
                    json.dump(f, fh, indent=1)
        own = int(os.environ["GITHUB_RUN_ID"]) if os.environ.get("GITHUB_RUN_ID", "").isdigit() else None
        res = evaluate(f, hb, conf, own)
    except (LookupError, RuntimeError, KeyError, TypeError, ValueError, OSError) as e:
        res = {"check": "pipeline heartbeat (CK-2)", "running": "no", "checked_at": iso(now),
               "checked_at_ist": now.astimezone(IST).strftime("%d %b %H:%M IST"), "report": [],
               "alarms": [{"id": "read-error", "why": f"could not read GitHub: {type(e).__name__}: {e}"}],
               "counts": {"open_prs": 0, "approved": 0, "queued": 0, "last_merge": None},
               "hours_since_last_alarm": 0.0, "green_streak_h": 0.0, "longest_green_today_h": 0.0, "runs_seen": 0}
    res["conformance"] = None if conf is None else {k: conf.get(k) for k in ("enforced", "counts", "checked",
                                                                              "checked_at", "manifest_version")}
    md = markdown(res)
    print(md)
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump(res, fh, indent=1, ensure_ascii=False)
    if a.md:
        with open(a.md, "a", encoding="utf-8") as fh:
            fh.write(md + "\n")
    return 1 if res["alarms"] else 0


if __name__ == "__main__":
    sys.exit(main())
