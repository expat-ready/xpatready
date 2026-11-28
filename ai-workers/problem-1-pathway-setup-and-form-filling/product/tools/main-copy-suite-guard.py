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
# Running it, not naming it: the script at the start of a command (after ; & | ( or a newline, past VAR=value, nice, nohup
# or time) or after bash/sh/zsh/source/exec/timeout, with any path in front. `cat`, `git add`, `sed` or `grep` on the file
# stay allowed, and so does quoted text with a space in it (a commit message or a comment), which is blanked first.
SUITE = re.compile(r"(?:(?:^|[;&|(]\s*|\n\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:(?:nice|nohup|time)\s+)*"
                   r"|\b(?:bash|sh|zsh|source|exec)(?:\s+-\S+)*\s+|\btimeout\s+\S+\s+(?:bash\s+)?)"
                   r"(?P<path>[^\s;&|()]*/)?(?P<script>check-[A-Za-z0-9_-]+\.sh|run-suites\.sh)\b")
CD = re.compile(r"(?:^|[;&|(]\s*|\n\s*)cd\s+(\"[^\"]*\"|'[^']*'|[^\s;&|()]+)")
# A records check, not a suite: the lead skill runs it in the main copy before a records PR (review I1 of LR-155 suite).
EXEMPT = {"check-docs.sh"}


def lane(cwd):
    if os.environ.get("MAIN_COPY_LANE"):
        return os.environ["MAIN_COPY_LANE"]
    try:
        r = subprocess.run(["bash", os.path.join(HERE, "lane.sh"), "whoami"], cwd=cwd or None,
                           capture_output=True, text=True, timeout=8)
        return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""   # unknown: never the Lead (a hook must not block by failing)


def blank_text(cmd):
    """Quoted strings with a space in them become "" (text such as a commit message, not a path); quotes are paired left
    to right, so the part between two strings is never taken for one."""
    out, i, n = [], 0, len(cmd)
    while i < n:
        q = cmd[i]
        if q in "\"'":
            j = i + 1
            while j < n and cmd[j] != q:
                j += 2 if q == '"' and cmd[j] == "\\" else 1
            body = cmd[i + 1:j]
            out.append('""' if any(c.isspace() for c in body) else cmd[i:j + 1])
            i = j + 1
        else:
            out.append(q)
            i += 1
    return "".join(out)


def toplevel(d):
    d = os.path.abspath(d)
    while d != os.path.dirname(d) and not os.path.isdir(d):
        d = os.path.dirname(d)   # a folder not made yet: judge the nearest one that exists
    try:
        r = subprocess.run(["git", "-C", d, "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=5)
        return os.path.realpath(r.stdout.strip()) if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def runs_in(cmd, m, cwd):
    """The folder the matched script runs in: a `cd` before it on the same line, or its own absolute path (review I2);
    None when a `cd` goes to a folder named by a variable the hook cannot expand."""
    d = cwd
    for c in CD.finditer(cmd[:m.start()]):
        t = os.path.expandvars(os.path.expanduser(c.group(1).strip("\"'")))
        if "$" in t:
            return None   # a `cd` to a variable this hook cannot expand ($TMPDIR unset here): it leaves this copy
        d = t if os.path.isabs(t) else os.path.join(d, t)
    p = os.path.expandvars(os.path.expanduser(m.group("path") or ""))
    if os.path.isabs(p):
        d = p
    return d


def verdict(cmd, cwd):
    text = blank_text(cmd)
    lead = None
    for m in SUITE.finditer(text):
        if m.group("script") in EXEMPT:
            continue
        if lead is None:
            lead = lane(cwd) in ("lead", "lead-stale")
        if not lead:
            return None
        where = runs_in(text, m, cwd)
        if where is None or (where != cwd and toplevel(where) != toplevel(cwd)):
            continue   # it runs in another folder (a throwaway clone): allowed
        return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason":
                "Rule F-7Nov: `%s` runs a guard or test suite in the Lead's main copy (on 7 Nov one removed 3,511 files "
                "here and committed uncommitted work). Fix: run it in a throwaway clone of origin/main, e.g. `git clone "
                "--shared . \"$TMPDIR/suite\" && cd \"$TMPDIR/suite\" && git remote set-url origin https://github.com/<owner>/"
                "<repo> && bash <path>/%s` (check-docs.sh, a records check, stays allowed here)." % (m.group("script"), m.group("script"))}}
    return None


def main(argv):
    if argv[1:] != ["--hook"]:
        print("usage: main-copy-suite-guard.py --hook (reads the PreToolUse event on stdin)", file=sys.stderr)
        return 1   # never 2: Claude Code reads exit 2 from a PreToolUse hook as a block (review I1)
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0   # not JSON: nothing to judge
    if not isinstance(event, dict) or not isinstance(event.get("tool_input") or {}, dict):
        return 0   # not a hook event: nothing to judge
    cmd = (event.get("tool_input") or {}).get("command") or ""
    out = verdict(cmd, event.get("cwd") or "") if isinstance(cmd, str) else None
    if out:
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
