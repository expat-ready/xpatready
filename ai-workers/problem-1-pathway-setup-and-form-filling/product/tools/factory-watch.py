#!/usr/bin/env python3
"""Factory autonomy checks (lab bundle A11, founder A451, 28 Nov 07:3x IST): the night of 27-28 Nov the lab stalled for
hours because cloud lanes went idle unseen, the lab register lagged merges and 76 PRs were open. lead-watch.sh step 10e
prints these as ACT lines each check (no rule in text: a tool).
  idle      an open lab PR (draft or not) whose branch has no push and no comment from its lane for over IDLE_MIN (60)
            minutes while it still needs lane work (no "Ready for Lead read <head sha>", no label):
            "ACT   #<n> lane idle <m> min: wake it (type its next step in claude.ai)". A lane comment is one by the PR's
            author that is not the Lead's check (wake, Lead lines) nor a lane death (lane-death.sh's marker).
  register  a PR merged in the last 48 h whose title or body names LR-<id> while that row's Status on origin/main still
            starts with "Intended": "ACT   register: LR-<id> merged in #<n>, still Intended".
  cap       open PRs not draft, not Dependabot, not labelled paused, over CAP (25): one ACT with the count.
  pause-list  open product PRs not labelled paused (P-847: product work paused): "pause  #<n> <title>"; pause-label.sh.
A lab PR names LR-<id> or starts lab/tooling/tools/pipeline/cleanup; a lead/ branch is the Lead's own, never a lane's.
GitHub is read through gh.sh (REST only, so its curl fallback answers); a read that fails is an ACT, never a silent 0.
Usage: factory-watch.py [idle|register|cap|pause-list ...] (default: idle register cap)
       [--pulls F] [--comments F] [--pushes F] [--merged F] [--register F] [--now EPOCH]   planted data (tests)
Test: check-factory-watch.sh.
"""
import argparse, json, os, re, shlex, subprocess, sys, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "ai-workers/problem-1-pathway-setup-and-form-filling/product/design/lab-register-2026-11-27.md"
LAB = re.compile(r"\bLR-\d+|^(lab|tooling|tools|pipeline|cleanup)\b", re.I)
NOT_LANE = re.compile(r"^\W*(Wake on merge|Lead\b|Lane stopped \(StopFailure\))", re.I)
SESSION = re.compile(r"claude\.ai/code/(session_[A-Za-z0-9]+)")


class Unread(Exception):
    pass


def ts(s):
    return int(datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()) if s else 0


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path, what, fetch):
    try:
        if path:
            with open(path) as f:
                return json.load(f)
        return fetch()
    except Exception as e:  # any failure is one ACT, never a silent none
        raise Unread(f"{what} unreadable ({str(e).splitlines()[0][:100] if str(e) else type(e).__name__})")


def gh(*a):
    cmd = shlex.split(os.environ["FACTORY_GH"]) if os.environ.get("FACTORY_GH") else ["bash", os.path.join(HERE, "gh.sh")]  # tests
    r = subprocess.run(cmd + ["api", *a], capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError((r.stderr or "gh failed").strip())
    return r.stdout


def gh_list(url):  # lists only: gh.sh's curl fallback follows rel="next" for a list, not for a search's {items}
    out, dec, i = [], json.JSONDecoder(), 0
    s = gh("--paginate", url)
    while i < len(s):
        if s[i].isspace():
            i += 1; continue
        v, i = dec.raw_decode(s, i)
        out += v if isinstance(v, list) else v.get("items", [])
    return out


def search_all(url):  # a search answer is {items}: paged by hand, 100 a page, until a short page (GitHub stops at 1000)
    out = []
    for page in range(1, 11):
        items = json.loads(gh(f"{url}&per_page=100&page={page}")).get("items", [])
        out += items
        if len(items) < 100:
            break
    return out


def ready(p, cs):
    head = (p.get("head") or {}).get("sha", "")
    return bool(head) and any("Ready for Lead read" in (c.get("body") or "") and head in (c.get("body") or "") for c in cs)


def labels(p):
    return [l["name"] if isinstance(l, dict) else l for l in p.get("labels") or []]


def branch(p):
    return (p.get("head") or {}).get("ref", "")


def dependabot(p):
    return branch(p).startswith("dependabot/") or (p.get("user") or {}).get("login", "").startswith("dependabot")


def is_lab(p):
    return bool(LAB.search(p.get("title") or "")) and not branch(p).startswith("lead/")


def pushes_from_git():
    r = subprocess.run(["git", "-C", HERE, "for-each-ref", "--format=%(committerdate:unix)\t%(refname:short)", "refs/remotes/origin"],
                       capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr.strip() or "git for-each-ref failed")
    return {b[len("origin/"):]: int(t) for t, b in (l.split("\t", 1) for l in r.stdout.splitlines() if "\t" in l)}


def idle(a, now, pulls):
    lim = int(os.environ.get("IDLE_MIN", "60"))
    if a.pushes:
        with open(a.pushes) as f:
            push = {b: int(t) for t, b in (l.rstrip("\n").split("\t", 1) for l in f if "\t" in l)}
    else:
        push = load(None, "origin's branches", pushes_from_git)
    comments = load(a.comments, "PR comments", lambda: gh_list(f"repos/{{owner}}/{{repo}}/issues/comments?since={iso(now - 48 * 3600)}&per_page=100"))
    by = {}
    for c in comments:
        by.setdefault(str(c.get("issue_url", "")).rsplit("/", 1)[-1], []).append(c)
    rows = []
    for p in pulls:
        if dependabot(p) or labels(p) or not is_lab(p):
            continue
        n, who = str(p["number"]), (p.get("user") or {}).get("login")
        cs = by.get(n, [])
        if ready(p, cs):
            continue
        lane = [ts(c.get("created_at")) for c in cs if (c.get("user") or {}).get("login") == who and not NOT_LANE.match(c.get("body") or "")]
        last = max([push.get(branch(p)) or ts(p.get("updated_at"))] + lane)  # no ref read: the PR's own update time
        m = (now - last) // 60
        if m > lim:
            if not a.comments:  # live: the window holds 48 h only; a "Ready for Lead read" older than that still counts
                try:
                    if ready(p, gh_list(f"repos/{{owner}}/{{repo}}/issues/{n}/comments?per_page=100")):
                        continue
                except Exception:
                    pass  # unread: the ACT stands (a wrong wake costs less than a lane left idle)
            s = SESSION.search(p.get("body") or "")
            rows.append((m, f"ACT   #{n} lane idle {m} min: wake it (type its next step in claude.ai){' [' + s.group(1) + ']' if s else ''}"))
    for _, l in sorted(rows, reverse=True):
        print(l)
    print(f"idle lab PRs: {len(rows)} over {lim} min")


def register(a, now):
    since = now - 48 * 3600
    merged = load(a.merged, "PRs merged in 48 h", lambda: search_all(
        f"search/issues?q=repo:{{owner}}/{{repo}}+is:pr+is:merged+merged:%3E={iso(since)}"))
    if a.register:
        text = open(a.register).read()
    else:
        r = subprocess.run(["git", "-C", HERE, "show", f"origin/main:{REG}"], capture_output=True, text=True, timeout=60)
        if r.returncode:
            raise Unread(f"lab register unreadable on origin/main ({REG})")
        text = r.stdout
    status, col = {}, None
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if col is None and cells[:1] == ["ID"] and "Status" in cells:
            col = cells.index("Status")
        elif col is not None and re.fullmatch(r"LR-\d+", cells[0]) and len(cells) > col:
            status[int(cells[0][3:])] = (cells[0], cells[col])
    if not status:
        raise Unread("lab register has no rows with a Status column")
    lag = []
    for p in merged:
        at = ((p.get("pull_request") or {}).get("merged_at")) or p.get("merged_at")
        if at and ts(at) < since:
            continue
        for i in sorted({int(x) for x in re.findall(r"\bLR-(\d+)", f"{p.get('title') or ''}\n{p.get('body') or ''}")}):
            if i in status and status[i][1].startswith("Intended"):
                lag.append(f"ACT   register: {status[i][0]} merged in #{p['number']}, still Intended")
    for l in dict.fromkeys(lag):
        print(l)
    print(f"register lag: {len(dict.fromkeys(lag))} rows Intended after a merge in 48 h")


def cap(pulls):
    c = int(os.environ.get("OPEN_PR_CAP", "25"))
    n = sum(1 for p in pulls if not p.get("draft") and not dependabot(p) and "paused" not in labels(p))
    if n > c:
        print(f"ACT   open PRs: {n} ready (not draft, not Dependabot, not paused), over the cap of {c}: "
              f"label product PRs paused (pause-label.sh --apply, P-847), merge or close")
    print(f"open PRs: {n} ready of cap {c}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checks", nargs="*")
    for o in ("pulls", "comments", "pushes", "merged", "register"):
        ap.add_argument("--" + o)
    ap.add_argument("--now", type=int)
    a = ap.parse_args()
    now = a.now or int(os.environ.get("NOW") or time.time())
    checks = a.checks or ["idle", "register", "cap"]
    bad = [k for k in checks if k not in ("idle", "register", "cap", "pause-list")]
    if bad:
        ap.error(f"unknown check {bad[0]} (idle, register, cap, pause-list)")
    pulls = None
    for k in checks:
        try:
            if k != "register" and pulls is None:
                pulls = load(a.pulls, "open PRs", lambda: gh_list("repos/{owner}/{repo}/pulls?state=open&per_page=100"))
            if k == "idle":
                idle(a, now, pulls)
            elif k == "register":
                register(a, now)
            elif k == "cap":
                cap(pulls)
            else:
                for p in pulls:
                    if not dependabot(p) and not is_lab(p) and not branch(p).startswith("lead/") and "paused" not in labels(p):
                        print(f"pause  #{p['number']} {p.get('title', '')}")
        except Unread as e:
            print(f"ACT   factory watch {k}: {e}: this check is not done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
