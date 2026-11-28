#!/usr/bin/env python3
"""OS-30 / LR-047 (P-683): a builder PR leaves draft only after the reviewer's Approve.

Reads the PR's comment bodies on stdin, one JSON string per line (gh api --paginate
.../issues/<n>/comments --jq '.[] | .body | @json'), and the head SHA from --head.
pr-rules runs it only on a ready (non-draft), non-records PR not opened by a bot.

  * no line "Reviewer: Approve <40-hex sha>" at the start of a line -> a warning
    (never a failure: P-214, fixes still merge); a quoted ("> ...") or backticked line
    does not count (OS-81);
  * Approve lines, none naming the head -> a notice (the label guard decides; a pure
    merge of main keeps the Approve, P-318 (1));
  * an Approve naming the head -> OK.
Exit 0 for each of these; exit 2 when the input cannot be read (LR-043, fail closed).
Test: product/tools/check-ready-approve.sh.
"""
import argparse
import json
import re
import sys

APPROVE = re.compile(r"^[ \t]*Reviewer:[ \t]*Approve[ \t]+([0-9a-f]{40})\b")
TITLE = "Approve before ready (OS-30, LR-047)"


def approve_shas(bodies):
    shas = []
    for body in bodies:
        for line in body.splitlines():
            m = APPROVE.match(line)
            if m:
                shas.append(m.group(1))
    return shas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--head", required=True)
    a = ap.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", a.head):
        print(f"::error title={TITLE}::the head SHA is unreadable ({a.head!r}), so this step fails (LR-043, fail closed)")
        return 2
    bodies = []
    for n, raw in enumerate(sys.stdin, 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            body = json.loads(raw)
        except ValueError:
            body = None
        if not isinstance(body, str):
            print(f"::error title={TITLE}::comment line {n} is not a JSON string, so this step fails (LR-043, fail closed)")
            return 2
        bodies.append(body)
    shas = approve_shas(bodies)
    if not shas:
        print(f"::warning title={TITLE}::this PR left draft with no 'Reviewer: Approve <full head SHA>' comment line. "
              "P-683: the reviewer approves on the branch first, then the PR is marked ready (/next §5 step 4).")
        print("APPROVE MISSING")
        return 0
    if a.head not in shas:
        print(f"::notice title={TITLE}::the last Approve names {shas[-1]}, the head is {a.head}: a later push needs a new "
              "review unless it is a pure merge of main (P-318 (1)).")
        print("APPROVE OLDER HEAD")
        return 0
    print(f"APPROVE OK {a.head}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
