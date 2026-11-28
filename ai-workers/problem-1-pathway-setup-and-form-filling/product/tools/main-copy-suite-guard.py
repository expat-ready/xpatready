#!/usr/bin/env python3
"""No guard or test suites in the Lead's main copy (LR-155 slice: memory-enforcement audit 27 Nov, top 15 no. 8; F-7Nov,
memory guard-tests-not-in-main-copy). On 7 Nov a suite run in the main copy removed 3,511 files from disk there and
committed uncommitted work on the lead branch. PreToolUse hook on Bash (.claude/settings.json): when this copy is the
Lead's (lane.sh whoami: lead or lead-stale; a cloud copy never is), a command that runs a guard test (check-*.sh,
check-guards.sh) or the suites (run-suites.sh) is denied, with the throwaway-clone form to use instead. Lanes, qa and
cloud copies are untouched. Exit 0 on every input (usage errors 1, never 2: exit 2 blocks); a refusal is the PreToolUse "deny" JSON (LR-051: rule id, reason, fix).
  python3 -I main-copy-suite-guard.py --hook   < the PreToolUse event
Env MAIN_COPY_LANE (tests) stands in for lane.sh whoami. Test: check-main-copy-suite-guard.sh. US$0, no network.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Running it, not naming it: the script at the start of a command (after ; & | ( or a newline) or after bash/sh/zsh/source/
# exec/timeout, with any path in front. `cat`, `git add`, `sed` or `grep` on the file stay allowed.
SUITE = re.compile(r"(?:^|[;&|(]\s*|\n\s*|\b(?:bash|sh|zsh|source|exec)(?:\s+-\S+)*\s+|\btimeout\s+\S+\s+(?:bash\s+)?)"
                   r"(?:[^\s;&|()]*/)?(check-[A-Za-z0-9_-]+\.sh|run-suites\.sh)\b")


def lane(cwd):
    if os.environ.get("MAIN_COPY_LANE"):
        return os.environ["MAIN_COPY_LANE"]
    try:
        r = subprocess.run(["bash", os.path.join(HERE, "lane.sh"), "whoami"], cwd=cwd or None,
                           capture_output=True, text=True, timeout=8)
        return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""   # unknown: never the Lead (a hook must not block by failing)


def verdict(cmd, cwd):
    m = SUITE.search(cmd)
    if not m or lane(cwd) not in ("lead", "lead-stale"):
        return None
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason":
            "Rule F-7Nov: `%s` runs a guard or test suite in the Lead's main copy (on 7 Nov one removed 3,511 files here "
            "and committed uncommitted work). Fix: run it in a throwaway clone of origin/main, e.g. `git clone --shared . "
            "\"$TMPDIR/suite\" && cd \"$TMPDIR/suite\" && git remote set-url origin https://github.com/<owner>/<repo>`, then the "
            "same command there." % m.group(1)}}


def main(argv):
    if argv[1:] != ["--hook"]:
        print("usage: main-copy-suite-guard.py --hook (reads the PreToolUse event on stdin)", file=sys.stderr)
        return 1   # never 2: Claude Code reads exit 2 from a PreToolUse hook as a block (review I1)
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    if not isinstance(event, dict) or not isinstance(event.get("tool_input") or {}, dict):
        return 0   # not a hook event: nothing to judge
    cmd = (event.get("tool_input") or {}).get("command") or ""
    out = verdict(cmd, event.get("cwd") or "") if isinstance(cmd, str) else None
    if out:
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
