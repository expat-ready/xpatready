#!/bin/bash
# The "needs Lead" queue read for lead-watch (P-611 (2), row G-1). Reads comments whose first line is
#   LANE-REPORT: <ready|blocked|question|approval> <item-id>
# on open PRs updated in the window and on the records PR (LEAD_QUEUE_PR, default 1796), adds missing ones to
# product/state/items.json (tools/items.py ingest), then prints ACT for open un-acked items over 45 min and FOUNDER over 90.
# Exit = number of ACT lines. Writes items.json only; the Lead commits it with the records (P-557).
# Usage: bash product/tools/lead-queue.sh <since, ISO UTC like 2026-11-15T07:00:00Z>     Test: check-items.sh
set -uo pipefail
TOOLS="$(cd "$(dirname "$0")" && pwd)"
since="${1:?usage: lead-queue.sh <since ISO UTC>}"
gh() { ${LEAD_QUEUE_GH:-bash "$TOOLS/gh.sh"} "$@"; }
tmp=$(mktemp "${TMPDIR:-/tmp}/lead-queue.XXXXXXXX") || exit 99; trap 'rm -f "$tmp"' EXIT
prs=$( { echo "${LEAD_QUEUE_PR:-1796}"; gh pr list --state open --limit 80 --search "updated:>=$since" --json number -q '.[].number'; } | grep -E '^[0-9]+$' | sort -un)
for n in $prs; do gh pr view "$n" --json number,headRefName,comments >> "$tmp" || echo "warn  lead-queue: could not read #$n" >&2; done
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
print(json.dumps(out))' "$tmp" | python3 -I "$TOOLS/items.py" ingest --since "$since" | sed 's/^/queue /'
python3 -I "$TOOLS/items.py" watch --act "${LEAD_QUEUE_ACT:-45}" --founder "${LEAD_QUEUE_FOUNDER:-90}"
