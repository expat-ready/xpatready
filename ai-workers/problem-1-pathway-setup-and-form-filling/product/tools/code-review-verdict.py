#!/usr/bin/env python3
"""LR-132 (lab register, CR-3; Code Review docs read 28 Nov: code.claude.com/docs/en/code-review-pull-requests.md "Check
run output", "Read the result from a script"; code-review-troubleshooting.md "Check how far the review got"): reads Claude
Code Review's verdict on a pull request's head, by script. Report-only first (P-717 (b)): it prints and exits; nothing
reads it yet. The Lead runs it on risky PRs (the ones sent to `@claude review`); the risky-path gate takes it in a later
PR. The check run itself is never made a required check: "It never concludes as a failure" (the docs).
Order (the docs: "start with the Claude Code Review check run. Its title says how far"):
  1 no "Claude Code Review" check run on the head commit           → no verdict (a review of an older commit is not one)
  2 title "Code review queued..." / "in progress..."               → no verdict (not finished)
  3 title "Code review not repeated — earlier findings still open" → block (it has no severity line; Important open)
  4 title ending "no new changes" ("Code review skipped — ...")    → pass (no Important finding still open)
  5 title failed / timed out / declined / not run                  → no verdict (the review did not run or finish;
                                                                     "declined" covers a budget skip, DK7)
  6 otherwise the LAST line of output.text, `<!-- bughunter-severity: {"nit":n,"normal":n,"pre_existing":n} -->`:
    normal (Important) > 0 → block; normal = 0 → pass; the line missing or unreadable → no verdict, never zero findings.
Exit 0 pass, 1 block, 3 no verdict, 2 cannot read GitHub. One line: "code-review #N <sha9>: <verdict> (<why>)".
Reads GitHub through gh (read-only, US$0), or --pr-json/--runs-json FILE (as gh api returns them). Test:
check-code-review-verdict.sh.
   python3 -I product/tools/code-review-verdict.py --pr 4038 [--repo OWNER/NAME] [--pr-json F --runs-json F]"""
import argparse, json, os, re, subprocess, sys

NAME = "Claude Code Review"
MARK = re.compile(r"^<!-- bughunter-severity: (.*) -->$")
NOT_DONE = re.compile(r"^Code review (queued|in progress)", re.I)
NO_RUN = re.compile(r"^Code review (failed|timed out|declined|not run)", re.I)


def gh(path):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "gh api failed").splitlines()[0][:120])
    return json.loads(r.stdout)


def verdict(runs, head):
    """(exit, word, why) from the check runs of the head commit."""
    mine = [c for c in runs if c.get("name") == NAME and c.get("head_sha") == head]
    if not mine:
        return 3, "no verdict", f"no {NAME} check run on the head commit"
    c = max(mine, key=lambda c: (c.get("started_at") or "", c.get("id") or 0))
    out = c.get("output") or {}
    title = (out.get("title") or "").strip()
    if c.get("status") != "completed" or NOT_DONE.match(title):
        return 3, "no verdict", f"review not finished: {title or c.get('status')}"
    if "not repeated" in title.lower():
        return 1, "block", f"{title} (Important findings from the earlier review are still open)"
    if title.lower().endswith("no new changes"):
        return 0, "pass", f"{title} (no Important finding still open)"
    if NO_RUN.match(title):
        return 3, "no verdict", f"{title} (the review did not run or finish)"
    lines = (out.get("text") or "").rstrip("\n").splitlines()
    m = MARK.match(lines[-1].strip()) if lines else None
    if not m:
        return 3, "no verdict", f"no severity line ({title or 'no title'}): not read as zero findings"
    try:
        sev = json.loads(m.group(1))
        imp = int(sev["normal"])
    except (ValueError, KeyError, TypeError):
        return 3, "no verdict", "severity line unreadable"
    counts = f"{imp} Important, {int(sev.get('nit') or 0)} Nit, {int(sev.get('pre_existing') or 0)} Pre-existing"
    return (1, "block", counts) if imp > 0 else (0, "pass", counts)


def main():
    a = argparse.ArgumentParser(description="Claude Code Review's verdict on a PR's head (LR-132, report-only)")
    a.add_argument("--pr", type=int, required=True)
    a.add_argument("--repo", default=os.environ.get("CR_REPO", "expat-ready/xpatready"))
    a.add_argument("--pr-json")
    a.add_argument("--runs-json")
    o = a.parse_args()
    try:
        pr = json.load(open(o.pr_json)) if o.pr_json else gh(f"repos/{o.repo}/pulls/{o.pr}")
        head = pr["head"]["sha"]
        runs = json.load(open(o.runs_json)) if o.runs_json else gh(f"repos/{o.repo}/commits/{head}/check-runs?check_name={NAME.replace(' ', '%20')}&per_page=100")
        runs = runs.get("check_runs", []) if isinstance(runs, dict) else runs
        if not isinstance(runs, list):
            raise ValueError("check runs are not a list")
    except Exception as e:  # noqa: BLE001 - every read failure is one answer: cannot read, said
        print(f"code-review #{o.pr}: cannot read ({str(e)[:140]})")
        return 2
    code, word, why = verdict(runs, head)
    print(f"code-review #{o.pr} {head[:9]}: {word} ({why})")
    return code


if __name__ == "__main__":
    sys.exit(main())
