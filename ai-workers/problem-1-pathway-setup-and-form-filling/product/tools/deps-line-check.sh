#!/usr/bin/env bash
# Technology gate in CI (enforcement plan row E16; STANDARDS §1, P-553, P-587; pr-rules.yml). Reads the PR body on
# stdin. A PR that adds a package to any package.json (dependencies, devDependencies, peerDependencies or
# optionalDependencies; a name the file did not list at --base, every name of a new package.json, or an old name whose
# version now points at another package: npm:, git, github:, a URL, file: or link:) must carry a line
# "STANDARDS §1: <the gap, the options and why this one>". A version change or a removal needs no line.
# Exit 0 clean, 1 when the line is missing or empty, 2 on bad use or a package.json that cannot be read (never a pass).
# US$0, no network.
#   printf '%s\n' "$BODY" | bash product/tools/deps-line-check.sh [--base REV]
# Test: product/tools/check-deps-line.sh.
set -u
base="origin/main"
while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ -n "${2:-}" ] || { echo "--base needs a commit" >&2; exit 2; }; base="$2"; shift 2;;
    *) echo "unknown argument: $1" >&2; exit 2;;
  esac
done
git rev-parse -q --verify "$base^{commit}" >/dev/null || { echo "no such base: $base" >&2; exit 2; }
body=$(cat)
files=$(git -c core.quotePath=false diff --name-status -M --diff-filter=AMR "$base"...HEAD -- 'package.json' '*/package.json') \
  || { echo "git diff failed" >&2; exit 2; }
added=""
while IFS=$'\t' read -r st a b; do
  [ -n "$st" ] || continue
  f="${b:-$a}"   # a moved package.json is compared with its old path
  new=$(git show "HEAD:$f") || { echo "cannot read $f at HEAD" >&2; exit 2; }
  case "$st" in A) old='{}';; *) old=$(git show "$base:$a") || { echo "cannot read $a at $base" >&2; exit 2; };; esac
  out=$(python3 -I -c '
import json, sys
S = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")
ALIAS = ("npm:", "git", "github:", "gitlab:", "bitbucket:", "http:", "https:", "file:", "link:")   # another package under an old name
def specs(t):
    d = json.loads(t.lstrip("\ufeff"))   # npm accepts a byte-order mark
    if not isinstance(d, dict): raise ValueError("not an object")
    return {n: str(v) for s in S for n, v in (d.get(s) or {}).items()}
old, new = specs(sys.argv[1]), specs(sys.argv[2])
out = [n for n in new if n not in old]
out += ["%s (now %s)" % (n, new[n]) for n in new if n in old and new[n] != old[n] and new[n].startswith(ALIAS)]
print("\n".join(sorted(out)))
' "$old" "$new" 2>&1) || { echo "cannot read $f as JSON: $out" >&2; exit 2; }
  [ -n "$out" ] && added+=$(printf '%s\n' "$out" | sed "s#^#  ADDED: #; s#\$# ($f)#")$'\n'
done <<< "$files"
[ -n "$added" ] || { echo "  no package added to a package.json"; exit 0; }
printf '%s' "$added"
reason=$(printf '%s\n' "$body" | tr -d '\r' | sed -nE 's/^STANDARDS §1:[[:space:]]*(.*)$/\1/p' | head -1)
if [ -z "$(printf '%s' "$reason" | tr -d '[:space:]')" ]; then
  echo "  NO STANDARDS §1 LINE: a PR that adds a package needs a body line 'STANDARDS §1: <the gap, the options, why this one>' (the technology gate)"
  exit 1
fi
echo "  STANDARDS §1: $reason"
