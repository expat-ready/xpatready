#!/bin/bash
# Lead watch (founder, 3 Nov): one call per check gives the tech lead resources, merges and lanes in a few lines.
# Read-only, except step 6b's private sync (P-678). Pairs with get_usage (weekly plan, context) and list_sessions, which only the Lead's tools can read.
# Exit code = number of ACT lines; step 15 always adds one, the current constraint (P-738), so 1 = only that. Skill: .claude/skills/lead-watch.
# Usage: bash product/tools/lead-watch.sh [minutes since last check, default 30]
#        bash product/tools/lead-watch.sh app-view-read <<'EOF' (app-view.js's answer) EOF   saves the app view (step 10)
#        bash product/tools/lead-watch.sh gap   (ENF-761 part 4: the standby's watchdog, no GitHub calls; see step 0)
# Triggers follow the 10-minute check (P-798): steps 2f (flow-buffer.py, P-800), 2g (sle-watch.py) and 5c (step-age.py).
set -uo pipefail
# app-view-read (P-789 (2), founder 22 Nov): saves app-view.js's answer through app-view-save.sh, but only a summary whose
# first line has "rows=N" (the sidebar's rows after every "Show more" was clicked); anything else is refused, exit 2.
if [ "${1:-}" = app-view-read ]; then
  body=$(tr -d '\r' | sed -e '/./,$!d'); first=$(printf '%s\n' "$body" | head -1)
  if ! grep -qE '(^| )rows=[0-9]+' <<<"$first"; then
    echo "refused: the app view summary has no rows=N (first line: ${first:-empty}); run the current tools/app-view.js, which clicks every \"Show more\" and counts the rows (P-789 (2))" >&2; exit 2
  fi
  printf '%s\n' "$body" | bash "$(cd "$(dirname "$0")" && pwd)/app-view-save.sh"; exit $?
fi
SINCE="${1:-30}"
# gh through gh.sh: on a TLS failure the same reads go through curl with gh auth token (P-363; founder, 6 Nov).
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { bash "$TOOLS/gh.sh" "$@"; }
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 99
STATE_DIR="${LEAD_WATCH_STATE_DIR:-/private/tmp/claude-$(id -u)/lead-watch}"
# gap mode (ENF-761 part 4; founder 20 Nov 15:0x IST: a 98-min gap, 12:24 to 14:03 IST, at a hand-over): only the stall
# guard's stamp is read, never written, and no GitHub call is made. Over GAP_MAX (15) min since the Lead's last check:
# "ACT watchdog: last Lead check N min ago", exit 1; no stamp: the same ACT with "never", exit 1; a stamp that is not a
# number, or in the future, is an ACT too (never arithmetic on it, never a fall-through into the full run); else ok, exit 0.
# Standby Leads run it every 10 min (prompt exactly "run lead-watch gap", lead-check-guard.sh). Test: check-lead-gap.sh.
if [ "${1:-}" = gap ]; then
  st="$STATE_DIR/last-check"; [ -s "$st" ] || { echo "ACT   watchdog: last Lead check never (no stamp at $st)"; exit 1; }
  v=$(tr -d '\r\n' < "$st"); now=${NOW:-$(date +%s)}
  case "$v" in ''|*[!0-9]*) echo "ACT   watchdog: Lead check stamp unreadable at $st"; exit 1;; esac
  n=$(( (now - 10#$v) / 60 ))
  [ "$n" -lt 0 ] && { echo "ACT   watchdog: Lead check stamp is $(( -n )) min in the future at $st"; exit 1; }
  [ "$n" -gt "${GAP_MAX:-15}" ] && { echo "ACT   watchdog: last Lead check $n min ago"; exit 1; }
  echo "ok    watchdog: last Lead check $n min ago"; exit 0
fi
mkdir -p "$STATE_DIR"
act=0; say() { echo "$1"; echo "$1" >> "$SEEN"; }; ACT() { act=$((act+1)); echo "ACT   $1"; echo "ACT   $1" >> "$SEEN"; }
SEEN="$STATE_DIR/seen.$$"; : > "$SEEN"; seen() { printf '%s\n' "$1" >> "$SEEN"; }; trap 'rm -f "$SEEN" "$GH_TLS_NOTE_ONCE"; type pre_off >/dev/null 2>&1 && pre_off' EXIT   # B202: lines step 12 reuses
export GH_TLS_NOTE_ONCE="$STATE_DIR/tls-noted.$$"; rm -f "$GH_TLS_NOTE_ONCE"   # ENF-761 part 5: gh.sh's curl notice once per run
GH_TOKEN="${GH_TOKEN:-$(command gh auth token 2>/dev/null)}"; if [ -n "$GH_TOKEN" ]; then export GH_TOKEN; else unset GH_TOKEN; fi   # the token is read once a run, not once a call
. "$TOOLS/fresh-lib.sh"   # ENF-803 (P-803): every section says when and from where it read; cached answers over 10 min refused

say "time  $(TZ=Asia/Kolkata date '+%d %b %H:%M IST')"

# 0. Stall guard (founder, 7 Nov, P-388): the previous check must have run. Lead 24 stalled ~7.4 h on one prompt and no
# check fired. Checks run every 10 min (P-761); a gap over STALL_MAX (15) min means a check was missed: tell the founder
# at once (ENF-761 part 4 lowered it from 40). Standbys read the same stamp with "lead-watch.sh gap" (above).
stamp="$STATE_DIR/last-check"; now=$(date +%s)
if [ -s "$stamp" ]; then last=$(cat "$stamp"); gap=$(( (now - last) / 60 ))
  [ "$gap" -gt "${STALL_MAX:-15}" ] && ACT "previous check ran ${gap} min ago ($(TZ=Asia/Kolkata date -r "$last" '+%d %b %H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -d "@$last" '+%d %b %H:%M IST')): checks were missed; tell the founder at once (P-388, P-389)"
fi
echo "$now" > "$stamp.$$" && mv -f "$stamp.$$" "$stamp"   # atomic: the standby never reads a half-written stamp
fresh "the clock and $stamp"

# 0b. Speed (Lead 26, 24 Nov): the steps' own commands, started together after one fetch; each step below still runs its
# command as written and is given this run's answer (lead-watch-pre.sh). A line here that matches no step only costs time.
# The private sync (6b) is not among them: it writes, and its own 90 s limit must outlive a check that dies.
PRE_T0=$SECONDS; early=""; git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 fetch -q origin 2>/dev/null || early="not started early, origin was not fetched: each step reads at its own turn, after its own fetch"
export FLOW_TOKEN="${FLOW_TOKEN:-${GH_TOKEN:-}}"; [ -n "$FLOW_TOKEN" ] || unset FLOW_TOKEN
. "$TOOLS/lead-watch-pre.sh"; [ -z "$early" ] || pre_off   # no folder: every pre below starts nothing, and the steps run as they did before
pre python3 -I "$TOOLS/proof-number.py"
pre python3 -I "$TOOLS/capacity-watch.py" --state "$STATE_DIR"
pre python3 -I "$TOOLS/queue-batches.py" ${QB_PULLS:+--pulls "$QB_PULLS"} ${QB_CHECKS:+--checks "$QB_CHECKS"}
pre python3 -I "$TOOLS/runs-waiting.py" --save "$STATE_DIR/runs-waiting.json" ${RUNS_WAITING_JSON:+--runs "$RUNS_WAITING_JSON"}
pre python3 -I "$TOOLS/nightly-watch.py"
pre python3 -I "$TOOLS/proof-read-watch.py"
pre python3 -I "$TOOLS/sle-watch.py" --grouped --dump "$STATE_DIR/sle.json"
pre python3 -I "$TOOLS/retry-watch.py" --state "$STATE_DIR"
pre python3 -I "$TOOLS/same-cause.py" --state "$STATE_DIR"
pre python3 -I "$TOOLS/queue-blocked.py"
pre bash "$TOOLS/lead-queue.sh"
SWEEP_STATE_DIR="$STATE_DIR" after bash "$TOOLS/lead-queue.sh" -- bash "$TOOLS/branch-sweep.sh"   # reads the items.json that lead-queue.sh writes
pre python3 -I "$TOOLS/flow-measure.py" --since today --lead
pre python3 "$TOOLS/library-freshness.py"
pre python3 -I "$TOOLS/conformance-check.py" --quiet
pre python3 -I "$TOOLS/lane-cleanup.py"
pre python3 -I "$TOOLS/queue-depth.py" ${QUEUE_DEPTH_RUNS:+--runs "$QUEUE_DEPTH_RUNS"} ${QUEUE_DEPTH_MERGIFY:+--mergify "$QUEUE_DEPTH_MERGIFY"}
pre python3 -I "$TOOLS/cycle-timeline.py"
fresh "git fetch origin; the slow reads below: ${early:-start now, together, so a stamp further down can be later than its read by the length of the run}"

# 1. Disk and test databases (P-308 disk rule: under 10 GB the Lead frees space, under 4 GB Mac suites pause).
free=$(df -g / | awk 'NR==2 {print $4}')
pg="psql -h 127.0.0.1 -p 54329 -U xr_studio -d postgres -Atc"
idle=$($pg "select datname from pg_database d where datname like 'xr_studio_%' and datname not like '%demo%' and not exists (select 1 from pg_stat_activity a where a.datname=d.datname)" 2>/dev/null | sort)
dbs=$($pg "select count(*)||' ('||pg_size_pretty(coalesce(sum(pg_database_size(datname)),0))||')' from pg_database where datname like 'xr_studio_%'" 2>/dev/null)
# A database is safe to drop only when it was idle at the previous check too (file times are copied from the template).
prev="$STATE_DIR/idle-dbs.txt"; both=0
[ -f "$prev" ] && both=$(comm -12 "$prev" <(echo "$idle") | grep -c . )
echo "$idle" > "$prev"
say "disk  ${free} GB free · test databases ${dbs:-?} · idle at two checks: ${both}"
[ "$free" -lt 4 ] && ACT "disk under 4 GB: tell Mac builders to pause suite runs, then free space"
[ "$free" -lt 10 ] && [ "$both" -gt 0 ] && ACT "disk under 10 GB: drop the ${both} test databases idle at two checks (lead-watch skill, step 3)"
fresh "df / and PostgreSQL 127.0.0.1:54329"
# 1c. The Lead's context (E12, P-446 (1)): hand over at the first check after 200k beyond the start read; at 150k the first
# standby reads RULES+STATE. get_usage is the Lead's tool only, so the Lead passes it: LEAD_CONTEXT=<k> (no value = ACT).
lc=$(python3 -I "$TOOLS/lead-upkeep.py" context --state "$TOOLS/../STATE.md" 2>&1); echo "$lc"; act=$((act + $(grep -c '^ACT' <<<"$lc"))); seen "$lc"
fresh "lead-upkeep.py context: STATE.md in this copy and LEAD_CONTEXT from the Lead's get_usage"

# 1d. Proof number first (A348, founder 24 Nov): Proven today (net since 00:00 IST), last 24 h and the forecast, above merges.
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 fetch -q origin main 2>/dev/null || ACT "proven: origin/main not fetched, the number below may be old"
pn=$(python3 -I "$TOOLS/proof-number.py" 2>&1); echo "$pn"; act=$((act + $(grep -c '^ACT' <<<"$pn"))); seen "$pn"
grep -qE '^(proven |ACT   proven)' <<<"$pn" || ACT "proven: proof-number.py did not run ($(head -1 <<<"$pn"))"
fresh "proof-number.py: qa/CAPABILITIES.md and app code on origin/main (git only)"

# 1e. Capacity (A348, founder 24 Nov): under 2 standbys (LEAD_STANDBYS=<n>), under 7 GB, old exports over 100 MB. Never deletes.
cp=$(python3 -I "$TOOLS/capacity-watch.py" --state "$STATE_DIR" 2>&1); echo "$cp"; act=$((act + $(grep -c '^ACT' <<<"$cp"))); seen "$cp"
grep -qE '^(capacity |ACT   capacity)' <<<"$cp" || ACT "capacity: capacity-watch.py did not run ($(head -1 <<<"$cp"))"
fresh "capacity-watch.py: LEAD_STANDBYS from the Lead's list_sessions, the disk, /private/tmp (exports: read at most once an hour, time printed)"

# 2. Merges and the queue.
since=$(date -u -v-"${SINCE}"M '+%Y-%m-%dT%H:%M:%SZ')
merged=$(gh pr list --state merged --search "merged:>=$since" --json number,title -q '.[]|"#\(.number) \(.title[0:55])"')
# P-500: product progress counts only PRs that changed app code (by files changed); the rest are shown apart.
appm=$( [ -n "$merged" ] && echo "$merged" | bash "$TOOLS/app-code-prs.sh")
say "merged in ${SINCE} min: $(echo "$appm" | grep -c .) changed app code (P-500) · $(echo "$merged" | grep -c .) in all (records, docs, tooling, tests included)"; [ -n "$appm" ] && echo "$appm" | sed 's/^/      app  /'
prs=$(gh pr list --state open --limit 80 --json number,title,labels,isDraft,headRefName,statusCheckRollup,additions,deletions,createdAt)
fresh "GitHub: PRs merged in the window and open PRs (gh.sh)"
# ENF-761 part 3: only a REQUIRED check failing on a labelled PR's head is "red after approval" (an ACT); required = the
# ruleset's required status checks (REST, rules on main) plus ci; failures only in optional checks are one info line.
req=$(gh api "repos/{owner}/{repo}/rules/branches/main" --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | join(",")' 2>/dev/null)
echo "$prs" | python3 -I "$TOOLS/queue-red.py" --required "${req:-ci}" | tee "$STATE_DIR/q.txt"
act=$((act + $(grep -c '^ACT' "$STATE_DIR/q.txt"))); cat "$STATE_DIR/q.txt" >> "$SEEN"
# 2h. Merge-queue batches running (P-791 (2), founder 22 Nov: the Lead's by-hand merge of #2754 at 12:1x IST restarted 9
# batches): open mergify/ PRs whose checks are not finished, and what a by-hand merge would cost now. By-hand merges go
# through tools/lead-merge.sh <PR>, which refuses while a batch runs unless given --reason (P-791 (4)).
qb=$(python3 -I "$TOOLS/queue-batches.py" ${QB_PULLS:+--pulls "$QB_PULLS"} ${QB_CHECKS:+--checks "$QB_CHECKS"} 2>&1); say "$qb"
fresh "queue-batches.py: open mergify/ PRs and their check runs (gh.sh)"
# 2b. WIP against the caps (B204, P-745, founder 20 Nov: "enforceable and ... followed mandatory by the agents through the
# hooks"): items building (an open non-draft PR or a lane naming the item; lanes from the saved app view) against 8 and
# Built-not-Proven against 12; ACT over either cap and for each item building outside the open waves (waves.py wip);
# ENF-761 part 1: an ACT UNDER the caps too, when open-wave items wait with no lane or PR, or under 4 qa lanes run while
# items wait for qa ("ACT   capacity: ...", counted below with the rest).
gh pr list --state open --limit 200 --json number,title,body,isDraft,headRefName,createdAt,labels > "$STATE_DIR/prs-body.json" 2>/dev/null
wp=$(python3 -I "$TOOLS/waves.py" wip --prs "$STATE_DIR/prs-body.json" 2>&1); echo "$wp"; act=$((act + $(grep -c '^ACT' <<<"$wp"))); seen "$wp"
grep -qE '^(wip   |ACT   wip:)' <<<"$wp" || ACT "wip not counted: waves.py wip did not run ($(head -1 <<<"$wp")): fix design/waves.tsv or qa/CAPABILITIES.md"
fresh "waves.py wip: open PRs from GitHub (gh.sh), design/waves.tsv, the saved app view"
# 2c. Runs waiting for a machine (B206 part 1, P-751): only runs created under 6 h ago count; older queued runs are listed
# on one "stale" line, never counted, never cancelled (P-371). 20 Nov: "4 waiting" were runs queued since 12 Nov.
python3 -I "$TOOLS/runs-waiting.py" --save "$STATE_DIR/runs-waiting.json" ${RUNS_WAITING_JSON:+--runs "$RUNS_WAITING_JSON"} 2>&1 | tee -a "$SEEN"
fresh "runs-waiting.py: GitHub Actions runs"
# 2c2. The nightly (E1, P-772, P-651): one ACT when the newest finished scheduled nightly is not green (20 Nov: cancelled,
# 3 of 8 parts cut at 59 min; 19 Nov: failure; nothing said so), one when none started in 30 h. Read-only (P-371).
nw=$(python3 -I "$TOOLS/nightly-watch.py" 2>&1); echo "$nw"; act=$((act + $(grep -c '^ACT' <<<"$nw"))); seen "$nw"
fresh "nightly-watch.py: the scheduled nightly runs (gh.sh)"
# 2d. Proof and Lead-read waits (founder 20 Nov 23:1x IST, typed: "make them as a enforced rules and make them live"; STATE
# hand-over Lead 4 -> Lead 5 item (3)): a merged "Completes:" capability with no qa PR after 30 min (type /qa capability
# <id> into its qa lane), and an approved PR on a Lead-read path with no "Lead read the diff: <head>" (P-423), with its age.
fresh "proof-read-watch.py and human-sample.py (2e): GitHub PRs and qa files on origin/main"
pw=$(python3 -I "$TOOLS/proof-read-watch.py" 2>&1); echo "$pw"; act=$((act + $(grep -c '^ACT' <<<"$pw"))); seen "$pw"
hs=$(python3 -I "$TOOLS/human-sample.py" 2>&1); echo "$hs"; act=$((act + $(grep -c '^ACT' <<<"$hs"))); seen "$hs"   # 2e. P-782 (1): weekly human sample (ENF-782b): due, Needs you at 7 days, reopen on a "no"
# 2f. Flow buffer (P-800, ENF-798): each track board holds 2+ days, every open part names a lane, every Partial capability is on a board.
fb=$(python3 -I "$TOOLS/flow-buffer.py" 2>&1); echo "$fb"; act=$((act + $(grep -c '^ACT' <<<"$fb"))); seen "$fb"
fresh "flow-buffer.py: design/board-lead-a-*.md and board-lead-b-*.md (newest by date) and qa/CAPABILITIES.md on $(git rev-parse --abbrev-ref HEAD)"
# 2g. Wait targets at the 10-minute check (P-798, ENF-798): a question 10 min, approved not queued 20 min, a lane quiet
# 30 min with work left; sle-watch.py's MISS lines become ACT (known-failures.tsv reuses "ACT   SLE ").
# One ACT per target (Q, A, L, R, B) naming its PRs, the detail on "sle" lines; --dump feeds step-age.py (5c) approval times.
sl=$(python3 -I "$TOOLS/sle-watch.py" --grouped --dump "$STATE_DIR/sle.json" 2>&1); echo "$sl"; act=$((act + $(grep -c '^ACT' <<<"$sl"))); seen "$sl"
fresh "sle-watch.py: GitHub open PRs, their comments, label events and ci check runs; cockpit/history.jsonl for the board time"
# 2i. Retry-only passes (A348, founder 24 Nov): one ACT per suite that passed only on retry until a PR names its fix.
rw=$(python3 -I "$TOOLS/retry-watch.py" --state "$STATE_DIR" 2>&1); echo "$rw"; act=$((act + $(grep -c '^ACT' <<<"$rw"))); seen "$rw"
grep -qE '^(retry |ACT   retry)' <<<"$rw" || ACT "retry: retry-watch.py did not run ($(head -1 <<<"$rw"))"
fresh "retry-watch.py: CI's retry comments and the PRs naming a fix (gh.sh), what earlier checks found in $STATE_DIR"

# 2j. Same cause twice (A351 B1, founder 24 Nov): the second failed batch in 12 h with one suite's same FAIL line. Report only.
sc=$(python3 -I "$TOOLS/same-cause.py" --state "$STATE_DIR" 2>&1); echo "$sc"; act=$((act + $(grep -c '^ACT' <<<"$sc"))); seen "$sc"
grep -qE '^(same cause |ACT   same cause)' <<<"$sc" || ACT "same cause: same-cause.py did not run ($(head -1 <<<"$sc"))"
fresh "same-cause.py: failed ci runs of merge batches and their red parts' logs (GitHub; a finished run's log is read once)"

# 2h. Queue blocked by checks (ENF-758, P-757, P-758): while main's guards are red, or a merge batch failed or a PR was
# dequeued in 2 h, one ACT per open check-only PR (tests, CI, Mergify, guard tools) approved on its head with green ci: the
# Lead reads its diff, then merges it in the built-in browser (Lead 4, 23 Nov: never before the read). 20 Nov: #2435 and #2438 held the queue ~4 h, each red without the other.
qb=$(python3 -I "$TOOLS/queue-blocked.py" 2>&1); echo "$qb"; seen "$qb"; act=$((act + $(grep -c '^ACT' <<<"$qb")))
fresh "queue-blocked.py: GitHub open PRs, their comments and labels, and the guards and ci runs (gh)"

# 3. Questions for the tech lead in the window.
# One read of every comment since the window's start, for 3 and 3b (Lead 26, 24 Nov): it was two searches and one read per PR
# found, and a search can lag or stop at 30. Only open PRs count, as before; an unreadable answer is an ACT.
cm=$(gh api "repos/{owner}/{repo}/issues/comments?since=$since&per_page=100" --paginate -q ".[] | select(.created_at >= \"$since\") | {n: (.issue_url | split(\"/\") | last), b: .body} | @json" 2>/dev/null) || ACT "comments since $since unreadable: questions and lane reports (3, 3b) not read this check"
jq -e . >/dev/null 2>&1 <<<"${cm:-null}" || [ -z "$cm" ] || ACT "comments since $since cut short (a line of the answer is not whole): some questions and lane reports (3, 3b) may be missing this check"
asked() { grep . <<<"$cm" | jq -r --arg re "$1" 'select((.b // "") | test($re)) | .n' 2>/dev/null | sort -un | while read -r n; do
  # dropped only when the open-PR list was read and does not hold it; an unreadable list keeps every PR
  jq -e --argjson n "$n" 'type == "array" and length > 0 and (any(.[]; .number == $n) | not)' "$STATE_DIR/prs-body.json" >/dev/null 2>&1 || echo "$n"; done; }
for n in $(asked 'Question for the tech lead'); do ACT "#$n has a new question for the tech lead"; done
fresh "GitHub: comments since the window's start on open PRs, \"Question for the tech lead\" (gh.sh)"
# 3b. Lane reports to the Lead (A85, 15 Nov: board v61 reported "ready for Lead 54 to merge" on records PR #1796 at
# 11:19 IST and waited 1.5 h unseen across a hand-over). Any open PR comment in the window addressed to a Lead that is
# not a question, and any lane branch the Lead merges here (board/*) with commits not on this branch.
for n in $(asked '(?i)ready for (the )?(tech )?lead|for the (tech )?lead to merge|Lead [0-9]+ to merge'); do ACT "#$n has a lane report for the Lead (merge or publish it now)"; done
git fetch -q origin 2>/dev/null
here=$(git rev-parse --abbrev-ref HEAD)
for b in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/board/*' 'refs/remotes/origin/tools/*'); do
  n=$(git rev-list --count "$here..$b" 2>/dev/null)
  age=$(( ( $(date +%s) - $(git log -1 --format=%ct "$b") ) / 60 ))
  [ "${n:-0}" -gt 0 ] && [ "$age" -le 1440 ] && ACT "$b has $n commit(s) not on $here (last push ${age} min ago): merge, test, publish"
done
fresh "GitHub: the same comments, \"ready for Lead\" and the like; origin board/* and tools/* after git fetch"
# 3c. The "needs Lead" queue (P-611 (2), row G-1): LANE-REPORT first lines on open PRs and on #1796 (look-back 24 h,
# idempotent) go into product/state/items.json; open and not acked over 10 min = ACT (P-798), over 90 min = FOUNDER line. 3b stays the
# fallback for reports in free text. Ack with: python3 product/tools/items.py ack <id> --by "Lead N"; commit items.json.
bash "$TOOLS/lead-queue.sh" > "$STATE_DIR/queue.txt" 2>&1; cat "$STATE_DIR/queue.txt"; cat "$STATE_DIR/queue.txt" >> "$SEEN"
act=$((act + $(grep -c '^ACT' "$STATE_DIR/queue.txt")))
git diff --quiet -- "$TOOLS/../state/items.json" 2>/dev/null || say "queue items.json changed: commit it with the records (P-557)"
fresh "lead-queue.sh: LANE-REPORT lines on open PRs (GitHub), product/state/items.json"

# 3c (G-4 (5); ENF-761 part 5): branches ahead of main with no PR and no LANE-REPORT: one summary line, the list in
# $STATE_DIR/stale-branches.txt, an ACT only for a branch pushed in the last 24 h (branch-sweep.sh).
sw=$(SWEEP_STATE_DIR="$STATE_DIR" bash "$TOOLS/branch-sweep.sh" 2>&1); [ -n "$sw" ] && echo "$sw"; act=$((act + $(grep -c '^ACT' <<<"$sw"))); seen "$sw"
fresh "branch-sweep.sh: origin branches (git), open and merged PRs (GitHub), product/state/items.json"
# 4. Lanes alive: branches pushed in the last 90 minutes (a lane is working only if it pushed, lead skill).
git fetch -q origin 2>/dev/null
# 1b. Local lanes (founder, 8 Nov, P-420): a Mac lane that stops, or whose messages are paused, makes no GitHub signal.
# After the fetch, so "PRs merged since" reads today's main. Counted by its ACT lines (a crash adds none, and says so).
ll=$(bash "$TOOLS/local-lanes.sh" 2>&1); llrc=$?; [ -n "$ll" ] && echo "$ll"; seen "$ll"; lln=$(grep -c '^ACT' <<<"$ll")
[ "$llrc" != "$lln" ] && echo "warn  local-lanes.sh exit $llrc but $lln ACT line(s): read its output"
act=$((act + lln))
alive=$(git for-each-ref --sort=-committerdate --format='%(committerdate:unix) %(refname:short)' refs/remotes/origin \
  | awk -v t="$(date -u -v-90M +%s)" '$1>=t {print $2}' | grep -v -e 'origin/main' -e 'mergify/' -e 'origin/HEAD' -e '^origin$' | sed 's#origin/##')
say "lanes pushed in 90 min: $(echo "$alive" | grep -c .)"; [ -n "$alive" ] && echo "$alive" | head -12 | sed 's/^/      /'
fresh "origin after git fetch, local-lanes.sh"

# 4b. Wake on merge (24 Nov, design option A): an open PR whose "Waits on: #n" are all on main, with the words to type. Report only.
mw=$(python3 -I "$TOOLS/merge-wake.py" --prs "$STATE_DIR/prs-body.json" 2>&1); echo "$mw"; act=$((act + $(grep -c '^ACT' <<<"$mw"))); seen "$mw"
grep -qE '^(wake |ACT   wake)' <<<"$mw" || ACT "wake: merge-wake.py did not run ($(head -1 <<<"$mw"))"
fresh "merge-wake.py: main's merges and branch tips (fetched in step 4), open PRs read in 2b (gh.sh), the app view saved in step 10's file"

# 4c (OS-52, design/os-backlog.md; full-power #158): runs since the window's start that ended startup_failure ran no job (a
# broken workflow file, so its check never reports): one ACT per workflow.
sf=$(python3 -I "$TOOLS/startup-failures.py" --since "$since" 2>&1); sfrc=$?; echo "$sf"; seen "$sf"
act=$((act + $(grep -c '^ACT' <<<"$sf"))); [ "$sfrc" = 0 ] && grep -q '^startup failures: ' <<<"$sf" || ACT "startup failures: startup-failures.py did not run ($(tail -1 <<<"$sf"))"
fresh "startup-failures.py: GitHub Actions runs created since the window's start (gh.sh)"

# 5. The founder's five changes, kept (founder 4 Nov ~10:50 IST "Go, start now"; "Yes, two standby"): builders in the
# cloud, machine testing on GitHub, the Mac copy cap, and four numbers every check. A rule nobody measures drifts (the
# cloud-only rule of 1 Nov, P-224, was not followed for three days), so each is read from the machine, never from prose.
# Mac builders allowed: MAC_BUILDERS_OK (default: Builder 1, the infra lane, and Builder 8, QA-144) plus the two standby
# builders, whose copies are made only when a Lead hands them a row (wt-* folders outside .claude/worktrees).
# A builder works in its session's copy (.claude/worktrees/builder-N-xxxxxx) and in copies under that session's scratchpad
# (…claude-worktrees-builder-N-xxxxxx/…/wt-*): it counts as working when any of them changed its git index in 90 minutes.
ok=" ${MAC_BUILDERS_OK:-builder-1 builder-8} "; now=$(date +%s); busy=""
while read -r wt; do
  name=$(echo "$wt" | grep -oE 'builder-[0-9]+' | head -1); [ -n "$name" ] || continue
  t=$(stat -f %m "$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null)/index" 2>/dev/null || echo 0)
  [ $((now - t)) -le 5400 ] && busy="$busy $name"
done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
busy=$(echo "$busy" | tr ' ' '\n' | grep . | sort -u); macb=$(echo "$busy" | grep -c .)
for name in $busy; do case "$ok" in *" $name "*) ;; *) ACT "Mac builder still working: $name (finish its PR, then stop; new rows go to cloud builders)";; esac; done
copies=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '$9 ~ /:44[3-9][0-9]$/ {print $9}' | sort -u | grep -c .)
suites=$(pgrep -f 'tools/run-suites.sh' 2>/dev/null | grep -c .)
say "mac   builders working ${macb} · test copies ${copies} on 4430–4499 + ${suites} suite runs (cap 3) · load $(sysctl -n vm.loadavg | awk '{print $2}')"
fresh "git worktrees, lsof and pgrep on this machine; qa/CAPABILITIES.md from origin/main below; 5b flow-measure.py (GitHub, a cached answer only if under $FRESH_MAX_MIN min)"
[ $((copies + suites)) -gt 3 ] && ACT "Mac copy cap: $((copies + suites)) copies or suite runs (cap 3, qa first): the newest builder copy waits"
# The four numbers (founder target: 10 capabilities confirmed a day, quality never lowered).
# P-500: capabilities confirmed are counted across every active milestone (M2, M3, M4, T) on main, not M2 alone.
caps=$(git show origin/main:ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/CAPABILITIES.md 2>/dev/null)
works=$(echo "$caps" | grep -cE '^\| C[0-9]+\.[0-9]+ .*\| (M2|M3|M4|T) \| Works \|')
active=$(echo "$caps" | grep -cE '^\| C[0-9]+\.[0-9]+ .*\| (M2|M3|M4|T) \|')
bym=$(for m in M2 M3 M4 T; do t=$(echo "$caps" | grep -cE "^\| C[0-9]+\.[0-9]+ .*\| $m \|"); [ "$t" -gt 0 ] && printf '%s %s/%s ' "$m" "$(echo "$caps" | grep -cE "^\| C[0-9]+\.[0-9]+ .*\| $m \| Works \|")" "$t"; done)
day="$STATE_DIR/works-$(TZ=Asia/Kolkata date +%Y%m%d).txt"; [ -f "$day" ] || echo "$works" > "$day"
hour=$(gh pr list --state merged --search "merged:>=$(date -u -v-60M '+%Y-%m-%dT%H:%M:%SZ')" --json number -q '.[].number' 2>/dev/null | bash "$TOOLS/app-code-prs.sh" | grep -c .)
back=$(grep -cE '^ACT   #[0-9]+ (dequeued|red after approval)' "$STATE_DIR/q.txt")
say "four  Works on main ${works}/${active} (${bym% }) (+$((works - $(cat "$day"))) today, target +10) · app-code merges last hour ${hour:-?} · Mac builders ${macb} · approved then red or dequeued ${back}"
FLOW_TOKEN="${FLOW_TOKEN:-$(gh auth token 2>/dev/null)}" python3 -I "$TOOLS/flow-measure.py" --since today --lead 2>&1 | tee -a "$SEEN"   # 5b. ENF-782b (P-782 (3)): start→Proven, review rounds, first-time proof, reverse plan, queue bounces; answer cached 30 min
# 5c. Step age (P-798, ENF-798): a step older than twice its median today gets a builder added or moved (the same cached answer, as JSON).
FLOW_TOKEN="${FLOW_TOKEN:-$(gh auth token 2>/dev/null)}" python3 -I "$TOOLS/flow-measure.py" --since today --lead --json > "$STATE_DIR/flow.json" 2>/dev/null
sa=$(python3 -I "$TOOLS/step-age.py" --flow "$STATE_DIR/flow.json" --prs "$STATE_DIR/prs-body.json" --sle "$STATE_DIR/sle.json" 2>&1); echo "$sa"; act=$((act + $(grep -c '^ACT' <<<"$sa"))); seen "$sa"
fresh "step-age.py: flow-measure.py --lead --json (GitHub, a cached answer only if under $FRESH_MAX_MIN min), open PRs read in 2b (gh.sh), sle-watch's dump from 2g"

# 6. Private backup (P-589 (1), P-590): the backup repository's last push, read from GitHub (read-only here). Over 24 h:
# the Lead runs tools/backup-refresh.sh (needs allowed_domains github.com). Unreadable = said, never a silent pass.
o=$(git remote get-url origin 2>/dev/null); o=${o%.git}; o=${o#*github.com[:/]}   # owner/name of origin; backup = "<name>-backup"
bk=$(gh api "repos/${BACKUP_REPO:-${o}-backup}" -q .pushed_at 2>/dev/null)
ts=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$bk" +%s 2>/dev/null || date -u -d "$bk" +%s 2>/dev/null)
case "$ts" in   # empty, "null" (the curl fallback's jq -r) or any unparsable value is an ACT, never a silent pass
  ''|*[!0-9]*) ACT "backup: last push unreadable (${bk:-empty}): check the repository, then run tools/backup-refresh.sh";;
  *) age=$(( ( $(date -u +%s) - ts ) / 3600 )); say "backup last push ${age} h ago"
     [ "$age" -ge 24 ] && ACT "backup ${age} h old: run tools/backup-refresh.sh (allowed_domains github.com)";;
esac; fresh "GitHub: the backup repository's pushed_at"
# 6b. Private home sync (E13, P-678: "the Lead runs the sync at each check"): the one write this check makes, to
# github.com/expat-ready/private, its process group killed at 90 s; a refusal (a note holding a real secret), a failure or a timeout = ACT.
ps=$(python3 -I "$TOOLS/lead-upkeep.py" sync 2>&1); echo "$ps"; act=$((act + $(grep -c '^ACT' <<<"$ps"))); seen "$ps"
fresh "lead-upkeep.py sync: github.com/expat-ready/private (push)"

# 7. Records reach main (Lead 53, 15 Nov, founder A76: P-606's skill lines sat off main for 5 days and no check said so).
# The newest DECISIONS row and the next/qa skills on this Lead branch must be on origin/main; otherwise cloud builders and
# qa follow old rules. Each check ACTs until the records PR merges (a fresh lead/<today> branch, P-505 clean commit).
D=ai-workers/problem-1-pathway-setup-and-form-filling/product/DECISIONS.md
newest=$(git show HEAD:"$D" 2>/dev/null | grep -m1 -oE '^\| P-[0-9]+' | tr -d '| ')
onmain=$(git show origin/main:"$D" 2>/dev/null | grep -m1 -oE '^\| P-[0-9]+' | tr -d '| ')
skills_off=$(for f in .claude/skills/next/SKILL.md .claude/skills/qa/SKILL.md .claude/skills/lead/SKILL.md; do git diff --quiet origin/main HEAD -- "$f" 2>/dev/null || printf '%s ' "${f#.claude/skills/}"; done)
if [ -z "$newest" ] || [ -z "$onmain" ]; then ACT "records on main: DECISIONS unreadable (branch ${newest:-?}, main ${onmain:-?})"
elif [ "$newest" != "$onmain" ] || [ -n "$skills_off" ]; then ACT "records not on main: newest decision ${newest} here, ${onmain} on main; skills differing: ${skills_off:-none}; land the records PR now"
else say "records on main: ${onmain} and the skills match"; fi
fresh "DECISIONS.md and skills at HEAD ($(git rev-parse --abbrev-ref HEAD)) and origin/main after git fetch"

# 8. Library freshness (founder, 15 Nov: library masters kept current on need, token-efficient). Git history only, no
# document read: a living master whose feeds (cockpit/library.json) changed after it is behind; refresh only that one.
lib=$(python3 "$TOOLS/library-freshness.py" 2>&1); nb=$?
if [ "$nb" -gt 0 ]; then ACT "library: ${nb} master(s) behind: $(echo "$lib" | grep '^behind' | sed -E 's/^behind +//; s/: .*first [0-9a-f]+ at / since /; s/; refresh.*//' | paste -sd ';' -)"
else say "library: every living master current"; fi
fresh "git history (library-freshness.py)"
# 8b. Set-up conformance (CK-1, founder A151/A154, 17 Nov): origin/main against design/engineering-approved-setup.json
# (deny lines, hooks, Mergify queues); one ACT per failed item, and one ACT when the check could not run. Git only, US$0.
cf=$(python3 -I "$TOOLS/conformance-check.py" --quiet 2>&1); nf=$?
if [ "$nf" -gt 100 ] || ! grep -q '^enforced:' <<<"$cf"; then ACT "set-up check did not run (exit $nf): $(tail -1 <<<"$cf")"
else while IFS= read -r l; do ACT "set-up: ${l#FAIL }"; done < <(grep '^FAIL' <<<"$cf"); say "set-up $(tail -1 <<<"$cf")"; fi
fresh "conformance-check.py: origin/main against design/engineering-approved-setup.json"
od=$(python3 "$TOOLS/outside-deps-watch.py" 2>&1); echo "$od"; act=$((act + $(grep -c '^ACT' <<<"$od")))   # 9. Outside dependencies (B192, P-618): start window, stuck 48 h, blocked without decision date or fallback
seen "$od"
fresh "outside-deps-watch.py"

# 10. The app view (B197, founder A110, 16 Nov: "lead keep forgetting"; P-326, P-339): every lane on claude.ai/code, read in
# the built-in browser with tools/app-view.js and saved by "lead-watch.sh app-view-read" (it refuses a summary without rows=N,
# P-789 (2)). Over 15 min old = ACT (P-798); else one ACT per
# flagged session (need_input, blocked, failed, idle over 10 min with work left (P-798), context over 45%); cloud lanes idle
# or waiting for the Lead first, oldest first, marked "[idle lane N min ...]" (A334 fix 1).
av=$(bash "$TOOLS/app-view-check.sh" 2>&1); echo "$av"; act=$((act + $(grep -c '^ACT' <<<"$av")))
seen "$av"
fresh "product/state/app-view-latest.txt (app-view-check.sh)"
# 10b. The night checklist (A334 fix 1, A332 "Keep both"): product items, then operating-system items, one ACT for each
# not done (done = a PR number merged on main, never prose), and "operating system: n done of m". Data: design/night-checklist.json.
nc=$(python3 -I "$TOOLS/night-checklist.py" 2>&1); echo "$nc"; act=$((act + $(grep -c '^ACT' <<<"$nc"))); seen "$nc"
fresh "night-checklist.py: design/night-checklist.json and origin/main's merge subjects (fetched in step 4)"

# 10c. Lane clean-up list (A348, founder 24 Nov): sessions whose PRs have all merged; the Lead archives, nothing here does.
cl=$(python3 -I "$TOOLS/lane-cleanup.py" 2>&1); echo "$cl"; act=$((act + $(grep -c '^ACT' <<<"$cl"))); seen "$cl"
grep -qE '^(lanes to clean up|ACT   lane clean-up)' <<<"$cl" || ACT "lane clean-up list: lane-cleanup.py did not run ($(head -1 <<<"$cl"))"
fresh "lane-cleanup.py: git worktrees, main's merges (fetched in step 4) and the app view saved in step 10"

# 11. What the founder's board shows (B201, founder A117 16 Nov: the check missed six stuck items his board showed; P-639:
# never take the board's word blindly). The board's own Today card and Stuck panel (cockpit-data.py --watch reads the
# published data.json › first, built by first_screen: no second formula), one ACT per Stuck entry, then each checked against
# its source with data read above (open PRs of step 2, PRs merged in the window, qa's file on main of step 5). ~0.1 s.
# The board's data: COCKPIT_DATA, default the refresh's own output ($TMPDIR/cockpit/data.json, cockpit/README.md).
echo "$prs" > "$STATE_DIR/open-prs.json"; echo "$caps" > "$STATE_DIR/caps-main.md"
echo "$merged" | python3 -I -c 'import json,re,sys; print(json.dumps({m.group(1): "merged" for m in re.finditer(r"^#(\d+)", sys.stdin.read(), re.M)}))' > "$STATE_DIR/merged.json"
BOARD="${COCKPIT_DATA:-${TMPDIR:-/tmp}/cockpit/data.json}"   # ENF-803: a board answer over 10 min old is refused, not printed
if bc=$(fresh_cache "$BOARD" "the board's data.json"); then
bw=$(python3 "$TOOLS/cockpit-data.py" --watch "$BOARD" --open-prs "$STATE_DIR/open-prs.json" \
  --caps-main "$STATE_DIR/caps-main.md" --pr-states "$STATE_DIR/merged.json" 2>&1); echo "$bw"; act=$((act + $(grep -c '^ACT' <<<"$bw"))); seen "$bw"; echo "$bc"
else ACT "board: $bc (run the cockpit refresh, then the check)"; BOARD=/dev/null; fi

# 12. Known failures (B202, founder A119 16 Nov, P-639): every failure already met is one line of tools/known-failures.tsv,
# checked every time from what this check already read: size walls, records PRs, the proving pipe
# (Built waiting for qa vs qa lanes pushing) and the feeding pipe (ready rows per running builder, idle builders with no row).
# Lines already printed above (questions, approved then red, records off main (step 7), sle-watch, local lanes, the board's
# idle lanes) are counted, not repeated: say() and ACT() record every line in $SEEN. Keep 12 after every step it reuses.
kf_subj=$(for b in $alive; do printf '%s\t%s\n' "$b" "$(git log -1 --format=%s "origin/$b" 2>/dev/null)"; done)   # one git call per pushing branch
P_DIR="${D%/*}" KF_PRS="$prs" KF_ALIVE="$alive" KF_SUBJ="$kf_subj" KF_SEEN="$SEEN" KF_BOARD="$BOARD" \
python3 -I -c '
import json, os, time
from datetime import datetime, timezone
E = os.environ; P = E["P_DIR"]
size = lambda f: os.path.getsize(f) if os.path.exists(f) else None
try: prs = json.loads(E["KF_PRS"] or "null")
except ValueError: prs = None
try: board = json.load(open(E["KF_BOARD"]))
except (OSError, ValueError): board = None
subj = dict(l.split("\t", 1) for l in E["KF_SUBJ"].splitlines() if "\t" in l)
print(json.dumps({"now": datetime.now(timezone.utc).isoformat(), "files": {"RULES.md": size(P + "/RULES.md"), "STATE.md": size(P + "/STATE.md")},
  "prs": prs, "alive_subjects": subj, "board": board,
  "seen": open(E["KF_SEEN"]).read().splitlines()}))' > "$STATE_DIR/known-facts.json"
kf=$(python3 -I "$TOOLS/known-failures.py" --facts "$STATE_DIR/known-facts.json" 2>&1); echo "$kf"; act=$((act + $(grep -c '^ACT' <<<"$kf")))
fresh "this check's own reads above (known-facts.json) and tools/known-failures.tsv"

# 12b. Merge-queue depth (CI-SPEED-3, founder A254): queue-depth.py reads the last 20 batches; exit 3 = a change is due.
qd=$(python3 -I "$TOOLS/queue-depth.py" ${QUEUE_DEPTH_RUNS:+--runs "$QUEUE_DEPTH_RUNS"} ${QUEUE_DEPTH_MERGIFY:+--mergify "$QUEUE_DEPTH_MERGIFY"} 2>&1); qdr=$?; echo "$qd"; seen "$qd"; [ "$qdr" = 3 ] && ACT "queue depth: set max_parallel_checks to $(sed -nE '1s/.* want=([0-9]+) .*/\1/p' <<<"$qd") (rate $(sed -nE '1s/^rate=([0-9.]+)%.*/\1/p' <<<"$qd")% over last 20 batches)"
fresh "queue-depth.py: the last 20 merge-queue batches on GitHub"

# 13. Founder asks that are clicks (ENF-763, P-752/P-763): STATE's "For the founder", "Founder asks open" and "Needs you"
# entries that are a GitHub or claude.ai step; one ACT each (the Lead does it in the built-in browser and drops the ask).
fc=$(bash "$TOOLS/founder-click-guard.sh" --state "$TOOLS/../STATE.md" 2>&1); echo "$fc"; act=$((act + $(grep -c '^ACT' <<<"$fc"))); seen "$fc"
fresh "STATE.md on $(git rev-parse --abbrev-ref HEAD)"

tl=$(python3 -I "$TOOLS/cycle-timeline.py" 2>&1); echo "$tl"; act=$((act + $(grep -c '^ACT' <<<"$tl")))   # 14. Cycle timeline (A244, ENF-783b, P-783 (2)): every check
fresh "cycle-timeline.py"

# 13b. Ready rows per lane (E11, P-599 (1): at least two ready rows per lane at all times): the board's own count
# (data.json › backlog.by_lane) for the four /next lanes; one ACT per lane under two, an unread count is an ACT too.
lr=$(python3 -I "$TOOLS/owed-watch.py" lanes --board "$BOARD" 2>&1); echo "$lr"; act=$((act + $(grep -c '^ACT' <<<"$lr"))); seen "$lr"
fresh "owed-watch.py lanes: the board's data.json as step 11 accepted it (over 10 min old: /dev/null, an ACT here)"
# 13c. Starts owed (E19, founder 21 Nov, P-772): STATE sentences saying a start is owed at the founder's next typed turn
# (a cron or message turn cannot start sessions). One ACT listing them: raise them in his next turn and the push notification.
so=$(python3 -I "$TOOLS/owed-watch.py" starts --state "$TOOLS/../STATE.md" 2>&1); echo "$so"; act=$((act + $(grep -c '^ACT' <<<"$so"))); seen "$so"
fresh "owed-watch.py starts: STATE.md in this copy"

# 13d (OS-18, P-530): a red "Waiting on the founder" line atop STATE or in its Start here: one ACT to re-send the push once
# it has waited 30 min, then at most once an hour (founder-wait.py remembers each line in $STATE_DIR); a plain line between.
fw=$(python3 -I "$TOOLS/founder-wait.py" --state "$TOOLS/../STATE.md" --memory "$STATE_DIR/founder-wait.json" 2>&1); fwrc=$?; echo "$fw"; seen "$fw"
act=$((act + $(grep -c '^ACT' <<<"$fw"))); [ "$fwrc" = 0 ] && grep -qE '^(ACT   )?founder wait: ' <<<"$fw" || ACT "founder wait: founder-wait.py did not run ($(tail -1 <<<"$fw"))"
fresh "founder-wait.py: STATE.md in this copy, its memory in $STATE_DIR (13d)"

# 16. The focus list stays true (ENF-733b, founder A261): main's focus-list.md against qa's file on main (step 11's copy).
git show origin/main:ai-workers/problem-1-pathway-setup-and-form-filling/product/focus-list.md > "$STATE_DIR/focus-main.md" 2>/dev/null; ft=$(python3 -I "$TOOLS/focus-truth.py" --list "$STATE_DIR/focus-main.md" --caps "$STATE_DIR/caps-main.md" 2>&1); ftrc=$?; [ "$ftrc" = 1 ] && ACT "focus list: $(grep -c '^drop:' <<<"$ft") proven lines, $(grep -c '^missing:' <<<"$ft") Partial items missing (focus-truth.py --md)"; [ "$ftrc" -gt 1 ] && ACT "focus list not checked: $(tail -1 <<<"$ft")"
fresh "focus-truth.py: focus-list.md and qa/CAPABILITIES.md on origin/main (fetched in step 4; qa's file read in step 5, saved in step 11)"

# 15. The constraint (ENF-738, P-738; B206 part 4, P-751): the flow measured from tools each check (batch wall time and its
# longest part, runs waiting for a machine from step 2c, failed batches with culprit PRs, approved to merged, merges per hour,
# Proven today from the board), then the one current constraint with its measure and one action, as an ACT line. Last, so it
# reads what the steps above saved.
cs=$(python3 -I "$TOOLS/flow-constraint.py" --runs-waiting "$STATE_DIR/runs-waiting.json" --board "$BOARD" \
  --save "$STATE_DIR/constraint.json" ${FLOW_FACTS:+--facts "$FLOW_FACTS"} 2>&1); echo "$cs"; act=$((act + $(grep -c '^ACT' <<<"$cs")))
fresh "flow-constraint.py: ci runs, PRs and merges (gh.sh), runs-waiting.json from step 2c, the board as step 11 accepted it (over $FRESH_MAX_MIN min: not measured)"
echo "spent $((SECONDS - PRE_T0)) s in all · slowest early jobs: $(pre_seconds)"   # each step says its own seconds (2 s and more, at its stamp)
exit "$act"
