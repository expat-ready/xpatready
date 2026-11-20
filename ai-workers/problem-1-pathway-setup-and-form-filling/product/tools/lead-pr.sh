#!/bin/bash
# lead-pr.sh — two routine tech-lead PR steps, each guarded in code (founder, 20 Nov 10:2x IST: "Yes, add the rule"; Lead 100).
#   reopen <n>            close and reopen PR <n> so its pull_request checks (pr-rules) run fresh on a new merge commit
#                         (as Lead 98 did for #2307). Refused for a merged or already-closed PR.
#   approve-records <n>   post "Reviewer: Approve <head>" and add `review: approved` to a records-only PR (P-385).
#                         Refused unless records-only.sh says every changed file is a record, the PR's branch is a
#                         lead/* branch, and its CI checks are not red. A PR touching code or tools never passes here.
# GitHub is read and written through the REST API with `gh auth token` (gh's own TLS fails in the sandbox, P-363).
set -euo pipefail
REPO=expat-ready/xpatready; API=https://api.github.com/repos/$REPO
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(gh auth token); H=(-s -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json")
die() { echo "lead-pr: $*" >&2; exit 1; }
pr() { curl "${H[@]}" "$API/pulls/$1"; }
field() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
n="${2:-}"; [[ "$n" =~ ^[0-9]+$ ]] || die "usage: lead-pr.sh reopen|approve-records <pr number>"
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
  *) die "usage: lead-pr.sh reopen|approve-records <pr number>" ;;
esac
