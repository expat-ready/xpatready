#!/bin/bash
# Lead watch (founder, 3 Nov): one call per check gives the tech lead resources, merges and lanes in a few lines.
# Read-only. Pairs with get_usage (weekly plan, context) and list_sessions, which only the Lead's tools can read.
# Exit code = number of ACT lines (0 = nothing to act on). Skill: .claude/skills/lead-watch.
# Usage: bash product/tools/lead-watch.sh [minutes since last check, default 30]
#        bash product/tools/lead-watch.sh app-view-read <<'EOF' (app-view.js's answer) EOF   saves the app view (step 10)
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
STATE_DIR="/private/tmp/claude-$(id -u)/lead-watch"; mkdir -p "$STATE_DIR"
act=0; say() { echo "$1"; echo "$1" >> "$SEEN"; }; ACT() { act=$((act+1)); echo "ACT   $1"; echo "ACT   $1" >> "$SEEN"; }
SEEN="$STATE_DIR/seen.$$"; : > "$SEEN"; seen() { printf '%s\n' "$1" >> "$SEEN"; }; trap 'rm -f "$SEEN"' EXIT   # B202: lines step 12 reuses
. "$TOOLS/fresh-lib.sh"   # ENF-803 (P-803): every section says when and from where it read; cached answers over 10 min refused

say "time  $(TZ=Asia/Kolkata date '+%d %b %H:%M IST')"

# 0. Stall guard (founder, 7 Nov, P-388): the previous check must have run. Lead 24 stalled ~7.4 h on one prompt and no
# check fired. Checks run every 30 min; a gap over 40 min (30 + 10 grace, P-389) means a check was missed: tell the
# founder at once. The standby's lead-heartbeat.sh reads the same stamp while this Lead is stuck.
stamp="$STATE_DIR/last-check"; now=$(date +%s)
if [ -s "$stamp" ]; then last=$(cat "$stamp"); gap=$(( (now - last) / 60 ))
  [ "$gap" -gt 40 ] && ACT "previous check ran ${gap} min ago ($(TZ=Asia/Kolkata date -r "$last" '+%d %b %H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -d "@$last" '+%d %b %H:%M IST')): checks were missed; tell the founder at once (P-388, P-389)"
fi
echo "$now" > "$stamp.$$" && mv -f "$stamp.$$" "$stamp"   # atomic: the standby never reads a half-written stamp
fresh "the clock and $stamp"

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

# 2. Merges and the queue.
since=$(date -u -v-"${SINCE}"M '+%Y-%m-%dT%H:%M:%SZ')
merged=$(gh pr list --state merged --search "merged:>=$since" --json number,title -q '.[]|"#\(.number) \(.title[0:55])"')
# P-500: product progress counts only PRs that changed app code (by files changed); the rest are shown apart.
appm=$( [ -n "$merged" ] && echo "$merged" | bash "$TOOLS/app-code-prs.sh")
say "merged in ${SINCE} min: $(echo "$appm" | grep -c .) changed app code (P-500) · $(echo "$merged" | grep -c .) in all (records, docs, tooling, tests included)"; [ -n "$appm" ] && echo "$appm" | sed 's/^/      app  /'
prs=$(gh pr list --state open --limit 80 --json number,title,labels,isDraft,headRefName,statusCheckRollup,additions,deletions,createdAt)
fresh "GitHub: PRs merged in the window and open PRs (gh.sh)"
echo "$prs" | python3 -I -c '
import json,sys
prs=[p for p in json.load(sys.stdin) if not p["headRefName"].startswith("mergify/")]
L=lambda p:[l["name"] for l in p["labels"]]
red=lambda p:any(c.get("conclusion")=="FAILURE" for c in p["statusCheckRollup"] or [])
q=[p for p in prs if "queued" in L(p)]
deq=[p for p in prs if "dequeued" in L(p)]
appr=[p for p in prs if "review: approved" in L(p) and "queued" not in L(p) and "dequeued" not in L(p)]
rl=[p for p in prs if "review: approved" in L(p) and red(p)]
print("queue %d queued · %d approved not queued · %d open without label" % (len(q),len(appr),len([p for p in prs if not L(p) and not p["isDraft"]])))
for p in deq: print("ACT   #%d dequeued: owner merges main or fixes (%s)" % (p["number"],p["title"][:50]))
for p in rl:  print("ACT   #%d red after approval (%s)" % (p["number"],p["title"][:50]))
' | tee "$STATE_DIR/q.txt"
act=$((act + $(grep -c '^ACT' "$STATE_DIR/q.txt"))); cat "$STATE_DIR/q.txt" >> "$SEEN"
# 2b. WIP against the caps (B204, P-745, founder 20 Nov: "enforceable and ... followed mandatory by the agents through the
# hooks"): items building (an open non-draft PR or a lane naming the item; lanes from the saved app view) against 8 and
# Built-not-Proven against 12; ACT over either cap and for each item building outside the open waves (waves.py wip).
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

# 3. Questions for the tech lead in the window.
qs=$(gh search prs --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" --state open "Question for the tech lead" --json number -q '.[].number' 2>/dev/null)
for n in $qs; do
  hit=$(gh pr view "$n" --json comments -q "[.comments[]|select(.createdAt>=\"$since\")|select(.body|test(\"Question for the tech lead\"))]|length")
  [ "${hit:-0}" -gt 0 ] && ACT "#$n has a new question for the tech lead"
done
fresh "GitHub: open PRs with "Question for the tech lead" and their comments (gh.sh)"
# 3b. Lane reports to the Lead (A85, 15 Nov: board v61 reported "ready for Lead 54 to merge" on records PR #1796 at
# 11:19 IST and waited 1.5 h unseen across a hand-over). Any open PR comment in the window addressed to a Lead that is
# not a question, and any lane branch the Lead merges here (board/*) with commits not on this branch.
rs=$(gh search prs --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" --state open "ready for Lead" --json number -q '.[].number' 2>/dev/null)
for n in $rs; do
  hit=$(gh pr view "$n" --json comments -q "[.comments[]|select(.createdAt>=\"$since\")|select(.body|test(\"(?i)ready for (the )?(tech )?lead|for the (tech )?lead to merge|Lead [0-9]+ to merge\"))]|length")
  [ "${hit:-0}" -gt 0 ] && ACT "#$n has a lane report for the Lead (merge or publish it now)"
done
git fetch -q origin 2>/dev/null
here=$(git rev-parse --abbrev-ref HEAD)
for b in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/board/*' 'refs/remotes/origin/tools/*'); do
  n=$(git rev-list --count "$here..$b" 2>/dev/null)
  age=$(( ( $(date +%s) - $(git log -1 --format=%ct "$b") ) / 60 ))
  [ "${n:-0}" -gt 0 ] && [ "$age" -le 1440 ] && ACT "$b has $n commit(s) not on $here (last push ${age} min ago): merge, test, publish"
done
fresh "GitHub: open PRs with "ready for Lead" and their comments; origin board/* and tools/* after git fetch"
# 3c. The "needs Lead" queue (P-611 (2), row G-1): LANE-REPORT first lines on open PRs and on #1796 (look-back 24 h,
# idempotent) go into product/state/items.json; open and not acked over 10 min = ACT (P-798), over 90 min = FOUNDER line. 3b stays the
# fallback for reports in free text. Ack with: python3 product/tools/items.py ack <id> --by "Lead N"; commit items.json.
bash "$TOOLS/lead-queue.sh" > "$STATE_DIR/queue.txt" 2>&1; cat "$STATE_DIR/queue.txt"; cat "$STATE_DIR/queue.txt" >> "$SEEN"
act=$((act + $(grep -c '^ACT' "$STATE_DIR/queue.txt")))
git diff --quiet -- "$TOOLS/../state/items.json" 2>/dev/null || say "queue items.json changed: commit it with the records (P-557)"
fresh "lead-queue.sh: LANE-REPORT lines on open PRs (GitHub), product/state/items.json"

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
# flagged session (need_input, blocked, failed, idle over 10 min with work left (P-798), context over 45%).
av=$(bash "$TOOLS/app-view-check.sh" 2>&1); echo "$av"; act=$((act + $(grep -c '^ACT' <<<"$av")))
seen "$av"
fresh "product/state/app-view-latest.txt (app-view-check.sh)"

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

# 16. The focus list stays true (ENF-733b, founder A261): main's focus-list.md against qa's file on main (step 11's copy).
git show origin/main:ai-workers/problem-1-pathway-setup-and-form-filling/product/focus-list.md > "$STATE_DIR/focus-main.md" 2>/dev/null; ft=$(python3 -I "$TOOLS/focus-truth.py" --list "$STATE_DIR/focus-main.md" --caps "$STATE_DIR/caps-main.md" 2>&1); ftrc=$?; [ "$ftrc" = 1 ] && ACT "focus list: $(grep -c '^drop:' <<<"$ft") proven lines, $(grep -c '^missing:' <<<"$ft") Partial items missing (focus-truth.py --md)"; [ "$ftrc" -gt 1 ] && ACT "focus list not checked: $(tail -1 <<<"$ft")"
fresh "focus-truth.py: focus-list.md and qa/CAPABILITIES.md on origin/main (fetched in step 4; qa's file read in step 5, saved in step 11)"

exit "$act"
