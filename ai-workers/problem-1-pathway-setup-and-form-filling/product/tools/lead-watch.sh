#!/bin/bash
# Lead watch (founder, 3 Nov): one call per check gives the tech lead resources, merges and lanes in a few lines.
# Read-only. Pairs with get_usage (weekly plan, context) and list_sessions, which only the Lead's tools can read.
# Exit code = number of ACT lines (0 = nothing to act on). Skill: .claude/skills/lead-watch.
# Usage: bash product/tools/lead-watch.sh [minutes since last check, default 30]
set -uo pipefail
SINCE="${1:-30}"
# gh through gh.sh: on a TLS failure the same reads go through curl with gh auth token (P-363; founder, 6 Nov).
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { bash "$TOOLS/gh.sh" "$@"; }
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 99
STATE_DIR="/private/tmp/claude-$(id -u)/lead-watch"; mkdir -p "$STATE_DIR"
act=0; say() { echo "$1"; }; ACT() { act=$((act+1)); echo "ACT   $1"; }

say "time  $(TZ=Asia/Kolkata date '+%d %b %H:%M IST')"

# 0. Stall guard (founder, 7 Nov, P-388): the previous check must have run. Lead 24 stalled ~7.4 h on one prompt and no
# check fired. Checks run every 30 min; a gap over 40 min (30 + 10 grace, P-389) means a check was missed: tell the
# founder at once. The standby's lead-heartbeat.sh reads the same stamp while this Lead is stuck.
if [ "${1:-}" = "app-view-read" ]; then mkdir -p "$STATE_DIR"; { date +%s; echo "${2:-read}"; } > "$STATE_DIR/app-view-read"; echo "app view read recorded"; exit 0; fi
if [ "${1:-}" = "context-read" ]; then mkdir -p "$STATE_DIR"; { date +%s; echo "${2:-read}"; } > "$STATE_DIR/context-read"; echo "context read recorded"; exit 0; fi
stamp="$STATE_DIR/last-check"; now=$(date +%s)
if [ -s "$stamp" ]; then last=$(cat "$stamp"); gap=$(( (now - last) / 60 ))
  [ "$gap" -gt 40 ] && ACT "previous check ran ${gap} min ago ($(TZ=Asia/Kolkata date -r "$last" '+%d %b %H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -d "@$last" '+%d %b %H:%M IST')): checks were missed; tell the founder at once (P-388, P-389)"
fi
echo "$now" > "$stamp.$$" && mv -f "$stamp.$$" "$stamp"   # atomic: the standby never reads a half-written stamp

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
# 1b (Lead 70, 16 Nov: 8.7 GB of interrupted-fetch temp packs filled the disk unseen). Temp packs older than 30 min
# belong to no running git process: delete them every check, and say how much was freed. Under 10 GB free is an ACT.
gd=$(git rev-parse --git-common-dir 2>/dev/null)
if [ -n "$gd" ]; then
  tp=$(find "$gd/objects/pack" -maxdepth 1 -name 'tmp_pack_*' -mmin +30 2>/dev/null)
  if [ -n "$tp" ]; then kb=$(du -ck $tp 2>/dev/null | tail -1 | cut -f1); rm -f $tp; say "disk  deleted $(echo "$tp" | grep -c .) stale git temp pack(s), $((kb/1024)) MB"; free=$(df -g / | awk 'NR==2 {print $4}'); fi
fi
[ "$free" -lt 10 ] && ACT "disk ${free} GB free, under 10 GB: free space now (temp packs, idle test databases, kept worktrees via get_storage_usage)"

# 2. Merges and the queue.
since=$(date -u -v-"${SINCE}"M '+%Y-%m-%dT%H:%M:%SZ')
merged=$(gh pr list --state merged --search "merged:>=$since" --json number,title -q '.[]|"#\(.number) \(.title[0:55])"')
# P-500: product progress counts only PRs that changed app code (by files changed); the rest are shown apart.
appm=$( [ -n "$merged" ] && echo "$merged" | bash "$TOOLS/app-code-prs.sh")
say "merged in ${SINCE} min: $(echo "$appm" | grep -c .) changed app code (P-500) · $(echo "$merged" | grep -c .) in all (records, docs, tooling, tests included)"; [ -n "$appm" ] && echo "$appm" | sed 's/^/      app  /'
# 2b (Lead 70, 16 Nov: nothing merged 21:32-23:00 while 68 runs waited for test machines, unseen for 90 min).
# Jam alarms: no merge to main in 60 min while PRs are queued, and Actions runs waiting for machines.
last_m=$(git log -1 --format=%ct origin/main 2>/dev/null || echo 0); mgap=$(( ($(date +%s) - last_m) / 60 ))
qd=$(curl -s -H "Authorization: token $(gh auth token 2>/dev/null)" "https://api.github.com/repos/$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')/actions/runs?status=queued&per_page=1" | python3 -I -c 'import json,sys
try: print(json.load(sys.stdin).get("total_count","?"))
except Exception: print("?")')
say "jam   last merge to main ${mgap} min ago · Actions runs waiting for a machine: ${qd}"
[ "$mgap" -gt 60 ] && ACT "nothing merged to main for ${mgap} min: read the merge-queue draft's checks, re-run a failed part, split or dequeue the culprit"
case "$qd" in ''|*[!0-9]*) ;; *) [ "$qd" -gt 30 ] && ACT "CI jam: ${qd} runs waiting for a machine (40 jobs at once): ready PRs still being worked on go back to draft until Approve";; esac
prs=$(gh pr list --state open --limit 80 --json number,title,labels,isDraft,headRefName,statusCheckRollup)
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
act=$((act + $(grep -c '^ACT' "$STATE_DIR/q.txt")))

# 3. Questions for the tech lead in the window.
qs=$(gh search prs --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" --state open "Question for the tech lead" --json number -q '.[].number' 2>/dev/null)
for n in $qs; do
  hit=$(gh pr view "$n" --json comments -q "[.comments[]|select(.createdAt>=\"$since\")|select(.body|test(\"Question for the tech lead\"))]|length")
  [ "${hit:-0}" -gt 0 ] && ACT "#$n has a new question for the tech lead"
done
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
# 3b (G-4 (5)): every branch ahead of main with no open PR and no LANE-REPORT, whatever its prefix.
sw=$(bash "$TOOLS/branch-sweep.sh" 2>&1); [ -n "$sw" ] && echo "$sw"; act=$((act + $(grep -c '^ACT' <<<"$sw")))
# 3c. The "needs Lead" queue (P-611 (2), row G-1): LANE-REPORT first lines on open PRs and on #1796 (look-back 24 h,
# idempotent) go into product/state/items.json; open and not acked over 45 min = ACT, over 90 min = FOUNDER line. 3b stays the
# fallback for reports in free text. Ack with: python3 product/tools/items.py ack <id> --by "Lead N"; commit items.json.
bash "$TOOLS/lead-queue.sh" > "$STATE_DIR/queue.txt" 2>&1; cat "$STATE_DIR/queue.txt"
act=$((act + $(grep -c '^ACT' "$STATE_DIR/queue.txt")))
git diff --quiet -- "$TOOLS/../state/items.json" 2>/dev/null || say "queue items.json changed: commit it with the records (P-557)"

# 4. Lanes alive: branches pushed in the last 90 minutes (a lane is working only if it pushed, lead skill).
git fetch -q origin 2>/dev/null
# 1b. Local lanes (founder, 8 Nov, P-420): a Mac lane that stops, or whose messages are paused, makes no GitHub signal.
# After the fetch, so "PRs merged since" reads today's main. Counted by its ACT lines (a crash adds none, and says so).
ll=$(bash "$TOOLS/local-lanes.sh" 2>&1); llrc=$?; [ -n "$ll" ] && echo "$ll"; lln=$(grep -c '^ACT' <<<"$ll")
[ "$llrc" != "$lln" ] && echo "warn  local-lanes.sh exit $llrc but $lln ACT line(s): read its output"
act=$((act + lln))
alive=$(git for-each-ref --sort=-committerdate --format='%(committerdate:unix) %(refname:short)' refs/remotes/origin \
  | awk -v t="$(date -u -v-90M +%s)" '$1>=t {print $2}' | grep -v -e 'origin/main' -e 'mergify/' -e 'origin/HEAD' -e '^origin$' | sed 's#origin/##')
say "lanes pushed in 90 min: $(echo "$alive" | grep -c .)"; [ -n "$alive" ] && echo "$alive" | head -12 | sed 's/^/      /'

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
say "plan  $(python3 "$TOOLS/plan-watch.py" --summary 2>/dev/null | head -1) (P-690: one action list, work it in bucket order)"

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

# 8. Library freshness (founder, 15 Nov: library masters kept current on need, token-efficient). Git history only, no
# document read: a living master whose feeds (cockpit/library.json) changed after it is behind; refresh only that one.
lib=$(python3 "$TOOLS/library-freshness.py" 2>&1); nb=$?
if [ "$nb" -gt 0 ]; then ACT "library: ${nb} master(s) behind: $(echo "$lib" | grep '^behind' | sed -E 's/^behind +//; s/: .*first [0-9a-f]+ at / since /; s/; refresh.*//' | paste -sd ';' -)"
else say "library: every living master current"; fi

# 9. Wait-time targets (founder 18:4x IST 15 Nov, A92 steps 1-2; design/rule-enforcement-research-2026-11-15.md): a
# question to the tech lead answered in 30 min, approved to queued in 30 min (with the cause named), a lane active every
# 90 min. Each MISS is an ACT line, fixed in this check; "due" and "wait" lines are shown. Test: check-sle-watch.sh.
while IFS= read -r l; do
  case "$l" in MISS*) ACT "SLE ${l#MISS  }";; due*|wait*) say "sle   ${l#* }";; ok*) say "sle   every wait-time target met";; esac
done < <(python3 -I "$TOOLS/sle-watch.py" 2>/dev/null)

# 10. App view (P-339b, founder 22:1x IST 18 Nov: "if they don't report, then there was a backup decision ... use the
# browser"): cloud lanes never report back and GitHub shows nothing while one waits on a question or has failed, so each
# check reads claude.ai/code in the built-in browser with tools/app-view.js, acts on every Waiting, Failed or quiet lane,
# then records the read with `bash tools/lead-watch.sh app-view-read "<one-line summary>"`. A read older than 35 min is an ACT.
av="$STATE_DIR/app-view-read"
if [ -s "$av" ]; then avt=$(head -1 "$av"); avg=$(( (now - avt) / 60 ))
  if [ "$avg" -gt 35 ]; then ACT "app view not read for ${avg} min (P-339b): read claude.ai/code with tools/app-view.js in the built-in browser, act on Waiting/Failed/quiet lanes, then run lead-watch.sh app-view-read"
  else say "app   read ${avg} min ago: $(sed -n 2p "$av")"; fi
else ACT "app view never recorded (P-339b): read claude.ai/code with tools/app-view.js in the built-in browser, then run lead-watch.sh app-view-read"; fi

# 11. Context of every running Mac session (P-565 (2), founder A193 19 Nov 08:2x IST: "Is it not enforced?"; a builder
# reached 62% unseen). Only get_usage can read another session's context, so each check runs get_usage on every running
# Mac session (list_sessions), asks for a hand-over at 45% and replaces at 50%, then records the read with
# `bash tools/lead-watch.sh context-read "<name pct, ...>"`. A read older than 35 min is an ACT.
cr="$STATE_DIR/context-read"
if [ -s "$cr" ]; then crt=$(head -1 "$cr"); crg=$(( (now - crt) / 60 ))
  if [ "$crg" -gt 35 ]; then ACT "session context not read for ${crg} min (P-565 (2)): get_usage on every running Mac session; 45% hand-over, 50% replace; then lead-watch.sh context-read"
  else say "ctx   read ${crg} min ago: $(sed -n 2p "$cr")"; fi
else ACT "session context never recorded (P-565 (2)): get_usage on every running Mac session; 45% hand-over, 50% replace; then lead-watch.sh context-read"; fi

exit "$act"
