#!/usr/bin/env bash
# lead-label.sh <pr> — the Lead's one label command for a Lead-read PR (founder A435, 27 Nov; LR-157). Routine PRs need
# nothing: queue-gate.yml (main's copy) puts `review: approved` on by itself once the reviewer's Approve names the head,
# ci and pr-suites are green and no path keeps the Lead's read (queue-gate.sh label; B194, P-823). A PR that touches a
# Lead-read path (.github/, .mergify.yml, product/tools/, .claude/, schema, migrations, money, permissions:
# lead-read-paths.txt) is refused there, and the Lead labels it after the read. This script is that label, narrowed so
# the founder can allow it with one standing permission rule:
#   Bash(bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-label.sh:*)
# It puts `review: approved` on PR <pr> only when
#   (a) <pr> is a number, and the PR is open, not a draft, based on main, not a merge-queue batch, its head this
#       repository's (not a fork's);
#   (b) the last "Reviewer:" line about the head, by the repository owner's account or a login in REVIEWERS with write
#       access (OWNER, MEMBER, COLLABORATOR), is "Reviewer: Approve <the head's full 40-hex SHA>" — the same rule as
#       queue-gate.sh approved(): a later "Reviewer: Changes" on the head wins, a short SHA or an older head refuses;
#   (c) the head is still the same after the label went on (else the label comes off again).
# Anything else: exit 1 and the reason, nothing changed. The label is then judged again on GitHub's side by main's
# label-guard.yml (pull_request_target; an Approve on the head, pr-suites green) and label-sweep.sh: this script narrows
# what the Lead can do, the server-side guards stay the boundary.
# Env: GH_TOKEN (default: `gh auth token`), REPO (default: from the origin remote), REVIEWERS (default: the repository
# variable, read with the token; unreadable → the owner alone), API (default https://api.github.com),
# LEAD_LABEL_MAIN_CHECK (default 1: refuse when this file differs from origin/main's copy; the test sets 0).
# Exit 0 labelled (or already labelled); 1 refused or could not judge. Test: check-lead-label.sh. US$0.
set -uo pipefail
LABEL="review: approved"; API="${API:-https://api.github.com}"
no() { echo "lead-label: refused: $*"; exit 1; }
PR="${1:-}"
[[ "$PR" =~ ^[1-9][0-9]{0,6}$ ]] && [ $# = 1 ] || no "usage: lead-label.sh <pr number> (one argument, a number)"
command -v jq >/dev/null || no "jq is missing"
HERE=$(cd "$(dirname "$0")" && pwd)

# An accident guard, not a wall (a changed copy could drop it): the command the founder allowed is main's.
if [ "${LEAD_LABEL_MAIN_CHECK:-1}" != 0 ]; then
  top=$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null) || no "not inside a git copy"
  rel=${HERE#"$top"/}/lead-label.sh
  git -C "$top" fetch -q --no-tags origin main 2>/dev/null || no "cannot fetch origin/main to compare this script with main's"
  git -C "$top" show "origin/main:$rel" 2>/dev/null | cmp -s - "$HERE/lead-label.sh" \
    || no "this copy's lead-label.sh is not origin/main's (run it from a copy on main)"
fi

if [ -z "${REPO:-}" ]; then
  REPO=$(git -C "$HERE" remote get-url origin 2>/dev/null | sed -nE 's#^(https://[^/]+/|git@[^:]+:)([^/]+/[^/.]+)(\.git)?/?$#\2#p')
  [ -n "$REPO" ] || no "REPO is not set and the origin remote names no owner/name"
fi
[ -n "${GH_TOKEN:-}" ] || GH_TOKEN=$(gh auth token 2>/dev/null) || true
[ -n "${GH_TOKEN:-}" ] || no "no GitHub token (GH_TOKEN, or gh auth login)"
H=$(mktemp); trap 'rm -f "$H"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -sS --fail-with-body -H @"$H" "$@"; }
OWNER="${REPO%%/*}"

# (a) the PR
pr=$(api "$API/repos/$REPO/pulls/$PR") || no "#$PR cannot be read"
head=$(jq -r '.head.sha // ""' <<< "$pr")
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || no "#$PR has no readable head"
[ "$(jq -r .state <<< "$pr")" = open ] || no "#$PR is not open"
[ "$(jq -r .draft <<< "$pr")" = false ] || no "#$PR is a draft (gh pr ready first)"
[ "$(jq -r .base.ref <<< "$pr")" = main ] || no "#$PR is not based on main"
case "$(jq -r .head.ref <<< "$pr")" in mergify/*) no "#$PR is a merge-queue batch";; esac
[ "$(jq -r '.head.repo.full_name // ""' <<< "$pr")" = "$REPO" ] || no "#$PR's head is a fork's"
jq -e --arg l "$LABEL" 'any(.labels[]?; .name == $l)' <<< "$pr" >/dev/null && { echo "lead-label: #$PR already carries '$LABEL'"; exit 0; }

# (b) the reviewer's Approve on the head (queue-gate.sh approved(), same reading)
if [ -z "${REVIEWERS+x}" ]; then REVIEWERS=$(api "$API/repos/$REPO/actions/variables/REVIEWERS" 2>/dev/null | jq -r '.value // ""' 2>/dev/null) || REVIEWERS=""; fi
cs='[]'; p=1
while [ "$p" -le 30 ]; do
  one=$(api "$API/repos/$REPO/issues/$PR/comments?per_page=100&page=$p") || no "#$PR's comments cannot be read"
  jq -e 'type == "array"' <<< "$one" >/dev/null || no "#$PR's comments cannot be read"
  cs=$(jq -s '.[0] + .[1]' <(echo "$cs") <(echo "$one")); [ "$(jq length <<< "$one")" -lt 100 ] && break; p=$((p + 1))
done
[ "$p" -le 30 ] || no "#$PR has more than 3000 comments (fails closed)"
who=$(printf '%s\n' "$OWNER" ${REVIEWERS:-} | jq -Rn '[inputs | select(length > 0)]')
lines=$(jq -r --argjson who "$who" '.[] | select((.user.login as $l | $who | index($l)) and (.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")) | .body // ""' <<< "$cs" \
  | tr -d '*_`' | grep -iE '^[[:space:]]*reviewer:'; true)
last=""
while IFS= read -r l; do [ -n "$l" ] || continue; keep=1
  for x in $(grep -oiE '\b[0-9a-f]{7,40}\b' <<< "$l" | tr A-F a-f | grep '[0-9]' | grep '[a-f]'; true); do keep=0; case "$head" in "$x"*) keep=1; break;; esac; done
  [ "$keep" = 1 ] && last=$l
done <<< "$lines"
grep -qiE "^[[:space:]]*reviewer:[[:space:]]*approve[sd]?[[:space:]]+$head\b" <<< "$last" \
  || no "#$PR: the last \"Reviewer:\" line about the head $head from the owner's account or a known reviewer is not \"Reviewer: Approve $head\"${last:+ (it is: $(cut -c1-120 <<< "$last"))}"

# The label, then (c) the head again: a push between the read and the label takes it off.
enc=$(jq -rn --arg l "$LABEL" '$l|@uri')
api -X POST "$API/repos/$REPO/issues/$PR/labels" -d "$(jq -n --arg l "$LABEL" '{labels: [$l]}')" >/dev/null || no "#$PR: GitHub refused the label"
now=$(api "$API/repos/$REPO/pulls/$PR" 2>/dev/null | jq -r '.head.sha // ""' 2>/dev/null)
if [ "$now" != "$head" ]; then
  api -X DELETE "$API/repos/$REPO/issues/$PR/labels/$enc" >/dev/null \
    || echo "lead-label: warning: the label could not be taken off again; label-guard.yml takes it off a head with no Approve"
  no "#$PR's head moved from ${head:0:9} to ${now:-unreadable} while labelling: label taken off"
fi
echo "lead-label: #$PR labelled '$LABEL' (\"Reviewer: Approve $head\" names the head; label-guard.yml judges it again)"
exit 0
