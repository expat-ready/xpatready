#!/usr/bin/env python3
"""Wait-time targets with alarms (founder 18:4x IST 15 Nov, "Start 1 and 2"; A92 plan steps 1 and 2;
design/rule-enforcement-research-2026-11-15.md). Industry basis: Google SRE service-level objectives with actionable
alerts, Kanban service level expectations and item age.

Three targets, read from GitHub every check (read-only; the Lead acts on each MISS in the same check):
  Q  a "Question for the tech lead" on an open PR gets a tech-lead answer within 10 min (P-798);
  A  a PR labelled `review: approved` is in the merge queue (label `queued`) within 20 min of the label (P-798); after 15 min
     the cause is named (step 2): a skipped `ci` from another PR's run on the same commit shadowing the pass (seen on
     #1811, 15 Nov: drafts #1828 and #1830 had pushed #1811's own head; a job re-run, `@mergifyio refresh` and
     `@mergifyio queue` did not clear it; one new commit on the PR, a pure main merge, did);
  L  an open, unlabelled PR shows activity within 30 min (P-798), unless its body or last comment says it waits on something;
  R  a PR whose current head has a `Reviewer: Approve <sha>` comment (by someone with write access, read as
     label-guard.sh reads it) and a green `ci` carries `review: approved` within 30 min of both being true (B193, P-619:
     on 15 Nov two approved green PRs sat unlabelled);
  B  the founder's board is refreshed within 45 min: the newest `taken_at` in `cockpit/history.jsonl`, or the
     published data time the Lead passes with --board-time (B193; on 15 Nov the board went six hours unrefreshed).

Usage:  python3 sle-watch.py [--repo owner/name] [--snapshot file.json] [--dump file.json] [--grouped]
                            [--board-time ISO-8601] [--board-file history.jsonl]
Exit code = number of MISS lines (0 = every target met). --grouped (lead-watch.sh step 2g, P-798): every line starts
"sle   ", and one "ACT   SLE <target> <n> over target (P-798): #a #b" per target with a MISS, so a check reads one line per target. Test: check-sle-watch.sh (fixtures, no network).
"""
import json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

# P-798 (22 Nov): the 10-minute check sets the targets: a question at the next check (10), approved not queued for two
# checks (20), a lane with work left and no push 30 (were 30, 30 and 90, from the 30-minute check of early November).
Q_MIN, A_MIN, A_DIAG_MIN, L_MIN, STALE_MIN, R_MIN, B_MIN = 10, 20, 15, 30, 3 * 24 * 60, 30, 45
IST = timezone(timedelta(hours=5, minutes=30))
TEAM = ("OWNER", "MEMBER", "COLLABORATOR")  # as label-guard.sh: anyone can comment on a public repository
APPROVE = re.compile(r"\breviewer:\s*approve[sd]?\b", re.I)
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
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))  # Z or an offset (history.jsonl writes +05:30)
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def approve_shas(body):
    """The SHAs a comment's `Reviewer: Approve <sha>` lines name: only the first SHA after "Approve" (label-guard.sh)."""
    out = []
    for line in re.sub(r"[*_`]", "", body or "").splitlines():
        m = APPROVE.search(line)
        if m:
            h = re.search(r"\b[0-9a-f]{7,40}\b", line[m.end():])
            if h:
                out.append(h.group(0))
    return out


def board_time(path):
    """The newest `taken_at` in history.jsonl (one line per IST day); None when there is none."""
    best = None
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            t = json.loads(line).get("taken_at")
            best = t if t and (best is None or ts(t) > ts(best)) else best
        except (ValueError, AttributeError):
            continue
    return best


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
             "approves": [{"at": c["created_at"], "sha": s} for c in comments if c.get("author_association") in TEAM
                          for s in approve_shas(c["body"])],
             "same_head": [m for m in heads[p["head"]["sha"]] if m != n]}
        on_head = any(p["head"]["sha"].startswith(a["sha"]) for a in e["approves"])
        if "review: approved" in labels and "queued" in labels:   # P-798: step-age.py ages queued PRs from the label too (--dump)
            ev = api(f"repos/{repo}/issues/{n}/events?per_page=100")
            lab = [x["created_at"] for x in ev if x.get("event") == "labeled" and x.get("label", {}).get("name") == "review: approved"]
            e["approved_at"] = lab[-1] if lab else None
        if ("review: approved" in labels and "queued" not in labels) or ("review: approved" not in labels and on_head):
            if "review: approved" in labels:
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
        # R: an Approve on the current head plus a green ci gets the label within R_MIN.
        if "review: approved" not in labels:
            ap = [a["at"] for a in p.get("approves", []) if p["head"].startswith(a["sha"])]
            green = [r["completed_at"] for r in p.get("ci", []) if r.get("conclusion") == "success" and r.get("completed_at")]
            if ap and green:
                age = mins(max(min(ap), min(green)))
                if age > R_MIN:
                    lines.append(("MISS", f"R #{n}: Approve on head {p['head'][:9]} and ci green {age} min, no `review: approved` "
                                          f"(target {R_MIN}): the lane labels it (gh pr edit {n} --add-label \"review: approved\")"))
    # B: the board's data is no older than B_MIN.
    if "board_at" in snap:
        b = snap["board_at"]
        if not b:
            lines.append(("MISS", f"B board: no data time found ({snap.get('board_src', 'history.jsonl')}); board freshness unchecked"))
        elif mins(b) > B_MIN:
            lines.append(("MISS", f"B board not refreshed since {ts(b).astimezone(IST).strftime('%d %b %H:%M')} IST "
                                  f"({mins(b)} min, target {B_MIN}): rebuild and republish the board"))
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
    repo, snapf, dump, btime, grouped = origin_repo(), None, None, None, False
    bfile = os.path.join(TOOLS, "..", "cockpit", "history.jsonl")
    while a:
        k = a.pop(0)
        if k == "--repo": repo = a.pop(0)
        elif k == "--snapshot": snapf = a.pop(0)
        elif k == "--dump": dump = a.pop(0)
        elif k == "--board-time": btime = a.pop(0)
        elif k == "--board-file": bfile = a.pop(0)
        elif k == "--grouped": grouped = True
        else: print(f"unknown argument {k}", file=sys.stderr); return 99
    try:
        snap = json.load(open(snapf)) if snapf else fetch(repo)
    except Exception as e:  # a failed read is said, never read as "all met"
        print(f"{'ACT   SLE' if grouped else 'MISS  SLE:'} could not read GitHub ({e}); targets unchecked")
        return 1
    try:  # the Lead's published data time wins; else history.jsonl, unless a snapshot already carries one
        if btime:
            ts(btime); snap["board_at"], snap["board_src"] = btime, "--board-time"
        elif "board_at" not in snap:
            snap["board_at"], snap["board_src"] = board_time(bfile), bfile
    except Exception as e:  # an unreadable board time is said, never read as fresh
        snap["board_at"], snap["board_src"] = None, f"{e}"
    if dump:
        json.dump(snap, open(dump, "w"), indent=1)
    lines = evaluate(snap)
    for kind, text in lines:
        print(f"sle   {kind.lower()} {text}" if grouped else f"{kind:<5} {text}")
    if grouped:
        by = {}
        for kind, text in lines:
            if kind == "MISS":
                by.setdefault(text.split()[0], []).append(text)
        for k, v in by.items():
            ids = sorted({int(x) for t in v for x in re.findall(r"#(\d+)", t)})
            print(f"ACT   SLE {k} {len(v)} over target (P-798): " + (" ".join(f"#{x}" for x in ids) or v[0][:100]))
    miss = sum(1 for k, _ in lines if k == "MISS")
    if not lines:
        print(("sle   ok" if grouped else "ok   ") + f" SLE: every target met (questions {Q_MIN} min, approved to queued {A_MIN} min, lanes {L_MIN} min, Approve+green to label 30 min, board 45 min)")
    return miss


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
