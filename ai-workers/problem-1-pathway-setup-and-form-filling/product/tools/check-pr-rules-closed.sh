#!/usr/bin/env bash
# LR-043, LR-134, LR-141 (lab bundle A3, "PR rules fail closed"): each path where a pr-rules rule could not read its
# input, errored or timed out now fails the check; each gets a planted failure here. Steps of pr-rules.yml are cut out
# and run as written with stand-in gh, python3 tools and git; no network, US$0. (The rules-settled and checks-changed
# steps' planted cases live in check-rules-settled.sh and check-checks-changed.sh.)
#   bash product/tools/check-pr-rules-closed.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/prclosed.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; W="$ROOTD/.github/workflows/pr-rules.yml"; TPL="$ROOTD/.github/pull_request_template.md"
mkdir -p "$T/bin" "$T/tools"
# step NAME-PATTERN: the run: script of the pr-rules.yml step whose name matches, with the expressions filled in
step() { awk -v pat="$1" 'index($0, "- name: ") && index($0, pat) {on = 1; next} on && /^      - (name|uses):|^  [a-z]/ {exit}
  on && /run: \|/ {blk = 1; next} on && blk {sub(/^          /, ""); print; next} on && /run: / {sub(/^ *run: /, ""); print; exit}' "$W" \
  | sed -e 's/\${{ github.repository }}/o\/r/g' -e 's/\${{ github.event.pull_request.number }}/77/g'; }

# (1) The body and title are read at the run, from GitHub; a read that fails fails, and sets nothing.
cat > "$T/bin/gh" <<'EOF'
#!/bin/sh
[ -n "$DOWN" ] && exit 1
case "$*" in
  "api repos/o/r/pulls/77") cat "$PRJ";;
  *"repos/o/r/pulls/77/files"*) [ -n "$FDOWN" ] && exit 1; printf '%s\n' $FILES;;
  *) exit 1;;
esac
EOF
chmod +x "$T/bin/gh"
rd() { : > "$T/env"; o=$(PATH="$T/bin:$PATH" PRJ="$T/pr.json" DOWN="${1:-}" N="${2:-77}" GITHUB_REPOSITORY=o/r GITHUB_ENV="$T/env" bash "$TOOLS/pr-rules-read.sh" 2>&1); r=$?; }
# envget NAME: the value GitHub's runner would set from $GITHUB_ENV (NAME<<DELIM ... DELIM)
envget() { awk -v n="$1" 'd == "" && match($0, /^[A-Za-z_]+<</) {k = substr($0, 1, RLENGTH - 2); d = substr($0, RLENGTH + 1); v = ""; f = 1; next}
  d != "" && $0 == d {if (k == n) {print v; exit}; d = ""; next} d != "" {v = (f ? "" : v "\n") $0; f = 0}' "$T/env"; }
jq -n '{number: 77, title: "runtime: R1.4 — x", body: "Done when: check-x.sh exits 0\nDuplicate check: none\nEOF\nTITLE<<EOF"}' > "$T/pr.json"
rd; ok "(1) the body and title are read now and handed on through GITHUB_ENV" "$([ $r = 0 ] && [ "$(envget BODY)" = "$(jq -r .body "$T/pr.json")" ] && [ "$(envget TITLE)" = 'runtime: R1.4 — x' ] && echo 1)" "exit $r: $o $(cat "$T/env")"
rd down; ok "(1) planted: GitHub does not answer: exit 1, an error, nothing set" "$([ $r = 1 ] && grep -q '::error' <<<"$o" && [ ! -s "$T/env" ] && echo 1)" "exit $r: $o"
echo 'not json' > "$T/pr.json"; rd; ok "(1) planted: an answer that is not JSON fails" "$([ $r = 1 ] && [ ! -s "$T/env" ] && echo 1)" "exit $r: $o"
jq -n '{number: 78, title: "t", body: "b"}' > "$T/pr.json"; rd; ok "(1) planted: an answer for another PR fails" "$([ $r = 1 ] && grep -q 'not PR #77' <<<"$o" && echo 1)" "exit $r: $o"
rd "" ""; ok "(1) planted: no PR number fails" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
jq -n '{number: 77, title: "t", body: null}' > "$T/pr.json"; rd
ok "(1) a PR with no body is an empty body, and the body rule then fails it" "$([ $r = 0 ] && [ -z "$(envget BODY)" ] && ! printf '' | bash "$TOOLS/brief-check.sh" >/dev/null && echo 1)" "exit $r: $o"
n=$(grep -c 'run: bash .*pr-rules-read.sh"*$' "$W"); ok "(1) both rule jobs (pr-rules, completes-ready) read the body first" "$([ "$n" = 2 ] && echo 1)" "$n"
ok "(1) no rule step reads the event's body or title (only the outside-wave label job does)" \
  "$(awk '/^  outside-wave:/ {exit} /github\.event\.pull_request\.(body|title)/ {n++} END {print (n ? 0 : 1)}' "$W")"
grep -B2 -A4 'name: read the PR' "$W" | grep -q 'if:'; ok "(1) the read steps have no condition (they always run)" "$([ $? != 0 ] && echo 1)"

# (2) completes-ready: no label in its condition (a skipped job is a pass for "-check-failure").
c=$(awk '/^  completes-ready:/ {f = 1; next} f && /^    if:/ {print; exit}' "$W")
ok "(2) completes-ready's condition reads no label" "$([ -n "$c" ] && ! grep -q 'labels' <<<"$c" && echo 1)" "$c"
o=$(cd "$ROOTD" && python3 -I -c 'import importlib.util, sys
s = importlib.util.spec_from_file_location("rg", sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
try: print(m.mode("no-such-rev-lr043"))
except SystemExit as e: print("exit", e.code)' "$TOOLS/ready-gate.py" 2>&1)
ok "(2) planted: ready-gate cannot read main's history: exit 2, never report-only" "$(grep -qx 'exit 2' <<<"$o" && echo 1)" "$o"

# (3) waves ids: a missing wave warns (by design); waves.py crashing fails.
step "every R1 item of CAPABILITIES.md has one wave" > "$T/waves.sh"
wv() { printf '%s\n' "$1" > "$T/tools/waves.py"; o=$(T="$T/tools" bash "$T/waves.sh" 2>&1); r=$?; }
wv 'print("waves.tsv: all 3 R1 ids")'; ok "(3) all ids: passes" "$([ $r = 0 ] && ! grep -q '::' <<<"$o" && echo 1)" "exit $r: $o"
wv $'print("WAVES LIST: design/waves.tsv lacks R1.9")\nraise SystemExit(1)'; ok "(3) a missing wave: a warning, exit 0" "$([ $r = 0 ] && grep -q '::warning' <<<"$o" && echo 1)" "exit $r: $o"
wv 'raise KeyError("x")'; ok "(3) planted: waves.py crashes (exit 1, a traceback): fails" "$([ $r = 1 ] && grep -q '::error' <<<"$o" && echo 1)" "exit $r: $o"
wv 'raise SystemExit(2)'; ok "(3) planted: waves.py cannot read its files (exit 2): fails" "$([ $r = 1 ] && grep -q '::error' <<<"$o" && echo 1)" "exit $r: $o"
rm -f "$T/tools/waves.py"; o=$(T="$T/tools" bash "$T/waves.sh" 2>&1); r=$?
ok "(3) planted: waves.py missing: fails" "$([ $r = 1 ] && echo 1)" "exit $r: $o"

# (4) checks-changed: a check that runs out of time fails (the 30 s limit, cut to 1 s here).
step "existing checks this PR removes or changes" | sed 's/timeout 30 /timeout 1 /' > "$T/cc.sh"
printf 'import time\ntime.sleep(5)\n' > "$T/tools/checks-changed.py"
o=$(BODY=x GITHUB_STEP_SUMMARY="$T/sum" T="$T/tools" bash "$T/cc.sh" 2>&1); r=$?
ok "(4) planted: checks-changed.py runs out of time: fails, naming exit 124" "$([ $r = 1 ] && grep -q 'exit 124' <<<"$o" && echo 1)" "exit $r: $o"
grep -q 'timeout 1 ' "$T/cc.sh"; ok "(4) the step cut out has the time limit" "$([ $? = 0 ] && echo 1)" "$(cat "$T/cc.sh")"

# (5) LR-141 explainer.
D=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api; X='Explainer
What changed: a fee is now rounded once
Why: two roundings gave a cent off
What could break: totals on old invoices'
ex() { printf '%s\n' $1 > "$T/files"; o=$(printf '%s\n' "$2" | python3 -I "$TOOLS/explainer-check.py" --files "$T/files" 2>&1); r=$?; }
ex "$D/src/fees/fee-rules.ts" "$X"; ok "(5) a money PR with an explainer passes" "$([ $r = 0 ] && grep -q '^ok' <<<"$o" && echo 1)" "exit $r: $o"
ex "$D/src/fees/fee-rules.ts" 'Done when: x'; ok "(5) a money PR with no explainer fails" "$([ $r = 1 ] && grep -q 'EXPLAINER MISSING' <<<"$o" && echo 1)" "exit $r: $o"
ex "$D/prisma/schema.prisma" "${X/Why: two roundings gave a cent off/Why:}"; ok "(5) a schema PR with an empty Why fails, naming it" "$([ $r = 1 ] && grep -q '"Why:"' <<<"$o" && echo 1)" "exit $r: $o"
ex ".github/workflows/ci.yml" "$X"; ok "(5) a pipeline PR (.github/) is risky and passes with one" "$([ $r = 0 ] && grep -q 'pipeline' <<<"$o" && echo 1)" "exit $r: $o"
ex "$D/src/platform/identity/roles.ts" "<!-- $X -->"; ok "(5) an explainer inside an HTML comment does not count" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
ex "$D/src/leads/list.ts" 'nothing'; ok "(5) a PR that is not risky needs none" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
ex "$D/prisma/migrations/2026_x/migration.sql" 'explainer-check.py was run
What changed: a
Why: b
What could break: c'; ok "(5) a line naming explainer-check.py is not an Explainer line" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
ex ".github/workflows/ci.yml" "$X"$'\nmore\nand more\nand more'; ok "(5) more than 5 lines: a warning, exit 0" "$([ $r = 0 ] && grep -q '::warning' <<<"$o" && echo 1)" "exit $r: $o"
o=$(echo "$X" | python3 -I "$TOOLS/explainer-check.py" --files "$T/nope" 2>&1); r=$?
ok "(5) planted: a file list that cannot be read: exit 2, never ok" "$([ $r = 2 ] && ! grep -q '^ok' <<<"$o" && echo 1)" "exit $r: $o"
: > "$T/files"; o=$(echo "$X" | python3 -I "$TOOLS/explainer-check.py" --files "$T/files" 2>&1); r=$?
ok "(5) planted: an empty file list: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $o"
step "carries a plain-words explainer (LR-141)" > "$T/ex.sh"
exs() { o=$(cd "$ROOTD" && PATH="$T/bin:$PATH" FILES="$1" FDOWN="${2:-}" BODY="$X" RUNNER_TEMP="$T" T="$TOOLS" bash -e "$T/ex.sh" 2>&1); r=$?; }
exs ".github/workflows/ci.yml"; ok "(5) the pr-rules step passes a pipeline PR with an explainer" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
exs ".github/workflows/ci.yml" down; ok "(5) planted: the step cannot read the file list: fails" "$([ $r != 0 ] && ! grep -q '^ok' <<<"$o" && echo 1)" "exit $r: $o"
grep -A2 'carries a plain-words explainer' "$W" | grep -qF "steps.rec.outputs.records != 'yes'"; ok "(5) the step runs on every PR that is not records only" "$([ $? = 0 ] && echo 1)"

# (6) LR-134: the template asks for Risk and How to revert, and pr-rules accepts a filled template.
grep -q '^\*\*Risk:\*\*' "$TPL" && grep -q '^\*\*How to revert:\*\*' "$TPL" && grep -q '^\*\*Explainer\*\*' "$TPL"
ok "(6) the template has Risk, How to revert and the Explainer" "$([ $? = 0 ] && echo 1)"
F=$(sed -e 's/^\*\*Risk:\*\*.*/**Risk:** low/' -e 's/^\*\*How to revert:\*\*.*/**How to revert:** revert this PR/' \
  -e 's/^What changed:$/What changed: a/' -e 's/^Why:$/Why: b/' -e 's/^What could break:$/What could break: c/' \
  -e 's/^\*\*Done when:\*\*$/**Done when:** check-x.sh exits 0/' -e 's/^Duplicate check:$/Duplicate check: searched BACKLOG; none/' "$TPL")
o=$(printf '%s\n' "$F" | bash "$TOOLS/brief-check.sh" 2>&1); ok "(6) a filled template passes the body rule" "$([ $? = 0 ] && echo 1)" "$o"
ex ".github/workflows/ci.yml" "$F"; ok "(6) a filled template passes the explainer rule" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
ex ".github/workflows/ci.yml" "$(cat "$TPL")"; ok "(6) the unfilled template fails it (the hints are not an explainer)" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
printf '%s\n' "$D/prisma/migrations/x/migration.sql" > "$T/files"
o=$(printf '%s\n' "$F" | sed 's/^\*\*Cost:\*\*.*/Rules settled: a (P-801)/' | python3 -I "$TOOLS/rules-settled.py" --files "$T/files" 2>&1)
ok "(6) Risk, How to revert and the Explainer are not read as rules under Rules settled" "$(grep -q '^ok .* 1 rules' <<<"$o" && echo 1)" "$o"
finish
