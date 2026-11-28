#!/usr/bin/env python3
"""LR-051 (FP #215, OS-37; lab lane fast-route-2, 28 Nov): every refusal a hook guard gives an agent carries the
triple: its rule id, the reason and the allowed fix ([C1]: an agent fixes faster when the failure says what passes).

A refusal site is a line of a guard below that emits a PreToolUse "deny" or a Stop "block". Its text is that line and
up to WINDOW lines above and below it (where the message is built: above in the shell guards, below in the Python ones), never past the site
before or after it. The text must hold:
  rule id  "Rule <id>:"   (<id> as P-788, ENF-771, LR-054, B193, OS-26: letters, then digits)
  fix      "Fix:"         (what passes: the allowed command, the step, or who to ask)
The reason is the prose between them. Scope: the hook guards in settings.json's hooks (the refusals agents meet at run
time); CI checks that exit non-zero take the triple as each is touched (triage 27 Nov, LR-051 class B).
  python3 -I product/tools/refusal-triple.py [--tools DIR]   → one line per site missing a part; exit 1 when any
Test: check-refusal-triple.sh. US$0, no network.
"""
import os, re, sys

GUARDS = ["agent-model-guard.sh", "away-guard.sh", "founder-click-guard.sh", "gmail-start-check.sh",
          "lane-preflight.sh", "lead-act-check.sh", "lead-check-guard.sh", "lead-read-guard.sh", "merge-guard.sh",
          "queued-push-guard.sh", "resource-claim-guard.sh", "stop-check.sh", "ist-time-guard.py", "wip-guard.py"]
WINDOW = 4
SITE = re.compile(r'permissionDecision"?\s*:\s*"deny"|decision"?\s*:\s*"block"')
RULE = re.compile(r'Rule [A-Z][A-Za-z]*-?[0-9][0-9A-Za-z()]*:')
FIX = re.compile(r'Fix:')

def main(argv):
    tools = os.path.dirname(os.path.abspath(__file__))
    if len(argv) > 2 and argv[1] == "--tools": tools = argv[2]
    bad, sites = [], 0
    for g in GUARDS:
        p = os.path.join(tools, g)
        if not os.path.exists(p):
            bad.append(f"{g}: missing, so its refusals were not checked"); continue
        lines = open(p, encoding="utf-8").read().split("\n")
        at = [i for i, l in enumerate(lines) if not l.lstrip().startswith("#") and SITE.search(l)]
        for k, i in enumerate(at):
            sites += 1
            lo = max(i - WINDOW, at[k - 1] + 1 if k else 0)   # never into the site before or after: no borrowed markers
            hi = min(i + WINDOW, at[k + 1] - 1 if k + 1 < len(at) else len(lines) - 1)
            text = "\n".join(lines[lo:hi + 1])
            miss = [n for n, rx in (("a rule id (Rule <id>:)", RULE), ("the allowed fix (Fix:)", FIX)) if not rx.search(text)]
            if miss: bad.append(f"{g}:{i + 1}: the refusal lacks {' and '.join(miss)}")
    for b in bad: print(b)
    print(f"refusal-triple: {sites} refusal sites in {len(GUARDS)} guards, {len(bad)} missing a part")
    return 1 if bad or sites == 0 else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
