#!/usr/bin/env bash
# Claude Approvals paths against the Lead's read (lab lane ship-security, 27 Nov; design/ship-security-2026-11-27.md).
#   A1  the routine rule (the first rule, where Claude approves on a reviewer's approval) excludes exactly the paths
#       the other rules name, so every file falls in one rule only;
#   A2  every tracked file that product/tools/lead-read-paths.txt keeps for the Lead (read first or read after) lands in
#       a Lead-read rule, never in the routine rule (the regexes are case-insensitive; the globs must keep up);
#   A3  every seat excludes the PR's authors ("!pr/authors"): one account writes every PR, and an author's own seat is
#       no read at all (review of #3899, Major 1-2).
# Globs as code.claude.com/docs/en/approvals-policy: * one segment, ** whole segments, {a,b}, [ab], ?; ! negates.
#   bash product/tools/check-approvals-paths.sh       (run by ci's tools step; US$0, no network)
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
LIST=$(mktemp "${TMPDIR:-/tmp}/approvals-files.XXXXXX") || exit 2; trap 'rm -f "$LIST"' EXIT
git -C "$ROOTD" ls-files > "$LIST" || exit 2
python3 -I - "$ROOTD/.claude/approvals.yml" "$TOOLS/lead-read-paths.txt" "$LIST" <<'PY'
import re, sys, yaml
pol = yaml.safe_load(open(sys.argv[1])); lrp = sys.argv[2]
files = [l.rstrip("\n") for l in open(sys.argv[3]) if l.strip()]

def glob_re(g):
    out, i = "", 0
    segs = g.split("/")
    for k, s in enumerate(segs):
        last = k == len(segs) - 1
        if s == "**":
            out += ".*" if last else "(?:[^/]+/)*"
            continue
        j = 0
        while j < len(s):
            c = s[j]
            if c == "*": out += "[^/]*"
            elif c == "?": out += "[^/]"
            elif c == "[":
                e = s.index("]", j + 1); body = s[j + 1:e]
                out += "[" + ("^" + body[1:] if body.startswith("!") else body) + "]"; j = e
            elif c == "{":
                e = s.index("}", j); out += "(?:" + "|".join(re.escape(x) for x in s[j + 1:e].split(",")) + ")"; j = e
            else: out += re.escape(c)
            j += 1
        if not last: out += "/"
    return re.compile("^" + out + "$")

def matches(paths, f):
    pos = [glob_re(p) for p in paths if not p.startswith("!")]
    neg = [glob_re(p[1:]) for p in paths if p.startswith("!")]
    return any(r.match(f) for r in pos) and not any(r.match(f) for r in neg)

fails = 0; passes = 0
def report(ok, msg):
    global fails, passes
    print(("PASS  " if ok else "FAIL  ") + msg); passes += ok; fails += (not ok)

rules = pol["rules"]; routine, lead = rules[0], rules[1:]
neg = {p[1:] for p in routine["paths"] if p.startswith("!")}
pos = {p for r in lead for p in r["paths"]}
report(neg == pos, "A1 the routine rule excludes exactly the Lead-read rules' paths"
       + ("" if neg == pos else f" (only excluded: {sorted(neg - pos)[:5]}; not excluded: {sorted(pos - neg)[:5]})"))

lines = [l.split(" #")[0].strip() for l in open(lrp) if l.strip() and not l.lstrip().startswith("#")]
rx = [re.compile(l, re.I) for l in lines]
miss = [f for f in files if any(r.search(f) for r in rx) and (matches(routine["paths"], f) or not any(matches(r["paths"], f) for r in lead))]
report(len(files) > 1000, f"A2 the tracked file list was read ({len(files)} files)")
report(not miss, f"A2 every tracked file lead-read-paths.txt names is in a Lead-read rule ({len(miss)} not)")
for f in miss[:20]: print("      " + f)
both = [f for f in files if matches(routine["paths"], f) and any(matches(r["paths"], f) for r in lead)]
report(not both, f"A1 no tracked file is in the routine rule and a Lead-read rule ({len(both)})")

def seats_ok(v, loc):
    for s in (v.get("seats") if isinstance(v.get("seats"), list) else [v.get("seats")]):
        if isinstance(s, str) and s.startswith("@"): s = loc.get(s[1:])
        if not (isinstance(s, dict) and "!pr/authors" in s.get("from", [])): return False
    return True
loc = pol.get("locals", {})
bad = [r["purpose"] for r in rules for v in [r["verdict"]] + [o.get("verdict", {}) for o in r.get("override", [])] if not seats_ok(v, loc)]
report(not bad, "A3 every seat excludes the PR's authors" + ("" if not bad else f" ({bad[:3]})"))

# Self-test of the glob reader (a reader that matches nothing would pass A2 vacuously)
for g, f, want in [("**", "a/b.ts", True), ("**/*[Mm]oney*/**", "x/client-money/a.ts", True), ("**/*[Mm]oney*", "x/client-money/a.ts", False),
                   (".github/**", ".github/workflows/ci.yml", True), ("**/api/src/{ai,rounds}.ts", "s/api/src/ai.ts", True),
                   ("**/[Ff][Ee][Ee][-_.]*", "a/fee_table.ts", True), ("**/*[-_.0-9][Ff][Ee][Ee][-_.0-9]*", "a/coffee.ts", False)]:
    report(bool(glob_re(g).match(f)) == want, f"self-test: {g} {'matches' if want else 'does not match'} {f}")
print(f"{passes} passed, {fails} failed")
sys.exit(1 if fails else 0)
PY
