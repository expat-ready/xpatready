#!/usr/bin/env python3
"""Wait-time targets with alarms (founder 18:4x IST 15 Nov, "Start 1 and 2"; A92 plan steps 1 and 2;
design/rule-enforcement-research-2026-11-15.md). Industry basis: Google SRE service-level objectives with actionable
alerts, Kanban service level expectations and item age.

Three targets, read from GitHub every check (read-only; the Lead acts on each MISS in the same check):
  Q  a "Question for the tech lead" on an open PR gets a tech-lead answer within 30 min;
  A  a PR labelled `review: approved` is in the merge queue (label `queued`) within 30 min of the label; after 15 min
     the cause is named (step 2): a skipped `ci` from another PR's run on the same commit shadowing the pass (seen on
     #1811, 15 Nov: drafts #1828 and #1830 had pushed #1811's own head; a job re-run, `@mergifyio refresh` and
     `@mergifyio queue` did not clear it; one new commit on the PR, a pure main merge, did);
  L  an open, unlabelled PR shows activity within 90 min, unless its body or last comment says it waits on something.

Usage:  python3 sle-watch.py [--repo owner/name] [--snapshot file.json] [--dump file.json]
Exit code = number of MISS lines (0 = every target met). Test: check-sle-watch.sh (fixtures, no network).
"""
import json, os, re, subprocess, sys
from datetime import datetime, timezone

Q_MIN, A_MIN, A_DIAG_MIN, L_MIN, STALE_MIN = 30, 30, 15, 90, 3 * 24 * 60
QUESTION = re.compile(r"question for (the )?(tech )?lead", re.I)
ANSWER = re.compile(r"^\W*(\*\*)?(tech lead|lead b\b|lead \d+\b)|tech lead \(lead \d+|\blead \d+ \(current lead", re.I)  # a Lead's answer: tech lead, Lead B or Lead N
WAITS = re.compile(r"\bwaits? (on|for)\b|\bwaiting (on|for)\b|\bstacked on\b|\bblocked (on|by)\b|\b(labels?|merges?) only after\b", re.I)
TOOLS = os.path.dirname(os.path.abspath(__file__))


def origin_repo():
    """owner/name of this checkout's origin (no name is written in the code: the push guard refuses personal names)."""
    url = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", url)
    return m.group(1) if m else ""


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def api(path):
    out = subprocess.run(["bash", os.path.join(TOOLS, "gh.sh"), "api", path], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"gh api {path}: {out.stderr.strip()[:200]}")
    return json.loads(out.stdout or "null")


def fetch(repo):
    """One snapshot of what the three targets need; the evaluation below reads only this."""
    prs = api(f"repos/{repo}/pulls?state=open&per_page=100")
    heads = {}
    for p in prs:
        heads.setdefault(p["head"]["sha"], []).append(p["number"])
    snap = {"now": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "prs": []}
    for p in prs:
        if p["head"]["ref"].startswith("mergify/"):
            continue  # the queue's own batch PRs
        n, labels = p["number"], [l["name"] for l in p["labels"]]
        comments = api(f"repos/{repo}/issues/{n}/comments?per_page=100")
        e = {"number": n, "title": p["title"], "draft": p["draft"], "labels": labels, "head": p["head"]["sha"],
             "updated_at": p["updated_at"], "body": (p.get("body") or "")[:4000],
             "comments": [{"at": c["created_at"], "body": c["body"][:600]} for c in comments],
             "same_head": [m for m in heads[p["head"]["sha"]] if m != n]}
        if "review: approved" in labels and "queued" not in labels:
            ev = api(f"repos/{repo}/issues/{n}/events?per_page=100")
            lab = [x["created_at"] for x in ev if x.get("event") == "labeled" and x.get("label", {}).get("name") == "review: approved"]
            e["approved_at"] = lab[-1] if lab else None
            runs = api(f"repos/{repo}/commits/{p['head']['sha']}/check-runs?check_name=ci&per_page=100")["check_runs"]
            e["ci"] = []
            for r in runs:
                run_id = (re.search(r"/runs/(\d+)", r.get("details_url") or "") or [None, None])[1]
                owner = None
                if r.get("conclusion") == "skipped" and run_id:
                    wr = api(f"repos/{repo}/actions/runs/{run_id}")
                    owner = [x["number"] for x in wr.get("pull_requests", [])] or wr.get("display_title")
                e["ci"].append({"conclusion": r.get("conclusion"), "status": r.get("status"),
                                "completed_at": r.get("completed_at"), "run": run_id, "owner": owner})
        snap["prs"].append(e)
    return snap


def evaluate(snap):
    now, lines, stale = ts(snap["now"]), [], []
    mins = lambda s: int((now - ts(s)).total_seconds() // 60)
    for p in sorted(snap["prs"], key=lambda x: x["number"]):
        n, labels, cs = p["number"], p["labels"], p["comments"]
        # Q: the newest question is answered after it, within Q_MIN.
        qs = [c["at"] for c in cs if QUESTION.search(c["body"]) and not ANSWER.search(c["body"][:200])]
        ans = [c["at"] for c in cs if ANSWER.search(c["body"][:200])]
        if qs and (not ans or max(ans) < max(qs)):
            age = mins(max(qs))
            lines.append(("MISS" if age > Q_MIN else "due", f"Q #{n}: question for the tech lead unanswered {age} min (target {Q_MIN})"))
        # A: approved and green reaches the queue within A_MIN of the label.
        if "review: approved" in labels and "queued" not in labels and p.get("approved_at"):
            age = mins(p["approved_at"])
            if age > A_DIAG_MIN:
                lines.append(("MISS" if age > A_MIN else "due", f"A #{n}: approved {age} min, not queued (target {A_MIN}): {diagnose(p)}"))
        # L: an open lane PR shows activity within L_MIN unless it says it waits.
        if "review: approved" not in labels:
            age = mins(max([p["updated_at"]] + [c["at"] for c in cs]))
            if age > STALE_MIN:
                stale.append(n)
            elif age > L_MIN:
                last = cs[-1]["body"] if cs else ""
                if WAITS.search(p["body"]) or WAITS.search(last):
                    lines.append(("wait", f"L #{n}: quiet {age} min, says it waits ({p['title'][:50]})"))
                else:
                    lines.append(("MISS", f"L #{n}: quiet {age} min with work left (target {L_MIN}): read its session, send its next step"))
    if stale:
        lines.append(("MISS", f"L stale: {len(stale)} open PR(s) with no activity for over 3 days: {' '.join('#' + str(n) for n in stale)}; close each (work saved on its branch) or give it a lane"))
    return lines


def diagnose(p):
    ci = p.get("ci", [])
    ok = [r for r in ci if r["conclusion"] == "success"]
    shadow = [r for r in ci if r["conclusion"] == "skipped" and r.get("owner") not in (None, [p["number"]])]
    if ok and (shadow or p.get("same_head")):
        who = sorted({str(o) for r in shadow for o in (r["owner"] if isinstance(r["owner"], list) else [r["owner"]])} | {str(m) for m in p.get("same_head", [])})
        return (f"ci passed, but a skipped ci from PR(s) {', '.join('#' + w for w in who)} on the same commit shadows it; fix: the lane pushes "
                f"one commit (a pure main merge keeps the label), then the reviewer's Approve line names the new head")
    if not ci or all(r["status"] != "completed" for r in ci):
        return "ci still running on the head: wait for it"
    if not ok:
        return "ci is not green on the head: the lane fixes it (re-run a red part alone, P-371)"
    return "ci green and nothing shadows it: read Mergify's Merge Queue check summary for the unmet condition"


def main(a):
    repo, snapf, dump = origin_repo(), None, None
    while a:
        k = a.pop(0)
        if k == "--repo": repo = a.pop(0)
        elif k == "--snapshot": snapf = a.pop(0)
        elif k == "--dump": dump = a.pop(0)
        else: print(f"unknown argument {k}", file=sys.stderr); return 99
    try:
        snap = json.load(open(snapf)) if snapf else fetch(repo)
    except Exception as e:  # a failed read is said, never read as "all met"
        print(f"MISS  SLE: could not read GitHub ({e}); targets unchecked")
        return 1
    if dump:
        json.dump(snap, open(dump, "w"), indent=1)
    lines = evaluate(snap)
    for kind, text in lines:
        print(f"{kind:<5} {text}")
    miss = sum(1 for k, _ in lines if k == "MISS")
    if not lines:
        print("ok    SLE: every target met (questions 30 min, approved to queued 30 min, lanes 90 min)")
    return miss


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
