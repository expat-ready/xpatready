#!/usr/bin/env bash
# LR-175 (founder A455; Lead 13, 28 Nov): the lite check keeps the Lead alive when the GitHub budget is short. On 28 Nov
# at 15:25 and 15:28 IST both standbys raised the gap alarm (one push to the founder) because lean checks during the
# token outage wrote no stamp. This check costs under 50 REST requests (github-budget.tsv, lead-watch-lite; measured by
# github-meter.sh from the x-ratelimit headers) and gives the four things a Lead cannot go without:
#   the lab line (lab-progress.py, git only) · merges on main since the last check (git only) · questions for the tech
#   lead in the window · reads owed ("Ready for Lead read <sha>" in the last 24 h with no "Lead read" naming that sha,
#   on a PR not yet merged) — one read of the comments, at most 20 pages of 100, through gh.sh (the App token for reads).
# It writes the stall guard's stamp like the full check, and "lite" beside it (last-check-mode), so
# "lead-watch.sh gap" stays quiet while the Lead checks and names the mode. Exit = number of ACT lines.
#   bash lead-watch.sh lite [minutes since last check, default 30]      (also: lead-watch.sh --lite)
# lead-watch.sh runs it by itself when a full check would not fit the remaining budget (LR-174). Test: check-lead-watch-lite.sh.
set -uo pipefail
SINCE="${1:-30}"; case "$SINCE" in ''|*[!0-9]*) SINCE=30;; esac
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { bash "$TOOLS/gh.sh" "$@"; }
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 99
STATE_DIR="${LEAD_WATCH_STATE_DIR:-/private/tmp/claude-$(id -u)/lead-watch}"; mkdir -p "$STATE_DIR"
export GITHUB_METER_DIR="${GITHUB_METER_DIR:-$STATE_DIR/github-meter}"
act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }
ist() { TZ=Asia/Kolkata date -d "@$1" "+${2:-%H:%M} IST" 2>/dev/null || TZ=Asia/Kolkata date -r "$1" "+${2:-%H:%M} IST"; }
MS="$STATE_DIR/meter-lite.$$"; trap 'rm -f "$MS"' EXIT
bash "$TOOLS/github-meter.sh" start "$MS" 2>&1 | head -1
echo "time  $(TZ=Asia/Kolkata date '+%d %b %H:%M IST') · mode lite (LR-175): lab, merges, questions, reads owed; the full check when the budget allows"

# The stamp first, as the full check's step 0 (atomic; the standby never reads a half-written one), with its mode.
stamp="$STATE_DIR/last-check"; now=$(date +%s); last=""
[ -s "$stamp" ] && last=$(tr -d '\r\n' < "$stamp"); case "$last" in ''|*[!0-9]*) last="";; esac
if [ -n "$last" ] && [ $(( (now - last) / 60 )) -gt "${STALL_MAX:-15}" ]; then
  ACT "previous check ran $(( (now - last) / 60 )) min ago ($(ist "$last" '%d %b %H:%M')): checks were missed; tell the founder at once (P-388, P-389)"; fi
echo "$now" > "$stamp.$$" && mv -f "$stamp.$$" "$stamp"; echo lite > "$stamp-mode.$$" && mv -f "$stamp-mode.$$" "$stamp-mode"
from=${last:-$(( now - SINCE * 60 ))}   # the window: since the previous check, else the minutes given
# Questions: since the last check whose comments read was whole (a failed or capped read never moves it), so none is lost.
cok="$STATE_DIR/lite-comments-ok"; qfrom=$from; c0=$( { tr -cd '0-9' < "$cok"; } 2>/dev/null); [ -n "$c0" ] && [ "$c0" -lt "$qfrom" ] && qfrom=$c0

# Lab line and merges: git only (a fetch is not a REST request).
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 fetch -q origin 2>/dev/null || echo "note  origin not fetched: the lab line and merges are from the last fetch"
lab=$(python3 -I "$TOOLS/lab-progress.py" 2>&1 | head -1); echo "${lab:-🔴 lab: lab-progress.py gave nothing}"
merged=$(git log origin/main --first-parent --since="@$from" --format='%s' 2>/dev/null | sed -n 's/^Merge pull request #\([0-9]*\).*/#\1/p' | paste -sd ' ' -)
echo "merges since $(ist "$from"): $(wc -w <<<"$merged" | tr -d ' ')${merged:+ ($merged)}"
done_prs=$(git log origin/main --first-parent --since='48 hours ago' --format='%s' 2>/dev/null | sed -n 's/^Merge pull request #\([0-9]*\).*/\1/p' | sort -u)

# One read of the comments of the last 24 h: questions in the window and reads owed.
day=$(TZ=UTC date -d "@$(( now - 86400 ))" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || TZ=UTC date -r "$(( now - 86400 ))" '+%Y-%m-%dT%H:%M:%SZ')
win=$(TZ=UTC date -d "@$qfrom" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || TZ=UTC date -r "$qfrom" '+%Y-%m-%dT%H:%M:%SZ')
cm="$STATE_DIR/lite-comments.$$.jsonl"; : > "$cm"; trap 'rm -f "$MS" "$cm"' EXIT; ok=1; capped=0
for p in $(seq 1 "${LITE_MAX_PAGES:-20}"); do
  page=$(gh api "repos/{owner}/{repo}/issues/comments?since=$day&sort=created&direction=desc&per_page=100&page=$p" 2>/dev/null) || { ok=0; break; }
  n=$(jq 'length' <<<"$page" 2>/dev/null) || { ok=0; break; }
  jq -c '.[] | {n: (.issue_url | split("/") | last | tonumber), b: (.body // ""), t: .created_at}' <<<"$page" >> "$cm" 2>/dev/null
  [ "$n" -lt 100 ] && break
  [ "$p" = "${LITE_MAX_PAGES:-20}" ] && capped=1 && echo "note  comments: stopped at $p pages (budget), newest first; the oldest of the 24 h not read"
done
if [ "$ok" = 0 ]; then ACT "comments unreadable: questions and reads owed not read this check (lite)"
else
  for n in $(jq -r --arg w "$win" 'select(.t >= $w and (.b | test("Question for the tech lead"))) | .n' "$cm" | sort -un); do
    grep -qx "$n" <<<"$done_prs" || ACT "#$n has a new question for the tech lead"; done
  owed=$(python3 -I -c '
import json, re, sys
# The same grammar as the gate (lead-read-gate.sh, queue-blocked.py LEAD_READ): HTML comments and fenced blocks dropped,
# then * _ ` and CR; the ready line in its plain and bold forms ("Ready for Lead read and label: <sha>").
DROP = [re.compile(r"<!--[\s\S]*?(?:-->|\Z)"), re.compile(r"```[\s\S]*?(?:```|\Z)"), re.compile(r"~~~[\s\S]*?(?:~~~|\Z)")]
READY = re.compile(r"^[ \t]*ready for lead read(?: and label)?:?[ \t]+([0-9a-f]{40})\b", re.I | re.A)
LEAD_READ = re.compile(r"^[ \t\v\f]*lead read(?:: *ok| the diff:?)[ \t\v\f]+([0-9a-f]{40})[ \t\v\f]*\.?[ \t\v\f]*$", re.I | re.A)
ready, read = {}, set()
for l in open(sys.argv[1]):
    c = json.loads(l); b = c["b"]
    for d in DROP: b = d.sub("", b)
    for line in re.sub(r"[*_`\r]", "", b).split("\n"):
        if line.startswith(("    ", "\t")): continue
        m = READY.match(line)
        if m: ready[c["n"]] = (m.group(1).lower(), c["t"])
        m = LEAD_READ.match(line)
        if m: read.add((c["n"], m.group(1).lower()))
done = set(sys.argv[2].split())
for n, (sha, t) in sorted(ready.items()):
    if (n, sha) not in read and str(n) not in done: print(n, sha, t)' "$cm" "$done_prs")
  [ "$capped" = 0 ] && { echo "$now" > "$cok.$$" && mv -f "$cok.$$" "$cok"; }
  if [ -z "$owed" ]; then echo "reads owed: none in the last 24 h"
  else while read -r n sha t; do ACT "#$n waits for the Lead's read of $sha (Ready for Lead read at $t)"; done <<<"$owed"; fi
fi

ms=$(bash "$TOOLS/github-meter.sh" stop lead-watch-lite "$MS" 2>&1); echo "$ms"
gb=$(bash "$TOOLS/github-meter.sh" budget 2>&1) || ACT "github budget: $(grep '^FAIL' <<<"$gb" | sed 's/^FAIL  //' | paste -sd ';' -) (github-budget.tsv)"
exit "$act"
