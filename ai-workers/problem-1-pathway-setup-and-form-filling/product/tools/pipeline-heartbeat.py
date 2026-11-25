#!/usr/bin/env python3
"""Pipeline heartbeat (CK-2, founder asks A151 and A154, 17 Nov 2026): is the pipeline moving with nobody watching?

Run every 30 min by .github/workflows/pipeline-heartbeat.yml, outside every session. A red scheduled run mails the owner,
so it comes only on a change (manifest › heartbeat › red_rule): a new alarm, an open alarm passing escalate_after_min
(once), conformance failing, or GitHub unreadable. An unchanged open alarm ends green with a "still open" line; the
state carries over in the previous run's artifact (none readable = every alarm is new). Alarms (manifest thresholds):
  no-merge     no merge to main for over no_merge_min while a PR with the approval label has waited that long;
  queue-stuck  a queued PR (approved, not a draft, Mergify's queued label) with no merge-queue progress (a batch PR opened, closed or checked,
               or a merge) for over queue_no_progress_min since it was approved;
  stalled-lane an open lane PR idle (no push, comment or CI) over stalled_lane_min and under stalled_lane_max_age_h
               (older: dormant, reported), not waiting on CI and not queued;
  parked-expired  a PR labelled parked_label without a valid "Parked:" comment (by an owner, member or collaborator), or past its resume date. A valid one
             (Parked: <reason> / Owner: <role> / Resume: YYYY-MM-DD, at most parked_max_days after the comment) is
             left out of stalled-lane and its 2 h escalation, and listed in the report (founder, 19 Nov 07:1x-07:2x IST)
  nightly      after nightly_by_ist IST, no scheduled nightly run since 00:00 IST; conformance: CK-1 has a failed item;
  read-error   GitHub could not be read (a heartbeat that cannot see is never green).
Report only: P95 queue wait (approval to merge) and P95 batch wait (batch PR opened to ci's first job), last 24 h, over
queue_wait_p95_min / batch_wait_p95_min: the T1 admission trigger. Window: hours since the last alarm, green streak
(no open alarm), longest today (IST). Reads: two GraphQL queries; REST (GITHUB_TOKEN): nightly's run list and the
previous artifact. Read-only, US$0. Exit 1 when the run is red. Tests: test_pipeline_heartbeat.py (guard 25).
  python3 -I product/tools/pipeline-heartbeat.py [--facts F | --save-facts F] [--conformance F] [--json F] [--md F]
"""
import argparse, json, math, os, re, subprocess, sys, tempfile, time, zipfile
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "design", "engineering-approved-setup.json")
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
IST = timezone(timedelta(hours=5, minutes=30))
ARTIFACT = "pipeline-heartbeat"
ALWAYS_RED = ("conformance", "read-error")
TRUSTED = ("OWNER", "MEMBER", "COLLABORATOR")   # whose "Parked:" note counts

QUERY = """query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { target { ... on Commit { history(first: 30) { nodes { committedDate parents { totalCount } } } } } }
    open: pullRequests(states: OPEN, first: 60, orderBy: {field: UPDATED_AT, direction: DESC}) { totalCount nodes {
      number isDraft headRefName createdAt updatedAt labels(first: 10) { nodes { name } }
      timelineItems(itemTypes: [LABELED_EVENT], last: 10) { nodes { ... on LabeledEvent { createdAt label { name } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } checkSuites(last: 6) { nodes { updatedAt } } } } } } }
  }
}"""
QUERY_RECENT = """query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    recent: pullRequests(states: [MERGED, CLOSED], first: 30, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor } nodes {
      number headRefName createdAt closedAt mergedAt updatedAt
      timelineItems(itemTypes: [LABELED_EVENT], last: 10) { nodes { ... on LabeledEvent { createdAt label { name } } } }
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
def curl(args, what):
    """curl with the token on stdin (-H @-), never on its command line where ps would show it (P-363). One retry:
    GitHub answers a busy GraphQL query with a 502 or a cut-off body now and then. LookupError on a 404."""
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        raise RuntimeError("GITHUB_TOKEN not set")
    cmd = ["curl", "-sS", "--fail-with-body", "--max-time", "25", "-H", "@-", "-H", "X-GitHub-Api-Version: 2022-11-28"]
    for attempt in (1, 2):
        r = subprocess.run(cmd + args, input=f"Authorization: Bearer {tok}\n", capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout
        why = (r.stderr.strip() or r.stdout.strip())[:200]
        if r.returncode == 22 and "404" in why:
            raise LookupError(f"404 {what}")
        if attempt == 2:
            raise RuntimeError(f"{what}: {why}")
        time.sleep(5)


def api(method, url, body=None):
    args = ["-X", method, "-H", "Accept: application/vnd.github+json", url]
    if body is not None:
        args += ["-H", "Content-Type: application/json", "--data-binary", json.dumps(body)]
    out = curl(args, f"{method} {url.split('?')[0]}")
    try:
        return json.loads(out)
    except ValueError:
        raise RuntimeError(f"{method} {url.split('?')[0]}: not JSON ({len(out)} bytes)")


def read_previous(repo, own_id):
    """The previous run's result (heartbeat.json in its artifact), or None when there is none or it cannot be read."""
    try:
        arts = api("GET", f"{API}/repos/{repo}/actions/artifacts?name={ARTIFACT}&per_page=5")["artifacts"]
        art = next((x for x in arts if not x.get("expired") and (x.get("workflow_run") or {}).get("id") != own_id), None)
        if art is None:
            return None
        with tempfile.TemporaryDirectory() as d:  # the download redirects to storage; curl drops the token there
            curl(["-L", "-o", os.path.join(d, "a.zip"), art["archive_download_url"]], "artifact download")
            with zipfile.ZipFile(os.path.join(d, "a.zip")) as z:
                return json.loads(z.read("heartbeat.json"))
    except (LookupError, RuntimeError, KeyError, ValueError, OSError, zipfile.BadZipFile):
        return None


def last_label(items, label, before=None):
    ts = [t(e["createdAt"]) for e in items if e and (e.get("label") or {}).get("name") == label
          and (before is None or t(e["createdAt"]) <= before)]
    return max(ts) if ts else None


def parked_note(comments, now, max_days):
    """The newest comment starting "Parked:", read: {"ok", "why", "resume", "owner"} (founder, 19 Nov: park, never waste)."""
    head = lambda c: (c.get("body") or "").lstrip().lstrip("*").lower()   # "Parked:" or "**Parked:**"
    notes = [c for c in comments if head(c).startswith("parked:")]
    if not notes:
        return {"ok": False, "why": "no \"Parked:\" comment"}
    c = max(notes, key=lambda c: c.get("created_at") or "")
    body = c["body"].replace("\r", "").lstrip().lstrip("*")
    reason = body.split("\n", 1)[0][len("parked:"):].strip(" *")
    owner = re.search(r"^[ \t*]*Owner:[ \t*]*(\S.*)$", body, re.M | re.I)
    resume = re.search(r"^[ \t*]*Resume:[ \t*]*(\d{4}-\d{2}-\d{2})", body, re.M | re.I)
    if not (reason and owner and resume):
        return {"ok": False, "why": "the Parked: comment lacks " + ", ".join(
            w for w, v in (("a reason", reason), ("Owner:", owner), ("Resume: YYYY-MM-DD", resume)) if not v)}
    try:
        day = datetime.strptime(resume.group(1), "%Y-%m-%d").date()
    except ValueError:
        return {"ok": False, "why": f"resume date {resume.group(1)} is not a date"}
    posted = t(c["created_at"]).astimezone(IST).date() if c.get("created_at") else now.astimezone(IST).date()
    out = {"resume": day.isoformat(), "owner": owner.group(1).strip()}
    if (day - posted).days > max_days:
        return {**out, "ok": False, "why": f"resume {day:%d %b} is over {max_days} days after the note"}
    if now.astimezone(IST).date() > day:
        return {**out, "ok": False, "why": f"parked, expired: resume {day:%d %b} has passed"}
    return {**out, "ok": True, "why": ""}


def facts_from(gql, nightly_runs, hb, now, previous=None):
    """The facts the alarms read, from the GraphQL answer, nightly's run list (REST shape) and the previous result."""
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
    return {"now": iso(now), "open_total": repo["open"].get("totalCount"), "main_merges": merges, "open_prs": open_prs, "merged_prs": merged, "batches": batches,
            "nightly_runs": [run(r) for r in nightly_runs], "previous": previous}


RECENT_PAGES = 6   # 30 a page: up to 180 closed PRs and batches, enough for 24 h at 16 Nov's 75 merges plus batches
PAGING_BUDGET_S = 90   # stop paging (sample "partial") well inside the job's 5 min, so a slow GitHub still writes JSON


def collect(hb, now, own_id=None, ctx=None):
    """The facts from GitHub. The previous result is read first and kept in ctx, so a read error later in this run
    can still carry the alarm state and the window forward (main)."""
    repo = os.environ.get("GITHUB_REPOSITORY") or ""
    if "/" not in repo:
        u = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True, cwd=HERE).stdout
        repo = u.strip().rstrip("/").removesuffix(".git").split("github.com")[-1].lstrip(":/")
    owner, name = repo.split("/", 1)
    ctx = {} if ctx is None else ctx
    ctx["previous"] = read_previous(repo, own_id)

    def gql(q, **v):  # two small queries, not one: one big one hit GitHub's resource limit (17 Nov)
        a = api("POST", f"{API}/graphql", {"query": q, "variables": {"owner": owner, "name": name, **v}})
        if a.get("errors") or not a.get("data"):
            raise RuntimeError(f"GraphQL: {(a.get('errors') or [{}])[0].get('message')}")
        return a["data"]["repository"]
    data = gql(QUERY)
    nodes, after, complete = [], None, False   # page the closed PRs back past 24 h, so the P95 sample is whole
    start = time.monotonic()
    for _ in range(RECENT_PAGES):
        if nodes and time.monotonic() - start > PAGING_BUDGET_S:
            break
        page = gql(QUERY_RECENT, after=after)["recent"]
        nodes += page["nodes"]
        old = nodes and t(nodes[-1]["updatedAt"]) < now - timedelta(hours=24)
        if old or not page["pageInfo"]["hasNextPage"]:
            complete = True
            break
        after = page["pageInfo"]["endCursor"]
    data["recent"] = {"nodes": nodes}
    nightly = api("GET", f"{API}/repos/{repo}/actions/workflows/{hb['nightly_workflow']}/runs?per_page=5&event=schedule")
    f = facts_from({"data": {"repository": data}}, nightly["workflow_runs"], hb, now, ctx["previous"])
    for p in f["open_prs"]:   # a parked PR's notes, read only for the few that carry the label
        if hb.get("parked_label", "parked") in p["labels"]:
            p["parked_comments"] = []
            for page in range(1, 4):
                cs = api("GET", f"{API}/repos/{repo}/issues/{p['number']}/comments?per_page=100&page={page}")
                p["parked_comments"] += [{"body": c.get("body"), "created_at": c.get("created_at")} for c in cs
                                         if c.get("author_association") in TRUSTED]   # a public repo: anyone may comment
                if len(cs) < 100:
                    break
    f["recent_complete"] = complete
    return f


# ---- the alarms ----------------------------------------------------------------------------------------------------
def evaluate(f, hb, conformance=None):
    now = t(f["now"]); alarms, report = [], []
    lab, ex, batch = hb["approved_label"], tuple(hb["lane_branch_excluded_prefixes"]), hb["batch_branch_prefix"]
    last_merge = t(f["main_merges"][0]) if f["main_merges"] else None
    lanes = [p for p in f["open_prs"] if not p["head"].startswith(batch)]
    approved = [p for p in lanes if lab in p["labels"]]
    # In the queue = Mergify's queued label (17 Nov: the combined check state of queued PRs reads FAILURE or PENDING
    # through other checks); an approved PR Mergify did not queue is a lane's to fix (stalled-lane below).
    queued = [p for p in approved if not p["draft"] and hb["queued_label"] in p["labels"]]

    # no-merge: a queued PR has waited no_merge_min and nothing merged in that time.
    waits = [p for p in queued if mins(max(filter(None, [t(p["approved_at"]), last_merge]), default=now), now)
             > hb["no_merge_min"]]
    if waits:
        alarms.append({"id": "no-merge", "keys": ["no-merge"], "why": f"no merge to main for over {hb['no_merge_min']} min (last merge "
                       f"{hm(last_merge)}) while {len(waits)} queued PR(s) wait: "
                       + ", ".join(f"#{p['number']}" for p in waits[:6])})

    # queue-stuck: a queued PR with no batch progress since it was approved (or since the last progress).
    prog = [last_merge] + [t(b.get(k)) for b in f["batches"] for k in ("created_at", "closed_at", "last_check_at")]
    last_prog = max((x for x in prog if x), default=None)
    stuck = [p for p in queued if mins(max(filter(None, [t(p["approved_at"]), last_prog]), default=now), now)
             > hb["queue_no_progress_min"]]
    if stuck:
        alarms.append({"id": "queue-stuck", "keys": [f"queue-stuck #{p['number']}" for p in stuck], "why": f"{len(stuck)} queued PR(s) with no merge-queue progress for over "
                       f"{hb['queue_no_progress_min']} min (last progress {hm(last_prog)}): "
                       + ", ".join(f"#{p['number']}" for p in stuck[:6])})

    # stalled-lane: no push, comment or CI activity for over stalled_lane_min, not waiting on CI, not in the queue.
    # Waiting on CI counts only while CI moved in the last 2 x stalled_lane_min (a status that never posts is a stall).
    park, parked, expired = hb.get("parked_label", "parked"), [], []
    for p in lanes:
        if park in p["labels"] and not p["head"].startswith(ex):   # excluded branches are never lanes
            n = parked_note(p.get("parked_comments") or [], now, hb.get("parked_max_days", 7))
            (parked if n["ok"] else expired).append((p, n))
    away = {p["number"] for p, _ in parked + expired}
    stalled, dormant = [], 0
    for p in lanes:
        if p["number"] in away:   # parked: listed below, never a stalled lane
            continue
        ci_idle = mins(t(p["last_ci_at"]), now) if p["last_ci_at"] else 1e9
        waiting = p["ci_state"] in ("PENDING", "EXPECTED") and ci_idle < 2 * hb["stalled_lane_min"]
        if p["head"].startswith(ex) or p in queued or waiting:
            continue
        idle = mins(max(filter(None, [t(p["updated_at"]), t(p["last_ci_at"])])), now)
        if idle > hb["stalled_lane_max_age_h"] * 60:
            dormant += 1
        elif idle > hb["stalled_lane_min"]:
            stalled.append((p, idle))
    if stalled:
        alarms.append({"id": "stalled-lane", "keys": [f"stalled-lane #{p['number']}" for p, _ in stalled], "why": f"{len(stalled)} lane PR(s) with no push, comment or CI for over "
                       f"{hb['stalled_lane_min']} min: " + ", ".join(f"#{p['number']} ({int(i)} min)"
                                                                       for p, i in stalled[:6])})

    if expired:
        alarms.append({"id": "parked-expired", "keys": [f"parked-expired #{p['number']}" for p, _ in expired],
                       "why": f"{len(expired)} parked PR(s) to look at again: " + "; ".join(f"#{p['number']} ({n['why']})"
                                                                                 for p, n in expired[:6])})
    if parked:
        report.append({"id": "parked", "why": f"{len(parked)} parked: " + ", ".join(
            f"#{p['number']} (resume {datetime.fromisoformat(n['resume']):%d %b}, {n['owner'][:40]})" for p, n in parked)})

    # nightly: after nightly_by_ist, a scheduled nightly run created since 00:00 IST today.
    now_ist = now.astimezone(IST); hh, mm = map(int, hb["nightly_by_ist"].split(":"))
    midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    nights = [r for r in f["nightly_runs"] if r["event"] == "schedule" and t(r["created_at"]) >= midnight]
    if now_ist >= midnight.replace(hour=hh, minute=mm) and not nights:
        alarms.append({"id": "nightly", "keys": [f"nightly {midnight.date()}"], "why": f"no scheduled nightly run since 00:00 IST today (due by "
                       f"{hb['nightly_by_ist']} IST)"})
    elif nights:
        report.append({"id": "nightly", "why": f"nightly {hm(t(nights[0]['created_at']))}: "
                       f"{nights[0]['conclusion'] or nights[0]['status']}"})

    # conformance (CK-1)
    if conformance is not None:
        failed = [i["id"] for i in conformance.get("items", []) if i["status"] == "fail"]
        if failed or conformance.get("enforced") != "yes":
            alarms.append({"id": "conformance", "keys": ["conformance " + ", ".join(sorted(failed))], "why": f"set-up conformance: {len(failed)} item(s) fail: "
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
    if f.get("recent_complete") is False:
        report.append({"id": "partial-sample", "why": "the P95 sample stops short of 24 h (page or time limit)"})
    if (f.get("open_total") or 0) > len(f["open_prs"]):
        report.append({"id": "partial-open", "why": f"read the {len(f['open_prs'])} most recently updated of "
                       f"{f['open_total']} open PRs; older ones were not checked"})
    if dormant:
        report.append({"id": "dormant-lanes", "why": f"{dormant} open lane PR(s) idle over {hb['stalled_lane_max_age_h']} h"})

    window = decide(alarms, f.get("previous"), hb, now)
    return {"check": "pipeline heartbeat (CK-2)", "running": "no" if alarms else "yes", "checked_at": iso(now),
            "checked_at_ist": now_ist.strftime("%d %b %H:%M IST"), "alarms": alarms, "report": report,
            "counts": {"open_prs": len(f["open_prs"]), "approved": len(approved), "queued": len(queued),
                       "last_merge": iso(last_merge)}, **window}


def decide(alarms, prev, hb, now):
    """Red only on a change: a new alarm key, an open key passing escalate_after_min (once), or an ALWAYS_RED alarm.
    The state (each key's first_seen, escalated) and the window (last alarm, clear since, longest clear today in IST)
    carry over from the previous result; no previous result = every alarm is new and the window starts now."""
    p, state, red, fired = prev or {}, {}, [], set()
    old = p.get("alarm_state") or {}
    for a in alarms:
        for k in a["keys"]:
            o = old.get(k) or {}
            first, esc = t(o.get("first_seen")) or now, bool(o.get("escalated"))
            if not o:
                red.append(f"new: {k}"); fired.add(k)
            elif not esc and mins(first, now) > hb["escalate_after_min"]:
                esc = True; red.append(f"open over {hb['escalate_after_min']} min: {k}"); fired.add(k)
            state[k] = {"first_seen": iso(first), "escalated": esc}
        if a["id"] in ALWAYS_RED:
            red.append(f"{a['id']} (always red)")
    today = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    gap = mins(t(p["checked_at"]), now) if p.get("checked_at") else None
    missed = gap is not None and gap > 2 * hb["every_min"]   # beats nobody saw: the streak restarts (GitHub drops some)
    last_alarm = now if alarms else t(p.get("last_alarm_at"))
    clear = None if alarms else (now if missed else (t(p.get("clear_since")) or now))
    best = (p.get("longest_green_today_h") or 0.0) if p.get("day_ist") == str(today.date()) else 0.0
    cur_today = mins(max(clear, today), now) / 60 if clear else 0.0
    return {"red": bool(red), "red_reasons": list(dict.fromkeys(red)), "alarm_state": state,
            "still_open": [k for k in state if k not in fired], "previous_read": prev is not None,
            "gap_since_previous_min": None if gap is None else round(gap), "missed_beats": missed,
            "last_alarm_at": iso(last_alarm), "clear_since": iso(clear), "day_ist": str(today.date()),
            "hours_since_last_alarm": None if last_alarm is None else round(mins(last_alarm, now) / 60, 1),
            "green_streak_h": round(mins(clear, now) / 60, 1) if clear else 0.0,
            "longest_green_today_h": round(max(best, cur_today), 1)}


def carry_on_error(prev, now):
    """A read-error run keeps the previous alarm state (open alarms stay open, not new next time) and today's longest
    streak; it is itself an alarm, so the streak stops and hours since the last alarm is 0."""
    p = prev or {}
    state = dict(p.get("alarm_state") or {})
    state.setdefault("read-error", {"first_seen": iso(now), "escalated": False})
    day = str(now.astimezone(IST).date())
    return {"red": True, "red_reasons": ["read-error (always red)"], "alarm_state": state,
            "still_open": [k for k in state if k != "read-error"], "previous_read": prev is not None,
            "gap_since_previous_min": None, "missed_beats": False, "last_alarm_at": iso(now), "clear_since": None,
            "day_ist": day, "hours_since_last_alarm": 0.0, "green_streak_h": 0.0,
            "longest_green_today_h": (p.get("longest_green_today_h") or 0.0) if p.get("day_ist") == day else 0.0}


def markdown(res):
    lines = [f"**Pipeline running: {res['running']}** · checked {res['checked_at_ist']} · green streak "
             f"{res['green_streak_h']} h · longest today {res['longest_green_today_h']} h · hours since last alarm "
             f"{res['hours_since_last_alarm'] if res['hours_since_last_alarm'] is not None else 'none seen'}", ""]
    lines.insert(1, f"Run: {'RED: ' + '; '.join(res['red_reasons']) if res['red'] else 'green'}"
                    + ("" if res.get("previous_read") else " (no previous state read: every alarm counts as new)"))
    lines += [f"- ALARM {a['id']}: {a['why']}" for a in res["alarms"]] or ["- no alarm"]
    if res.get("missed_beats"):
        lines.append(f"- {res['gap_since_previous_min']} min since the previous heartbeat: beats were missed, streak restarted")
    if res.get("still_open"):
        lines.append(f"- still open (unchanged, no new mail): {', '.join(res['still_open'])}")
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
    now, ctx = datetime.now(timezone.utc), {}
    try:
        if a.facts:
            with open(a.facts, encoding="utf-8") as fh:
                f = json.load(fh)
            ctx["previous"] = f.get("previous")
        else:
            f = collect(hb, now, int(os.environ["GITHUB_RUN_ID"]) if os.environ.get("GITHUB_RUN_ID", "").isdigit()
                        else None, ctx)
            if a.save_facts:
                with open(a.save_facts, "w", encoding="utf-8") as fh:
                    json.dump(f, fh, indent=1)
        res = evaluate(f, hb, conf)
    except Exception as e:  # any failure is red and still writes the JSON the board and the next run read
        res = {"check": "pipeline heartbeat (CK-2)", "running": "no", "checked_at": iso(now),
               "checked_at_ist": now.astimezone(IST).strftime("%d %b %H:%M IST"), "report": [],
               "alarms": [{"id": "read-error", "keys": ["read-error"],
                           "why": f"could not read GitHub: {type(e).__name__}: {e}"}],
               "counts": {"open_prs": 0, "approved": 0, "queued": 0, "last_merge": None},
               **carry_on_error(ctx.get("previous"), now)}
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
    return 1 if res["red"] else 0


if __name__ == "__main__":
    sys.exit(main())
