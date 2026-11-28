#!/usr/bin/env python3
"""Shell traps refused before they run (LR-155 slice: memory-enforcement audit 27 Nov, top 15 no. 10; memory notes
shell-self-kill-pkill and zsh-colon-modifier-refspec). PreToolUse hook on Bash (.claude/settings.json):

  1. `pkill -f <pattern>` (or `pkill --full`) matches the pattern against whole command lines, so it also matches the
     shell that runs it and kills it (exit 144): the command never finishes and the rest of the line is lost.
  2. An unbraced `$VAR:refs/...` (also `:r`, `:h`, `:t`, `:e`): zsh reads `:r` `:h` `:t` `:e` after a parameter as a
     modifier (zsh's `:refs` is `:r` + "efs"), so a refspec such as "$C:refs/heads/x" is mangled and the wrong ref is
     pushed or fetched (a wrong commit went out, B83). `${VAR}:refs/...` is the same in bash and zsh.

The whole command text is matched, quoted parts too (a regex cannot tell a call from a mention): the refusal names the
safe form, and how to pass mere text. Exit 0 on every input (usage errors 1, never 2: exit 2 blocks); a refusal is the PreToolUse "deny" JSON on stdout (LR-051: rule id, reason, allowed fix).
  python3 -I shell-trap-guard.py --hook   < the PreToolUse event
Test: check-shell-trap-guard.sh. US$0, no network.
"""
import json
import re
import sys

# pkill, then any words of the same simple command (not past ; & | ) or a newline), then a -f flag (alone or bundled) or --full
PKILL = re.compile(r"(?:^|[\s;&|(`{])pkill\b[^;&|)\n]*?\s(?:-[A-Za-z0-9]*f[A-Za-z0-9]*|--full)(?=\s|$|[;&|)])")
REFSPEC = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*:(?:refs|r|h|t|e)\b")


def verdict(cmd):
    """-> the PreToolUse refusal, or None when the command is fine (each refusal's text sits beside it: LR-051)."""
    if PKILL.search(cmd):
        return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason":
                "Rule SHELL-1: `pkill -f` matches whole command lines, so it also kills the shell running it (exit 144) and "
                "the rest of the command is lost. Fix: find the process ids first and kill those, e.g. `pgrep -f '<pattern>' "
                "| grep -v \"^$$\\$\" | xargs -r kill`, or kill by name without -f (`pkill node`). If the command only mentions it (a commit message, a note), write the text with the Write tool and pass the file (`git commit -F <file>`)."}}
    m = REFSPEC.search(cmd)
    if m:
        var, rest = m.group(0)[1:].split(":", 1)
        return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason":
                "Rule SHELL-2: `%s` is an unbraced parameter before a colon; zsh reads `:r`, `:h`, `:t`, `:e` there as a "
                "modifier and mangles the refspec (B83: a wrong commit went out). Fix: brace it, `${%s}:%s`, the same in "
                "bash and zsh; for a zsh modifier you meant, put it inside the braces (`${%s:%s}`); if the command only "
                "mentions it, write the text with the Write tool and pass the file (`git commit -F <file>`)." % (
                    m.group(0), var, rest, var, rest)}}
    return None


def main(argv):
    if argv[1:] != ["--hook"]:
        print("usage: shell-trap-guard.py --hook (reads the PreToolUse event on stdin)", file=sys.stderr)
        return 1   # never 2: Claude Code reads exit 2 from a PreToolUse hook as a block (review I1)
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0   # not JSON: nothing to judge
    if not isinstance(event, dict) or not isinstance(event.get("tool_input") or {}, dict):
        return 0   # not a hook event: nothing to judge (the other hooks still run)
    cmd = (event.get("tool_input") or {}).get("command") or ""
    out = verdict(cmd) if isinstance(cmd, str) else None
    if out:
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
