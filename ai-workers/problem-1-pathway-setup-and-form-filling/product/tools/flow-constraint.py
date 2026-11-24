#!/usr/bin/env python3
"""The constraint section of lead-watch.sh (ENF-738, P-738; B206 part 4, P-751). Each check measures the flow from tools,
never from prose, then names the ONE current constraint (Theory of Constraints, P-622) with its measure and one suggested
action, as an ACT line. 19 Nov lesson: the Lead said "waiting for GitHub machines"; the measured wait was 0.1 min.

Measures:
  batch     merge-queue batches (ci runs on mergify/merge-queue/ branches) ended in the last 6 h: count, median wall time
            (run start to last update), the newest batch's longest part (job)
  machines  Actions runs waiting for a machine: runs-waiting.py's measure (only runs created under 6 h; B206 part 1)
  failed    failed batches in the last 6 h, each with its member PRs; a member still open is the culprit (an innocent
            member merges in a later batch)
  merge     approved to merged: median minutes from the last `review: approved` label to the merge, PRs merged in 24 h
  stages    the same flow in its two steps, by scope (the Mergify queue that merged it: product, pipeline, verdicts,
            records; plus its Mergify file scopes when the batch names any), PRs merged in the last 6 h: labelled ->
            batch start (the first batch PR Mergify opened with it after the label) and batch start -> merged; each
            scope's medians and its slowest PR. A merge whose batch PR is not among the PRs read is counted apart.
  waiting   now: each open labelled PR in no open batch, with its minutes since the label (the live queue wait), and
            the number in a batch
  rate      merges to main per hour, last 3 h
  proven    Proven today: the board's Today card (data.json › first.today), with its age
The one constraint is the first of these over its bar, in the order the flow runs: machines, failed batches, batch time,
labelled -> batch start (a scope's median, n >= 2, or a PR waiting now; the larger), batch start -> merged (a scope's
median, n >= 2), approved to merged, no supply (nothing approved and nothing merging), proof. It is named with its
number: the measure, the scope and the PR that holds it (ENF-738, P-738 (1)). None over its bar: proof stays named.

  python3 product/tools/flow-constraint.py [--facts FILE] [--runs-waiting FILE] [--board FILE] [--now ISO] [--save FILE]
--facts reads gathered facts (tests); otherwise read with gh (REST and one GraphQL query). Read-only, US$0, never cancels.
Test: check-flow-constraint.sh.
"""
import json, os, re, statistics, subprocess, sys
from datetime import datetime, timedelta, timezone

WINDOW_H = 6
BAR = {"wait_min": 15, "fail_share": 0.10, "batch_min": 45, "merge_min": 60, "proven_short": 0,
       # ENF-738 stages, from 24 Nov's measure (26 merges, 8 h): batch start -> merged 31-38 min (product), 7-9 (pipeline,
       # verdicts); labelled -> batch start median 17 (product), 147 (pipeline). Mergify's own wait is 2-5 min.
       "label_to_batch_min": 20, "batch_to_merge_min": 45}
IST = timezone(timedelta(hours=5, minutes=30))
TOOLS = os.path.dirname(os.path.abspath(__file__))
GH = os.environ.get("FLOW_GH") or f"{TOOLS}/gh.sh"   # FLOW_GH: the test's stand-in for gh.sh
STALE_MIN = 45   # a saved runs-waiting.json older than this is not this check's measure (step 2c rewrites it every check)
BOARD_MAX_MIN = int(os.environ.get("FRESH_MAX_MIN") or 10) if str(os.environ.get("FRESH_MAX_MIN") or 10).isdigit() else 10   # the board: ENF-803's limit (P-803), as lead-watch step 11; not a number: 10


def iso(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)   # a time with no zone is read as UTC
    except (TypeError, ValueError):
        return None


def mins(a, b):
    a, b = iso(a), iso(b)
    return round((b - a).total_seconds() / 60, 1) if a and b else None


def gh(*args):
    p = subprocess.run(["bash", GH, *args], capture_output=True, text=True, timeout=90)
    if p.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)[:60]}: exit {p.returncode} {(p.stdout or p.stderr).strip()[:80]}")
    return json.loads(p.stdout)


MERGED_Q = """query($o:String!,$r:String!){repository(owner:$o,name:$r){pullRequests(states:MERGED,first:60,
  orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number mergedAt
  timelineItems(itemTypes:[LABELED_EVENT],last:20){nodes{... on LabeledEvent{createdAt label{name}}}}}}
  open: pullRequests(states:OPEN,labels:["review: approved"],first:50){nodes{number
  timelineItems(itemTypes:[LABELED_EVENT],last:20){nodes{... on LabeledEvent{createdAt label{name}}}}}}}}"""


def gather(now):
    """Facts from GitHub: batch runs, their member PRs and states, merged PRs with their label times. Each part that
    cannot be read is an "error" entry, never an empty list (an empty list would read as "nothing failed")."""
    f = {"now": now.strftime("%Y-%m-%dT%H:%M:%SZ")}
    since = (now - timedelta(hours=WINDOW_H)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        runs = gh("api", f"repos/{{owner}}/{{repo}}/actions/workflows/ci.yml/runs?created=%3E%3D{since}&per_page=100")["workflow_runs"]
        b = [r for r in runs if str(r.get("head_branch", "")).startswith("mergify/merge-queue/") and r.get("status") == "completed"]
        f["batches"] = [{"id": r["id"], "conclusion": r.get("conclusion"), "started": r.get("run_started_at"), "updated": r.get("updated_at"),
                         "pr": (r.get("pull_requests") or [{}])[0].get("number"), "head": r.get("head_branch")} for r in b]
        f["runs_page_full"] = len(runs) >= 100
        if b:
            newest = max(b, key=lambda r: r.get("updated_at") or "")
            jobs = gh("api", f"repos/{{owner}}/{{repo}}/actions/runs/{newest['id']}/jobs?per_page=100")["jobs"]
            f["newest_jobs"] = {"run": newest["id"], "jobs": [{"name": j.get("name"), "min": mins(j.get("started_at"), j.get("completed_at"))} for j in jobs]}
    except Exception as e:   # noqa: BLE001 — any failure is said, never hidden
        f["batches"] = {"error": str(e)[:160]}
    try:
        pulls = gh("api", "repos/{owner}/{repo}/pulls?state=all&sort=updated&direction=desc&per_page=100")
        f["pulls"] = {str(p["number"]): {"title": p.get("title") or "", "body": (p.get("body") or "")[:8000], "state": p.get("state"), "created_at": p.get("created_at"),
                                         "merged_at": p.get("merged_at"), "login": (p.get("user") or {}).get("login"),
                                         "ref": (p.get("head") or {}).get("ref") or ""} for p in pulls}
    except Exception as e:   # noqa: BLE001
        f["pulls"] = {"error": str(e)[:160]}
    try:
        repo = gh("repo", "view", "--json", "owner,name")
        d = gh("api", "graphql", "-f", f"query={MERGED_Q}", "-f", f"o={repo['owner']['login']}", "-f", f"r={repo['name']}")
        f["merged"] = [{"number": n["number"], "merged_at": n["mergedAt"],
                        "approved_at": max([e["createdAt"] for e in n["timelineItems"]["nodes"] if e and (e.get("label") or {}).get("name") == "review: approved"
                                            and e["createdAt"] <= n["mergedAt"]] or [None], key=lambda x: x or "")}
                       for n in d["data"]["repository"]["pullRequests"]["nodes"]]
        op = d["data"]["repository"].get("open")
        f["open_labelled"] = ({"error": "no open labelled PRs in GitHub's answer"} if not isinstance(op, dict) else
                              [{"number": n["number"], "approved_at": max([e["createdAt"] for e in n["timelineItems"]["nodes"] if e and (e.get("label") or {}).get("name") == "review: approved"] or [None], key=lambda x: x or "")}
                               for n in op["nodes"]])
    except Exception as e:   # noqa: BLE001
        f["merged"] = {"error": str(e)[:160]}; f["open_labelled"] = {"error": str(e)[:160]}
    return f


def members(p):
    """Member PR numbers of a Mergify batch PR: "#n" in its title and the body's "- number: n" lines (as queue-gate.sh)."""
    t = [int(x) for x in re.findall(r"#(\d+)", p.get("title") or "")]
    b = [int(x) for x in re.findall(r"(?m)^\s*-\s*number:\s*(\d+)\s*$", p.get("body") or "")]
    return sorted(set(t + b))


def batch_prs(pl):
    """Mergify's batch PRs among the PRs read: {number: {opened, open, queue, members: {pr: [scopes]}}}. The queue is the
    body's "of the `product` queue"; members and their scopes are the body's metadata ("- number: n" then "scopes: [..]"),
    else the title's "#n"."""
    out = {}
    for k, v in pl.items():
        if v.get("login") != "mergify[bot]" or not str(k).isdigit():
            continue
        body = v.get("body") or ""
        q = re.search(r"of the `([\w-]+)` queue", body)
        mem = {int(n): [x.strip() for x in sc.split(",") if x.strip()] for n, sc in re.findall(r"(?m)^\s*-\s*number:\s*(\d+)\s*\n\s*scopes:\s*\[([^\]\n]*)\]", body)}
        for n in members(v):
            mem.setdefault(n, [])
        out[int(k)] = {"opened": v.get("created_at"), "open": v.get("state") == "open", "queue": q.group(1) if q else "queue not named", "members": mem}
    return out


def stages(mg, pl, now):
    """labelled -> batch start -> merged, by scope, for PRs merged in WINDOW_H (see the header)."""
    bp = batch_prs(pl)
    by, unseen, rows = {}, [], []
    for x in mg:
        L, M = iso(x.get("approved_at")), iso(x.get("merged_at"))
        if not L or not M or M < now - timedelta(hours=WINDOW_H):
            continue
        n = x["number"]
        mine = sorted((b for b in bp.values() if n in b["members"] and iso(b["opened"]) and L - timedelta(minutes=1) <= iso(b["opened"]) <= M), key=lambda b: b["opened"])
        if not mine:
            unseen.append(n); continue
        last = mine[-1]
        scope = last["queue"] + ("/" + "+".join(sorted(last["members"][n])) if last["members"][n] else "")
        r = {"pr": n, "scope": scope, "wait": mins(L, mine[0]["opened"]), "in_batch": mins(mine[0]["opened"], M), "batches": len(mine)}
        rows.append(r); by.setdefault(scope, []).append(r)
    med = lambda rs, k: round(statistics.median([r[k] for r in rs]))
    sc = {k: {"n": len(rs), "wait": med(rs, "wait"), "in_batch": med(rs, "in_batch"),
              "slow_wait": max(rs, key=lambda r: r["wait"]), "slow_batch": max(rs, key=lambda r: r["in_batch"])} for k, rs in sorted(by.items())}
    return {"scopes": sc, "unseen": sorted(unseen), "n": len(rows)}


def waiting(op, pl, now):
    """Open labelled PRs now: in no open batch (minutes since the label) or in one."""
    inb = {n for b in batch_prs(pl).values() if b["open"] for n in b["members"]}
    wait = sorted(({"pr": x["number"], "min": mins(x.get("approved_at"), now.strftime("%Y-%m-%dT%H:%M:%SZ"))} for x in op if x["number"] not in inb and x.get("approved_at")),
                  key=lambda w: -(w["min"] or 0))
    return {"waiting": wait, "in_batch": sorted(x["number"] for x in op if x["number"] in inb)}


def measure(f, rw, board, now):
    m = {}
    bs = f.get("batches")
    if isinstance(bs, dict):
        m["batch"] = {"error": bs["error"]}; m["failed"] = {"error": bs["error"]}
    else:
        walls = [w for w in (mins(b["started"], b["updated"]) for b in bs) if w is not None]
        nj = f.get("newest_jobs") or {}
        top = max((j for j in nj.get("jobs", []) if j.get("min") is not None), key=lambda j: j["min"], default=None)
        m["batch"] = {"n": len(bs), "n3": sum(1 for b in bs if (iso(b.get("updated")) or now) >= now - timedelta(hours=3)),
                      "page_full": bool(f.get("runs_page_full")), "median_min": round(statistics.median(walls)) if walls else None,
                      "longest": {"run": nj.get("run"), "name": top["name"], "min": round(top["min"])} if top else None}
        pulls = f.get("pulls")
        fl = []
        bad = isinstance(pulls, dict) and "error" in pulls
        pl = {} if bad else (pulls or {})
        bots = {int(k): members(v) for k, v in pl.items() if v.get("login") == "mergify[bot]" and str(v.get("ref", "")).startswith("mergify/merge-queue/") or (v.get("login") == "mergify[bot]" and not v.get("ref"))}
        for b in sorted((b for b in bs if b.get("conclusion") in ("failure", "timed_out")), key=lambda b: b.get("updated") or ""):
            if bad:
                fl.append({"run": b["id"], "members": None}); continue
            # The run's batch PR: by number, else by its branch (GitHub often leaves pull_requests empty once Mergify deletes it)
            n0 = b.get("pr") or next((int(k) for k, v in pl.items() if b.get("head") and v.get("ref") == b.get("head")), None)
            ms = bots.get(n0, []) if n0 else []
            # A culprit is a member still open and in no later batch (Mergify splits a failed batch: innocent members are
            # re-queued in a newer batch PR and merge there; part 4 review M2)
            later = {m for k, v in bots.items() if n0 and k > n0 for m in v}
            fl.append({"run": b["id"], "batch_pr": n0, "members": [{"n": n, "open": (pl.get(str(n)) or {}).get("state") == "open"
                                                     and not (pl.get(str(n)) or {}).get("merged_at"), "requeued": n in later} for n in ms]})
        m["failed"] = {"n": len(fl), "of": len(bs), "batches": fl}
    if isinstance(rw, dict) and isinstance(rw.get("_age_min"), (int, float)) and rw["_age_min"] > STALE_MIN:
        rw = {"error": f"runs-waiting.json is {round(rw['_age_min'])} min old (step 2c did not write it this check)"}
    m["machines"] = ({"error": rw["error"]} if isinstance(rw, dict) and "error" in rw else
                     {"fresh": rw.get("fresh"), "oldest_min": rw.get("oldest_fresh_min"), "stale": len(rw.get("stale") or [])} if isinstance(rw, dict) else
                     {"error": "runs-waiting.json not found (lead-watch step 2c)"})
    mg = f.get("merged")
    if isinstance(mg, dict):
        m["merge"] = {"error": mg["error"]}; m["rate"] = {"error": mg["error"]}
    else:
        day = [x for x in mg if (iso(x.get("merged_at")) or now) >= now - timedelta(hours=24)]
        am = [w for w in (mins(x.get("approved_at"), x.get("merged_at")) for x in day) if w is not None and w >= 0]
        m["merge"] = {"median_min": round(statistics.median(am)) if am else None, "n": len(am), "merged_24h": len(day)}
        h3 = [x for x in mg if (iso(x.get("merged_at")) or now - timedelta(days=9)) >= now - timedelta(hours=3)]
        m["rate"] = {"per_hour": round(len(h3) / 3, 1), "n": len(h3)}
    pl = f.get("pulls")
    pl_err = pl["error"] if isinstance(pl, dict) and "error" in pl else None
    m["stages"] = ({"error": mg["error"]} if isinstance(mg, dict) else {"error": f"PRs unreadable ({pl_err})"} if pl_err else stages(mg, pl or {}, now))
    op = f.get("open_labelled")
    m["waiting"] = ({"error": op["error"]} if isinstance(op, dict) and "error" in op else {"error": f"PRs unreadable ({pl_err})"} if pl_err else
                    {"error": "open labelled PRs not read"} if op is None else waiting(op, pl or {}, now))
    t = ((board or {}).get("first") or {}).get("today") if isinstance(board, dict) else None
    gen = ((board or {}).get("freshness") or {}).get("generated_at") if isinstance(board, dict) else None
    age = round((now - iso(gen)).total_seconds() / 60) if iso(gen) else None
    m["proven"] = ({"error": f"the board is {age} min old, over {BOARD_MAX_MIN} (P-803): refresh it (P-591)"} if isinstance(t, dict) and age is not None and age > BOARD_MAX_MIN else
                   {"proven": t.get("proven"), "goal": t.get("goal"), "short": t.get("short"), "waiting": t.get("waiting"), "age_min": age} if isinstance(t, dict) else
                   {"error": "the board's data.json has no Today card (refused at step 11, unreadable or empty)"})
    return m


def err(x):
    return isinstance(x, dict) and "error" in x


def lines(m, now):
    act = pick(m)   # first: it marks a median missing while there was something to measure as not measured
    out = [f"constraint (P-738, ENF-738) measured {now.astimezone(IST).strftime('%d %b %H:%M IST')}"]
    b, fl, mc, mg, rt, pv = (m.get(k) for k in ("batch", "failed", "machines", "merge", "rate", "proven"))
    nm = lambda x: f"not measured ({x['error'][:70]})"
    out.append("  batch     " + (nm(b) if err(b) else f"{b['n']} batch(es) started in the last {WINDOW_H} h and ended, median wall "
               + (f"{b['median_min']} min" if b["median_min"] is not None else "not measured")
               + (f"; newest's longest part {b['longest']['name']} {b['longest']['min']} min (run {b['longest']['run']})" if b.get("longest") else "")
               + ("; only the newest 100 ci runs read" if b.get("page_full") else "")))
    out.append("  machines  " + (nm(mc) if err(mc) else f"{mc['fresh']} run(s) waiting (created under 6 h)"
               + (f", oldest {mc['oldest_min']} min" if mc.get("oldest_min") is not None else "") + (f"; {mc['stale']} stale, not counted" if mc.get("stale") else "")))
    if err(fl):
        out.append("  failed    " + nm(fl))
    else:
        desc = "; ".join(f"run {x['run']}: " + ("members unreadable" if x["members"] is None else
                         (", ".join(f"#{y['n']}" + (" (re-queued)" if y["open"] and y.get("requeued") else " (culprit: still open)" if y["open"] else "") for y in x["members"]) or "no members named"))
                         for x in fl["batches"])
        out.append(f"  failed    {fl['n']} of {fl['of']} batch(es) failed in {WINDOW_H} h" + (f": {desc}" if desc else ""))
    out.append("  merge     " + (nm(mg) if err(mg) else "approved to merged median " + (f"{mg['median_min']} min" if mg["median_min"] is not None else "not measured") + f" (n={mg['n']}, merged in 24 h)"))
    st, wt = m.get("stages"), m.get("waiting")
    if err(st):
        out.append("  stages    " + nm(st))
    else:
        out.append(f"  stages    labelled -> batch start -> merged, by scope, PRs merged in {WINDOW_H} h (medians, min)" + ("" if st["scopes"] else ": none with a batch read"))
        for k, g in st["scopes"].items():
            out.append(f"            {k}: n={g['n']}, labelled -> batch start {g['wait']}, batch start -> merged {g['in_batch']}; slowest #{g['slow_wait']['pr']} waited {round(g['slow_wait']['wait'])}, #{g['slow_batch']['pr']} in batch {round(g['slow_batch']['in_batch'])}")
        if st["unseen"]:
            out.append(f"            {len(st['unseen'])} merge(s) with no batch PR among the PRs read: " + ", ".join(f"#{n}" for n in st["unseen"]))
    out.append("  waiting   " + (nm(wt) if err(wt) else (f"{len(wt['waiting'])} labelled PR(s) in no batch" + (": " + ", ".join(f"#{w['pr']} {round(w['min'])} min" for w in wt["waiting"]) if wt["waiting"] else "")
               + f"; {len(wt['in_batch'])} in a batch" + (": " + ", ".join(f"#{n}" for n in wt["in_batch"]) if wt["in_batch"] else ""))))
    out.append("  rate      " + (nm(rt) if err(rt) else f"{rt['per_hour']} merges per hour (last 3 h, {rt['n']} merges)"))
    out.append("  proven    " + (nm(pv) if err(pv) else f"Proven today {pv['proven']}" + (f" of {pv['goal']} ({pv.get('short', 0)} short)" if pv.get("goal") is not None else "")
               + (f", {pv['waiting']} Built waiting for qa" if pv.get("waiting") is not None else "") + (f" (board {pv['age_min']} min old)" if pv.get("age_min") is not None else "")))
    out.append("ACT   " + act)
    return out


def pick(m):
    """The one constraint: the first over its bar, in flow order. A part not measured (unread, stale, or a median missing
    while there was something to measure) is named, never passed as fine (part 4 review M1)."""
    b, fl, mc, mg, rt, pv = (m.get(k) for k in ("batch", "failed", "machines", "merge", "rate", "proven"))
    if not err(mc) and mc.get("fresh") and mc.get("oldest_min") is None:
        mc = m["machines"] = {"error": "runs wait with no age"}
    if not err(b) and b.get("n") and b.get("median_min") is None:
        b = m["batch"] = {"error": "batches with no wall time"}
    if not err(mg) and mg.get("merged_24h") and mg.get("median_min") is None:
        mg = m["merge"] = {"error": "merges with no approval time (label not found)"}
    if not err(mc) and (mc.get("oldest_min") or 0) > BAR["wait_min"]:
        return (f"constraint: machines — {mc['fresh']} run(s) waiting, oldest {mc['oldest_min']} min (bar {BAR['wait_min']}): "
                "check both Mac runners are online (xr-mac, xr-mac-light) and which jobs hold them; product lanes keep priority")
    if not err(fl) and fl["of"] and fl["n"] / fl["of"] > BAR["fail_share"]:
        cul = sorted({f"#{y['n']}" for x in fl["batches"] for y in (x["members"] or []) if y["open"] and not y.get("requeued")})
        return (f"constraint: failed batches — {fl['n']} of {fl['of']} failed in {WINDOW_H} h (bar {int(BAR['fail_share'] * 100)}%), culprits "
                + (", ".join(cul) if cul else "not named yet (members re-queued or unread)") + ": send each culprit back to its lane with the batch's failed parts; "
                "it rejoins on a green full run and a \"Batch failures covered:\" line (P-731)")
    if not err(b) and (b.get("median_min") or 0) > BAR["batch_min"]:
        lp = b.get("longest")
        return (f"constraint: batch time — median wall {b['median_min']} min (bar {BAR['batch_min']}): "
                + (f"split or speed up the longest part, {lp['name']} ({lp['min']} min)" if lp else "read the newest batch's jobs for the longest part"))
    st, wt = m.get("stages"), m.get("waiting")
    if not err(st) and not st["n"] and st["unseen"]:
        st = m["stages"] = {"error": "merges with no batch PR among the PRs read: " + ", ".join(f"#{n}" for n in st["unseen"][:8])}
    if not err(st) or not err(wt):
        bar = BAR["label_to_batch_min"]
        c = [(g["wait"], f"{k} median {g['wait']} min over n={g['n']}, slowest #{g['slow_wait']['pr']} {round(g['slow_wait']['wait'])} min")
             for k, g in ({} if err(st) else st["scopes"]).items() if g["n"] >= 2 and g["wait"] > bar]
        c += [(w["min"], f"#{w['pr']} labelled {round(w['min'])} min ago, in no batch") for w in ([] if err(wt) else wt["waiting"]) if (w["min"] or 0) > bar]
        if c:
            v, what = max(c, key=lambda t: t[0])
            return (f"constraint: labelled -> batch start — {what} (bar {bar}): find what holds it before Mergify batches it "
                    "(queue-gate's reason on the PR, a red or missing ci on its head, a conflict, a barrier or a full queue) and clear it")
    if not err(st):
        bar = BAR["batch_to_merge_min"]
        c = [(g["in_batch"], k, g) for k, g in st["scopes"].items() if g["n"] >= 2 and g["in_batch"] > bar]
        if c:
            v, k, g = max(c, key=lambda t: t[0])
            return (f"constraint: batch start -> merged — {k} median {v} min over n={g['n']} (bar {bar}), slowest #{g['slow_batch']['pr']} "
                    f"{round(g['slow_batch']['in_batch'])} min in {g['slow_batch']['batches']} batch(es): read its batches' failed or longest parts")
    if not err(mg) and (mg.get("median_min") or 0) > BAR["merge_min"]:
        return (f"constraint: approved to merged — median {mg['median_min']} min (bar {BAR['merge_min']}): find what holds the oldest "
                "approved PR (Lead read, a dequeue, a stale queue-fresh) and clear it")
    if not err(rt) and rt["n"] == 0 and not err(b) and b.get("n3") == 0:
        return "constraint: supply — no merge and no batch in 3 h: approved PRs are missing; answer lane questions and Lead reads, give idle lanes their next row"
    unmeasured = [k for k in ("machines", "failed", "batch", "merge", "stages", "waiting", "rate", "proven") if err(m.get(k))]
    if unmeasured:
        return f"constraint: not measured — {', '.join(unmeasured)} unreadable or stale this check: read them by hand before naming a constraint (P-738 (3))"
    if pv.get("goal") is not None and (pv.get("short") or 0) > BAR["proven_short"]:
        return (f"constraint: proof — Proven today {pv['proven']} of {pv['goal']}, {pv.get('waiting')} Built waiting for qa: "
                "point qa lanes at the Built items nearest done (P-733)")
    return "constraint: none over its bar — re-measure next check; keep lanes fed (P-738 (2))"


def main(argv):
    a = {k: None for k in ("--facts", "--runs-waiting", "--board", "--now", "--save")}
    for i, x in enumerate(argv):
        if x in a and i + 1 < len(argv):
            a[x] = argv[i + 1]
    now = iso(a["--now"]) if a["--now"] else datetime.now(timezone.utc)
    load = lambda p: json.load(open(p)) if p else None
    try:
        rw = load(a["--runs-waiting"])
        if isinstance(rw, dict):
            rw["_age_min"] = (now - datetime.fromtimestamp(os.path.getmtime(a["--runs-waiting"]), timezone.utc)).total_seconds() / 60
    except (OSError, ValueError, TypeError):
        rw = None
    try:
        board = load(a["--board"])
    except (OSError, ValueError):
        board = None
    try:
        f = load(a["--facts"]) if a["--facts"] else gather(now)
        m = measure(f, rw, board, now)
    except Exception as e:   # noqa: BLE001 — the section says it could not run, and still gives its ACT
        print(f"constraint (P-738) could not be measured: {str(e)[:120]}\nACT   constraint: not measured — the section failed; read the flow by hand (P-738 (3))")
        return 0
    out = lines(m, now)   # pick() inside marks missing medians as not measured: save after it
    if a["--save"]:
        with open(a["--save"], "w") as fh:
            json.dump(m, fh)
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
