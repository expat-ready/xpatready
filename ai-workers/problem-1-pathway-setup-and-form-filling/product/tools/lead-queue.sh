#!/bin/bash
# The "needs Lead" queue read for lead-watch (P-611 (2), row G-1). Reads comments whose first line is
#   LANE-REPORT: <ready|blocked|question|approval> <item-id>
# on open PRs updated in the window and on the records PR (LEAD_QUEUE_PR, default 1796), adds missing ones to
# product/state/items.json (tools/items.py ingest), then prints ACT for open un-acked items over 10 min (P-798; was 45) and FOUNDER over 90.
# Exit = number of ACT lines; a queue that cannot be read or written is an ACT too, never a quiet queue. Writes
# items.json only; the Lead commits it with the records (P-557). The look-back is 24 h by default, not the check
# window: ingest is idempotent, and a missed check or a hand-over gap must not drop a report (G-1 review).
# Usage: bash product/tools/lead-queue.sh [since, ISO UTC like 2026-11-15T07:00:00Z]     Test: check-items.sh
set -uo pipefail
TOOLS="$(cd "$(dirname "$0")" && pwd)"
since="${1:-$(python3 -I -c 'import datetime as d;print((d.datetime.now(d.timezone.utc)-d.timedelta(minutes=int(__import__("sys").argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "${LEAD_QUEUE_LOOKBACK_MIN:-1440}")}"
gh() { ${LEAD_QUEUE_GH:-bash "$TOOLS/gh.sh"} "$@"; }
tmp=$(mktemp "${TMPDIR:-/tmp}/lead-queue.XXXXXXXX") || exit 99; trap 'rm -f "$tmp"' EXIT
prs=$( { echo "${LEAD_QUEUE_PR:-1796}"; gh pr list --state open --limit 80 --search "updated:>=$since" --json number -q '.[].number'; } | grep -E '^[0-9]+$' | sort -un)
bad=0
for n in $prs; do gh pr view "$n" --json number,headRefName,comments >> "$tmp" || { echo "warn  lead-queue: could not read #$n"; bad=1; }; done
python3 -I -c '
import json,sys
out=[]; s=open(sys.argv[1]).read(); d=json.JSONDecoder(); i=0
while True:
    while i<len(s) and s[i].isspace(): i+=1
    if i>=len(s): break
    p,i=d.raw_decode(s,i)
    for c in p.get("comments") or []:
        out.append({"pr":p["number"],"branch":p.get("headRefName",""),"author":(c.get("author") or {}).get("login",""),
                    "created_at":c.get("createdAt",""),"body":c.get("body",""),"id":c.get("id") or c.get("url","")})
print(json.dumps(out))' "$tmp" > "$tmp.in" 2>&1 || { bad=1; head -3 "$tmp.in"; echo '[]' > "$tmp.in"; }
ing=$(python3 -I "$TOOLS/items.py" ingest --since "$since" < "$tmp.in" 2>&1) || bad=1; rm -f "$tmp.in"
echo "$ing" | sed 's/^/queue /'
out=$(python3 -I "$TOOLS/items.py" watch --act "${LEAD_QUEUE_ACT:-10}" --founder "${LEAD_QUEUE_FOUNDER:-90}" 2>&1); rc=$?
[ -n "$out" ] && echo "$out"; n=$(grep -c '^ACT' <<<"$out")
[ "$rc" = "$n" ] || bad=1   # a crash also exits 1: only an exit equal to the ACT count is a clean read
[ "$bad" = 1 ] && { echo "ACT   queue: a PR or items.json could not be read (lines above); the needs-Lead queue may be missing reports: fix it, run again"; n=$((n + 1)); }
exit "$n"
