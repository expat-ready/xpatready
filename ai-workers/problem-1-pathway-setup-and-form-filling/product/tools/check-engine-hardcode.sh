#!/usr/bin/env bash
# OS-32 (P-319, P-425): engine-hardcode.sh fails a form number or a key-literal branch in engine code, lets comments,
# tests and the KNOWN entries through (warning), and passes the engine as it is. Throwaway engine folders. US$0, no network.
#   bash product/tools/check-engine-hardcode.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/enghc.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
k=0
# plant <relative path> <line>: an engine holding a clean file plus <line> in <path>; sets out and r.
plant() { k=$((k + 1)); local e="$T/e$k"; mkdir -p "$e/runtime" "$e/$(dirname "$1")"
  printf 'export const lines = (r: { forms: string[] }) => r.forms.length;\n' > "$e/runtime/clean.ts"
  printf '%s\n' "$2" >> "$e/$1"; out=$(bash "$TOOLS/engine-hardcode.sh" "$e" 2>&1); r=$?; }
bad() { plant "$2" "$3"; ok "fails: $1" "$([ $r = 1 ] && echo "$out" | grep -q "^FAIL  engine/$2:" && echo 1)" "exit $r: $out"; }
good() { plant "$2" "$3"; ok "passes: $1" "$([ $r = 0 ] && ! echo "$out" | grep -q '^FAIL' && echo 1)" "exit $r: $out"; }
bad "a form number in a string" "runtime/fees.ts" 'export const fee = (f: string) => f === "IMM 5257" ? 100 : 0;'
bad "a form number joined, lower case" "forms.ts" 'const isRep = (code: string) => code.startsWith("imm5476");'
bad "a form number with a hyphen, after code on the line" "runtime/x.tsx" 'const k = 1; const form = "EMP-5602";'
bad "a combination key compared with a literal" "runtime/checklist.ts" 'if (c.combinationKey === "e1-mother-visit") return [];'
bad "a program key compared the other way round" "programs2.ts" 'const only = "visitor-visa" !== row.programKey;'
good "a form cited in a // comment" "runtime/a.ts" '// canada.ca on IMM 5484 (recorded 19 Oct): the guide says so'
good "a form cited in a block comment" "runtime/b.ts" "$(printf '/** BR-20: a change asks for a new IMM 5476,\n *  as IMM 5476 says. */\nexport const b = 1;')"
good "a form number in a test file" "runtime/c.test.ts" 'expect(form("IMM 5257")).toBe(1);'
good "a form number under __tests__" "__tests__/d.ts" 'const f = "IMM 1294";'
good "a key compared with another value, not a literal" "runtime/e.ts" 'const same = a.combinationKey === b.combinationKey;'
good "a word with digits that is not a form (SIMM5257x)" "runtime/f.ts" 'const id = "SIMM52570";'
plant "runtime/team.ts" 'export function imm5476(m: string[]) { return m.length > 1; }'
ok "a KNOWN finding only warns (exit 0), naming the file" "$([ $r = 0 ] && echo "$out" | grep -q '^WARN  engine/runtime/team.ts:.*imm5476' && echo 1)" "exit $r: $out"
plant "runtime/team2.ts" 'export function imm5476(m: string[]) { return m.length > 1; }'
ok "... the same finding in another file fails (KNOWN is per file)" "$([ $r = 1 ] && echo "$out" | grep -q '^FAIL  engine/runtime/team2.ts' && echo 1)" "exit $r: $out"
out=$(bash "$TOOLS/engine-hardcode.sh" "$T/none" 2>&1); r=$?
ok "a missing engine folder is exit 2, never a pass" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
# check-guards --mutate runs this in a copy of the tools with no studio engine: there only the planted cases above count.
if [ -d "$TOOLS/../../prototype/studio/engine" ]; then out=$(bash "$TOOLS/engine-hardcode.sh" 2>&1); r=$?
  ok "the studio engine passes (exit 0 on main)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
else echo "SKIP  the studio engine: not in this copy (a check-guards mutation copy)"; fi
finish
