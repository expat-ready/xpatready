#!/usr/bin/env bash
# LR-175 (founder A455; Lead 13, 28 Nov): lead-watch.sh lite costs under 50 REST requests (measured by github-meter.sh
# from the x-ratelimit headers), gives the lab line, merges, questions and reads owed, and writes the check stamp with
# mode lite, so "lead-watch.sh gap" stays quiet while the Lead checks (it still fails after 15 min with none). A full
# check that would not fit the budget runs the lite check instead (LR-174). A throwaway git copy; a stand-in gh serves
# the comments and a stand-in curl answers GET /rate_limit, whose "used" counts each gh call. No network, US$0.
#   bash product/tools/check-lead-watch-lite.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null && command -v python3 >/dev/null || { echo "jq or python3 is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/lite.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/state" "$T/tmp" "$T/repo"
R="$T/repo"; mkdir -p "$R/$PRODREL/design"; cp -R "$TOOLS" "$R/$PRODREL/tools"; L="$R/$PRODREL/tools"
printf '| ID | a | b | c | d | e | f | g | h | i |\n|---|---|---|---|---|---|---|---|---|---|\n| LR-001 | x | x | DO | x | x | x | Built #1 | x | x |\n| LR-002 | x | x | DO | x | x | x | Intended | x | x |\n' > "$R/$PRODREL/design/lab-register-2026-11-27.md"
git -C "$R" init -q -b main && git -C "$R" config user.email t@t && git -C "$R" config user.name t && git -C "$R" config commit.gpgsign false
git -C "$R" add -A && git -C "$R" commit -qm base && git -C "$R" commit -q --allow-empty -m "Merge pull request #77 from x/y" && git -C "$R" update-ref refs/remotes/origin/main HEAD
G=$(command -v git); printf '#!/bin/sh\nfor a; do [ "$a" = fetch ] && exit 1; done\nexec %s "$@"\n' "$G" > "$T/bin/git"
cat > "$T/bin/gh" <<'EOF'
#!/bin/bash
[ "$1 $2" = "auth token" ] && { echo gho_StandIn; exit 0; }
echo "gh $*" >> "$FX/gh.log"; echo $(( $(cat "$FX/used") + 1 )) > "$FX/used"
[ -e "$FX/gh-down" ] && { echo "HTTP 502" >&2; exit 1; }
case "$2" in */issues/comments*) p=$(sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p' <<<"$2"); python3 -I -c '
import json, sys; c = json.load(open(sys.argv[1])); p = int(sys.argv[2]); print(json.dumps(c[(p-1)*100:p*100]))' "$FX/comments.json" "${p:-1}";;
  *) echo "[]";; esac
EOF
cat > "$T/bin/curl" <<'EOF'
#!/bin/bash
d=""; u=""; while [ $# -gt 0 ]; do case "$1" in -D) d=$2; shift;; -o|-H|-X|--max-time) shift;; http*) u=$1;; esac; shift; done; cat >/dev/null
case "$u" in */rate_limit) ;; *) exit 22;; esac
used=$(cat "$FX/used"); h=$(printf 'HTTP/2 200\r\nx-ratelimit-limit: 5000\r\nx-ratelimit-used: %s\r\nx-ratelimit-remaining: %s\r\nx-ratelimit-reset: 1800000000\r\n\r\n' "$used" $(( 5000 - used )))
if [ "$d" = - ]; then printf '%s' "$h"; else printf '%s' "$h" > "$d"; fi
EOF
printf '#!/bin/sh\nexit 1\n' > "$T/bin/psql"; chmod +x "$T/bin/"*
S1=$(printf 'a%.0s' {1..40} | tr a 1); S2=$(printf '2%.0s' {1..40}); S3=$(printf '3%.0s' {1..40}); S4=$(printf '4%.0s' {1..40})
NOWZ=$(TZ=UTC date '+%Y-%m-%dT%H:%M:%SZ'); OLDZ=$(TZ=UTC date -d '-3 hours' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || TZ=UTC date -v-3H '+%Y-%m-%dT%H:%M:%SZ')
python3 -I - "$T/comments.json" "$NOWZ" "$OLDZ" "$S1" "$S2" "$S3" "$S4" <<'PY'
import json, sys
f, now, old, s1, s2, s3, s4 = sys.argv[1:]
c = lambda n, b, t=now: {"issue_url": f"https://api.github.com/repos/o/r/issues/{n}", "body": b, "created_at": t}
L = [c(900 + i, "filler comment") for i in range(140)]
L += [c(12, "Question for the tech lead: which lane?"), c(13, "Question for the tech lead: old one", old),
      c(77, "Question for the tech lead: on a merged PR"),
      c(31, "Reviewer: Approve " + s1 + "\nReady for Lead read " + s1, old),
      c(32, "Ready for Lead read " + s2, old), c(32, "Lead read the diff: " + s2),
      c(33, "Ready for Lead read " + s3, old), c(33, "Lead read the diff: " + s4),
      c(77, "Ready for Lead read " + s4, old)]
json.dump(L, open(f, "w"))
PY
echo 100 > "$T/used"
export FX="$T" XR_GITHUB_API="https://stand-in.invalid" PATH="$T/bin:$PATH" LEAD_WATCH_STATE_DIR="$T/state" TMPDIR="$T/tmp" GH_TOKEN=gho_StandIn
unset GITHUB_METER_DIR GITHUB_BUDGET_FILE
lite() { out=$(cd "$R" && timeout 60 bash "$L/lead-watch.sh" "$@" 2>&1); r=$?; }

lite lite 30
ok "lite: the first line is the GitHub budget, the second says mode lite" "$(sed -n 1p <<<"$out" | grep -q '^github token user OAuth' && sed -n 2p <<<"$out" | grep -q 'mode lite' && echo 1)" "$(head -3 <<<"$out")"
ok "lite: the lab line (lab-progress.py on origin/main)" "$(grep -q 'lab' <<<"$out" && grep -qE 'Built [^ ]*' <<<"$out" && echo 1)" "$out"
ok "lite: merges since the window's start from git (#77)" "$(grep -q '^merges since .*: 1 (#77)$' <<<"$out" && echo 1)" "$out"
ok "lite: the question in the window is an ACT; an older one and one on a merged PR are not" "$(grep -q '^ACT   #12 has a new question for the tech lead$' <<<"$out" && ! grep -q '#13 has' <<<"$out" && ! grep -q '#77 has' <<<"$out" && echo 1)" "$out"
ok "lite: reads owed: #31 (no read) and #33 (a read of another sha); not #32 (read) nor #77 (merged)" "$(grep -q "^ACT   #31 waits for the Lead's read of $S1" <<<"$out" && grep -q "^ACT   #33 waits for the Lead's read of $S3" <<<"$out" && ! grep -q '#32 waits' <<<"$out" && ! grep -q '#77 waits' <<<"$out" && echo 1)" "$out"
ok "lite: exit = number of ACT lines (3)" "$([ $r = 3 ] && [ "$(grep -c '^ACT' <<<"$out")" = 3 ] && echo 1)" "exit $r"
n=$(awk -F'\t' '$3=="lead-watch-lite" {print $4}' "$T/state/github-meter/meter.tsv" | tail -1)
ok "lite: measured from the headers, under 50 requests (2 pages of comments: 2)" "$([ "$n" = 2 ] && [ "$(grep -c '' "$T/gh.log")" = 2 ] && echo 1)" "measured ${n:-none}; gh calls: $(cat "$T/gh.log")"
ok "lite: the measured cost is within the real budget line (lead-watch-lite in github-budget.tsv)" "$(GITHUB_METER_DIR="$T/state/github-meter" bash "$L/github-meter.sh" budget | grep -q '^ok    lead-watch-lite: 2 of 50' && echo 1)" "$(GITHUB_METER_DIR="$T/state/github-meter" bash "$L/github-meter.sh" budget)"
st=$(cat "$T/state/last-check" 2>/dev/null); ok "lite writes the stamp (now) and mode lite" "$([ -n "$st" ] && [ $(( $(date +%s) - st )) -lt 60 ] && [ "$(cat "$T/state/last-check-mode")" = lite ] && echo 1)" "stamp ${st:-none}, mode $(cat "$T/state/last-check-mode" 2>&1)"

# The standby's watchdog after a lite check: quiet, naming the mode; still an ACT after 15 min with no check.
g=$(cd "$R" && NOW=$(( st + 5 * 60 )) bash "$L/lead-watch.sh" gap); gr=$?
ok "pass: gap 5 min after a lite check: ok, names the mode, exit 0" "$([ $gr = 0 ] && [ "$g" = 'ok    watchdog: last Lead check 5 min ago (lite)' ] && echo 1)" "exit $gr: $g"
g=$(cd "$R" && NOW=$(( st + 16 * 60 )) bash "$L/lead-watch.sh" gap); gr=$?
ok "fail: gap 16 min after the lite check with none since: ACT, exit 1" "$([ $gr = 1 ] && [ "$g" = 'ACT   watchdog: last Lead check 16 min ago (lite)' ] && echo 1)" "exit $gr: $g"

# --lite is the same; the window is since the previous check.
: > "$T/gh.log"; lite --lite
ok "--lite runs the lite check too" "$(sed -n 2p <<<"$out" | grep -q 'mode lite' && echo 1)" "$(head -2 <<<"$out")"
# A page cap holds the cost; an unreadable answer is an ACT, never a silent pass.
: > "$T/gh.log"; out=$(cd "$R" && LITE_MAX_PAGES=1 bash "$L/lead-watch.sh" lite 2>&1)
ok "a page cap: one request, and the check says it stopped" "$([ "$(grep -c '' "$T/gh.log")" = 1 ] && grep -q 'stopped at 1 pages' <<<"$out" && echo 1)" "$out"
touch "$T/gh-down"; lite lite; rm -f "$T/gh-down"
ok "comments unreadable: an ACT, and the stamp is still written" "$(grep -q '^ACT   comments unreadable' <<<"$out" && [ "$(cat "$T/state/last-check-mode")" = lite ] && echo 1)" "$out"

# LR-174 + LR-175: a full check that would not fit the remaining budget runs the lite check, which writes the stamp.
echo full > "$T/state/last-check-mode"; echo 1 > "$T/state/last-check"; echo 4900 > "$T/used"; : > "$T/gh.log"
lite 30
ok "full check over budget: one ACT, then the lite check runs and writes the stamp with mode lite" "$(grep -q '^ACT   github budget: 100 remaining is under lead-watch-full.*the lite check runs instead' <<<"$out" && grep -q 'mode lite' <<<"$out" && [ "$(cat "$T/state/last-check-mode")" = lite ] && [ "$(cat "$T/state/last-check")" != 1 ] && echo 1)" "$out"
ok "... the stall guard still sees the missed checks, and exit counts every ACT" "$(grep -q '^ACT   previous check ran' <<<"$out" && [ $r = "$(grep -c '^ACT' <<<"$out")" ] && echo 1)" "exit $r: $out"
finish
