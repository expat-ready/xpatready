#!/bin/bash
# PreToolUse hook (B193 part 2 (a), P-619 step 3): never push to a pull request labelled `queued`. A push to a queued PR
# throws Mergify's batch out and resets the queue (19:13 IST 15 Nov). Runs on Bash `git push …` and on the GitHub MCP
# writes that commit to a branch (push_files, create_or_update_file, delete_file). Finds the branch pushed to (the
# refspec's destination, else the copy's current branch), reads its open PR's labels through gh.sh, and refuses when one
# carries `queued`. A lookup that fails lets the push through with a warning: a GitHub outage must not stop every push
# (P-557), and Mergify drops the PR from the queue anyway. Test: check-queued-push-guard.sh.
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { bash "$TOOLS/gh.sh" "$@"; }
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
branches=""; repo=""
case "$tool" in
  *push_files|*create_or_update_file|*delete_file)
    branches=$(printf '%s' "$input" | jq -r '.tool_input.branch // empty')
    repo=$(printf '%s' "$input" | jq -r '(.tool_input.owner // "") + "/" + (.tool_input.repo // "")') ;;
  *)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
    # Each `git [-C dir] push …` segment of the command (split at ; & | and newlines).
    segs=$(printf '%s\n' "$cmd" | tr ';&|' '\n\n\n' | grep -E '(^|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)')
    [ -z "$segs" ] && exit 0
    cur=$([ -n "$cwd" ] && git -C "$cwd" branch --show-current 2>/dev/null)
    while IFS= read -r s; do
      args=$(printf '%s' "$s" | sed -E 's/.*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push//')
      pos=(); for w in $args; do case "$w" in -*) ;; *) pos+=("$w");; esac; done   # remote, then refspecs
      if [ "${#pos[@]}" -le 1 ]; then branches="$branches $cur"
      else for r in "${pos[@]:1}"; do d=${r##*:}; d=${d#+}; d=${d#refs/heads/}; [ "$d" = HEAD ] && d=$cur; branches="$branches $d"; done; fi
    done <<< "$segs" ;;
esac
[ -n "$repo" ] && [ "$repo" != / ] && export GH_REPO="$repo"
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null
for b in $branches; do
  [ -z "$b" ] && continue
  out=$(gh pr list --head "$b" --state open --json number,labels 2>/dev/null) || {
    jq -n --arg b "$b" '{systemMessage:("queued-push-guard: could not read the open PR for " + $b + "; push allowed. Check it is not labelled queued (B193).")}'; exit 0; }
  n=$(printf '%s' "$out" | jq -r '[.[] | select(any(.labels[]; .name == "queued")) | .number] | first // empty' 2>/dev/null)
  [ -n "$n" ] && { jq -n --arg b "$b" --arg n "$n" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("#" + $n + " (branch " + $b + ") is labelled queued: a push now throws Mergify'"'"'s batch out and resets the queue (19:13 IST 15 Nov; B193). Wait until it merges or leaves the queue, or remove review: approved first and say why on the PR.")}}'; exit 0; }
done
exit 0
