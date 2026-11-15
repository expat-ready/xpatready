#!/bin/bash
# The Lead reads the diff before labelling (B193 part 2 (b), P-423, P-619 step 3): `review: approved` goes on a PR that
# touches a migration, the schema, `.github/`, `.mergify.yml`, a permissions file or a money path only when a PR comment
# carries the Lead's read line for the PR's current head:
#   Lead read the diff: <7 to 40 hex characters of the head SHA>
# (a new push needs a new read). Hook (PreToolUse, Bash and the GitHub MCP issue/PR writes): refuses
# the label added by `gh pr edit` / `gh issue edit --add-label`, `gh api …/labels` or a labels list, without that line. On GitHub, the same check:
#   lead-read-guard.sh --pr N     exit 0 = nothing sensitive or read; 1 = sensitive and not read (prints why); 2 = unreadable
# Fails closed: a PR that cannot be read gets no label now (the label can wait).
# Test: check-lead-read-guard.sh.
TOOLS="$(cd "$(dirname "$0")" && pwd)"; gh() { bash "$TOOLS/gh.sh" "$@"; }
LABEL="review: approved"
# Sensitive paths (P-423): migrations and schema, CI and the queue, permissions, money (fees, client money, ledger, paid runs).
SENSITIVE='(^|/)prisma/(migrations|schema)/|schema\.prisma$|^\.github/|^\.mergify\.yml$|permission|client-money|money|ledger|payment|invoice|billing|stripe|(^|[-_/])fees?([-_./]|$)|fee-receipt|retainer|(^|/)paid[-_.]|p2/'
verdict() {  # $1 PR number → prints the reason and returns 1 when the label needs a read it lacks; 2 when unreadable
  local j files head
  j=$(gh pr view "$1" --json files,changedFiles,headRefOid,comments 2>/dev/null) || { echo "cannot read #$1 from GitHub"; return 2; }
  files=$(printf '%s' "$j" | jq -r '.files[].path' | grep -vE '\.md$' | grep -E "$SENSITIVE" | head -5)   # records (.md) never count
  # GitHub lists at most 100 files: a bigger PR counts as sensitive (a migration may be past the 100th).
  [ -z "$files" ] && [ "$(printf '%s' "$j" | jq '(.changedFiles // 0) > (.files | length)')" = true ] && files="$(printf '%s' "$j" | jq -r '.changedFiles') files (only 100 listed) "
  [ -z "$files" ] && return 0
  head=$(printf '%s' "$j" | jq -r '.headRefOid')
  printf '%s' "$j" | jq -r '.comments[] | select((.authorAssociation // "OWNER") | test("OWNER|MEMBER|COLLABORATOR")) | .body' \
    | grep -oiE 'Lead read the diff:? +[0-9a-f]{7,40}' | grep -oiE '[0-9a-f]{7,40}$' \
    | while read -r s; do case "$head" in "$s"*) echo yes;; esac; done | grep -q yes && return 0
  echo "#$1 touches $(printf '%s' "$files" | tr '\n' ' ')and has no comment \"Lead read the diff: ${head:0:9}\" for its head ${head:0:9}"
  return 1
}
if [ "${1:-}" = --pr ]; then verdict "$2"; exit $?; fi
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null); [ -n "$cwd" ] && cd "$cwd" 2>/dev/null
prs=""
case "$tool" in
  Bash|"")
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null | tr -d '\\')   # review:\ approved → review: approved
    printf '%s' "$cmd" | grep -qiE 'review(: |%3A ?%20|:%20)approved' || exit 0
    while IFS= read -r seg; do
      printf '%s' "$seg" | grep -qiE 'review(: |%3A ?%20|:%20)approved' || continue
      if printf '%s' "$seg" | grep -qE 'gh[[:space:]]+(pr|issue)[[:space:]]+edit'; then
        printf '%s' "$seg" | grep -q -- '--add-label' || continue
      elif printf '%s' "$seg" | grep -qE 'gh[[:space:]]+api'; then
        printf '%s' "$seg" | grep -q 'labels' || continue
        printf '%s' "$seg" | grep -qiE '(-X|--method)[= ]*DELETE' && continue
      else continue; fi
      n=$(printf '%s' "$seg" | grep -oE '(pull|pulls|issues)/[0-9]+' | head -1 | grep -oE '[0-9]+$')
      [ -z "$n" ] && n=$(printf '%s' "$seg" | sed -E 's/.*[[:space:]]edit[[:space:]]//' | tr -s ' \t' '\n\n' | grep -E '^[0-9]+$' | head -1)
      [ -z "$n" ] && n=$(gh pr list --head "$(git branch --show-current 2>/dev/null)" --state open --json number 2>/dev/null | jq -r '.[0].number // empty' 2>/dev/null)
      prs="$prs ${n:-unknown}"
    done <<< "$(printf '%s\n' "$cmd" | tr ';&|' '\n\n\n')" ;;
  *)
    prs=$(printf '%s' "$input" | jq -r --arg l "$LABEL" 'select(any((.tool_input.labels // [])[]; . == $l)) | .tool_input | (.issue_number // .pullNumber // .number // empty)') ;;
esac
for n in $prs; do
  if [ "$n" = unknown ]; then why="this command adds the label to a PR this guard cannot name"; r=2; else why=$(verdict "$n"); r=$?; fi
  [ "$r" = 2 ] && why="$why, so the read cannot be checked"
  [ "$r" = 0 ] && continue
  jq -n --arg w "$why" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("P-423: the Lead reads the diff before labelling money, permissions, schema, a migration, .github/ or .mergify.yml. " + $w + ". Read the diff, comment the line, then label.")}}'
  exit 0
done
exit 0
