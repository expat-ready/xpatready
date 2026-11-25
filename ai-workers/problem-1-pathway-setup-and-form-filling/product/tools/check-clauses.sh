#!/usr/bin/env bash
# A389 part 1 (founder 25 Nov: Partial % = clauses the tester has confirmed ÷ all clauses), guard 41: qa/clauses.tsv.
# Failing rows first, on throwaway files: a Works row with an unconfirmed clause, a confirmed clause with no evidence, a
# missing file, no commit, no date, a bad status, a row with no clauses, drifted clause text and a line for a non-R1 row
# each fail, naming the row; then seed adds a row, keeps a confirmed clause whose text is unchanged and starts a reworded
# one "not", and pct counts. Last, the real files (skipped in a mutation copy, which has no clauses.tsv). No network, US$0.
#   bash product/tools/check-clauses.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
PH="$TOOLS/.."; C="$TOOLS/clauses.py"
T=$(mktemp -d "${TMPDIR:-/tmp}/clauses.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/qa/reports/sub"; echo r > "$T/qa/reports/r.md"
cat > "$T/qa/CAPABILITIES.md" <<'X'
| # | Map row: capability | Module | Status | Tested on | Case side | Done when (what qa tests) | Evidence / note |
|---|---|---|---|---|---|---|---|
| R1.1 | 1 A | P | Works | abcdef12 20 Nov | — | One a; two b (with; inside) | qa `qa/reports/r.md` |
| R1.2 | 2 B | P | Partial | abcdef12 20 Nov | — | First c; second d; third e | note |
| R1.3 | 3 C | P | Not built | 15c75cd5 18 Nov | — | Only f | note |
| R1.4 | 4 D | P | Works | 1234abcd 16 Nov | — | Only g | its C rows' verdicts, no report |
X
export CLAUSES_ROOT="$T" CLAUSES_TSV="$T/qa/clauses.tsv" CLAUSES_CAPS="$T/qa/CAPABILITIES.md"
run() { out=$(python3 -I "$C" "$@" 2>&1); r=$?; }
good() {  # a valid file: R1.1 confirmed, R1.2 one of three confirmed, R1.3 not
  printf 'row\tno\tclause\tstatus\tevidence\tcommit\tdate\n'
  printf 'R1.1\t1\tOne a\tconfirmed\tqa/reports/r.md\tabcdef12\t2026-11-20\n'
  printf 'R1.1\t2\ttwo b (with; inside)\tconfirmed\tqa/reports/r.md\tabcdef12\t2026-11-20\n'
  printf 'R1.2\t1\tFirst c\tconfirmed\tqa/reports/r.md\tabcdef12\t2026-11-20\n'
  printf 'R1.2\t2\tsecond d\tnot\t\t\t\nR1.2\t3\tthird e\tnot\t\t\t\nR1.3\t1\tOnly f\tnot\t\t\t\n'
  printf 'R1.4\t1\tOnly g\tconfirmed\tqa/CAPABILITIES.md\t1234abcd\t2026-11-16\n'; }
bad() { good | sed "$1" > "$CLAUSES_TSV"; run check; ok "$2" "$([ $r = 1 ] && grep -q "$3" <<<"$out" && echo 1)" "rc=$r $out"; }

# 1. Failing rows first.
bad 's/^R1.1\t2\t\(.*\)\tconfirmed\t.*/R1.1\t2\t\1\tnot\t\t\t/' "a Works row with an unconfirmed clause fails, naming it" '^CLAUSES: R1.1 clause 2: the row is Works but this clause is not confirmed'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\t/' "a confirmed clause with no evidence fails" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/gone.md/' "a confirmed clause whose report does not exist fails" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\tSTATE.md/' "evidence outside qa/ fails (only qa's records count)" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\tqa\/..\/qa\/clauses.tsv/' "evidence that climbs out of qa/reports (qa/../) fails" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\tqa\/clauses.tsv/' "evidence that is a qa/ file but not a report (clauses.tsv itself) fails" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\tqa\/CAPABILITIES.md/' "qa/CAPABILITIES.md as evidence for a row that is not Works fails (only a Works row's own C-row verdict may cite it)" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/^R1.4\t1\tOnly g\tconfirmed\tqa\/CAPABILITIES.md\t1234abcd/R1.4\t1\tOnly g\tconfirmed\tqa\/CAPABILITIES.md\tabcdef12/' "qa/CAPABILITIES.md at another commit than the row's verdict fails" '^CLAUSES: R1.4 clause 1: confirmed without evidence'
bad 's/^R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/r.md/R1.2\t1\tFirst c\tconfirmed\tqa\/reports\/sub/' "a folder as evidence fails (a report is a file)" '^CLAUSES: R1.2 clause 1: confirmed without evidence'
bad 's/\t2026-11-20$/\t2026-13-45/' "a date that is not a real day fails" 'confirmed without a date'
bad 's/^\(R1.2\t1\t.*\)\tabcdef12\t/\1\t\t/' "a confirmed clause with no commit fails" '^CLAUSES: R1.2 clause 1: confirmed without the commit'
bad 's/^\(R1.2\t1\t.*\)\t2026-11-20$/\1\t20 Nov/' "a confirmed clause with no proper date fails" '^CLAUSES: R1.2 clause 1: confirmed without a date'
bad 's/^R1.2\t2\tsecond d\tnot/R1.2\t2\tsecond d\tpartly/' "a status other than confirmed or not fails" '^CLAUSES: R1.2 clause 2: status "partly"'
bad '/^R1.3\t/d' "a row with no clauses fails" '^CLAUSES: R1.3: no clauses'
bad 's/^R1.2\t3\tthird e/R1.2\t3\tthird E reworded/' "clause text that no longer matches the Done when fails" '^CLAUSES: R1.2: clauses no longer match'
bad 's/^R1.2\t3\t/R1.2\t4\t/' "clause numbers out of order fail" '^CLAUSES: R1.2: clauses no longer match'
bad '$a R1.9\t1\tx\tnot\t\t\t' "a line for a row that is not R1 in CAPABILITIES.md fails" '^CLAUSES: R1.9: in clauses.tsv but not an R1 row'
sed -i.bak 's/| R1.1 | 1 A | P | Works |/| R1.1 | 1 A | P | Works (held, QA-1) |/' "$CLAUSES_CAPS"
bad 's/^R1.1\t2\t\(.*\)\tconfirmed\t.*/R1.1\t2\t\1\tnot\t\t\t/' "a Works row with words after Works and an unconfirmed clause fails too" '^CLAUSES: R1.1 clause 2: the row is Works'
sed -i.bak 's/| R1.1 | 1 A | P | Works (held, QA-1) |/| R1.1 | 1 A | P | Works |/' "$CLAUSES_CAPS"
cp "$CLAUSES_CAPS" "$T/caps.keep"; printf '| R1.5 | 5 E | P |\n' >> "$CLAUSES_CAPS"
bad 's/x/x/' "an R1 row too short to read fails, naming it" '^CLAUSES: R1.5: an R1 row of qa/CAPABILITIES.md with fewer than 8 cells'
cp "$T/caps.keep" "$CLAUSES_CAPS"
good | sed '/^R1.3\t/d' > "$CLAUSES_TSV"; run check; ok "the check counts its problems in the last line" "$(tail -1 <<<"$out" | grep -q ' 1 problems$' && echo 1)" "$out"

# 2. The valid file passes; seed and pct.
good > "$CLAUSES_TSV"; run check; ok "a valid file passes" "$([ $r = 0 ] && echo 1)" "$out"
run pct; ok "pct: R1.2 has 1 of 3 confirmed (33%), R1.1 all, R1.3 none" "$(grep -q $'^R1.2\t1/3\t33$' <<<"$out" && grep -q $'^R1.1\t2/2\t100$' <<<"$out" && grep -q $'^R1.3\t0/1\t0$' <<<"$out" && echo 1)" "$out"
rm -f "$CLAUSES_TSV"; run seed; run check
ok "seed from nothing: the Works row's clauses carry its qa verdict (report, commit, date), the rest start not" "$([ $r = 0 ] && grep -q $'^R1.1\t2\ttwo b (with; inside)\tconfirmed\tqa/reports/r.md\tabcdef12\t2026-11-20$' "$CLAUSES_TSV" && grep -q $'^R1.2\t1\tFirst c\tnot\t' "$CLAUSES_TSV" && grep -q $'^R1.4\t1\tOnly g\tconfirmed\tqa/CAPABILITIES.md\t1234abcd\t2026-11-16$' "$CLAUSES_TSV" && echo 1)" "$out $(cat "$CLAUSES_TSV")"
good > "$CLAUSES_TSV"; sed -i.bak 's/| First c; second d; third e |/| First c; second D changed; third e; fourth g |/' "$CLAUSES_CAPS"; run seed; run check
ok "seed re-splits a changed row: unchanged clauses keep their status, a new or reworded one starts not" "$([ $r = 0 ] && grep -q $'^R1.2\t1\tFirst c\tconfirmed\t' "$CLAUSES_TSV" && grep -q $'^R1.2\t2\tsecond D changed\tnot\t' "$CLAUSES_TSV" && grep -q $'^R1.2\t4\tfourth g\tnot\t' "$CLAUSES_TSV" && echo 1)" "$out $(cat "$CLAUSES_TSV")"

# 3. The real files (a mutation copy of check-guards.sh carries CAPABILITIES.md but no clauses.tsv: the part above decides there).
unset CLAUSES_ROOT CLAUSES_TSV CLAUSES_CAPS
if [ -f "$PH/qa/clauses.tsv" ]; then
  run check; ok "the real qa/clauses.tsv passes against qa/CAPABILITIES.md" "$([ $r = 0 ] && echo 1)" "$out"
  n=$(cut -f1 "$PH/qa/clauses.tsv" | grep -E '^R1\.' | sort -u | wc -l | tr -d ' '); ok "the real file has clauses for all 101 R1 rows" "$([ "$n" = 101 ] && echo 1)" "$n"
else echo "SKIP  the real files: no qa/clauses.tsv here (a mutation copy)"; fi
finish
