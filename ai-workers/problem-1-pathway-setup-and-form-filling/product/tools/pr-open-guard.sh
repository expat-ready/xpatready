#!/usr/bin/env bash
# A PR is still open before a push to its branch (P-611, row G-4 (1)): a push to a branch whose PR already merged or
# closed reaches no PR, and the work is lost. Run by .githooks/pre-push for each branch pushed. Reads the branch's PRs
# from GitHub: one open → pass; none → pass (a new branch: its PR comes after the first push); only merged or closed →
# refused, naming them. GitHub unreadable → a warning and pass (lead-watch's branch sweep lists the branch later, G-4 (5)).
# A branch restarted from main after its PR merged passes by itself (A455, Lead 13, 28 Nov): when the pushed commit
# <sha> has every merged PR's merge commit as an ancestor, the old work is already on main and nothing can be lost; the
# push is for a new PR. Cloud lanes may push only their one session branch, so without this each lane landed one PR and
# then stopped (28 Nov: fast-route, cleanup-2). A closed, unmerged PR still refuses (its work never reached main).
# XR_ALLOW_CLOSED_PR_PUSH=1 only on the Lead's word, for any other case.
# Usage: pr-open-guard.sh <branch> [remote] [sha]   Env: REPO (default from origin), API, GH_TOKEN (default `gh auth token`). Test: check-g4-rules.sh.
set -u
b=${1:?branch}; API="${API:-https://api.github.com}"
[ -n "${XR_ALLOW_CLOSED_PR_PUSH:-}" ] && { echo "pr-open-guard: $b not checked (XR_ALLOW_CLOSED_PR_PUSH)"; exit 0; }
# The tech lead's lead/* branch lives for days by design (P-188): its records reach main through records PRs, so its old
# closed or merged PRs say nothing about this push (founder's OK to Lead 58, 15 Nov: the guard refused the Lead's records push).
case "$b" in lead/*) echo "pr-open-guard: $b is a tech-lead branch, not checked"; exit 0;; esac
REPO="${REPO:-$(git remote get-url "${2:-origin}" 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')}"
H=$(mktemp "${TMPDIR:-/tmp}/prog.XXXXXXXX"); trap 'rm -f "$H"' EXIT; chmod 600 "$H"
tok="${GH_TOKEN:-$(gh auth token 2>/dev/null)}"; echo 'Accept: application/vnd.github+json' > "$H"
[ -n "$tok" ] && echo "Authorization: Bearer $tok" >> "$H"
prs=$(curl -fsS --max-time 10 -H @"$H" "$API/repos/$REPO/pulls?state=all&per_page=30&head=${REPO%%/*}:$b" 2>/dev/null) \
  && echo "$prs" | jq -e 'type == "array"' >/dev/null 2>&1 || { echo "warn  pr-open-guard: GitHub unreadable, $b not checked"; exit 0; }
echo "$prs" | jq -e 'length == 0 or any(.[]; .state == "open")' >/dev/null && exit 0
sha=${3:-}
if [ -n "$sha" ] && echo "$prs" | jq -e 'all(.[]; .merged_at != null and (.merge_commit_sha // "") != "")' >/dev/null; then
  restarted=1
  for m in $(echo "$prs" | jq -r '.[].merge_commit_sha'); do
    git merge-base --is-ancestor "$m" "$sha" 2>/dev/null || { restarted=0; break; }
  done
  [ "$restarted" = 1 ] && { echo "pr-open-guard: $b restarted from main after $(echo "$prs" | jq -r '[.[] | "#\(.number)"] | join(", ")') merged: passes; open a new PR for this push (A455)"; exit 0; }
fi
echo "Push to $b refused (P-611, G-4 (1)): its PR is no longer open ($(echo "$prs" | jq -r '[.[] | "#\(.number) \(if .merged_at then "merged" else "closed" end)"] | join(", ")')). Start a new branch from origin/main for new work."
exit 1
