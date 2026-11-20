#!/usr/bin/env python3
"""Touch-list overlap (enforcement plan row E10; P-576, P-526b, P-438b): a lane brief that declares the files it will
change on a "Touches:" line (also "- **Touches:** ...") is refused when one of them is already changed by an open pull
request, so two lanes never edit the same file at once (8 conflicts, 13-16 Nov). Entries are split on commas and
spaces, backticks dropped; an empty "Touches:" reads the bullet list under it; "Touches: none" or no line checks nothing. An entry matches a changed file when it is the
same path, the end of it after a "/" (`lane-preflight.sh`, `tools/lane-preflight.sh`), a folder ending in "/" holding it,
or a glob (`prisma/*`). A pull request the brief names as "PR #N", "continue(s) #N" or "resume(s) #N" (the lane's own PR) is not counted.
Reads stdin (the brief). Open PRs and their files come from GitHub through gh.sh (one GraphQL list, REST for a PR with
over 100 files), or from TOUCH_PRS, a file of "number<TAB>path" lines (tests). Prints each overlap; exit 0 clean,
1 on an overlap, 2 when the open PRs cannot be read (the hook refuses then too: fails closed).
Used by lane-preflight.sh --hook. Test: check-touch-overlap.sh."""
import fnmatch, json, os, re, subprocess, sys, time

TOOLS = os.path.dirname(os.path.abspath(__file__))
LINE = re.compile(r"^[ \t>*\-\d.]*\**(?:Touches|TOUCHES)\**:\**[ \t]*(.*)$", re.M)   # one line; an empty one takes the bullets below it
BULLET = re.compile(r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.+)$")
FIELD = re.compile(r"^\**[A-Z][A-Za-z ]{0,30}:")   # "- **Done when:** ..." is the next field, not a file
DEADLINE = time.monotonic() + float(os.environ.get("TOUCH_BUDGET_S", "9"))   # the hook itself gets 15 s (settings.json), with checks before and after this one
QUERY = ("query($o:String!,$r:String!,$a:String){repository(owner:$o,name:$r){pullRequests(states:OPEN,first:50,after:$a)"
         "{pageInfo{hasNextPage endCursor} nodes{number files(first:100){pageInfo{hasNextPage} nodes{path}}}}}}")


def touches(brief):
    out = []
    for m in LINE.finditer(brief):
        vals = [m.group(1)]
        if not m.group(1).strip():   # "Touches:" then a bullet list
            after = brief[m.end():].splitlines()[1:]
            vals = []
            for l in after:
                if not l.strip() and not vals: continue   # blank lines before the list
                b = BULLET.match(l)
                if not b or FIELD.match(b.group(1)): break
                vals.append(b.group(1))
        for v in vals:
            for e in re.split(r"[,\s]+", v):
                e = re.sub(r"[`*'\";().]+$", "", re.sub(r"^(?:\*\*|[`'\"(])+", "", e))   # a leading dot stays (.github)
                if e: out.append(e)
    return [] if [e.lower() for e in out] in ([], ["none"]) else [e for e in out if e.lower() != "none"]


def gh(*args):
    left = DEADLINE - time.monotonic()
    if left <= 1:
        raise RuntimeError("out of time reading GitHub (TOUCH_BUDGET_S)")
    r = subprocess.run(["bash", os.path.join(TOOLS, "gh.sh"), *args], capture_output=True, text=True, timeout=left)
    if r.returncode != 0:
        raise RuntimeError("gh %s failed: %s" % (args[0], (r.stderr or r.stdout).strip()[:200]))
    return r.stdout


def open_pr_files():
    """{pr number: [changed paths]} for every open pull request."""
    if os.environ.get("TOUCH_PRS"):
        prs = {}
        with open(os.environ["TOUCH_PRS"], encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    n, p = line.rstrip("\n").split("\t", 1)
                    prs.setdefault(int(n), []).append(p)
        return prs
    owner, name = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip().split("/", 1)
    prs, after = {}, None
    while True:
        args = ["api", "graphql", "-f", "query=" + QUERY, "-f", "o=" + owner, "-f", "r=" + name]
        if after:
            args += ["-f", "a=" + after]
        page = json.loads(gh(*args))["data"]["repository"]["pullRequests"]
        for pr in page["nodes"]:
            files = [x["path"] for x in pr["files"]["nodes"]]
            if pr["files"]["pageInfo"]["hasNextPage"]:   # a big PR (a clean-up stage): every file, by REST
                files = gh("api", "--paginate", "repos/%s/%s/pulls/%d/files?per_page=100" % (owner, name, pr["number"]),
                           "--jq", ".[].filename").splitlines()
            prs[pr["number"]] = files
        if not page["pageInfo"]["hasNextPage"]:
            return prs
        after = page["pageInfo"]["endCursor"]


def hit(entry, path):
    e = re.sub(r"^(\./)+", "", entry.replace("\\", "/")).lstrip("/")   # ./x and /x are x; .github stays .github
    if e.endswith("/"):
        return path.startswith(e) or ("/" + e) in ("/" + path)
    if any(c in e for c in "*?["):
        return fnmatch.fnmatch(path, e) or fnmatch.fnmatch(path, "*/" + e)
    return path == e or path.endswith("/" + e)


def main():
    brief = sys.stdin.read()
    want = touches(brief)
    if not want:
        return 0
    own = {int(n) for n in re.findall(r"\b(?:PR|continues|continue|resumes|resume)\s+#(\d+)\b", brief, re.I)}
    try:
        prs = open_pr_files()
    except Exception as x:   # no network, no token, a changed API: nothing was checked, so no start
        print("TOUCH OVERLAP: the open pull requests could not be read (%s), so the Touches: list was not checked." % x)
        return 2
    found = []
    for n in sorted(prs):
        if n in own:
            continue
        for e in want:
            paths = [p for p in prs[n] if hit(e, p)]
            if paths:
                found.append("%s is changed by open PR #%d (%s%s)" % (e, n, ", ".join(paths[:3]),
                                                                   ", ..." if len(paths) > 3 else ""))
    if not found:
        return 0
    print("TOUCH OVERLAP: " + "; ".join(found) + ". Wait for that PR to merge, take a row that touches other files, "
          "or name the PR as #N in the brief if this lane continues it.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
