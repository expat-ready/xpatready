#!/bin/bash
# lead-pr.sh — two routine tech-lead PR steps, each guarded in code (founder, 20 Nov 10:2x IST: "Yes, add the rule"; Lead 100).
#   reopen <n>            close and reopen PR <n> so its pull_request checks (pr-rules) run fresh on a new merge commit
#                         (as Lead 98 did for #2307). Refused for a merged or already-closed PR.
#   approve-records <n>   post "Reviewer: Approve <head>" and add `review: approved` to a records-only PR (P-385).
#                         Refused unless records-only.sh says every changed file is a record, the PR's branch is a
#                         lead/* branch, and its CI checks are not red. A PR touching code or tools never passes here.
#   label <n>             add `review: approved` (ENF-783a, P-783 (1); P-385, P-318): refused unless the PR is open and
#                         ready, a comment by someone with write access (OWNER, MEMBER, COLLABORATOR; never a bot) has
#                         a line "Reviewer: Approve <the head's full 40-character SHA>", no check on the head is red,
#                         and review-rounds.py says the PR is within its review-round limit (P-293).
#   requeue <n>           post a bare "@mergifyio requeue" (ENF-783a; unblock playbook 1-2): refused unless the PR is
#                         open, carries `review: approved`, is not `queued` (never into a running batch), and a
#                         write-access comment has a "Batch failures covered:" line (P-731 (2)).
# GitHub is read and written through the REST API with `gh auth token` (gh's own TLS fails in the sandbox, P-363).
set -euo pipefail
REPO=expat-ready/xpatready; API=https://api.github.com/repos/$REPO
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(gh auth token); H=(-s -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json")
die() { echo "lead-pr: $*" >&2; exit 1; }
pr() { curl "${H[@]}" "$API/pulls/$1"; }
field() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
USAGE="usage: lead-pr.sh reopen|approve-records|label|requeue <pr number>"
n="${2:-}"; [[ "$n" =~ ^[0-9]+$ ]] || die "$USAGE"
# Comments travel in files, never in environment variables: Linux refuses one over 128 KiB (#2749 review M2).
W=$(mktemp -d "${TMPDIR:-/tmp}/lead-pr.XXXXXX"); trap 'rm -rf "$W"' EXIT
comments() {  # every comment of PR $1 into the file $W/comments.json (fails closed: an unreadable page stops the step)
  local p=1 n
  echo '[]' > "$W/comments.json"
  while :; do
    curl "${H[@]}" "$API/issues/$1/comments?per_page=100&page=$p" > "$W/page.json" || die "#$1 comments unreadable"
    n=$(python3 -I -c "
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2])); assert isinstance(b, list)
json.dump(a + b, open(sys.argv[1], 'w')); print(len(b))" "$W/comments.json" "$W/page.json") || die "#$1 comments unreadable"
    [ "$n" -lt 100 ] && break
    p=$((p + 1)); [ "$p" -le 20 ] || die "#$1 has 2000+ comments: read it by hand"
  done; }
# team_line <python regex>: login of the newest write-access, non-bot comment in $W/comments.json with a matching line
team_line() { RX="$1" python3 -I -c '
import json, os, re, sys
rx = re.compile(os.environ["RX"], re.I | re.M); hit = ""
for c in json.load(open(sys.argv[1])):
    u = c.get("user") or {}
    if u.get("type") == "Bot" or u.get("login", "").endswith("[bot]"): continue
    if c.get("author_association") not in ("OWNER", "MEMBER", "COLLABORATOR"): continue
    if rx.search(re.sub(r"[*_`]", "", c.get("body") or "")): hit = u.get("login", "?")
print(hit)' "$W/comments.json"; }
case "${1:-}" in
  reopen)
    st=$(pr "$n" | field "d['state']+' '+str(d['merged'])")
    [ "$st" = "open False" ] || die "#$n is not an open, unmerged PR ($st)"
    curl "${H[@]}" -X PATCH "$API/pulls/$n" -d '{"state":"closed"}' >/dev/null; sleep 3
    st=$(curl "${H[@]}" -X PATCH "$API/pulls/$n" -d '{"state":"open"}' | field "d['state']")
    [ "$st" = open ] || die "#$n did not reopen (state $st): reopen it by hand now"
    echo "lead-pr: #$n closed and reopened; pull_request checks run fresh" ;;
  approve-records)
    j=$(pr "$n"); head=$(echo "$j" | field "d['head']['sha']"); ref=$(echo "$j" | field "d['head']['ref']")
    [ "$(echo "$j" | field "d['state']")" = open ] || die "#$n is not open"
    case "$ref" in lead/*) ;; *) die "#$n is on $ref, not a lead/* branch: records approval is for the Lead's own records PRs" ;; esac
    files=$(curl "${H[@]}" "$API/pulls/$n/files?per_page=100" | field "'\n'.join(f['filename'] for f in d)")
    cnt=$(printf '%s\n' "$files" | grep -c . || true); [ "$cnt" -lt 100 ] || die "#$n changes 100+ files: read it by hand"
    rec=$(printf '%s\n' "$files" | bash "$HERE/records-only.sh" is-records --files)
    [ "$rec" = yes ] || die "#$n is not records-only (records-only.sh says $rec): it needs an independent reviewer"
    red=$(curl "${H[@]}" "$API/commits/$head/check-runs?per_page=100" | field "' '.join(c['name'] for c in d['check_runs'] if c['conclusion'] in ('failure','timed_out'))")
    [ -z "$red" ] || die "#$n has red checks on $head: $red"
    curl "${H[@]}" -X POST "$API/issues/$n/comments" -d "{\"body\":\"Reviewer: Approve $head\\n\\nLead read the diff (P-385): records only ($cnt files, records-only.sh: yes), no red check on the head. Posted with tools/lead-pr.sh.\"}" >/dev/null
    curl "${H[@]}" -X POST "$API/issues/$n/labels" -d '{"labels":["review: approved"]}' >/dev/null
    echo "lead-pr: #$n approved and labelled on $head ($cnt record files)" ;;
  label)
    j=$(pr "$n"); head=$(echo "$j" | field "d['head']['sha']")
    [ "$(echo "$j" | field "d['state']")" = open ] || die "#$n is not open"
    [ "$(echo "$j" | field "str(d.get('draft', False))")" = False ] || die "#$n is a draft: mark it ready first (the full check runs then, P-371)"
    [[ "$head" =~ ^[0-9a-f]{40}$ ]] || die "#$n head unreadable"
    comments "$n"
    who=$(team_line "^\s*(?:>\s*)?reviewer:\s*approve[sd]?\s+$head\b")
    [ -n "$who" ] || die "#$n has no \"Reviewer: Approve $head\" line from a reviewer (write access, not a bot) for the current head ${head:0:9}: re-review first (P-385, P-318)"
    red=$(curl "${H[@]}" "$API/commits/$head/check-runs?per_page=100" | field "' '.join(c['name'] for c in d['check_runs'] if c['conclusion'] in ('failure','timed_out'))")
    [ -z "$red" ] || die "#$n has red checks on $head: $red"
    rc=0; rr=$(python3 -I "$HERE/review-rounds.py" --comments "$W/comments.json") || rc=$?
    [ "$rc" = 0 ] || die "#$n: $rr"
    curl "${H[@]}" -X POST "$API/issues/$n/labels" -d '{"labels":["review: approved"]}' >/dev/null
    echo "lead-pr: #$n labelled on ${head:0:9} (Approve by $who; $rr)" ;;
  requeue)
    j=$(pr "$n")
    [ "$(echo "$j" | field "d['state']")" = open ] || die "#$n is not open"
    labels=$(echo "$j" | field "'|'.join(l['name'] for l in d.get('labels', []))")
    case "|$labels|" in *"|review: approved|"*) ;; *) die "#$n does not carry review: approved: label it first (lead-pr.sh label)" ;; esac
    case "|$labels|" in *"|queued|"*) die "#$n is queued: a requeue can reset a running batch, never in one (unblock playbook 2)" ;; esac
    comments "$n"
    who=$(team_line "^\s*(?:>\s*)?batch failures covered:")
    [ -n "$who" ] || die "#$n has no \"Batch failures covered:\" line from someone with write access: list every failed suite of the batch run first (P-731 (2))"
    curl "${H[@]}" -X POST "$API/issues/$n/comments" -d '{"body":"@mergifyio requeue"}' >/dev/null
    echo "lead-pr: #$n requeue posted (Batch failures covered by $who)" ;;
  *) die "$USAGE" ;;
esac
