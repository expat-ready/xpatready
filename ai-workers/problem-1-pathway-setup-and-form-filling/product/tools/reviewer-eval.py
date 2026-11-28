#!/usr/bin/env python3
"""LR-136 (lab register CR-7; Code review guide: test the reviewer on known bugs): the reviewer's test set, cases from
our own history (PRs that merged a bug that later turned main red or was reverted), run whenever the reviewer's brief
(REVIEW.md, the reviewer agent and skill), its tools or its model change. Each case is the culprit PR's diff as it
merged; a fresh reviewer, told nothing about the bug, reviews it by REVIEW.md. Caught = its verdict is Changes or Block
AND an Important finding names a file that holds the bug and, where the case has one, matches its "match" pattern
(words that describe the bug itself: naming the file for another problem is not a catch, first run 28 Nov). The rate is the reviewer's catch rate on bugs we really shipped.
Commands (US$0 here: this script runs no model; the reviewers are plan subagents the runner starts, a pilot of 2 first,
RULES pilot rule LR-128):
  check  [--repo DIR]           the set is 10-20 cases, each complete, its shas present, its bug file in its diff
  brief  <id> [--review FILE]   the blind brief for one case (no bug text): what to diff and how to answer; run the
                                reviewer in a worktree at the case's merge commit (git worktree add --detach), so
                                nothing later (fixes, this set) is on disk; --review: the REVIEW.md under test
  score  <results dir>          one <id>.md per case reviewed (the reviewer's answer; a "Tokens: N" line may be added);
                                prints a line per case and "reviewer-eval: caught C of N (P%), tokens T" (exit 0)
Set: reviewer-test-set.json beside this file. Runs: reviewer-test-runs.md (date, model, brief sha, result, tokens).
Test: check-reviewer-eval.sh."""
import argparse, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SET = os.path.join(HERE, "reviewer-test-set.json")
KEYS = ("id", "culprit_pr", "culprit_merge_sha", "base_sha", "files", "bug", "class", "found_by")
VERDICT = re.compile(r"^\W*Reviewer:\s*(Approve|Changes|Block)\b", re.M | re.I)
TOKENS = re.compile(r"^\W*Tokens:\s*([\d,]+)", re.M | re.I)


def load(path):
    with open(path) as f:
        cases = json.load(f)
    if not isinstance(cases, list):
        raise ValueError("the set is not a list")
    return cases


def git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)


def check(cases, repo, lo=10, hi=20):
    bad = []
    if not lo <= len(cases) <= hi:
        bad.append(f"{len(cases)} cases (the set holds {lo}-{hi})")
    ids = [c.get("id") for c in cases]
    if len(set(ids)) != len(ids):
        bad.append("duplicate ids")
    for c in cases:
        cid = c.get("id", "?")
        miss = [k for k in KEYS if not c.get(k)]
        if miss:
            bad.append(f"{cid}: missing {', '.join(miss)}")
            continue
        if repo:
            for k in ("base_sha", "culprit_merge_sha"):
                if git(repo, "cat-file", "-e", c[k] + "^{commit}").returncode:
                    bad.append(f"{cid}: {k} {c[k][:9]} not in this clone (fetch deeper)")
                    break
            else:
                names = set(git(repo, "diff", "--name-only", c["base_sha"], c["culprit_merge_sha"]).stdout.split())
                for f in c["files"]:
                    if f not in names:
                        bad.append(f"{cid}: bug file {f} not in its diff")
    return bad


def brief(c, review="REVIEW.md"):
    """The blind brief: the diff and REVIEW.md, never the bug, the fix or the case's own words. review is the REVIEW.md
    under test (an old commit may have none, or an older one)."""
    return (f"You are a fresh, independent code reviewer. Read {review} first (the review rules under test) and follow "
            f"it exactly. Review pull request #{c['culprit_pr']} as it merged: the change is "
            f"`git diff {c['base_sha']} {c['culprit_merge_sha']}` (read files at {c['culprit_merge_sha']} for context; "
            f"do not read anything committed after it, its later fixes or reverts, or the reviewer test set). Round 1, "
            f"full review. Each finding: its tag (Important, Nit, Pre-existing), file:line and the fix. Last line: "
            f"`Reviewer: <Approve|Changes|Block> {c['culprit_merge_sha']}`. Do not edit files or post anything.")


def caught(c, text):
    """(caught?, why): Changes or Block, and an Important finding that names a bug file (path or file name)."""
    v = VERDICT.findall(text)
    if not v:
        return False, "no verdict line"
    if v[-1].lower() == "approve":
        return False, "approved"
    names = [n for f in c["files"] for n in (f, os.path.basename(f))]
    on_file = False
    for para in re.split(r"\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)", text):
        if re.search(r"\bImportant\b", para) and any(n in para for n in names):
            on_file = True
            if not c.get("match") or re.search(c["match"], para, re.I):
                return True, f"{v[-1]}, Important on {c['files'][0]}"
    if on_file:
        return False, f"{v[-1]}, Important on {os.path.basename(c['files'][0])} but for another problem (match: {c['match']})"
    return False, f"{v[-1]}, but no Important finding names {os.path.basename(c['files'][0])}"


def score(cases, d):
    n = got = tok = 0
    rows = []
    for c in cases:
        p = os.path.join(d, f"{c['id']}.md")
        if not os.path.exists(p):
            continue
        text = open(p, encoding="utf-8").read()
        ok, why = caught(c, text)
        t = TOKENS.findall(text)
        tok += int(t[-1].replace(",", "")) if t else 0
        n += 1; got += ok
        rows.append(f"{c['id']} #{c['culprit_pr']} {'CAUGHT' if ok else 'MISSED'}  {why}")
    return rows, n, got, tok


def main():
    a = argparse.ArgumentParser(description="the reviewer's test set (LR-136)")
    a.add_argument("cmd", choices=["check", "brief", "score"])
    a.add_argument("arg", nargs="?")
    a.add_argument("--set", default=SET)
    a.add_argument("--review", default=None, help="the REVIEW.md under test (default: the repository's)")
    a.add_argument("--repo", default=os.path.abspath(os.path.join(HERE, "..", "..", "..", "..")))
    o = a.parse_args()
    try:
        cases = load(o.set)
    except (OSError, ValueError) as e:
        print(f"reviewer-eval: the set cannot be read ({e})"); return 2
    if o.cmd == "check":
        bad = check(cases, o.repo)
        for b in bad:
            print(f"FAIL  {b}")
        print(f"reviewer-eval check: {len(cases)} cases, {len(bad)} problems")
        return 1 if bad else 0
    if o.cmd == "brief":
        c = next((c for c in cases if c.get("id") == o.arg), None)
        if not c:
            print(f"reviewer-eval: no case {o.arg}"); return 2
        print(brief(c, o.review or os.path.join(o.repo, "REVIEW.md"))); return 0
    if not o.arg or not os.path.isdir(o.arg):
        print("reviewer-eval: score needs the results folder"); return 2
    rows, n, got, tok = score(cases, o.arg)
    for r in rows:
        print(r)
    print(f"reviewer-eval: caught {got} of {n} ({100 * got // n if n else 0}%), tokens {tok or 'not given'}"
          + ("" if n == len(cases) else f" ({len(cases) - n} cases not run)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
