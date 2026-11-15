#!/usr/bin/env bash
# The test of module-cards.py (P-615 (3)): each fixture change must pass or fail as named. Run by
# .github/workflows/module-cards.yml before the PR's own check. US$0, no network.
#   bash product/tools/check-module-cards.sh
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
T=$(mktemp -d "${TMPDIR:-/tmp}/cards.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "$T"' EXIT
bad=0; n=0
run() { python3 "$TOOLS/module-cards.py" "$@" > "$T/log" 2>&1; r=$?; grep -q "  module cards: " "$T/log" || r=99; return $r; }   # a crash is never a FAIL that counts
want() { # want PASS|FAIL "what" changed-files body
  n=$((n+1)); printf '%s\n' $3 > "$T/changed"; printf '%s' "$4" > "$T/body"
  ( cd "$ROOTD" && ROOT="$ROOTD" run pr "$T/changed" "$T/body" ); r=$?
  got=$(case $r in 0) echo PASS;; 99) echo CRASH;; *) echo FAIL;; esac)
  if [ "$got" = "$1" ]; then echo "PASS  $2 → $1"; else echo "FAIL  $2: wanted $1, got $got"; sed 's/^/      /' "$T/log"; bad=1; fi
}
want FAIL "a module file changed, its card not"                 "$S/api/src/runtime.ts" ""
want PASS "a module file and its card changed"                  "$S/api/src/runtime.ts $S/api/src/MODULE.cases.md" ""
want PASS "card unchanged, with a reason"                       "$S/api/src/runtime.ts" "Body.
Card unchanged: a comment's wording only"
want FAIL "card unchanged, no reason"                           "$S/api/src/runtime.ts" "Card unchanged:"
want FAIL "two modules changed, one card"                       "$S/api/src/runtime.ts $S/web/src/pages/ai.tsx $S/api/src/MODULE.cases.md" ""
want PASS "a folder module's file and its card"                 "$S/web/src/pages/ai.tsx $S/web/src/pages/MODULE.md" ""
want PASS "a file outside the modules"                          "README.md $S/tests/check_bk4a.ts" ""
want FAIL "a brace-group file (form-*), card not"               "$S/api/src/form-redo.ts" ""
want PASS "a deleted file no card claims any more"              "$S/api/src/gone-from-the-tree.ts $S/api/src/MODULE.ai-runs.md" ""
want FAIL "the placeholder is no reason"                        "$S/api/src/runtime.ts" "Card unchanged: <reason>"
want FAIL "punctuation is no reason"                            "$S/api/src/runtime.ts" "Card unchanged: ."
want PASS "card unchanged as a list item"                       "$S/api/src/runtime.ts" "- Card unchanged: a log line's wording"
want PASS "card unchanged in bold, CRLF"                        "$S/api/src/runtime.ts" "$(printf '**Card unchanged:** a test only\r\n')"
# The tree: a copy of the rules and cards, then broken on purpose.
mk() { rm -rf "$T/r"; mkdir -p "$T/r"; ( cd "$ROOTD" && git ls-files -co --exclude-standard .claude/rules/modules "$S/api/src" "$S/web/src" | grep -E '(^\.claude/rules/modules/|/MODULE[^/]*\.md$|\.tsx?$)' | while read -r f; do mkdir -p "$T/r/$(dirname "$f")"; cp -P "$f" "$T/r/$f"; done ); git -C "$T/r" init -q; git -C "$T/r" add -A; }
tree() { n=$((n+1)); ( cd "$T/r" && ROOT="$T/r" run tree ); r=$?; got=$(case $r in 0) echo PASS;; 99) echo CRASH;; *) echo FAIL;; esac)
  if [ "$got" = "$1" ]; then echo "PASS  tree: $2 → $1"; else echo "FAIL  tree: $2: wanted $1, got $got"; sed 's/^/      /' "$T/log"; bad=1; fi; }
mk; tree PASS "as on this branch"
mk; for i in $(seq 1 12); do echo "padding $i" >> "$T/r/$S/api/src/MODULE.cases.md"; done; tree FAIL "a card over 40 lines"
mk; rm "$T/r/$S/web/src/pages/MODULE.md"; tree FAIL "a rule whose card is gone"
mk; sed -i.bak 's/^paths:/globs:/' "$T/r/$S/web/src/pages/MODULE.md"; rm -f "$T/r/$S/web/src/pages/MODULE.md.bak"; tree FAIL "a card whose key is not paths:"
mk; echo "# card" > "$T/r/$S/api/src/MODULE.orphan.md"; git -C "$T/r" add -A; tree FAIL "a card no rule links to"
mk; mkdir -p "$T/r/$S/api/src/brand-new"; echo x > "$T/r/$S/api/src/brand-new/thing.ts"; git -C "$T/r" add -A; tree FAIL "a tracked file no module claims"
n=$((n+1)); echo "$S/api/src/brand-new/thing.ts" > "$T/changed"; : > "$T/body"; ( cd "$T/r" && ROOT="$T/r" run pr "$T/changed" "$T/body" ); r=$?
if [ $r = 1 ]; then echo "PASS  pr: a new file no module claims → FAIL"; else echo "FAIL  pr: a new file no module claims: wanted FAIL, got rc $r"; sed 's/^/      /' "$T/log"; bad=1; fi
echo "$([ $bad = 0 ] && echo PASS || echo FAIL)  module cards: $n fixtures"
exit $bad
