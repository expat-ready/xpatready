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
  rate      merges to main per hour, last 3 h
  proven    Proven today: the board's Today card (data.json › first.today), with its age
The one constraint is the first of these over its bar, in the order the flow runs: machines, failed batches, batch time,
approved to merged, no supply (nothing approved and nothing merging), proof. None over its bar: proof stays named.

  python3 product/tools/flow-constraint.py [--facts FILE] [--runs-waiting FILE] [--board FILE] [--now ISO] [--save FILE]
--facts reads gathered facts (tests); otherwise read with gh (REST and one GraphQL query). Read-only, US$0, never cancels.
Test: check-flow-constraint.sh.
"""
import json, statistics, subprocess, sys
from datetime import datetime, timedelta, timezone

WINDOW_H = 6
BAR = {"wait_min": 15, "fail_share": 0.10, "batch_min": 45, "merge_min": 60, "proven_short": 0}
IST = timezone(timedelta(hours=5, minutes=30))
TOOLS = __file__.rsplit("/", 1)[0]


def iso(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def mins(a, b):
    a, b = iso(a), iso(b)
    return round((b - a).total_seconds() / 60, 1) if a and b else None


def gh(*args):
    p = subprocess.run(["bash", f"{TOOLS}/gh.sh", *args], capture_output=True, text=True, timeout=90)
    if p.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)[:60]}: exit {p.returncode} {(p.stdout or p.stderr).strip()[:80]}")
    return json.loads(p.stdout)


MERGED_Q = """query($o:String!,$r:String!){repository(owner:$o,name:$r){pullRequests(states:MERGED,first:60,
  orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number mergedAt
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
        if b:
            newest = max(b, key=lambda r: r.get("updated_at") or "")
            jobs = gh("api", f"repos/{{owner}}/{{repo}}/actions/runs/{newest['id']}/jobs?per_page=100")["jobs"]
            f["newest_jobs"] = {"run": newest["id"], "jobs": [{"name": j.get("name"), "min": mins(j.get("started_at"), j.get("completed_at"))} for j in jobs]}
    except Exception as e:   # noqa: BLE001 — any failure is said, never hidden
        f["batches"] = {"error": str(e)[:160]}
    try:
        pulls = gh("api", "repos/{owner}/{repo}/pulls?state=all&sort=updated&direction=desc&per_page=100")
        f["pulls"] = {str(p["number"]): {"title": p.get("title") or "", "body": (p.get("body") or "")[:4000], "state": p.get("state"),
                                         "merged_at": p.get("merged_at"), "login": (p.get("user") or {}).get("login")} for p in pulls}
    except Exception as e:   # noqa: BLE001
        f["pulls"] = {"error": str(e)[:160]}
    try:
        repo = gh("repo", "view", "--json", "owner,name")
        d = gh("api", "graphql", "-f", f"query={MERGED_Q}", "-f", f"o={repo['owner']['login']}", "-f", f"r={repo['name']}")
        f["merged"] = [{"number": n["number"], "merged_at": n["mergedAt"],
                        "approved_at": max([e["createdAt"] for e in n["timelineItems"]["nodes"] if e and (e.get("label") or {}).get("name") == "review: approved"
                                            and e["createdAt"] <= n["mergedAt"]] or [None], key=lambda x: x or "")}
                       for n in d["data"]["repository"]["pullRequests"]["nodes"]]
    except Exception as e:   # noqa: BLE001
        f["merged"] = {"error": str(e)[:160]}
    return f


def members(p):
    """Member PR numbers of a Mergify batch PR: "#n" in its title and the body's "- number: n" lines (as queue-gate.sh)."""
    import re
    t = [int(x) for x in re.findall(r"#(\d+)", p.get("title") or "")]
    b = [int(x) for x in re.findall(r"(?m)^\s*-\s*number:\s*(\d+)\s*$", p.get("body") or "")]
    return sorted(set(t + b))


def measure(f, rw, board, now):
    m = {}
    bs = f.get("batches")
    if isinstance(bs, dict):
        m["batch"] = {"error": bs["error"]}; m["failed"] = {"error": bs["error"]}
    else:
        walls = [w for w in (mins(b["started"], b["updated"]) for b in bs) if w is not None]
        nj = f.get("newest_jobs") or {}
        top = max((j for j in nj.get("jobs", []) if j.get("min") is not None), key=lambda j: j["min"], default=None)
        m["batch"] = {"n": len(bs), "median_min": round(statistics.median(walls)) if walls else None,
                      "longest": {"run": nj.get("run"), "name": top["name"], "min": round(top["min"])} if top else None}
        pulls = f.get("pulls")
        fl = []
        for b in sorted((b for b in bs if b.get("conclusion") in ("failure", "timed_out")), key=lambda b: b.get("updated") or ""):
            if isinstance(pulls, dict) and "error" in pulls:
                fl.append({"run": b["id"], "members": None}); continue
            bp = (pulls or {}).get(str(b.get("pr"))) or {}
            ms = members(bp) if bp.get("login") == "mergify[bot]" else []
            fl.append({"run": b["id"], "members": [{"n": n, "open": ((pulls or {}).get(str(n)) or {}).get("state") == "open"
                                                     and not ((pulls or {}).get(str(n)) or {}).get("merged_at")} for n in ms]})
        m["failed"] = {"n": len(fl), "of": len(bs), "batches": fl}
    m["machines"] = ({"error": rw["error"]} if isinstance(rw, dict) and "error" in rw else
                     {"fresh": rw.get("fresh"), "oldest_min": rw.get("oldest_fresh_min"), "stale": len(rw.get("stale") or [])} if isinstance(rw, dict) else
                     {"error": "runs-waiting.json not found (lead-watch step 2c)"})
    mg = f.get("merged")
    if isinstance(mg, dict):
        m["merge"] = {"error": mg["error"]}; m["rate"] = {"error": mg["error"]}
    else:
        day = [x for x in mg if (iso(x.get("merged_at")) or now) >= now - timedelta(hours=24)]
        am = [w for w in (mins(x.get("approved_at"), x.get("merged_at")) for x in day) if w is not None and w >= 0]
        m["merge"] = {"median_min": round(statistics.median(am)) if am else None, "n": len(am)}
        h3 = [x for x in mg if (iso(x.get("merged_at")) or now - timedelta(days=9)) >= now - timedelta(hours=3)]
        m["rate"] = {"per_hour": round(len(h3) / 3, 1), "n": len(h3)}
    t = ((board or {}).get("first") or {}).get("today") if isinstance(board, dict) else None
    gen = ((board or {}).get("freshness") or {}).get("generated_at") if isinstance(board, dict) else None
    m["proven"] = ({"proven": t.get("proven"), "goal": t.get("goal"), "short": t.get("short"), "waiting": t.get("waiting"),
                    "age_min": round((now - iso(gen)).total_seconds() / 60) if iso(gen) else None} if isinstance(t, dict) else
                   {"error": "the board's data.json has no Today card"})
    return m


def err(x):
    return isinstance(x, dict) and "error" in x


def lines(m, now):
    out = [f"constraint (P-738, ENF-738) measured {now.astimezone(IST).strftime('%d %b %H:%M IST')}"]
    b, fl, mc, mg, rt, pv = (m.get(k) for k in ("batch", "failed", "machines", "merge", "rate", "proven"))
    nm = lambda x: f"not measured ({x['error'][:70]})"
    out.append("  batch     " + (nm(b) if err(b) else f"{b['n']} batch(es) ended in {WINDOW_H} h, median wall "
               + (f"{b['median_min']} min" if b["median_min"] is not None else "not measured")
               + (f"; newest's longest part {b['longest']['name']} {b['longest']['min']} min (run {b['longest']['run']})" if b.get("longest") else "")))
    out.append("  machines  " + (nm(mc) if err(mc) else f"{mc['fresh']} run(s) waiting (created under 6 h)"
               + (f", oldest {mc['oldest_min']} min" if mc.get("oldest_min") is not None else "") + (f"; {mc['stale']} stale, not counted" if mc.get("stale") else "")))
    if err(fl):
        out.append("  failed    " + nm(fl))
    else:
        desc = "; ".join(f"run {x['run']}: " + ("members unreadable" if x["members"] is None else
                         (", ".join(f"#{y['n']}" + (" (culprit: still open)" if y["open"] else "") for y in x["members"]) or "no members named"))
                         for x in fl["batches"])
        out.append(f"  failed    {fl['n']} of {fl['of']} batch(es) failed in {WINDOW_H} h" + (f": {desc}" if desc else ""))
    out.append("  merge     " + (nm(mg) if err(mg) else "approved to merged median " + (f"{mg['median_min']} min" if mg["median_min"] is not None else "not measured") + f" (n={mg['n']}, merged in 24 h)"))
    out.append("  rate      " + (nm(rt) if err(rt) else f"{rt['per_hour']} merges per hour (last 3 h, {rt['n']} merges)"))
    out.append("  proven    " + (nm(pv) if err(pv) else f"Proven today {pv['proven']}" + (f" of {pv['goal']} ({pv.get('short', 0)} short)" if pv.get("goal") is not None else "")
               + (f", {pv['waiting']} Built waiting for qa" if pv.get("waiting") is not None else "") + (f" (board {pv['age_min']} min old)" if pv.get("age_min") is not None else "")))
    out.append("ACT   " + pick(m))
    return out


def pick(m):
    """The one constraint: the first over its bar, in flow order. Unmeasured parts are named, never passed as fine."""
    b, fl, mc, mg, rt, pv = (m.get(k) for k in ("batch", "failed", "machines", "merge", "rate", "proven"))
    if not err(mc) and (mc.get("oldest_min") or 0) > BAR["wait_min"]:
        return (f"constraint: machines — {mc['fresh']} run(s) waiting, oldest {mc['oldest_min']} min (bar {BAR['wait_min']}): "
                "check both Mac runners are online (xr-mac, xr-mac-light) and which jobs hold them; product lanes keep priority")
    if not err(fl) and fl["of"] and fl["n"] / fl["of"] > BAR["fail_share"]:
        cul = sorted({f"#{y['n']}" for x in fl["batches"] for y in (x["members"] or []) if y["open"]})
        return (f"constraint: failed batches — {fl['n']} of {fl['of']} failed in {WINDOW_H} h (bar {int(BAR['fail_share'] * 100)}%), culprits "
                + (", ".join(cul) if cul else "not named") + ": send each culprit back to its lane with the batch's failed parts; "
                "it rejoins on a green full run and a \"Batch failures covered:\" line (P-731)")
    if not err(b) and (b.get("median_min") or 0) > BAR["batch_min"]:
        lp = b.get("longest")
        return (f"constraint: batch time — median wall {b['median_min']} min (bar {BAR['batch_min']}): "
                + (f"split or speed up the longest part, {lp['name']} ({lp['min']} min)" if lp else "read the newest batch's jobs for the longest part"))
    if not err(mg) and (mg.get("median_min") or 0) > BAR["merge_min"]:
        return (f"constraint: approved to merged — median {mg['median_min']} min (bar {BAR['merge_min']}): find what holds the oldest "
                "approved PR (Lead read, a dequeue, a stale queue-fresh) and clear it")
    if not err(rt) and rt["n"] == 0 and not err(fl) and fl["of"] == 0:
        return "constraint: supply — no merge and no batch in 3 h: approved PRs are missing; answer lane questions and Lead reads, give idle lanes their next row"
    unmeasured = [k for k in ("machines", "failed", "batch", "merge", "rate") if err(m.get(k))]
    if unmeasured:
        return f"constraint: not measured — {', '.join(unmeasured)} unreadable this check: read them by hand before naming a constraint (P-738 (3))"
    if not err(pv) and pv.get("goal") is not None and (pv.get("short") or 0) > BAR["proven_short"]:
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
    except (OSError, ValueError):
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
    if a["--save"]:
        with open(a["--save"], "w") as fh:
            json.dump(m, fh)
    print("\n".join(lines(m, now)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
