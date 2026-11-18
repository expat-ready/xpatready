#!/bin/bash
# PreToolUse hook (B193 part 2 (a), P-619 step 3): never push to a pull request labelled `queued`. A push to a queued PR
# throws Mergify's batch out and resets the queue (19:13 IST 15 Nov). Runs on Bash `git push …` and on the GitHub MCP
# writes that commit to a branch (push_files, create_or_update_file, delete_file, update_pull_request_branch). Finds the
# branch pushed to (the refspec's destination, else the current branch of the folder the push runs in: `cd X`,
# `git -C X`), reads its open PR's labels through gh.sh, and refuses when one carries `queued`. A lookup that fails lets the push through with a warning: a GitHub outage must not stop every push
# (P-557), and Mergify drops the PR from the queue anyway. Test: check-queued-push-guard.sh.
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { bash "$TOOLS/gh.sh" "$@"; }
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
branches=""; repo=""; prs=""
set -f   # a word like * in the command is text, never a file list
case "$tool" in
  *update_pull_request_branch)   # merges the base into the PR's branch: a push to it
    prs=$(printf '%s' "$input" | jq -r '.tool_input.pullNumber // .tool_input.pull_number // empty')
    repo=$(printf '%s' "$input" | jq -r '(.tool_input.owner // "") + "/" + (.tool_input.repo // "")') ;;
  *push_files|*create_or_update_file|*delete_file)
    branches=$(printf '%s' "$input" | jq -r '.tool_input.branch // empty')
    repo=$(printf '%s' "$input" | jq -r '(.tool_input.owner // "") + "/" + (.tool_input.repo // "")') ;;
  *)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
    printf '%s' "$cmd" | grep -qE '(^|[[:space:]])git([[:space:]].*)?[[:space:]]push([[:space:]]|$)' || exit 0
    dir=${cwd:-.}
    # Walk the command's segments (split at ; & | and newlines) in order: `cd X` moves the folder later pushes run in.
    while IFS= read -r s; do
      w=(); for x in $s; do x=${x//\"/}; x=${x//\'/}; w+=("$x"); done   # quotes stripped, no globbing (set -f)
      [ "${w[0]:-}" = cd ] && { case "${w[1]:-}" in /*) dir=${w[1]};; ?*) dir="$dir/${w[1]}";; esac; continue; }
      i=0; while [ $i -lt ${#w[@]} ] && [ "${w[$i]}" != git ]; do i=$((i + 1)); done
      [ $i -lt ${#w[@]} ] || continue
      d=$dir; i=$((i + 1))
      while [ $i -lt ${#w[@]} ] && [ "${w[$i]}" != push ]; do   # git's own options: -C dir, -c k=v
        case "${w[$i]}" in -C) i=$((i + 1)); case "${w[$i]}" in /*) d=${w[$i]};; *) d="$d/${w[$i]}";; esac;; -c) i=$((i + 1));; -*) ;; *) i=${#w[@]};; esac
        i=$((i + 1)); done
      [ $i -lt ${#w[@]} ] || continue
      pos=(); bulk=""; i=$((i + 1))
      while [ $i -lt ${#w[@]} ]; do   # push's options that take a value are skipped with it
        case "${w[$i]}" in -o|--push-option|--repo|--receive-pack|--exec) i=$((i + 1));; --all|--branches|--mirror) bulk=all;; --tags) bulk=${bulk:-tags};; -*) ;; *) pos+=("${w[$i]}");; esac
        i=$((i + 1)); done
      cur=$(git -C "$d" branch --show-current 2>/dev/null)
      if [ "$bulk" = all ]; then branches="$branches $(git -C "$d" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null | tr '\n' ' ')"   # every local branch (bot finding)
      elif [ "${#pos[@]}" -le 1 ] && [ "$bulk" = tags ]; then :   # tags only: no branch is updated
      elif [ "${#pos[@]}" -le 1 ]; then branches="$branches $cur"
      else for r in "${pos[@]:1}"; do x=${r##*:}; x=${x#+}; x=${x#refs/heads/}; [ "$x" = HEAD ] && x=$cur; branches="$branches $x"; done; fi
    done <<< "$(printf '%s\n' "$cmd" | python3 -I -c 'import re,sys; t=sys.stdin.read()
# a ; & | inside quotes is text (a commit message), not a command separator
print(re.sub(r"(\x27[^\x27]*\x27|\"[^\"]*\")", lambda m: re.sub(r"[;&|]", " ", m.group(0)), t), end="")' | tr ';&|' '\n\n\n')" ;;
esac
[ -n "$repo" ] && [ "$repo" != / ] && export GH_REPO="$repo"
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null
deny() {  # $1 branch or PR, $2 PR number
  jq -n --arg b "$1" --arg n "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("#" + $n + " (" + $b + ") is labelled queued: a push now throws Mergify'"'"'s batch out and resets the queue (19:13 IST 15 Nov; B193). Wait until it merges or leaves the queue, or remove review: approved first and say why on the PR.")}}'; exit 0; }
warn() { jq -n --arg w "$1" '{systemMessage:("queued-push-guard: could not read " + $w + "; allowed. Check it is not labelled queued (B193).")}'; exit 0; }
for n in $prs; do
  out=$(gh pr view "$n" --json number,labels 2>/dev/null) || warn "#$n"
  printf '%s' "$out" | jq -e 'any(.labels[]; .name == "queued")' >/dev/null 2>&1 && deny "its branch update" "$n"
done
for b in $branches; do
  [ -z "$b" ] && continue
  out=$(gh pr list --head "$b" --state open --json number,labels 2>/dev/null) || warn "the open PR for $b"
  n=$(printf '%s' "$out" | jq -r '[.[] | select(any(.labels[]; .name == "queued")) | .number] | first // empty' 2>/dev/null)
  [ -n "$n" ] && deny "branch $b" "$n"
done
exit 0
