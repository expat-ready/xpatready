#!/usr/bin/env bash
# records-pr.sh (OS-15): the Lead's records PR in one command. Throwaway git copies with a local bare origin and a
# stand-in gh that logs each call. change-kind.sh is a stand-in ("notes"): records-only.sh's own path rules are real.
# US$0, no network.   bash product/tools/check-records-pr.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/recpr.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
# stand-in gh: a GET answers the numbers in $T/open (or fails with FAILGET); a call with -f is the PR POST
cat > "$T/gh" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$T/calls"
case " \$* " in *" -f "*) [ -n "\${FAILPOST:-}" ] && { echo "HTTP 422 Validation Failed" >&2; exit 1; }; echo "https://x/pull/901"; exit 0;; esac
[ -n "\${FAILGET:-}" ] && { echo "HTTP 502 Bad Gateway" >&2; exit 1; }
cat "$T/open" 2>/dev/null; exit 0
EOF
chmod +x "$T/gh"
P="$PRODREL"
fresh() {   # a clone on lead/test whose origin has main with RULES as of P-$1 and DECISIONS up to P-$2
  rm -rf "$T/o" "$T/c" "$T/open"; : > "$T/calls"; docs_copy "$T/c"; C="$T/c"; Q="$C/$P"
  cp "$TOOLS/records-pr.sh" "$TOOLS/records-only.sh" "$Q/tools/"; printf '#!/usr/bin/env bash\ncat >/dev/null; echo notes\n' > "$Q/tools/change-kind.sh"
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$T/gh" > "$Q/tools/gh.sh"
  printf '# Rule register (Lead keeps it; as of **P-%s**, 24 Nov 09:0x IST; earlier: `history/RULES-old.md` + older)\n\n| ID | Rule | Enforced by | As of |\n|---|---|---|---|\n| P-%s | a rule | prose | 24 Nov |\n' "$1" "$1" > "$Q/RULES.md"; mkdir -p "$Q/history"; echo old > "$Q/history/RULES-old.md"
  [ -n "${3:-}" ] && printf '| IDX-9 | rows P-%s to P-%s stand | prose | 24 Nov |\n' "$3" "$4" >> "$Q/RULES.md"
  { echo '| # | Date | Decision |'; echo '|---|---|---|'; n=$2; while [ "$n" -ge "$1" ]; do echo "| P-$n | 25 Nov | d |"; n=$((n - 1)); done; } > "$Q/DECISIONS.md"
  git -C "$C" add -A && git -C "$C" commit -qm base && git init -q --bare "$T/o" && git -C "$C" remote add origin "$T/o" && git -C "$C" push -q origin main 2>/dev/null && git -C "$C" checkout -q -b lead/test
}
run() { : > "$T/calls"; o=$(cd "$C" && RECORDS_GH="$T/gh" bash "$Q/tools/records-pr.sh" "$@" 2>&1); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }; posts() { grep -c -- ' -f ' "$T/calls"; }
pushed() { git -C "$T/o" rev-parse -q --verify refs/heads/lead/test >/dev/null && echo 1; }
clean() { [ -z "$(git -C "$C" status --porcelain)" ] && echo 1; }

fresh 5 7 6 7; echo "a line" >> "$Q/STATE.md"; r0=$(cat "$Q/RULES.md"); run --dry-run --as-of P-7
ok "dry run: prints the record, the new first line, the lag and the PR it would open" "$([ "$rc" = 0 ] && has "record: $P/STATE.md" && has "record: $P/RULES.md" && has 'RULES first line: # Rule register (Lead keeps it; as of **P-7**, ' && has '0 row(s) behind' && has 'would open a PR lead/test → main' && echo 1)" "$o"
ok "dry run: edits, commits, pushes and posts nothing" "$([ "$r0" = "$(cat "$Q/RULES.md")" ] && [ "$(git -C "$C" rev-list --count main..HEAD)" = 0 ] && [ -z "$(pushed)" ] && [ "$(posts)" = 0 ] && echo 1)" "$(cat "$T/calls")"
echo 77 > "$T/open"; run --dry-run; ok "dry run with an open PR from the branch: would update it" "$(has 'would update #77' && grep -q 'pulls?state=open&head=expat-ready:lead/test' "$T/calls" && echo 1)" "$o"
rm -f "$T/open"; FAILGET=1 run --dry-run; ok "dry run: a failed PR read is said, not taken as none" "$([ "$rc" = 0 ] && has 'the PR read failed (HTTP 502' && ! has 'would open a PR' && echo 1)" "$o"

fresh 5 7 6 7; echo "a line" >> "$Q/STATE.md"; run --as-of P-7 --title "records: test day"
l1=$(head -1 "$Q/RULES.md")
ok "a run commits the records, pushes the branch and opens one ready PR into main" "$([ "$rc" = 0 ] && [ "$(pushed)" = 1 ] && [ "$(posts)" = 1 ] && grep -q 'repos/expat-ready/xpatready/pulls -f title=records: test day -f head=lead/test -f base=main' "$T/calls" && ! grep -q draft "$T/calls" && has 'opened https://x/pull/901' && [ "$(clean)" = 1 ] && echo 1)" "$o | $(cat "$T/calls")"
ok "the PR body carries the lag, check-docs and a Duplicate check line (P-526)" "$(grep -q 'Duplicate check: searched open PRs from lead/test; none (P-526)' "$T/calls" && grep -q 'lag 0 (at most 3, P-440). check-docs.sh OK on' "$T/calls" && echo 1)" "$(cat "$T/calls")"
ok "RULES' first line: only the as-of part changes, the rest is kept" "$(grep -qE '^# Rule register \(Lead keeps it; as of \*\*P-7\*\*, [0-9]{1,2} [A-Z][a-z]{2} [0-9]{2}:[0-9]{2} IST; earlier: `history/RULES-old.md` \+ older\)$' <<<"$l1" && [ "$(sed -n 2,99p "$Q/RULES.md" | md5sum)" = "$(git -C "$C" show main:"$P/RULES.md" | sed -n 2,99p | md5sum)" ] && echo 1)" "$l1"
ok "check-docs exits 0 after the run" "$(bash "$Q/tools/check-docs.sh" >/dev/null 2>&1 && echo 1)" "$(bash "$Q/tools/check-docs.sh" 2>&1 | tail -3)"
echo 901 > "$T/open"; echo more >> "$Q/STATE.md"; run; ok "a second run updates the open PR: a push, no new PR" "$([ "$rc" = 0 ] && has 'updated #901' && [ "$(posts)" = 0 ] && [ "$(git -C "$T/o" rev-parse lead/test)" = "$(git -C "$C" rev-parse HEAD)" ] && echo 1)" "$o"
run; ok "nothing changed and nothing new since the push: it still names the open PR" "$([ "$rc" = 0 ] && [ "$(posts)" = 0 ] && echo 1)" "$o"

fresh 5 5; run; ok "nothing to do: no change, no commit ahead, no GitHub call" "$([ "$rc" = 0 ] && has 'nothing to do' && [ ! -s "$T/calls" ] && echo 1)" "$o"
fresh 5 5; echo x >> "$Q/STATE.md"; echo 'echo hi' > "$Q/tools/new-tool.sh"; echo x > "$C/notes with space.md"; mkdir -p "$Q/qa"; echo x > "$Q/qa/run 1.md"; run
ok "a non-record change is listed as left out and never committed; a name with a space is a record" "$([ "$rc" = 0 ] && has "left out (not a record; its own PR): $P/tools/new-tool.sh" && has "left out (not a record; its own PR): notes with space.md" && has "record: $P/qa/run 1.md" && git -C "$C" show --name-only HEAD | grep -qF "$P/qa/run 1.md" && ! git -C "$C" show --name-only HEAD | grep -q new-tool && echo 1)" "$o"
fresh 5 5; echo 'echo hi' > "$Q/tools/x.sh"; git -C "$C" add -A; git -C "$C" commit -qm tool; echo x >> "$Q/STATE.md"; run
ok "a commit on the branch that changes a tool: refused, nothing pushed or posted" "$([ "$rc" = 2 ] && has "REFUSED: the branch's commits since origin/main change more than records: $P/tools/x.sh" && [ -z "$(pushed)" ] && [ ! -s "$T/calls" ] && echo 1)" "$o"
fresh 5 5; git -C "$C" checkout -q main; echo x >> "$Q/STATE.md"; run; ok "on main: refused" "$([ "$rc" = 2 ] && has 'REFUSED: on main' && echo 1)" "$o"
fresh 5 5; git -C "$C" checkout -q -b claude/x; echo x >> "$Q/STATE.md"; run --dry-run; ok "a branch that is not lead/*: a note, not a refusal" "$([ "$rc" = 0 ] && has 'is not a lead/* branch' && echo 1)" "$o"

fresh 5 9 8 9; echo x >> "$Q/STATE.md"
run --as-of P-4; ok "--as-of below RULES' number: refused" "$([ "$rc" = 2 ] && has 'below RULES.md' && echo 1)" "$o"
run --as-of P-10; ok "--as-of above DECISIONS' newest: refused" "$([ "$rc" = 2 ] && has "above DECISIONS.md's newest row, P-9" && echo 1)" "$o"
run --as-of '9; rm -rf /'; ok "--as-of that is not P-NNN: refused before anything runs" "$([ "$rc" = 2 ] && has 'must look like P-829' && [ ! -s "$T/calls" ] && echo 1)" "$o"
run --dry-run --as-of P-9; ok "a row RULES does not name is a warning; rows inside 'P-a to P-b' are named" "$([ "$rc" = 0 ] && has 'warning: P-6 (DECISIONS) is not named' && has 'warning: P-7 (DECISIONS)' && ! has 'warning: P-8' && ! has 'warning: P-9' && echo 1)" "$o"
fresh 5 9; echo x >> "$Q/STATE.md"; run
ok "RULES 4 rows behind: check-docs fails, nothing committed, pushed or posted" "$([ "$rc" = 1 ] && has '4 row(s) behind' && has 'check-docs.sh failed, nothing committed' && has 'RULES LAG' && [ "$(git -C "$C" rev-list --count main..HEAD)" = 0 ] && [ -z "$(pushed)" ] && [ "$(posts)" = 0 ] && echo 1)" "$o"
fresh 5 5; echo x >> "$Q/STATE.md"; FAILGET=1 run; ok "a failed PR read on a real run: exit 1 before any edit or commit" "$([ "$rc" = 1 ] && has 'nothing done' && [ "$(git -C "$C" rev-list --count main..HEAD)" = 0 ] && [ -z "$(pushed)" ] && echo 1)" "$o"
fresh 5 5; echo x >> "$Q/STATE.md"; FAILPOST=1 run; ok "a failed PR open: exit 1, the branch is pushed and the message says so" "$([ "$rc" = 1 ] && has 'opening the PR failed (HTTP 422' && has 'the branch is pushed' && [ "$(pushed)" = 1 ] && echo 1)" "$o"
fresh 5 5; echo x >> "$Q/STATE.md"; git -C "$C" remote set-url --push origin "$T/nowhere"; run
ok "a failed push: exit 1, it says the commit is local only, no PR posted" "$([ "$rc" = 1 ] && has 'git push failed: the commit is local only' && [ "$(posts)" = 0 ] && echo 1)" "$o"
fresh 5 5; git -C "$C" checkout -q --detach; run; ok "a detached HEAD: refused" "$([ "$rc" = 2 ] && has 'detached HEAD' && echo 1)" "$o"
fresh 5 5; run --bogus; ok "an unknown option: usage, exit 2" "$([ "$rc" = 2 ] && has 'usage:' && echo 1)" "$o"
finish
