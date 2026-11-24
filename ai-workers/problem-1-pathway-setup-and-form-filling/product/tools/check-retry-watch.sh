#!/usr/bin/env bash
# A348 (founder 24 Nov): retry-watch.py, the ACT line for a suite that passed only on retry until a PR names its fix. Pass
# and fail case for each rule, through a stand-in GitHub (a gh.sh beside a copy of the script) that pages by time as GitHub
# does, with CI's comment made by flaky.mjs itself. US$0, no network.   bash product/tools/check-retry-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v node >/dev/null || { echo "node is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/rw.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
mkdir "$T/t" "$T/tries"; cp "$TOOLS/retry-watch.py" "$T/t/"
cat > "$T/t/gh.sh" <<'G'
exec python3 -I "$(dirname "$0")/../gh.py" "$(dirname "$0")/.." "$2"
G
cat > "$T/gh.py" <<'G'
import json, os, sys
from urllib.parse import urlsplit, parse_qs
d, u = sys.argv[1:]; u = urlsplit(u); q = {k: v[0] for k, v in parse_qs(u.query).items()}
if os.path.exists(d + "/down_" + u.path.split("/")[0]): sys.exit("HTTP 502")
n, per = int(q["page"]), int(q["per_page"])
if u.path.startswith("search"):
    assert '"Retry fix" in:body' in q["q"] and "is:pr" in q["q"], q
    P = json.load(open(d + "/prs.json")); T = P.get("total", len(P["items"]))
    print(json.dumps({"total_count": T, "incomplete_results": P.get("cut", False), "items": P["items"][(n - 1) * per:n * per]})); sys.exit()
f = d + "/comments.json"; C = json.load(open(f))
assert q["sort"] == "updated" and q["direction"] == "asc", q
C.sort(key=lambda c: (c["updated_at"], c["id"]))
print(json.dumps([c for c in C if c["updated_at"] >= q["since"]][(n - 1) * per:n * per]))
e = d + "/edit"   # an edit that lands between two reads: "<id> <new updated_at>"
if os.path.exists(e):
    i, at = open(e).read().split(); os.unlink(e)
    for c in C:
        if c["id"] == int(i): c["updated_at"] = at
    json.dump(C, open(f, "w"))
G
body() { local s; : > "$T/ev.tsv"; for s in "$@"; do printf '2026-11-24T01:00:00Z\t%s\tpassed on retry\t1\t0\tabc1234\n' "$s" >> "$T/ev.tsv"; done; node "$TOOLS/flaky.mjs" report --logs "$T/tries" --events "$T/ev.tsv" 2>/dev/null; }
A=$(body check_a.ts); AB=$(body check_a.ts check_b.cjs)
c() { python3 -I -c '
import json,sys
w,t,pr,i,b=sys.argv[1:]
print(json.dumps({"id":int(i),"created_at":t,"updated_at":t,"issue_url":"https://x/issues/"+pr,"user":{"login":w},"body":b}))' "$@"; }
B='github-actions[bot]'; bot() { c "$B" "$1" "$2" "$3" "Found in merge-queue batch #$4, which holds #$2.

**Part 18**

$5"; }
set_c() { printf '[%s]' "$(IFS=,; echo "$*")" > "$T/comments.json"; }
pr() { python3 -I -c '
import json,sys
n,st,m,b=sys.argv[1:]
print(json.dumps({"number":int(n),"state":st,"body":b,"pull_request":{"merged_at":m or None}}))' "$@"; }
prs() { printf '{"items":[%s]%s}' "$(IFS=,; echo "$*")" "${EXTRA:-}" > "$T/prs.json"; }
run() { o=$(python3 -I "$T/t/retry-watch.py" --state "$T/s$k" --now "${1:-2026-11-24T03:00:00Z}" 2>&1); }
k=0; new() { k=$((k + 1)); mkdir -p "$T/s$k"; printf '{"since":"2026-11-20T00:00:00Z","found":{}}' > "$T/s$k/retry-watch.json"; }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; not() { ! grep -qF -- "$1" <<<"$o" && echo 1; }; none() { not ACT; }
fixed() { new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 "$A")"; prs "$(pr 3400 "${3:-open}" "${4:-}" "$2")"; run; ok "pass: $1" "$([ "$(none)" = 1 ] && has 'retry 0 of 1')" "$o"; }
unfixed() { new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 "$A")"; prs "$(pr 3400 "${3:-open}" "${4:-}" "$2")"; run; ok "fail: $1" "$(has 'ACT   retry: check_a.ts passed only on retry 1 time, newest on #3302 at 24 Nov 06:30 IST: no PR names its fix (body line "Retry fix: check_a.ts")')" "$o"; }

ok "CI's own report (flaky.mjs) is what the test reads" "$(grep -q 'Passed only on retry' <<<"$A" && grep -q 'check_a.ts' <<<"$A" && echo 1)" "$A"
new; set_c; prs; run; ok "pass: nothing passed only on retry" "$([ "$(none)" = 1 ] && has 'retry 0 of 0')" "$o"
new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 8 "$AB")" "$(bot 2026-11-24T02:00:00Z 3303 2 9 "$A")"; run
ok "fail: one ACT per suite, its newest PR, its count, the IST time" "$([ "$(grep -c '^ACT' <<<"$o")" = 2 ] && has 'ACT   retry: check_a.ts passed only on retry 2 times, newest on #3303 at 24 Nov 07:30 IST')" "$o"
run; ok "fail: seen at the last check: one ACT for both, and the list" "$([ "$(grep -c '^ACT' <<<"$o")" = 1 ] && [ "$(has 'ACT   retry: 2 suites with no fix PR, most often: check_a.ts (#3303), check_b.cjs (#3302)')" = 1 ] && grep -q '^check_b.cjs passed only' "$T/s$k/retry-watch.txt" && echo 1)" "$o"
set_c; run 2027-03-01T03:00:00Z; ok "fail: months later, no comment left to read: still an ACT" "$(has 'ACT   retry: 2 suites with no fix PR')" "$o"
new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 "$A")" "$(bot 2026-11-24T01:00:01Z 3303 2 9 "$A")"; run; ok "a batch holding two PRs counts once" "$(has 'check_a.ts passed only on retry 1 time,')" "$o"
new; set_c "$(c someone 2026-11-24T01:00:00Z 3302 1 "$A")"; run; ok "pass: the same words from a person are not CI's comment" "$(none)" "$o"
new; set_c "$(c "$B" 2026-11-24T01:00:00Z 3302 1 'a table | x | y | `check_a.ts` |')"; run; ok "pass: another bot comment naming a suite" "$(none)" "$o"
new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 '**Passed only on retry, a possible race (B122, F5):** check_a.ts check_b.cjs. The bug report failed: x')"; run
ok "fail: run-suites.sh's line, when the report failed, is read too" "$([ "$(has 'ACT   retry: check_a.ts passed')" = 1 ] && has 'ACT   retry: check_b.cjs passed')" "$o"
new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 '**Passed only on retry: new words** with no suite')"; run; ok "fail: a comment that names no suite is an ACT with its PR" "$(has "ACT   retry: CI's retry comment on #3302 at 24 Nov 06:30 IST names no suite")" "$o"
run; ok "fail: and stays one at the next check that day" "$(has 'names no suite')" "$o"

fixed "an open PR names its fix" $'Why\nRetry fix: check_a.ts, check_b.cjs\nMore'
fixed "bold, a list mark and backticks" '- **Retry fix:** `check_a.ts`'
fixed "merged after the pass" 'Retry fix: check_a.ts' closed 2026-11-24T02:00:00Z
unfixed "closed unmerged" 'Retry fix: check_a.ts' closed
unfixed "a body that only mentions it" 'we say Retry fix: check_a.ts later'
unfixed "words on the line" 'Retry fix: none yet, check_a.ts is still flaky'
unfixed "the name on a later line" $'Retry fix:\n\ncheck_a.ts stays open'
unfixed "a longer name" 'Retry fix: check_a.tsx'
unfixed "a name inside another" 'Retry fix: recheck_a.ts'
unfixed "a code block" $'```\nRetry fix: check_a.ts\n```'
unfixed "an HTML comment" $'<!-- x\nRetry fix: check_a.ts\n-->'
unfixed "a quote" '> Retry fix: check_a.ts'
new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 "$A")"; prs "$(pr 3400 closed 2026-11-24T00:30:00Z 'Retry fix: check_a.ts')"; run; ok "fail: it passed only on retry again after the fix merged" "$(has "it came back after #3400's fix")" "$o"
new; set_c "$(bot 2026-11-24T01:00:00Z 3400 1 9 "$A")"; prs "$(pr 3400 closed 2026-11-24T01:10:00Z 'Retry fix: check_a.ts')"; run; ok "fail: the fix's own batch passed only on retry" "$(has "it came back after #3400's fix")" "$o"
new; set_c "$(bot 2026-11-24T01:00:00Z 3302 1 9 "$A")"; many=$(for i in $(seq 120); do pr "$i" open '' x; done | paste -sd, -); prs "$many" "$(pr 3400 open '' 'Retry fix: check_a.ts')"; run; ok "pass: the fix PR is on the second page of the search" "$(none)" "$o"
EXTRA=',"cut":true' prs; run; ok "fail: a search answered in part is an ACT" "$(has 'ACT   retry: the list of fix PRs is cut short')" "$o"
touch "$T/down_search"; run; ok "fail: fix PRs unread is an ACT, and the known suite is still shown" "$([ "$(has 'ACT   retry: fix PRs not read')" = 1 ] && has '1 suite with no fix PR')" "$o"
touch "$T/down_repos"; run; ok "fail: comments unread is an ACT, and the known suite is still shown" "$([ "$(has 'ACT   retry: comments not read')" = 1 ] && has '1 suite with no fix PR')" "$o"
mv "$T/down_search" "$T/down_x"; mv "$T/down_repos" "$T/down_y"; prs

# Paging: 150 comments, CI's at place 101; the first one is edited between the two reads, so every later one moves up
fill() { for i in $(seq "$1" "$2"); do c someone "$(printf '2026-11-23T%02d:%02d:00Z' $((i / 60)) $((i % 60)))" 1 "$i" x; done | paste -sd, -; }
new; set_c "$(fill 1 100)" "$(bot 2026-11-23T01:40:30Z 3302 900 9 "$A")" "$(fill 101 149)"; echo "1 2026-11-23T10:00:00Z" > "$T/edit"; run
ok "fail: a comment edited between two reads hides no other" "$([ "$(has 'ACT   retry: check_a.ts passed')" = 1 ] && [ ! -e "$T/edit" ] && echo 1)" "$o"
new; set_c "$(for i in $(seq 150); do c someone 2026-11-23T01:00:00Z 1 "$i" x; done | paste -sd, -)" "$(bot 2026-11-23T01:00:00Z 3302 900 9 "$A")"; run; ok "fail: over a page of comments in one second are all read" "$(has 'ACT   retry: check_a.ts passed')" "$o"
new; set_c "$(for i in $(seq 1100); do printf '{"id":%s,"created_at":"%s","updated_at":"%s","issue_url":"x/1","user":{"login":"p"},"body":""}\n' "$i" "$(printf '2026-11-23T%02d:%02d:%02dZ' $((i / 3600)) $((i / 60 % 60)) $((i % 60)))" "$(printf '2026-11-23T%02d:%02d:%02dZ' $((i / 3600)) $((i / 60 % 60)) $((i % 60)))"; done | paste -sd, -)" "$(bot 2026-11-23T05:00:00Z 3302 2000 9 "$A")"; run
ok "fail: comments left unread after 10 reads is an ACT" "$([ "$(has 'ACT   retry: comments read only to')" = 1 ] && not 'check_a.ts passed')" "$o"
run; ok "the next check reads on from there" "$([ "$(has 'ACT   retry: check_a.ts passed')" = 1 ] && not 'read only to')" "$o"

# The memory
set_c "$(bot 2026-11-12T01:00:00Z 3302 1 9 "$A")"
for m in '' '{' '[]' '{"since":"2099-01-01T00:00:00Z","found":{}}' '{"since":"2026-11-20T00:00:00Z","found":{"check_q.ts":{}}}'; do new; printf '%s' "$m" > "$T/s$k/retry-watch.json"; run
  ok "fail: a memory of '${m:0:40}' is an ACT naming the file, and 14 days are read again" "$([ "$(has 'ACT   retry: memory ')" = 1 ] && [ "$(has "$T/s$k/retry-watch.json")" = 1 ] && has '1 suite with no fix PR')" "$o"; done
k=$((k + 1)); run; ok "fail: a missing memory is an ACT" "$(has 'ACT   retry: memory missing')" "$o"
run; ok "pass: the memory is back at the next check" "$(not 'memory')" "$o"

# lead-watch.sh's own step 2i, cut out and run as written
sed -n '/^# 2i\. Retry-only/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir "$T/l"
step() { printf 'print("""%s""")\n' "$1" > "$T/l/retry-watch.py"; o=$( ( TOOLS="$T/l"; STATE_DIR="$T/s1"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'retry 0 of 0'; ok "lead-watch.sh prints its line and hands it to step 12, no ACT counted" "$([ "$(has 'seen: retry 0 of 0')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   retry: x
retry 1 of 1'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a retry-watch.py that dies is an ACT" "$(has 'ACT   retry: retry-watch.py did not run')" "$o"
finish
