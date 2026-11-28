#!/usr/bin/env bash
# LR-119 (private split, design/private-split-plan-2026-11-27.md step 5; lab register 27 Nov): what stays in xpatready.
# GitHub, Mergify and Claude read these files only in this repository (founder, 27 Nov: hooks, workflows and .mergify.yml
# stay here), and fork and Dependabot PRs get no secrets, so a required check can never read them from the private one.
# Each line of stays-public.txt (every workflow, the builders' agents and skills, ...) must exist on xpatready; the Claude settings must still hold their hooks; ci.yml (the required "ci"
# check) must not name the private repository. A missing one is a line on stdout and exit 1. check-docs.sh runs it on
# every pull request (ci.yml, records rules) and in the Stop hook. CODEOWNERS and approvals.yml join the list in the PR
# that adds them (ship-security rows; not on main on 28 Nov).
#   bash product/tools/stays-public.sh [<repository root>]        bash product/tools/stays-public.sh --self-test
set -u
LIST="$(dirname "$0")/stays-public.txt"
# Read line by line, not mapfile: the Mac's bash is 3.2 (no mapfile). Spaces around a line are dropped.
STAYS=(); while IFS= read -r f; do f="${f#"${f%%[![:space:]]*}"}"; f="${f%"${f##*[![:space:]]}"}"; [ -n "$f" ] && STAYS+=("$f"); done < <(grep -v '^#' "$LIST" 2>/dev/null)
[ "${#STAYS[@]}" -gt 0 ] || { echo "STAYS PUBLIC: $LIST is missing or empty: nothing is checked (LR-119)"; exit 1; }
check() { local root=$1 f bad=0
  for f in "${STAYS[@]}"; do [ -e "$root/$f" ] || { echo "STAYS PUBLIC: $f is missing from xpatready: GitHub, Mergify or Claude read it only here (LR-119)"; bad=1; }; done
  if [ -f "$root/.claude/settings.json" ] && ! grep -q '"hooks"' "$root/.claude/settings.json"; then echo "STAYS PUBLIC: .claude/settings.json holds no hooks: Claude reads a project's hooks only from this repository (LR-119)"; bad=1; fi
  if [ -f "$root/.github/workflows/ci.yml" ] && grep -q 'expat-ready/private' "$root/.github/workflows/ci.yml"; then echo "STAYS PUBLIC: ci.yml names expat-ready/private: a required check cannot read the private repository (fork and Dependabot PRs get no secrets; LR-119)"; bad=1; fi
  return $bad; }
if [ "${1:-}" = --self-test ]; then
  t=$(mktemp -d "${TMPDIR:-/tmp}/stays-public.XXXXXX"); trap 'rm -rf "$t"' EXIT; pass=0; fail=0
  ok() { if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "PASS  $3"; else fail=$((fail+1)); echo "FAIL  $3 (exit $2, want $1)"; fi; }
  for f in "${STAYS[@]}"; do mkdir -p "$t/$(dirname "$f")"; echo x > "$t/$f"; done; echo '{ "hooks": {} }' > "$t/.claude/settings.json"
  check "$t" >/dev/null; ok 0 $? "pass: every listed file present, settings with hooks"
  rm "$t/.mergify.yml"; out=$(check "$t"); ok 1 $? "fail: .mergify.yml missing"; grep -q '.mergify.yml is missing' <<<"$out"; ok 0 $? "fail: the line names the missing file"; echo x > "$t/.mergify.yml"
  echo '{}' > "$t/.claude/settings.json"; check "$t" >/dev/null; ok 1 $? "fail: settings.json without hooks"; echo '{ "hooks": {} }' > "$t/.claude/settings.json"
  echo 'repository: expat-ready/private' > "$t/.github/workflows/ci.yml"; check "$t" >/dev/null; ok 1 $? "fail: ci.yml reads the private repository"
  echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]; exit
fi
check "${1:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
