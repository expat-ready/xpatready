#!/usr/bin/env bash
# Own-migration guard (Lead 5's ruling on #2915 and #3035, 23 Nov): a migration-reading suite never compares a catalogue
# snapshot taken before its own migration with a read taken after the later ones. Fixtures here are Sample suites in
# a throwaway folder (no database); the last cases run the real tests folder and, when git history is there, the two
# suites as they were before adcf9c105 and 2cd4d9cd1 fixed them. Run by check-guards.sh (guard 38). US$0, no network.
#   bash product/tools/check-own-migration-guard.sh
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; G="$TOOLS/own-migration-guard.py"
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1 — ${3:-}"; fi; }
finish() { echo "$pass passed, $fail failed"; [ "$fail" = 0 ]; exit $?; }
[ -f "$G" ] || { ok "own-migration-guard.py exists" 0 "no $G: a suite can still diff the catalogue across other areas' migrations"; finish; }
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
suite() {  # suite <name> <body lines…>: a Sample migration suite around the given lines
  local n=$1; shift
  { echo 'const NEW = "20261117090000_fo7a2_ledger_rules";'
    echo 'const fns = (db: string) => sql(db, `select proname from pg_proc where pronamespace = 2200`).split("\n");'
    printf '%s\n' "$@"; } > "$W/$n.ts"; }
run() { out=$(python3 -I "$G" "$@" 2>&1); r=$?; }

# 1. adcf9c105's bug as it was: snapshot, own migration, the later ones, then the second read
suite bug 'const before = fns(T);' 'psql(T, ["-f", NEW]);' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);' 'const changed = fns(T).filter((f) => !before.includes(f));'
run "$W/bug.ts"; ok "1. a snapshot compared with a read after the later migrations is refused (exit 1), naming the reader and lines" "$([ $r = 1 ] && grep -q 'bug.ts:6: fns()' <<< "$out" && grep -q 'line 3' <<< "$out" && echo 1)" "exit $r: $out"
# 2. the fix adcf9c105 made: the second read before the later migrations
suite fixed 'const before = fns(T);' 'psql(T, ["-f", NEW]);' 'const changed = fns(T).filter((f) => !before.includes(f));' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);'
run "$W/fixed.ts"; ok "2. read right after its own migration, then the rest: passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# 3. ">= NEW" (its own and the later ones in one loop) is the same bug
suite ge 'const before = fns(T);' 'for (const d of all.filter((x) => x >= NEW)) psql(T, ["-f", d]);' 'const after = fns(T);'
run "$W/ge.ts"; ok "3. a loop over x >= NEW, then a read: refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
# 4. a whole-catalogue rule, marked, passes; unmarked it is refused (case 1)
suite rule 'const before = fns(T);' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);' '// own-migration: whole catalogue (every function keeps its search_path pinned, whoever added it)' 'const all2 = fns(T);'
run "$W/rule.ts"; ok "4. a read marked \"own-migration: whole catalogue (…)\" on the line above passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
suite own 'const before = fns(T);' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);' 'const again = fns(T); // own-migration: ok (only this area'"'"'s tables)'
run "$W/own.ts"; ok "4. ... and \"own-migration: ok (…)\" on its own line" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
suite word 'const before = fns(T);' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);' 'const again = fns(T); // own-migration is fine here'
run "$W/word.ts"; ok "4. ... but a comment that merely mentions own-migration does not count" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
# 5. the later migrations go to another database: a read of T after them is still right after its own migration
suite other 'const before = fns(T);' 'psql(T, ["-f", NEW]);' 'for (const d of all.filter((x) => x > NEW)) psql(DEMO, ["-f", d]);' 'const changed = fns(T);'
run "$W/other.ts"; ok "5. the later migrations go to another database (psql(DEMO, …)): a read of T passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
suite other2 'const before = fns(T);' 'psql(T, ["-f", NEW]);' 'for (const d of all.filter((x) => x > NEW)) psql(DEMO, ["-f", d]);' 'const changed = fns(DEMO);'
run "$W/other2.ts"; ok "5. ... a read of that database is refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
suite every 'const before = fns(T);' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);' 'for (const d of all) psql(EMPTY, ["-f", d]);' 'const copy = fns(EMPTY);'
run "$W/every.ts"; ok "5. a database given every migration (for … of all) after the snapshot counts too (FO-7ts part 3's rollback copy)" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
suite unknown 'const before = fns(T);' 'for (const d of all.filter((x) => x > NEW)) apply(d);' 'const after = fns(T);'
run "$W/unknown.ts"; ok "5. a loop that names no database (apply(d)) counts every later read (fails closed)" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
# 6. not a later-migrations loop: one that only reads migration text
suite text 'const before = fns(T);' 'const later = new Set(all.filter((d) => d > NEW).flatMap((d) => [...readFileSync(d, "utf8").matchAll(/x/g)]));' 'const after = fns(T);'
run "$W/text.ts"; ok "6. reading later migrations' text (readFileSync) applies nothing: passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# 7. a reader's name in prose is not a call; a reader that reads no catalogue is not a reader
suite prose 'const before = fns(T);' 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);' 'ok("the fns (the list) stay", true);'
run "$W/prose.ts"; ok "7. the word \"fns (\" in a message is not a call" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
{ echo 'const NEW = "20261117090000_x";'; echo 'const rows = (db: string) => sql(db, `select count(*) from money_ledger`);'
  echo 'const a = rows(T);'; echo 'for (const d of all.filter((x) => x > NEW)) psql(T, ["-f", d]);'; echo 'const b = rows(T);'; } > "$W/rows.ts"
run "$W/rows.ts"; ok "7. a helper reading a table, not the catalogue, is not held" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# 8. a folder: every .ts in it, and a missing path cannot run
run "$W"; ok "8. a folder is read file by file (the refused fixtures above are all named)" "$([ $r = 1 ] && grep -q 'bug.ts' <<< "$out" && grep -q 'ge.ts' <<< "$out" && ! grep -q 'fixed.ts' <<< "$out" && echo 1)" "exit $r: $out"
run "$W/nope.ts"; ok "8. a missing path: exit 2, never a pass" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
# 9. the real suites, and the two that broke merge batches, as they were
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; TESTSD="$ROOTD/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests"
if [ -d "$TESTSD" ]; then run "$TESTSD"; ok "9. every suite in prototype/studio/tests passes today" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
else echo "SKIP  9. no tests folder here (check-guards.sh's mutation copy)"; fi
for c in adcf9c105:check_fo7a2_ledger_rules.ts 2cd4d9cd1:check_fo7lk_lock_order.ts; do
  if git -C "$ROOTD" cat-file -e "${c%%:*}^" 2>/dev/null; then
    git -C "$ROOTD" show "${c%%:*}^:ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/${c#*:}" > "$W/was_${c#*:}"
    run "$W/was_${c#*:}"; ok "9. ${c#*:} as it was before ${c%%:*} fixed it is refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
  else echo "SKIP  9. ${c%%:*} not in this clone's history"; fi; done
finish
