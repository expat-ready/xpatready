#!/usr/bin/env python3
"""LR-081 (FP #87, #143; CU:7.4; OS-14): sort every remote branch into a class, and remove only the safe ones, on an OK.

Classes (one per branch other than main):
  open      an open PR has it as head: kept
  merged    a PR merged into main has exactly its tip as head (nothing pushed since): SAFE
  contained its tip is already in main (GitHub compare: "behind" or "identical"): SAFE
  merged+   a PR merged into main had it, and commits were pushed after that are not in main: kept, listed
  closed    only closed PRs had it (unmerged, or merged into a branch other than main), with commits not in main: kept
  nopr      no PR ever had it, with commits not in main: kept, listed
Report (default, read-only): counts per class and per first path part, then one line per branch to --list FILE.
--delete (with --yes; the founder's OK per class, repo clean-up plan 7.4): for each SAFE branch, one at a time, the tip is
read again (git ls-remote) and the class worked out again on that tip, against the PR list read again once; only a branch still SAFE on an unchanged tip is
removed (git push --force-with-lease=refs/heads/<b>:<tip> origin --delete <b>, so a push in between keeps it). Never
main, never a branch an open PR has. Prints one line per branch; exit 1 when a tip, a compare or a push failed. Branches
are read from (and removed on) this clone's origin, which must be BRANCH_REPO's (checked before reading).
Live data from `gh api` and `git ls-remote origin`; tests pass --heads/--prs/--compare (and --prs-now, the list as read again) files and set BRANCH_GIT and
BRANCH_GH to stand-ins. Exit 0, or 1 when a data source failed. Test: check-branch-classes.sh.
  python3 -I branch-classes.py [--list FILE] [--delete --yes [--classes merged,contained]]
"""
import argparse, collections, json, os, shlex, subprocess, sys

SAFE = ("merged", "contained")
REPO = os.environ.get("BRANCH_REPO", "expat-ready/xpatready")


def cmd(var, default):
    return shlex.split(os.environ.get(var, default))


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("%s failed (exit %d): %s" % (" ".join(args[:3]), r.returncode, r.stderr.strip()[:200]))
    return r.stdout


def heads_parse(out):
    """git ls-remote --heads output -> {branch: sha}."""
    return {ref[len("refs/heads/"):]: sha for sha, ref in (l.split() for l in out.splitlines() if l.strip())}


def heads_live():
    return heads_parse(run(cmd("BRANCH_GIT", "git") + ["ls-remote", "--heads", "origin"]))


def prs_live():
    out = run(cmd("BRANCH_GH", "gh") + ["api", "--paginate", "repos/%s/pulls?state=all&per_page=100" % REPO,
                                        "--jq", ".[] | [.head.ref, .head.sha, .state, (.merged_at // \"\"), .base.ref] | @tsv"])
    return [l.split("\t") for l in out.splitlines() if l.strip()]


def compare_live(sha):
    """'behind'/'identical'/'ahead'/'diverged', or 'none' (no common history)."""
    try:
        return run(cmd("BRANCH_GH", "gh") + ["api", "repos/%s/compare/main...%s" % (REPO, sha), "--jq", ".status"]).strip()
    except RuntimeError as e:
        if "No common ancestor" in str(e) or "404" in str(e):
            return "none"
        raise


def classify(branch, sha, prs, compare):
    """prs rows: head ref, head sha, state (open/closed), merged_at ('' when unmerged), base ref."""
    mine = [p for p in prs if p[0] == branch]
    if any(p[2] == "open" for p in mine):
        return "open"
    into_main = [p for p in mine if p[3] and len(p) > 4 and p[4] == "main"]   # merged into another branch is not in main
    if any(p[1] == sha for p in into_main):
        return "merged"
    if compare(sha) in ("behind", "identical"):
        return "contained"
    if into_main:
        return "merged+"
    return "closed" if mine else "nopr"


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--list"); a.add_argument("--heads"); a.add_argument("--prs"); a.add_argument("--compare"); a.add_argument("--prs-now")
    a.add_argument("--delete", action="store_true"); a.add_argument("--yes", action="store_true")
    a.add_argument("--classes", default=",".join(SAFE))
    o = a.parse_args()
    if o.delete and not o.yes:
        print("branch classes: --delete needs --yes (the founder's OK per class, repo clean-up plan 7.4); nothing removed")
        return 1
    want = [c for c in o.classes.split(",") if c]
    bad = [c for c in want if c not in SAFE]
    if bad:
        print("branch classes: only %s can be removed, not %s; nothing removed" % (", ".join(SAFE), ", ".join(bad)))
        return 1
    if not o.heads or o.delete:   # live branch data or removal: this clone's origin must be the repository the PRs are from
        try:
            url = run(cmd("BRANCH_GIT", "git") + ["remote", "get-url", "origin"]).strip()
        except RuntimeError as e:
            print("branch classes: origin unreadable (%s); nothing done" % e); return 1
        if not url.rstrip("/").removesuffix(".git").endswith(REPO):
            print("branch classes: origin is %s, not %s; nothing done" % (url, REPO)); return 1
    try:
        heads = heads_parse(open(o.heads).read()) if o.heads else heads_live()
        prs = [l.split("\t") for l in open(o.prs).read().splitlines() if l] if o.prs else prs_live()
        fixed = dict(l.split("\t") for l in open(o.compare).read().splitlines() if l) if o.compare else None
    except (OSError, RuntimeError, ValueError) as e:
        print("branch classes: data unreadable (%s); nothing classified" % e)
        return 1
    cache = {}

    def compare(sha):
        if sha not in cache:
            cache[sha] = fixed.get(sha, "none") if fixed is not None else compare_live(sha)
        return cache[sha]

    rows = []
    try:
        for b in sorted(heads):
            if b == "main":
                continue
            rows.append((classify(b, heads[b], prs, compare), b, heads[b]))
    except RuntimeError as e:
        print("branch classes: GitHub compare failed (%s); nothing classified" % e)
        return 1
    n = collections.Counter(r[0] for r in rows)
    safe = sum(n[c] for c in SAFE)
    claim = sum(1 for r in rows if r[1].startswith("claim/"))
    claim_left = sum(1 for r in rows if r[1].startswith("claim/") and r[0] not in SAFE)
    print("branch classes: %d remote heads (main included); %s" % (len(rows) + ("main" in heads),
          ", ".join("%s %d" % (c, n[c]) for c in ("open", "merged", "contained", "merged+", "closed", "nopr"))))
    print("branch classes: removing the SAFE ones (merged, contained) leaves %d heads; claim/* %d, of them left %d"
          % (len(rows) + ("main" in heads) - safe, claim, claim_left))
    kept = collections.Counter(r[1].split("/")[0] for r in rows if r[0] not in SAFE)
    print("branch classes: kept, by first path part: %s" % ", ".join("%s %d" % kv for kv in kept.most_common(10)))
    if o.list:
        with open(o.list, "w") as f:
            f.write("".join("%s\t%s\t%s\n" % r for r in rows))
    if not o.delete:
        return 0
    removed = kept = failed = 0
    try:   # the PR list is read again once before removing (an open PR made since the report keeps its branch)
        prs_now = ([l.split("\t") for l in open(o.prs_now).read().splitlines() if l] if o.prs_now
                   else prs if o.prs else prs_live())
    except (OSError, RuntimeError) as e:
        print("branch classes: PRs unreadable before removing (%s); nothing removed" % e)
        return 1
    for cls, b, sha in rows:
        if cls not in want:
            continue
        try:
            now = run(cmd("BRANCH_GIT", "git") + ["ls-remote", "--heads", "origin", "refs/heads/" + b]).split()
        except RuntimeError as e:
            print("kept %s: tip unreadable (%s)" % (b, e)); kept += 1; failed += 1; continue
        if not now:
            print("gone %s: already removed" % b); continue
        if now[0] != sha:
            print("kept %s: tip moved %s -> %s since the report" % (b, sha[:9], now[0][:9])); kept += 1; continue
        cache.pop(sha, None)
        try:
            again = classify(b, now[0], prs_now, compare)
        except RuntimeError as e:
            print("kept %s: compare failed on the re-check (%s)" % (b, e)); kept += 1; failed += 1; continue
        if again not in want:
            print("kept %s: now %s, not %s" % (b, again, cls)); kept += 1; continue
        try:
            run(cmd("BRANCH_GIT", "git") + ["push", "--force-with-lease=refs/heads/%s:%s" % (b, sha), "origin", "--delete", b])
        except RuntimeError as e:
            print("kept %s: delete refused (%s)" % (b, e)); kept += 1; failed += 1; continue
        removed += 1
        print("removed %s (%s, tip %s)" % (b, cls, sha[:9]))
    print("branch classes: removed %d, kept %d (%d failed)" % (removed, kept, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
