#!/usr/bin/env bash
# B193 part 2 (a): queued-push-guard.sh refuses a push to a PR labelled `queued` and lets every other push through.
# Feeds the hook's JSON as Claude Code does; gh is a fake on PATH answering from files. US$0, no network.
#   bash product/tools/check-queued-push-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/qp.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"; git init -q -b lane/x "$T/copy"; git init -q -b free "$T/other"
cat > "$T/bin/gh" <<'G'
#!/bin/bash
[ -n "${FAKE_FAIL:-}" ] && { echo "HTTP 502" >&2; exit 1; }
[ "$2" = view ] && { cat "$FAKE/view-$3.json"; exit; }
for a; do [ "$p" = --head ] && b=$a; p=$a; done; cat "$FAKE/$b.json" 2>/dev/null || echo '[]'
G
chmod +x "$T/bin/gh"; F="$T/f"; mkdir -p "$F"
mkdir -p "$F/lane"; echo '[{"number":12,"labels":[{"name":"review: approved"},{"name":"queued"}]}]' > "$F/lane/x.json"
echo '[{"number":13,"labels":[{"name":"review: approved"}]}]' > "$F/free.json"
echo '{"number":12,"labels":[{"name":"queued"}]}' > "$F/view-12.json"; echo '{"number":13,"labels":[]}' > "$F/view-13.json"
G="$TOOLS/queued-push-guard.sh"
guard() {  # $1 command (or JSON tool_input with $2 = tool name) → allow | deny | warn
  local in; if [ -n "${2:-}" ]; then in=$(jq -n --arg t "$2" --argjson i "$1" --arg d "$T/copy" '{tool_name:$t, tool_input:$i, cwd:$d}')
  else in=$(jq -n --arg c "$1" --arg d "${CWD:-$T/copy}" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}'); fi
  local out; out=$(printf '%s' "$in" | PATH="$T/bin:$PATH" FAKE="$F" bash "$G")
  if printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny
  elif printf '%s' "$out" | jq -e '.systemMessage' >/dev/null 2>&1; then echo warn; else echo allow; fi; }
for c in 'git push' 'git push -u origin lane/x' 'git push origin HEAD' 'git add -A && git commit -qm x && git push origin lane/x' 'git -C /x push origin HEAD:refs/heads/lane/x' 'git push origin +lane/x'; do
  r=$(guard "$c"); ok "a push to the queued PR is refused: $c" "$([ "$r" = deny ] && echo 1)" "got $r"; done
for c in 'git push -u origin free' 'git push origin HEAD:free' 'git status && git log -1' 'echo "git push later"x'; do
  r=$(guard "$c"); ok "passes: $c" "$([ "$r" = allow ] && echo 1)" "got $r"; done
for c in "git -C $T/copy push" "cd $T/copy && git push" "cd $T && cd copy; git push" 'git push origin "lane/x"' 'git push -o ci.skip origin lane/x' 'git push --push-option=x origin lane/x'; do
  r=$(CWD="$T/other" guard "$c"); ok "from another folder, a push to the queued branch is refused: $c" "$([ "$r" = deny ] && echo 1)" "got $r"; done
for c in 'git push' "git -C $T/other push origin HEAD" 'git push origin *'; do
  r=$(CWD="$T/other" guard "$c"); ok "from another folder, passes: $c" "$([ "$r" = allow ] && echo 1)" "got $r"; done
r=$(guard '{"owner":"o","repo":"r","pullNumber":12}' mcp__github__update_pull_request_branch); ok "the GitHub MCP branch update of the queued PR is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard '{"owner":"o","repo":"r","pullNumber":13}' mcp__github__update_pull_request_branch); ok "... and of a PR not queued passes" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard '{"owner":"o","repo":"r","branch":"lane/x","files":[]}' mcp__github__push_files); ok "the GitHub MCP push_files to the queued branch is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard '{"owner":"o","repo":"r","branch":"free","path":"a"}' mcp__github__create_or_update_file); ok "... and to another branch passes" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(FAKE_FAIL=1 guard 'git push origin lane/x'); ok "GitHub unreadable: the push passes with a warning (P-557)" "$([ "$r" = warn ] && echo 1)" "got $r"
out=$(jq -n --arg d "$T/copy" '{tool_name:"Bash",tool_input:{command:"git push"},cwd:$d}' | PATH="$T/bin:$PATH" FAKE="$F" bash "$G")
ok "the refusal names the PR and the reset" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecisionReason | test("#12.*queued.*resets the queue")' >/dev/null && echo 1)" "$out"
finish
