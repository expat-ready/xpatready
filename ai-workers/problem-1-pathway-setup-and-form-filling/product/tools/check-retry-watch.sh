#!/usr/bin/env bash
# A348 (founder 24 Nov): retry-watch.py, the ACT line for a suite that passed only on retry until a PR names its fix.
# Pass and fail case for each rule, on made-up GitHub answers with a faked clock. US$0, no network.   bash product/tools/check-retry-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/rw.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT; mkdir "$T/f"
com() { python3 -I -c '
import json,sys
who,t,pr,cid=sys.argv[1:5]
b="Found in merge-queue batch #"+cid+".\n\n**Passed only on retry: a possible race, never silent (B122, F5).**\n\n| # | Type |\n|---|---|\n"+"".join("| QA-? | Bug \xb7 Major | `%s` \xb7 P-376 (8), F5 | commit |\n"%s for s in sys.argv[5:])
print(json.dumps({"id":int(cid),"created_at":t,"updated_at":t,"issue_url":"https://x/issues/"+pr,"user":{"login":who},"body":b}))' "$@"; }
pr() { python3 -I -c '
import json,sys
n,st,m,b=sys.argv[1:]
print(json.dumps({"number":int(n),"state":st,"body":b,"pull_request":{"merged_at":m or None}}))' "$@"; }
page() { printf '[%s]' "$(IFS=,; echo "${*:2}")" > "$T/f/comments_$1.json"; }
search() { printf '{"total_count":%s,"incomplete_results":%s,"items":[%s]}' "$1" "$2" "$(IFS=,; echo "${*:3}")" > "$T/f/search.json"; }
run() { python3 -I "$TOOLS/retry-watch.py" --state "$T/s" --fixture "$T/f" --now "${1:-2026-11-24T03:00:00Z}"; }
new() { rm -rf "${T:?}/s"; }
has() { grep -qF -- "$1" <<<"$2" && echo 1; }
none() { ! grep -q '^ACT' <<<"$1" && echo 1; }
B='github-actions[bot]'
page 1; search 0 false; o=$(run)
ok "pass: nothing passed only on retry, no ACT" "$([ "$(none "$o")" = 1 ] && has 'retry 0 of 0' "$o")" "$o"
new; page 1 "$(com "$B" 2026-11-24T01:00:00Z 3302 1 check_a.ts check_b.cjs)" "$(com "$B" 2026-11-24T02:00:00Z 3303 2 check_a.ts)"; o=$(run)
ok "fail: one ACT per suite, with its newest PR, its count and the IST time" "$([ "$(grep -c '^ACT' <<<"$o")" = 2 ] && has 'check_a.ts passed only on retry 2 times, newest on #3303 at 24 Nov 07:30 IST' "$o")" "$o"
new; page 1 "$(com "$B" 2026-11-24T01:00:00Z 3302 1 check_a.ts)" "$(com "$B" 2026-11-24T01:00:01Z 3303 1 check_a.ts)"; o=$(run)
ok "one batch holding two PRs counts once" "$(has 'check_a.ts passed only on retry 1 time,' "$o")" "$o"
new; page 1 "$(com someone 2026-11-24T01:00:00Z 3302 1 check_a.ts)"; o=$(run)
ok "pass: the same words from a person are not CI's comment" "$(none "$o")" "$o"
new; page 1 "$(com "$B" 2026-11-24T01:00:00Z 3302 1 check_a.ts)"; search 1 false "$(pr 3400 open '' $'Why\nRetry fix: check_a.ts, check_b.cjs.')"; o=$(run)
ok "pass: an open PR names its fix" "$(none "$o")" "$o"
search 1 false "$(pr 3400 open '' 'This suite check_a.ts is what Retry fix means')"; o=$(run)
ok "fail: a body that only mentions the suite names no fix" "$(has 'no PR names its fix (body line "Retry fix: check_a.ts")' "$o")" "$o"
search 1 false "$(pr 3400 open '' 'Retry fix: check_a.tsx')"; o=$(run)
ok "fail: a longer name is another suite" "$(has 'no PR names its fix' "$o")" "$o"
search 1 false "$(pr 3400 closed '' 'Retry fix: check_a.ts')"; o=$(run)
ok "fail: a closed unmerged PR names no fix" "$(has 'no PR names its fix' "$o")" "$o"
search 1 false "$(pr 3400 closed 2026-11-24T02:00:00Z 'Retry fix: check_a.ts')"; o=$(run)
ok "pass: merged after the retry" "$(none "$o")" "$o"
search 1 false "$(pr 3400 closed 2026-11-24T00:30:00Z 'Retry fix: check_a.ts')"; o=$(run)
ok "fail: it passed only on retry again after the fix merged" "$(has "it came back after #3400's fix" "$o")" "$o"
new; search 0 false; o=$(run); page 1; o=$(run 2026-12-20T03:00:00Z)
ok "fail: found at an earlier check, never dropped while no PR names it" "$(has 'ACT   retry: 1 older suite with no fix PR, most often: check_a.ts (1)' "$o" >/dev/null && grep -q '^check_a.ts passed only on retry 1 time, newest on #3302' "$T/s/retry-watch.txt" && echo 1)" "$o"
ok "the same comment read twice counts once" "$(run >/dev/null; page 1 "$(com "$B" 2026-11-24T01:00:00Z 3302 1 check_a.ts)"; has 'retry 1 time,' "$(run)")"
search 5 false; o=$(run); ok "fail: a fix list cut short is an ACT" "$(has 'ACT   retry: the list of fix PRs was cut short' "$o")" "$o"
new; search 0 false; big=$(for i in $(seq 100); do com someone 2026-11-24T01:00:00Z 1 "$i"; done | paste -sd, -); for n in $(seq 10); do printf '[%s]' "$big" > "$T/f/comments_$n.json"; done; o=$(run)
ok "fail: comments left unread after 10 full pages is an ACT" "$(has 'ACT   retry: comments read only to' "$o")" "$o"
rm -f "${T:?}"/f/comments_*; echo '{' > "$T/f/comments_1.json"; o=$(run); ok "fail: an unreadable answer is an ACT" "$(has 'ACT   retry: not read' "$o")" "$o"
# lead-watch.sh's own step 2i, cut out and run as written
sed -n '/^# 2i\. Retry-only/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/t"
step() { printf 'print("""%s""")\n' "$1" > "$T/t/retry-watch.py"; ( TOOLS="$T/t"; STATE_DIR="$T/s"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { :; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1; }
o=$(step 'retry 0 of 0'); ok "lead-watch.sh prints its line, no ACT counted" "$(has 'acts=0' "$o")" "$o"
o=$(step 'ACT   retry: x
retry 1 of 1'); ok "lead-watch.sh counts its ACT line" "$(has 'ACT   retry: x' "$o" >/dev/null && has 'acts=1' "$o")" "$o"
o=$(step Traceback); ok "fail: a retry-watch.py that dies is an ACT" "$(has 'ACT   retry: retry-watch.py did not run' "$o")" "$o"
finish
