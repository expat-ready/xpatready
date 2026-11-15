#!/usr/bin/env bash
# A PR is still open before a push to its branch (P-611, row G-4 (1)): a push to a branch whose PR already merged or
# closed reaches no PR, and the work is lost. Run by .githooks/pre-push for each branch pushed. Reads the branch's PRs
# from GitHub: one open → pass; none → pass (a new branch: its PR comes after the first push); only merged or closed →
# refused, naming them. GitHub unreadable → a warning and pass (lead-watch's branch sweep lists the branch later, G-4 (5)).
# XR_ALLOW_CLOSED_PR_PUSH=1 only on the Lead's word (a branch restarted from main under its old name, for a new PR).
# Usage: pr-open-guard.sh <branch> [remote]   Env: REPO (default from origin), API, GH_TOKEN (default `gh auth token`). Test: check-g4-rules.sh.
set -u
b=${1:?branch}; API="${API:-https://api.github.com}"
[ -n "${XR_ALLOW_CLOSED_PR_PUSH:-}" ] && { echo "pr-open-guard: $b not checked (XR_ALLOW_CLOSED_PR_PUSH)"; exit 0; }
REPO="${REPO:-$(git remote get-url "${2:-origin}" 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')}"
H=$(mktemp "${TMPDIR:-/tmp}/prog.XXXXXXXX"); trap 'rm -f "$H"' EXIT; chmod 600 "$H"
tok="${GH_TOKEN:-$(gh auth token 2>/dev/null)}"; echo 'Accept: application/vnd.github+json' > "$H"
[ -n "$tok" ] && echo "Authorization: Bearer $tok" >> "$H"
prs=$(curl -fsS --max-time 10 -H @"$H" "$API/repos/$REPO/pulls?state=all&per_page=30&head=${REPO%%/*}:$b" 2>/dev/null) \
  && echo "$prs" | jq -e 'type == "array"' >/dev/null 2>&1 || { echo "warn  pr-open-guard: GitHub unreadable, $b not checked"; exit 0; }
echo "$prs" | jq -e 'length == 0 or any(.[]; .state == "open")' >/dev/null && exit 0
echo "Push to $b refused (P-611, G-4 (1)): its PR is no longer open ($(echo "$prs" | jq -r '[.[] | "#\(.number) \(if .merged_at then "merged" else "closed" end)"] | join(", ")')). Start a new branch from origin/main for new work."
exit 1
