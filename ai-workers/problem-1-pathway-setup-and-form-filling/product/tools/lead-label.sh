#!/usr/bin/env bash
# lead-label.sh <pr> — the Lead's one label command for a Lead-read PR (founder A435, 27 Nov; LR-158). Routine PRs need
# nothing: queue-gate.yml (main's copy) puts `review: approved` on by itself once the reviewer's Approve names the head,
# ci and pr-suites are green and no path keeps the Lead's read first (queue-gate.sh label; B194, P-823). A PR touching a
# "read first" path of lead-read-paths.txt (.github/, .mergify.yml, product/tools/, .claude/, the guards, permissions, a
# destructive migration or schema change) is refused there, and the Lead labels it after the read. This script is that
# label, narrowed so the founder can allow it with one standing permission rule, in the Lead copy's own
# .claude/settings.local.json only (never the shared settings.json, which every builder copy loads), with Edit and Write
# on this file denied there, since the rule runs whatever file sits at this path:
#   Bash(bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-label.sh:*)
# It puts `review: approved` on PR <pr> only when
#   (a) <pr> is a number, and the PR is open, not a draft, based on main, not a merge-queue batch, its head this
#       repository's (not a fork's);
#   (b) the last "Reviewer:" line about the head, by the repository owner's account or a login in REVIEWERS with write
#       access (OWNER, MEMBER, COLLABORATOR), is "Reviewer: Approve <the head's full 40-hex SHA>" — the same rule as
#       queue-gate.sh approved(): a later "Reviewer: Changes" on the head wins, a short SHA or an older head refuses;
#   (c) a comment holds the Lead's read of that head, alone on its line: "Lead read the diff: <full head SHA>" (or
#       "Lead read: OK <full head SHA>"; P-423, P-637), read exactly as lead-read-gate.sh reads it: a writer's comment,
#       never edited, only from LEAD_LOGINS (the repository variable) and never the PR's author when that is set, with
#       code fences and HTML comments dropped; so the label never goes on without a recorded read (review r1 M1, break r2 M1);
#   (d) the head is still the same after the label went on (else the label comes off again).
# Anything else: exit 1 and the reason, nothing changed. The label is then judged again on GitHub's side by main's
# label-guard.yml (pull_request_target; an Approve on the head, pr-suites green) and label-sweep.sh: this script narrows
# what the Lead can do, the server-side guards stay the boundary.
# Env: GH_TOKEN (default: `gh auth token`). Only names starting LEAD_LABEL_ are read, so nothing a session happens to
# carry (API, REPO, REVIEWERS) can point the token elsewhere or widen who counts (break r1 m3): LEAD_LABEL_REPO (default:
# from the origin remote), LEAD_LABEL_REVIEWERS (default: the repository variable REVIEWERS, read with the token;
# unreadable → the owner alone), LEAD_LABEL_LEAD_LOGINS (default: the repository variable LEAD_LOGINS; unreadable or
# unset → any writer, as the gate), LEAD_LABEL_API (default https://api.github.com), LEAD_LABEL_MAIN_CHECK (default 1:
# refuse when this file differs from main's copy as just fetched into refs/lead-label/main; the test sets 0).
# Exit 0 labelled (or already labelled); 1 refused or could not judge. Test: check-lead-label.sh. US$0.
set -uo pipefail
export LC_ALL=C   # [0-9] means the ten ASCII digits, whatever the session's locale (break r1 m2)
LABEL="review: approved"; API="${LEAD_LABEL_API:-https://api.github.com}"; REPO="${LEAD_LABEL_REPO:-}"
no() { echo "lead-label: refused: $*"; exit 1; }
PR="${1:-}"
[[ "$PR" =~ ^[1-9][0-9]{0,6}$ ]] && [ $# = 1 ] || no "usage: lead-label.sh <pr number> (one argument, a number)"
command -v jq >/dev/null || no "jq is missing"
HERE=$(cd "$(dirname "$0")" && pwd -P)   # physical, as git's --show-toplevel (review r1 M2: macOS /tmp is a symlink)

# An accident guard, not a wall (a changed copy could drop it): the command the founder allowed is main's.
if [ "${LEAD_LABEL_MAIN_CHECK:-1}" != 0 ]; then
  top=$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null) || no "not inside a git copy"
  rel=${HERE#"$top"/}/lead-label.sh
  # into a ref of its own, so another fetch in this copy cannot change what is compared (review r2 n4)
  git -C "$top" fetch -q --no-tags origin "+refs/heads/main:refs/lead-label/main" 2>/dev/null || no "cannot fetch origin/main to compare this script with main's"
  git -C "$top" show "refs/lead-label/main:$rel" 2>/dev/null | cmp -s - "$HERE/lead-label.sh" \
    || no "this copy's lead-label.sh is not origin/main's (run it from a copy on main)"
fi

if [ -z "$REPO" ]; then
  REPO=$(git -C "$HERE" remote get-url origin 2>/dev/null | sed -nE 's#^(https://[^/]+/|git@[^:]+:)([^/]+/[^/.]+)(\.git)?/?$#\2#p')
  [ -n "$REPO" ] || no "LEAD_LABEL_REPO is not set and the origin remote names no owner/name"
fi
[ -n "${GH_TOKEN:-}" ] || GH_TOKEN=$(gh auth token 2>/dev/null) || true
[ -n "${GH_TOKEN:-}" ] || no "no GitHub token (GH_TOKEN, or gh auth login)"
H=$(mktemp); trap 'rm -f "$H"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -q -sS --fail-with-body -H @"$H" "$@"; }   # -q: no .curlrc from the session's HOME or CURL_HOME (break r2 m2)
OWNER="${REPO%%/*}"

# (a) the PR
pr=$(api "$API/repos/$REPO/pulls/$PR") || no "#$PR cannot be read"
jq -se 'length == 1 and (.[0] | type == "object")' <<< "$pr" >/dev/null 2>&1 || no "#$PR: GitHub's answer is not one JSON object"
head=$(jq -r '.head.sha // ""' <<< "$pr")
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || no "#$PR has no readable head"
[ "$(jq -r .state <<< "$pr")" = open ] || no "#$PR is not open"
[ "$(jq -r .draft <<< "$pr")" = false ] || no "#$PR is a draft (gh pr ready first)"
[ "$(jq -r .base.ref <<< "$pr")" = main ] || no "#$PR is not based on main"
case "$(jq -r .head.ref <<< "$pr")" in mergify/*) no "#$PR is a merge-queue batch";; esac
[ "$(jq -r '.head.repo.full_name // ""' <<< "$pr")" = "$REPO" ] || no "#$PR's head is a fork's"
jq -e --arg l "$LABEL" 'any(.labels[]?; .name == $l)' <<< "$pr" >/dev/null && { echo "lead-label: #$PR already carries '$LABEL'"; exit 0; }

# (b) the reviewer's Approve on the head (queue-gate.sh approved(), same reading)
if [ -n "${LEAD_LABEL_REVIEWERS+x}" ]; then REVIEWERS=$LEAD_LABEL_REVIEWERS
else REVIEWERS=$(api "$API/repos/$REPO/actions/variables/REVIEWERS" 2>/dev/null | jq -r '.value // ""' 2>/dev/null) || REVIEWERS=""; fi
cs='[]'; p=1
while [ "$p" -le 30 ]; do
  one=$(api "$API/repos/$REPO/issues/$PR/comments?per_page=100&page=$p") || no "#$PR's comments cannot be read"
  # one JSON array of objects, nothing else: a second document or a stray value would drop later verdicts (break r1 m1)
  jq -se 'length == 1 and (.[0] | type == "array" and all(.[]; type == "object"))' <<< "$one" >/dev/null 2>&1 || no "#$PR's comments cannot be read"
  cs=$(jq -s '.[0] + .[1]' <(echo "$cs") <(echo "$one")); [ "$(jq length <<< "$one")" -lt 100 ] && break; p=$((p + 1))
done
[ "$p" -le 30 ] || no "#$PR has more than 3000 comments (fails closed)"
who=$( { printf '%s\n' "$OWNER"; tr -s ' \t' '\n\n' <<< "$REVIEWERS"; } | jq -Rn '[inputs | select(length > 0)]')   # split, never globbed (break r1 m5)
bodies=$(jq -r --argjson who "$who" '.[] | select((.user.login? as $l | $who | index($l)) and (.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")) | (.body // "" | tostring)' <<< "$cs") \
  || no "#$PR's comments cannot be judged (jq failed: fails closed)"
lines=$(tr -d '*_`' <<< "$bodies" | grep -iE '^[[:space:]]*reviewer:'; true)
last=""
while IFS= read -r l; do [ -n "$l" ] || continue; keep=1
  for x in $(grep -oiE '\b[0-9a-f]{7,40}\b' <<< "$l" | tr A-F a-f | grep '[0-9]' | grep '[a-f]'; true); do keep=0; case "$head" in "$x"*) keep=1; break;; esac; done
  [ "$keep" = 1 ] && last=$l
done <<< "$lines"
grep -qiE "^[[:space:]]*reviewer:[[:space:]]*approve[sd]?[[:space:]]+$head\b" <<< "$last" \
  || no "#$PR: the last \"Reviewer:\" line about the head $head from the owner's account or a known reviewer is not \"Reviewer: Approve $head\"${last:+ (it is: $(cut -c1-120 <<< "$last"))}"

# (c) the Lead's read of this head: lead-read-gate.sh's filter, word for word (who counts, never edited, fences and HTML
# comments dropped), then its line grep
if [ -n "${LEAD_LABEL_LEAD_LOGINS+x}" ]; then LEAD_LOGINS=$LEAD_LABEL_LEAD_LOGINS
else LEAD_LOGINS=$(api "$API/repos/$REPO/actions/variables/LEAD_LOGINS" 2>/dev/null | jq -r '.value // ""' 2>/dev/null) || LEAD_LOGINS=""; fi
author=$(jq -r '.user.login // ""' <<< "$pr")
read_ok=$(jq -r --arg who "$LEAD_LOGINS" --arg author "$author" '($who | ascii_downcase | [splits("[\\s,]+")] | map(select(length > 0))) as $leads | ($author | ascii_downcase) as $author | .[]
      | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")
      | select(($leads | length) == 0 or ((.user.login // "" | ascii_downcase) as $l | ($leads | index($l)) != null and $l != $author))
      | select(.created_at != null and (.updated_at // .created_at) == .created_at)
      | (.body // "" | tostring) | gsub("<!--[\\s\\S]*?(-->|$)"; "") | gsub("```[\\s\\S]*?(```|$)"; "") | gsub("~~~[\\s\\S]*?(~~~|$)"; "")' <<< "$cs" \
  | tr -d '*_`\r' | grep -v -e '^    ' -e "^$(printf '\t')" \
  | grep -iE '^[[:space:]]*Lead read(: *OK| the diff:?)[[:space:]]+[0-9a-f]{40}[[:space:]]*\.?[[:space:]]*$' | grep -oiE '[0-9a-f]{40}' | tr 'A-F' 'a-f' | grep -x "$head")
[ -n "$read_ok" ] || no "#$PR: no line \"Lead read the diff: $head\" by someone with write access (P-423: the read first, then the label)"

# The label, then (d) the head again: a push between the read and the label takes it off.
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
