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
deny|curl -sSd '{}' https://api.github.com/repos/o/r/issues
deny|curl --data-binary @f https://api.github.com/repos/o/r/issues
deny|curl --json '{}' https://uploads.github.com/repos/o/r/releases/1/assets
deny|curl -H "Authorization: token $GH_TOKEN" -X POST "$API/issues/1/labels"
deny|cd /tmp && curl -X POST https://api.github.com/x
deny|bash -c "curl -X POST https://api.github.com/repos/o/r/issues"
deny|echo $(curl -sS -X PATCH https://api.github.com/x)
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
deny|gh api graphql --input m.json
deny|gh api graphql -F query=@m.graphql
deny|perl -MLWP::UserAgent -e 'LWP::UserAgent->new->post("https://api.github.com/x", Content => "{}")'
deny|ruby -rnet/http -e 'h.request(Net::HTTP::Post.new(URI("https://api.github.com/x")))'
deny|bash -lc "curl -X POST https://api.github.com/repos/o/r/issues/1/comments -d '{}'"
deny|sh -ec "gh api repos/o/r/issues/1/comments -f body=hi"
deny|bash -euo pipefail -c 'gh api repos/o/r/issues/1/comments -f body=hi'
deny|python3 -Ic "import requests; requests.post('https://api.github.com/x', json={})"
deny|gh api repos/o/r/issues/1/comments -f body=hi # don't forget
deny|gh api repos/o/r/issues/1/comments -f body=$'It\'s done'
deny|for url in https://api.github.com/repos/o/r/issues/1/labels; do curl -X POST "$url" -d '{}'; done
deny|API=https://api.github.com/repos/o/r; curl -X POST "$API/issues/1/comments" -d '{"body":"Demo: http://localhost:4400/cases/1"}'
deny|curl -X POST https://API.GITHUB.COM/repos/o/r/issues -d '{}'
deny|python3 -E -c "import requests; requests.post('https://api.github.com/x', json={})"
deny|node --eval "fetch('https://api.github.com/x',{method:'POST'})"
deny|bash -c -- 'gh api repos/o/r/issues/1/comments -f body=hi'
deny|curl -sS -X PATCH "https://x-access-token:${GITHUB_TOKEN}@api.github.com/repos/o/r/pulls/1" --data '{"body":"x"}'
deny|curl -XPOST https://api.github.com/repos/o/r/issues -d @b.json http://localhost:4400/x
allow|curl -sXPOST http://localhost:4400/api/x -H "Authorization: Bearer $GH_TOKEN" -d '{}'
allow|echo for '*' in https://api.github.com/x; ls
allow|curl -s -X POST http://localhost:4400/api/hooks -H "X-Hub: https://api.github.com/hook" -d '{}'
allow|curl -s -X POST http://localhost:4400/api/programs -d "{\"token\":\"$GH_TOKEN\"}"
allow|git commit -m "fix" -m "Use \`gh api -X GET\` for reads; \`curl -d\` to api.github.com is refused"
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
Q="'"
r=$(guard "gh api repos/o/r/issues/1/comments -F body=@- <<${Q}EOF${Q}${NL}Round 2 done, it${Q}s green${NL}EOF"); ok "deny: gh api -F body=@- with an apostrophe in its heredoc" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "git commit -F - <<${Q}EOF${Q}${NL}guard: refuse curl -X POST to api.github.com${NL}${NL}it${Q}s a write${NL}EOF"); ok "allow: a commit message heredoc that describes a write" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "gh pr create --title G --body \"\$(cat <<${Q}EOF${Q}${NL}- gh api repos/o/r/issues -f title=x is denied${NL}EOF${NL})\""); ok "allow: a PR body heredoc in \$(cat) that describes a write" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "gh pr comment 1 --body-file - <<${Q}EOF${Q}${NL}python3 -c \"requests.post(${Q}https://api.github.com/x${Q}, data=1)\" is denied${NL}EOF"); ok "allow: a PR comment heredoc quoting inline code" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "bash <<${Q}EOF${Q}${NL}curl -X POST https://api.github.com/x -d x${NL}EOF"); ok "deny: a heredoc a shell runs" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "cat <<${Q}EOF${Q} | bash${NL}gh api repos/o/r/issues/1/comments -f body=hi${NL}EOF"); ok "deny: a heredoc piped to a shell" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "cat > /tmp/n <<END.x${NL}note${NL}END.x${NL}gh api repos/o/r/issues/1/comments -f body=hi"); ok "deny: a heredoc that never closes hides nothing" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "gh pr create --title ${Q}python3 tooling${Q} --body-file - <<\\EOF${NL}refuses requests.post(${Q}https://api.github.com/x${Q}, data=1)${NL}EOF"); ok "allow: a PR body heredoc (<<\\EOF, python3 in the title)" "$([ "$r" = allow ] && echo 1)" "got $r"
msg=$(jq -n '{tool_name:"Bash", tool_input:{command:"gh api repos/o/r/issues/1/comments -f body=x"}}' | python3 -I "$TOOLS/github-write-guard.py" | jq -r '.hookSpecificOutput.permissionDecisionReason')
ok "the refusal names the door that works in a cloud session (the GitHub connector), not only gh" "$(grep -q 'GitHub connector tools (mcp__github__' <<< "$msg" && echo 1)" "$msg"
r=$(printf '{"tool_name":"Bash","tool_input":{}}' | bash "$TOOLS/hook-fail-closed.sh" 10 github-write-guard.py 2>/dev/null; echo $?)
ok "a hook input with no command blocks (fail closed)" "$([ "$r" = 2 ] && echo 1)" "got $r"
jq -e '[.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | test("hook-fail-closed\\.sh [0-9]+ github-write-guard\\.py$")) | select(.onFailure == "block")] | length == 1' "$S" >/dev/null
ok "settings.json runs github-write-guard.py on every Bash call, fail closed" "$([ $? = 0 ] && echo 1)"
jq -e '[.permissions.deny[] | select(test("curl.*api\\.github\\.com"))] | length >= 4' "$S" >/dev/null
ok "settings.json deny lines name curl writes to api.github.com too" "$([ $? = 0 ] && echo 1)"
finish
