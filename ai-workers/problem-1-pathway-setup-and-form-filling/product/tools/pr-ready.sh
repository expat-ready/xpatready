#!/usr/bin/env bash
# pr-ready.sh <PR number>: marks one draft PR "Ready for review" (P-685, founder 17 Nov ~13:4x IST: "Yes, allow that
# script"). It does only that, and only when the PR has a comment line "Reviewer: Approve <current head sha>".
# Why a script: the T7 deny line `Bash(gh api graphql*mutation*)` (P-670) blocks agents from GraphQL mutations, and
# markPullRequestReadyForReview has no REST equivalent. New PRs open non-draft after the Approve (P-683), so this is
# for older drafts only. Change log: library/engineering-change-log.md rows C18, C20. Test: check-pr-ready-sync.sh. Undo: delete this file.
set -euo pipefail
n="${1:?usage: pr-ready.sh <PR number>}"
[[ "$n" =~ ^[0-9]+$ ]] || { echo "pr-ready: PR number must be digits" >&2; exit 2; }
R="${PR_READY_REPO:-$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')}"
T="$(gh auth token)"
# The token goes to curl as a header file on a pipe, never on its command line (the process list shows that; #2086 m3).
api() { curl -sf -H @<(printf 'Authorization: Bearer %s\n' "$T") -H "Accept: application/vnd.github+json" "$@"; }
headof() { python3 -c 'import json,sys;print(json.loads(sys.argv[1])["head"]["sha"])' "$1"; }
pr="$(api "https://api.github.com/repos/$R/pulls/$n")"
read -r state draft head node < <(python3 -c 'import json,sys;d=json.loads(sys.argv[1]);print(d["state"],d["draft"],d["head"]["sha"],d["node_id"])' "$pr")
[ "$state" = open ] || { echo "pr-ready: #$n is $state" >&2; exit 1; }
[ "$draft" = True ] || { echo "pr-ready: #$n is already ready"; exit 0; }
ok=0; page=1
while :; do
  c="$(api "https://api.github.com/repos/$R/issues/$n/comments?per_page=100&page=$page")"
  k="$(python3 -c 'import json,sys;print(len(json.loads(sys.argv[1])))' "$c")"
  # Only people with write access count (OWNER, MEMBER, COLLABORATOR, as label-guard.sh): anyone can comment (#2086 m2).
  if python3 -c 'import json,re,sys;h=sys.argv[2];sys.exit(0 if any(x.get("author_association") in ("OWNER","MEMBER","COLLABORATOR") and re.search(r"^Reviewer: Approve "+h+r"\b",x.get("body") or "",re.M) for x in json.loads(sys.argv[1])) else 1)' "$c" "$head"; then ok=1; break; fi
  [ "$k" -lt 100 ] && break; page=$((page+1))
done
[ "$ok" = 1 ] || { echo "pr-ready: #$n has no 'Reviewer: Approve $head' line from a member; not marking ready" >&2; exit 1; }
# The head is read again after the comments: a push in between leaves the Approve on an old head (#2086 m2).
now="$(headof "$(api "https://api.github.com/repos/$R/pulls/$n")")"
[ "$now" = "$head" ] || { echo "pr-ready: #$n moved from ${head:0:9} to ${now:0:9} while the comments were read; not marking ready" >&2; exit 1; }
body="$(python3 -c 'import json,sys;print(json.dumps({"query":"mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}","variables":{"id":sys.argv[1]}}))' "$node")"
out="$(api -X POST https://api.github.com/graphql -d "$body")"
python3 -c 'import json,sys;d=json.loads(sys.argv[1]);e=d.get("errors");sys.exit("pr-ready: "+json.dumps(e)) if e else print("pr-ready: #'"$n"' marked ready at '"${head:0:9}"'")' "$out"
