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
run() { python3 "${MC:-$TOOLS/module-cards.py}" "$@" > "$T/log" 2>&1; r=$?; grep -q "  module cards: " "$T/log" || r=99; return $r; }   # a crash is never a FAIL that counts
want() { # want PASS|FAIL "what" changed-files body
  n=$((n+1)); printf '%s\n' $3 > "$T/changed"; printf '%s' "$4" > "$T/body"
  ( cd "$ROOTD" && ROOT="$ROOTD" run pr "$T/changed" "$T/body" ); r=$?
  got=$(case $r in 0) echo PASS;; 99) echo CRASH;; *) echo FAIL;; esac)
  if [ "$got" = "$1" ]; then echo "PASS  $2 → $1"; else echo "FAIL  $2: wanted $1, got $got"; sed 's/^/      /' "$T/log"; bad=1; fi
}
if [ -z "${MUTANT:-}" ]; then   # a mutant run (below) needs only the P-712 fixtures
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
fi
# The tree: a copy of the rules and cards, then broken on purpose.
mk() {   # one copy of the rules, cards and sources, then a fresh duplicate per fixture (fast)
  [ -n "${R0:-}" ] && [ ! -d "$T/r0" ] && cp -R "$R0" "$T/r0"   # a mutant run reuses its parent's copy
  [ -d "$T/r0" ] || { rm -rf "$T/r0"; mkdir -p "$T/r0"; ( cd "$ROOTD" && git ls-files -co --exclude-standard .claude/rules/modules "$S/api/src" "$S/web/src" "$S/tests" "$S/ports" | grep -E '(^\.claude/rules/modules/|/MODULE[^/]*\.rows/[^/]+$|\.md$|\.tsx?$|\.[cm]?js$)' | while read -r f; do mkdir -p "$T/r0/$(dirname "$f")"; cp -P "$f" "$T/r0/$f"; done ); git -C "$T/r0" init -q; git -C "$T/r0" add -A; }
  rm -rf "$T/r"; cp -R "$T/r0" "$T/r"; }
tree() { n=$((n+1)); ( cd "$T/r" && ROOT="$T/r" run tree ); r=$?; got=$(case $r in 0) echo PASS;; 99) echo CRASH;; *) echo FAIL;; esac)
  if [ "$got" = "$1" ]; then echo "PASS  tree: $2 → $1"; else echo "FAIL  tree: $2: wanted $1, got $got"; sed 's/^/      /' "$T/log"; bad=1; fi; }
if [ -z "${MUTANT:-}" ]; then
mk; tree PASS "as on this branch"
mk; for i in $(seq 1 12); do echo "padding $i" >> "$T/r/$S/api/src/MODULE.cases.md"; done; tree FAIL "a card over 40 lines"
mk; rm "$T/r/$S/web/src/pages/MODULE.md"; tree FAIL "a rule whose card is gone"
mk; sed -i.bak 's/^paths:/globs:/' "$T/r/$S/web/src/pages/MODULE.md"; rm -f "$T/r/$S/web/src/pages/MODULE.md.bak"; tree FAIL "a card whose key is not paths:"
mk; echo "# card" > "$T/r/$S/api/src/MODULE.orphan.md"; git -C "$T/r" add -A; tree FAIL "a card no rule links to"
mk; mkdir -p "$T/r/$S/api/src/brand-new"; echo x > "$T/r/$S/api/src/brand-new/thing.ts"; git -C "$T/r" add -A; tree FAIL "a tracked file no module claims"
n=$((n+1)); echo "$S/api/src/brand-new/thing.ts" > "$T/changed"; : > "$T/body"; ( cd "$T/r" && ROOT="$T/r" run pr "$T/changed" "$T/body" ); r=$?
if [ $r = 1 ]; then echo "PASS  pr: a new file no module claims → FAIL"; else echo "FAIL  pr: a new file no module claims: wanted FAIL, got rc $r"; sed 's/^/      /' "$T/log"; bad=1; fi
fi
# P-712: row fragments and the frozen one-line lists (product/design/module-card-conflicts-2026-11-19.md).
want PASS "a module file and its row fragment, card itself untouched" "$S/web/src/pages/ai.tsx $S/web/src/pages/MODULE.rows/FO-1.md" ""
FO=$S/api/src/front-office; C=$FO/MODULE.md
frag() { mkdir -p "$T/r/$FO/MODULE.rows"; printf '%b' "$2" > "$T/r/$FO/MODULE.rows/$1"; git -C "$T/r" add -A; }
mk; mkdir -p "$T/r/$S/tests"; : > "$T/r/$S/tests/check_frag.ts"; frag FO-3a.md 'Tests: `tests/check_frag.ts`\nTables: foBooking\n'; tree PASS "a good row fragment"
mk; frag FO-3a.md 'Tests: `tests/check_missing.ts`\n'; tree FAIL "a fragment naming a test that does not exist"
mk; frag FO-3a.md 'Notes: anything\n'; tree FAIL "a fragment line that is not Tests:, Tables: or Entry points:"
mk; frag FO-3a.md 'Tables: a\nTables: b\nTables: c\nTables: d\nTables: e\nTables: f\nTables: g\n'; tree FAIL "a fragment over 6 lines"
mk; frag fo-3a.md 'Tables: a\n'; tree FAIL "a fragment not named after its row"
mk; frag FO-3b.md 'Entry points: `booking/settings/types.controller.ts`\n'; tree PASS "a fragment path relative to the card's folder, as cards write them (review M2)"
mk; mkdir -p "$T/r/$FO/MODULE.rows/sub"; echo 'Tables: x' > "$T/r/$FO/MODULE.rows/sub/FO-1.md"; git -C "$T/r" add -A; tree FAIL "a file in a subfolder of a .rows/ folder"
mk; mkdir -p "$T/r/$S/api/src/MODULE.nope.rows"; echo 'Tables: x' > "$T/r/$S/api/src/MODULE.nope.rows/FO-1.md"; git -C "$T/r" add -A; tree FAIL "a fragment with no card"
# The frozen lines, against BASE = a commit of the copy (the workflow passes HEAD^1, the base of GitHub's test merge).
gc() { git -C "$T/r" -c user.name=t -c user.email=t@t commit -qm "$1"; }
ed() { sed -i.bak "$1" "$T/r/$C"; rm -f "$T/r/$C.bak"; }
prb() { n=$((n+1)); printf '%s\n' $3 > "$T/changed"; : > "$T/body"; ( cd "$T/r" && ROOT="$T/r" BASE=HEAD run pr "$T/changed" "$T/body" ); r=$?
  got=$(case $r in 0) echo PASS;; 99) echo CRASH;; *) echo FAIL;; esac)
  if [ "$got" = "$1" ]; then echo "PASS  pr: $2 → $1"; else echo "FAIL  pr: $2: wanted $1, got $got"; sed 's/^/      /' "$T/log"; bad=1; fi; }
mk; gc base; ed 's/^\(\*\*Tests\.\*\* .*\)$/\1, `tests\/check_new.ts`/'; prb FAIL "a frozen Tests. line gains a test (P-712)" "$C"
mk; gc base; ed 's/^\(\*\*Entry points\.\*\* .*\)$/\1 `GET \/api\/new`/'; prb FAIL "a frozen Entry points. line gains an entry" "$C"
mk; gc base; ed 's/^\(\*\*Tables\.\*\*\) [^,]*, /\1 /'; prb PASS "a frozen Tables. line loses an item" "$C"
mk; gc base; ed 's/^\(\*\*Purpose\.\*\* \)/\1Also new prose. /'; prb PASS "the card's prose changes" "$C"
mk; frag FO-9z.md 'Tests: `tests/check_fold.ts`\n'; gc base; ed 's/^\(\*\*Tests\.\*\* .*\)$/\1, `tests\/check_fold.ts`/'; git -C "$T/r" rm -q "$FO/MODULE.rows/FO-9z.md"
prb PASS "the Lead folds a row fragment into the frozen line" "$C $FO/MODULE.rows/FO-9z.md"
mk; frag FO-9y.md 'Tables: foFolded\n'; gc base; ed 's/^\(\*\*Tables\.\*\* .*\)\.$/\1, foFolded./'; git -C "$T/r" rm -q "$FO/MODULE.rows/FO-9y.md"
prb PASS "a fold into Tables, before its final period (review M1)" "$C $FO/MODULE.rows/FO-9y.md"
mk; gc base; ed 's/^\(\*\*Tables\.\*\* .*\), [^,]*\.$/\1./'; prb PASS "Tables loses its last item (the period moves; review M1)" "$C"
mk; gc base; ed 's/^\(\*\*Tables\.\*\* .*\)\.$/\1, foNew./'; prb FAIL "Tables gains an item before its final period" "$C"
W="$ROOTD/.github/workflows/module-cards.yml"; n=$((n+1))
if python3 -c 'import sys, yaml; d = yaml.safe_load(open(sys.argv[1])); st = [s for s in d["jobs"]["module-cards"]["steps"] if "module-cards.py pr" in s.get("run", "")]; sys.exit(0 if st and st[0].get("env", {}).get("BASE") == "HEAD^1" else 1)' "$W" 2>/dev/null; then echo "PASS  module-cards.yml gives the pr step BASE (the frozen lines are checked)"; else echo "FAIL  module-cards.yml: no BASE: HEAD^1 for the pr step, so frozen lines go unchecked"; bad=1; fi
# Mutants: each edit switches one P-712 rule off in a copy of module-cards.py; the fixtures above must then fail.
if [ -z "${MUTANT:-}" ]; then
  while IFS='|' read -r name edit; do
    cp "$TOOLS/module-cards.py" "$T/mut.py"; sed -i.bak "$edit" "$T/mut.py"; rm -f "$T/mut.py.bak"; n=$((n+1))
    if cmp -s "$T/mut.py" "$TOOLS/module-cards.py"; then echo "FAIL  mutant $name: the edit changed nothing"; bad=1
    elif MC="$T/mut.py" MUTANT=1 R0="$T/r0" bash "$0" > "$T/mut.log" 2>&1; then echo "FAIL  mutant $name: every fixture still passes"; bad=1
    else echo "PASS  mutant $name → caught ($(grep -m1 '^FAIL' "$T/mut.log" | cut -c7-90))"; fi
  done <<'MUT'
frag|s/ and mods\[n\]\[0\] not in fragments\]/]/
frozen|s/^                if new:/                if False:/
fold|s/^                folded |= /                folded -= /
exists|s/^            if not any(os.path.exists/            if False and any(os.path.exists/
lines|s/^    if not lines or len(lines) > FRAG_MAX:/    if False:/
label|s/^        if not re.match(r"(?:" + "|".join(FROZEN)/        if False and re.match(r"(?:" + "|".join(FROZEN)/
MUT
fi
echo "$([ $bad = 0 ] && echo PASS || echo FAIL)  module cards: $n fixtures"
exit $bad
