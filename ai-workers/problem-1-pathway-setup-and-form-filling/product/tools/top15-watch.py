#!/usr/bin/env python3
"""Top 15 enforcers (LR-155, lab automation-measures; founder A432: "provisioning and tooling ... enforce"). Reads
design/top15-enforcers.tsv: the memory-enforcement audit's 15 most harmful text-only or partly enforced rules, each with
its enforcer on main (a file that must contain a given text) or empty (owed by the row named). Prints
  top15  N/15 enforced on <ref>; owed: #2 (LR-004 / LR-046), ...
and one "lost" line per row whose enforcer is listed but is gone from the ref (file missing or text not in it).
Exit 0 when nothing is lost (owed rows are progress, not a failure); 1 when an enforcer was lost; 2 when the table
cannot be read or has not exactly 15 rows.
  python3 -I product/tools/top15-watch.py [--ref origin/main] [--table FILE]
Test: check-top15-watch.sh.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a[:-1] else default


def show(ref, path):
    r = subprocess.run(["git", "show", "%s:%s" % (ref, path)], cwd=HERE, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def main():
    ref = arg("--ref", "origin/main")
    table = arg("--table", os.path.join(HERE, "..", "design", "top15-enforcers.tsv"))
    try:
        lines = open(table, encoding="utf-8").read().split("\n")
    except OSError as e:
        print("top15  table not readable (%s)" % e)
        return 2
    rows = [l.split("\t") for l in lines if l.split("\t")[0].strip().isdigit()]   # comments and the header skipped
    if len(rows) != 15 or any(len(r) < 5 for r in rows):
        print("top15  %s must hold 15 rows of 5 tab-separated fields (has %d rows)" % (os.path.basename(table), len(rows)))
        return 2
    done, owed, lost = [], [], []
    for no, rule, path, text, row in (r[:5] for r in rows):
        if not path.strip():
            owed.append("#%s (%s)" % (no, row))
            continue
        body = show(ref, path.strip())
        if body is None:
            lost.append("lost   #%s %s: %s is not on %s" % (no, rule[:60], path, ref))
        elif text not in body:
            lost.append("lost   #%s %s: %s on %s no longer contains \"%s\"" % (no, rule[:60], path, ref, text))
        else:
            done.append(no)
    print("top15  %d/15 enforced on %s%s" % (len(done), ref, ("; owed: " + ", ".join(owed)) if owed else ""))
    for l in lost:
        print(l)
    return 1 if lost else 0


if __name__ == "__main__":
    sys.exit(main())
