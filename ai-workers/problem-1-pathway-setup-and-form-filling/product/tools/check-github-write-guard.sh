#!/usr/bin/env bash
# One door for GitHub writes (LR-060, OS-58): github-write-guard.py refuses a command line that writes to the GitHub API
# (curl, wget, httpie, gh api with a field, inline code), through the fail-closed wrapper; reads and the reviewed
# scripts in product/tools pass. US$0, no network.
#   bash product/tools/check-github-write-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
S="$TOOLS/../../../../.claude/settings.json"
guard() {  # $1 command → deny | allow | block (the wrapper's exit 2)
  local out rc; out=$(jq -n --arg c "$1" '{hook_event_name:"PreToolUse", tool_name:"Bash", tool_input:{command:$c}, cwd:"/tmp"}' \
    | bash "$TOOLS/hook-fail-closed.sh" 10 github-write-guard.py 2>/dev/null); rc=$?
  [ $rc = 2 ] && { echo block; return; }
  if printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny; else echo allow; fi; }
while IFS='|' read -r want cmd; do
  [ -n "$want" ] || continue
  r=$(guard "$cmd"); ok "$want: $cmd" "$([ "$r" = "$want" ] && echo 1)" "got $r"
done <<'EOF'
deny|curl -sS -X POST -H 'Authorization: Bearer x' https://api.github.com/repos/o/r/issues/1/comments -d '{"body":"x"}'
deny|curl -sSL -XPATCH https://api.github.com/repos/o/r/pulls/1
deny|curl --request DELETE https://api.github.com/repos/o/r/git/refs/heads/x
deny|curl --request=PUT https://api.github.com/repos/o/r/pulls/1/merge
deny|curl -sSd '{}' https://api.github.com/repos/o/r/issues
deny|curl --data-binary @f https://api.github.com/repos/o/r/issues
deny|curl --json '{}' https://uploads.github.com/repos/o/r/releases/1/assets
deny|curl -F f=@x https://api.github.com/x
deny|curl -H "Authorization: token $GH_TOKEN" -X POST "$API/issues/1/labels"
deny|cd /tmp && curl -X POST https://api.github.com/x
deny|bash -c "curl -X POST https://api.github.com/repos/o/r/issues"
deny|echo $(curl -sS -X PATCH https://api.github.com/x)
deny|FOO=1 env curl -X POST https://api.github.com/x
deny|wget --post-data='{}' https://api.github.com/x
deny|wget --method=DELETE https://api.github.com/x
deny|http POST api.github.com/repos/o/r/issues title=x
deny|gh api repos/o/r/issues/1/comments -f body=hi
deny|gh api repos/o/r/pulls/1/reviews --input review.json
deny|gh api -X POST repos/o/r/issues
deny|gh api graphql -f query='mutation { addLabelsToLabelable(input: {}) { clientMutationId } }'
deny|python3 -c "import urllib.request as u; u.urlopen(u.Request('https://api.github.com/x', data=b'{}', method='POST'))"
deny|node -e "fetch('https://api.github.com/x', {method: 'POST', body: '{}'})"
deny|curl 'https://api.github.com/x -X POST
deny|for n in 1 2; do gh api repos/o/r/issues/$n/labels -f "labels[]=x"; done
deny|if true; then curl -X POST https://api.github.com/x; fi
deny|{ curl -X POST https://api.github.com/x; }
deny|! curl -X POST https://api.github.com/x
deny|API=https://api.github.com/repos/o/r; curl -X POST "$API/issues" -d "{}"
deny|sudo -u me curl -X POST https://api.github.com/x
deny|printf "1" | xargs -I % gh api repos/o/r/issues/%/labels -f labels[]=x
deny|echo `curl -X POST https://api.github.com/x`
deny|gh api repos/o/r/issues -fbody=hi
deny|gh api repos/o/r/issues -X=POST
deny|gh api graphql --input m.json
deny|perl -MLWP::UserAgent -e 'LWP::UserAgent->new->post("https://api.github.com/x", Content => "{}")'
deny|ruby -rnet/http -e 'h.request(Net::HTTP::Post.new(URI("https://api.github.com/x")))'
allow|curl -sSL https://api.github.com/repos/o/r/pulls?state=open
allow|grep -rn "curl -X POST https://api.github.com" ai-workers/
allow|git commit -m "refuse curl -X POST to api.github.com"
allow|gh pr comment 1 --body "Bypass: python3 -c requests.post('https://api.github.com/x', data=1)"
allow|curl -sS -G https://api.github.com/search/issues --data-urlencode "q=repo:o/r is:open"
allow|wget --method GET -qO- https://api.github.com/repos/o/r
allow|http GET api.github.com/repos/o/r/pulls per_page==100
allow|gh api --paginate graphql -f query="{ viewer { login } }"
allow|curl -fsSL -H 'Accept: application/vnd.github+json' https://api.github.com/x | jq .
allow|curl -sSL -X GET https://api.github.com/x
allow|curl -X POST https://example.com/hook -d x
allow|gh api -X GET search/code -f q=foo --paginate
allow|gh api graphql -f query='{ viewer { login } }'
allow|gh api repos/o/r/pulls/1
allow|gh pr comment 1 --body "Question for the tech lead: x"
allow|bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-pr.sh label 12
allow|git push -u origin HEAD
allow|ls -la
EOF
NL=$'\n'; BS='\'
r=$(guard "curl -sS $BS${NL}  -X POST $BS${NL}  https://api.github.com/repos/o/r/issues/1/comments $BS${NL}  -d x"); ok "deny: a curl continued over lines with backslashes" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "cd /tmp${NL}curl -X POST https://api.github.com/repos/o/r/issues -d x"); ok "deny: a write on the second line of a command" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "python3 - <<EOF${NL}import requests; requests.post(\"https://api.github.com/x\", json={})${NL}EOF"); ok "deny: a Python heredoc writing to the API" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(printf '{"tool_name":"Bash","tool_input":{}}' | bash "$TOOLS/hook-fail-closed.sh" 10 github-write-guard.py 2>/dev/null; echo $?)
ok "a hook input with no command blocks (fail closed)" "$([ "$r" = 2 ] && echo 1)" "got $r"
jq -e '[.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | test("hook-fail-closed\\.sh [0-9]+ github-write-guard\\.py$")) | select(.onFailure == "block")] | length == 1' "$S" >/dev/null
ok "settings.json runs github-write-guard.py on every Bash call, fail closed" "$([ $? = 0 ] && echo 1)"
jq -e '[.permissions.deny[] | select(test("curl.*api\\.github\\.com"))] | length >= 4' "$S" >/dev/null
ok "settings.json deny lines name curl writes to api.github.com too" "$([ $? = 0 ] && echo 1)"
finish
