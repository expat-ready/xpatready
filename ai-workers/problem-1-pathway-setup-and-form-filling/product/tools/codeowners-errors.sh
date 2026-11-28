#!/usr/bin/env bash
# GitHub's own reading of CODEOWNERS (LR-061; Lead 13, 28 Nov: "add a check that reads codeowners/errors and fails on
# any error"). check-codeowners.sh proves the file owns the guarded paths; this asks GitHub whether it accepts every line
# (an owner it cannot resolve, say a team that is not visible, is ignored silently: the path then has no owner at all).
#   bash product/tools/codeowners-errors.sh <ref>     GET repos/<repo>/codeowners/errors?ref=<ref>; exit 1 on any error
#   bash product/tools/codeowners-errors.sh --self-test   the reading of planted answers (no network)
# Runs in .github/workflows/codeowners.yml with the job's read-only token. US$0.
set -u
judge() {   # stdin: the API's JSON answer; prints one line per error, exit 1 when there is any (or the answer is unreadable)
  python3 -I -c '
import json, sys
try:
    d = json.load(sys.stdin); errs = d["errors"]; assert isinstance(errs, list)
except Exception as e:
    print(f"FAIL  the answer is not a codeowners/errors list ({type(e).__name__}): nothing was checked"); sys.exit(1)
for e in errs:
    why = (e.get("suggestion") or e.get("message") or "").splitlines()
    print("FAIL  CODEOWNERS line %s: %s: %s" % (e.get("line"), e.get("kind"), why[0] if why else ""))
if errs: sys.exit(1)
print("PASS  GitHub accepts every line of .github/CODEOWNERS (codeowners/errors is empty)")'
}
if [ "${1:-}" = --self-test ]; then
  bad=0
  t() { local name="$1" want="$2" json="$3" got=0; printf '%s' "$json" | judge >/dev/null || got=1
        if [ "$got" = "$want" ]; then echo "ok    $name"; else echo "FAIL  $name (exit $got, wanted $want)"; bad=1; fi; }
  t "no errors passes" 0 '{"errors":[]}'
  t "an unknown owner fails" 1 '{"errors":[{"line":7,"kind":"Unknown owner","suggestion":"make sure the team exists, is publicly visible"}]}'
  t "a 404 answer (no CODEOWNERS) fails" 1 '{"message":"Not Found","status":"404"}'
  t "an empty answer fails" 1 ''
  [ "$bad" = 0 ] && echo "PASS  codeowners-errors self-test, 4 cases"; exit "$bad"
fi
ref="${1:?usage: codeowners-errors.sh <ref> | --self-test}"; repo="${GITHUB_REPOSITORY:-expat-ready/xpatready}"
gh api "repos/$repo/codeowners/errors?ref=$ref" 2>&1 | judge
